# Claude в Rokid Glasses — мост через AIUI

HTTP-сервис, который подключает Claude к голосовому конвейеру Rokid Glasses.
Очки распознают речь через AIUI, AIUI зовёт этот вебхук, вебхук спрашивает Claude
и возвращает ответ в двух видах: текст для озвучки и куски для HUD плюс отдельно код.

```
Rokid Glasses ──▶ AIUI (ASR + навык) ──▶ POST /aiui/webhook ──▶ Claude (Messages API)
      ▲                                            │
      └──────── TTS + текст на HUD ◀───────────────┘
```

Ставить на очки ничего не нужно: интеграция настраивается в AIUI Studio,
приложение на очках остаётся штатным.

## Быстрый старт

```bash
npm install
cp .env.example .env         # впишите ANTHROPIC_API_KEY и WEBHOOK_SECRET
npm run dev                  # http://localhost:8787
```

Проверка без очков:

```bash
curl -s localhost:8787/aiui/webhook \
  -H 'content-type: application/json' \
  -H "x-webhook-token: $WEBHOOK_SECRET" \
  -d '{"sid":"test-1","text":"как в TypeScript сделать дебаунс"}' | jq
```

Ответ:

```json
{
  "code": 0,
  "message": "success",
  "sid": "test-1",
  "data": { "result": { "answer": "Оберни вызов в таймер..." } },
  "claude": {
    "model": "claude-opus-5",
    "latencyMs": 1840,
    "chunks": ["Оберни вызов в таймер и сбрасывай", "его на каждом новом событии."],
    "codeBlocks": [{ "lang": "ts", "code": "const debounce = ..." }],
    "markdown": "…полный ответ модели…"
  }
}
```

`data.result.answer` уходит в TTS: markdown вычищен, код вырезан.
Код лежит в `claude.codeBlocks` — его выводят на дисплей, а не читают вслух.

## Эндпоинты

| Метод | Путь | Зачем |
|---|---|---|
| POST | `/aiui/webhook` | Вебхук для AIUI Studio |
| POST | `/v1/chat` | Прямой JSON — для своего приложения на очках или телефоне |
| POST | `/v1/chat/stream` | То же, но SSE: `event: delta` → `event: done` |
| POST | `/v1/sessions/:id/reset` | Сбросить контекст сессии |
| GET | `/healthz` | Живость, текущая модель, число сессий |

Голосом контекст сбрасывается фразой «сброс» / «reset».

## Настройка AIUI Studio

Пошагово — в [docs/AIUI-SETUP.md](docs/AIUI-SETUP.md). Там же — что делать,
если формат тела вебхука в вашей конфигурации отличается от ожидаемого.

## Конфигурация

Все параметры — в [`.env.example`](.env.example). Ключевые:

- `CLAUDE_MODEL` — по умолчанию `claude-opus-5`. Если задержка важнее качества,
  поставьте `claude-haiku-4-5`.
- `CLAUDE_EFFORT` — глубина рассуждений, по умолчанию `low`: голосовой сценарий
  живёт и умирает по задержке. Для сложных вопросов поднимите до `medium`.
- `CLAUDE_MAX_TOKENS` — 400 по умолчанию. Ответ всё равно обрезается до
  `SPEECH_MAX_CHARS` при озвучке.
- `CLAUDE_TIMEOUT_MS` — держите ниже таймаута вебхука в AIUI, иначе платформа
  отвалится раньше нас и пользователь услышит тишину.
- `AIUI_RESPONSE_FORMAT` — `skill` | `postprocess` | `plain`, см. docs/AIUI-SETUP.md.
- `WEBHOOK_SECRET` — общий секрет. Без него вебхук открыт всем, кто знает URL.

## Как устроен ответ

1. `src/pipeline.ts` собирает историю сессии и зовёт Claude.
2. `src/text/speech.ts` вычищает markdown, вырезает блоки кода
   («Код показал на экране.»), обрезает по границе предложения и режет остаток
   на строки под ширину HUD.
3. `src/aiui/protocol.ts` упаковывает всё это в формат, который ждёт AIUI.

Системный промпт (`src/claude/prompt.ts`) заставляет модель отвечать 1–3
предложениями и давать код только блоками — это не косметика, а условие того,
что ответ вообще влезет в очки.

## Память диалога

Хранится в памяти процесса: `SESSION_TTL_MS` на сессию, `SESSION_MAX_TURNS` пар
реплик, вытеснение старых сессий сверх `SESSION_MAX_ENTRIES`. Для нескольких
инстансов замените `SessionStore` на реализацию поверх Redis — интерфейс узкий
(`get` / `append` / `reset`).

## Разработка

```bash
npm run dev        # tsx watch
npm test           # vitest, 32 теста
npm run typecheck
npm run build && npm start
```

Docker:

```bash
docker build -t rokid-claude-bridge .
docker run --rm -p 8787:8787 --env-file .env rokid-claude-bridge
```

## Что дальше

- Прод-деплой за HTTPS: AIUI ходит только на публичный HTTPS-эндпоинт.
  Для отладки годится любой туннель (ngrok, cloudflared).
- Приложение на очках вместо AIUI: берите `/v1/chat/stream`, он уже отдаёт
  дельты и итоговый разбор ответа.
- Инструменты (поиск по репозиторию, выполнение кода) — добавляются в
  `src/claude/client.ts` через tool use; пайплайн ответа менять не придётся.
