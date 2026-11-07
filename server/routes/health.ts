import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { radioManager } from '../radio/manager.js';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  /** Health check for Railway — never requires auth. */
  app.get('/health', async () => {
    let dbOk = true;
    try {
      await db.execute(sql`select 1`);
    } catch {
      dbOk = false;
    }
    return {
      ok: dbOk,
      db: dbOk ? 'up' : 'down',
      activeRadios: radioManager.getStates().filter((s) => s.status !== 'stopped').length,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  });
}
