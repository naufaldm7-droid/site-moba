# SITE CLASH — generator aset dunia (Blender): alat berat (dozer & excavator), turret/base, hewan minion,
# serta pengolahan model foto-scan Poly Haven (CC0) menjadi GLB ringan.
# Geometri diekspor dengan UV kotak (meter) + NAMA material; tekstur PBR dipasang di client (client/world.js: MATLIB).
# Pakai (setelah build_heroes.py di-exec):  build_machines(); build_structures(); build_animals(); build_scatter(); build_plants()
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

PROPS_OUT = ROOT + r"\client\assets\props"
PH = ROOT + r"\_vendor_assets\polyhaven\models"
_mats = {}


def nmat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name); m.use_nodes = True
    return m


class Part:
    """Bagian model. Semua koordinat ditulis di ruang dunia; pivot = titik putar node."""
    def __init__(self, name, parent=None, pivot=(0, 0, 0)):
        self.name, self.parent, self.pivot = name, parent, Vector(pivot)
        self.bm = bmesh.new(); self.mats = []; self.smooth = set()

    def mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)

    def _mark(self, vs, smooth):
        if smooth:
            for f in {f for v in vs for f in v.link_faces}: self.smooth.add(f)
        return vs

    def box(self, size, loc, mat, rx=0, ry=0, rz=0):
        rot = (Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X')).to_euler() if (rx or ry or rz) else None
        return add_box(self.bm, size, loc=loc, mat=self.mi(mat), rot=rot)

    def cyl(self, r1, r2, depth, loc, mat, axis='Z', seg=14):
        return self._mark(add_cyl(self.bm, r1, r2, depth, loc=loc, mat=self.mi(mat), axis=axis, seg=seg), True)

    def sph(self, r, loc, mat, scale=(1, 1, 1), seg=14):
        return self._mark(add_sphere(self.bm, r, loc=loc, scale=scale, mat=self.mi(mat), seg=seg), True)

    def tor(self, R, r, loc, mat, axis='Z'):
        return self._mark(add_torus(self.bm, R, r, loc=loc, mat=self.mi(mat), axis=axis, seg=18, seg2=6), True)

    def strut(self, a, b, r, mat, seg=6, r2=None):
        a, b = Vector(a), Vector(b); d = b - a; L_ = d.length
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=L_)
        vs = res['verts']
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4(), verts=vs)
        for f in {f for v in vs for f in v.link_faces}: f.material_index = self.mi(mat)
        return self._mark(vs, seg > 6)

    def beam(self, a, b, w, h, mat):
        """balok kotak dari a ke b (lebar w arah X lokal, tinggi h)."""
        a, b = Vector(a), Vector(b); d = b - a; L_ = d.length
        vs = bmesh.ops.create_cube(self.bm, size=1.0)['verts']
        q = Vector((0, 1, 0)).rotation_difference(d.normalized())
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((w, L_, h, 1)), verts=vs)
        for f in {f for v in vs for f in v.link_faces}: f.material_index = self.mi(mat)
        return vs

    def done(self):
        bm = self.bm
        bmesh.ops.transform(bm, matrix=Matrix.Translation(-self.pivot), verts=bm.verts)
        bm.normal_update()
        uv = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            f.smooth = f in self.smooth and len(f.verts) <= 4
            for l in f.loops:
                c = l.vert.co + self.pivot
                l[uv].uv = ((c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y))
                l[uv].uv = (l[uv].uv[0] * 0.5, l[uv].uv[1] * 0.5)   # 1 ubin tekstur = 2 m
        me = bpy.data.meshes.new(self.name); bm.to_mesh(me); bm.free()
        for m in self.mats: me.materials.append(nmat(m))
        o = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(o)
        o.location = self.pivot
        bpy.context.view_layer.update()
        if self.parent:
            o.parent = self.parent; o.matrix_parent_inverse = self.parent.matrix_world.inverted()
        self.obj = o
        return o


def export(name, scale=1.0):
    os.makedirs(PROPS_OUT, exist_ok=True)
    roots = [o for o in bpy.data.objects if o.parent is None]
    if scale != 1.0:
        for o in roots: o.scale = (scale,) * 3; o.location = o.location * scale
    for o in bpy.data.objects: o.select_set(True)
    path = os.path.join(PROPS_OUT, name + '.glb')
    with bpy.context.temp_override(**ctx()), contextlib.redirect_stdout(QUIET), contextlib.redirect_stderr(QUIET):
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=False, export_yup=True, export_image_format='JPEG')
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    return {name: [tris, round(os.path.getsize(path) / 1024)]}


