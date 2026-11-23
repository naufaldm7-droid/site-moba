// SITE CLASH — renderer Three.js: Abandoned Container Laydown Yard (golden hour), model prosedural ringan untuk HP.
import * as THREE from 'three';
import { MAPS, HEROES, STRUCT, SNAP_HZ, laneProject } from '/shared/data.js';

export const TEAM_HEX = ['#3d8bff', '#ff4040'];
const TEAM_COL = [0x3d8bff, 0xff4040];
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const rand = (a, b) => a + Math.random() * (b - a);
// RNG deterministik supaya dekorasi sama di semua perangkat
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ------------------------------------------------------------------ textures
function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// area tanah per map (meter) + resolusi tekstur
const groundArea = (M) => ({ x: -14, z: -12, w: M.w + 28, h: M.h + 26, px: M.big ? 8 : 10 });
const inAnyRect = (x, z, rects, pad = 0) => rects.some((r) => x >= r.x1 - pad && x <= r.x2 + pad && z >= r.z1 - pad && z <= r.z2 + pad);

function groundTexture(M) {
  const G = groundArea(M), PX = G.px;
  const W = Math.round(G.w * PX), H = Math.round(G.h * PX);
  const R = rng(7);
  return canvasTex(W, H, (g) => {
    const X = (x) => (x - G.x) * PX, Z = (z) => (z - G.z) * PX;
    // dasar: kerikil gelap di luar area main
    g.fillStyle = '#4a4038'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < W * H / 120; i++) { g.fillStyle = `rgba(${60 + R() * 60},${50 + R() * 45},${40 + R() * 35},0.5)`; g.fillRect(R() * W, R() * H, 2 + R() * 3, 2 + R() * 3); }
    // pelat beton 6x6 m di area yang bisa diinjak
    for (const w of M.walk) {
      for (let x = w.x1; x < w.x2; x += 6) for (let z = w.z1; z < w.z2; z += 6) {
        const v = 150 + R() * 30;
        g.fillStyle = `rgb(${v + 10},${v - 4},${v - 22})`;
        g.fillRect(X(x) + 1, Z(z) + 1, Math.min(6, w.x2 - x) * PX - 2, Math.min(6, w.z2 - z) * PX - 2);
        for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(70,55,40,${0.05 + R() * 0.12})`; g.beginPath(); g.ellipse(X(x + R() * 6), Z(z + R() * 6), 4 + R() * 18, 3 + R() * 12, R() * 3, 0, 7); g.fill(); }
      }
      g.strokeStyle = 'rgba(40,32,26,0.55)'; g.lineWidth = 2;
      for (let x = w.x1; x <= w.x2; x += 6) { g.beginPath(); g.moveTo(X(x), Z(w.z1)); g.lineTo(X(x), Z(w.z2)); g.stroke(); }
      for (let z = w.z1; z <= w.z2; z += 6) { g.beginPath(); g.moveTo(X(w.x1), Z(z)); g.lineTo(X(w.x2), Z(z)); g.stroke(); }
    }
    // pita lane: beton lebih terang + marka kuning putus-putus di kedua tepi
    const LW = M.laneWidth;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pts of Object.values(M.lanes)) {
      g.strokeStyle = 'rgba(215,200,170,0.28)'; g.lineWidth = LW * PX;
      g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke();
    }
    g.lineCap = 'butt';
    g.strokeStyle = '#d8a520'; g.lineWidth = Math.max(3, PX * 0.5); g.setLineDash([PX * 2.4, PX * 1.4]);
    for (const pts of Object.values(M.lanes)) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
        for (const sd of [-1, 1]) {
          const o = (LW / 2 - 0.6) * sd;
          g.beginPath(); g.moveTo(X(ax + nx * o), Z(az + nz * o)); g.lineTo(X(bx + nx * o), Z(bz + nz * o)); g.stroke();
        }
      }
    }
    g.setLineDash([]);
    // retakan
    g.strokeStyle = 'rgba(35,28,22,0.6)'; g.lineWidth = 1.5;
    let area = 0; for (const w of M.walk) area += (w.x2 - w.x1) * (w.z2 - w.z1);
    for (let i = 0; i < area / 32; i++) {
      const w = M.walk[Math.floor(R() * M.walk.length)];
      let x = w.x1 + R() * (w.x2 - w.x1), z = w.z1 + R() * (w.z2 - w.z1);
      g.beginPath(); g.moveTo(X(x), Z(z));
      for (let k = 0; k < 6; k++) { x += rand(-1.5, 1.5); z += rand(-1.5, 1.5); g.lineTo(X(x), Z(z)); }
      g.stroke();
    }
    // pad fountain (helipad kuning)
    M.spawn.forEach((sp, t) => {
      g.strokeStyle = '#e0b020'; g.lineWidth = PX * 0.6; g.beginPath(); g.arc(X(sp.x), Z(sp.z), 5 * PX, 0, 7); g.stroke();
      g.strokeStyle = TEAM_HEX[t]; g.lineWidth = PX * 0.4; g.beginPath(); g.arc(X(sp.x), Z(sp.z), 3.6 * PX, 0, 7); g.stroke();
      g.fillStyle = TEAM_HEX[t] + '33'; g.beginPath(); g.arc(X(sp.x), Z(sp.z), 3.4 * PX, 0, 7); g.fill();
    });
    // boss pit: lingkaran beton & garis hazard
    for (const bp of M.pits) {
      g.fillStyle = '#6a5a48'; g.beginPath(); g.arc(X(bp.x), Z(bp.z), bp.r * PX, 0, 7); g.fill();
      g.strokeStyle = '#d8a520'; g.lineWidth = PX * 0.8; g.setLineDash([PX * 1.8, PX * 1.8]); g.beginPath(); g.arc(X(bp.x), Z(bp.z), bp.r * PX, 0, 7); g.stroke(); g.setLineDash([]);
    }
    // genangan air (reflektif ringan)
    for (let i = 0; i < area / 380; i++) {
      const w = M.walk[Math.floor(R() * M.walk.length)];
      const x = w.x1 + R() * (w.x2 - w.x1), z = w.z1 + R() * (w.z2 - w.z1);
      const grd = g.createRadialGradient(X(x), Z(z), 2, X(x), Z(z), 30 + R() * 30);
      grd.addColorStop(0, 'rgba(255,190,130,0.55)'); grd.addColorStop(0.6, 'rgba(120,110,120,0.35)'); grd.addColorStop(1, 'rgba(90,80,80,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(X(x), Z(z), 20 + R() * 35, 10 + R() * 18, R() * 3, 0, 7); g.fill();
    }
  });
}

function corrugatedTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      const grd = g.createLinearGradient(x, 0, x + 8, 0);
      grd.addColorStop(0, '#f2f2f2'); grd.addColorStop(0.5, '#a9a9a9'); grd.addColorStop(1, '#efefef');
      g.fillStyle = grd; g.fillRect(x, 0, 8, h);
    }
    const R = rng(3);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${90 + R() * 40},${45 + R() * 20},20,${0.15 + R() * 0.35})`; g.beginPath(); g.ellipse(R() * w, R() * h, 2 + R() * 14, 1 + R() * 8, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  });
}

function grassTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const R = rng(11);
    for (let i = 0; i < 46; i++) {
      const x = 10 + R() * 108, lean = rand(-18, 18), top = 8 + R() * 50;
      g.strokeStyle = `rgb(${90 + R() * 70},${110 + R() * 60},${40 + R() * 30})`;
      g.lineWidth = 2 + R() * 2;
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top); g.stroke();
      if (R() < 0.35) { g.fillStyle = `rgba(${220 + R() * 30},${205 + R() * 30},${170},0.95)`; g.beginPath(); g.ellipse(x + lean, top - 6, 3, 10, lean / 40, 0, 7); g.fill(); }
    }
  }, { srgb: true });
}

function fenceTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(170,170,165,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  }, { repeat: [70, 1] });
}

