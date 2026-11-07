import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { radioSessions } from '../db/schema.js';
import { livekitConfigured } from '../env.js';
import { getStation } from './stations.js';
import { RadioPublisher, type PublisherStatus } from './publisher.js';
import { listParticipantIdentities, RADIO_BOT_IDENTITY, voiceRoomName } from '../voice/livekit.js';
import { httpError } from '../errors.js';
import type { RadioState, RadioStation } from '../../shared/types.js';

const AUTO_STOP_DELAY_MS = 60_000; // exactly 60 s after the last human leaves

export type RadioStopReason = 'manual' | 'timeout' | 'error' | 'switch' | 'shutdown';

interface ActiveRadio {
  channelId: string;
  roomName: string;
  station: RadioStation;
  startedBy: { id: string; displayName: string };
  startedAt: Date;
  status: 'connecting' | 'playing' | 'error';
  publisher: RadioPublisher | null;
  stopTimer: NodeJS.Timeout | null;
  dbSessionId: string | null;
  stopping: boolean;
}

/**
 * Owns one shared radio publisher per voice channel.
 *
 * Guarantees:
 *  - at most one radio per room (starting a new station stops the old one),
 *  - a 60 s countdown when the last human leaves, cancelled by a rejoin,
 *  - every state change is broadcast through `onStateChange`,
 *  - FFmpeg processes and LiveKit tracks are always cleaned up.
 */
class RadioManager {
  private radios = new Map<string, ActiveRadio>();
  private channelOps = new Map<string, Promise<unknown>>();

  /** Set by the realtime layer to broadcast state changes. */
  onStateChange: ((state: RadioState) => void) | null = null;
  /** Set by the realtime layer: does any human currently occupy this voice channel? */
  hasHumanParticipants: ((channelId: string) => boolean) | null = null;

  getState(channelId: string): RadioState {
    const radio = this.radios.get(channelId);
    if (!radio) {
      return { channelId, station: null, startedBy: null, startedAt: null, status: 'stopped' };
    }
    return {
      channelId,
      station: radio.station,
      startedBy: radio.startedBy,
      startedAt: radio.startedAt.toISOString(),
      status: radio.status,
    };
  }

  getStates(): RadioState[] {
    return Array.from(this.radios.keys()).map((id) => this.getState(id));
  }

  isActive(channelId: string): boolean {
    return this.radios.has(channelId);
  }

  /** Serializes start/stop per channel to avoid race conditions. */
  private enqueue<T>(channelId: string, op: () => Promise<T>): Promise<T> {
    const prev = this.channelOps.get(channelId) ?? Promise.resolve();
    const next = prev.then(op, op);
    this.channelOps.set(
      channelId,
      next.catch(() => {}),
    );
    return next;
  }

  async start(params: {
    channelId: string;
    stationId: string;
    user: { id: string; displayName: string };
  }): Promise<RadioState> {
    if (!livekitConfigured) {
      throw httpError(503, 'Radio requires LiveKit to be configured on this server', 'VOICE_NOT_CONFIGURED');
    }
    const station = getStation(params.stationId);
    if (!station) throw httpError(404, 'Unknown radio station', 'STATION_NOT_FOUND');

    return this.enqueue(params.channelId, async () => {
      const existing = this.radios.get(params.channelId);
      if (existing && existing.station.id === params.stationId) {
        // Same station requested — treat as a no-op restart guard.
        return this.getState(params.channelId);
      }
      if (existing) await this.stopInternal(params.channelId, 'switch');

      return this.startInternal(params.channelId, station, params.user);
    });
  }

  async stop(channelId: string, reason: RadioStopReason = 'manual'): Promise<RadioState> {
    return this.enqueue(channelId, async () => {
      await this.stopInternal(channelId, reason);
      return this.getState(channelId);
    });
  }

