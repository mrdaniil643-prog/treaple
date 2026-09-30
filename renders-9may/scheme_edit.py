"""Render 1A on the real square: rework the event scheme photo per the brief.
Numbers moved on top, top rows of 1 and 8 in red with '+32 места', dimensions, '9 Мая' on the screens."""
import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
RED = (200, 22, 29); DARK = (24, 28, 36); WHITE = (255, 255, 255)
K = 2  # upscale factor

src = cv2.imread(os.path.join(BASE, 'ref/scheme_rot.png'))
# 1) remove the old number badges (they sit below the stands) by inpainting
mask = np.zeros(src.shape[:2], np.uint8)
old = [(320, 595), (425, 584), (525, 574), (620, 572), (700, 565), (785, 550), (900, 543), (1030, 545)]
for x, y in old: cv2.circle(mask, (x, y), 13, 255, -1)
# their seat list on the square (replaced by the legend)
cv2.rectangle(mask, (578, 690), (782, 868), 255, -1)
clean = cv2.inpaint(src, mask, 7, cv2.INPAINT_NS)
im = Image.fromarray(cv2.cvtColor(clean, cv2.COLOR_BGR2RGB))

# 2) top rows of 1 and 8 in red (multiply over the seats so the texture stays)
def redrow(poly):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
    arr = np.asarray(im).astype(np.float32); mk = np.asarray(m)[..., None]/255.0
    lum = arr.mean(axis=2, keepdims=True)/255.0
    red = np.array(RED, np.float32)[None, None, :] * (0.55 + 0.6*lum)
    return Image.fromarray(np.clip(arr*(1-mk) + red*mk, 0, 255).astype(np.uint8))
row1 = [(108, 548), (350, 540), (350, 547), (108, 556)]
row8 = [(1040, 497), (1222, 505), (1222, 512), (1040, 504)]
im = redrow(row1); im = redrow(row8)

# 3) '9 Мая' onto the screens: the stage display and the board on the left
scr = Image.open(os.path.join(BASE, 'tex/screen_9maya.png')).convert('RGB')
def put_screen(quad):
    w, h = scr.size
    M = cv2.getPerspectiveTransform(np.float32([(0, 0), (w, 0), (w, h), (0, h)]), np.float32(quad))
    warped = cv2.warpPerspective(np.asarray(scr), M, im.size)
    m = np.zeros(im.size[::-1], np.uint8); cv2.fillConvexPoly(m, np.int32(quad), 255)
    arr = np.asarray(im).copy(); arr[m > 0] = warped[m > 0]
    return Image.fromarray(arr)
im = put_screen([(644, 458), (738, 466), (738, 509), (644, 505)])   # stage display
im = put_screen([(143, 496), (207, 494), (207, 531), (143, 533)])   # left screen (hand-marked «9 мая»)

# 4) crop to the print and upscale
im = im.crop((40, 60, 1240, 900)); ox, oy = 40, 60
im = im.resize((im.width*K, im.height*K), Image.LANCZOS).convert('RGBA')
def P(x, y): return ((x-ox)*K, (y-oy)*K)
over = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(over)
def font(sz, b=True): return ImageFont.truetype(FB if b else FR, int(sz))
def tag(xy, text, f, fill, fg=WHITE, outline=None):
    pad = f.size*0.35
    b = d.textbbox(xy, text, font=f, anchor='mm')
    d.rounded_rectangle([b[0]-pad, b[1]-pad*0.7, b[2]+pad, b[3]+pad*0.7], radius=pad, fill=fill, outline=outline, width=3)
    d.text(xy, text, font=f, fill=fg, anchor='mm'); return b

SEATS = {1: '292 места (+32)', 2: '126 мест', 3: '126 мест', 4: '32 места', 5: '32 места',
         6: '126 мест', 7: '126 мест', 8: '292 места (+32)'}