function skyTexture() {
  return canvasTex(16, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#2b2340'); grd.addColorStop(0.45, '#a45a3a'); grd.addColorStop(0.7, '#f3a35a'); grd.addColorStop(1, '#3a2c25');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

function labelTexture(text, bg, fg) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2c230'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = fg; g.font = 'bold 54px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// ------------------------------------------------------------------ geometry helpers
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 14, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 10),
  ring: new THREE.RingGeometry(0.86, 1, 40),
  disc: new THREE.CircleGeometry(1, 40),
  plane: new THREE.PlaneGeometry(1, 1),
  torus: new THREE.TorusGeometry(1, 0.18, 8, 20),
  hemi: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
};
const matCache = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!o.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0.05, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, map: o.map || null, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide });
  if (!o.unique) matCache.set(key, m);
  return m;
}
function mesh(geo, m, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.scale.set(sx, sy, sz); o.position.set(x, y, z);
  return o;
}
const box = (m, sx, sy, sz, x = 0, y = 0, z = 0) => mesh(GEO.box, m, sx, sy, sz, x, y, z);
const rx = (o, a) => { o.rotation.x = a; return o; }; // catatan: Object3D.add() mengembalikan parent, jadi rotasi harus di-set sebelum add
function strut(m, a, b, r) {
  const d = tmpV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = d.length();
  const o = mesh(GEO.cyl6, m, r, L, r, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  o.quaternion.setFromUnitVectors(UP, d.normalize());
  return o;
}
const basicAdd = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

// ------------------------------------------------------------------ model builders
function buildHero(key, team) {
  const H = HEROES[key];
  const g = new THREE.Group();
  const mats = [];
  const M = (c, o = {}) => { const m = mat(c, { ...o, unique: true }); mats.push(m); return m; };
  const skin = M(0xc58a60), shirt = M(new THREE.Color(H.color).getHex()), pants = M(key === 'hse' || key === 'qs' ? 0x2d3240 : 0x8b7752);
  const vest = M(TEAM_COL[team], { emissive: TEAM_COL[team], ei: 0.25 }), stripe = M(0xe8e8e8, { emissive: 0x9a9a9a, ei: 0.6, metal: 0.5, rough: 0.3 });
  const bootM = M(0x4d321c), dark = M(0x222222);
  const body = new THREE.Group(); g.add(body);
  // kaki
  const leg = (sx) => { const p = new THREE.Group(); p.position.set(sx, 0.86, 0); p.add(box(pants, 0.22, 0.82, 0.26, 0, -0.41, 0)); p.add(box(bootM, 0.26, 0.16, 0.36, 0, -0.78, 0.04)); body.add(p); return p; };
  const legL = leg(-0.14), legR = leg(0.14);
  // badan
  body.add(box(shirt, 0.62, 0.66, 0.34, 0, 1.18, 0));
  body.add(box(vest, 0.66, 0.5, 0.38, 0, 1.2, 0));
  body.add(box(stripe, 0.67, 0.06, 0.39, 0, 1.06, 0));
  body.add(box(stripe, 0.67, 0.06, 0.39, 0, 1.3, 0));
  body.add(box(dark, 0.64, 0.08, 0.36, 0, 0.9, 0)); // sabuk
  // kepala & helm
  body.add(mesh(GEO.sph, skin, 0.17, 0.19, 0.17, 0, 1.66, 0));
  const hatCol = { structural: 0xf0f0f0, hse: 0xd42a2a, qs: 0xf0f0f0, surveyor: 0xf6c21b }[key];
  if (hatCol) {
    const hat = M(hatCol, { rough: 0.35 });
    body.add(mesh(GEO.hemi, hat, 0.21, 0.17, 0.21, 0, 1.74, 0));
    body.add(mesh(GEO.cyl, hat, 0.25, 0.02, 0.25, 0, 1.75, 0.03));
    if (key === 'hse') body.add(box(M(0xffffff), 0.05, 0.05, 0.22, 0, 1.9, 0));
  } else {
    body.add(mesh(GEO.hemi, dark, 0.18, 0.14, 0.18, 0, 1.72, -0.02)); // rambut
    body.add(box(M(0x3fd2ff, { emissive: 0x3fd2ff, ei: 1 }), 0.04, 0.3, 0.02, 0, 1.3, 0.2)); // lanyard ID
  }
  // lengan
  const arm = (sx) => { const p = new THREE.Group(); p.position.set(sx, 1.46, 0); p.add(box(shirt, 0.17, 0.62, 0.19, 0, -0.3, 0)); p.add(mesh(GEO.sph, skin, 0.08, 0.08, 0.08, 0, -0.64, 0)); body.add(p); return p; };
  const armL = arm(-0.4), armR = arm(0.4);
  // alat khas
  const tool = new THREE.Group(); tool.position.set(0, -0.62, 0.06); armR.add(tool);
  let drone = null;
  if (key === 'structural') {
    const st = M(0x4f6f9a, { metal: 0.7, rough: 0.35, emissive: 0x3366ff, ei: 0.35 });
    tool.add(box(st, 0.22, 0.03, 1.25, 0, 0.1, 0.5)); tool.add(box(st, 0.22, 0.03, 1.25, 0, -0.1, 0.5)); tool.add(box(st, 0.03, 0.2, 1.25, 0, 0, 0.5));
    tool.rotation.x = -0.4;
  } else if (key === 'hse') {
    const kit = new THREE.Group(); kit.position.set(0, -0.62, 0.08); armL.add(kit);
    kit.add(box(M(0xf4f4f4), 0.3, 0.22, 0.14));
    const red = M(0xd42a2a, { emissive: 0xd42a2a, ei: 0.4 });
    kit.add(box(red, 0.18, 0.05, 0.15)); kit.add(box(red, 0.05, 0.16, 0.15));
    tool.add(box(M(0x222222), 0.04, 0.5, 0.04, 0, 0.1, 0.1)); // baton
  } else if (key === 'drafter') {
    const glow = M(0x3fd2ff, { emissive: 0x3fd2ff, ei: 2 });
    tool.add(rx(mesh(GEO.cyl, glow, 0.035, 1.25, 0.035, 0, 0, 0.55), Math.PI / 2));
    tool.add(rx(mesh(GEO.cone, glow, 0.04, 0.16, 0.04, 0, 0, 1.24), Math.PI / 2));
    tool.add(rx(mesh(GEO.cyl, M(0x222831), 0.05, 0.25, 0.05, 0, 0, -0.08), Math.PI / 2));
  } else if (key === 'qs') {
    body.add(box(M(0xc9a227), 0.08, 0.36, 0.02, 0, 1.18, 0.2)); // dasi
    const docs = new THREE.Group(); docs.position.set(0, -0.6, 0.12); armL.add(docs);
    docs.add(box(M(0xffffff), 0.28, 0.06, 0.36)); docs.add(box(M(0xf2e6b8), 0.28, 0.02, 0.36, 0, 0.04, 0));
    tool.add(box(M(0x2a2a2a), 0.14, 0.03, 0.2, 0, 0, 0.08));
    tool.add(box(M(0x9bd36a, { emissive: 0x6fbf3a, ei: 0.8 }), 0.1, 0.031, 0.06, 0, 0.002, 0.12));
  } else if (key === 'surveyor') {
    // theodolite di punggung
    const back = new THREE.Group(); back.position.set(0, 1.2, -0.28); body.add(back);
    const lg = M(0xd9b23a, { metal: 0.4 });
    for (const a of [0, 2.1, 4.2]) back.add(strut(lg, [0, 0.4, 0], [Math.sin(a) * 0.15, -0.5, Math.cos(a) * 0.1 - 0.05], 0.02));
    back.add(box(M(0xf6c21b), 0.18, 0.16, 0.14, 0, 0.5, 0));
    back.add(rx(mesh(GEO.cyl, M(0x222222), 0.04, 0.16, 0.04, 0, 0.52, 0.08), Math.PI / 2));
    tool.add(box(M(0x2a2a2a), 0.12, 0.08, 0.18, 0, 0, 0.08));
    // drone kecil
    drone = new THREE.Group(); drone.position.set(0.7, 2.3, -0.3); g.add(drone);
    const dm = M(0x333333), lm = M(0x5dff6a, { emissive: 0x5dff6a, ei: 2 });
    drone.add(box(dm, 0.3, 0.07, 0.3)); drone.add(box(lm, 0.06, 0.03, 0.06, 0, -0.05, 0.12));
    for (const [x, z] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) drone.add(mesh(GEO.cyl, dm, 0.1, 0.01, 0.1, x, 0.06, z));
  }
  // cincin tim di kaki
  const ringM = basic(TEAM_COL[team], 0.85);
  ringM.userData.t = true;
  const ring = mesh(GEO.ring, ringM, 0.75, 0.75, 0.75, 0, 0.04, 0); ring.rotation.x = -Math.PI / 2; g.add(ring);
  mats.push(ringM);
  // status: bintang stun
  const stars = new THREE.Group(); stars.position.y = 2.2; stars.visible = false; g.add(stars);
  const sm = basicAdd(0xffe14a, 1);
  for (let i = 0; i < 3; i++) stars.add(mesh(GEO.sph, sm, 0.07, 0.07, 0.07, Math.cos(i * 2.1) * 0.3, 0, Math.sin(i * 2.1) * 0.3));
  // root: cincin beton
  const root = mesh(GEO.torus, mat(0x8a8a8a), 0.45, 0.45, 0.6, 0, 0.25, 0); root.rotation.x = Math.PI / 2; root.visible = false; g.add(root);
  // shield bubble
  const shM = basicAdd(0x9fd8ff, 0.18);
  const shield = mesh(GEO.sph, shM, 1.05, 1.25, 1.05, 0, 1.0, 0); shield.visible = false; g.add(shield);
  g.scale.setScalar(1.35);
  g.userData = { body, legL, legR, armL, armR, tool, mats, ring, stars, root, shield, drone };
  return g;
}

function buildMinion(type, team, seed) {
  const g = new THREE.Group();
  const teamM = mat(TEAM_COL[team], { emissive: TEAM_COL[team], ei: 0.3 });
  const s = { legs: [] };
  if (type === 'cat') {
    const fur = mat(seed % 2 ? 0xd48332 : 0x8f8b86);
    g.add(mesh(GEO.sph, fur, 0.2, 0.18, 0.36, 0, 0.36, 0));
    g.add(mesh(GEO.sph, fur, 0.15, 0.14, 0.14, 0, 0.55, 0.3));
    for (const x of [-0.08, 0.08]) g.add(mesh(GEO.cone, fur, 0.05, 0.1, 0.05, x, 0.7, 0.3));
    g.add(mesh(GEO.sph, mat(0xb8ff5a, { emissive: 0x88dd22, ei: 1 }), 0.025, 0.025, 0.025, -0.06, 0.58, 0.43));
    g.add(mesh(GEO.sph, mat(0xb8ff5a, { emissive: 0x88dd22, ei: 1 }), 0.025, 0.025, 0.025, 0.06, 0.58, 0.43));
    const tail = strut(fur, [0, 0.4, -0.3], [0, 0.75, -0.55], 0.04); g.add(tail);
    const scarf = mesh(GEO.torus, teamM, 0.13, 0.13, 0.13, 0, 0.47, 0.22); scarf.rotation.x = Math.PI / 2.4; g.add(scarf);
    for (const [x, z] of [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.2], [0.1, -0.2]]) { const l = mesh(GEO.cyl, fur, 0.04, 0.26, 0.04, x, 0.13, z); g.add(l); s.legs.push(l); }
    g.scale.setScalar(1.5);
  } else {
    const big = type === 'mastiff';
    const fur = mat(big ? 0x4a3628 : (seed % 2 ? 0x8b5a2b : 0xb38b5d));
    g.add(box(fur, 0.34, 0.32, 0.7, 0, 0.5, 0));
    g.add(box(teamM, 0.38, 0.22, 0.42, 0, 0.56, 0.02)); // rompi reflektor
    g.add(box(mat(0xe0e0e0, { emissive: 0x777777, ei: 0.5 }), 0.39, 0.04, 0.43, 0, 0.6, 0.02));
    g.add(box(fur, 0.26, 0.26, 0.3, 0, 0.75, 0.42));
    g.add(box(mat(0x2a1d14), 0.14, 0.12, 0.16, 0, 0.7, 0.62));
    for (const x of [-0.1, 0.1]) g.add(box(fur, 0.06, 0.14, 0.04, x, 0.92, 0.36));
    for (const [x, z] of [[-0.12, 0.25], [0.12, 0.25], [-0.12, -0.25], [0.12, -0.25]]) { const l = box(fur, 0.09, 0.36, 0.09, x, 0.18, z); g.add(l); s.legs.push(l); }
    if (big) {
      const cart = new THREE.Group(); cart.position.set(0, 0, -1.1); g.add(cart);
      const st = mat(0x6b6f75, { metal: 0.6, rough: 0.4 });
      cart.add(box(mat(0x5a4632), 0.8, 0.12, 0.9, 0, 0.42, 0));
      for (let i = 0; i < 3; i++) cart.add(box(st, 0.18, 0.18, 0.95, -0.22 + i * 0.22, 0.58, 0));
      for (const x of [-0.45, 0.45]) { const w = mesh(GEO.cyl, mat(0x222222), 0.22, 0.08, 0.22, x, 0.22, 0); w.rotation.z = Math.PI / 2; cart.add(w); }
      cart.add(strut(st, [0, 0.45, 0.45], [0, 0.5, 0.75], 0.03));
      g.scale.setScalar(1.75);
    } else g.scale.setScalar(1.45);
  }
  g.userData = s;
  return g;
}

