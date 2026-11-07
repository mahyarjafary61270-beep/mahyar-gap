import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { env, isProduction } from './env.js';
import { registerErrorHandler } from './errors.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerUserRoutes } from './routes/users.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerVoiceRoutes } from './routes/voice.js';
import { registerRadioRoutes } from './routes/radio.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerHealthRoutes } from './routes/health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function clientDistRoot(): string | null {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'dist', 'client'), // dist/server/app.js → dist/client
    path.resolve(process.cwd(), 'dist', 'client'),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

export async function buildServer() {
  const app = Fastify({
    bodyLimit: 512 * 1024,
    trustProxy: true,
    logger: isProduction
      ? { level: 'warn' }
      : { level: 'info', transport: undefined },
    disableRequestLogging: true,
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    // Trust proxy is enabled; key on the real client IP.
    keyGenerator: (request) => request.ip,
  });

  // All REST endpoints live under /api.
  await app.register(
    async (api) => {
      await registerHealthRoutes(api);
      await registerAuthRoutes(api);
      await registerUserRoutes(api);
      await registerChannelRoutes(api);
      await registerMessageRoutes(api);
      await registerVoiceRoutes(api);
      await registerRadioRoutes(api);
      await registerAdminRoutes(api);
    },
    { prefix: '/api' },
  );

  registerErrorHandler(app);

  // Serve the built SPA in production. In dev, Vite serves the client.
  // wildcard: files are resolved per-request, so rebuilt assets never fall
  // through to the SPA fallback with a wrong MIME type.
  const clientRoot = clientDistRoot();
  if (clientRoot) {
    await app.register(fastifyStatic, {
      root: clientRoot,
      prefix: '/',
      wildcard: true,
      index: 'index.html',
    });

    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url ?? '';
      if (url.startsWith('/api') || url.startsWith('/socket.io')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
