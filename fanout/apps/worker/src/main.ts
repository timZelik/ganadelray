import { loadEnvironment } from '@fanout/config';
import { createLogger } from '@fanout/logging';
import { startWorker } from './bootstrap.ts';

const environment = loadEnvironment();
const logger = createLogger({ serviceName: 'fanout-worker', level: environment.LOG_LEVEL, pretty: environment.LOG_PRETTY });
const runningWorker = await startWorker(environment, logger);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'Shutting down: finishing active jobs');
    void runningWorker.stop().then(() => process.exit(0));
  });
}
