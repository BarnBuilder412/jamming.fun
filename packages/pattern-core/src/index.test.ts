import { describe, expect, it } from 'vitest';
import { createEmptyPatternV1, hashPatternCommitInput, serializePatternCanonical } from './index.js';

describe('pattern-core', () => {
  it('serializes deterministically', () => {
    const pattern = createEmptyPatternV1(128);
    pattern.tracks[0]!.steps[0] = { active: true, velocity: 110 };

    const a = serializePatternCanonical(pattern);
    const b = serializePatternCanonical(structuredClone(pattern));

    expect(a).toBe(b);
  });

  it('changes commit hash when nonce changes', () => {
    const pattern = createEmptyPatternV1();
    const hashA = hashPatternCommitInput({ pattern, roundId: 'round_1', nonce: 'abc' });
    const hashB = hashPatternCommitInput({ pattern, roundId: 'round_1', nonce: 'xyz' });

    expect(hashA).not.toBe(hashB);
  });
});
