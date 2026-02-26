import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseOrThrow, sendError } from '../lib/http.js';
import type { RuntimeServices } from '../services/runtime.js';

const joinQuerySchema = z.object({ roomId: z.string().min(1) });
const roundQuerySchema = z.object({ roomId: z.string().min(1), roundId: z.string().min(1) });
const claimQuerySchema = roundQuerySchema.extend({ userWallet: z.string().min(1).optional() });

const legacyClaimBodySchema = z.object({
  roomId: z.string().min(1),
  roundId: z.string().min(1),
  userWallet: z.string().min(1),
});

const specActionPostBodySchema = z.object({
  account: z.string().min(1),
  type: z.string().optional(),
  data: z
    .record(z.union([z.string(), z.array(z.string())]))
    .optional(),
});

function setActionHeaders(reply: FastifyReply, services: RuntimeServices): void {
  const headers = services.integrations.blinks.getCorsHeaders();
  for (const [header, value] of Object.entries(headers)) {
    reply.header(header, value);
  }
  reply.header('Cache-Control', 'no-store');
}

function actionIconUrl(request: FastifyRequest): string | undefined {
  void request;
  return undefined;
}

function registerActionOptions(app: FastifyInstance, services: RuntimeServices, path: string): void {
  app.options(path, async (_request, reply) => {
    setActionHeaders(reply, services);
    return reply.status(204).send();
  });
}

export function registerActionRoutes(app: FastifyInstance, services: RuntimeServices): void {
  registerActionOptions(app, services, '/actions/join');
  registerActionOptions(app, services, '/actions/predict');
  registerActionOptions(app, services, '/actions/claim');

  app.get('/actions/join', async (request, reply) => {
    try {
      const query = parseOrThrow(joinQuerySchema, request.query);
      const iconUrl = actionIconUrl(request);
      const action = await services.integrations.blinks.buildJoinAction({
        roomId: query.roomId,
        ...(iconUrl ? { iconUrl } : {}),
      });
      setActionHeaders(reply, services);
      return reply.send(action);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/actions/join', async (request, reply) => {
    try {
      const query = parseOrThrow(joinQuerySchema, request.query);
      const body = parseOrThrow(specActionPostBodySchema, request.body);
      const response = await services.integrations.blinks.buildJoinPostResponse({
        roomId: query.roomId,
        account: body.account,
      });
      setActionHeaders(reply, services);
      return reply.send(response);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/actions/predict', async (request, reply) => {
    try {
      const query = parseOrThrow(roundQuerySchema, request.query);
      const iconUrl = actionIconUrl(request);
      const action = await services.integrations.blinks.buildPredictAction({
        roomId: query.roomId,
        roundId: query.roundId,
        ...(iconUrl ? { iconUrl } : {}),
      });
      setActionHeaders(reply, services);
      return reply.send(action);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/actions/predict', async (request, reply) => {
    try {
      const query = parseOrThrow(roundQuerySchema, request.query);
      const body = parseOrThrow(specActionPostBodySchema, request.body);
      const response = await services.integrations.blinks.buildPredictPostResponse({
        roomId: query.roomId,
        roundId: query.roundId,
        account: body.account,
        ...(body.data ? { params: body.data } : {}),
      });
      setActionHeaders(reply, services);
      return reply.send(response);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/actions/claim', async (request, reply) => {
    try {
      const query = parseOrThrow(claimQuerySchema, request.query);
      const iconUrl = actionIconUrl(request);
      const action = await services.integrations.blinks.buildClaimAction({
        roomId: query.roomId,
        roundId: query.roundId,
        ...(query.userWallet ? { userWallet: query.userWallet } : {}),
        ...(iconUrl ? { iconUrl } : {}),
      });
      setActionHeaders(reply, services);
      return reply.send(action);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/actions/claim', async (request, reply) => {
    try {
      const bodyAsUnknown = request.body;
      const maybeSpec = specActionPostBodySchema.safeParse(bodyAsUnknown);
      if (maybeSpec.success) {
        const query = parseOrThrow(claimQuerySchema, request.query);
        const response = await services.integrations.blinks.buildClaimPostResponse({
          roomId: query.roomId,
          roundId: query.roundId,
          account: maybeSpec.data.account,
          ...(query.userWallet ? { userWallet: query.userWallet } : {}),
        });
        setActionHeaders(reply, services);
        return reply.send(response);
      }

      const body = parseOrThrow(legacyClaimBodySchema, bodyAsUnknown);
      const result = await services.integrations.magicBlock.claimReward(body);
      return reply.send({ ok: true, result });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
