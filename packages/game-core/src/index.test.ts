import { describe, expect, it } from 'vitest';
import { createEmptyPatternV1, hashPatternCommitInput } from '@jamming/pattern-core';
import { settleRound, verifyCommitReveal } from './index.js';

describe('game-core', () => {
  it('verifies valid commit/reveal payloads', () => {
    const pattern = createEmptyPatternV1();
    pattern.tracks[0]!.steps[0] = { active: true, velocity: 100 };

    const commitHash = hashPatternCommitInput({ pattern, roundId: 'round_1', nonce: 'nonce_1' });

    expect(
      verifyCommitReveal({
        commitHash,
        pattern,
        roundId: 'round_1',
        nonce: 'nonce_1',
      }),
    ).toBe(true);
  });

  it('rejects invalid reveals', () => {
    const pattern = createEmptyPatternV1();
    const commitHash = hashPatternCommitInput({ pattern, roundId: 'round_1', nonce: 'nonce_1' });
    pattern.tracks[0]!.steps[2] = { active: true, velocity: 100 };

    expect(
      verifyCommitReveal({
        commitHash,
        pattern,
        roundId: 'round_1',
        nonce: 'nonce_1',
      }),
    ).toBe(false);
  });

  it('settles scores deterministically', () => {
    const pattern = createEmptyPatternV1();
    pattern.tracks[0]!.steps[0] = { active: true, velocity: 100 };

    const result = settleRound({
      roundId: 'round_1',
      commitVerified: true,
      pattern,
      predictions: [
        {
          userWallet: 'wallet_12345678901234567890',
          guess: { trackId: 'kick', stepIndex: 0, willBeActive: true },
        },
        {
          userWallet: 'wallet_12345678901234567890',
          guess: { trackId: 'snare', stepIndex: 0, willBeActive: true },
        },
        {
          userWallet: 'wallet_abcdefghijabcdefghij',
          guess: { trackId: 'kick', stepIndex: 0, willBeActive: true },
        },
      ],
    });

    expect(result.winningPredictions).toBe(2);
    expect(result.leaderboard[0]?.userWallet).toBe('wallet_12345678901234567890');
    expect(result.rewards).toHaveLength(2);
  });
});
