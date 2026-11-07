import 'dotenv/config';
import { runMigrationsAndSeed } from './db/migrate.js';
import { buildServer } from './app.js';
import { hub } from './realtime/hub.js';
import { radioManager } from './radio/manager.js';
import { disposeRtcNode } from './radio/publisher.js';
import { env } from './env.js';
import { pgPool } from './db/index.js';

async function main(): Promise<void> {
  await runMigrationsAndSeed();

  const app = await buildServer();

  // Wire the realtime hub to the radio manager:
  //  - when the last human leaves a voice room → start the 60 s countdown,
  //  - when someone joins again → cancel it,
  //  - radio state changes are broadcast to every connected client.
  hub.onVoiceRoomsEmptied = (channelIds) => {
    for (const id of channelIds) radioManager.onVoiceRoomMaybeEmptied(id);
  };
  hub.onVoiceRoomJoined = (channelId) => {
    radioManager.onVoiceRoomJoined(channelId);
  };
  radioManager.onStateChange = (state) => hub.broadcastAll('radio:state', state);
  radioManager.hasHumanParticipants = (channelId) => hub.isVoiceRoomOccupied(channelId);

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  hub.init(app.server);
  console.log(`🚀 Mahyar Gap is live on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully…`);
    try {
      await radioManager.shutdownAll();
      await hub.close();
      await app.close();
      await disposeRtcNode();
      await pgPool.end();
      console.log('👋 Bye.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
