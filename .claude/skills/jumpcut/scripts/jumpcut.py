#!/usr/bin/env python3
"""jumpcut — убирает паузы и слова-паразиты, не трогая смысл.

    python3 jumpcut.py analyze lecture.mp4                      # что можно убрать
    python3 jumpcut.py plan lecture.mp4 --out plan.json --max-silence 0.30
    python3 jumpcut.py render --plan plan.json --out tight.mp4
    python3 jumpcut.py run lecture.mp4 --out tight.mp4          # всё сразу

Паузы ищутся по звуку (ffmpeg silencedetect) и не требуют распознавания речи.
Слова-паразиты — только при наличии транскрипта со словными таймкодами
(его делает навык reels-autocut: `autocut.py transcribe`).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from typing import Any, Sequence

# Осторожный список: только то, что почти никогда не несёт смысла.
DEFAULT_FILLERS = [
    "эээ", "ээ", "ммм", "мм", "ааа", "аа", "эм", "ам",
    "короче", "типа", "как бы", "ну вот", "это самое", "так сказать",
    "um", "uh", "erm", "hmm", "you know", "i mean",
]

# Спорный список: эти слова часто осмысленные («значит» как вывод, «like» как глагол).
# Подключается только через --fillers-file со своим JSON-массивом.
RISKY_FILLERS = [
    "значит", "собственно", "в общем", "то есть", "вообще-то", "слушай",
    "like", "basically", "actually", "literally", "sort of", "kind of", "right",
]

SILENCE_RE = re.compile(r"silence_(start|end):\s*(-?[\d.]+)")


class JumpcutError(RuntimeError):
    pass


def log(msg: str) -> None:
    print(f"[jumpcut] {msg}", file=sys.stderr, flush=True)


def tool(name: str) -> str:
    override = os.environ.get("AUTOCUT_FFMPEG_DIR") or os.environ.get("AUTOMONTAGE_FFMPEG_DIR")
    if override:
        candidate = os.path.join(override, name)
        if os.path.exists(candidate) or os.path.exists(candidate + ".exe"):
            return candidate
    found = shutil.which(name)
    if not found:
        raise JumpcutError(
            f"Не найден {name}. macOS `brew install ffmpeg`, "
            "Windows `winget install Gyan.FFmpeg`, Ubuntu `sudo apt install ffmpeg`."
        )
    return found


def run(cmd: Sequence[str], *, capture: bool = False) -> subprocess.CompletedProcess:
    log("$ " + " ".join(str(c) for c in cmd))
    proc = subprocess.run([str(c) for c in cmd], text=True,
                          stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.PIPE if capture else None)
    if proc.returncode != 0:
        raise JumpcutError(f"{cmd[0]} вернул {proc.returncode}\n{(proc.stderr or '')[-1500:]}")
    return proc


def duration_of(path: str) -> float:
    if not os.path.exists(path):
        raise JumpcutError(f"Файл не найден: {path}")
    proc = run([tool("ffprobe"), "-v", "error", "-show_entries", "format=duration",
                "-of", "default=nw=1:nk=1", path], capture=True)
    try:
        return float((proc.stdout or "0").strip())
    except ValueError as exc:
        raise JumpcutError(f"Не удалось прочитать длительность {path}") from exc


def has_audio(path: str) -> bool:
    proc = run([tool("ffprobe"), "-v", "error", "-select_streams", "a",
                "-show_entries", "stream=index", "-of", "csv=p=0", path], capture=True)
    return bool((proc.stdout or "").strip())


@dataclass
class Span:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


def detect_silences(path: str, *, noise_db: float, min_silence: float) -> list[Span]:
    """Разбор вывода silencedetect. Порог в dB — относительно полной шкалы."""
    proc = subprocess.run(
        [tool("ffmpeg"), "-hide_banner", "-nostats", "-i", path,
         "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
         "-f", "null", "-"],
        text=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    spans: list[Span] = []
    pending: float | None = None
    for match in SILENCE_RE.finditer(proc.stderr or ""):
        kind, raw = match.group(1), float(match.group(2))
        if kind == "start":
            pending = max(0.0, raw)
        elif pending is not None:
            spans.append(Span(pending, raw))
            pending = None
    if pending is not None:
        spans.append(Span(pending, duration_of(path)))
    return spans


def filler_spans(transcript_path: str, fillers: list[str], *,
                 pad: float = 0.04) -> list[Span]:
    """Диапазоны слов-паразитов по транскрипту со словными таймкодами."""
    with open(transcript_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    words = data.get("words") or []
    if not words:
        raise JumpcutError(f"В {transcript_path} нет словных таймкодов.")

    single = {f for f in fillers if " " not in f}
    phrases = [f.split() for f in fillers if " " in f]

    def clean(token: str) -> str:
        return re.sub(r"[^\w\-]", "", token.lower())

    tokens = [clean(w["word"]) for w in words]
    spans: list[Span] = []
    used = set()

    for phrase in sorted(phrases, key=len, reverse=True):
        size = len(phrase)
        for i in range(len(tokens) - size + 1):
            if any(j in used for j in range(i, i + size)):
                continue
            if tokens[i:i + size] == phrase:
                spans.append(Span(words[i]["start"] - pad, words[i + size - 1]["end"] + pad))
                used.update(range(i, i + size))

    for i, token in enumerate(tokens):
        if i in used or token not in single:
            continue
        spans.append(Span(words[i]["start"] - pad, words[i]["end"] + pad))
        used.add(i)

    spans.sort(key=lambda s: s.start)
    return spans


def merge(spans: list[Span], gap: float = 0.0) -> list[Span]:
    if not spans:
        return []
    ordered = sorted(spans, key=lambda s: s.start)
    out = [Span(max(0.0, ordered[0].start), ordered[0].end)]
    for span in ordered[1:]:
        if span.start <= out[-1].end + gap:
            out[-1].end = max(out[-1].end, span.end)
        else:
            out.append(Span(max(0.0, span.start), span.end))
    return out


def shrink_silences(silences: list[Span], *, max_silence: float, padding: float) -> list[Span]:
    """Из длинной паузы вырезается середина — края остаются как дыхание.

    После вырезания в паузе остаётся примерно ``max_silence`` секунд тишины,
    но не меньше ``padding`` с каждой стороны: без этого срезается атака
    следующего слова и стык слышно.
    """
    half = max(padding, max(0.0, max_silence) / 2)
    cuts: list[Span] = []
    for span in silences:
        cut = Span(span.start + half, span.end - half)
        if cut.duration > 0.02:
            cuts.append(cut)
    return merge(cuts)


def invert(cuts: list[Span], total: float, *, min_keep: float) -> list[Span]:
    keeps: list[Span] = []
    cursor = 0.0
    for cut in cuts:
        if cut.start > cursor:
            keeps.append(Span(cursor, min(cut.start, total)))
        cursor = max(cursor, cut.end)
    if cursor < total:
        keeps.append(Span(cursor, total))
    return [k for k in keeps if k.duration >= min_keep]


def build_plan(source: str, *, noise_db: float, min_silence: float, max_silence: float,
               padding: float, min_keep: float, transcript: str | None,
               fillers: list[str] | None, remove_fillers: bool) -> dict[str, Any]:
    total = duration_of(source)
    if not has_audio(source):
        raise JumpcutError("В файле нет звуковой дорожки — паузы искать не по чему.")

    silences = detect_silences(source, noise_db=noise_db, min_silence=min_silence)
    silence_cuts = shrink_silences(silences, max_silence=max_silence, padding=padding)
    log(f"Пауз найдено: {len(silences)}, из них подрезается: {len(silence_cuts)}")

    filler_cuts: list[Span] = []
    if remove_fillers:
        if not transcript:
            raise JumpcutError(
                "--fillers требует транскрипт со словными таймкодами: --transcript t.json. "
                "Сделать его: reels-autocut/scripts/autocut.py transcribe source.mp4"
            )
        filler_cuts = filler_spans(transcript, fillers or DEFAULT_FILLERS)
        log(f"Слов-паразитов найдено: {len(filler_cuts)}")

    cuts = merge(silence_cuts + filler_cuts, gap=0.02)
    keeps = invert(cuts, total, min_keep=min_keep)
    if not keeps:
        raise JumpcutError(
            "После вырезания не осталось ни одного куска. "
            "Порог слишком агрессивный: подними --noise (например -45) или --max-silence."
        )

    kept = sum(k.duration for k in keeps)
    return {
        "source": os.path.abspath(source),
        "transcript": os.path.abspath(transcript) if transcript else None,
        "settings": {
            "noise_db": noise_db, "min_silence": min_silence, "max_silence": max_silence,
            "padding": padding, "min_keep": min_keep, "remove_fillers": remove_fillers,
        },
        "stats": {
            "source_duration": round(total, 3),
            "result_duration": round(kept, 3),
            "removed": round(total - kept, 3),
            "removed_percent": round((total - kept) / total * 100, 1) if total else 0.0,
            "cuts": len(cuts),
            "segments": len(keeps),
            "silence_cuts": len(silence_cuts),
            "filler_cuts": len(filler_cuts),
        },
        "keep": [{"start": round(k.start, 3), "end": round(k.end, 3),
                  "duration": round(k.duration, 3)} for k in keeps],
    }


def filtergraph(keeps: list[dict[str, Any]], *, with_audio: bool, fade: float) -> str:
    parts: list[str] = []
    labels: list[str] = []
    for i, seg in enumerate(keeps):
        start, end = float(seg["start"]), float(seg["end"])
        dur = end - start
        parts.append(f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS[v{i}]")
        labels.append(f"[v{i}]")
        if with_audio:
            chain = [f"atrim=start={start:.3f}:end={end:.3f}", "asetpts=PTS-STARTPTS"]
            if fade > 0 and dur > fade * 3:
                # Микрофейды по краям: без них стык даёт щелчок.
                chain.append(f"afade=t=in:st=0:d={fade:.3f}")
                chain.append(f"afade=t=out:st={dur - fade:.3f}:d={fade:.3f}")
            parts.append(f"[0:a]{','.join(chain)}[a{i}]")
            labels.append(f"[a{i}]")
    streams = 2 if with_audio else 1
    parts.append(
        "".join(labels) + f"concat=n={len(keeps)}:v=1:a={1 if with_audio else 0}"
        + ("[v][a]" if with_audio else "[v]")
    )
    return ";\n".join(parts)


def render(plan: dict[str, Any], out_path: str, *, crf: int, preset: str, fade: float,
           audio_bitrate: str, keep_graph: bool) -> str:
    source = plan["source"]
    keeps = plan.get("keep") or []
    if not keeps:
        raise JumpcutError("В плане нет ни одного отрезка.")
    with_audio = has_audio(source)

    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    graph_path = os.path.splitext(out_path)[0] + ".filter.txt"
    with open(graph_path, "w", encoding="utf-8") as fh:
        fh.write(filtergraph(keeps, with_audio=with_audio, fade=fade))

    cmd = [
        tool("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error", "-stats",
        "-i", source,
        "-filter_complex_script", graph_path,
        "-map", "[v]",
    ]
    if with_audio:
        cmd += ["-map", "[a]", "-c:a", "aac", "-b:a", audio_bitrate, "-ar", "48000"]
    else:
        cmd += ["-an"]
    cmd += ["-c:v", "libx264", "-preset", preset, "-crf", str(crf),
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path]
    run(cmd)
    if not keep_graph:
        os.remove(graph_path)
    return os.path.abspath(out_path)


def shift_transcript(plan: dict[str, Any], transcript_path: str, out_path: str) -> str:
    """Пересчёт таймкодов транскрипта под новый таймлайн — чтобы субтитры не разъехались."""
    with open(transcript_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    keeps = [(float(k["start"]), float(k["end"])) for k in plan["keep"]]
    offsets: list[tuple[float, float, float]] = []
    cursor = 0.0
    for start, end in keeps:
        offsets.append((start, end, cursor - start))
        cursor += end - start

    def remap(value: float) -> float | None:
        for start, end, delta in offsets:
            if start <= value <= end:
                return round(value + delta, 3)
        return None

    words = []
    for word in data.get("words", []):
        new_start, new_end = remap(word["start"]), remap(word["end"])
        if new_start is None or new_end is None or new_end <= new_start:
            continue  # слово попало в вырезанный кусок
        words.append({**word, "start": new_start, "end": new_end})
    data["words"] = words
    data["word_count"] = len(words)
    data["duration"] = round(cursor, 3)
    data["segments"] = []
    data["source"] = plan.get("output") or data.get("source")
    data["text"] = " ".join(w["word"] for w in words)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    return os.path.abspath(out_path)


def print_stats(plan: dict[str, Any]) -> None:
    s = plan["stats"]
    print(
        f"\nБыло {s['source_duration']:.1f} с → станет {s['result_duration']:.1f} с "
        f"(−{s['removed']:.1f} с, −{s['removed_percent']:.1f}%)\n"
        f"Склеек: {s['cuts']}  ·  отрезков: {s['segments']}  ·  "
        f"пауз: {s['silence_cuts']}  ·  паразитов: {s['filler_cuts']}\n",
        file=sys.stderr,
    )


def load_fillers(path: str | None) -> list[str] | None:
    if not path:
        return None
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise JumpcutError(f"{path} должен быть JSON-списком слов.")
    return [str(item).lower() for item in data]


def _plan_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--noise", dest="noise_db", type=float, default=-35.0,
                   help="порог тишины в dB: ниже — строже (-35)")
    p.add_argument("--min-silence", type=float, default=0.35,
                   help="пауза короче этой не считается паузой (0.35)")
    p.add_argument("--max-silence", type=float, default=0.30,
                   help="сколько паузы оставить вместо длинной (0.30); 0 — вырезать целиком")
    p.add_argument("--padding", type=float, default=0.06,
                   help="не трогать столько секунд у краёв паузы (0.06)")
    p.add_argument("--min-keep", type=float, default=0.12,
                   help="выбросить обрывки короче этого (0.12)")
    p.add_argument("--transcript", default=None, help="транскрипт со словными таймкодами")
    p.add_argument("--fillers", action="store_true", help="вырезать слова-паразиты")
    p.add_argument("--fillers-file", default=None, help="свой список паразитов (JSON-массив)")


def _render_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--crf", type=int, default=20, help="качество x264 (20)")
    p.add_argument("--preset", default="veryfast", help="пресет x264 (veryfast)")
    p.add_argument("--fade", type=float, default=0.012,
                   help="микрофейд звука на стыках, секунды (0.012); 0 отключает")
    p.add_argument("--audio-bitrate", default="192k")
    p.add_argument("--keep-graph", action="store_true", help="оставить файл фильтра рядом")
    p.add_argument("--shift-transcript", default=None,
                   help="куда записать транскрипт с пересчитанными таймкодами")


def cmd_analyze(args: argparse.Namespace) -> int:
    plan = build_plan(args.source, noise_db=args.noise_db, min_silence=args.min_silence,
                      max_silence=args.max_silence, padding=args.padding,
                      min_keep=args.min_keep, transcript=args.transcript,
                      fillers=load_fillers(args.fillers_file), remove_fillers=args.fillers)
    print_stats(plan)
    print(json.dumps(plan["stats"], ensure_ascii=False, indent=2))
    return 0


def cmd_plan(args: argparse.Namespace) -> int:
    plan = build_plan(args.source, noise_db=args.noise_db, min_silence=args.min_silence,
                      max_silence=args.max_silence, padding=args.padding,
                      min_keep=args.min_keep, transcript=args.transcript,
                      fillers=load_fillers(args.fillers_file), remove_fillers=args.fillers)
    out = args.out or "jumpcut-plan.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(plan, fh, ensure_ascii=False, indent=2)
    print_stats(plan)
    print(os.path.abspath(out))
    return 0


def cmd_render(args: argparse.Namespace) -> int:
    with open(args.plan, "r", encoding="utf-8") as fh:
        plan = json.load(fh)
    if args.source:
        plan["source"] = os.path.abspath(args.source)
    out = render(plan, args.out, crf=args.crf, preset=args.preset, fade=args.fade,
                 audio_bitrate=args.audio_bitrate, keep_graph=args.keep_graph)
    plan["output"] = out
    print_stats(plan)
    if args.shift_transcript:
        src = plan.get("transcript")
        if not src:
            raise JumpcutError("--shift-transcript требует, чтобы в плане был transcript.")
        print(shift_transcript(plan, src, args.shift_transcript))
    print(out)
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    plan = build_plan(args.source, noise_db=args.noise_db, min_silence=args.min_silence,
                      max_silence=args.max_silence, padding=args.padding,
                      min_keep=args.min_keep, transcript=args.transcript,
                      fillers=load_fillers(args.fillers_file), remove_fillers=args.fillers)
    print_stats(plan)
    out = render(plan, args.out, crf=args.crf, preset=args.preset, fade=args.fade,
                 audio_bitrate=args.audio_bitrate, keep_graph=args.keep_graph)
    plan["output"] = out
    if args.save_plan:
        with open(args.save_plan, "w", encoding="utf-8") as fh:
            json.dump(plan, fh, ensure_ascii=False, indent=2)
    if args.shift_transcript and args.transcript:
        print(shift_transcript(plan, args.transcript, args.shift_transcript))
    print(out)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="jumpcut",
        description="Убирает паузы и слова-паразиты из видео.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_an = sub.add_parser("analyze", help="посчитать, сколько уйдёт, без рендера")
    p_an.add_argument("source")
    _plan_args(p_an)
    p_an.set_defaults(func=cmd_analyze)

    p_pl = sub.add_parser("plan", help="сохранить план склейки в JSON")
    p_pl.add_argument("source")
    p_pl.add_argument("--out", default=None)
    _plan_args(p_pl)
    p_pl.set_defaults(func=cmd_plan)

    p_re = sub.add_parser("render", help="собрать видео по плану")
    p_re.add_argument("--plan", required=True)
    p_re.add_argument("--out", required=True)
    p_re.add_argument("--source", default=None)
    _render_args(p_re)
    p_re.set_defaults(func=cmd_render)

    p_run = sub.add_parser("run", help="анализ и рендер за один заход")
    p_run.add_argument("source")
    p_run.add_argument("--out", required=True)
    p_run.add_argument("--save-plan", default=None)
    _plan_args(p_run)
    _render_args(p_run)
    p_run.set_defaults(func=cmd_run)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except JumpcutError as exc:
        print(f"\njumpcut: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nПрервано пользователем.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
