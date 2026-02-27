import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  commitRequestSchema,
  createRoomRequestSchema,
  integrationStatusResponseSchema,
  lockResponseSchema,
  predictionBatchRequestSchema,
  predictionBatchResponseSchema,
  predictionRequestSchema,
  predictionResponseSchema,
  revealRequestSchema,
  revealResponseSchema,
  resultsResponseSchema,
  roomResponseSchema,
  settleResponseSchema,
  startRoundRequestSchema,
  startRoundResponseSchema,
} from '@jamming/shared-types';
import { parseOrThrow, sendError } from '../lib/http.js';
import type { RuntimeServices } from '../services/runtime.js';

const roomParamsSchema = z.object({ roomId: z.string().min(1) });
const roundParamsSchema = z.object({ roomId: z.string().min(1), roundId: z.string().min(1) });

function emitRoomState(app: FastifyInstance, services: RuntimeServices, roomId: string) {
  const currentRound = services.store.getCurrentRoundSummary(roomId);
  services.roomHub.emit(roomId, 'room.state.updated', { roomId, currentRound });
}

export function registerApiRoutes(app: FastifyInstance, services: RuntimeServices): void {
  app.post('/api/v1/rooms', async (request, reply) => {
    try {
      const body = parseOrThrow(createRoomRequestSchema, request.body);
      let room = services.store.createRoom(body);

      const artistInfo = await services.integrations.audius.resolveArtist({
        ...(room.artistWallet !== undefined ? { wallet: room.artistWallet ?? null } : {}),
        ...(room.audiusHandle !== undefined ? { handle: room.audiusHandle ?? null } : {}),
      });

      if (!room.audiusHandle && artistInfo.ok && artistInfo.audiusHandle) {
        room.audiusHandle = artistInfo.audiusHandle;
      }
      if (artistInfo.ok) {
        room = services.store.updateRoomIntegrationMetadata(room.id, {
          audiusHandle: room.audiusHandle ?? artistInfo.audiusHandle ?? null,
          audiusProfileUrl: artistInfo.profileUrl ?? null,
        });
      }

      const snapshot = services.store.getRoomSnapshot(room.id);
      await services.prismaMirror.safe('sync-room-create', async () => {
        await services.prismaMirror.syncRoom(snapshot);
        await services.prismaMirror.syncArtistLink({
          room: snapshot,
          profileUrl: artistInfo.profileUrl ?? null,
        });
      });

      return reply.send(roomResponseSchema.parse({ room }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/v1/rooms/:roomId', async (request, reply) => {
    try {
      const params = parseOrThrow(roomParamsSchema, request.params);
      const room = services.store.getRoom(params.roomId);
      return reply.send(roomResponseSchema.parse({ room }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/v1/rooms/code/:code', async (request, reply) => {
    try {
      const params = parseOrThrow(z.object({ code: z.string().min(1) }), request.params);
      const room = services.store.getRoomByCode(params.code);
      return reply.send(roomResponseSchema.parse({ room }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/v1/rooms/:roomId/rounds/start', async (request, reply) => {
    try {
      const params = parseOrThrow(roomParamsSchema, request.params);
      const body = parseOrThrow(startRoundRequestSchema, request.body ?? {});
      const round = services.store.startRound(params.roomId, body);
      const roundSnapshot = services.store.getRoundSnapshot(params.roomId, round.id);
      await services.prismaMirror.safe('sync-round-start', async () => {
        await services.prismaMirror.syncRound(roundSnapshot);
      });
      emitRoomState(app, services, params.roomId);
      services.roomHub.emit(params.roomId, 'round.started', { roomId: params.roomId, round });
      return reply.send(startRoundResponseSchema.parse({ round }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/v1/rooms/:roomId/rounds/:roundId/commit', async (request, reply) => {
    try {
      const params = parseOrThrow(roundParamsSchema, request.params);
      const body = parseOrThrow(commitRequestSchema, request.body);
      const round = services.store.commitRound(params.roomId, params.roundId, body);
      const roundSnapshot = services.store.getRoundSnapshot(params.roomId, params.roundId);
      await services.prismaMirror.safe('sync-round-commit', async () => {
        await services.prismaMirror.syncRound(roundSnapshot);
      });
      emitRoomState(app, services, params.roomId);
      services.roomHub.emit(params.roomId, 'round.commit.received', {
        roomId: params.roomId,
        roundId: params.roundId,
      });
      return reply.send({ round });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/v1/rooms/:roomId/rounds/:roundId/predictions', async (request, reply) => {
    try {
      const params = parseOrThrow(roundParamsSchema, request.params);
      const body = parseOrThrow(predictionRequestSchema, request.body);
      const result = services.store.addPrediction(params.roomId, params.roundId, body);
      await services.prismaMirror.safe('sync-round-prediction', async () => {
        await services.prismaMirror.syncPrediction(params.roundId, result.prediction);
      });
      emitRoomState(app, services, params.roomId);
      services.roomHub.emit(params.roomId, 'round.prediction.accepted', {
        roomId: params.roomId,
        roundId: params.roundId,
        predictionCount: result.predictionCount,
        totalStakedUsdc: result.totalStakedUsdc,
      });
      return reply.send(
        predictionResponseSchema.parse({
          accepted: true,
          predictionCount: result.predictionCount,
          totalStakedUsdc: result.totalStakedUsdc,
        }),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/v1/rooms/:roomId/rounds/:roundId/predictions/batch', async (request, reply) => {
    try {
      const params = parseOrThrow(roundParamsSchema, request.params);
      const body = parseOrThrow(predictionBatchRequestSchema, request.body);
      const result = services.store.addPredictionsBatch(params.roomId, params.roundId, body);
      await services.prismaMirror.safe('sync-round-prediction-batch', async () => {
        await Promise.all(
          result.predictions.map((prediction) => services.prismaMirror.syncPrediction(params.roundId, prediction)),
        );
      });
      emitRoomState(app, services, params.roomId);
      services.roomHub.emit(params.roomId, 'round.prediction.accepted', {
        roomId: params.roomId,
        roundId: params.roundId,
        predictionCount: result.predictionCount,
        totalStakedUsdc: result.totalStakedUsdc,
      });
      return reply.send(
        predictionBatchResponseSchema.parse({
          accepted: true,
          acceptedCount: result.acceptedCount,
          predictionCount: result.predictionCount,
          totalStakedUsdc: result.totalStakedUsdc,
        }),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/v1/rooms/:roomId/rounds/:roundId/lock', async (request, reply) => {
    try {
      const params = parseOrThrow(roundParamsSchema, request.params);
      const round = services.store.lockRound(params.roomId, params.roundId);
      const roundSnapshot = services.store.getRoundSnapshot(params.roomId, params.roundId);
      await services.prismaMirror.safe('sync-round-lock', async () => {
        await services.prismaMirror.syncRound(roundSnapshot);
      });
      emitRoomState(app, services, params.roomId);
      services.roomHub.emit(params.roomId, 'round.locked', {
        roomId: params.roomId,
        roundId: params.roundId,
      });
      return reply.send(lockResponseSchema.parse({ round }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/v1/rooms/:roomId/rounds/:roundId/reveal', async (request, reply) => {
    try {
      const params = parseOrThrow(roundParamsSchema, request.params);
      const body = parseOrThrow(revealRequestSchema, request.body);
      const result = services.store.revealRound(params.roomId, params.roundId, body);
      const roundSnapshot = services.store.getRoundSnapshot(params.roomId, params.roundId);
      await services.prismaMirror.safe('sync-round-reveal', async () => {
        await services.prismaMirror.syncRound(roundSnapshot);
      });
      emitRoomState(app, services, params.roomId);
      services.roomHub.emit(params.roomId, 'round.revealed', {
        roomId: params.roomId,
        roundId: params.roundId,
        commitVerified: result.commitVerified,
      });
      return reply.send(revealResponseSchema.parse(result));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/v1/rooms/:roomId/rounds/:roundId/settle', async (request, reply) => {
    try {
      const params = parseOrThrow(roundParamsSchema, request.params);
      let settlement = services.store.settleRound(params.roomId, params.roundId);
      const roundSnapshot = services.store.getRoundSnapshot(params.roomId, params.roundId);
      await services.prismaMirror.safe('sync-round-settle', async () => {
        await services.prismaMirror.syncRound(roundSnapshot);
        await services.prismaMirror.syncSettlement(roundSnapshot, settlement);
      });

      let magicBlockResult: { ok: boolean; reference?: string } = { ok: false };
      try {
        magicBlockResult = await services.integrations.magicBlock.recordRoundSettlement({
          roomId: params.roomId,
          roundId: params.roundId,
          settlement,
        });
      } catch (error) {
        app.log.warn({ err: error, roundId: params.roundId }, 'MagicBlock settlement hook failed (degraded)');
      }

      const roomSnapshot = services.store.getRoomSnapshot(params.roomId);
      let audiusResult: { ok: boolean; reference?: string } = { ok: false };
      try {
        audiusResult = await services.integrations.audius.publishSessionMetadata({
          roomId: params.roomId,
          roundId: params.roundId,
          title: roomSnapshot.title,
          metadata: {
            roundId: params.roundId,
            artistHandle: roomSnapshot.audiusHandle,
            totalPredictions: settlement.totalPredictions,
            winningPredictions: settlement.winningPredictions,
            commitVerified: settlement.commitVerified,
            leaderboardTopWallet: settlement.leaderboard[0]?.userWallet ?? null,
          },
        });
      } catch (error) {
        app.log.warn({ err: error, roundId: params.roundId }, 'Audius publish hook failed (degraded)');
      }

      settlement = services.store.setSettlementIntegrations(params.roomId, params.roundId, {
        ...(magicBlockResult.reference ? { magicBlockSettlementReference: magicBlockResult.reference } : {}),
        ...(audiusResult.reference ? { audiusSessionReference: audiusResult.reference } : {}),
        settledAtIso: new Date().toISOString(),
      });

      emitRoomState(app, services, params.roomId);
      services.roomHub.emit(params.roomId, 'round.settled', {
        roomId: params.roomId,
        roundId: params.roundId,
        settlement,
      });
      services.roomHub.emit(params.roomId, 'leaderboard.updated', {
        roomId: params.roomId,
        roundId: params.roundId,
        leaderboard: settlement.leaderboard,
      });

      return reply.send(settleResponseSchema.parse({ settlement }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/v1/rooms/:roomId/rounds/:roundId/results', async (request, reply) => {
    try {
      const params = parseOrThrow(roundParamsSchema, request.params);
      const settlement = services.store.getResults(params.roomId, params.roundId);
      return reply.send(resultsResponseSchema.parse({ settlement }));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/v1/integrations/status', async (_request, reply) => {
    try {
      return reply.send(
        integrationStatusResponseSchema.parse({
          integrations: {
            magicBlock: services.integrations.magicBlock.getStatus(),
            audius: services.integrations.audius.getStatus(),
            blinks: services.integrations.blinks.getStatus(),
          },
        }),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
