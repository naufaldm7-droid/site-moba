// Model hero 3D (GLB dari Blender) + klip animasi bersama (Universal Animation Library, CC0).
import * as THREE from 'three';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from '/vendor/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const tpl = new Map();     // hero -> Promise<gltf>
let clipsP = null;
export const CLIPS = new Map(); // nama -> AnimationClip
const UPPER = /^(spine_02|spine_03|neck_01|Head|clavicle_|upperarm_|lowerarm_|hand_|index_|middle_|pinky_|ring_|thumb_)/;
export const FULL_BODY = new Set(['Roll', 'Jump_Start', 'Jump_Land', 'Sprint_Loop', 'PickUp_Table', 'Death01', 'Hit_Chest', 'Dance_Loop']);

export function loadClips() {
  if (!clipsP) {
    clipsP = loader.loadAsync('assets/models/anims.glb').then((g) => {
      for (const c of g.animations) {
        // buang track posisi selain pelvis supaya proporsi tiap hero tidak berubah
        c.tracks = c.tracks.filter((t) => !t.name.endsWith('.position') || t.name.startsWith('pelvis'));
        CLIPS.set(c.name, c);
        // varian badan atas (@U) & bawah (@L): menyerang sambil berlari tanpa kaki "meluncur"
        const isUp = (t) => UPPER.test(t.name.split('.')[0]);
        CLIPS.set(c.name + '@U', new THREE.AnimationClip(c.name + '@U', c.duration, c.tracks.filter(isUp)));
        CLIPS.set(c.name + '@L', new THREE.AnimationClip(c.name + '@L', c.duration, c.tracks.filter((t) => !isUp(t))));
      }
      return CLIPS;
    });
  }
  return clipsP;
}

export function preloadHero(key) {
  if (!tpl.has(key)) tpl.set(key, loader.loadAsync(`assets/models/${key}.glb`).catch((e) => { console.warn('model gagal', key, e); return null; }));
  return tpl.get(key);
}

// buat instance (skeleton & material sendiri, supaya skin/transparan/kilatan per hero tidak saling memengaruhi)
export async function makeHero(key) {
  const [g] = await Promise.all([preloadHero(key), loadClips()]);
  if (!g) return null;
  const root = skClone(g.scene);
  const mats = [];
  const byName = {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // skinned mesh: bounding box statis sering salah saat beranimasi
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material.clone();
    m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
    m.userData.baseEI = m.emissiveIntensity;
    m.userData.baseColor = m.color ? m.color.clone() : null;
    dressMaterial(m);
    o.material = m;
    mats.push(m);
    (byName[m.name] = byName[m.name] || []).push(m);
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [n, c] of CLIPS) actions[n] = mixer.clipAction(c);
  return { root, mixer, actions, mats, byName };
}

