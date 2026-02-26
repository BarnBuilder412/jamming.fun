import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createWebAudioDrumEngine, type DrumEngineOutputMode, type DrumEngineState } from '@jamming/audio-engine';
import { createEmptyPatternV1, hashPatternCommitInput } from '@jamming/pattern-core';
import type { PatternV1, SettlementResult, TrackId, WsEventEnvelope } from '@jamming/shared-types';
import { TRACK_IDS } from '@jamming/shared-types';
import { createBlinkActionUrls, getSolanaRpcUrl } from '@jamming/solana';
import { Button, Panel, Pill, jamThemeVars } from '@jamming/ui';
import { apiClient } from './lib/apiClient';
import { webEnv } from './lib/env';
import { usePlayhead } from './hooks/usePlayhead';
import { useRoomSocket } from './hooks/useRoomSocket';

type RoomView = Awaited<ReturnType<typeof apiClient.createRoom>>['room'];

type PendingReveal = {
  nonce: string;
  roundId: string;
};

const DEFAULT_ARTIST_WALLET = 'HDTU6CkVUvtju76qMNGTRVQn3LS2HKLWbx446BrkgvfA';
const DEFAULT_USER_WALLET = 'GwYEwPSdiqNbRAFyHc9XKFEVAZQYBiBFLii7JAdCfYZL';