function buildBoss(type, team) {
  const g = new THREE.Group();
  const s = { legs: [] };
  if (type === 'apexcat') {
    const fur = mat(0x6d5a48), dark = mat(0x3a2f26);
    g.add(mesh(GEO.sph, fur, 0.55, 0.5, 0.95, 0, 0.9, 0));
    g.add(mesh(GEO.sph, fur, 0.42, 0.38, 0.4, 0, 1.4, 0.8));
    for (const x of [-0.22, 0.22]) g.add(mesh(GEO.cone, fur, 0.12, 0.28, 0.12, x, 1.85, 0.8));
    g.add(mesh(GEO.sph, mat(0x9cff4a, { emissive: 0x7cff2a, ei: 2.5 }), 0.07, 0.07, 0.05, 0.14, 1.48, 1.16));
    g.add(box(dark, 0.16, 0.03, 0.05, -0.14, 1.5, 1.17)); // mata buta (bekas luka)
    const ch = mesh(GEO.torus, mat(0x9a9a9a, { metal: 0.9, rough: 0.3 }), 0.4, 0.4, 0.6, 0, 1.15, 0.55); ch.rotation.x = Math.PI / 2.3; g.add(ch);
    g.add(strut(fur, [0, 1.0, -0.8], [0, 1.9, -1.5], 0.1));
    for (const [x, z] of [[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.5], [0.3, -0.5]]) { const l = mesh(GEO.cyl, fur, 0.12, 0.7, 0.12, x, 0.35, z); g.add(l); s.legs.push(l); }
    const aura = mesh(GEO.ring, basicAdd(0x7cff6a, 0.35), 2.2, 2.2, 2.2, 0, 0.06, 0); aura.rotation.x = -Math.PI / 2; g.add(aura); s.aura = aura;
    g.scale.setScalar(2.3);
  } else {
    const fur = mat(team === 2 ? 0x2f241c : 0x3b2e22);
    g.add(box(fur, 0.8, 0.75, 1.7, 0, 1.1, 0));
    g.add(box(fur, 0.6, 0.55, 0.65, 0, 1.6, 1.0));
    g.add(box(mat(0x1a120c), 0.36, 0.26, 0.4, 0, 1.45, 1.42));
    for (const x of [-0.16, 0.16]) g.add(mesh(GEO.sph, mat(0xff3a1a, { emissive: 0xff2a00, ei: 3 }), 0.06, 0.05, 0.04, x, 1.72, 1.33));
    for (const x of [-0.22, 0.22]) g.add(box(fur, 0.12, 0.3, 0.08, x, 2.0, 0.85));
    const collar = mesh(GEO.torus, team === 2 ? mat(0x8a8a8a, { metal: 0.9 }) : mat(TEAM_COL[team], { emissive: TEAM_COL[team], ei: 0.8 }), 0.5, 0.5, 0.7, 0, 1.45, 0.7); collar.rotation.x = Math.PI / 2.2; g.add(collar);
    for (const [x, z] of [[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.6], [0.3, -0.6]]) { const l = box(fur, 0.22, 0.8, 0.22, x, 0.4, z); g.add(l); s.legs.push(l); }
    // rantai putus
    const chain = mat(0x9a9a9a, { metal: 0.9, rough: 0.3 });
    for (let i = 0; i < 4; i++) { const t = mesh(GEO.torus, chain, 0.08, 0.08, 0.08, 0.45, 1.2 - i * 0.14, 0.7 - i * 0.05); t.rotation.y = i * 1.5; g.add(t); }
    g.scale.setScalar(team === 2 ? 2.4 : 2.1);
  }
  g.userData = s;
  return g;
}

function buildStructure(type, team, tex) {
  const g = new THREE.Group();
  const steel = mat(0x6b6f75, { metal: 0.65, rough: 0.45 });
  const teamM = mat(TEAM_COL[team], { emissive: TEAM_COL[team], ei: 0.35 });
  const s = {};
  if (type === 'water') {
    const H = 7;
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]]) g.add(strut(steel, [x * 1.1, 0, z * 1.1], [x * 0.85, H, z * 0.85], 0.12));
    for (let lv = 0; lv < 3; lv++) {
      const y0 = lv * 2.3, y1 = y0 + 2.3, k0 = 1.32 - lv * 0.09, k1 = k0 - 0.09;
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; g.add(strut(steel, [a[0] * k0, y0, a[1] * k0], [b[0] * k1, y1, b[1] * k1], 0.05)); g.add(strut(steel, [b[0] * k0, y0, b[1] * k0], [a[0] * k1, y1, a[1] * k1], 0.05)); }
    }
    g.add(box(steel, 3.2, 0.2, 3.2, 0, H, 0));
    const tank = mat(0xb9c3c9, { metal: 0.5, rough: 0.35 });
    g.add(mesh(GEO.cyl, tank, 1.55, 2.4, 1.55, 0, H + 1.3, 0));
    g.add(mesh(GEO.hemi, tank, 1.55, 0.6, 1.55, 0, H + 2.5, 0));
    g.add(mesh(GEO.cyl, teamM, 1.58, 0.35, 1.58, 0, H + 1.6, 0));
    g.add(strut(mat(0x9aa4aa, { metal: 0.6 }), [0.9, 0, 0.9], [0.9, H, 0.9], 0.13)); // pipa riser
    const valve = mesh(GEO.torus, mat(0xd42a2a, { emissive: 0x801010, ei: 0.5 }), 0.3, 0.3, 0.3, 1.1, 1.6, 1.1); valve.rotation.y = Math.PI / 4; g.add(valve); s.valve = valve;
    const gauge = mesh(GEO.cyl, mat(0xffffff, { emissive: 0xffeeaa, ei: 0.4 }), 0.16, 0.06, 0.16, 0.75, H + 0.6, 1.2); gauge.rotation.x = Math.PI / 2; g.add(gauge);
    const head = new THREE.Group(); head.position.y = H + 0.6; g.add(head); s.head = head;
    const noz = mesh(GEO.cyl, mat(0x384048, { metal: 0.8, rough: 0.3 }), 0.2, 2.0, 0.2, 0, 0, 1.2); noz.rotation.x = Math.PI / 2; head.add(noz);
    head.add(mesh(GEO.sph, steel, 0.35, 0.35, 0.35));
    s.muzzleY = H + 0.6;
  } else if (type === 'lightning') {
    const H = 10;
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [x, z] of c) g.add(strut(steel, [x * 1.1, 0, z * 1.1], [x * 0.3, H, z * 0.3], 0.1));
    for (let lv = 0; lv < 4; lv++) {
      const y0 = lv * 2.5, y1 = y0 + 2.5, k0 = 1.1 - lv * 0.2, k1 = k0 - 0.2;
      for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; g.add(strut(steel, [a[0] * k0, y0, a[1] * k0], [b[0] * k1, y1, b[1] * k1], 0.04)); }
    }
    g.add(box(steel, 1, 0.15, 1, 0, H, 0));
    const ins = mat(0xe8dcc8, { rough: 0.3 });
    for (let i = 0; i < 5; i++) { const t = mesh(GEO.torus, ins, 0.28 - i * 0.02, 0.28 - i * 0.02, 0.5, 0, H + 0.25 + i * 0.22, 0); t.rotation.x = Math.PI / 2; g.add(t); }
    g.add(mesh(GEO.cyl, ins, 0.12, 1.2, 0.12, 0, H + 0.7, 0));
    const spear = new THREE.Group(); spear.position.y = H + 1.3 - 1.2; g.add(spear); s.spear = spear;
    const copper = mat(0xc8743a, { metal: 0.85, rough: 0.25, emissive: 0x2a60ff, ei: 0 });
    s.copper = copper;
    spear.add(mesh(GEO.cyl, copper, 0.06, 1.6, 0.06, 0, 0.8, 0));
    spear.add(mesh(GEO.cone, copper, 0.12, 0.6, 0.12, 0, 1.9, 0));
    spear.add(mesh(GEO.sph, copper, 0.25, 0.25, 0.25, 0, 0.6, 0));
    const glow = mesh(GEO.sph, basicAdd(0x5aa0ff, 0.0), 0.8, 0.8, 0.8, 0, 1.4, 0); spear.add(glow); s.glow = glow;
    g.add(mesh(GEO.cyl, teamM, 1.0, 0.3, 1.0, 0, 0.15, 0));
    g.add(strut(mat(0xb06a32, { metal: 0.8 }), [0.25, H, 0.25], [1.6, 0, 1.4], 0.03));
    s.muzzleY = H + 2.6;
  } else {
    // 3-Story Stacked Container Office
    const cm = mat(team === 0 ? 0x4b6f9e : 0xa8463a, { map: tex.corr, rough: 0.65, metal: 0.25 });
    const lv = (y, z, rotY = 0, len = 7.2) => { const c = box(cm, len, 2.6, 2.4, 0, y, z); c.rotation.y = rotY; g.add(c); return c; };
    lv(1.3, -1.25); lv(1.3, 1.25); lv(3.9, -1.25); lv(3.9, 1.25); lv(6.5, 0, Math.PI / 2, 6.0);
    const win = mat(0x1a2533, { emissive: 0x6fa8ff, ei: 0.25, rough: 0.2, metal: 0.5 });
    s.win = win;
    for (const y of [1.5, 4.1]) for (const x of [-2.5, 0, 2.5]) { g.add(box(win, 1.1, 0.8, 0.05, x, y, 2.48)); g.add(box(win, 1.1, 0.8, 0.05, x, y, -2.48)); }
    g.add(box(win, 0.05, 0.8, 1.2, 1.24, 6.7, 0)); g.add(box(win, 0.05, 0.8, 1.2, -1.24, 6.7, 0));
    // tangga eksternal
    const st = mat(0x3a3a3a, { metal: 0.7 });
    for (let i = 0; i < 9; i++) g.add(box(st, 0.9, 0.06, 0.35, -3.9, 0.3 + i * 0.29, -2.2 + i * 0.34));
    g.add(strut(st, [-4.35, 0, -2.4], [-4.35, 3, 0.9], 0.04)); g.add(strut(st, [-3.45, 0, -2.4], [-3.45, 3, 0.9], 0.04));
    // AC outdoor
    const ac = mat(0xe8e8e8);
    for (const z of [-1.8, 1.8]) { g.add(box(ac, 0.8, 0.6, 0.35, 3.0, 3.0, z * 1.48)); }
    // papan nama
    const sign = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: tex.sign[team] }));
    sign.scale.set(4.2, 1.05, 1); sign.position.set(0, 8.55, 0); g.add(sign); s.sign = sign;
    g.add(box(st, 0.08, 1.2, 0.08, -1.6, 8.0, 0)); g.add(box(st, 0.08, 1.2, 0.08, 1.6, 8.0, 0));
    // antena
    const ant = new THREE.Group(); ant.position.set(2.0, 7.8, 0); g.add(ant); s.ant = ant;
    ant.add(strut(st, [0, 0, 0], [0, 2.4, 0], 0.05));
    const dish = mesh(GEO.hemi, mat(0xdddddd, { side: THREE.DoubleSide }), 0.5, 0.25, 0.5, 0, 2.2, 0.2); dish.rotation.x = Math.PI / 2; ant.add(dish);
    // floodlight
    s.flood = [];
    for (const [x, z] of [[-2.6, 1.0], [-2.6, -1.0], [2.6, 1.0], [2.6, -1.0]]) {
      g.add(strut(st, [x, 7.8, z], [x, 9.2, z], 0.04));
      const lm = mat(0x333333, { emissive: 0xfff2c8, ei: 0, unique: true });
      g.add(box(lm, 0.5, 0.35, 0.2, x, 9.3, z)); s.flood.push(lm);
    }
    g.add(mesh(GEO.cyl, teamM, 4.4, 0.12, 4.4, 0, 0.06, 0));
    s.muzzleY = 7;
  }
  // HP rendah: kebocoran
  g.userData = s;
  return g;
}

