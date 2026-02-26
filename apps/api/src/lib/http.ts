import type { FastifyReply } from 'fastify';
import type { ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function parseOrThrow<TSchema extends ZodTypeAny>(schema: TSchema, data: unknown) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid request payload', parsed.error.flatten());
  }

  return parsed.data;
}

export function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      details: error.details,
    });
  }

  reply.log.error({ err: error }, 'Unhandled API error');
  return reply.status(500).send({ error: 'Internal server error' });
}
