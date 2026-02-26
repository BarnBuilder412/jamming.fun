export const SOLANA_CLUSTERS = ['devnet', 'mainnet-beta'] as const;
export type SolanaCluster = (typeof SOLANA_CLUSTERS)[number];

export function getSolanaRpcUrl(cluster: SolanaCluster): string {
  if (cluster === 'mainnet-beta') {
    return 'https://api.mainnet-beta.solana.com';
  }

  return 'https://api.devnet.solana.com';
}

export type BlinkActionUrls = {
  join: string;
  predict: (roundId: string) => string;
  claim: (roundId: string) => string;
};

export function createBlinkActionUrls(apiBaseUrl: string, roomId: string): BlinkActionUrls {
  const normalized = apiBaseUrl.replace(/\/$/, '');
  return {
    join: `${normalized}/actions/join?roomId=${encodeURIComponent(roomId)}`,
    predict: (roundId) => `${normalized}/actions/predict?roomId=${encodeURIComponent(roomId)}&roundId=${encodeURIComponent(roundId)}`,
    claim: (roundId) => `${normalized}/actions/claim?roomId=${encodeURIComponent(roomId)}&roundId=${encodeURIComponent(roundId)}`,
  };
}

export type RewardClaimStatus = 'pending' | 'ready' | 'claimed';

export interface RewardClaimTicket {
  roomId: string;
  roundId: string;
  userWallet: string;
  units: number;
  status: RewardClaimStatus;
}