function buildProj(style) {
  const g = new THREE.Group();
  switch (style) {
    case 'water': {
      const m = basicAdd(0x5ac8ff, 0.9);
      const o = mesh(GEO.cyl, m, 0.22, 1.6, 0.22); o.rotation.x = Math.PI / 2; g.add(o);
      g.add(mesh(GEO.sph, basicAdd(0xe0f6ff, 0.9), 0.3, 0.3, 0.3, 0, 0, 0.7));
      break;
    }
    case 'signal': g.add(mesh(GEO.sph, basicAdd(0x6ff0ff, 0.95), 0.45, 0.45, 0.45)); g.add(mesh(GEO.ring, basicAdd(0x6ff0ff, 0.6), 0.8, 0.8, 0.8)); break;
    case 'bark': { const t = mesh(GEO.torus, basicAdd(0xffe27a, 0.8), 0.25, 0.25, 0.5); g.add(t); break; }
    case 'cart': g.add(box(mat(0x777b80, { metal: 0.7 }), 0.25, 0.25, 0.5)); break;
    case 'boq': case 'atk-qs': g.add(box(mat(0xffffff, { emissive: 0xffffff, ei: 0.4 }), 0.4, 0.02, 0.5)); break;
    case 'atk-hse': g.add(mesh(GEO.sph, basicAdd(0x7cff9a, 0.95), 0.18, 0.18, 0.18)); break;
    case 'atk-surveyor': { const o = mesh(GEO.cyl, basicAdd(0x5dff6a, 0.95), 0.06, 1.2, 0.06); o.rotation.x = Math.PI / 2; g.add(o); break; }
    default: g.add(mesh(GEO.sph, basicAdd(0xffffff, 0.9), 0.15, 0.15, 0.15));
  }
  g.position.y = style === 'water' || style === 'signal' ? 6 : 1.2;
  g.userData.y0 = g.position.y;
  return g;
}

