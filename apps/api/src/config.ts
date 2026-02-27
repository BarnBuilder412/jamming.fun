import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/jamming_fun'),
  ENABLE_MAGICBLOCK: z.string().optional().default('true'),
  ENABLE_AUDIOUS: z.string().optional().default('true'),
  ENABLE_BLINKS: z.string().optional().default('true'),
  ENABLE_CONTRACT_PROGRAM: z.string().optional().default('true'),
  SOLANA_CLUSTER: z.enum(['devnet', 'mainnet-beta']).default('devnet'),
  SOLANA_RPC_URL: z.string().url().optional(),
  AUDIOUS_APP_NAME: z.string().default('jamming.fun'),
  AUDIOUS_API_KEY: z.string().optional(),
  AUDIOUS_API_SECRET: z.string().optional(),
  AUDIOUS_BEARER_TOKEN: z.string().optional(),
  AUDIOUS_WRITE_MODE: z.enum(['read_only', 'signed']).default('read_only'),
  MAGICBLOCK_SOLANA_RPC_URL: z.string().url().optional(),
  MAGICBLOCK_AUTH_WALLET_PRIVATE_KEY: z.string().optional(),
  MAGICBLOCK_SOAR_GAME_PUBKEY: z.string().optional(),
  MAGICBLOCK_SOAR_LEADERBOARD_PUBKEY: z.string().optional(),
  MAGICBLOCK_SOAR_ACHIEVEMENT_PUBKEY: z.string().optional(),
  CONTRACT_PROGRAM_ID: z.string().optional(),
  CONTRACT_QUOTE_MINT: z.string().optional(),
  CONTRACT_REWARD_MINT: z.string().optional(),
  BLINKS_SOLANA_RPC_URL: z.string().url().optional(),
});

function toBooleanFlag(value: string): boolean {
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

export type AppConfig = ReturnType<typeof loadConfig>;

function defaultRpcForCluster(cluster: 'devnet' | 'mainnet-beta'): string {
  return cluster === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const solanaRpcUrl = parsed.SOLANA_RPC_URL ?? defaultRpcForCluster(parsed.SOLANA_CLUSTER);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    featureFlags: {
      enableMagicBlock: toBooleanFlag(parsed.ENABLE_MAGICBLOCK),
      enableAudius: toBooleanFlag(parsed.ENABLE_AUDIOUS),
      enableBlinks: toBooleanFlag(parsed.ENABLE_BLINKS),
      enableContractProgram: toBooleanFlag(parsed.ENABLE_CONTRACT_PROGRAM),
    },
    solanaCluster: parsed.SOLANA_CLUSTER,
    solanaRpcUrl,
    audiusAppName: parsed.AUDIOUS_APP_NAME,
    integrations: {
      magicblock: {
        solanaRpcUrl: parsed.MAGICBLOCK_SOLANA_RPC_URL ?? solanaRpcUrl,
        authorityPrivateKey: parsed.MAGICBLOCK_AUTH_WALLET_PRIVATE_KEY,
        soarGamePubkey: parsed.MAGICBLOCK_SOAR_GAME_PUBKEY,
        soarLeaderboardPubkey: parsed.MAGICBLOCK_SOAR_LEADERBOARD_PUBKEY,
        soarAchievementPubkey: parsed.MAGICBLOCK_SOAR_ACHIEVEMENT_PUBKEY,
        contractProgramId: parsed.CONTRACT_PROGRAM_ID,
        contractQuoteMint: parsed.CONTRACT_QUOTE_MINT,
        contractRewardMint: parsed.CONTRACT_REWARD_MINT,
      },
      audius: {
        apiKey: parsed.AUDIOUS_API_KEY,
        apiSecret: parsed.AUDIOUS_API_SECRET,
        bearerToken: parsed.AUDIOUS_BEARER_TOKEN,
        writeMode: parsed.AUDIOUS_WRITE_MODE,
      },
      blinks: {
        solanaRpcUrl: parsed.BLINKS_SOLANA_RPC_URL ?? solanaRpcUrl,
      },
    },
  };
}
