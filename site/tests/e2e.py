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

    # валидация: пустое имя
    page.fill("#q-name", "")
    page.click("#form-quick button[type=submit]")
    page.wait_for_timeout(300)
    if page.locator("#q-name-error").is_hidden():
        problems.append("валидация имени не показала ошибку")
    else:
        notes.append(f"ошибка имени: {page.locator('#q-name-error').inner_text()}")

    # успешная отправка быстрой формы
    page.fill("#q-name", "Дмитрий")
    page.click("#form-quick button[type=submit]")
    page.wait_for_selector(".stamp", timeout=4000)
    page.wait_for_timeout(600)
    notes.append(f"payload быстрой формы: {captured.get('body')}")
    page.locator(".quickform").screenshot(path=f"{OUT}/form-success.png")

    # honeypot: заполненное скрытое поле не должно доходить как обычная заявка
    hp = page.evaluate("!!document.querySelector('input[name=company]')")
    notes.append(f"honeypot в разметке: {hp}")

    # основная форма: согласие обязательно
    page.evaluate("document.querySelector('#apply').scrollIntoView()")
    page.wait_for_timeout(900)
    page.fill("#m-name", "Дмитрий")
    page.click("#m-phone"); page.type("#m-phone", "9161234567", delay=8)
    page.fill("#m-message", "Иск от бывшего партнёра, заседание 14 октября")
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

    # слайдер
    page.evaluate("document.querySelector('#reviews').scrollIntoView()"); page.wait_for_timeout(900)
    before = page.evaluate("document.querySelector('.slider__track').style.transform")
    page.click("[data-slide=next]"); page.wait_for_timeout(800)
    after = page.evaluate("document.querySelector('.slider__track').style.transform")
    notes.append(f"слайдер: {before} -> {after}")
    if before == after:
        problems.append("слайдер не переключается")

    # sticky-кнопка: появляется после hero, прячется у основной формы
    page.evaluate("document.querySelector('#cases').scrollIntoView()"); page.wait_for_timeout(900)
    on_cases = page.evaluate("document.querySelector('#calltab').classList.contains('is-on')")
    page.evaluate("document.querySelector('#apply').scrollIntoView()"); page.wait_for_timeout(900)
    on_apply = page.evaluate("document.querySelector('#calltab').classList.contains('is-on')")
    notes.append(f"sticky-кнопка: у карточек={on_cases}, у формы={on_apply}")
    if not on_cases or on_apply:
        problems.append(f"sticky-кнопка ведёт себя неверно (cases={on_cases}, apply={on_apply})")

    # клавиатура: доходим до кнопки быстрой формы
    if errors:
        problems.append(f"pageerror: {errors[:3]}")

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
      for (const sel of ['.hero__lead', '.case__answer', '.stat__label', '.field__label', '.qa__a>p']) {
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
