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
│   └── jamming_prediction/   Anchor contract scaffold (in progress)
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

`programs/jamming_prediction` is scaffold-level.
Remaining critical work:

- USDC vault ATA creation + transfer CPI in `place_prediction`.
- Session/delegated signer + spend cap validation.
- Full settle logic on-chain (winners, payouts, reward accounting).
- Claim instructions (user + artist + protocol routing).
- End-to-end Anchor tests for all flows and edge cases.

### 2) True Signless UX

- Current flow still relies on wallet-driven transaction paths.
- Need session-key/sponsored transaction design finalized and wired.

### 3) Integration Hardening

- Real-mode credential validation and clear fallback behavior per provider.
- SOAR setup/runbook should be tested in a clean environment.
- Privy dependency is present; full auth/wallet provider wiring still pending.

### 4) Liquidity/Bonding-Curve Execution Layer

- Economics are implemented in backend settlement math.
- On-chain liquidity/pool/bonding-curve execution is not completed in contract path.

## Current Execution Backlog (Ordered)

1. Finish Anchor contract transfer + settle + claim instructions.
2. Add comprehensive contract tests (happy path + invalid reveal + all-wrong + low-volume).
3. Route API to contract-backed settlement/claim path under feature flag.
4. Complete signless/session wallet flow (Privy or chosen sponsor model).
5. Run full demo validation checklist and freeze V1.

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
