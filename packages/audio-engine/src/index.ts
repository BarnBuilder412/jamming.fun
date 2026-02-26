import type { PatternV1, TrackId } from '@jamming/shared-types';

export type PlayheadListener = (stepIndex: number) => void;

export interface PlayheadController {
  start(): void;
  stop(): void;
  setBpm(bpm: number): void;
  subscribe(listener: PlayheadListener): () => void;
}

export function createIntervalPlayhead(initialBpm = 120, stepsPerPattern = 16): PlayheadController {
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

export interface DrumEngine {
  getState(): DrumEngineState;
  getOutputMode(): DrumEngineOutputMode;
  unlock(): Promise<DrumEngineState>;
  setMasterGain(value: number): void;
  triggerTrack(trackId: TrackId, velocity?: number): void;
  triggerStep(pattern: PatternV1, stepIndex: number): void;
  dispose(): void;
}

export type WebAudioDrumEngineOptions = {
  sampleBaseUrl?: string;
  sampleManifest?: Partial<Record<TrackId, string>>;
};

type BrowserAudioContext = AudioContext;

type SampleLoadState = 'idle' | 'loading' | 'ready' | 'failed';

type TrackSampleMap = Map<TrackId, AudioBuffer>;

const DEFAULT_SAMPLE_BASE_URL = '/samples/hydrogen-lite';

const DEFAULT_SAMPLE_MANIFEST: Record<TrackId, string> = {
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
  private readonly sampleManifest: Record<TrackId, string>;
  private openHatSampleSource: AudioBufferSourceNode | null = null;
  private openHatSampleGain: GainNode | null = null;

  constructor(options?: WebAudioDrumEngineOptions) {
    this.sampleBaseUrl = (options?.sampleBaseUrl ?? DEFAULT_SAMPLE_BASE_URL).replace(/\/$/, '');
    this.sampleManifest = {
      ...DEFAULT_SAMPLE_MANIFEST,
      ...(options?.sampleManifest ?? {}),
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
    if (!this.context || !this.master || this.outputMode !== 'samples') {
      return false;
    }

    const buffer = this.sampleBuffers.get(trackId);
    if (!buffer) {
      return false;
    }

    if (trackId === 'hat_closed') {
      this.chokeOpenHat();
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const gain = this.context.createGain();
    const now = safeCurrentTime(this.context);
    const trackGain = TRACK_SAMPLE_GAIN[trackId] ?? 0.75;
    gain.gain.setValueAtTime(clamp(intensity * trackGain, 0, 1.2), now);
    source.connect(gain).connect(this.master);
    source.start(now);

    if (trackId === 'hat_open') {
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

  private triggerSynth(trackId: TrackId, intensity: number): void {
    if (!this.context || !this.master || !this.noiseBuffer) {
      return;
    }

    switch (trackId) {
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
    }
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
      this.outputMode = 'synth';
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