def track(p, sx, length, y0, h=0.95, w=0.75):
    """rantai track: sabuk + roda + grouser (tapak)."""
    p.box((w, length - h, h), (sx, y0, h / 2), 'Track')
    for ye in (y0 - (length - h) / 2, y0 + (length - h) / 2):
        p.cyl(h / 2, h / 2, w, (sx, ye, h / 2), 'Track', axis='X', seg=16)
        p.cyl(h * 0.36, h * 0.36, w + 0.06, (sx, ye, h / 2), 'Steel', axis='X', seg=12)
    n = int(length / 0.42)
    for i in range(n):
        y = y0 - (length - h) / 2 + (i + 0.5) * (length - h) / n
        p.box((w + 0.08, 0.1, 0.07), (sx, y, h + 0.02), 'Steel'); p.box((w + 0.08, 0.1, 0.07), (sx, y, -0.01), 'Steel')
    for i in range(5):
        y = y0 - (length - h) / 2 + (i + 0.5) * (length - h) / 5
        p.cyl(0.17, 0.17, w + 0.1, (sx, y, 0.2), 'Steel', axis='X', seg=10)
    p.box((w * 0.5, length - h - 0.3, 0.32), (sx * 1.0, y0, h * 0.55), 'Paint')


def glass_box(p, size, loc):
    """kabin: rangka cat + kaca di 4 sisi."""
    sx, sy, sz = size; x, y, z = loc
    p.box(size, loc, 'Paint')
    p.box((sx - 0.25, 0.04, sz * 0.55), (x, y - sy / 2 - 0.02, z + sz * 0.12), 'Glass')
    p.box((sx - 0.25, 0.04, sz * 0.45), (x, y + sy / 2 + 0.02, z + sz * 0.15), 'Glass')
    for s in (-1, 1): p.box((0.04, sy - 0.3, sz * 0.5), (x + s * (sx / 2 + 0.02), y, z + sz * 0.14), 'Glass')
    p.box((sx + 0.2, sy + 0.25, 0.1), (x, y, z + sz / 2 + 0.05), 'Dark')


def build_dozer():
    clear_scene()
    b = Part('Body')
    for sx in (-1.3, 1.3): track(b, sx, 5.4, 0.3)
    b.box((2.0, 4.6, 0.8), (0, 0.3, 1.1), 'Paint')
    b.box((1.55, 2.4, 1.15), (0, -1.25, 2.05), 'Paint')                    # kap mesin
    b.box((1.6, 0.12, 1.0), (0, -2.5, 2.0), 'Dark')                        # grill radiator
    for i in range(5): b.box((1.4, 0.14, 0.05), (0, -2.52, 1.62 + i * 0.19), 'Steel')
    for sx in (-1, 1):
        b.box((0.06, 2.0, 0.5), (sx * 0.8, -1.3, 2.05), 'Dark')            # panel samping mesin
        b.box((0.5, 1.3, 0.12), (sx * 1.3, 0.9, 1.56), 'Dark')             # pijakan
    b.cyl(0.085, 0.085, 1.5, (0.45, -1.0, 3.2), 'Dark'); b.box((0.2, 0.2, 0.03), (0.45, -1.0, 3.96), 'Dark', rx=0.5)   # knalpot
    b.cyl(0.16, 0.16, 0.35, (-0.45, -1.6, 2.8), 'Dark')                    # pre-cleaner
    glass_box(b, (1.65, 1.55, 1.5), (0, 0.75, 2.65))
    for sx in (-0.9, 0.9):
        for y in (-0.05, 1.55): b.box((0.12, 0.12, 1.75), (sx, y, 2.6), 'Dark')   # ROPS
    b.box((1.8, 0.95, 1.05), (0, 2.05, 1.95), 'Paint')                     # tangki belakang
    b.box((1.84, 0.4, 0.12), (0, 2.3, 2.5), 'Hazard')
    for sx in (-0.6, 0.6): b.box((0.22, 0.1, 0.16), (sx, -0.05, 3.5), 'Light')
    b.box((0.22, 0.1, 0.16), (0, 1.6, 3.5), 'Light')
    b.done()
    bl = Part('Blade', b.obj, pivot=(0, -1.0, 0.75))
    for sx in (-1.75, 1.75): bl.beam((sx, -0.6, 0.7), (sx, -3.1, 0.55), 0.22, 0.32, 'Paint')
    for i in range(7):                                                      # bilah melengkung (7 segmen)
        a = -0.6 + i * 0.2
        bl.box((4.6, 0.12, 0.3), (0, -3.25 - math.cos(a * 1.4) * 0.28 + 0.28, 0.2 + i * 0.26), 'Steel', rx=-a * 0.9)
    bl.box((4.6, 0.36, 0.1), (0, -3.42, 0.06), 'Edge')
    bl.box((4.6, 0.3, 0.1), (0, -3.3, 1.98), 'Paint', rx=0.5)
    for sx in (-2.3, 2.3): bl.box((0.12, 0.7, 1.95), (sx, -3.2, 1.0), 'Steel')
    for sx in (-0.95, 0.95):
        bl.strut((sx, -1.9, 2.3), (sx, -3.05, 1.35), 0.11, 'Paint', seg=8); bl.strut((sx, -2.5, 1.85), (sx, -3.1, 1.3), 0.06, 'Chrome', seg=8)
    bl.done()
    rp = Part('Ripper', b.obj, pivot=(0, 2.5, 1.3))
    rp.beam((0, 2.5, 1.35), (0, 3.5, 1.15), 0.9, 0.35, 'Paint')
    for sx in (-0.3, 0.3): rp.box((0.16, 0.34, 1.45), (sx, 3.55, 0.6), 'Steel', rx=-0.25); rp.box((0.18, 0.4, 0.3), (sx, 3.38, -0.05), 'Edge', rx=-0.6)
    rp.strut((0, 2.5, 2.2), (0, 3.4, 1.4), 0.09, 'Chrome', seg=8)
    rp.done()
    return export('dozer', 0.78)


