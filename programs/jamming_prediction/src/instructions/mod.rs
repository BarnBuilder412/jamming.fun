use anchor_lang::prelude::*;

use crate::{
    constants::REVEAL_BITMAP_BYTES,
    contexts::*,
    error::ErrorCode,
    events::{
        LiquidityReserveDeployed, PositionSettled, PredictionPlaced, RewardTokenClaimed,
        RoundSettled,
    },
    helpers::*,
    params::*,
    state::RoundPhase,
};

pub fn initialize_protocol(
    ctx: Context<InitializeProtocol>,
    params: InitializeProtocolParams,
) -> Result<()> {
    validate_fee_split(
        params.platform_fee_bps,
        params.artist_pending_bps,
        params.liquidity_reserve_bps,
        params.winner_pot_bps,
    )?;
    require!(
        params.max_stake_usdc_minor >= params.min_stake_usdc_minor,
        ErrorCode::InvalidStakeRange
    );

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
    protocol.prediction_delegate = params.prediction_delegate;
    protocol.delegate_max_stake_usdc_minor = params.delegate_max_stake_usdc_minor;
    protocol.paused = false;
    protocol.bump = ctx.bumps.protocol;
    Ok(())
}

pub fn update_protocol_config(
    ctx: Context<UpdateProtocolConfig>,
    params: UpdateProtocolConfigParams,
) -> Result<()> {
    validate_fee_split(
        params.platform_fee_bps,
        params.artist_pending_bps,
        params.liquidity_reserve_bps,
        params.winner_pot_bps,
    )?;
    require!(
        params.max_stake_usdc_minor >= params.min_stake_usdc_minor,
        ErrorCode::InvalidStakeRange
    );

    let protocol = &mut ctx.accounts.protocol;
    protocol.platform_fee_bps = params.platform_fee_bps;
    protocol.artist_pending_bps = params.artist_pending_bps;
    protocol.liquidity_reserve_bps = params.liquidity_reserve_bps;
    protocol.winner_pot_bps = params.winner_pot_bps;
    protocol.min_stake_usdc_minor = params.min_stake_usdc_minor;
    protocol.max_stake_usdc_minor = params.max_stake_usdc_minor;
    protocol.min_launch_quote_usdc_minor = params.min_launch_quote_usdc_minor;
    protocol.prediction_delegate = params.prediction_delegate;
    protocol.delegate_max_stake_usdc_minor = params.delegate_max_stake_usdc_minor;
    Ok(())
}

pub fn set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
    ctx.accounts.protocol.paused = paused;
    Ok(())
}

pub fn create_room(ctx: Context<CreateRoom>, params: CreateRoomParams) -> Result<()> {
    require!(
        is_expected_mint_authority(
            &ctx.accounts.reward_mint.mint_authority,
            ctx.accounts.vault_authority.key()
        ),
        ErrorCode::RewardMintAuthorityMismatch
    );
    require!(
        is_valid_mint_freeze_authority(
            &ctx.accounts.reward_mint.freeze_authority,
            ctx.accounts.vault_authority.key()
        ),
        ErrorCode::RewardMintFreezeAuthorityMismatch
    );

    let room = &mut ctx.accounts.room;
    room.protocol = ctx.accounts.protocol.key();
    room.artist = ctx.accounts.artist.key();
    room.room_code = params.room_code;
    room.room_token_symbol = params.room_token_symbol;
    room.reward_mint = ctx.accounts.reward_mint.key();
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
    round.settled_positions = 0;
    round.winning_positions = 0;
    round.delegated_spent_usdc_minor = 0;
    round.outcome_bitmap = [0u8; REVEAL_BITMAP_BYTES];
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
    require!(
        round.phase == RoundPhase::AwaitingCommit,
        ErrorCode::InvalidRoundPhase
    );

    round.commit_hash = params.commit_hash;
    round.phase = RoundPhase::PredictionOpen;
    Ok(())
}