// pilihan klip per keadaan
const MARKS = new Set(['qs', 'surveyor', 'electronic']);  // penembak: animasi pistol
const MELEE_SET = new Set(['structural', 'drafter', 'fabricator', 'supervisor', 'crane', 'geotech', 'pm', 'qaqc']);
// gerakan tiap jurus [Q, E, R]: klip animasi + gerak prosedural (hop = loncat m, spin = putaran, lean = condong rad, t = durasi)
const MV = {
  slash: ['Sword_Attack', { t: 0.35, lean: 0.25 }], stab: ['Punch_Jab', { t: 0.3, lean: 0.4 }], smash: ['Jump_Land', { t: 0.45, hop: 1.5, lean: 0.2 }],
  leap: ['Jump_Start', { t: 0.5, hop: 2.3 }], charge: ['Sprint_Loop', { t: 0.4, lean: 0.55 }], roll: ['Roll', { t: 0.45 }], spin: ['Sword_Attack', { t: 0.5, spin: 2 }],
  cast: ['Spell_Simple_Shoot', null], channel: ['Spell_Simple_Enter', { t: 0.5, hop: 0.25 }], shoot: ['Pistol_Shoot', null], plant: ['PickUp_Table', { t: 0.4, lean: 0.2 }],
  throw: ['Punch_Cross', { t: 0.3, lean: 0.2 }], point: ['Interact', null], rally: ['Spell_Simple_Enter', { t: 0.55, hop: 0.6 }],
};
const SKILL_MV = {
  structural: ['slash', 'plant', 'smash'], hse: ['throw', 'point', 'rally'], drafter: ['roll', 'channel', 'spin'], qs: ['throw', 'point', 'channel'], surveyor: ['point', 'shoot', 'channel'],
  architect: ['cast', 'plant', 'channel'], fabricator: ['charge', 'spin', 'smash'], plumbing: ['plant', 'throw', 'cast'], electrical: ['cast', 'roll', 'channel'], electronic: ['shoot', 'throw', 'plant'],
  sales: ['cast', 'throw', 'point'], supervisor: ['charge', 'plant', 'rally'], procurement: ['throw', 'point', 'channel'], qaqc: ['channel', 'stab', 'smash'], commissioning: ['cast', 'channel', 'rally'],
  crane: ['throw', 'spin', 'leap'], geotech: ['plant', 'smash', 'leap'], hvac: ['cast', 'plant', 'spin'], doccontrol: ['throw', 'stab', 'rally'], pm: ['slash', 'charge', 'rally'],
};
export function skillMove(hero, slot) { const k = SKILL_MV[hero]?.[slot]; return k ? MV[k][1] : null; }
const RUNNERS = new Set(['drafter', 'qaqc', 'pm', 'electrical']);                              // lari kencang condong
const HEAVY = new Set(['fabricator', 'crane', 'geotech', 'plumbing', 'supervisor', 'hvac']);   // langkah berat
export function clipFor(hero, state, slot, alt) {
  const melee = MELEE_SET.has(hero);
  switch (state) {
    case 'idle': return melee ? 'Sword_Idle' : MARKS.has(hero) ? 'Pistol_Idle_Loop' : 'Idle_Loop';
    case 'run': return RUNNERS.has(hero) ? 'Sprint_Loop' : HEAVY.has(hero) ? 'Walk_Loop' : 'Jog_Fwd_Loop';
    case 'sprint': return 'Sprint_Loop';
    case 'attack': return melee ? (alt ? 'Punch_Cross' : 'Sword_Attack') : MARKS.has(hero) ? 'Pistol_Shoot' : 'Spell_Simple_Shoot';
    case 'cast': { const k = SKILL_MV[hero]?.[slot]; return k ? MV[k][0] : 'Spell_Simple_Shoot'; }
    case 'stun': return 'Hit_Chest';
    case 'recall': return 'Spell_Simple_Idle_Loop';
    case 'death': return 'Death01';
    case 'victory': return 'Dance_Loop';
    default: return 'Idle_Loop';
  }
}
export const runSpeedRef = (hero) => (RUNNERS.has(hero) ? 7.5 : HEAVY.has(hero) ? 3.4 : 5.4);
export const ONE_SHOT = new Set(['Jump_Start', 'Interact', 'PickUp_Table', 'Sword_Attack', 'Punch_Cross', 'Punch_Jab', 'Pistol_Shoot', 'Spell_Simple_Shoot', 'Spell_Simple_Enter', 'Jump_Land', 'Death01', 'Hit_Chest', 'Roll']);

// ------------------------------------------------------------------ skin (4 tingkat, GDD 03-B)
export const SKINS = [
  { id: 0, name: 'Default', tier: 'Seragam kerja standar' },
  { id: 1, name: 'Elite · Night-Shift Overtime', tier: 'Seragam lembur malam, garis reflektor neon' },
  { id: 2, name: 'Epic · Client Gala', tier: 'Setelan eksekutif beraksen emas + hologram' },
  { id: 3, name: 'Legend · Master EPC Exoskeleton', tier: 'Eksoskeleton hidrolik, inti energi menyala' },
];
const ROLE_COL = { tank: '#ff9a3a', fighter: '#ff4a4a', assassin: '#c05aff', mage: '#3fa8ff', marksman: '#5dff6a', support: '#7cff9a' };
const BASE_CLS = { structural: 'fighter', hse: 'support', drafter: 'assassin', qs: 'marksman', surveyor: 'marksman' };
export function roleColor(hero, H) { return ROLE_COL[(H && H.cls) || BASE_CLS[hero] || 'fighter']; }

