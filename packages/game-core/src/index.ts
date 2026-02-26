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
      rewardUnits: correct ? 10 : 0,
    };
  });
}

export function settleRound(params: {
  roundId: string;
  commitVerified: boolean;
  predictions: PredictionPayload[];
  pattern: PatternV1;
}): SettlementResult {
  const evaluated = evaluatePredictions({ pattern: params.pattern, predictions: params.predictions });
  const leaderboardMap = new Map<string, { correctPredictions: number; rewardUnits: number }>();
  const rewards: RewardLedgerEntry[] = [];

  for (const prediction of evaluated) {
    const current = leaderboardMap.get(prediction.userWallet) ?? {
      correctPredictions: 0,
      rewardUnits: 0,
    };

    const updated = {
      correctPredictions: current.correctPredictions + (prediction.correct ? 1 : 0),
      rewardUnits: current.rewardUnits + prediction.rewardUnits,
    };

    leaderboardMap.set(prediction.userWallet, updated);

    if (prediction.rewardUnits > 0 && params.commitVerified) {
      rewards.push({
        userWallet: prediction.userWallet,
        units: prediction.rewardUnits,
        reason: 'round_prediction_win',
      });
    }
  }

  const leaderboard = Array.from(leaderboardMap.entries())
    .map(([userWallet, stats]) => ({ userWallet, ...stats }))
    .sort((a, b) => b.rewardUnits - a.rewardUnits || b.correctPredictions - a.correctPredictions || a.userWallet.localeCompare(b.userWallet));

  return {
    roundId: params.roundId,
    commitVerified: params.commitVerified,
    totalPredictions: evaluated.length,
    winningPredictions: evaluated.filter((prediction) => prediction.correct).length,
    leaderboard,
    rewards,
  };
}
