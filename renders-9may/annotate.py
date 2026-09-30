"""Overlay grandstand numbers (on top), dimensions, '+32 места' callouts, tribune 9 bounds and a legend."""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'out')
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
RED = (200, 22, 29); DARK = (24, 28, 36); WHITE = (255, 255, 255); ORANGE = (255, 150, 0)

SEATS = {1: '292 места (+32)', 2: '126 мест', 3: '126 мест', 4: '32 места', 5: '32 места',
         6: '126 мест', 7: '126 мест', 8: '292 места (+32)', 9: '120 мест'}
TITLES = {
    '1A': 'Рендер 1А. Вид на сторону памятника им. Ленина — трибуны № 1–8',
    '1B': 'Рендер 1Б. Вид сбоку в сторону ул. Пушкина — трибуна № 1 крупным планом',
    '1B_detail': 'Рендер 1Б (деталь). Трибуна № 1 — как она будет выглядеть',
    '2': 'Рендер 2. Вид сбоку в сторону ул. Пушкина — все трибуны и трибуна № 9 у магазина',
    '3': 'Рендер 3. Вид сбоку в сторону ул. Пушкина — общая схема расположения',
}
# which extras each view gets
DIMLINES = {'1A': [], '1B': [1], '1B_detail': [1], '2': [9], '3': [9]}
SHOW = {'1A': [1, 2, 3, 4, 5, 6, 7, 8], '1B_detail': [1], '1B': [1, 2, 3, 4, 5, 6, 7, 8, 9], '2': list(range(1, 10)), '3': list(range(1, 10))}

def mm(v): return f'{int(round(v*1000/10.0))*10:,}'.replace(',', ' ')

def dims_text(tid, t):
    if tid in (1, 8): return '18 648 × 12 500 мм'
    return f'{mm(t["L"])} × {mm(t["D"])} мм'

def font(sz, bold=True): return ImageFont.truetype(FB if bold else FR, int(sz))

def tag(d, xy, text, f, fill, fg=WHITE, pad=None, anchor='mm', outline=None):
    pad = pad or f.size*0.35
    x0, y0, x1, y1 = d.textbbox(xy, text, font=f, anchor=anchor)
    box = [x0-pad, y0-pad*0.7, x1+pad, y1+pad*0.7]
    d.rounded_rectangle(box, radius=pad, fill=fill, outline=outline, width=max(2, int(f.size*0.08)))
    d.text(xy, text, font=f, fill=fg, anchor=anchor)
    return box

def arrow_head(d, p, q, size, col):
    ang = math.atan2(q[1]-p[1], q[0]-p[0])
    for s in (1, -1):
        a = ang + math.pi + s*0.4
        d.line([q, (q[0]+size*math.cos(a), q[1]+size*math.sin(a))], fill=col, width=max(2, int(size*0.25)))

