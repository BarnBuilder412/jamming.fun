# API Contracts (MVP V1)

## REST Endpoints (`/api/v1`)

- `POST /rooms`
  - Create a room/session
- `GET /rooms/:roomId`
  - Fetch room and current round status
- `POST /rooms/:roomId/rounds/start`
  - Start a new round (`awaiting_commit`)
- `POST /rooms/:roomId/rounds/:roundId/commit`
  - Submit commit hash and open predictions
- `POST /rooms/:roomId/rounds/:roundId/predictions`
  - Submit a user prediction (track + step + boolean guess)
- `POST /rooms/:roomId/rounds/:roundId/lock`
  - Lock predictions
- `POST /rooms/:roomId/rounds/:roundId/reveal`
  - Reveal pattern + nonce and verify commit hash
- `POST /rooms/:roomId/rounds/:roundId/settle`
  - Compute winners and reward ledger entries
- `GET /rooms/:roomId/rounds/:roundId/results`
  - Fetch settlement results and leaderboard

## Health / Integration Support

- `GET /healthz`
  - Health status, DB readiness, feature flags
- `GET /actions/join`
- `GET /actions/predict`
- `GET /actions/claim`
- `POST /actions/claim`
  - Blinks / claim stub flow + MagicBlock claim hook

## WebSocket (`/ws`)

### Client -> Server

- `room.subscribe` `{ roomId }`
- `room.unsubscribe` `{ roomId }`

### Server -> Client

- `room.state.updated`
- `round.started`
- `round.commit.received`
- `round.prediction.accepted`
- `round.locked`
- `round.revealed`
- `round.settled`
- `leaderboard.updated`
- `playhead.tick` (reserved for future realtime sync)

## Source of Truth

Contract schemas and TS types are defined in `packages/shared-types` using `zod`.
