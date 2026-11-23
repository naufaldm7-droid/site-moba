# SITE CLASH — generator karakter hero (Blender 4.x/5.x, dijalankan lewat Blender MCP atau Text Editor).
# Base tubuh & animasi: Quaternius Universal Base Characters + Universal Animation Library (CC0).
# Pakaian dibuat dari duplikat permukaan tubuh (bobot tulang ikut), aksesori kaku di-parent ke tulang.
#
# Pakai:  exec(open(r"D:\99_OTHER\SITE MOBA\tools\blender\build_heroes.py").read())
#         build_hero('structural', preview=True)   # satu hero + render pratinjau
#         build_all()                               # 20 hero -> client/assets/models/*.glb
#         build_anims()                             # animasi bersama -> client/assets/models/anims.glb
import bpy, bmesh, math, os, sys, importlib
from mathutils import Vector, Matrix

ROOT = r"D:\99_OTHER\SITE MOBA"
UBC = ROOT + r"\_vendor_assets\ubc\Universal Base Characters[Standard]"
UAL = ROOT + r"\_vendor_assets\ual\Universal Animation Library[Standard]\Unreal-Godot\UAL1_Standard.glb"
OUT = ROOT + r"\client\assets\models"
PREVIEW_DIR = ROOT + r"\_vendor_assets\preview"
sys.path.insert(0, ROOT + r"\tools\blender")
import hero_specs
importlib.reload(hero_specs)
SPECS = hero_specs.HEROES

# animasi yang dipakai game (sisanya dibuang supaya file kecil)
KEEP_ANIMS = ['Idle_Loop', 'Sword_Idle', 'Pistol_Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Walk_Loop',
              'Sword_Attack', 'Punch_Cross', 'Punch_Jab', 'Pistol_Shoot', 'Spell_Simple_Shoot', 'Spell_Simple_Enter',
              'Spell_Simple_Idle_Loop', 'Roll', 'Jump_Start', 'Jump_Land', 'Interact', 'Hit_Chest', 'Death01',
              'Dance_Loop', 'Idle_Talking_Loop', 'PickUp_Table']


# ------------------------------------------------------------------ util
def ctx():
    win = bpy.context.window_manager.windows[0]
    area = next((a for a in win.screen.areas if a.type == 'VIEW_3D'), win.screen.areas[0])
    region = next(r for r in area.regions if r.type == 'WINDOW')
    return dict(window=win, area=area, region=region, screen=win.screen, scene=bpy.context.scene, view_layer=bpy.context.view_layer)


import io, contextlib
QUIET = io.StringIO()


