// SITE CLASH — dunia laydown kontainer yang realistis & kumuh.
// Tekstur PBR, model foto-scan & HDRI: Poly Haven (CC0). Model alat berat/turret/hewan: tools/blender/build_props.py.
import * as THREE from 'three';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from '/vendor/jsm/loaders/HDRLoader.js';
import { mergeGeometries } from '/vendor/jsm/utils/BufferGeometryUtils.js';
import { laneProject } from '/shared/data.js';

const TL = new THREE.TextureLoader();
const GL = new GLTFLoader();
const UP = new THREE.Vector3(0, 1, 0);
const TEAM_PAINT = ['#2f6fd0', '#c8382e', '#8a8f96'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const inRects = (x, z, rects, pad = 0) => rects.some((r) => x >= r.x1 - pad && x <= r.x2 + pad && z >= r.z1 - pad && z <= r.z2 + pad);

// ------------------------------------------------------------------ tekstur & material
const imgCache = new Map();
function tex(file, { srgb = false, rep = 1, aniso = 8 } = {}) {
  let base = imgCache.get(file);
  if (!base) {
    let done; const ready = new Promise((r) => { done = r; });
    base = TL.load('assets/tex/' + file, () => { base.userData.ok = true; for (const c of base.userData.clones) c.needsUpdate = true; done(); }, undefined, () => done());
    base.userData.clones = []; base.userData.ready = ready; imgCache.set(file, base);
  }
  const t = base.clone(); t.userData = { ready: base.userData.ready };
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (base.userData.ok) t.needsUpdate = true; else base.userData.clones.push(t);
  return t;
}
export function pbr(name, { rep = 1, color = '#ffffff', metal = true, rough = 1, normalScale = 1, extra = {} } = {}) {
  const arm = tex(name + '_arm.jpg', { rep });
  const m = new THREE.MeshStandardMaterial({
    map: tex(name + '_diff.jpg', { srgb: true, rep }), normalMap: tex(name + '_nor.jpg', { rep }),
    roughnessMap: arm, aoMap: arm, roughness: rough, color, ...extra,
  });
  if (metal) { m.metalnessMap = arm; m.metalness = 1; } else m.metalness = 0;
  m.normalScale.set(normalScale, normalScale);
  return m;
}
function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// pustaka material untuk GLB dari Blender (dicocokkan lewat NAMA material; UV: 1 ubin = 2 m)
const libCache = new Map();
function libMat(name, team = 2) {
  const key = name + (name === 'Team' || name === 'Container' ? team : '');
  if (libCache.has(key)) return libCache.get(key);
  const P = (n, o) => pbr(n, o);
  const S = (color, rough, metal, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  let m;
  switch (name) {
    case 'Paint': m = P('rusty_metal_02', { color: '#e8ae22' }); break;                       // cat kuning alat berat, berkarat
    case 'Edge': m = P('rusty_metal_02', { color: '#c9c2b4' }); break;
    case 'Steel': m = P('rusty_painted_metal', { color: '#a59a90', rep: 0.7 }); break;
    case 'Rust': m = P('rusty_painted_metal', { color: '#b98f78', rep: 2 }); break;           // rangka baja karatan
    case 'Track': m = P('metal_plate', { color: '#4a443e' }); break;
    case 'Plate': m = P('metal_plate', { color: '#9a9f98', rep: 1.5 }); break;
    case 'Tank': m = P('rusty_metal_02', { color: '#c4ccd0', rep: 0.6 }); break;
    case 'Pipe': m = P('rusty_metal_02', { color: '#8f999f' }); break;
    case 'Red': m = P('rusty_metal_02', { color: '#d23a2a' }); break;
    case 'Team': m = P('rusty_metal_02', { color: TEAM_PAINT[team] }); break;
    case 'Concrete': m = P('dirty_concrete', { color: '#cfc9be', metal: false, rep: 0.6 }); break;
    case 'Container': m = new THREE.MeshStandardMaterial({ map: tex('container_albedo.jpg', { srgb: true, rep: 0.82 }), normalMap: tex('container_side_nor.jpg', { rep: 0.82 }), color: team === 0 ? '#3f6ea8' : team === 1 ? '#b0483c' : '#8a8f96', roughness: 0.62, metalness: 0.35 }); break;
    case 'Dark': m = S('#27272b', 0.55, 0.6); break;
    case 'Chrome': m = S('#e2e8ee', 0.12, 1); break;
    case 'Glass': m = S('#16222e', 0.06, 0.9); break;
    case 'Window': m = S('#1a2633', 0.15, 0.6, { emissive: '#ffd9a0', emissiveIntensity: 0.55 }); break;
    case 'Light': case 'Flood': m = S('#444444', 0.4, 0.2, { emissive: '#fff2c8', emissiveIntensity: name === 'Light' ? 2.2 : 0 }); break;
    case 'Gauge': m = S('#f4f4f0', 0.3, 0, { emissive: '#ffeeaa', emissiveIntensity: 0.3 }); break;
    case 'Ceramic': m = S('#e6d9c2', 0.22, 0); break;
    case 'Copper': m = S('#c8743a', 0.3, 1, { emissive: '#2a60ff', emissiveIntensity: 0 }); break;
    case 'Hazard': m = S('#ffffff', 0.7, 0.1, { map: (() => { const t = canvasTex(64, 64, (g) => { g.fillStyle = '#e2b21c'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#1a1a1a'; for (let i = -64; i < 64; i += 32) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 16, 64); g.lineTo(i + 80, 0); g.lineTo(i + 64, 0); g.fill(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t; })() }); break;
    case 'Wood': m = S('#6f4f32', 0.9, 0); break;
    case 'Fur': m = S('#a8682f', 0.95, 0); break;
    case 'FurLight': m = S('#e2d2b8', 0.95, 0); break;
    case 'FurDark': m = S('#4a3020', 0.95, 0); break;
    case 'Nose': m = S('#151010', 0.4, 0); break;
    case 'Eye': m = S('#c8ff6a', 0.3, 0, { emissive: '#9aff3a', emissiveIntensity: 1.2 }); break;
    case 'Reflect': m = S('#e8e8e8', 0.3, 0.6, { emissive: '#9a9a9a', emissiveIntensity: 0.5 }); break;
    default: m = S('#888888', 0.7, 0.2);
  }
  m.name = name;
  libCache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ GLB props
const propCache = new Map();
export function loadProp(name) {
  if (!propCache.has(name)) propCache.set(name, GL.loadAsync(`assets/props/${name}.glb`).then((g) => g.scene).catch((e) => { console.warn('prop gagal', name, e); return null; }));
  return propCache.get(name);
}
const UNIQUE = new Set(['Flood', 'Copper', 'Window', 'Light']);
// salinan model + material pustaka. opts.fur: warna bulu, opts.paint: warna cat
export async function makeProp(name, team = 2, opts = {}) {
  const src = await loadProp(name);
  if (!src) return null;
  const root = src.clone(true);
  const mats = {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    const apply = (mt) => {
      let m = libMat(mt.name, team);
      if (UNIQUE.has(mt.name) || (opts.fur && mt.name === 'Fur') || (opts.paint && mt.name === 'Paint')) {
        m = m.clone(); m.name = mt.name;
        if (opts.fur && mt.name === 'Fur') m.color.set(opts.fur);
        if (opts.paint && mt.name === 'Paint') m.color.set(opts.paint);
      }
      (mats[mt.name] = mats[mt.name] || []).push(m);
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(apply) : apply(o.material);
    o.castShadow = !opts.shadowNodes || opts.shadowNodes.includes(o.name) || opts.shadowNodes.includes(o.parent?.name); o.receiveShadow = true;
  });
  const node = (n) => root.getObjectByName(n) || null;
  return { root, mats, node };
}

// ------------------------------------------------------------------ pencahayaan & langit
export function setupEnvironment(R) {
  const pm = new THREE.PMREMGenerator(R.gl);
  new HDRLoader().load('assets/env/sky_1k.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = pm.fromEquirectangular(hdr).texture;
    R.scene.environment = env;
    R.scene.environmentIntensity = 1.0;
    hdr.dispose(); pm.dispose();
  });
}

// ------------------------------------------------------------------ kontainer
function containerGeo(len) {
  const H = 2.59, W = 2.44;
  const parts = [];
  const add = (g, col) => {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col; c[i * 3 + 1] = col; c[i * 3 + 2] = col; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(g);
  };
  const body = new THREE.BoxGeometry(len - 0.06, H - 0.06, W - 0.06);
  const uv = body.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const face = Math.floor(i / 4); if (face >= 2) uv.setX(i, uv.getX(i) * len / 2.5); }   // sisi panjang, atap, lantai
  add(body, 1);
  const bx = (sx, sy, sz, x, y, z, col = 0.3) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, 0.02, 0.02); add(g, col); };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    bx(0.16, H, 0.16, sx * (len / 2 - 0.08), 0, sz * (W / 2 - 0.08));
    for (const sy of [-1, 1]) bx(0.2, 0.14, 0.2, sx * (len / 2 - 0.09), sy * (H / 2 - 0.06), sz * (W / 2 - 0.09), 0.2);
  }
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) bx(len, 0.13, 0.13, 0, sy * (H / 2 - 0.065), sz * (W / 2 - 0.065));
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) bx(0.13, 0.13, W, sx * (len / 2 - 0.065), sy * (H / 2 - 0.065), 0);
  // pintu: batang pengunci & engsel di ujung +x
  for (const z of [-0.85, -0.3, 0.3, 0.85]) bx(0.05, H - 0.3, 0.05, len / 2 + 0.02, 0, z, 0.55);
  bx(0.03, H - 0.3, 0.03, len / 2 + 0.01, 0, 0, 0.15);
  for (const z of [-0.6, 0.6]) bx(0.05, 0.05, 0.4, len / 2 + 0.045, -0.2, z, 0.5);
  return mergeGeometries(parts, false);
}

const PALETTE = ['#a8492a', '#8f3b24', '#b3552c', '#355a86', '#2c4a6e', '#4a6f96', '#3f5d38', '#55683a', '#7a2a22', '#8a8d90', '#b8a23a', '#6a7480', '#9a6a3a', '#c9c2b0'];
const PAL = { orange: ['#b3552c', '#a8492a', '#c06a33', '#9a4424'], blue: ['#355a86', '#2c4a6e', '#4a6f96', '#3a5578'], green: ['#3f5d38', '#55683a', '#4a6a44', '#37502f'] };

function layoutContainers(M, R, laneD) {
  const list = [];
  const put = (x, z, len, yaw, lvl, color, o = {}) => list.push({ x, z, len, yaw, y: 1.295 + lvl * 2.6 + (o.dy || 0), color, tx: o.tx || 0, tz: o.tz || 0 });
  const jit = (a) => (R() - 0.5) * 2 * a;
  // dinding (ikut kotak tabrakan server): sedikit acak-acakan, tingkat atas lebih berantakan
  for (const w of M.walls) {
    const L = w.x2 - w.x1, D = w.z2 - w.z1, alongX = L >= D;
    const len = alongX ? L : D, dep = alongX ? D : L;
    const rows = Math.max(1, Math.round(dep / 2.5));
    const use20 = len < 11 || R() < 0.25;
    const unit = use20 ? 6.06 : 12.19, n = Math.max(1, Math.round(len / (unit + 0.15)));
    const pal = PAL[w.c] || PALETTE;
    const levels = w.stack + (R() < 0.3 ? 1 : 0);
    for (let lvl = 0; lvl < levels; lvl++) for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
      if (lvl > 0 && R() < (lvl === 1 ? 0.25 : 0.6)) continue;
      const a = (i + 0.5) / n, b = (r + 0.5) / rows, k = lvl ? 1 : 0.25;
      const x = (alongX ? w.x1 + L * a : w.x1 + L * b) + jit(0.3) * k, z = (alongX ? w.z1 + D * b : w.z1 + D * a) + jit(0.3) * k;
      const col = R() < 0.2 ? PALETTE[Math.floor(R() * PALETTE.length)] : pal[Math.floor(R() * pal.length)];
      put(x, z, Math.min(unit, len / n - 0.1), (alongX ? 0 : Math.PI / 2) + (R() < 0.5 ? Math.PI : 0) + jit(0.07) * (lvl ? 1.3 : 0.35), lvl, col);
    }
  }
  // keliling area: deretan tidak rapi, ada celah, ada yang miring & tumbang
  const outside = (x, z, pad = 0.5) => !inRects(x, z, M.walk, pad);
  for (const w of M.walk) {
    const edges = [[w.x1, w.z1, w.x2, w.z1, 0, -1], [w.x1, w.z2, w.x2, w.z2, 0, 1], [w.x1, w.z1, w.x1, w.z2, -1, 0], [w.x2, w.z1, w.x2, w.z2, 1, 0]];
    for (const [ax, az, bx, bz, nx, nz] of edges) {
      const L = Math.hypot(bx - ax, bz - az), alongX = az === bz;
      let p = R() * 3;
      while (p < L) {
        const use20 = R() < 0.4, unit = use20 ? 6.06 : 12.19;
        const t = Math.min(L, p + unit / 2);
        const cx = ax + (bx - ax) * t / L, cz = az + (bz - az) * t / L;
        const near = nz !== 0 && (laneD(cx, cz) < M.laneWidth / 2 + 3 || inRects(cx, cz, M.fountain, 5));      // tepi dekat lane / fountain di sisi kamera
        const off = (near ? 2.5 : 1.6) + R() * 0.9;
        const x = cx + nx * off, z = cz + nz * off;
        const kind = R();
        if (outside(x, z, 0.3) && outside(x - nx * 1.3, z - nz * 1.3, 0.1) && kind > 0.1) {
          const yaw0 = (alongX ? 0 : Math.PI / 2) + (R() < 0.5 ? Math.PI : 0);
          const skew = kind > 0.82 ? jit(0.32) : jit(0.07);
          put(x + Math.abs(skew) * nx * 3, z + Math.abs(skew) * nz * 3, unit, yaw0 + skew, 0, PALETTE[Math.floor(R() * PALETTE.length)]);
          let lv = 1;
          while (!near && lv < 3 && R() < (lv === 1 ? 0.6 : 0.3)) {
            const lean = R() < 0.15;
            put(x + jit(0.6) + nx * 0.4, z + jit(0.6) + nz * 0.4, R() < 0.5 ? unit : 6.06, yaw0 + jit(0.14), lv, PALETTE[Math.floor(R() * PALETTE.length)], lean ? { tz: jit(0.1), dy: 0.25 } : {});
            lv++;
          }
          // baris belakang
          if (!near && R() < 0.65) {
            const x2 = x + nx * (2.9 + R() * 2), z2 = z + nz * (2.9 + R() * 2);
            if (outside(x2, z2, 1.5)) {
              const fallen = R() < 0.12;
              put(x2, z2, R() < 0.5 ? 12.19 : 6.06, yaw0 + jit(fallen ? 0.9 : 0.2), 0, PALETTE[Math.floor(R() * PALETTE.length)], fallen ? { tx: Math.PI / 2, dy: -0.07 } : {});
              if (!fallen && R() < 0.5) put(x2 + jit(0.5), z2 + jit(0.5), 6.06, yaw0 + jit(0.25), 1, PALETTE[Math.floor(R() * PALETTE.length)]);
            }
          }
        }
        p += unit + 0.25 + (R() < 0.18 ? 2 + R() * 3 : R() * 0.5);
      }
    }
  }
  return list;
}

// InstancedMesh dipecah per petak 32 m supaya bisa di-cull kamera (penting di map 5v5 & GPU HP)
const CELL = 32;
function instanced(geo, mat, items, { shadow = true } = {}) {
  const group = new THREE.Group();
  const cells = new Map();
  for (const c of items) { const k = Math.floor(c.x / CELL) + ',' + Math.floor(c.z / CELL); (cells.get(k) || cells.set(k, []).get(k)).push(c); }
  for (const list of cells.values()) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((c, i) => {
      _e.set(c.tx || 0, c.yaw || 0, c.tz || 0, 'YXZ'); _q.setFromEuler(_e);
      const s = c.s || 1;
      _m.compose(_v.set(c.x, c.y || 0, c.z), _q, _s.set(s * (c.sx || 1), s * (c.sy || 1), s * (c.sz || 1)));
      im.setMatrixAt(i, _m);
      if (c.color) im.setColorAt(i, _c.set(c.color));
    });
    im.castShadow = shadow; im.receiveShadow = true;
    im.computeBoundingSphere(); im.computeBoundingBox();
    group.add(im);
  }
  return group;
}

