# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Сайт музыкального бара «МТ»: афиша, продажа входных билетов, заявки на бронь стола, живой QR на входе, меню кухни. Интерфейс и тексты на русском.

## Команды

```bash
npm run dev                         # разработка: демо-оплата, случайный пароль админки в консоли, перезапуск при правках
npm start                           # боевой режим (--prod): нужен ADMIN_TOKEN ≥ 12 символов, бронь закрыта без DEMO_PAYMENTS=1
npm test                            # node:test, test/*.test.js (бронирование, оплата, копии базы, документы)
npm run lint                        # проверка синтаксиса всех JS-модулей (node --check); можно передать файлы
npx eslint .                        # ошибки в коде (eslint.config.mjs: только правила на баги, без стиля)
npm run e2e                         # браузерные сценарии (Playwright): покупка, заявка на стол, вход по QR, мобильная вёрстка; сервер поднимается сам
node --no-warnings --test --test-name-pattern="живой QR" test/booking.test.js   # один тест
ADMIN_TOKEN=... TARGET=http://localhost:3000 python3 scripts/security-check.py   # 77 проверок OWASP против dev-копии (создаёт тестовые данные)
python3 tools/claude-demo/build.py  # демо без сервера для публикации на claude.ai → tools/claude-demo/build/
```

Бар в Хабаровске: время заведения — `Asia/Vladivostok` (UTC+10), задаётся `VENUE_TZ`, сервер ставит его в `process.env.TZ`, фронт получает с `/api/settings`. Node ≥ 22.13, внешних npm-зависимостей нет (база — встроенный `node:sqlite`). Полноценного линтера и сборки фронтенда нет: браузер получает файлы из `public/` как есть (ES-модули). CI (`.github/workflows/test.yml`) гоняет lint, ESLint, `npm test`, запуск в боевом режиме, `npm run e2e` и `security-check.py`. В облачных сессиях `.claude/hooks/session-start.sh` проверяет версию Node и ставит `requests` для Python-скриптов.

## Архитектура

**Сервер** (`server/`), один процесс на `node:http`, без фреймворка:
- `index.js` — маршруты (`route(method, pattern, handler, {admin|staff|limit})`), раздача статики, SSE-потоки. Обработчик получает `(params, body, url, ctx)`; `ctx.headers` добавляются к ответу (так ставится cookie контролёра).
- `booking.js` — вся доменная логика в `createBooking(db, {onChange, onTickets, onRequest, now, demoPayments})`. `now` подменяется в тестах. `onChange(eventId)` обновляет остаток билетов у зрителей, `onTickets(codes)` — экраны билетов гостей, `onRequest()` — новая или изменённая заявка на стол.
- `security.js` — заголовки/CSP, лимитер, проверка Origin, разбор X-Forwarded-For (доверяем `TRUST_PROXY` последним хопам), пароль админки.
- `staff.js` — роль контролёра: одноразовое приглашение → HttpOnly cookie `mt_staff`, в базе только хэш токена.
- `db.js` — схема SQLite, миграции и событие по умолчанию (сидится только в пустую базу), `DEFAULT_CAPACITY`.
- `seo.js` — `/robots.txt`, `/sitemap.xml` и `render()`: в каждую публичную HTML-страницу сервер дописывает canonical (от `PUBLIC_ORIGIN`), Open Graph, schema.org (`BarOrPub` на главной, `Event` с ценой на событии), мета-теги `YANDEX_VERIFICATION`/`GOOGLE_VERIFICATION` и текст внутри пустого `<main id="app"></main>` (заголовок, дата, цена, меню), который скрипт страницы потом заменяет. Служебные страницы (`PRIVATE`) не трогает, у них `noindex` в самих HTML. Адрес и часы бара для разметки — `VENUE` там же. Значки: `public/favicon.ico` (16/32/48), `img/icon-120.png` для Яндекса, `img/og.jpg` — картинка для ссылок.
- `backup.js` — дневные копии базы через `VACUUM INTO` в `backups/` рядом с базой (`BACKUP_DIR=off` выключает; в тестах и e2e выключено). `/api/health` проверяет, что база читается.

**Модель билетов.** Билет входной, без места: `hold(eventId, qty)` (до `MAX_TICKETS_PER_ORDER` = 10). У события `capacity` и одна `price`; `computeAvailability` отдаёт `{capacity, sold, held, free}`. У билета `table_id = 'GA'`, `seat_no` — порядковый номер из `freeNumbers()`; частичный уникальный индекс `tickets_seat_taken` по `(event_id, table_id, seat_no)` вместе с транзакцией `tx()` не даёт продать больше вместимости. Старые билеты из времён схемы зала хранят номер стола, считаются во вместимость, но нигде не показываются. Колонка `events.halls` осталась в схеме и не используется. Заказ живёт `held` (10 минут) → `paid` → `refunded`, либо `expired`/`cancelled`; билеты `held` → `active` → `used`. Просроченные брони снимает `sweep()` (перед операциями и по таймеру). Вместимость и цену админ меняет через `updateEvent` (не ниже проданного).

**Заявки на стол.** Таблица `table_requests`: `requestTable` (публичный `POST /api/table-requests`, лимит 10 в час с IP, согласие обязательно, событие или дата `day` на полгода вперёд), `listTableRequests`/`updateTableRequest` для админки (статусы `new`/`confirmed`/`declined`, заметка). Денег и связи с билетами нет. Форма — `public/js/table-request.js`, на странице события и на главной.