def imp(path):
    before = set(bpy.data.objects)
    with bpy.context.temp_override(**ctx()), contextlib.redirect_stdout(QUIET), contextlib.redirect_stderr(QUIET):
        bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mk_mat(name, col, rough=0.75, metal=0.0, emis=None, strength=2.0, double=True, img=None, uv_scale=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*lin(col), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emis:
        p.inputs['Emission Color'].default_value = (*lin(emis), 1)
        p.inputs['Emission Strength'].default_value = strength
    if img is not None:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        if uv_scale:
            mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
            mp.inputs['Scale'].default_value = (uv_scale, uv_scale, 1)
            nt.links.new(tc.outputs['UV'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    m.use_backface_culling = not double
    return m


def plaid_image(name, base, a, b, size=128):
    img = bpy.data.images.new(name, size, size)
    srgb = lambda h: tuple(int(h.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4))
    B, A, C = srgb(base), srgb(a), srgb(b)  # gambar baru = ruang warna sRGB
    px = []
    for y in range(size):
        for x in range(size):
            col = list(B)
            if (x // 8) % 4 == 0 or (y // 8) % 4 == 0:
                col = [c * 0.55 + q * 0.45 for c, q in zip(col, A)]
            if x % 32 in (14, 15) or y % 32 in (14, 15):
                col = [c * 0.5 + q * 0.5 for c, q in zip(col, C)]
            px += [*col, 1.0]
    img.pixels = px
    img.pack()
    return img


# ------------------------------------------------------------------ landmark rig
class L:
    pass


def landmarks(arm, body):
    M = arm.matrix_world
    B = arm.data.bones
    hz = lambda n: (M @ B[n].head_local)
    lm = L()
    lm.waist = hz('spine_01').z - 0.075
    lm.neck = hz('neck_01').z + 0.005
    lm.sh_x = abs(hz('upperarm_l').x)
    lm.elbow_x = abs(hz('lowerarm_l').x)
    lm.wrist_x = abs(hz('hand_l').x)
    lm.arm_z = hz('upperarm_l').z
    lm.armpit = lm.arm_z - 0.13
    lm.knee = hz('calf_l').z
    lm.ankle = hz('foot_l').z
    hv = [body.matrix_world @ v.co for v in body.data.vertices if v.co.z > hz('Head').z - 0.02 and abs(v.co.x) < 0.14]
    xs = [v.x for v in hv]; ys = [v.y for v in hv]; zs = [v.z for v in hv]
    lm.head_top = max(zs)
    lm.head_c = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, hz('Head').z + 0.07))
    lm.head_r = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
    lm.face_y = min(ys)
    return lm


def vinfo(body, lm):
    gname = {g.index: g.name for g in body.vertex_groups}
    out = []
    for v in body.data.vertices:
        w = {}
        for g in v.groups:
            n = gname.get(g.group)
            if n: w[n] = g.weight
        co = body.matrix_world @ v.co
        is_arm = abs(co.x) > lm.sh_x + 0.02 and co.z > lm.armpit
        out.append((co, w, is_arm))
    return out


# ------------------------------------------------------------------ lapisan pakaian (skinned)
def layer(body, name, VI, pred, offset, mats, face_mat=None, smooth=4):
    o = body.copy(); o.data = body.data.copy(); o.name = name; o.data.name = name
    bpy.context.scene.collection.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    keep = set(f for f in bm.faces if all(pred(*VI[v.index]) for v in f.verts))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    for f in bm.faces:
        f.material_index = face_mat(f.calc_center_median()) if face_mat else 0
    o.data.materials.clear()  # (clear() me-reset material_index, jadi set slot dulu baru tulis mesh)
    for m in mats: o.data.materials.append(m)
    bm.to_mesh(o.data); bm.free()
    return o if len(o.data.polygons) else (bpy.data.objects.remove(o, do_unlink=True) or None)


def cut_body(body, VI, pred):
    bm = bmesh.new(); bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    dead = [f for f in bm.faces if all(pred(*VI[v.index]) for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data); bm.free()


# ------------------------------------------------------------------ aksesori kaku
def new_obj(name, bm, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def add_box(bm, size, loc=(0, 0, 0), mat=0, rot=None):
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r['verts']
    S = Matrix.Diagonal((*size, 1))
    T = Matrix.Translation(loc) @ (rot.to_matrix().to_4x4() if rot else Matrix()) @ S
    bmesh.ops.transform(bm, matrix=T, verts=vs)
    for f in {f for v in vs for f in v.link_faces}: f.material_index = mat
    return vs


def add_cyl(bm, r1, r2, depth, loc=(0, 0, 0), mat=0, axis='Z', seg=16):
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth)
    vs = res['verts']
    R = Matrix()
    if axis == 'X': R = Matrix.Rotation(math.pi / 2, 4, 'Y')
    if axis == 'Y': R = Matrix.Rotation(math.pi / 2, 4, 'X')
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ R, verts=vs)
    for f in {f for v in vs for f in v.link_faces}: f.material_index = mat
    return vs


def add_sphere(bm, r, loc=(0, 0, 0), scale=(1, 1, 1), mat=0, seg=16):
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    vs = res['verts']
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1)), verts=vs)
    for f in {f for v in vs for f in v.link_faces}: f.material_index = mat
    return vs


def add_torus(bm, R, r, loc=(0, 0, 0), mat=0, axis='Z', seg=20, seg2=8):
    vs = []
    rings = []
    for i in range(seg):
        a = i / seg * math.tau
        ring = []
        for j in range(seg2):
            b = j / seg2 * math.tau
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(seg):
        for j in range(seg2):
            a, b = rings[i], rings[(i + 1) % seg]
            f = bm.faces.new((a[j], b[j], b[(j + 1) % seg2], a[(j + 1) % seg2]))
            f.material_index = mat
        vs += rings[i]
    R4 = Matrix()
    if axis == 'X': R4 = Matrix.Rotation(math.pi / 2, 4, 'Y')
    if axis == 'Y': R4 = Matrix.Rotation(math.pi / 2, 4, 'X')
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ R4, verts=vs)
    return vs


def bone_parent(o, arm, bone):
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = bone
    bpy.context.view_layer.update()
    o.matrix_world = mw


