# Форматы промежуточных файлов

Все три JSON читаемы и редактируемы. Правка руками — штатный сценарий, не хак.

## transcript.json

```json
{
  "source": "/abs/path/lecture.mp4",
  "engine": "faster-whisper:small",
  "language": "ru",
  "duration": 3612.4,
  "word_count": 9841,
  "text": "…весь текст одной строкой…",
  "segments": [{ "start": 12.4, "end": 18.9, "text": "реплика целиком" }],
  "words":    [{ "start": 12.4, "end": 12.7, "word": "Главная", "prob": 0.98 }]
}
```

`words` — единственное, что реально нужно дальше: по нему строятся предложения,
оценки и субтитры. `prob` ниже 0.6 обычно значит, что слово распознано неверно, —
удобный фильтр, когда ищешь, что править.

Транскрипт можно править: исправь `word` (термины, имена, англицизмы), не трогая
тайминги, — субтитры соберутся с исправленным текстом.

## plan.json

```json
{
  "source": "/abs/path/lecture.mp4",
  "transcript": "/abs/path/transcript.json",
  "source_duration": 3612.4,
  "settings": { "count": 6, "min": 18.0, "max": 58.0, "sweet": 32.0 },
  "clips": [
    {
      "id": "clip-01",
      "slug": "01-glavnaya-oshibka-novichkov",
      "title": "Главная ошибка новичков",
      "start": 412.8,
      "end": 447.1,
      "duration": 34.3,
      "score": 0.871,
      "breakdown": { "hook": 1.0, "payoff": 0.8, "completeness": 1.0,
                     "length": 0.93, "density": 0.71, "filler_penalty": 0.0 },
      "text": "…расшифровка куска…",
      "hook_line": "Главная ошибка новичков в том, что…",
      "approved": false
    }
  ],
  "shortlist": [ "…25 лучших кандидатов, включая невыбранные…" ]
}
```

Что правится в первую очередь:

- `start` / `end` — сдвинуть границы. `duration` пересчитывать не обязательно,
  рендер считает по `start` и `end`.
- `title` — идёт в имя файла (через `slug`) и в пакет публикации.
- `approved` — `true` у тех, что рендерим с `--approved-only`.
- `slug` — если хочешь своё имя файла.

Клип из `shortlist` вставляется в `clips` как есть: достаточно дописать ему
`id`, `slug` и `title`.

## clips.json (манифест рендера)

```json
{
  "source": "/abs/path/lecture.mp4",
  "ratio": "9:16",
  "clips": [
    {
      "id": "clip-01",
      "title": "Главная ошибка новичков",
      "file": "/abs/path/clips/01-glavnaya-oshibka-novichkov.mp4",
      "start": 412.8, "end": 447.1, "duration": 34.3,
      "size": "1080x1920",
      "fit": "crop",
      "reframe": "track",
      "detector": "faces",
      "subtitles": "karaoke",
      "style": "yellow-pop",
      "bytes": 12844213,
      "cover": "/abs/path/clips/01-glavnaya-oshibka-novichkov.jpg"
    }
  ]
}
```

`reframe` и `detector` показывают, что вышло на самом деле. `reframe: "static"` при
запросе `track` означает, что трекинг не отработал — либо субъект почти не двигался
(это нормально), либо ffmpeg не умеет `sendcmd` (тогда в логе есть строка об этом).
`detector: "center"` — субъект не найден вообще, кадр взят по центру: проверь глазами.

## .work/

При `--keep-work` рядом с клипами остаётся `.work/`:

- `<slug>.ass` — субтитры. Открывается любым текстовым редактором; правь текст,
  цвета, позицию и рендери заново.
- `<slug>.sendcmd` — команды проезда кропа: `<время> crop x <пиксель>;`.
  Можно отредактировать вручную, если автоматика повела кадр не туда.
