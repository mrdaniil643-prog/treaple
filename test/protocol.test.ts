import { describe, expect, it } from 'vitest';
import { buildAiuiResponse, parseAiuiRequest } from '../src/aiui/protocol.js';

const payload = {
  answer: 'Ответ **с** разметкой',
  speech: 'Ответ с разметкой',
  chunks: ['Ответ с разметкой'],
  code: [],
  sessionId: 'sid-1',
  model: 'claude-opus-5',
  latencyMs: 42,
};

describe('parseAiuiRequest', () => {
  it('читает плоский формат', () => {
    expect(parseAiuiRequest({ sid: 'abc', text: 'привет' })).toMatchObject({
      text: 'привет',
      sessionId: 'abc',
    });
  });

  it('читает вложенный формат', () => {
    expect(parseAiuiRequest({ request: { text: ' как дела ' }, context: { deviceId: 'dev-9' } })).toMatchObject({
      text: 'как дела',
      sessionId: 'dev-9',
      deviceId: 'dev-9',
    });
  });

  it('падает в anonymous без идентификаторов', () => {
    expect(parseAiuiRequest({ query: 'x' })?.sessionId).toBe('anonymous');
  });

  it('возвращает null, если текста нет', () => {
    expect(parseAiuiRequest({ sid: 'abc' })).toBeNull();
    expect(parseAiuiRequest(null)).toBeNull();
    expect(parseAiuiRequest('строка')).toBeNull();
  });
});

describe('buildAiuiResponse', () => {
  it('формат skill отдаёт answer в data.result', () => {
    const body = buildAiuiResponse('skill', payload, { sid: 'sid-1' }, 'claude') as any;
    expect(body.code).toBe(0);
    expect(body.data.result.answer).toBe('Ответ с разметкой');
    expect(body.claude.markdown).toBe('Ответ **с** разметкой');
  });

  it('формат postprocess сохраняет исходные поля', () => {
    const raw = { sid: 'sid-1', intent: { service: 'openqa' } };
    const body = buildAiuiResponse('postprocess', payload, raw, 'claude') as any;
    expect(body.intent).toEqual({ service: 'openqa' });
    expect(body.answer).toEqual({ type: 'T', text: 'Ответ с разметкой' });
  });

  it('формат plain отдаёт компактный JSON', () => {
    const body = buildAiuiResponse('plain', payload, {}, 'claude') as any;
    expect(body).toMatchObject({ answer: 'Ответ с разметкой', sessionId: 'sid-1' });
    expect(body.code).toBeUndefined();
    expect(body.codeBlocks).toEqual([]);
  });
});
