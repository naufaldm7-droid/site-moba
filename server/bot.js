// AI bot hero: farming lane, trading, mundur & recall saat HP rendah, beli item rekomendasi, ambil boss.
import { MAP, ITEMS, ULT_LEVEL, S2_LEVEL, STRUCT } from '../shared/data.js';
import { d2, dist, inFountain } from './game.js';

const GATE_X = 70;

function canCast(h, slot) {
  if (h.cds[slot] > 0) return false;
  if (slot === 2 && h.lvl < ULT_LEVEL) return false;
  if (slot === 1 && h.lvl < S2_LEVEL) return false;
  return true;
}
function cast(h, slot, x, z, jitter = 0.6) {
  if (!canCast(h, slot) || h.casts.length) return false;
  h.casts.push({ slot, x: x + (Math.random() - 0.5) * jitter, z: z + (Math.random() - 0.5) * jitter });
  return true;
}

function shop(g, h) {
  for (let guard = 0; guard < 4; guard++) {
    let bought = false;
    for (const id of h.H.build) {
      if (h.items.includes(id)) continue;
      if (g.buy(h, id)) { bought = true; break; }
      const it = ITEMS[id];
      if (it.from && h.items.length < 6) for (const c of it.from) if (!h.items.includes(c) && g.buy(h, c)) { bought = true; break; }
      break; // tunggu sampai item ini terbeli dulu
    }
    if (!bought) return;
  }
}

// gerak dengan rute lewat gerbang stockyard bila perlu
function steer(g, h, tx, tz, stop = 0.5) {
  let gx = tx, gz = tz;
  const inJungle = h.z < 42.5, tJungle = tz < 41;
  if (inJungle !== tJungle && Math.abs(h.x - GATE_X) > 10) {
    gx = GATE_X; gz = inJungle ? 38 : 45;
  }
  const dx = gx - h.x, dz = gz - h.z;
  const L = Math.hypot(dx, dz);
  if (L <= stop) return true;
  h.input.mx = dx / L; h.input.mz = dz / L;
  // anti-macet: kalau tidak bergerak, belok sedikit
  const b = h.brain;
  if (b.lx !== undefined && Math.abs(b.lx - h.x) + Math.abs(b.lz - h.z) < 0.02) {
    b.stuck = (b.stuck || 0) + 1;
    if (b.stuck > 8) { const s = (h.id % 2 ? 1 : -1); h.input.mx = -dz / L * s; h.input.mz = dx / L * s; }
  } else b.stuck = 0;
  b.lx = h.x; b.lz = h.z;
  return false;
}

function useSkills(g, h, e, allies) {
  const dd = dist(h, e);
  const er = e.hp / e.maxHp;
  const disabled = e.stunUntil > g.time || e.rootUntil > g.time || e.slows.length > 0;
  switch (h.hero) {
    case 'structural':
      if (dd < 4.8) cast(h, 0, e.x, e.z);
      if (dd < 7.5) cast(h, 1, e.x, e.z, 0.3);
      if (dd < 4.5 || (dd < 6 && er < 0.4)) cast(h, 2, h.x, h.z);
      break;
    case 'hse':
      if (dd < 5.5) cast(h, 1, e.x, e.z);
      if (allies.some((a) => a.hp / a.maxHp < 0.4 && d2(a, h) < 144)) cast(h, 2, h.x, h.z);
      break;
    case 'drafter':
      if (dd < 10 && h.invisUntil < g.time) cast(h, 1, h.x, h.z);
      if (dd < 7 && (er < 0.7 || h.brain.engage)) cast(h, 0, e.x, e.z, 0.2);
      if (h.hp / h.maxHp < 0.3 || (dd < 3.5 && er < 0.5)) cast(h, 2, h.x, h.z);
      break;
    case 'qs':
      if (dd < 9.5) cast(h, 0, e.x, e.z, 0.3);
      if (dd < 9) cast(h, 1, e.x, e.z);
      if (dd < 12 && (er < 0.55 || disabled)) cast(h, 2, e.x, e.z, 0.4);
      break;
    case 'surveyor':
      if (dd < 17) cast(h, 1, e.x, e.z, 0.3);
      if (dd < 28 && (er < 0.5 || disabled)) cast(h, 2, e.x, e.z, 0.5);
      break;
  }
}

