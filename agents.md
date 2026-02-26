# agents.md — jamming.fun (4-Person / Multi-Agent Build Plan)

## Rule 0 (Non-negotiable)

- **Build MVP V1 end-to-end first**
- **No MVP V2 work starts before V1 demo flow works**
- Mandatory in V1: **MagicBlock + Audius + Blinks**

## Product Scope (Concise)

### MVP V1 (Ship First)

- Drum machine UI (Hydrogen-inspired look, like reference image)
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

## Team Split (4 People)

### Agent 1 — Frontend + UX (Sequencer UI)

**Owns**

- Drum machine grid UI (dark theme, yellow/orange active pads)
- Artist controls (play/stop/BPM/basic controls)
- Prediction UI
- Leaderboard / round status UI
- Wallet connect UI integration support

**Deliverables**

- Playable sequencer screen
- Prediction panel
- Room/session UI polished for demo

**Definition of Done**

- UI matches reference style direction
- Artist and user can interact without backend mocks (when integrated)

### Agent 2 — Game Logic + Backend (Core V1)

**Owns**

- Room/session APIs
- Round lifecycle
- **Commit-Reveal verification**
- Prediction submission + lock
- Scoring + winner selection
- Track token reward distribution ledger (V1 can be points/token units)

**Deliverables**

- Working backend for round flow:
  `commit -> predict -> lock -> reveal -> verify -> settle`
- Leaderboard + reward results endpoints
- Basic persistence

**Definition of Done**

- End-to-end round settlement works reliably
- Invalid reveal / late prediction handled

### Agent 3 — Audio + Sequencer Behavior

**Owns**

- Hydrogen open-source sample usage (license check + sample prep)
- Drum playback engine
- Step scheduling / playhead behavior
- Pattern serialization format (shared with commit-reveal)
- Grid playback consistency for demo

**Deliverables**

- Kick/snare/hats/clap working
- Stable 16-step playback
- Deterministic pattern format for commit-reveal

**Definition of Done**

- Artist can create and hear beat live
- Same pattern always serializes the same way (important for hash)

### Agent 4 — Integrations (MagicBlock + Audius + Blinks)

**Owns**

- MagicBlock integration (mandatory game flow hook)
- Audius integration (mandatory visible feature)
- Blinks integration (mandatory action flow)
- Demo-friendly integration checks / fallback handling

**Deliverables**

- 1 real MagicBlock-backed flow in game lifecycle
- Audius-linked artist/session feature
- Blink action(s): Join / Predict / Claim (at least one fully working)
- Demo checklist for judges

**Definition of Done**

- All 3 integrations are visible + usable in demo
- Integration failures degrade gracefully (don’t break core flow)

## Shared Agreements (Important)

- **Single source of truth for pattern format** (used by UI, audio, backend, commit-reveal)
- **Keep V1 rewards simple** (points / track token units)
- **No gambling/legal complexity in V1 messaging** → frame as prediction game
- Daily merge to main/dev branch after smoke test

## Build Order (Execution Plan)

### Phase 1 — Foundation (parallel)

- Agent 1: UI shell + grid
- Agent 2: round APIs + room state skeleton
- Agent 3: playback engine + samples
- Agent 4: integration scaffolds (MagicBlock/Audius/Blinks)

### Phase 2 — Core V1 loop (highest priority)

- Integrate UI + audio + backend
- Implement commit-reveal
- Implement prediction + scoring + settlement

### Phase 3 — Mandatory integrations (must ship)

- Add MagicBlock flow
- Add Audius visible integration
- Add Blinks action flow

### Phase 4 — Demo hardening

- Fix bugs, polish UI, test full live demo
- Record backup demo path (in case integration hiccups)

## V1 Demo Success Criteria

A judge can see this flow live:

1. Artist creates beat on drum machine
2. Artist commits future segment
3. Users submit predictions
4. Artist reveals segment
5. System verifies commit-reveal
6. Winners get track token rewards
7. MagicBlock, Audius, and Blinks are visibly integrated

## MVP V2 (After V1 only)

- DRiP drops for top predictors / artists
- Loyalty (XP, streaks, tiers)
- Exchange Art integration (optional)