// ------------------------------------------------------------------ tanah: lapisan PBR di-bake sekali ke satu tekstur (ringan untuk GPU HP)
function buildGround(R, M, S, rnd) {
  const G = { x: -16, z: -14, w: M.w + 32, h: M.h + 30 };
  const PXM = M.big ? 6 : 7;                                   // px per meter untuk mask
  const W = Math.round(G.w * PXM), H = Math.round(G.h * PXM);
  const X = (x) => (x - G.x) * PXM, Z = (z) => (z - G.z) * PXM;
  const laneD = (x, z) => Math.min(...Object.values(M.laneData).map((L) => laneProject(L, x, z).d));
  const geo = new THREE.PlaneGeometry(G.w, G.h);
  geo.setAttribute('uv1', geo.attributes.uv.clone());
  geo.rotateX(-Math.PI / 2);
  const cx = G.x + G.w / 2, cz = G.z + G.h / 2;
  // mesh tanah final (satu material buram) — tekstur diisi setelah bake
  const nrm = tex('cracked_concrete_02_nor.jpg', { rep: 1 }); nrm.repeat.set(G.w / 7, G.h / 7);
  const gmat = new THREE.MeshStandardMaterial({ color: '#6f6052', roughness: 0.93, metalness: 0, normalMap: nrm, normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 0.55 });
  const ground = new THREE.Mesh(geo, gmat);
  ground.position.set(cx, 0, cz); ground.receiveShadow = true;
  S.add(ground);
  // --- lapisan untuk di-bake
  const bake = new THREE.Scene();
  const ready = [];
  let order = 0;
  const layer = (mat) => { const m = new THREE.Mesh(geo, mat); m.position.set(cx, order * 0.01, cz); m.renderOrder = order++; bake.add(m); return m; };
  const mk = (name, meters, color, transparent = true) => {
    const t = tex(name + '_diff.jpg', { srgb: true }); t.repeat.set(G.w / meters, G.h / meters); ready.push(t.userData.ready);
    return new THREE.MeshBasicMaterial({ map: t, color, transparent, depthTest: false, depthWrite: false });
  };
  const mask = (draw, blur = 2) => {
    const t = canvasTex(W, H, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      draw(g);
      if (blur && 'filter' in g) { g.filter = `blur(${blur}px)`; g.drawImage(g.canvas, 0, 0); g.filter = 'none'; }
    }, { srgb: false });
    t.channel = 1;
    return t;
  };
  const blob = (g, x, z, r, col = '#fff', a = 1) => {
    const grd = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * PXM);
    grd.addColorStop(0, col); grd.addColorStop(0.55, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a; g.fillStyle = grd; g.beginPath(); g.arc(X(x), Z(z), r * PXM, 0, 7); g.fill(); g.globalAlpha = 1;
  };
  let area = 0; for (const w of M.walk) area += (w.x2 - w.x1) * (w.z2 - w.z1);
  const rw = () => { const w = M.walk[Math.floor(rnd() * M.walk.length)]; return [w.x1 + rnd() * (w.x2 - w.x1), w.z1 + rnd() * (w.z2 - w.z1)]; };
  // 1) kerikil beraspal (dasar)
  layer(mk('tarred_gravel', 5, '#e0d2c0', false));
  // 2) beton tua kotor di area yang bisa diinjak, tepi gompal & berlubang
  const mConc = mk('damaged_concrete_floor', 9, '#ecdfce');
  mConc.alphaMap = mask((g) => {
    g.fillStyle = '#fff';
    for (const w of M.walk) g.fillRect(X(w.x1 - 0.7), Z(w.z1 - 0.7), (w.x2 - w.x1 + 1.4) * PXM, (w.z2 - w.z1 + 1.4) * PXM);
    for (const w of M.walk) {
      const per = 2 * ((w.x2 - w.x1) + (w.z2 - w.z1));
      for (let i = 0; i < per / 1.3; i++) {
        const side = Math.floor(rnd() * 4), t = rnd();
        const x = side < 2 ? w.x1 + (w.x2 - w.x1) * t : side === 2 ? w.x1 - 0.7 : w.x2 + 0.7, z = side >= 2 ? w.z1 + (w.z2 - w.z1) * t : side === 0 ? w.z1 - 0.7 : w.z2 + 0.7;
        if (inRects(x, z, M.walk, -1)) continue;
        blob(g, x, z, 0.4 + rnd() * 1.3, '#000');
      }
    }
    for (let i = 0; i < area / 260; i++) { const [x, z] = rw(); if (laneD(x, z) >= M.laneWidth / 2 - 1) blob(g, x, z, 0.5 + rnd() * 1.4, '#000', 0.85); }
  });
  layer(mConc);
  // 3) beton lane lebih terang & retak
  const mLane = mk('cracked_concrete_02', 7, '#fff4e6');
  mLane.alphaMap = mask((g) => {
    g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = (M.laneWidth - 1) * PXM;
    for (const pts of Object.values(M.lanes)) { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
    for (const L of Object.values(M.laneData)) for (let s = 0; s < L.len; s += 1.1) for (const sd of [-1, 1]) {
      if (rnd() < 0.45) continue;
      const sg = L.segs.find((q) => s <= q.s0 + q.len) || L.segs[L.segs.length - 1], t = s - sg.s0;
      const o = (M.laneWidth / 2 - 0.4 + rnd() * 0.6) * sd;
      blob(g, sg.ax + sg.dx * t - sg.dz * o, sg.az + sg.dz * t + sg.dx * o, 0.5 + rnd() * 1.2, '#000');
    }
  }, 3);
  layer(mLane);
  // 4) tanah / lumpur kering di sela-sela
  const mMud = mk('brown_mud_dry', 6, '#e2cdb2');
  mMud.alphaMap = mask((g) => {
    for (let i = 0; i < area / 45; i++) {
      const [x, z] = rw(), d = laneD(x, z);
      if (d < M.laneWidth / 2 - 2) continue;
      blob(g, x, z, 1 + rnd() * 3.2, '#fff', d < M.laneWidth / 2 ? 0.5 : 0.9);
    }
    for (const b of M.bushes) for (let i = 0; i < 6; i++) blob(g, b.x1 + rnd() * (b.x2 - b.x1), b.z1 + rnd() * (b.z2 - b.z1), 2 + rnd() * 2.5, '#fff', 0.9);
    for (const w of M.walls) for (let i = 0; i < 10; i++) {
      const side = rnd() < 0.5;
      blob(g, side ? w.x1 + rnd() * (w.x2 - w.x1) : (rnd() < 0.5 ? w.x1 : w.x2), side ? (rnd() < 0.5 ? w.z1 : w.z2) : w.z1 + rnd() * (w.z2 - w.z1), 1 + rnd() * 1.6, '#fff', 0.8);
    }
  }, 4);
  layer(mMud);
  // 5) detail: jejak ban, marka pudar, limpasan karat, noda oli, tulisan area
  const DP = M.big ? 9 : 11, DW = Math.round(G.w * DP), DH = Math.round(G.h * DP);
  const dx = (x) => (x - G.x) * DP, dz = (z) => (z - G.z) * DP;
  const detail = canvasTex(DW, DH, (g) => {
    g.clearRect(0, 0, DW, DH);
    for (const L of Object.values(M.laneData)) for (const off of [-3.4, -1.6, 1.4, 3.3]) {
      g.strokeStyle = `rgba(30,24,20,${0.1 + rnd() * 0.1})`; g.lineWidth = 0.55 * DP; g.lineCap = 'round';
      g.beginPath();
      for (let s = 0; s <= L.len; s += 2) {
        const sg = L.segs.find((q) => s <= q.s0 + q.len) || L.segs[L.segs.length - 1], t = s - sg.s0, o = off + Math.sin(s * 0.13 + off) * 0.5;
        const x = sg.ax + sg.dx * t - sg.dz * o, z = sg.az + sg.dz * t + sg.dx * o;
        s ? g.lineTo(dx(x), dz(z)) : g.moveTo(dx(x), dz(z));
      }
      g.stroke();
    }
    g.lineWidth = 0.22 * DP; g.lineCap = 'butt';
    for (const L of Object.values(M.laneData)) for (const sg of L.segs) for (const sd of [-1, 1]) {
      const o = (M.laneWidth / 2 - 0.7) * sd;
      for (let t = 0; t < sg.len; t += 3.6) {
        if (rnd() < 0.3) continue;
        g.strokeStyle = `rgba(214,164,32,${0.25 + rnd() * 0.5})`;
        const t2 = Math.min(sg.len, t + 1.4 + rnd() * 1.2);
        g.beginPath(); g.moveTo(dx(sg.ax + sg.dx * t - sg.dz * o), dz(sg.az + sg.dz * t + sg.dx * o)); g.lineTo(dx(sg.ax + sg.dx * t2 - sg.dz * o), dz(sg.az + sg.dz * t2 + sg.dx * o)); g.stroke();
      }
    }
    for (const w of M.walls) {
      g.fillStyle = 'rgba(20,14,10,0.3)'; g.fillRect(dx(w.x1 - 0.6), dz(w.z1 - 0.6), (w.x2 - w.x1 + 1.2) * DP, (w.z2 - w.z1 + 1.2) * DP);
      for (let i = 0; i < (w.x2 - w.x1) * 0.8; i++) {
        const x = w.x1 + rnd() * (w.x2 - w.x1), z = rnd() < 0.5 ? w.z2 : w.z1, len = (0.5 + rnd() * 2.2) * (z === w.z2 ? 1 : -1);
        const gr = g.createLinearGradient(0, dz(z), 0, dz(z + len));
        gr.addColorStop(0, 'rgba(120,58,24,0.5)'); gr.addColorStop(1, 'rgba(120,58,24,0)');
        g.fillStyle = gr; g.fillRect(dx(x), Math.min(dz(z), dz(z + len)), (0.15 + rnd() * 0.5) * DP, Math.abs(len) * DP);
      }
    }
    for (let i = 0; i < area / 55; i++) {
      const [x, z] = rw(), r = (0.3 + rnd() * 1.5) * DP, a = 0.25 + rnd() * 0.4;
      const grd = g.createRadialGradient(dx(x), dz(z), 0, dx(x), dz(z), r);
      grd.addColorStop(0, `rgba(18,14,12,${a})`); grd.addColorStop(0.7, `rgba(28,22,18,${a * 0.6})`); grd.addColorStop(1, 'rgba(28,22,18,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(dx(x), dz(z), r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); g.fill();
    }
    g.font = `bold ${Math.round(2.2 * DP)}px Arial`; g.textAlign = 'center';
    const labels = ['LAYDOWN A', 'ZONA B-07', 'NO PARKING', 'KEEP CLEAR', 'AREA C', 'STACK 3 MAX', 'D-12'];
    for (let i = 0; i < area / 900; i++) {
      const w = M.walk[Math.floor(rnd() * M.walk.length)];
      const x = w.x1 + 6 + rnd() * (w.x2 - w.x1 - 12), z = w.z1 + 3 + rnd() * (w.z2 - w.z1 - 6);
      if (inRects(x, z, M.walls, 6)) continue;
      g.save(); g.translate(dx(x), dz(z)); g.rotate((Math.floor(rnd() * 4)) * Math.PI / 2 + (rnd() - 0.5) * 0.06);
      g.fillStyle = `rgba(235,228,210,${0.12 + rnd() * 0.2})`; g.fillText(labels[Math.floor(rnd() * labels.length)], 0, 0);
      g.strokeStyle = `rgba(235,228,210,${0.1 + rnd() * 0.15})`; g.lineWidth = 0.15 * DP; g.strokeRect(-7 * DP, -2.6 * DP, 14 * DP, 3.6 * DP);
      g.restore();
    }
    M.spawn.forEach((sp, t) => {
      g.strokeStyle = 'rgba(224,176,32,0.75)'; g.lineWidth = 0.5 * DP; g.beginPath(); g.arc(dx(sp.x), dz(sp.z), 5 * DP, 0, 7); g.stroke();
      g.strokeStyle = TEAM_PAINT[t]; g.globalAlpha = 0.8; g.lineWidth = 0.35 * DP; g.beginPath(); g.arc(dx(sp.x), dz(sp.z), 3.6 * DP, 0, 7); g.stroke(); g.globalAlpha = 1;
    });
    for (const bp of M.pits) {
      g.fillStyle = 'rgba(40,30,22,0.5)'; g.beginPath(); g.arc(dx(bp.x), dz(bp.z), bp.r * DP, 0, 7); g.fill();
      g.strokeStyle = 'rgba(214,164,32,0.8)'; g.lineWidth = 0.7 * DP; g.setLineDash([1.6 * DP, 1.6 * DP]); g.beginPath(); g.arc(dx(bp.x), dz(bp.z), bp.r * DP, 0, 7); g.stroke(); g.setLineDash([]);
    }
  });
  layer(new THREE.MeshBasicMaterial({ map: detail, transparent: true, depthTest: false, depthWrite: false }));
  // --- bake ketika semua tekstur siap
  Promise.all(ready).then(() => {
    if (R.world !== S) return;
    const long = R.quality === 'low' ? 2048 : 4096, k = long / Math.max(G.w, G.h);
    const rt = new THREE.WebGLRenderTarget(Math.round(G.w * k), Math.round(G.h * k), { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.anisotropy = 8;
    const cam = new THREE.OrthographicCamera(-G.w / 2, G.w / 2, G.h / 2, -G.h / 2, 0.1, 60);
    cam.position.set(cx, 30, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz);
    const gl = R.gl, prev = gl.getRenderTarget(), tm = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    gl.setRenderTarget(rt); gl.clear(); gl.render(bake, cam);
    gl.setRenderTarget(prev); gl.toneMapping = tm;
    gmat.map = rt.texture; gmat.color.set('#ffffff'); gmat.needsUpdate = true;
    bake.traverse((o) => { if (o.material) { o.material.alphaMap?.dispose(); if (o.material.map === detail) detail.dispose(); o.material.dispose(); } });
  });
  // 6) genangan air: memantulkan langit senja (hanya petak kecil, bukan lapisan penuh)
  if (R.quality !== 'low') {
    const circles = [];
    for (let i = 0; i < area / 170; i++) {
      const w = M.walk[Math.floor(rnd() * M.walk.length)];
      const x = w.x1 + 1 + rnd() * (w.x2 - w.x1 - 2), z = w.z1 + 1 + rnd() * (w.z2 - w.z1 - 2);
      if (inRects(x, z, M.walls, 0.5)) continue;
      const n = 2 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const c = new THREE.CircleGeometry(0.7 + rnd() * 1.5, 14);
        c.rotateX(-Math.PI / 2); c.scale(1, 1, 0.5 + rnd() * 0.5); c.rotateY(rnd() * 3);
        c.translate(x + (rnd() - 0.5) * 2.6, 0.03 + k * 0.001, z + (rnd() - 0.5) * 2.6);
        circles.push(c);
      }
    }
    if (circles.length) {
      const a = canvasTex(64, 64, (g) => { const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, '#fff'); grd.addColorStop(0.72, '#fff'); grd.addColorStop(1, '#000'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); }, { srgb: false });
      const pm = new THREE.Mesh(mergeGeometries(circles), new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 0.05, metalness: 0, transparent: true, depthWrite: false, opacity: 0.5, alphaMap: a, envMapIntensity: 1.5 }));
      pm.receiveShadow = true; pm.renderOrder = -5;
      S.add(pm);
    }
  }
  return { laneD };
}

