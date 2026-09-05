import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config.js';
import { buildSystemPrompt } from './prompt.js';

export interface AskInput {
  /** История диалога (последний элемент — текущий вопрос пользователя). */
  messages: Anthropic.MessageParam[];
}

export interface AskResult {
  text: string;
  model: string;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ClaudeClient {
  ask(input: AskInput): Promise<AskResult>;
  askStream(input: AskInput, onDelta: (chunk: string) => void): Promise<AskResult>;
}

function collectText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

function toResult(message: Anthropic.Message): AskResult {
  return {
    text: collectText(message),
    model: message.model,
    stopReason: message.stop_reason ?? null,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

export function createClaudeClient(config: Config): ClaudeClient {
  const client = new Anthropic({
    apiKey: config.ANTHROPIC_API_KEY,
    ...(config.ANTHROPIC_BASE_URL ? { baseURL: config.ANTHROPIC_BASE_URL } : {}),
    timeout: config.CLAUDE_TIMEOUT_MS, // в TS SDK таймаут задаётся в миллисекундах
    maxRetries: config.CLAUDE_MAX_RETRIES,
  });

  const system = buildSystemPrompt(config.CLAUDE_SYSTEM_PROMPT);

  /**
   * Базовые параметры запроса. `output_config.effort` управляет глубиной
   * рассуждений: для голосового сценария держим её низкой ради задержки.
   * Сэмплирующие параметры (temperature/top_p) на Opus 5 не передаются — они удалены из API.
   */
  const baseParams = (messages: Anthropic.MessageParam[]) => ({
    model: config.CLAUDE_MODEL,
    max_tokens: config.CLAUDE_MAX_TOKENS,
    system,
    output_config: { effort: config.CLAUDE_EFFORT },
    messages,
  });

  return {
    async ask({ messages }) {
      const message = await client.messages.create(
        baseParams(messages) as unknown as Anthropic.MessageCreateParamsNonStreaming,
      );
      return toResult(message);
    },

    async askStream({ messages }, onDelta) {
      const stream = client.messages.stream(
        baseParams(messages) as unknown as Anthropic.MessageCreateParamsStreaming,
      );
      stream.on('text', (text) => onDelta(text));
      const message = await stream.finalMessage();
      return toResult(message);
    },
  };
}
