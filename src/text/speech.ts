/**
 * Подготовка ответа Claude к выводу на очки:
 *  - речь (TTS) не должна содержать markdown и код;
 *  - HUD показывает короткие строки, поэтому текст режется на чанки;
 *  - код уезжает отдельным полем — его читать вслух бессмысленно.
 */

export interface CodeBlock {
  lang: string | null;
  code: string;
}

const FENCE_RE = /```([\w+-]*)\r?\n([\s\S]*?)```/g;

/** Достаёт блоки кода из markdown-ответа. */
export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const match of markdown.matchAll(FENCE_RE)) {
    const lang = match[1] ? match[1].trim() : '';
    blocks.push({ lang: lang.length > 0 ? lang : null, code: (match[2] ?? '').replace(/\s+$/, '') });
  }
  return blocks;
}

/**
 * Превращает markdown в текст, пригодный для синтеза речи.
 * Блоки кода заменяются короткой пометкой — сам код показывается на HUD/телефоне.
 */
export function toSpeech(markdown: string, maxChars = 320): string {
  let text = markdown;

  let codeCount = 0;
  text = text.replace(FENCE_RE, () => {
    codeCount += 1;
    return ' [код] ';
  });

  text = text
    .replace(/`([^`]+)`/g, '$1') // инлайн-код
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // картинки
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // ссылки
    .replace(/^\s{0,3}#{1,6}\s*/gm, '') // заголовки
    .replace(/^\s{0,3}>\s?/gm, '') // цитаты
    .replace(/^\s*[-*+]\s+/gm, '') // маркеры списка
    .replace(/^\s*\d+[.)]\s+/gm, '') // нумерованный список
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\w)[*_]([^*_]+)[*_](?!\w)/g, '$1')
    .replace(/^\s*([-*_]\s*){3,}\s*$/gm, ' ') // горизонтальные линии
    .replace(/\|/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\s*\.\s*\.\s*/g, '. ')
    .trim();

  if (codeCount > 0) {
    const suffix = codeCount === 1 ? 'Код показал на экране.' : 'Код показал на экране.';
    text = `${text} ${suffix}`.trim();
  }

  return truncateAtBoundary(text, maxChars);
}

/** Обрезает по границе предложения/слова, чтобы TTS не оборвался посреди слова. */
export function truncateAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, maxChars);
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentenceEnd > maxChars * 0.5) return head.slice(0, sentenceEnd + 1).trim();
  const wordEnd = head.lastIndexOf(' ');
  return (wordEnd > 0 ? head.slice(0, wordEnd) : head).trim() + '…';
}

/** Режет текст на строки под ширину HUD, стараясь не рвать слова. */
export function splitForHud(text: string, chunkChars = 72): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return [];

  const chunks: string[] = [];
  let current = '';
  for (const word of normalized.split(' ')) {
    if (word.length > chunkChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += chunkChars) chunks.push(word.slice(i, i + chunkChars));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > chunkChars) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
