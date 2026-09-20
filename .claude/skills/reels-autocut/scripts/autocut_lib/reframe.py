"""Кадрирование под вертикаль: где в кадре субъект и как за ним ехать.

Три уровня детекции, от лучшего к всегда-доступному:
  1. OpenCV — лица (talking head);
  2. центроид движения по колонкам кадра (чистый Python, numpy только ускоряет);
  3. центр кадра.
"""
from __future__ import annotations

import os
import subprocess
from typing import Any, Iterator, Sequence

from .util import AutocutError, MediaInfo, log, run, tool

GRAY_W = 160
GRAY_H = 90


def _iter_gray_frames(source: str, start: float, end: float, fps: float,
                      width: int = GRAY_W, height: int = GRAY_H) -> Iterator[bytes]:
    """Кадры в grayscale через ffmpeg rawvideo pipe, без временных файлов."""
    frame_size = width * height
    cmd = [
        tool("ffmpeg"), "-hide_banner", "-loglevel", "error",
        "-ss", f"{start:.3f}", "-t", f"{max(0.04, end - start):.3f}",
        "-i", source,
        "-vf", f"fps={fps},scale={width}:{height}",
        "-pix_fmt", "gray", "-f", "rawvideo", "-",
    ]
    log("$ " + " ".join(cmd))
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    assert proc.stdout is not None
    try:
        while True:
            buf = proc.stdout.read(frame_size)
            if not buf or len(buf) < frame_size:
                break
            yield buf
    finally:
        proc.stdout.close()
        proc.wait()


def _column_energy(prev: bytes, cur: bytes, width: int, height: int) -> list[int]:
    try:
        import numpy as np  # type: ignore
        a = np.frombuffer(prev, dtype=np.uint8).astype(np.int16).reshape(height, width)
        b = np.frombuffer(cur, dtype=np.uint8).astype(np.int16).reshape(height, width)
        return np.abs(b - a).sum(axis=0).tolist()
    except ImportError:
        cols = [0] * width
        for row in range(height):
            base = row * width
            for col in range(width):
                idx = base + col
                cols[col] += abs(cur[idx] - prev[idx])
        return cols


