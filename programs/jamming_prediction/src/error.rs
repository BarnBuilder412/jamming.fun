use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Round is in invalid phase for this action")]
    InvalidRoundPhase,
    #[msg("Stake amount is outside configured bounds")]
    InvalidStakeAmount,
    #[msg("Prediction track/step index is outside supported bounds")]
    InvalidPredictionTile,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Fee split must equal 10000 bps")]
    InvalidFeeSplit,
    #[msg("Invalid stake range")]
    InvalidStakeRange,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Room does not belong to protocol")]
    InvalidRoomProtocol,
    #[msg("Invalid user quote token account")]
    InvalidUserQuoteAccount,
    #[msg("Position already settled")]
    PositionAlreadySettled,
    #[msg("Winner payout exceeds remaining winner pot")]
    PayoutExceedsWinnerPot,
    #[msg("Losing positions must have zero winner payout")]
    InvalidPayoutForLosingPosition,
    #[msg("All positions must be settled before round settlement")]
    UnsettledPositions,
    #[msg("Reveal preimage hash does not match commit hash")]
    CommitHashMismatch,
    #[msg("Delegated prediction signer does not match protocol configuration")]
    InvalidDelegatedPredictionSigner,
    #[msg("Delegated prediction exceeds protocol per-transaction spend cap")]
    DelegatedStakeCapExceeded,
    #[msg("Delegated prediction exceeds protocol per-round spend cap")]
    DelegatedRoundCapExceeded,
    #[msg("Prediction position is not settled")]
    PositionNotSettled,
    #[msg("Prediction position is not eligible for reward claim")]
    PositionNotRewardEligible,
    #[msg("Reward already claimed for this position")]
    PositionRewardAlreadyClaimed,
    #[msg("Reward mint authority must be room vault authority")]
    RewardMintAuthorityMismatch,
    #[msg("Reward mint freeze authority must be room vault authority or None")]
    RewardMintFreezeAuthorityMismatch,
    #[msg("Insufficient pending liquidity reserve for deployment")]
    InsufficientPendingLiquidityReserve,
}
