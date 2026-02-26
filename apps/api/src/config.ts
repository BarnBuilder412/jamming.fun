import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/jamming_fun'),
  ENABLE_MAGICBLOCK: z.string().optional().default('true'),
  ENABLE_AUDIOUS: z.string().optional().default('true'),
  ENABLE_BLINKS: z.string().optional().default('true'),
  SOLANA_CLUSTER: z.enum(['devnet', 'mainnet-beta']).default('devnet'),
  AUDIOUS_APP_NAME: z.string().default('jamming.fun'),
});

function toBooleanFlag(value: string): boolean {
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    featureFlags: {
      enableMagicBlock: toBooleanFlag(parsed.ENABLE_MAGICBLOCK),
      enableAudius: toBooleanFlag(parsed.ENABLE_AUDIOUS),
      enableBlinks: toBooleanFlag(parsed.ENABLE_BLINKS),
    },
    solanaCluster: parsed.SOLANA_CLUSTER,
    audiusAppName: parsed.AUDIOUS_APP_NAME,
  };
}