// ------------------------------------------------------------------ puing prosedural (baja H, pipa, gulungan kabel, palet)
function junkGeos() {
  const steelM = pbr('rusty_painted_metal', { color: '#b89886' });
  const pipeM = pbr('rusty_metal_02', { color: '#8f8f8a' });
  const woodM = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.95 });
  const hb = [];
  for (const [a, b] of [[0, 0], [0.34, 0.02], [0.68, -0.01], [0.17, 0.33], [0.51, 0.34]]) {
    for (const g of [new THREE.BoxGeometry(6, 0.03, 0.26), new THREE.BoxGeometry(6, 0.03, 0.26), new THREE.BoxGeometry(6, 0.26, 0.025)]) hb.push(g);
    hb[hb.length - 3].translate(0, b + 0.3, a - 0.34); hb[hb.length - 2].translate(0, b + 0.03, a - 0.34); hb[hb.length - 1].translate(0, b + 0.165, a - 0.34);
  }
  const pipes = [];
  for (const [y, z] of [[0.22, -0.46], [0.22, 0], [0.22, 0.46], [0.6, -0.23], [0.6, 0.23], [0.98, 0]]) { const g = new THREE.CylinderGeometry(0.22, 0.22, 5.5, 10, 1, true); g.rotateZ(Math.PI / 2); g.translate(0, y, z); pipes.push(g); }
  const reel = [];
  for (const x of [-0.42, 0.42]) { const g = new THREE.CylinderGeometry(0.95, 0.95, 0.07, 18); g.rotateZ(Math.PI / 2); g.translate(x, 0.95, 0); reel.push(g); }
  { const g = new THREE.CylinderGeometry(0.6, 0.6, 0.8, 16); g.rotateZ(Math.PI / 2); g.translate(0, 0.95, 0); reel.push(g); }
  const pallet = [];
  for (let i = 0; i < 6; i++) { const g = new THREE.BoxGeometry(1.2, 0.03, 0.14); g.translate(0, 0.14, -0.43 + i * 0.172); pallet.push(g); }
  for (const z of [-0.43, 0, 0.43]) { const g = new THREE.BoxGeometry(1.2, 0.11, 0.1); g.translate(0, 0.07, z); pallet.push(g); }
  return {
    hbeam: [mergeGeometries(hb), steelM], pipes: [mergeGeometries(pipes), Object.assign(pipeM, { side: THREE.DoubleSide })],
    reel: [mergeGeometries(reel), woodM], pallet: [mergeGeometries(pallet), woodM],
  };
}

