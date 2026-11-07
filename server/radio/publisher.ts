import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type * as RtcNode from '@livekit/rtc-node';
import type { RadioStation } from '../../shared/types.js';
import { createVoiceToken, RADIO_BOT_IDENTITY, RADIO_BOT_NAME, voiceRoomName } from '../voice/livekit.js';

/**
 * Server-side shared radio publisher.
 *
 * Connects a virtual participant ("Mahyar Gap Radio") into a LiveKit room and
 * pumps a decoded PCM stream (via FFmpeg) into it, so every human in the room
 * hears the exact same audio. Uses the officially documented
 * @livekit/rtc-node publishing API:
 *
 *   const source = new AudioSource(sampleRate, channels);
 *   const track  = LocalAudioTrack.createAudioTrack(name, source);
 *   await room.connect(url, token);
 *   await room.localParticipant.publishTrack(track);
 *   await source.captureFrame(new AudioFrame(int16, sampleRate, channels, samplesPerChannel));
 *
 * The module is imported dynamically so a missing native binding degrades
 * gracefully (radio disabled) instead of crashing the whole server.
 */

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const FRAME_SAMPLES = 960; // 20 ms per frame
const FRAME_BYTES = FRAME_SAMPLES * CHANNELS * 2; // s16le interleaved

type RtcNodeModule = typeof RtcNode;

let rtcNode: RtcNodeModule | null = null;

export async function loadRtcNode(): Promise<RtcNodeModule> {
  if (rtcNode) return rtcNode;
  rtcNode = (await import('@livekit/rtc-node')) as RtcNodeModule;
  return rtcNode;
}

export type PublisherStatus = 'connecting' | 'playing' | 'error';

export interface RadioPublisherEvents {
  onStatus: (status: PublisherStatus, detail?: string) => void;
  onFatal: (detail: string) => void;
}

export class RadioPublisher {
  private room: RtcNode.Room | null = null;
  private source: RtcNode.AudioSource | null = null;
  private track: RtcNode.LocalAudioTrack | null = null;
  private ffmpeg: ChildProcessByStdio<null, Readable, Readable> | null = null;

  private stopped = false;
  private pcmBuffer: Buffer = Buffer.alloc(0);
  private pumpChain: Promise<void> = Promise.resolve();
  private respawnTimer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;

  private lastDataAt = 0;
  private playingSince = 0;
  private respawnAttempts = 0;
  private stderrTail: string[] = [];

  constructor(
    private readonly opts: {
      channelId: string;
      station: RadioStation;
      events: RadioPublisherEvents;
    },
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.connectRoom();
    this.spawnFfmpeg();
    this.startWatchdog();
  }

  /* ── LiveKit room ──────────────────────────────────────────── */

  private async connectRoom(): Promise<void> {
    const { Room, AudioSource, LocalAudioTrack, RoomEvent, TrackPublishOptions, TrackSource } =
      await loadRtcNode();
    const roomName = voiceRoomName(this.opts.channelId);
    const token = await createVoiceToken({
      identity: RADIO_BOT_IDENTITY,
      displayName: RADIO_BOT_NAME,
      roomName,
      isRadio: true,
    });

    const room = new Room();
    room.on(RoomEvent.Disconnected, () => {
      if (!this.stopped) this.opts.events.onFatal('LiveKit room disconnected unexpectedly');
    });
    await room.connect(process.env.LIVEKIT_URL!, token, { autoSubscribe: false, dynacast: false });

    const source = new AudioSource(SAMPLE_RATE, CHANNELS);
    const track = LocalAudioTrack.createAudioTrack('mahyar-gap-radio-audio', source);
    const localParticipant = room.localParticipant;
    if (!localParticipant) throw new Error('LiveKit local participant unavailable after connect');
    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_UNKNOWN;
    await localParticipant.publishTrack(track, publishOptions);

    this.room = room;
    this.source = source;
    this.track = track;
    this.opts.events.onStatus('connecting');
  }

  /* ── FFmpeg ingestion ──────────────────────────────────────── */

