import type { FastifyBaseLogger } from 'fastify';
import {
  createNoopAudiusAdapter,
  createNoopBlinksAdapter,
  createNoopMagicBlockAdapter,
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

  return {
    store,
    roomHub,
    prismaMirror,
    dbReady,
    integrations: {
      magicBlock: createNoopMagicBlockAdapter(config.featureFlags),
      audius: createNoopAudiusAdapter(config.featureFlags),
      blinks: createNoopBlinksAdapter(config.featureFlags),
    },
  };
}
