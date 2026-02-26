import type { FastifyBaseLogger } from 'fastify';
import {
  createAudiusSdkAdapter,
  createBlinksActionsAdapter,
  createNoopAudiusAdapter,
  createNoopBlinksAdapter,
  createNoopMagicBlockAdapter,
  createMagicBlockSoarAdapter,
  type AudiusAdapter,
  type BlinksAdapter,
  type MagicBlockAdapter,
} from '@jamming/integrations';
import type { AppConfig } from '../config.js';
import { createPrismaClient, tryConnectPrisma } from '../lib/prisma.js';
import { GameStore } from './gameStore.js';
import { PrismaMirror } from './prismaMirror.js';
import { RoomHub } from '../ws/roomHub.js';

export type RuntimeServices = {
  store: GameStore;
  roomHub: RoomHub;
  prismaMirror: PrismaMirror;
  dbReady: boolean;
  integrations: {
    magicBlock: MagicBlockAdapter;
    audius: AudiusAdapter;
    blinks: BlinksAdapter;
  };
};

export async function createRuntimeServices(config: AppConfig, logger: FastifyBaseLogger): Promise<RuntimeServices> {
  const prisma = createPrismaClient(config.databaseUrl);
  const dbReady = await tryConnectPrisma(prisma);
  if (!dbReady) {
    logger.warn('Postgres not reachable. API will run with in-memory state and disabled Prisma mirror sync.');
    await prisma.$disconnect().catch(() => undefined);
  }

  const roomHub = new RoomHub();
  const store = new GameStore();
  const prismaMirror = new PrismaMirror(dbReady ? prisma : null, logger);

  const useNoopAdapters = config.nodeEnv === 'test';
  const integrations = useNoopAdapters
    ? {
        magicBlock: createNoopMagicBlockAdapter(config.featureFlags),
        audius: createNoopAudiusAdapter(config.featureFlags),
        blinks: createNoopBlinksAdapter(config.featureFlags, {
          enabled: config.featureFlags.enableBlinks,
          cluster: config.solanaCluster,
          solanaRpcUrl: config.integrations.blinks.solanaRpcUrl,
        }),
      }
    : {
        magicBlock: createMagicBlockSoarAdapter(
          {
            enabled: config.featureFlags.enableMagicBlock,
            cluster: config.solanaCluster,
            solanaRpcUrl: config.integrations.magicblock.solanaRpcUrl,
            ...(config.integrations.magicblock.authorityPrivateKey
              ? { authorityPrivateKey: config.integrations.magicblock.authorityPrivateKey }
              : {}),
            ...(config.integrations.magicblock.soarGamePubkey
              ? { soarGamePubkey: config.integrations.magicblock.soarGamePubkey }
              : {}),
            ...(config.integrations.magicblock.soarLeaderboardPubkey
              ? { soarLeaderboardPubkey: config.integrations.magicblock.soarLeaderboardPubkey }
              : {}),
            ...(config.integrations.magicblock.soarAchievementPubkey
              ? { soarAchievementPubkey: config.integrations.magicblock.soarAchievementPubkey }
              : {}),
          },
          logger,
        ),
        audius: createAudiusSdkAdapter(
          {
            enabled: config.featureFlags.enableAudius,
            appName: config.audiusAppName,
            writeMode: config.integrations.audius.writeMode,
            ...(config.integrations.audius.apiKey ? { apiKey: config.integrations.audius.apiKey } : {}),
            ...(config.integrations.audius.apiSecret ? { apiSecret: config.integrations.audius.apiSecret } : {}),
            ...(config.integrations.audius.bearerToken
              ? { bearerToken: config.integrations.audius.bearerToken }
              : {}),
          },
          logger,
        ),
        blinks: createBlinksActionsAdapter(
          {
            enabled: config.featureFlags.enableBlinks,
            cluster: config.solanaCluster,
            solanaRpcUrl: config.integrations.blinks.solanaRpcUrl,
          },
          logger,
        ),
      };

  return {
    store,
    roomHub,
    prismaMirror,
    dbReady,
    integrations,
  };
}
