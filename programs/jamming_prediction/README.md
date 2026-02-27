# jamming_prediction (Anchor Scaffold)

This scaffold bootstraps the on-chain program for:

- USDC stake split per prediction (artist pending / platform fee / liquidity reserve / winner pot)
- Room and round lifecycle (commit -> prediction_open -> lock -> reveal -> settle)
- Prediction position accounts
- Rollover accounting for winner pot and liquidity reserve

## Current Status

- Instruction/account layout is implemented as a compile-oriented scaffold.
- Token transfers, vault ATA plumbing, and claim settlement flows are marked as TODO.
- Session-key validation and sponsored transaction policy checks are marked as TODO.

## Next Implementation Steps

1. Add USDC vault ATAs and CPI token transfer logic in `place_prediction`.
2. Add reveal hash verification against committed pattern hash.
3. Add settlement instruction that computes per-user USDC payouts and token rewards.
4. Add user and artist claim instructions.
5. Add launch threshold logic and DBC migration hooks.
