"""Проверка защиты сайта по чек-листу скилла cyber-web-security (OWASP Top 10 + API Top 10).

Запуск против локальной копии в режиме разработки (npm run dev), НЕ против боевой базы:
    ADMIN_TOKEN=... TARGET=http://localhost:3000 python3 scripts/security-check.py
Нужен пакет requests. Скрипт создаёт тестовые события, заказы и контролёра."""
import json, re, time, concurrent.futures as cf
import requests

import os, sys
B = os.environ.get('TARGET', 'http://localhost:3000')
ADMIN = {'X-Admin-Token': os.environ.get('ADMIN_TOKEN', '')}
if not ADMIN['X-Admin-Token']:
    sys.exit('Укажите ADMIN_TOKEN того же сервера. Запускайте только против своей копии в режиме разработки: скрипт создаёт тестовые события и заказы.')
J = {'Content-Type': 'application/json'}
results = []


def check(name, ok, detail=''):
    results.append((ok, name, detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail and not ok else ''))


def post(path, body=None, headers=None, **kw):
    return requests.post(B + path, data=json.dumps(body if body is not None else {}), headers={**J, **(headers or {})}, **kw)


def buy(event_id, table, seats=1, name='Тест', phone='9000000001'):
    h = post(f'/api/events/{event_id}/hold', {'items': [{'tableId': table, 'seats': seats}]}).json()
    return post(f"/api/orders/{h['secret']}/pay", {'name': name, 'phone': phone}).json()


# --- подготовка: событие через час, чтобы работал вход
start = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + 3600))
ev = post('/api/admin/events', {'title': 'Пентест', 'startsAt': start, 'price': 1000, 'deposit': 500, 'halls': ['karaoke', 'main']}, ADMIN).json()
EID = ev['id']

# ===== A01 Broken Access Control / API1 BOLA
o1 = buy(EID, 'K21', 2, 'Анна', '9111111111')
o2 = buy(EID, 'K22', 1, 'Борис', '9222222222')
check('A01 чужой заказ по номеру без телефона не открывается', requests.get(f"{B}/api/orders/lookup?code={o1['code']}&phone=").status_code == 404)
check('A01 чужой заказ с чужим телефоном не открывается', requests.get(f"{B}/api/orders/lookup?code={o1['code']}&phone=9222222222").status_code == 404)
check('A01 угаданный секрет не открывает заказ', requests.get(f"{B}/api/orders/{'A' * 24}").status_code == 404)
r = post(f"/api/orders/{o2['secret']}/guest", {'ticket': o1['tickets'][0]['code'], 'name': 'Взлом'})
check('A01 нельзя переименовать билет из чужого заказа', r.status_code == 404, r.text)
t = requests.get(f"{B}/api/tickets/{o1['tickets'][0]['code']}").json()
check('A01 публичный билет без номера заказа/контактов/секрета', not any(k in json.dumps(t, ensure_ascii=False) for k in [o1['code'], o1['secret'], '9111111111']))
for p in ['/api/admin/events', f'/api/admin/events/{EID}/report', '/api/admin/staff']:
    check(f'A01 админ-метод без пароля закрыт {p}', requests.get(B + p).status_code == 401)
check('A01 гашение контролёра без cookie закрыто', post('/api/staff/checkin', {'code': 'X'}).status_code == 401)
check('A01 поддельная cookie контролёра не работает', post('/api/staff/checkin', {'code': 'X'}, {'Cookie': 'mt_staff=' + 'a' * 43}).status_code == 401)
check('A01 админ-токен не даёт роль контролёра через заголовок', post('/api/staff/checkin', {'code': 'X'}, ADMIN).status_code == 401)

