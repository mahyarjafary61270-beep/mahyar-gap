import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { inviteCodes, sessions, userSettings, users } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { signSessionToken, sessionCookie, cookieOptionsForEnv } from '../auth/tokens.js';
import { requireAuth } from '../auth/hooks.js';
import { httpError } from '../errors.js';
import { generateInviteCode } from '../db/migrate.js';
import { toPublicUser } from '../dto/users.js';
import { env } from '../env.js';

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/, 'Username may only contain lowercase letters, digits and underscore'),
  displayName: z.string().trim().min(1).max(48),
  password: z.string().min(8).max(128),
  inviteCode: z.string().trim().max(24).optional(),
});

const loginSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128),
});

async function countUsers(): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  return rows[0]?.count ?? 0;
}

async function createSession(userId: string, role: 'owner' | 'admin' | 'member'): Promise<string> {
  const expiresAt = new Date(Date.now() + sessionCookie.ttlSeconds * 1000);
  const [session] = await db.insert(sessions).values({ userId, expiresAt }).returning();
  if (!session) throw httpError(500, 'Could not create session');
  const token = await signSessionToken({ sid: session.id, uid: userId, role });
  return token;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(sessionCookie.name, token, cookieOptionsForEnv());
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(sessionCookie.name, { path: '/' });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /** Public: does the instance still need its first (owner) account? */
  app.get('/auth/state', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async () => {
    return { needsSetup: (await countUsers()) === 0, livekitConfigured: Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET) };
  });

  app.post(
    '/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = credentialsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw httpError(400, parsed.error.issues[0]?.message ?? 'Invalid input');
      }
      const { username, displayName, password, inviteCode } = parsed.data;

      const userCount = await countUsers();
      const isFirstUser = userCount === 0;

      let invite: typeof inviteCodes.$inferSelect | null = null;
      if (!isFirstUser) {
        if (!inviteCode) throw httpError(400, 'An invitation code is required to register', 'INVITE_REQUIRED');
        const rows = await db
          .select()
          .from(inviteCodes)
          .where(and(eq(inviteCodes.code, inviteCode.toLowerCase()), isNull(inviteCodes.revokedAt)))
          .limit(1);
        const candidate = rows[0];
        if (!candidate) throw httpError(400, 'This invitation code is not valid', 'INVITE_INVALID');
        if (candidate.usedCount >= candidate.maxUses) {
          throw httpError(400, 'This invitation code has already been used', 'INVITE_EXHAUSTED');
        }
        invite = candidate;
      }

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (existing.length > 0) throw httpError(409, 'This username is already taken', 'USERNAME_TAKEN');

      const passwordHash = await hashPassword(password);

      const created = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            username,
            displayName,
            passwordHash,
            role: isFirstUser ? 'owner' : 'member',
          })
          .returning();
        if (!user) throw httpError(500, 'Could not create account');
        await tx.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
        if (invite) {
          await tx
            .update(inviteCodes)
            .set({ usedCount: invite.usedCount + 1 })
            .where(eq(inviteCodes.code, invite.code));
        }
        return user;
      });

      const token = await createSession(created.id, created.role);
      setSessionCookie(reply, token);

      return reply.code(201).send({ user: toPublicUser(created) });
    },
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) throw httpError(400, 'Invalid input');

      const username = parsed.data.username.toLowerCase();
      const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
      const user = rows[0];
      // Constant-ish response regardless of which factor failed.
      if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
        throw httpError(401, 'Incorrect username or password', 'BAD_CREDENTIALS');
      }

      const token = await createSession(user.id, user.role);
      setSessionCookie(reply, token);
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));

      return reply.send({ user: toPublicUser(user) });
    },
  );

  app.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, request.user.sessionId));
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, request.user.id))
      .limit(1);
    const rows = await db.select().from(users).where(eq(users.id, request.user.id)).limit(1);
    const row = rows[0];
    return {
      user: row
        ? { ...toPublicUser(row), locale: settings[0]?.locale ?? 'fa' }
        : { ...request.user, lastSeenAt: new Date().toISOString(), createdAt: new Date().toISOString(), locale: 'fa' },
    };
  });
}
