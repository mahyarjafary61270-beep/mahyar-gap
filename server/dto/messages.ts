import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { messages, reactions, users } from '../db/schema.js';
import { toMessageAuthor } from './users.js';
import type { Message, MessageReaction } from '../../shared/types.js';

const replyMsg = alias(messages, 'reply_msg');
const replyAuthor = alias(users, 'reply_author');

interface MessageJoinRow {
  m: typeof messages.$inferSelect;
  author: typeof users.$inferSelect;
  replyId: string | null;
  replyContent: string | null;
  replyDeletedAt: Date | null;
  replyAuthorName: string | null;
}

function baseSelect() {
  return db
    .select({
      m: messages,
      author: users,
      replyId: replyMsg.id,
      replyContent: replyMsg.content,
      replyDeletedAt: replyMsg.deletedAt,
      replyAuthorName: replyAuthor.displayName,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .leftJoin(replyMsg, eq(replyMsg.id, messages.replyToId))
    .leftJoin(replyAuthor, eq(replyAuthor.id, replyMsg.userId));
}

function attachReactions(rows: MessageJoinRow[], rawReactions: Array<{ messageId: string; emoji: string; userId: string }>): Message[] {
  const byMessage = new Map<string, Map<string, MessageReaction>>();
  for (const r of rawReactions) {
    let perMessage = byMessage.get(r.messageId);
    if (!perMessage) {
      perMessage = new Map();
      byMessage.set(r.messageId, perMessage);
    }
    const existing = perMessage.get(r.emoji);
    if (existing) {
      existing.count += 1;
      existing.userIds.push(r.userId);
    } else {
      perMessage.set(r.emoji, { emoji: r.emoji, count: 1, userIds: [r.userId] });
    }
  }

  return rows.map((row) => {
    const deleted = row.m.deletedAt !== null;
    return {
      id: row.m.id,
      channelId: row.m.channelId,
      author: toMessageAuthor(row.author),
      content: deleted ? '' : row.m.content,
      replyTo:
        row.replyId && row.replyAuthorName
          ? {
              id: row.replyId,
              authorName: row.replyAuthorName,
              content: row.replyDeletedAt ? '' : row.replyContent ?? '',
            }
          : null,
      reactions: Array.from(byMessage.get(row.m.id)?.values() ?? []),
      editedAt: row.m.editedAt?.toISOString() ?? null,
      deletedAt: row.m.deletedAt?.toISOString() ?? null,
      createdAt: row.m.createdAt.toISOString(),
    } satisfies Message;
  });
}

async function reactionsFor(messageIds: string[]) {
  if (messageIds.length === 0) return [];
  return db
    .select({ messageId: reactions.messageId, emoji: reactions.emoji, userId: reactions.userId })
    .from(reactions)
    .where(inArray(reactions.messageId, messageIds));
}

export async function getMessageDto(messageId: string): Promise<Message | null> {
  const rows = (await baseSelect().where(eq(messages.id, messageId)).limit(1)) as MessageJoinRow[];
  const row = rows[0];
  if (!row) return null;
  const raw = await reactionsFor([messageId]);
  return attachReactions(rows, raw)[0] ?? null;
}

export async function getMessagesPage(params: {
  channelId: string;
  before?: string | null;
  limit: number;
}): Promise<{ messages: Message[]; hasMore: boolean }> {
  const { channelId, limit } = params;

  let beforeCreatedAt: Date | null = null;
  if (params.before) {
    const anchor = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, params.before))
      .limit(1);
    beforeCreatedAt = anchor[0]?.createdAt ?? null;
    if (!beforeCreatedAt) return { messages: [], hasMore: false };
  }

  const where = beforeCreatedAt
    ? and(eq(messages.channelId, channelId), lt(messages.createdAt, beforeCreatedAt))
    : eq(messages.channelId, channelId);

  const rows = (await baseSelect()
    .where(where)
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1)) as MessageJoinRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const raw = await reactionsFor(page.map((r) => r.m.id));
  const dtos = attachReactions(page, raw).reverse(); // oldest → newest for rendering
  return { messages: dtos, hasMore };
}

export async function getMessageCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(messages);
  return row?.count ?? 0;
}
