"""Group words into sentences, then into candidate clip windows."""

from __future__ import annotations

import re
from dataclasses import dataclass

from .config import Config
from .transcribe import Transcript, Word

TERMINATORS = ".!?…"
# A pause this long reads as a sentence break even without punctuation,
# which matters a lot for speech-to-text that under-punctuates.
PAUSE_BREAK = 0.70
MAX_SENTENCE_WORDS = 45


@dataclass
class Sentence:
    index: int
    start: float
    end: float
    words: list[Word]

    @property
    def text(self) -> str:
        return "".join(w.text for w in self.words).strip()

    @property
    def duration(self) -> float:
        return self.end - self.start

    @property
    def word_count(self) -> int:
        return len(self.words)


@dataclass
class Candidate:
    id: str
    start: float
    end: float
    first_sentence: int
    last_sentence: int
    text: str
    score: float = 0.0
    features: dict | None = None
    title: str = ""
    reason: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start


def build_sentences(transcript: Transcript) -> list[Sentence]:
    """Split the word stream into sentence-ish units."""
    sentences: list[Sentence] = []
    current: list[Word] = []

    def flush() -> None:
        if not current:
            return
        sentences.append(
            Sentence(
                index=len(sentences),
                start=current[0].start,
                end=current[-1].end,
                words=list(current),
            )
        )
        current.clear()

    for i, word in enumerate(transcript.words):
        current.append(word)
        stripped = word.text.strip()
        ends_sentence = bool(stripped) and stripped[-1] in TERMINATORS
        gap_next = (
            transcript.words[i + 1].start - word.end
            if i + 1 < len(transcript.words)
            else float("inf")
        )
        if ends_sentence or gap_next >= PAUSE_BREAK or len(current) >= MAX_SENTENCE_WORDS:
            flush()

    flush()
    return sentences


def build_candidates(sentences: list[Sentence], cfg: Config) -> list[Candidate]:
    """Every run of consecutive sentences that fits the duration window.

    Clips are cut on sentence boundaries so they never open or close
    mid-thought -- the single biggest quality lever in clipping.
    """
    candidates: list[Candidate] = []
    min_s, max_s = cfg.clips.min_seconds, cfg.clips.max_seconds

    for i in range(len(sentences)):
        for j in range(i, len(sentences)):
            start = sentences[i].start
            end = sentences[j].end
            duration = end - start
            if duration < min_s:
                continue
            if duration > max_s:
                break
            text = " ".join(s.text for s in sentences[i : j + 1]).strip()
            if not text:
                continue
            candidates.append(
                Candidate(
                    id=f"c{i:04d}_{j:04d}",
                    start=start,
                    end=end,
                    first_sentence=i,
                    last_sentence=j,
                    text=_normalize_spaces(text),
                )
            )

    return candidates


def select_non_overlapping(
    candidates: list[Candidate], limit: int, *, min_score: float = 0.0
) -> list[Candidate]:
    """Greedy pick of the best scoring clips that do not overlap each other."""
    chosen: list[Candidate] = []
    for cand in sorted(candidates, key=lambda c: c.score, reverse=True):
        if cand.score < min_score:
            break
        if any(cand.start < c.end and c.start < cand.end for c in chosen):
            continue
        chosen.append(cand)
        if len(chosen) >= limit:
            break
    return sorted(chosen, key=lambda c: c.start)


def _normalize_spaces(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return re.sub(r"\s+([,.!?;:…])", r"\1", text).strip()
