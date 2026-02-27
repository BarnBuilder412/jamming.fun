import { startTransition, useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  createWebAudioDrumEngine,
  type DrumEngineOutputMode,
  type DrumEngineState,
} from '@jamming/audio-engine';
import type { PredictionGuess, SettlementResult, TrackId, WsEventEnvelope } from '@jamming/shared-types';
import { TRACK_IDS } from '@jamming/shared-types';
import { Button, Panel, Pill, jamThemeVars } from '@jamming/ui';
import { apiClient } from '../lib/apiClient';
import { webEnv } from '../lib/env';
import { TRACK_VISUALS } from '../lib/trackVisuals';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { useSolanaWallet } from '../hooks/useSolanaWallet';

type RoomView = Awaited<ReturnType<typeof apiClient.createRoom>>['room'];

type PredictionEntry = {
  trackId: TrackId;
  stepIndex: number;
  willBeActive: boolean;
  submitted: boolean;
};

function parseUsdcToMinor(input: string): number | null {
  const normalized = input.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(normalized)) {
    return null;
  }
  const [wholePart, fractionalPart = ''] = normalized.split('.');
  const paddedFraction = `${fractionalPart}000000`.slice(0, 6);
  const whole = Number(wholePart);
  const fractional = Number(paddedFraction);
  if (!Number.isFinite(whole) || !Number.isFinite(fractional)) {
    return null;
  }
  const minor = whole * 1_000_000 + fractional;
  return Number.isInteger(minor) && minor > 0 ? minor : null;
}

function formatUsdcMinor(amount: number): string {
  return (amount / 1_000_000).toFixed(2);
}

