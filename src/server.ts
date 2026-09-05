import express, { type Express } from 'express';
import type { Config } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { createClaudeClient, type ClaudeClient } from './claude/client.js';
import { SessionStore } from './session/store.js';
import { createAnswerPipeline } from './pipeline.js';
import { createAuthMiddleware } from './security/auth.js';
import { createAiuiRouter } from './routes/aiui.js';
import { createChatRouter } from './routes/chat.js';

export interface BuildAppOptions {
  config: Config;
  /** Подменяется в тестах, чтобы не ходить в сеть. */
  claude?: ClaudeClient;
  logger?: Logger;
}

export function buildApp({ config, claude, logger }: BuildAppOptions): Express {
  const log = logger ?? createLogger(config.LOG_LEVEL);
  const claudeClient = claude ?? createClaudeClient(config);

  const sessions = new SessionStore({
    ttlMs: config.SESSION_TTL_MS,
    maxTurns: config.SESSION_MAX_TURNS,
    maxEntries: config.SESSION_MAX_ENTRIES,
  });
  const answer = createAnswerPipeline(config, claudeClient, sessions);

  const app = express();
  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: '256kb',
      // Сырое тело нужно для проверки HMAC-подписи вебхука.
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = Buffer.from(buf);
      },
    }),
  );

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, model: config.CLAUDE_MODEL, sessions: sessions.size });
  });

  const auth = createAuthMiddleware(config, log);
  app.use('/aiui', auth, createAiuiRouter(config, answer, sessions, log));
  app.use('/v1', auth, createChatRouter(answer, sessions, log));

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
