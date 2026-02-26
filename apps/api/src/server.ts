import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();

const main = async () => {
  const { app } = await buildApp({ config });

  try {
    await app.listen({ host: '0.0.0.0', port: config.port });
    app.log.info({ port: config.port }, 'API server listening');
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start API server');
    process.exitCode = 1;
  }
};

void main();
