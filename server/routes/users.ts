import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userSettings, users } from '../db/schema.js';
import { requireAuth } from '../auth/hooks.js';
import { httpError } from '../errors.js';
import { toPublicUser } from '../dto/users.js';

const MAX_AVATAR_CHARS = 150_000; // ~110 KB image as base64 data URL

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(48).optional(),
  avatar: z
    .string()
    .max(MAX_AVATAR_CHARS)
    .regex(/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/, 'Avatar must be a base64 image data URL')
    .or(z.literal(''))
    .or(z.null())
    .optional(),
  locale: z.enum(['fa', 'en']).optional(),
});

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users', { preHandler: requireAuth }, async () => {
    const rows = await db.select().from(users).orderBy(asc(users.username));
    return { users: rows.map(toPublicUser) };
  });

  app.patch('/users/me', { preHandler: requireAuth }, async (request) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw httpError(400, parsed.error.issues[0]?.message ?? 'Invalid profile update');
    }
    const { displayName, avatar, locale } = parsed.data;

    const [updated] = await db
      .update(users)
      .set({
        ...(displayName !== undefined ? { displayName } : {}),
        ...(avatar !== undefined ? { avatar: avatar === '' ? null : avatar } : {}),
      })
      .where(eq(users.id, request.user.id))
      .returning();
    if (!updated) throw httpError(404, 'User not found');

    if (locale !== undefined) {
      await db
        .insert(userSettings)
        .values({ userId: request.user.id, locale, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: { locale, updatedAt: new Date() },
        });
    }

    return { user: toPublicUser(updated) };
  });

  app.get('/users/me/settings', { preHandler: requireAuth }, async (request) => {
    const rows = await db.select().from(userSettings).where(eq(userSettings.userId, request.user.id)).limit(1);
    return { settings: rows[0] ?? { userId: request.user.id, locale: 'fa', volumes: {} } };
  });

  app.put('/users/me/settings', { preHandler: requireAuth }, async (request) => {
    const schema = z.object({
      locale: z.enum(['fa', 'en']).optional(),
      volumes: z.record(z.string(), z.number().min(0).max(1)).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, 'Invalid settings');

    const { locale, volumes } = parsed.data;
    const [existing] = await db
      .insert(userSettings)
      .values({
        userId: request.user.id,
        ...(locale !== undefined ? { locale } : {}),
        ...(volumes !== undefined ? { volumes } : {}),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          ...(locale !== undefined ? { locale } : {}),
          ...(volumes !== undefined ? { volumes } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();

    return { settings: existing ?? null };
  });
}
