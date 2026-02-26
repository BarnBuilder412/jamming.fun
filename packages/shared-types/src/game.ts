import { z } from 'zod';
import { patternV1Schema, trackIdSchema } from './pattern.js';

export const ROUND_PHASES = [
  'awaiting_commit',
  'prediction_open',
  'locked',
  'revealed',
  'settled',
] as const;

export const roundPhaseSchema = z.enum(ROUND_PHASES);

export const commitPayloadSchema = z.object({
  commitHash: z.string().min(32),
  patternVersion: z.literal(1).default(1),
});

export const revealPayloadSchema = z.object({
  pattern: patternV1Schema,
  nonce: z.string().min(1),
  commitInputVersion: z.literal('v1').default('v1'),
});

export const predictionGuessSchema = z.object({
  trackId: trackIdSchema,
  stepIndex: z.number().int().min(0).max(15),
  willBeActive: z.boolean(),
});

export const predictionPayloadSchema = z.object({
  userWallet: z.string().min(20),
  guess: predictionGuessSchema,
});

export const roundSummarySchema = z.object({
  id: z.string(),
  roomId: z.string(),
  index: z.number().int().nonnegative(),
  phase: roundPhaseSchema,
  bpm: z.number().int(),
  commitHash: z.string().nullable().optional(),
  predictionCount: z.number().int().nonnegative(),
  commitVerified: z.boolean().nullable().optional(),
  startedAt: z.string(),
  lockedAt: z.string().nullable().optional(),
  revealedAt: z.string().nullable().optional(),
  settledAt: z.string().nullable().optional(),
});

export const rewardLedgerEntrySchema = z.object({
  userWallet: z.string(),
  units: z.number().int(),
  reason: z.string(),
  externalReference: z.string().optional(),
});

export const settlementIntegrationSchema = z
  .object({
    magicBlockSettlementReference: z.string().optional(),
    audiusSessionReference: z.string().optional(),
    settledAtIso: z.string().optional(),
  })
  .optional();

export const settlementResultSchema = z.object({
  roundId: z.string(),
  commitVerified: z.boolean(),
  totalPredictions: z.number().int().nonnegative(),
  winningPredictions: z.number().int().nonnegative(),
  leaderboard: z.array(
    z.object({
      userWallet: z.string(),
      correctPredictions: z.number().int().nonnegative(),
      rewardUnits: z.number().int().nonnegative(),
    }),
  ),
  rewards: z.array(rewardLedgerEntrySchema),
  integrations: settlementIntegrationSchema,
});

export type RoundPhase = z.infer<typeof roundPhaseSchema>;
export type CommitPayload = z.infer<typeof commitPayloadSchema>;
export type RevealPayload = z.infer<typeof revealPayloadSchema>;
export type PredictionGuess = z.infer<typeof predictionGuessSchema>;
export type PredictionPayload = z.infer<typeof predictionPayloadSchema>;
export type RoundSummary = z.infer<typeof roundSummarySchema>;
export type RewardLedgerEntry = z.infer<typeof rewardLedgerEntrySchema>;
export type SettlementIntegrations = z.infer<typeof settlementIntegrationSchema>;
export type SettlementResult = z.infer<typeof settlementResultSchema>;
