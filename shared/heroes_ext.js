// 15 hero tambahan (GDD) — skill berbasis data, dieksekusi oleh Game.castGeneric di server.
// area.shape: cone | line | circle | proj | dash | unit | chain | self
// hit: efek ke musuh. dmg: [dasar, per level, rasio, 'atk'|'mp'], dt: phys|magic|true
// self / allies: efek ke diri / kawan. zone: area bertahan. turret: panggil turret kecil.
const ROLE_BASE = {
  tank: { hp: 2950, atk: 104, mp: 20, armor: 30, mres: 22, as: 0.9, range: 2.5, ms: 6.4, hpGrow: 205, atkGrow: 7, armorGrow: 3.2, mresGrow: 1.7 },
  fighter: { hp: 2600, atk: 118, mp: 0, armor: 24, mres: 16, as: 1.0, range: 2.6, ms: 6.6, hpGrow: 185, atkGrow: 9, armorGrow: 2.6, mresGrow: 1.2 },
  assassin: { hp: 2200, atk: 126, mp: 0, armor: 18, mres: 14, as: 1.1, range: 2.6, ms: 7.0, hpGrow: 150, atkGrow: 10, armorGrow: 2, mresGrow: 1 },
  mage: { hp: 2250, atk: 98, mp: 80, armor: 18, mres: 18, as: 0.9, range: 6.5, ms: 6.4, hpGrow: 140, atkGrow: 6, armorGrow: 1.8, mresGrow: 1.2 },
  marksman: { hp: 2000, atk: 115, mp: 0, armor: 14, mres: 14, as: 1.1, range: 7.5, ms: 6.4, hpGrow: 135, atkGrow: 9, armorGrow: 1.8, mresGrow: 1 },
  support: { hp: 2450, atk: 105, mp: 55, armor: 22, mres: 20, as: 0.9, range: 5.5, ms: 6.5, hpGrow: 150, atkGrow: 6, armorGrow: 2, mresGrow: 1.4 },
};
const BUILD = {
  tank: ['boots', 'kevlar', 'mesh', 'harness', 'hammer', 'autocad'],
  fighter: ['boots', 'hammer', 'iwf', 'kevlar', 'harness', 'drill'],
  assassin: ['boots', 'hammer', 'drill', 'iwf', 'harness', 'kevlar'],
  mage: ['boots', 'autocad', 'trafo', 'lidar', 'mesh', 'harness'],
  marksman: ['boots', 'iwf', 'drill', 'lidar', 'kevlar', 'harness'],
  support: ['boots', 'autocad', 'mesh', 'kevlar', 'harness', 'trafo'],
};
const H = (o) => ({ ...o, base: { ...ROLE_BASE[o.cls], ...(o.base || {}) }, build: BUILD[o.cls], gen: true, melee: ['tank', 'fighter', 'assassin'].includes(o.cls) });

