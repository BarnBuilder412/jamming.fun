import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createWebAudioDrumEngine, type DrumEngineOutputMode, type DrumEngineState } from '@jamming/audio-engine';
import { createEmptyPatternV1 } from '@jamming/pattern-core';
import type { PatternV1, SettlementResult, TrackId, WsEventEnvelope } from '@jamming/shared-types';
import { TRACK_IDS } from '@jamming/shared-types';
import { Button, Panel, Pill, jamThemeVars } from '@jamming/ui';
import { apiClient } from '../lib/apiClient';
import { webEnv } from '../lib/env';
import { usePlayhead } from '../hooks/usePlayhead';
import { useRoomSocket } from '../hooks/useRoomSocket';

type RoomView = Awaited<ReturnType<typeof apiClient.createRoom>>['room'];

type PredictionEntry = {
    trackId: TrackId;
    stepIndex: number;
    willBeActive: boolean;
    submitted: boolean;
};

const DEFAULT_USER_WALLET = 'GwYEwPSdiqNbRAFyHc9XKFEVAZQYBiBFLii7JAdCfYZL';

export function UserView() {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();

    // Room state
    const [room, setRoom] = useState<RoomView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [settlement, setSettlement] = useState<SettlementResult | null>(null);
    const [activity, setActivity] = useState<string[]>([]);
    const [busyAction, setBusyAction] = useState<string | null>(null);

    // User identity
    const [userWallet, setUserWallet] = useState(DEFAULT_USER_WALLET);
    const [walletLocked, setWalletLocked] = useState(false);

    // Prediction grid state
    const [predictions, setPredictions] = useState<Map<string, PredictionEntry>>(new Map());

    // Audio (listen-only mode for user)
    const [audioState, setAudioState] = useState<DrumEngineState>('unsupported');
    const [audioOutputMode, setAudioOutputMode] = useState<DrumEngineOutputMode>('none');
    const [audioVolume, setAudioVolume] = useState(75);
    const [isListening, setIsListening] = useState(false);
    const audioEngineRef = useRef<ReturnType<typeof createWebAudioDrumEngine> | null>(null);
    const lastTriggeredStepRef = useRef<number | null>(null);

    const roomRef = useRef<RoomView | null>(null);
    roomRef.current = room;

    const currentRound = room?.currentRound ?? null;
    const bpm = currentRound?.bpm ?? 120;
    const playheadStep = usePlayhead(bpm, isListening);
    const isPredictionOpen = currentRound?.phase === 'prediction_open';

    const log = (message: string) => {
        startTransition(() => {
            setActivity((current) => [`${new Date().toLocaleTimeString()}  ${message}`, ...current].slice(0, 12));
        });
    };

    // Fetch room by code on mount
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

    // Audio engine setup
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

    // WebSocket events
    const handleSocketEvent = useEffectEvent((event: WsEventEnvelope) => {
        if (event.type === 'room.state.updated' && roomRef.current && roomRef.current.id === event.payload.roomId) {
            setRoom((current) => (current ? { ...current, currentRound: event.payload.currentRound } : current));
        }

        if (event.type === 'round.started' && roomRef.current && roomRef.current.id === event.payload.roomId) {
            setRoom((current) => (current ? { ...current, currentRound: event.payload.round } : current));
            setPredictions(new Map());
            setSettlement(null);
            log(`🎶 Round ${event.payload.round.index + 1} started! Get ready to predict.`);
        }

        if (event.type === 'round.commit.received') {
            log('🔐 Artist committed their pattern. Predictions are now OPEN!');
        }

        if (event.type === 'round.prediction.accepted') {
            log(`🎯 ${event.payload.predictionCount} predictions submitted`);
        }

        if (event.type === 'round.locked') {
            log('🔒 Predictions locked! No more bets.');
        }

        if (event.type === 'round.revealed') {
            log(`👁️ Pattern revealed! ${event.payload.commitVerified ? '✅ Verified fair' : '❌ Invalid commit'}`);
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
            log(`🏆 Round settled! ${event.payload.settlement.winningPredictions}/${event.payload.settlement.totalPredictions} predictions correct`);
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

    // Tap a pad to toggle prediction
    const togglePrediction = (trackId: TrackId, stepIndex: number) => {
        if (!isPredictionOpen) return;

        const key = `${trackId}-${stepIndex}`;
        setPredictions((current) => {
            const next = new Map(current);
            if (next.has(key)) {
                // Toggle willBeActive or remove
                const existing = next.get(key)!;
                if (existing.submitted) return current; // Can't change already submitted
                next.delete(key);
            } else {
                next.set(key, { trackId, stepIndex, willBeActive: true, submitted: false });
            }
            return next;
        });
    };

    // Submit all pending predictions
    const submitAllPredictions = () => {
        if (!room || !currentRound || !isPredictionOpen) return;

        const pending = Array.from(predictions.values()).filter((p) => !p.submitted);
        if (pending.length === 0) {
            setError('No predictions to submit. Tap pads to predict!');
            return;
        }

        void withBusy('submitting predictions', async () => {
            let submittedCount = 0;
            for (const pred of pending) {
                try {
                    await apiClient.predict(room.id, currentRound.id, {
                        userWallet,
                        guess: {
                            trackId: pred.trackId,
                            stepIndex: pred.stepIndex,
                            willBeActive: pred.willBeActive,
                        },
                    });
                    setPredictions((current) => {
                        const next = new Map(current);
                        const key = `${pred.trackId}-${pred.stepIndex}`;
                        next.set(key, { ...pred, submitted: true });
                        return next;
                    });
                    submittedCount++;
                } catch (err) {
                    log(`Failed to submit ${pred.trackId} step ${pred.stepIndex}: ${err instanceof Error ? err.message : 'error'}`);
                }
            }
            log(`✅ Submitted ${submittedCount} prediction(s)`);
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
            log('🔊 Audio enabled');
        }
    };

    // Phase labels for users
    const getPhaseInfo = () => {
        if (!currentRound) return { label: 'Waiting for artist to start...', color: 'default' as const, instruction: 'The artist hasn\'t started a round yet. Hang tight!' };
        switch (currentRound.phase) {
            case 'awaiting_commit':
                return { label: '⏳ Awaiting Commit', color: 'default' as const, instruction: 'The artist is creating their beat pattern...' };
            case 'prediction_open':
                return { label: '🎯 PREDICTIONS OPEN', color: 'accent' as const, instruction: 'TAP the pads to predict which beats will be active, then hit Submit!' };
            case 'locked':
                return { label: '🔒 Predictions Locked', color: 'danger' as const, instruction: 'No more predictions. Waiting for the reveal...' };
            case 'revealed':
                return { label: '👁️ Pattern Revealed', color: 'accent' as const, instruction: 'The pattern has been revealed! Waiting for settlement...' };
            case 'settled':
                return { label: '🏆 Round Complete', color: 'success' as const, instruction: 'Check the leaderboard to see if you won!' };
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
                    <p>Joining room <strong>{code}</strong>...</p>
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
                        <p className="landing-card-desc">The room may not have been created yet, or the code is incorrect.</p>
                        <Button onClick={() => navigate('/')}>← Back to Home</Button>
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
                    <p className="subtitle">Room: <strong>{room.code}</strong> • Predict the beats and earn rewards</p>
                </div>
                <div className="top-actions">
                    <Pill tone={wsStatus === 'open' ? 'success' : wsStatus === 'error' ? 'danger' : 'default'}>
                        {wsStatus === 'open' ? '● Live' : wsStatus}
                    </Pill>
                    <Button variant="ghost" onClick={() => navigate('/')}>← Home</Button>
                </div>
            </header>

            <main className="layout">
                <section className="main-column">
                    {/* Phase Banner */}
                    <div className={`phase-banner phase-banner--${currentRound?.phase ?? 'idle'}`}>
                        <Pill tone={phaseInfo.color}>{phaseInfo.label}</Pill>
                        <p className="phase-instruction">{phaseInfo.instruction}</p>
                        {currentRound && <span className="prediction-counter">{currentRound.predictionCount} predictions placed</span>}
                    </div>

                    {/* Prediction Grid */}
                    <Panel title="Prediction Grid" subtitle={isPredictionOpen ? '🎯 Tap pads to predict which beats will be ACTIVE' : 'Waiting for predictions to open...'}>
                        <div className="sequencer-grid" role="grid" aria-label="Prediction grid">
                            {TRACK_IDS.map((trackId) => (
                                <div key={trackId} className="track-row" role="row">
                                    <div className="track-label">{trackId.replace('_', ' ')}</div>
                                    <div className="pads">
                                        {Array.from({ length: 16 }, (_, stepIndex) => {
                                            const key = `${trackId}-${stepIndex}`;
                                            const prediction = predictions.get(key);
                                            const isPredicted = !!prediction;
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
                                                    title={
                                                        isSubmitted
                                                            ? `${trackId} step ${stepIndex + 1} — submitted ✓`
                                                            : isPredicted
                                                                ? `${trackId} step ${stepIndex + 1} — predicted (click to remove)`
                                                                : `${trackId} step ${stepIndex + 1} — tap to predict`
                                                    }
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {isPredictionOpen && (
                            <div className="prediction-actions">
                                <span className="prediction-count-badge">
                                    {Array.from(predictions.values()).filter(p => !p.submitted).length} pending •{' '}
                                    {Array.from(predictions.values()).filter(p => p.submitted).length} submitted
                                </span>
                                <Button
                                    onClick={submitAllPredictions}
                                    disabled={busyAction !== null || Array.from(predictions.values()).filter(p => !p.submitted).length === 0}
                                >
                                    Submit Predictions
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => setPredictions((current) => {
                                        const next = new Map<string, PredictionEntry>();
                                        for (const [k, v] of current) {
                                            if (v.submitted) next.set(k, v);
                                        }
                                        return next;
                                    })}
                                >
                                    Clear Pending
                                </Button>
                            </div>
                        )}
                        {busyAction ? <p className="status-line">Working: {busyAction}</p> : null}
                        {error ? <p className="error-line">{error}</p> : null}
                    </Panel>
                </section>

                <aside className="side-column">
                    {/* Wallet */}
                    <Panel title="Your Identity" subtitle="Set your wallet address">
                        <div className="form-stack">
                            <label>
                                <span>Wallet address</span>
                                <div className="wallet-row">
                                    <input
                                        value={userWallet}
                                        onChange={(e) => setUserWallet(e.target.value)}
                                        disabled={walletLocked}
                                        placeholder="Enter your Solana wallet address"
                                    />
                                    <Button variant="ghost" onClick={() => setWalletLocked(!walletLocked)}>
                                        {walletLocked ? '✏️' : '🔒'}
                                    </Button>
                                </div>
                            </label>
                        </div>
                    </Panel>

                    {/* Audio */}
                    <Panel title="Audio" subtitle="Listen to beats in real-time">
                        <div className="audio-controls">
                            <Button variant={isListening ? 'ghost' : 'primary'} onClick={isListening ? () => setIsListening(false) : () => void enableAudio()}>
                                {isListening ? '🔇 Mute' : '🔊 Enable Audio'}
                            </Button>
                            <Pill tone={audioState === 'ready' ? 'success' : 'default'}>
                                {audioState}{audioState === 'ready' ? ` (${audioOutputMode})` : ''}
                            </Pill>
                            {isListening && (
                                <label className="volume-control">
                                    <span>Vol</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={audioVolume}
                                        onChange={(e) => setAudioVolume(Number(e.target.value))}
                                    />
                                    <strong>{audioVolume}</strong>
                                </label>
                            )}
                        </div>
                    </Panel>

                    {/* Leaderboard */}
                    <Panel title="Leaderboard" subtitle="Round results and rewards">
                        {settlement ? (
                            <>
                                <div className="leaderboard-summary">
                                    <Pill tone={settlement.commitVerified ? 'success' : 'danger'}>
                                        {settlement.commitVerified ? '✅ Fair round' : '❌ Invalid commit'}
                                    </Pill>
                                    <span>{settlement.winningPredictions}/{settlement.totalPredictions} correct</span>
                                </div>
                                <ul className="leaderboard-list">
                                    {settlement.leaderboard.map((entry, i) => (
                                        <li key={entry.userWallet} className={entry.userWallet === userWallet ? 'leaderboard-you' : ''}>
                                            <div className="leaderboard-rank">#{i + 1}</div>
                                            <code>{entry.userWallet === userWallet ? '🏆 YOU' : `${entry.userWallet.slice(0, 6)}...${entry.userWallet.slice(-4)}`}</code>
                                            <span>{entry.correctPredictions} correct</span>
                                            <strong>{entry.rewardUnits} units</strong>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <>
                                <p className="placeholder-line">No results yet. Wait for the round to complete.</p>
                                <Button variant="ghost" onClick={refreshResults} disabled={!currentRound || busyAction !== null}>Refresh Results</Button>
                            </>
                        )}
                    </Panel>

                    {/* Activity Feed */}
                    <Panel title="Live Activity" subtitle="Real-time events">
                        {activity.length === 0 ? (
                            <p className="placeholder-line">Waiting for events...</p>
                        ) : (
                            <ul className="activity-list">
                                {activity.map((line, i) => (
                                    <li key={`${line}-${i}`}>{line}</li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </aside>
            </main>
        </div>
    );
}