export function App() {
  const [pattern, setPattern] = useState<PatternV1>(() => createEmptyPatternV1(120));
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [predictionWallet, setPredictionWallet] = useState(DEFAULT_USER_WALLET);
  const [predictionTrack, setPredictionTrack] = useState<TrackId>('kick');
  const [predictionStep, setPredictionStep] = useState(0);
  const [predictionWillBeActive, setPredictionWillBeActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof apiClient.health>> | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [audioState, setAudioState] = useState<DrumEngineState>('unsupported');
  const [audioOutputMode, setAudioOutputMode] = useState<DrumEngineOutputMode>('none');
  const [audioVolume, setAudioVolume] = useState(75);
  const [blinkPreview, setBlinkPreview] = useState<{
    join?: string;
    predict?: string;
    claim?: string;
  } | null>(null);
  const [claimReference, setClaimReference] = useState<string | null>(null);

  const playheadStep = usePlayhead(bpm, isPlaying);
  const roomRef = useRef<RoomView | null>(null);
  const patternRef = useRef(pattern);
  const lastTriggeredStepRef = useRef<number | null>(null);
  const audioEngineRef = useRef<ReturnType<typeof createWebAudioDrumEngine> | null>(null);
  roomRef.current = room;
  patternRef.current = pattern;

  const log = (message: string) => {
    startTransition(() => {
      setActivity((current) => [`${new Date().toLocaleTimeString()}  ${message}`, ...current].slice(0, 8));
    });
  };

  useEffect(() => {
    void (async () => {
      try {
        const healthz = await apiClient.health();
        setHealth(healthz);
      } catch {
        setHealth(null);
      }
    })();
  }, []);

  useEffect(() => {
    const engine = createWebAudioDrumEngine({ sampleBaseUrl: webEnv.sampleKitBaseUrl });
    audioEngineRef.current = engine;
    setAudioState(engine.getState());
    setAudioOutputMode(engine.getOutputMode());
    engine.setMasterGain(0.75);

    return () => {
      engine.dispose();
      setAudioState(engine.getState());
      setAudioOutputMode(engine.getOutputMode());
    };
  }, []);

  useEffect(() => {
    audioEngineRef.current?.setMasterGain(audioVolume / 100);
  }, [audioVolume]);

  useEffect(() => {
    if (!isPlaying) {
      lastTriggeredStepRef.current = null;
      return;
    }

    if (lastTriggeredStepRef.current === playheadStep) {
      return;
    }
    lastTriggeredStepRef.current = playheadStep;

    const engine = audioEngineRef.current;
    if (!engine) {
      return;
    }

    engine.triggerStep(patternRef.current, playheadStep);
    setAudioState(engine.getState());
    setAudioOutputMode(engine.getOutputMode());
  }, [isPlaying, playheadStep]);

  const handleSocketEvent = useEffectEvent((event: WsEventEnvelope) => {
    if (event.type === 'room.state.updated' && roomRef.current && roomRef.current.id === event.payload.roomId) {
      setRoom((current) => (current ? { ...current, currentRound: event.payload.currentRound } : current));
    }

    if (event.type === 'round.started' && roomRef.current && roomRef.current.id === event.payload.roomId) {
      setRoom((current) => (current ? { ...current, currentRound: event.payload.round } : current));
      log(`Round ${event.payload.round.index + 1} started`);
    }

    if (event.type === 'round.commit.received') {
      log(`Commit received for ${event.payload.roundId}`);
    }

    if (event.type === 'round.prediction.accepted') {
      log(`Prediction accepted (${event.payload.predictionCount})`);
    }

    if (event.type === 'round.locked') {
      log(`Round locked (${event.payload.roundId})`);
    }

    if (event.type === 'round.revealed') {
      log(`Round revealed (${event.payload.commitVerified ? 'verified' : 'invalid commit'})`);
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
      log(`Round settled (${event.payload.settlement.winningPredictions} winners)`);
    }
  });

  const wsStatus = useRoomSocket(room?.id ?? null, handleSocketEvent);

  const currentRound = room?.currentRound ?? null;
  const apiRoot = webEnv.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
  const blinkUrls = room ? createBlinkActionUrls(apiRoot, room.id) : null;

  const ensureAudioUnlocked = async () => {
    const engine = audioEngineRef.current;
    if (!engine) {
      return 'unsupported' as DrumEngineState;
    }
    const nextState = await engine.unlock();
    setAudioState(nextState);
    setAudioOutputMode(engine.getOutputMode());
    return nextState;
  };

  const previewTrack = (trackId: TrackId) => {
    const engine = audioEngineRef.current;
    if (!engine) {
      return;
    }

    void ensureAudioUnlocked()
      .then((state) => {
        if (state === 'ready') {
          engine.triggerTrack(trackId, 110);
          setAudioOutputMode(engine.getOutputMode());
        }
      })
      .catch(() => {
        setError('Unable to unlock browser audio. Click Play again and allow audio.');
      });
  };

  const setPad = (trackId: TrackId, stepIndex: number) => {
    setPattern((current) => ({
      ...current,
      bpm,
      tracks: current.tracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              steps: track.steps.map((step, index) =>
                index === stepIndex ? { ...step, active: !step.active } : step,
              ),
            }
          : track,
      ),
    }));
    previewTrack(trackId);
  };

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

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    void (async () => {
      const state = await ensureAudioUnlocked();
      if (state === 'unsupported') {
        setError('AudioContext is not supported in this browser.');
        return;
      }

      if (state === 'loading') {
        setError('Audio is unlocked. Samples are still loading, try Play again in a moment.');
        return;
      }

      if (state !== 'ready') {
        setError('Audio is locked. Click Play again after interacting with the page.');
        return;
      }

      setError(null);
      setIsPlaying(true);
      log('Audio engine ready');
    })();
  };

  const createRoom = () => {
    void withBusy('create-room', async () => {
      const response = await apiClient.createRoom({
        title: 'Judge Demo Room',
        artistWallet: walletConnected ? DEFAULT_ARTIST_WALLET : undefined,
        audiusHandle: 'audius',
      });
      setRoom(response.room);
      setSettlement(null);
      setPendingReveal(null);
      log(`Room created (${response.room.code})`);
    });
  };

  const startRound = () => {
    if (!room) {
      return;
    }
    void withBusy('start-round', async () => {
      const response = await apiClient.startRound(room.id, { bpm });
      setRoom((current) => (current ? { ...current, currentRound: response.round } : current));
      setSettlement(null);
      setPendingReveal(null);
      log(`Started round ${response.round.index + 1}`);
    });
  };

  const commitRound = () => {
    if (!room || !currentRound) {
      return;
    }

    void withBusy('commit', async () => {
      const nonce = `nonce_${Date.now()}`;
      const commitHash = hashPatternCommitInput({ pattern: { ...pattern, bpm }, roundId: currentRound.id, nonce });
      const response = await apiClient.commit(room.id, currentRound.id, { commitHash, patternVersion: 1 });
      setRoom((current) => (current ? { ...current, currentRound: response.round } : current));
      setPendingReveal({ nonce, roundId: currentRound.id });
      log(`Committed next segment for round ${currentRound.index + 1}`);
    });
  };

  const submitPrediction = () => {
    if (!room || !currentRound) {
      return;
    }

    void withBusy('predict', async () => {
      const response = await apiClient.predict(room.id, currentRound.id, {
        userWallet: predictionWallet,
        guess: {
          trackId: predictionTrack,
          stepIndex: predictionStep,
          willBeActive: predictionWillBeActive,
        },
      });
      log(`Prediction submitted (${response.predictionCount} total)`);
    });
  };

  const lockRound = () => {
    if (!room || !currentRound) {
      return;
    }

    void withBusy('lock', async () => {
      const response = await apiClient.lock(room.id, currentRound.id);
      setRoom((current) => (current ? { ...current, currentRound: response.round } : current));
      log('Predictions locked');
    });
  };

  const revealRound = () => {
    if (!room || !currentRound || !pendingReveal || pendingReveal.roundId !== currentRound.id) {
      return;
    }

    void withBusy('reveal', async () => {
      const response = await apiClient.reveal(room.id, currentRound.id, {
        pattern: { ...pattern, bpm },
        nonce: pendingReveal.nonce,
        commitInputVersion: 'v1',
      });
      setRoom((current) => (current ? { ...current, currentRound: response.round } : current));
      log(response.commitVerified ? 'Reveal verified' : 'Reveal failed commit verification');
    });
  };

  const settleRound = () => {
    if (!room || !currentRound) {
      return;
    }

    void withBusy('settle', async () => {
      const response = await apiClient.settle(room.id, currentRound.id);
      setSettlement(response.settlement);
      setRoom((current) =>
        current && current.currentRound
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
      log(`Settled round ${currentRound.index + 1}`);
    });
  };

  const refreshResults = () => {
    if (!room || !currentRound) {
      return;
    }

    void withBusy('results', async () => {
      const response = await apiClient.results(room.id, currentRound.id);
      setSettlement(response.settlement);
      log('Fetched round results');
    });
  };

  const previewBlinkPayloads = () => {
    if (!room || !currentRound) {
      return;
    }

    void withBusy('blink-preview', async () => {
      const [join, predict, claim] = await Promise.all([
        apiClient.blinkJoin(room.id),
        apiClient.blinkPredict(room.id, currentRound.id),
        apiClient.blinkClaim(room.id, currentRound.id, settlement?.leaderboard[0]?.userWallet ?? predictionWallet),
      ]);

      setBlinkPreview({
        join: JSON.stringify(join, null, 2),
        predict: JSON.stringify(predict, null, 2),
        claim: JSON.stringify(claim, null, 2),
      });
      log('Fetched Blink action payload previews');
    });
  };

  const claimTopReward = () => {
    if (!room || !currentRound) {
      return;
    }

    const winnerWallet = settlement?.leaderboard[0]?.userWallet ?? predictionWallet;
    void withBusy('magicblock-claim', async () => {
      const response = await apiClient.claimReward(room.id, currentRound.id, winnerWallet);
      const reference = response.result.reference ?? (response.result.ok ? 'claim_ok_no_ref' : 'claim_failed');
      setClaimReference(reference);
      log(`Claim action executed (${reference})`);
    });
  };

  const runAutoDemoRound = () => {
    void withBusy('auto-demo', async () => {
      let activeRoom = room;
      if (!activeRoom) {
        const created = await apiClient.createRoom({
          title: 'Judge Demo Room',
          artistWallet: walletConnected ? DEFAULT_ARTIST_WALLET : undefined,
          audiusHandle: 'audius',
        });
        activeRoom = created.room;
        setRoom(created.room);
        log(`Room created (${created.room.code})`);
      }

      if (!activeRoom) {
        throw new Error('Unable to create or resolve room');
      }

      let activeRound = activeRoom.currentRound;
      if (!activeRound || activeRound.phase === 'settled') {
        const started = await apiClient.startRound(activeRoom.id, { bpm });
        activeRound = started.round;
        setRoom((current) => (current ? { ...current, currentRound: started.round } : current));
        setSettlement(null);
        setPendingReveal(null);
        log(`Started round ${started.round.index + 1}`);
      }

      if (!activeRound) {
        throw new Error('Unable to start round');
      }

      const nonce = `nonce_${Date.now()}`;
      const patternForRound = { ...patternRef.current, bpm };
      const commitHash = hashPatternCommitInput({ pattern: patternForRound, roundId: activeRound.id, nonce });

      if (activeRound.phase === 'awaiting_commit') {
        const committed = await apiClient.commit(activeRoom.id, activeRound.id, { commitHash, patternVersion: 1 });
        activeRound = committed.round;
        setRoom((current) => (current ? { ...current, currentRound: committed.round } : current));
        setPendingReveal({ nonce, roundId: activeRound.id });
        log('Committed next segment');
      }

      if (activeRound.phase === 'prediction_open') {
        await apiClient.predict(activeRoom.id, activeRound.id, {
          userWallet: predictionWallet,
          guess: { trackId: predictionTrack, stepIndex: predictionStep, willBeActive: predictionWillBeActive },
        });
        log('Prediction submitted');
        const locked = await apiClient.lock(activeRoom.id, activeRound.id);
        activeRound = locked.round;
        setRoom((current) => (current ? { ...current, currentRound: locked.round } : current));
        log('Predictions locked');
      }

      if (activeRound.phase === 'locked') {
        const revealNonce =
          pendingReveal?.roundId === activeRound.id
            ? pendingReveal.nonce
            : nonce;
        const revealed = await apiClient.reveal(activeRoom.id, activeRound.id, {
          pattern: patternForRound,
          nonce: revealNonce,
          commitInputVersion: 'v1',
        });
        activeRound = revealed.round;
        setRoom((current) => (current ? { ...current, currentRound: revealed.round } : current));
        log(revealed.commitVerified ? 'Reveal verified' : 'Reveal invalid');
      }

      if (activeRound.phase === 'revealed') {
        const settled = await apiClient.settle(activeRoom.id, activeRound.id);
        setSettlement(settled.settlement);
        setRoom((current) =>
          current && current.currentRound
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
        log('Round settled');
      }
    });
  };

  return (
    <div className="app-shell" style={jamThemeVars}>
      <div className="app-background" aria-hidden="true" />
      <header className="top-bar">
        <div>
          <p className="eyebrow">jamming.fun / MVP V1</p>
          <h1>Live Beat Prediction Arena</h1>
          <p className="subtitle">Commit-reveal rounds, realtime predictions, and mandatory integrations on Solana Devnet.</p>
        </div>
        <div className="top-actions">
          <Pill tone={walletConnected ? 'success' : 'default'}>{walletConnected ? 'Wallet connected' : 'Wallet disconnected'}</Pill>
          <Button variant="ghost" onClick={() => setWalletConnected((current) => !current)}>
            {walletConnected ? 'Disconnect Wallet' : 'Connect Wallet'}
          </Button>
        </div>
      </header>

      <main className="layout">
        <section className="main-column">
          <Panel title="Drum Machine" subtitle="Hydrogen-inspired V1 shell">
            <div className="controls-row">
              <div className="transport">
                <Button onClick={togglePlayback}>{isPlaying ? 'Stop' : 'Play'}</Button>
                <Button variant="ghost" onClick={() => setPattern(createEmptyPatternV1(bpm))}>Clear</Button>
                <Button variant="ghost" onClick={runAutoDemoRound} disabled={busyAction !== null}>Auto Demo Round</Button>
              </div>
              <label className="bpm-control">
                <span>BPM</span>
                <input
                  type="range"
                  min={70}
                  max={170}
                  value={bpm}
                  onChange={(event) => {
                    const nextBpm = Number(event.currentTarget.value);
                    setBpm(nextBpm);
                    setPattern((current) => ({ ...current, bpm: nextBpm }));
                  }}
                />
                <strong>{bpm}</strong>
              </label>
              <Pill tone="accent">Step {playheadStep + 1}/16</Pill>
              <Pill tone={audioState === 'ready' ? 'success' : audioState === 'unsupported' ? 'danger' : 'default'}>
                Audio: {audioState}{audioState === 'ready' ? ` (${audioOutputMode})` : ''}
              </Pill>
              <label className="volume-control">
                <span>Vol</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={audioVolume}
                  onChange={(event) => setAudioVolume(Number(event.currentTarget.value))}
                />
                <strong>{audioVolume}</strong>
              </label>
            </div>

            <div className="sequencer-grid" role="grid" aria-label="Drum sequencer">
              {TRACK_IDS.map((trackId) => (
                <div key={trackId} className="track-row" role="row">
                  <div className="track-label">{trackId.replace('_', ' ')}</div>
                  <div className="pads">
                    {Array.from({ length: 16 }, (_, stepIndex) => {
                      const track = pattern.tracks.find((item) => item.id === trackId)!;
                      const step = track.steps[stepIndex]!;
                      const isActive = step.active;
                      const isPlayhead = playheadStep === stepIndex;
                      return (
                        <button
                          key={`${trackId}-${stepIndex}`}
                          type="button"
                          role="gridcell"
                          className={`pad ${isActive ? 'active' : ''} ${isPlayhead ? 'playhead' : ''}`}
                          aria-pressed={isActive}
                          onClick={() => setPad(trackId, stepIndex)}
                          title={`${trackId} step ${stepIndex + 1}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {audioState === 'ready' && audioOutputMode === 'synth' ? (
              <p className="status-line">Samples unavailable, using synth fallback (demo still works).</p>
            ) : null}
            {audioState === 'loading' ? (
              <p className="status-line">Loading local drum samples...</p>
            ) : null}
          </Panel>

          <Panel title="Round Controls" subtitle="V1 demo flow: commit -> predict -> lock -> reveal -> settle">
            <div className="button-grid">
              <Button onClick={createRoom} disabled={busyAction !== null}>Create Room</Button>
              <Button onClick={startRound} disabled={!room || busyAction !== null}>Start Round</Button>
              <Button onClick={commitRound} disabled={!currentRound || busyAction !== null}>Commit</Button>
              <Button onClick={submitPrediction} disabled={!currentRound || busyAction !== null}>Submit Prediction</Button>
              <Button onClick={lockRound} disabled={!currentRound || busyAction !== null}>Lock</Button>
              <Button onClick={revealRound} disabled={!currentRound || !pendingReveal || busyAction !== null}>Reveal</Button>
              <Button onClick={settleRound} disabled={!currentRound || busyAction !== null}>Settle</Button>
              <Button variant="ghost" onClick={refreshResults} disabled={!currentRound || busyAction !== null}>Refresh Results</Button>
            </div>
            {busyAction ? <p className="status-line">Working: {busyAction}</p> : null}
            {error ? <p className="error-line">{error}</p> : null}
          </Panel>
        </section>

        <aside className="side-column">
          <Panel title="Prediction Panel" subtitle="User-side prediction UI (V1)">
            <div className="form-stack">
              <label>
                <span>User wallet</span>
                <input value={predictionWallet} onChange={(event) => setPredictionWallet(event.currentTarget.value)} />
              </label>
              <label>
                <span>Track</span>
                <select value={predictionTrack} onChange={(event) => setPredictionTrack(event.currentTarget.value as TrackId)}>
                  {TRACK_IDS.map((trackId) => (
                    <option key={trackId} value={trackId}>{trackId}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Step index</span>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={predictionStep}
                  onChange={(event) => setPredictionStep(Math.max(0, Math.min(15, Number(event.currentTarget.value))))}
                />
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={predictionWillBeActive}
                  onChange={(event) => setPredictionWillBeActive(event.currentTarget.checked)}
                />
                <span>Predict step will be active</span>
              </label>
            </div>
          </Panel>

          <Panel title="Room / Round" subtitle="Judge-facing session status">
            <div className="meta-list">
              <div><span>Room:</span> <strong>{room?.code ?? 'n/a'}</strong></div>
              <div><span>Room ID:</span> <code>{room?.id ?? 'n/a'}</code></div>
              <div><span>Title:</span> <strong>{room?.title ?? 'n/a'}</strong></div>
              <div><span>Audius:</span> <strong>{room?.audiusHandle ?? 'pending'}</strong></div>
              <div>
                <span>Audius Profile:</span>{' '}
                {room?.audiusHandle ? (
                  <a
                    className="inline-link"
                    href={room.audiusProfileUrl ?? `https://audius.co/${room.audiusHandle}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    open profile
                  </a>
                ) : (
                  <strong>n/a</strong>
                )}
              </div>
              <div><span>Round:</span> <strong>{currentRound ? currentRound.index + 1 : 'n/a'}</strong></div>
              <div><span>Phase:</span> <Pill tone={currentRound?.phase === 'settled' ? 'success' : 'accent'}>{currentRound?.phase ?? 'idle'}</Pill></div>
              <div><span>Predictions:</span> <strong>{currentRound?.predictionCount ?? 0}</strong></div>
              <div><span>Commit verified:</span> <strong>{currentRound?.commitVerified === null || currentRound?.commitVerified === undefined ? 'n/a' : String(currentRound.commitVerified)}</strong></div>
            </div>
          </Panel>

          <Panel title="Leaderboard / Rewards" subtitle="Track token units (V1 simple rewards)">
            {settlement ? (
              <>
                <div className="leaderboard-summary">
                  <Pill tone={settlement.commitVerified ? 'success' : 'danger'}>
                    {settlement.commitVerified ? 'Commit verified' : 'Commit invalid'}
                  </Pill>
                  <span>{settlement.winningPredictions}/{settlement.totalPredictions} winning predictions</span>
                </div>
                <ul className="leaderboard-list">
                  {settlement.leaderboard.map((entry) => (
                    <li key={entry.userWallet}>
                      <code>{entry.userWallet}</code>
                      <span>{entry.correctPredictions} correct</span>
                      <strong>{entry.rewardUnits} units</strong>
                    </li>
                  ))}
                </ul>
                {settlement.integrations ? (
                  <div className="integration-proofs">
                    <div>
                      <span>MagicBlock settle ref</span>
                      <code>{settlement.integrations.magicBlockSettlementReference ?? 'n/a'}</code>
                    </div>
                    <div>
                      <span>Audius session ref</span>
                      <code>{settlement.integrations.audiusSessionReference ?? 'n/a'}</code>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="placeholder-line">No settlement yet. Run the full round flow to populate results.</p>
            )}
          </Panel>

          <Panel title="Integrations" subtitle="MagicBlock + Audius + Blinks must be visible in V1 demo">
            <div className="integration-list">
              <div>
                <span>Solana Cluster</span>
                <strong>{webEnv.solanaCluster}</strong>
                <small>{getSolanaRpcUrl(webEnv.solanaCluster as 'devnet' | 'mainnet-beta')}</small>
              </div>
              <div>
                <span>WebSocket</span>
                <Pill tone={wsStatus === 'open' ? 'success' : wsStatus === 'error' ? 'danger' : 'default'}>{wsStatus}</Pill>
              </div>
              <div>
                <span>MagicBlock</span>
                <Pill
                  tone={
                    health?.integrations?.magicBlock?.mode === 'real'
                      ? 'success'
                      : health?.featureFlags?.enableMagicBlock
                        ? 'accent'
                        : 'danger'
                  }
                >
                  {health?.integrations?.magicBlock?.mode ?? (health?.featureFlags?.enableMagicBlock ? 'enabled' : 'disabled / unknown')}
                </Pill>
              </div>
              <div>
                <span>Audius</span>
                <Pill
                  tone={
                    health?.integrations?.audius?.mode === 'real'
                      ? 'success'
                      : health?.featureFlags?.enableAudius
                        ? 'accent'
                        : 'danger'
                  }
                >
                  {health?.integrations?.audius?.mode ?? (health?.featureFlags?.enableAudius ? 'enabled' : 'disabled / unknown')}
                </Pill>
              </div>
              <div>
                <span>Blinks</span>
                <Pill
                  tone={
                    health?.integrations?.blinks?.mode === 'real'
                      ? 'success'
                      : health?.featureFlags?.enableBlinks
                        ? 'accent'
                        : 'danger'
                  }
                >
                  {health?.integrations?.blinks?.mode ?? (health?.featureFlags?.enableBlinks ? 'enabled' : 'disabled / unknown')}
                </Pill>
              </div>
              {health?.integrations ? (
                <div className="integration-proofs">
                  <div>
                    <span>MagicBlock status</span>
                    <code>{health.integrations.magicBlock?.details ?? 'n/a'}</code>
                  </div>
                  <div>
                    <span>Audius status</span>
                    <code>{health.integrations.audius?.details ?? 'n/a'}</code>
                  </div>
                  <div>
                    <span>Blinks status</span>
                    <code>{health.integrations.blinks?.details ?? 'n/a'}</code>
                  </div>
                </div>
              ) : null}
              {blinkUrls ? (
                <div className="blink-links">
                  <a href={blinkUrls.join} target="_blank" rel="noreferrer">Blink: Join</a>
                  <a href={currentRound ? blinkUrls.predict(currentRound.id) : '#'} target="_blank" rel="noreferrer">Blink: Predict</a>
                  <a href={currentRound ? blinkUrls.claim(currentRound.id) : '#'} target="_blank" rel="noreferrer">Blink: Claim</a>
                </div>
              ) : null}
              <div className="integration-actions">
                <Button variant="ghost" onClick={previewBlinkPayloads} disabled={!room || !currentRound || busyAction !== null}>
                  Preview Blinks JSON
                </Button>
                <Button onClick={claimTopReward} disabled={!room || !currentRound || !settlement || busyAction !== null}>
                  Claim Top Reward
                </Button>
              </div>
              {claimReference ? <p className="status-line">Latest claim ref: {claimReference}</p> : null}
              {blinkPreview ? (
                <div className="blink-preview-grid">
                  {(['join', 'predict', 'claim'] as const).map((kind) =>
                    blinkPreview[kind] ? (
                      <div key={kind}>
                        <div className="preview-label">Blink {kind}</div>
                        <pre className="json-preview">{blinkPreview[kind]}</pre>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="Activity Feed" subtitle="Demo-friendly event trace">
            {activity.length === 0 ? (
              <p className="placeholder-line">No events yet.</p>
            ) : (
              <ul className="activity-list">
                {activity.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </main>
    </div>
  );
}
