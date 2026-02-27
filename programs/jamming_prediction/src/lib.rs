use anchor_lang::prelude::*;

pub const ARTIST_PENDING_BPS: u16 = 5_000;
pub const PLATFORM_FEE_BPS: u16 = 500;
pub const LIQUIDITY_RESERVE_BPS: u16 = 1_500;
pub const WINNER_POT_BPS: u16 = 3_000;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod jamming_prediction {
    use super::*;

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, params: InitializeProtocolParams) -> Result<()> {
        require!(
            params.platform_fee_bps as u32 + params.artist_pending_bps as u32 + params.liquidity_reserve_bps as u32 + params.winner_pot_bps as u32 == 10_000,
            ErrorCode::InvalidFeeSplit
        );
        require!(params.max_stake_usdc_minor >= params.min_stake_usdc_minor, ErrorCode::InvalidStakeRange);

        let protocol = &mut ctx.accounts.protocol;
        protocol.admin = ctx.accounts.admin.key();
        protocol.quote_mint = params.quote_mint;
        protocol.platform_fee_bps = params.platform_fee_bps;
        protocol.artist_pending_bps = params.artist_pending_bps;
        protocol.liquidity_reserve_bps = params.liquidity_reserve_bps;
        protocol.winner_pot_bps = params.winner_pot_bps;
        protocol.min_stake_usdc_minor = params.min_stake_usdc_minor;
        protocol.max_stake_usdc_minor = params.max_stake_usdc_minor;
        protocol.min_launch_quote_usdc_minor = params.min_launch_quote_usdc_minor;
        protocol.paused = false;
        protocol.bump = ctx.bumps.protocol;
        Ok(())
    }

    pub fn create_room(ctx: Context<CreateRoom>, params: CreateRoomParams) -> Result<()> {
        let room = &mut ctx.accounts.room;
        room.protocol = ctx.accounts.protocol.key();
        room.artist = ctx.accounts.artist.key();
        room.room_code = params.room_code;
        room.room_token_symbol = params.room_token_symbol;
        room.next_round_index = 0;
        room.pending_winner_rollover_usdc_minor = 0;
        room.pending_liquidity_rollover_usdc_minor = 0;
        room.bump = ctx.bumps.room;
        Ok(())
    }

    pub fn start_round(ctx: Context<StartRound>, params: StartRoundParams) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let round = &mut ctx.accounts.round;

        round.room = room.key();
        round.index = room.next_round_index;
        round.phase = RoundPhase::AwaitingCommit;
        round.bpm = params.bpm;
        round.commit_hash = [0u8; 32];
        round.total_predictions = 0;
        round.total_staked_usdc_minor = 0;
        round.artist_pending_usdc_minor = 0;
        round.platform_fee_usdc_minor = 0;
        round.liquidity_reserve_usdc_minor = room.pending_liquidity_rollover_usdc_minor;
        round.winner_pot_usdc_minor = room.pending_winner_rollover_usdc_minor;
        round.winner_pot_distributed_usdc_minor = 0;
        round.reveal_verified = false;
        round.bump = ctx.bumps.round;

        room.pending_winner_rollover_usdc_minor = 0;
        room.pending_liquidity_rollover_usdc_minor = 0;
        room.next_round_index = room
            .next_round_index
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(())
    }

    pub fn commit_round(ctx: Context<CommitRound>, params: CommitRoundParams) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require!(round.phase == RoundPhase::AwaitingCommit, ErrorCode::InvalidRoundPhase);

        round.commit_hash = params.commit_hash;
        round.phase = RoundPhase::PredictionOpen;
        Ok(())
    }

    pub fn place_prediction(ctx: Context<PlacePrediction>, params: PlacePredictionParams) -> Result<()> {
        let protocol = &ctx.accounts.protocol;
        let round = &mut ctx.accounts.round;
        let position = &mut ctx.accounts.position;

        require!(round.phase == RoundPhase::PredictionOpen, ErrorCode::InvalidRoundPhase);
        require!(!protocol.paused, ErrorCode::ProtocolPaused);
        require!(
            params.stake_amount_usdc_minor >= protocol.min_stake_usdc_minor
                && params.stake_amount_usdc_minor <= protocol.max_stake_usdc_minor,
            ErrorCode::InvalidStakeAmount
        );

        let artist_pending = split_amount(params.stake_amount_usdc_minor, protocol.artist_pending_bps)?;
        let platform_fee = split_amount(params.stake_amount_usdc_minor, protocol.platform_fee_bps)?;
        let liquidity = split_amount(params.stake_amount_usdc_minor, protocol.liquidity_reserve_bps)?;
        let winner = params
            .stake_amount_usdc_minor
            .checked_sub(artist_pending)
            .and_then(|v| v.checked_sub(platform_fee))
            .and_then(|v| v.checked_sub(liquidity))
            .ok_or(ErrorCode::MathOverflow)?;

        round.total_predictions = round
            .total_predictions
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        round.total_staked_usdc_minor = round
            .total_staked_usdc_minor
            .checked_add(params.stake_amount_usdc_minor)
            .ok_or(ErrorCode::MathOverflow)?;
        round.artist_pending_usdc_minor = round
            .artist_pending_usdc_minor
            .checked_add(artist_pending)
            .ok_or(ErrorCode::MathOverflow)?;
        round.platform_fee_usdc_minor = round
            .platform_fee_usdc_minor
            .checked_add(platform_fee)
            .ok_or(ErrorCode::MathOverflow)?;
        round.liquidity_reserve_usdc_minor = round
            .liquidity_reserve_usdc_minor
            .checked_add(liquidity)
            .ok_or(ErrorCode::MathOverflow)?;
        round.winner_pot_usdc_minor = round
            .winner_pot_usdc_minor
            .checked_add(winner)
            .ok_or(ErrorCode::MathOverflow)?;

        position.round = round.key();
        position.user = ctx.accounts.user.key();
        position.track_index = params.track_index;
        position.step_index = params.step_index;
        position.will_be_active = params.will_be_active;
        position.stake_amount_usdc_minor = params.stake_amount_usdc_minor;
        position.settled = false;
        position.claimed = false;
        position.bump = ctx.bumps.position;

        // TODO: Transfer stake USDC from user ATA to program vault ATAs.
        // TODO: Validate delegated/session signer and spend caps.

        Ok(())
    }

    pub fn lock_round(ctx: Context<MutateRound>) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require!(round.phase == RoundPhase::PredictionOpen, ErrorCode::InvalidRoundPhase);
        round.phase = RoundPhase::Locked;
        Ok(())
    }

    pub fn reveal_round(ctx: Context<MutateRound>, params: RevealRoundParams) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require!(round.phase == RoundPhase::Locked, ErrorCode::InvalidRoundPhase);

        round.reveal_verified = params.commit_verified;
        round.phase = RoundPhase::Revealed;
        Ok(())
    }

    pub fn settle_round(ctx: Context<SettleRound>) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let round = &mut ctx.accounts.round;

        require!(round.phase == RoundPhase::Revealed, ErrorCode::InvalidRoundPhase);

        if !round.reveal_verified {
            room.pending_winner_rollover_usdc_minor = room
                .pending_winner_rollover_usdc_minor
                .checked_add(round.winner_pot_usdc_minor)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        room.pending_liquidity_rollover_usdc_minor = room
            .pending_liquidity_rollover_usdc_minor
            .checked_add(round.liquidity_reserve_usdc_minor)
            .ok_or(ErrorCode::MathOverflow)?;

        round.phase = RoundPhase::Settled;
        Ok(())
    }
}