def dim_line(d, a, b, text, off, f, col=DARK, bg=(255, 255, 255, 235)):
    ax, ay = a[:2]; bx, by = b[:2]
    dx, dy = bx-ax, by-ay; L = math.hypot(dx, dy) or 1
    nx, ny = -dy/L*off, dx/L*off
    A, B = (ax+nx, ay+ny), (bx+nx, by+ny)
    w = max(2, int(f.size*0.12))
    d.line([a[:2], (A[0]+nx*0.15, A[1]+ny*0.15)], fill=col, width=max(1, w//2))
    d.line([b[:2], (B[0]+nx*0.15, B[1]+ny*0.15)], fill=col, width=max(1, w//2))
    d.line([A, B], fill=col, width=w)
    arrow_head(d, B, A, f.size*0.7, col); arrow_head(d, A, B, f.size*0.7, col)
    mid = ((A[0]+B[0])/2, (A[1]+B[1])/2)
    ang = -math.degrees(math.atan2(dy, dx))
    if ang > 90: ang -= 180
    if ang < -90: ang += 180
    # rotated label
    tw = int(d.textlength(text, font=f)) + int(f.size)
    th = int(f.size*1.7)
    lab = Image.new('RGBA', (tw, th), (0, 0, 0, 0)); ld = ImageDraw.Draw(lab)
    ld.rounded_rectangle([0, 0, tw-1, th-1], radius=th//3, fill=bg)
    ld.text((tw/2, th/2), text, font=f, fill=col, anchor='mm')
    lab = lab.rotate(ang, expand=True, resample=Image.BICUBIC)
    return lab, (int(mid[0]-lab.width/2), int(mid[1]-lab.height/2))

def annotate(view):
    raw = Image.open(os.path.join(OUT, f'raw_{view}.png')).convert('RGBA')
    ann = json.load(open(os.path.join(OUT, f'ann_{view}.json')))
    W, H = ann['res']
    if raw.size != (W, H): raw = raw.resize((W, H), Image.LANCZOS)
    s = W / 2560
    over = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(over)
    pastes = []
    T = {int(k): v for k, v in ann['tribunes'].items()}
    f_num = font(40*s); f_dim = font(21*s); f_small = font(19*s, False); f_dl = font(24*s)
    if view == '1A': f_num = font(34*s); f_dim = font(17*s)

    # tribune 9 boundary + dimension lines
    if 9 in SHOW[view] and 'boundary' in T[9]:
        bd = T[9]['boundary']
        if all(p[2] > 0 for p in bd):
            pts = [tuple(p[:2]) for p in bd]
            d.polygon(pts, fill=(255, 30, 30, 45))
            lab = 'ГРАНИЦЫ ТРИБУНЫ № 9'
            cx = sum(p[0] for p in pts)/4; cy = max(p[1] for p in pts)
            tag(d, (cx, cy + 34*s), lab, font(22*s), RED)
    # dimension lines (close-ups)
    for tid in DIMLINES[view]:
        t = T[tid]
        a, b = t['top_back']
        if tid in (1, 8):
            lt, dt = '18 648 мм', '12 500 мм'
        else:
            lt, dt = f'{mm(t["L"])} мм', f'{mm(t["D"])} мм'
        side = t['ground_side_l'] if tid != 9 else t['ground_side_r']
        if tid == 9:
            bd = t['boundary']; a, b = bd[0], bd[1]; side = [bd[1], bd[2]]
            a, b = t['ground_front']; side = t['ground_side_l']
        pastes.append(dim_line(d, a, b, 'длина ' + lt, -60*s, f_dl, RED))
        pastes.append(dim_line(d, side[0], side[1], 'ширина ' + dt, 60*s if tid != 9 else -60*s, f_dl, RED))

    # badges on top + dimension tags (nearest/largest first, pushed up if they collide)
    placed = []
    def free(b): return all(b[2] < q[0] or b[0] > q[2] or b[3] < q[1] or b[1] > q[3] for q in placed)
    def plen(t):
        a, b = t['top_back']; return math.hypot(a[0]-b[0], a[1]-b[1])
    for tid in sorted(SHOW[view], key=lambda k: -plen(T[k])):
        t = T[tid]; bx, by, bz = t['badge']
        if bz <= 0 or not (-50 < bx < W+50): continue
        r = f_num.size*0.85
        if plen(t) < 120*s: r *= 0.75
        y = by; n = 0
        while not free([bx-r-4, y-r-4, bx+r+4, y+r+4]) and n < 40: y -= r*0.5; n += 1
        tb = t['top_back']; ty = (tb[0][1]+tb[1][1])/2
        d.line([(bx, y+r), (bx, max(y+r, ty - 6*s))], fill=WHITE, width=max(2, int(3*s)))
        d.ellipse([bx-r, y-r, bx+r, y+r], fill=RED, outline=WHITE, width=max(3, int(r*0.12)))
        d.text((bx, y), str(tid), font=font(r/0.85), fill=WHITE, anchor='mm')
        placed.append([bx-r, y-r, bx+r, y+r])
        if view == '1A':
            g = t['ground_front']; gx = (g[0][0]+g[1][0])/2; gy = max(g[0][1], g[1][1]) + 30*s
            tag(d, (gx, gy), SEATS[tid], f_dim, (24, 28, 36, 225))
            tag(d, (gx, gy + f_dim.size*1.7), dims_text(tid, t), f_dim, (255, 255, 255, 235), fg=DARK)
        elif plen(t) > 170*s:
            for text, fill, fg, dy in ((dims_text(tid, t), (255, 255, 255, 235), DARK, 1.25), (SEATS[tid], (24, 28, 36, 225), WHITE, 2.95)):
                xy = (bx, y - r - f_dim.size*dy)
                bb = d.textbbox(xy, text, font=f_dim, anchor='mm')
                bb = [bb[0]-8*s, bb[1]-6*s, bb[2]+8*s, bb[3]+6*s]
                if free(bb):
                    tag(d, xy, text, f_dim, fill, fg=fg); placed.append(bb)

    # '+32 места' callouts on 1 and 8 (top row fully red)
    for tid in (1, 8):
        if tid not in SHOW[view]: continue
        t = T[tid]
        p1, p2 = t['top_row']
        if p1[2] <= 0: continue
        bx, by = t['badge'][:2]
        side = -1 if tid == 1 else 1
        if view == '1B' and tid == 1: side = -1
        fx = max(p1[0], p2[0]) + 150*s if side > 0 else min(p1[0], p2[0]) - 150*s
        fy = min(p1[1], p2[1]) - 25*s
        if view == '1A':
            fx = (p1[0]+p2[0])/2 + side*60*s; fy = t['badge'][1] - 150*s
        fp = font(28*s if view != '1A' else 22*s)
        box = tag(d, (fx, fy), '+32 места', fp, RED, outline=WHITE)
        ex = box[0] if side > 0 else box[2]
        for p in (p1, p2):
            d.line([(ex, fy), (p[0], p[1])], fill=RED, width=max(3, int(4*s)))
            d.ellipse([p[0]-7*s, p[1]-7*s, p[0]+7*s, p[1]+7*s], fill=RED, outline=WHITE, width=2)

    img = Image.alpha_composite(raw, over)
    for lab, pos in pastes: img.alpha_composite(lab, dest=(max(0, pos[0]), max(0, pos[1])))

    # title bar + legend
    d = ImageDraw.Draw(img)
    ft = font(34*s); d.rectangle([0, 0, W, int(64*s)], fill=(24, 28, 36, 235))
    d.text((int(28*s), int(32*s)), TITLES[view], font=ft, fill=WHITE, anchor='lm')
    d.text((W-int(28*s), int(32*s)), 'Площадь им. Ленина, Хабаровск · 9 Мая', font=font(24*s, False), fill=(210, 214, 220), anchor='rm')
    rows = [(tid, SEATS[tid], dims_text(tid, T[tid])) for tid in range(1, 10)]
    lf = font(19*s, False); lb = font(19*s)
    lw, lh = int(640*s), int((len(rows)+3.6)*27*s)
    lx, ly = W - lw - int(24*s), H - lh - int(24*s)
    d.rounded_rectangle([lx, ly, lx+lw, ly+lh], radius=int(14*s), fill=(255, 255, 255, 235))
    d.text((lx+int(18*s), ly+int(16*s)), 'Трибуны: места и габариты (длина × ширина)', font=lb, fill=DARK)
    for i, (tid, seats, dims) in enumerate(rows):
        yy = ly + int((48 + i*27)*s)
        d.ellipse([lx+int(18*s), yy, lx+int(40*s), yy+int(22*s)], fill=RED)
        d.text((lx+int(29*s), yy+int(11*s)), str(tid), font=font(14*s), fill=WHITE, anchor='mm')
        d.text((lx+int(52*s), yy+int(11*s)), seats, font=lf, fill=DARK, anchor='lm')
        d.text((lx+lw-int(18*s), yy+int(11*s)), dims, font=lb if tid in (1, 8) else lf, fill=DARK, anchor='rm')
    yy = ly + int((48 + len(rows)*27 + 6)*s)
    d.text((lx+int(18*s), yy), 'Итого: 1 272 места', font=lb, fill=DARK)
    d.rectangle([lx+int(250*s), yy+int(2*s), lx+int(272*s), yy+int(20*s)], fill=RED)
    d.text((lx+int(280*s), yy+int(11*s)), 'верхний ряд № 1 и № 8 — +32 места', font=font(16*s, False), fill=DARK, anchor='lm')
    img.convert('RGB').save(os.path.join(OUT, f'render_{view}.jpg'), quality=92)
    print('annotated', view)

for v in (sys.argv[1:] or ['1A', '1B', '1B_detail', '2', '3']):
    if os.path.exists(os.path.join(OUT, f'raw_{v}.png')): annotate(v)
