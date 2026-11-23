import { EXT_HEROES } from './heroes_ext.js';
// SITE CLASH: Laydown Legends — data bersama server & client.
// Satuan: meter, detik. Map sesuai SITE_CLASH_Schematic_Denah_Lane.png: 3v3 Blitz Site (140x70) & 5v5 Full EPC Project (160x160).

export const TICK_HZ = 30;
export const SNAP_HZ = 15;
export const TEAM = { BLUE: 0, RED: 1, NEUTRAL: 2 };
export const TEAM_NAME = ['BIRU', 'MERAH', 'NETRAL'];

// ---------------------------------------------------------------- LANE HELPERS
// Lane = polyline dari base BIRU ke base MERAH. s = jarak sepanjang lane (0 = sisi biru).
export function buildLane(pts) {
  const segs = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, len, s0: L, dx: (bx - ax) / len, dz: (bz - az) / len });
    L += len;
  }
  return { pts, segs, len: L };
}
export function laneProject(lane, x, z) {
  let best = { s: 0, d: Infinity };
  for (const g of lane.segs) {
    let t = (x - g.ax) * g.dx + (z - g.az) * g.dz;
    t = t < 0 ? 0 : t > g.len ? g.len : t;
    const px = g.ax + g.dx * t, pz = g.az + g.dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { s: g.s0 + t, d };
  }
  return best;
}
export function lanePoint(lane, s) {
  s = s < 0 ? 0 : s > lane.len ? lane.len : s;
  let g = lane.segs[lane.segs.length - 1];
  for (const sg of lane.segs) if (s <= sg.s0 + sg.len) { g = sg; break; }
  const t = s - g.s0;
  return { x: g.ax + g.dx * t, z: g.az + g.dz * t, dx: g.dx, dz: g.dz };
}
// cermin titik (rotasi 180° di tengah map) supaya kedua tim adil
const mirRect = (W, H) => (r) => ({ ...r, x1: W - r.x2, x2: W - r.x1, z1: H - r.z2, z2: H - r.z1 });
const mirPt = (W, H) => (p) => ({ ...p, team: p.team === undefined ? undefined : 1 - p.team, x: W - p.x, z: H - p.z });

// ---------------------------------------------------------------- MAPS
// Mode A: 3v3 BLITZ SITE (140 x 70 m) — 1 lane utama + Stockyard jungle
const BLITZ = {
  id: 'blitz', name: '3v3 Blitz Site', w: 140, h: 70,
  walk: [
    { x1: 1, z1: 42, x2: 139, z2: 58 },
    { x1: 22, z1: 6, x2: 118, z2: 44 }, // overlap 2 m dengan lane supaya perbatasan bisa dilewati
  ],
  // kontainer = dinding. c: warna kontainer seperti concept art
  walls: [
    { x1: 32, z1: 36, x2: 54, z2: 41, c: 'orange', stack: 2 },
    { x1: 87, z1: 36, x2: 109, z2: 41, c: 'blue', stack: 2 },
    { x1: 45, z1: 18, x2: 57, z2: 23, c: 'green', stack: 1 },
    { x1: 83, z1: 18, x2: 95, z2: 23, c: 'green', stack: 1 },
  ],
  bushes: [
    { x1: 38, z1: 24, x2: 43, z2: 32 },
    { x1: 107, z1: 24, x2: 112, z2: 32 },
    { x1: 56, z1: 37, x2: 62, z2: 41.5 },
    { x1: 72, z1: 37, x2: 78, z2: 41.5 },
    { x1: 60, z1: 55, x2: 66, z2: 58 },
    { x1: 74, z1: 42, x2: 80, z2: 45 },
  ],
  pits: [{ x: 70, z: 18, r: 6, type: 'switch' }], // Apex Cat, berganti Cerberus setelah menit 4
  lanes: { mid: [[4, 50], [136, 50]] },
  laneWidth: 16,
  fountain: [{ x1: 1, z1: 43, x2: 7, z2: 57 }, { x1: 133, z1: 43, x2: 139, z2: 57 }],
  spawn: [{ x: 4, z: 50 }, { x: 136, z: 50 }],
  structures: [
    { team: 0, type: 'base', x: 12, z: 50 },
    { team: 0, type: 'lightning', x: 24, z: 50, lane: 'mid', tier: 3 },
    { team: 0, type: 'water', x: 46, z: 50, lane: 'mid', tier: 1 },
    { team: 1, type: 'water', x: 94, z: 50, lane: 'mid', tier: 1 },
    { team: 1, type: 'lightning', x: 116, z: 50, lane: 'mid', tier: 3 },
    { team: 1, type: 'base', x: 128, z: 50 },
  ],
  gate: { x: 70, zIn: 38, zOut: 45, split: 42 }, // celah lane <-> stockyard (untuk bot)
  wave: { first: 12, every: 26, list: ['cat', 'cat', 'cat', 'dog', 'dog'] },
  overtime: 600,
  ahead: [1, 0],
  botLanes: ['mid', 'mid', 'mid'],
};

