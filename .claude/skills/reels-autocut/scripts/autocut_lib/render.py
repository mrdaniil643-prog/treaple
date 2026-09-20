"""Сборка ffmpeg-команд и рендер вертикальных клипов."""
from __future__ import annotations

import os
import shutil
from typing import Any

from .reframe import build_crop_plan, sendcmd_file, target_size
from .subtitles import build_ass, words_in_range, write_ass
from .util import AutocutError, MediaInfo, log, run, tool, write_json

PRESET_SIZES = {
    "9:16": (1080, 1920),
    "4:5": (1080, 1350),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
}


def output_size(ratio: str, info: MediaInfo, max_height: int = 1920) -> tuple[int, int]:
    if ratio == "source":
        w, h = info.width, info.height
    elif ratio in PRESET_SIZES:
        w, h = PRESET_SIZES[ratio]
    else:
        crop_w, crop_h = target_size(info, ratio)
        w, h = crop_w, crop_h
    if h > max_height:
        w = int(round(w * max_height / h))
        h = max_height
    return w - (w % 2), h - (h % 2)


def escape_filter_path(path: str) -> str:
    """Экранирование пути для filtergraph (ass=, sendcmd=f=)."""
    return (
        path.replace("\\", "/")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace(",", "\\,")
    )


def build_filter(crop: dict[str, Any], out_w: int, out_h: int, *, fit: str,
                 ass_path: str | None, cmd_path: str | None,
                 fps: float | None) -> str:
    chain: list[str] = []

    if fit == "crop" and crop["mode"] != "none":
        if cmd_path and crop.get("keyframes"):
            chain.append(f"sendcmd=f='{escape_filter_path(cmd_path)}'")
            chain.append(
                f"crop=w={crop['crop_w']}:h={crop['crop_h']}:"
                f"x={crop['keyframes'][0]['x']}:y={crop['crop_y']}"
            )
        else:
            chain.append(
                f"crop=w={crop['crop_w']}:h={crop['crop_h']}:"
                f"x={crop['static_x']}:y={crop['crop_y']}"
            )
        chain.append(f"scale={out_w}:{out_h}:flags=lanczos")
    elif fit == "pad":
        chain.append(f"scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:flags=lanczos")
        chain.append(f"pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:color=black")
    elif fit == "blur":
        # Размытый фон из того же кадра + вписанный передний план.
        sigma = max(12, int(out_w / 42))
        graph = (
            f"[0:v]split=2[bg][fg];"
            f"[bg]scale={out_w}:{out_h}:force_original_aspect_ratio=increase:flags=fast_bilinear,"
            f"crop={out_w}:{out_h},gblur=sigma={sigma},eq=brightness=-0.08:saturation=0.85[bgb];"
            f"[fg]scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:flags=lanczos[fgs];"
            f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2"
        )
        tail = []
        if fps:
            tail.append(f"fps={fps}")
        tail.append("setsar=1")
        if ass_path:
            tail.append(f"ass='{escape_filter_path(ass_path)}'")
        tail.append("format=yuv420p")
        return graph + "," + ",".join(tail) + "[v]"
    else:
        chain.append(f"scale={out_w}:{out_h}:flags=lanczos")

    if fps:
        chain.append(f"fps={fps}")
    chain.append("setsar=1")
    if ass_path:
        chain.append(f"ass='{escape_filter_path(ass_path)}'")
    chain.append("format=yuv420p")
    return "[0:v]" + ",".join(chain) + "[v]"


