"""Общие утилиты: запуск процессов, ffprobe, поиск бинарников, логи."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from typing import Any, Sequence


class AutocutError(RuntimeError):
    """Ошибка, которую можно показать пользователю как есть."""


def log(msg: str) -> None:
    print(f"[autocut] {msg}", file=sys.stderr, flush=True)


def tool(name: str) -> str:
    """Путь к бинарнику ffmpeg/ffprobe с учётом AUTOMONTAGE_FFMPEG_DIR."""
    override_dir = os.environ.get("AUTOMONTAGE_FFMPEG_DIR") or os.environ.get("AUTOCUT_FFMPEG_DIR")
    if override_dir:
        candidate = os.path.join(override_dir, name)
        if os.path.exists(candidate) or os.path.exists(candidate + ".exe"):
            return candidate
    found = shutil.which(name)
    if not found:
        raise AutocutError(
            f"Не найден {name}. Поставь ffmpeg: "
            "macOS `brew install ffmpeg`, Windows `winget install Gyan.FFmpeg`, "
            "Debian/Ubuntu `sudo apt install ffmpeg`."
        )
    return found


def has_tool(name: str) -> bool:
    try:
        tool(name)
        return True
    except AutocutError:
        return False


def run(cmd: Sequence[str], *, capture: bool = False, check: bool = True) -> subprocess.CompletedProcess:
    """Запускает процесс. При capture=False вывод идёт в stderr вызывающего."""
    log("$ " + " ".join(str(c) for c in cmd))
    proc = subprocess.run(
        [str(c) for c in cmd],
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True,
    )
    if check and proc.returncode != 0:
        tail = (proc.stderr or "")[-2000:]
        raise AutocutError(f"Команда завершилась с кодом {proc.returncode}: {cmd[0]}\n{tail}")
    return proc


@dataclass
class MediaInfo:
    path: str
    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool
    audio_channels: int
    sample_rate: int
    rotation: int

    @property
    def aspect(self) -> float:
        return self.width / self.height if self.height else 0.0

    @property
    def orientation(self) -> str:
        if self.aspect > 1.05:
            return "landscape"
        if self.aspect < 0.95:
            return "portrait"
        return "square"

    def as_dict(self) -> dict[str, Any]:
        d = self.__dict__.copy()
        d["aspect"] = round(self.aspect, 4)
        d["orientation"] = self.orientation
        return d


def _parse_fps(value: str | None) -> float:
    if not value:
        return 0.0
    if "/" in value:
        num, _, den = value.partition("/")
        try:
            den_f = float(den)
            return float(num) / den_f if den_f else 0.0
        except ValueError:
            return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def probe(path: str) -> MediaInfo:
    if not os.path.exists(path):
        raise AutocutError(f"Файл не найден: {path}")
    proc = run(
        [tool("ffprobe"), "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", path],
        capture=True,
    )
    data = json.loads(proc.stdout or "{}")
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if video is None:
        raise AutocutError(f"В файле нет видеодорожки: {path}")

    duration = 0.0
    for source in (data.get("format", {}).get("duration"), video.get("duration")):
        try:
            duration = max(duration, float(source))
        except (TypeError, ValueError):
            continue

    rotation = 0
    for sd in video.get("side_data_list", []) or []:
        if "rotation" in sd:
            try:
                rotation = int(float(sd["rotation"])) % 360
            except (TypeError, ValueError):
                pass
    tag_rot = (video.get("tags") or {}).get("rotate")
    if tag_rot:
        try:
            rotation = int(float(tag_rot)) % 360
        except (TypeError, ValueError):
            pass

    width = int(video.get("width") or 0)
    height = int(video.get("height") or 0)
    if rotation in (90, 270):
        width, height = height, width

    return MediaInfo(
        path=os.path.abspath(path),
        duration=round(duration, 3),
        width=width,
        height=height,
        fps=round(_parse_fps(video.get("avg_frame_rate") or video.get("r_frame_rate")), 4) or 30.0,
        has_audio=audio is not None,
        audio_channels=int((audio or {}).get("channels") or 0),
        sample_rate=int((audio or {}).get("sample_rate") or 0),
        rotation=rotation,
    )


def read_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: str, payload: Any) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    return os.path.abspath(path)


def timecode(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs == 100:
        cs, s = 0, s + 1
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"


def slugify(text: str, limit: int = 40) -> str:
    table = {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
        "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
        "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c",
        "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e",
        "ю": "yu", "я": "ya",
    }
    out: list[str] = []
    for ch in text.lower():
        if ch in table:
            out.append(table[ch])
        elif ch.isalnum() and ch.isascii():
            out.append(ch)
        else:
            out.append("-")
    slug = "-".join(part for part in "".join(out).split("-") if part)
    return slug[:limit].strip("-") or "clip"