// Mode B: 5v5 FULL EPC PROJECT (160 x 160 m) — Top: Workshop Fabrikasi, Mid: Jalan Utama Laydown, Bottom: Tumpukan Kontainer.
// Koordinat dari SITE_CLASH_Schematic_Denah_Lane.png (z = 160 - y gambar). Base BIRU kiri-bawah layar, MERAH kanan-atas.
const FW = 160, FH = 160;
const fullWallsHalf = [
  { x1: 46, z1: 30, x2: 64, z2: 36, c: 'green', stack: 1 },
  { x1: 28, z1: 42, x2: 44, z2: 48, c: 'orange', stack: 2 },
  { x1: 28, z1: 50, x2: 34, z2: 64, c: 'blue', stack: 2 },
  { x1: 66, z1: 36, x2: 72, z2: 52, c: 'blue', stack: 2 },
  { x1: 48, z1: 66, x2: 62, z2: 72, c: 'orange', stack: 2 },
  { x1: 30, z1: 80, x2: 36, z2: 96, c: 'green', stack: 1 },
  { x1: 50, z1: 84, x2: 64, z2: 90, c: 'orange', stack: 2 },
];
const fullBushHalf = [
  { x1: 68, z1: 22, x2: 80, z2: 27 },
  { x1: 22, z1: 56, x2: 27, z2: 68 },
  { x1: 22, z1: 80, x2: 27, z2: 92 },
  { x1: 44, z1: 96, x2: 50, z2: 102 },
  { x1: 68, z1: 98, x2: 78, z2: 104 },
  { x1: 36, z1: 70, x2: 42, z2: 76 },
];
const fullStructBlue = [
  { team: 0, type: 'base', x: 22, z: 138 },
  { team: 0, type: 'lightning', x: 15, z: 126, lane: 'top', tier: 3 },
  { team: 0, type: 'water', x: 15, z: 98, lane: 'top', tier: 2 },
  { team: 0, type: 'water', x: 15, z: 55, lane: 'top', tier: 1 },
  { team: 0, type: 'lightning', x: 34, z: 126, lane: 'mid', tier: 3 },
  { team: 0, type: 'water', x: 50, z: 110, lane: 'mid', tier: 2 },
  { team: 0, type: 'water', x: 68, z: 92, lane: 'mid', tier: 1 },
  { team: 0, type: 'lightning', x: 34, z: 145, lane: 'bot', tier: 3 },
  { team: 0, type: 'water', x: 62, z: 145, lane: 'bot', tier: 2 },
  { team: 0, type: 'water', x: 105, z: 145, lane: 'bot', tier: 1 },
];
const LANE_SWAP = { top: 'bot', bot: 'top', mid: 'mid' };
const FULL = {
  id: 'full', name: '5v5 Full EPC Project', w: FW, h: FH,
  walk: [{ x1: 6, z1: 6, x2: 154, z2: 154 }, { x1: 2, z1: 144, x2: 16, z2: 158 }, { x1: 144, z1: 2, x2: 158, z2: 16 }],
  walls: [...fullWallsHalf, ...fullWallsHalf.map(mirRect(FW, FH))],
  bushes: [...fullBushHalf, ...fullBushHalf.map(mirRect(FW, FH))],
  pits: [
    { x: 54, z: 54, r: 6.5, type: 'apexcat', spawnAt: 90, respawn: 120 }, // Turtle
    { x: 106, z: 106, r: 7, type: 'cerberus', spawnAt: 360, respawn: 180 }, // Lord
  ],
  // lane top tim biru = sisi kiri + atas layar biru; cerminannya jadi lane bot tim merah
  lanes: {
    top: [[15, 131], [15, 15], [131, 15]],
    mid: [[28, 132], [132, 28]],
    bot: [[29, 145], [145, 145], [145, 29]],
  },
  laneWidth: 14,
  fountain: [{ x1: 2, z1: 144, x2: 14, z2: 158 }, { x1: 146, z1: 2, x2: 158, z2: 16 }],
  spawn: [{ x: 8, z: 152 }, { x: 152, z: 8 }],
  structures: [...fullStructBlue, ...fullStructBlue.map((st) => ({ ...mirPt(FW, FH)(st), lane: st.lane && LANE_SWAP[st.lane] }))],
  wave: { first: 15, every: 30, list: ['cat', 'cat', 'dog', 'dog'] },
  overtime: 900,
  ahead: [0.7, -0.7],
  botLanes: ['top', 'mid', 'bot', 'bot', 'mid'],
  big: true,
};

