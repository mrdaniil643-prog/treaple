"""Локальная транскрибация со словными таймкодами + импорт готовых SRT/VTT."""
from __future__ import annotations

import os
import re
import tempfile
from typing import Any, Iterable

from .util import AutocutError, log, probe, run, tool, write_json

WORD_RE = re.compile(r"[^\W\d_]+|\d+", re.UNICODE)


def extract_audio(source: str, out_wav: str) -> str:
    """16 kHz моно WAV — формат, который любят все локальные ASR."""
    os.makedirs(os.path.dirname(os.path.abspath(out_wav)) or ".", exist_ok=True)
    run([
        tool("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
        "-i", source, "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", out_wav,
    ])
    return os.path.abspath(out_wav)


def _normalize(words: list[dict[str, Any]], segments: list[dict[str, Any]], language: str,
               source: str, engine: str) -> dict[str, Any]:
    words = [w for w in words if w.get("end", 0) > w.get("start", 0)]
    words.sort(key=lambda w: w["start"])
    text = " ".join(w["word"] for w in words).strip()
    return {
        "source": os.path.abspath(source),
        "engine": engine,
        "language": language,
        "duration": round(words[-1]["end"], 3) if words else 0.0,
        "word_count": len(words),
        "text": text,
        "segments": segments,
        "words": words,
    }


def with_faster_whisper(source: str, *, model: str = "small", language: str | None = None,
                        compute_type: str = "auto", vad: bool = True) -> dict[str, Any]:
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError as exc:  # pragma: no cover - зависит от машины
        raise AutocutError(
            "Не установлен faster-whisper. Поставь его:\n"
            "  python3 -m pip install faster-whisper\n"
            "Либо принеси готовые субтитры: autocut.py transcribe --import subs.srt"
        ) from exc

    with tempfile.TemporaryDirectory(prefix="autocut-asr-") as tmp:
        wav = extract_audio(source, os.path.join(tmp, "audio.wav"))
        log(f"faster-whisper: модель {model}, язык {language or 'auto'}")
        whisper = WhisperModel(model, device="auto", compute_type=compute_type)
        seg_iter, info = whisper.transcribe(
            wav,
            language=language,
            word_timestamps=True,
            vad_filter=vad,
            beam_size=5,
        )
        words: list[dict[str, Any]] = []
        segments: list[dict[str, Any]] = []
        for seg in seg_iter:
            segments.append({
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": (seg.text or "").strip(),
            })
            for w in (seg.words or []):
                token = (w.word or "").strip()
                if not token:
                    continue
                words.append({
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "word": token,
                    "prob": round(float(getattr(w, "probability", 1.0) or 0.0), 3),
                })
        return _normalize(words, segments, info.language or language or "unknown",
                          source, f"faster-whisper:{model}")


def _parse_ts(value: str) -> float:
    value = value.strip().replace(",", ".")
    parts = value.split(":")
    if len(parts) == 3:
        h, m, s = parts
    elif len(parts) == 2:
        h, m, s = "0", parts[0], parts[1]
    else:
        return float(value)
    return int(h) * 3600 + int(m) * 60 + float(s)


def _cue_lines(raw: str) -> Iterable[tuple[float, float, str]]:
    blocks = re.split(r"\n\s*\n", raw.replace("\r\n", "\n").strip())
    for block in blocks:
        lines = [ln for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue
        if lines[0].strip().upper().startswith("WEBVTT"):
            lines = lines[1:]
        timing_idx = next((i for i, ln in enumerate(lines) if "-->" in ln), None)
        if timing_idx is None:
            continue
        start_raw, _, end_raw = lines[timing_idx].partition("-->")
        end_raw = end_raw.split()[0] if end_raw.split() else end_raw
        try:
            start, end = _parse_ts(start_raw), _parse_ts(end_raw)
        except ValueError:
            continue
        text = " ".join(lines[timing_idx + 1:]).strip()
        text = re.sub(r"<[^>]+>", "", text)
        if text:
            yield start, end, text


def from_subtitles(source: str, subtitle_path: str, language: str = "unknown") -> dict[str, Any]:
    """Импорт SRT/VTT. Словные таймкоды раскладываются пропорционально длине слов."""
    with open(subtitle_path, "r", encoding="utf-8-sig") as fh:
        raw = fh.read()
    words: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    for start, end, text in _cue_lines(raw):
        segments.append({"start": round(start, 3), "end": round(end, 3), "text": text})
        tokens = text.split()
        if not tokens:
            continue
        weights = [max(1, len(t)) for t in tokens]
        total = sum(weights)
        span = max(end - start, 0.08 * len(tokens))
        cursor = start
        for token, weight in zip(tokens, weights):
            dur = span * weight / total
            words.append({
                "start": round(cursor, 3),
                "end": round(cursor + dur, 3),
                "word": token,
                "prob": 1.0,
            })
            cursor += dur
    if not words:
        raise AutocutError(f"Не удалось прочитать реплики из {subtitle_path}")
    return _normalize(words, segments, language, source, f"import:{os.path.basename(subtitle_path)}")


def transcribe(source: str, out_path: str, *, model: str = "small", language: str | None = None,
               import_path: str | None = None, compute_type: str = "auto",
               vad: bool = True) -> dict[str, Any]:
    probe(source)  # падаем рано, если файл битый
    if import_path:
        data = from_subtitles(source, import_path, language or "unknown")
    else:
        data = with_faster_whisper(source, model=model, language=language,
                                   compute_type=compute_type, vad=vad)
    write_json(out_path, data)
    log(f"Транскрипт: {data['word_count']} слов, язык {data['language']} → {out_path}")
    return data