pub fn place_prediction(
    ctx: Context<PlacePrediction>,
    params: PlacePredictionParams,
) -> Result<()> {
    let protocol = &ctx.accounts.protocol;
    let round = &mut ctx.accounts.round;
    let position = &mut ctx.accounts.position;

    require!(
        round.phase == RoundPhase::PredictionOpen,
        ErrorCode::InvalidRoundPhase
    );
    require!(!protocol.paused, ErrorCode::ProtocolPaused);
    require!(
        params.stake_amount_usdc_minor >= protocol.min_stake_usdc_minor
            && params.stake_amount_usdc_minor <= protocol.max_stake_usdc_minor,
        ErrorCode::InvalidStakeAmount
    );
    validate_prediction_indices(params.track_index, params.step_index)?;

    let artist_pending = split_amount(params.stake_amount_usdc_minor, protocol.artist_pending_bps)?;
    let platform_fee = split_amount(params.stake_amount_usdc_minor, protocol.platform_fee_bps)?;
    let liquidity = split_amount(
        params.stake_amount_usdc_minor,
        protocol.liquidity_reserve_bps,
    )?;
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
    position.was_correct = false;
    position.usdc_payout_usdc_minor = 0;
    position.settled = false;
    position.claimed = false;
    position.bump = ctx.bumps.position;

    transfer_quote_from_user(
        &ctx.accounts.user,
        &ctx.accounts.user_quote_ata,
        &ctx.accounts.artist_pending_vault,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        artist_pending,
    )?;
    transfer_quote_from_user(
        &ctx.accounts.user,
        &ctx.accounts.user_quote_ata,
        &ctx.accounts.platform_fee_vault,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        platform_fee,
    )?;
    transfer_quote_from_user(
        &ctx.accounts.user,
        &ctx.accounts.user_quote_ata,
        &ctx.accounts.liquidity_reserve_vault,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        liquidity,
    )?;
    transfer_quote_from_user(
        &ctx.accounts.user,
        &ctx.accounts.user_quote_ata,
        &ctx.accounts.winner_pot_vault,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        winner,
    )?;

    emit!(PredictionPlaced {
        room: ctx.accounts.room.key(),
        round: round.key(),
        user: ctx.accounts.user.key(),
        stake_amount_usdc_minor: params.stake_amount_usdc_minor,
        delegated: false,
    });

    Ok(())
}

pub fn place_prediction_delegated(
    ctx: Context<PlacePredictionDelegated>,
    params: PlacePredictionParams,
) -> Result<()> {
    let protocol = &ctx.accounts.protocol;
    let round = &mut ctx.accounts.round;
    let position = &mut ctx.accounts.position;

    require!(
        round.phase == RoundPhase::PredictionOpen,
        ErrorCode::InvalidRoundPhase
    );
    require!(!protocol.paused, ErrorCode::ProtocolPaused);
    require!(
        params.stake_amount_usdc_minor >= protocol.min_stake_usdc_minor
            && params.stake_amount_usdc_minor <= protocol.max_stake_usdc_minor,
        ErrorCode::InvalidStakeAmount
    );
    validate_prediction_indices(params.track_index, params.step_index)?;
    validate_delegated_prediction_signer(
        protocol.prediction_delegate,
        protocol.delegate_max_stake_usdc_minor,
        ctx.accounts.session_delegate.key(),
        params.stake_amount_usdc_minor,
    )?;

    let delegated_spent_next = round
        .delegated_spent_usdc_minor
        .checked_add(params.stake_amount_usdc_minor)
        .ok_or(ErrorCode::MathOverflow)?;
    require!(
        delegated_spent_next <= protocol.delegate_max_stake_usdc_minor,
        ErrorCode::DelegatedRoundCapExceeded
    );

    let artist_pending = split_amount(params.stake_amount_usdc_minor, protocol.artist_pending_bps)?;
    let platform_fee = split_amount(params.stake_amount_usdc_minor, protocol.platform_fee_bps)?;
    let liquidity = split_amount(
        params.stake_amount_usdc_minor,
        protocol.liquidity_reserve_bps,
    )?;
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
    round.delegated_spent_usdc_minor = delegated_spent_next;

    position.round = round.key();
    position.user = ctx.accounts.user.key();
    position.track_index = params.track_index;
    position.step_index = params.step_index;
    position.will_be_active = params.will_be_active;
    position.stake_amount_usdc_minor = params.stake_amount_usdc_minor;
    position.was_correct = false;
    position.usdc_payout_usdc_minor = 0;
    position.settled = false;
    position.claimed = false;
    position.bump = ctx.bumps.position;

    transfer_quote_with_authority(
        &ctx.accounts.session_delegate,
        &ctx.accounts.user_quote_ata,
        &ctx.accounts.artist_pending_vault,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        artist_pending,
    )?;
    transfer_quote_with_authority(
        &ctx.accounts.session_delegate,
        &ctx.accounts.user_quote_ata,
        &ctx.accounts.platform_fee_vault,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        platform_fee,
    )?;
    transfer_quote_with_authority(
        &ctx.accounts.session_delegate,
        &ctx.accounts.user_quote_ata,
        &ctx.accounts.liquidity_reserve_vault,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        liquidity,
    )?;
    transfer_quote_with_authority(
        &ctx.accounts.session_delegate,
        &ctx.accounts.user_quote_ata,
        &ctx.accounts.winner_pot_vault,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        winner,
    )?;

    emit!(PredictionPlaced {
        room: ctx.accounts.room.key(),
        round: round.key(),
        user: ctx.accounts.user.key(),
        stake_amount_usdc_minor: params.stake_amount_usdc_minor,
        delegated: true,
    });

    Ok(())
}

