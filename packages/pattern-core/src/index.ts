import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  patternV1Schema,
  STEPS_PER_PATTERN_V1,
  TRACK_IDS,
  type PatternV1,
  type StepState,
  type TrackId,
} from '@jamming/shared-types';

const TRACK_ORDER: readonly TrackId[] = TRACK_IDS;

function normalizeStep(step: Partial<StepState> | undefined): StepState {
  const velocity = step?.velocity;
  return {
    active: Boolean(step?.active),
    velocity:
      typeof velocity === 'number' && Number.isFinite(velocity)
        ? Math.max(0, Math.min(127, Math.trunc(velocity)))
        : 100,
  };
}

export function createEmptyPatternV1(bpm = 120): PatternV1 {
  return {
    version: 1,
    length: STEPS_PER_PATTERN_V1,
    bpm,
    tracks: TRACK_ORDER.map((id) => ({
      id,
      steps: Array.from({ length: STEPS_PER_PATTERN_V1 }, () => ({ active: false, velocity: 100 })),
    })),
  };
}

export function normalizePatternV1(input: PatternV1): PatternV1 {
  const parsed = patternV1Schema.parse(input);
  const byTrack = new Map(parsed.tracks.map((track) => [track.id, track]));

  return {
    ...parsed,
    tracks: TRACK_ORDER.map((trackId) => {
      const track = byTrack.get(trackId);
      return {
        id: trackId,
        steps: Array.from({ length: STEPS_PER_PATTERN_V1 }, (_, index) => normalizeStep(track?.steps[index])),
      };
    }),
  };
}

export function serializePatternCanonical(input: PatternV1): string {
  const pattern = normalizePatternV1(input);
  const tracks = pattern.tracks
    .map((track) => {
      const encodedSteps = track.steps.map((step) => `${step.active ? 1 : 0}.${step.velocity.toString().padStart(3, '0')}`);
      return `${track.id}[${encodedSteps.join(',')}]`;
    })
    .join('|');

  return `pattern:v${pattern.version};len:${pattern.length};bpm:${pattern.bpm};tracks:${tracks}`;
}

export function buildCommitInput(params: {
  pattern: PatternV1;
  roundId: string;
  nonce: string;
  commitInputVersion?: 'v1';
}): string {
  const { pattern, roundId, nonce, commitInputVersion = 'v1' } = params;

  return [
    `commit_input:${commitInputVersion}`,
    `round:${roundId}`,
    `nonce:${nonce}`,
    serializePatternCanonical(pattern),
  ].join('|');
}

export function hashCommitInput(commitInput: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(commitInput)));
}

export function hashPatternCommitInput(params: {
  pattern: PatternV1;
  roundId: string;
  nonce: string;
  commitInputVersion?: 'v1';
}): string {
  return hashCommitInput(buildCommitInput(params));
}
