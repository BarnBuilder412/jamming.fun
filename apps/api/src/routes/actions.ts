import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseOrThrow, sendError } from '../lib/http.js';
import type { RuntimeServices } from '../services/runtime.js';

const joinQuerySchema = z.object({ roomId: z.string().min(1) });
const roundQuerySchema = z.object({ roomId: z.string().min(1), roundId: z.string().min(1) });
const claimQuerySchema = roundQuerySchema.extend({ userWallet: z.string().min(1).optional() });

export function registerActionRoutes(app: FastifyInstance, services: RuntimeServices): void {
  app.get('/actions/join', async (request, reply) => {
    try {
      const query = parseOrThrow(joinQuerySchema, request.query);
      const action = await services.integrations.blinks.buildJoinAction({ roomId: query.roomId });
      return reply.send(action);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/actions/predict', async (request, reply) => {
    try {
      const query = parseOrThrow(roundQuerySchema, request.query);
      const action = await services.integrations.blinks.buildPredictAction({
        roomId: query.roomId,
        roundId: query.roundId,
      });
      return reply.send(action);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/actions/claim', async (request, reply) => {
    try {
      const query = parseOrThrow(claimQuerySchema, request.query);
      const action = await services.integrations.blinks.buildClaimAction({
        roomId: query.roomId,
        roundId: query.roundId,
        userWallet: query.userWallet,
      });
      return reply.send(action);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/actions/claim', async (request, reply) => {
    try {
      const body = parseOrThrow(
        z.object({ roomId: z.string(), roundId: z.string(), userWallet: z.string() }),
        request.body,
      );
      const result = await services.integrations.magicBlock.claimReward(body);
      return reply.send({ ok: true, result });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
