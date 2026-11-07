import type { FastifyInstance, FastifyReply } from 'fastify';

/** Throw this from handlers to produce a clean JSON error. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function httpError(statusCode: number, message: string, code?: string): HttpError {
  return new HttpError(statusCode, message, code);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply: FastifyReply) => {
    const e = err as { statusCode?: number; message?: string; validation?: unknown; code?: string };
    if (err instanceof HttpError) {
      const body: Record<string, unknown> = { error: err.message };
      if (err.code) body.code = err.code;
      return reply.code(err.statusCode).send(body);
    }
    // Fastify validation errors
    if (e.validation) {
      return reply.code(400).send({ error: e.message ?? 'Invalid input' });
    }
    request.log.error({ err }, 'Unhandled error');
    const statusCode = typeof e.statusCode === 'number' && e.statusCode >= 400 ? e.statusCode : 500;
    return reply
      .code(statusCode)
      .send({ error: statusCode === 500 ? 'Internal server error' : (e.message ?? 'Error') });
  });
}
