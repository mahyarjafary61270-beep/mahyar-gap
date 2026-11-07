import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { resolveAuthUserFromCookies } from '../auth/hooks.js';
import type { AuthUser } from '../auth/hooks.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { PresenceState, VoiceRoomState } from '../../shared/types.js';

/**
 * Realtime hub — Socket.IO with cookie-based authentication.
 *
 * Tracks:
 *  - online users (presence),
 *  - per-channel typing indicators,
 *  - voice-room occupancy (fed by clients after a successful LiveKit join),
 *  - radio state broadcasts (from the radio manager).
 */

interface VoiceOccupant {
  userId: string;
  displayName: string;
  socketIds: Set<string>;
}

interface VoiceRoom {
  channelId: string;
  occupants: Map<string, VoiceOccupant>;
}

export class RealtimeHub {
  io: IOServer | null = null;

  private online = new Map<string, { user: AuthUser; sockets: Set<Socket> }>();
  private voiceRooms = new Map<string, VoiceRoom>();
  /** Channels marked as voice, cached to avoid a DB hit per socket event. */
  private voiceChannelIds = new Set<string>();

  init(httpServer: HttpServer): IOServer {
    this.voiceChannelIds = this.voiceChannelIds ?? new Set();

    const io = new IOServer(httpServer, {
      cors: { origin: true, credentials: true },
      // Sensible heartbeat: detects crashed browsers within ~25 s.
      pingInterval: 10_000,
      pingTimeout: 15_000,
      maxHttpBufferSize: 1e6,
    });

    io.use(async (socket, next) => {
      try {
        const cookieHeader = socket.handshake.headers.cookie ?? '';
        const cookies: Record<string, string> = {};
        for (const part of cookieHeader.split(';')) {
          const idx = part.indexOf('=');
          if (idx === -1) continue;
          cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
        }
        const user = await resolveAuthUserFromCookies(cookies);
        if (!user) return next(new Error('unauthorized'));
        socket.data.user = user;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });

    io.on('connection', (socket) => {
      const user = socket.data.user as AuthUser;
      this.addOnline(socket, user);
      socket.join(`user:${user.id}`);

      this.broadcastPresence();

      socket.on('channels:subscribe', (channelIds: unknown) => {
        if (!Array.isArray(channelIds)) return;
        for (const id of channelIds) {
          if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) {
            void socket.join(`channel:${id}`);
          }
        }
      });

      socket.on('typing', (payload: unknown) => {
        const { channelId, typing } = (payload ?? {}) as { channelId?: string; typing?: boolean };
        if (typeof channelId !== 'string') return;
        socket.to(`channel:${channelId}`).emit('typing', {
          channelId,
          userId: user.id,
          displayName: user.displayName,
          typing: Boolean(typing),
        });
      });

      socket.on('voice:join', (payload: unknown) => {
        const { channelId } = (payload ?? {}) as { channelId?: string };
        if (typeof channelId !== 'string' || !this.voiceChannelIds.has(channelId)) return;
        this.joinVoice(socket, user, channelId);
      });

      socket.on('voice:leave', () => {
        this.removeUserFromVoice(user.id, socket.id);
      });

      socket.on('disconnect', () => {
        this.removeUserFromVoice(user.id, socket.id);
        this.removeOnline(socket, user);
      });
    });

    this.io = io;
    return io;
  }

  /* ── Presence ──────────────────────────────────────────────── */

  private addOnline(socket: Socket, user: AuthUser): void {
    let entry = this.online.get(user.id);
    if (!entry) {
      entry = { user, sockets: new Set() };
      this.online.set(user.id, entry);
    }
    entry.sockets.add(socket);
  }

  private removeOnline(socket: Socket, user: AuthUser): void {
    const entry = this.online.get(user.id);
    if (!entry) return;
    entry.sockets.delete(socket);
    if (entry.sockets.size === 0) {
      this.online.delete(user.id);
      void db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id)).catch(() => {});
    }
    this.broadcastPresence();
  }

  private broadcastPresence(): void {
    const state: PresenceState = { onlineUserIds: Array.from(this.online.keys()) };
    this.io?.emit('presence:state', state);
  }

  /* ── Voice occupancy ───────────────────────────────────────── */

  private joinVoice(socket: Socket, user: AuthUser, channelId: string): void {
    let room = this.voiceRooms.get(channelId);
    if (!room) {
      room = { channelId, occupants: new Map() };
      this.voiceRooms.set(channelId, room);
    }
    let occupant = room.occupants.get(user.id);
    if (!occupant) {
      occupant = { userId: user.id, displayName: user.displayName, socketIds: new Set() };
      room.occupants.set(user.id, occupant);
    }
    occupant.socketIds.add(socket.id);
    this.broadcastVoiceState();
    this.onVoiceRoomJoined?.(channelId);
  }

  /** Set by server bootstrap: cancels the radio auto-stop countdown on rejoin. */
  onVoiceRoomJoined: ((channelId: string) => void) | null = null;

  private removeUserFromVoice(userId: string, socketId: string): void {
    const emptied: string[] = [];
    for (const room of this.voiceRooms.values()) {
      const occupant = room.occupants.get(userId);
      if (!occupant) continue;
      occupant.socketIds.delete(socketId);
      if (occupant.socketIds.size === 0) {
        room.occupants.delete(userId);
        if (room.occupants.size === 0) {
          this.voiceRooms.delete(room.channelId);
          emptied.push(room.channelId);
        }
      }
    }
    if (emptied.length > 0) this.onVoiceRoomsEmptied?.(emptied);
    this.broadcastVoiceState();
  }

  /** Set by server bootstrap: forwards emptied rooms to the radio manager. */
  onVoiceRoomsEmptied: ((channelIds: string[]) => void) | null = null;

  isUserInVoice(userId: string, channelId: string): boolean {
    return this.voiceRooms.get(channelId)?.occupants.has(userId) ?? false;
  }

  /** True when at least one human socket reports being in this voice room. */
  isVoiceRoomOccupied(channelId: string): boolean {
    return (this.voiceRooms.get(channelId)?.occupants.size ?? 0) > 0;
  }

  getVoiceRoomState(): VoiceRoomState {
    const rooms: Record<string, { userIds: string[] }> = {};
    for (const [channelId, room] of this.voiceRooms) {
      rooms[channelId] = { userIds: Array.from(room.occupants.keys()) };
    }
    return { rooms };
  }

  getVoiceChannelIds(): Set<string> {
    return new Set(this.voiceChannelIds);
  }

  refreshVoiceChannels(ids: Set<string>): void {
    this.voiceChannelIds = ids;
  }

  private broadcastVoiceState(): void {
    this.io?.emit('voice:state', this.getVoiceRoomState());
  }

  /* ── Chat + radio relays (used by REST routes) ─────────────── */

  broadcastToChannel(channelId: string, event: string, payload: unknown): void {
    this.io?.to(`channel:${channelId}`).emit(event, payload);
  }

  broadcastAll(event: string, payload: unknown): void {
    this.io?.emit(event, payload);
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.io) return resolve();
      this.io.close(() => resolve());
    });
  }
}

export const hub = new RealtimeHub();
