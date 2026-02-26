# Architecture (MVP V1)

## Overview

- `apps/web` drives the sequencer UI, prediction UI, round controls, and judge demo surface.
- `apps/api` owns the V1 round lifecycle and serves REST + WebSocket + Blinks endpoints.
- Shared contracts live in `packages/shared-types`.
- Commit-reveal serialization/hashing lives in `packages/pattern-core`.
- Pure game logic (verification/scoring/settlement) lives in `packages/game-core`.

## Runtime Flow

1. Artist starts a round (`awaiting_commit`).
2. Artist submits commit hash for the next segment (`prediction_open`).
3. Users submit predictions while window is open.
4. Predictions lock (`locked`).
5. Artist reveals pattern + nonce (`revealed`), backend verifies commit.
6. Backend settles results (`settled`), emits leaderboard, writes reward ledger entries.

## Package Boundaries (enforced)

- `shared-types` is the only source for API/WS payload contracts.
- `pattern-core` is the only source for pattern canonicalization + hashing.
- `game-core` is pure logic only (no DB/network/runtime side effects).
- `apps/api` orchestrates validation + state + persistence + integrations.

## Agent Ownership Map

- Agent 1 (Frontend/UX): `apps/web`, `packages/ui`
- Agent 2 (Backend/Game): `apps/api`, `packages/game-core`, Prisma schema/migrations
- Agent 3 (Audio/Sequencer): `packages/audio-engine`, sequencer integration points in `apps/web`, shared work on `packages/pattern-core`
- Agent 4 (Integrations): `packages/integrations`, `packages/solana`, integration callsites in `apps/api`

## Persistence Strategy (V1)

- Primary runtime state is in-memory for fast local iteration and DB-optional demos.
- When Postgres is available, API mirrors room/round/prediction/settlement/reward data into Prisma models.
- This allows demos to continue if DB connectivity is flaky while still preserving a DB-backed path.