export const MAPS = { blitz: BLITZ, full: FULL };
for (const m of Object.values(MAPS)) {
  m.laneData = {};
  for (const [k, pts] of Object.entries(m.lanes)) m.laneData[k] = buildLane(pts);
}
export const modeForSize = (n) => (n >= 4 ? 'full' : 'blitz');

export const STRUCT = {
  water: { name: 'Toren Air', hp: 3300, r: 1.8, range: 9, dmg: 170, interval: 1.1, armor: 40, mres: 40 },
  lightning: { name: 'Penangkal Petir', hp: 3700, r: 1.6, range: 9, dmg: 210, interval: 1.25, armor: 50, mres: 50 },
  base: { name: 'Kontainer Office', hp: 6000, r: 4.2, range: 8, dmg: 260, interval: 1.0, armor: 60, mres: 60 },
};

export const MINION = {
  cat: { name: 'Kucing Penjaga', hp: 520, dmg: 32, range: 1.6, interval: 1.0, ms: 4.6, r: 0.45, armor: 8, mres: 5, gold: 24, xp: 38, proj: false },
  dog: { name: 'Anjing Patroli', hp: 380, dmg: 40, range: 6, interval: 1.3, ms: 4.6, r: 0.45, armor: 4, mres: 4, gold: 22, xp: 34, proj: true },
  mastiff: { name: 'Mastiff Gerobak', hp: 1150, dmg: 60, range: 6.5, interval: 1.6, ms: 4.2, r: 0.75, armor: 20, mres: 20, gold: 60, xp: 80, proj: true, siege: true },
};

export const BOSS = {
  apexcat: { name: 'Rust Dozer D9', hp: 5200, dmg: 120, range: 2.6, interval: 1.2, ms: 6, r: 1.6, armor: 35, mres: 30, gold: 140, xp: 200, spawnAt: 75, respawn: 90 },
  cerberus: { name: 'Iron Claw Excavator', hp: 11000, dmg: 190, range: 3.2, interval: 1.4, ms: 5.5, r: 2.2, armor: 55, mres: 45, gold: 220, xp: 320, spawnAt: 240, respawn: 120 },
};

export const WAVE = { siegeEvery: 3 };
export const START_GOLD = 300;
export const PASSIVE_GOLD = 2.4; // per detik
export const MAX_LEVEL = 15;
export const xpForLevel = (lvl) => 90 + lvl * 70; // xp untuk naik dari lvl -> lvl+1
export const respawnTime = (lvl) => 4 + lvl * 1.3;

