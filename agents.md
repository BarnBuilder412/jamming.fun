# agents.md — jamming.fun (Implementation Status & Build Plan)

## Rule 0 (Non-negotiable)

- **Build MVP V1 end-to-end first**
- **No MVP V2 work starts before V1 demo flow works**
- Mandatory in V1: **MagicBlock + Audius + Blinks**

## Product Scope (Concise)

### MVP V1 (Ship First)

- Drum machine UI (Hydrogen-inspired look, dark theme)
- Artist live pattern creation
- **Commit-Reveal** for next segment
- User predictions
- Winner scoring + **track token rewards**
- MagicBlock integration (mandatory)
- Audius integration (mandatory)
- Blinks integration (mandatory)
- End-to-end demo flow

### MVP V2 (Only after V1 complete)

- DRiP integration
- Loyalty integration
- Exchange Art (if time)

---

## Current Architecture

### Monorepo (Turborepo + pnpm)

```
jamming.fun/
├── apps/
│   ├── api/          — Fastify REST + WebSocket backend
│   └── web/          — React + Vite frontend (SPA)
├── packages/
│   ├── audio-engine  — Web Audio API drum engine + playhead
│   ├── game-core     — Phase transitions, commit-reveal verification, settlement scoring
│   ├── pattern-core  — Pattern serialization, canonical hashing (SHA-256)
│   ├── shared-types  — Zod schemas + TS types (API, events, game, pattern)
│   ├── integrations  — Adapter interfaces + implementations (MagicBlock, Audius, Blinks)
│   │   └── scripts/  — Setup scripts (setup-soar.mjs for devnet provisioning)
│   ├── solana        — Solana cluster helpers, Blink URL builders, reward claim types
│   ├── ui            — Shared React components (Panel, Button, Pill) + design tokens
│   ├── config-eslint — Shared ESLint config
│   └── config-ts     — Shared TypeScript config
├── infra/            — Docker Compose (Postgres)
└── docs/             — architecture.md, api-contracts.md, demo-runbook.md
```

### Tech Stack

| Layer            | Technology                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| Frontend         | React 19, Vite, React Router, TypeScript, Privy (in-progress)          |
| Backend          | Fastify, Zod validation, WebSocket (native ws), TypeScript             |
| Audio            | Web Audio API (synthesis mode) + sample playback (Hydrogen-lite .wav)   |
| Persistence      | In-memory GameStore (primary) + Prisma/Postgres mirror (optional sync)  |
| Crypto/Hashing   | `@noble/hashes` (SHA-256 for commit-reveal)                            |
| Integrations     | MagicBlock SOAR (live on devnet), Audius SDK, Solana Actions (Blinks)   |
| Blockchain       | Solana Devnet (`@solana/web3.js`, `@solana/actions`)                    |
| Auth/Wallets     | Privy (`@privy-io/react-auth`) — in-progress, replacing hardcoded wallets |
| Build            | Turborepo, pnpm workspaces, dotenv-cli                                 |

---

## Team Split (4 People)

### Agent 1 — Frontend + UX (Sequencer UI) ✅ DONE

**Owns**

- Drum machine grid UI (dark theme, yellow/orange active pads)
- Artist controls (play/stop/BPM/basic controls)
- Prediction UI
- Leaderboard / round status UI
- Wallet connect UI integration support

**What Was Built**

- **`LandingPage.tsx`** — Hero landing with two cards (Artist / Listener), room code entry
- **`ArtistView.tsx`** (753 lines) — Full artist dashboard:
  - 5-track × 16-step sequencer grid with playhead visualization
  - Play/Stop toggle, BPM slider, volume control
  - Room creation, round lifecycle buttons (Start → Commit → Lock → Reveal → Settle)
  - Copy-able room code, event log panel
  - Auto-demo mode for judge walkthrough
  - Blink payload preview, claim top reward action
- **`UserView.tsx`** (475 lines) — Listener/predictor dashboard:
  - Live beat visualization from WebSocket events
  - Tap-to-predict grid with submission
  - Phase-aware UI (shows current round status)
  - Leaderboard + results panel
  - Audio enable toggle
- **`@jamming/ui`** — Shared components: `Panel`, `Button`, `Pill`, `jamThemeVars` design tokens
- **Hooks:** `usePlayhead` (interval-based step scheduling), `useRoomSocket` (WS connect/cleanup — uses ref pattern to prevent reconnect loops)
- **Lib:** `apiClient.ts` (typed REST client), `wsClient.ts` (WebSocket wrapper), `env.ts` (config)

