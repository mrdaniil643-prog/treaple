import math
W, H = 1280, 960
def ground(u, v, f_mm=13.0, sw=34.6, h=1.6, horizon=445):
    fx = f_mm/sw*W; cx, cy = W/2, H/2
    a = math.atan((cy-horizon)/fx)          # camera pitched down by a
    xc, yc = (u-cx)/fx, (v-cy)/fx
    # world: X right, Y forward, Z up
    fwd = (0, math.cos(a), -math.sin(a)); up = (0, math.sin(a), math.cos(a))
    d = [xc*1 + 0, -yc*up[1] + fwd[1], -yc*up[2] + fwd[2]]
    t = h/(-d[2]); return (d[0]*t, d[1]*t)
def dist(p, q): return math.hypot(p[0]-q[0], p[1]-q[1])
import sys
for f in (13.0, 14.0, 15.5):
    P = {k: ground(*v, f_mm=f) for k, v in dict(barrier=(320, 578), reel=(1085, 838), wheelF=(882, 532), wheelR=(978, 516),
         pav_l=(430, 545), pav_m=(565, 522), pav_r=(790, 492)).items()}
    print(f, 'tape', round(dist(P['barrier'], P['reel']), 2), 'wheelbase', round(dist(P['wheelF'], P['wheelR']), 2),
          'pav left face', round(dist(P['pav_l'], P['pav_m']), 2), 'pav front', round(dist(P['pav_m'], P['pav_r']), 2),
          {k: tuple(round(c, 2) for c in v) for k, v in P.items()})
