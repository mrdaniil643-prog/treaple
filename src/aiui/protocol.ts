import type { CodeBlock } from '../text/speech.js';

/**
 * AIUI Studio позволяет настроить формат вебхука по-разному (кастомный навык,
 * постобработка семантики, «открытые вопросы»), поэтому парсер намеренно
 * толерантен: ищем текст запроса и идентификатор сессии по типовым путям.
 * Если ваша конфигурация кладёт их иначе — допишите путь в списки ниже.
 */

export type AiuiResponseFormat = 'skill' | 'postprocess' | 'plain';

export interface ParsedAiuiRequest {
  text: string;
  sessionId: string;
  deviceId: string | null;
  raw: Record<string, unknown>;
}

const TEXT_PATHS = [
  'text',
  'query',
  'question',
  'content',
  'rawText',
  'raw_text',
  'request.text',
  'request.query',
  'request.rawText',
  'data.text',
  'data.query',
  'intent.text',
  'intent.query',
  'semantic.text',
  'nlp.text',
  'result.text',
  'payload.text',
];

const SESSION_PATHS = [
  'sid',
  'sessionId',
  'session_id',
  'session.sessionId',
  'request.sid',
  'request.sessionId',
  'data.sid',
  'context.sessionId',
  'context.sid',
];

const DEVICE_PATHS = [
  'deviceId',
  'device_id',
  'did',
  'uid',
  'context.deviceId',
  'context.did',
  'request.deviceId',
  'data.deviceId',
];

function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function firstString(source: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = getPath(source, path);
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

/** Достаёт запрос пользователя из тела вебхука. Возвращает null, если текста нет. */
export function parseAiuiRequest(body: unknown): ParsedAiuiRequest | null {
  if (body === null || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;

  const text = firstString(raw, TEXT_PATHS);
  if (!text) return null;

  const deviceId = firstString(raw, DEVICE_PATHS);
  const sessionId = firstString(raw, SESSION_PATHS) ?? deviceId ?? 'anonymous';

  return { text, sessionId, deviceId, raw };
}

export interface AnswerPayload {
  /** Полный ответ модели (markdown). */
  answer: string;
  /** Текст для синтеза речи — без markdown и кода. */
  speech: string;
  /** Ответ, нарезанный под ширину HUD. */
  chunks: string[];
  code: CodeBlock[];
  sessionId: string;
  model: string;
  latencyMs: number;
}

/**
 * Собирает тело ответа под выбранный формат AIUI.
 * Дополнительные поля кладём в `claude` — платформа их игнорирует,
 * а прошивка очков может использовать для вывода кода на экран.
 */
/**
 * Компактное тело ответа: его же отдаёт /v1/chat приложению на очках.
 */
export function toPlainBody(payload: AnswerPayload): Record<string, unknown> {
  return {
    sessionId: payload.sessionId,
    answer: payload.speech,
    markdown: payload.answer,
    chunks: payload.chunks,
    codeBlocks: payload.code,
    model: payload.model,
    latencyMs: payload.latencyMs,
  };
}

export function buildAiuiResponse(
  format: AiuiResponseFormat,
  payload: AnswerPayload,
  raw: Record<string, unknown>,
  serviceName: string,
): Record<string, unknown> {
  const extra = {
    claude: {
      model: payload.model,
      latencyMs: payload.latencyMs,
      chunks: payload.chunks,
      codeBlocks: payload.code,
      markdown: payload.answer,
    },
  };

  if (format === 'postprocess') {
    // Постобработка: возвращаем исходную структуру с подменённым ответом.
    return {
      ...raw,
      service: serviceName,
      answer: { type: 'T', text: payload.speech },
      ...extra,
    };
  }

  if (format === 'plain') return toPlainBody(payload);

  // format === 'skill'
  return {
    code: 0,
    message: 'success',
    sid: payload.sessionId,
    service: serviceName,
    data: {
      result: { answer: payload.speech },
      answer: { type: 'T', text: payload.speech },
    },
    ...extra,
  };
}
