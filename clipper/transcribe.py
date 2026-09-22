"""Word-level transcription with faster-whisper (runs locally, costs nothing)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import Config
from .utils import log, read_json, write_json


@dataclass
class Word:
    start: float
    end: float
    text: str
    prob: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


@dataclass
class Transcript:
    language: str
    words: list[Word]

    @property
    def text(self) -> str:
        return "".join(w.text for w in self.words).strip()

    @property
    def duration(self) -> float:
        return self.words[-1].end if self.words else 0.0

    def slice(self, start: float, end: float) -> list[Word]:
        return [w for w in self.words if w.start >= start - 1e-6 and w.end <= end + 1e-6]


def transcribe(audio_path: Path, cfg: Config, *, cache_path: Path | None = None,
               force: bool = False) -> Transcript:
    """Transcribe audio to word-level timings, caching the result as JSON."""
    if cache_path and cache_path.exists() and not force:
        log.info("using cached transcript %s", cache_path)
        return load_transcript(cache_path)

    from faster_whisper import WhisperModel

    log.info("loading whisper model %r (%s)", cfg.transcribe.model, cfg.transcribe.compute_type)
    model = WhisperModel(
        cfg.transcribe.model,
        device="cpu",
        compute_type=cfg.transcribe.compute_type,
    )

    segments, info = model.transcribe(
        str(audio_path),
        language=cfg.transcribe.language or None,
        beam_size=cfg.transcribe.beam_size,
        word_timestamps=True,
        vad_filter=cfg.transcribe.vad_filter,
        vad_parameters={"min_silence_duration_ms": 400},
    )

    log.info("language=%s (p=%.2f), transcribing...", info.language, info.language_probability)

    words: list[Word] = []
    for segment in segments:
        for word in segment.words or []:
            text = word.word
            if not text or not text.strip():
                continue
            words.append(
                Word(
                    start=float(word.start),
                    end=float(word.end),
                    text=text,
                    prob=float(getattr(word, "probability", 1.0) or 0.0),
                )
            )
        if len(words) % 500 < 10 and words:
            log.debug("  %.1f min transcribed", words[-1].end / 60)

    transcript = Transcript(language=info.language, words=words)
    log.info("transcript: %d words, %.1f min", len(words), transcript.duration / 60)

    if cache_path:
        save_transcript(transcript, cache_path)
    return transcript


def save_transcript(transcript: Transcript, path: Path) -> None:
    write_json(
        path,
        {
            "language": transcript.language,
            "words": [
                {"s": round(w.start, 3), "e": round(w.end, 3), "t": w.text,
                 "p": round(w.prob, 3)}
                for w in transcript.words
            ],
        },
    )


def load_transcript(path: Path) -> Transcript:
    data = read_json(path)
    return Transcript(
        language=data.get("language", ""),
        words=[
            Word(start=w["s"], end=w["e"], text=w["t"], prob=w.get("p", 1.0))
            for w in data["words"]
        ],
    )
