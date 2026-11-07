import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
import { env } from '../env.js';

/**
 * Connection pool tuned for a small private community:
 * few connections, short idle timeout, no prepared statements
 * (keeps it compatible with pooled providers such as pgbouncer).
 */
const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
  onnotice: () => {},
});

export const db = drizzle(client, { schema });
export { client as pgPool };
export { schema };