export function botThink(g, h) {
  const b = h.brain;
  const now = g.time;
  const inp = h.input;
  inp.mx = 0; inp.mz = 0; inp.atk = false; inp.tg = 0;
  const dir = h.team === 0 ? 1 : -1;
  const hr = h.hp / h.maxHp;
  const c = h.cur;

  if ((b.nextShop || 0) < now) { b.nextShop = now + 2.5; shop(g, h); }
  if (h.recallUntil) return; // sedang recall: diam

  // ---- kumpulkan info sekitar
  const enemies = [], allies = [];
  for (const o of g.heroes) {
    if (o.dead) continue;
    if (o.team === h.team) { if (d2(o, h) < 144) allies.push(o); }
    else if (o.visible[h.team] && d2(o, h) < 144) enemies.push(o);
  }
  // HSE: heal kawan
  if (h.hero === 'hse') {
    let low = null;
    for (const a of g.heroes) if (a.team === h.team && !a.dead && a.hp / a.maxHp < 0.7 && d2(a, h) < 81) if (!low || a.hp / a.maxHp < low.hp / low.maxHp) low = a;
    if (low) cast(h, 0, low.x, low.z, 0.3);
  }

  // ---- mundur
  if (hr < 0.28 || (b.retreat && hr < 0.85)) {
    b.retreat = true;
    if (inFountain(h, h.team)) { if (hr > 0.85) b.retreat = false; return; }
    const sp = MAP.spawn[h.team];
    if (!enemies.length && Math.abs(h.x - sp.x) > 30 && now - h.lastCombatAt > 2.5) {
      g.setInput(h, { t: 'recall' });
      return;
    }
    if (enemies.length) { const e = enemies[0]; if (dist(e, h) < 6) useSkills(g, h, e, allies); }
    steer(g, h, sp.x, sp.z);
    return;
  }
  b.retreat = false;

  // ---- struktur musuh terdepan (bahaya)
  let danger = null;
  for (const e of g.ents.values()) {
    if (e.kind !== 'struct' || e.team === h.team || e.dead || !e.armed) continue;
    if (!danger || (dir > 0 ? e.x < danger.x : e.x > danger.x)) danger = e;
  }
  const allyMinionsUnder = (s) => {
    let n = 0;
    for (const e of g.ents.values()) if ((e.kind === 'minion' || (e.kind === 'boss' && e.ally)) && e.team === h.team && !e.dead && dist(e, s) < STRUCT[s.type].range + 0.5) n++;
    return n;
  };
  const turretSafe = (x, z) => {
    if (!danger) return true;
    const rr = STRUCT[danger.type].range + 2;
    if ((x - danger.x) ** 2 + (z - danger.z) ** 2 > rr * rr) return true;
    const tgt = g.ents.get(danger.target);
    return allyMinionsUnder(danger) >= 1 && (!tgt || tgt.kind !== 'hero');
  };

  // ---- objektif boss
  if ((b.nextObj || 0) < now) {
    b.nextObj = now + 6;
    const boss = g.bossId ? g.ents.get(g.bossId) : null;
    b.obj = false;
    if (boss && !boss.dead && h.lvl >= 4 && hr > 0.6) {
      const mates = g.heroes.filter((o) => o.team === h.team && !o.dead && o.hp / o.maxHp > 0.55).length;
      const foesNear = g.heroes.filter((o) => o.team !== h.team && !o.dead && d2(o, boss) < 400).length;
      if (mates >= 2 && foesNear <= 1 && Math.random() < 0.55) b.obj = true;
    }
  }

  // ---- lawan hero
  let target = null;
  for (const e of enemies) {
    const dd = dist(e, h);
    if (dd > 11) continue;
    if (!target || e.hp / e.maxHp < target.hp / target.maxHp) target = e;
  }
  if (target) {
    const er = target.hp / target.maxHp;
    const advantage = hr - er + (allies.length - enemies.length) * 0.2;
    const safe = turretSafe(target.x, target.z) || er < 0.2;
    b.engage = advantage > -0.15 && safe;
    if (b.engage) {
      useSkills(g, h, target, allies);
      inp.atk = true; inp.tg = target.id;
      const want = c.range + target.r - 0.3;
      if (dist(h, target) > want) steer(g, h, target.x, target.z, want);
      else if (!h.H.melee && dist(h, target) < want - 2.5) {
        // kiting kecil untuk ranged
        const dx = h.x - target.x, dz = h.z - target.z, L = Math.hypot(dx, dz) || 1;
        inp.mx = dx / L * 0.6; inp.mz = dz / L * 0.6; inp.atk = true;
      }
      return;
    }
    // kalah posisi: mundur sedikit sambil tetap pakai skill pelindung
    if (dist(h, target) < 6) useSkills(g, h, target, allies);
    const backX = h.x - dir * 6;
    steer(g, h, backX, MAP.laneZ);
    return;
  }

  // ---- boss
  if (b.obj && g.bossId) {
    const boss = g.ents.get(g.bossId);
    if (boss && !boss.dead) {
      if (dist(h, boss) > c.range + boss.r + 1) steer(g, h, boss.x, boss.z, c.range + boss.r);
      else { inp.atk = true; inp.tg = boss.id; if (h.hero !== 'hse') useSkills(g, h, boss, allies); }
      return;
    }
    b.obj = false;
  }

  // ---- farming lane
  let front = null;
  for (const e of g.ents.values()) {
    if ((e.kind === 'minion' || (e.kind === 'boss' && e.ally)) && e.team === h.team && !e.dead && e.z > 41) {
      if (!front || (dir > 0 ? e.x > front.x : e.x < front.x)) front = e;
    }
  }
  // minion musuh dalam jangkauan
  let farm = null;
  for (const e of g.ents.values()) {
    if (e.kind !== 'minion' || e.team === h.team || e.dead || !e.visible[h.team]) continue;
    const dd = dist(e, h);
    if (dd > c.range + 4) continue;
    if (!turretSafe(e.x, e.z)) continue;
    if (!farm || e.hp < farm.hp) farm = e;
  }
  if (farm) {
    inp.atk = true; inp.tg = farm.id;
    if (dist(h, farm) > c.range + farm.r) steer(g, h, farm.x, farm.z, c.range + farm.r - 0.3);
    return;
  }
  // struktur musuh bila aman (ada minion kawan di bawahnya)
  if (danger && dist(h, danger) < c.range + danger.r + 6 && allyMinionsUnder(danger) >= 1) {
    const tgt = g.ents.get(danger.target);
    if (!tgt || tgt.kind !== 'hero') {
      inp.atk = true; inp.tg = danger.id;
      if (dist(h, danger) > c.range + danger.r) steer(g, h, danger.x, danger.z, c.range + danger.r - 0.3);
      return;
    }
  }
  // posisi berdiri
  let px;
  if (front) px = front.x - dir * (h.H.melee ? 1.5 : 4);
  else {
    // tunggu di belakang turret sendiri terdepan
    let own = null;
    for (const e of g.ents.values()) if (e.kind === 'struct' && e.team === h.team && !e.dead && (!own || (dir > 0 ? e.x > own.x : e.x < own.x))) own = e;
    px = own ? own.x + dir * 3 : MAP.spawn[h.team].x + dir * 10;
  }
  if (danger && !turretSafe(px, MAP.laneZ)) px = danger.x - dir * (STRUCT[danger.type].range + 2.5);
  const pz = MAP.laneZ + ((h.id % 3) - 1) * 2.2;
  steer(g, h, px, pz, 1.2);
  // surveyor: drone recon ke semak terdekat di depan sesekali
  if (h.hero === 'surveyor' && (b.nextDrone || 0) < now && h.lvl >= 2) {
    b.nextDrone = now + 18;
    let best = null, bd = Infinity;
    for (const bu of MAP.bushes) {
      const cx = (bu.x1 + bu.x2) / 2, cz = (bu.z1 + bu.z2) / 2;
      const dd = (cx - h.x) ** 2 + (cz - h.z) ** 2;
      if (dd < bd && dd < 600) { bd = dd; best = { x: cx, z: cz }; }
    }
    if (best) cast(h, 0, best.x, best.z, 0);
  }
}
