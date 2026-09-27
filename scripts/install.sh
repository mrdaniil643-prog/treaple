#!/usr/bin/env bash
# Установка и обновление сайта на VPS (Ubuntu/Debian, например Beget Cloud).
#   git clone -b claude/table-booking-ticket-system-7ax845 https://github.com/mrdaniil643-prog/treaple.git mt && cd mt && sudo bash scripts/install.sh
# Повторный запуск обновляет сайт: берёт свежий код и перезапускает, настройки из .env сохраняются.
# Ключи ЮKassa потом: sudo bash scripts/install.sh --keys; поменять адрес сайта: --domain
# Без вопросов: DOMAIN=bilety.mtbarkhv.ru YOOKASSA_SHOP_ID=… YOOKASSA_SECRET_KEY=… sudo -E bash scripts/install.sh
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;33m%s\033[0m\n' "$*"; }
# адрес без https:// и слешей, маленькими буквами; только латиница — частая ошибка: русская буква из раскладки
clean_domain() { printf '%s' "$1" | sed -e 's|^[a-zA-Z]*://||' -e 's|/.*$||' -e 's/[[:space:]]//g' | tr 'A-Z' 'a-z'; }
valid_domain() { printf '%s' "$1" | LC_ALL=C grep -qE '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите через sudo: sudo bash scripts/install.sh"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  say "Ставлю Docker…"
  curl -fsSL https://get.docker.com | sh
fi

if [ -d .git ]; then
  say "Беру свежую версию сайта…"
  git pull --ff-only || echo "Не удалось обновить код, запускаю ту версию, что есть."
fi

if [ ! -f .env ]; then
  say "Первый запуск: настройки сайта"
  DOMAIN="$(clean_domain "${DOMAIN:-}")"
  while ! valid_domain "$DOMAIN"; do
    [ -n "$DOMAIN" ] && echo "Адрес «${DOMAIN}» не подходит: только латиница, цифры, точки и дефис. Проверьте раскладку клавиатуры."
    read -rp "Адрес сайта без https:// (например bilety-mt.ru): " DOMAIN
    DOMAIN="$(clean_domain "$DOMAIN")"
  done
  if [ -z "${YOOKASSA_SHOP_ID+x}" ]; then
    read -rp "ЮKassa shopId (Enter — пропустить, оплата будет закрыта): " YOOKASSA_SHOP_ID
    if [ -n "$YOOKASSA_SHOP_ID" ]; then read -rsp "ЮKassa секретный ключ: " YOOKASSA_SECRET_KEY; echo; fi
  fi
  ADMIN_TOKEN="${ADMIN_TOKEN:-$(head -c 24 /dev/urandom | base64 | tr -d '/+=\n')}"
  umask 077
  sed -e "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" \
      -e "s|^ADMIN_TOKEN=.*|ADMIN_TOKEN=${ADMIN_TOKEN}|" \
      -e "s|^YOOKASSA_SHOP_ID=.*|YOOKASSA_SHOP_ID=${YOOKASSA_SHOP_ID:-}|" \
      -e "s|^YOOKASSA_SECRET_KEY=.*|YOOKASSA_SECRET_KEY=${YOOKASSA_SECRET_KEY:-}|" \
      .env.example > .env
  echo "Настройки записаны в .env (его видит только root)."
fi

# bash scripts/install.sh --domain — поменять адрес сайта
if [ "${1:-}" = "--domain" ]; then
  NEW_DOMAIN=""
  while ! valid_domain "$NEW_DOMAIN"; do
    read -rp "Новый адрес сайта без https://: " NEW_DOMAIN
    NEW_DOMAIN="$(clean_domain "$NEW_DOMAIN")"
    valid_domain "$NEW_DOMAIN" || echo "Только латиница, цифры, точки и дефис. Проверьте раскладку клавиатуры."
  done
  sed -i "s|^DOMAIN=.*|DOMAIN=${NEW_DOMAIN}|" .env
  echo "Адрес записан: ${NEW_DOMAIN}"
fi

# bash scripts/install.sh --keys — вписать или поменять ключи ЮKassa, не открывая .env
if [ "${1:-}" = "--keys" ]; then
  read -rp "ЮKassa shopId: " NEW_SHOP
  read -rsp "ЮKassa секретный ключ: " NEW_SECRET; echo
  sed -i -e "s|^YOOKASSA_SHOP_ID=.*|YOOKASSA_SHOP_ID=${NEW_SHOP}|" -e "s|^YOOKASSA_SECRET_KEY=.*|YOOKASSA_SECRET_KEY=${NEW_SECRET}|" .env
  echo "Ключи записаны."
fi

DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"

say "Собираю и запускаю сайт…"
docker compose up -d --build

say "Жду, пока сайт ответит…"
for _ in $(seq 60); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done
if [ "${OK:-}" != 1 ]; then
  echo "Сайт не ответил. Посмотрите журнал: docker compose logs app"
  exit 1
fi

# домен может быть ещё не настроен: эти проверки не должны останавливать скрипт
MY_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
DNS_IP="$( (getent hosts "$DOMAIN" || true) | awk '{print $1}' | head -1)"
say "Готово"
echo "Сайт:     https://${DOMAIN}"
echo "Админка:  https://${DOMAIN}/admin"
echo "Пароль:   $(grep -E '^ADMIN_TOKEN=' .env | cut -d= -f2-)"
if [ -z "$DNS_IP" ]; then
  echo "Домен ${DOMAIN} пока никуда не ведёт. Добавьте A-запись на IP этого сервера${MY_IP:+ (${MY_IP})}, сертификат HTTPS выпустится сам."
elif [ -n "$MY_IP" ] && [ "$DNS_IP" != "$MY_IP" ]; then
  echo "Внимание: ${DOMAIN} ведёт на ${DNS_IP}, а у этого сервера ${MY_IP}. Если сервер не за NAT, поправьте A-запись."
fi
if ! grep -qE '^YOOKASSA_SHOP_ID=.+' .env; then
  echo "Оплата пока закрыта. Когда получите ключи ЮKassa: bash scripts/install.sh --keys"
fi
