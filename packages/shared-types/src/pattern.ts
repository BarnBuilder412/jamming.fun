import { z } from 'zod';

export const TRACK_IDS = ['kick', 'snare', 'hat_closed', 'hat_open', 'clap'] as const;
export const STEPS_PER_PATTERN_V1 = 16 as const;

export const trackIdSchema = z.enum(TRACK_IDS);

export const stepStateSchema = z.object({
  active: z.boolean(),
  velocity: z.number().int().min(0).max(127),
});

export const trackPatternSchema = z.object({
  id: trackIdSchema,
  steps: z.array(stepStateSchema).length(STEPS_PER_PATTERN_V1),
});

export const patternV1Schema = z.object({
  version: z.literal(1),
  length: z.literal(STEPS_PER_PATTERN_V1),
  bpm: z.number().int().min(40).max(240),
  tracks: z.array(trackPatternSchema).length(TRACK_IDS.length),
});

export type TrackId = z.infer<typeof trackIdSchema>;
export type StepState = z.infer<typeof stepStateSchema>;
export type TrackPattern = z.infer<typeof trackPatternSchema>;
export type PatternV1 = z.infer<typeof patternV1Schema>;
