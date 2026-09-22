"""Cut, reframe, caption and encode one vertical clip."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import Config
from .reframe import CropPlan
from .utils import log, run


@dataclass
class RenderJob:
    source_video: Path
    start: float
    end: float
    plan: CropPlan
    out_path: Path
    ass_path: Path | None = None

    @property
    def duration(self) -> float:
        return max(0.1, self.end - self.start)


def _escape_filter_path(path: Path) -> str:
    """Escape a path for use inside an ffmpeg filter argument."""
    text = str(path).replace("\\", "/")
    text = text.replace(":", r"\:").replace("'", r"\'")
    return text


def build_filter(job: RenderJob, cfg: Config) -> str:
    chain = job.plan.filter_chain(cfg)
    chain = f"{chain},fps={cfg.render.fps}"
    if job.ass_path is not None:
        chain = f"{chain},subtitles='{_escape_filter_path(job.ass_path)}'"
    chain = f"{chain},format=yuv420p"
    return f"[0:v]{chain}[vout]"


def render(job: RenderJob, cfg: Config, *, has_audio: bool = True) -> Path:
    job.out_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y", "-v", "error", "-stats",
        "-ss", f"{job.start:.3f}",
        "-t", f"{job.duration:.3f}",
        "-i", str(job.source_video),
        "-filter_complex", build_filter(job, cfg),
        "-map", "[vout]",
    ]

    if has_audio:
        cmd += ["-map", "0:a:0?"]
        if cfg.render.loudnorm:
            # -14 LUFS is what YouTube and Instagram normalise toward anyway;
            # matching it up front avoids them turning the clip down.
            cmd += ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11"]
        cmd += ["-c:a", "aac", "-b:a", cfg.render.audio_bitrate, "-ar", "48000"]
    else:
        cmd += ["-an"]

    cmd += [
        "-c:v", "libx264",
        "-preset", cfg.render.preset,
        "-crf", str(cfg.render.crf),
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(job.out_path),
    ]

    log.info("rendering %s  (%.1fs, %s)", job.out_path.name, job.duration, job.plan.mode)
    run(cmd)
    return job.out_path
