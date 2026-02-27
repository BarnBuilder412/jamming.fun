import { STEPS_PER_PATTERN_V1, type PatternV1, type TrackId } from '@jamming/shared-types';

export type PlayheadListener = (stepIndex: number) => void;

export interface PlayheadController {
  start(): void;
  stop(): void;
  setBpm(bpm: number): void;
  subscribe(listener: PlayheadListener): () => void;
}

export function createIntervalPlayhead(initialBpm = 120, stepsPerPattern: number = STEPS_PER_PATTERN_V1): PlayheadController {
  let bpm = initialBpm;
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentStep = 0;
  const listeners = new Set<PlayheadListener>();

  const tick = () => {
    listeners.forEach((listener) => listener(currentStep));
    currentStep = (currentStep + 1) % stepsPerPattern;
  };

  const restart = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    const stepMs = Math.max(40, Math.round((60_000 / bpm) / 4));
    timer = setInterval(tick, stepMs);
  };

  return {
    start() {
      if (!timer) {
        restart();
      }
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    setBpm(nextBpm) {
      bpm = Math.max(40, Math.min(240, Math.trunc(nextBpm)));
      if (timer) {
        restart();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function getActiveStepsForTrack(pattern: PatternV1, trackId: PatternV1['tracks'][number]['id']): number[] {
  const track = pattern.tracks.find((item) => item.id === trackId);
  if (!track) {
    return [];
  }

  return track.steps.flatMap((step, index) => (step.active ? [index] : []));
}

export type DrumEngineState = 'unsupported' | 'locked' | 'loading' | 'ready' | 'closed' | 'error';
export type DrumEngineOutputMode = 'none' | 'synth' | 'samples';
export type DrumSoundPreset = 'drums' | 'electro' | 'melodic';
export const SOUND_EFFECT_IDS = [
  'kick',
  'snare',
  'hat_closed',
  'hat_open',
  'clap',
  'tom_low',
  'tom_high',
  'rim',
  'keyboard',
] as const;
export type SoundEffectId = (typeof SOUND_EFFECT_IDS)[number];
export const SOUND_EFFECT_LABELS: Record<SoundEffectId, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hat_closed: 'Closed Hat',
  hat_open: 'Open Hat',
  clap: 'Clap',
  tom_low: 'Low Tom',
  tom_high: 'High Tom',
  rim: 'Rim Click',
  keyboard: 'Keyboard',
};
export const DEFAULT_TRACK_SOUND_MAP: Record<TrackId, SoundEffectId> = {
  kick: 'kick',
  snare: 'snare',
  hat_closed: 'hat_closed',
  hat_open: 'hat_open',
  clap: 'clap',
  tom_low: 'tom_low',
  tom_high: 'tom_high',
  rim: 'rim',
  keyboard: 'keyboard',
};

export interface DrumEngine {
  getState(): DrumEngineState;
  getOutputMode(): DrumEngineOutputMode;
  getSoundPreset(): DrumSoundPreset;
  setSoundPreset(preset: DrumSoundPreset): void;
  getTrackSound(trackId: TrackId): SoundEffectId;
  setTrackSound(trackId: TrackId, sound: SoundEffectId): void;
  listSoundEffects(): readonly SoundEffectId[];
  unlock(): Promise<DrumEngineState>;
  setMasterGain(value: number): void;
  triggerTrack(trackId: TrackId, velocity?: number): void;
  triggerStep(pattern: PatternV1, stepIndex: number): void;
  dispose(): void;
}

export type WebAudioDrumEngineOptions = {
  sampleBaseUrl?: string;
  sampleManifest?: Partial<Record<TrackId, string>>;
  soundPreset?: DrumSoundPreset;
  initialTrackSounds?: Partial<Record<TrackId, SoundEffectId>>;
};

type BrowserAudioContext = AudioContext;

type SampleLoadState = 'idle' | 'loading' | 'ready' | 'failed';

type TrackSampleMap = Map<TrackId, AudioBuffer>;

const DEFAULT_SAMPLE_BASE_URL = '/samples/hydrogen-lite';

const DEFAULT_SAMPLE_MANIFEST: Partial<Record<TrackId, string>> = {
  kick: 'kick.wav',
  snare: 'snare.wav',
  hat_closed: 'hat_closed.wav',
  hat_open: 'hat_open.wav',
  clap: 'clap.wav',
};

const TRACK_SAMPLE_GAIN: Record<TrackId, number> = {
  kick: 0.95,
  snare: 0.88,
  hat_closed: 0.52,
  hat_open: 0.48,
  clap: 0.72,
  tom_low: 0.84,
  tom_high: 0.76,
  rim: 0.58,
  keyboard: 0.68,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hasAudioContext(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined';
}

function safeCurrentTime(context: BrowserAudioContext): number {
  return Number.isFinite(context.currentTime) ? context.currentTime : 0;
}

function createNoiseBuffer(context: BrowserAudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.25));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

function triggerKick(context: BrowserAudioContext, destination: AudioNode, intensity: number): void {
  const now = safeCurrentTime(context);
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(155, now);
  osc.frequency.exponentialRampToValueAtTime(48, now + 0.14);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.95 * intensity, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

function triggerSnare(context: BrowserAudioContext, destination: AudioNode, noise: AudioBuffer, intensity: number): void {
  const now = safeCurrentTime(context);
  const noiseSource = context.createBufferSource();
  noiseSource.buffer = noise;

  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 900;

  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.7 * intensity, now + 0.002);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

  const toneOsc = context.createOscillator();
  toneOsc.type = 'triangle';
  toneOsc.frequency.setValueAtTime(220, now);
  toneOsc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
  const toneGain = context.createGain();
  toneGain.gain.setValueAtTime(0.0001, now);
  toneGain.gain.exponentialRampToValueAtTime(0.35 * intensity, now + 0.001);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  noiseSource.connect(noiseFilter).connect(noiseGain).connect(destination);
  toneOsc.connect(toneGain).connect(destination);

  noiseSource.start(now);
  noiseSource.stop(now + 0.14);
  toneOsc.start(now);
  toneOsc.stop(now + 0.12);
}

function triggerHat(
  context: BrowserAudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  intensity: number,
  durationSeconds: number,
): void {
  const now = safeCurrentTime(context);
  const source = context.createBufferSource();
  source.buffer = noise;

  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 6000;

  const bandpass = context.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 9000;
  bandpass.Q.value = 0.8;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35 * intensity, now + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

  source.connect(highpass).connect(bandpass).connect(gain).connect(destination);
  source.start(now);
  source.stop(now + durationSeconds + 0.02);
}

function triggerClap(context: BrowserAudioContext, destination: AudioNode, noise: AudioBuffer, intensity: number): void {
  const burstOffsets = [0, 0.015, 0.03, 0.045] as const;
  const base = safeCurrentTime(context);

  for (const offset of burstOffsets) {
    const now = base + offset;
    const source = context.createBufferSource();
    source.buffer = noise;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    filter.Q.value = 0.9;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28 * intensity, now + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    source.connect(filter).connect(gain).connect(destination);
    source.start(now);
    source.stop(now + 0.06);
  }
}

function triggerTom(
  context: BrowserAudioContext,
  destination: AudioNode,
  frequency: number,
  durationSeconds: number,
  intensity: number,
): void {
  const now = safeCurrentTime(context);
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency * 1.25, now);
  osc.frequency.exponentialRampToValueAtTime(frequency, now + durationSeconds * 0.6);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.max(180, frequency * 6), now);
  filter.Q.value = 0.7;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.62 * intensity, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

  osc.connect(filter).connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + durationSeconds + 0.02);
}