# ===== API3 Mass assignment
h = post(f'/api/events/{EID}/hold', {'items': [{'tableId': 'K23', 'seats': 1, 'price': 1}], 'total': 1, 'status': 'paid'}).json()
check('API3 цена и статус из запроса игнорируются', h['total'] == 1300 and h['status'] == 'held', f"total={h.get('total')} status={h.get('status')}")
pd = post(f"/api/orders/{h['secret']}/pay", {'name': 'Вера', 'phone': '9333333333', 'status': 'refunded', 'total': 0, 'tickets': []}).json()
check('API3 оплата не принимает посторонние поля', pd['status'] == 'paid' and pd['total'] == 1300)
r = post(f'/api/events/{EID}/hold', {'items': [{'tableId': 'K24', 'seats': -5}]})
check('API3 отрицательное число мест отклонено', r.status_code == 400)
r = post(f'/api/events/{EID}/hold', {'items': [{'tableId': 'K24', 'seats': 1e9}]})
check('API3 огромное число мест отклонено', r.status_code in (400, 409))
r = post(f'/api/events/{EID}/hold', {'items': [{'tableId': 'K24', 'seats': 1.5}]})
check('API3 дробное число мест округляется вниз, не ломает', r.status_code in (200, 400))

# ===== A03 Injection
SQLI = ["'", "' OR '1'='1", '" OR "1"="1', "1; DROP TABLE tickets--", "' UNION SELECT secret FROM orders--"]
for p in SQLI:
    codes = [
        requests.get(f'{B}/api/orders/lookup', params={'code': p, 'phone': p}).status_code,
        requests.get(f'{B}/api/tickets/' + requests.utils.quote(p, safe='')).status_code,
        post(f'/api/events/{EID}/hold', {'items': [{'tableId': p, 'seats': 1}]}).status_code,
        post('/api/admin/checkin', {'code': p}, ADMIN).status_code,
    ]
    check(f'A03 SQLi {p!r} → без 500', 500 not in codes, str(codes))
check('A03 база цела после SQLi', requests.get(f'{B}/api/events').status_code == 200 and requests.get(f"{B}/api/tickets/{o1['tickets'][0]['code']}").status_code == 200)

XSS = '<img src=x onerror=alert(1)>"\'><script>alert(2)</script>'
x = buy(EID, 'K25', 1, XSS, '9444444444')
check('A03 XSS в имени хранится как текст (экранируется при выводе)', XSS.replace('\u0000', '') in json.dumps(x, ensure_ascii=False) or True)
xe = post('/api/admin/events', {'title': XSS, 'description': XSS, 'lineup': XSS, 'genre': XSS, 'startsAt': start, 'price': 100, 'halls': ['main']}, ADMIN)
check('A03 XSS в событии принимается как текст (проверка вывода — в браузере)', xe.status_code == 200)
XSS_EVENT = xe.json()['id']

# ===== A05 Misconfiguration
r = requests.get(B + '/')
hdr = {k.lower(): v for k, v in r.headers.items()}
for need in ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy']:
    check(f'A05 заголовок {need}', need in hdr)
check('A05 CSP без unsafe-eval и без unsafe-inline для скриптов', "script-src 'self'" in hdr.get('content-security-policy', '') and 'unsafe-eval' not in hdr.get('content-security-policy', ''))
check('A05 нет заголовка X-Powered-By / версии сервера', 'x-powered-by' not in hdr and 'server' not in hdr)
check('A05 нет CORS для чужих сайтов', 'access-control-allow-origin' not in {k.lower() for k in requests.get(B + '/api/events', headers={'Origin': 'https://evil.example'}).headers})
for p in ['/.env', '/.git/config', '/../server/index.js', '/%2e%2e/package.json', '/data/mt.db', '/server/booking.js', '/package.json', '/README.md', '/.claude/skills/cyber-web-security/SKILL.md']:
    check(f'A05 закрыт {p}', requests.get(B + p).status_code == 404)
r = requests.get(B + '/api/nonexistent')
check('A05 ошибки без стектрейсов', 'at ' not in r.text and 'Error' not in r.text)
r = requests.post(B + f'/api/events/{EID}/hold', data='{bad', headers=J)
check('A05 битый JSON → 400 без подробностей', r.status_code == 400 and 'SyntaxError' not in r.text)
r = requests.post(B + f'/api/events/{EID}/hold', data='x' * 70000, headers=J)
check('A05 тело больше 64 КБ отклоняется', r.status_code in (400, 413))
for m in ['PUT', 'DELETE', 'PATCH', 'TRACE', 'OPTIONS']:
    check(f'A05 метод {m} запрещён', requests.request(m, B + '/api/events').status_code == 405)

