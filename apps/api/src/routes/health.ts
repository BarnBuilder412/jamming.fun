import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import type { RuntimeServices } from '../services/runtime.js';

export function registerHealthRoutes(app: FastifyInstance, config: AppConfig, services: RuntimeServices): void {
  app.get('/healthz', () => ({
    ok: true,
    service: 'jamming-api',
    dbReady: services.dbReady,
    solanaCluster: config.solanaCluster,
    featureFlags: config.featureFlags,
    integrations: {
      magicBlock: services.integrations.magicBlock ? 'configured' : 'missing',
      audius: services.integrations.audius ? 'configured' : 'missing',
      blinks: services.integrations.blinks ? 'configured' : 'missing',
    },
  }));
}
