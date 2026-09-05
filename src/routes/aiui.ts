import { Router } from 'express';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { AnswerPipeline } from '../pipeline.js';
import type { SessionStore } from '../session/store.js';
import { buildAiuiResponse, parseAiuiRequest } from '../aiui/protocol.js';
import { splitForHud } from '../text/speech.js';

export function createAiuiRouter(
  config: Config,
  answer: AnswerPipeline,
  sessions: SessionStore,
  logger: Logger,
): Router {
  const router = Router();

  router.post('/webhook', async (req, res) => {
    const parsed = parseAiuiRequest(req.body);
    if (!parsed) {
      logger.warn('Не нашёл текст запроса в теле вебхука', {
        keys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
      });
      res.status(400).json({ code: 400, message: 'не найден текст запроса' });
      return;
    }

    // Команда сброса контекста — удобна, когда очки «помнят» лишнее.
    if (/^(сброс|сбрось контекст|新对话|reset)$/i.test(parsed.text)) {
      sessions.reset(parsed.sessionId);
      const speech = 'Контекст очищен.';
      res.json(
        buildAiuiResponse(
          config.AIUI_RESPONSE_FORMAT,
          {
            answer: speech,
            speech,
            chunks: splitForHud(speech, config.HUD_CHUNK_CHARS),
            code: [],
            sessionId: parsed.sessionId,
            model: 'n/a',
            latencyMs: 0,
          },
          parsed.raw,
          config.AIUI_SERVICE_NAME,
        ),
      );
      return;
    }

    try {
      const payload = await answer({ text: parsed.text, sessionId: parsed.sessionId });
      logger.info('Ответ отдан в AIUI', {
        sessionId: parsed.sessionId,
        latencyMs: payload.latencyMs,
        speechChars: payload.speech.length,
        codeBlocks: payload.code.length,
      });
      res.json(
        buildAiuiResponse(config.AIUI_RESPONSE_FORMAT, payload, parsed.raw, config.AIUI_SERVICE_NAME),
      );
    } catch (error) {
      // Тишина в очках хуже, чем короткая честная фраза, поэтому отвечаем 200 с фолбэком.
      logger.error('Claude не ответил', {
        sessionId: parsed.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      const speech = config.FALLBACK_ANSWER;
      res.json(
        buildAiuiResponse(
          config.AIUI_RESPONSE_FORMAT,
          {
            answer: speech,
            speech,
            chunks: splitForHud(speech, config.HUD_CHUNK_CHARS),
            code: [],
            sessionId: parsed.sessionId,
            model: config.CLAUDE_MODEL,
            latencyMs: 0,
          },
          parsed.raw,
          config.AIUI_SERVICE_NAME,
        ),
      );
    }
  });

  return router;
}