def build_excavator():
    clear_scene()
    u = Part('Under')
    for sx in (-1.55, 1.55): track(u, sx, 5.8, 0.0, h=1.0, w=0.8)
    u.box((2.6, 2.0, 0.55), (0, 0, 0.75), 'Dark')
    u.cyl(1.15, 1.15, 0.3, (0, 0, 1.15), 'Steel', seg=20)
    u.done()
    up = Part('Upper', u.obj, pivot=(0, 0, 1.3))
    up.box((3.1, 4.4, 0.42), (0, 0.6, 1.55), 'Paint')
    up.box((3.1, 2.3, 1.45), (0, 1.75, 2.5), 'Paint')                      # rumah mesin
    up.box((3.14, 0.75, 1.35), (0, 3.15, 2.25), 'Dark')                    # counterweight
    up.box((3.16, 0.3, 0.18), (0, 3.45, 2.65), 'Hazard')
    for i in range(6): up.box((0.05, 1.5, 0.06), (1.56, 1.7, 1.95 + i * 0.2), 'Dark')   # kisi-kisi
    up.cyl(0.09, 0.09, 1.0, (1.0, 2.3, 3.7), 'Dark'); up.box((0.9, 0.9, 0.2), (-0.6, 1.6, 3.3), 'Dark')
    glass_box(up, (1.15, 1.7, 1.75), (-0.95, -0.85, 2.65))
    for a, c in (((0.9, -1.4, 1.75), (0.9, -1.4, 2.6)), ((0.9, 0.5, 1.75), (0.9, 0.5, 2.6)), ((0.9, -1.4, 2.6), (0.9, 0.5, 2.6))): up.strut(a, c, 0.03, 'Dark')
    for sx in (0.05, 0.75): up.box((0.14, 0.7, 0.9), (sx, -1.0, 2.1), 'Paint')    # dudukan boom
    up.box((0.25, 0.1, 0.18), (-0.95, -1.75, 3.6), 'Light'); up.box((0.25, 0.1, 0.18), (1.2, -1.5, 1.95), 'Light')
    up.done()
    P0, P1, P2 = Vector((0.4, -1.0, 2.2)), Vector((0.4, -3.9, 5.7)), Vector((0.4, -6.9, 5.2))
    bo = Part('Boom', up.obj, pivot=P0)
    bo.beam(P0, P1, 0.6, 0.85, 'Paint'); bo.beam(P1, P2, 0.6, 0.75, 'Paint')
    bo.box((0.7, 0.9, 0.9), P1, 'Paint', rx=0.5)
    for sx in (0.0, 0.8):
        bo.strut((sx, -1.9, 1.95), (sx, -3.0, 4.1), 0.13, 'Paint', seg=8); bo.strut((sx, -2.6, 3.3), (sx, -3.3, 4.6), 0.07, 'Chrome', seg=8)
    bo.strut((0.4, -4.3, 6.35), (0.4, -6.2, 6.0), 0.13, 'Paint', seg=8); bo.strut((0.4, -5.6, 6.1), (0.4, -7.2, 5.75), 0.07, 'Chrome', seg=8)
    bo.done()
    A1 = Vector((0.4, -8.3, 1.9))
    ar = Part('Arm', bo.obj, pivot=P2)
    ar.beam(P2 + Vector((0, 0.5, 0.6)), A1, 0.48, 0.6, 'Paint')
    ar.strut((0.4, -7.3, 4.9), (0.4, -8.6, 2.7), 0.1, 'Paint', seg=8); ar.strut((0.4, -8.1, 3.5), (0.4, -8.75, 2.3), 0.06, 'Chrome', seg=8)
    ar.done()
    bk = Part('Bucket', ar.obj, pivot=A1)
    for i in range(6):                                                      # cangkang bucket melengkung
        a = math.radians(-20 + i * 38)
        bk.box((1.5, 0.5, 0.09), (0.4, A1.y + math.sin(a) * 0.75 - 0.2, A1.z - 0.75 + math.cos(a) * -0.0 - math.cos(a) * 0.75 + 0.75), 'Steel', rx=-a)
    for sx in (-0.37, 1.17): bk.box((0.08, 1.3, 1.2), (sx, A1.y - 0.25, A1.z - 0.65), 'Steel')
    for i in range(5): bk.box((0.16, 0.5, 0.12), (-0.2 + i * 0.3, A1.y - 1.05, A1.z - 1.3), 'Edge', rx=0.5)
    bk.done()
    return export('excavator', 0.8)