  private async startInternal(
    channelId: string,
    station: RadioStation,
    user: { id: string; displayName: string },
  ): Promise<RadioState> {
    this.cancelAutoStop(channelId);

    // Persist the session up-front so "who started it" survives restarts of the UI.
    let dbSessionId: string | null = null;
    try {
      const [row] = await db
        .insert(radioSessions)
        .values({ channelId, stationId: station.id, startedBy: user.id })
        .returning({ id: radioSessions.id });
      dbSessionId = row?.id ?? null;
    } catch (err) {
      console.error('radio: failed to persist session', err);
    }

    const radio: ActiveRadio = {
      channelId,
      roomName: voiceRoomName(channelId),
      station,
      startedBy: { id: user.id, displayName: user.displayName },
      startedAt: new Date(),
      status: 'connecting',
      publisher: null,
      stopTimer: null,
      dbSessionId,
      stopping: false,
    };
    this.radios.set(channelId, radio);

    const publisher = new RadioPublisher({
      channelId,
      station,
      events: {
        onStatus: (status: PublisherStatus, detail?: string) => {
          if (radio.stopping) return;
          radio.status = status;
          if (status === 'error' && detail) console.error(`radio[${channelId}]: ${detail}`);
          this.broadcast(radio);
        },
        onFatal: (detail: string) => {
          if (radio.stopping) return;
          console.error(`radio[${channelId}] fatal: ${detail}`);
          radio.status = 'error';
          this.broadcast(radio);
          // Tear down after reporting the error so resources are not leaked.
          void this.stop(channelId, 'error');
        },
      },
    });
    radio.publisher = publisher;

    try {
      await publisher.start();
    } catch (err) {
      console.error(`radio[${channelId}] failed to start:`, err);
      radio.status = 'error';
      this.broadcast(radio);
      // Clean up partially-started resources.
      void this.stop(channelId, 'error');
    }

    this.broadcast(radio);
    return this.getState(channelId);
  }

  private async stopInternal(channelId: string, reason: string): Promise<void> {
    this.cancelAutoStop(channelId);
    const radio = this.radios.get(channelId);
    if (!radio) return;
    radio.stopping = true;

    if (radio.dbSessionId) {
      try {
        await db
          .update(radioSessions)
          .set({ stoppedAt: new Date(), stopReason: reason })
          .where(eq(radioSessions.id, radio.dbSessionId));
      } catch (err) {
        console.error('radio: failed to close session row', err);
      }
    }

    const publisher = radio.publisher;
    this.radios.delete(channelId);
    this.broadcastStopped(channelId);

    if (publisher) {
      try {
        await publisher.stop();
      } catch (err) {
        console.error(`radio[${channelId}] error while stopping:`, err);
      }
    }
  }

  /* ── Automatic 60-second shutdown ──────────────────────────── */

  /** Called by the realtime layer when a voice room may have become empty. */
  onVoiceRoomMaybeEmptied(channelId: string): void {
    const radio = this.radios.get(channelId);
    if (!radio || radio.stopTimer) return;
    if (this.hasHumanParticipants?.(channelId)) return;

    console.log(`radio[${channelId}]: last human left — stopping in ${AUTO_STOP_DELAY_MS / 1000}s`);
    radio.stopTimer = setTimeout(() => {
      void (async () => {
        const current = this.radios.get(channelId);
        if (!current) return;
        // Double-check against LiveKit itself so a stale socket cannot kill a live room.
        const humans = await this.countHumanParticipantsLive(current.roomName);
        if (humans > 0) {
          console.log(`radio[${channelId}]: humans detected via LiveKit — cancelling auto-stop`);
          current.stopTimer = null;
          return;
        }
        await this.stop(channelId, 'timeout');
      })();
    }, AUTO_STOP_DELAY_MS);
    radio.stopTimer.unref();
  }

  /** Called by the realtime layer when someone joins the voice room. */
  onVoiceRoomJoined(channelId: string): void {
    this.cancelAutoStop(channelId);
  }

  private cancelAutoStop(channelId: string): void {
    const radio = this.radios.get(channelId);
    if (radio?.stopTimer) {
      clearTimeout(radio.stopTimer);
      radio.stopTimer = null;
    }
  }

  private async countHumanParticipantsLive(roomName: string): Promise<number> {
    const identities = await listParticipantIdentities(roomName);
    if (!identities) return 0; // LiveKit unreachable — trust the socket-based check that led here
    return identities.filter((identity) => identity !== RADIO_BOT_IDENTITY).length;
  }

  /* ── Broadcasting ──────────────────────────────────────────── */

  private broadcast(radio: ActiveRadio): void {
    this.onStateChange?.(this.getState(radio.channelId));
  }

  private broadcastStopped(channelId: string): void {
    this.onStateChange?.({ channelId, station: null, startedBy: null, startedAt: null, status: 'stopped' });
  }

  async shutdownAll(): Promise<void> {
    const ids = Array.from(this.radios.keys());
    await Promise.all(ids.map((id) => this.stop(id, 'shutdown')));
  }
}

export const radioManager = new RadioManager();