> **Note:** Wallet addresses are currently hardcoded (DEFAULT_ARTIST_WALLET, DEFAULT_USER_WALLET). Privy integration is in-progress to replace these with real wallet connections.

**Definition of Done** — ✅ Met

- UI matches dark-theme reference style direction
- Artist and user can interact end-to-end when connected to backend

### Agent 2 — Game Logic + Backend (Core V1) ✅ DONE

**Owns**

- Room/session APIs
- Round lifecycle
- **Commit-Reveal verification**
- Prediction submission + lock
- Scoring + winner selection
- Track token reward distribution ledger (V1 = points/token units)

**What Was Built**

- **`apps/api`** — Fastify server with:
  - `routes/api.ts` — Full REST API:
    - `POST /rooms` — Create room (with artist wallet + optional Audius handle)
    - `GET /rooms/:roomId` — Get room details
    - `GET /rooms/code/:code` — Lookup by room code
    - `POST /rooms/:roomId/rounds` — Start new round
    - `POST /rooms/:roomId/rounds/:roundId/commit` — Submit commit hash
    - `POST /rooms/:roomId/rounds/:roundId/predict` — Submit prediction
    - `POST /rooms/:roomId/rounds/:roundId/lock` — Lock prediction window
    - `POST /rooms/:roomId/rounds/:roundId/reveal` — Reveal pattern + nonce
    - `POST /rooms/:roomId/rounds/:roundId/settle` — Settle round & calculate results
    - `GET /rooms/:roomId/rounds/:roundId/results` — Get settlement results
    - `GET /rooms/:roomId/state` — Full room state
    - `GET /integrations/status` — All integration statuses
  - `routes/actions.ts` — Solana Actions (Blinks) endpoints:
    - `GET/POST /actions/join`, `/actions/predict`, `/actions/claim`
    - CORS headers for cross-origin action discovery
  - `routes/health.ts` — Health check endpoint
  - `ws/roomHub.ts` — WebSocket room pub/sub hub
  - `services/gameStore.ts` — In-memory game store:
    - Room CRUD, round lifecycle, prediction storage
    - Phase-gated transitions (`awaiting_commit → prediction_open → locked → revealed → settled`)
    - Settlement with integration metadata
  - `services/prismaMirror.ts` — Optional Postgres mirror sync (rooms, rounds, predictions, settlements, artist profiles, reward ledger)
  - `services/runtime.ts` — Runtime service container (store, roomHub, prismaMirror, integrations)
  - `config.ts` — Zod-validated env config (all integration keys, feature flags, Solana cluster)
  - `app.test.ts` — Integration tests for full round lifecycle
- **`@jamming/game-core`** — Core game logic:
  - `canTransitionPhase` / `assertTransitionPhase` — Phase state machine
  - `verifyCommitReveal` — SHA-256 hash verification
  - `evaluatePredictions` — Per-prediction correct/incorrect + reward units
  - `settleRound` — Full settlement: leaderboard, rewards, commit verification
- **`@jamming/shared-types`** — Zod schemas + TypeScript types:
  - `api.ts` — Request/response schemas (room, round, commit, predict, reveal, settle)
  - `game.ts` — `RoundPhase`, `SettlementResult`, `RewardLedgerEntry`, `LeaderboardEntry`
  - `pattern.ts` — `PatternV1`, `StepState`, `TrackId`, `TRACK_IDS`, `STEPS_PER_PATTERN_V1`
  - `events.ts` — WebSocket event envelope types

**Definition of Done** — ✅ Met

- End-to-end round settlement works reliably
- Invalid reveal / late prediction handled (phase guard checks)

### Agent 3 — Audio + Sequencer Behavior ✅ DONE

**Owns**

- Hydrogen open-source sample usage (license check + sample prep)
- Drum playback engine
- Step scheduling / playhead behavior
- Pattern serialization format (shared with commit-reveal)
- Grid playback consistency for demo

**What Was Built**

- **`@jamming/audio-engine`** (513 lines) — Full drum engine:
  - **Dual output mode:** synthesized audio (Web Audio API oscillators + noise buffers) OR sample-based playback (Hydrogen-lite .wav files)
  - Per-track synthesis: `triggerKick`, `triggerSnare`, `triggerHat`, `triggerClap` with ADSR envelopes
  - Sample loading via `fetchAndDecodeSample` with configurable base URL + manifest
  - Per-track gain normalization (`TRACK_SAMPLE_GAIN` map)
  - `DrumEngine` interface: `unlock()`, `setMasterGain()`, `triggerTrack()`, `triggerStep()`, `dispose()`
  - `PlayheadController`: `start()`, `stop()`, `setBpm()`, `subscribe()` — interval-based 16-step scheduling
  - Helper: `getActiveStepsForTrack()`