def build_machines():
    out = {}; out.update(build_dozer()); out.update(build_excavator()); return out


# ------------------------------------------------------------------ struktur
def lattice(p, half0, half1, z0, z1, levels, r_leg, r_br, mat='Rust'):
    c = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for x, y in c: p.strut((x * half0, y * half0, z0), (x * half1, y * half1, z1), r_leg, mat, seg=8)
    for lv in range(levels):
        t0, t1 = lv / levels, (lv + 1) / levels
        k0, k1 = half0 + (half1 - half0) * t0, half0 + (half1 - half0) * t1
        za, zb = z0 + (z1 - z0) * t0, z0 + (z1 - z0) * t1
        for i in range(4):
            a, b2 = c[i], c[(i + 1) % 4]
            p.strut((a[0] * k0, a[1] * k0, za), (b2[0] * k1, b2[1] * k1, zb), r_br, mat)
            p.strut((b2[0] * k0, b2[1] * k0, za), (a[0] * k1, a[1] * k1, zb), r_br, mat)
            p.strut((a[0] * k1, a[1] * k1, zb), (b2[0] * k1, b2[1] * k1, zb), r_br, mat)


def build_water_tower():
    clear_scene()
    H = 7.0
    b = Part('Body')
    b.box((4.2, 4.2, 0.35), (0, 0, 0.17), 'Concrete')
    for x, y in ((-1.5, -1.5), (1.5, -1.5), (1.5, 1.5), (-1.5, 1.5)): b.box((0.7, 0.7, 0.5), (x, y, 0.45), 'Concrete')
    lattice(b, 1.5, 1.15, 0.6, H, 3, 0.11, 0.045)
    b.box((3.5, 3.5, 0.14), (0, 0, H + 0.07), 'Plate')
    for i in range(4):                                                      # railing
        a = [(-1.7, -1.7), (1.7, -1.7), (1.7, 1.7), (-1.7, 1.7)]; p0, p1 = a[i], a[(i + 1) % 4]
        for z in (H + 0.55, H + 1.0): b.strut((p0[0], p0[1], z), (p1[0], p1[1], z), 0.025, 'Rust')
        b.strut((p0[0], p0[1], H), (p0[0], p0[1], H + 1.0), 0.03, 'Rust')
    b.cyl(1.5, 1.5, 2.5, (0, 0, H + 1.45), 'Tank', seg=24)
    b.cyl(1.5, 0.25, 0.75, (0, 0, H + 3.07), 'Tank', seg=24)
    b.cyl(0.3, 0.3, 0.12, (0, 0, H + 3.48), 'Rust')
    for z in (H + 0.5, H + 1.45, H + 2.4): b.tor(1.52, 0.04, (0, 0, z), 'Rust')
    b.cyl(1.53, 1.53, 0.4, (0, 0, H + 1.9), 'Team', seg=24)
    for i in range(22):                                                     # tangga
        b.strut((-0.25, 1.62, 0.7 + i * 0.42), (0.25, 1.62, 0.7 + i * 0.42), 0.02, 'Rust')
    for sx in (-0.25, 0.25): b.strut((sx, 1.62, 0.5), (sx, 1.62, H + 2.6), 0.03, 'Rust')
    b.strut((1.0, -1.0, 0.4), (1.0, -1.0, H + 0.3), 0.13, 'Pipe', seg=10)   # riser
    b.strut((1.0, -1.0, 1.5), (1.0, -1.75, 1.5), 0.1, 'Pipe', seg=10)
    b.cyl(0.2, 0.2, 0.12, (1.0, -1.0, 2.4), 'Rust', seg=10); b.cyl(0.2, 0.2, 0.12, (1.0, -1.0, 4.6), 'Rust', seg=10)
    b.cyl(0.17, 0.17, 0.08, (0.7, -1.3, H + 0.75), 'Gauge', axis='Y')
    b.done()
    v = Part('Valve', b.obj, pivot=(1.0, -1.85, 1.5))
    v.tor(0.32, 0.04, (1.0, -1.85, 1.5), 'Red', axis='Y')
    for a in range(3): v.strut((1.0 + math.cos(a * 2.09) * 0.3, -1.85, 1.5 + math.sin(a * 2.09) * 0.3), (1.0, -1.85, 1.5), 0.025, 'Red')
    v.done()
    h = Part('Head', b.obj, pivot=(0, 0, H + 0.6))
    h.cyl(0.42, 0.5, 0.5, (0, 0, H + 0.42), 'Dark', seg=14); h.sph(0.42, (0, 0, H + 0.7), 'Dark')
    h.strut((0, -0.2, H + 0.75), (0, -2.5, H + 0.75), 0.17, 'Dark', seg=12, r2=0.13); h.cyl(0.2, 0.2, 0.25, (0, -2.5, H + 0.75), 'Rust', axis='Y', seg=12)
    h.strut((0.3, -0.2, H + 0.55), (0.3, -1.6, H + 0.6), 0.05, 'Pipe')
    h.done()
    return export('tower_water')


