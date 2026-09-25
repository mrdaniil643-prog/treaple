#!/bin/bash
# Подготовка облачной сессии Claude Code: проверяет Node и ставит то, что нужно
# для тестов, проверки синтаксиса и скриптов проверки безопасности.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# node:sqlite без флага появился в Node 22.13
node -e '
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) { console.error("Нужен Node.js >= 22.13, сейчас " + process.version); process.exit(1); }
'

# Внешних npm-зависимостей нет, но npm install создаёт node_modules/.package-lock и проверяет lockfile
npm install --no-audit --no-fund --silent

# requests нужен scripts/security-check.py и сканерам из .claude/skills/cyber-*
if ! python3 -c "import requests" 2>/dev/null; then
  python3 -m pip install --quiet --disable-pip-version-check requests
fi
