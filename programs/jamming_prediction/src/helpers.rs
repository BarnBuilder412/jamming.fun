use anchor_lang::prelude::*;
use anchor_lang::solana_program::{hash::hashv, program_option::COption};
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, TransferChecked};

use crate::{
    constants::{MAX_STEPS, MAX_TRACKS, REVEAL_BITMAP_BYTES},
    error::ErrorCode,
    state::Room,
};

pub fn validate_fee_split(
    platform_fee_bps: u16,
    artist_pending_bps: u16,
    liquidity_reserve_bps: u16,
    winner_pot_bps: u16,
) -> Result<()> {
    require!(
        platform_fee_bps as u32
            + artist_pending_bps as u32
            + liquidity_reserve_bps as u32
            + winner_pot_bps as u32
            == 10_000,
        ErrorCode::InvalidFeeSplit
    );
    Ok(())
}

pub fn split_amount(total: u64, bps: u16) -> Result<u64> {
    total
        .checked_mul(bps as u64)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(ErrorCode::MathOverflow.into())
}

pub fn build_reveal_commit_hash(
    outcome_bitmap: &[u8; REVEAL_BITMAP_BYTES],
    salt: &[u8; 32],
) -> [u8; 32] {
    hashv(&[b"jamming_prediction:round_reveal:v1", outcome_bitmap, salt]).to_bytes()
}

pub fn verify_reveal_commit_hash(
    expected_commit_hash: [u8; 32],
    outcome_bitmap: &[u8; REVEAL_BITMAP_BYTES],
    salt: &[u8; 32],
) -> bool {
    build_reveal_commit_hash(outcome_bitmap, salt) == expected_commit_hash
}

pub fn validate_prediction_indices(track_index: u8, step_index: u8) -> Result<()> {
    require!(
        track_index < MAX_TRACKS && step_index < MAX_STEPS,
        ErrorCode::InvalidPredictionTile
    );
    Ok(())
}

pub fn tile_is_active(
    outcome_bitmap: &[u8; REVEAL_BITMAP_BYTES],
    track_index: u8,
    step_index: u8,
) -> Result<bool> {
    validate_prediction_indices(track_index, step_index)?;
    let linear = (track_index as usize) * (MAX_STEPS as usize) + (step_index as usize);
    let byte_index = linear / 8;
    let bit_index = (linear % 8) as u8;
    let mask = 1u8 << bit_index;
    Ok((outcome_bitmap[byte_index] & mask) != 0)
}

pub fn evaluate_prediction(
    track_index: u8,
    step_index: u8,
    will_be_active: bool,
    outcome_bitmap: &[u8; REVEAL_BITMAP_BYTES],
) -> Result<bool> {
    Ok(tile_is_active(outcome_bitmap, track_index, step_index)? == will_be_active)
}

pub fn transfer_quote_from_user<'info>(
    authority: &Signer<'info>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    transfer_quote_with_authority(authority, from, to, mint, token_program, amount)
}

pub fn transfer_quote_with_authority<'info>(
    authority: &Signer<'info>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let cpi_accounts = TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
        mint: mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    token::transfer_checked(cpi_ctx, amount, mint.decimals)
}

pub fn transfer_quote_from_vault<'info>(
    room: &Account<'info, Room>,
    vault_authority_bump: u8,
    vault_authority: &UncheckedAccount<'info>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let room_key = room.key();
    let signer_seeds: &[&[u8]] = &[
        b"vault_authority",
        room_key.as_ref(),
        &[vault_authority_bump],
    ];

    let cpi_accounts = TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: vault_authority.to_account_info(),
        mint: mint.to_account_info(),
    };
    let signer_binding = [signer_seeds];
    let cpi_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        cpi_accounts,
        &signer_binding,
    );
    token::transfer_checked(cpi_ctx, amount, mint.decimals)
}

pub fn mint_reward_from_vault_authority<'info>(
    room: &Account<'info, Room>,
    vault_authority_bump: u8,
    vault_authority: &UncheckedAccount<'info>,
    mint: &Account<'info, Mint>,
    to: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let room_key = room.key();
    let signer_seeds: &[&[u8]] = &[
        b"vault_authority",
        room_key.as_ref(),
        &[vault_authority_bump],
    ];

    let cpi_accounts = MintTo {
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: vault_authority.to_account_info(),
    };
    let signer_binding = [signer_seeds];
    let cpi_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        cpi_accounts,
        &signer_binding,
    );
    token::mint_to(cpi_ctx, amount)
}

pub fn validate_delegated_prediction_signer(
    configured_delegate: Pubkey,
    max_delegate_stake_usdc_minor: u64,
    delegate_signer: Pubkey,
    stake_amount_usdc_minor: u64,
) -> Result<()> {
    require!(
        delegate_signer == configured_delegate,
        ErrorCode::InvalidDelegatedPredictionSigner
    );
    require!(
        stake_amount_usdc_minor <= max_delegate_stake_usdc_minor,
        ErrorCode::DelegatedStakeCapExceeded
    );
    Ok(())
}

pub fn one_token_amount(decimals: u8) -> Result<u64> {
    10u64
        .checked_pow(decimals as u32)
        .ok_or(ErrorCode::MathOverflow.into())
}

