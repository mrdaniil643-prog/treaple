"""Генерация ASS-субтитров под вертикальные ролики: karaoke, пословный и обычный режимы."""
from __future__ import annotations

import os
import re
from typing import Any, Iterable

from .util import AutocutError, timecode

# BBGGRR — порядок байтов в ASS обратный привычному RGB.
STYLES: dict[str, dict[str, Any]] = {
    "bold-white": {
        "font": "Montserrat", "primary": "FFFFFF", "highlight": "FFE04D",
        "outline_color": "000000", "outline": 6, "shadow": 2, "size": 0.062, "bold": -1,
    },
    "yellow-pop": {
        "font": "Montserrat", "primary": "FFFFFF", "highlight": "FFD400",
        "outline_color": "101010", "outline": 7, "shadow": 3, "size": 0.068, "bold": -1,
    },
    "mint": {
        "font": "Inter", "primary": "F2FFF8", "highlight": "3DFFB0",
        "outline_color": "06231A", "outline": 5, "shadow": 2, "size": 0.058, "bold": -1,
    },
    "neon": {
        "font": "Montserrat", "primary": "FFFFFF", "highlight": "FF3DAE",
        "outline_color": "12021A", "outline": 7, "shadow": 4, "size": 0.066, "bold": -1,
    },
    "clean-dark": {
        "font": "Inter", "primary": "111111", "highlight": "0066FF",
        "outline_color": "FFFFFF", "outline": 5, "shadow": 0, "size": 0.054, "bold": -1,
    },
}

PUNCT_TAIL = re.compile(r"[.,!?;:…»\"')\]]+$")


def ass_color(hex_rgb: str, alpha: str = "00") -> str:
    value = hex_rgb.strip().lstrip("#")
    if len(value) != 6:
        raise AutocutError(f"Цвет {hex_rgb!r} должен быть в формате RRGGBB.")
    r, g, b = value[0:2], value[2:4], value[4:6]
    return f"&H{alpha}{b}{g}{r}".upper()


def escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", " ")


def group_words(words: list[dict[str, Any]], *, per_line: int, max_gap: float = 0.9,
                max_dur: float = 3.2) -> list[list[dict[str, Any]]]:
    """Собирает слова в строки: по количеству, по паузе и по концу предложения."""
    groups: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for word in words:
        if current:
            gap = word["start"] - current[-1]["end"]
            span = word["end"] - current[0]["start"]
            ends_sentence = current[-1]["word"].rstrip()[-1:] in ".!?…"
            if len(current) >= per_line or gap > max_gap or span > max_dur or ends_sentence:
                groups.append(current)
                current = []
        current.append(word)
    if current:
        groups.append(current)
    return groups


def _header(width: int, height: int, style: dict[str, Any], margin_v: int,
            alignment: int) -> str:
    size = max(18, int(round(height * float(style["size"]))))
    margin_h = int(round(width * 0.07))
    return "\n".join([
        "[Script Info]",
        "ScriptType: v4.00+",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        (
            f"Style: Reel,{style['font']},{size},{ass_color(style['primary'])},"
            f"{ass_color(style['highlight'])},{ass_color(style['outline_color'])},"
            f"{ass_color('000000', '80')},{style['bold']},0,0,0,100,100,0,0,1,"
            f"{style['outline']},{style['shadow']},{alignment},{margin_h},{margin_h},"
            f"{margin_v},1"
        ),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ])


def _dialogue(start: float, end: float, text: str) -> str:
    if end <= start:
        end = start + 0.05
    return f"Dialogue: 0,{timecode(start)},{timecode(end)},Reel,,0,0,0,,{text}"


def build_ass(words: list[dict[str, Any]], *, width: int, height: int, clip_start: float = 0.0,
              mode: str = "karaoke", style_name: str = "bold-white", uppercase: bool = False,
              per_line: int | None = None, margin_v: int | None = None,
              alignment: int = 2, pop: bool = True, font: str | None = None,
              size_scale: float = 1.0, margin_ratio: float = 0.18) -> str:
    if style_name not in STYLES:
        raise AutocutError(
            f"Неизвестный стиль субтитров {style_name!r}. Доступны: {', '.join(sorted(STYLES))}."
        )
    style = dict(STYLES[style_name])
    if font:
        style["font"] = font
    if size_scale != 1.0:
        style["size"] = float(style["size"]) * max(0.3, min(3.0, size_scale))
    if margin_v is None:
        margin_v = int(round(height * margin_ratio))
    if per_line is None:
        # Вертикальный кадр узкий: больше четырёх слов в строке читаются плохо.
        per_line = {"words": 2, "karaoke": 4, "plain": 6}.get(mode, 4)

    lines = [_header(width, height, style, margin_v, alignment)]
    rel = [
        {**w, "start": w["start"] - clip_start, "end": w["end"] - clip_start}
        for w in words
    ]
    rel = [w for w in rel if w["end"] > 0]
    if not rel:
        return "\n".join(lines) + "\n"

    highlight = ass_color(style["highlight"])
    primary = ass_color(style["primary"])
    fade = "{\\fad(60,60)}" if pop else ""

    for group in group_words(rel, per_line=per_line):
        tokens = [escape(w["word"].upper() if uppercase else w["word"]) for w in group]
        g_start = max(0.0, group[0]["start"])
        g_end = max(g_start + 0.1, group[-1]["end"] + 0.08)

        if mode == "plain":
            lines.append(_dialogue(g_start, g_end, fade + " ".join(tokens)))
            continue

        if mode == "words":
            for word, token in zip(group, tokens):
                w_start = max(0.0, word["start"])
                w_end = max(w_start + 0.08, word["end"] + 0.04)
                grow = "{\\fscx108\\fscy108\\t(0,90,\\fscx100\\fscy100)}" if pop else ""
                lines.append(_dialogue(w_start, w_end, grow + token))
            continue

        # karaoke: строка целиком, активное слово подсвечено
        for idx, word in enumerate(group):
            w_start = max(g_start, word["start"])
            w_end = word["end"] + 0.04
            if idx + 1 < len(group):
                w_end = max(w_end, group[idx + 1]["start"])
            else:
                w_end = g_end
            parts = []
            for j, token in enumerate(tokens):
                if j == idx:
                    parts.append("{\\c" + highlight + "}" + token + "{\\c" + primary + "}")
                else:
                    parts.append(token)
            prefix = fade if idx == 0 else ""
            lines.append(_dialogue(w_start, w_end, prefix + " ".join(parts)))

    return "\n".join(lines) + "\n"


def write_ass(path: str, content: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    return os.path.abspath(path)


def words_in_range(words: Iterable[dict[str, Any]], start: float, end: float) -> list[dict[str, Any]]:
    return [w for w in words if w["end"] > start and w["start"] < end]