function triggerRim(context: BrowserAudioContext, destination: AudioNode, intensity: number): void {
  const now = safeCurrentTime(context);
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  osc.type = 'square';
  osc.frequency.setValueAtTime(1760, now);
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(2500, now);
  filter.Q.value = 2.4;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.42 * intensity, now + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

  osc.connect(filter).connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + 0.035);
}

function triggerKeyboard(context: BrowserAudioContext, destination: AudioNode, intensity: number): void {
  triggerChord(context, destination, 261.63, intensity);
}

function triggerTone(
  context: BrowserAudioContext,
  destination: AudioNode,
  frequency: number,
  durationSeconds: number,
  intensity: number,
  waveform: OscillatorType = 'sawtooth',
): void {
  const now = safeCurrentTime(context);
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  osc.type = waveform;
  osc.frequency.setValueAtTime(Math.max(30, frequency), now);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.max(300, frequency * 4), now);
  filter.Q.value = 0.9;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.7 * intensity, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

  osc.connect(filter).connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + durationSeconds + 0.02);
}

function triggerChord(context: BrowserAudioContext, destination: AudioNode, rootHz: number, intensity: number): void {
  const intervals = [1, 1.26, 1.5] as const;
  for (const interval of intervals) {
    triggerTone(context, destination, rootHz * interval, 0.26, intensity * 0.85, 'triangle');
  }
}

