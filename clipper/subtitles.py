"""Burned-in word-by-word captions (ASS).

Short-form is watched muted; captions are not decoration, they are the
main channel. Words light up as they are spoken, which is what holds
the eye through a talking-head clip.
"""

from __future__ import annotations

from pathlib import Path

from .config import Config
from .transcribe import Word

ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: {play_x}
PlayResY: {play_y}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{font},{size},{primary},{primary},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,{outline},{shadow},2,80,80,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours, rem = divmod(seconds, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{int(hours)}:{int(minutes):02d}:{secs:05.2f}"


def _color(value: str) -> str:
    """Normalise &HAABBGGRR to the &H...& form override tags expect."""
    value = value.strip()
    return value if value.endswith("&") else value + "&"


def _escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("\n", " ")
        .strip()
    )


def build_ass(
    words: list[Word], clip_start: float, clip_duration: float, cfg: Config
) -> str:
    """Render an ASS file with one highlighted word at a time."""
    sub = cfg.subtitles
    lines = [
        ASS_HEADER.format(
            play_x=cfg.render.width,
            play_y=cfg.render.height,
            font=sub.font,
            size=sub.font_size,
            primary=sub.primary_color,
            outline=sub.outline,
            shadow=sub.shadow,
            margin_v=sub.margin_v,
        )
    ]

    primary = _color(sub.primary_color)
    highlight = _color(sub.highlight_color)

    cleaned = [w for w in words if w.text.strip()]
    groups = [
        cleaned[i : i + sub.group_size]
        for i in range(0, len(cleaned), max(1, sub.group_size))
    ]

    for group in groups:
        tokens = []
        for word in group:
            token = word.text.strip()
            tokens.append(token.upper() if sub.uppercase else token)

        for idx, word in enumerate(group):
            start = max(0.0, word.start - clip_start)
            if idx + 1 < len(group):
                end = max(start, group[idx + 1].start - clip_start)
            else:
                end = max(start, word.end - clip_start)
            # Hold the last group until the clip ends rather than flashing off.
            if group is groups[-1] and idx == len(group) - 1:
                end = max(end, min(clip_duration, end + 0.35))
            if end <= start:
                end = start + 0.08
            end = min(end, clip_duration)
            if end <= start:
                continue

            rendered = []
            for k, token in enumerate(tokens):
                escaped = _escape(token)
                if k == idx:
                    rendered.append(
                        f"{{\\1c{highlight}\\fscx108\\fscy108}}{escaped}"
                        f"{{\\1c{primary}\\fscx100\\fscy100}}"
                    )
                else:
                    rendered.append(escaped)

            text = " ".join(rendered)
            lines.append(
                f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Caption,,0,0,0,,{text}"
            )

    return "\n".join(lines) + "\n"


def write_ass(path: Path, content: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path
