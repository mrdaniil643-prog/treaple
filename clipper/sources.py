"""Fetch a long source video and prepare the working directory."""

from __future__ import annotations

import shutil
from dataclasses import asdict, dataclass
from pathlib import Path

from .config import Config
from .utils import log, probe, run, slugify, write_json


@dataclass
class Source:
    slug: str
    title: str
    url: str
    video_path: Path
    audio_path: Path
    work_dir: Path
    duration: float
    width: int
    height: int

    def to_dict(self) -> dict:
        data = asdict(self)
        for key in ("video_path", "audio_path", "work_dir"):
            data[key] = str(data[key])
        return data


def _ydl_opts(cfg: Config, outtmpl: str) -> dict:
    opts = {
        "outtmpl": outtmpl,
        "format": (
            f"bestvideo[height<={cfg.source.max_height}][ext=mp4]+bestaudio[ext=m4a]"
            f"/bestvideo[height<={cfg.source.max_height}]+bestaudio"
            f"/best[height<={cfg.source.max_height}]/best"
        ),
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "retries": 5,
        "fragment_retries": 5,
    }
    if cfg.source.cookies_file:
        opts["cookiefile"] = cfg.source.cookies_file
    return opts


def ingest(url_or_path: str, cfg: Config, *, force: bool = False) -> Source:
    """Download (or copy in) a source video, then extract 16 kHz mono audio.

    Accepts a URL for yt-dlp or a path to a local file.
    """
    local = Path(url_or_path)
    if local.exists():
        return _ingest_local(local, cfg, force=force)
    return _ingest_url(url_or_path, cfg, force=force)


def _prepare_dir(cfg: Config, slug: str, force: bool) -> Path:
    work_dir = cfg.work_path / slug
    if force and work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    return work_dir


def _ingest_local(path: Path, cfg: Config, *, force: bool) -> Source:
    slug = slugify(path.stem)
    work_dir = _prepare_dir(cfg, slug, force)
    video_path = work_dir / f"source{path.suffix.lower() or '.mp4'}"

    if not video_path.exists():
        log.info("linking local source %s", path)
        try:
            video_path.symlink_to(path.resolve())
        except OSError:
            shutil.copy2(path, video_path)

    return _finalize(slug, path.stem, str(path), video_path, work_dir, cfg)


def _ingest_url(url: str, cfg: Config, *, force: bool) -> Source:
    import yt_dlp

    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
        info = ydl.extract_info(url, download=False)

    title = info.get("title") or info.get("id") or "source"
    slug = slugify(f"{title}-{info.get('id', '')}")
    work_dir = _prepare_dir(cfg, slug, force)

    existing = sorted(work_dir.glob("source.*"))
    existing = [p for p in existing if p.suffix != ".wav"]
    if existing:
        log.info("source already downloaded: %s", existing[0])
        video_path = existing[0]
    else:
        log.info("downloading %r (%.0f s)", title, info.get("duration") or 0)
        outtmpl = str(work_dir / "source.%(ext)s")
        with yt_dlp.YoutubeDL(_ydl_opts(cfg, outtmpl)) as ydl:
            ydl.download([url])
        candidates = [p for p in sorted(work_dir.glob("source.*")) if p.suffix != ".wav"]
        if not candidates:
            raise RuntimeError("download produced no file")
        video_path = candidates[0]

    return _finalize(slug, title, url, video_path, work_dir, cfg)


def _finalize(
    slug: str, title: str, url: str, video_path: Path, work_dir: Path, cfg: Config
) -> Source:
    audio_path = work_dir / "audio.wav"
    if not audio_path.exists():
        log.info("extracting audio")
        run([
            "ffmpeg", "-y", "-v", "error", "-i", str(video_path),
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
            str(audio_path),
        ])

    info = probe(video_path)
    source = Source(
        slug=slug,
        title=title,
        url=url,
        video_path=video_path,
        audio_path=audio_path,
        work_dir=work_dir,
        duration=info.duration,
        width=info.width,
        height=info.height,
    )
    write_json(work_dir / "source.json", source.to_dict())
    log.info(
        "source ready: %s  %dx%d  %.1f min",
        slug, info.width, info.height, info.duration / 60,
    )
    return source


def load_source(work_dir: Path) -> Source:
    """Rehydrate a Source from a work directory written by ingest()."""
    from .utils import read_json

    data = read_json(work_dir / "source.json")
    return Source(
        slug=data["slug"],
        title=data["title"],
        url=data["url"],
        video_path=Path(data["video_path"]),
        audio_path=Path(data["audio_path"]),
        work_dir=Path(data["work_dir"]),
        duration=data["duration"],
        width=data["width"],
        height=data["height"],
    )
