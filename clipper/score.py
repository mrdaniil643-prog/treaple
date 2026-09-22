"""Rank candidate clips. Pure heuristics -- no API calls, no cost.

The weights encode what actually keeps retention on short-form:
a clip must open on a hook, stand on its own without the previous
20 minutes of context, and end on a resolved thought.
"""

from __future__ import annotations

import math
import re
from pathlib import Path

from .audio import ENVELOPE_HZ, normalize, window_stats
from .config import Config
from .segment import Candidate
from .utils import read_json, write_json

# --- lexical cues -----------------------------------------------------------

# Openers that only make sense after something else was said. A clip that
# starts on one of these lands the viewer mid-conversation.
DANGLING_OPENERS = {
    # ru
    "и", "а", "но", "то", "это", "этот", "эта", "эти", "того", "этого",
    "поэтому", "потому", "значит", "тогда", "также", "ещё", "еще", "вот",
    "он", "она", "они", "его", "её", "ее", "их", "там", "туда", "такой",
    "такая", "такие", "короче", "ну", "да", "нет", "соответственно",
    # en
    "and", "but", "so", "because", "then", "it", "he", "she", "they",
    "that", "this", "those", "these", "which", "also", "anyway", "well",
    "yeah", "too", "however", "therefore", "plus", "again", "there",
}

HOOK_PATTERNS = [
    # ru
    r"^почему\b", r"^как\b", r"^что если\b", r"^зачем\b", r"^представь",
    r"^слушай", r"^смотри", r"^давай", r"^знаешь",
    r"\bсекрет\b", r"\bошибк", r"\bникто не\b", r"\bбольшинство\b",
    r"\bправда в том\b", r"\bпроблема в том\b", r"\bдело в том\b",
    r"\bна самом деле\b", r"\bглавн(ое|ая|ый)\b", r"\bсамое\b",
    # en
    r"^why\b", r"^how\b", r"^what if\b", r"^imagine\b", r"^listen\b",
    r"^here'?s\b", r"^nobody\b", r"^most people\b",
    r"\bthe secret\b", r"\bthe truth\b", r"\bthe problem\b",
    r"\bthe reason\b", r"\bmistake\b", r"\bactually\b",
]

CURIOSITY_PATTERNS = [
    r"\d+\s*%", r"[$€₽]\s?\d", r"\b\d[\d\s.,]{2,}\b",
    # ru superlatives / contrast
    r"\bсам(ый|ая|ое|ые)\b", r"\bлучш", r"\bхудш", r"\bединственн",
    r"\bвпервые\b", r"\bникогда\b", r"\bвсегда\b", r"\bогромн",
    # en
    r"\bbest\b", r"\bworst\b", r"\bonly\b", r"\bnever\b", r"\balways\b",
    r"\bhuge\b", r"\bfirst time\b",
]

_HOOK_RE = [re.compile(p, re.IGNORECASE) for p in HOOK_PATTERNS]
_CURIOSITY_RE = [re.compile(p, re.IGNORECASE) for p in CURIOSITY_PATTERNS]

WEIGHTS = {
    "hook": 0.26,
    "standalone": 0.20,
    "closure": 0.12,
    "curiosity": 0.14,
    "duration": 0.10,
    "density": 0.08,
    "energy": 0.06,
    "confidence": 0.04,
}


def _first_word(text: str) -> str:
    match = re.search(r"[\w']+", text, re.UNICODE)
    return match.group(0).lower() if match else ""


def _hook_score(text: str) -> float:
    head = text[:160]
    hits = sum(1 for rx in _HOOK_RE if rx.search(head))
    score = min(1.0, hits * 0.5)
    if head.lstrip().startswith(("Почему", "Why", "Как ", "How ")):
        score = max(score, 0.7)
    if "?" in text[:120]:
        score = max(score, 0.6)
    return score


def _standalone_score(text: str) -> float:
    """Penalise clips that open on a reference to unseen context."""
    first = _first_word(text)
    if not first:
        return 0.0
    if first in DANGLING_OPENERS:
        return 0.15
    # A pronoun in the first few words is a softer version of the same problem.
    head = " ".join(text.split()[:4]).lower()
    soft = {"он", "она", "они", "это", "их", "него", "неё", "he", "she", "they", "it"}
    if any(w.strip(".,!?") in soft for w in head.split()):
        return 0.55
    return 1.0


def _closure_score(text: str) -> float:
    stripped = text.rstrip()
    if not stripped:
        return 0.0
    if stripped[-1] in ".!?…":
        last = _last_word(stripped)
        # "...because." is punctuation without resolution.
        if last in DANGLING_OPENERS:
            return 0.4
        return 1.0
    return 0.3


