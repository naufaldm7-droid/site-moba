// Model hero 3D (GLB dari Blender) + klip animasi bersama (Universal Animation Library, CC0).
import * as THREE from 'three';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from '/vendor/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const tpl = new Map();     // hero -> Promise<gltf>
let clipsP = null;
export const CLIPS = new Map(); // nama -> AnimationClip

export function loadClips() {
  if (!clipsP) {
    clipsP = loader.loadAsync('assets/models/anims.glb').then((g) => {
      for (const c of g.animations) {
        // buang track posisi selain pelvis supaya proporsi tiap hero tidak berubah
        c.tracks = c.tracks.filter((t) => !t.name.endsWith('.position') || t.name.startsWith('pelvis'));
        CLIPS.set(c.name, c);
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
    o.castShadow = false;
    const m = o.material.clone();
    m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
    m.userData.baseEI = m.emissiveIntensity;
    m.userData.baseColor = m.color ? m.color.clone() : null;
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
export function clipFor(hero, state, slot, alt) {
  const melee = MELEE_SET.has(hero);
  switch (state) {
    case 'idle': return melee ? 'Sword_Idle' : 'Idle_Loop';
    case 'run': return 'Jog_Fwd_Loop';
    case 'sprint': return 'Sprint_Loop';
    case 'attack': return melee ? (alt ? 'Punch_Cross' : 'Sword_Attack') : MARKS.has(hero) ? 'Pistol_Shoot' : 'Spell_Simple_Shoot';
    case 'cast':
      if (slot === 2) return melee ? 'Jump_Land' : 'Spell_Simple_Enter';
      if (slot === 1) return melee ? 'Punch_Jab' : 'Spell_Simple_Shoot';
      return melee ? 'Sword_Attack' : 'Spell_Simple_Shoot';
    case 'stun': return 'Hit_Chest';
    case 'recall': return 'Spell_Simple_Idle_Loop';
    case 'death': return 'Death01';
    case 'victory': return 'Dance_Loop';
    default: return 'Idle_Loop';
  }
}
export const ONE_SHOT = new Set(['Sword_Attack', 'Punch_Cross', 'Punch_Jab', 'Pistol_Shoot', 'Spell_Simple_Shoot', 'Spell_Simple_Enter', 'Jump_Land', 'Death01', 'Hit_Chest', 'Roll']);

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
