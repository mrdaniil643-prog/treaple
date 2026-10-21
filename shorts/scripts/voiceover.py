"""Озвучка сценария офлайн через RHVoice и расчёт таймингов для субтитров.

Использование:
    python scripts/voiceover.py voiceover/vibecoding.json

Пишет public/voiceover/<name>.wav и src/voiceover/<name>.json.
Каждая фраза синтезируется отдельно, поэтому её начало и конец известны точно.
Внутри фразы время слов распределяется пропорционально числу слогов.
"""

import io
import json
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import rhvoice_wrapper_bin
from rhvoice_wrapper import TTS

ROOT = Path(__file__).resolve().parent.parent
GAP_IN_SCENE = 0.12
GAP_BETWEEN_SCENES = 0.45
VOWELS = re.compile(r"[аеёиоуыэюяaeiouy]", re.IGNORECASE)


def synth(tts: TTS, text: str, voice: str, rate: float) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        tts.to_file(filename=tmp.name, text=text, voice=voice, format_="wav",
                    sets={"absolute_rate": rate})
        raw = Path(tmp.name).read_bytes()
    # Обрезаем тишину по краям, чтобы тайминги совпадали с речью.
    trimmed = subprocess.run(
        [
            "ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-af",
            "silenceremove=start_periods=1:start_threshold=-45dB,"
            "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
            "-f", "wav", "pipe:1",
        ],
        input=raw, capture_output=True, check=True,
    )
    return trimmed.stdout


def word_weights(words: list[str]) -> list[float]:
    return [max(1, len(VOWELS.findall(w))) + (0.6 if w[-1] in ".,:?!" else 0) for w in words]


def main() -> None:
    script_path = Path(sys.argv[1])
    script = json.loads(script_path.read_text(encoding="utf-8"))
    name = script_path.stem
    tts = TTS(threads=1, lib_path=rhvoice_wrapper_bin.lib_path,
              data_path=rhvoice_wrapper_bin.data_path, quiet=True)

    frames = bytearray()
    params = None
    t = 0.0
    scenes, captions = [], []

    for si, scene in enumerate(script["scenes"]):
        if si > 0:
            t += GAP_BETWEEN_SCENES - GAP_IN_SCENE
        for pi, item in enumerate(scene["phrases"]):
            # Фраза — строка или {"text": ..., "pause": секунды тишины перед ней}.
            # Пауза перед первой фразой сцены достаётся предыдущей сцене.
            phrase = item if isinstance(item, str) else item["text"]
            if not isinstance(item, str):
                t += item.get("pause", 0)
            if pi == 0:
                scene_start = t
            with wave.open(io.BytesIO(synth(tts, phrase, script["voice"], script["rate"]))) as w:
                if params is None:
                    params = w.getparams()
                    bytes_per_sec = params.framerate * params.sampwidth * params.nchannels
                data = w.readframes(w.getnframes())
            pad = int(round(t * bytes_per_sec))
            pad -= pad % (params.sampwidth * params.nchannels)
            frames.extend(b"\0" * (pad - len(frames)))
            frames.extend(data)
            dur = len(data) / bytes_per_sec

            words = phrase.split()
            weights = word_weights(words)
            total = sum(weights)
            wt = t
            for i, (word, weight) in enumerate(zip(words, weights)):
                wd = dur * weight / total
                captions.append({
                    "text": (" " if captions else "") + word,
                    "startMs": round(wt * 1000),
                    "endMs": round((wt + wd) * 1000),
                    "timestampMs": round((wt + wd / 2) * 1000),
                    "confidence": None,
                })
                wt += wd
            t += dur + GAP_IN_SCENE
        scenes.append({"id": scene["id"], "startMs": round(scene_start * 1000),
                       "endMs": round((t - GAP_IN_SCENE) * 1000)})

    tts.join()
    wav_out = ROOT / "public" / "voiceover" / f"{name}.wav"
    wav_out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(wav_out), "wb") as w:
        w.setnchannels(params.nchannels)
        w.setsampwidth(params.sampwidth)
        w.setframerate(params.framerate)
        w.writeframes(bytes(frames))

    json_out = ROOT / "src" / "voiceover" / f"{name}.json"
    json_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps({
        "audio": f"voiceover/{name}.wav",
        "durationMs": round(len(frames) / bytes_per_sec * 1000),
        "scenes": scenes,
        "captions": captions,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{wav_out.relative_to(ROOT)}: {len(frames) / bytes_per_sec:.1f} s, {len(captions)} слов")


if __name__ == "__main__":
    main()