def make_hat(spec, lm, M):
    kind = spec.get('hat')
    if not kind or kind == 'hijab': return None
    bm = bmesh.new()
    r = lm.head_r + 0.014
    c = lm.head_c.copy()
    dome = add_sphere(bm, 1.0, seg=24, mat=0)
    bmesh.ops.delete(bm, geom=[v for v in dome if v.co.z < -0.02], context='VERTS')
    vs = [v for v in bm.verts]
    bmesh.ops.transform(bm, matrix=Matrix.Translation((c.x, c.y + 0.005, lm.head_top - r * 0.86)) @ Matrix.Diagonal((r * 1.08, r * 1.2, r * 0.98, 1)), verts=vs)
    base_z = lm.head_top - r * 0.86
    if kind == 'hardhat':
        brim = add_cyl(bm, r * 1.32, r * 1.32, 0.012, loc=(c.x, c.y - 0.012, base_z), mat=0, seg=28)
        for v in brim:
            if v.co.y < c.y: v.co.y -= 0.035 * min(1, (c.y - v.co.y) / r)  # pelindung depan lebih panjang
        add_box(bm, (0.026, r * 2.1, 0.03), loc=(c.x, c.y, lm.head_top + r * 0.06), mat=0)  # ridge
        if spec.get('hat_stripe'):
            add_box(bm, (0.012, r * 2.15, 0.034), loc=(c.x + 0.03, c.y, lm.head_top + r * 0.03), mat=1)
            add_box(bm, (0.012, r * 2.15, 0.034), loc=(c.x - 0.03, c.y, lm.head_top + r * 0.03), mat=1)
        # logo/stiker depan
        add_box(bm, (0.04, 0.004, 0.026), loc=(c.x, c.y - r * 1.13, base_z + r * 0.42), mat=1)
    else:  # weld: helm las + kaca gelap terangkat
        add_box(bm, (r * 1.9, 0.03, r * 1.3), loc=(c.x, c.y - r * 1.05, lm.head_top - r * 0.2), mat=0,
                rot=Matrix.Rotation(math.radians(-55), 3, 'X').to_euler())
        add_box(bm, (r * 1.0, 0.035, r * 0.45), loc=(c.x, c.y - r * 1.12, lm.head_top - r * 0.12), mat=2,
                rot=Matrix.Rotation(math.radians(-55), 3, 'X').to_euler())
    mats = [M['Hat'], M['Accent'], M['ToolGlow']]
    return new_obj('Hat', bm, mats)


def make_glasses(lm, M, eyes_obj, visor=None):
    ev = [eyes_obj.matrix_world @ v.co for v in eyes_obj.data.vertices]
    cx = sum(v.x for v in ev) / len(ev); cz = sum(v.z for v in ev) / len(ev); fy = min(v.y for v in ev) - 0.012
    bm = bmesh.new()
    if visor:
        add_box(bm, (0.15, 0.012, 0.04), loc=(cx, fy - 0.006, cz + 0.004), mat=1)
        add_box(bm, (0.012, 0.09, 0.012), loc=(cx + 0.078, fy + 0.045, cz + 0.004), mat=0)
        add_box(bm, (0.012, 0.09, 0.012), loc=(cx - 0.078, fy + 0.045, cz + 0.004), mat=0)
    else:
        for sx in (-1, 1):
            add_torus(bm, 0.019, 0.0028, loc=(cx + sx * 0.032, fy, cz), axis='Y', mat=0, seg=16, seg2=6)
            add_box(bm, (0.004, 0.085, 0.004), loc=(cx + sx * 0.069, fy + 0.042, cz + 0.005), mat=0)
        add_box(bm, (0.022, 0.004, 0.004), loc=(cx, fy, cz + 0.004), mat=0)
    return new_obj('Glasses', bm, [M['ToolMetal'], M['ToolGlow']])


def make_chest(spec, lm, M):
    """dasi, lanyard + ID card, saku rompi (parent ke spine_03)."""
    bm = bmesh.new()
    front = -0.135  # kira-kira permukaan dada depan (y negatif = depan)
    any_ = False
    if spec.get('tie'):
        add_box(bm, (0.05, 0.012, 0.26), loc=(0, front - 0.012, lm.neck - 0.19), mat=0,
                rot=Matrix.Rotation(math.radians(6), 3, 'X').to_euler()); any_ = True
        add_box(bm, (0.035, 0.014, 0.03), loc=(0, front - 0.012, lm.neck - 0.045), mat=0)
    if spec.get('lanyard'):
        for sx in (-1, 1):
            add_box(bm, (0.012, 0.006, 0.2), loc=(sx * 0.045, front - 0.02, lm.neck - 0.11), mat=1,
                    rot=Matrix.Rotation(math.radians(sx * 12), 3, 'Y').to_euler())
        add_box(bm, (0.06, 0.006, 0.085), loc=(0.0, front - 0.026, lm.neck - 0.25), mat=2); any_ = True
    if spec.get('pockets'):
        for sx in (-1, 1):
            add_box(bm, (0.075, 0.025, 0.075), loc=(sx * 0.085, front - 0.03, lm.neck - 0.27), mat=3)
        add_box(bm, (0.045, 0.03, 0.1), loc=(-0.14, front - 0.01, lm.neck - 0.12), mat=4)  # walkie-talkie di bahu
        any_ = True
    if not any_:
        bm.free(); return None
    return new_obj('ChestGear', bm, [M['Tie'], M['Straps'], M['Accent'], M['Vest'], M['ToolMetal']])