export function applySkin(m, hero, H, tier) {
  if (!m || !tier) return;
  const rc = new THREE.Color(roleColor(hero, H));
  const set = (names, fn) => { for (const n of names) for (const mt of m.byName[n] || []) fn(mt); };
  const cloth = ['Shirt', 'Pants', 'Jacket', 'Vest', 'Gloves', 'Tie'];
  if (tier === 1) {
    set(cloth, (mt) => { mt.map = null; mt.color.set('#171a22'); mt.roughness = 0.6; mt.needsUpdate = true; });
    set(['Vest', 'Straps'], (mt) => { mt.color.set('#22262f'); });
    set(['Accent', 'Belt'], (mt) => { mt.emissive.copy(rc); mt.emissiveIntensity = 2.2; mt.color.copy(rc); });
    set(['Hat'], (mt) => { mt.color.set('#111318'); mt.metalness = 0.4; });
    set(['ToolGlow'], (mt) => { mt.emissive.copy(rc); mt.emissiveIntensity = 4; mt.color.copy(rc); });
  } else if (tier === 2) {
    const gold = new THREE.Color('#d4af37');
    set(['Shirt', 'Pants'], (mt) => { mt.map = null; mt.color.set('#f3eee2'); mt.roughness = 0.5; mt.needsUpdate = true; });
    set(['Jacket', 'Vest', 'Tie', 'Straps', 'Gloves'], (mt) => { mt.color.copy(gold); mt.metalness = 0.85; mt.roughness = 0.28; });
    set(['Hat', 'Belt', 'ToolMetal'], (mt) => { mt.color.copy(gold); mt.metalness = 1; mt.roughness = 0.2; });
    set(['Accent', 'ToolGlow'], (mt) => { mt.emissive.set('#ffd060'); mt.emissiveIntensity = 3; mt.color.set('#fff0b0'); });
    set(['Boots'], (mt) => { mt.color.set('#2a2216'); mt.metalness = 0.4; });
  } else if (tier === 3) {
    const cy = new THREE.Color('#3fe0ff');
    set([...cloth, 'Straps', 'Boots'], (mt) => { mt.map = null; mt.color.set('#3a404a'); mt.metalness = 0.65; mt.roughness = 0.4; mt.needsUpdate = true; });
    set(['Vest', 'Jacket'], (mt) => { mt.emissive.copy(rc); mt.emissiveIntensity = 0.12; });
    set(['Hat', 'ToolMetal', 'Belt'], (mt) => { mt.color.set('#c9d2dc'); mt.metalness = 1; mt.roughness = 0.15; });
    set(['Accent', 'ToolGlow'], (mt) => { mt.emissive.copy(cy); mt.emissiveIntensity = 2.0; mt.color.copy(cy); });
  }
  for (const mt of m.mats) { mt.userData.baseEmissive = mt.emissive ? mt.emissive.clone() : null; mt.userData.baseEI = mt.emissiveIntensity; }
}


// ------------------------------------------------------------------ bahan pakaian & alat (sifat material sesuai fungsi)
function normalFromHeight(size, hf, strength, rep) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  const H = (x, y) => hf(((x % size) + size) % size, ((y % size) + size) % size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4;
  return t;
}
let NM = null;
function fabricMaps() {
  if (NM) return NM;
  const rnd = (() => { let s = 9; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  const noise = new Float32Array(64 * 64).map(() => rnd());
  const sm = (x, y) => (noise[(y & 63) * 64 + (x & 63)] + noise[(y & 63) * 64 + ((x + 1) & 63)] + noise[((y + 1) & 63) * 64 + (x & 63)]) / 3;
  NM = {
    weave: normalFromHeight(64, (x, y) => Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) * 0.5 + (((x >> 1) + (y >> 1)) & 1) * 0.5, 1.6, 46),   // katun tenun
    twill: normalFromHeight(64, (x, y) => Math.sin((x + y) * Math.PI / 3) * 0.6 + Math.sin((x - y) * Math.PI / 8) * 0.15, 1.8, 40),                     // denim / drill kerja
    mesh: normalFromHeight(64, (x, y) => (x % 8 < 2 || y % 8 < 2 ? 1 : 0), 2.2, 30),                                                                     // rompi jaring hi-vis
    leather: normalFromHeight(64, (x, y) => sm(x, y) + sm(x >> 1, y >> 1) * 0.8, 2.5, 14),                                                               // kulit bot / sarung tangan
    knit: normalFromHeight(64, (x, y) => Math.abs(Math.sin(x * Math.PI / 4)) * 0.7 + Math.sin(y * Math.PI / 2) * 0.3, 1.8, 26),                         // rajut syal / hijab
  };
  return NM;
}
const FABRIC = {
  Shirt: ['weave', 0.92, 0, 0.5], Pants: ['twill', 0.88, 0, 0.7], Jacket: ['twill', 0.8, 0, 0.5], Vest: ['mesh', 0.75, 0, 0.8], Scarf: ['knit', 0.98, 0, 0.9], Tie: ['weave', 0.55, 0, 0.3],
  Boots: ['leather', 0.5, 0.05, 0.8], Gloves: ['leather', 0.62, 0, 0.9], Belt: ['leather', 0.45, 0.1, 0.6], Straps: ['weave', 0.7, 0, 0.6],
};
const SURFACE = { Hat: [0.22, 0.0], Accent: [0.25, 0.7], ToolMetal: [0.28, 1.0], Tool: [0.45, 0.35], Paper: [0.95, 0], Hair: [0.55, 0], Skin: [0.62, 0] };
export function dressMaterial(m) {
  const f = FABRIC[m.name];
  if (f) {
    const N = fabricMaps();
    m.normalMap = N[f[0]]; m.normalScale = new THREE.Vector2(f[3], f[3]);
    m.roughness = f[1]; m.metalness = f[2];
    m.envMapIntensity = 0.6;
  } else if (SURFACE[m.name]) { m.roughness = SURFACE[m.name][0]; m.metalness = SURFACE[m.name][1]; m.envMapIntensity = m.name === 'Hat' ? 1.3 : 1; }
}
