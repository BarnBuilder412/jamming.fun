use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{error::ErrorCode, state::*};

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
pub struct UpdateProtocolConfig<'info> {
    #[account(address = protocol.admin)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolConfig>,
}

#[derive(Accounts)]
pub struct SetProtocolPaused<'info> {
    #[account(address = protocol.admin)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Account<'info, ProtocolConfig>,
}

#[derive(Accounts)]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub artist: Signer<'info>,
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(address = protocol.quote_mint)]
    pub quote_mint: Account<'info, Mint>,
    pub reward_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = artist,
        space = Room::LEN,
        seeds = [b"room", artist.key().as_ref()],
        bump
    )]
    pub room: Account<'info, Room>,
    /// CHECK: PDA authority for room quote vaults.
    #[account(seeds = [b"vault_authority", room.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = artist,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub artist_pending_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = artist,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub platform_fee_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = artist,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub liquidity_reserve_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = artist,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub winner_pot_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartRound<'info> {
    #[account(mut, address = room.artist)]
    pub artist: Signer<'info>,
    #[account(constraint = room.protocol == protocol.key() @ ErrorCode::InvalidRoomProtocol)]
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
    #[account(constraint = room.protocol == protocol.key() @ ErrorCode::InvalidRoomProtocol)]
    pub room: Account<'info, Room>,
    #[account(mut, has_one = room)]
    pub round: Account<'info, Round>,
    #[account(address = protocol.quote_mint)]
    pub quote_mint: Account<'info, Mint>,
    /// CHECK: PDA authority for room quote vaults.
    #[account(seeds = [b"vault_authority", room.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        constraint = user_quote_ata.owner == user.key() @ ErrorCode::InvalidUserQuoteAccount,
        constraint = user_quote_ata.mint == quote_mint.key() @ ErrorCode::InvalidUserQuoteAccount,
    )]
    pub user_quote_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub artist_pending_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub platform_fee_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub liquidity_reserve_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub winner_pot_vault: Account<'info, TokenAccount>,
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
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlacePredictionDelegated<'info> {
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(constraint = room.protocol == protocol.key() @ ErrorCode::InvalidRoomProtocol)]
    pub room: Account<'info, Room>,
    #[account(mut, has_one = room)]
    pub round: Account<'info, Round>,
    #[account(address = protocol.quote_mint)]
    pub quote_mint: Account<'info, Mint>,
    /// CHECK: PDA authority for room quote vaults.
    #[account(seeds = [b"vault_authority", room.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, address = protocol.prediction_delegate @ ErrorCode::InvalidDelegatedPredictionSigner)]
    pub session_delegate: Signer<'info>,
    /// CHECK: Owner checked against user_quote_ata.owner.
    pub user: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = user_quote_ata.owner == user.key() @ ErrorCode::InvalidUserQuoteAccount,
        constraint = user_quote_ata.mint == quote_mint.key() @ ErrorCode::InvalidUserQuoteAccount,
    )]
    pub user_quote_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub artist_pending_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub platform_fee_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub liquidity_reserve_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub winner_pot_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = session_delegate,
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
    pub token_program: Program<'info, Token>,
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
pub struct SettlePosition<'info> {
    #[account(address = room.artist)]
    pub artist: Signer<'info>,
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(constraint = room.protocol == protocol.key() @ ErrorCode::InvalidRoomProtocol)]
    pub room: Account<'info, Room>,
    #[account(mut, has_one = room)]
    pub round: Account<'info, Round>,
    #[account(mut, has_one = round)]
    pub position: Account<'info, PredictionPosition>,
    #[account(address = protocol.quote_mint)]
    pub quote_mint: Account<'info, Mint>,
    /// CHECK: PDA authority for room quote vaults.
    #[account(seeds = [b"vault_authority", room.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub winner_pot_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_quote_ata.owner == position.user @ ErrorCode::InvalidUserQuoteAccount,
        constraint = user_quote_ata.mint == quote_mint.key() @ ErrorCode::InvalidUserQuoteAccount,
    )]
    pub user_quote_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleRound<'info> {
    #[account(address = room.artist)]
    pub artist: Signer<'info>,
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(mut, constraint = room.protocol == protocol.key() @ ErrorCode::InvalidRoomProtocol)]
    pub room: Account<'info, Room>,
    #[account(mut, has_one = room)]
    pub round: Account<'info, Round>,
    #[account(address = protocol.quote_mint)]
    pub quote_mint: Account<'info, Mint>,
    /// CHECK: PDA authority for room quote vaults.
    #[account(seeds = [b"vault_authority", room.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub artist_pending_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub liquidity_reserve_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimArtistPending<'info> {
    #[account(address = room.artist)]
    pub artist: Signer<'info>,
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(constraint = room.protocol == protocol.key() @ ErrorCode::InvalidRoomProtocol)]
    pub room: Account<'info, Room>,
    #[account(address = protocol.quote_mint)]
    pub quote_mint: Account<'info, Mint>,
    /// CHECK: PDA authority for room quote vaults.
    #[account(seeds = [b"vault_authority", room.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub artist_pending_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = artist_quote_ata.owner == artist.key() @ ErrorCode::InvalidUserQuoteAccount,
        constraint = artist_quote_ata.mint == quote_mint.key() @ ErrorCode::InvalidUserQuoteAccount,
    )]
    pub artist_quote_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimPlatformFee<'info> {
    #[account(address = protocol.admin)]
    pub admin: Signer<'info>,
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(constraint = room.protocol == protocol.key() @ ErrorCode::InvalidRoomProtocol)]
    pub room: Account<'info, Room>,
    #[account(address = protocol.quote_mint)]
    pub quote_mint: Account<'info, Mint>,
    /// CHECK: PDA authority for room quote vaults.
    #[account(seeds = [b"vault_authority", room.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub platform_fee_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = platform_treasury_quote_ata.owner == admin.key() @ ErrorCode::InvalidUserQuoteAccount,
        constraint = platform_treasury_quote_ata.mint == quote_mint.key() @ ErrorCode::InvalidUserQuoteAccount,
    )]
    pub platform_treasury_quote_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimRewardToken<'info> {
    #[account(address = position.user)]
    pub user: Signer<'info>,
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(constraint = room.protocol == protocol.key() @ ErrorCode::InvalidRoomProtocol)]
    pub room: Account<'info, Room>,
    #[account(has_one = room)]
    pub round: Account<'info, Round>,
    #[account(mut, has_one = round, has_one = user)]
    pub position: Account<'info, PredictionPosition>,
    #[account(address = room.reward_mint)]
    pub reward_mint: Account<'info, Mint>,
    /// CHECK: PDA authority for room vaults and room reward mint.
    #[account(seeds = [b"vault_authority", room.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = user_reward_ata.owner == user.key() @ ErrorCode::InvalidUserQuoteAccount,
        constraint = user_reward_ata.mint == reward_mint.key() @ ErrorCode::InvalidUserQuoteAccount,
    )]
    pub user_reward_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DeployLiquidityReserve<'info> {
    #[account(address = protocol.admin)]
    pub admin: Signer<'info>,
    pub protocol: Account<'info, ProtocolConfig>,
    #[account(mut, constraint = room.protocol == protocol.key() @ ErrorCode::InvalidRoomProtocol)]
    pub room: Account<'info, Room>,
    #[account(address = protocol.quote_mint)]
    pub quote_mint: Account<'info, Mint>,
    /// CHECK: PDA authority for room quote vaults.
    #[account(seeds = [b"vault_authority", room.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = vault_authority,
    )]
    pub liquidity_reserve_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = destination_quote_ata.mint == quote_mint.key() @ ErrorCode::InvalidUserQuoteAccount,
    )]
    pub destination_quote_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
