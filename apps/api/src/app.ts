import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { wsClientMessageSchema } from '@jamming/shared-types';
import type { AppConfig } from './config.js';
import { registerActionRoutes } from './routes/actions.js';
import { registerApiRoutes } from './routes/api.js';
import { registerHealthRoutes } from './routes/health.js';
import { parseOrThrow } from './lib/http.js';
import { createRuntimeServices, type RuntimeServices } from './services/runtime.js';

export type BuildAppOptions = {
  config: AppConfig;
  services?: RuntimeServices;
};

export async function buildApp(options: BuildAppOptions): Promise<{ app: FastifyInstance; services: RuntimeServices }> {
  const app = Fastify({
    logger:
      options.config.nodeEnv === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:standard' },
            },
          }
        : true,
  });

  const services = options.services ?? (await createRuntimeServices(options.config, app.log));

  await app.register(cors, { origin: true });
  await app.register(websocket);

  registerHealthRoutes(app, options.config, services);
  registerApiRoutes(app, services);
  registerActionRoutes(app, services);

  app.get('/ws', { websocket: true }, (socket) => {
    socket.on('message', (raw: unknown) => {
      try {
        const message = parseOrThrow(wsClientMessageSchema, JSON.parse(String(raw)));

        if (message.type === 'room.subscribe') {
          services.roomHub.subscribe(message.payload.roomId, socket);
          const currentRound = services.store.getCurrentRoundSummary(message.payload.roomId);
          services.roomHub.emit(message.payload.roomId, 'room.state.updated', {
            roomId: message.payload.roomId,
            currentRound,
          });
          return;
        }

        if (message.type === 'room.unsubscribe') {
          services.roomHub.unsubscribe(message.payload.roomId, socket);
        }
      } catch {
        try {
          socket.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid websocket message' } }));
        } catch {
          // ignore socket send failures
        }
      }
    });

    socket.on('close', () => {
      services.roomHub.unsubscribeAll(socket);
    });
  });

  app.addHook('onClose', async () => {
    // Future: close external adapters / DB clients when runtime services expose explicit teardown.
  });

  return { app, services };
}