pub fn lock_round(ctx: Context<MutateRound>) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        round.phase == RoundPhase::PredictionOpen,
        ErrorCode::InvalidRoundPhase
    );
    round.phase = RoundPhase::Locked;
    Ok(())
}

pub fn reveal_round(ctx: Context<MutateRound>, params: RevealRoundParams) -> Result<()> {
    let round = &mut ctx.accounts.round;
    require!(
        round.phase == RoundPhase::Locked,
        ErrorCode::InvalidRoundPhase
    );

    let reveal_hash = build_reveal_commit_hash(&params.outcome_bitmap, &params.salt);
    require!(
        reveal_hash == round.commit_hash,
        ErrorCode::CommitHashMismatch
    );

    round.outcome_bitmap = params.outcome_bitmap;
    round.reveal_verified = true;
    round.phase = RoundPhase::Revealed;
    Ok(())
}

pub fn settle_position(ctx: Context<SettlePosition>, params: SettlePositionParams) -> Result<()> {
    let round = &mut ctx.accounts.round;
    let position = &mut ctx.accounts.position;

    require!(
        round.phase == RoundPhase::Revealed,
        ErrorCode::InvalidRoundPhase
    );
    require!(!position.settled, ErrorCode::PositionAlreadySettled);

    let is_correct = round.reveal_verified
        && evaluate_prediction(
            position.track_index,
            position.step_index,
            position.will_be_active,
            &round.outcome_bitmap,
        )?;

    let payout = if is_correct {
        let remaining = round
            .winner_pot_usdc_minor
            .checked_sub(round.winner_pot_distributed_usdc_minor)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(
            params.winner_payout_usdc_minor <= remaining,
            ErrorCode::PayoutExceedsWinnerPot
        );
        transfer_quote_from_vault(
            &ctx.accounts.room,
            ctx.bumps.vault_authority,
            &ctx.accounts.vault_authority,
            &ctx.accounts.winner_pot_vault,
            &ctx.accounts.user_quote_ata,
            &ctx.accounts.quote_mint,
            &ctx.accounts.token_program,
            params.winner_payout_usdc_minor,
        )?;
        round.winner_pot_distributed_usdc_minor = round
            .winner_pot_distributed_usdc_minor
            .checked_add(params.winner_payout_usdc_minor)
            .ok_or(ErrorCode::MathOverflow)?;
        round.winning_positions = round
            .winning_positions
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        params.winner_payout_usdc_minor
    } else {
        require!(
            params.winner_payout_usdc_minor == 0,
            ErrorCode::InvalidPayoutForLosingPosition
        );
        0
    };

    round.settled_positions = round
        .settled_positions
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;

    position.was_correct = is_correct;
    position.usdc_payout_usdc_minor = payout;
    position.settled = true;

    emit!(PositionSettled {
        room: ctx.accounts.room.key(),
        round: round.key(),
        position: position.key(),
        user: position.user,
        was_correct: is_correct,
        payout_usdc_minor: payout,
    });

    Ok(())
}