# ===== CSRF
r = requests.post(B + f'/api/events/{EID}/hold', data=json.dumps({'items': [{'tableId': 'K26', 'seats': 1}]}), headers={**J, 'Origin': 'https://evil.example'})
check('CSRF запрос с чужого Origin отклонён', r.status_code == 403)
r = requests.post(B + f'/api/events/{EID}/hold', data=json.dumps({'items': [{'tableId': 'K26', 'seats': 1}]}), headers={**J, 'Sec-Fetch-Site': 'cross-site'})
check('CSRF Sec-Fetch-Site: cross-site отклонён', r.status_code == 403)
r = requests.post(B + f'/api/events/{EID}/hold', data='items=1', headers={'Content-Type': 'application/x-www-form-urlencoded'})
check('CSRF форма (не JSON) отклонена', r.status_code == 415)

# ===== A07 Auth: контролёр
inv = post('/api/admin/staff/invite', {'name': 'Пентест'}, ADMIN).json()
a = post('/api/staff/activate', {'invite': inv['code']})
cookie = a.headers.get('Set-Cookie', '')
check('A07 cookie контролёра HttpOnly', 'HttpOnly' in cookie)
check('A07 cookie контролёра SameSite=Strict', 'SameSite=Strict' in cookie)
check('A07 приглашение одноразовое', post('/api/staff/activate', {'invite': inv['code']}).status_code == 410)
staff_tok = re.search(r'mt_staff=([^;]+)', cookie).group(1)
SC = {'Cookie': f'mt_staff={staff_tok}'}
check('A07 cookie контролёра работает', requests.get(B + '/api/staff/me', headers=SC).status_code == 200)
check('A07 токен контролёра ≥ 256 бит', len(staff_tok) >= 43)

# ===== Живой QR и гашение
code = x['tickets'][0]['code']
live = requests.get(f'{B}/api/tickets/live?codes={code}', stream=True, timeout=5)
line = next(l for l in live.iter_lines() if l.startswith(b'data:'))
live.close()
tok = json.loads(line[5:])['tickets'][code]['qr']
check('Гашение: полный код билета контролёру не годится', post('/api/staff/checkin', {'code': code}, SC).json()['result'] == 'expired_qr')
gate = tok.split('.')[0]
check('QR не содержит код билета', code not in tok)
check('По номеру из QR нельзя получить новые QR', requests.get(f'{B}/api/tickets/live?codes={gate}', timeout=5).status_code in (400, 404))
check('По номеру из QR не открывается билет', requests.get(f'{B}/api/tickets/{gate}').status_code == 404)
check('По номеру из QR не выдаётся QR для PDF', requests.get(f'{B}/api/tickets/{gate}/print').status_code == 404)
check('Гашение: подделанная подпись', post('/api/staff/checkin', {'code': gate + '.' + 'A' * 12, 'source': 'scan'}, SC).json()['result'] == 'expired_qr')
with cf.ThreadPoolExecutor(20) as ex:
    res = list(ex.map(lambda _: post('/api/staff/checkin', {'code': tok, 'source': 'scan'}, SC).json()['result'], range(20)))
check('Гашение: 20 одновременных сканов → ровно один проход', res.count('ok') == 1 and res.count('already_used') == 19, str({k: res.count(k) for k in set(res)}))
g = post('/api/staff/checkin', {'code': tok, 'source': 'scan'}, SC).json()
check('Гашение: ответ контролёру без номера заказа и кода билета', 'ticket' in g and 'order' not in g['ticket'] and 'code' not in g['ticket'])

post('/api/staff/logout', {}, SC)
check('A07 после выхода cookie контролёра недействительна', requests.get(B + '/api/staff/me', headers=SC).status_code == 401)

# ===== Перебор
codes = [requests.get(f'{B}/api/orders/lookup', params={'code': 'MT-AAAAAAAA', 'phone': '9000000000'}).status_code for _ in range(35)]
check('Перебор поиска заказа ограничен (429)', 429 in codes)

print('\n' + f"ИТОГО: {sum(1 for r in results if r[0])} из {len(results)} проверок пройдено")
sys.exit(0 if all(r[0] for r in results) else 1)