export const EXT_HEROES = {
  architect: H({
    name: 'Architect Engineer', role: 'Mage / Zoner', cls: 'mage', sfx: 'H02', art: 'architect_engineer_hero_concept_board', color: '#7d7f86', accent: '#ffd23a', projColor: '#ffd890',
    passive: { name: 'Golden Ratio', desc: 'Setiap skill ke-3 yang mengenai musuh memicu ledakan simetris (magic) di sekitar target.', type: 'thirdSkillBurst' },
    skills: [
      { name: 'Cantilever Beam', kind: 'dir', range: 11, width: 1.8, cd: 6, desc: 'Balok melayang menembus barisan musuh.', area: { shape: 'proj', speed: 24, pierce: true, w: 0.9 }, hit: { dmg: [150, 20, 0.8, 'mp'], dt: 'magic' }, fx: { c: '#ffd23a', text: '' } },
      { name: 'Partition Wall', kind: 'point', range: 9, aoe: 3, cd: 11, desc: 'Dinding kaca arsitektural: zona 3 dtk memperlambat musuh 40%.', area: { shape: 'circle', at: 'point', r: 3 }, hit: { dmg: [80, 12, 0.4, 'mp'], dt: 'magic' }, zone: { r: 3, dur: 3, tick: 0.5, hit: { slow: [0.4, 0.6] } }, fx: { c: '#9fd8ff', text: 'PARTITION' } },
      { name: 'Parametric Facade', kind: 'point', range: 10, aoe: 5.5, cd: 42, desc: 'Kubah fasad memantulkan laser matahari: damage besar + slow 50%.', area: { shape: 'circle', at: 'point', r: 5.5, delay: 0.6 }, hit: { dmg: [300, 35, 1.2, 'mp'], dt: 'magic', slow: [0.5, 2] }, zone: { r: 5.5, dur: 2.5, tick: 0.5, hit: { dmg: [35, 5, 0.12, 'mp'], dt: 'magic' } }, fx: { c: '#ffd23a', text: 'FACADE' } },
    ],
  }),
  fabricator: H({
    name: 'Workshop Fabricator', role: 'Tank / Initiator', cls: 'tank', sfx: 'H03', art: 'workshop_fabricator_hero_concept_sheet', color: '#1f2f4a', accent: '#ff9a3a',
    passive: { name: 'Full Penetration Weld', desc: 'Serangan dasar membentuk Shield pelat baja (30 + 5/level, maks 400).', type: 'shieldOnHit', v: [30, 5], max: 400 },
    skills: [
      { name: 'Arc Flash Charge', kind: 'dir', range: 6, width: 2, cd: 9, desc: 'Menerjang dengan perisai baja: damage + stun 0,5 dtk.', area: { shape: 'dash', len: 6, w: 1.6 }, hit: { dmg: [100, 14, 0.6, 'atk'], dt: 'phys', stun: 0.5 }, fx: { c: '#6fc8ff' } },
      { name: 'Slag & Sparks', kind: 'self', aoe: 3.5, cd: 10, desc: 'Memutar gerinda: damage area + slow 35%.', area: { shape: 'circle', at: 'self', r: 3.5 }, hit: { dmg: [120, 15, 0.5, 'atk'], dt: 'magic', slow: [0.35, 1.5] }, fx: { c: '#ff9a3a', text: '' } },
      { name: 'Heavy Fabrication', kind: 'point', range: 7, aoe: 4, cd: 40, desc: 'Portal rangka baja jatuh mengurung musuh: root 2 dtk.', area: { shape: 'circle', at: 'point', r: 4, delay: 0.4 }, hit: { dmg: [200, 25, 0.7, 'atk'], dt: 'phys', root: 2 }, fx: { c: '#ffb060', text: 'STEEL CAGE', drop: 'cage' } },
    ],
  }),
  plumbing: H({
    name: 'Plumbing Engineer', role: 'Controller / Mage', cls: 'mage', sfx: 'H04', art: 'plumbing_engineer_hero_turnaround_sheet', color: '#2a3f66', accent: '#4fb8ff', projColor: '#6fd0ff',
    passive: { name: 'Hydrostatic Pressure', desc: 'Serangan & skill membuat target basah: slow 15%.', type: 'slowOnHit', v: 0.15 },
    skills: [
      { name: 'Water Hammer', kind: 'dir', range: 9, width: 2.6, cd: 8, desc: 'Gelombang kejut pipa bawah tanah: knock-up 0,8 dtk.', area: { shape: 'line', len: 9, w: 2.6, delay: 0.2 }, hit: { dmg: [140, 18, 0.7, 'mp'], dt: 'magic', air: 0.8 }, fx: { c: '#4fb8ff' } },
      { name: 'Grease Trap', kind: 'point', range: 9, aoe: 3.5, cd: 12, desc: 'Tumpahan minyak kental: slow 60% selama 4 dtk.', area: { shape: 'circle', at: 'point', r: 3.5 }, zone: { r: 3.5, dur: 4, tick: 0.4, hit: { slow: [0.6, 0.5] } }, fx: { c: '#c8a040', text: 'GREASE' } },
      { name: 'Main Riser Burst', kind: 'dir', range: 14, width: 3, cd: 40, desc: 'Semburan pipa induk: damage besar + dorong musuh 4 m.', area: { shape: 'line', len: 14, w: 3, delay: 0.25 }, hit: { dmg: [260, 30, 1.1, 'mp'], dt: 'magic', knock: 4 }, fx: { c: '#6fd0ff', text: 'RISER BURST' } },
    ],
  }),
  electrical: H({
    name: 'Electrical Engineer', role: 'Burst Mage', cls: 'mage', sfx: 'H05', art: 'electrical_engineer_hero_turnaround', color: '#24365a', accent: '#7fc8ff', projColor: '#9fd0ff',
    passive: { name: 'Short Circuit', desc: 'Setiap serangan dasar ke-3 memicu Chain Lightning ke 2 musuh.', type: 'chainEvery3' },
    skills: [
      { name: 'High Voltage Arc', kind: 'dir', range: 11, width: 1.2, cd: 4.5, desc: 'Tembakan busur listrik tegangan tinggi.', area: { shape: 'proj', speed: 30, w: 0.7 }, hit: { dmg: [160, 22, 0.9, 'mp'], dt: 'magic' }, fx: { c: '#9fd0ff' } },
      { name: 'Phase Shift', kind: 'dir', range: 7, width: 2, cd: 11, desc: 'Berubah jadi arus listrik, teleport kilat; meledak di titik tiba.', area: { shape: 'dash', len: 7, w: 1.4, endR: 2.2 }, hit: { dmg: [90, 12, 0.5, 'mp'], dt: 'magic' }, fx: { c: '#7fc8ff' } },
      { name: '3-Phase Overload', kind: 'point', range: 9, aoe: 4.5, cd: 42, desc: 'Ledakan trafo: stun massal 1,2 dtk + burst.', area: { shape: 'circle', at: 'point', r: 4.5, delay: 0.5 }, hit: { dmg: [280, 35, 1.3, 'mp'], dt: 'magic', stun: 1.2 }, fx: { c: '#7fc8ff', text: 'OVERLOAD', bolt: true } },
    ],
  }),
  electronic: H({
    name: 'Electronic Engineer', role: 'Marksman / Tactical', cls: 'marksman', sfx: 'H06', art: 'electronic_engineer_character_turnaround', color: '#9aa3ad', accent: '#3fd2ff', projColor: '#ff4a4a',
    passive: { name: 'Auto-Calibration', desc: 'Tembakan beruntun menaikkan Critical Chance +6% per hit (maks 30%).', type: 'critStack' },
    skills: [
      { name: 'Laser Sensor', kind: 'dir', range: 16, width: 1.2, cd: 7, desc: 'Laser jarak jauh: damage & membuka posisi musuh 3 dtk.', area: { shape: 'line', len: 16, w: 1.2 }, hit: { dmg: [120, 16, 0.8, 'atk'], dt: 'phys', reveal: 3 }, fx: { c: '#ff4a4a' } },
      { name: 'EMP Jammer', kind: 'point', range: 9, aoe: 3.5, cd: 12, desc: 'Pengacak sinyal: silence 1,5 dtk.', area: { shape: 'circle', at: 'point', r: 3.5, delay: 0.3 }, hit: { dmg: [80, 10, 0.3, 'atk'], dt: 'magic', silence: 1.5 }, fx: { c: '#3fd2ff', text: 'EMP' } },
      { name: 'SCADA Auto-Turret', kind: 'point', range: 6, aoe: 8, cd: 38, desc: 'Menara sensor otomatis menembak musuh terdekat selama 8 dtk.', area: { shape: 'circle', at: 'point', r: 1.5 }, turret: { dur: 8, every: 0.55, range: 8, dmg: [55, 8, 0.35, 'atk'] }, fx: { c: '#3fd2ff', text: 'SCADA ONLINE' } },
    ],
  }),
  sales: H({
    name: 'Sales / BD', role: 'Support / Crowd Control', cls: 'support', sfx: 'H09', art: 'sales_business_development_hero_sheet', color: '#1d2a4a', accent: '#ffd23a', projColor: '#ffd890',
    passive: { name: 'Sweet Talk', desc: 'Musuh dalam 5 m melambat 12%.', type: 'auraSlow', v: 0.12, r: 5 },
    skills: [
      { name: 'Pitch Deck Wave', kind: 'dir', range: 6, aoe: 6, cd: 8, desc: 'Gelombang suara presentasi: damage + dorong 3 m.', area: { shape: 'cone', r: 6, ang: 0.6 }, hit: { dmg: [130, 18, 0.7, 'mp'], dt: 'magic', knock: 3 }, fx: { c: '#ffd23a' } },
      { name: 'Down Payment', kind: 'point', range: 9, aoe: 2, cd: 10, ally: true, desc: 'Rekan terdekat titik: Shield + kecepatan 30%.', area: { shape: 'self' }, allies: { at: 'point', r: 3, shield: [200, 30, 1.0, 'mp'], ms: [0.3, 2.5], one: true }, fx: { c: '#ffd23a', text: 'DEAL!' } },
      { name: 'Binding Contract', kind: 'unit', range: 8, cd: 36, desc: 'Rantai kontrak kerja: stun 1,8 dtk + damage.', area: { shape: 'unit' }, hit: { dmg: [220, 26, 1.0, 'mp'], dt: 'magic', stun: 1.8 }, fx: { c: '#ffd23a', text: 'SIGNED', tether: true } },
    ],
  }),
  supervisor: H({
    name: 'Site Supervisor', role: 'Fighter / Commander', cls: 'fighter', sfx: 'H11', art: 'site_supervisor_hero_turnaround_board', color: '#b09a6a', accent: '#f6c21b',
    passive: { name: 'Overtime Command', desc: 'Minion kawan dalam 8 m memberi damage +30%.', type: 'minionAura' },
    skills: [
      { name: 'Site Inspection', kind: 'unit', range: 8, cd: 8, desc: 'Menerjang ke musuh yang ditunjuk: damage + slow 40%.', area: { shape: 'unit', dashTo: true }, hit: { dmg: [130, 16, 0.8, 'atk'], dt: 'phys', slow: [0.4, 1.5] }, fx: { c: '#f6c21b' } },
      { name: 'Safety Barricade', kind: 'point', range: 8, aoe: 3, cd: 12, desc: 'Garis pembatas kuning-hitam: zona slow 45% 4 dtk.', area: { shape: 'circle', at: 'point', r: 3 }, zone: { r: 3, dur: 4, tick: 0.4, hit: { slow: [0.45, 0.5] } }, fx: { c: '#f6c21b', text: 'AREA TERBATAS', barricade: true } },
      { name: 'Rush Hour Convoy', kind: 'dir', range: 18, width: 3.5, cd: 40, desc: 'Konvoi truk molen menerjang lurus: damage besar + knock-up.', area: { shape: 'line', len: 18, w: 3.5, delay: 0.5 }, hit: { dmg: [260, 30, 1.0, 'atk'], dt: 'phys', air: 0.8 }, fx: { c: '#f6c21b', text: 'CONVOY!', truck: true } },
    ],
  }),
  procurement: H({
    name: 'Procurement / Buyer', role: 'Support / Utility', cls: 'support', sfx: 'H13', art: 'procurement_buyer_hero_character_sheet', color: '#9fc3e8', accent: '#ffd23a', projColor: '#ffd23a',
    passive: { name: 'Buffer Stock', desc: 'Tiap 15 dtk menjatuhkan peti suplai: heal rekan dalam 7 m.', type: 'pulseHeal', every: 15, r: 7, v: [90, 12] },
    skills: [
      { name: 'Express PO', kind: 'dir', range: 11, width: 1.2, cd: 6, desc: 'Paket kargo meluncur dengan jejak emas: damage + slow.', area: { shape: 'proj', speed: 28, w: 0.8 }, hit: { dmg: [120, 16, 0.6, 'mp'], dt: 'magic', slow: [0.3, 1.5] }, fx: { c: '#ffd23a' } },
      { name: 'Vendor Link', kind: 'point', range: 9, aoe: 2, cd: 10, ally: true, desc: 'Garis energi ke rekan: Shield + kecepatan 25%.', area: { shape: 'self' }, allies: { at: 'point', r: 3, shield: [180, 25, 0.8, 'mp'], ms: [0.25, 3], one: true }, fx: { c: '#ffd23a', text: 'LINKED' } },
      { name: 'Air-Drop Container', kind: 'point', range: 10, aoe: 4, cd: 40, desc: 'Kontainer suplai jatuh: knock-up musuh, heal rekan.', area: { shape: 'circle', at: 'point', r: 4, delay: 1.0 }, hit: { dmg: [220, 28, 1.0, 'mp'], dt: 'magic', air: 1 }, allies: { at: 'point', r: 4.5, heal: [150, 20, 0.6, 'mp'] }, fx: { c: '#ffd23a', text: 'AIR DROP', drop: 'container' } },
    ],
  }),
  qaqc: H({
    name: 'QA/QC Inspector', role: 'Assassin / Anti-Tank', cls: 'assassin', sfx: 'H14', art: 'qa_qc_inspector_concept_sheet', color: '#f2f2ee', accent: '#ff3a3a',
    passive: { name: 'Flaw Detection', desc: 'Serangan dasar memberi +2,5% Max HP target sebagai True Damage.', type: 'pctTrue', v: 0.025 },
    skills: [
      { name: 'Ultrasonic Scan', kind: 'self', aoe: 9, cd: 10, desc: 'Sonar biru: membuka posisi musuh 9 m & Armor -30% 3 dtk.', area: { shape: 'circle', at: 'self', r: 9 }, hit: { reveal: 4, mark: 3 }, fx: { c: '#4fb8ff', text: 'SCAN' } },
      { name: 'Punch List Dash', kind: 'dir', range: 7, width: 2, cd: 7, desc: 'Meluncur menebas dengan kilatan laser merah.', area: { shape: 'dash', len: 7, w: 1.6 }, hit: { dmg: [140, 18, 0.9, 'atk'], dt: 'phys' }, fx: { c: '#ff3a3a' } },
      { name: 'NCR Reject Stamp', kind: 'unit', range: 3.8, cd: 36, desc: 'Segel NCR raksasa: damage besar + stun 0,6 dtk.', area: { shape: 'unit' }, hit: { dmg: [300, 35, 1.3, 'atk'], dt: 'phys', stun: 0.6, mark: 4 }, fx: { c: '#ff3a3a', text: 'NCR REJECT' } },
    ],
  }),
  commissioning: H({
    name: 'Commissioning Eng.', role: 'Mage / Area Buffer', cls: 'mage', sfx: 'H15', art: 'commissioning_engineer_hero_turnaround_board', color: '#24304a', accent: '#5aff9a', projColor: '#5aff9a',
    passive: { name: 'Loop Sync', desc: 'Skill yang mengenai musuh mempercepat cooldown skill lain 0,6 dtk.', type: 'loopSync', v: 0.6 },
    skills: [
      { name: 'Circuit Pulse', kind: 'unit', range: 8, cd: 6, desc: 'Bola listrik memantul ke 3 musuh.', area: { shape: 'chain', n: 3, r: 6 }, hit: { dmg: [120, 16, 0.7, 'mp'], dt: 'magic' }, fx: { c: '#5aff9a' } },
      { name: 'Hydro/Air Test', kind: 'point', range: 9, aoe: 3.5, cd: 11, desc: 'Kubah tekanan udara membesar lalu meledak: dorong 3 m.', area: { shape: 'circle', at: 'point', r: 3.5, delay: 1.0 }, hit: { dmg: [180, 22, 0.9, 'mp'], dt: 'magic', knock: 3 }, fx: { c: '#9fd8ff', text: 'PRESSURE TEST' } },
      { name: 'Full Plant Energize', kind: 'self', aoe: 12, cd: 45, desc: 'Lantai jadi sirkuit: rekan +40% Attack Speed & +20% kecepatan 6 dtk.', area: { shape: 'self' }, allies: { at: 'self', r: 12, as: [0.4, 6], ms: [0.2, 6], cdr: 2 }, fx: { c: '#5aff9a', text: 'ENERGIZE!' } },
    ],
  }),
  crane: H({
    name: 'Crane Operator', role: 'Tank / Hook Initiator', cls: 'tank', sfx: 'H16', art: 'crane_operator_character_turnaround_sheet', color: '#b8321f', accent: '#ffb030',
    passive: { name: 'Counterweight', desc: '+12 Armor & Magic Def; kebal dorongan.', type: 'flatDef', v: 12 },
    skills: [
      { name: 'Heavy Crane Hook', kind: 'dir', range: 11, width: 1.2, cd: 10, desc: 'Kait baja menarik musuh pertama + stun 0,6 dtk.', area: { shape: 'proj', speed: 30, w: 0.7 }, hit: { dmg: [120, 15, 0.5, 'atk'], dt: 'phys', pull: true, stun: 0.6 }, fx: { c: '#ffb030', hook: true } },
      { name: 'Rigging Swing', kind: 'self', aoe: 4, cd: 9, desc: 'Memutar rantai baja: damage area + dorong 3 m.', area: { shape: 'circle', at: 'self', r: 4 }, hit: { dmg: [120, 15, 0.5, 'atk'], dt: 'phys', knock: 3 }, fx: { c: '#ffb030' } },
      { name: '50-Ton Slam', kind: 'unit', range: 4.5, cd: 38, desc: 'Mengangkat musuh dengan kait lalu membanting: knock-up 1,4 dtk.', area: { shape: 'unit' }, hit: { dmg: [250, 30, 0.9, 'atk'], dt: 'phys', air: 1.4 }, fx: { c: '#ffb030', text: '50 TON!', slam: true } },
    ],
  }),
  geotech: H({
    name: 'Geotechnical Eng.', role: 'Tank / Crowd Control', cls: 'tank', sfx: 'H17', art: 'geotechnical_soil_engineer_concept_sheet', color: '#8a6a40', accent: '#ffcf6a',
    passive: { name: 'Bearing Capacity', desc: '+10 Armor & Magic Def dari tanah yang dipadatkan.', type: 'flatDef', v: 10 },
    skills: [
      { name: 'Soil Liquefaction', kind: 'point', range: 9, aoe: 3.5, cd: 10, desc: 'Lumpur hisap: slow 55% selama 3 dtk.', area: { shape: 'circle', at: 'point', r: 3.5 }, zone: { r: 3.5, dur: 3, tick: 0.4, hit: { slow: [0.55, 0.5], dmg: [25, 4, 0.1, 'atk'], dt: 'magic' } }, fx: { c: '#a07840', text: 'LIQUEFACTION' } },
      { name: 'Bored Pile', kind: 'point', range: 8, aoe: 2.3, cd: 11, desc: 'Tiang pancang menyembul: knock-up 1 dtk.', area: { shape: 'circle', at: 'point', r: 2.3, delay: 0.5 }, hit: { dmg: [140, 18, 0.6, 'atk'], dt: 'phys', air: 1 }, fx: { c: '#ffcf6a', pillar: true } },
      { name: 'Ground Settlement', kind: 'point', range: 8, aoe: 6, cd: 42, desc: 'Kawah penurunan tanah: menyedot musuh ke pusat + stun 0,8 dtk.', area: { shape: 'circle', at: 'point', r: 6, delay: 0.4 }, hit: { dmg: [220, 26, 0.8, 'atk'], dt: 'phys', pullTo: true, stun: 0.8 }, fx: { c: '#ffcf6a', text: 'SETTLEMENT' } },
    ],
  }),
  hvac: H({
    name: 'HVAC / Mechanical Eng.', role: 'Mage / Thermal Zoner', cls: 'mage', sfx: 'H18', art: 'hvac_engineer_thermal_control_showcase', color: '#a9cfe8', accent: '#6fd0ff', projColor: '#9fe8ff',
    passive: { name: 'Thermal Shift', desc: 'Serangan bergantian Chiller (slow 20%) dan Boiler (burn).', type: 'thermal' },
    skills: [
      { name: 'High-Pressure Duct', kind: 'dir', range: 7, aoe: 7, cd: 8, desc: 'Semburan angin kencang: damage + dorong 3 m.', area: { shape: 'cone', r: 7, ang: 0.5 }, hit: { dmg: [130, 18, 0.7, 'mp'], dt: 'magic', knock: 3 }, fx: { c: '#c8f0ff' } },
      { name: 'Cryo Chiller Zone', kind: 'point', range: 9, aoe: 3.5, cd: 12, desc: 'Hamparan kristal es: slow 50% + damage tiap detik.', area: { shape: 'circle', at: 'point', r: 3.5 }, zone: { r: 3.5, dur: 3.5, tick: 0.5, hit: { slow: [0.5, 0.6], dmg: [35, 5, 0.15, 'mp'], dt: 'magic' } }, fx: { c: '#9fe8ff', text: 'CRYO' } },
      { name: 'Exhaust Vortex', kind: 'point', range: 9, aoe: 6, cd: 42, desc: 'Kipas turbin raksasa menyedot musuh ke pusaran + stun 1 dtk.', area: { shape: 'circle', at: 'point', r: 6, delay: 0.3 }, hit: { dmg: [260, 32, 1.1, 'mp'], dt: 'magic', pullTo: true, stun: 1 }, fx: { c: '#ff8a4a', text: 'VORTEX', vortex: true } },
    ],
  }),
  doccontrol: H({
    name: 'Document Controller', role: 'Support / Specialist', cls: 'support', sfx: 'H19', art: 'document_controller_hero_turnaround', color: '#1d2a4a', accent: '#3fd2ff', projColor: '#ffffff',
    passive: { name: 'Master Register', desc: 'Musuh yang dikenai serangan tercatat: terlihat 3 dtk.', type: 'revealOnHit' },
    skills: [
      { name: 'Transmittal Wave', kind: 'dir', range: 10, width: 4, cd: 6, desc: 'Lembaran kertas tajam berputar menyebar.', area: { shape: 'proj', speed: 24, w: 0.6, fan: 3 }, hit: { dmg: [100, 14, 0.6, 'mp'], dt: 'magic' }, fx: { c: '#ffffff' } },
      { name: 'VOID Stamp', kind: 'unit', range: 7, cd: 11, desc: 'Stempel VOID: hapus Shield musuh + silence 1,2 dtk.', area: { shape: 'unit' }, hit: { dmg: [120, 16, 0.6, 'mp'], dt: 'magic', strip: true, silence: 1.2 }, fx: { c: '#ff3a3a', text: 'VOID' } },
      { name: 'As-Built Archive', kind: 'self', aoe: 12, cd: 42, desc: 'Blueprint APPROVED melindungi tim: Shield besar & hapus CC.', area: { shape: 'self' }, allies: { at: 'self', r: 12, shield: [220, 28, 1.2, 'mp'], cleanse: true }, fx: { c: '#3fd2ff', text: 'APPROVED' } },
    ],
  }),
  pm: H({
    name: 'Project Manager', role: 'Fighter / Team Leader', cls: 'fighter', sfx: 'H20', art: 'executive_project_manager_character_board', color: '#f4f4f0', accent: '#ffd23a',
    passive: { name: 'Critical Path', desc: 'Target serangan ditandai 3 dtk: Armor -30% untuk seluruh tim.', type: 'markOnHit', v: 3 },
    skills: [
      { name: 'Milestone Slash', kind: 'dir', range: 6, width: 2.6, cd: 6, desc: 'Tebasan energi emas jarak menengah.', area: { shape: 'line', len: 6, w: 2.6 }, hit: { dmg: [115, 14, 0.75, 'atk'], dt: 'phys' }, fx: { c: '#ffd23a' } },
      { name: 'Fast-Track', kind: 'dir', range: 6, width: 2, cd: 10, desc: 'Dash kilat; reset cooldown bila mengenai hero.', area: { shape: 'dash', len: 6, w: 1.6, resetOnHero: true }, hit: { dmg: [100, 14, 0.6, 'atk'], dt: 'phys' }, fx: { c: '#ffd23a' } },
      { name: 'Executive Command', kind: 'self', aoe: 12, cd: 45, desc: 'Aura rapat emas: rekan +30% Attack Speed, +20% kecepatan, Shield.', area: { shape: 'self' }, allies: { at: 'self', r: 12, as: [0.3, 6], ms: [0.2, 6], shield: [150, 20, 0.5, 'atk'] }, fx: { c: '#ffd23a', text: 'EXECUTIVE COMMAND' } },
    ],
  }),
};
