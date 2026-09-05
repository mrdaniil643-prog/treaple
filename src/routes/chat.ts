import { Router } from 'express';
import { z } from 'zod';
import type { Logger } from '../logger.js';
import type { AnswerPipeline } from '../pipeline.js';
import type { SessionStore } from '../session/store.js';
import { toPlainBody } from '../aiui/protocol.js';

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  sessionId: z.string().min(1).max(128).default('anonymous'),
});

/**
 * Прямой JSON/SSE-эндпоинт — для приложения на очках или телефоне-компаньоне,
 * если голосовой конвейер AIUI обходится стороной.
 */
export function createChatRouter(answer: AnswerPipeline, sessions: SessionStore, logger: Logger): Router {
  const router = Router();

  router.post('/chat', async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'bad_request', details: parsed.error.issues });
      return;
    }
    try {
      const payload = await answer(parsed.data);
      res.json(toPlainBody(payload));
    } catch (error) {
      logger.error('Ошибка /v1/chat', { error: error instanceof Error ? error.message : String(error) });
      res.status(502).json({ error: 'upstream_error' });
    }
  });

  router.post('/chat/stream', async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'bad_request', details: parsed.error.issues });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const payload = await answer(parsed.data, (chunk) => send('delta', { text: chunk }));
      send('done', toPlainBody(payload));
    } catch (error) {
      logger.error('Ошибка /v1/chat/stream', {
        error: error instanceof Error ? error.message : String(error),
      });
      send('error', { error: 'upstream_error' });
    } finally {
      res.end();
    }
  });

  router.post('/sessions/:id/reset', (req, res) => {
    sessions.reset(req.params.id);
    res.json({ ok: true });
  });

  return router;
}
