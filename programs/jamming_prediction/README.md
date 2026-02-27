# jamming_prediction (Anchor Program)

This program currently implements:

- USDC stake split per prediction (artist pending / platform fee / liquidity reserve / winner pot)
- Room and round lifecycle (commit -> prediction_open -> lock -> reveal -> settle)
- Prediction position accounts (including per-position settle state)
- Rollover accounting for winner pot and liquidity reserve
- Threshold fallback: if liquidity reserve < `min_launch_quote_usdc_minor`, 50% is moved to artist pending vault and 50% rolls forward
- Artist/platform vault claim instructions
- Protocol admin config updates and pause toggle

## Current Status

- Vault ATA transfer CPI is live in `place_prediction`.
- Round settlement is split into:
  1. `settle_position` (marks each prediction and pays winner USDC from winner vault)
  2. `settle_round` (final rollover + liquidity threshold fallback)
- Artist and platform claim paths are implemented.
- `reveal_round` now verifies preimage on-chain:
  `hashv(["jamming_prediction:round_reveal:v1", outcome_bitmap, salt]) == commit_hash`.
- `settle_position` now derives correctness on-chain from revealed bitmap (no trusted `is_correct` input).
- Session/delegated signer policy + spend-cap checks are implemented.
- Reward-token claim flow is implemented.
- Liquidity deployment hook from settlement is implemented.

## Reveal Instruction Params

- `RevealRoundParams`:
  - `outcome_bitmap: [u8; 36]` (9 tracks x 32 steps bitset)
  - `salt: [u8; 32]`
- `SettlePositionParams`:
  - `winner_payout_usdc_minor: u64`

## Next Implementation Steps

1. Expand Anchor coverage (happy path + invalid reveal + all-wrong + low-liquidity threshold + delegated/session failure cases).
2. Add integration tests for reward-token claim and liquidity deployment hook execution boundaries.
3. Finalize API/client rollout sequencing under feature flags and observability checks.
