import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { channels, messages, reactions } from '../db/schema.js';
import { requireAuth } from '../auth/hooks.js';
import { httpError } from '../errors.js';
import { hub } from '../realtime/hub.js';
import { getMessageDto, getMessagesPage } from '../dto/messages.js';

const contentSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  replyToId: z.string().uuid().optional(),
});

const emojiSchema = z.object({
  emoji: z
    .string()
    .refine((v) => {
      const chars = Array.from(v);
      return chars.length >= 1 && chars.length <= 8 && !/\s/.test(v);
    }, 'Invalid emoji'),
});

async function assertChannel(channelId: string) {
  const rows = await db.select({ id: channels.id, kind: channels.kind }).from(channels).where(eq(channels.id, channelId)).limit(1);
  const channel = rows[0];
  if (!channel) throw httpError(404, 'Channel not found');
  return channel;
}

async function assertMessage(messageId: string) {
  const rows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  const message = rows[0];
  if (!message || message.deletedAt) throw httpError(404, 'Message not found');
  return message;
}

export async function registerMessageRoutes(app: FastifyInstance): Promise<void> {
  /** Paginated history, oldest → newest. `before` = message id cursor. */
  app.get('/channels/:channelId/messages', { preHandler: requireAuth }, async (request) => {
    const { channelId } = request.params as { channelId: string };
    const query = request.query as { before?: string; limit?: string };
    await assertChannel(channelId);

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const page = await getMessagesPage({ channelId, before: query.before ?? null, limit });
    return page;
  });

  app.post('/channels/:channelId/messages', { preHandler: requireAuth }, async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    await assertChannel(channelId);

    const parsed = contentSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, 'Message must be 1-4000 characters');
    const { content, replyToId } = parsed.data;

    if (replyToId) {
      const parent = await db
        .select({ id: messages.id, channelId: messages.channelId })
        .from(messages)
        .where(eq(messages.id, replyToId))
        .limit(1);
      if (!parent[0] || parent[0].channelId !== channelId) {
        throw httpError(400, 'Reply target must be in the same channel');
      }
    }

    const [created] = await db
      .insert(messages)
      .values({ channelId, userId: request.user.id, content, replyToId: replyToId ?? null })
      .returning();
    if (!created) throw httpError(500, 'Could not save message');

    const dto = await getMessageDto(created.id);
    hub.broadcastToChannel(channelId, 'message:new', { message: dto });
    return reply.code(201).send({ message: dto });
  });

  app.patch('/messages/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const message = await assertMessage(id);
    if (message.userId !== request.user.id) {
      throw httpError(403, 'You can only edit your own messages');
    }
    const parsed = contentSchema.pick({ content: true }).safeParse(request.body);
    if (!parsed.success) throw httpError(400, 'Message must be 1-4000 characters');

    await db
      .update(messages)
      .set({ content: parsed.data.content, editedAt: new Date() })
      .where(eq(messages.id, id));

    const dto = await getMessageDto(id);
    hub.broadcastToChannel(message.channelId, 'message:updated', { message: dto });
    return { message: dto };
  });

  app.delete('/messages/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const message = await assertMessage(id);
    const isModerator = request.user.role === 'admin' || request.user.role === 'owner';
    if (message.userId !== request.user.id && !isModerator) {
      throw httpError(403, 'You can only delete your own messages');
    }

    await db.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, id));
    hub.broadcastToChannel(message.channelId, 'message:deleted', { channelId: message.channelId, id });
    return { ok: true };
  });

  /** Toggle a reaction for the current user. */
  app.put('/messages/:id/reactions', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const message = await assertMessage(id);

    const parsed = emojiSchema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, 'Invalid emoji');
    const { emoji } = parsed.data;

    const existing = await db
      .select({ id: reactions.id })
      .from(reactions)
      .where(
        and(eq(reactions.messageId, id), eq(reactions.userId, request.user.id), eq(reactions.emoji, emoji)),
      )
      .limit(1);

    if (existing[0]) {
      await db.delete(reactions).where(eq(reactions.id, existing[0].id));
    } else {
      await db.insert(reactions).values({ messageId: id, userId: request.user.id, emoji }).onConflictDoNothing();
    }

    const dto = await getMessageDto(id);
    hub.broadcastToChannel(message.channelId, 'reactions:updated', { message: dto });
    return { message: dto };
  });
}
