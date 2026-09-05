import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/server.js';
import { createLogger } from '../src/logger.js';
import type { ClaudeClient } from '../src/claude/client.js';

const silentLogger = createLogger('error');

function makeClaude(text: string): ClaudeClient {
  const result = {
    text,
    model: 'claude-opus-5',
    stopReason: 'end_turn' as string | null,
    usage: { inputTokens: 10, outputTokens: 20 },
  };
  return {
    ask: vi.fn(async () => result),
    askStream: vi.fn(async (_input, onDelta: (c: string) => void) => {
      onDelta(text);
      return result;
    }),
  };
}

function makeApp(env: Record<string, string> = {}, claude = makeClaude('Готово. ```ts\nconst x = 1;\n```')) {
  const config = loadConfig({ ANTHROPIC_API_KEY: 'test-key', ...env } as NodeJS.ProcessEnv);
  return { app: buildApp({ config, claude, logger: silentLogger }), claude };
}

describe('POST /aiui/webhook', () => {
  it('отвечает текстом для TTS и отдельно кодом', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/aiui/webhook').send({ sid: 's1', text: 'дай пример' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.result.answer).not.toContain('const x = 1');
    expect(res.body.claude.codeBlocks).toEqual([{ lang: 'ts', code: 'const x = 1;' }]);
    expect(res.body.claude.chunks.length).toBeGreaterThan(0);
  });

  it('держит контекст в рамках одной сессии', async () => {
    const { app, claude } = makeApp();
    await request(app).post('/aiui/webhook').send({ sid: 's2', text: 'первый' });
    await request(app).post('/aiui/webhook').send({ sid: 's2', text: 'второй' });

    const secondCall = (claude.ask as ReturnType<typeof vi.fn>).mock.calls[1]![0];
    expect(secondCall.messages).toHaveLength(3);
    expect(secondCall.messages[0]).toEqual({ role: 'user', content: 'первый' });
  });

  it('сбрасывает контекст по команде', async () => {
    const { app, claude } = makeApp();
    await request(app).post('/aiui/webhook').send({ sid: 's3', text: 'первый' });
    await request(app).post('/aiui/webhook').send({ sid: 's3', text: 'сброс' });
    await request(app).post('/aiui/webhook').send({ sid: 's3', text: 'третий' });

    const lastCall = (claude.ask as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(lastCall.messages).toEqual([{ role: 'user', content: 'третий' }]);
  });

  it('на ошибке модели отдаёт 200 с фолбэком, а не тишину', async () => {
    const failing: ClaudeClient = {
      ask: vi.fn(async () => {
        throw new Error('upstream down');
      }),
      askStream: vi.fn(async () => {
        throw new Error('upstream down');
      }),
    };
    const { app } = makeApp({}, failing);
    const res = await request(app).post('/aiui/webhook').send({ sid: 's4', text: 'привет' });

    expect(res.status).toBe(200);
    expect(res.body.data.result.answer).toContain('Не получилось связаться с Claude');
  });

  it('400, если в теле нет текста запроса', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/aiui/webhook').send({ sid: 's5' });
    expect(res.status).toBe(400);
  });
});

describe('защита вебхука', () => {
  const env = { WEBHOOK_SECRET: 'topsecret' };

  it('без заголовков — 401', async () => {
    const { app } = makeApp(env);
    const res = await request(app).post('/aiui/webhook').send({ sid: 's', text: 'x' });
    expect(res.status).toBe(401);
  });

  it('пропускает по статическому токену', async () => {
    const { app } = makeApp(env);
    const res = await request(app)
      .post('/aiui/webhook')
      .set('x-webhook-token', 'topsecret')
      .send({ sid: 's', text: 'x' });
    expect(res.status).toBe(200);
  });

  it('пропускает по HMAC-подписи тела', async () => {
    const { app } = makeApp(env);
    const body = JSON.stringify({ sid: 's', text: 'x' });
    const signature = crypto.createHmac('sha256', 'topsecret').update(body).digest('hex');
    const res = await request(app)
      .post('/aiui/webhook')
      .set('content-type', 'application/json')
      .set('x-aiui-signature', `sha256=${signature}`)
      .send(body);
    expect(res.status).toBe(200);
  });

  it('не пропускает с чужой подписью', async () => {
    const { app } = makeApp(env);
    const res = await request(app)
      .post('/aiui/webhook')
      .set('x-aiui-signature', 'sha256=deadbeef')
      .send({ sid: 's', text: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('прямой API для приложения на очках', () => {
  it('/v1/chat отдаёт разобранный ответ', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/v1/chat').send({ text: 'привет', sessionId: 'g1' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBeTruthy();
    expect(res.body.markdown).toContain('const x = 1');
    expect(res.body.model).toBe('claude-opus-5');
  });

  it('/v1/chat/stream шлёт SSE-события', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/v1/chat/stream').send({ text: 'привет' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: delta');
    expect(res.text).toContain('event: done');
  });

  it('/healthz живой', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/healthz');
    expect(res.body.ok).toBe(true);
  });
});
