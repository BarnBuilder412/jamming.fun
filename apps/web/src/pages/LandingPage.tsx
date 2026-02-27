import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Panel, jamThemeVars } from '@jamming/ui';

export function LandingPage() {
    const navigate = useNavigate();
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleJoinRoom = () => {
        const code = roomCode.trim().toUpperCase();
        if (!code) {
            setError('Please enter a room code');
            return;
        }
        setError(null);
        void navigate(`/room/${code}`);
    };

    return (
        <div className="app-shell" style={jamThemeVars}>
            <div className="app-background" aria-hidden="true" />
            <div className="landing-container">
                <div className="landing-hero">
                    <p className="eyebrow">jamming.fun</p>
                    <h1 className="landing-title">
                        Live Beat
                        <br />
                        <span className="landing-highlight">Prediction Arena</span>
                    </h1>
                    <p className="landing-subtitle">
                        Artists create beats in real-time. Listeners predict the next pattern.
                        Winners earn USDC payouts plus room token rewards on Solana.
                    </p>
                </div>

                <div className="landing-cards">
                    <Panel title="🎹 I'm an Artist" subtitle="Create beats and host prediction rounds">
                        <p className="landing-card-desc">
                            Open the drum machine, create your beat pattern, and let listeners predict your next move.
                            You control the round lifecycle — commit, lock, reveal, and settle.
                        </p>
                        <div className="landing-card-features">
                            <span>✦ 9-lane sequencer + 16/32 grid toggle</span>
                            <span>✦ Real-time audio synthesis + samples</span>
                            <span>✦ Cryptographic commit-reveal</span>
                            <span>✦ Shareable room code</span>
                        </div>
                        <Button onClick={() => { void navigate('/artist'); }}>Create a Room</Button>
                    </Panel>

                    <Panel title="🎯 I'm a Listener" subtitle="Join a room and predict the beats">
                        <p className="landing-card-desc">
                            Enter the room code shared by an artist. Watch the beats in real-time and predict which steps will
                            be active. Earn instant USDC winner-pot payouts for correct predictions.
                        </p>
                        <div className="landing-card-features">
                            <span>✦ Live beat visualization</span>
                            <span>✦ Tap-to-predict grid</span>
                            <span>✦ Real-time leaderboard</span>
                            <span>✦ USDC + room token rewards</span>
                        </div>
                        <div className="join-form">
                            <input
                                className="room-code-input"
                                type="text"
                                placeholder="Enter room code (e.g. ABCD)"
                                value={roomCode}
                                onChange={(e) => {
                                    setRoomCode(e.target.value.toUpperCase());
                                    setError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleJoinRoom();
                                }}
                                maxLength={8}
                            />
                            <Button onClick={handleJoinRoom}>Join Room</Button>
                        </div>
                        {error && <p className="error-line">{error}</p>}
                    </Panel>
                </div>

                <p className="landing-footer">
                    Built on Solana Devnet • Commit-reveal fairness • MagicBlock • Audius • Blinks
                </p>
            </div>
        </div>
    );
}
