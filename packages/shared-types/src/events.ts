import { z } from 'zod';
import { roundSummarySchema, settlementResultSchema } from './game.js';

export const wsEventSchemas = {
  'room.state.updated': z.object({ roomId: z.string(), currentRound: roundSummarySchema.nullable() }),
  'round.started': z.object({ roomId: z.string(), round: roundSummarySchema }),
  'round.commit.received': z.object({ roomId: z.string(), roundId: z.string() }),
  'round.prediction.accepted': z.object({ roomId: z.string(), roundId: z.string(), predictionCount: z.number().int() }),
  'round.locked': z.object({ roomId: z.string(), roundId: z.string() }),
  'round.revealed': z.object({ roomId: z.string(), roundId: z.string(), commitVerified: z.boolean() }),
  'round.settled': z.object({ roomId: z.string(), roundId: z.string(), settlement: settlementResultSchema }),
  'leaderboard.updated': z.object({ roomId: z.string(), roundId: z.string(), leaderboard: settlementResultSchema.shape.leaderboard }),
  'playhead.tick': z.object({ roomId: z.string(), stepIndex: z.number().int().min(0).max(15) }),
} as const;

export const wsEventEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.state.updated'), payload: wsEventSchemas['room.state.updated'] }),
  z.object({ type: z.literal('round.started'), payload: wsEventSchemas['round.started'] }),
  z.object({ type: z.literal('round.commit.received'), payload: wsEventSchemas['round.commit.received'] }),
  z.object({ type: z.literal('round.prediction.accepted'), payload: wsEventSchemas['round.prediction.accepted'] }),
  z.object({ type: z.literal('round.locked'), payload: wsEventSchemas['round.locked'] }),
  z.object({ type: z.literal('round.revealed'), payload: wsEventSchemas['round.revealed'] }),
  z.object({ type: z.literal('round.settled'), payload: wsEventSchemas['round.settled'] }),
  z.object({ type: z.literal('leaderboard.updated'), payload: wsEventSchemas['leaderboard.updated'] }),
  z.object({ type: z.literal('playhead.tick'), payload: wsEventSchemas['playhead.tick'] }),
]);

export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.subscribe'), payload: z.object({ roomId: z.string() }) }),
  z.object({ type: z.literal('room.unsubscribe'), payload: z.object({ roomId: z.string() }) }),
]);

export type WsEventType = keyof typeof wsEventSchemas;
export type WsEventEnvelope = z.infer<typeof wsEventEnvelopeSchema>;
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
