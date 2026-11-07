import type { UserRow, MessageRow, InviteRow } from '../db/schema.js';
import type { PublicUser, MessageAuthor, InviteCode } from '../../shared/types.js';

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    avatar: u.avatar,
    lastSeenAt: u.lastSeenAt.toISOString(),
    createdAt: u.createdAt.toISOString(),
  };
}

export function toMessageAuthor(u: UserRow): MessageAuthor {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    role: u.role,
  };
}

export function toInviteCode(row: InviteRow, createdByName?: string): InviteCode {
  return {
    code: row.code,
    createdBy: row.createdBy,
    createdByName,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}
