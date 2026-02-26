# jamming.fun

Web-first monorepo for the MVP V1 live beat prediction game demo.

## V1 Scope (must ship first)

- Drum machine UI (Hydrogen-inspired)
- Commit-reveal for next segment
- User predictions + lock window
- Scoring + winner rewards (track token units / points)
- MagicBlock integration (mandatory)
- Audius integration (mandatory)
- Blinks integration (mandatory)

## Monorepo Layout

- `apps/web` - React/Vite demo client (sequencer + predictions + leaderboard)
- `apps/api` - Fastify API + WebSocket + Blinks endpoints
- `packages/shared-types` - Zod schemas + TS contracts
- `packages/pattern-core` - canonical pattern serialization + hashing
- `packages/game-core` - pure round/scoring/commit-reveal logic
- `packages/audio-engine` - playhead/audio scheduling abstractions
- `packages/integrations` - MagicBlock/Audius/Blinks adapters (stubs + interfaces)
- `packages/solana` - Devnet helpers/constants
- `packages/ui` - shared UI primitives

## Quickstart

1. Install dependencies

```bash
pnpm install
```

2. Start local Postgres (recommended for Prisma mirroring)

```bash
pnpm db:up
```

3. Generate Prisma client + migrate (first run)

```bash
pnpm --filter @jamming/api prisma generate --schema prisma/schema.prisma
pnpm db:migrate
```

4. Start web + API

```bash
pnpm dev
```

- Web: `http://localhost:5173`
- API health: `http://localhost:3001/healthz`

## Useful Commands

```bash
pnpm dev:web
pnpm dev:api
pnpm lint
pnpm typecheck
pnpm test
pnpm db:studio
pnpm db:down
```

## Notes

- API runs with in-memory state if Postgres is unavailable; Prisma mirroring is disabled in that mode.
- Solana defaults to `devnet`.
- Blinks action endpoints are served from `apps/api` in V1.