// ------------------------------------------------------------------ dunia
export function buildWorld(R, M) {
  const S = R.world;
  const rnd = rng(1234 + (M.big ? 7 : 0));
  const { laneD } = buildGround(R, M, S, rnd);
  // kontainer
  const cmat = new THREE.MeshStandardMaterial({ map: tex('container_albedo.jpg', { srgb: true }), normalMap: tex('container_side_nor.jpg'), roughness: 0.6, metalness: 0.4, vertexColors: true });
  cmat.map.repeat.set(1, 1);
  const conts = layoutContainers(M, rnd, laneD);
  for (const len of [12.19, 6.06]) {
    const items = conts.filter((c) => Math.abs(c.len - len) < 3).map((c) => ({ ...c, sx: c.len / len }));
    if (items.length) S.add(instanced(containerGeo(len), cmat, items));
  }
  // titik aman untuk puing
  const busy = [...M.structures, ...M.pits, ...M.spawn];
  const ok = (x, z, lanePad = 1.2, pad = 7) => laneD(x, z) > M.laneWidth / 2 + lanePad && !inRects(x, z, M.walls, 0.3) && !inRects(x, z, M.bushes, 0.5) && !inRects(x, z, M.fountain, 4) && !busy.some((b) => Math.hypot(b.x - x, b.z - z) < pad);
  const nearWall = () => {                                       // titik menempel sisi kontainer
    const w = M.walls[Math.floor(rnd() * M.walls.length)];
    const side = Math.floor(rnd() * 4), o = 0.7 + rnd() * 0.9;
    return side < 2 ? { x: w.x1 + rnd() * (w.x2 - w.x1), z: side ? w.z2 + o : w.z1 - o } : { x: side === 2 ? w.x1 - o : w.x2 + o, z: w.z1 + rnd() * (w.z2 - w.z1) };
  };
  const anyWalk = () => { const w = M.walk[Math.floor(rnd() * M.walk.length)]; return { x: w.x1 + 1 + rnd() * (w.x2 - w.x1 - 2), z: w.z1 + 1 + rnd() * (w.z2 - w.z1 - 2) }; };
  const outsideSpot = () => { const w = M.walk[Math.floor(rnd() * M.walk.length)]; const side = Math.floor(rnd() * 4), o = 0.5 + rnd() * 1.1; return side < 2 ? { x: w.x1 + rnd() * (w.x2 - w.x1), z: side ? w.z2 + o : w.z1 - o } : { x: side === 2 ? w.x1 - o : w.x2 + o, z: w.z1 + rnd() * (w.z2 - w.z1) }; };
  let area = 0; for (const w of M.walk) area += (w.x2 - w.x1) * (w.z2 - w.z1);
  const K = area / 6000;                                          // skala jumlah puing
  const P = { barrel: [], tyre: [], crate: [], trashbag: [], barrier: [], generator: [], hbeam: [], pipes: [], reel: [], pallet: [] };
  const spot = (fn, tries = 12, lanePad = 1.2) => { for (let i = 0; i < tries; i++) { const p = fn(); if (ok(p.x, p.z, lanePad)) return p; } return null; };
  for (let i = 0; i < 26 * K; i++) {                              // kelompok drum, sebagian tumbang
    const p = spot(rnd() < 0.7 ? nearWall : outsideSpot); if (!p) continue;
    const n = 1 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const fallen = rnd() < 0.22;
      P.barrel.push({ x: p.x + (rnd() - 0.5) * 1.6, z: p.z + (rnd() - 0.5) * 1.6, yaw: rnd() * 6.28, tx: fallen ? Math.PI / 2 : (rnd() - 0.5) * 0.06, y: fallen ? 0.29 : 0, s: 1.05, color: ['#ffffff', '#8fa8c8', '#c9b070', '#b0b0b0'][Math.floor(rnd() * 4)] });
    }
  }
  for (let i = 0; i < 34 * K; i++) {                              // ban bekas: tumpukan & berserakan
    const p = spot(rnd() < 0.5 ? nearWall : anyWalk, 12, 0.3); if (!p) continue;
    const n = rnd() < 0.5 ? 1 : 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) P.tyre.push({ x: p.x + (rnd() - 0.5) * 0.25, z: p.z + (rnd() - 0.5) * 0.25, yaw: rnd() * 6.28, k, s: 1.25, lean: n === 1 && rnd() < 0.3 });
  }
  for (let i = 0; i < 20 * K; i++) { const p = spot(nearWall); if (p) { P.crate.push({ x: p.x, z: p.z, yaw: rnd() * 6.28, s: 1.3 }); if (rnd() < 0.4) P.crate.push({ x: p.x + (rnd() - 0.5) * 0.4, z: p.z + (rnd() - 0.5) * 0.4, yaw: rnd() * 6.28, s: 1.2, k: 1 }); } }
  for (let i = 0; i < 40 * K; i++) { const p = spot(rnd() < 0.6 ? nearWall : outsideSpot, 12, 0.5); if (p) for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) P.trashbag.push({ x: p.x + (rnd() - 0.5) * 1.2, z: p.z + (rnd() - 0.5) * 1.2, yaw: rnd() * 6.28, s: 1.2 + rnd() * 0.5 }); }
  for (const w of M.walls) {                                      // barrier beton di ujung tumpukan
    const alongX = (w.x2 - w.x1) >= (w.z2 - w.z1);
    for (const e of [0, 1]) { const x = alongX ? (e ? w.x2 + 1.5 : w.x1 - 1.5) : (w.x1 + w.x2) / 2, z = alongX ? (w.z1 + w.z2) / 2 : (e ? w.z2 + 1.5 : w.z1 - 1.5); if (ok(x, z, 0.8, 5)) P.barrier.push({ x, z, yaw: (alongX ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.5, tz: rnd() < 0.15 ? 0.5 : 0, s: 1 }); }
  }
  for (const st of M.structures) if (st.type === 'base') P.generator.push({ x: st.x + (st.team ? 5.5 : -5.5), z: st.z + 4.2, yaw: rnd() * 6.28, s: 1.5 });
  for (let i = 0; i < 12 * K; i++) { const p = spot(rnd() < 0.5 ? nearWall : anyWalk, 14, 2.5); if (p) P.hbeam.push({ x: p.x, z: p.z, yaw: rnd() * 6.28 }); }
  for (let i = 0; i < 9 * K; i++) { const p = spot(rnd() < 0.5 ? nearWall : anyWalk, 14, 2.5); if (p) P.pipes.push({ x: p.x, z: p.z, yaw: rnd() * 6.28 }); }
  for (let i = 0; i < 9 * K; i++) { const p = spot(nearWall, 14, 1.5); if (p) P.reel.push({ x: p.x, z: p.z, yaw: rnd() * 6.28, tz: rnd() < 0.2 ? Math.PI / 2 : 0, y: 0 }); }
  for (let i = 0; i < 30 * K; i++) { const p = spot(rnd() < 0.5 ? nearWall : anyWalk, 12, 0.5); if (p) for (let k = 0; k < 1 + Math.floor(rnd() * 4); k++) P.pallet.push({ x: p.x + (rnd() - 0.5) * 0.15, z: p.z + (rnd() - 0.5) * 0.15, yaw: (rnd() - 0.5) * 0.3 + (k ? 0 : rnd() * 6.28), y: k * 0.16 }); }
  const J = junkGeos();
  for (const k of ['hbeam', 'pipes', 'reel', 'pallet']) if (P[k].length) S.add(instanced(J[k][0], J[k][1], P[k], { shadow: k === 'reel' || k === 'pipes' }));
  // model foto-scan (async)
  const world = S;
  const addScan = async (name, items, fit) => {
    if (!items.length) return;
    const src = await loadProp(name);
    if (!src || R.world !== world) return;
    src.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src), size = box.getSize(new THREE.Vector3());
    src.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.translate(0, -box.min.y, 0);
      const list = items.map((it) => fit(it, size));
      const im = instanced(g, o.material, list, { shadow: name === 'barrel' || name === 'barrier' || name === 'crate' || name === 'generator' });
      world.add(im);
    });
  };
  addScan('barrel', P.barrel, (it) => it);
  addScan('tyre', P.tyre, (it, sz) => {
    const flat = sz.y < sz.x;                                     // ban tergeletak?
    const th = (flat ? sz.y : Math.min(sz.x, sz.z)) * it.s;
    return flat ? { ...it, y: it.k * th * 0.95, tx: it.lean ? 1.2 : 0 } : { ...it, tx: it.lean ? 0.3 : Math.PI / 2, y: it.lean ? 0 : it.k * th * 0.95 + th / 2 };
  });
  addScan('crate', P.crate, (it, sz) => ({ ...it, y: (it.k || 0) * sz.y * it.s }));
  addScan('trashbag', P.trashbag, (it) => it);
  addScan('barrier', P.barrier, (it) => it);
  addScan('generator', P.generator, (it) => it);
  buildPlants(R, M, world, rnd, laneD);
  // tiang lampu sorot (menyala hangat)
  const pole = new THREE.MeshStandardMaterial({ color: '#4a4a4a', roughness: 0.6, metalness: 0.6 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#333', emissive: '#ffe2a8', emissiveIntensity: 2.5 });
  const lamps = M.big ? [[40, 3.5], [80, 3.5], [120, 3.5], [40, 156.5], [80, 156.5], [120, 156.5], [3.5, 60], [3.5, 100], [156.5, 60], [156.5, 100]] : [[35, 60.2], [70, 60.2], [105, 60.2], [50, 4.2], [90, 4.2]];
  for (const [x, z] of lamps) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 10, 8), pole); p.position.set(x, 5, z); p.castShadow = true; S.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.5), lamp); l.position.set(x, 10, z); S.add(l);
  }
}

