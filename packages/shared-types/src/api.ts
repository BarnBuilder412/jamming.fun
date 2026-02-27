import { z } from 'zod';
import {
  commitPayloadSchema,
  predictionGuessSchema,
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

export const predictionBatchRequestSchema = z.object({
  userWallet: z.string().min(20),
  stakeAmountUsdc: z.number().int().positive(),
  guesses: z.array(predictionGuessSchema).min(1).max(64),
  sessionProof: z.string().min(1).optional(),
});

export const predictionResponseSchema = z.object({
  accepted: z.literal(true),
  predictionCount: z.number().int().nonnegative(),
  totalStakedUsdc: z.number().int().nonnegative(),
});

export const predictionBatchResponseSchema = z.object({
  accepted: z.literal(true),
  acceptedCount: z.number().int().positive(),
  predictionCount: z.number().int().nonnegative(),
  totalStakedUsdc: z.number().int().nonnegative(),
});

export const lockResponseSchema = z.object({ round: roundSummarySchema });
export const revealRequestSchema = revealPayloadSchema;
export const revealResponseSchema = z.object({
  round: roundSummarySchema,
  commitVerified: z.boolean(),
});
export const settleResponseSchema = z.object({ settlement: settlementResultSchema });
export const resultsResponseSchema = z.object({ settlement: settlementResultSchema });
export const contractRewardClaimRequestSchema = z.object({
  userWallet: z.string().min(20),
});
export const contractRewardClaimResponseSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    ok: z.boolean(),
    reference: z.string().optional(),
  }),
});
export const contractLiquidityDeployRequestSchema = z.object({
  amountUsdc: z.number().int().positive(),
  destinationTokenAccount: z.string().min(20).optional(),
});
export const contractLiquidityDeployResponseSchema = z.object({
  ok: z.boolean(),
  result: z.object({
    ok: z.boolean(),
    reference: z.string().optional(),
  }),
});

export const integrationStatusResponseSchema = z.object({
  integrations: z.record(
    z.object({
      provider: z.string(),
      enabled: z.boolean(),
      ready: z.boolean(),
      mode: z.string(),
      details: z.string().optional(),
      lastReference: z.string().optional(),
      lastError: z.string().optional(),
    }),
  ),
});

export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;
export type RoomResponse = z.infer<typeof roomResponseSchema>;
export type StartRoundRequest = z.infer<typeof startRoundRequestSchema>;
export type StartRoundResponse = z.infer<typeof startRoundResponseSchema>;
export type CommitRequest = z.infer<typeof commitRequestSchema>;
export type CommitResponse = z.infer<typeof commitResponseSchema>;
export type PredictionRequest = z.infer<typeof predictionRequestSchema>;
export type PredictionBatchRequest = z.infer<typeof predictionBatchRequestSchema>;
export type PredictionResponse = z.infer<typeof predictionResponseSchema>;
export type PredictionBatchResponse = z.infer<typeof predictionBatchResponseSchema>;
export type LockResponse = z.infer<typeof lockResponseSchema>;
export type RevealRequest = z.infer<typeof revealRequestSchema>;
export type RevealResponse = z.infer<typeof revealResponseSchema>;
export type SettleResponse = z.infer<typeof settleResponseSchema>;
export type ResultsResponse = z.infer<typeof resultsResponseSchema>;
export type ContractRewardClaimRequest = z.infer<typeof contractRewardClaimRequestSchema>;
export type ContractRewardClaimResponse = z.infer<typeof contractRewardClaimResponseSchema>;
export type ContractLiquidityDeployRequest = z.infer<typeof contractLiquidityDeployRequestSchema>;
export type ContractLiquidityDeployResponse = z.infer<typeof contractLiquidityDeployResponseSchema>;
export type IntegrationStatusResponse = z.infer<typeof integrationStatusResponseSchema>;