// ---------------------------------------------------------------- HEROES
// kind skill (untuk aim di client):
//  dir   = arah (skillshot / dash), range = jarak
//  point = titik di tanah, range = jarak maks, aoe = radius indikator
//  self  = langsung cast di posisi sendiri, aoe = radius indikator
//  unit  = target musuh terdekat dalam range
export const HEROES = {
  structural: {
    name: 'Structural Engineer',
    role: 'Fighter / Crowd Control',
    sfx: 'H01',
    art: 'structural_engineer_hero_turnaround',
    color: '#3b5b8c', accent: '#e8e8e8', tool: 'beam',
    melee: true,
    base: { hp: 2550, atk: 118, mp: 0, armor: 24, mres: 16, as: 1.0, range: 2.6, ms: 6.6, hpGrow: 185, atkGrow: 9, armorGrow: 2.6, mresGrow: 1.2 },
    passive: { name: 'Load Distribution', desc: '+7 Armor & Magic Def untuk tiap hero musuh dalam 6 m (maks 3).' },
    skills: [
      { name: 'Shear Force', kind: 'dir', range: 5, cd: 6, width: 3.5, desc: 'Ayunan balok IWF di depan: damage fisik + Slow 40% 1.5 dtk.' },
      { name: 'Bending Moment', kind: 'point', range: 8, aoe: 2.6, cd: 11, desc: 'Pilar beton menyembul (0.5 dtk): damage + Root 1.25 dtk.' },
      { name: 'Seismic Collapse', kind: 'self', aoe: 6, cd: 38, desc: 'Gempa lokal: Knock-up 1 dtk ke semua musuh 6 m, True Damage ekstra di pusat 2.5 m.' },
    ],
    build: ['hammer', 'kevlar', 'boots', 'harness', 'mesh', 'iwf'],
  },
  hse: {
    name: 'HSE Officer (K3)',
    role: 'Support / Healer',
    sfx: 'H10',
    art: 'hse_safety_officer_hero_turnaround',
    color: '#e9f2ea', accent: '#d42a2a', tool: 'medkit',
    melee: false, projColor: '#7cff9a',
    base: { hp: 2150, atk: 92, mp: 40, armor: 18, mres: 18, as: 0.9, range: 6, ms: 6.5, hpGrow: 150, atkGrow: 6, armorGrow: 2, mresGrow: 1.4 },
    passive: { name: 'Zero Accident', desc: 'Rekan tim dalam 7 m regenerasi 1% Max HP / detik.' },
    skills: [
      { name: 'First Aid Kit', kind: 'point', range: 9, aoe: 3.5, cd: 8, ally: true, desc: 'Lempar kotak P3K: heal rekan dalam area & hapus efek Slow.' },
      { name: 'Stop Work!', kind: 'dir', range: 6, width: 4, cd: 12, desc: 'Tiupan peluit & papan STOP: damage + Stun 0.9 dtk di depan.' },
      { name: 'Full PPE Shield', kind: 'self', aoe: 16, cd: 50, desc: 'Seluruh rekan dalam 16 m: Shield, kebal CC 3 dtk, heal deras.' },
    ],
    build: ['boots', 'autocad', 'mesh', 'kevlar', 'harness', 'trafo'],
  },
  drafter: {
    name: 'Drafter (CAD/BIM)',
    role: 'Assassin',
    sfx: 'H07',
    art: 'cad_bim_drafter_hero_turnaround_sheet',
    color: '#6b7f99', accent: '#3fd2ff', tool: 'stylus',
    melee: true,
    base: { hp: 2200, atk: 126, mp: 0, armor: 18, mres: 14, as: 1.1, range: 2.8, ms: 7.0, hpGrow: 150, atkGrow: 10, armorGrow: 2, mresGrow: 1 },
    passive: { name: 'TRIM & EXTEND', desc: 'Serangan dasar memotong Shield (damage x2 ke Shield) dan jangkauan +0.5 m.' },
    skills: [
      { name: 'Polyline Dash', kind: 'dir', range: 7, width: 2, cd: 7, desc: 'Meluncur 7 m menebas musuh di jalur. Bisa di-cast lagi 1x dalam 3 dtk (zig-zag).' },
      { name: 'Layer Freeze', kind: 'self', aoe: 0, cd: 14, desc: 'Layer OFF: tak terlihat 2.5 dtk, +30% kecepatan, serangan berikut +80% damage.' },
      { name: 'CTRL+Z Revision', kind: 'self', aoe: 4, cd: 42, desc: 'Kembali ke posisi & HP 3 dtk lalu, lalu ledakan Hatch 4 m.' },
    ],
    build: ['boots', 'hammer', 'drill', 'iwf', 'harness', 'kevlar'],
  },
  qs: {
    name: 'Estimator / QS',
    role: 'Marksman / Gold Scaler',
    sfx: 'H08',
    art: 'quantity_surveyor_character_sheet',
    color: '#f4f1e6', accent: '#e0b23a', tool: 'docs',
    melee: false, projColor: '#ffffff',
    base: { hp: 2050, atk: 120, mp: 0, armor: 15, mres: 14, as: 1.15, range: 7, ms: 6.4, hpGrow: 140, atkGrow: 9, armorGrow: 1.8, mresGrow: 1 },
    passive: { name: 'Cost Efficiency', desc: '+30% Gold dari kill & harga item toko diskon 10%.' },
    skills: [
      { name: 'BOQ Barrage', kind: 'dir', range: 10, width: 4, cd: 6, desc: 'Tembakan 5 lembar dokumen BOQ tajam menyebar.' },
      { name: 'Price Audit', kind: 'unit', range: 9, cd: 10, desc: 'Tandai musuh: Armor & Magic Def -30% dan terlihat 4 dtk.' },
      { name: 'Over-Budget Strike', kind: 'point', range: 12, aoe: 3.5, cd: 40, desc: 'Brankas anggaran jatuh (0.8 dtk): damage berskala Gold yang dimiliki.' },
    ],
    build: ['boots', 'iwf', 'drill', 'hammer', 'kevlar', 'harness'],
  },
  surveyor: {
    name: 'Surveyor',
    role: 'Marksman / Artillery',
    sfx: 'H12',
    art: 'survey_engineer_hero_sheet',
    color: '#f07a1a', accent: '#f6d32b', tool: 'theodolite',
    melee: false, projColor: '#5dff6a',
    base: { hp: 2000, atk: 112, mp: 0, armor: 14, mres: 14, as: 1.0, range: 8, ms: 6.4, hpGrow: 135, atkGrow: 8.5, armorGrow: 1.8, mresGrow: 1 },
    passive: { name: 'Benchmark Precision', desc: 'Serangan dasar membuka posisi target 2 dtk; +15% damage ke target berjarak > 6 m.' },
    skills: [
      { name: 'Drone Recon', kind: 'point', range: 26, aoe: 8, cd: 14, desc: 'Drone membuka area & ilalang 8 m selama 5 dtk.' },
      { name: 'Laser Theodolite', kind: 'dir', range: 18, width: 1.6, cd: 8, desc: 'Laser elevasi lurus jarak jauh menembus semua musuh.' },
      { name: 'LiDAR Orbital Strike', kind: 'point', range: 30, aoe: 4.5, cd: 45, desc: 'Drone mengunci koordinat: 3 sambaran laser artileri beruntun.' },
    ],
    build: ['boots', 'iwf', 'drill', 'lidar', 'kevlar', 'harness'],
  },
};
Object.assign(HEROES, EXT_HEROES);
export const PLAYABLE = Object.keys(HEROES);

