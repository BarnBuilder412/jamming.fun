export const webEnv = {
  apiBaseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/api/v1',
  wsUrl: (import.meta.env.VITE_WS_URL as string | undefined) ?? 'ws://localhost:3001/ws',
  solanaCluster: (import.meta.env.VITE_SOLANA_CLUSTER as string | undefined) ?? 'devnet',
};
