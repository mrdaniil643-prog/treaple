"""Finish the tribune-9 photomontage: composite + bounds, dimensions, number and title."""
import json, os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from annotate import font, tag, dim_line, mm, RED, DARK, WHITE

BASE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(BASE, 'out')
shot = sys.argv[1] if len(sys.argv) > 1 else 't9_b'
PHOTO = {'t9_b': 'ref/photo_t9_b.jpg'}[shot]
ann = json.load(open(os.path.join(OUT, f'comp_ann_{shot}.json')))
W, H = ann['res']
ph = Image.open(os.path.join(BASE, PHOTO)).convert('RGBA').resize((W, H), Image.LANCZOS)
ov = Image.open(os.path.join(OUT, f'comp_raw_{shot}.png')).convert('RGBA')
img = Image.alpha_composite(ph, ov)
s = W/2560
layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
def dashed(poly):
  for i in range(len(poly)):
    a, b = poly[i], poly[(i+1) % len(poly)]; n = 30
    for k in range(0, n, 2):
        p = (a[0]+(b[0]-a[0])*k/n, a[1]+(b[1]-a[1])*k/n); q = (a[0]+(b[0]-a[0])*(k+1)/n, a[1]+(b[1]-a[1])*(k+1)/n)
        d.line([p, q], fill=(255, 40, 40, 255), width=int(7*s))
blk = [tuple(p[:2]) for p in ann['block']]; st = [tuple(p[:2]) for p in ann['stairfp']]
d.polygon(blk, fill=(255, 30, 30, 38)); d.polygon(st, fill=(255, 30, 30, 38))
dashed(blk); dashed(st)
pastes = [dim_line(d, ann['block_front'][0], ann['block_front'][1], f'длина {mm(ann["L"])} мм', 70*s, font(30*s), RED),
          dim_line(d, ann['ground_side_l'][0], ann['ground_side_l'][1], f'ширина {mm(ann["D"])} мм', -70*s, font(30*s), RED)]
img = Image.alpha_composite(img, layer)
for lab, pos in pastes: img.alpha_composite(lab, dest=(max(0, pos[0]), max(0, pos[1])))
d = ImageDraw.Draw(img)
bx, by = ann['badge'][:2]; by = max(by, 200*s); r = 44*s
tb = ann['top_back']; d.line([(bx, by), ((tb[0][0]+tb[1][0])/2, (tb[0][1]+tb[1][1])/2)], fill=WHITE, width=int(5*s))
d.ellipse([bx-r, by-r, bx+r, by+r], fill=RED, outline=WHITE, width=int(6*s))
d.text((bx, by), '9', font=font(52*s), fill=WHITE, anchor='mm')
tag(d, (bx, by - r - 40*s), '120 мест · 12 390 × 6 640 мм', font(30*s), (255, 255, 255, 240), fg=DARK)
d.rectangle([0, 0, W, int(84*s)], fill=(24, 28, 36, 240))
d.text((int(30*s), int(42*s)), 'Трибуна № 9 у магазина «Территория спорта» — фотомонтаж на месте установки',
       font=font(40*s), fill=WHITE, anchor='lm')
note = ('Красный пунктир — границы трибуны: торец по линии рулетки (от ограждения у павильона до точки на дороге). '
        'Положение и масштаб примерные, по фото.')
fn = font(24*s, False); tw = d.textlength(note, font=fn)
d.rounded_rectangle([int(24*s), H-int(84*s), int(24*s)+tw+int(36*s), H-int(28*s)], radius=int(12*s), fill=(255, 255, 255, 235))
d.text((int(42*s), H-int(56*s)), note, font=fn, fill=DARK, anchor='lm')
img.convert('RGB').save(os.path.join(OUT, f'render_2_photo_{shot}.jpg'), quality=92)
print('ok')
