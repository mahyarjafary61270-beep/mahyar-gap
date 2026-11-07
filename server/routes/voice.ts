import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { channels } from '../db/schema.js';
import { requireAuth } from '../auth/hooks.js';
import { httpError } from '../errors.js';
import { createVoiceToken, getRoomService, voiceRoomName } from '../voice/livekit.js';
import { isVoiceChannel } from './channels.js';
import { hub } from '../realtime/hub.js';

export async function registerVoiceRoutes(app: FastifyInstance): Promise<void> {
  /** LiveKit access token for a voice channel — generated server-side only. */
  app.post('/voice/:channelId/token', { preHandler: requireAuth }, async (request) => {
    const { channelId } = request.params as { channelId: string };

    const rows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    const channel = rows[0];
    if (!channel) throw httpError(404, 'Channel not found');
    if (channel.kind !== 'voice') throw httpError(400, 'Not a voice channel');

    const roomName = voiceRoomName(channelId);
    const token = await createVoiceToken({
      identity: request.user.id,
      displayName: request.user.displayName,
      roomName,
    });

    return {
      url: process.env.LIVEKIT_URL!,
      token,
      roomName,
      identity: request.user.id,
    };
  });

  /** Current occupancy snapshot for all voice rooms. */
  app.get('/voice/rooms', { preHandler: requireAuth }, async () => {
    return hub.getVoiceRoomState();
  });
}

/**
 * Verifies (via the LiveKit API, with socket presence as fallback) that the
 * user is actually inside the voice room before accepting a radio command.
 */
export async function assertUserInVoiceRoom(userId: string, channelId: string): Promise<void> {
  if (!isVoiceChannel(channelId)) throw httpError(400, 'Not a voice channel');

  // Fast path: socket presence.
  if (hub.isUserInVoice(userId, channelId)) return;

  // Authoritative path: ask LiveKit.
  try {
    const service = getRoomService();
    const participants = await service.listParticipants(voiceRoomName(channelId));
    if (participants.some((p) => p.identity === userId)) return;
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code !== 11404) {
      // LiveKit unreachable — fall back to socket presence only (already checked).
      throw httpError(503, 'Could not verify voice room membership', 'VOICE_CHECK_FAILED');
    }
  }
  throw httpError(403, 'You must join the voice room before controlling the radio', 'NOT_IN_VOICE_ROOM');
}

export const radioCommandSchema = z.object({
  action: z.enum(['start', 'stop']),
  stationId: z.string().trim().min(1).max(16).optional(),
});
