export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

interface Entry {
  turns: Turn[];
  updatedAt: number;
}

export interface SessionStoreOptions {
  ttlMs: number;
  /** Сколько пар «вопрос-ответ» держим в контексте. */
  maxTurns: number;
  /** Верхняя граница числа живых сессий (защита от роста памяти). */
  maxEntries: number;
  now?: () => number;
}

/**
 * Диалоговая память в памяти процесса. Для нескольких инстансов
 * замените на Redis — интерфейс намеренно узкий (get/append/reset).
 */
export class SessionStore {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(private readonly opts: SessionStoreOptions) {
    this.now = opts.now ?? Date.now;
  }

  get(id: string): Turn[] {
    const entry = this.entries.get(id);
    if (!entry) return [];
    if (this.now() - entry.updatedAt > this.opts.ttlMs) {
      this.entries.delete(id);
      return [];
    }
    // Обновляем позицию в Map, чтобы вытеснялись действительно старые сессии.
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry.turns;
  }

  append(id: string, ...turns: Turn[]): void {
    const existing = this.get(id);
    const merged = [...existing, ...turns].slice(-this.opts.maxTurns * 2);
    this.entries.delete(id);
    this.entries.set(id, { turns: merged, updatedAt: this.now() });
    this.evict();
  }

  reset(id: string): void {
    this.entries.delete(id);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Удаляет протухшие записи и лишние сессии сверх лимита (самые старые). */
  private evict(): void {
    const cutoff = this.now() - this.opts.ttlMs;
    for (const [key, entry] of this.entries) {
      if (entry.updatedAt <= cutoff) this.entries.delete(key);
    }
    while (this.entries.size > this.opts.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}