pub fn is_expected_mint_authority(mint_authority: &COption<Pubkey>, expected: Pubkey) -> bool {
    *mint_authority == COption::Some(expected)
}

pub fn is_valid_mint_freeze_authority(
    mint_freeze_authority: &COption<Pubkey>,
    expected: Pubkey,
) -> bool {
    *mint_freeze_authority == COption::None || *mint_freeze_authority == COption::Some(expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_amount_computes_expected_values() {
        assert_eq!(split_amount(10_000, 500).unwrap(), 500);
        assert_eq!(split_amount(1_001, 1_500).unwrap(), 150);
        assert_eq!(split_amount(0, 9_999).unwrap(), 0);
    }

    #[test]
    fn split_amount_errors_on_overflow() {
        let err = split_amount(u64::MAX, 10_000).unwrap_err();
        match err {
            anchor_lang::error::Error::AnchorError(anchor_err) => {
                assert_eq!(anchor_err.error_code_number, ErrorCode::MathOverflow as u32);
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[test]
    fn verify_reveal_commit_hash_returns_true_for_matching_preimage() {
        let reveal = [7u8; REVEAL_BITMAP_BYTES];
        let salt = [42u8; 32];
        let commit_hash = build_reveal_commit_hash(&reveal, &salt);

        assert!(verify_reveal_commit_hash(commit_hash, &reveal, &salt));
    }

    #[test]
    fn verify_reveal_commit_hash_returns_false_for_mismatched_preimage() {
        let reveal = [7u8; REVEAL_BITMAP_BYTES];
        let different_reveal = [8u8; REVEAL_BITMAP_BYTES];
        let salt = [42u8; 32];
        let commit_hash = build_reveal_commit_hash(&reveal, &salt);

        assert!(!verify_reveal_commit_hash(
            commit_hash,
            &different_reveal,
            &salt
        ));
    }

    #[test]
    fn evaluate_prediction_respects_bitmap_state() {
        let mut bitmap = [0u8; REVEAL_BITMAP_BYTES];
        bitmap[0] |= 1u8 << 1;
        assert!(evaluate_prediction(0, 1, true, &bitmap).unwrap());
        assert!(evaluate_prediction(0, 1, false, &bitmap).is_ok_and(|v| !v));
    }

    #[test]
    fn evaluate_prediction_rejects_out_of_bounds_tile() {
        let bitmap = [0u8; REVEAL_BITMAP_BYTES];
        let err = evaluate_prediction(MAX_TRACKS, 0, true, &bitmap).unwrap_err();
        match err {
            anchor_lang::error::Error::AnchorError(anchor_err) => {
                assert_eq!(
                    anchor_err.error_code_number,
                    ErrorCode::InvalidPredictionTile as u32
                );
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[test]
    fn validate_delegated_prediction_signer_accepts_configured_delegate_within_cap() {
        let delegate = Pubkey::new_unique();
        assert!(validate_delegated_prediction_signer(delegate, 1_000, delegate, 1_000).is_ok());
    }

    #[test]
    fn validate_delegated_prediction_signer_rejects_unconfigured_delegate() {
        let configured = Pubkey::new_unique();
        let signer = Pubkey::new_unique();
        let err = validate_delegated_prediction_signer(configured, 1_000, signer, 500).unwrap_err();
        match err {
            anchor_lang::error::Error::AnchorError(anchor_err) => {
                assert_eq!(
                    anchor_err.error_code_number,
                    ErrorCode::InvalidDelegatedPredictionSigner as u32
                );
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[test]
    fn validate_delegated_prediction_signer_rejects_exceeding_cap() {
        let delegate = Pubkey::new_unique();
        let err = validate_delegated_prediction_signer(delegate, 999, delegate, 1_000).unwrap_err();
        match err {
            anchor_lang::error::Error::AnchorError(anchor_err) => {
                assert_eq!(
                    anchor_err.error_code_number,
                    ErrorCode::DelegatedStakeCapExceeded as u32
                );
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[test]
    fn one_token_amount_respects_decimals() {
        assert_eq!(one_token_amount(0).unwrap(), 1);
        assert_eq!(one_token_amount(6).unwrap(), 1_000_000);
    }

    #[test]
    fn one_token_amount_errors_on_overflow() {
        let err = one_token_amount(20).unwrap_err();
        match err {
            anchor_lang::error::Error::AnchorError(anchor_err) => {
                assert_eq!(anchor_err.error_code_number, ErrorCode::MathOverflow as u32);
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[test]
    fn is_expected_mint_authority_matches_only_expected_pubkey() {
        let expected = Pubkey::new_unique();
        let different = Pubkey::new_unique();
        assert!(is_expected_mint_authority(
            &COption::Some(expected),
            expected
        ));
        assert!(!is_expected_mint_authority(
            &COption::Some(different),
            expected
        ));
        assert!(!is_expected_mint_authority(&COption::None, expected));
    }

    #[test]
    fn is_valid_mint_freeze_authority_allows_none_or_expected() {
        let expected = Pubkey::new_unique();
        let different = Pubkey::new_unique();
        assert!(is_valid_mint_freeze_authority(&COption::None, expected));
        assert!(is_valid_mint_freeze_authority(
            &COption::Some(expected),
            expected
        ));
        assert!(!is_valid_mint_freeze_authority(
            &COption::Some(different),
            expected
        ));
    }
}
