"""Photomontage: place a grandstand into a real photo with a matched camera.

Run: blender -b --python photo_comp.py -- <shot> [--samples N]
Camera model per shot: height h, pitch from the horizon line, 35mm-equivalent lens.
Ground points are picked in the photo (px) and back-projected onto the ground plane.
"""
import bpy, json, math, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scene as S

SHOTS = {
    # photo at the «Территория спорта» shop: tribune 9 along the measuring tape
    't9_b': dict(photo='ref/photo_t9_b.jpg', size=(1280, 960), f_mm=13.0, sw=34.6, h=1.35, horizon=445,
                 tape_back=(320, 578), tape_front=(1085, 838), tid=9, rows=6, per_side=10, h0=0.8,
                 extend='right'),
}

def ground_pt(sh, u, v):
    W, H = sh['size']; fx = sh['f_mm']/sh['sw']*W; cx, cy = W/2, H/2
    a = math.atan((cy - sh['horizon'])/fx)
    xc, yc = (u-cx)/fx, (v-cy)/fx
    up = (0, math.sin(a), math.cos(a)); fwd = (0, math.cos(a), -math.sin(a))
    d = (xc, -yc*up[1] + fwd[1], -yc*up[2] + fwd[2])
    t = sh['h']/(-d[2])
    return Vector((d[0]*t, d[1]*t, 0))

def main():
    argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
    shot = argv[0]; samples = int(argv[argv.index('--samples')+1]) if '--samples' in argv else 48
    sh = SHOTS[shot]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    S.MATS.clear(); S.TRIBUNES.clear()

    back = ground_pt(sh, *sh['tape_back']); front = ground_pt(sh, *sh['tape_front'])
    u = (back - front).normalized()                      # local +Y (toward the back of the stand)
    xa = Vector((u.y, -u.x, 0))                           # local +X
    if sh['extend'] == 'left': xa = -xa
    def place(L, D, sd):
        # stair front edge sits on the tape's front end; the tape is one side edge of the stand
        o = front + u*sd
        if sh['extend'] == 'left':
            o = o - xa*0  # tape = right edge when looking from the front -> origin at the other corner
        rz = math.atan2(xa.y, xa.x)
        return (o.x, o.y, 0), rz
    # tape along the right-hand edge (as seen from the front) -> shift origin by -L along X
    def place_edge(L, D, sd):
        loc, rz = place(L, D, sd)
        o = Vector(loc) - xa*L if sh['extend'] == 'left' else Vector(loc)
        return (o.x, o.y, 0), rz
    S.tribune(sh['tid'], 0, 0, sh['rows'], sh['per_side'], sh['h0'], place=place_edge)

    # shadow catcher ground
    S.mat('catcher', '#808080', 0.9)
    g = S.plane('catcher', 'catcher', (-60, -10), (60, 80), 0.0); g.is_shadow_catcher = True
    # boundary of the stand on the ground (for the overlay)
    t = S.TRIBUNES[sh['tid']]

    # light: overcast day
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.2; sun.angle = math.radians(25)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(40), 0, math.radians(35))
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.62, 0.66, 0.72, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9

    # camera
    W, H = sh['size']; fx = sh['f_mm']/sh['sw']*W
    a = math.atan((H/2 - sh['horizon'])/fx)
    cd = bpy.data.cameras.new('cam'); cd.lens = sh['f_mm']; cd.sensor_width = sh['sw']; cd.sensor_fit = 'HORIZONTAL'
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0, 0, sh['h']); cam.rotation_euler = (math.pi/2 - a, 0, 0)

    sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = W*2, H*2; sc.render.resolution_percentage = 100
    try: sc.view_settings.view_transform = 'Standard'
    except Exception: pass
    out = os.path.join(S.OUT, f'comp_raw_{shot}.png'); sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    ann = {k: (S.project(cam, v) if isinstance(v, tuple) else [S.project(cam, x) for x in v])
           for k, v in t.items() if k in ('badge', 'footprint', 'top_back', 'ground_front', 'ground_side_l', 'ground_side_r')}
    ann.update({k: t[k] for k in ('L', 'D', 'rows', 'seats')})
    ann['res'] = [W*2, H*2]
    json.dump(ann, open(os.path.join(S.OUT, f'comp_ann_{shot}.json'), 'w'), indent=1)
    print('comp done', shot, 'L', t['L'], 'D', t['D'])

main()
