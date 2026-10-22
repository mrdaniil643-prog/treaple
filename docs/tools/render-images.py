"""
Пересобирает картинки сайта: превью ссылки assets/img/og.png (1200×630)
и иконку iOS assets/img/apple-touch-icon.png (180×180).

Запускать, когда меняется заголовок первого экрана, имя или телефон:
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
.in{{position:absolute;inset:10px 0 0 0;padding:64px 88px 60px;display:flex;flex-direction:column}}
.mark{{display:flex;align-items:center;gap:14px;font-family:G;font-size:34px}}
.mark b{{color:#7B2C31;font-weight:400;font-size:46px;line-height:1}}
.mark small{{display:block;font-family:M;font-size:17px;color:#5A6675;letter-spacing:.04em;margin-top:2px}}
h1{{font-family:G;font-weight:500;font-size:82px;line-height:1.06;letter-spacing:-.01em;margin-top:58px;max-width:900px}}
.rule{{width:300px;height:2px;background:#7B2C31;margin-top:34px}}
.foot{{margin-top:auto;display:flex;justify-content:space-between;align-items:baseline;font-size:28px;color:#4B5970}}
.foot strong{{color:#15202E;font-weight:600;font-size:34px;letter-spacing:.01em}}
</style></head><body><div class="bar"></div><div class="in">
<div class="mark"><b>§</b><div>Сазиков<small>юридическая практика</small></div></div>
<h1>Оценю ваши шансы<br>в&nbsp;суде за&nbsp;один звонок</h1>
<div class="rule"></div>
<div class="foot"><span>Ярослав Сазиков, юрист по&nbsp;гражданским делам</span><strong>+7 909 854-88-61</strong></div>
</div></body></html>"""
icon = f"""<html><head><style>{faces}
*{{margin:0}}body{{width:180px;height:180px;background:#15202E;display:grid;place-items:center}}
b{{font-family:G;font-weight:400;font-size:134px;line-height:1;color:#E3B9BC;transform:translateY(6px)}}
</style></head><body><b>§</b></body></html>"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    for html, size, name in [(og, (1200, 630), "og.png"), (icon, (180, 180), "apple-touch-icon.png")]:
        pg = b.new_page(viewport={"width": size[0], "height": size[1]})
        # страница «живёт» на адресе сайта, поэтому шрифты грузятся как на сайте
        url = "http://127.0.0.1:4173/__render.html"
        pg.route(url, lambda r, _req, h=html: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=h))
        pg.goto(url, wait_until="networkidle")
        loaded = pg.evaluate("document.fonts.ready.then(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family))")
        print(name, "загружены шрифты:", sorted(set(loaded)))
        pg.screenshot(path=OUT + name)
    b.close()
print("готово")
