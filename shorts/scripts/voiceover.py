"""Озвучка сценария офлайн через RHVoice и расчёт таймингов для субтитров.

Использование:
    .venv/bin/python scripts/voiceover.py voiceover/vibecoding.json

Сценарий состоит из сцен, сцены из фраз. У каждой фразы есть говорящий
(speakers в JSON): свой голос, скорость, высота и звуковой фильтр,
например «телефон» для заказчика или «робот» для нейросети.

Пишет:
    public/voiceover/<name>.wav            общий голос
    public/voiceover/<name>-<speaker>.wav  дорожка каждого говорящего
                                           (для визуализации звука)
    src/voiceover/<name>.json              тайминги сцен, фраз и слов

Каждая фраза синтезируется отдельно, поэтому её начало и конец известны точно.
Внутри фразы время слов распределяется пропорционально числу слогов.
"""

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
RATE = 24000
GAP_IN_SCENE = 0.12
GAP_BETWEEN_SCENES = 0.45
VOWELS = re.compile(r"[аеёиоуыэюяaeiouy]", re.IGNORECASE)

FILTERS = {
    # Узкая полоса, компрессия и лёгкий перегруз — как голос из динамика телефона.
    "phone": "highpass=f=380,lowpass=f=3200,acompressor=threshold=-24dB:ratio=8:makeup=6,"
             "asoftclip=type=atan,aresample=8000,aresample=24000,volume=0.9",
    # Металлический призвук: короткие эхо и фленджер.
    "robot": "aecho=0.8:0.85:7|13:0.35|0.25,flanger=delay=2:depth=2:speed=0.6,volume=4.5,alimiter=limit=0.6",
}


def synth(tts: TTS, text: str, speaker: dict) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        tts.to_file(filename=tmp.name, text=text, voice=speaker["voice"], format_="wav",
                    sets={"absolute_rate": speaker.get("rate", 0.3),
                          "absolute_pitch": speaker.get("pitch", 0.0)})
        raw = Path(tmp.name).read_bytes()
    # Обрезаем тишину по краям, чтобы тайминги совпадали с речью.
    chain = ("silenceremove=start_periods=1:start_threshold=-45dB,"
             "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse")
    if speaker.get("filter"):
        chain += "," + FILTERS[speaker["filter"]]
    out = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-af", chain,
         "-ar", str(RATE), "-ac", "1", "-f", "s16le", "pipe:1"],
        input=raw, capture_output=True, check=True,
    )
    return out.stdout


def word_weights(words: list[str]) -> list[float]:
    return [max(1, len(VOWELS.findall(w))) + (0.6 if w[-1] in ".,:?!" else 0) for w in words]


def place(track: bytearray, at: float, data: bytes) -> None:
    offset = int(round(at * RATE)) * 2
    if len(track) < offset + len(data):
        track.extend(b"\0" * (offset + len(data) - len(track)))
    track[offset:offset + len(data)] = data


def write_wav(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data)


def main() -> None:
    script_path = Path(sys.argv[1])
    script = json.loads(script_path.read_text(encoding="utf-8"))
    name = script_path.stem
    speakers = script["speakers"]
    tts = TTS(threads=1, lib_path=rhvoice_wrapper_bin.lib_path,
              data_path=rhvoice_wrapper_bin.data_path, quiet=True)

    mix = bytearray()
    stems = {key: bytearray() for key in speakers}
    t = 0.0
    scenes, phrases, captions = [], [], []

    for si, scene in enumerate(script["scenes"]):
        if si > 0:
            t += GAP_BETWEEN_SCENES - GAP_IN_SCENE
        scene_start = t
        # lead — тишина в начале сцены, например под звонок телефона.
        t += scene.get("lead", 0)
        for item in scene["phrases"]:
            # Пауза ставится после фразы: так паузы в конце сцены достаются ей же.
            data = synth(tts, item["text"], speakers[item["speaker"]])
            dur = len(data) / 2 / RATE
            place(mix, t, data)
            place(stems[item["speaker"]], t, data)

            words = item["text"].split()
            weights = word_weights(words)
            first_word = len(captions)
            wt = t
            for word, weight in zip(words, weights):
                wd = dur * weight / sum(weights)
                captions.append({"text": word, "startMs": round(wt * 1000),
                                 "endMs": round((wt + wd) * 1000)})
                wt += wd
            phrases.append({"scene": scene["id"], "speaker": item["speaker"], "text": item["text"],
                            "startMs": round(t * 1000), "endMs": round((t + dur) * 1000),
                            "words": [first_word, len(captions)]})
            t += dur + GAP_IN_SCENE + item.get("pause", 0)
        scenes.append({"id": scene["id"], "startMs": round(scene_start * 1000),
                       "endMs": round((t - GAP_IN_SCENE) * 1000)})
    tts.join()

    total = len(mix)
    write_wav(ROOT / "public" / "voiceover" / f"{name}.wav", bytes(mix))
    for key, stem in stems.items():
        stem.extend(b"\0" * (total - len(stem)))
        write_wav(ROOT / "public" / "voiceover" / f"{name}-{key}.wav", bytes(stem))

    json_out = ROOT / "src" / "voiceover" / f"{name}.json"
    json_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps({
        "audio": f"voiceover/{name}.wav",
        "stems": {key: f"voiceover/{name}-{key}.wav" for key in speakers},
        "durationMs": round(total / 2 / RATE * 1000),
        "scenes": scenes,
        "phrases": phrases,
        "words": captions,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{name}: {total / 2 / RATE:.1f} s, {len(phrases)} фраз, {len(captions)} слов")


if __name__ == "__main__":
    main()