def build_lightning_tower():
    clear_scene()
    H = 10.0
    b = Part('Body')
    b.box((3.6, 3.6, 0.35), (0, 0, 0.17), 'Concrete')
    lattice(b, 1.3, 0.35, 0.35, H, 5, 0.1, 0.04)
    b.box((0.95, 0.95, 0.12), (0, 0, H + 0.06), 'Plate')
    for z in (5.0, 7.6):                                                    # lengan silang + isolator
        k = 1.3 + (0.35 - 1.3) * (z - 0.35) / (H - 0.35)
        b.strut((-k - 1.1, 0, z), (k + 1.1, 0, z), 0.06, 'Rust')
        for sx in (-1, 1):
            for i in range(4): b.cyl(0.16, 0.1, 0.09, (sx * (k + 1.0), 0, z - 0.15 - i * 0.13), 'Ceramic', seg=10)
    for i in range(6): b.cyl(0.3 - i * 0.02, 0.2 - i * 0.02, 0.14, (0, 0, H + 0.25 + i * 0.2), 'Ceramic', seg=14)
    b.cyl(0.11, 0.11, 1.3, (0, 0, H + 0.75), 'Ceramic')
    b.box((1.3, 0.9, 1.3), (1.75, 1.2, 1.0), 'Tank')                        # trafo
    for i in range(6): b.box((0.05, 1.0, 1.0), (1.25 + i * 0.2, 1.2, 1.0), 'Dark')
    for sx in (1.45, 2.05): b.cyl(0.07, 0.05, 0.4, (sx, 1.2, 1.85), 'Ceramic')
    b.strut((0.3, 0.3, H), (1.6, 1.2, 2.0), 0.03, 'Copper'); b.strut((-0.3, -0.3, H), (-1.6, -1.5, 0.3), 0.03, 'Copper')
    b.cyl(1.25, 1.25, 0.3, (0, 0, 0.5), 'Team', seg=18)
    b.box((0.7, 0.04, 0.5), (0, -1.33, 1.6), 'Hazard')
    b.done()
    s = Part('Spear', b.obj, pivot=(0, 0, H + 1.4))
    s.cyl(0.06, 0.06, 1.7, (0, 0, H + 2.2), 'Copper'); s.cyl(0.13, 0.0, 0.7, (0, 0, H + 3.4), 'Copper')
    s.sph(0.26, (0, 0, H + 1.95), 'Copper')
    for a in range(4): s.strut((0, 0, H + 2.7), (math.cos(a * 1.57) * 0.45, math.sin(a * 1.57) * 0.45, H + 3.15), 0.025, 'Copper')
    s.done()
    return export('tower_lightning')


