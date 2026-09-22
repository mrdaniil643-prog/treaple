"""Seed a plausible word-level transcript for the fixture, without Whisper.

Used only where the Whisper model cannot be downloaded (locked-down CI /
sandbox egress). Word timings are derived from the real audio envelope:
speech regions are detected by RMS, then the known script is distributed
across them weighted by word length. Good enough to exercise segmentation,
scoring, subtitles and rendering end to end.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from clipper.audio import ENVELOPE_HZ, rms_envelope
from clipper.transcribe import Transcript, Word, save_transcript
from tests.make_fixture import SCRIPT


def speech_regions(envelope: np.ndarray, threshold_ratio: float = 0.18) -> list[tuple[float, float]]:
    if envelope.size == 0:
        return []
    threshold = envelope.max() * threshold_ratio
    voiced = envelope > threshold

    regions: list[tuple[float, float]] = []
    start = None
    for i, flag in enumerate(voiced):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            if i - start >= 3:
                regions.append((start / ENVELOPE_HZ, i / ENVELOPE_HZ))
            start = None
    if start is not None:
        regions.append((start / ENVELOPE_HZ, voiced.size / ENVELOPE_HZ))

    # Merge regions separated by a gap shorter than a real pause.
    merged: list[tuple[float, float]] = []
    for region in regions:
        if merged and region[0] - merged[-1][1] < 0.22:
            merged[-1] = (merged[-1][0], region[1])
        else:
            merged.append(region)
    return merged


def main() -> int:
    work_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "work/sample")
    audio = work_dir / "audio.wav"
    if not audio.exists():
        print(f"missing {audio} -- run ingest first", file=sys.stderr)
        return 1

    envelope = rms_envelope(audio)
    regions = speech_regions(envelope)
    total_speech = sum(e - s for s, e in regions)
    tokens = SCRIPT.split()
    total_weight = sum(len(t) + 1 for t in tokens)

    # Map "speech time" (regions concatenated, silence removed) back to real
    # time, so every word lands inside a voiced region and none are dropped.
    offsets = []
    running = 0.0
    for region_start, region_end in regions:
        offsets.append((running, region_start, region_end - region_start))
        running += region_end - region_start

    def to_real(speech_t: float) -> float:
        speech_t = max(0.0, min(speech_t, total_speech - 1e-6))
        for base, region_start, length in offsets:
            if speech_t < base + length:
                return region_start + (speech_t - base)
        return regions[-1][1]

    words: list[Word] = []
    cursor = 0.0
    for token in tokens:
        span = (len(token) + 1) / total_weight * total_speech
        start_t = to_real(cursor)
        end_t = to_real(cursor + span)
        if end_t <= start_t:
            end_t = start_t + 0.05
        words.append(Word(start=start_t, end=end_t, text=" " + token, prob=0.93))
        cursor += span

    transcript = Transcript(language="en", words=words)
    save_transcript(transcript, work_dir / "transcript.json")
    print(
        f"seeded {len(words)} words across {len(regions)} speech regions "
        f"({total_speech:.1f}s of speech), -> {work_dir / 'transcript.json'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