def build_command(source: str, clip: dict[str, Any], out_path: str, *, filtergraph: str,
                  has_audio: bool, crf: int, preset: str, loudness: float | None,
                  audio_bitrate: str = "192k") -> list[str]:
    duration = float(clip["end"]) - float(clip["start"])
    cmd = [
        tool("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error", "-stats",
        "-ss", f"{float(clip['start']):.3f}",
        "-i", source,
        "-t", f"{duration:.3f}",
        "-filter_complex", filtergraph,
        "-map", "[v]",
    ]
    if has_audio:
        cmd += ["-map", "0:a:0"]
        if loudness is not None:
            cmd += ["-af", f"loudnorm=I={loudness}:TP=-1.5:LRA=11,aresample=48000"]
        cmd += ["-c:a", "aac", "-b:a", audio_bitrate, "-ac", "2", "-ar", "48000"]
    else:
        cmd += ["-an"]
    cmd += [
        "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
        "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out_path,
    ]
    return cmd


def cover_frame(source: str, clip: dict[str, Any], out_path: str, out_w: int, out_h: int,
                crop: dict[str, Any], fit: str) -> str | None:
    """Кадр-обложка на 15% длины клипа — там спикер уже в кадре и говорит."""
    at = float(clip["start"]) + max(0.4, (float(clip["end"]) - float(clip["start"])) * 0.15)
    # Обложку берём без трекинга: один кадр — ехать некуда.
    graph = build_filter(crop, out_w, out_h, fit=fit, ass_path=None, cmd_path=None, fps=None)
    try:
        run([
            tool("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
            "-ss", f"{at:.3f}", "-i", source, "-frames:v", "1",
            "-filter_complex", graph, "-map", "[v]", "-q:v", "2", out_path,
        ])
        return os.path.abspath(out_path)
    except AutocutError as exc:
        log(f"Обложку сделать не удалось: {exc}")
        return None


def render_clip(source: str, info: MediaInfo, clip: dict[str, Any],
                words: list[dict[str, Any]], outdir: str, *, ratio: str = "9:16",
                fit: str = "crop", reframe: str = "track", subs: str = "karaoke",
                style: str = "bold-white", uppercase: bool = False, crf: int = 20,
                preset: str = "veryfast", loudness: float | None = -14.0,
                fps: float | None = None, cover: bool = True,
                max_height: int = 1920, font: str | None = None,
                sub_scale: float = 1.0, sub_margin: float = 0.18) -> dict[str, Any]:
    os.makedirs(outdir, exist_ok=True)
    work = os.path.join(outdir, ".work")
    os.makedirs(work, exist_ok=True)
    slug = clip.get("slug") or clip.get("id") or "clip"
    out_path = os.path.join(outdir, f"{slug}.mp4")

    out_w, out_h = output_size(ratio, info, max_height=max_height)
    crop = build_crop_plan(source, info, clip, ratio=ratio,
                           mode="none" if fit != "crop" else reframe)

    ass_path = None
    if subs != "none":
        clip_words = words_in_range(words, float(clip["start"]), float(clip["end"]))
        if clip_words:
            ass_path = write_ass(
                os.path.join(work, f"{slug}.ass"),
                build_ass(clip_words, width=out_w, height=out_h,
                          clip_start=float(clip["start"]), mode=subs,
                          style_name=style, uppercase=uppercase, font=font,
                          size_scale=sub_scale, margin_ratio=sub_margin),
            )
        else:
            log(f"{slug}: в диапазоне нет слов — рендерю без субтитров.")

    cmd_path = None
    if fit == "crop" and crop.get("keyframes"):
        cmd_path = sendcmd_file(crop, os.path.join(work, f"{slug}.sendcmd"))

    graph = build_filter(crop, out_w, out_h, fit=fit, ass_path=ass_path,
                         cmd_path=cmd_path, fps=fps)
    command = build_command(source, clip, out_path, filtergraph=graph,
                            has_audio=info.has_audio, crf=crf, preset=preset,
                            loudness=loudness)
    try:
        run(command)
        used_mode = crop["mode"] if cmd_path else ("static" if fit == "crop" else fit)
    except AutocutError as exc:
        if cmd_path is None:
            raise
        # Некоторые сборки ffmpeg собраны без sendcmd — молча падаем в статичный кроп.
        log(f"{slug}: трекинг не отработал ({exc.args[0][:120]}…). Повторяю со статичным кропом.")
        graph = build_filter(crop, out_w, out_h, fit=fit, ass_path=ass_path,
                             cmd_path=None, fps=fps)
        run(build_command(source, clip, out_path, filtergraph=graph,
                          has_audio=info.has_audio, crf=crf, preset=preset,
                          loudness=loudness))
        used_mode = "static"

    result = {
        "id": clip.get("id"),
        "title": clip.get("title"),
        "file": os.path.abspath(out_path),
        "start": clip["start"],
        "end": clip["end"],
        "duration": round(float(clip["end"]) - float(clip["start"]), 3),
        "size": f"{out_w}x{out_h}",
        "fit": fit,
        "reframe": used_mode,
        "detector": crop.get("detector"),
        "subtitles": subs if ass_path else "none",
        "style": style if ass_path else None,
        "bytes": os.path.getsize(out_path) if os.path.exists(out_path) else 0,
    }
    if cover:
        result["cover"] = cover_frame(source, clip, os.path.join(outdir, f"{slug}.jpg"),
                                      out_w, out_h, crop, fit)
    return result


def cleanup_work(outdir: str, keep: bool) -> None:
    work = os.path.join(outdir, ".work")
    if not keep and os.path.isdir(work):
        shutil.rmtree(work, ignore_errors=True)
