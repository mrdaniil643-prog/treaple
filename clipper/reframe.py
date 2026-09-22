"""Turn a 16:9 frame into 9:16 without cutting off whoever is talking.

Three strategies:
  center -- fixed centre crop, zero analysis
  smart  -- sample the clip, put the crop window where the motion and
            detail are (the speaker, in practice)
  blur   -- keep the whole frame, fill the rest with a blurred copy
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .config import Config
from .utils import log

SAMPLE_W = 320
SAMPLE_H = 180
SAMPLE_FPS = 2.0


@dataclass
class CropPlan:
    mode: str
    crop_w: int = 0
    crop_h: int = 0
    crop_x: int = 0
    crop_y: int = 0

    def filter_chain(self, cfg: Config) -> str:
        """ffmpeg filter string producing a width x height vertical frame."""
        out_w, out_h = cfg.render.width, cfg.render.height
        if self.mode == "blur":
            return (
                f"split=2[bg][fg];"
                f"[bg]scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
                f"crop={out_w}:{out_h},gblur=sigma=28[bgb];"
                f"[fg]scale={out_w}:-2:force_original_aspect_ratio=decrease[fgs];"
                f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2"
            )
        return (
            f"crop={self.crop_w}:{self.crop_h}:{self.crop_x}:{self.crop_y},"
            f"scale={out_w}:{out_h}:flags=lanczos"
        )


def _crop_box(src_w: int, src_h: int, cfg: Config) -> tuple[int, int]:
    """Largest box with the output aspect ratio that fits inside the source."""
    target_aspect = cfg.render.width / cfg.render.height
    crop_h = src_h
    crop_w = int(round(crop_h * target_aspect))
    if crop_w > src_w:
        crop_w = src_w
        crop_h = int(round(crop_w / target_aspect))
    # keep even dimensions for yuv420p
    return crop_w - (crop_w % 2), crop_h - (crop_h % 2)


def plan(
    video_path: Path, start: float, end: float, src_w: int, src_h: int, cfg: Config
) -> CropPlan:
    mode = cfg.render.reframe
    target_aspect = cfg.render.width / cfg.render.height

    # Source already as tall as the target (or taller): cropping would only
    # throw away picture, so letterbox it over a blurred fill instead.
    if src_w and src_h and (src_w / src_h) <= target_aspect + 1e-3:
        if mode != "blur":
            log.debug("source is already %.2f aspect -> using blur reframe", src_w / src_h)
        return CropPlan(mode="blur")

    if mode == "blur":
        return CropPlan(mode="blur")

    crop_w, crop_h = _crop_box(src_w, src_h, cfg)
    crop_y = max(0, (src_h - crop_h) // 2)

    if mode == "center":
        return CropPlan("center", crop_w, crop_h, max(0, (src_w - crop_w) // 2), crop_y)

    if mode != "smart":
        raise ValueError(f"unknown reframe mode {mode!r} (center|smart|blur)")

    column_score = _column_interest(video_path, start, end)
    if column_score is None:
        log.debug("frame sampling failed, falling back to centre crop")
        return CropPlan("center", crop_w, crop_h, max(0, (src_w - crop_w) // 2), crop_y)

    crop_x = _best_window(column_score, crop_w, src_w)
    return CropPlan("smart", crop_w, crop_h, crop_x, crop_y)


def _column_interest(video_path: Path, start: float, end: float) -> np.ndarray | None:
    """Per-column 'interest' = temporal motion + spatial detail, at SAMPLE_W."""
    duration = max(0.5, end - start)
    cmd = [
        "ffmpeg", "-v", "error",
        "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(video_path),
        "-vf", f"fps={SAMPLE_FPS},scale={SAMPLE_W}:{SAMPLE_H}",
        "-pix_fmt", "gray", "-f", "rawvideo", "-",
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0 or not proc.stdout:
        return None

    frame_size = SAMPLE_W * SAMPLE_H
    count = len(proc.stdout) // frame_size
    if count < 2:
        return None

    frames = (
        np.frombuffer(proc.stdout[: count * frame_size], dtype=np.uint8)
        .reshape(count, SAMPLE_H, SAMPLE_W)
        .astype(np.float32)
    )

    motion = np.abs(np.diff(frames, axis=0)).mean(axis=(0, 1))       # per column
    detail = np.abs(np.diff(frames, axis=2)).mean(axis=(0, 1))       # per column
    detail = np.concatenate([detail, detail[-1:]])                    # pad to SAMPLE_W

    motion = _unit(motion)
    detail = _unit(detail)
    combined = 0.65 * motion + 0.35 * detail
    return _smooth(combined, 15)


def _unit(values: np.ndarray) -> np.ndarray:
    lo, hi = float(values.min()), float(values.max())
    if hi - lo < 1e-9:
        return np.full_like(values, 0.5)
    return (values - lo) / (hi - lo)


def _smooth(values: np.ndarray, window: int) -> np.ndarray:
    if window <= 1 or values.size < window:
        return values
    kernel = np.ones(window, dtype=np.float32) / window
    return np.convolve(values, kernel, mode="same")


def _best_window(column_score: np.ndarray, crop_w: int, src_w: int) -> int:
    """Slide the crop window across the interest curve and take the best x."""
    sample_crop = max(1, int(round(crop_w * SAMPLE_W / src_w)))
    if sample_crop >= column_score.size:
        return max(0, (src_w - crop_w) // 2)

    cumulative = np.concatenate([[0.0], np.cumsum(column_score)])
    sums = cumulative[sample_crop:] - cumulative[:-sample_crop]

    # Mild pull toward centre: all else equal, a centred subject looks composed.
    centres = np.arange(sums.size) + sample_crop / 2
    bias = 1.0 - 0.15 * np.abs(centres - SAMPLE_W / 2) / (SAMPLE_W / 2)
    best = int(np.argmax(sums * bias))

    crop_x = int(round(best * src_w / SAMPLE_W))
    crop_x = max(0, min(crop_x, src_w - crop_w))
    return crop_x - (crop_x % 2)
