"""
Проверка визитки в браузере через Playwright.

    pip install playwright && playwright install chromium
    python3 -m http.server 4173 &
    python3 tests/e2e.py

Переменные окружения: BASE_URL, SHOTS_DIR, CHROME_PATH.
"""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:4173/")
OUT = os.environ.get("SHOTS_DIR", "shots")
HERE = os.path.dirname(os.path.abspath(__file__))
PHONE = "tel:+79098548861"
problems, notes = [], []
os.makedirs(OUT, exist_ok=True)

LUM = """(rgb) => { const [r,g,b] = rgb.match(/\\d+/g).slice(0,3).map(Number).map(v => {
  v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
  return 0.2126*r + 0.7152*g + 0.0722*b; }"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)

    # три ширины: без горизонтального скролла и ошибок, телефон виден, фото нужного кадра
    for label, w, h, want_photo in [("mobile-390", 390, 844, "portrait-wide-"),
                                    ("tablet-768", 768, 1024, "portrait-wide-"),
                                    ("desktop-1440", 1440, 900, "portrait-")]:
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
        page = ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(900)
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        call = page.locator(".call")
        box = call.bounding_box()
        call_in_view = box is not None and box["y"] + box["height"] <= h
        img = page.evaluate("""() => { const i = document.querySelector('.card__photo img');
            return { ok: i.complete && i.naturalWidth > 0, alt: i.alt, src: (i.currentSrc||'').split('/').pop() }; }""")
        notes.append(f"{label}: overflow={overflow}px, консоль чистая={not errs}, кнопка звонка в первом экране={call_in_view}, фото={img['src']}")
        if overflow > 1: problems.append(f"{label}: горизонтальный скролл {overflow}px")
        if errs: problems.append(f"{label}: ошибки консоли {errs[:2]}")
        if not call_in_view: problems.append(f"{label}: кнопка звонка не помещается в первый экран")
        if call.get_attribute("href") != PHONE or box["height"] < 44:
            problems.append(f"{label}: кнопка звонка ведёт не туда или меньше 44px")
        right_crop = img["src"].startswith(want_photo) and (want_photo == "portrait-wide-" or not img["src"].startswith("portrait-wide-"))
        if not img["ok"] or not img["alt"] or not right_crop or not img["src"].endswith(".webp"):
            problems.append(f"{label}: фото {img}")
        page.screenshot(path=f"{OUT}/{label}.png", full_page=True)
        ctx.close()

    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(BASE, wait_until="networkidle")

    # кнопка звонка поднимается при наведении (анимация появления не должна её держать)
    page.wait_for_timeout(900)
    page.hover(".call"); page.wait_for_timeout(500)
    lifted = page.evaluate("getComputedStyle(document.querySelector('.call')).transform")
    notes.append(f"кнопка при наведении: transform={lifted}")
    if lifted in ("none", "matrix(1, 0, 0, 1, 0, 0)"):
        problems.append("кнопка звонка не реагирует на наведение")

    # все ссылки на телефон одинаковые
    tels = page.evaluate("[...document.querySelectorAll('a[href^=\"tel:\"]')].map(a => a.getAttribute('href'))")
    notes.append(f"ссылок на телефон: {len(tels)}")
    if not tels or any(t != PHONE for t in tels):
        problems.append(f"ссылки на телефон расходятся: {tels}")

    # контраст основного текста к фону
    contrast = page.evaluate(f"""() => {{
      const lum = {LUM};
      const ratio = (a,b) => {{ const [x,y] = [lum(a), lum(b)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05); }};
      const out = {{}};
      for (const sel of ['.card__lead', '.card__note', '.help__item p']) {{
        const el = document.querySelector(sel);
        let bgEl = el; while (bgEl && getComputedStyle(bgEl).backgroundColor === 'rgba(0, 0, 0, 0)') bgEl = bgEl.parentElement;
        out[sel] = Math.round(ratio(getComputedStyle(el).color, getComputedStyle(bgEl || document.body).backgroundColor) * 100) / 100;
      }}
      return out;
    }}""")
    notes.append(f"контраст: {contrast}")
    for sel, val in contrast.items():
        if val < 4.5: problems.append(f"контраст {sel} = {val}, ниже AA 4.5")
    ctx.close()

    # reduced-motion: анимаций нет, всё видно сразу
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    page = ctx.new_page()
    page.goto(BASE, wait_until="load")
    op = page.evaluate("getComputedStyle(document.querySelector('.card__name')).opacity")
    notes.append(f"reduced-motion: имя opacity={op}")
    if op != "1": problems.append("при reduced-motion имя не видно сразу")
    ctx.close()

    # Content-Security-Policy из vercel.json: ничего не блокируется
    vercel = json.load(open(os.path.join(HERE, "..", "vercel.json")))
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
    page.goto(BASE + "404.html", wait_until="load")
    bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
    notes.append(f"CSP: нарушений {len(blocked)}, стиль 404 применён={bg == 'rgb(241, 242, 239)'}")
    if blocked or bg != "rgb(241, 242, 239)":
        problems.append(f"CSP мешает сайту: {blocked[:2]}, фон 404={bg}")
    ctx.close()

    # на визитке нет скриптов вовсе: ей нечего ломать при отключённом JavaScript
    has_script = "<script" in open(os.path.join(HERE, "..", "index.html"), encoding="utf-8").read().lower()
    notes.append(f"скриптов на главной: {'есть' if has_script else 'нет'}")
    if has_script: problems.append("на главной появился <script>: визитка задумана без JavaScript")

    browser.close()

print("\n".join("  " + n for n in notes))
print()
if problems:
    print("ПРОБЛЕМЫ:")
    for pr in problems: print("  ! " + pr)
    sys.exit(1)
print("Все проверки пройдены")
