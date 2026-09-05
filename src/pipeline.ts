import type { Config } from './config.js';
import type { ClaudeClient } from './claude/client.js';
import type { SessionStore } from './session/store.js';
import type { AnswerPayload } from './aiui/protocol.js';
import { extractCodeBlocks, splitForHud, toSpeech } from './text/speech.js';

export interface AnswerRequest {
  text: string;
  sessionId: string;
}

/**
 * Общий путь ответа: история → Claude → разбор ответа на речь, HUD-строки и код.
 * Используется и вебхуком AIUI, и прямым JSON-эндпоинтом для приложения на очках.
 */
export function createAnswerPipeline(
  config: Config,
  claude: ClaudeClient,
  sessions: SessionStore,
) {
  return async function answer(
    { text, sessionId }: AnswerRequest,
    onDelta?: (chunk: string) => void,
  ): Promise<AnswerPayload> {
    const startedAt = Date.now();
    const history = sessions.get(sessionId);
    const messages = [...history, { role: 'user' as const, content: text }];

    const result = onDelta
      ? await claude.askStream({ messages }, onDelta)
      : await claude.ask({ messages });

    if (result.text.length > 0) {
      sessions.append(
        sessionId,
        { role: 'user', content: text },
        { role: 'assistant', content: result.text },
      );
    }

    const speech = toSpeech(result.text, config.SPEECH_MAX_CHARS);
    return {
      answer: result.text,
      speech,
      chunks: splitForHud(speech, config.HUD_CHUNK_CHARS),
      code: extractCodeBlocks(result.text),
      sessionId,
      model: result.model,
      latencyMs: Date.now() - startedAt,
    };
  };
}

export type AnswerPipeline = ReturnType<typeof createAnswerPipeline>;
