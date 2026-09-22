"""Audio energy envelope -- a cheap proxy for 'something is happening here'."""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

ENVELOPE_HZ = 20  # samples per second of envelope


def rms_envelope(audio_path: Path, sample_rate: int = 16000) -> np.ndarray:
    """Decode audio and return a per-frame RMS envelope at ENVELOPE_HZ."""
    cmd = [
        "ffmpeg", "-v", "error", "-i", str(audio_path),
        "-f", "s16le", "-ac", "1", "-ar", str(sample_rate), "-",
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    samples = np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    if samples.size == 0:
        return np.zeros(0, dtype=np.float32)

    hop = max(1, sample_rate // ENVELOPE_HZ)
    usable = (samples.size // hop) * hop
    if usable == 0:
        return np.zeros(0, dtype=np.float32)

    frames = samples[:usable].reshape(-1, hop)
    return np.sqrt((frames**2).mean(axis=1)).astype(np.float32)


def window_stats(envelope: np.ndarray, start: float, end: float) -> tuple[float, float]:
    """Mean level and relative dynamic range of a time window (both 0..1-ish)."""
    if envelope.size == 0:
        return 0.0, 0.0
    lo = max(0, int(start * ENVELOPE_HZ))
    hi = min(envelope.size, int(end * ENVELOPE_HZ))
    if hi <= lo:
        return 0.0, 0.0
    window = envelope[lo:hi]
    mean = float(window.mean())
    # Dynamic range between quiet and loud moments: flat monotone reads lower.
    spread = float(np.percentile(window, 90) - np.percentile(window, 10))
    return mean, spread


def normalize(values: list[float]) -> list[float]:
    """Min-max to 0..1; all-equal input maps to 0.5 rather than dividing by zero."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return [0.5] * len(values)
    return [(v - lo) / (hi - lo) for v in values]
