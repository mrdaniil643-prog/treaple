"""Build a deterministic test video: synthetic speech + an off-centre subject.

The bright, moving subject sits in the right third of the frame, so a
correct 'smart' reframe must crop toward the right, not the centre.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPT = (
    "Why do most people fail at short form video? "
    "The reason is simple. They record for themselves, not for the viewer. "
    "Here is the mistake I made for two years straight. "
    "I published one hundred and forty clips and got almost nothing. "
    "Then I changed one thing and the numbers moved. "
    "The secret is the first two seconds. Nothing else matters as much. "
    "Most creators spend an hour on editing and ten seconds on the hook. "
    "That ratio is backwards and it is why they stay small. "
    "Start with a question the viewer already has in their head. "
    "Then answer it faster than they expect. That is the whole game."
)

FIXTURE = Path(__file__).parent / "fixtures" / "sample.mp4"


def _duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def main() -> int:
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    wav = FIXTURE.with_name("speech.wav")

    subprocess.run(
        ["espeak-ng", "-v", "en-us", "-s", "150", "-g", "8", "-w", str(wav), SCRIPT],
        check=True,
    )

    duration = _duration(wav)
    print(f"speech: {duration:.1f}s")

    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            # Both lavfi sources are infinite, so bound them with -t explicitly;
            # overlay's shortest= only compares its own inputs, both endless.
            "-f", "lavfi", "-t", f"{duration:.3f}",
            "-i", "color=c=0x101418:s=1280x720:r=30",
            "-f", "lavfi", "-t", f"{duration:.3f}",
            "-i", "testsrc2=s=380x380:r=30",
            "-i", str(wav),
            "-filter_complex",
            "[0:v][1:v]overlay=x=840:y=170[v]",
            "-map", "[v]", "-map", "2:a", "-shortest",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            str(FIXTURE),
        ],
        check=True,
    )

    wav.unlink(missing_ok=True)
    print(f"fixture: {FIXTURE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
