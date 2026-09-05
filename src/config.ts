import { z } from 'zod';

/**
 * Конфигурация моста. Всё читается из окружения — секреты в репозиторий не попадают.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY обязателен'),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  CLAUDE_MODEL: z.string().default('claude-opus-5'),
  // Глубина рассуждений: для голосового сценария важна скорость.
  CLAUDE_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  CLAUDE_MAX_TOKENS: z.coerce.number().int().positive().default(400),
  // AIUI ждёт ответ быстро — держим бюджет ниже её таймаута.
  CLAUDE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  CLAUDE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  CLAUDE_SYSTEM_PROMPT: z.string().optional(),

  // Формат ответа для AIUI: см. docs/AIUI-SETUP.md
  AIUI_RESPONSE_FORMAT: z.enum(['skill', 'postprocess', 'plain']).default('skill'),
  AIUI_SERVICE_NAME: z.string().default('claude'),

  // Защита вебхука (опционально, но настоятельно рекомендуется)
  WEBHOOK_SECRET: z.string().optional(),
  WEBHOOK_SIGNATURE_HEADER: z.string().default('x-aiui-signature'),
  WEBHOOK_TOKEN_HEADER: z.string().default('x-webhook-token'),

  // Диалоговая память
  SESSION_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  SESSION_MAX_TURNS: z.coerce.number().int().positive().default(8),
  SESSION_MAX_ENTRIES: z.coerce.number().int().positive().default(2000),

  // Вывод на очки
  SPEECH_MAX_CHARS: z.coerce.number().int().positive().default(320),
  HUD_CHUNK_CHARS: z.coerce.number().int().positive().default(72),

  FALLBACK_ANSWER: z
    .string()
    .default('Не получилось связаться с Claude. Повтори вопрос, пожалуйста.'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${details}`);
  }
  return parsed.data;
}