export function UserView() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [stakeInput, setStakeInput] = useState('0.10');
  const [gridSize, setGridSize] = useState<16 | 32>(32);

  const [predictions, setPredictions] = useState<Map<string, PredictionEntry>>(new Map());

  const [audioState, setAudioState] = useState<DrumEngineState>('unsupported');
  const [audioOutputMode, setAudioOutputMode] = useState<DrumEngineOutputMode>('none');
  const [audioVolume, setAudioVolume] = useState(75);
  const [isListening, setIsListening] = useState(false);
  const audioEngineRef = useRef<ReturnType<typeof createWebAudioDrumEngine> | null>(null);

  const roomRef = useRef<RoomView | null>(null);
  roomRef.current = room;

  const wallet = useSolanaWallet();
  const currentRound = room?.currentRound ?? null;
  const isPredictionOpen = currentRound?.phase === 'prediction_open';

  const log = (message: string) => {
    startTransition(() => {
      setActivity((current) => [`${new Date().toLocaleTimeString()}  ${message}`, ...current].slice(0, 12));
    });
  };

  useEffect(() => {
    if (!code) {
      setError('No room code provided');
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const response = await apiClient.getRoomByCode(code);
        setRoom(response.room);
        setError(null);
        log(`Joined room: ${response.room.title} (${response.room.code})`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Room not found');
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  useEffect(() => {
    const engine = createWebAudioDrumEngine({ sampleBaseUrl: webEnv.sampleKitBaseUrl });
    audioEngineRef.current = engine;
    setAudioState(engine.getState());
    setAudioOutputMode(engine.getOutputMode());
    engine.setMasterGain(0.75);

    return () => {
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    audioEngineRef.current?.setMasterGain(audioVolume / 100);
  }, [audioVolume]);

  useEffect(() => {
    if (gridSize === 32) {
      return;
    }

    setPredictions((current) => {
      const next = new Map<string, PredictionEntry>();
      for (const [key, value] of current.entries()) {
        if (value.stepIndex < 16) {
          next.set(key, value);
        }
      }
      return next;
    });
  }, [gridSize]);

  const handleSocketEvent = useEffectEvent((event: WsEventEnvelope) => {
    if (event.type === 'room.state.updated' && roomRef.current && roomRef.current.id === event.payload.roomId) {
      setRoom((current) => (current ? { ...current, currentRound: event.payload.currentRound } : current));
    }

    if (event.type === 'round.started' && roomRef.current && roomRef.current.id === event.payload.roomId) {
      setRoom((current) => (current ? { ...current, currentRound: event.payload.round } : current));
      setPredictions(new Map());
      setSettlement(null);
      log(`Round ${event.payload.round.index + 1} started`);
    }

    if (event.type === 'round.commit.received') {
      log('Artist committed pattern. Predictions open.');
    }

    if (event.type === 'round.prediction.accepted') {
      const stakeLabel = event.payload.totalStakedUsdc !== undefined
        ? ` • staked $${formatUsdcMinor(event.payload.totalStakedUsdc)}`
        : '';
      log(`${event.payload.predictionCount} predictions accepted${stakeLabel}`);
    }

    if (event.type === 'round.locked') {
      log('Predictions locked. Waiting for reveal.');
    }

    if (event.type === 'round.revealed') {
      log(`Pattern revealed (${event.payload.commitVerified ? 'verified' : 'invalid'})`);
    }

    if (event.type === 'round.settled') {
      setSettlement(event.payload.settlement);
      setRoom((current) =>
        current && current.id === event.payload.roomId && current.currentRound?.id === event.payload.roundId
          ? {
              ...current,
              currentRound: {
                ...current.currentRound,
                phase: 'settled',
                settledAt: new Date().toISOString(),
              },
            }
          : current,
      );
      log(`Round settled • ${event.payload.settlement.winningPredictions}/${event.payload.settlement.totalPredictions} correct`);
    }
  });

  const wsStatus = useRoomSocket(room?.id ?? null, handleSocketEvent);

  const withBusy = async (label: string, fn: () => Promise<void>) => {
    setBusyAction(label);
    setError(null);
    try {
      await fn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unexpected error');
    } finally {
      setBusyAction(null);
    }
  };

  const togglePrediction = (trackId: TrackId, stepIndex: number) => {
    if (!isPredictionOpen) return;

    const key = `${trackId}-${stepIndex}`;
    setPredictions((current) => {
      const next = new Map(current);
      if (next.has(key)) {
        const existing = next.get(key)!;
        if (existing.submitted) return current;
        next.delete(key);
      } else {
        next.set(key, { trackId, stepIndex, willBeActive: true, submitted: false });
      }
      return next;
    });
  };

  const submitAllPredictions = () => {
    if (!room || !currentRound || !isPredictionOpen) return;
    const connectedWallet = wallet.publicKey;
    if (!wallet.connected || !connectedWallet) {
      setError('Connect your wallet before submitting predictions.');
      return;
    }

    const stakeAmountUsdc = parseUsdcToMinor(stakeInput);
    if (!stakeAmountUsdc) {
      setError('Enter a valid USDC stake amount (up to 6 decimals).');
      return;
    }

    const pending = Array.from(predictions.values()).filter((prediction) => !prediction.submitted);
    if (pending.length === 0) {
      setError('No predictions to submit. Tap pads to predict.');
      return;
    }

    const guesses: PredictionGuess[] = pending.map((prediction) => ({
      trackId: prediction.trackId,
      stepIndex: prediction.stepIndex,
      willBeActive: prediction.willBeActive,
    }));

    void withBusy('submitting predictions', async () => {
      const response = await apiClient.predictBatch(room.id, currentRound.id, {
        userWallet: connectedWallet,
        stakeAmountUsdc,
        guesses,
      });

      setPredictions((current) => {
        const next = new Map(current);
        for (const prediction of pending) {
          const key = `${prediction.trackId}-${prediction.stepIndex}`;
          next.set(key, { ...prediction, submitted: true });
        }
        return next;
      });

      log(
        `Submitted ${response.acceptedCount} predictions • total staked $${formatUsdcMinor(response.totalStakedUsdc)}`,
      );
    });
  };

  const refreshResults = () => {
    if (!room || !currentRound) return;
    void withBusy('results', async () => {
      const response = await apiClient.results(room.id, currentRound.id);
      setSettlement(response.settlement);
      log('Fetched round results');
    });
  };

  const enableAudio = async () => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    const state = await engine.unlock();
    setAudioState(state);
    setAudioOutputMode(engine.getOutputMode());
    if (state === 'ready') {
      setIsListening(true);
      log('Audio enabled');
    }
  };

  const getPhaseInfo = () => {
    if (!currentRound) {
      return {
        label: 'Waiting for artist to start...',
        color: 'default' as const,
        instruction: "The artist hasn't started a round yet.",
      };
    }

    switch (currentRound.phase) {
      case 'awaiting_commit':
        return { label: 'Awaiting Commit', color: 'default' as const, instruction: 'Artist preparing pattern.' };
      case 'prediction_open':
        return {
          label: 'Predictions Open',
          color: 'accent' as const,
          instruction: 'Select tiles, set USDC stake, and submit batch prediction.',
        };
      case 'locked':
        return { label: 'Predictions Locked', color: 'danger' as const, instruction: 'Waiting for reveal.' };
      case 'revealed':
        return { label: 'Pattern Revealed', color: 'accent' as const, instruction: 'Waiting for settlement.' };
      case 'settled':
        return { label: 'Round Complete', color: 'success' as const, instruction: 'Check payouts and leaderboard.' };
      default:
        return { label: currentRound.phase, color: 'default' as const, instruction: '' };
    }
  };

  const phaseInfo = getPhaseInfo();

  if (loading) {
    return (
      <div className="app-shell" style={jamThemeVars}>
        <div className="app-background" aria-hidden="true" />
        <div className="user-loading">
          <div className="loading-spinner" />
          <p>
            Joining room <strong>{code}</strong>...
          </p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="app-shell" style={jamThemeVars}>
        <div className="app-background" aria-hidden="true" />
        <div className="user-error-container">
          <Panel title="Room Not Found">
            <p className="error-line">{error || `No room found with code "${code}"`}</p>
            <p className="landing-card-desc">The room may not be active or the code is incorrect.</p>
            <Button onClick={() => { void navigate('/'); }}>← Back to Home</Button>
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" style={jamThemeVars}>
      <div className="app-background" aria-hidden="true" />
      <header className="top-bar">
        <div>
          <p className="eyebrow">jamming.fun / Listener</p>
          <h1>{room.title}</h1>
          <p className="subtitle">
            Room: <strong>{room.code}</strong> • Predict beats, win USDC + room token units
          </p>
        </div>
        <div className="top-actions">
          <Pill tone={wsStatus === 'open' ? 'success' : wsStatus === 'error' ? 'danger' : 'default'}>
            {wsStatus === 'open' ? '● Live' : wsStatus}
          </Pill>
          <Button variant="ghost" onClick={() => { void navigate('/'); }}>← Home</Button>
        </div>
      </header>

      <main className="layout">
        <section className="main-column">
          <div className={`phase-banner phase-banner--${currentRound?.phase ?? 'idle'}`}>
            <Pill tone={phaseInfo.color}>{phaseInfo.label}</Pill>
            <p className="phase-instruction">{phaseInfo.instruction}</p>
            {currentRound ? (
              <span className="prediction-counter">
                {currentRound.predictionCount} predictions • staked ${formatUsdcMinor(currentRound.totalStakedUsdc ?? 0)}
              </span>
            ) : null}
          </div>

          <Panel title="Prediction Grid" subtitle={isPredictionOpen ? 'Tap pads and submit as a batch' : 'Waiting for prediction window'}>
            <div className="grid-size-toggle">
              <span>Grid</span>
              <Button variant={gridSize === 16 ? 'primary' : 'ghost'} onClick={() => setGridSize(16)}>16</Button>
              <Button variant={gridSize === 32 ? 'primary' : 'ghost'} onClick={() => setGridSize(32)}>32</Button>
            </div>
            <div className="sequencer-grid" role="grid" aria-label="Prediction grid">
              {TRACK_IDS.map((trackId) => (
                <div key={trackId} className="track-row" role="row">
                  <div className="track-label">
                    <span className="track-icon">{TRACK_VISUALS[trackId].icon}</span>
                    <span>{TRACK_VISUALS[trackId].label}</span>
                  </div>
                  <div className="pads" style={{ '--grid-columns': gridSize } as CSSProperties}>
                    {Array.from({ length: gridSize }, (_, stepIndex) => {
                      const key = `${trackId}-${stepIndex}`;
                      const prediction = predictions.get(key);
                      const isPredicted = Boolean(prediction);
                      const isSubmitted = prediction?.submitted ?? false;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="gridcell"
                          className={`pad ${isPredicted ? 'predicted' : ''} ${isSubmitted ? 'submitted' : ''} ${!isPredictionOpen ? 'disabled-pad' : ''}`}
                          aria-pressed={isPredicted}
                          onClick={() => togglePrediction(trackId, stepIndex)}
                          disabled={!isPredictionOpen || isSubmitted}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {isPredictionOpen ? (
              <div className="prediction-actions">
                <label className="stake-input-row">
                  <span>Stake per tile (USDC)</span>
                  <input
                    value={stakeInput}
                    onChange={(event) => setStakeInput(event.currentTarget.value)}
                    inputMode="decimal"
                    placeholder="0.10"
                  />
                </label>
                <span className="prediction-count-badge">
                  {Array.from(predictions.values()).filter((prediction) => !prediction.submitted).length} pending •{' '}
                  {Array.from(predictions.values()).filter((prediction) => prediction.submitted).length} submitted
                </span>
                <Button
                  onClick={submitAllPredictions}
                  disabled={
                    busyAction !== null ||
                    Array.from(predictions.values()).filter((prediction) => !prediction.submitted).length === 0
                  }
                >
                  Submit Batch
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setPredictions((current) => {
                      const next = new Map<string, PredictionEntry>();
                      for (const [key, value] of current.entries()) {
                        if (value.submitted) {
                          next.set(key, value);
                        }
                      }
                      return next;
                    })
                  }
                >
                  Clear Pending
                </Button>
              </div>
            ) : null}
            {busyAction ? <p className="status-line">Working: {busyAction}</p> : null}
            {error ? <p className="error-line">{error}</p> : null}
          </Panel>
        </section>

        <aside className="side-column">
          <Panel title="Wallet" subtitle="Connect once, then submit predictions">
            <div className="form-stack">
              <Pill tone={wallet.connected ? 'success' : wallet.status === 'unsupported' ? 'danger' : 'default'}>
                {wallet.connected ? 'Connected' : wallet.status}
              </Pill>
              <code>{wallet.publicKey ?? 'No wallet connected'}</code>
              {wallet.error ? <p className="error-line">{wallet.error}</p> : null}
              {wallet.connected ? (
                <Button variant="ghost" onClick={() => void wallet.disconnect()}>
                  Disconnect Wallet
                </Button>
              ) : (
                <Button onClick={() => void wallet.connect()} disabled={wallet.status === 'unsupported'}>
                  Connect Wallet
                </Button>
              )}
            </div>
          </Panel>

          <Panel title="Audio" subtitle="Listen to beats in real-time">
            <div className="audio-controls">
              <Button variant={isListening ? 'ghost' : 'primary'} onClick={isListening ? () => setIsListening(false) : () => void enableAudio()}>
                {isListening ? 'Mute' : 'Enable Audio'}
              </Button>
              <Pill tone={audioState === 'ready' ? 'success' : 'default'}>
                {audioState}
                {audioState === 'ready' ? ` (${audioOutputMode})` : ''}
              </Pill>
              {isListening ? (
                <label className="volume-control">
                  <span>Vol</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={audioVolume}
                    onChange={(event) => setAudioVolume(Number(event.target.value))}
                  />
                  <strong>{audioVolume}</strong>
                </label>
              ) : null}
            </div>
          </Panel>

          <Panel title="Leaderboard / Payouts" subtitle="USDC + room token rewards">
            {settlement ? (
              <>
                <div className="leaderboard-summary">
                  <Pill tone={settlement.commitVerified ? 'success' : 'danger'}>
                    {settlement.commitVerified ? 'Verified round' : 'Invalid commit'}
                  </Pill>
                  <span>
                    Winner pot ${formatUsdcMinor(settlement.economics.winnerPotUsdc)} • Distributed ${formatUsdcMinor(settlement.economics.winnerPotDistributedUsdc)}
                  </span>
                </div>
                <ul className="leaderboard-list">
                  {settlement.leaderboard.map((entry, index) => (
                    <li key={entry.userWallet} className={entry.userWallet === wallet.publicKey ? 'leaderboard-you' : ''}>
                      <div className="leaderboard-rank">#{index + 1}</div>
                      <code>
                        {entry.userWallet === wallet.publicKey
                          ? 'YOU'
                          : `${entry.userWallet.slice(0, 6)}...${entry.userWallet.slice(-4)}`}
                      </code>
                      <span>{entry.correctPredictions} correct</span>
                      <strong>${formatUsdcMinor(entry.usdcWon)}</strong>
                      <span>{entry.rewardUnits} token units</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="placeholder-line">No results yet. Wait for settlement.</p>
                <Button variant="ghost" onClick={refreshResults} disabled={!currentRound || busyAction !== null}>
                  Refresh Results
                </Button>
              </>
            )}
          </Panel>

          <Panel title="Live Activity" subtitle="Real-time events">
            {activity.length === 0 ? (
              <p className="placeholder-line">Waiting for events...</p>
            ) : (
              <ul className="activity-list">
                {activity.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </main>
    </div>
  );
}
