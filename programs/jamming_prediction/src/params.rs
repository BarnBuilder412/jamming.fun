use anchor_lang::prelude::*;

use crate::constants::REVEAL_BITMAP_BYTES;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeProtocolParams {
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
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateProtocolConfigParams {
    pub platform_fee_bps: u16,
    pub artist_pending_bps: u16,
    pub liquidity_reserve_bps: u16,
    pub winner_pot_bps: u16,
    pub min_stake_usdc_minor: u64,
    pub max_stake_usdc_minor: u64,
    pub min_launch_quote_usdc_minor: u64,
    pub prediction_delegate: Pubkey,
    pub delegate_max_stake_usdc_minor: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateRoomParams {
    pub room_code: [u8; 8],
    pub room_token_symbol: [u8; 12],
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct StartRoundParams {
    pub bpm: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CommitRoundParams {
    pub commit_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PlacePredictionParams {
    pub track_index: u8,
    pub step_index: u8,
    pub will_be_active: bool,
    pub stake_amount_usdc_minor: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RevealRoundParams {
    pub outcome_bitmap: [u8; REVEAL_BITMAP_BYTES],
    pub salt: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SettlePositionParams {
    pub winner_payout_usdc_minor: u64,
}
