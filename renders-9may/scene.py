"""Lenin Square (Khabarovsk) grandstands for 9 May: scene build + render.

Run: blender -b --python scene.py -- [view ...] [--samples N] [--scale PCT]
World axes: X along the parade road (left -> right as seen from the square),
Y away from the square (grandstands 1-8 face -Y), Z up. Units: metres.
"""
import bpy, bmesh, math, json, os, random, sys
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

BASE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(BASE, 'tex')
OUT = os.path.join(BASE, 'out')
os.makedirs(OUT, exist_ok=True)
random.seed(7)

# ---------------------------------------------------------------- materials
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(x/12.92 if x <= 0.04045 else ((x+0.055)/1.055)**2.4 for x in c)

MATS = {}
def mat(name, hexcol, rough=0.6, metal=0.0, emit=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*lin(hexcol), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (*lin(hexcol), 1)
        p.inputs['Emission Strength'].default_value = emit
    MATS[name] = m
    return m

def img_mat(name, fname, emit=0.0, rough=0.85, repeat=None):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(TEX, fname))
    t.extension = 'REPEAT'
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    if emit:
        nt.links.new(t.outputs['Color'], p.inputs['Emission Color'])
        p.inputs['Emission Strength'].default_value = emit
    MATS[name] = m
    return m

