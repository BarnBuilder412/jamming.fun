import { z } from 'zod';
import { patternV1Schema, STEPS_PER_PATTERN_V1, trackIdSchema } from './pattern.js';

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
  stepIndex: z.number().int().min(0).max(STEPS_PER_PATTERN_V1 - 1),
  willBeActive: z.boolean(),
});

export const predictionPayloadSchema = z.object({
  userWallet: z.string().min(20),
  stakeAmountUsdc: z.number().int().positive(),
  guess: predictionGuessSchema,
  sessionProof: z.string().min(1).optional(),
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
  totalStakedUsdc: z.number().int().nonnegative().optional(),
  winnerPotUsdc: z.number().int().nonnegative().optional(),
  artistPendingUsdc: z.number().int().nonnegative().optional(),
  winnerPotCarryInUsdc: z.number().int().nonnegative().optional(),
  liquidityCarryInUsdc: z.number().int().nonnegative().optional(),
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

export const usdcPayoutEntrySchema = z.object({
  userWallet: z.string(),
  amountUsdc: z.number().int().nonnegative(),
  reason: z.enum(['prediction_win', 'rollover']),
});

export const settlementLeaderboardEntrySchema = z.object({
  userWallet: z.string(),
  correctPredictions: z.number().int().nonnegative(),
  rewardUnits: z.number().int().nonnegative(),
  stakedUsdc: z.number().int().nonnegative(),
  usdcWon: z.number().int().nonnegative(),
});

export const settlementEconomicsSchema = z.object({
  totalStakedUsdc: z.number().int().nonnegative(),
  artistPendingUsdc: z.number().int().nonnegative(),
  artistPayoutUsdc: z.number().int().nonnegative(),
  artistSlashedUsdc: z.number().int().nonnegative(),
  platformFeeUsdc: z.number().int().nonnegative(),
  liquidityReserveUsdc: z.number().int().nonnegative(),
  liquidityCarryInUsdc: z.number().int().nonnegative(),
  liquidityRolloverUsdc: z.number().int().nonnegative(),
  winnerPotFromStakesUsdc: z.number().int().nonnegative(),
  winnerPotCarryInUsdc: z.number().int().nonnegative(),
  winnerPotUsdc: z.number().int().nonnegative(),
  winnerPotDistributedUsdc: z.number().int().nonnegative(),
  winnerPotRolloverUsdc: z.number().int().nonnegative(),
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
  leaderboard: z.array(settlementLeaderboardEntrySchema),
  rewards: z.array(rewardLedgerEntrySchema),
  usdcPayouts: z.array(usdcPayoutEntrySchema),
  economics: settlementEconomicsSchema,
  roomTokenSymbol: z.string().optional(),
  integrations: settlementIntegrationSchema,
});

export type RoundPhase = z.infer<typeof roundPhaseSchema>;
export type CommitPayload = z.infer<typeof commitPayloadSchema>;
export type RevealPayload = z.infer<typeof revealPayloadSchema>;
export type PredictionGuess = z.infer<typeof predictionGuessSchema>;
export type PredictionPayload = z.infer<typeof predictionPayloadSchema>;
export type RoundSummary = z.infer<typeof roundSummarySchema>;
export type RewardLedgerEntry = z.infer<typeof rewardLedgerEntrySchema>;
export type UsdcPayoutEntry = z.infer<typeof usdcPayoutEntrySchema>;
export type SettlementLeaderboardEntry = z.infer<typeof settlementLeaderboardEntrySchema>;
export type SettlementEconomics = z.infer<typeof settlementEconomicsSchema>;
export type SettlementIntegrations = z.infer<typeof settlementIntegrationSchema>;
export type SettlementResult = z.infer<typeof settlementResultSchema>;
