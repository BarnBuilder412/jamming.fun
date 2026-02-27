use anchor_lang::prelude::*;

use crate::constants::REVEAL_BITMAP_BYTES;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RoundPhase {
    AwaitingCommit,
    PredictionOpen,
    Locked,
    Revealed,
    Settled,
}

#[account]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub quote_mint: Pubkey,
    pub platform_fee_bps: u16,
    pub artist_pending_bps: u16,
    pub liquidity_reserve_bps: u16,
    pub winner_pot_bps: u16,
    pub min_stake_usdc_minor: u64,
    pub max_stake_usdc_minor: u64,
    pub min_launch_quote_usdc_minor: u64,
    pub prediction_delegate: Pubkey,
    pub delegate_max_stake_usdc_minor: u64,
    pub paused: bool,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 2 + 2 + 2 + 8 + 8 + 8 + 32 + 8 + 1 + 1;
}

#[account]
pub struct Room {
    pub protocol: Pubkey,
    pub artist: Pubkey,
    pub room_code: [u8; 8],
    pub room_token_symbol: [u8; 12],
    pub reward_mint: Pubkey,
    pub next_round_index: u64,
    pub pending_winner_rollover_usdc_minor: u64,
    pub pending_liquidity_rollover_usdc_minor: u64,
    pub bump: u8,
}

impl Room {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 12 + 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Round {
    pub room: Pubkey,
    pub index: u64,
    pub phase: RoundPhase,
    pub bpm: u16,
    pub commit_hash: [u8; 32],
    pub total_predictions: u32,
    pub total_staked_usdc_minor: u64,
    pub artist_pending_usdc_minor: u64,
    pub platform_fee_usdc_minor: u64,
    pub liquidity_reserve_usdc_minor: u64,
    pub winner_pot_usdc_minor: u64,
    pub winner_pot_distributed_usdc_minor: u64,
    pub settled_positions: u32,
    pub winning_positions: u32,
    pub delegated_spent_usdc_minor: u64,
    pub outcome_bitmap: [u8; REVEAL_BITMAP_BYTES],
    pub reveal_verified: bool,
    pub bump: u8,
}

impl Round {
    pub const LEN: usize = 8
        + 32
        + 8
        + 1
        + 2
        + 32
        + 4
        + 8
        + 8
        + 8
        + 8
        + 8
        + 8
        + 4
        + 4
        + 8
        + REVEAL_BITMAP_BYTES
        + 1
        + 1;
}

#[account]
pub struct PredictionPosition {
    pub round: Pubkey,
    pub user: Pubkey,
    pub track_index: u8,
    pub step_index: u8,
    pub will_be_active: bool,
    pub stake_amount_usdc_minor: u64,
    pub was_correct: bool,
    pub usdc_payout_usdc_minor: u64,
    pub settled: bool,
    pub claimed: bool,
    pub bump: u8,
}

impl PredictionPosition {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 1 + 1 + 8 + 1 + 8 + 1 + 1 + 1;
}
