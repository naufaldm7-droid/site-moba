// Procedural SFX (WebAudio) — mengikuti Asset Key & parameter sintesis di "Katalog Audio & SFX Library" GDD.
// Tanpa file audio: semua suara disintesis langsung di browser.
let ctx = null, master = null, noiseBuf = null;
let enabled = true;
const lastPlay = new Map();
let voices = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setSound(on) { enabled = on; if (master) master.gain.value = on ? 0.55 : 0; }
export const soundOn = () => enabled;

// ---------------------------------------------------------------- building blocks
function env(g, t, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(out, t, { type = 'sine', f0, f1 = f0, dur = 0.2, a = 0.005, gain = 0.3, filter, q = 1 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, a, dur, gain);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filter; f.Q.value = q; o.connect(f); node = f; }
  node.connect(g); g.connect(out);
  o.start(t); o.stop(t + a + dur + 0.05);
}
function noise(out, t, { dur = 0.2, a = 0.005, gain = 0.3, type = 'bandpass', f0 = 1000, f1 = f0, q = 1 }) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  env(g, t, a, dur, gain);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + a + dur + 0.05);
}

// ---------------------------------------------------------------- resep generik
const R = {
  click: (o, t) => tone(o, t, { type: 'square', f0: 1200, f1: 400, dur: 0.06, gain: 0.25, filter: 900, q: 2 }),
  thud: (o, t, k = 1) => { tone(o, t, { f0: 140 * k, f1: 50, dur: 0.18, gain: 0.6 }); noise(o, t, { dur: 0.08, f0: 900, gain: 0.25, type: 'lowpass' }); },
  hit: (o, t) => { noise(o, t, { dur: 0.06, f0: 2200, gain: 0.25, q: 0.8 }); tone(o, t, { f0: 220, f1: 90, dur: 0.08, gain: 0.25 }); },
  metal: (o, t, f = 900) => { tone(o, t, { type: 'triangle', f0: f, dur: 0.35, gain: 0.2 }); tone(o, t, { type: 'sine', f0: f * 2.76, dur: 0.25, gain: 0.1 }); noise(o, t, { dur: 0.04, f0: 4000, gain: 0.2 }); },
  whoosh: (o, t, up = true) => noise(o, t, { dur: 0.28, a: 0.06, f0: up ? 500 : 3000, f1: up ? 3000 : 500, gain: 0.35, q: 1.5 }),
  zap: (o, t) => { noise(o, t, { dur: 0.05, f0: 6000, gain: 0.4, type: 'highpass' }); tone(o, t, { type: 'sawtooth', f0: 3000, f1: 180, dur: 0.25, gain: 0.18 }); for (let i = 0; i < 3; i++) noise(o, t + 0.03 * i + Math.random() * 0.04, { dur: 0.03, f0: 5000, gain: 0.25, type: 'highpass' }); },
  laser: (o, t, f = 1800) => { tone(o, t, { type: 'square', f0: f, f1: f / 6, dur: 0.22, gain: 0.12 }); tone(o, t, { type: 'sine', f0: f * 1.5, f1: f / 4, dur: 0.2, gain: 0.1 }); },
  heal: (o, t) => [523, 659, 784, 1047].forEach((f, i) => tone(o, t + i * 0.06, { type: 'sine', f0: f, dur: 0.35, gain: 0.12 })),
  whistle: (o, t) => { tone(o, t, { type: 'sine', f0: 2800, f1: 2950, dur: 0.45, a: 0.02, gain: 0.22 }); tone(o, t, { type: 'sine', f0: 2860, f1: 3020, dur: 0.45, a: 0.02, gain: 0.12 }); },
  paper: (o, t, n = 4) => { for (let i = 0; i < n; i++) noise(o, t + i * 0.035, { dur: 0.05, f0: 4500, gain: 0.2, q: 0.7 }); },
  coins: (o, t) => { for (let i = 0; i < 6; i++) tone(o, t + i * 0.045 + Math.random() * 0.02, { type: 'triangle', f0: 1800 + Math.random() * 1600, dur: 0.15, gain: 0.08 }); },
  stamp: (o, t) => { R.thud(o, t, 0.8); tone(o, t + 0.02, { type: 'square', f0: 1800, f1: 900, dur: 0.03, gain: 0.12 }); },
  quake: (o, t) => { tone(o, t, { f0: 70, f1: 32, dur: 0.9, a: 0.02, gain: 0.7 }); noise(o, t, { dur: 0.9, f0: 300, f1: 80, type: 'lowpass', gain: 0.6 }); },
  boom: (o, t) => { tone(o, t, { f0: 110, f1: 35, dur: 0.6, gain: 0.7 }); noise(o, t, { dur: 0.5, f0: 1200, f1: 100, type: 'lowpass', gain: 0.5 }); },
  drone: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 220, f1: 330, dur: 0.6, a: 0.05, gain: 0.08, filter: 800 }); tone(o, t, { type: 'sawtooth', f0: 226, f1: 340, dur: 0.6, a: 0.05, gain: 0.06, filter: 800 }); },
  rewind: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 200, f1: 2400, dur: 0.45, gain: 0.12, filter: 1500, q: 0.7 }); R.whoosh(o, t + 0.1, true); },
  water: (o, t) => { tone(o, t, { f0: 110, f1: 60, dur: 0.2, gain: 0.5 }); noise(o, t, { dur: 0.35, f0: 800, f1: 3500, gain: 0.35, q: 0.8 }); },
  steam: (o, t) => { noise(o, t, { dur: 1.2, a: 0.1, f0: 2000, f1: 6000, gain: 0.25, type: 'highpass' }); tone(o, t, { type: 'sine', f0: 320, dur: 1.0, gain: 0.1 }); tone(o, t, { type: 'sine', f0: 320 * 2.4, dur: 0.8, gain: 0.05 }); },
  hum: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 50, dur: 1.2, a: 0.2, gain: 0.25, filter: 200 }); tone(o, t, { type: 'sawtooth', f0: 100, dur: 1.2, a: 0.2, gain: 0.15, filter: 300 }); for (let i = 0; i < 6; i++) noise(o, t + 0.2 + i * 0.15, { dur: 0.03, f0: 6000, gain: 0.25, type: 'highpass' }); },
  genset: (o, t) => { tone(o, t, { f0: 65, dur: 1.3, a: 0.1, gain: 0.4 }); tone(o, t, { type: 'square', f0: 1800, dur: 0.02, gain: 0.2 }); tone(o, t + 0.1, { type: 'sawtooth', f0: 80, f1: 260, dur: 1.2, a: 0.2, gain: 0.08, filter: 600 }); },
  meow: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 750, f1: 1100, dur: 0.08, gain: 0.08, filter: 1200, q: 3 }); tone(o, t + 0.08, { type: 'sawtooth', f0: 1100, f1: 500, dur: 0.12, gain: 0.08, filter: 1000, q: 3 }); noise(o, t + 0.05, { dur: 0.06, f0: 5000, gain: 0.15, type: 'highpass' }); },
  bark: (o, t) => { noise(o, t, { dur: 0.18, a: 0.02, f0: 420, gain: 0.35, q: 4 }); noise(o, t, { dur: 0.15, a: 0.02, f0: 950, gain: 0.25, q: 4 }); tone(o, t, { type: 'sawtooth', f0: 380, f1: 260, dur: 0.12, gain: 0.08, filter: 600 }); },
  roar: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 220, f1: 140, dur: 0.9, a: 0.05, gain: 0.3, filter: 500, q: 2 }); noise(o, t, { dur: 0.9, f0: 400, gain: 0.3, q: 1 }); R.metal(o, t + 0.3, 3200); },
  howl: (o, t) => { tone(o, t, { f0: 55, dur: 1.2, a: 0.05, gain: 0.6 }); tone(o, t, { type: 'sawtooth', f0: 130, f1: 180, dur: 1.1, a: 0.1, gain: 0.2, filter: 600 }); tone(o, t, { type: 'sawtooth', f0: 195, f1: 260, dur: 1.1, a: 0.1, gain: 0.15, filter: 700 }); },
  rustle: (o, t) => noise(o, t, { dur: 0.25, a: 0.03, f0: 1500, f1: 4000, gain: 0.2, q: 0.8 }),
  rankup: (o, t) => { R.thud(o, t, 0.65); [261.6, 329.6, 392, 523.3].forEach((f) => tone(o, t + 0.08, { type: 'sawtooth', f0: f, dur: 1.2, a: 0.05, gain: 0.07, filter: 1800, q: 0.5 })); },
  lose: (o, t) => [392, 349, 311, 262].forEach((f, i) => tone(o, t + i * 0.18, { type: 'triangle', f0: f, dur: 0.4, gain: 0.15 })),
  level: (o, t) => [523, 784, 1047].forEach((f, i) => tone(o, t + i * 0.07, { type: 'triangle', f0: f, dur: 0.25, gain: 0.12 })),
  gold: (o, t) => { tone(o, t, { type: 'triangle', f0: 2093, dur: 0.12, gain: 0.08 }); tone(o, t + 0.05, { type: 'triangle', f0: 2637, dur: 0.18, gain: 0.08 }); },
};

