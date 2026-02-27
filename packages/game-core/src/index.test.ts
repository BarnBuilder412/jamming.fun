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

  it('settles scores with USDC winner pot distribution', () => {
    const pattern = createEmptyPatternV1();
    pattern.tracks[0]!.steps[0] = { active: true, velocity: 100 };

    const result = settleRound({
      roundId: 'round_1',
      commitVerified: true,
      pattern,
      predictions: [
        {
          userWallet: 'wallet_12345678901234567890',
          stakeAmountUsdc: 1_000_000,
          guess: { trackId: 'kick', stepIndex: 0, willBeActive: true },
        },
        {
          userWallet: 'wallet_12345678901234567890',
          stakeAmountUsdc: 1_000_000,
          guess: { trackId: 'snare', stepIndex: 0, willBeActive: true },
        },
        {
          userWallet: 'wallet_abcdefghijabcdefghij',
          stakeAmountUsdc: 2_000_000,
          guess: { trackId: 'kick', stepIndex: 0, willBeActive: true },
        },
      ],
    });

    expect(result.winningPredictions).toBe(2);
    expect(result.leaderboard[0]?.userWallet).toBe('wallet_abcdefghijabcdefghij');
    expect(result.rewards).toHaveLength(2);
    expect(result.economics.totalStakedUsdc).toBe(4_000_000);
    expect(result.economics.winnerPotUsdc).toBeGreaterThan(0);
    expect(result.usdcPayouts.length).toBe(2);
    expect(result.economics.winnerPotDistributedUsdc).toBe(result.economics.winnerPotUsdc);
    expect(result.economics.winnerPotRolloverUsdc).toBe(0);
  });
});
