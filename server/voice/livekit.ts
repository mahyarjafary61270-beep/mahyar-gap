import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { env, livekitConfigured } from '../env.js';
import { httpError } from '../errors.js';

let roomServiceClient: RoomServiceClient | null = null;
if (livekitConfigured) {
  roomServiceClient = new RoomServiceClient(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

export function assertLivekitConfigured(): void {
  if (!livekitConfigured) {
    throw httpError(503, 'Voice is not configured on this server (missing LiveKit credentials)', 'VOICE_NOT_CONFIGURED');
  }
}

export function getRoomService(): RoomServiceClient {
  assertLivekitConfigured();
  return roomServiceClient!;
}

export function voiceRoomName(channelId: string): string {
  return `voice_${channelId}`;
}

export const RADIO_BOT_IDENTITY = 'mahyar-gap-radio';
export const RADIO_BOT_NAME = 'Mahyar Gap Radio';

export interface VoiceTokenOptions {
  identity: string;
  displayName: string;
  roomName: string;
  /** The radio bot publishes audio but never subscribes. */
  isRadio?: boolean;
}

export async function createVoiceToken(opts: VoiceTokenOptions): Promise<string> {
  assertLivekitConfigured();
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: opts.identity,
    name: opts.displayName,
    ttl: '12h',
  });
  at.addGrant({
    roomJoin: true,
    room: opts.roomName,
    canPublish: true,
    canPublishData: true,
    canSubscribe: !opts.isRadio,
  });
  return at.toJwt();
}

/** Lists participant identities in a room; returns null when LiveKit is unreachable. */
export async function listParticipantIdentities(roomName: string): Promise<string[] | null> {
  if (!roomServiceClient) return null;
  try {
    const participants = await roomServiceClient.listParticipants(roomName);
    return participants.map((p) => p.identity);
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    // 11404 = room not found — that simply means empty.
    if (code === 11404) return [];
    return null;
  }
}
