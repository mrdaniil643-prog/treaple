"""Typed config loaded from TOML, with defaults that work out of the box."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any


@dataclass
class PathsConfig:
    work_dir: str = "work"
    out_dir: str = "out"


@dataclass
class SourceConfig:
    max_height: int = 1080
    cookies_file: str = ""


@dataclass
class TranscribeConfig:
    model: str = "small"
    language: str = ""
    compute_type: str = "int8"
    beam_size: int = 5
    vad_filter: bool = True


@dataclass
class ClipsConfig:
    min_seconds: float = 18.0
    max_seconds: float = 59.0
    target_count: int = 12
    min_score: float = 0.35
    pad_start: float = 0.25
    pad_end: float = 0.45


@dataclass
class RenderConfig:
    width: int = 1080
    height: int = 1920
    fps: int = 30
    crf: int = 20
    preset: str = "medium"
    audio_bitrate: str = "160k"
    reframe: str = "smart"
    loudnorm: bool = True


@dataclass
class SubtitlesConfig:
    enabled: bool = True
    font: str = "DejaVu Sans"
    font_size: int = 78
    group_size: int = 4
    primary_color: str = "&H00FFFFFF"
    highlight_color: str = "&H0000E5FF"
    outline: int = 5
    shadow: int = 2
    margin_v: int = 620
    uppercase: bool = False


@dataclass
class Config:
    paths: PathsConfig = field(default_factory=PathsConfig)
    source: SourceConfig = field(default_factory=SourceConfig)
    transcribe: TranscribeConfig = field(default_factory=TranscribeConfig)
    clips: ClipsConfig = field(default_factory=ClipsConfig)
    render: RenderConfig = field(default_factory=RenderConfig)
    subtitles: SubtitlesConfig = field(default_factory=SubtitlesConfig)

    @property
    def work_path(self) -> Path:
        return Path(self.paths.work_dir)

    @property
    def out_path(self) -> Path:
        return Path(self.paths.out_dir)


def _fill(target: Any, data: dict[str, Any], where: str) -> None:
    """Copy known keys onto a dataclass instance; reject unknown ones loudly."""
    known = {f.name: f.type for f in fields(target)}
    for key, value in data.items():
        if key not in known:
            raise ValueError(f"unknown option [{where}] {key!r}")
        current = getattr(target, key)
        if isinstance(current, bool) and not isinstance(value, bool):
            raise ValueError(f"[{where}] {key} must be true/false")
        if isinstance(current, float) and isinstance(value, int):
            value = float(value)
        setattr(target, key, value)


def load_config(path: str | Path | None = None) -> Config:
    """Load config.toml if present; missing file means all-defaults."""
    cfg = Config()
    if path is None:
        candidate = Path("config.toml")
        if not candidate.exists():
            return cfg
        path = candidate

    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"config not found: {path}")

    data = tomllib.loads(path.read_text(encoding="utf-8"))
    for section, value in data.items():
        if not hasattr(cfg, section):
            raise ValueError(f"unknown config section [{section}]")
        target = getattr(cfg, section)
        if not is_dataclass(target):
            raise ValueError(f"[{section}] is not a config section")
        if not isinstance(value, dict):
            raise ValueError(f"[{section}] must be a table")
        _fill(target, value, section)

    return cfg
