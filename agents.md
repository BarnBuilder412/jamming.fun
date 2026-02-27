# agents.md — jamming.fun (Current Execution State)

Last updated: 2026-02-27

## Rule 0

- Ship MVP V1 end-to-end first.
- No V2 work before V1 demo flow is stable.
- Mandatory in V1: MagicBlock + Audius + Blinks.

## Repository Shape

```
jamming.fun/
├── apps/
│   ├── api/          Fastify REST + WS backend
│   └── web/          React + Vite frontend
├── packages/
│   ├── audio-engine
│   ├── game-core
│   ├── pattern-core
│   ├── shared-types
│   ├── integrations
│   │   └── scripts/setup-soar.mjs
│   ├── solana
│   └── ui
├── programs/
│   └── jamming_prediction/   Anchor contract (core flow implemented)
└── infra/
```

## What Is Implemented (Working)

### Core Game + API

- Room lifecycle: create room, start round, commit, predict, lock, reveal, settle.
- Commit-reveal verification via canonical pattern hashing.
- Stake-based prediction flow with USDC minor units.
- Settlement includes:
  - artist pending share
  - platform fee
  - liquidity reserve
  - winner pot distribution (pro-rata by correct stake)
  - rollover accounting
- Batch prediction endpoint for better user UX.

### Frontend

- Artist and Listener apps are both operational.
- 9-lane sequencer: `kick/snare/hat_closed/hat_open/clap/tom_low/tom_high/rim/keyboard`.
- Grid size toggle: 16 or 32 steps.
- Responsive pad width now uses selected grid size.
- Track visualization includes icon + name badges.
- Wallet hook with injected Solana wallet support.

### Audio

- WebAudio drum/synth engine with per-lane synthesized voices.
- Sample kit loading for drum lanes.
- Fixed false “samples unavailable” state when synth-only lanes play.

### Integrations

- MagicBlock/Audius/Blinks adapter structure is implemented.
- Health and integration status endpoints are exposed.
- Blinks action routes implemented (`join/predict/claim`).
- SOAR setup utility script added: `pnpm --filter @jamming/integrations run setup-soar`.
- Contract-program API feature flag added: `ENABLE_CONTRACT_PROGRAM`.
- Contract-backed API paths added:
  - `POST /api/v1/rooms/:roomId/rounds/:roundId/rewards/claim-contract`
  - `POST /api/v1/rooms/:roomId/liquidity/deploy`

### Program Build Status

- `programs/jamming_prediction` compiles successfully with `cargo check`.
- Recent compile blockers were fixed:
  - signer seed lifetime issues in CPI helpers (`E0716`)
  - mutable/immutable borrow conflict in `settle_round` (`E0502`)
- `unexpected_cfgs` macro noise is suppressed at crate root for cleaner output.
- One non-blocking warning remains from Anchor macro internals:
  - deprecated `AccountInfo::realloc` warning triggered via `#[program]`.

## Changes Integrated from `origin/magicblock`

Integrated from commit `107f920` (excluding old branch `agents.md` content):

- `apps/web/src/hooks/useRoomSocket.ts`
  - Fixed reconnect churn by using `useRef` for event callback.
- `package.json`
  - Root `dev` script now loads `.env` with `dotenv`.
- `packages/integrations/package.json`
  - Added `setup-soar` script.
- `packages/integrations/scripts/setup-soar.mjs`
  - Added SOAR provisioning helper.
- `apps/web/package.json`
  - Added `@privy-io/react-auth` dependency (not fully wired in UI yet).

## Known Gaps (Not Yet Production-Complete)

### 1) On-chain Contract Completion (Highest Priority)

`programs/jamming_prediction` now includes:

- USDC split transfer CPI in `place_prediction`.
- Per-position settle instruction (`settle_position`) with winner vault payouts.
- On-chain reveal verification in `reveal_round` (`hash(domain || reveal || salt) == commit_hash`).
- On-chain correctness derivation in `settle_position` from revealed outcome bitmap (no trusted `is_correct` input).
- Round finalization with low-liquidity threshold fallback (50% to artist pending, 50% rollover).
- Claim instructions for artist pending and platform fee vaults.
- Protocol admin config update + pause toggle.
- Delegated/session prediction path with protocol-configured signer + spend cap.
- Reward-token claim path and liquidity deployment hook.
- Modularized contract layout (`constants.rs`, `error.rs`, `state.rs`, `params.rs`, `contexts.rs`, `helpers.rs`, `events.rs`, `instructions/`).

Remaining critical work:

- Broader end-to-end Anchor tests for economic and failure edge cases.
- End-to-end execution against real on-chain program IDs (API currently routes through adapter-backed contract flow/fallback).

### 2) True Signless UX

- Delegated/session signer checks and spend-cap validation are now in contract scope.
- Remaining work is client/session lifecycle hardening (issuance, refresh/revoke, fallback paths).

### 3) Integration Hardening

- Real-mode credential validation and clear fallback behavior per provider.
- SOAR setup/runbook should be tested in a clean environment.
- Privy dependency is present; full auth/wallet provider wiring still pending.

### 4) Liquidity/Bonding-Curve Execution Layer

- Liquidity deployment hook from contract settlement is now implemented.
- Remaining work is deployment orchestration + idempotency/monitoring around external pool execution.

## Current Execution Backlog (Ordered)

1. Expand Anchor tests (happy path + invalid reveal + all-wrong + low-volume + threshold fallback + delegated/session checks + claim/deploy paths).
2. Run security-focused test pass on modular program paths (authority checks, replay/double-claim resistance, arithmetic edges).
3. Connect adapter-backed contract routes to real deployed program IDs + transaction builders (remove fallback-only behavior).
4. Harden signless/session lifecycle in client/integration layer (sponsor failures, expiry, revoke, retries).
5. Validate integration runbooks (MagicBlock/Audius/Blinks/SOAR) in clean env and document degraded modes.
6. Run full demo checklist and freeze V1.

## Operational Commands

### Database

- `pnpm db:up`
- `pnpm db:migrate`
- `pnpm db:studio`

### Dev

- `pnpm dev`
- `pnpm dev:api`
- `pnpm dev:web`

### Validation

- `pnpm --filter @jamming/web typecheck`
- `pnpm --filter @jamming/web lint`
- `pnpm --filter @jamming/audio-engine typecheck`
- `pnpm --filter @jamming/api test`
- `pnpm --filter @jamming/game-core test`

## Acceptance Definition for V1 Demo

V1 is considered complete only when:

- Artist and user complete one full round live (commit → predict → reveal → settle).
- Winner receives immediate USDC winner-pot payout accounting in settlement state.
- Blinks endpoints are usable and return valid action payloads.
- MagicBlock/Audius integrations run in real mode (or clearly documented degraded fallback).
- No reconnect loops, no stale audio-state warnings, no critical runtime errors.
