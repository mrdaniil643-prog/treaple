import { describe, expect, it } from 'vitest';
import { extractCodeBlocks, splitForHud, toSpeech, truncateAtBoundary } from '../src/text/speech.js';

describe('toSpeech', () => {
  it('убирает markdown-разметку', () => {
    const out = toSpeech('## Заголовок\n\n- **важно** это `код`\n- [ссылка](https://x.dev)');
    expect(out).not.toMatch(/[#*`\[\]]/);
    expect(out).toContain('важно');
    expect(out).toContain('ссылка');
  });

  it('заменяет блок кода пометкой, а не читает его вслух', () => {
    const out = toSpeech('Держи:\n\n```ts\nconst a = 1;\n```\n');
    expect(out).not.toContain('const a = 1');
    expect(out).toContain('Код показал на экране.');
  });

  it('обрезает длинный ответ по границе предложения', () => {
    const long = 'Первое предложение. ' + 'Ещё слова '.repeat(50);
    expect(toSpeech(long, 40).length).toBeLessThanOrEqual(41);
  });
});

describe('truncateAtBoundary', () => {
  it('не режет слово посередине', () => {
    const out = truncateAtBoundary('абвгдеёжз ийклмнопр', 14);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('ийк');
  });

  it('возвращает текст как есть, если он короче лимита', () => {
    expect(truncateAtBoundary('коротко', 100)).toBe('коротко');
  });
});

describe('splitForHud', () => {
  it('режет по словам под ширину строки', () => {
    const chunks = splitForHud('раз два три четыре пять шесть', 10);
    expect(chunks.every((c) => c.length <= 10)).toBe(true);
    expect(chunks.join(' ')).toBe('раз два три четыре пять шесть');
  });

  it('рвёт слово, которое длиннее строки', () => {
    const chunks = splitForHud('a'.repeat(25), 10);
    expect(chunks).toEqual(['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(5)]);
  });

  it('на пустом тексте возвращает пустой список', () => {
    expect(splitForHud('   ')).toEqual([]);
  });
});

describe('extractCodeBlocks', () => {
  it('достаёт язык и тело блока', () => {
    const blocks = extractCodeBlocks('текст\n```python\nprint(1)\n```\nи ещё\n```\nplain\n```');
    expect(blocks).toEqual([
      { lang: 'python', code: 'print(1)' },
      { lang: null, code: 'plain' },
    ]);
  });
});
