from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
S = Image.open('ref/scheme_rot.png').convert('RGB')
def crop(box, name, size=None):
    im = S.crop(box)
    if size: im = im.resize(size, Image.LANCZOS)
    im.save(f'tex/{name}.png'); print(name, im.size)
crop((318, 228, 1000, 505), 'facade_red', (1364, 554))
crop((118, 300, 335, 520), 'facade_white_left', (434, 440))
crop((1028, 255, 1225, 505), 'facade_white_right', (394, 500))
crop((1090, 560, 1205, 640), 'pavilion_ref')
# Screen image "9 Мая"
W, H = 1920, 1080
img = Image.new('RGB', (W, H))
a = np.zeros((H, W, 3), np.float32)
yy, xx = np.mgrid[0:H, 0:W]
r = np.hypot((xx - W*0.5)/W, (yy - H*0.45)/H)
base = np.array([150, 12, 18], np.float32); dark = np.array([45, 0, 5], np.float32)
t = np.clip(r*1.6, 0, 1)[..., None]
a = base*(1-t) + dark*t
img = Image.fromarray(a.astype(np.uint8))
d = ImageDraw.Draw(img)
# St. George ribbon band at bottom
by = int(H*0.80); bh = int(H*0.12)
stripes = [(0,0,0),(255,140,0),(0,0,0),(255,140,0),(0,0,0)]
sh = bh//5
for i,c in enumerate(stripes): d.rectangle([0, by+i*sh, W, by+(i+1)*sh], fill=c)
F = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
f1 = ImageFont.truetype(F, 380); f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 96)
def ctext(y, s, f, fill, shadow=True):
    w = d.textlength(s, font=f); x = (W - w)/2
    if shadow: d.text((x+8, y+8), s, font=f, fill=(20,0,0))
    d.text((x, y), s, font=f, fill=fill)
ctext(170, '9 Мая', f1, (255, 205, 90))
ctext(620, 'С ДНЁМ ПОБЕДЫ!', f2, (255, 240, 220))
# star
import math
cx, cy, R = 250, 200, 110
pts = [(cx + (R if k%2==0 else R*0.4)*math.sin(k*math.pi/5), cy - (R if k%2==0 else R*0.4)*math.cos(k*math.pi/5)) for k in range(10)]
d.polygon(pts, fill=(255, 205, 90)); pts2=[(x+W-500, y) for x,y in pts]; d.polygon(pts2, fill=(255,205,90))
img.save('tex/screen_9maya.png')