async function fetchAndDecodeSample(
  context: BrowserAudioContext,
  url: string,
): Promise<AudioBuffer> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load sample ${url} (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return context.decodeAudioData(arrayBuffer);
}

class WebAudioDrumEngine implements DrumEngine {
  private readonly context: BrowserAudioContext | null;
  private readonly master: GainNode | null;
  private readonly noiseBuffer: AudioBuffer | null;
  private state: DrumEngineState;
  private outputMode: DrumEngineOutputMode = 'none';
  private sampleLoadState: SampleLoadState = 'idle';
  private readonly sampleBuffers: TrackSampleMap = new Map();
  private sampleLoadError?: string;
  private readonly sampleBaseUrl: string;
  private readonly sampleManifest: Partial<Record<TrackId, string>>;
  private soundPreset: DrumSoundPreset;
  private trackSounds: Record<TrackId, SoundEffectId>;
  private openHatSampleSource: AudioBufferSourceNode | null = null;
  private openHatSampleGain: GainNode | null = null;

  constructor(options?: WebAudioDrumEngineOptions) {
    this.sampleBaseUrl = (options?.sampleBaseUrl ?? DEFAULT_SAMPLE_BASE_URL).replace(/\/$/, '');
    this.sampleManifest = {
      ...DEFAULT_SAMPLE_MANIFEST,
      ...(options?.sampleManifest ?? {}),
    };
    this.soundPreset = options?.soundPreset ?? 'drums';
    this.trackSounds = {
      ...DEFAULT_TRACK_SOUND_MAP,
      ...(options?.initialTrackSounds ?? {}),
    };

    if (!hasAudioContext()) {
      this.context = null;
      this.master = null;
      this.noiseBuffer = null;
      this.state = 'unsupported';
      return;
    }

    this.context = new window.AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(this.context.destination);
    this.noiseBuffer = createNoiseBuffer(this.context);
    this.outputMode = 'synth';
    this.state = this.context.state === 'running' ? 'loading' : 'locked';
    void this.loadSamples();
  }

  private async loadSamples(): Promise<void> {
    if (!this.context) {
      return;
    }

    this.sampleLoadState = 'loading';
    const entries = Object.entries(this.sampleManifest) as Array<[TrackId, string]>;
    try {
      const decoded = await Promise.all(
        entries.map(async ([trackId, fileName]) => {
          const url = `${this.sampleBaseUrl}/${fileName}`;
          const buffer = await fetchAndDecodeSample(this.context!, url);
          return [trackId, buffer] as const;
        }),
      );

      this.sampleBuffers.clear();
      for (const [trackId, buffer] of decoded) {
        this.sampleBuffers.set(trackId, buffer);
      }

      if (this.sampleBuffers.size === entries.length) {
        this.sampleLoadState = 'ready';
        this.outputMode = 'samples';
      } else {
        this.sampleLoadState = 'failed';
        this.outputMode = 'synth';
        this.sampleLoadError = 'Partial sample load; using synth fallback';
      }
    } catch (error) {
      this.sampleLoadState = 'failed';
      this.outputMode = 'synth';
      this.sampleLoadError = error instanceof Error ? error.message : 'Sample load failed';
      // Keep synth mode available for reliability.
      console.warn('[audio-engine] sample load failed, using synth fallback', error);
    }

    this.state = this.getState();
  }

