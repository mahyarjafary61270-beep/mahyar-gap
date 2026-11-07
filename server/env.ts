import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string(),
  LIVEKIT_URL: z.string().default(''),
  LIVEKIT_API_KEY: z.string().default(''),
  LIVEKIT_API_SECRET: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  ADMIN_USERNAME: z.string().default(''),
  ADMIN_PASSWORD: z.string().default(''),
  ADMIN_DISPLAY_NAME: z.string().default(''),
  PUBLIC_ORIGIN: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

/**
 * In production the JWT secret must be provided and be long enough.
 * In development we allow an ephemeral fallback so the app boots easily.
 */
let jwtSecret = raw.JWT_ACCESS_SECRET;
if (raw.NODE_ENV === 'production' && (jwtSecret.length < 32 || jwtSecret.length > 256)) {
  // eslint-disable-next-line no-console
  console.error('❌ JWT_ACCESS_SECRET must be set to a long random value (>= 32 chars) in production.');
  process.exit(1);
}
if (!jwtSecret) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  JWT_ACCESS_SECRET not set — using an ephemeral development secret.');
  jwtSecret = 'mahyar-gap-dev-secret-do-not-use-in-production-000000000000';
}

export const env = {
  ...raw,
  JWT_ACCESS_SECRET: jwtSecret,
} as const;

export const isProduction = env.NODE_ENV === 'production';

export const livekitConfigured = Boolean(
  env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET,
);