// semua 20 hero sudah terbuka; daftar lama disimpan sebagai referensi
export const LOCKED_HEROES = [];
const _OLD_LOCKED = [
  { name: 'Architect Engineer', role: 'Mage / Zoner', art: 'architect_engineer_hero_concept_board' },
  { name: 'Workshop Fabricator', role: 'Tank / Initiator', art: 'workshop_fabricator_hero_concept_sheet' },
  { name: 'Plumbing Engineer', role: 'Controller / Mage', art: 'plumbing_engineer_hero_turnaround_sheet' },
  { name: 'Electrical Engineer', role: 'Burst Mage', art: 'electrical_engineer_hero_turnaround' },
  { name: 'Electronic Engineer', role: 'Marksman / Tactical', art: 'electronic_engineer_character_turnaround' },
  { name: 'Sales / BD', role: 'Support / CC', art: 'sales_business_development_hero_sheet' },
  { name: 'Site Supervisor', role: 'Fighter / Commander', art: 'site_supervisor_hero_turnaround_board' },
  { name: 'Procurement / Buyer', role: 'Support / Utility', art: 'procurement_buyer_hero_character_sheet' },
  { name: 'QA/QC Inspector', role: 'Assassin / Anti-Tank', art: 'qa_qc_inspector_concept_sheet' },
  { name: 'Commissioning Eng.', role: 'Mage / Buffer', art: 'commissioning_engineer_hero_turnaround_board' },
  { name: 'Crane Operator', role: 'Tank / Hook', art: 'crane_operator_character_turnaround_sheet' },
  { name: 'Geotechnical Eng.', role: 'Tank / CC', art: 'geotechnical_soil_engineer_concept_sheet' },
  { name: 'HVAC / Mechanical', role: 'Mage / Thermal', art: 'hvac_engineer_thermal_control_showcase' },
  { name: 'Document Controller', role: 'Support / Mimic', art: 'document_controller_hero_turnaround' },
  { name: 'Project Manager', role: 'Fighter / Leader', art: 'executive_project_manager_character_board' },
];

export const ULT_LEVEL = 4;
export const S2_LEVEL = 2;

