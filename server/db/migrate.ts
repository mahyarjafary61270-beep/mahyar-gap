import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { db } from './index.js';
import { channels, inviteCodes, radioSessions, userSettings, users } from './schema.js';
import { env, isProduction } from '../env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve the drizzle migrations folder from either source layout or the compiled dist layout. */
function migrationsFolder(): string {
  // dist/server/db/migrate.js  ->  <root>/drizzle
  // server/db/migrate.ts (tsx) ->  <root>/drizzle
  const root = __dirname.includes(`${path.sep}dist${path.sep}`)
    ? path.resolve(__dirname, '..', '..', '..')
    : path.resolve(__dirname, '..', '..');
  return path.join(root, 'drizzle');
}

/** Argon2id parameters — OWASP recommended baseline for interactive logins. */
export const argonOptions = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

function randomCode(len = 8): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export function generateInviteCode(): string {
  return `mg-${randomCode(8)}`;
}

/** Applies pending migrations, then seeds initial data. Safe to run on every boot. */
export async function runMigrationsAndSeed(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('📦 Applying database migrations…');
  await migrate(db, { migrationsFolder: migrationsFolder() });

  // Mark any radio sessions left open by a previous process as stopped.
  await db
    .update(radioSessions)
    .set({ stoppedAt: new Date(), stopReason: 'restart' })
    .where(sql`${radioSessions.stoppedAt} is null`);

  await seedOwner();
  await seedChannels();

  // eslint-disable-next-line no-console
  console.log('✅ Database ready.');
}

async function seedOwner(): Promise<void> {
  const userCount = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if ((userCount[0]?.count ?? 0) > 0) return;

  if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD) {
    const username = env.ADMIN_USERNAME.trim().toLowerCase();
    const passwordHash = await hash(env.ADMIN_PASSWORD, argonOptions);
    const displayName = env.ADMIN_DISPLAY_NAME?.trim() || username;
    const [owner] = await db
      .insert(users)
      .values({ username, displayName, passwordHash, role: 'owner' })
      .returning();
    if (owner) {
      await db.insert(userSettings).values({ userId: owner.id }).onConflictDoNothing();
      const code = generateInviteCode();
      await db.insert(inviteCodes).values({ code, createdBy: owner.id, maxUses: 10, note: 'initial' });
      // eslint-disable-next-line no-console
      console.log(`👑 Owner account "${username}" created from environment configuration.`);
      // eslint-disable-next-line no-console
      console.log(`🎟️  Starter invite code: ${code}`);
    }
    return;
  }

  if (isProduction) {
    // eslint-disable-next-line no-console
    console.log(
      'ℹ️  No users yet. Set ADMIN_USERNAME/ADMIN_PASSWORD, or use the first-run setup page to create the owner account.',
    );
  }
}

const DEFAULT_CHANNELS: Array<{ slug: string; name: string; kind: 'text' | 'voice' }> = [
  { slug: 'general', name: 'چت عمومی', kind: 'text' },
  { slug: 'random', name: 'گفت‌وگوی آزاد', kind: 'text' },
  { slug: 'voice-1', name: 'اتاق صوتی یک', kind: 'voice' },
  { slug: 'voice-2', name: 'اتاق صوتی دو', kind: 'voice' },
];

async function seedChannels(): Promise<void> {
  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(channels);
  if ((existing[0]?.count ?? 0) > 0) return;
  await db.insert(channels).values(DEFAULT_CHANNELS.map((c, i) => ({ ...c, position: i })));
  // eslint-disable-next-line no-console
  console.log(`💬 Seeded ${DEFAULT_CHANNELS.length} default channels.`);
}