def build_office():
    clear_scene()
    b = Part('Body')
    b.box((9.0, 6.2, 0.2), (0, 0, 0.1), 'Concrete')
    for z, y in ((1.5, -1.3), (1.5, 1.3), (4.15, -1.3), (4.15, 1.3)):
        b.box((7.3, 2.45, 2.6), (0.15 * (1 if y > 0 else -1), y, z), 'Container')
        for x in (-2.5, 0, 2.5):
            yy = y + (1.25 if y > 0 else -1.25)
            b.box((1.2, 0.06, 0.9), (x, yy, z + 0.25), 'Window'); b.box((1.36, 0.08, 0.08), (x, yy, z - 0.25), 'Dark')
    b.box((2.45, 6.1, 2.6), (0.4, 0, 6.8), 'Container')
    for sx in (-1, 1): b.box((0.06, 1.3, 0.9), (0.4 + sx * 1.25, 0, 7.05), 'Window')
    b.box((1.0, 0.06, 2.0), (2.8, -2.55, 1.25), 'Dark')                     # pintu
    for i in range(10): b.box((0.95, 0.36, 0.06), (-4.25, -2.4 + i * 0.36, 0.45 + i * 0.27), 'Plate')   # tangga luar
    for sx in (-4.72, -3.78): b.strut((sx, -2.6, 0.2), (sx, 0.85, 2.95), 0.035, 'Rust'); b.strut((sx, -2.6, 1.1), (sx, 0.85, 3.85), 0.03, 'Rust')
    b.box((1.6, 1.4, 0.1), (-4.25, 1.5, 2.85), 'Plate')
    for y in (-2.0, 2.0): b.box((0.85, 0.4, 0.65), (3.3, y * 1.33, 3.3), 'Tank'); b.cyl(0.24, 0.24, 0.05, (3.3, y * 1.33 + (0.22 if y > 0 else -0.22), 3.3), 'Dark', axis='Y')
    b.box((1.4, 0.9, 1.0), (2.2, 1.9, 5.95), 'Tank')                        # genset atap
    b.cyl(0.6, 0.6, 1.3, (-2.4, 1.6, 6.1), 'Tank', seg=14)                  # tandon
    for x, y in ((-3.3, -2.3), (-3.3, 2.3), (3.5, -2.3), (3.5, 2.3)):
        b.strut((x, y, 5.45), (x, y, 7.2), 0.04, 'Rust'); b.box((0.55, 0.22, 0.4), (x, y - 0.1 * (1 if y < 0 else -1), 7.35), 'Flood')
    for sx in (-1.6, 1.6): b.strut((0.4 + sx * 0.6, -3.0, 8.1), (0.4 + sx * 0.6, -3.0, 9.6), 0.05, 'Rust')
    b.cyl(4.6, 4.6, 0.1, (0, 0, 0.26), 'Team', seg=28)
    b.done()
    sg = Part('Sign', b.obj, pivot=(0.4, -3.05, 9.0)); sg.box((4.4, 0.08, 1.15), (0.4, -3.0, 9.0), 'Dark'); sg.done()
    an = Part('Antenna', b.obj, pivot=(0.4, 2.2, 8.1))
    an.strut((0.4, 2.2, 8.1), (0.4, 2.2, 10.9), 0.05, 'Rust')
    for z in (9.2, 10.0, 10.6): an.strut((0.0, 2.2, z), (0.8, 2.2, z), 0.02, 'Rust')
    an.cyl(0.55, 0.1, 0.25, (0.4, 1.9, 9.6), 'Tank', axis='Y', seg=14)
    an.done()
    return export('office')


def build_structures():
    out = {}; out.update(build_water_tower()); out.update(build_lightning_tower()); out.update(build_office()); return out


