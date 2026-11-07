import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/hooks.js';
import { httpError } from '../errors.js';
import { radioManager } from '../radio/manager.js';
import { RADIO_STATIONS } from '../radio/stations.js';
import { assertUserInVoiceRoom, radioCommandSchema } from './voice.js';
import { isVoiceChannel } from './channels.js';

export async function registerRadioRoutes(app: FastifyInstance): Promise<void> {
  app.get('/voice/radio/stations', { preHandler: requireAuth }, async () => {
    return { stations: RADIO_STATIONS };
  });

  app.get('/voice/:channelId/radio', { preHandler: requireAuth }, async (request) => {
    const { channelId } = request.params as { channelId: string };
    return radioManager.getState(channelId);
  });

  /**
   * `/mp` and `/mp stop` end up here. Membership of the voice room is
   * verified server-side before any radio state changes.
   */
  app.post('/voice/:channelId/radio', { preHandler: requireAuth }, async (request) => {
    const { channelId } = request.params as { channelId: string };
    if (!isVoiceChannel(channelId)) throw httpError(400, 'Not a voice channel');

    const parsed = radioCommandSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, 'Invalid radio command');

    if (parsed.data.action === 'start') {
      if (!parsed.data.stationId) throw httpError(400, 'stationId is required to start the radio');
      // Server-side permission check: must be a member of this voice room.
      await assertUserInVoiceRoom(request.user.id, channelId);
      return radioManager.start({
        channelId,
        stationId: parsed.data.stationId,
        user: { id: request.user.id, displayName: request.user.displayName },
      });
    }

    await assertUserInVoiceRoom(request.user.id, channelId);
    return radioManager.stop(channelId, 'manual');
  });
}
