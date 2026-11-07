import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { channels, messages } from '../db/schema.js';
import { requireAdmin, requireAuth } from '../auth/hooks.js';
import { httpError } from '../errors.js';
import { hub } from '../realtime/hub.js';
import type { Channel } from '../../shared/types.js';

function randomSlug(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = 'c-';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** In-memory cache of channel ids that are voice channels (used by socket events). */
export function refreshVoiceChannelCache(): Promise<void> {
  return refreshVoiceChannelCacheInternal();
}

const voiceCache = new Set<string>();

async function refreshVoiceChannelCacheInternal(): Promise<void> {
  const rows = await db.select({ id: channels.id }).from(channels).where(eq(channels.kind, 'voice'));
  voiceCache.clear();
  for (const r of rows) voiceCache.add(r.id);
  hub.refreshVoiceChannels(new Set(voiceCache));
}

export function isVoiceChannel(channelId: string): boolean {
  return voiceCache.has(channelId);
}

export async function registerChannelRoutes(app: FastifyInstance): Promise<void> {
  await refreshVoiceChannelCacheInternal();

  app.get('/channels', { preHandler: requireAuth }, async () => {
    const rows = await db.select().from(channels).orderBy(asc(channels.position), asc(channels.createdAt));

    const lastMessages = await db
      .select({ channelId: messages.channelId, lastAt: sql<string>`max(${messages.createdAt})` })
      .from(messages)
      .groupBy(messages.channelId);
    const lastMap = new Map(lastMessages.map((r) => [r.channelId, r.lastAt]));

    const result: Channel[] = rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      kind: c.kind,
      position: c.position,
      lastMessageAt: lastMap.get(c.id) ?? null,
    }));
    return { channels: result };
  });

  app.post('/channels', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(48),
      kind: z.enum(['text', 'voice']),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) throw httpError(400, 'Channel name (1-48 chars) and kind are required');

    const posRows = await db
      .select({ maxPos: sql<number>`coalesce(max(${channels.position}), -1)::int` })
      .from(channels);
    const maxPos = posRows[0]?.maxPos ?? -1;

    const [created] = await db
      .insert(channels)
      .values({
        slug: randomSlug(),
        name: parsed.data.name,
        kind: parsed.data.kind,
        position: maxPos + 1,
      })
      .returning();
    if (!created) throw httpError(500, 'Could not create channel');
    await refreshVoiceChannelCacheInternal();

    const channel: Channel = {
      id: created.id,
      slug: created.slug,
      name: created.name,
      kind: created.kind,
      position: created.position,
      lastMessageAt: null,
    };
    hub.broadcastAll('channel:created', channel);
    return reply.code(201).send({ channel });
  });
}
