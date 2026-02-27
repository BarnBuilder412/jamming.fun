import { hashPatternCommitInput } from '@jamming/pattern-core';
import {
  type PatternV1,
  type PredictionPayload,
  type RewardLedgerEntry,
  type RoundPhase,
  type SettlementResult,
} from '@jamming/shared-types';

const phaseOrder: readonly RoundPhase[] = [
  'awaiting_commit',
  'prediction_open',
  'locked',
  'revealed',
  'settled',
];

export const ARTIST_PENDING_BPS = 5000;
export const PLATFORM_FEE_BPS = 500;
export const LIQUIDITY_RESERVE_BPS = 1500;
export const WINNER_POT_BPS = 3000;
export const TOKEN_REWARD_UNITS_PER_CORRECT = 10;

export type StakeSplitBreakdown = {
  artistPendingUsdc: number;
  platformFeeUsdc: number;
  liquidityReserveUsdc: number;
  winnerPotUsdc: number;
};

export function splitStakeUsdc(stakeAmountUsdc: number): StakeSplitBreakdown {
  const stake = Math.max(0, Math.trunc(stakeAmountUsdc));
  const artistPendingUsdc = Math.floor((stake * ARTIST_PENDING_BPS) / 10_000);
  const platformFeeUsdc = Math.floor((stake * PLATFORM_FEE_BPS) / 10_000);
  const liquidityReserveUsdc = Math.floor((stake * LIQUIDITY_RESERVE_BPS) / 10_000);
  const winnerPotUsdc = Math.max(0, stake - artistPendingUsdc - platformFeeUsdc - liquidityReserveUsdc);

  return {
    artistPendingUsdc,
    platformFeeUsdc,
    liquidityReserveUsdc,
    winnerPotUsdc,
  };
}

export function canTransitionPhase(current: RoundPhase, next: RoundPhase): boolean {
  const currentIndex = phaseOrder.indexOf(current);
  const nextIndex = phaseOrder.indexOf(next);
  return currentIndex >= 0 && nextIndex === currentIndex + 1;
}

export function assertTransitionPhase(current: RoundPhase, next: RoundPhase): void {
  if (!canTransitionPhase(current, next)) {
    throw new Error(`Invalid phase transition: ${current} -> ${next}`);
  }
}

export function verifyCommitReveal(params: {
  commitHash: string;
  pattern: PatternV1;
  roundId: string;
  nonce: string;
  commitInputVersion?: 'v1';
}): boolean {
  const expected = hashPatternCommitInput(params);
  return expected === params.commitHash;
}

export type EvaluatedPrediction = PredictionPayload & {
  correct: boolean;
  rewardUnits: number;
  split: StakeSplitBreakdown;
};

export function evaluatePredictions(params: {
  pattern: PatternV1;
  predictions: PredictionPayload[];
}): EvaluatedPrediction[] {
  const { pattern, predictions } = params;
  const trackMap = new Map(pattern.tracks.map((track) => [track.id, track]));

  return predictions.map((prediction) => {
    const track = trackMap.get(prediction.guess.trackId);
    const step = track?.steps[prediction.guess.stepIndex];
    const actual = Boolean(step?.active);
    const correct = actual === prediction.guess.willBeActive;

    return {
      ...prediction,
      correct,
      rewardUnits: correct ? TOKEN_REWARD_UNITS_PER_CORRECT : 0,
      split: splitStakeUsdc(prediction.stakeAmountUsdc),
    };
  });
}

function distributeWinnerPot(
  correctPredictions: EvaluatedPrediction[],
  winnerPotUsdc: number,
): Map<string, number> {
  const byWalletStake = new Map<string, number>();
  for (const prediction of correctPredictions) {
    byWalletStake.set(
      prediction.userWallet,
      (byWalletStake.get(prediction.userWallet) ?? 0) + prediction.stakeAmountUsdc,
    );
  }

  const participants = Array.from(byWalletStake.entries()).sort(([left], [right]) => left.localeCompare(right));
  const totalCorrectStake = participants.reduce((sum, [, stake]) => sum + stake, 0);
  const payouts = new Map<string, number>();

  if (participants.length === 0 || totalCorrectStake <= 0 || winnerPotUsdc <= 0) {
    return payouts;
  }

  let distributed = 0;
  for (let index = 0; index < participants.length; index += 1) {
    const [wallet, stake] = participants[index]!;
    const amountUsdc =
      index === participants.length - 1
        ? Math.max(0, winnerPotUsdc - distributed)
        : Math.floor((winnerPotUsdc * stake) / totalCorrectStake);

    distributed += amountUsdc;
    payouts.set(wallet, amountUsdc);
  }

  return payouts;
}