  private spawnFfmpeg(): void {
    if (this.stopped) return;
    const { station } = this.opts;

    const args = [
      '-hide_banner',
      '-loglevel', 'warning',
      // Reconnect to the upstream radio stream on transient failures.
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '4',
      '-user_agent', 'MahyarGap/1.0',
      '-i', station.streamUrl,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ac', String(CHANNELS),
      '-ar', String(SAMPLE_RATE),
      '-f', 's16le',
      'pipe:1',
    ];

    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.ffmpeg = child;
    this.lastDataAt = 0;

    child.stdout.on('data', (chunk: Buffer) => this.handleAudioData(chunk));

    child.stderr.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (!line) return;
      this.stderrTail.push(line);
      if (this.stderrTail.length > 12) this.stderrTail.shift();
    });

    child.on('error', (err) => {
      // Spawn failure (e.g. ffmpeg not installed) — nothing to retry.
      this.opts.events.onFatal(`FFmpeg failed to start: ${err.message}. Is ffmpeg installed?`);
    });

    child.on('exit', (code, signal) => {
      if (this.stopped) return;
      this.log(`FFmpeg exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`);
      if (code === 0) return; // clean end of stream
      this.scheduleRespawn();
    });
  }

  private scheduleRespawn(): void {
    if (this.stopped || this.respawnTimer) return;
    // Reset the attempt counter after 90 s of healthy playback.
    if (this.playingSince > 0 && Date.now() - this.playingSince > 90_000) {
      this.respawnAttempts = 0;
    }
    this.respawnAttempts += 1;
    if (this.respawnAttempts > 6) {
      const detail = this.stderrTail.join(' | ').slice(-400) || 'upstream radio stream unreachable';
      this.opts.events.onFatal(`Radio stream failed after repeated retries: ${detail}`);
      return;
    }
    const delay = Math.min(2 ** this.respawnAttempts * 1000, 30_000);
    this.respawnTimer = setTimeout(() => {
      this.respawnTimer = null;
      this.spawnFfmpeg();
    }, delay);
    this.respawnTimer.unref();
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    // If the upstream stream stalls for 15 s, force a reconnect.
    this.watchdog = setInterval(() => {
      if (this.stopped || this.lastDataAt === 0) return;
      if (Date.now() - this.lastDataAt > 15_000) {
        this.log('watchdog: no audio data for 15s — restarting FFmpeg');
        this.killFfmpeg();
      }
    }, 5_000);
    this.watchdog.unref();
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private handleAudioData(chunk: Buffer): void {
    if (this.stopped || !this.source) return;

    if (this.lastDataAt === 0) {
      this.playingSince = Date.now();
      this.respawnAttempts = 0;
      this.opts.events.onStatus('playing');
    }
    this.lastDataAt = Date.now();

    this.pcmBuffer = this.pcmBuffer.length === 0 ? chunk : Buffer.concat([this.pcmBuffer, chunk]);

    const AudioFrameCtor = rtcNode!.AudioFrame;
    const source = this.source;
    let offset = 0;
    while (this.pcmBuffer.length - offset >= FRAME_BYTES) {
      const frameBytes = this.pcmBuffer.subarray(offset, offset + FRAME_BYTES);
      // Copy into a dedicated Int16Array — captureFrame is asynchronous and
      // the source buffer may be recycled afterwards.
      const int16 = new Int16Array(FRAME_SAMPLES * CHANNELS);
      new Uint8Array(int16.buffer).set(frameBytes);
      this.pumpChain = this.pumpChain
        .then(() => source.captureFrame(new AudioFrameCtor(int16, SAMPLE_RATE, CHANNELS, FRAME_SAMPLES)))
        .catch((err: unknown) => {
          this.opts.events.onFatal(`Audio capture failed: ${(err as Error)?.message ?? 'unknown'}`);
        });
      offset += FRAME_BYTES;
    }
    if (offset > 0) this.pcmBuffer = this.pcmBuffer.subarray(offset);
  }

  /* ── Lifecycle ─────────────────────────────────────────────── */

  private killFfmpeg(): void {
    const child = this.ffmpeg;
    if (!child) return;
    this.ffmpeg = null;
    try {
      child.kill('SIGKILL');
    } catch {
      /* already dead */
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.stopWatchdog();
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer);
      this.respawnTimer = null;
    }
    this.killFfmpeg();
    try {
      await this.track?.close();
    } catch { /* ignore */ }
    try {
      await this.room?.disconnect();
    } catch { /* ignore */ }
    this.source = null;
    this.track = null;
    this.room = null;
  }

  private log(msg: string): void {
    // eslint-disable-next-line no-console
    console.log(`📻 [radio:${this.opts.station.id}] ${msg}`);
  }
}

/** Global teardown for process exit. */
export async function disposeRtcNode(): Promise<void> {
  try {
    const mod = (await import('@livekit/rtc-node')) as RtcNodeModule & { dispose?: () => Promise<void> };
    await mod.dispose?.();
  } catch { /* not loaded */ }
}
