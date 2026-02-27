pub const ARTIST_PENDING_BPS: u16 = 5_000;
pub const PLATFORM_FEE_BPS: u16 = 500;
pub const LIQUIDITY_RESERVE_BPS: u16 = 1_500;
pub const WINNER_POT_BPS: u16 = 3_000;

pub const MAX_TRACKS: u8 = 9;
pub const MAX_STEPS: u8 = 32;
pub const REVEAL_BITMAP_BYTES: usize = ((MAX_TRACKS as usize) * (MAX_STEPS as usize)).div_ceil(8);