# ------------------------------------------------------------------ alat di tangan (grip di origin, batang ke depan -Y)
def tool_mesh(kind, M):
    bm = bmesh.new()
    T, TM, G, A, P = 0, 1, 2, 3, 4  # slot: Tool, ToolMetal, ToolGlow, Accent, Paper
    if kind == 'beam':
        add_box(bm, (0.1, 0.78, 0.012), loc=(0, -0.3, 0.045), mat=TM); add_box(bm, (0.1, 0.78, 0.012), loc=(0, -0.3, -0.045), mat=TM)
        add_box(bm, (0.012, 0.78, 0.09), loc=(0, -0.3, 0), mat=TM)
        add_box(bm, (0.012, 0.78, 0.014), loc=(0.05, -0.3, 0.052), mat=G); add_box(bm, (0.012, 0.78, 0.014), loc=(-0.05, -0.3, -0.052), mat=G)
    elif kind == 'stylus':
        add_cyl(bm, 0.022, 0.022, 0.2, loc=(0, 0.02, 0), axis='Y', mat=T)
        add_cyl(bm, 0.018, 0.004, 1.0, loc=(0, -0.58, 0), axis='Y', mat=G)
        add_box(bm, (0.09, 0.02, 0.03), loc=(0, -0.08, 0), mat=TM)
    elif kind == 'sledge':
        add_cyl(bm, 0.02, 0.02, 0.85, loc=(0, -0.3, 0), axis='Y', mat=T)
        add_box(bm, (0.1, 0.12, 0.26), loc=(0, -0.72, 0), mat=TM)
        add_box(bm, (0.104, 0.02, 0.27), loc=(0, -0.66, 0), mat=G)
    elif kind == 'wrench':
        add_cyl(bm, 0.022, 0.022, 0.55, loc=(0, -0.2, 0), axis='Y', mat=A)
        add_box(bm, (0.05, 0.08, 0.14), loc=(0, -0.5, 0.04), mat=TM); add_box(bm, (0.05, 0.04, 0.09), loc=(0, -0.55, -0.05), mat=TM)
    elif kind == 'hook':
        add_cyl(bm, 0.012, 0.012, 0.35, loc=(0, -0.15, 0), axis='Y', mat=TM)
        add_box(bm, (0.12, 0.1, 0.16), loc=(0, -0.36, 0), mat=A)
        add_torus(bm, 0.09, 0.025, loc=(0, -0.5, -0.08), axis='X', mat=TM, seg=16, seg2=8)
    elif kind == 'sptrod':
        add_cyl(bm, 0.016, 0.016, 1.6, loc=(0, -0.5, 0), axis='Y', mat=TM)
        add_cyl(bm, 0.03, 0.0, 0.12, loc=(0, -1.36, 0), axis='Y', mat=TM)
        add_box(bm, (0.05, 0.06, 0.05), loc=(0, 0.06, 0), mat=A)
        add_cyl(bm, 0.02, 0.02, 0.4, loc=(0, -0.9, 0), axis='Y', mat=G)
    elif kind in ('baton', 'pointer', 'testpen', 'pencil'):
        L_, col = {'baton': (0.45, T), 'pointer': (0.22, TM), 'testpen': (0.24, A), 'pencil': (0.5, A)}[kind]
        add_cyl(bm, 0.018, 0.018, L_, loc=(0, -L_ / 2 + 0.06, 0), axis='Y', mat=col)
        add_cyl(bm, 0.014, 0.003, 0.08, loc=(0, -L_ + 0.02, 0), axis='Y', mat=G)
    elif kind in ('tablet', 'theodolite_tab'):
        add_box(bm, (0.2, 0.28, 0.014), loc=(0, -0.1, 0.03), mat=T); add_box(bm, (0.18, 0.25, 0.004), loc=(0, -0.1, 0.039), mat=G)
    elif kind == 'laptop':
        add_box(bm, (0.3, 0.22, 0.016), loc=(0, -0.08, 0.02), mat=T)
        add_box(bm, (0.3, 0.012, 0.2), loc=(0, -0.19, 0.12), mat=T); add_box(bm, (0.27, 0.006, 0.17), loc=(0, -0.185, 0.12), mat=G)
    elif kind == 'pcb':
        add_box(bm, (0.16, 0.22, 0.012), loc=(0, -0.1, 0.02), mat=G); add_box(bm, (0.04, 0.04, 0.02), loc=(0.03, -0.12, 0.03), mat=TM)
    elif kind == 'calculator':
        add_box(bm, (0.1, 0.16, 0.022), loc=(0, -0.07, 0.02), mat=T); add_box(bm, (0.08, 0.045, 0.004), loc=(0, -0.11, 0.032), mat=G)
    elif kind in ('docs', 'binder', 'scroll', 'tube'):
        if kind == 'scroll': add_cyl(bm, 0.035, 0.035, 0.36, loc=(0, -0.05, 0), axis='X', mat=P)
        elif kind == 'tube': add_cyl(bm, 0.05, 0.05, 0.6, loc=(0, -0.2, 0), axis='Y', mat=T); add_cyl(bm, 0.055, 0.055, 0.05, loc=(0, -0.49, 0), axis='Y', mat=TM)
        else:
            add_box(bm, (0.24, 0.32, 0.06 if kind == 'binder' else 0.035), loc=(0, -0.1, 0.04), mat=T if kind == 'binder' else P)
            if kind == 'binder': add_box(bm, (0.02, 0.32, 0.064), loc=(-0.12, -0.1, 0.04), mat=TM)
    elif kind == 'medkit':
        add_box(bm, (0.3, 0.13, 0.22), loc=(0, -0.02, -0.14), mat=A)
        add_box(bm, (0.16, 0.135, 0.05), loc=(0, -0.02, -0.14), mat=G); add_box(bm, (0.05, 0.135, 0.16), loc=(0, -0.02, -0.14), mat=G)
    elif kind == 'multimeter':
        add_box(bm, (0.1, 0.17, 0.045), loc=(0, -0.07, 0.02), mat=A); add_box(bm, (0.07, 0.05, 0.004), loc=(0, -0.1, 0.045), mat=G)
    elif kind == 'radio':
        add_box(bm, (0.06, 0.05, 0.16), loc=(0, -0.02, 0.06), mat=T); add_cyl(bm, 0.006, 0.006, 0.12, loc=(0.015, -0.02, 0.2), mat=TM)
        add_box(bm, (0.03, 0.006, 0.02), loc=(0, -0.047, 0.09), mat=G)
    elif kind == 'card':
        add_box(bm, (0.09, 0.055, 0.003), loc=(0, -0.06, 0.02), mat=P)
    elif kind == 'briefcase':
        add_box(bm, (0.4, 0.1, 0.3), loc=(0, 0.0, -0.2), mat=T); add_box(bm, (0.12, 0.02, 0.03), loc=(0, 0.0, -0.035), mat=TM)
    elif kind == 'scanner':
        add_cyl(bm, 0.02, 0.02, 0.14, loc=(0, 0, 0), axis='Z', mat=T)
        add_box(bm, (0.08, 0.16, 0.05), loc=(0, -0.08, 0.08), mat=T); add_cyl(bm, 0.03, 0.03, 0.02, loc=(0, -0.17, 0.08), axis='Y', mat=G)
    elif kind == 'caliper':
        add_box(bm, (0.02, 0.28, 0.006), loc=(0, -0.1, 0.0), mat=TM); add_box(bm, (0.05, 0.02, 0.008), loc=(0.02, -0.03, 0), mat=TM)
        add_box(bm, (0.04, 0.03, 0.01), loc=(0, 0.0, 0.01), mat=G)
    elif kind == 'panel':
        add_box(bm, (0.32, 0.12, 0.22), loc=(0, -0.08, -0.06), mat=T)
        for i in range(3): add_cyl(bm, 0.018, 0.018, 0.01, loc=(-0.08 + i * 0.08, -0.145, -0.02), axis='Y', mat=G)
        add_box(bm, (0.2, 0.006, 0.07), loc=(0, -0.143, -0.11), mat=G)
    elif kind == 'remote':
        add_box(bm, (0.16, 0.1, 0.05), loc=(0, -0.05, 0.02), mat=A)
        for sx in (-1, 1): add_cyl(bm, 0.012, 0.012, 0.06, loc=(sx * 0.05, -0.05, 0.065), mat=TM)
        add_cyl(bm, 0.005, 0.005, 0.15, loc=(0.07, -0.02, 0.1), mat=TM)
    elif kind == 'manifold':
        add_box(bm, (0.22, 0.05, 0.05), loc=(0, -0.08, 0.02), mat=TM)
        add_cyl(bm, 0.045, 0.045, 0.02, loc=(-0.06, -0.08, 0.08), axis='Y', mat=A)
        add_cyl(bm, 0.045, 0.045, 0.02, loc=(0.06, -0.08, 0.08), axis='Y', mat=G)
    elif kind == 'stamp':
        add_cyl(bm, 0.025, 0.035, 0.12, loc=(0, 0, 0.0), mat=T)
        add_box(bm, (0.12, 0.1, 0.05), loc=(0, 0, -0.08), mat=A); add_box(bm, (0.12, 0.1, 0.008), loc=(0, 0, -0.108), mat=G)
    elif kind == 'theodolite':  # dipunggung
        for a in (0, 2.1, 4.2):
            v = add_cyl(bm, 0.008, 0.008, 0.75, loc=(math.sin(a) * 0.06, math.cos(a) * 0.04, -0.2), mat=A)
        add_box(bm, (0.12, 0.1, 0.12), loc=(0, 0, 0.2), mat=A); add_cyl(bm, 0.025, 0.025, 0.12, loc=(0, -0.08, 0.22), axis='Y', mat=TM)
    else:
        bm.free(); return None
    return new_obj('Tool_' + kind, bm, [M['Tool'], M['ToolMetal'], M['ToolGlow'], M['Accent'], M['Paper']])