// ------------------------------------------------------------------ Renderer
export class Renderer {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0x6b4a3a, 45, 95);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 220);
    this.camTarget = new THREE.Vector3(20, 0, 50);
    this.camYaw = 0; // 0 = biru (musuh di kanan), PI = merah
    this.zoom = 1;
    this.ents = new Map();
    this.labels = new Map();
    this.fx = [];
    this.floats = [];
    this.myId = 0; this.myTeam = 0;
    this.time = 0;
    this.tex = { corr: corrugatedTexture(), sign: [labelTexture('SITE OFFICE • TIM BIRU', '#123a7a', '#ffffff'), labelTexture('SITE OFFICE • TIM MERAH', '#7a1414', '#ffffff')] };
    // cahaya golden hour (tetap), dunia dibangun per map lewat setMap()
    this.scene.add(new THREE.HemisphereLight(0xffd9b0, 0x3a3540, 1.25));
    const sun = new THREE.DirectionalLight(0xffb070, 2.4);
    sun.position.set(-60, 45, 30);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8aa6ff, 0.35);
    fill.position.set(50, 30, -40); this.scene.add(fill);
    this.map = null; this.world = null;
    this.setMap('blitz');
    this.initParticles();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(UP, 0);
    this.indicator = this.buildIndicator();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    // layar potret: mundurkan kamera supaya lane tetap terlihat
    this.portrait = h > w;
    this.camera.updateProjectionMatrix();
    this.W = w; this.H = h;
  }

  // bangun ulang dunia bila mode/map berganti
  setMap(mode) {
    const M = MAPS[mode] || MAPS.blitz;
    if (this.map === M) return;
    if (this.world) {
      this.scene.remove(this.world);
      const geos = new Set(Object.values(GEO)), mats = new Set(matCache.values());
      this.world.traverse((o) => {
        if (o.geometry && !geos.has(o.geometry)) o.geometry.dispose();
        if (o.material && !mats.has(o.material)) { if (o.material.map && o.material.map !== this.tex.corr) o.material.map.dispose(); o.material.dispose(); }
      });
    }
    this.map = M;
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildWorld(M);
  }

  buildWorld(M) {
    const S = this.world;
    const G = groundArea(M);
    // tanah
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(G.w, G.h), new THREE.MeshStandardMaterial({ map: groundTexture(M), roughness: 0.9, metalness: 0.05 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(G.x + G.w / 2, 0, G.z + G.h / 2);
    S.add(ground);
    // kontainer (instanced)
    const R = rng(42);
    const list = [];
    const PAL = [0xb5562a, 0x9c4a26, 0x3e5f8a, 0x4f6b3a, 0x8e2f25, 0x7b7f86, 0x2f4d6e];
    const PALC = { orange: [0xb5562a, 0xa34c25, 0xc0632e], blue: [0x3e5f8a, 0x35577f, 0x4a6c96], green: [0x4f6b3a, 0x5b7542, 0x445f33] };
    const put = (x, z, len, rotY, lvl, color) => list.push({ x, z, len, rotY, y: 1.3 + lvl * 2.6, color });
    for (const w of M.walls) {
      const L = w.x2 - w.x1, D = w.z2 - w.z1;
      const alongX = L >= D;
      const len = alongX ? L : D, dep = alongX ? D : L;
      const rows = Math.max(1, Math.round(dep / 2.45));
      const n = Math.max(1, Math.round(len / 12.2));
      for (let lvl = 0; lvl < w.stack; lvl++) for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
        if (lvl > 0 && R() < 0.3) continue;
        const pal = PALC[w.c] || PAL;
        const a = (i + 0.5) / n, b = (r + 0.5) / rows;
        const x = alongX ? w.x1 + L * a : w.x1 + L * b, z = alongX ? w.z1 + D * b : w.z1 + D * a;
        put(x, z, len / n - 0.15, alongX ? 0 : Math.PI / 2, lvl, pal[Math.floor(R() * pal.length)]);
      }
    }
    // dinding keliling: kontainer otomatis di luar setiap tepi area main
    const outside = (x, z) => !inAnyRect(x, z, M.walk, 0.4);
    for (const w of M.walk) {
      const edges = [
        [w.x1, w.z1, w.x2, w.z1, 0, -1], [w.x1, w.z2, w.x2, w.z2, 0, 1],
        [w.x1, w.z1, w.x1, w.z2, -1, 0], [w.x2, w.z1, w.x2, w.z2, 1, 0],
      ];
      for (const [ax, az, bx, bz, nx, nz] of edges) {
        const L = Math.hypot(bx - ax, bz - az), alongX = az === bz;
        for (let p = 0; p < L; p += 6.4) {
          const t = Math.min(L, p + 3.05);
          const cx = ax + (bx - ax) * t / L, cz = az + (bz - az) * t / L;
          for (let row = 0; row < 2; row++) {
            const off = 1.5 + row * 2.6;
            const x = cx + nx * off, z = cz + nz * off;
            if (!outside(x, z) || !outside(x - nx * 1.2, z - nz * 1.2)) continue;
            if (row === 1 && R() < 0.4) continue;
            const lv = 1 + Math.floor(R() * 2.2);
            for (let l = 0; l < lv; l++) put(x + rand(-0.2, 0.2), z + rand(-0.2, 0.2), 6.1, (alongX ? 0 : Math.PI / 2) + rand(-0.04, 0.04), l, PAL[Math.floor(R() * PAL.length)]);
          }
        }
      }
    }
    const cm = new THREE.MeshStandardMaterial({ map: this.tex.corr, roughness: 0.7, metalness: 0.25 });
    const inst = new THREE.InstancedMesh(GEO.box, cm, list.length);
    list.forEach((c, i) => {
      tmpQ.setFromAxisAngle(UP, c.rotY);
      tmpM.compose(tmpV.set(c.x, c.y, c.z), tmpQ, tmpS.set(c.len, 2.6, 2.44));
      inst.setMatrixAt(i, tmpM);
      inst.setColorAt(i, tmpC.setHex(c.color));
    });
    S.add(inst);
    // gantry crane kuning (ikon area laydown) di luar area main
    const yel = mat(0xd9a21b, { metal: 0.4, rough: 0.5 });
    const cranes = M.big ? [[40, -7, 0], [120, 167, 0], [-7, 80, Math.PI / 2]] : [[30, 66, 0], [110, 66, 0]];
    for (const [x, z, ry] of cranes) {
      const gc = new THREE.Group(); gc.position.set(x, 0, z); gc.rotation.y = ry; S.add(gc);
      for (const gx of [-9, 9]) for (const gz of [-2, 2]) gc.add(box(yel, 0.6, 10, 0.6, gx, 5, gz));
      gc.add(box(yel, 20, 0.9, 0.8, 0, 10.2, -2)); gc.add(box(yel, 20, 0.9, 0.8, 0, 10.2, 2));
      gc.add(box(mat(0x333333), 1.6, 1.2, 4.6, 3, 9.6, 0));
      gc.add(strut(mat(0x222222), [3, 9, 0], [3, 5, 0], 0.03));
      gc.add(mesh(GEO.torus, mat(0xd9a21b), 0.3, 0.3, 0.3, 3, 4.8, 0));
    }
    // dekorasi non-tabrak: drum oli, tumpukan H-beam, gulungan kabel — di luar lane, jauh dari struktur
    const drumM = [mat(0xa8322a, { metal: 0.4 }), mat(0x3a6aa8, { metal: 0.4 }), mat(0xd9a21b, { metal: 0.4 })];
    const laneDist = (x, z) => Math.min(...Object.values(M.laneData).map((L) => laneProject(L, x, z).d));
    const busy = [...M.structures, ...M.pits, ...M.spawn];
    let area = 0; for (const w of M.walk) area += (w.x2 - w.x1) * (w.z2 - w.z1);
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < area / 450; tries++) {
      const w = M.walk[Math.floor(R() * M.walk.length)];
      const x = w.x1 + 1.5 + R() * (w.x2 - w.x1 - 3), z = w.z1 + 1.5 + R() * (w.z2 - w.z1 - 3);
      if (laneDist(x, z) < M.laneWidth / 2 + 1.5 || inAnyRect(x, z, M.walls, 1.5) || inAnyRect(x, z, M.bushes, 1)) continue;
      if (busy.some((b) => Math.hypot(b.x - x, b.z - z) < 9)) continue;
      placed++;
      const k = Math.floor(R() * 3);
      if (k === 0) for (let i = 0; i < 3; i++) S.add(mesh(GEO.cyl, drumM[Math.floor(R() * 3)], 0.3, 0.9, 0.3, x + (i % 2) * 0.65, 0.45, z + (i > 1 ? 0.6 : 0)));
      else if (k === 1) { const st = mat(0x7a4f32, { metal: 0.5, rough: 0.6 }); const ry = R() * 3; for (let i = 0; i < 4; i++) { const b = box(st, 3.2, 0.3, 0.35, x + Math.sin(ry) * (i % 2) * 0.45, 0.25 + Math.floor(i / 2) * 0.32, z + Math.cos(ry) * (i % 2) * 0.45); b.rotation.y = ry; S.add(b); } }
      else { S.add(rx(mesh(GEO.cyl, mat(0x8a6238), 0.7, 0.6, 0.7, x, 0.7, z), Math.PI / 2)); S.add(rx(mesh(GEO.cyl, mat(0x222222), 0.55, 0.62, 0.55, x, 0.7, z), Math.PI / 2)); }
    }
    // jersey barrier kuning-hitam di ujung tumpukan kontainer
    const barTex = canvasTex(128, 32, (g2, w, h) => { for (let i = -2; i < 10; i++) { g2.fillStyle = i % 2 ? '#e2b21c' : '#1e1e1e'; g2.beginPath(); g2.moveTo(i * 16, h); g2.lineTo(i * 16 + 16, h); g2.lineTo(i * 16 + 32, 0); g2.lineTo(i * 16 + 16, 0); g2.fill(); } });
    const barM = new THREE.MeshStandardMaterial({ map: barTex, roughness: 0.7 });
    for (const w of M.walls) {
      const alongX = (w.x2 - w.x1) >= (w.z2 - w.z1);
      const b = box(barM, 2.4, 0.9, 0.5, alongX ? w.x2 + 1.4 : (w.x1 + w.x2) / 2, 0.45, alongX ? (w.z1 + w.z2) / 2 : w.z2 + 1.4);
      if (!alongX) b.rotation.y = Math.PI / 2;
      if (laneDist(b.position.x, b.position.z) > M.laneWidth / 2 + 1) S.add(b);
    }
    // ilalang (instanced, bergoyang angin)
    this.buildGrass(M);
    // tiang lampu sorot di luar area main
    const pole = mat(0x555555, { metal: 0.6 });
    const lamp = mat(0x222222, { emissive: 0xfff0c0, ei: 1.5 });
    const lamps = M.big ? [[40, 3.5], [80, 3.5], [120, 3.5], [40, 156.5], [80, 156.5], [120, 156.5], [3.5, 60], [3.5, 100], [156.5, 60], [156.5, 100]] : [[35, 59.6], [70, 59.6], [105, 59.6]];
    for (const [x, z] of lamps) { S.add(box(pole, 0.2, 9, 0.2, x, 4.5, z)); S.add(box(lamp, 1.4, 0.4, 0.4, x, 9, z)); }
  }

  buildGrass(M) {
    const R = rng(99);
    const tex = grassTexture();
    const geo = new THREE.BufferGeometry();
    // 2 bidang bersilang
    const pos = [], uv = [], idx = [];
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = pos.length / 3;
      pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
    const uTime = this.grassTime || { value: 0 };
    this.grassTime = uTime;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.25) * 0.18 * position.y;
        transformed.x += sway; transformed.z += sway * 0.5;`);
    };
    const tufts = [];
    for (const b of M.bushes) {
      const area = (b.x2 - b.x1) * (b.z2 - b.z1);
      for (let i = 0; i < area * 2.2; i++) tufts.push([rand(b.x1 + 0.2, b.x2 - 0.2), rand(b.z1 + 0.2, b.z2 - 0.2), rand(1.5, 2.1)]);
    }
    // ilalang dekoratif di sela kontainer keliling (di luar area main)
    for (const w of M.walk) {
      const per = 2 * ((w.x2 - w.x1) + (w.z2 - w.z1));
      for (let i = 0; i < per / 3; i++) {
        const side = Math.floor(R() * 4), t = R();
        const o = 0.3 + R() * 0.6;
        const x = side < 2 ? w.x1 + (w.x2 - w.x1) * t : side === 2 ? w.x1 - o : w.x2 + o;
        const z = side >= 2 ? w.z1 + (w.z2 - w.z1) * t : side === 0 ? w.z1 - o : w.z2 + o;
        if (inAnyRect(x, z, M.walk, 0.1)) continue;
        tufts.push([x, z, rand(0.9, 1.6)]);
      }
    }
    const inst = new THREE.InstancedMesh(geo, m, tufts.length);
    tufts.forEach(([x, z, h], i) => {
      tmpQ.setFromAxisAngle(UP, R() * Math.PI);
      tmpM.compose(tmpV.set(x, 0, z), tmpQ, tmpS.set(h * 0.8, h, h * 0.8));
      inst.setMatrixAt(i, tmpM);
      inst.setColorAt(i, tmpC.setRGB(0.85 + R() * 0.3, 0.85 + R() * 0.25, 0.7 + R() * 0.2));
    });
    this.world.add(inst);
  }

  // ------------------------------------------------------------------ particles
  initParticles() {
    const N = 700;
    this.pN = N;
    this.pMesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.p = Array.from({ length: N }, () => ({ life: 0 }));
    for (let i = 0; i < N; i++) { tmpM.makeScale(0, 0, 0); this.pMesh.setMatrixAt(i, tmpM); this.pMesh.setColorAt(i, tmpC.setHex(0xffffff)); }
    this.pNext = 0;
    this.scene.add(this.pMesh);
  }
  burst(x, y, z, n, color, { speed = 4, up = 4, life = 0.7, size = 0.12, grav = 9, spread = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const p = this.p[this.pNext]; const idx = this.pNext;
      this.pNext = (this.pNext + 1) % this.pN;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      p.x = x + (Math.random() - 0.5) * spread; p.y = y; p.z = z + (Math.random() - 0.5) * spread;
      p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = up * (0.5 + Math.random() * 0.7);
      p.life = p.max = life * (0.6 + Math.random() * 0.6); p.size = size * (0.6 + Math.random() * 0.8); p.g = grav;
      this.pMesh.setColorAt(idx, tmpC.set(Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color));
    }
    this.pMesh.instanceColor.needsUpdate = true;
  }
  updateParticles(dt) {
    for (let i = 0; i < this.pN; i++) {
      const p = this.p[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { tmpM.makeScale(0, 0, 0); this.pMesh.setMatrixAt(i, tmpM); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const s = p.size * Math.min(1, p.life / p.max * 2);
      tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ.setFromAxisAngle(UP, p.life * 6), tmpS.set(s, s, s));
      this.pMesh.setMatrixAt(i, tmpM);
    }
    this.pMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ timed FX objects
  addFx(obj, dur, update, onEnd) {
    this.scene.add(obj);
    this.fx.push({ obj, t0: this.time, dur, update, onEnd });
  }
  ringFx(x, z, r, color, dur = 0.5, { from = 0.2, y = 0.08, opacity = 0.9, fill = false } = {}) {
    const m = (fill ? basic : basicAdd)(color, opacity);
    const o = new THREE.Mesh(fill ? GEO.disc : GEO.ring, m);
    o.rotation.x = -Math.PI / 2; o.position.set(x, y, z);
    this.addFx(o, dur, (k) => { const s = r * (from + (1 - from) * Math.min(1, k * 1.6)); o.scale.set(s, s, s); m.opacity = opacity * (1 - k); }, () => m.dispose());
  }
  warnFx(x, z, r, color, dur) {
    const m = basic(color, 0.22), m2 = basicAdd(color, 0.9);
    const g = new THREE.Group();
    const d = new THREE.Mesh(GEO.disc, m); d.rotation.x = -Math.PI / 2; d.scale.setScalar(r); g.add(d);
    const rg = new THREE.Mesh(GEO.ring, m2); rg.rotation.x = -Math.PI / 2; rg.scale.setScalar(r); g.add(rg);
    const inner = new THREE.Mesh(GEO.disc, basic(color, 0.35)); inner.rotation.x = -Math.PI / 2; g.add(inner);
    g.position.set(x, 0.07, z);
    this.addFx(g, dur, (k) => { inner.scale.setScalar(Math.max(0.01, r * k)); }, () => { m.dispose(); m2.dispose(); inner.material.dispose(); });
  }
  beamFx(x1, z1, x2, z2, color, width = 0.6, dur = 0.35, y = 1.2) {
    const L = Math.hypot(x2 - x1, z2 - z1);
    const m = basicAdd(color, 1);
    const o = new THREE.Mesh(GEO.box, m);
    o.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    o.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    o.scale.set(width, width * 0.4, L);
    this.addFx(o, dur, (k) => { m.opacity = 1 - k; o.scale.x = width * (1 - k * 0.7); }, () => m.dispose());
  }
  boltFx(pts, color = 0x7fc8ff, dur = 0.3) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
      let px = ax, py = ay, pz = az;
      const seg = 6;
      for (let k = 1; k <= seg; k++) {
        const t = k / seg;
        const nx = ax + (bx - ax) * t + (k < seg ? rand(-0.5, 0.5) : 0), ny = ay + (by - ay) * t + (k < seg ? rand(-0.4, 0.4) : 0), nz = az + (bz - az) * t + (k < seg ? rand(-0.5, 0.5) : 0);
        const m = basicAdd(color, 1);
        const o = strut(m, [px, py, pz], [nx, ny, nz], 0.07);
        this.addFx(o, dur, (q) => { m.opacity = 1 - q; }, () => m.dispose());
        px = nx; py = ny; pz = nz;
      }
    }
  }
  meshFx(obj, dur, update) { this.addFx(obj, dur, update, () => obj.traverse((o) => { if (o.material && o.material.dispose && !matCache.has(o.material)) o.material.dispose?.(); })); }

  textFx(x, y, z, text, cls) {
    const el = document.createElement('div');
    el.className = 'float ' + (cls || '');
    el.textContent = text;
    this.overlay.appendChild(el);
    this.floats.push({ el, x, y, z, t0: this.time, dur: cls && cls.includes('big') ? 1.4 : 0.9, dx: rand(-0.4, 0.4) });
    if (this.floats.length > 45) { const f = this.floats.shift(); f.el.remove(); }
  }

  // ------------------------------------------------------------------ indikator aim skill
  buildIndicator() {
    const g = new THREE.Group(); g.visible = false;
    const rangeM = basic(0xffffff, 0.12), edgeM = basicAdd(0x9fd8ff, 0.7), aoeM = basic(0x6fc8ff, 0.3), lineM = basic(0x6fc8ff, 0.35);
    const range = new THREE.Mesh(GEO.disc, rangeM); range.rotation.x = -Math.PI / 2;
    const edge = new THREE.Mesh(GEO.ring, edgeM); edge.rotation.x = -Math.PI / 2;
    const aoe = new THREE.Mesh(GEO.disc, aoeM); aoe.rotation.x = -Math.PI / 2;
    const line = new THREE.Mesh(GEO.plane, lineM); line.rotation.x = -Math.PI / 2;
    g.add(range, edge, aoe, line);
    g.position.y = 0.1;
    this.scene.add(g);
    return { g, range, edge, aoe, line, aoeM, lineM };
  }
  showIndicator(skill, aim) {
    const I = this.indicator;
    const me = this.ents.get(this.myId);
    if (!skill || !me) { I.g.visible = false; return; }
    I.g.visible = true;
    I.g.position.set(me.px, 0.1, me.pz);
    const R = skill.range || skill.aoe || 2;
    I.range.scale.setScalar(R); I.edge.scale.setScalar(R);
    I.range.visible = I.edge.visible = skill.kind !== 'self';
    I.aoe.visible = false; I.line.visible = false;
    const col = aim.cancel ? 0xff4040 : 0x6fc8ff;
    I.aoeM.color.setHex(col); I.lineM.color.setHex(col);
    if (skill.kind === 'dir') {
      const L = skill.range, w = skill.width || 1;
      I.line.visible = true;
      I.line.scale.set(w, L, 1);
      I.line.rotation.z = -aim.angle + Math.PI;
      I.line.position.set(Math.sin(aim.angle) * L / 2, 0.01, Math.cos(aim.angle) * L / 2);
    } else if (skill.kind === 'point') {
      I.aoe.visible = true; I.aoe.scale.setScalar(skill.aoe || 1.5);
      I.aoe.position.set(aim.x - me.px, 0.02, aim.z - me.pz);
    } else if (skill.kind === 'self') {
      if (skill.aoe) { I.aoe.visible = true; I.aoe.scale.setScalar(skill.aoe); I.aoe.position.set(0, 0.02, 0); }
    }
  }

  // ------------------------------------------------------------------ entities
  createEnt(o) {
    let obj;
    if (o.k === 'h') obj = buildHero(o.s, o.tm);
    else if (o.k === 'm') obj = buildMinion(o.s, o.tm, o.i);
    else if (o.k === 's') obj = buildStructure(o.s, o.tm, this.tex);
    else if (o.k === 'b') obj = buildBoss(o.s, o.tm);
    else obj = buildProj(o.s);
    obj.position.set(o.x, obj.position.y, o.z);
    obj.rotation.y = o.f || 0;
    this.scene.add(obj);
    const r = { id: o.i, k: o.k, s: o.s, tm: o.tm, obj, px: o.x, pz: o.z, f: o.f || 0, fromX: o.x, fromZ: o.z, toX: o.x, toZ: o.z, fromF: o.f || 0, toF: o.f || 0, t0: this.time, d: o, atkT: -9, castT: -9, phase: Math.random() * 6, speed: 0, alpha: 1 };
    if (o.k !== 'p') this.makeLabel(r);
    if (o.k === 's') { r.armed = !!(o.fl & 8192); if (o.s === 'lightning' && r.armed) obj.userData.spear.position.y += 1.2; }
    return r;
  }

  makeLabel(r) {
    const el = document.createElement('div');
    const o = r.d;
    el.className = 'lbl lbl-' + r.k;
    if (r.k === 'h') el.innerHTML = `<div class="nm"><span class="lv"></span><span class="nmt"></span></div><div class="bar"><i class="hp"></i><i class="sh"></i></div>`;
    else el.innerHTML = '<div class="bar"><i class="hp"></i></div>';
    this.overlay.appendChild(el);
    r.lbl = el; r.lblHp = el.querySelector('.hp'); r.lblSh = el.querySelector('.sh'); r.lblLv = el.querySelector('.lv'); r.lblNm = el.querySelector('.nmt');
    if (r.lblNm) r.lblNm.textContent = o.n || '';
    this.colorLabel(r);
  }
  colorLabel(r) {
    const own = r.id === this.myId;
    const ally = r.tm === this.myTeam;
    r.lbl.classList.toggle('own', own);
    r.lbl.classList.toggle('ally', ally && !own);
    r.lbl.classList.toggle('enemy', !ally && r.tm !== 2);
    r.lbl.classList.toggle('neutral', r.tm === 2);
    if (r.k === 'h' && r.obj.userData.ring) r.obj.userData.ring.material.color.setHex(own ? 0xffd23a : TEAM_COL[r.tm]);
  }

  removeEnt(r) {
    this.scene.remove(r.obj);
    if (r.k === 'h') r.obj.userData.mats.forEach((m) => m.dispose());
    if (r.lbl) r.lbl.remove();
    this.ents.delete(r.id);
  }

  setMe(id, team) {
    this.myId = id; this.myTeam = team;
    this.camYaw = team === 1 ? Math.PI : 0;
    for (const r of this.ents.values()) if (r.lbl) this.colorLabel(r);
  }

  reset() {
    for (const r of [...this.ents.values()]) this.removeEnt(r);
    for (const f of this.fx) { this.scene.remove(f.obj); f.onEnd && f.onEnd(); }
    this.fx = [];
    for (const f of this.floats) f.el.remove();
    this.floats = [];
    this.pred = null;
  }

  applySnapshot(snap) {
    const now = this.time;
    const seen = new Set();
    for (const o of snap.ents) {
      seen.add(o.i);
      let r = this.ents.get(o.i);
      if (!r) { r = this.createEnt(o); this.ents.set(o.i, r); }
      r.fromX = r.px; r.fromZ = r.pz; r.toX = o.x; r.toZ = o.z; r.fromF = r.f; r.toF = o.f; r.t0 = now;
      const prev = r.d;
      r.d = o;
      r.hidden = false;
      if (r.k === 'h') {
        if (Math.abs(o.x - prev.x) + Math.abs(o.z - prev.z) > 6) { r.px = r.fromX = o.x; r.pz = r.fromZ = o.z; } // teleport/recall/rewind
        if ((o.fl & 64) && !(prev.fl & 64)) r.deadT = now;
      }
      if (r.k === 's' && (o.fl & 8192) && !r.armed) r.armed = true;
    }
    for (const r of [...this.ents.values()]) {
      if (seen.has(r.id)) continue;
      if (r.k === 'h') { r.hidden = true; continue; } // hero tersembunyi (semak / tidak terlihat)
      this.removeEnt(r);
    }
    for (const r of this.ents.values()) if (r.k === 'h') { r.obj.visible = !r.hidden; if (r.lbl) r.lbl.style.display = r.hidden ? 'none' : ''; }
  }

  // prediksi gerak hero sendiri
  predict(input, dt, ms) {
    const me = this.ents.get(this.myId);
    if (!me || (me.d.fl & (64 | 1 | 16))) { this.pred = null; return; }
    if (!this.pred) this.pred = { x: me.toX, z: me.toZ };
    const P = this.pred;
    P.x += input.mx * ms * dt; P.z += input.mz * ms * dt;
    const lead = 0.07;
    const tx = me.toX + input.mx * ms * lead, tz = me.toZ + input.mz * ms * lead;
    const k = Math.min(1, dt * (input.mx || input.mz ? 6 : 10));
    P.x += (tx - P.x) * k; P.z += (tz - P.z) * k;
    if (Math.abs(tx - P.x) + Math.abs(tz - P.z) > 4) { P.x = tx; P.z = tz; }
  }

  onEvent(e) {
    const E = (id) => this.ents.get(id);
    const now = this.time;
    switch (e.t) {
      case 'atk': {
        const r = E(e.id); if (!r) break;
        r.atkT = now;
        if (r.k === 'h' && HEROES[r.s].melee) {
          const t = E(e.tg); if (t) this.burst(t.px, 1.1, t.pz, 5, r.s === 'drafter' ? ['#3fd2ff', '#ffffff'] : ['#ffd27a', '#ffffff'], { speed: 3, up: 2, life: 0.3, size: 0.08 });
        }
        if (r.k === 'm' && r.s === 'cat') { const t = E(e.tg); if (t) this.burst(t.px, 0.6, t.pz, 4, ['#ffb03a', '#ff6a1a'], { speed: 2.5, up: 2, life: 0.25, size: 0.07 }); }
        break;
      }
      case 'cast': { const r = E(e.id); if (r) r.castT = now; break; }
      case 'tfire': {
        const r = E(e.id), t = E(e.tg);
        if (r) { r.fireT = now; if (t) r.aimF = Math.atan2(t.px - r.px, t.pz - r.pz); }
        if (r && e.k === 'water') this.burst(r.px, 8, r.pz, 8, ['#bfe9ff', '#ffffff'], { speed: 2, up: 3, life: 0.5, size: 0.1 });
        break;
      }
      case 'die': {
        if (e.k === 'minion') this.burst(e.x, 0.5, e.z, 14, ['#bba68a', '#8a7a66', '#ffffff'], { speed: 3, up: 3, life: 0.6, size: 0.12 });
        else if (e.k === 'struct') { this.burst(e.x, 5, e.z, 70, ['#8a8a8a', '#5a5a5a', '#ff9a3a', '#ffd27a'], { speed: 9, up: 10, life: 1.6, size: 0.35, spread: 3 }); this.ringFx(e.x, e.z, 10, 0xffb060, 0.8); }
        else if (e.k === 'boss') this.burst(e.x, 1.5, e.z, 50, ['#c7b08a', '#ffffff', '#7cff6a'], { speed: 6, up: 6, life: 1.2, size: 0.25, spread: 2 });
        else if (e.k === 'hero') this.burst(e.x, 1, e.z, 20, ['#ffffff', '#cccccc'], { speed: 3, up: 4, life: 0.8, size: 0.12 });
        break;
      }
      case 'dmg': {
        const r = E(e.id); if (!r) break;
        const mine = e.s === this.myId || e.id === this.myId;
        if (!mine && r.k !== 'h') break;
        const cls = e.c ? 'crit' : e.k === 'magic' ? 'magic' : e.k === 'true' ? 'true' : (e.id === this.myId ? 'hurt' : '');
        this.textFx(r.px, 2.6, r.pz, (e.c ? '✦' : '') + e.v, cls);
        break;
      }
      case 'heal': { const r = E(e.id); if (r) { this.textFx(r.px, 2.6, r.pz, '+' + e.v, 'heal'); this.burst(r.px, 1, r.pz, 8, ['#7cff9a', '#d8ffe0'], { speed: 1, up: 3, life: 0.8, size: 0.09, grav: -1 }); } break; }
      case 'gold': if (e.id === this.myId) { const r = E(e.id); if (r) this.textFx(r.px, 3.2, r.pz, '+' + e.v + 'g', 'gold'); } break;
      case 'lvl': { const r = E(e.id); if (r) { this.ringFx(r.px, r.pz, 2.2, 0xffd23a, 0.7); if (e.id === this.myId) this.textFx(r.px, 3.4, r.pz, 'LEVEL ' + e.v, 'gold big'); } break; }
      case 'respawn': { const r = E(e.id); if (r) { r.px = r.toX; r.pz = r.toZ; this.ringFx(r.toX, r.toZ, 2.5, 0x9fd8ff, 0.8); } if (e.id === this.myId) this.pred = null; break; }
      case 'arm': {
        const r = E(e.id);
        this.ringFx(e.x, e.z, 7, e.k === 'lightning' ? 0x6aa8ff : 0xfff0b0, 1.2);
        this.burst(e.x, 9, e.z, 40, e.k === 'lightning' ? ['#9fd0ff', '#ffffff'] : ['#ffffff', '#cccccc'], { speed: 4, up: 5, life: 1.2, size: 0.15 });
        if (r) r.armT = now;
        break;
      }
      case 'fx': this.skillFx(e); break;
    }
  }

  skillFx(e) {
    const r = e.id ? this.ents.get(e.id) : null;
    const ang = Math.atan2(e.dx || 0, e.dz || 1);
    switch (e.k) {
      case 'shear': {
        // sapuan balok IWF: busur merah-biru
        for (let i = 0; i < 7; i++) {
          const a = ang - 1 + i / 6 * 2;
          this.beamFx(e.x, e.z, e.x + Math.sin(a) * e.r, e.z + Math.cos(a) * e.r, i % 2 ? 0xff4a4a : 0x4a7aff, 0.25, 0.3, 1.0);
        }
        this.burst(e.x + Math.sin(ang) * 2.5, 1, e.z + Math.cos(ang) * 2.5, 16, ['#ff5a5a', '#5a8aff', '#ffffff'], { speed: 6, up: 2, life: 0.4 });
        break;
      }
      case 'pillar-warn': this.warnFx(e.x, e.z, e.r, 0xff8a3a, 0.5); break;
      case 'pillar': {
        const g = new THREE.Group(); g.position.set(e.x, 0, e.z);
        const cm = mat(0xa8a39a, { unique: true });
        for (let i = 0; i < 5; i++) { const a = i * 1.26; g.add(box(cm, 0.7, 2.6, 0.7, Math.cos(a) * e.r * 0.6, 1.3, Math.sin(a) * e.r * 0.6)); }
        g.add(box(cm, 1.0, 3.2, 1.0, 0, 1.6, 0));
        this.meshFx(g, 1.4, (k) => { g.position.y = k < 0.15 ? -3 + k / 0.15 * 3 : k > 0.8 ? -(k - 0.8) / 0.2 * 3.2 : 0; });
        this.burst(e.x, 0.3, e.z, 24, ['#a8a39a', '#6a655c'], { speed: 5, up: 6, life: 0.8, size: 0.2, spread: e.r });
        break;
      }
      case 'quake': {
        this.ringFx(e.x, e.z, e.r, 0xff5040, 0.6); this.ringFx(e.x, e.z, e.r * 0.45, 0x4a7aff, 0.5);
        this.ringFx(e.x, e.z, e.r, 0x6a4a2a, 0.9, { fill: true, opacity: 0.35, from: 0.9 });
        this.burst(e.x, 0.4, e.z, 60, ['#a08060', '#6a5030', '#ff6a4a', '#ffffff'], { speed: 7, up: 9, life: 1.1, size: 0.25, spread: e.r });
        this.shake = 0.6;
        break;
      }
      case 'lob': {
        const g = new THREE.Group(); g.add(box(mat(0xffffff), 0.5, 0.35, 0.25)); g.add(box(mat(0xd42a2a, { emissive: 0xd42a2a, ei: 0.6 }), 0.3, 0.08, 0.27)); g.add(box(mat(0xd42a2a, { emissive: 0xd42a2a, ei: 0.6 }), 0.08, 0.3, 0.27));
        this.meshFx(g, 0.35, (k) => { g.position.set(e.x + (e.x2 - e.x) * k, 1.5 + Math.sin(k * Math.PI) * 3, e.z + (e.z2 - e.z) * k); g.rotation.x = k * 8; });
        break;
      }
      case 'healzone': this.ringFx(e.x, e.z, e.r, 0x5aff7a, 0.8, { from: 0.3 }); this.ringFx(e.x, e.z, e.r, 0x5aff7a, 0.9, { fill: true, opacity: 0.25, from: 1 }); this.burst(e.x, 0.5, e.z, 26, ['#7cff9a', '#ffffff'], { speed: 2, up: 4, life: 1, size: 0.12, grav: -2, spread: e.r }); break;
      case 'stop': {
        this.beamFx(e.x, e.z, e.x + e.dx * e.r, e.z + e.dz * e.r, 0xffe14a, 3.6, 0.35, 0.6);
        const sign = new THREE.Group(); const p = mesh(GEO.cyl, mat(0xd42a2a, { emissive: 0xd42a2a, ei: 0.8 }), 0.9, 0.08, 0.9); p.rotation.x = Math.PI / 2; sign.add(p);
        sign.add(box(mat(0xffffff, { emissive: 0xffffff, ei: 0.8 }), 1.2, 0.25, 0.1, 0, 0, 0.05));
        sign.position.set(e.x + e.dx * 2, 2.6, e.z + e.dz * 2); sign.rotation.y = ang;
        this.meshFx(sign, 0.8, (k) => { sign.scale.setScalar(k < 0.2 ? k * 5 : 1); sign.position.y = 2.6 + k; });
        break;
      }
      case 'ppe': this.ringFx(e.x, e.z, e.r, 0x5aff7a, 1.0); this.burst(e.x, 1, e.z, 40, ['#7cff9a', '#ffe14a', '#ffffff'], { speed: 8, up: 5, life: 1.0, size: 0.14 }); break;
      case 'ppe-on': {
        if (!r) break;
        const dome = mesh(GEO.hemi, basicAdd(0x7cff9a, 0.35), 1.6, 1.8, 1.6);
        this.meshFx(dome, 3, (k) => { dome.position.set(r.px, 0, r.pz); dome.material.opacity = 0.35 * (1 - k); });
        break;
      }
      case 'dash': this.beamFx(e.x, e.z, e.x2, e.z2, new THREE.Color(e.c || '#3fd2ff').getHex(), 0.5, 0.45, 1.0); this.burst(e.x2, 1, e.z2, 10, [e.c || '#3fd2ff', '#ffffff'], { speed: 3, up: 2, life: 0.4, size: 0.08 }); break;
      case 'freeze': if (r) { this.ringFx(r.px, r.pz, 1.5, 0x3fd2ff, 0.5); this.textFx(r.px, 3, r.pz, 'LAYER OFF', 'cad'); } break;
      case 'rewind': this.beamFx(e.x, e.z, e.x2, e.z2, 0x3fd2ff, 0.3, 0.6, 1.2); this.textFx(e.x2, 3.2, e.z2, 'CTRL+Z', 'cad big'); this.burst(e.x, 1, e.z, 20, ['#3fd2ff', '#ff3a3a', '#3aff6a'], { speed: 3, up: 3, life: 0.6, size: 0.1 }); break;
      case 'hatch': {
        this.ringFx(e.x, e.z, e.r, 0x3fd2ff, 0.6);
        const tex = canvasTex(128, 128, (g2, w, h) => { g2.strokeStyle = '#3fffb0'; g2.lineWidth = 4; for (let i = -h; i < w; i += 14) { g2.beginPath(); g2.moveTo(i, h); g2.lineTo(i + h, 0); g2.stroke(); } });
        const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
        const d = new THREE.Mesh(GEO.disc, m); d.rotation.x = -Math.PI / 2; d.position.set(e.x, 0.09, e.z); d.scale.setScalar(e.r);
        this.addFx(d, 0.8, (k) => { m.opacity = 0.8 * (1 - k); }, () => { m.dispose(); tex.dispose(); });
        this.burst(e.x, 1, e.z, 30, ['#3fd2ff', '#3fffb0', '#ff4a4a'], { speed: 6, up: 4, life: 0.6, size: 0.12, spread: 2 });
        break;
      }
      case 'audit': { const t = this.ents.get(e.id); this.textFx(e.x, 3.4, e.z, 'AUDIT −30%', 'audit big'); if (t) this.ringFx(t.px, t.pz, 1.4, 0xff3a3a, 0.6); break; }
      case 'vault-warn': this.warnFx(e.x, e.z, e.r, 0xffd23a, 0.8); break;
      case 'vault': {
        const g = new THREE.Group();
        g.add(box(mat(0x4a4f56, { metal: 0.8, rough: 0.3 }), 1.8, 1.8, 1.8));
        g.add(rx(mesh(GEO.cyl, mat(0xd4af37, { metal: 0.9, rough: 0.2, emissive: 0x6a5010 }), 0.45, 0.1, 0.45, 0, 0, 0.92), Math.PI / 2));
        g.position.set(e.x, 0.9, e.z);
        this.meshFx(g, 1.0, (k) => { g.position.y = 0.9 + Math.max(0, (k > 0.7 ? -(k - 0.7) / 0.3 * 3 : 0)); });
        this.ringFx(e.x, e.z, e.r, 0xffd23a, 0.6);
        this.burst(e.x, 0.5, e.z, 50, ['#ffd23a', '#fff2a8', '#c8a030'], { speed: 7, up: 8, life: 1.1, size: 0.14, spread: 1 });
        this.shake = 0.35;
        break;
      }
      case 'drone': {
        const g = new THREE.Group();
        g.add(box(mat(0x333333), 0.6, 0.12, 0.6)); g.add(box(mat(0x5dff6a, { emissive: 0x5dff6a, ei: 2 }), 0.15, 0.06, 0.15, 0, -0.1, 0));
        const cone = mesh(GEO.cone, basicAdd(0x5dff6a, 0.12), e.r, 5, e.r, 0, -2.5, 0); g.add(cone);
        const scan = mesh(GEO.ring, basicAdd(0x5dff6a, 0.6), e.r, e.r, e.r, 0, -4.9, 0); scan.rotation.x = -Math.PI / 2; g.add(scan);
        const mine = e.team === this.myTeam;
        cone.visible = scan.visible = mine;
        this.meshFx(g, 5.4, (k) => {
          const t = Math.min(1, k * 5.4 / 0.5);
          g.position.set(e.x + (e.x2 - e.x) * t, 5 + Math.sin(this.time * 3) * 0.2, e.z + (e.z2 - e.z) * t);
          g.rotation.y = this.time * 2;
          cone.visible = scan.visible = mine && t >= 1;
        });
        break;
      }
      case 'laser': this.beamFx(e.x, e.z, e.x2, e.z2, 0x4dff5a, 0.7, 0.45, 1.3); this.burst(e.x2, 1.3, e.z2, 10, ['#4dff5a', '#ffffff'], { speed: 2, up: 1, life: 0.3, size: 0.08 }); break;
      case 'orbital-warn': this.warnFx(e.x, e.z, e.r, 0x4dff5a, 1.0); break;
      case 'strike': this.beamFx(e.x, e.z, e.x + 0.01, e.z + 0.01, 0x4dff5a, 1.6, 0.4, 1); { const m = basicAdd(0x7dff8a, 1); const col = mesh(GEO.cyl, m, 0.7, 30, 0.7, e.x, 15, e.z); this.addFx(col, 0.4, (k) => { m.opacity = 1 - k; col.scale.x = col.scale.z = 0.7 * (1 - k); }, () => m.dispose()); } this.ringFx(e.x, e.z, e.r, 0x4dff5a, 0.5); this.burst(e.x, 0.3, e.z, 26, ['#4dff5a', '#ffffff', '#a08060'], { speed: 6, up: 7, life: 0.7, size: 0.13, spread: 1 }); this.shake = 0.25; break;
      case 'chain': this.boltFx(e.pts.map((p) => [p[0], 1.2, p[1]]), 0x7fd0ff, 0.25); break;
      case 'bolt': { const pts = e.pts.map((p, i) => [p[0], i === 0 ? 12.5 : 1.2, p[1]]); this.boltFx(pts, 0x8fc8ff, 0.3); const last = e.pts[e.pts.length - 1]; this.burst(last[0], 1, last[1], 10, ['#9fd0ff', '#ffffff'], { speed: 4, up: 3, life: 0.3, size: 0.08 }); break; }
      case 'leap': this.beamFx(e.x, e.z, e.x2, e.z2, 0x7cff6a, 0.6, 0.4, 1.5); break;
      case 'cleave': this.ringFx(e.x, e.z, e.r, 0x7cff6a, 0.5); this.burst(e.x, 0.5, e.z, 20, ['#a8c890', '#7cff6a'], { speed: 5, up: 3, life: 0.5, size: 0.12 }); break;
      case 'howl': this.ringFx(e.x, e.z, e.r, 0xff3a1a, 0.7); this.ringFx(e.x, e.z, e.r * 0.6, 0xff8a1a, 0.6); this.shake = 0.3; break;
      case 'harness': this.ringFx(e.x, e.z, 2.2, 0x7cff9a, 1.6); this.textFx(e.x, 3, e.z, 'ZERO FATALITY', 'heal big'); break;
      case 'recall': if (r) r.recallFx = this.time; break;
      case 'recalled': case 'recallx': if (r) r.recallFx = 0; break;
    }
  }

  // ------------------------------------------------------------------ per-frame
  frame(dt, input) {
    this.time += dt;
    const now = this.time;
    if (this.grassTime) this.grassTime.value = now;
    const lerpT = (r) => Math.min(1, (now - r.t0) * SNAP_HZ * 0.92);
    for (const r of this.ents.values()) {
      const k = lerpT(r);
      const ox = r.px, oz = r.pz;
      r.px = r.fromX + (r.toX - r.fromX) * k;
      r.pz = r.fromZ + (r.toZ - r.fromZ) * k;
      if (r.id === this.myId && this.pred) { r.px = this.pred.x; r.pz = this.pred.z; }
      r.f = lerpAngle(r.f, r.toF, Math.min(1, dt * 14));
      const sp = Math.hypot(r.px - ox, r.pz - oz) / Math.max(dt, 1e-3);
      r.speed += (sp - r.speed) * Math.min(1, dt * 10);
      const o = r.obj;
      o.position.x = r.px; o.position.z = r.pz;
      if (r.k === 'p') { o.rotation.y = r.f; continue; }
      if (r.k !== 's') o.rotation.y = r.f;
      this.animate(r, dt);
    }
    // FX
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      const k = (now - f.t0) / f.dur;
      if (k >= 1) { this.scene.remove(f.obj); f.onEnd && f.onEnd(); this.fx.splice(i, 1); continue; }
      f.update && f.update(k);
    }
    this.updateParticles(dt);
    // kamera
    const me = this.ents.get(this.myId);
    if (me) this.camTarget.lerp(tmpV.set(me.px, 0, me.pz), Math.min(1, dt * 8));
    else if (this.spectate) this.camTarget.lerp(tmpV.set(this.spectate.x, 0, this.spectate.z), Math.min(1, dt * 2));
    const dist = (this.portrait ? 34 : 25) * this.zoom;
    const back = dist * 0.62, up = dist;
    const yaw = this.camYaw;
    let sx = 0, sz = 0;
    if (this.shake > 0) { this.shake -= dt; sx = rand(-0.25, 0.25) * this.shake * 2; sz = rand(-0.25, 0.25) * this.shake * 2; }
    // kamera di sisi +z untuk BIRU (musuh di kanan layar), sisi -z untuk MERAH (diputar 180°)
    const sgn = yaw ? -1 : 1;
    const av = this.map ? this.map.ahead : [1, 0]; // geser pandangan sedikit ke arah musuh
    const ax = av[0] * 2.5 * sgn, az = av[1] * 2.5 * sgn;
    this.camera.position.set(this.camTarget.x + ax + sx, up, this.camTarget.z + az + sgn * back + sz);
    this.camera.lookAt(this.camTarget.x + ax, 0, this.camTarget.z + az - sgn * 2);
    this.gl.render(this.scene, this.camera);
    this.updateLabels();
    void input;
  }

  animate(r, dt) {
    const now = this.time;
    const U = r.obj.userData;
    const fl = r.d.fl || 0;
    if (r.k === 'h') {
      const dead = fl & 64;
      const moving = r.speed > 0.6 && !dead;
      r.phase += dt * (moving ? 11 : 0);
      const sw = moving ? Math.sin(r.phase) * 0.7 : 0;
      U.legL.rotation.x = sw; U.legR.rotation.x = -sw;
      let aR = -sw * 0.6, aL = sw * 0.6;
      const at = now - r.atkT;
      if (at < 0.3) aR = -2.2 * Math.sin(at / 0.3 * Math.PI);
      const ct = now - r.castT;
      if (ct < 0.4) { const s = Math.sin(ct / 0.4 * Math.PI); aR = -2.6 * s; aL = -2.2 * s; }
      U.armR.rotation.x = aR; U.armL.rotation.x = aL;
      // knock-up
      const air = fl & 2;
      U.body.position.y = air ? 0.9 + Math.sin(now * 8) * 0.15 : 0;
      // mati
      if (dead) { U.body.rotation.x = -Math.min(1.5, (now - (r.deadT || now)) * 5); U.body.position.y = 0.2; }
      else U.body.rotation.x = 0;
      U.stars.visible = !!(fl & 1) && !air; if (U.stars.visible) U.stars.rotation.y = now * 6;
      U.root.visible = !!(fl & 16);
      U.shield.visible = !!r.d.sh || !!(fl & 128);
      if (U.shield.visible) U.shield.material.color.setHex(fl & 128 ? 0x7cff9a : 0x9fd8ff);
      if (U.drone) { U.drone.position.y = 2.3 + Math.sin(now * 3) * 0.12; U.drone.rotation.y = now * 1.5; }
      // transparan di semak / invisible (dilihat tim sendiri)
      const ghost = (fl & 4) || (fl & 8);
      const alpha = dead ? 0.6 : ghost ? 0.45 : 1;
      if (alpha !== r.alpha) { r.alpha = alpha; for (const m of U.mats) { m.transparent = alpha < 1 || m.userData.t; m.opacity = alpha; m.needsUpdate = true; } }
      // recall
      if (fl & 2048) { if (!r.recT || now - r.recT > 0.25) { r.recT = now; this.burst(r.px, 0.2, r.pz, 6, ['#9fd8ff', '#ffffff'], { speed: 0.5, up: 4, life: 0.8, size: 0.08, grav: -2, spread: 1.2 }); } }
    } else if (r.k === 'm' || r.k === 'b') {
      const moving = r.speed > 0.5;
      r.phase += dt * (moving ? 14 : 0);
      U.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(r.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
      const at = now - r.atkT;
      r.obj.position.y = at < 0.2 ? Math.sin(at / 0.2 * Math.PI) * 0.25 : 0;
      if (U.aura) { U.aura.rotation.z = now; U.aura.material.opacity = 0.25 + Math.sin(now * 3) * 0.1; }
      if (fl & 1) r.obj.rotation.z = Math.sin(now * 20) * 0.08; else r.obj.rotation.z = 0;
    } else if (r.k === 's') {
      const ft = now - (r.fireT ?? -9);
      if (r.s === 'water') {
        if (r.aimF !== undefined) U.head.rotation.y = lerpAngle(U.head.rotation.y, r.aimF, Math.min(1, dt * 8));
        U.head.position.y = U.muzzleY - (ft < 0.15 ? 0.15 * (1 - ft / 0.15) : 0);
        U.valve.rotation.x = now * (r.armT ? 1 : 0.2);
        if (r.d.hp < r.d.mh * 0.4 && Math.random() < dt * 8) this.burst(r.px + rand(-1, 1), 8.5, r.pz + rand(-1, 1), 1, '#9fdcff', { speed: 0.5, up: 0, life: 1, size: 0.1 });
      } else if (r.s === 'lightning') {
        const target = r.armed ? 10.1 : 8.9;
        U.spear.position.y += (target - U.spear.position.y) * Math.min(1, dt * 3);
        U.glow.material.opacity = r.armed ? 0.25 + Math.sin(now * 9) * 0.12 + (ft < 0.2 ? 0.5 : 0) : 0;
        U.copper.emissiveIntensity = r.armed ? 0.6 + Math.sin(now * 9) * 0.3 : 0;
        if (r.armed && Math.random() < dt * 3) this.burst(r.px, 11.5, r.pz, 2, '#9fd0ff', { speed: 1.5, up: 1, life: 0.25, size: 0.06, grav: 0 });
      } else {
        U.ant.rotation.y = now * (r.armed ? 2 : 0.3);
        const on = r.armed ? 2.5 : 0;
        for (const m of U.flood) m.emissiveIntensity = on;
        if (r.d.hp < r.d.mh * 0.4 && Math.random() < dt * 5) this.burst(r.px + rand(-3, 3), 7, r.pz + rand(-2, 2), 1, ['#555555', '#333333'], { speed: 0.5, up: 3, life: 2, size: 0.4, grav: -1 });
      }
      // struktur kebal = efek kubah tipis
      if (fl & 1024) { if (!U.dome) { U.dome = mesh(GEO.hemi, basicAdd(0x9fd8ff, 0.08), r.s === 'base' ? 6 : 2.6, r.s === 'base' ? 9 : 13, r.s === 'base' ? 6 : 2.6); r.obj.add(U.dome); } }
      else if (U.dome) { r.obj.remove(U.dome); U.dome.material.dispose(); U.dome = null; }
    }
  }

  project(x, y, z) {
    tmpV.set(x, y, z).project(this.camera);
    return { x: (tmpV.x * 0.5 + 0.5) * this.W, y: (-tmpV.y * 0.5 + 0.5) * this.H, vis: tmpV.z < 1 };
  }

  updateLabels() {
    for (const r of this.ents.values()) {
      if (!r.lbl) continue;
      if (r.hidden) continue;
      const o = r.d;
      const h = r.k === 'h' ? 3.05 : r.k === 'm' ? (r.s === 'mastiff' ? 2.3 : 1.6) : r.k === 'b' ? (r.s === 'cerberus' ? 5.6 : 5) : r.s === 'water' ? 12 : r.s === 'lightning' ? 13.5 : 10.5;
      const p = this.project(r.px, h, r.pz);
      if (!p.vis || p.x < -80 || p.x > this.W + 80 || p.y < -40 || p.y > this.H + 40) { r.lbl.style.visibility = 'hidden'; continue; }
      r.lbl.style.visibility = '';
      r.lbl.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0)`;
      const tot = Math.max(o.mh, o.hp + (o.sh || 0));
      const hpW = (Math.max(0, o.hp) / tot * 100).toFixed(1) + '%';
      if (r.lblHpW !== hpW) { r.lblHp.style.width = hpW; r.lblHpW = hpW; }
      if (r.lblSh) { const sw = ((o.sh || 0) / tot * 100).toFixed(1) + '%'; if (r.lblShW !== sw) { r.lblSh.style.width = sw; r.lblShW = sw; } }
      if (r.lblLv && r.lblLvV !== o.lv) { r.lblLv.textContent = o.lv; r.lblLvV = o.lv; }
      r.lbl.classList.toggle('dead', !!(o.fl & 64));
      r.lbl.classList.toggle('immune', !!(o.fl & 1024));
      r.lbl.classList.toggle('marked', !!(o.fl & 4096));
    }
    const now = this.time;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      const k = (now - f.t0) / f.dur;
      if (k >= 1) { f.el.remove(); this.floats.splice(i, 1); continue; }
      const p = this.project(f.x + f.dx * k, f.y + k * 1.4, f.z);
      f.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) scale(${k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.3})`;
      f.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
  }

  screenToGround(sx, sy) {
    const ndc = new THREE.Vector2(sx / this.W * 2 - 1, -(sy / this.H) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, p) ? { x: p.x, z: p.z } : null;
  }
}