// Asset Key -> resep (sesuai katalog GDD)
const MAPKEY = {
  SFX_UI_Click_Hardhat: R.click,
  SFX_UI_RankUp_Stamp: R.rankup,
  SFX_UI_Lose: R.lose,
  SFX_UI_Level: R.level,
  SFX_UI_Gold: R.gold,
  SFX_Turret_Water_Ready: R.steam,
  SFX_Turret_Water_Fire: R.water,
  SFX_Turret_Lightning_Ready: R.hum,
  SFX_Turret_Lightning_Zap: R.zap,
  SFX_Base_Container_Ready: R.genset,
  SFX_Base_Fire: (o, t) => R.laser(o, t, 900),
  SFX_Minion_Cat_Attack: R.meow,
  SFX_Minion_Dog_Bark: R.bark,
  SFX_Boss_ApexCat_Roar: R.roar,
  SFX_Boss_Cerberus_Howl: R.howl,
  SFX_Env_Bush_Rustle: R.rustle,
  SFX_Struct_Collapse: R.boom,
  SFX_Hit: R.hit,
  // 01 Structural
  SFX_H01_Atk_ScaleHit: (o, t) => R.metal(o, t, 700),
  SFX_H01_S1_BeamSwing: (o, t) => { R.whoosh(o, t, false); R.metal(o, t + 0.1, 520); },
  SFX_H01_S2_ConcreteRise: (o, t) => { R.thud(o, t, 0.7); noise(o, t, { dur: 0.4, f0: 600, f1: 200, type: 'lowpass', gain: 0.4 }); },
  SFX_H01_Ult_SeismicQuake: R.quake,
  // 10 HSE
  SFX_H10_Atk_SafetyBaton: (o, t) => R.thud(o, t, 1.3),
  SFX_H10_S1_MedkitHeal: R.heal,
  SFX_H10_S2_StopWhistle: R.whistle,
  SFX_H10_Ult_PPEAura: (o, t) => { R.whistle(o, t); R.heal(o, t + 0.2); },
  // 07 Drafter
  SFX_H07_Atk_StylusSlash: (o, t) => { noise(o, t, { dur: 0.1, f0: 3000, f1: 6000, gain: 0.2 }); tone(o, t, { type: 'square', f0: 1400, f1: 2400, dur: 0.06, gain: 0.05 }); },
  SFX_H07_S1_PolylineZip: (o, t) => { R.whoosh(o, t, true); tone(o, t, { type: 'square', f0: 600, f1: 2200, dur: 0.15, gain: 0.06 }); },
  SFX_H07_S2_LayerClickOff: (o, t) => { R.click(o, t); tone(o, t + 0.05, { type: 'sine', f0: 1600, f1: 300, dur: 0.3, gain: 0.12 }); },
  SFX_H07_Ult_CtrlZRewind: R.rewind,
  // 08 QS
  SFX_H08_Atk_PaperSlice: (o, t) => R.paper(o, t, 2),
  SFX_H08_S1_BOQVolley: (o, t) => R.paper(o, t, 6),
  SFX_H08_S2_AuditStamp: R.stamp,
  SFX_H08_Ult_VaultDrop: (o, t) => { R.coins(o, t); R.boom(o, t + 0.75); R.coins(o, t + 0.8); },
  // 12 Surveyor
  SFX_H12_Atk_LaserPing: (o, t) => tone(o, t, { type: 'sine', f0: 2400, f1: 1800, dur: 0.08, gain: 0.08 }),
  SFX_H12_S1_DroneScan: R.drone,
  SFX_H12_S2_TheodoliteBeam: (o, t) => R.laser(o, t, 2200),
  SFX_H12_Ult_LiDARStrike: (o, t) => { tone(o, t, { type: 'sine', f0: 900, f1: 1800, dur: 0.9, gain: 0.08 }); for (let i = 0; i < 3; i++) { R.laser(o, t + 1.0 + i * 0.4, 1400); R.boom(o, t + 1.0 + i * 0.4); } },
};