def tiles_mat(name, c1, c2, mortar, scale, rough=0.8, noise=0.15):
    """Paving via Brick Texture in object space (scale = tiles per metre)."""
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    b = nt.nodes.new('ShaderNodeTexBrick')
    b.inputs['Color1'].default_value = (*lin(c1), 1)
    b.inputs['Color2'].default_value = (*lin(c2), 1)
    b.inputs['Mortar'].default_value = (*lin(mortar), 1)
    b.inputs['Scale'].default_value = scale
    b.inputs['Mortar Size'].default_value = 0.012
    b.inputs['Brick Width'].default_value = 0.5
    b.inputs['Row Height'].default_value = 0.25
    nt.links.new(tc.outputs['Object'], b.inputs['Vector'])
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 0.35
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = noise
    nt.links.new(b.outputs['Color'], mix.inputs['A']); nt.links.new(n.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    MATS[name] = m
    return m

def asphalt_mat():
    if 'asphalt' in MATS: return MATS['asphalt']
    m = bpy.data.materials.new('asphalt'); m.use_nodes = True; nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 0.6; n.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].color = (*lin('#4a4c50'), 1); r.color_ramp.elements[1].color = (*lin('#63656a'), 1)
    nt.links.new(n.outputs['Fac'], r.inputs['Fac']); nt.links.new(r.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.9
    MATS['asphalt'] = m
    return m

# ---------------------------------------------------------------- geometry
class MB:
    """Accumulates boxes/cylinders per material into single meshes."""
    def __init__(self, name):
        self.name = name; self.bms = {}
    def _bm(self, m):
        return self.bms.setdefault(m, bmesh.new())
    def box(self, m, c, size, rot=None):
        M = Matrix.Translation(Vector(c))
        if rot is not None: M = M @ rot
        M = M @ Matrix.Diagonal((*size, 1))
        bmesh.ops.create_cube(self._bm(m), size=1.0, matrix=M)
    def box2(self, m, lo, hi):
        lo, hi = Vector(lo), Vector(hi)
        self.box(m, (lo+hi)/2, hi-lo)
    def cyl(self, m, c, r1, r2, h, seg=12):
        M = Matrix.Translation(Vector(c) + Vector((0, 0, h/2)))
        bmesh.ops.create_cone(self._bm(m), cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h, matrix=M)
    def sphere(self, m, c, r):
        bmesh.ops.create_uvsphere(self._bm(m), u_segments=16, v_segments=8, radius=r, matrix=Matrix.Translation(Vector(c)))
    def tube(self, m, a, b, t=0.05):
        a, b = Vector(a), Vector(b); d = b-a
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        self.box(m, (a+b)/2, (t, t, d.length), rot)
    def build(self, loc=(0, 0, 0), rot_z=0.0, smooth=False):
        objs = []
        for mname, bm in self.bms.items():
            me = bpy.data.meshes.new(f'{self.name}_{mname}'); bm.to_mesh(me); bm.free()
            ob = bpy.data.objects.new(f'{self.name}_{mname}', me)
            bpy.context.collection.objects.link(ob)
            me.materials.append(MATS[mname])
            ob.location = loc; ob.rotation_euler = (0, 0, rot_z)
            objs.append(ob)
        self.bms = {}
        return objs

def plane(name, m, lo, hi, z=0.0, uv_scale=None):
    """Horizontal rectangle (x0,y0)-(x1,y1) at height z."""
    me = bpy.data.meshes.new(name)
    (x0, y0), (x1, y1) = lo, hi
    me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(MATS[m]); return ob

def facade(name, m, p0, p1, z0, z1, tile_w, tile_h):
    """Vertical textured quad from p0 to p1 (xy) between z0..z1, outward normal to the left of p0->p1."""
    me = bpy.data.meshes.new(name)
    (x0, y0), (x1, y1) = p0, p1
    me.from_pydata([(x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1)], [], [(0, 1, 2, 3)])
    w = math.hypot(x1-x0, y1-y0); uv = me.uv_layers.new()
    u1, v1 = w/tile_w, (z1-z0)/tile_h
    for i, co in enumerate([(0, 0), (u1, 0), (u1, v1), (0, v1)]): uv.data[i].uv = co
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(MATS[m]); return ob

# ---------------------------------------------------------------- grandstand
SEAT_W = (18.648 - 1.95) / 32   # 0.5218 m: 16 seats per half + 1950 aisle = 18 648 (drawing)
ROW_D = 8.573 / 10               # 857 mm per row (drawing)
RISE = 1.5 / 9                   # rows 1.203 -> 2.703 m (drawing)
STAIR_D = 1.943

TRIBUNES = {}   # id -> info for annotations

def tribune(tid, x0, y_front, rows, per_side, h0, aisle=1.95, facing=-1, row_colors=None,
            top_red=False, skirt=True, label=None, place=None):
    """Build a grandstand. Local frame: x 0..L, y 0 (front) .. D (back), stair at y<0."""
    mat('seat_blue', '#1f5fb8', 0.35); mat('seat_red', '#c8161d', 0.35); mat('seat_white', '#f2f2f2', 0.35)
    mat('deck', '#8d949b', 0.7, 0.2); mat('steel', '#b9bec4', 0.35, 0.8); mat('stair', '#b8743f', 0.7)
    mat('skirt', '#172a4d', 0.9); mat('yellow', '#f2c21b', 0.5); mat('rail', '#d7dadd', 0.3, 0.9)
    L = 2*per_side*SEAT_W + aisle
    D = rows*ROW_D
    h = [h0 + i*RISE for i in range(rows)]
    top = h[-1]
    mb = MB(f'T{tid}')
    ax0, ax1 = per_side*SEAT_W, per_side*SEAT_W + aisle
    # decks + risers + yellow nosing in aisle
    for i in range(rows):
        y0, y1 = i*ROW_D, (i+1)*ROW_D
        mb.box2('deck', (0, y0, h[i]-0.06), (L, y1, h[i]))
        lo = h[i-1] if i else h[0]-0.35
        mb.box2('deck', (0, y0-0.015, lo), (L, y0+0.015, h[i]))
        mb.box2('yellow', (ax0, y0-0.02, h[i]-0.03), (ax1, y0+0.05, h[i]+0.004))
    # seats
    def row_color(i):
        if top_red and i == rows-1: return 'seat_red'
        return (row_colors[i] if row_colors else 'seat_blue')
    for i in range(rows):
        c = row_color(i)
        for side_x in (0.0, ax1):
            for j in range(per_side):
                x = side_x + (j+0.5)*SEAT_W; y = i*ROW_D + 0.42; z = h[i]
                mb.box('steel', (x, y+0.05, z+0.18), (0.08, 0.22, 0.36))
                mb.box(c, (x, y, z+0.40), (0.44, 0.40, 0.06))
                rot = Matrix.Rotation(math.radians(-12), 4, 'X')
                mb.box(c, (x, y+0.22, z+0.64), (0.44, 0.05, 0.40), rot)
    # scaffold under the decks
    nbx = max(2, round(L/2.07)); xs = [L*k/nbx for k in range(nbx+1)]
    ys = [min(D, k*2*ROW_D) for k in range(int(math.ceil(D/(2*ROW_D)))+1)]
    if ys[-1] < D: ys.append(D)
    def deck_h(y): return h[min(rows-1, max(0, int(y/ROW_D - 1e-6)))]
    for y in ys:
        hy = deck_h(y) - 0.06
        for x in xs:
            mb.box2('steel', (x-0.025, y-0.025, 0), (x+0.025, y+0.025, hy))
            mb.box2('steel', (x-0.08, y-0.08, 0), (x+0.08, y+0.08, 0.01))
        for zz in (0.25, hy*0.6):
            mb.box2('steel', (0, y-0.02, zz-0.02), (L, y+0.02, zz+0.02))
    for x in xs:
        for zz in (0.25,):
            mb.box2('steel', (x-0.02, 0, zz-0.02), (x+0.02, D, zz+0.02))
    # diagonal bracing on back face and both ends
    for k in range(nbx):
        if k % 2 == 0:
            mb.tube('steel', (xs[k], D, 0.25), (xs[k+1], D, top-0.1), 0.045)
    for x in (0.0, L):
        for a, b in zip(ys[:-1], ys[1:]):
            mb.tube('steel', (x, a, 0.25), (x, b, deck_h(b)-0.1), 0.045)
    # railings: back, ends (sloped), front (with aisle gap)
    rh = 1.1
    for x in xs:
        mb.box2('rail', (x-0.025, D-0.05, top), (x+0.025, D, top+rh))
    for zz in (rh/2, rh):
        mb.box2('rail', (0, D-0.05, top+zz-0.025), (L, D, top+zz+0.025))
    for x in (0.02, L-0.02):
        for zz in (rh/2, rh):
            mb.tube('rail', (x, 0.0, h[0]+zz), (x, D, top+zz), 0.05)
        for i in range(0, rows, 2):
            mb.box2('rail', (x-0.025, i*ROW_D, h[i]), (x+0.025, i*ROW_D+0.05, h[i]+rh))
    for xa, xb in ((0, ax0), (ax1, L)):
        for zz in (0.45, 0.9):
            mb.box2('rail', (xa, -0.04, h[0]+zz-0.02), (xb, 0.0, h[0]+zz+0.02))
    # skirt on the front below the first row
    if skirt:
        for xa, xb in ((0, ax0), (ax1, L)):
            mb.box2('skirt', (xa, -0.06, 0), (xb, -0.03, h[0]-0.06))
    # front stair from the ground up to the first row
    nst = max(2, int(math.ceil(h0/0.18))); sd = STAIR_D if h0 > 1.0 else max(0.9, nst*0.3)
    for s in range(nst):
        zt = h0*(s+1)/nst; yb = -sd + s*sd/nst
        mb.box2('stair', (ax0+0.05, yb, zt-0.05), (ax1-0.05, 0.0, zt))
    for x in (ax0+0.04, ax1-0.04):
        mb.tube('rail', (x, -sd, 0.95), (x, 0, h0+0.95), 0.045)
        mb.box2('rail', (x-0.02, -sd, 0), (x+0.02, -sd+0.04, 0.95))
    # place
    if place:
        loc, rz = place(L, D, sd)
    elif facing == -1:
        loc, rz = (x0, y_front, 0), 0.0
    else:
        loc, rz = (x0 + L, y_front, 0), math.pi
    mb.build(loc, rz)
    cz, sz = math.cos(rz), math.sin(rz)
    def W(p):  # local -> world
        x, y, z = p
        return (loc[0] + x*cz - y*sz, loc[1] + x*sz + y*cz, z)
    TRIBUNES[tid] = dict(
        id=tid, L=L, D=D + sd, rows=rows, seats=rows*per_side*2, label=label,
        badge=W((L/2, D*0.55, top + rh + 3.2)),
        top_back=[W((0, D, top+rh)), W((L, D, top+rh))],
        ground_front=[W((0, -sd, 0)), W((L, -sd, 0))],
        ground_side_l=[W((0, -sd, 0)), W((0, D, 0))],
        ground_side_r=[W((L, -sd, 0)), W((L, D, 0))],
        top_row=[W((per_side*SEAT_W/2, D-ROW_D/2, top+0.7)), W((ax1 + per_side*SEAT_W/2, D-ROW_D/2, top+0.7))],
        footprint=[W((0, -sd, 0)), W((L, -sd, 0)), W((L, D, 0)), W((0, D, 0))],
        height=top + rh,
    )
    return L

# ---------------------------------------------------------------- props
def fir(mb, x, y, hgt):
    mb.cyl('bark', (x, y, 0), 0.25, 0.2, hgt*0.3, 8)
    n = 9; m = random.choice(('fir', 'fir2'))
    for k in range(n):
        zb = hgt*(0.1 + 0.095*k); r = (hgt*0.2)*(1 - k/(n+0.5)) * random.uniform(0.9, 1.1)
        mb.cyl(m, (x + random.uniform(-0.15, 0.15), y + random.uniform(-0.15, 0.15), zb), r, r*0.1, hgt*0.2, 18)

def leafy(mb, x, y, hgt):
    mb.cyl('bark', (x, y, 0), 0.25, 0.18, hgt*0.55, 8)
    for dx, dy, dz, r in ((0, 0, 0.72, 0.3), (0.12, 0.1, 0.62, 0.24), (-0.14, -0.05, 0.64, 0.22)):
        mb.sphere('leaf', (x+dx*hgt, y+dy*hgt, hgt*dz), r*hgt)

def lamp(mb, x, y):
    mb.cyl('lampmetal', (x, y, 0), 0.22, 0.12, 1.2, 10)
    mb.cyl('lampmetal', (x, y, 1.2), 0.1, 0.07, 6.3, 10)
    for a in range(4):
        dx, dy = 0.7*math.cos(a*math.pi/2 + 0.6), 0.7*math.sin(a*math.pi/2 + 0.6)
        mb.tube('lampmetal', (x, y, 6.6), (x+dx, y+dy, 6.9), 0.05)
        mb.sphere('globe', (x+dx, y+dy, 7.1), 0.22)
    mb.sphere('globe', (x, y, 7.8), 0.26)

def screen(name, xc, y, width, height, bottom, facing=-1):
    img_mat('screen', 'screen_9maya.png', emit=1.6, rough=0.3)
    mat('frame', '#1b1c1e', 0.6, 0.3); mat('truss', '#a8adb3', 0.35, 0.9)
    mb = MB(name)
    mb.box('frame', (0, 0.15, bottom + height/2), (width+0.3, 0.25, height+0.3))
    for sx in (-width/2+0.4, width/2-0.4):
        for dy in (0.05, 0.6):
            mb.box2('truss', (sx-0.15+0, dy-0.03, 0), (sx+0.15, dy+0.03, bottom))
        mb.box2('truss', (sx-0.4, -0.3, 0), (sx+0.4, 1.0, 0.08))
        for z in range(0, int(bottom), 1):
            mb.tube('truss', (sx, 0.05, z), (sx, 0.6, z+1), 0.03)
    objs = mb.build((xc, y, 0), 0.0 if facing == -1 else math.pi)
    # emissive image plane on the front face
    me = bpy.data.meshes.new(name+'_img')
    x0, x1, z0, z1 = -width/2, width/2, bottom, bottom+height
    me.from_pydata([(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for i, co in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[i].uv = co
    ob = bpy.data.objects.new(name+'_img', me); bpy.context.collection.objects.link(ob)
    me.materials.append(MATS['screen'])
    ob.location = (xc, y - 0.02, 0); ob.rotation_euler = (0, 0, 0 if facing == -1 else math.pi)
    return dict(center=(xc, y, bottom+height/2), top=(xc, y, bottom+height+0.5))

def pavilion(name, x0, y0, w, d, hgt, front_img=True):
    mat('pav', '#3c3e41', 0.6); img_mat('pavfront', 'pavilion_front.png', rough=0.7)
    mb = MB(name)
    mb.box2('pav', (x0, y0, 0), (x0+w, y0+d, hgt))
    mb.box2('pav', (x0-0.3, y0-0.3, hgt), (x0+w+0.3, y0+d+0.3, hgt+0.45))
    mb.build()
    # front (faces +Y toward the road) and the side facing +X
    facade(name+'_front', 'pavfront', (x0+w, y0+d+0.02), (x0, y0+d+0.02), 0, hgt, w, hgt)
    facade(name+'_side', 'pavfront', (x0+w+0.02, y0), (x0+w+0.02, y0+d), 0, hgt, w, hgt)
    facade(name+'_side2', 'pavfront', (x0-0.02, y0+d), (x0-0.02, y0), 0, hgt, w, hgt)
    facade(name+'_back', 'pavfront', (x0, y0-0.02), (x0+w, y0-0.02), 0, hgt, w, hgt)

def building(name, x0, x1, y0, y1, hgt, fac, tile_w, tile_h, roof=None, roof_h=3.0, body='#b05c40'):
    mat(name+'_body', body, 0.8)
    mb = MB(name)
    mb.box2(name+'_body', (x0, y0, 0), (x1, y1, hgt))
    if roof:
        mat(roof, '#a0534f' if roof == 'roof_red' else '#8c8f93', 0.5, 0.3)
    mb.build()
    if roof:
        me = bpy.data.meshes.new(name+'_roof'); ym = (y0+y1)/2; e = 0.4; z1 = hgt + roof_h
        v = [(x0-e, y0-e, hgt), (x1+e, y0-e, hgt), (x1+e, y1+e, hgt), (x0-e, y1+e, hgt),
             (x0+roof_h, ym, z1), (x1-roof_h, ym, z1)]
        me.from_pydata(v, [], [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)])
        ob = bpy.data.objects.new(name+'_roof', me); bpy.context.collection.objects.link(ob); me.materials.append(MATS[roof])
    facade(name+'_f', fac, (x0, y0-0.02), (x1, y0-0.02), 0, hgt, tile_w, tile_h)
    facade(name+'_l', fac, (x0-0.02, y1), (x0-0.02, y0), 0, hgt, tile_w, tile_h)
    facade(name+'_r', fac, (x1+0.02, y0), (x1+0.02, y1), 0, hgt, tile_w, tile_h)

# ---------------------------------------------------------------- scene
def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    mat('bark', '#4a3a2c', 0.9); mat('fir', '#24402c', 0.85); mat('fir2', '#2d4b30', 0.85); mat('leaf', '#6f9a3c', 0.85)
    mat('lampmetal', '#1e2124', 0.4, 0.8); mat('globe', '#fff6e0', 0.2, 0.0, 0.3)
    mat('curb', '#9c9a95', 0.7); mat('grass', '#4f7d2e', 0.95); mat('marking', '#e8e8e8', 0.6)
    mat('flower', '#b32b3a', 0.8); mat('stone', '#8f8a84', 0.7)
    asphalt_mat()
    tiles_mat('plaza', '#a8a8a4', '#9a9b98', '#7d7e7c', 0.9, noise=0.25)
    tiles_mat('sidewalk', '#9c6e62', '#8f8b86', '#6a5f5a', 2.4, noise=0.2)
    img_mat('fac_red', 'fac_red.png'); img_mat('fac_red_c', 'fac_red_center.png')
    img_mat('fac_w7', 'fac_white7.png'); img_mat('fac_w6', 'fac_white6.png')

    # ground
    plane('road', 'asphalt', (-160, -9), (170, 7))
    plane('walk_far', 'sidewalk', (-160, 7), (170, 12), 0.15)
    plane('lawn_far', 'grass', (-60, 12), (66, 28), 0.16)
    plane('far_ground', 'sidewalk', (-160, 12), (170, 120), 0.14)
    plane('walk_near', 'sidewalk', (-160, -14), (170, -9), 0.15)
    plane('plaza', 'plaza', (-160, -160), (170, -14), 0.14)
    mb = MB('curbs')
    mb.box2('curb', (-160, -9.15, 0), (170, -8.9, 0.17)); mb.box2('curb', (-160, 6.9, 0), (170, 7.15, 0.17))
    # lane markings + parade-route edge lines
    for x in range(-150, 165, 9):
        mb.box2('marking', (x, -1.1, 0.001), (x+4.5, -0.95, 0.012))
    mb.box2('marking', (-160, -8.5, 0.001), (170, -8.35, 0.012))
    # crosswalks at both ends
    for xc in (-92, 100):
        for k in range(8):
            mb.box2('marking', (xc + k*1.0, -8.6, 0.001), (xc + k*1.0 + 0.5, 6.6, 0.012))
    mb.build()

    # buildings behind the grandstands (after the scheme): red-brick building with a tower,
    # white buildings on both flanks
    building('red', -52, 60, 32, 48, 18, 'fac_red', 12, 18, roof='roof_red', roof_h=4)
    building('red_c', -6, 14, 30, 50, 21, 'fac_red_c', 12, 21, roof='roof_red', roof_h=4.5)
    mb = MB('tower')
    mat('tower', '#d9a15f', 0.7)
    mb.box2('tower', (0.5, 36.5, 25), (7.5, 43.5, 30)); mb.cyl('roof_red', (4, 40, 30), 4.3, 0.6, 5, 16)
    for dx in (-2.5, 2.5):
        for dy in (-2.5, 2.5):
            mb.box2('tower', (4+dx-0.3, 40+dy-0.3, 30), (4+dx+0.3, 40+dy+0.3, 33))
    mb.cyl('roof_red', (4, 40, 33), 3.2, 0.3, 3.5, 16); mb.cyl('stone', (4, 40, 36.4), 0.08, 0.05, 3, 6)
    mb.build()
    building('white_l', -104, -70, 30, 50, 20, 'fac_w6', 12, 20, roof='roof_grey', body='#e4dace')
    building('white_r', 78, 112, 16, 42, 24, 'fac_w7', 12, 24, roof='roof_grey', body='#e8e1d4')
    # background city blocks
    mbb = MB('city'); mat('city1', '#c9ccd1', 0.8); mat('city2', '#d8d1c4', 0.8); mat('glass', '#7fa3c7', 0.2, 0.3)
    for bx, by, w, d, hh, m in ((-40, 80, 30, 20, 28, 'city1'), (10, 95, 24, 18, 22, 'city2'), (60, 85, 20, 20, 60, 'glass'),
                                (95, 100, 18, 18, 75, 'glass'), (-90, 90, 26, 22, 30, 'city2'), (130, 70, 30, 30, 26, 'city1'),
                                (-140, 60, 30, 30, 22, 'city1'), (35, 130, 30, 20, 40, 'city1')):
        mbb.box2(m, (bx, by, 0), (bx+w, by+d, hh))
    mbb.build()

    # fir trees in front of the red building (gap behind the central stage), leafy trees on flanks
    mbt = MB('trees')
    for row, yy in enumerate((15.5, 21.5)):
        x = -50 + row*2.3
        while x < 60:
            if not (-3 < x < 11):
                fir(mbt, x + random.uniform(-0.8, 0.8), yy + random.uniform(-1, 1), random.uniform(13, 19))
            x += random.uniform(4.2, 5.4)
    for x, y in ((-62, 20), (-58, 26), (68, 22), (72, 28), (-120, 20), (125, 18), (90, -40)):
        leafy(mbt, x, y, random.uniform(9, 13))
    mbt.build()

    # lamps along the near sidewalk and on the square
    mbl = MB('lamps')
    for x in range(-110, 140, 24):
        lamp(mbl, x, -12.2)
    for x, y in ((-70, -34), (86, -34), (-30, -60), (40, -60)):
        lamp(mbl, x, y)
    mbl.build()

    # lawns / flower beds by the pavilions (as in the scheme)
    mbg = MB('beds')
    for x0 in (-82, 88):
        mbg.box2('grass', (x0, -32, 0.14), (x0+16, -18, 0.25))
        mbg.box2('curb', (x0-0.3, -32.3, 0.14), (x0+16.3, -17.7, 0.2))
        mbg.box2('flower', (x0+4, -28, 0.25), (x0+10, -23, 0.33))
    mbg.build()

    # pavilions: left one = hockey/football shop «Территория спорта» (tribune 9 goes next to it)
    pavilion('pav_left', -64, -26, 12, 8, 4.6)
    pavilion('pav_right', 74, -26, 12, 8, 4.6)

    # ---------------- grandstands (see TRIBUNES for dimensions)
    blue10 = None
    tri = ['seat_red']*3 + ['seat_blue']*2 + ['seat_white']*2          # 7 rows, front -> back
    y_back = 11.3
    tribune(1, -68.0, y_back - 10*ROW_D, 10, 16, 1.203, top_red=True, label='18 648 × 12 500 мм')
    tribune(2, -44.0, y_back - 7*ROW_D, 7, 9, 0.9, row_colors=tri)
    tribune(3, -30.0, y_back - 7*ROW_D, 7, 9, 0.9, row_colors=tri)
    tribune(4, -15.5, y_back - 2*ROW_D, 2, 8, 0.45, aisle=1.2)
    tribune(5, 14.0, y_back - 2*ROW_D, 2, 8, 0.45, aisle=1.2)
    tribune(6, 26.0, y_back - 7*ROW_D, 7, 9, 0.9, row_colors=tri)
    tribune(7, 40.0, y_back - 7*ROW_D, 7, 9, 0.9, row_colors=tri)
    tribune(8, 55.0, y_back - 10*ROW_D, 10, 16, 1.203, top_red=True, label='18 648 × 12 500 мм')
    # tribune 9: next to the shop pavilion, on the square side, facing the road (+Y)
    tribune(9, -50.5, -10.6, 6, 10, 0.8, facing=+1)

    screens = {
        'center': screen('scr_center', 4.0, 9.0, 11.0, 6.2, 2.2),
        'right': screen('scr_right', 81.0, 7.8, 8.0, 4.5, 3.2),
        'left': screen('scr_left', -78.5, 7.8, 8.0, 4.5, 3.2),
    }
    # tribune 9 boundary on the ground: dashed red line around its footprint
    mat('bound', '#ff1e1e', 0.4, 0, 2.5)
    fp = TRIBUNES[9]['footprint']; mbd = MB('bound9'); pad = 0.6
    xs = [p[0] for p in fp]; ys = [p[1] for p in fp]
    bx0, bx1, by0, by1 = min(xs)-pad, max(xs)+pad, min(ys)-pad, max(ys)+pad
    TRIBUNES[9]['boundary'] = [(bx0, by0, 0.2), (bx1, by0, 0.2), (bx1, by1, 0.2), (bx0, by1, 0.2)]
    def dashed(a, b):
        a, b = Vector(a), Vector(b); n = int((b-a).length / 1.0)
        for k in range(n):
            if k % 2 == 0:
                p, q = a + (b-a)*k/n, a + (b-a)*(k+0.6)/n
                mbd.box2('bound', (min(p.x, q.x)-0.08, min(p.y, q.y)-0.08, 0.16), (max(p.x, q.x)+0.08, max(p.y, q.y)+0.08, 0.2))
    c = TRIBUNES[9]['boundary']
    for i in range(4): dashed(c[i], c[(i+1) % 4])
    mbd.build()

    # light + world
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.6; sun.angle = math.radians(1.5)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(48), 0, math.radians(-28))   # sun from the square side (-Y), a bit left
    w = bpy.data.worlds.new('world'); sc.world = w; w.use_nodes = True; nt = w.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    ok = False
    for st in ('MULTIPLE_SCATTERING', 'NISHITA', 'SINGLE_SCATTERING', 'HOSEK_WILKIE'):
        try:
            sky.sky_type = st; ok = True; break
        except Exception:
            pass
    try:
        sky.sun_elevation = math.radians(42); sky.sun_rotation = math.radians(200)
        sky.sun_disc = False
    except Exception:
        pass
    nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.35
    return screens

# ---------------------------------------------------------------- views
VIEWS = {
    # 1A: from the square toward the Lenin-monument side, all 8 grandstands (like the scheme)
    '1A': dict(loc=(4, -84, 12), look=(4, 4, 7.0), lens=17, res=(3000, 1500)),
    # 1B: side view toward Pushkin St, grandstand 1 closest to the viewer
    '1B': dict(loc=(-93, -22, 7.5), look=(-40, 6, 2.2), lens=24, res=(2560, 1440)),
    # 1B detail: grandstand 1 close up
    '1B_detail': dict(loc=(-75.5, -9.5, 4.2), look=(-58, 7.5, 2.4), lens=24, res=(2560, 1440)),
    # 2: side view toward Pushkin St: all grandstands + grandstand 9 by the shop
    '2': dict(loc=(-98, -13, 14), look=(-24, -3, 0.5), lens=22, res=(2560, 1440)),
    # 3: same direction, higher/overall with every detail
    '3': dict(loc=(-120, -95, 55), look=(0, 0, 0), lens=26, res=(2560, 1440)),
}

def set_camera(v):
    sc = bpy.context.scene
    cam = sc.camera
    if cam is None:
        cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = v['lens']; cam.data.sensor_width = 36; cam.data.clip_end = 2000
    cam.location = v['loc']
    d = Vector(v['look']) - Vector(v['loc'])
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = v['res']; sc.render.resolution_percentage = v.get('pct', 100)
    return cam

def project(cam, p):
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    c = world_to_camera_view(sc, cam, Vector(p))
    return [c.x*sc.render.resolution_x, (1-c.y)*sc.render.resolution_y, c.z]

def ann_data(cam, screens):
    out = {'tribunes': {}, 'screens': {}}
    def P(p): return project(cam, p)
    for tid, t in TRIBUNES.items():
        d = {k: (P(v) if isinstance(v, tuple) else [P(x) for x in v]) for k, v in t.items()
             if k in ('badge', 'top_back', 'ground_front', 'ground_side_l', 'ground_side_r', 'top_row', 'footprint', 'boundary')}
        d.update({k: t[k] for k in ('L', 'D', 'rows', 'seats', 'label', 'height')})
        out['tribunes'][tid] = d
    for k, s in screens.items():
        out['screens'][k] = {'center': P(s['center']), 'top': P(s['top'])}
    return out

def main():
    argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
    samples, scale, views = 64, 100, []
    it = iter(argv)
    for a in it:
        if a == '--samples': samples = int(next(it))
        elif a == '--scale': scale = int(next(it))
        else: views.append(a)
    views = views or list(VIEWS)
    screens = build_scene()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    pass
    try: sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    sc.view_settings.exposure = 0.0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'scene.blend'))
    for v in views:
        cam = set_camera(VIEWS[v])
        sc.render.filepath = os.path.join(OUT, f'raw_{v}.png')
        bpy.ops.render.render(write_still=True)
        # annotations are projected at 100% scale coordinates
        data = ann_data(cam, screens); data['res'] = VIEWS[v]['res']
        with open(os.path.join(OUT, f'ann_{v}.json'), 'w') as f: json.dump(data, f, ensure_ascii=False, indent=1)
        print('rendered', v)
    with open(os.path.join(OUT, 'tribunes.json'), 'w') as f:
        json.dump({k: {kk: t[kk] for kk in ('L', 'D', 'rows', 'seats', 'height')} for k, t in TRIBUNES.items()}, f, indent=1)

if __name__ == '__main__':
    main()