- **`@jamming/pattern-core`** — Pattern serialization & hashing:
  - `createEmptyPatternV1(bpm)` — 5-track × 16-step blank pattern
  - `normalizePatternV1(input)` — Canonical normalization (ordered tracks, clamped velocity)
  - `serializePatternCanonical(input)` — Deterministic string format: `pattern:v1;len:16;bpm:120;tracks:kick[0.100,1.100,...]|snare[...]|...`
  - `buildCommitInput(params)` — Commit input string: `commit_input:v1|round:{id}|nonce:{nonce}|{serialized_pattern}`
  - `hashCommitInput(input)` / `hashPatternCommitInput(params)` — SHA-256 hex digest

**Definition of Done** — ✅ Met

- Artist can create and hear beat live (both synthesis + sample modes)
- Same pattern always serializes the same way (deterministic canonical hashing)

### Agent 4 — Integrations (MagicBlock + Audius + Blinks) ✅ DONE

**Owns**

- MagicBlock integration (mandatory game flow hook)
- Audius integration (mandatory visible feature)
- Blinks integration (mandatory action flow)
- Demo-friendly integration checks / fallback handling

**What Was Built**

- **`@jamming/integrations`** — Adapter pattern with real + noop (mock/graceful-degradation) variants:
  - **MagicBlock SOAR adapter** (`magicblockSoar.ts`, 8.6 KB):
    - `recordRoundSettlement()` — Posts settlement to SOAR leaderboard
    - `claimReward()` — Claims reward via SOAR achievement
    - Graceful fallback with detailed status reporting
  - **Audius SDK adapter** (`audiusSdk.ts`, 5.3 KB):
    - `resolveArtist()` — Resolves artist profile by wallet or handle
    - `publishSessionMetadata()` — Publishes session metadata to Audius
    - Read-only + signed write modes
  - **Blinks Actions adapter** (`blinksActions.ts`, 7.9 KB):
    - `buildJoinAction()` / `buildPredictAction()` / `buildClaimAction()` — GET action metadata (Solana Actions spec)
    - `buildJoinPostResponse()` / `buildPredictPostResponse()` / `buildClaimPostResponse()` — POST transaction builders
    - CORS headers for cross-origin discovery
  - **Noop adapters** (`noop.ts`, 10.3 KB) — Feature-flag-gated mock implementations for testing / when integrations are unavailable
  - **Type system** (`types.ts`) — `MagicBlockAdapter`, `AudiusAdapter`, `BlinksAdapter` interfaces; `IntegrationStatus`, `IntegrationMode`, config types
  - **Setup script** (`scripts/setup-soar.mjs`) — Provisions SOAR Game, Leaderboard, and Achievement on-chain
- **`@jamming/solana`** — Utilities:
  - `getSolanaRpcUrl()`, `createBlinkActionUrls()`, `RewardClaimTicket` type
- **Feature flags** — `ENABLE_MAGICBLOCK`, `ENABLE_AUDIUS`, `ENABLE_BLINKS` env vars
- **Integration status endpoint** — `GET /integrations/status` returns live status of all 3 integrations
- **Test/production toggle** — `NODE_ENV=test` automatically uses noop adapters

**MagicBlock SOAR — Live on Devnet** ✅

SOAR resources have been provisioned on Solana devnet:

| Resource     | Pubkey                                             |
| ------------ | -------------------------------------------------- |
| Game         | `4VXRF7EPmb5vvf6HPcmP61yPzeLgkzV7TgTKs7nQRiAn`    |
| Leaderboard  | `4QjHJ2dkGMmZzD6mxVaPMXPHHZRHs56hKab9xwuksRJA`    |
| Achievement  | `GqxoososUzDrGVRhZBX8ASSem8iQi2DaN58vnpYPz3iN`    |
| Authority    | `2Ka2bv1NytmBikBseaMt7LgzpBrXxyaTZ5b8oLiH5psj`    |

