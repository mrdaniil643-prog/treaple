#!/usr/bin/env bash
# Ставит офлайн-озвучку RHVoice (русские голоса aleksandr, elena, irina, anna)
# в .venv. Нужны python3, gcc/g++ и ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/pip install -q scons setuptools wheel
PATH="$PWD/.venv/bin:$PATH" .venv/bin/pip install -q --no-build-isolation rhvoice-wrapper-bin rhvoice-wrapper
# rhvoice-wrapper передаёт путь к библиотеке байтами, а ctypes в Python 3.13 это не принимает.
sed -i "s/return lib_path if os.name == 'nt' else lib_path.encode()/return lib_path/" \
  .venv/lib/python3*/site-packages/rhvoice_wrapper/rhvoice_bindings.py
echo "Готово: .venv/bin/python scripts/voiceover.py voiceover/vibecoding.json"
