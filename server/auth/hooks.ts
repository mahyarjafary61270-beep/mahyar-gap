import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, users, type UserRow } from '../db/schema.js';
import { verifySessionToken } from './tokens.js';
import { httpError } from '../errors.js';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRow['role'];
  avatar: string | null;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

async function resolveAuthUserFromCookies(cookies: Record<string, string | undefined>): Promise<AuthUser | null> {
  const token = cookies['mg_session'];
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, claims.sid), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.user.id,
    username: row.user.username,
    displayName: row.user.displayName,
    role: row.user.role,
    avatar: row.user.avatar,
    sessionId: claims.sid,
  };
}

async function resolveAuthUser(request: FastifyRequest): Promise<AuthUser | null> {
  return resolveAuthUserFromCookies(request.cookies);
}

/** Fastify preHandler that rejects unauthenticated requests. */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const user = await resolveAuthUser(request);
  if (!user) throw httpError(401, 'Authentication required', 'UNAUTHENTICATED');
  request.user = user;
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  await requireAuth(request, _reply);
  if (request.user.role !== 'admin' && request.user.role !== 'owner') {
    throw httpError(403, 'Admin access required', 'FORBIDDEN');
  }
}

export async function requireOwner(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  await requireAuth(request, _reply);
  if (request.user.role !== 'owner') {
    throw httpError(403, 'Owner access required', 'FORBIDDEN');
  }
}

/** Best-effort refresh of "last seen" — throttled so it does not hammer the database. */
const lastSeenCache = new Map<string, number>();
export function touchLastSeen(userId: string): void {
  const now = Date.now();
  const last = lastSeenCache.get(userId) ?? 0;
  if (now - last < 60_000) return;
  lastSeenCache.set(userId, now);
  void db
    .update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, userId))
    .catch(() => {
      lastSeenCache.delete(userId);
    });
}

export { resolveAuthUser, resolveAuthUserFromCookies };