**Доступ.** Заказом управляют по `secret` (передаётся во фрагменте URL `/tickets#order=…`, не в query) или по номеру заказа + телефону. Публичная ссылка на билет (`getTicket`) намеренно не отдаёт номер заказа, контакты и чужие билеты. Контролёр получает урезанный `gateView`, админ — полный `ticketView`. Админ правит билет через `adminEditTicket` (имя, цена, статус active/used/cancelled с проверкой вместимости при возврате из аннулированных, `newQr` — новый `gate_id`) и контакты через `adminEditOrder`; сумма заказа пересчитывается, правки пишутся в `ticket_log` как `admin_edit`. `liveTickets` отдаёт и имя, чтобы экран гостя обновлялся после правки.

**Вход по QR.** QR несёт `/c/<gate_id>.<подпись>`: HMAC номера для входа (`tickets.gate_id`) и 30-секундного окна (ключ `QR_SECRET` или в таблице `settings`), принимается текущее и предыдущее окно. Короткий «код для входа» (6 символов) выводится из того же ключа. Код билета в QR не попадает: он открывает билет и выдаёт живые QR, а по фото QR это сделать нельзя. Полный код билета на вход принимает только админ. `/c/…` отдаёт `c.html`: с cookie контролёра гасит билет, иначе показывает нейтральную страницу. Сканер на `/staff` берёт встроенный `BarcodeDetector`, а где его нет (Safari и все браузеры на iPhone) подгружает `public/vendor/jsqr.js`.

**Оплата (ЮKassa).** Режим `payments` в `createBooking`: `'demo'`, `'yookassa'` (заданы `YOOKASSA_SHOP_ID`/`YOOKASSA_SECRET_KEY`) или `null`. Поток: `startPayment` (контакты, продление брони, строки чека) → `yookassa.createPayment` → `attachPayment`; подтверждение — `applyPayment` по платежу, запрошенному у API (`syncPayment` в `index.js`: из вебхука `/api/payments/yookassa` и раз в минуту по `pendingPayments`). Вебхук без подписи и без проверки Origin, поэтому ему не верим: берём id и спрашиваем ЮKassa. Возвраты в два шага: `*RefundPlan` → `yookassa.createRefund` → действие в базе (`recordRefund`). Чек собирает `buildReceipt` в `server/yookassa.js`. `test/e2e/payments.e2e.js` гоняет всё против `yookassa-mock.js`.

**PDF-билет.** `ticket-pdf.js` рисует страницу A4 на canvas, сохраняет JPEG и собирает минимальный PDF без библиотек (кириллица — шрифтами браузера). QR в PDF постоянный: `/c/<gate_id>.<подпись с окном 'print'>` из `GET /api/tickets/:code/print` (только по коду билета). `verifySig` принимает его наравне с живым; гашение атомарное, поэтому пускает один раз, после возврата не действует.

**Фронтенд** (`public/`): отдельная HTML-страница на раздел, у каждой свой модуль в `public/js/`. Общее — `common.js` (`api()`, `fmt` в часовом поясе заведения с `/api/settings`, `esc()` для всей вставки в `innerHTML`, шапка/подвал, данные заведения `VENUE`). Страница события: крупный блок покупки (`#buy`: число билетов, сумма, остаток), на телефоне закреплённая снизу кнопка «Купить», пока блок не виден, и форма заявки на стол. Живые данные приходят через EventSource (`/api/events/:id/stream`, `/api/tickets/live`). Меню — только кухня, `menu-data.js`, перенесено из PDF-буклета.

**Демо-сборка** (`tools/claude-demo/`): `build.py` копирует модули из `public/` и заменяет обращения к серверу на `src/js/backend.js` (localStorage), оборачивает код страниц в `mount(route)` для одностраничного роутера `src/js/app.js`. Правки строятся на точном совпадении строк (`rep()` падает с assert) — после изменения текстов или кода в `public/js` пересоберите и поправьте шаблоны в `build.py`.

**Документы.** `public/{offer,refund,privacy,consent,contacts}.html` — статичные страницы, собираются `python3 scripts/make-legal-pages.py` (текст правьте там) (модуль `legal.js` только рисует шапку и подвал). Реквизиты — `public/js/seller.js`, в HTML они продублированы; `test/legal.test.js` сверяет. Согласие на обработку ПД обязательно (`consent: true` в `pay`/`startPayment`, иначе 400), время — `orders.consent_at`. Шрифты свои (`public/fonts`, `css/fonts.css`), CSP без внешних доменов. Боевой хостинг — VPS в РФ через `docker-compose.yml` + `Caddyfile` (152-ФЗ, локализация ПД).

## Соглашения

- CSP запрещает встроенные скрипты: весь JS только в файлах, стили-атрибуты разрешены.
- Тексты для людей пишутся простым языком без канцелярита и лишних тире (в `.claude/skills/` есть `stop-slop`).
- Мобильная версия: зоны нажатия ≥ 44 px, шторки снизу учитывают `env(safe-area-inset-*)`; проверялась на iPhone SE (320 px) и iPhone 13.
- Цвета графиков админки проверены `dataviz`-валидатором на фоне `#2a3648`; менять только с повторной проверкой.