# ------------------------------------------------------------------ hewan (maju = -Y)
def quadruped(name, L_, H, girth, head, snout, ear, tail, vest=False, cart=False):
    clear_scene()
    b = Part('Body')
    zc = H - girth * 0.95                                                   # pusat badan
    b.sph(1, (0, -L_ * 0.2, zc + girth * 0.05), 'Fur', scale=(girth * 0.9, L_ * 0.32, girth * 1.0), seg=18)     # dada
    b.sph(1, (0, L_ * 0.2, zc), 'Fur', scale=(girth * 0.78, L_ * 0.34, girth * 0.85), seg=18)                   # perut-pinggul
    b.sph(1, (0, L_ * 0.4, zc + girth * 0.05), 'Fur', scale=(girth * 0.75, L_ * 0.16, girth * 0.82), seg=14)    # pantat
    b.strut((0, -L_ * 0.38, zc + girth * 0.35), (0, -L_ * 0.56, H + head * 0.55), girth * 0.55, 'Fur', seg=12, r2=head * 0.62)   # leher
    if vest:
        b.cyl(girth * 0.97, girth * 0.9, L_ * 0.34, (0, -L_ * 0.1, zc + girth * 0.02), 'Team', axis='Y', seg=18)
        b.cyl(girth * 0.99, girth * 0.99, L_ * 0.05, (0, -L_ * 0.1, zc + girth * 0.02), 'Reflect', axis='Y', seg=18)
    else:
        b.tor(head * 0.66, head * 0.1, (0, -L_ * 0.5, H + head * 0.3), 'Team', axis='Y')   # kalung
    b.done()
    hy, hz = -L_ * 0.6, H + head * 0.75
    h = Part('Head', b.obj, pivot=(0, -L_ * 0.5, H + head * 0.4))
    h.sph(head, (0, hy, hz), 'Fur', scale=(0.95, 1.05, 0.9), seg=16)
    h.sph(head * 0.62, (0, hy - head * 0.75 - snout * 0.3, hz - head * 0.25), 'FurLight', scale=(0.85, 0.7 + snout, 0.65), seg=12)
    h.sph(head * 0.17, (0, hy - head * 0.75 - snout * 0.3 - head * 0.62 * (0.7 + snout) * 0.93, hz - head * 0.2), 'Nose', seg=8)
    for sx in (-1, 1):
        h.sph(head * 0.13, (sx * head * 0.42, hy - head * 0.78, hz + head * 0.12), 'Eye', seg=8)
        if ear == 'cat':
            vs = h.cyl(head * 0.36, 0.0, head * 0.75, (sx * head * 0.55, hy + head * 0.1, hz + head * 0.95), 'FurDark', seg=6)
        elif ear == 'prick':
            vs = h.cyl(head * 0.3, 0.0, head * 0.85, (sx * head * 0.5, hy + head * 0.2, hz + head * 1.0), 'FurDark', seg=6)
        else:
            h.box((head * 0.16, head * 0.5, head * 0.75), (sx * head * 0.92, hy + head * 0.1, hz + head * 0.05), 'FurDark', ry=sx * 0.3)
    h.done()
    lw = girth * 0.42
    for nm, sx, y in (('LegFL', 1, -L_ * 0.27), ('LegFR', -1, -L_ * 0.27), ('LegBL', 1, L_ * 0.33), ('LegBR', -1, L_ * 0.33)):
        back = y > 0
        top = zc - girth * 0.15
        g = Part(nm, b.obj, pivot=(sx * girth * 0.55, y, top + girth * 0.3))
        kn = (sx * girth * 0.55, y + (H * 0.12 if back else -H * 0.02), top * 0.52)
        g.sph(lw * (1.75 if back else 1.45), (sx * girth * 0.55, y, top + girth * 0.25), 'Fur', scale=(0.8, 1.25, 1.5), seg=10)
        g.strut((sx * girth * 0.55, y, top + girth * 0.1), kn, lw * 1.05, 'Fur', seg=10, r2=lw * 0.72)
        g.strut(kn, (sx * girth * 0.55, y + (-H * 0.04 if back else 0), lw * 0.5), lw * 0.7, 'Fur', seg=10, r2=lw * 0.55)
        g.sph(lw * 0.85, (sx * girth * 0.55, y - lw * 0.5 + (-H * 0.04 if back else 0), lw * 0.45), 'FurLight', scale=(0.9, 1.35, 0.55), seg=10)
        g.done()
    t = Part('Tail', b.obj, pivot=(0, L_ * 0.5, zc + girth * 0.35))
    pts = [(0, L_ * 0.5, zc + girth * 0.35)]
    for i in range(1, 6):
        a = i / 5
        pts.append((0, L_ * 0.5 + tail * a * (0.8 if ear == 'cat' else 0.9), zc + girth * 0.35 + tail * (a * a * 0.55 - a * 0.1 if ear == 'cat' else -a * 0.25 + a * a * 0.45)))
    for i in range(5): t.strut(pts[i], pts[i + 1], lw * (0.5 - i * 0.05), 'FurDark' if i > 2 else 'Fur', seg=8, r2=lw * (0.45 - i * 0.05))
    t.done()
    if cart:
        c = Part('Cart', b.obj, pivot=(0, L_ * 0.6, 0.5))
        y0 = L_ * 0.6 + 1.3
        c.box((1.3, 1.9, 0.12), (0, y0, 0.62), 'Wood');
        for sx in (-1, 1):
            c.box((0.08, 1.9, 0.4), (sx * 0.65, y0, 0.85), 'Wood'); c.cyl(0.42, 0.42, 0.14, (sx * 0.8, y0 + 0.1, 0.42), 'Track', axis='X', seg=16)
            c.strut((sx * 0.45, y0 - 0.95, 0.65), (sx * 0.35, L_ * 0.3, zc), 0.035, 'Rust')
        for i in range(4): c.box((0.22, 1.8, 0.22), (-0.42 + i * 0.28, y0, 0.8 + (i % 2) * 0.05), 'Rust', rz=(i - 1.5) * 0.04)
        for i in range(3): c.box((0.22, 1.7, 0.22), (-0.28 + i * 0.28, y0 + 0.05, 1.04), 'Rust', rz=(1 - i) * 0.06)
        c.done()
    return export(name)


def build_animals():
    out = {}
    out.update(quadruped('cat', 1.2, 0.74, 0.23, 0.18, 0.05, 'cat', 0.7))
    out.update(quadruped('dog', 1.7, 1.1, 0.32, 0.22, 0.45, 'prick', 0.65, vest=True))
    out.update(quadruped('mastiff', 2.0, 1.32, 0.46, 0.33, 0.28, 'flop', 0.55, vest=True, cart=True))
    return out


# ------------------------------------------------------------------ Poly Haven -> GLB ringan
def _import_ph(model):
    clear_scene()
    return imp(os.path.join(PH, model, model + '.gltf'))