def make_shoe(arm, side, M, high=True):
    A = arm.matrix_world
    fh = A @ arm.data.bones['foot_' + side].head_local
    bt = A @ arm.data.bones['ball_' + side].tail_local
    x = fh.x
    heel_y, toe_y = fh.y + 0.045, bt.y - 0.035
    L_ = heel_y - toe_y; cy = (heel_y + toe_y) / 2
    bm = bmesh.new()
    add_box(bm, (0.098, L_ - 0.02, 0.07 if high else 0.058), loc=(x, cy + 0.01, 0.045), mat=0)
    add_cyl(bm, 0.045, 0.045, 0.098, loc=(x, toe_y + 0.03, 0.04), axis='X', mat=0, seg=12)
    add_box(bm, (0.104, L_ - 0.005, 0.018), loc=(x, cy + 0.005, 0.009), mat=1)
    if high:
        add_box(bm, (0.095, 0.095, 0.14), loc=(x, fh.y, 0.12), mat=0)
    o = new_obj('Shoe_' + side, bm, [M['Boots'], M['Belt']])
    return o


def place_in_hand(o, arm, side):
    B = arm.data.bones['hand_' + side]
    h = arm.matrix_world @ B.head_local; t = arm.matrix_world @ B.tail_local
    d = (t - h).normalized()
    grip = h + d * 0.075 + Vector((0, -0.005, -0.03))
    o.matrix_world = Matrix.Translation(grip) @ o.matrix_world
    bone_parent(o, arm, 'hand_' + side)