  getState(): DrumEngineState {
    if (!this.context) {
      return 'unsupported';
    }

    if (this.context.state === 'closed') {
      this.state = 'closed';
      return this.state;
    }

    if (this.context.state !== 'running') {
      this.state = 'locked';
      return this.state;
    }

    if (this.sampleLoadState === 'loading' || this.sampleLoadState === 'idle') {
      this.state = 'loading';
      return this.state;
    }

    if (this.sampleLoadState === 'failed' && this.outputMode === 'none') {
      this.state = 'error';
      return this.state;
    }

    this.state = 'ready';
    return this.state;
  }

  getOutputMode(): DrumEngineOutputMode {
    return this.outputMode;
  }

  getSoundPreset(): DrumSoundPreset {
    return this.soundPreset;
  }

  setSoundPreset(preset: DrumSoundPreset): void {
    this.soundPreset = preset;
  }

  getTrackSound(trackId: TrackId): SoundEffectId {
    return this.trackSounds[trackId] ?? DEFAULT_TRACK_SOUND_MAP[trackId];
  }

  setTrackSound(trackId: TrackId, sound: SoundEffectId): void {
    this.trackSounds = {
      ...this.trackSounds,
      [trackId]: sound,
    };
  }

  listSoundEffects(): readonly SoundEffectId[] {
    return SOUND_EFFECT_IDS;
  }

  async unlock(): Promise<DrumEngineState> {
    if (!this.context) {
      return this.getState();
    }

    if (this.context.state !== 'running') {
      await this.context.resume();
    }

    return this.getState();
  }

  setMasterGain(value: number): void {
    if (!this.master || !this.context) {
      return;
    }

    const clamped = clamp(value, 0, 1);
    this.master.gain.setTargetAtTime(clamped, safeCurrentTime(this.context), 0.01);
  }

  private chokeOpenHat(): void {
    const source = this.openHatSampleSource;
    const gain = this.openHatSampleGain;
    if (!source || !gain || !this.context) {
      return;
    }

    const now = safeCurrentTime(this.context);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    try {
      source.stop(now + 0.03);
    } catch {
      // ignore source lifecycle errors
    }
    this.openHatSampleSource = null;
    this.openHatSampleGain = null;
  }

