"""End-to-end orchestration: source -> transcript -> candidates -> clips."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .audio import rms_envelope
from .config import Config
from .reframe import plan as plan_reframe
from .render import RenderJob, render
from .score import apply_review, score_candidates
from .segment import Candidate, build_candidates, build_sentences, select_non_overlapping
from .sources import Source, ingest, load_source
from .subtitles import build_ass, write_ass
from .transcribe import Transcript, transcribe
from .utils import log, probe, slugify, timestamp, write_json


@dataclass
class ClipResult:
    id: str
    path: Path
    start: float
    end: float
    score: float
    title: str
    text: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "file": str(self.path),
            "start": round(self.start, 2),
            "end": round(self.end, 2),
            "duration": round(self.end - self.start, 2),
            "score": self.score,
            "title": self.title,
            "text": self.text,
        }


def analyze(
    url_or_path: str,
    cfg: Config,
    *,
    force_download: bool = False,
    force_transcribe: bool = False,
) -> tuple[Source, Transcript, list[Candidate]]:
    """Everything up to (not including) rendering. Cheap to re-run."""
    source = ingest(url_or_path, cfg, force=force_download)
    transcript = transcribe(
        source.audio_path,
        cfg,
        cache_path=source.work_dir / "transcript.json",
        force=force_transcribe,
    )

    sentences = build_sentences(transcript)
    log.info("%d sentences", len(sentences))

    candidates = build_candidates(sentences, cfg)
    log.info("%d candidate windows", len(candidates))
    if not candidates:
        return source, transcript, []

    envelope = rms_envelope(source.audio_path)
    score_candidates(candidates, cfg, envelope=envelope, transcript=transcript)

    write_json(
        source.work_dir / "candidates.json",
        [
            {
                "id": c.id, "start": round(c.start, 2), "end": round(c.end, 2),
                "duration": round(c.duration, 1), "score": c.score,
                "features": c.features, "text": c.text,
            }
            for c in sorted(candidates, key=lambda c: c.score, reverse=True)
        ],
    )
    return source, transcript, candidates


def make_clips(
    source: Source,
    transcript: Transcript,
    candidates: list[Candidate],
    cfg: Config,
    *,
    limit: int | None = None,
    review_file: Path | None = None,
) -> list[ClipResult]:
    """Render the best non-overlapping candidates to vertical MP4s."""
    if review_file and review_file.exists():
        log.info("applying review scores from %s", review_file)
        apply_review(candidates, review_file)

    limit = limit or cfg.clips.target_count
    chosen = select_non_overlapping(candidates, limit, min_score=cfg.clips.min_score)
    if not chosen:
        log.warning(
            "no candidate cleared min_score=%.2f (best was %.2f)",
            cfg.clips.min_score,
            max((c.score for c in candidates), default=0.0),
        )
        return []

    info = probe(source.video_path)
    out_dir = cfg.out_path / source.slug
    clip_dir = source.work_dir / "clips"
    results: list[ClipResult] = []

    for position, cand in enumerate(chosen, start=1):
        start = max(0.0, cand.start - cfg.clips.pad_start)
        end = min(source.duration, cand.end + cfg.clips.pad_end)

        ass_path = None
        if cfg.subtitles.enabled:
            words = transcript.slice(cand.start, cand.end)
            if words:
                ass_path = write_ass(
                    clip_dir / f"{cand.id}.ass",
                    build_ass(words, start, end - start, cfg),
                )

        title = cand.title or _auto_title(cand.text)
        out_path = out_dir / f"{position:02d}-{slugify(title, 40) or cand.id}.mp4"

        crop_plan = plan_reframe(
            source.video_path, start, end, info.width, info.height, cfg
        )
        job = RenderJob(
            source_video=source.video_path,
            start=start,
            end=end,
            plan=crop_plan,
            out_path=out_path,
            ass_path=ass_path,
        )
        render(job, cfg, has_audio=info.has_audio)

        result = ClipResult(
            id=cand.id, path=out_path, start=start, end=end,
            score=cand.score, title=title, text=cand.text,
        )
        results.append(result)
        _write_sidecar(result, source, cand)
        log.info(
            "  %2d. %.3f  %s -> %s  %r",
            position, cand.score, timestamp(start), timestamp(end), title,
        )

    write_json(
        out_dir / "clips.json",
        {
            "source": {"title": source.title, "url": source.url, "slug": source.slug},
            "clips": [r.to_dict() for r in results],
        },
    )
    return results


def run(
    url_or_path: str,
    cfg: Config,
    *,
    limit: int | None = None,
    force_download: bool = False,
    force_transcribe: bool = False,
    review_file: Path | None = None,
) -> list[ClipResult]:
    source, transcript, candidates = analyze(
        url_or_path, cfg,
        force_download=force_download,
        force_transcribe=force_transcribe,
    )
    if not candidates:
        log.warning("nothing to clip")
        return []
    return make_clips(
        source, transcript, candidates, cfg, limit=limit, review_file=review_file
    )


def _auto_title(text: str, max_len: int = 70) -> str:
    """First sentence, trimmed to a usable hook. Beats 'Clip 03' by a mile."""
    first = re.split(r"(?<=[.!?…])\s+", text.strip())[0]
    first = first.strip(" -–—,")
    if len(first) <= max_len:
        return first
    cut = first[:max_len].rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:") + "..."


def _write_sidecar(result: ClipResult, source: Source, cand: Candidate) -> None:
    """Human-facing text file: caption, hashtags, attribution."""
    hashtags = "#shorts #рекомендации #подкаст"
    body = (
        f"{result.title}\n\n"
        f"{result.text}\n\n"
        f"Источник: {source.title}\n"
        f"{source.url}\n\n"
        f"{hashtags}\n"
        f"---\n"
        f"score={result.score}  features={cand.features}\n"
    )
    result.path.with_suffix(".txt").write_text(body, encoding="utf-8")


def load_existing(work_dir: Path, cfg: Config) -> tuple[Source, Transcript, list[Candidate]]:
    """Re-open a previously analyzed source without re-downloading anything."""
    from .transcribe import load_transcript

    source = load_source(work_dir)
    transcript = load_transcript(work_dir / "transcript.json")
    sentences = build_sentences(transcript)
    candidates = build_candidates(sentences, cfg)
    envelope = rms_envelope(source.audio_path)
    score_candidates(candidates, cfg, envelope=envelope, transcript=transcript)
    return source, transcript, candidates
