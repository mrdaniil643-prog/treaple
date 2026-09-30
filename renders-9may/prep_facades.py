from PIL import Image, ImageDraw, ImageFont
import random
random.seed(1)
PX = 40  # pixels per meter

def red_facade(w_m=12.0, h_m=18.0, floors=4, bays=4):
    W, H = int(w_m*PX), int(h_m*PX)
    im = Image.new('RGB', (W, H), (176, 92, 64)); d = ImageDraw.Draw(im)
    # brick noise
    for y in range(0, H, 6):
        off = 0 if (y//6) % 2 == 0 else 8
        for x in range(-off, W, 16):
            c = random.randint(-10, 10)
            d.rectangle([x, y, x+14, y+4], fill=(176+c, 92+c//2, 64+c//3))
    trim = (224, 170, 120)
    fh = (h_m - 2.0) / floors
    d.rectangle([0, 0, W, int(0.9*PX)], fill=trim)                 # cornice
    d.rectangle([0, H-int(1.2*PX), W, H], fill=(140, 70, 50))      # plinth
    for f in range(floors):
        top = int((0.9 + f*fh)*PX)
        d.rectangle([0, top+int((fh-0.25)*PX), W, top+int(fh*PX)], fill=trim)  # floor band
        for b in range(bays):
            cx = int((b+0.5)*w_m/bays*PX); ww = int(1.3*PX); wh = int(2.1*PX)
            y0 = top + int(0.8*PX)
            d.rectangle([cx-ww//2-6, y0-6, cx+ww//2+6, y0+wh+10], fill=trim)
            d.rectangle([cx-ww//2, y0, cx+ww//2, y0+wh], fill=(40, 48, 58))
            d.line([cx, y0, cx, y0+wh], fill=(210, 200, 190), width=3)
            d.line([cx-ww//2, y0+wh//3, cx+ww//2, y0+wh//3], fill=(210, 200, 190), width=3)
            if f == floors-1:
                d.pieslice([cx-ww//2-6, y0-ww//2-6, cx+ww//2+6, y0+ww//2+6], 180, 360, fill=trim)
                d.pieslice([cx-ww//2, y0-ww//2, cx+ww//2, y0+ww//2], 180, 360, fill=(40, 48, 58))
        # pilasters
    for b in range(bays+1):
        x = int(b*w_m/bays*PX)
        d.rectangle([x-8, int(0.9*PX), x+8, H-int(1.2*PX)], fill=(160, 80, 56))
    return im

def white_facade(w_m=12.0, h_m=24.0, floors=7, bays=4, base=(226, 218, 204)):
    W, H = int(w_m*PX), int(h_m*PX)
    im = Image.new('RGB', (W, H), base); d = ImageDraw.Draw(im)
    fh = (h_m - 1.5) / floors
    d.rectangle([0, 0, W, int(0.8*PX)], fill=(200, 192, 178))
    for f in range(floors):
        top = int((0.8 + f*fh)*PX)
        for b in range(bays):
            cx = int((b+0.5)*w_m/bays*PX); ww = int(1.4*PX); wh = int(1.8*PX)
            y0 = top + int(0.7*PX)
            d.rectangle([cx-ww//2-5, y0-5, cx+ww//2+5, y0+wh+8], fill=(245, 242, 235))
            d.rectangle([cx-ww//2, y0, cx+ww//2, y0+wh], fill=(52, 62, 74))
            d.line([cx, y0, cx, y0+wh], fill=(235, 235, 235), width=3)
        if f == floors-1:
            d.rectangle([0, top+int(fh*PX)-6, W, top+int(fh*PX)], fill=(190, 182, 168))
    d.rectangle([0, H-int(4.0*PX), W, H-int(3.8*PX)], fill=(170, 160, 150))
    return im

def pavilion_front(w_m=12.0, h_m=4.5, title='ТЕРРИТОРИЯ СПОРТА'):
    W, H = int(w_m*PX), int(h_m*PX)
    im = Image.new('RGB', (W, H), (62, 64, 66)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, int(0.7*PX)], fill=(48, 50, 52))
    for i in range(0, W, int(0.9*PX)): d.line([i, int(0.7*PX), i, H], fill=(52, 54, 56), width=3)
    # corten panel block
    x0, x1 = int(0.45*W), int(0.8*W)
    for y in range(int(0.9*PX), H, int(0.55*PX)):
        for x in range(x0, x1, int(0.6*PX)):
            c = random.randint(-18, 18)
            d.rectangle([x+2, y+2, x+int(0.6*PX)-2, y+int(0.55*PX)-2], fill=(150+c, 78+c//2, 40+c//3))
    # door and vertical sign
    d.rectangle([int(0.12*W), int(1.4*PX), int(0.2*W), H], fill=(40, 42, 44))
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
    d.text((int(0.03*W), int(0.18*PX)), 'Хабаровский край', font=f, fill=(235, 235, 235))
    s = Image.new('RGBA', (int(3.4*PX), int(0.6*PX)), (30, 30, 32, 255)); ds = ImageDraw.Draw(s)
    ds.text((10, 2), title, font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 12), fill=(240, 240, 240))
    s = s.rotate(90, expand=True); im.paste(s, (int(0.33*W), int(0.9*PX)))
    return im

red_facade().save('tex/fac_red.png')
red_facade(w_m=12, h_m=21, floors=4, bays=3).save('tex/fac_red_center.png')
white_facade().save('tex/fac_white7.png')
white_facade(h_m=20, floors=6, base=(236, 226, 214)).save('tex/fac_white6.png')
pavilion_front().save('tex/pavilion_front.png')
print('ok')