  private triggerSample(trackId: TrackId, intensity: number): boolean {
    if (!this.context || !this.master || this.outputMode !== 'samples' || this.soundPreset !== 'drums') {
      return false;
    }

    const sound = this.getTrackSound(trackId);
    const buffer = this.sampleBuffers.get(sound);
    if (!buffer) {
      return false;
    }

    if (sound === 'hat_closed') {
      this.chokeOpenHat();
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const gain = this.context.createGain();
    const now = safeCurrentTime(this.context);
    const trackGain = TRACK_SAMPLE_GAIN[sound] ?? 0.75;
    gain.gain.setValueAtTime(clamp(intensity * trackGain, 0, 1.2), now);
    source.connect(gain).connect(this.master);
    source.start(now);

    if (sound === 'hat_open') {
      this.openHatSampleSource = source;
      this.openHatSampleGain = gain;
      source.onended = () => {
        if (this.openHatSampleSource === source) {
          this.openHatSampleSource = null;
          this.openHatSampleGain = null;
        }
      };
    }

    return true;
  }

  private triggerDrumsSound(sound: SoundEffectId, intensity: number): void {
    if (!this.context || !this.master || !this.noiseBuffer) {
      return;
    }

    switch (sound) {
      case 'kick':
        triggerKick(this.context, this.master, intensity);
        break;
      case 'snare':
        triggerSnare(this.context, this.master, this.noiseBuffer, intensity);
        break;
      case 'hat_closed':
        triggerHat(this.context, this.master, this.noiseBuffer, intensity, 0.045);
        break;
      case 'hat_open':
        triggerHat(this.context, this.master, this.noiseBuffer, intensity, 0.18);
        break;
      case 'clap':
        triggerClap(this.context, this.master, this.noiseBuffer, intensity);
        break;
      case 'tom_low':
        triggerTom(this.context, this.master, 110, 0.18, intensity);
        break;
      case 'tom_high':
        triggerTom(this.context, this.master, 220, 0.14, intensity);
        break;
      case 'rim':
        triggerRim(this.context, this.master, intensity);
        break;
      case 'keyboard':
        triggerKeyboard(this.context, this.master, intensity * 0.9);
        break;
    }
  }

  private triggerElectroSound(sound: SoundEffectId, intensity: number): void {
    if (!this.context || !this.master || !this.noiseBuffer) {
      return;
    }

    switch (sound) {
      case 'kick':
        triggerKick(this.context, this.master, intensity);
        break;
      case 'snare':
        triggerSnare(this.context, this.master, this.noiseBuffer, intensity * 0.9);
        break;
      case 'hat_closed':
        triggerTone(this.context, this.master, 920, 0.06, intensity * 0.8, 'square');
        break;
      case 'hat_open':
        triggerTone(this.context, this.master, 760, 0.16, intensity * 0.75, 'square');
        break;
      case 'clap':
        triggerTone(this.context, this.master, 280, 0.12, intensity * 0.85, 'triangle');
        break;
      case 'tom_low':
        triggerTone(this.context, this.master, 160, 0.18, intensity * 0.8, 'sawtooth');
        break;
      case 'tom_high':
        triggerTone(this.context, this.master, 320, 0.1, intensity * 0.75, 'square');
        break;
      case 'rim':
        triggerTone(this.context, this.master, 1800, 0.03, intensity * 0.65, 'square');
        break;
      case 'keyboard':
        triggerChord(this.context, this.master, 293.66, intensity * 0.85);
        break;
    }
  }

  private triggerMelodicSound(sound: SoundEffectId, intensity: number): void {
    if (!this.context || !this.master) {
      return;
    }

    switch (sound) {
      case 'kick':
        triggerTone(this.context, this.master, 55, 0.22, intensity, 'sine');
        break;
      case 'snare':
        triggerChord(this.context, this.master, 220, intensity);
        break;
      case 'hat_closed':
        triggerTone(this.context, this.master, 660, 0.08, intensity, 'square');
        break;
      case 'hat_open':
        triggerTone(this.context, this.master, 440, 0.2, intensity, 'triangle');
        break;
      case 'clap':
        triggerTone(this.context, this.master, 330, 0.14, intensity, 'sawtooth');
        break;
      case 'tom_low':
        triggerTone(this.context, this.master, 146.83, 0.2, intensity, 'triangle');
        break;
      case 'tom_high':
        triggerTone(this.context, this.master, 293.66, 0.14, intensity, 'triangle');
        break;
      case 'rim':
        triggerTone(this.context, this.master, 987.77, 0.06, intensity * 0.7, 'square');
        break;
      case 'keyboard':
        triggerKeyboard(this.context, this.master, intensity);
        break;
    }
  }

  private triggerSynth(trackId: TrackId, intensity: number): void {
    const sound = this.getTrackSound(trackId);

    if (this.soundPreset === 'melodic') {
      this.triggerMelodicSound(sound, intensity);
      return;
    }

    if (this.soundPreset === 'electro') {
      this.triggerElectroSound(sound, intensity);
      return;
    }

    this.triggerDrumsSound(sound, intensity);
  }

  triggerTrack(trackId: TrackId, velocity = 100): void {
    if (!this.context || !this.master || !this.noiseBuffer) {
      return;
    }

    if (this.getState() !== 'ready') {
      return;
    }

    const intensity = clamp(velocity / 127, 0.12, 1);
    const usedSample = this.triggerSample(trackId, intensity);
    if (!usedSample) {
      this.triggerSynth(trackId, intensity);
    }
  }

  triggerStep(pattern: PatternV1, stepIndex: number): void {
    const normalizedIndex = ((stepIndex % pattern.length) + pattern.length) % pattern.length;
    for (const track of pattern.tracks) {
      const step = track.steps[normalizedIndex];
      if (step?.active) {
        this.triggerTrack(track.id, step.velocity);
      }
    }
  }

  dispose(): void {
    if (!this.context || this.context.state === 'closed') {
      this.state = this.context ? 'closed' : 'unsupported';
      return;
    }

    if (this.openHatSampleSource) {
      try {
        this.openHatSampleSource.stop();
      } catch {
        // ignore
      }
      this.openHatSampleSource = null;
      this.openHatSampleGain = null;
    }

    void this.context.close();
    this.state = 'closed';
    this.outputMode = 'none';
  }
}

export function createWebAudioDrumEngine(options?: WebAudioDrumEngineOptions): DrumEngine {
  return new WebAudioDrumEngine(options);
}