fn split_amount(total: u64, bps: u16) -> Result<u64> {
    total
        .checked_mul(bps as u64)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(ErrorCode::MathOverflow.into())
}

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
    pub paused: bool,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 2 + 2 + 2 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct Room {
    pub protocol: Pubkey,
    pub artist: Pubkey,
    pub room_code: [u8; 8],
    pub room_token_symbol: [u8; 12],
    pub next_round_index: u64,
    pub pending_winner_rollover_usdc_minor: u64,
    pub pending_liquidity_rollover_usdc_minor: u64,
    pub bump: u8,
}

impl Room {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 12 + 8 + 8 + 8 + 1;
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
    pub reveal_verified: bool,
    pub bump: u8,
}

impl Round {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 2 + 32 + 4 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct PredictionPosition {
    pub round: Pubkey,
    pub user: Pubkey,
    pub track_index: u8,
    pub step_index: u8,
    pub will_be_active: bool,
    pub stake_amount_usdc_minor: u64,
    pub settled: bool,
    pub claimed: bool,
    pub bump: u8,
}

impl PredictionPosition {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 1 + 1 + 8 + 1 + 1 + 1;
}

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
    pub commit_verified: bool,
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = ProtocolConfig::LEN,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol: Account<'info, ProtocolConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub artist: Signer<'info>,
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(
        init,
        payer = artist,
        space = Room::LEN,
        seeds = [b"room", artist.key().as_ref()],
        bump
    )]
    pub room: Account<'info, Room>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartRound<'info> {
    #[account(mut, address = room.artist)]
    pub artist: Signer<'info>,
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub room: Account<'info, Room>,
    #[account(
        init,
        payer = artist,
        space = Round::LEN,
        seeds = [b"round", room.key().as_ref(), &room.next_round_index.to_le_bytes()],
        bump
    )]
    pub round: Account<'info, Round>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitRound<'info> {
    #[account(address = room.artist)]
    pub artist: Signer<'info>,
    pub room: Account<'info, Room>,
    #[account(mut, has_one = room)]
    pub round: Account<'info, Round>,
}

#[derive(Accounts)]
pub struct PlacePrediction<'info> {
    pub protocol: Account<'info, ProtocolConfig>,
    pub room: Account<'info, Room>,
    #[account(mut, has_one = room)]
    pub round: Account<'info, Round>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        space = PredictionPosition::LEN,
        seeds = [
            b"position",
            round.key().as_ref(),
            user.key().as_ref(),
            &round.total_predictions.to_le_bytes(),
        ],
        bump
    )]
    pub position: Account<'info, PredictionPosition>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MutateRound<'info> {
    #[account(address = room.artist)]
    pub artist: Signer<'info>,
    pub room: Account<'info, Room>,
    #[account(mut, has_one = room)]
    pub round: Account<'info, Round>,
}

#[derive(Accounts)]
pub struct SettleRound<'info> {
    #[account(address = room.artist)]
    pub artist: Signer<'info>,
    #[account(mut)]
    pub room: Account<'info, Room>,
    #[account(mut, has_one = room)]
    pub round: Account<'info, Round>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Round is in invalid phase for this action")]
    InvalidRoundPhase,
    #[msg("Stake amount is outside configured bounds")]
    InvalidStakeAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Fee split must equal 10000 bps")]
    InvalidFeeSplit,
    #[msg("Invalid stake range")]
    InvalidStakeRange,
    #[msg("Protocol is paused")]
    ProtocolPaused,
}
