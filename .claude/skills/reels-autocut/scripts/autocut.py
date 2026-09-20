#!/usr/bin/env python3
"""autocut — нарезка длинного видео на вертикальные Reels/Shorts.

Пайплайн: probe → transcribe → plan → render. Каждый шаг можно запускать
отдельно и править промежуточный JSON руками или агентом.

    python3 autocut.py all lecture.mp4 --outdir out --count 6 --lang ru
    python3 autocut.py plan --transcript out/transcript.json --out out/plan.json
    python3 autocut.py render --plan out/plan.json --outdir out/clips --subs words
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from autocut_lib.plan import make_plan  # noqa: E402
from autocut_lib.render import cleanup_work, render_clip  # noqa: E402
from autocut_lib.subtitles import STYLES  # noqa: E402
from autocut_lib.transcribe import transcribe  # noqa: E402
from autocut_lib.util import (  # noqa: E402
    AutocutError, has_tool, log, probe, read_json, write_json,
)

SUB_MODES = ("karaoke", "words", "plain", "none")
FIT_MODES = ("crop", "blur", "pad", "stretch")
REFRAME_MODES = ("track", "static", "center", "none")


def _add_plan_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--count", type=int, default=6, help="сколько клипов отобрать (6)")
    p.add_argument("--min", dest="min_dur", type=float, default=18.0,
                   help="минимальная длина клипа в секундах (18)")
    p.add_argument("--max", dest="max_dur", type=float, default=58.0,
                   help="максимальная длина клипа в секундах (58)")
    p.add_argument("--sweet", type=float, default=32.0,
                   help="целевая длина, к ней тянется отбор (32)")
    p.add_argument("--lead-in", type=float, default=0.25, help="запас до первой фразы (0.25)")
    p.add_argument("--lead-out", type=float, default=0.35, help="запас после последней (0.35)")
    p.add_argument("--spread", type=float, default=0.0,
                   help="0..0.3 — растащить клипы по таймлайну, чтобы не лезли в одну зону")
    p.add_argument("--pause-break", type=float, default=0.55,
                   help="пауза, после которой начинается новое предложение (0.55)")


def _add_render_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--ratio", default="9:16", help="9:16 | 4:5 | 1:1 | 16:9 | source (9:16)")
    p.add_argument("--fit", default="crop", choices=FIT_MODES,
                   help="crop — обрезать по субъекту; blur — вписать на размытый фон; "
                        "pad — чёрные поля; stretch — растянуть (crop)")
    p.add_argument("--reframe", default="track", choices=REFRAME_MODES,
                   help="track — ехать за субъектом; static — один кроп на клип; "
                        "center — центр кадра (track)")
    p.add_argument("--subs", default="karaoke", choices=SUB_MODES,
                   help="karaoke | words | plain | none (karaoke)")
    p.add_argument("--style", default="bold-white", choices=sorted(STYLES),
                   help="стиль субтитров (bold-white)")
    p.add_argument("--uppercase", action="store_true", help="субтитры КАПСОМ")
    p.add_argument("--font", default=None,
                   help="шрифт субтитров; должен быть установлен в системе "
                        "(иначе libass молча подставит свой)")
    p.add_argument("--sub-scale", type=float, default=1.0,
                   help="множитель кегля субтитров (1.0)")
    p.add_argument("--sub-margin", type=float, default=0.18,
                   help="отступ субтитров от низа кадра, доля высоты (0.18)")
    p.add_argument("--crf", type=int, default=20, help="качество x264, меньше — лучше (20)")
    p.add_argument("--preset", default="veryfast", help="пресет x264 (veryfast)")
    p.add_argument("--loudness", default="-14",
                   help="целевая громкость LUFS; -14 для Reels/TikTok, off отключает")
    p.add_argument("--fps", type=float, default=None, help="привести к фиксированному fps")
    p.add_argument("--max-height", type=int, default=1920, help="потолок высоты кадра (1920)")
    p.add_argument("--no-cover", action="store_true", help="не делать JPG-обложки")
    p.add_argument("--keep-work", action="store_true", help="оставить .work с ASS и sendcmd")
    p.add_argument("--only", default="", help="рендерить только эти id через запятую: clip-01,clip-03")
    p.add_argument("--approved-only", action="store_true",
                   help="рендерить только клипы с \"approved\": true")
    p.add_argument("--dry-run", action="store_true", help="показать план рендера и выйти")


def cmd_probe(args: argparse.Namespace) -> int:
    info = probe(args.source)
    print(json.dumps(info.as_dict(), ensure_ascii=False, indent=2))
    if info.orientation == "portrait":
        log("Исходник уже вертикальный — кадрирование почти не нужно.")
    if not info.has_audio:
        log("В файле нет звука: транскрибация и субтитры недоступны.")
    return 0


def cmd_transcribe(args: argparse.Namespace) -> int:
    out = args.out or os.path.join(args.outdir or ".", "transcript.json")
    transcribe(args.source, out, model=args.model, language=args.lang,
               import_path=args.import_subs, compute_type=args.compute_type,
               vad=not args.no_vad)
    print(os.path.abspath(out))
    return 0


def cmd_plan(args: argparse.Namespace) -> int:
    transcript = read_json(args.transcript)
    source = args.source or transcript.get("source")
    duration = 0.0
    if source and os.path.exists(source):
        duration = probe(source).duration
    plan = make_plan(
        transcript, count=args.count, min_dur=args.min_dur, max_dur=args.max_dur,
        sweet_dur=args.sweet, lead_in=args.lead_in, lead_out=args.lead_out,
        spread=args.spread, pause_break=args.pause_break, source_duration=duration,
    )
    plan["transcript"] = os.path.abspath(args.transcript)
    out = args.out or os.path.join(args.outdir or ".", "plan.json")
    write_json(out, plan)
    print_plan(plan)
    print(os.path.abspath(out))
    return 0


def print_plan(plan: dict) -> None:
    print("\nОтобранные клипы:\n", file=sys.stderr)
    for clip in plan["clips"]:
        head = clip["text"][:96].replace("\n", " ")
        print(
            f"  {clip['id']}  {clip['start']:>8.2f} → {clip['end']:<8.2f}"
            f"  {clip['duration']:>5.1f}с  score {clip['score']:.3f}\n"
            f"           {head}…",
            file=sys.stderr,
        )
    print("", file=sys.stderr)


def cmd_render(args: argparse.Namespace) -> int:
    plan = read_json(args.plan)
    source = args.source or plan.get("source")
    if not source or not os.path.exists(source):
        raise AutocutError(
            "Не вижу исходное видео. Укажи его явно: render --source /путь/video.mp4"
        )
    transcript_path = args.transcript or plan.get("transcript")
    words: list = []
    if args.subs != "none":
        if transcript_path and os.path.exists(transcript_path):
            words = read_json(transcript_path).get("words", [])
        else:
            log("Транскрипт не найден — рендерю без субтитров.")

    clips = plan.get("clips", [])
    if args.approved_only:
        clips = [c for c in clips if c.get("approved")]
        if not clips:
            raise AutocutError(
                'Ни один клип не помечен "approved": true. '
                "Утверди нужные в plan.json или убери --approved-only."
            )
    if args.only:
        wanted = {part.strip() for part in args.only.split(",") if part.strip()}
        clips = [c for c in clips if c.get("id") in wanted or c.get("slug") in wanted]
        if not clips:
            raise AutocutError(f"В плане нет клипов с id {sorted(wanted)}.")

    raw_loudness = str(args.loudness).strip().lower()
    if raw_loudness in ("off", "none", "no"):
        loudness = None
    else:
        try:
            loudness = float(raw_loudness)
        except ValueError:
            raise AutocutError(
                f"--loudness ждёт число LUFS (например -14) или off, а не {args.loudness!r}."
            ) from None
    outdir = args.outdir or "clips"

    if args.dry_run:
        for clip in clips:
            print(f"{clip['id']}  {clip['start']:.2f}–{clip['end']:.2f}  "
                  f"({clip['duration']:.1f}с)  {clip.get('title')}")
        log(f"dry-run: отрендерилось бы {len(clips)} клипов в {os.path.abspath(outdir)}")
        return 0

    info = probe(source)

    results = []
    for index, clip in enumerate(clips, start=1):
        log(f"[{index}/{len(clips)}] {clip.get('id')} — {clip.get('title')}")
        results.append(render_clip(
            source, info, clip, words, outdir, ratio=args.ratio, fit=args.fit,
            reframe=args.reframe, subs=args.subs, style=args.style,
            uppercase=args.uppercase, crf=args.crf, preset=args.preset,
            loudness=loudness, fps=args.fps, cover=not args.no_cover,
            max_height=args.max_height, font=args.font, sub_scale=args.sub_scale,
            sub_margin=args.sub_margin,
        ))
    cleanup_work(outdir, args.keep_work)
    manifest = write_json(os.path.join(outdir, "clips.json"), {
        "source": info.path,
        "ratio": args.ratio,
        "clips": results,
    })
    for item in results:
        mb = item["bytes"] / 1_000_000
        print(f"{item['id']:<9} {item['duration']:>6.1f}с  {item['size']:<10} "
              f"{mb:>6.1f} МБ  {item['file']}")
    print(manifest)
    return 0


def cmd_all(args: argparse.Namespace) -> int:
    outdir = args.outdir or "out"
    os.makedirs(outdir, exist_ok=True)
    info = probe(args.source)
    write_json(os.path.join(outdir, "source.json"), info.as_dict())

    transcript_path = args.transcript or os.path.join(outdir, "transcript.json")
    if os.path.exists(transcript_path) and not args.force:
        log(f"Использую готовый транскрипт {transcript_path} (--force чтобы переделать).")
        transcript = read_json(transcript_path)
    else:
        transcript = transcribe(args.source, transcript_path, model=args.model,
                                language=args.lang, import_path=args.import_subs,
                                compute_type=args.compute_type, vad=not args.no_vad)

    plan = make_plan(
        transcript, count=args.count, min_dur=args.min_dur, max_dur=args.max_dur,
        sweet_dur=args.sweet, lead_in=args.lead_in, lead_out=args.lead_out,
        spread=args.spread, pause_break=args.pause_break, source_duration=info.duration,
    )
    plan["transcript"] = os.path.abspath(transcript_path)
    plan_path = write_json(os.path.join(outdir, "plan.json"), plan)
    print_plan(plan)

    if args.plan_only:
        log("Остановился на плане. Проверь его, поправь и запусти render.")
        print(plan_path)
        return 0

    args.plan = plan_path
    args.transcript = transcript_path
    args.outdir = os.path.join(outdir, "clips")
    return cmd_render(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="autocut",
        description="Нарезка длинного видео на вертикальные Reels/Shorts.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_probe = sub.add_parser("probe", help="параметры исходника")
    p_probe.add_argument("source")
    p_probe.set_defaults(func=cmd_probe)

    p_tr = sub.add_parser("transcribe", help="распознать речь локально")
    p_tr.add_argument("source")
    p_tr.add_argument("--out", default=None)
    p_tr.add_argument("--outdir", default=None)
    p_tr.add_argument("--model", default="small", help="tiny|base|small|medium|large-v3")
    p_tr.add_argument("--lang", default=None, help="ru, en… (по умолчанию автоопределение)")
    p_tr.add_argument("--import", dest="import_subs", default=None,
                      help="взять готовые SRT/VTT вместо распознавания")
    p_tr.add_argument("--compute-type", default="auto", help="auto|int8|float16|float32")
    p_tr.add_argument("--no-vad", action="store_true", help="отключить VAD-фильтр")
    p_tr.set_defaults(func=cmd_transcribe)

    p_plan = sub.add_parser("plan", help="отобрать моменты под рилсы")
    p_plan.add_argument("--transcript", required=True)
    p_plan.add_argument("--source", default=None)
    p_plan.add_argument("--out", default=None)
    p_plan.add_argument("--outdir", default=None)
    _add_plan_args(p_plan)
    p_plan.set_defaults(func=cmd_plan)

    p_render = sub.add_parser("render", help="собрать клипы по плану")
    p_render.add_argument("--plan", required=True)
    p_render.add_argument("--source", default=None)
    p_render.add_argument("--transcript", default=None)
    p_render.add_argument("--outdir", default="clips")
    _add_render_args(p_render)
    p_render.set_defaults(func=cmd_render)

    p_all = sub.add_parser("all", help="весь пайплайн за один запуск")
    p_all.add_argument("source")
    p_all.add_argument("--outdir", default="out")
    p_all.add_argument("--transcript", default=None)
    p_all.add_argument("--model", default="small")
    p_all.add_argument("--lang", default=None)
    p_all.add_argument("--import", dest="import_subs", default=None)
    p_all.add_argument("--compute-type", default="auto")
    p_all.add_argument("--no-vad", action="store_true")
    p_all.add_argument("--force", action="store_true", help="перераспознать, даже если транскрипт есть")
    p_all.add_argument("--plan-only", action="store_true", help="остановиться после плана")
    _add_plan_args(p_all)
    _add_render_args(p_all)
    p_all.set_defaults(func=cmd_all)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command in ("probe", "render", "all") and not has_tool("ffmpeg"):
        log("ffmpeg не найден в PATH — дальше будет ошибка. Поставь ffmpeg.")
    try:
        return args.func(args)
    except AutocutError as exc:
        print(f"\nautocut: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nПрервано пользователем.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
