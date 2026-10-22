"""
Пересобирает картинки сайта: превью ссылки assets/img/og.jpg (1200×630)
и иконку iOS assets/img/apple-touch-icon.png (180×180).

Запускать, когда меняется имя, специализация, телефон или портрет:
    npm run dev &
    python3 tools/render-images.py

Шрифты берутся с локального сервера сайта, поэтому он должен быть запущен.
"""
import os
from playwright.sync_api import sync_playwright
FONTS = "assets/fonts/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "img") + os.sep
faces = f"""
@font-face{{font-family:G;src:url({FONTS}eb-garamond-cyrillic.woff2);unicode-range:U+0400-045F}}
@font-face{{font-family:G;src:url({FONTS}eb-garamond-latin.woff2);unicode-range:U+0000-00FF,U+2000-206F}}
@font-face{{font-family:M;src:url({FONTS}manrope-cyrillic.woff2);unicode-range:U+0400-045F}}
@font-face{{font-family:M;src:url({FONTS}manrope-latin.woff2);unicode-range:U+0000-00FF,U+2000-206F}}
"""
og = f"""<html><head><style>{faces}
*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:630px;background:#F1F2EF;color:#15202E;font-family:M;position:relative;overflow:hidden}}
.bar{{position:absolute;left:0;right:0;top:0;height:10px;background:#7B2C31}}
.in{{position:absolute;top:10px;bottom:0;left:0;width:760px;padding:58px 64px 56px 80px;display:flex;flex-direction:column}}
.mark{{display:flex;align-items:center;gap:14px;font-family:G;font-size:30px}}
.mark b{{color:#7B2C31;font-weight:400;font-size:46px;line-height:1}}
.mark small{{display:block;font-family:M;font-size:17px;color:#5A6675;letter-spacing:.02em;margin-top:2px}}
h1{{font-family:G;font-weight:500;font-size:92px;line-height:1.06;letter-spacing:-.01em;margin-top:56px}}
.rule{{width:280px;height:2px;background:#7B2C31;margin-top:32px}}
.foot{{margin-top:auto;font-size:26px;color:#4B5970}}
.foot strong{{display:block;color:#15202E;font-weight:600;font-size:36px;letter-spacing:.01em;margin-top:6px}}
.photo{{position:absolute;top:10px;right:0;bottom:0;width:440px;
  background:url(assets/img/photo/portrait-720.webp) 50% 38%/cover no-repeat}}
</style></head><body><div class="bar"></div><div class="photo"></div><div class="in">
<div class="mark"><b>§</b><div>Адвокат по уголовным делам<small>защита с первого допроса</small></div></div>
<h1>Ярослав<br>Сазиков</h1>
<div class="rule"></div>
<div class="foot">Первая консультация по телефону бесплатная<strong>+7 909 854-88-61</strong></div>
</div></body></html>"""
icon = f"""<html><head><style>{faces}
*{{margin:0}}body{{width:180px;height:180px;background:#15202E;display:grid;place-items:center}}
b{{font-family:G;font-weight:400;font-size:134px;line-height:1;color:#E3B9BC;transform:translateY(6px)}}
</style></head><body><b>§</b></body></html>"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    for html, size, name in [(og, (1200, 630), "og.jpg"), (icon, (180, 180), "apple-touch-icon.png")]:
        pg = b.new_page(viewport={"width": size[0], "height": size[1]})
        # страница «живёт» на адресе сайта, поэтому шрифты грузятся как на сайте
        url = "http://127.0.0.1:4173/__render.html"
        pg.route(url, lambda r, _req, h=html: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=h))
        pg.goto(url, wait_until="networkidle")
        loaded = pg.evaluate("document.fonts.ready.then(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family))")
        print(name, "загружены шрифты:", sorted(set(loaded)))
        # превью ссылки с фото — JPEG: PNG выходит под 500 КБ, а WhatsApp не показывает картинки тяжелее ~300 КБ
        if name.endswith(".jpg"): pg.screenshot(path=OUT + name, type="jpeg", quality=86)
        else: pg.screenshot(path=OUT + name)
    b.close()
print("готово")
