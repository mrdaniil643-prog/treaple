#!/usr/bin/env python3
"""publish_pack — обложки с заголовком, варианты под площадки и болванка описаний.

    python3 publish_pack.py cover clip.mp4 --title "Главная ошибка" --out cover.jpg
    python3 publish_pack.py variant clip.mp4 --ratio 4:5 --out clip-4x5.mp4
    python3 publish_pack.py pack --clips out/clips/clips.json --outdir out/publish

Принимает и отдельный файл, и манифест clips.json от навыка reels-autocut.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
from typing import Any, Sequence

RATIOS = {"9:16": (1080, 1920), "4:5": (1080, 1350), "1:1": (1080, 1080), "16:9": (1920, 1080)}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

THEMES: dict[str, dict[str, str]] = {
    "dark":   {"box": "0x0D1117", "text": "white",   "accent": "0xFFD400"},
    "light":  {"box": "0xF7F7F5", "text": "0x111111", "accent": "0x0066FF"},
    "punch":  {"box": "0xFF3DAE", "text": "white",   "accent": "0x12021A"},
    "mint":   {"box": "0x06231A", "text": "0xF2FFF8", "accent": "0x3DFFB0"},
}


class PackError(RuntimeError):
    pass


def log(msg: str) -> None:
    print(f"[publish-pack] {msg}", file=sys.stderr, flush=True)


def tool(name: str) -> str:
    override = os.environ.get("AUTOCUT_FFMPEG_DIR") or os.environ.get("AUTOMONTAGE_FFMPEG_DIR")
    if override:
        candidate = os.path.join(override, name)
        if os.path.exists(candidate) or os.path.exists(candidate + ".exe"):
            return candidate
    found = shutil.which(name)
    if not found:
        raise PackError(f"Не найден {name}. Поставь ffmpeg.")
    return found


def run(cmd: Sequence[str], *, capture: bool = False) -> subprocess.CompletedProcess:
    log("$ " + " ".join(str(c) for c in cmd))
    proc = subprocess.run([str(c) for c in cmd], text=True,
                          stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.PIPE if capture else None)
    if proc.returncode != 0:
        raise PackError(f"{cmd[0]} вернул {proc.returncode}\n{(proc.stderr or '')[-1500:]}")
    return proc


def probe_size(path: str) -> tuple[int, int, float]:
    proc = run([tool("ffprobe"), "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height", "-show_entries", "format=duration",
                "-of", "json", path], capture=True)
    data = json.loads(proc.stdout or "{}")
    stream = (data.get("streams") or [{}])[0]
    duration = float((data.get("format") or {}).get("duration") or 0)
    return int(stream.get("width") or 0), int(stream.get("height") or 0), duration


def escape_path(path: str) -> str:
    return path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def wrap_title(title: str, width: int) -> str:
    return "\n".join(textwrap.wrap(title.strip(), width=width) or [title.strip()])


def cover(source: str, out_path: str, *, title: str | None, at: float | None,
          theme: str = "dark", font: str | None = None, position: str = "bottom",
          wrap: int = 18, size_ratio: float = 0.055, ratio: str | None = None) -> str:
    if theme not in THEMES:
        raise PackError(f"Неизвестная тема {theme!r}. Есть: {', '.join(THEMES)}.")
    palette = THEMES[theme]
    is_image = os.path.splitext(source)[1].lower() in IMAGE_EXT
    width, height, duration = probe_size(source)
    if not width:
        raise PackError(f"Не читается файл: {source}")
    if at is None:
        at = 0.0 if is_image else max(0.3, duration * 0.15)

    chain: list[str] = []
    if ratio:
        if ratio not in RATIOS:
            raise PackError(f"Формат {ratio!r} неизвестен. Есть: {', '.join(RATIOS)}.")
        width, height = RATIOS[ratio]
        chain.append(f"scale={width}:{height}:force_original_aspect_ratio=increase")
        chain.append(f"crop={width}:{height}")

    tmpdir = tempfile.mkdtemp(prefix="pack-cover-")
    try:
        if title:
            text_path = os.path.join(tmpdir, "title.txt")
            with open(text_path, "w", encoding="utf-8") as fh:
                fh.write(wrap_title(title, wrap))
            fontsize = max(24, int(height * size_ratio))
            y = {
                "bottom": f"h-text_h-{int(height * 0.16)}",
                "center": "(h-text_h)/2",
                "top": str(int(height * 0.12)),
            }.get(position, f"h-text_h-{int(height * 0.16)}")
            draw = [
                f"textfile='{escape_path(text_path)}'",
                f"fontcolor={palette['text']}",
                f"fontsize={fontsize}",
                "x=(w-text_w)/2",
                f"y={y}",
                "line_spacing=12",
                "box=1",
                f"boxcolor={palette['box']}@0.88",
                f"boxborderw={max(16, fontsize // 3)}",
            ]
            if font:
                draw.append(f"font='{font}'")
            chain.append("drawtext=" + ":".join(draw))
        graph = ",".join(chain) if chain else "null"
        os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
        cmd = [tool("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error"]
        if not is_image:
            cmd += ["-ss", f"{at:.3f}"]
        cmd += ["-i", source, "-frames:v", "1", "-vf", graph, "-q:v", "2", out_path]
        run(cmd)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    return os.path.abspath(out_path)


def variant(source: str, out_path: str, *, ratio: str, fit: str = "blur", crf: int = 20,
            preset: str = "veryfast") -> str:
    if ratio not in RATIOS:
        raise PackError(f"Формат {ratio!r} неизвестен. Есть: {', '.join(RATIOS)}.")
    width, height = RATIOS[ratio]
    if fit == "blur":
        sigma = max(12, int(width / 42))
        graph = (
            f"[0:v]split=2[bg][fg];"
            f"[bg]scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},gblur=sigma={sigma},eq=brightness=-0.08[bgb];"
            f"[fg]scale={width}:{height}:force_original_aspect_ratio=decrease[fgs];"
            f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]"
        )
    elif fit == "crop":
        graph = (f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
                 f"crop={width}:{height},setsar=1,format=yuv420p[v]")
    elif fit == "pad":
        graph = (f"[0:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
                 f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
                 f"setsar=1,format=yuv420p[v]")
    else:
        raise PackError(f"fit={fit!r}: ожидается blur, crop или pad.")

    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    cmd = [tool("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error", "-stats",
           "-i", source, "-filter_complex", graph, "-map", "[v]"]
    probe = run([tool("ffprobe"), "-v", "error", "-select_streams", "a",
                 "-show_entries", "stream=index", "-of", "csv=p=0", source], capture=True)
    if (probe.stdout or "").strip():
        cmd += ["-map", "0:a:0", "-c:a", "aac", "-b:a", "192k"]
    else:
        cmd += ["-an"]
    cmd += ["-c:v", "libx264", "-preset", preset, "-crf", str(crf),
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path]
    run(cmd)
    return os.path.abspath(out_path)


CAPTION_TEMPLATE = """## {id} — {title}

