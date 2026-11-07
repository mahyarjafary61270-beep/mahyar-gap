/**
 * Shared types between the server and the client.
 * Keep this file dependency-free so both sides can import it.
 */

export type UserRole = 'owner' | 'admin' | 'member';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatar: string | null;
  lastSeenAt: string;
  createdAt: string;
}

export interface MeUser extends PublicUser {
  locale: string;
}

export type ChannelKind = 'text' | 'voice';

export interface Channel {
  id: string;
  slug: string;
  name: string;
  kind: ChannelKind;
  position: number;
  /** ISO timestamp of the newest message (text channels only). */
  lastMessageAt: string | null;
}

export interface MessageAuthor {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  role: UserRole;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  /** User ids that reacted — lets the client highlight its own reactions. */
  userIds: string[];
}

export interface Message {
  id: string;
  channelId: string;
  author: MessageAuthor;
  content: string;
  replyTo: { id: string; authorName: string; content: string } | null;
  reactions: MessageReaction[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface InviteCode {
  code: string;
  createdBy: string;
  createdByName?: string;
  maxUses: number;
  usedCount: number;
  revokedAt: string | null;
  note: string | null;
  createdAt: string;
}

/* ── Radio ──────────────────────────────────────────────────── */

/** The virtual LiveKit participant that publishes the shared radio. */
export const RADIO_BOT_IDENTITY = 'mahyar-gap-radio';

export interface RadioStation {
  id: string;
  name: string;
  englishName: string;
  streamUrl: string;
  /** Gradient tailwind classes for the station card identity. */
  gradient: string;
  icon: 'flame' | 'sparkles' | 'globe' | 'cloud-rain';
}

export type RadioState = {
  channelId: string;
  station: RadioStation | null;
  startedBy: { id: string; displayName: string } | null;
  startedAt: string | null;
  status: 'stopped' | 'connecting' | 'playing' | 'error';
};

/* ── Voice ──────────────────────────────────────────────────── */

export interface VoiceTokenResponse {
  url: string;
  token: string;
  roomName: string;
  identity: string;
}

export interface VoiceParticipantInfo {
  userId: string;
  displayName: string;
  avatar: string | null;
  muted: boolean;
  isRadio: boolean;
}

/* ── Presence ───────────────────────────────────────────────── */

export interface PresenceState {
  onlineUserIds: string[];
}

export interface VoiceRoomState {
  /** channelId -> user ids currently in that voice room */
  rooms: Record<string, { userIds: string[] }>;
}

/* ── Errors ─────────────────────────────────────────────────── */

export interface ApiError {
  error: string;
  code?: string;
}
