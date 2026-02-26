# Demo Runbook (MVP V1)

## Primary Live Demo Path

1. Start services (`pnpm db:up`, `pnpm dev`).
2. Open `apps/web` in browser (`http://localhost:5173`).
3. Click `Create Room`.
4. Click `Start Round`.
5. Toggle a few sequencer pads to make a visible next segment.
6. Click `Commit`.
7. Enter a prediction (track + step) and click `Submit Prediction`.
8. Click `Lock`.
9. Click `Reveal`.
10. Click `Settle`.
11. Show leaderboard + reward units.
12. Show integrations panel:
   - Solana devnet / RPC
   - MagicBlock/Audius/Blinks enabled flags
   - Blinks Join/Predict/Claim links

## Judge Callouts

- Commit-reveal verified before rewards are issued.
- Scoring is deterministic and auditable from revealed pattern + predictions.
- V1 rewards are track token units / points (simple, demo-safe).
- Messaging is framed as a prediction game (not gambling).

## Fallback Paths

- If Postgres is down:
  - API continues with in-memory state; explain Prisma mirroring is optional for local demo.
- If integration endpoints are flaky:
  - Show enabled flags + action endpoints + adapter fallback behavior (core round loop still works).
- If WebSocket disconnects:
  - Use `Refresh Results` and room fetch paths via REST.