- **Файл:** `{file}`
- **Длина:** {duration:.1f} с
- **Обложка:** `{cover}`

**Хук (первые 3 секунды, из расшифровки):**

> {hook}

**Описание** — _заполнить_:

```
<1–2 строки: что зритель получит, без пересказа ролика>

<призыв: сохранить, написать слово в комментарии, перейти по ссылке>
```

**Хештеги** — _заполнить, 3–7 штук по теме ролика, без мусорных #рекомендации_

**Расшифровка для справки:**

{text}

---
"""


def pack(clips_manifest: str, outdir: str, *, ratios: list[str], covers: bool,
         theme: str, font: str | None, fit: str, crf: int, preset: str,
         plan_path: str | None) -> dict[str, Any]:
    with open(clips_manifest, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    clips = manifest.get("clips") or []
    if not clips:
        raise PackError(f"В {clips_manifest} нет клипов.")

    texts: dict[str, dict[str, Any]] = {}
    if plan_path and os.path.exists(plan_path):
        with open(plan_path, "r", encoding="utf-8") as fh:
            for item in json.load(fh).get("clips", []):
                texts[item.get("id", "")] = item

    os.makedirs(outdir, exist_ok=True)
    captions: list[str] = ["# Пакет публикации\n"]
    results: list[dict[str, Any]] = []

    for clip in clips:
        source = clip.get("file")
        if not source or not os.path.exists(source):
            log(f"Пропускаю {clip.get('id')}: файла нет ({source})")
            continue
        clip_id = clip.get("id") or os.path.splitext(os.path.basename(source))[0]
        slug = os.path.splitext(os.path.basename(source))[0]
        title = clip.get("title") or clip_id
        entry: dict[str, Any] = {"id": clip_id, "title": title, "master": source, "variants": {}}

        if covers:
            # Кадр без вшитых субтитров, если reels-autocut его положил рядом.
            base = clip.get("cover") if clip.get("cover") and os.path.exists(clip["cover"]) else source
            entry["cover"] = cover(base, os.path.join(outdir, f"{slug}-cover.jpg"),
                                   title=title, at=None, theme=theme, font=font)
        for ratio in ratios:
            name = f"{slug}-{ratio.replace(':', 'x')}.mp4"
            entry["variants"][ratio] = variant(source, os.path.join(outdir, name),
                                               ratio=ratio, fit=fit, crf=crf, preset=preset)
        results.append(entry)

        source_clip = texts.get(clip_id, {})
        captions.append(CAPTION_TEMPLATE.format(
            id=clip_id,
            title=title,
            file=source,
            duration=float(clip.get("duration") or 0),
            cover=entry.get("cover") or clip.get("cover") or "—",
            hook=source_clip.get("hook_line") or "—",
            text=(source_clip.get("text") or "—"),
        ))

    captions_path = os.path.join(outdir, "captions.md")
    with open(captions_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(captions))

    manifest_path = os.path.join(outdir, "publish.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump({"outdir": os.path.abspath(outdir), "items": results}, fh,
                  ensure_ascii=False, indent=2)
    return {"captions": os.path.abspath(captions_path),
            "manifest": os.path.abspath(manifest_path), "items": results}


def cmd_cover(args: argparse.Namespace) -> int:
    print(cover(args.source, args.out, title=args.title, at=args.at, theme=args.theme,
                font=args.font, position=args.position, wrap=args.wrap,
                size_ratio=args.size, ratio=args.ratio))
    return 0


def cmd_variant(args: argparse.Namespace) -> int:
    print(variant(args.source, args.out, ratio=args.ratio, fit=args.fit,
                  crf=args.crf, preset=args.preset))
    return 0


def cmd_pack(args: argparse.Namespace) -> int:
    ratios = [r.strip() for r in args.ratios.split(",") if r.strip()]
    result = pack(args.clips, args.outdir, ratios=ratios, covers=not args.no_covers,
                  theme=args.theme, font=args.font, fit=args.fit, crf=args.crf,
                  preset=args.preset, plan_path=args.plan)
    log(f"Готово: {len(result['items'])} клипов")
    print(result["captions"])
    print(result["manifest"])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="publish_pack",
        description="Обложки, варианты под площадки и болванка описаний.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_cov = sub.add_parser("cover", help="обложка с заголовком")
    p_cov.add_argument("source")
    p_cov.add_argument("--out", required=True)
    p_cov.add_argument("--title", default=None)
    p_cov.add_argument("--at", type=float, default=None, help="секунда кадра (по умолчанию 15% длины)")
    p_cov.add_argument("--theme", default="dark", choices=sorted(THEMES))
    p_cov.add_argument("--font", default=None, help="шрифт, установленный в системе")
    p_cov.add_argument("--position", default="bottom", choices=("bottom", "center", "top"))
    p_cov.add_argument("--wrap", type=int, default=18, help="символов в строке заголовка")
    p_cov.add_argument("--size", type=float, default=0.055, help="кегль как доля высоты")
    p_cov.add_argument("--ratio", default=None, choices=sorted(RATIOS))
    p_cov.set_defaults(func=cmd_cover)

    p_var = sub.add_parser("variant", help="пересобрать клип под другой формат")
    p_var.add_argument("source")
    p_var.add_argument("--out", required=True)
    p_var.add_argument("--ratio", required=True, choices=sorted(RATIOS))
    p_var.add_argument("--fit", default="blur", choices=("blur", "crop", "pad"))
    p_var.add_argument("--crf", type=int, default=20)
    p_var.add_argument("--preset", default="veryfast")
    p_var.set_defaults(func=cmd_variant)

    p_pack = sub.add_parser("pack", help="пакет по манифесту clips.json")
    p_pack.add_argument("--clips", required=True, help="clips.json от reels-autocut")
    p_pack.add_argument("--plan", default=None, help="plan.json — добавит расшифровки в captions.md")
    p_pack.add_argument("--outdir", required=True)
    p_pack.add_argument("--ratios", default="4:5", help="форматы через запятую; пусто — только обложки")
    p_pack.add_argument("--no-covers", action="store_true")
    p_pack.add_argument("--theme", default="dark", choices=sorted(THEMES))
    p_pack.add_argument("--font", default=None)
    p_pack.add_argument("--fit", default="blur", choices=("blur", "crop", "pad"))
    p_pack.add_argument("--crf", type=int, default=20)
    p_pack.add_argument("--preset", default="veryfast")
    p_pack.set_defaults(func=cmd_pack)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except PackError as exc:
        print(f"\npublish-pack: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nПрервано пользователем.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
