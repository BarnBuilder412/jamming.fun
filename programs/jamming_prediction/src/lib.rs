#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod contexts;
pub mod error;
pub mod events;
pub mod helpers;
pub mod instructions;
pub mod params;
pub mod state;

use contexts::*;
use params::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod jamming_prediction {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        params: InitializeProtocolParams,
    ) -> Result<()> {
        instructions::initialize_protocol(ctx, params)
    }

    pub fn update_protocol_config(
        ctx: Context<UpdateProtocolConfig>,
        params: UpdateProtocolConfigParams,
    ) -> Result<()> {
        instructions::update_protocol_config(ctx, params)
    }

    pub fn set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
        instructions::set_protocol_paused(ctx, paused)
    }

    pub fn create_room(ctx: Context<CreateRoom>, params: CreateRoomParams) -> Result<()> {
        instructions::create_room(ctx, params)
    }

    pub fn start_round(ctx: Context<StartRound>, params: StartRoundParams) -> Result<()> {
        instructions::start_round(ctx, params)
    }

    pub fn commit_round(ctx: Context<CommitRound>, params: CommitRoundParams) -> Result<()> {
        instructions::commit_round(ctx, params)
    }

    pub fn place_prediction(
        ctx: Context<PlacePrediction>,
        params: PlacePredictionParams,
    ) -> Result<()> {
        instructions::place_prediction(ctx, params)
    }

    pub fn place_prediction_delegated(
        ctx: Context<PlacePredictionDelegated>,
        params: PlacePredictionParams,
    ) -> Result<()> {
        instructions::place_prediction_delegated(ctx, params)
    }

    pub fn lock_round(ctx: Context<MutateRound>) -> Result<()> {
        instructions::lock_round(ctx)
    }

    pub fn reveal_round(ctx: Context<MutateRound>, params: RevealRoundParams) -> Result<()> {
        instructions::reveal_round(ctx, params)
    }

    pub fn settle_position(
        ctx: Context<SettlePosition>,
        params: SettlePositionParams,
    ) -> Result<()> {
        instructions::settle_position(ctx, params)
    }

    pub fn settle_round(ctx: Context<SettleRound>) -> Result<()> {
        instructions::settle_round(ctx)
    }

    pub fn claim_artist_pending(
        ctx: Context<ClaimArtistPending>,
        amount_usdc_minor: u64,
    ) -> Result<()> {
        instructions::claim_artist_pending(ctx, amount_usdc_minor)
    }

    pub fn claim_platform_fee(
        ctx: Context<ClaimPlatformFee>,
        amount_usdc_minor: u64,
    ) -> Result<()> {
        instructions::claim_platform_fee(ctx, amount_usdc_minor)
    }

    pub fn claim_reward_token(ctx: Context<ClaimRewardToken>) -> Result<()> {
        instructions::claim_reward_token(ctx)
    }

    pub fn deploy_liquidity_reserve(
        ctx: Context<DeployLiquidityReserve>,
        amount_usdc_minor: u64,
    ) -> Result<()> {
        instructions::deploy_liquidity_reserve(ctx, amount_usdc_minor)
    }
}