# ------------------------------------------------------------------ hero
def materials(spec, hero):
    M = {}
    acc = '#c8c8c8' if not spec.get('reflect') else '#e8e8e8'
    M['Shirt'] = mk_mat('Shirt', spec['shirt'], 0.85, img=plaid_image('Plaid_' + hero, spec['shirt'], *spec['plaid']) if spec.get('plaid') else None, uv_scale=6 if spec.get('plaid') else None)
    M['Pants'] = mk_mat('Pants', spec['pants'], 0.9)
    M['Boots'] = mk_mat('Boots', spec['boots'], 0.55)
    M['Belt'] = mk_mat('Belt', spec.get('belt', '#222222'), 0.5, 0.1)
    M['Vest'] = mk_mat('Vest', spec.get('vest', '#444444'), 0.8)
    M['Jacket'] = mk_mat('Jacket', spec.get('jacket', '#333333'), 0.7)
    M['Gloves'] = mk_mat('Gloves', spec.get('gloves', '#333333'), 0.6)
    M['Hat'] = mk_mat('Hat', spec.get('hat_col', '#eeeeee'), 0.3, 0.05)
    M['Accent'] = mk_mat('Accent', spec.get('hat_stripe', acc), 0.25, 0.6, emis='#b0b0b0' if spec.get('reflect') else None, strength=0.6)
    M['Straps'] = mk_mat('Straps', spec.get('straps', spec.get('lanyard', '#222222')), 0.6)
    M['Tie'] = mk_mat('Tie', spec.get('tie', '#222222'), 0.6)
    M['Tool'] = mk_mat('Tool', '#2b2f36', 0.5, 0.2)
    M['Paper'] = mk_mat('Paper', '#f2efe6', 0.9)
    M['Hair'] = mk_mat('Hair', spec.get('hair_col', '#1c1410'), 0.6)
    M['ToolMetal'] = mk_mat('ToolMetal', '#8c96a3', 0.3, 0.9)
    glow = spec.get('visor') or spec.get('lanyard') or '#ffd23a'
    M['ToolGlow'] = mk_mat('ToolGlow', glow, 0.3, 0.0, emis=glow, strength=4.0)
    return M


