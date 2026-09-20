# treaple — набор навыков для Claude Code

Репозиторий-хранилище навыков (`.claude/skills/`). Клонируешь — и агент в этой
папке видит их все.

## Навыки авто-монтажа видео

Шесть навыков, которые закрывают путь от сырой записи до готовых к выкладке
вертикальных роликов.

### Свои, работают на одном ffmpeg

| Навык | Что делает | Нужно поставить |
|---|---|---|
| [`reels-autocut`](.claude/skills/reels-autocut/) | длинное видео → N вертикальных Reels: транскрибация, отбор моментов, кадр 9:16 с проездом за спикером, субтитры-караоке, нормализация звука, обложки | ffmpeg, Python; faster-whisper для распознавания |
| [`jumpcut`](.claude/skills/jumpcut/) | убирает паузы и слова-паразиты: час записи ужимается на 20–50% | ffmpeg, Python |
| [`reels-publish-pack`](.claude/skills/reels-publish-pack/) | обложки с заголовком, версии 4:5 и 1:1, заготовка описаний | ffmpeg, Python |

Типовой путь:

```
исходник → jumpcut → reels-autocut → reels-publish-pack → выкладка
```

Быстрый старт — нарезать лекцию на шесть рилсов:

```bash
cd .claude/skills/reels-autocut/scripts
python3 autocut.py all ~/video/lecture.mp4 --outdir ~/reels/lecture \
        --lang ru --count 6 --plan-only
# посмотреть и поправить ~/reels/lecture/plan.json, затем
python3 autocut.py render --plan ~/reels/lecture/plan.json \
        --outdir ~/reels/lecture/clips --subs karaoke --style yellow-pop --uppercase
```

Зависимости:

```bash
python3 -m pip install faster-whisper        # распознавание речи (можно заменить готовым SRT)
python3 -m pip install opencv-python         # опционально: детекция лиц для кадрирования
brew install ffmpeg                          # macOS; Windows: winget install Gyan.FFmpeg
```

### Из проекта AutoMontage-Agent

| Навык | Что делает |
|---|---|
| [`reel-turnkey`](.claude/skills/reel-turnkey/) | ролик под ключ: сцены, плашки, анимация, аудиопроба, QA |
| [`motion-reel`](.claude/skills/motion-reel/) | анимационный ролик без камеры, из озвучки или сценария |
| [`reel-from-donor`](.claude/skills/reel-from-donor/) | авторский Reels по чужому ролику-донору, в карточках |

Эти три вендорнуты из [mcdenil-skills/AutoMontage-Agent](https://github.com/mcdenil-skills/AutoMontage-Agent)
(коммит `e888305`, MIT) и **требуют движка** — Remotion-проекта с собственными
скриптами и схемами. Движок ставится отдельно:

```bash
bash scripts/install-automontage-engine.sh
export AUTOMONTAGE_HOME="$HOME/.automontage-engine"
```

Скрипт проверит Node 20+, Python и ffmpeg, склонирует движок в `~/.automontage-engine`,
поставит зависимости в отдельный venv, соберёт глобальную команду `automontage`
и прогонит `npm run doctor`.

Если движка нет, а нужна просто нарезка на рилсы — бери `reels-autocut`,
он самодостаточен.

## Остальные навыки

`ui-ux-pro-max`, `web-artifacts-builder`, `frontend-design`, `theme-factory`,
`mcp-builder`, `webapp-testing`, `stop-slop` — фронтенд, дизайн и инструменты
разработки, лежат здесь же в `.claude/skills/`.

## Лицензии

Навыки авто-монтажа из апстрима — MIT, копия лежит в каждой папке
(`UPSTREAM-LICENSE.txt`). Официальные навыки Anthropic — со своими `LICENSE.txt`.
