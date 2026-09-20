#!/usr/bin/env bash
# Ставит движок AutoMontage-Agent, от которого зависят навыки
# reel-turnkey / motion-reel / reel-from-donor.
#
#   bash scripts/install-automontage-engine.sh            # в ~/.automontage-engine
#   AUTOMONTAGE_HOME=/path/to/dir bash scripts/install-automontage-engine.sh
#
# Навыки reels-autocut / jumpcut / reels-publish-pack движок НЕ требуют —
# им хватает ffmpeg и Python.
set -euo pipefail

REPO_URL="${AUTOMONTAGE_REPO:-https://github.com/mcdenil-skills/AutoMontage-Agent.git}"
HOME_DIR="${AUTOMONTAGE_HOME:-$HOME/.automontage-engine}"
GLOBAL_CLI="${AUTOMONTAGE_GLOBAL_CLI:-1}"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mОшибка:\033[0m %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "не найден $1. $2"
}

need git    "Поставь git."
need node   "Поставь Node.js 20+ с nodejs.org."
need npm    "npm идёт вместе с Node.js."
need python3 "Поставь Python 3.10+ (python.org, brew install python)."
command -v ffmpeg  >/dev/null 2>&1 || echo "Предупреждение: ffmpeg не найден — рендер не запустится."
command -v ffprobe >/dev/null 2>&1 || echo "Предупреждение: ffprobe не найден — анализ исходников не запустится."

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 20 ] || die "нужен Node.js 20+, сейчас $(node -v)."

if [ -d "$HOME_DIR/.git" ]; then
  say "Обновляю движок в $HOME_DIR"
  git -C "$HOME_DIR" pull --ff-only
else
  say "Клонирую движок в $HOME_DIR"
  mkdir -p "$(dirname "$HOME_DIR")"
  git clone --depth 1 "$REPO_URL" "$HOME_DIR"
fi

say "Ставлю Node-зависимости (npm ci)"
( cd "$HOME_DIR" && npm ci )

say "Ставлю Python-зависимости (faster-whisper, opencv, numpy)"
if [ ! -d "$HOME_DIR/.venv" ]; then
  python3 -m venv "$HOME_DIR/.venv"
fi
"$HOME_DIR/.venv/bin/python" -m pip install --upgrade pip
"$HOME_DIR/.venv/bin/python" -m pip install -r "$HOME_DIR/requirements.txt"

if [ "$GLOBAL_CLI" = "1" ]; then
  say "Ставлю глобальную команду automontage"
  ( cd "$HOME_DIR" && npm install -g . ) || \
    echo "Не удалось поставить глобально (нет прав?). Запускай движок через: cd $HOME_DIR && npm run <команда>"
fi

say "Диагностика движка"
( cd "$HOME_DIR" && npm run doctor ) || echo "doctor вернул ошибки — смотри вывод выше."

cat <<TXT

Готово.

  Движок:        $HOME_DIR
  Python (venv): $HOME_DIR/.venv/bin/python
  CLI:           automontage --help   (или: cd $HOME_DIR && npm run montage)

Добавь в ~/.zshrc или ~/.bashrc, чтобы навыки находили движок:

  export AUTOMONTAGE_HOME="$HOME_DIR"

TXT