const HERO_SFX = {
  structural: ['SFX_H01_S1_BeamSwing', 'SFX_H01_S2_ConcreteRise', 'SFX_H01_Ult_SeismicQuake', 'SFX_H01_Atk_ScaleHit'],
  hse: ['SFX_H10_S1_MedkitHeal', 'SFX_H10_S2_StopWhistle', 'SFX_H10_Ult_PPEAura', 'SFX_H10_Atk_SafetyBaton'],
  drafter: ['SFX_H07_S1_PolylineZip', 'SFX_H07_S2_LayerClickOff', 'SFX_H07_Ult_CtrlZRewind', 'SFX_H07_Atk_StylusSlash'],
  qs: ['SFX_H08_S1_BOQVolley', 'SFX_H08_S2_AuditStamp', 'SFX_H08_Ult_VaultDrop', 'SFX_H08_Atk_PaperSlice'],
  surveyor: ['SFX_H12_S1_DroneScan', 'SFX_H12_S2_TheodoliteBeam', 'SFX_H12_Ult_LiDARStrike', 'SFX_H12_Atk_LaserPing'],
};
export const heroSfx = (hero, slot) => HERO_SFX[hero]?.[slot];

// vol: 0..1 (sudah termasuk atenuasi jarak dari pemanggil)
export function play(key, vol = 1, minGap = 0.045) {
  if (!ctx || !enabled || vol <= 0.02) return;
  const fn = MAPKEY[key];
  if (!fn) return;
  const t = ctx.currentTime;
  const lp = lastPlay.get(key) || 0;
  if (t - lp < minGap) return;
  if (voices > 28) return;
  lastPlay.set(key, t);
  const g = ctx.createGain();
  g.gain.value = Math.min(1, vol);
  g.connect(master);
  voices++;
  fn(g, t + 0.005);
  setTimeout(() => { voices--; g.disconnect(); }, 2200);
}