def build_hero(hero, preview=False, export=True):
    spec = SPECS[hero]
    clear_scene()
    fem = spec['g'] == 'F'
    base = UBC + r"\Base Characters\Godot - UE\Superhero_%s_FullBody.gltf" % ('Female' if fem else 'Male')
    objs = imp(base)
    for o in objs:
        if o.type == 'MESH' and o.parent is None: bpy.data.objects.remove(o, do_unlink=True)  # icosphere sisa
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.name = 'Rig_' + hero
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.lower().startswith('superhero'))
    eyes = None
    body.name = 'Body'
    body.data.materials[0].name = 'Skin'
    for o in bpy.data.objects:
        if o.type == 'MESH' and o is not body and o.data.materials and o.data.materials[0]:
            mn = o.data.materials[0].name
            if 'Eye' in mn: o.data.materials[0].name = 'Eyes'; eyes = o
            elif 'Hair' in mn: o.data.materials[0].name = 'Brows'
    lm = landmarks(arm, body)
    VI = vinfo(body, lm)
    M = materials(spec, hero)
    sl = spec.get('sleeve', 'long')
    sleeve_x = {'none': lm.sh_x + 0.02, 'short': (lm.sh_x + lm.elbow_x) / 2, 'rolled': lm.elbow_x + 0.06, 'long': lm.wrist_x - 0.015}[sl]
    boot_top = 0.11 if spec.get('shoes') else 0.30
    foot_z = lm.ankle + 0.05
    neckw = lambda w: w.get('neck_01', 0) + w.get('Head', 0)
    torso = lambda co, w, a: lm.waist - 0.01 <= co.z <= lm.neck + 0.08 and neckw(w) < 0.6 and not a
    shirt = lambda co, w, a: torso(co, w, a) or (a and abs(co.x) < sleeve_x)
    pants = lambda co, w, a: boot_top - 0.02 <= co.z <= lm.waist + 0.035 and not a
    boots = lambda co, w, a: foot_z - 0.02 <= co.z < boot_top
    feet = lambda co, w, a: co.z < foot_z
    gloved = bool(spec.get('gloves'))
    gloves = lambda co, w, a: a and abs(co.x) > lm.wrist_x - 0.03
    jacket_on = bool(spec.get('jacket'))
    # --- lapisan (urutan offset: kemeja < celana < sabuk < jaket < rompi)
    layer(body, 'Shirt', VI, shirt, 0.016, [M['Shirt']])
    layer(body, 'Pants', VI, pants, 0.02, [M['Pants']], smooth=6)
    layer(body, 'Belt', VI, lambda co, w, a: lm.waist - 0.005 <= co.z <= lm.waist + 0.035 and not a, 0.026, [M['Belt']], smooth=2)
    if not spec.get('shoes'): layer(body, 'Boots', VI, boots, 0.03, [M['Boots']], smooth=3)
    for side in ('l', 'r'):
        sh = make_shoe(arm, side, M, high=not spec.get('shoes'))
        bone_parent(sh, arm, 'foot_' + side)
    if gloved: layer(body, 'Gloves', VI, gloves, 0.007, [M['Gloves']], smooth=0)
    if jacket_on:
        jz = lm.waist - 0.09
        opening = lambda co: co.y < -0.02 and abs(co.x) < 0.035 + max(0, (co.z - lm.waist)) * 0.18 and co.z > lm.waist - 0.02
        layer(body, 'Jacket', VI, lambda co, w, a: ((jz <= co.z <= lm.neck + 0.05 and neckw(w) < 0.6 and not a) or (a and abs(co.x) < lm.wrist_x - 0.03)) and not opening(co),
              0.03, [M['Jacket']], smooth=5)
    if spec.get('vest'):
        refl = spec.get('reflect')
        fm = (lambda c: 1 if refl and (abs(c.z - (lm.waist + 0.12)) < 0.032 or abs(c.z - (lm.waist + 0.28)) < 0.032) else 0)
        layer(body, 'Vest', VI, lambda co, w, a: lm.waist + 0.02 <= co.z <= lm.neck - 0.045 and abs(co.x) < lm.sh_x - 0.005 and not a, 0.036,
              [M['Vest'], M['Accent']], face_mat=fm)
    if spec.get('straps'):
        layer(body, 'Straps', VI, lambda co, w, a: lm.waist <= co.z <= lm.neck and not a and abs(abs(co.x) - 0.085) < 0.022, 0.03, [M['Straps']])
    if spec.get('hat') == 'hijab':
        hc = lm.head_c
        def hij(co, w, a):
            head = (w.get('Head', 0) + w.get('neck_01', 0)) > 0.5 or co.z > lm.neck - 0.07 and abs(co.x) < 0.17 and not a
            face = co.y < hc.y - 0.035 and lm.neck + 0.035 < co.z < lm.head_top - 0.075 and abs(co.x) < 0.075
            return head and not face
        layer(body, 'Hijab', VI, hij, 0.03, [M['Hat']], smooth=6)
    # --- buang kulit yang tertutup pakaian (hemat poligon, tidak tembus saat animasi)
    cut_body(body, VI, lambda co, w, a: shirt(co, w, a) or pants(co, w, a) or feet(co, w, a) or (not spec.get('shoes') and boots(co, w, a)) or (gloved and gloves(co, w, a)))
    # --- rambut
    hair = spec.get('hair')
    hairs = []
    if hair:
        hairs.append('Buzzed' if hair == 'Beard' else hair)
        if hair == 'Beard': hairs.append('Beard')
        if spec.get('hat') and hair not in ('Beard',): hairs = ['Buzzed']
    for hname in hairs:
        p = UBC + r"\Hairstyles\Rigged to Head Bone\glTF (Godot -Unreal)\Hair_%s.gltf" % hname
        new = imp(p)
        for o in new:
            if o.type == 'MESH' and o.parent and o.parent.type == 'ARMATURE':
                o.parent = arm
                for md in o.modifiers:
                    if md.type == 'ARMATURE': md.object = arm
                o.data.materials.clear(); o.data.materials.append(M['Hair'])
                o.name = 'Hair_' + hname
        for o in new:
            if o.type == 'ARMATURE' or (o.type == 'MESH' and o.parent is None): bpy.data.objects.remove(o, do_unlink=True)
    # --- aksesori kaku
    hat = make_hat(spec, lm, M)
    if hat: bone_parent(hat, arm, 'Head')
    if spec.get('glasses') or spec.get('visor'):
        g = make_glasses(lm, M, eyes, visor=spec.get('visor'))
        bone_parent(g, arm, 'Head')
    ch = make_chest(spec, lm, M)
    if ch: bone_parent(ch, arm, 'spine_03')
    for side, key in (('r', 'tool'), ('l', 'tool_l')):
        if spec.get(key):
            t = tool_mesh(spec[key], M)
            if t:
                if side == 'l': t.matrix_world = Matrix.Diagonal((-1, 1, 1, 1)) @ t.matrix_world  # cermin
                place_in_hand(t, arm, side)
    if spec.get('back'):
        b = tool_mesh(spec['back'], M)
        b.location = (0, 0.17, lm.neck - 0.2)
        bone_parent(b, arm, 'spine_03')
    # --- tekstur lebih kecil untuk web
    for img in bpy.data.images:
        if img.size[0] > 1024 and ('Superhero' in img.name or 'Hair' in img.name):
            s = 1024 if 'BaseColor' in img.name or 'Dark' in img.name or 'Ligh' in img.name else 512
            img.scale(s, s)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    info = {'hero': hero, 'tris': tris}
    if preview:
        os.makedirs(PREVIEW_DIR, exist_ok=True)
        pose = bpy.data.objects.get(arm.name)
        info['preview'] = render_preview(hero, arm)
    if export:
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, hero + '.glb')
        for o in bpy.data.objects: o.select_set(o.type in ('MESH', 'ARMATURE'))
        with bpy.context.temp_override(**ctx()), contextlib.redirect_stdout(QUIET), contextlib.redirect_stderr(QUIET):
            bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=False,
                                      export_image_format='JPEG', export_apply=False, export_yup=True)
        info['kb'] = round(os.path.getsize(path) / 1024)
    return info