export function settleRound(params: {
  roundId: string;
  commitVerified: boolean;
  predictions: PredictionPayload[];
  pattern: PatternV1;
  winnerPotCarryInUsdc?: number;
  liquidityCarryInUsdc?: number;
}): SettlementResult {
  const evaluated = evaluatePredictions({ pattern: params.pattern, predictions: params.predictions });

  const winnerPotCarryInUsdc = Math.max(0, Math.trunc(params.winnerPotCarryInUsdc ?? 0));
  const liquidityCarryInUsdc = Math.max(0, Math.trunc(params.liquidityCarryInUsdc ?? 0));

  const totalStakedUsdc = evaluated.reduce((sum, prediction) => sum + prediction.stakeAmountUsdc, 0);
  const artistPendingUsdc = evaluated.reduce((sum, prediction) => sum + prediction.split.artistPendingUsdc, 0);
  const platformFeeUsdc = evaluated.reduce((sum, prediction) => sum + prediction.split.platformFeeUsdc, 0);
  const winnerPotFromStakesUsdc = evaluated.reduce((sum, prediction) => sum + prediction.split.winnerPotUsdc, 0);
  const liquidityFromStakesUsdc = evaluated.reduce((sum, prediction) => sum + prediction.split.liquidityReserveUsdc, 0);
  const winnerPotUsdc = winnerPotFromStakesUsdc + winnerPotCarryInUsdc;
  const liquidityReserveUsdc = liquidityFromStakesUsdc + liquidityCarryInUsdc;

  const correctPredictions = evaluated.filter((prediction) => prediction.correct);
  const payoutMap = params.commitVerified ? distributeWinnerPot(correctPredictions, winnerPotUsdc) : new Map<string, number>();

  const leaderboardMap = new Map<string, { correctPredictions: number; rewardUnits: number; stakedUsdc: number; usdcWon: number }>();
  const rewards: RewardLedgerEntry[] = [];

  for (const prediction of evaluated) {
    const current = leaderboardMap.get(prediction.userWallet) ?? {
      correctPredictions: 0,
      rewardUnits: 0,
      stakedUsdc: 0,
      usdcWon: 0,
    };

    const updated = {
      correctPredictions: current.correctPredictions + (prediction.correct ? 1 : 0),
      rewardUnits: current.rewardUnits + prediction.rewardUnits,
      stakedUsdc: current.stakedUsdc + prediction.stakeAmountUsdc,
      usdcWon: current.usdcWon,
    };

    leaderboardMap.set(prediction.userWallet, updated);

    if (prediction.rewardUnits > 0 && params.commitVerified) {
      rewards.push({
        userWallet: prediction.userWallet,
        units: prediction.rewardUnits,
        reason: 'round_prediction_win_token',
      });
    }
  }

  for (const [wallet, usdcWon] of payoutMap.entries()) {
    const current = leaderboardMap.get(wallet) ?? {
      correctPredictions: 0,
      rewardUnits: 0,
      stakedUsdc: 0,
      usdcWon: 0,
    };
    leaderboardMap.set(wallet, {
      ...current,
      usdcWon,
    });
  }

  const leaderboard = Array.from(leaderboardMap.entries())
    .map(([userWallet, stats]) => ({ userWallet, ...stats }))
    .sort(
      (left, right) =>
        right.usdcWon - left.usdcWon ||
        right.rewardUnits - left.rewardUnits ||
        right.correctPredictions - left.correctPredictions ||
        right.stakedUsdc - left.stakedUsdc ||
        left.userWallet.localeCompare(right.userWallet),
    );

  const usdcPayouts = Array.from(payoutMap.entries()).map(([userWallet, amountUsdc]) => ({
    userWallet,
    amountUsdc,
    reason: 'prediction_win' as const,
  }));

  const winnerPotDistributedUsdc = usdcPayouts.reduce((sum, payout) => sum + payout.amountUsdc, 0);
  const winnerPotRolloverUsdc = Math.max(0, winnerPotUsdc - winnerPotDistributedUsdc);
  const artistPayoutUsdc = params.commitVerified ? artistPendingUsdc : 0;
  const artistSlashedUsdc = params.commitVerified ? 0 : artistPendingUsdc;

  return {
    roundId: params.roundId,
    commitVerified: params.commitVerified,
    totalPredictions: evaluated.length,
    winningPredictions: correctPredictions.length,
    leaderboard,
    rewards,
    usdcPayouts,
    economics: {
      totalStakedUsdc,
      artistPendingUsdc,
      artistPayoutUsdc,
      artistSlashedUsdc,
      platformFeeUsdc,
      liquidityReserveUsdc,
      liquidityCarryInUsdc,
      liquidityRolloverUsdc: liquidityReserveUsdc,
      winnerPotFromStakesUsdc,
      winnerPotCarryInUsdc,
      winnerPotUsdc,
      winnerPotDistributedUsdc,
      winnerPotRolloverUsdc,
    },
  };
}
