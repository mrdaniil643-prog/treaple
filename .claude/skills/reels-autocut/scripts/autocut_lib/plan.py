"""Выбор моментов: транскрипт → предложения → кандидаты → ранжированный план нарезки."""
from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass, field
from typing import Any

from .util import AutocutError, log, slugify

TERMINAL = ".!?…"
SOFT_BREAK = ",;:—–-"

# Маркеры считаются по леммоподобным префиксам — короткие формы ловят словоформы.
HOOK_MARKERS = [
    "как ", "почему", "зачем", "что если", "секрет", "ошибк", "никогда", "всегда",
    "перестан", "хватит", "главн", "фишк", "лайфхак", "правил", "миф", "на самом деле",
    "проблем", "смотри", "запомн", "вот ", "представь", "знаеш", "спойлер",
    "how to", "why ", "the secret", "mistake", "never ", "stop ", "here's", "the trick",
]
PAYOFF_MARKERS = [
    "шаг", "во-первых", "во-вторых", "сначала", "потом", "затем", "итог", "результат",
    "поэтому", "значит", "получаетс", "например", "нажим", "открыва", "настро",
    "скопиру", "вставь", "добав", "сохран", "промпт", "команд", "ссылк", "шаблон",
    "step ", "first", "then ", "finally", "so that", "for example", "copy ", "paste ",
]
FILLER_MARKERS = [
    "эээ", "ммм", "ааа", "как бы", "ну вот", "типа", "короче", "в общем", "то есть",
    "это самое", "слушай", "значит вот", "um", "uh", "you know", "like ", "i mean",
]
# Слова, с которых клип начинать нельзя: они ссылаются на то, чего зритель не видел.
ANAPHORA_START = [
    "это", "этот", "эта", "эти", "он", "она", "они", "там", "тут", "поэтому", "потому",
    "значит", "и", "а", "но", "то", "тогда", "также", "ещё", "еще", "вот", "такой",
    "this", "that", "these", "those", "it", "they", "so", "and", "but", "then", "also",
]
NUMBER_RE = re.compile(r"\d")


@dataclass
class Sentence:
    start: float
    end: float
    text: str
    words: list[dict[str, Any]] = field(default_factory=list)
    gap_before: float = 0.0
    terminal: bool = False

    @property
    def duration(self) -> float:
        return self.end - self.start


def build_sentences(words: list[dict[str, Any]], *, pause_break: float = 0.55) -> list[Sentence]:
    """Режет поток слов на предложения по пунктуации и по паузам."""
    sentences: list[Sentence] = []
    current: list[dict[str, Any]] = []
    gap_before = 0.0

    def flush(terminal: bool) -> None:
        nonlocal current, gap_before
        if not current:
            return
        sentences.append(Sentence(
            start=current[0]["start"],
            end=current[-1]["end"],
            text=" ".join(w["word"] for w in current).strip(),
            words=current,
            gap_before=gap_before,
            terminal=terminal,
        ))
        current = []

    for idx, word in enumerate(words):
        if current:
            gap = word["start"] - current[-1]["end"]
            if gap >= pause_break:
                flush(terminal=current[-1]["word"].rstrip()[-1:] in TERMINAL)
                gap_before = gap
        current.append(word)
        token = word["word"].rstrip()
        if token and token[-1] in TERMINAL:
            next_gap = 0.0
            if idx + 1 < len(words):
                next_gap = words[idx + 1]["start"] - word["end"]
            flush(terminal=True)
            gap_before = next_gap
    flush(terminal=bool(current) and current[-1]["word"].rstrip()[-1:] in TERMINAL)
    return sentences


def _count_markers(text: str, markers: list[str]) -> int:
    low = " " + text.lower() + " "
    return sum(1 for m in markers if m in low)