def _last_word(text: str) -> str:
    words = re.findall(r"[\w']+", text, re.UNICODE)
    return words[-1].lower() if words else ""


def _curiosity_score(text: str) -> float:
    hits = sum(1 for rx in _CURIOSITY_RE if rx.search(text))
    return min(1.0, hits / 3.0)


def _duration_score(duration: float, cfg: Config) -> float:
    """Bell curve centred on the sweet spot for short-form retention."""
    ideal = 34.0
    spread = 14.0
    raw = math.exp(-((duration - ideal) ** 2) / (2 * spread**2))
    if duration < cfg.clips.min_seconds or duration > cfg.clips.max_seconds:
        raw *= 0.5
    return raw


def _density_score(word_count: int, duration: float) -> float:
    if duration <= 0:
        return 0.0
    wps = word_count / duration
    # 2.0-4.0 words/sec is normal engaged speech; outside that is
    # either dead air or an unintelligible rush.
    if 2.0 <= wps <= 4.0:
        return 1.0
    if wps < 2.0:
        return max(0.0, wps / 2.0)
    return max(0.0, 1.0 - (wps - 4.0) / 3.0)


def score_candidates(
    candidates: list[Candidate],
    cfg: Config,
    *,
    envelope=None,
    transcript=None,
) -> list[Candidate]:
    """Attach a 0..1 score plus its feature breakdown to every candidate."""
    energies: list[float] = []
    for cand in candidates:
        if envelope is not None and getattr(envelope, "size", 0):
            mean, spread = window_stats(envelope, cand.start, cand.end)
            energies.append(mean * 0.5 + spread * 0.5)
        else:
            energies.append(0.0)
    energy_norm = normalize(energies) if any(energies) else [0.5] * len(candidates)

    for cand, energy in zip(candidates, energy_norm):
        words = cand.text.split()
        confidence = 1.0
        if transcript is not None:
            picked = transcript.slice(cand.start, cand.end)
            if picked:
                confidence = sum(w.prob for w in picked) / len(picked)

        features = {
            "hook": _hook_score(cand.text),
            "standalone": _standalone_score(cand.text),
            "closure": _closure_score(cand.text),
            "curiosity": _curiosity_score(cand.text),
            "duration": _duration_score(cand.duration, cfg),
            "density": _density_score(len(words), cand.duration),
            "energy": energy,
            "confidence": confidence,
        }
        cand.features = {k: round(v, 3) for k, v in features.items()}
        cand.score = round(sum(WEIGHTS[k] * v for k, v in features.items()), 4)

    return candidates


def explain(cand: Candidate) -> str:
    """One-line feature breakdown, for --explain output."""
    if not cand.features:
        return ""
    parts = [f"{k}={cand.features[k]:.2f}" for k in WEIGHTS if k in cand.features]
    return "  ".join(parts)


# --- optional LLM / human review pass ---------------------------------------

def export_for_review(candidates: list[Candidate], path: Path, limit: int = 40) -> Path:
    """Dump top candidates for a second opinion (Claude Code, or your own eyes).

    Costs nothing: you review the JSON in an assistant you already pay for,
    write scores back into the same file, then `clipper review-apply`.
    """
    top = sorted(candidates, key=lambda c: c.score, reverse=True)[:limit]
    write_json(
        path,
        {
            "instructions": (
                "Rate each clip 0..1 on whether it would hold a stranger's "
                "attention as a standalone vertical short. Set 'llm_score', "
                "and optionally 'title' (a hook under 60 chars) and 'reason'. "
                "Leave llm_score null to fall back to the heuristic score."
            ),
            "clips": [
                {
                    "id": c.id,
                    "start": round(c.start, 2),
                    "end": round(c.end, 2),
                    "duration": round(c.duration, 1),
                    "heuristic_score": c.score,
                    "text": c.text,
                    "llm_score": None,
                    "title": "",
                    "reason": "",
                }
                for c in top
            ],
        },
    )
    return path


def apply_review(candidates: list[Candidate], path: Path, weight: float = 0.6) -> list[Candidate]:
    """Blend reviewed scores back in; unreviewed clips keep their heuristic score."""
    data = read_json(path)
    by_id = {c.id: c for c in candidates}
    applied = 0
    for entry in data.get("clips", []):
        cand = by_id.get(entry.get("id"))
        if cand is None:
            continue
        if entry.get("title"):
            cand.title = entry["title"]
        if entry.get("reason"):
            cand.reason = entry["reason"]
        llm_score = entry.get("llm_score")
        if llm_score is None:
            continue
        llm_score = max(0.0, min(1.0, float(llm_score)))
        cand.score = round(weight * llm_score + (1 - weight) * cand.score, 4)
        applied += 1
    return candidates
