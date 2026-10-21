# Shorts: Claude Code + Remotion

Вертикальные ролики 1080×1920 для YouTube Shorts, Reels и TikTok. Каждая сцена написана как React-компонент, Claude Code правит их по текстовому промпту, Remotion рендерит MP4.

## Установка

```bash
cd shorts
npm i
```

Официальные скиллы Remotion уже лежат в `.agents/skills` (ссылки на них в `.claude/skills`). Обновить их можно так:

```bash
npx skills add remotion-dev/skills
```

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | Remotion Studio: превью в браузере, правки видны сразу |
| `npm run render` | рендерит `out/short.mp4` |
| `npm run still` | один кадр в `out/preview.png` |
| `npm run lint` | ESLint и проверка типов |

Если Remotion не может скачать Chrome (например, в закрытой сети), укажите локальный браузер:

```bash
npx remotion render Short out/short.mp4 --browser-executable=/path/to/chrome-headless-shell
```

## Структура

```
src/
  Root.tsx          композиция Short: 1080×1920, 30 fps, 20 секунд
  Short.tsx         сценарий: тексты и тайминги сцен
  ProgressBar.tsx   полоса прогресса сверху
  theme.ts          шрифт и безопасная зона (низ и правый край кадра перекрывает интерфейс приложений)
  scenes/
    Hook.tsx        хук на первые 3 секунды
    Point.tsx       тезис с крупной цифрой
    Outro.tsx       призыв подписаться
```

## Как сделать новый ролик

Запустите Claude Code в папке `shorts` и опишите ролик. Примеры промптов:

- «Сделай шортс на 25 секунд: 5 ошибок новичка в спортзале. Хук, пять тезисов по 4 секунды, финал с призывом подписаться. Акцент зелёный.»
- «Добавь фоновую музыку `public/music.mp3` с плавным затуханием в конце.»
- «Добавь субтитры по словам из `public/voice.mp3`, как в TikTok.»
- «Сделай переходы между сценами со сдвигом вбок.»
- «Отрендери в MP4.»

Claude правит тексты и тайминги в `src/Short.tsx`, а цвета и подпись канала в `defaultProps` в `src/Root.tsx`. Если нужна новая сцена, он создаёт её в `src/scenes/`.

## Шортс про вайбкодинг (композиция `VibeCoding`)

30-секундный ролик-шутка: голос, субтитры по словам, бит, звуковые эффекты и восемь сцен (хук, промпт, «не читал», ошибки, «всё работает», деплой в пятницу, падение прода, призыв подписаться).

```
voiceover/vibecoding.json   сценарий: фразы по сценам, голос, скорость, паузы
scripts/voiceover.py        озвучка через RHVoice + тайминги слов
scripts/sfx.sh              бит и эффекты, синтезированные ffmpeg
src/voiceover/*.json        тайминги сцен и слов (генерируется)
public/voiceover/*.wav      голос (генерируется)
src/vibe/                   сцены, фон, субтитры, UI-элементы
```

Тайминги сцен берутся из озвучки, поэтому после правки текста достаточно перегенерировать голос:

```bash
scripts/setup-tts.sh        # один раз: собирает RHVoice в .venv
npm run voiceover           # голос и тайминги
npm run render:vibe         # out/vibecoding.mp4
```

Озвучка офлайновая и бесплатная, но звучит заметно роботизированно. Для живого голоса можно взять ElevenLabs (см. скилл `remotion-best-practices`, раздел Voiceover): главное, чтобы на выходе получились тот же wav и json с таймингами.

Эмодзи рисуются системным шрифтом (Apple, Segoe или Noto Color Emoji). На Linux без эмодзи-шрифта их не будет видно: поставьте `fonts-noto-color-emoji`.

## Лицензия Remotion

Бесплатна для физических лиц и команд до 3 человек. Компаниям побольше нужна лицензия: https://www.remotion.pro/license
