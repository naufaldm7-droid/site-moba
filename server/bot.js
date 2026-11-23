// AI bot hero: farming di lane tugasnya (top/mid/bot), trading, mundur & recall, beli item rekomendasi, ambil boss.
import { ITEMS, ULT_LEVEL, S2_LEVEL, STRUCT, laneProject, lanePoint } from '../shared/data.js';
import { d2, dist } from './game.js';

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

// gerak (map blitz: lewat gerbang stockyard bila menyeberang lane <-> jungle)
function steer(g, h, tx, tz, stop = 0.5) {
  let gx = tx, gz = tz;
  const gate = g.map.gate;
  if (gate) {
    const inJungle = h.z < gate.split + 0.5, tJungle = tz < gate.split - 1;
    if (inJungle !== tJungle && Math.abs(h.x - gate.x) > 10) { gx = gate.x; gz = inJungle ? gate.zIn : gate.zOut; }
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

// titik pulang: dekat base langsung ke spawn, selain itu mundur menyusuri lane terdekat
function homeward(g, h) {
  const sp = g.map.spawn[h.team];
  if (Math.hypot(h.x - sp.x, h.z - sp.z) < 35) return sp;
  const dir = h.team === 0 ? 1 : -1;
  let best = null;
  for (const L of Object.values(g.map.laneData)) {
    const pr = laneProject(L, h.x, h.z);
    if (!best || pr.d < best.pr.d) best = { L, pr };
  }
  return lanePoint(best.L, best.pr.s - dir * 14);
}

export function botThink(g, h) {
  const b = h.brain;
  const now = g.time;
  const inp = h.input;
  inp.mx = 0; inp.mz = 0; inp.atk = false; inp.tg = 0;
  const dir = h.team === 0 ? 1 : -1;
  const hr = h.hp / h.maxHp;
  const c = h.cur;
  const laneKey = g.map.laneData[b.lane] ? b.lane : Object.keys(g.map.laneData)[0];
  const lane = g.lane(laneKey);
  const prog = (u) => laneProject(lane, u.x, u.z).s;

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
    if (g.inFountain(h, h.team)) { if (hr > 0.85) b.retreat = false; return; }
    const sp = g.map.spawn[h.team];
    if (!enemies.length && Math.hypot(h.x - sp.x, h.z - sp.z) > 30 && now - h.lastCombatAt > 2.5) {
      g.setInput(h, { t: 'recall' });
      return;
    }
    if (enemies.length) { const e = enemies[0]; if (dist(e, h) < 6) useSkills(g, h, e, allies); }
    const home = homeward(g, h);
    steer(g, h, home.x, home.z);
    return;
  }
  b.retreat = false;

  // ---- struktur musuh terdepan di lane ini (bahaya)
  let danger = null, dangerS = 0;
  for (const e of g.ents.values()) {
    if (e.kind !== 'struct' || e.team === h.team || e.dead || !e.armed) continue;
    if (e.lane !== laneKey && e.type !== 'base') continue;
    const sS = e.lane ? e.laneS : (dir > 0 ? lane.len + 6 : -6);
    if (!danger || dir * sS < dir * dangerS) { danger = e; dangerS = sS; }
  }
  const allyMinionsUnder = (s) => {
    let n = 0;
    for (const e of g.ents.values()) if ((e.kind === 'minion' || (e.kind === 'boss' && e.ally)) && e.team === h.team && !e.dead && dist(e, s) < STRUCT[s.type].range + 0.5) n++;
    return n;
  };
  const turretSafe = (x, z) => {
    for (const e of g.ents.values()) {
      if (e.kind !== 'struct' || e.team === h.team || e.dead || !e.armed) continue;
      const rr = STRUCT[e.type].range + 2;
      if ((x - e.x) ** 2 + (z - e.z) ** 2 > rr * rr) continue;
      const tgt = g.ents.get(e.target);
      if (!(allyMinionsUnder(e) >= 1 && (!tgt || tgt.kind !== 'hero'))) return false;
    }
    return true;
  };

  // ---- objektif boss
  if ((b.nextObj || 0) < now) {
    b.nextObj = now + 6;
    b.obj = 0;
    if (h.lvl >= 4 && hr > 0.6) {
      for (const boss of g.bosses()) {
        if (dist(h, boss) > (g.map.big ? 60 : 200)) continue;
        const mates = g.heroes.filter((o) => o.team === h.team && !o.dead && o.hp / o.maxHp > 0.55 && dist(o, boss) < 70).length;
        const foesNear = g.heroes.filter((o) => o.team !== h.team && !o.dead && d2(o, boss) < 400).length;
        if (mates >= (g.map.big ? 3 : 2) && foesNear <= 1 && Math.random() < 0.55) { b.obj = boss.id; break; }
      }
    }
  }

  // ---- lawan hero
  let target = null;
  for (const e of enemies) {
    if (dist(e, h) > 11) continue;
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
    // kalah posisi: mundur menyusuri lane sambil tetap pakai skill pelindung
    if (dist(h, target) < 6) useSkills(g, h, target, allies);
    const back = homeward(g, h);
    steer(g, h, back.x, back.z);
    return;
  }

  // ---- boss
  if (b.obj) {
    const boss = g.ents.get(b.obj);
    if (boss && !boss.dead && boss.team === 2) {
      if (dist(h, boss) > c.range + boss.r + 1) steer(g, h, boss.x, boss.z, c.range + boss.r);
      else { inp.atk = true; inp.tg = boss.id; if (h.hero !== 'hse') useSkills(g, h, boss, allies); }
      return;
    }
    b.obj = 0;
  }

  // ---- farming lane
  let front = null, frontS = 0;
  for (const e of g.ents.values()) {
    if ((e.kind === 'minion' || (e.kind === 'boss' && e.ally)) && e.team === h.team && !e.dead && e.lane === laneKey) {
      const sS = prog(e);
      if (!front || dir * sS > dir * frontS) { front = e; frontS = sS; }
    }
  }
  // minion musuh dalam jangkauan
  let farm = null;
  for (const e of g.ents.values()) {
    if (e.kind !== 'minion' || e.team === h.team || e.dead || !e.visible[h.team]) continue;
    if (dist(e, h) > c.range + 4) continue;
    if (!turretSafe(e.x, e.z)) continue;
    if (!farm || e.hp < farm.hp) farm = e;
  }
  if (farm) {
    inp.atk = true; inp.tg = farm.id;
    if (dist(h, farm) > c.range + farm.r) steer(g, h, farm.x, farm.z, c.range + farm.r - 0.3);
    return;
  }
  // struktur musuh bila aman (ada minion kawan di bawahnya)
  if (danger && danger.vuln && dist(h, danger) < c.range + danger.r + 6 && allyMinionsUnder(danger) >= 1) {
    const tgt = g.ents.get(danger.target);
    if (!tgt || tgt.kind !== 'hero') {
      inp.atk = true; inp.tg = danger.id;
      if (dist(h, danger) > c.range + danger.r) steer(g, h, danger.x, danger.z, c.range + danger.r - 0.3);
      return;
    }
  }
  // posisi berdiri di lane
  let ps;
  if (front) ps = frontS - dir * (h.H.melee ? 1.5 : 4);
  else {
    // tunggu di depan struktur sendiri terdepan di lane ini
    let own = null, ownS = 0;
    for (const e of g.ents.values()) {
      if (e.kind !== 'struct' || e.team !== h.team || e.dead || e.lane !== laneKey) continue;
      if (!own || dir * e.laneS > dir * ownS) { own = e; ownS = e.laneS; }
    }
    ps = own ? ownS + dir * 3 : (dir > 0 ? 8 : lane.len - 8);
  }
  if (danger && danger.lane) {
    const limit = dangerS - dir * (STRUCT[danger.type].range + 2.5);
    const lp = lanePoint(lane, ps);
    if (dir * ps > dir * limit && !turretSafe(lp.x, lp.z)) ps = limit;
  }
  const off = ((h.id % 3) - 1) * 2.2;
  // jauh dari lane: kembali dulu ke titik lane terdekat; selain itu susuri lane (jangan potong lewat tikungan)
  const pr = laneProject(lane, h.x, h.z);
  if (Math.abs(ps - pr.s) > 12) ps = pr.s + Math.sign(ps - pr.s) * 12;
  const p = lanePoint(lane, ps);
  if (pr.d > 20) { const q = lanePoint(lane, pr.s); steer(g, h, q.x, q.z, 2); }
  else steer(g, h, p.x - p.dz * off, p.z + p.dx * off, 1.2);
  // surveyor: drone recon ke semak terdekat sesekali
  if (h.hero === 'surveyor' && (b.nextDrone || 0) < now && h.lvl >= 2) {
    b.nextDrone = now + 18;
    let best = null, bd = Infinity;
    for (const bu of g.map.bushes) {
      const cx = (bu.x1 + bu.x2) / 2, cz = (bu.z1 + bu.z2) / 2;
      const dd = (cx - h.x) ** 2 + (cz - h.z) ** 2;
      if (dd < bd && dd < 600) { bd = dd; best = { x: cx, z: cz }; }
    }
    if (best) cast(h, 0, best.x, best.z, 0);
  }
}