// ---------------------------------------------------------------- ITEMS
// stat keys: atk, mp, hp, armor, mres, ms, crit (0-1), pen (0-1), mpen (0-1), cdr (0-1), as (fraksi bonus)
export const ITEMS = {
  // Tier 1 komponen
  rebar: { name: 'Rebar Rod', tier: 1, cost: 300, stats: { atk: 18 }, cat: 'atk' },
  wire: { name: 'Copper Wire', tier: 1, cost: 300, stats: { mp: 25 }, cat: 'mp' },
  vest: { name: 'Safety Vest', tier: 1, cost: 300, stats: { hp: 260 }, cat: 'def' },
  plate: { name: 'Steel Plate', tier: 1, cost: 300, stats: { armor: 16 }, cat: 'def' },
  gloves: { name: 'Rubber Gloves', tier: 1, cost: 300, stats: { mres: 16 }, cat: 'def' },
  shoes: { name: 'Work Boots', tier: 1, cost: 300, stats: { ms: 0.6 }, cat: 'move' },
  // Tier 3 (EPC Tech)
  iwf: { name: 'IWF Heavy Beam', tier: 3, cost: 2100, from: ['rebar'], stats: { atk: 85, crit: 0.25 }, cat: 'atk', passive: 'Structural Impact: Critical hit memberi +15% kecepatan 1.5 dtk.' },
  drill: { name: 'Diamond Core Drill', tier: 3, cost: 2000, from: ['rebar'], stats: { atk: 70, pen: 0.35 }, cat: 'atk', passive: 'Core Breach: damage x1.5 ke Shield.' },
  hammer: { name: 'Hydraulic Jackhammer', tier: 3, cost: 2200, from: ['rebar', 'vest'], stats: { atk: 65, cdr: 0.15, hp: 500 }, cat: 'atk', passive: 'Aftershock: setelah pakai skill, serangan dasar berikut +40% ATK True Damage.' },
  autocad: { name: 'AutoCAD Pro License', tier: 3, cost: 2000, from: ['wire'], stats: { mp: 95, cdr: 0.2 }, cat: 'mp', passive: 'Rapid Revision: kill/assist mengurangi cooldown semua skill 20%.' },
  trafo: { name: '3-Phase Transformer', tier: 3, cost: 2100, from: ['wire'], stats: { mp: 110, hp: 300 }, cat: 'mp', passive: 'Arc Overload: skill yang kena memicu percikan petir ke 2 musuh terdekat.' },
  lidar: { name: 'LiDAR Laser Array', tier: 3, cost: 2000, from: ['wire'], stats: { mp: 60, atk: 30, mpen: 0.3 }, cat: 'mp', passive: 'Precision Lock: +20% damage skill ke musuh dengan HP > 70%.' },
  harness: { name: 'Full-Body Safety Harness', tier: 3, cost: 2300, from: ['vest'], stats: { hp: 800, armor: 40 }, cat: 'def', passive: 'Zero Fatality: hidup kembali 2 dtk setelah mati dengan 30% HP (CD 150 dtk).' },
  kevlar: { name: 'Kevlar Hardhat Mark-V', tier: 3, cost: 2000, from: ['plate'], stats: { hp: 900, armor: 55 }, cat: 'def', passive: 'Impact Absorption: Critical damage yang diterima -25%.' },
  mesh: { name: 'Copper Grounding Mesh', tier: 3, cost: 1900, from: ['gloves'], stats: { hp: 850, mres: 55 }, cat: 'def', passive: 'Surge Dissipation: perisai penyerap 300 Magic Damage tiap 15 dtk.' },
  boots: { name: 'Site Walkie-Talkie & Boots', tier: 3, cost: 900, from: ['shoes'], stats: { ms: 1.2, armor: 10, mres: 10 }, cat: 'move', passive: 'Dispatch Coordination: +10% kecepatan saat di luar pertempuran.' },
};

export const SHOP_ORDER = ['rebar', 'wire', 'vest', 'plate', 'gloves', 'shoes', 'iwf', 'drill', 'hammer', 'autocad', 'trafo', 'lidar', 'harness', 'kevlar', 'mesh', 'boots'];

export function itemCost(id, inventory, discount = 0) {
  const it = ITEMS[id];
  let cost = it.cost;
  const used = [];
  if (it.from) {
    const inv = inventory.slice();
    for (const c of it.from) {
      const i = inv.indexOf(c);
      if (i >= 0) { cost -= ITEMS[c].cost; used.push(c); inv[i] = null; }
    }
  }
  return { cost: Math.max(0, Math.round(cost * (1 - discount))), used };
}

// ---------------------------------------------------------------- RANK (dipakai lobby, progres disimpan lokal)
export const RANKS = ['Intern / Trainee', 'Junior Staff', 'Senior Staff', 'Head of Division', 'Project Manager', 'EPC Director'];