def render_preview(hero, arm, action='Idle_Loop', frame=10):
    sc = bpy.context.scene
    act = bpy.data.actions.get(action)
    if act is None:
        before = set(bpy.data.objects)
        imp(UAL)
        for o in [o for o in bpy.data.objects if o not in before]: bpy.data.objects.remove(o, do_unlink=True)
        act = bpy.data.actions.get(action)
    if act:
        arm.animation_data_create(); arm.animation_data.action = act
        if hasattr(arm.animation_data, 'action_slot') and act.slots: arm.animation_data.action_slot = act.slots[0]
        sc.frame_set(frame)
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 700, 900
    if not sc.world: sc.world = bpy.data.worlds.new('World')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.09, 0.08, 0.075, 1)
    cam = bpy.data.objects.new('PrevCam', bpy.data.cameras.new('PrevCam')); sc.collection.objects.link(cam); sc.camera = cam
    c = Vector((0, 0, 0.95)); a = math.radians(-28)
    cam.location = c + Vector((math.sin(a) * 3.4, -math.cos(a) * 3.4, 0.45))
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 50
    for n, loc, en, col in (('KeyL', (2.5, -3.5, 3.5), 700, (1, .86, .72)), ('RimL', (-2.5, 3, 3), 500, (.6, .72, 1)), ('FillL', (-3.5, -2.5, 1.5), 200, (1, 1, 1))):
        l = bpy.data.objects.new(n, bpy.data.lights.new(n, 'AREA')); sc.collection.objects.link(l)
        l.location = loc; l.data.energy = en; l.data.color = col; l.data.size = 3
        l.rotation_euler = (Vector((0, 0, 1)) - l.location).to_track_quat('-Z', 'Y').to_euler()
    path = os.path.join(PREVIEW_DIR, hero + '.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for n in ('PrevCam', 'KeyL', 'RimL', 'FillL'):
        o = bpy.data.objects.get(n)
        if o: bpy.data.objects.remove(o, do_unlink=True)
    if arm.animation_data: arm.animation_data.action = None
    return path


def build_all(heroes=None):
    out = []
    for h in heroes or SPECS.keys():
        out.append(build_hero(h, preview=False, export=True))
    return out


def build_anims():
    clear_scene()
    new = imp(UAL)
    arm = next(o for o in new if o.type == 'ARMATURE')
    for o in new:
        if o.type != 'ARMATURE': bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.name not in KEEP_ANIMS: bpy.data.actions.remove(a)
    # mesh kecil wajib ada supaya exporter menulis skin; pakai segitiga mini
    bm = bmesh.new(); add_box(bm, (0.001, 0.001, 0.001)); o = new_obj('AnimStub', bm, [])
    o.parent = arm
    for o2 in bpy.data.objects: o2.select_set(True)
    path = os.path.join(OUT, 'anims.glb')
    with bpy.context.temp_override(**ctx()), contextlib.redirect_stdout(QUIET), contextlib.redirect_stderr(QUIET):
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=True,
                                  export_animation_mode='ACTIONS', export_yup=True, export_force_sampling=True, export_optimize_animation_size=True)
    return {'anims': sorted(a.name for a in bpy.data.actions), 'kb': round(os.path.getsize(path) / 1024)}
