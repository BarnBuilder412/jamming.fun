import { z } from 'zod';
import {
  commitPayloadSchema,
  predictionPayloadSchema,
  revealPayloadSchema,
  roundSummarySchema,
  settlementResultSchema,
} from './game.js';

export const createRoomRequestSchema = z.object({
  title: z.string().min(1).max(80).default('Jam Room'),
  artistWallet: z.string().min(20).optional(),
  audiusHandle: z.string().min(1).max(80).optional(),
});

export const roomResponseSchema = z.object({
  room: z.object({
    id: z.string(),
    code: z.string(),
    title: z.string(),
    status: z.string(),
    artistWallet: z.string().nullable().optional(),
    audiusHandle: z.string().nullable().optional(),
    audiusProfileUrl: z.string().nullable().optional(),
    currentRound: roundSummarySchema.nullable(),
  }),
});

export const startRoundRequestSchema = z.object({
  bpm: z.number().int().min(40).max(240).default(120),
});

export const startRoundResponseSchema = z.object({
  round: roundSummarySchema,
});

export const commitRequestSchema = commitPayloadSchema;
export const commitResponseSchema = z.object({ round: roundSummarySchema });

export const predictionRequestSchema = predictionPayloadSchema;
export const predictionResponseSchema = z.object({
  accepted: z.literal(true),
  predictionCount: z.number().int().nonnegative(),
});

export const lockResponseSchema = z.object({ round: roundSummarySchema });
export const revealRequestSchema = revealPayloadSchema;
export const revealResponseSchema = z.object({
  round: roundSummarySchema,
  commitVerified: z.boolean(),
});
export const settleResponseSchema = z.object({ settlement: settlementResultSchema });
export const resultsResponseSchema = z.object({ settlement: settlementResultSchema });

export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
export type RoomResponse = z.infer<typeof roomResponseSchema>;
export type StartRoundRequest = z.infer<typeof startRoundRequestSchema>;
export type StartRoundResponse = z.infer<typeof startRoundResponseSchema>;
export type CommitRequest = z.infer<typeof commitRequestSchema>;
export type CommitResponse = z.infer<typeof commitResponseSchema>;
export type PredictionRequest = z.infer<typeof predictionRequestSchema>;
export type PredictionResponse = z.infer<typeof predictionResponseSchema>;
export type LockResponse = z.infer<typeof lockResponseSchema>;
export type RevealRequest = z.infer<typeof revealRequestSchema>;
export type RevealResponse = z.infer<typeof revealResponseSchema>;
export type SettleResponse = z.infer<typeof settleResponseSchema>;
export type ResultsResponse = z.infer<typeof resultsResponseSchema>;
