import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { buildApp } from './server.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const app = buildApp({ config, logger });

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info('Мост Rokid ↔ Claude запущен', {
    host: config.HOST,
    port: config.PORT,
    model: config.CLAUDE_MODEL,
    responseFormat: config.AIUI_RESPONSE_FORMAT,
  });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('Останавливаюсь', { signal });
    server.close(() => process.exit(0));
  });
}