// ------------------------------------------------------------------ rumput, ilalang & gulma (foto-scan, di-instance)
const PLANT_FILES = ['plant_grass_medium_01', 'plant_grass_medium_02', 'plant_nettle_plant', 'plant_weed_plant_02', 'plant_dandelion_01', 'plant_shrub_sorrel_01'];
let plantLib = null;
function loadPlants() {
  if (!plantLib) {
    plantLib = Promise.all(PLANT_FILES.map(loadProp)).then((scenes) => {
      const lib = {};
      for (const sc of scenes) {
        if (!sc) continue;
        sc.updateMatrixWorld(true);
        sc.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
          g.computeBoundingBox();
          const b = g.boundingBox; g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
          const h = b.max.y - b.min.y;
          const m = new THREE.MeshLambertMaterial({ map: o.material.map, alphaTest: 0.4, side: THREE.DoubleSide });   // Lambert: jauh lebih ringan dari PBR
          lib[o.name] = { geo: g, mat: m, h };
        });
      }
      return lib;
    });
  }
  return plantLib;
}

async function buildPlants(R, M, world, rnd, laneD) {
  const lib = await loadPlants();
  if (R.world !== world) return;
  const uTime = R.grassTime || (R.grassTime = { value: 0 });
  const lists = {};
  const add = (kind, x, z, hTarget, tint) => { if (lib[kind]) (lists[kind] = lists[kind] || []).push({ x, z, yaw: rnd() * 6.28, s: hTarget / lib[kind].h, sy: 0.85 + rnd() * 0.3, color: tint, tx: (rnd() - 0.5) * 0.12, tz: (rnd() - 0.5) * 0.12 }); };
  const pick = (table) => { let r = rnd(); for (const [k, p, h0, h1] of table) { if ((r -= p) <= 0) return [k, h0 + rnd() * (h1 - h0)]; } const t = table[0]; return [t[0], t[2]]; };
  const tintTall = () => ['#c8c08a', '#b8c890', '#d8cc98', '#a8b878', '#e0d4a8'][Math.floor(rnd() * 5)];
  const tintLow = () => ['#b0c088', '#c8c890', '#9ab070', '#d0c8a0'][Math.floor(rnd() * 4)];
  const dens = R.quality === 'low' ? 0.5 : R.quality === 'med' ? 0.75 : 1;
  // semak sembunyi: ilalang tinggi rapat bercampur jelatang & gulma
  const TALL = [['grassTallA', 0.34, 1.1, 1.7], ['grassTallB', 0.3, 1.0, 1.6], ['grassMidA', 0.14, 0.8, 1.2], ['grassDryA', 0.1, 0.8, 1.2], ['nettleA', 0.05, 0.7, 1.0], ['weedA', 0.05, 0.7, 1.0], ['nettleB', 0.02, 0.6, 0.9]];   // ilalang setinggi pinggang-dada, tidak menutupi layar
  for (const b of M.bushes) {
    const n = (b.x2 - b.x1) * (b.z2 - b.z1) * 2.6 * dens;
    for (let i = 0; i < n; i++) { const [k, h] = pick(TALL); add(k, b.x1 + 0.2 + rnd() * (b.x2 - b.x1 - 0.4), b.z1 + 0.2 + rnd() * (b.z2 - b.z1 - 0.4), h, tintTall()); }
    for (let i = 0; i < n * 0.25; i++) { const [k, h] = pick(TALL); add(k, b.x1 - 0.8 + rnd() * (b.x2 - b.x1 + 1.6), b.z1 - 0.8 + rnd() * (b.z2 - b.z1 + 1.6), h * 0.6, tintTall()); }
  }
  // gulma liar: di retakan beton, kaki kontainer, tepi area
  const LOW = [['grassSmallA', 0.25, 0.25, 0.5], ['grassDryB', 0.2, 0.3, 0.6], ['dandelionA', 0.14, 0.2, 0.35], ['dandelionB', 0.1, 0.2, 0.35], ['sorrelA', 0.1, 0.3, 0.55], ['sorrelB', 0.08, 0.3, 0.5], ['weedB', 0.08, 0.4, 0.8], ['grassMidA', 0.05, 0.5, 0.8]];
  let area = 0; for (const w of M.walk) area += (w.x2 - w.x1) * (w.z2 - w.z1);
  for (let i = 0; i < area / 9 * dens; i++) {
    const w = M.walk[Math.floor(rnd() * M.walk.length)];
    let x = w.x1 + rnd() * (w.x2 - w.x1), z = w.z1 + rnd() * (w.z2 - w.z1);
    if (rnd() < 0.6) { if (rnd() < 0.5) x = Math.round(x / 6) * 6 + (rnd() - 0.5) * 0.3; else z = Math.round(z / 6) * 6 + (rnd() - 0.5) * 0.3; }   // tumbuh di sambungan pelat
    const d = laneD(x, z);
    if (d < M.laneWidth / 2 - 1.5 && rnd() < 0.8) continue;
    if (inRects(x, z, M.walls, 0.1) || inRects(x, z, M.fountain, 1.5)) continue;
    const [k, h] = pick(LOW); add(k, x, z, h, tintLow());
  }
  const MID = [['grassMidA', 0.3, 0.5, 1.0], ['weedA', 0.2, 0.6, 1.1], ['grassDryA', 0.2, 0.5, 0.9], ['nettleB', 0.15, 0.6, 1.0], ['sorrelA', 0.15, 0.3, 0.6]];
  for (const w of M.walls) {
    const per = 2 * ((w.x2 - w.x1) + (w.z2 - w.z1));
    for (let i = 0; i < per * 0.9 * dens; i++) {
      const side = Math.floor(rnd() * 4), o = 0.15 + rnd() * 0.5;
      const x = side < 2 ? w.x1 + rnd() * (w.x2 - w.x1) : side === 2 ? w.x1 - o : w.x2 + o, z = side >= 2 ? w.z1 + rnd() * (w.z2 - w.z1) : side === 0 ? w.z1 - o : w.z2 + o;
      const [k, h] = pick(MID); add(k, x, z, h, tintLow());
    }
  }
  for (const w of M.walk) {                                        // tepi luar: ilalang di sela kontainer
    const per = 2 * ((w.x2 - w.x1) + (w.z2 - w.z1));
    for (let i = 0; i < per * 0.7 * dens; i++) {
      const side = Math.floor(rnd() * 4), o = 0.2 + rnd() * 1.4, t = rnd();
      const x = side < 2 ? w.x1 + (w.x2 - w.x1) * t : side === 2 ? w.x1 - o : w.x2 + o, z = side >= 2 ? w.z1 + (w.z2 - w.z1) * t : side === 0 ? w.z1 - o : w.z2 + o;
      if (inRects(x, z, M.walk, 0) || inRects(x, z, M.fountain, 3)) continue;
      const [k, h] = pick(rnd() < 0.4 ? TALL : MID); add(k, x, z, h * 0.8, tintTall());
    }
  }
  for (const [kind, items] of Object.entries(lists)) {
    const { geo, mat, h } = lib[kind];
    const m = mat.clone();
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime; sh.uniforms.uH = { value: h };
      sh.vertexShader = 'uniform float uTime; uniform float uH;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float k = clamp(position.y / uH, 0.0, 1.0); k *= k;
        float sway = sin(uTime * 1.6 + wp.x * 0.35 + wp.z * 0.27) * 0.5 + sin(uTime * 3.1 + wp.x * 1.3) * 0.2;
        transformed.x += sway * 0.12 * uH * k; transformed.z += sway * 0.07 * uH * k;`);
    };
    const im = instanced(geo, m, items, { shadow: false });
    im.receiveShadow = true;
    world.add(im);
  }
}