DIMS = {1: '18 648 × 12 500 мм', 8: '18 648 × 12 500 мм', 2: '11 340 × 7 500 мм', 3: '11 340 × 7 500 мм',
        6: '11 340 × 7 500 мм', 7: '11 340 × 7 500 мм', 4: '9 550 × 2 610 мм', 5: '9 550 × 2 610 мм'}
# (badge above the stand, stand top point for the leader, dims tag below the stand)
T = {1: ((228, 505), (228, 548), (228, 606)), 2: ((428, 492), (428, 526), (428, 600)),
     3: ((526, 488), (526, 524), (526, 592)), 4: ((612, 492), (612, 522), (610, 588)),
     5: ((700, 448), (700, 508), (700, 580)), 6: ((786, 470), (786, 505), (786, 565)),
     7: ((894, 460), (894, 493), (894, 558)), 8: ((1131, 468), (1131, 500), (1131, 560))}
fn, fd = font(30), font(14)
for tid, (b, top, dim) in T.items():
    bx, by = P(*b); tx, ty = P(*top)
    d.line([(bx, by), (tx, ty)], fill=WHITE, width=4)
    r = 24
    d.ellipse([bx-r, by-r, bx+r, by+r], fill=RED, outline=WHITE, width=4)
    d.text((bx, by), str(tid), font=fn, fill=WHITE, anchor='mm')
    dx, dy = P(*dim)
    tag((dx, dy), SEATS[tid], fd, (24, 28, 36, 225))
    tag((dx, dy + 26), DIMS[tid], fd, (255, 255, 255, 235), fg=DARK)
# '+32 места' callouts
for poly, (cx, cy) in ((row1, (150, 470)), (row8, (1180, 440))):
    X, Y = P(cx, cy)
    b = tag((X, Y), '+32 места', font(22), RED, outline=WHITE)
    for px, py in (poly[0], poly[1]):
        mx, my = P(px + (8 if px == poly[0][0] else -8), py + 3)
        d.line([((b[0]+b[2])/2, b[3]+8), (mx, my)], fill=RED, width=4)
        d.ellipse([mx-6, my-6, mx+6, my+6], fill=RED, outline=WHITE, width=2)

im = Image.alpha_composite(im, over)
d = ImageDraw.Draw(im)
W, H = im.size
d.rectangle([0, 0, W, 64], fill=(24, 28, 36, 240))
d.text((24, 32), 'Рендер 1А (на фото площади). Вид на сторону памятника им. Ленина — трибуны № 1–8',
       font=font(30), fill=WHITE, anchor='lm')
# legend over the square
lw, lh = 700, 330; lx, ly = W//2 - lw//2, H - lh - 60
d.rounded_rectangle([lx, ly, lx+lw, ly+lh], radius=14, fill=(255, 255, 255, 240))
d.text((lx+20, ly+18), 'Трибуны: места и габариты (длина × ширина)', font=font(20), fill=DARK)
rows = list(SEATS.items()) + [(9, '120 мест')]
for i, (tid, seats) in enumerate(rows):
    y = ly + 56 + i*26
    d.ellipse([lx+20, y, lx+42, y+22], fill=RED); d.text((lx+31, y+11), str(tid), font=font(14), fill=WHITE, anchor='mm')
    d.text((lx+56, y+11), seats, font=font(18, False), fill=DARK, anchor='lm')
    d.text((lx+lw-20, y+11), DIMS.get(tid, '12 390 × 6 640 мм'), font=font(18, tid in (1, 8)), fill=DARK, anchor='rm')
y = ly + 56 + len(rows)*26 + 8
d.text((lx+20, y), 'Итого: 1 272 места', font=font(19), fill=DARK)
d.rectangle([lx+290, y+2, lx+312, y+22], fill=RED)
d.text((lx+322, y+12), 'верхний ряд трибун № 1 и № 8 — +32 места', font=font(16, False), fill=DARK, anchor='lm')
im.convert('RGB').save(os.path.join(BASE, 'out/render_1A_photo.jpg'), quality=92)
print('ok', im.size)
