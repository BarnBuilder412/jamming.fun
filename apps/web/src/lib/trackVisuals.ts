import type { TrackId } from '@jamming/shared-types';

type TrackVisual = {
  icon: string;
  label: string;
};

export const TRACK_VISUALS: Record<TrackId, TrackVisual> = {
  kick: { icon: '🥁', label: 'Kick' },
  snare: { icon: '🥁', label: 'Snare' },
  hat_closed: { icon: '🟨', label: 'Hi-Hat Closed' },
  hat_open: { icon: '🔔', label: 'Hi-Hat Open' },
  clap: { icon: '👏', label: 'Clap' },
  tom_low: { icon: '🪘', label: 'Tom Low' },
  tom_high: { icon: '🪘', label: 'Tom High' },
  rim: { icon: '🥢', label: 'Rim Click' },
  keyboard: { icon: '🎹', label: 'Keyboard' },
};