- All `.env` keys are configured (RPC URL, authority key, game/leaderboard/achievement pubkeys)
- `GET /healthz` reports `"mode": "real"`, `"ready": true` when dotenv loads correctly
- Settlement transactions post real scores to the on-chain SOAR leaderboard
- View activity on [Solana Explorer (devnet)](https://explorer.solana.com/address/2Ka2bv1NytmBikBseaMt7LgzpBrXxyaTZ5b8oLiH5psj?cluster=devnet)

**How SOAR transactions work (no user signing needed):**
- The server signs all SOAR transactions using the authority wallet private key
- Users only provide their public wallet address (currently hardcoded, Privy integration in-progress)
- On settlement: `registerPlayerEntryForLeaderBoard()` + `submitScoreToLeaderBoard()` for each winner
- On claim: `claimFtReward()` via the achievement pubkey

**Definition of Done** — ✅ Met

- All 3 integrations are visible + usable in demo
- Integration failures degrade gracefully (noop fallback, don't break core flow)
- MagicBlock SOAR is live on devnet with real on-chain transactions

---

## Shared Agreements (Important)

- **Single source of truth for pattern format** → `@jamming/shared-types` `PatternV1` (used by UI, audio, backend, commit-reveal)
- **Keep V1 rewards simple** → points / track token units (10 units per correct prediction)
- **No gambling/legal complexity in V1 messaging** → framed as prediction game
- **Canonical pattern serialization** → `@jamming/pattern-core` ensures deterministic hashing
- **WebSocket for real-time sync** → `RoomHub` broadcasts room state changes to all connected clients

---

## Build Order (Completed)

### Phase 1 — Foundation ✅

- Agent 1: UI shell + grid → `LandingPage`, `ArtistView`, `UserView` scaffolded
- Agent 2: Round APIs + room state skeleton → `GameStore`, REST routes
- Agent 3: Playback engine + samples → `DrumEngine`, `PlayheadController`
- Agent 4: Integration scaffolds → Adapter interfaces + noop implementations

### Phase 2 — Core V1 Loop ✅

- Integrated UI + audio + backend via `apiClient` + `useRoomSocket`
- Implemented commit-reveal via `@jamming/pattern-core` + `@jamming/game-core`
- Implemented prediction + scoring + settlement in `GameStore.settleRound()`

### Phase 3 — Mandatory Integrations ✅

- MagicBlock SOAR flow (leaderboard + claims)
- Audius artist resolution + session metadata
- Blinks action endpoints (Join / Predict / Claim) with Solana Actions spec compliance

### Phase 4 — Demo Hardening & Wallet Integration (In Progress)

- Auto-demo mode (`runAutoDemoRound()`) in ArtistView for judge walkthroughs
- Demo runbook available at `docs/demo-runbook.md`
- ✅ MagicBlock SOAR provisioned on devnet (Game + Leaderboard + Achievement)
- ✅ `.env` fully configured with all SOAR keys
- ✅ Fixed WebSocket reconnection loop (`useRoomSocket` ref pattern)
- ✅ Added `dotenv-cli` to dev script for proper `.env` loading
- 🔧 Privy integration in-progress (replacing hardcoded wallet addresses)
- Record backup demo path (in case integration hiccups)

---

## V1 Demo Success Criteria

A judge can see this flow live:

1. ✅ Artist creates beat on drum machine (5-track × 16-step grid with live audio)
2. ✅ Artist commits future segment (SHA-256 hash of canonical pattern + nonce)
3. ✅ Users submit predictions (per-step active/inactive guesses)
4. ✅ Artist reveals segment (pattern + nonce sent, hash verified server-side)
5. ✅ System verifies commit-reveal (`game-core.verifyCommitReveal()`)
6. ✅ Winners get track token rewards (10 units per correct prediction, leaderboard sorted)
7. ✅ MagicBlock, Audius, and Blinks are visibly integrated (adapter + endpoints + UI)

---

## MVP V2 (After V1 only)

- DRiP drops for top predictors / artists
- Loyalty (XP, streaks, tiers)
- Exchange Art integration (optional)

---

## Recent Bug Fixes & Infra Changes

| Date       | Change                                                    | Files Modified                              |
| ---------- | --------------------------------------------------------- | ------------------------------------------- |
| 2026-02-27 | Fixed WebSocket reconnect loop (ref pattern)              | `apps/web/src/hooks/useRoomSocket.ts`       |
| 2026-02-27 | Added dotenv to dev script for env loading                | `package.json` (root)                       |
| 2026-02-27 | SOAR setup script created                                 | `packages/integrations/scripts/setup-soar.mjs`, `packages/integrations/package.json` |
| 2026-02-27 | MagicBlock SOAR provisioned on devnet                     | `.env` (SOAR pubkeys filled in)             |
| 2026-02-27 | Privy integration started                                 | `apps/web/package.json` (dependency added)  |