def _shrink_images(size):
    for img in bpy.data.images:
        if img.size[0] > size: img.scale(size, size)


def _decimate(o, target):
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris <= target: return
    md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = target / tris
    with bpy.context.temp_override(**ctx(), object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_apply(modifier=md.name)


def build_scatter():
    out = {}
    for model, name, target, tex in (('Barrel_01', 'barrel', 700, 512), ('old_tyre', 'tyre', 600, 512), ('concrete_road_barrier', 'barrier', 900, 512),
                                     ('wooden_crate_02', 'crate', 700, 512), ('trashbag', 'trashbag', 600, 256), ('portable_generator', 'generator', 2500, 512)):
        objs = [o for o in _import_ph(model) if o.type == 'MESH']
        for o in objs: _decimate(o, max(120, target // len(objs)))
        _shrink_images(tex)
        out.update(export(name))
    return out


def build_plants():
    """ambil beberapa varian tiap tanaman, perkecil poligon, gabung dalam satu GLB (nama mesh = jenis)."""
    picks = {'grass_medium_01': (('tall_a', 'grassTallA'), ('tall_b', 'grassTallB'), ('mid_b', 'grassMidA'), ('small_a', 'grassSmallA')),
             'grass_medium_02': (('_a', 'grassDryA'), ('_c', 'grassDryB')),
             'nettle_plant': (('tall_a', 'nettleA'), ('medium_a', 'nettleB')),
             'weed_plant_02': (('_a_', 'weedA'), ('_c_', 'weedB')),
             'dandelion_01': (('_a_', 'dandelionA'), ('_c_', 'dandelionB')),
             'shrub_sorrel_01': (('_a', 'sorrelA'), ('_d', 'sorrelB'))}
    out = {}
    for model, sel in picks.items():
        objs = [o for o in _import_ph(model) if o.type == 'MESH']
        keep = []
        for key, new in sel:
            o = next((x for x in objs if key in x.name + '_'), None)
            if not o: continue
            _decimate(o, 320); o.name = new; o.data.name = new
            o.location = (0, 0, 0); keep.append(o)
        for o in list(bpy.data.objects):
            if o not in keep: bpy.data.objects.remove(o, do_unlink=True)
        _shrink_images(512)
        out.update(export('plant_' + model))
    return out


def preview(name, dist=14, center=(0, 0, 2), yaw=-35, size=(900, 700)):
    """render pratinjau scene saat ini (warna datar per nama material) ke _vendor_assets/preview/<name>.png"""
    COL = {'Paint': '#d9a21b', 'Track': '#2a2622', 'Steel': '#7a756c', 'Dark': '#2b2b2b', 'Glass': '#2a3a48', 'Hazard': '#e2b21c', 'Light': '#fff2c0', 'Edge': '#b8b2a6', 'Chrome': '#d8dde2',
           'Rust': '#7a4a32', 'Concrete': '#9a948a', 'Plate': '#5a5f58', 'Tank': '#aab2b6', 'Team': '#3d8bff', 'Pipe': '#8a9298', 'Gauge': '#ffffff', 'Red': '#c42a2a', 'Ceramic': '#e8dcc8', 'Copper': '#c8743a',
           'Container': '#4b6f9e', 'Window': '#6fa8ff', 'Flood': '#fff2c0', 'Fur': '#b0703a', 'FurLight': '#e8d8c0', 'FurDark': '#5a3a22', 'Nose': '#1a1210', 'Eye': '#b8ff5a', 'Reflect': '#e8e8e8', 'Wood': '#7a5a3a'}
    for m in bpy.data.materials:
        if m.name in COL and m.use_nodes:
            p = m.node_tree.nodes.get('Principled BSDF')
            if p: p.inputs['Base Color'].default_value = (*lin(COL[m.name]), 1); p.inputs['Roughness'].default_value = 0.6
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = size
    if not sc.world: sc.world = bpy.data.worlds.new('World')
    sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.25, 0.22, 0.2, 1)
    cam = bpy.data.objects.new('PrevCam', bpy.data.cameras.new('PrevCam')); sc.collection.objects.link(cam); sc.camera = cam
    c = Vector(center); a = math.radians(yaw)
    cam.location = c + Vector((math.sin(a) * dist, -math.cos(a) * dist, dist * 0.45))
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 50
    sun = bpy.data.objects.new('PrevSun', bpy.data.lights.new('PrevSun', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 4; sun.rotation_euler = (math.radians(50), 0, math.radians(-40))
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    sc.render.filepath = os.path.join(PREVIEW_DIR, name + '.png')
    bpy.ops.render.render(write_still=True)
    for n in ('PrevCam', 'PrevSun'): bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    return sc.render.filepath