def _length_fit(duration: float, lo: float, hi: float, sweet: float) -> float:
    """1.0 в «сладкой» длине, плавно падает к границам."""
    if duration < lo or duration > hi:
        return 0.0
    spread = max(hi - sweet, sweet - lo, 1.0)
    return max(0.0, 1.0 - abs(duration - sweet) / spread)


def score_candidate(sents: list[Sentence], *, min_dur: float, max_dur: float,
                    sweet_dur: float) -> dict[str, Any]:
    text = " ".join(s.text for s in sents).strip()
    start, end = sents[0].start, sents[-1].end
    duration = end - start
    word_count = sum(len(s.words) for s in sents)
    wps = word_count / duration if duration else 0.0

    head = " ".join(s.text for s in sents)[:160]
    first_token = re.sub(r"[^\w]", "", sents[0].text.split()[0].lower()) if sents[0].text.split() else ""

    hook = min(1.0, _count_markers(head, HOOK_MARKERS) / 2.0)
    if head.rstrip().endswith("?") or "?" in head[:80]:
        hook = min(1.0, hook + 0.35)
    if NUMBER_RE.search(head):
        hook = min(1.0, hook + 0.2)

    payoff = min(1.0, _count_markers(text, PAYOFF_MARKERS) / 3.0)
    if NUMBER_RE.search(text):
        payoff = min(1.0, payoff + 0.15)

    # Идеальный темп разговорного рилса ~2.4–3.6 слова в секунду.
    density = max(0.0, 1.0 - abs(wps - 3.0) / 2.2)

    completeness = 0.0
    if sents[-1].terminal:
        completeness += 0.5
    if sents[0].gap_before >= 0.4:
        completeness += 0.3
    if first_token not in ANAPHORA_START:
        completeness += 0.2

    filler = min(1.0, _count_markers(text, FILLER_MARKERS) / 4.0)
    length = _length_fit(duration, min_dur, max_dur, sweet_dur)

    total = (
        0.30 * hook
        + 0.22 * payoff
        + 0.18 * completeness
        + 0.15 * length
        + 0.15 * density
        - 0.20 * filler
    )
    return {
        "start": round(start, 3),
        "end": round(end, 3),
        "duration": round(duration, 3),
        "words": word_count,
        "wps": round(wps, 2),
        "text": text,
        "hook_line": sents[0].text.strip(),
        "score": round(max(0.0, total), 4),
        "breakdown": {
            "hook": round(hook, 3),
            "payoff": round(payoff, 3),
            "completeness": round(completeness, 3),
            "length": round(length, 3),
            "density": round(density, 3),
            "filler_penalty": round(filler, 3),
        },
    }


def candidates(sentences: list[Sentence], *, min_dur: float, max_dur: float,
               sweet_dur: float, max_sentences: int = 14) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i in range(len(sentences)):
        for j in range(i, min(len(sentences), i + max_sentences)):
            window = sentences[i:j + 1]
            duration = window[-1].end - window[0].start
            if duration < min_dur:
                continue
            if duration > max_dur:
                break
            out.append(score_candidate(window, min_dur=min_dur, max_dur=max_dur,
                                       sweet_dur=sweet_dur))
    return sorted(out, key=lambda c: c["score"], reverse=True)


def _overlaps(a: dict[str, Any], b: dict[str, Any], tolerance: float = 0.5) -> bool:
    return a["start"] < b["end"] - tolerance and b["start"] < a["end"] - tolerance


def select(cands: list[dict[str, Any]], count: int, *, spread: float = 0.0,
           total_duration: float = 0.0) -> list[dict[str, Any]]:
    """Жадный отбор без пересечений, с опциональным штрафом за скучивание."""
    chosen: list[dict[str, Any]] = []
    for cand in cands:
        if len(chosen) >= count:
            break
        if any(_overlaps(cand, c) for c in chosen):
            continue
        if spread > 0 and total_duration > 0 and chosen:
            nearest = min(abs(cand["start"] - c["start"]) for c in chosen)
            if nearest < spread * total_duration:
                continue
        chosen.append(cand)
    if len(chosen) < count and spread > 0:
        # Второй проход без требования равномерности — лучше меньше пустых слотов.
        for cand in cands:
            if len(chosen) >= count:
                break
            if any(_overlaps(cand, c) for c in chosen):
                continue
            chosen.append(cand)
    return sorted(chosen, key=lambda c: c["start"])


