import type { Message, PresenceState, RadioState, VoiceRoomState } from './types.js';

/** Events emitted by the server. */
export interface ServerToClientEvents {
  'message:new': (payload: { message: Message }) => void;
  'message:updated': (payload: { message: Message }) => void;
  'message:deleted': (payload: { channelId: string; id: string }) => void;
  'reactions:updated': (payload: { message: Message }) => void;
  'typing': (payload: { channelId: string; userId: string; displayName: string; typing: boolean }) => void;
  'presence:state': (payload: PresenceState) => void;
  'voice:state': (payload: VoiceRoomState) => void;
  'radio:state': (payload: RadioState) => void;
  'channel:created': (payload: { id: string; slug: string; name: string; kind: 'text' | 'voice'; position: number; lastMessageAt: string | null }) => void;
}

/** Events emitted by the client. */
export interface ClientToServerEvents {
  'channels:subscribe': (channelIds: string[]) => void;
  'typing': (payload: { channelId: string; typing: boolean }) => void;
  'voice:join': (payload: { channelId: string }) => void;
  'voice:leave': () => void;
}
