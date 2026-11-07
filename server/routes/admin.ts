import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { inviteCodes, sessions, users } from '../db/schema.js';
import { requireAdmin, requireOwner } from '../auth/hooks.js';
import { httpError } from '../errors.js';
import { generateInviteCode } from '../db/migrate.js';
import { toInviteCode, toPublicUser } from '../dto/users.js';

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  /* ── Invitation codes ──────────────────────────────────────── */

  app.get('/admin/invites', { preHandler: requireAdmin }, async () => {
    const rows = await db
      .select({ invite: inviteCodes, creator: users })
      .from(inviteCodes)
      .innerJoin(users, eq(users.id, inviteCodes.createdBy))
      .orderBy(desc(inviteCodes.createdAt))
      .limit(200);
    return { invites: rows.map((r) => toInviteCode(r.invite, r.creator.displayName)) };
  });

  app.post('/admin/invites', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      maxUses: z.number().int().min(1).max(100).default(1),
      note: z.string().trim().max(120).optional(),
    });
    const parsed = schema.safeParse(request.body ?? {});
    if (!parsed.success) throw httpError(400, 'Invalid invite options');

    const code = generateInviteCode();
    const [created] = await db
      .insert(inviteCodes)
      .values({
        code,
        createdBy: request.user.id,
        maxUses: parsed.data.maxUses,
        note: parsed.data.note || null,
      })
      .returning();
    if (!created) throw httpError(500, 'Could not create invite');
    return reply.code(201).send({ invite: toInviteCode(created, request.user.displayName) });
  });

  app.delete('/admin/invites/:code', { preHandler: requireAdmin }, async (request) => {
    const { code } = request.params as { code: string };
    const [updated] = await db
      .update(inviteCodes)
      .set({ revokedAt: new Date() })
      .where(eq(inviteCodes.code, code.toLowerCase()))
      .returning();
    if (!updated) throw httpError(404, 'Invite not found');
    return { invite: toInviteCode(updated) };
  });

  /* ── Members ───────────────────────────────────────────────── */

  app.get('/admin/users', { preHandler: requireAdmin }, async () => {
    const rows = await db.select().from(users);
    return { users: rows.map(toPublicUser) };
  });

  /** Role management — only the owner may change roles. */
  app.patch('/admin/users/:id', { preHandler: requireOwner }, async (request) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ role: z.enum(['admin', 'member']) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, 'Role must be admin or member');

    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = rows[0];
    if (!target) throw httpError(404, 'User not found');
    if (target.role === 'owner') throw httpError(400, 'The owner role cannot be changed');

    const [updated] = await db.update(users).set({ role: parsed.data.role }).where(eq(users.id, id)).returning();
    if (!updated) throw httpError(500, 'Could not update user');
    return { user: toPublicUser(updated) };
  });

  /** Force logout — revokes all sessions of a member (moderation tool). */
  app.post('/admin/users/:id/revoke-sessions', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = rows[0];
    if (!target) throw httpError(404, 'User not found');
    if (target.role === 'owner' && target.id !== request.user.id) {
      throw httpError(403, 'Cannot revoke the owner sessions');
    }
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id));
    return { ok: true };
  });
}
