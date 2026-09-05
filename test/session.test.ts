import { describe, expect, it } from 'vitest';
import { SessionStore } from '../src/session/store.js';

function storeWithClock(ttlMs = 1000, maxTurns = 2, maxEntries = 3) {
  let now = 0;
  const store = new SessionStore({ ttlMs, maxTurns, maxEntries, now: () => now });
  return { store, tick: (ms: number) => (now += ms) };
}

describe('SessionStore', () => {
  it('хранит историю и режет её до maxTurns пар', () => {
    const { store } = storeWithClock();
    for (let i = 0; i < 4; i += 1) {
      store.append('s', { role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` });
    }
    expect(store.get('s')).toEqual([
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' },
      { role: 'assistant', content: 'a3' },
    ]);
  });

  it('забывает сессию после TTL', () => {
    const { store, tick } = storeWithClock(1000);
    store.append('s', { role: 'user', content: 'q' });
    tick(1001);
    expect(store.get('s')).toEqual([]);
  });

  it('вытесняет самые старые сессии сверх лимита', () => {
    const { store, tick } = storeWithClock(10_000, 2, 2);
    store.append('a', { role: 'user', content: '1' });
    tick(1);
    store.append('b', { role: 'user', content: '2' });
    tick(1);
    store.append('c', { role: 'user', content: '3' });
    expect(store.get('a')).toEqual([]);
    expect(store.get('c')).toHaveLength(1);
  });

  it('reset очищает историю', () => {
    const { store } = storeWithClock();
    store.append('s', { role: 'user', content: 'q' });
    store.reset('s');
    expect(store.get('s')).toEqual([]);
  });
});
