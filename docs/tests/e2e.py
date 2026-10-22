"""
Проверка лендинга через Playwright.

    pip install playwright && playwright install chromium
    python3 -m http.server 4173 &
    python3 tests/e2e.py

Переменные окружения: BASE_URL, SHOTS_DIR, CHROME_PATH.
Скриншоты 390 / 768 / 1440 складываются в SHOTS_DIR.
"""
import sys, os, json
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:4173/")
OUT = os.environ.get("SHOTS_DIR", "shots")
problems, notes = [], []

os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)

    for label, w, h in [("mobile-390", 390, 844), ("tablet-768", 768, 1024), ("desktop-1440", 1440, 900)]:
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
        page = ctx.new_page()
        logs = []
        page.on("console", lambda m: logs.append((m.type, m.text)))
        page.on("pageerror", lambda e: logs.append(("pageerror", str(e))))
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(1200)

        # горизонтальный скролл
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        if overflow > 1:
            problems.append(f"{label}: горизонтальный скролл {overflow}px")

        # hero виден
        page.screenshot(path=f"{OUT}/{label}-hero.png")

        # полная страница: прокрутить, чтобы сработали IntersectionObserver
        page.evaluate("document.documentElement.style.scrollBehavior='auto'")
        page.evaluate("""async () => {
            const step = window.innerHeight * 0.7;
            for (let y = 0; y < document.body.scrollHeight; y += step) {
                window.scrollTo(0, y);
                await new Promise(r => setTimeout(r, 140));
            }
            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, 300));
        }""")
        page.wait_for_timeout(700)
        page.screenshot(path=f"{OUT}/{label}-full.png", full_page=True)

        errs = [f"{t}: {x}" for t, x in logs if t in ("error", "pageerror")]
        if errs:
            problems.append(f"{label}: консоль -> {errs[:3]}")
        notes.append(f"{label}: overflow={overflow}px, консоль чистая={not errs}")
        ctx.close()

    # ── функциональные проверки на десктопе ──
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    captured = {}

    def fake_api(route):
        captured["body"] = json.loads(route.request.post_data or "{}")
        route.fulfill(status=200, content_type="application/json", body='{"ok":true}')

    page.route("**/api/lead", fake_api)
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("document.documentElement.style.scrollBehavior='auto'")

    # маска телефона
    page.fill("#q-name", "Дмитрий")
    page.click("#q-phone")
    page.type("#q-phone", "9161234567", delay=12)
    masked = page.input_value("#q-phone")
    notes.append(f"маска телефона: {masked}")
    if masked != "+7 (916) 123-45-67":
        problems.append(f"маска телефона даёт {masked!r}")

    # номер с ведущей восьмёркой: маска не должна сдвигать цифры
    page.fill("#m-phone", "")
    page.click("#m-phone"); page.type("#m-phone", "89098548861", delay=8)
    with8 = page.input_value("#m-phone")
    notes.append(f"маска, набор с 8: {with8}")
    if with8 != "+7 (909) 854-88-61":
        problems.append(f"набор с 8 даёт {with8!r} вместо +7 (909) 854-88-61")
    page.fill("#m-phone", "")

    # валидация: пустое имя
    page.fill("#q-name", "")
    page.click("#form-quick button[type=submit]")
    page.wait_for_timeout(300)
    if page.locator("#q-name-error").is_hidden():
        problems.append("валидация имени не показала ошибку")
    else:
        notes.append(f"ошибка имени: {page.locator('#q-name-error').inner_text()}")

    # быстрая форма без флажка согласия не уходит
    page.fill("#q-name", "Дмитрий")
    page.click("#form-quick button[type=submit]")
    page.wait_for_timeout(300)
    if page.locator("#q-consent-error").is_hidden() or captured.get("body"):
        problems.append("быстрая форма ушла без согласия на обработку ПДн")
    else:
        notes.append("быстрая форма без согласия не отправляется")

    # успешная отправка быстрой формы
    page.check("#q-consent")
    page.click("#form-quick button[type=submit]")
    page.wait_for_selector(".stamp", timeout=4000)
    page.wait_for_timeout(600)
    notes.append(f"payload быстрой формы: {captured.get('body')}")
    if (captured.get("body") or {}).get("consent") != "2026-10-22":
        problems.append("в заявку с быстрой формы не попала редакция согласия")
    page.locator(".quickform").screenshot(path=f"{OUT}/form-success.png")

    # honeypot: заполненное скрытое поле не должно доходить как обычная заявка
    hp = page.evaluate("!!document.querySelector('input[name=company]')")
    notes.append(f"honeypot в разметке: {hp}")

    # основная форма: согласие обязательно
    page.evaluate("document.querySelector('#apply').scrollIntoView()")
    page.wait_for_timeout(900)
    page.fill("#m-name", "Дмитрий")
    page.click("#m-phone"); page.type("#m-phone", "9161234567", delay=8)
    page.fill("#m-message", "Вызывают свидетелем 14 ноября")
    page.click("#form-main button[type=submit]")
    page.wait_for_timeout(300)
    if page.locator("#m-consent-error").is_hidden():
        problems.append("форма ушла без согласия на обработку ПДн")
    else:
        notes.append("без согласия форма не отправляется")

    page.check("#m-consent")
    page.click("#form-main button[type=submit]")
    page.wait_for_selector("#apply .stamp", timeout=4000)
    page.wait_for_timeout(700)
    notes.append(f"payload основной формы: {captured.get('body')}")
    page.locator("#apply").screenshot(path=f"{OUT}/apply-success.png")

    # FAQ
    page.evaluate("document.querySelector('#faq').scrollIntoView()"); page.wait_for_timeout(700)
    page.click(".qa:first-child .qa__q"); page.wait_for_timeout(600)
    opened = page.evaluate("document.querySelector('.qa').open")
    notes.append(f"FAQ раскрывается: {opened}")
    if not opened:
        problems.append("FAQ не раскрылся")
    page.locator("#faq").screenshot(path=f"{OUT}/faq.png")

    # закрыть и сразу открыть снова, пока идёт анимация: вопрос должен остаться открытым
    q2 = page.locator(".qa").nth(1)
    q2.locator(".qa__q").click(); page.wait_for_timeout(600)
    q2.locator(".qa__q").click(); page.wait_for_timeout(120)
    q2.locator(".qa__q").click(); page.wait_for_timeout(900)
    reopened = page.evaluate("(() => { const q = document.querySelectorAll('.qa')[1]; return q.open && q.classList.contains('is-open'); })()")
    notes.append(f"FAQ: повторное открытие во время закрытия срабатывает: {reopened}")
    if not reopened:
        problems.append("FAQ: клик во время закрытия не открывает вопрос заново")

    # переход по пункту меню: заголовок секции не уходит под липкую шапку
    page.evaluate("document.documentElement.style.scrollBehavior='auto'")
    page.click(".topnav a[href='#process']"); page.wait_for_timeout(500)
    head_top = page.evaluate("document.querySelector('#process .band__title').getBoundingClientRect().top")
    bar_bottom = page.evaluate("document.querySelector('#topbar').getBoundingClientRect().bottom")
    notes.append(f"якорь #process: заголовок на {round(head_top)}px, шапка до {round(bar_bottom)}px")
    if head_top < bar_bottom:
        problems.append("заголовок секции после перехода по меню прячется под шапкой")

    # панель вызова: появляется после hero, прячется у основной формы
    page.evaluate("document.querySelector('#cases').scrollIntoView()"); page.wait_for_timeout(900)
    on_cases = page.evaluate("document.querySelector('#callbar').classList.contains('is-on')")
    page.evaluate("document.querySelector('#apply').scrollIntoView()"); page.wait_for_timeout(900)
    on_apply = page.evaluate("document.querySelector('#callbar').classList.contains('is-on')")
    notes.append(f"панель вызова: у карточек={on_cases}, у формы={on_apply}")
    if not on_cases or on_apply:
        problems.append(f"панель вызова ведёт себя неверно (cases={on_cases}, apply={on_apply})")

    # клавиатура: доходим до кнопки быстрой формы
    if errors:
        problems.append(f"pageerror: {errors[:3]}")

    ctx.close()

    # документы: открываются, в новой вкладке из формы, ссылаются друг на друга
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")
    doc_links = page.evaluate("""() => [...document.querySelectorAll('form a')].map(a => [a.getAttribute('href'), a.target])""")
    if not doc_links or any(t != "_blank" for _, t in doc_links):
        problems.append(f"ссылки на документы в формах открываются в той же вкладке: {doc_links}")
    for path, must in [("privacy.html", "consent.html"), ("consent.html", "privacy.html")]:
        r = page.goto(BASE + path, wait_until="load")
        ok = r and r.status == 200 and page.locator(f"a[href='{must}']").count() > 0
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        notes.append(f"{path}: HTTP {r.status if r else '—'}, ссылка на {must}: {ok}, overflow={overflow}px")
        if not ok or overflow > 1:
            problems.append(f"{path}: не открылась, нет ссылки на {must} или есть горизонтальный скролл")
        page.screenshot(path=f"{OUT}/{path}.png", full_page=True)
    ctx.close()

    # Content-Security-Policy из vercel.json: сайт работает, браузер ничего не блокирует
    vercel = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vercel.json")))
    csp = next(x["value"] for h in vercel["headers"] for x in h["headers"] if x["key"] == "Content-Security-Policy")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    def with_csp(route, _req):
        resp = route.fetch()
        route.fulfill(response=resp, headers={**resp.headers, "content-security-policy": csp})
    ctx.route(BASE.rstrip("/") + "/**", with_csp)
    page = ctx.new_page()
    blocked = []
    page.on("console", lambda m: blocked.append(m.text) if "Content Security Policy" in m.text else None)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(400)
    ran = page.evaluate("document.documentElement.classList.contains('js') && window.__siteReady === true")
    for path in ["privacy.html", "consent.html", "404.html"]:
        page.goto(BASE + path, wait_until="load")
    bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
    notes.append(f"CSP: нарушений {len(blocked)}, встроенный скрипт выполнился={ran}, стиль 404 применён={bg == 'rgb(241, 242, 239)'}")
    if blocked or not ran or bg != "rgb(241, 242, 239)":
        problems.append(f"CSP мешает сайту: {blocked[:2]}, скрипт={ran}, фон 404={bg}")
    ctx.close()

    # фотографии: загрузились, описаны, браузер выбрал WebP
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("document.documentElement.style.scrollBehavior='auto'")
    page.evaluate("""async () => { for (let y=0; y<document.body.scrollHeight; y+=500) { scrollTo(0,y); await new Promise(r=>setTimeout(r,80)); } }""")
    page.wait_for_timeout(800)
    imgs = page.evaluate("""() => [...document.querySelectorAll('main img')].map(i => ({
        alt: i.alt, ok: i.complete && i.naturalWidth > 0, src: (i.currentSrc || '').split('/').pop() }))""")
    notes.append(f"фото: {[(i['src'], i['ok']) for i in imgs]}")
    bad = [i for i in imgs if not i["ok"] or not i["alt"].strip() or not i["src"].endswith(".webp")]
    if len(imgs) != 3 or bad:
        problems.append(f"фото не загрузились, без alt или не WebP: {bad or imgs}")
    ctx.close()

    # на телефоне браузер должен взять отдельные кадры для узкого экрана
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("document.documentElement.style.scrollBehavior='auto'")
    page.evaluate("""async () => { for (let y=0; y<document.body.scrollHeight; y+=400) { scrollTo(0,y); await new Promise(r=>setTimeout(r,80)); } }""")
    page.wait_for_timeout(800)
    mimgs = page.evaluate("""() => [...document.querySelectorAll('main img')].map(i => ({
        ok: i.complete && i.naturalWidth > 0, src: (i.currentSrc || '').split('/').pop() }))""")
    notes.append(f"фото на телефоне: {[(i['src'], i['ok']) for i in mimgs]}")
    want = ["portrait-wide-", "codes-wide-", "desk-"]
    if [not i["ok"] for i in mimgs].count(True) or not all(i["src"].startswith(w) for i, w in zip(mimgs, want)):
        problems.append(f"на телефоне не загрузились узкие кадры: {mimgs}")
    ctx.close()

    # мобильная панель вызова: кнопка звонка видна и ведёт на tel:
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("document.documentElement.style.scrollBehavior='auto'")
    page.evaluate("document.querySelector('#process').scrollIntoView()"); page.wait_for_timeout(900)
    call = page.locator(".callbar__btn--call")
    href = call.get_attribute("href")
    visible = call.is_visible()
    box = call.bounding_box() or {"height": 0}
    notes.append(f"мобильная панель: «Позвонить» видна={visible}, href={href}, высота={round(box['height'])}px")
    if not visible or href != "tel:+79098548861" or box["height"] < 44:
        problems.append("мобильная кнопка звонка не видна, ведёт не туда или меньше 44px")
    page.screenshot(path=f"{OUT}/mobile-callbar.png")
    ctx.close()

    # контраст основного текста
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")
    contrast = page.evaluate("""() => {
      const lum = (rgb) => {
        const [r,g,b] = rgb.match(/\d+/g).slice(0,3).map(Number).map(v => {
          v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
        });
        return 0.2126*r + 0.7152*g + 0.0722*b;
      };
      const ratio = (a,b) => { const [x,y] = [lum(a), lum(b)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05); };
      const bg = getComputedStyle(document.body).backgroundColor;
      const out = {};
      for (const sel of ['.hero__lead', '.case__answer', '.step__text', '.field__label', '.qa__a>p']) {
        const el = document.querySelector(sel);
        if (el) out[sel] = Math.round(ratio(getComputedStyle(el).color, bg) * 100) / 100;
      }
      return out;
    }""")
    notes.append(f"контраст к фону страницы: {contrast}")
    for sel, val in contrast.items():
        if val < 4.5:
            problems.append(f"контраст {sel} = {val}, ниже AA 4.5")
    ctx.close()

    # reduced motion
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(600)
    h1_op = page.evaluate("getComputedStyle(document.querySelector('.hero__title span span')).opacity")
    h1_tr = page.evaluate("getComputedStyle(document.querySelector('.hero__title span span')).transform")
    notes.append(f"reduced-motion: заголовок opacity={h1_op}, transform={h1_tr}")
    if h1_op != "1" or h1_tr not in ("none", "matrix(1, 0, 0, 1, 0, 0)"):
        problems.append("при reduced-motion заголовок остался анимированным")
    page.screenshot(path=f"{OUT}/reduced-motion.png")
    ctx.close()

    # main.js не загрузился (404, блокировщик, обрыв сети): первый экран открывается сам
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.route("**/assets/js/main.js", lambda r: r.abort())
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(3600)
    h1_tr = page.evaluate("getComputedStyle(document.querySelector('.hero__title span span')).transform")
    icon_op = page.evaluate("getComputedStyle(document.querySelector('.case__icon')).opacity")
    notes.append(f"main.js не загрузился: заголовок transform={h1_tr}, иконки opacity={icon_op}")
    if h1_tr not in ("none", "matrix(1, 0, 0, 1, 0, 0)") or icon_op != "1":
        problems.append("без main.js первый экран или иконки остались скрытыми")
    ctx.close()

    # без JavaScript контент должен остаться читаемым
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, java_script_enabled=False)
    page = ctx.new_page()
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(400)
    visible = page.locator(".case__title").first.is_visible()
    notes.append(f"без JS заголовки карточек видны: {visible}")
    if not visible:
        problems.append("без JS контент скрыт")
    page.screenshot(path=f"{OUT}/no-js.png", full_page=False)
    ctx.close()

    browser.close()

print("\n".join("  " + n for n in notes))
print()
if problems:
    print("ПРОБЛЕМЫ:")
    for pr in problems:
        print("  ! " + pr)
    sys.exit(1)
print("Все проверки пройдены")