def motion_centers(source: str, start: float, end: float, *, fps: float = 3.0) -> list[tuple[float, float]]:
    """[(t, x_доля 0..1)] по центроиду межкадрового движения.

    Порог адаптивный: считаем энергию всех пар кадров и отсекаем те, что заметно
    тише медианы. Фиксированный порог врал бы на тёмной или малоконтрастной картинке.
    """
    frames = list(_iter_gray_frames(source, start, end, fps))
    if len(frames) < 2:
        return []

    energies: list[list[int]] = []
    for i in range(1, len(frames)):
        energies.append(_column_energy(frames[i - 1], frames[i], GRAY_W, GRAY_H))
    totals = [sum(cols) for cols in energies]
    ordered = sorted(totals)
    median = ordered[len(ordered) // 2]
    floor = GRAY_W * GRAY_H * 0.08  # совсем плоский кадр — это шум кодека
    threshold = max(floor, median * 0.35)

    out: list[tuple[float, float]] = []
    last = 0.5
    for i, cols in enumerate(energies, start=1):
        total = totals[i - 1]
        if total >= threshold:
            weighted = sum(c * (idx + 0.5) for idx, c in enumerate(cols))
            last = min(1.0, max(0.0, weighted / total / GRAY_W))
        out.append((start + i / fps, last))
    return out


def face_centers(source: str, start: float, end: float, *, fps: float = 2.0) -> list[tuple[float, float]]:
    """[(t, x_доля)] по самому крупному лицу в кадре. Пусто, если OpenCV нет."""
    try:
        import cv2  # type: ignore
    except ImportError:
        log("OpenCV не установлен — детекция лиц пропущена (pip install opencv-python).")
        return []

    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    cascade = cv2.CascadeClassifier(cascade_path)
    if cascade.empty():
        log("Каскад Haar не загрузился — детекция лиц пропущена.")
        return []

    width, height = 320, 180
    frame_size = width * height
    cmd = [
        tool("ffmpeg"), "-hide_banner", "-loglevel", "error",
        "-ss", f"{start:.3f}", "-t", f"{max(0.04, end - start):.3f}", "-i", source,
        "-vf", f"fps={fps},scale={width}:{height}", "-pix_fmt", "gray", "-f", "rawvideo", "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    assert proc.stdout is not None
    out: list[tuple[float, float]] = []
    index = 0
    try:
        import numpy as np  # type: ignore
    except ImportError:
        proc.kill()
        log("Для детекции лиц нужен numpy — ставится вместе с opencv-python.")
        return []
    try:
        while True:
            buf = proc.stdout.read(frame_size)
            if not buf or len(buf) < frame_size:
                break
            frame = np.frombuffer(buf, dtype=np.uint8).reshape(height, width)
            faces = cascade.detectMultiScale(frame, scaleFactor=1.15, minNeighbors=5,
                                             minSize=(24, 24))
            if len(faces):
                x, _y, w, _h = max(faces, key=lambda f: f[2] * f[3])
                out.append((start + index / fps, min(1.0, max(0.0, (x + w / 2) / width))))
            index += 1
    finally:
        proc.stdout.close()
        proc.wait()
    return out


def smooth(points: Sequence[tuple[float, float]], *, alpha: float = 0.18,
           deadband: float = 0.035) -> list[tuple[float, float]]:
    """Экспоненциальное сглаживание + мёртвая зона: камера не дёргается по мелочи."""
    if not points:
        return []
    smoothed: list[tuple[float, float]] = []
    value = points[0][1]
    target = value
    for t, raw in points:
        if abs(raw - target) > deadband:
            target = raw
        value += alpha * (target - value)
        smoothed.append((round(t, 3), round(min(1.0, max(0.0, value)), 4)))
    return smoothed


def _median(values: Sequence[float]) -> float:
    if not values:
        return 0.5
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def target_size(info: MediaInfo, ratio: str) -> tuple[int, int]:
    if ratio == "source":
        return info.width - (info.width % 2), info.height - (info.height % 2)
    try:
        rw, rh = (int(part) for part in ratio.replace(":", "x").split("x"))
    except ValueError as exc:
        raise AutocutError(f"Не понял формат --ratio {ratio!r}. Пиши как 9:16 или 1:1.") from exc
    if rw <= 0 or rh <= 0:
        raise AutocutError(f"Формат --ratio {ratio!r} должен быть положительным.")

    crop_h = info.height
    crop_w = int(round(crop_h * rw / rh))
    if crop_w > info.width:
        crop_w = info.width
        crop_h = int(round(crop_w * rh / rw))
    # Чётные размеры — требование H.264.
    return crop_w - (crop_w % 2), crop_h - (crop_h % 2)


def build_crop_plan(source: str, info: MediaInfo, clip: dict[str, Any], *, ratio: str = "9:16",
                    mode: str = "track") -> dict[str, Any]:
    """Возвращает описание кропа: размеры, статичный x и (для track) кейфреймы."""
    crop_w, crop_h = target_size(info, ratio)
    max_x = max(0, info.width - crop_w)
    if ratio == "source":
        mode = "none"
    plan: dict[str, Any] = {
        "mode": mode,
        "crop_w": crop_w,
        "crop_h": crop_h,
        "crop_y": max(0, (info.height - crop_h) // 2),
        "max_x": max_x,
        "detector": "center",
        "static_x": max_x // 2,
        "keyframes": [],
    }
    if max_x == 0 or mode in ("none", "center"):
        return plan

    start, end = float(clip["start"]), float(clip["end"])
    points = face_centers(source, start, end)
    detector = "faces"
    coverage = len(points) / max(1.0, (end - start) * 2.0)
    if coverage < 0.35:
        if points:
            log(f"Лицо найдено лишь в {coverage:.0%} кадров — беру центроид движения.")
        points = motion_centers(source, start, end)
        detector = "motion" if points else "center"
    plan["detector"] = detector
    if not points:
        return plan

    smoothed = smooth(points)
    plan["static_x"] = int(round(min(max_x, max(0, _median([p[1] for p in smoothed]) * info.width - crop_w / 2))))
    if mode == "static":
        plan["keyframes"] = []
        return plan

    keyframes = []
    last_x = None
    for t, frac in smoothed:
        x = int(round(min(max_x, max(0, frac * info.width - crop_w / 2))))
        if last_x is not None and abs(x - last_x) < 4:
            continue  # не пишем команду ради двух пикселей
        keyframes.append({"t": round(max(0.0, t - start), 3), "x": x})
        last_x = x
    plan["keyframes"] = keyframes
    if len(keyframes) <= 1:
        plan["mode"] = "static"
    return plan


def sendcmd_file(plan: dict[str, Any], path: str) -> str:
    """Файл команд для фильтра sendcmd: ведёт crop.x по кейфреймам."""
    lines = [f"{kf['t']:.3f} crop x {kf['x']};" for kf in plan.get("keyframes", [])]
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return os.path.abspath(path)