def pad_clip(clip: dict[str, Any], *, lead_in: float, lead_out: float,
             limit: float) -> dict[str, Any]:
    clip = dict(clip)
    clip["start"] = round(max(0.0, clip["start"] - lead_in), 3)
    clip["end"] = round(min(limit, clip["end"] + lead_out), 3) if limit else round(clip["end"] + lead_out, 3)
    clip["duration"] = round(clip["end"] - clip["start"], 3)
    return clip


def title_for(clip: dict[str, Any]) -> str:
    line = clip.get("hook_line") or clip.get("text", "")
    words = line.split()
    short = " ".join(words[:8])
    return short.rstrip(SOFT_BREAK + " ") or "Клип"


def make_plan(transcript: dict[str, Any], *, count: int = 6, min_dur: float = 18.0,
              max_dur: float = 58.0, sweet_dur: float = 32.0, lead_in: float = 0.25,
              lead_out: float = 0.35, spread: float = 0.0, pause_break: float = 0.55,
              source_duration: float = 0.0, keep_candidates: int = 25) -> dict[str, Any]:
    words = transcript.get("words") or []
    if not words:
        raise AutocutError("В транскрипте нет слов — нечего нарезать.")
    if min_dur >= max_dur:
        raise AutocutError(f"--min ({min_dur}) должен быть меньше --max ({max_dur}).")

    sentences = build_sentences(words, pause_break=pause_break)
    log(f"Предложений: {len(sentences)}")
    cands = candidates(sentences, min_dur=min_dur, max_dur=max_dur, sweet_dur=sweet_dur)
    if not cands:
        raise AutocutError(
            f"Ни одного куска длиной {min_dur:.0f}–{max_dur:.0f} с. "
            "Ослабь границы: --min/--max."
        )
    log(f"Кандидатов: {len(cands)}")
    total = source_duration or transcript.get("duration") or words[-1]["end"]
    picked = select(cands, count, spread=spread, total_duration=total)

    padded_clips = [pad_clip(clip, lead_in=lead_in, lead_out=lead_out, limit=total)
                    for clip in picked]
    # Запас по краям может столкнуть соседние клипы — разводим их по середине стыка.
    for prev, nxt in zip(padded_clips, padded_clips[1:]):
        if nxt["start"] < prev["end"]:
            middle = round((nxt["start"] + prev["end"]) / 2, 3)
            prev["end"] = middle
            nxt["start"] = middle
            prev["duration"] = round(prev["end"] - prev["start"], 3)
            nxt["duration"] = round(nxt["end"] - nxt["start"], 3)

    clips: list[dict[str, Any]] = []
    for idx, padded in enumerate(padded_clips, start=1):
        title = title_for(padded)
        padded.update({
            "id": f"clip-{idx:02d}",
            "slug": f"{idx:02d}-{slugify(title)}",
            "title": title,
            "approved": False,
        })
        clips.append(padded)

    return {
        "source": transcript.get("source"),
        "language": transcript.get("language"),
        "source_duration": round(total, 3),
        "settings": {
            "count": count, "min": min_dur, "max": max_dur, "sweet": sweet_dur,
            "lead_in": lead_in, "lead_out": lead_out, "spread": spread,
            "pause_break": pause_break,
        },
        "clips": clips,
        "shortlist": cands[:keep_candidates],
        "note": (
            "Это черновик машинного отбора. Правь start/end/title/approved руками "
            "или агентом, затем запускай render."
        ),
    }