pub fn settle_round(ctx: Context<SettleRound>) -> Result<()> {
    let protocol = &ctx.accounts.protocol;
    let room = &mut ctx.accounts.room;
    let round = &mut ctx.accounts.round;

    require!(
        round.phase == RoundPhase::Revealed,
        ErrorCode::InvalidRoundPhase
    );
    if round.reveal_verified {
        require!(
            round.settled_positions == round.total_predictions,
            ErrorCode::UnsettledPositions
        );
        let remaining_winner_pot = round
            .winner_pot_usdc_minor
            .checked_sub(round.winner_pot_distributed_usdc_minor)
            .ok_or(ErrorCode::MathOverflow)?;
        room.pending_winner_rollover_usdc_minor = room
            .pending_winner_rollover_usdc_minor
            .checked_add(remaining_winner_pot)
            .ok_or(ErrorCode::MathOverflow)?;
    } else {
        room.pending_winner_rollover_usdc_minor = room
            .pending_winner_rollover_usdc_minor
            .checked_add(round.winner_pot_usdc_minor)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    if round.liquidity_reserve_usdc_minor > 0
        && round.liquidity_reserve_usdc_minor < protocol.min_launch_quote_usdc_minor
    {
        let artist_boost = round
            .liquidity_reserve_usdc_minor
            .checked_div(2)
            .ok_or(ErrorCode::MathOverflow)?;
        let liquidity_rollover = round
            .liquidity_reserve_usdc_minor
            .checked_sub(artist_boost)
            .ok_or(ErrorCode::MathOverflow)?;

        let room_ref = &*room;
        transfer_quote_from_vault(
            room_ref,
            ctx.bumps.vault_authority,
            &ctx.accounts.vault_authority,
            &ctx.accounts.liquidity_reserve_vault,
            &ctx.accounts.artist_pending_vault,
            &ctx.accounts.quote_mint,
            &ctx.accounts.token_program,
            artist_boost,
        )?;

        round.artist_pending_usdc_minor = round
            .artist_pending_usdc_minor
            .checked_add(artist_boost)
            .ok_or(ErrorCode::MathOverflow)?;
        room.pending_liquidity_rollover_usdc_minor = room
            .pending_liquidity_rollover_usdc_minor
            .checked_add(liquidity_rollover)
            .ok_or(ErrorCode::MathOverflow)?;
    } else {
        room.pending_liquidity_rollover_usdc_minor = room
            .pending_liquidity_rollover_usdc_minor
            .checked_add(round.liquidity_reserve_usdc_minor)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    round.phase = RoundPhase::Settled;

    emit!(RoundSettled {
        room: room.key(),
        round: round.key(),
        winner_pot_rollover_usdc_minor: room.pending_winner_rollover_usdc_minor,
        liquidity_rollover_usdc_minor: room.pending_liquidity_rollover_usdc_minor,
    });

    Ok(())
}

pub fn claim_artist_pending(
    ctx: Context<ClaimArtistPending>,
    amount_usdc_minor: u64,
) -> Result<()> {
    transfer_quote_from_vault(
        &ctx.accounts.room,
        ctx.bumps.vault_authority,
        &ctx.accounts.vault_authority,
        &ctx.accounts.artist_pending_vault,
        &ctx.accounts.artist_quote_ata,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        amount_usdc_minor,
    )
}

pub fn claim_platform_fee(ctx: Context<ClaimPlatformFee>, amount_usdc_minor: u64) -> Result<()> {
    transfer_quote_from_vault(
        &ctx.accounts.room,
        ctx.bumps.vault_authority,
        &ctx.accounts.vault_authority,
        &ctx.accounts.platform_fee_vault,
        &ctx.accounts.platform_treasury_quote_ata,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        amount_usdc_minor,
    )
}

pub fn claim_reward_token(ctx: Context<ClaimRewardToken>) -> Result<()> {
    let position = &mut ctx.accounts.position;
    require!(position.settled, ErrorCode::PositionNotSettled);
    require!(position.was_correct, ErrorCode::PositionNotRewardEligible);
    require!(!position.claimed, ErrorCode::PositionRewardAlreadyClaimed);
    require!(
        is_expected_mint_authority(
            &ctx.accounts.reward_mint.mint_authority,
            ctx.accounts.vault_authority.key()
        ),
        ErrorCode::RewardMintAuthorityMismatch
    );

    let reward_amount = one_token_amount(ctx.accounts.reward_mint.decimals)?;
    mint_reward_from_vault_authority(
        &ctx.accounts.room,
        ctx.bumps.vault_authority,
        &ctx.accounts.vault_authority,
        &ctx.accounts.reward_mint,
        &ctx.accounts.user_reward_ata,
        &ctx.accounts.token_program,
        reward_amount,
    )?;

    position.claimed = true;

    emit!(RewardTokenClaimed {
        room: ctx.accounts.room.key(),
        round: ctx.accounts.round.key(),
        position: position.key(),
        user: ctx.accounts.user.key(),
        reward_amount,
    });

    Ok(())
}

pub fn deploy_liquidity_reserve(
    ctx: Context<DeployLiquidityReserve>,
    amount_usdc_minor: u64,
) -> Result<()> {
    let room = &mut ctx.accounts.room;
    require!(
        room.pending_liquidity_rollover_usdc_minor >= amount_usdc_minor,
        ErrorCode::InsufficientPendingLiquidityReserve
    );

    transfer_quote_from_vault(
        room,
        ctx.bumps.vault_authority,
        &ctx.accounts.vault_authority,
        &ctx.accounts.liquidity_reserve_vault,
        &ctx.accounts.destination_quote_ata,
        &ctx.accounts.quote_mint,
        &ctx.accounts.token_program,
        amount_usdc_minor,
    )?;

    room.pending_liquidity_rollover_usdc_minor = room
        .pending_liquidity_rollover_usdc_minor
        .checked_sub(amount_usdc_minor)
        .ok_or(ErrorCode::MathOverflow)?;

    emit!(LiquidityReserveDeployed {
        room: room.key(),
        amount_usdc_minor,
        destination_quote_ata: ctx.accounts.destination_quote_ata.key(),
    });

    Ok(())
}
