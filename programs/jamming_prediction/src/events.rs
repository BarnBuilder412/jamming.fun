use anchor_lang::prelude::*;

#[event]
pub struct PredictionPlaced {
    pub room: Pubkey,
    pub round: Pubkey,
    pub user: Pubkey,
    pub stake_amount_usdc_minor: u64,
    pub delegated: bool,
}

#[event]
pub struct PositionSettled {
    pub room: Pubkey,
    pub round: Pubkey,
    pub position: Pubkey,
    pub user: Pubkey,
    pub was_correct: bool,
    pub payout_usdc_minor: u64,
}

#[event]
pub struct RoundSettled {
    pub room: Pubkey,
    pub round: Pubkey,
    pub winner_pot_rollover_usdc_minor: u64,
    pub liquidity_rollover_usdc_minor: u64,
}

#[event]
pub struct RewardTokenClaimed {
    pub room: Pubkey,
    pub round: Pubkey,
    pub position: Pubkey,
    pub user: Pubkey,
    pub reward_amount: u64,
}

#[event]
pub struct LiquidityReserveDeployed {
    pub room: Pubkey,
    pub amount_usdc_minor: u64,
    pub destination_quote_ata: Pubkey,
}
