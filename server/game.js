// SITE CLASH — simulasi pertandingan (server-authoritative).
import {
  TICK_HZ, MAPS, STRUCT, MINION, BOSS, WAVE, HEROES, ITEMS, START_GOLD, PASSIVE_GOLD,
  MAX_LEVEL, xpForLevel, respawnTime, ULT_LEVEL, S2_LEVEL, itemCost, laneProject, lanePoint,
} from '../shared/data.js';
import { botThink } from './bot.js';

export const DT = 1 / TICK_HZ;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const d2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
export const dist = (a, b) => Math.sqrt(d2(a, b));
export const inRectRaw = (x, z, R) => x >= R.x1 && x <= R.x2 && z >= R.z1 && z <= R.z2;

export function mapFree(M, x, z, r) {
  let ok = false;
  for (const w of M.walk) if (x >= w.x1 + r && x <= w.x2 - r && z >= w.z1 + r && z <= w.z2 - r) { ok = true; break; }
  if (!ok) return false;
  for (const w of M.walls) if (x > w.x1 - r && x < w.x2 + r && z > w.z1 - r && z < w.z2 + r) return false;
  return true;
}
export function bushAt(M, x, z) {
  for (let i = 0; i < M.bushes.length; i++) if (inRectRaw(x, z, M.bushes[i])) return i;
  return -1;
}
function segDist2(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const L = vx * vx + vz * vz;
  let t = L > 0 ? (wx * vx + wz * vz) / L : 0;
  t = clamp(t, 0, 1);
  const cx = ax + vx * t - px, cz = az + vz * t - pz;
  return cx * cx + cz * cz;
}
const r1 = (v) => Math.round(v * 10) / 10;

function initStatus(u) {
  u.slows = []; u.msBuffs = []; u.shields = []; u.hots = [];
  u.stunUntil = 0; u.rootUntil = 0; u.airUntil = 0; u.ccImmuneUntil = 0;
  u.invisUntil = 0; u.revealUntil = 0; u.markUntil = 0; u.shred = { n: 0, until: 0 };
  u.lastAttackAt = -99; u.lastCombatAt = -99; u.attackers = new Map();
  u.asBuffs = []; u.silenceUntil = 0;
  u.visible = [true, true, true];
}

export class Game {
  constructor(slots, opts = {}) {
    this.time = 0;
    this.nextId = 1;
    this.ents = new Map();
    this.events = [];
    this.pending = [];
    this.reveals = [];
    this.zones = [];
    this.score = [0, 0];
    this.over = null;
    this.waveN = 0;
    this.mode = MAPS[opts.mode] ? opts.mode : 'blitz';
    this.map = MAPS[this.mode];
    this.nextWave = this.map.wave.first;
    this.pits = this.map.pits.map((p) => ({ ...p, bossId: 0, next: p.type === 'switch' ? BOSS.apexcat.spawnAt : (p.spawnAt ?? BOSS[p.type].spawnAt) }));
    this.heroes = [];
    this.feed = [];
    this.opts = opts;
    for (const st of this.map.structures) this.spawnStructure(st);
    for (const s of slots) this.spawnHero(s);
    this.ev({ t: 'start' });
    this.otAnnounced = false;
  }

  ev(e) { this.events.push(e); }
  free(x, z, r) { return mapFree(this.map, x, z, r); }
  inFountain(u, team) { return inRectRaw(u.x, u.z, this.map.fountain[team]); }
  lane(key) { return this.map.laneData[key]; }
  // boss netral yang sedang hidup
  bosses() { const out = []; for (const p of this.pits) { const b = p.bossId && this.ents.get(p.bossId); if (b && !b.dead) out.push(b); } return out; }
  add(e) { e.id = this.nextId++; this.ents.set(e.id, e); return e; }
  at(delay, fn) { this.pending.push({ at: this.time + delay, fn }); }

  // ------------------------------------------------------------ spawn
  spawnStructure(st) {
    const S = STRUCT[st.type];
    const u = this.add({ kind: 'struct', type: st.type, team: st.team, x: st.x, z: st.z, r: S.r, hp: S.hp, maxHp: S.hp, atkCd: 2, target: 0, armor: S.armor, mres: S.mres, ramp: { id: 0, n: 0 } });
    initStatus(u);
    // tier 1 outer: aktif & bisa diserang. tier 2 inner: menembak, kebal sampai outer runtuh.
    // tier 3 penangkal petir: tidur & kebal sampai turret di depannya runtuh. base: sampai salah satu penangkal petir runtuh.
    u.lane = st.lane || null;
    u.tier = st.tier || 4;
    if (u.lane) u.laneS = laneProject(this.lane(u.lane), u.x, u.z).s;
    u.armed = u.tier <= 2;
    u.vuln = u.tier === 1;
  }

  spawnHero(s) {
    const H = HEROES[s.hero];
    const sp = this.map.spawn[s.team];
    const idx = this.heroes.filter((o) => o.team === s.team).length;
    const ang = idx * 1.2566 + (s.team ? Math.PI : 0);
    const h = this.add({
      kind: 'hero', hero: s.hero, H, name: s.name, team: s.team, pid: s.pid, bot: !!s.bot, skin: s.skin | 0,
      x: sp.x + (idx ? Math.cos(ang) * 2.2 : 0), z: sp.z + (idx ? Math.sin(ang) * 2.2 : 0), r: 0.55, f: s.team === 0 ? Math.PI / 2 : -Math.PI / 2,
      lvl: 1, xp: 0, gold: START_GOLD, items: [], dead: false, respawnAt: 0,
      cds: [0, 0, 0], atkCd: 0, kills: 0, deaths: 0, assists: 0,
      input: { mx: 0, mz: 0, atk: false }, casts: [], history: [], histT: 0,
      recallUntil: 0, nextAtkBonus: 0, aftershock: false, trafoCd: 0, meshShield: 0, meshNext: 0, harnessReady: 0,
      s1RecastUntil: 0, brain: { lane: this.map.botLanes[idx % this.map.botLanes.length] }, moving: false, goldEarned: 0,
    });
    initStatus(h);
    this.calcStats(h);
    h.hp = h.maxHp;
    this.heroes.push(h);
    return h;
  }

  spawnWave() {
    this.waveN++;
    const siege = this.waveN % WAVE.siegeEvery === 0;
    const list = this.map.wave.list;
    const scale = 1 + Math.min(1.4, this.time / 60 * 0.065);
    const startS = this.mode === 'blitz' ? 17 : 4;
    for (const [key, lane] of Object.entries(this.map.laneData)) {
      for (const team of [0, 1]) {
        const dir = team === 0 ? 1 : -1;
        // super wave: bila Penangkal Petir lawan di lane ini sudah runtuh, tiap gelombang membawa Mastiff
        let enemyLightningDown = true;
        for (const e of this.ents.values()) if (e.kind === 'struct' && e.team !== team && e.type === 'lightning' && e.lane === key && !e.dead) enemyLightningDown = false;
        const wave = siege || enemyLightningDown ? [...list, 'mastiff'] : list;
        const s0 = team === 0 ? startS : lane.len - startS;
        wave.forEach((type, i) => {
          const M = MINION[type];
          const back = type === 'cat' ? 0 : type === 'dog' ? 1.8 : 3.2;
          const off = ((i % 3) - 1) * 1.4;
          const p = lanePoint(lane, s0 - dir * back);
          const u = this.add({
            kind: 'minion', type, team, x: p.x - p.dz * off, z: p.z + p.dx * off, r: M.r, lane: key,
            hp: Math.round(M.hp * scale), maxHp: Math.round(M.hp * scale), dmg: M.dmg * scale, armor: M.armor, mres: M.mres,
            atkCd: 0.3 + Math.random() * 0.4, target: 0, laneOff: off, f: Math.atan2(p.dx * dir, p.dz * dir),
          });
          initStatus(u);
        });
      }
    }
  }

  // ikuti lane dengan titik lookahead (belokan lane jadi mulus)
  followLane(u, ms, laneKey) {
    const lane = this.lane(laneKey);
    const dir = u.team === 0 ? 1 : -1;
    const pr = laneProject(lane, u.x, u.z);
    const p = lanePoint(lane, pr.s + dir * 5);
    const off = u.laneOff || 0;
    this.moveToward(u, p.x - p.dz * off, p.z + p.dx * off, ms);
  }

  spawnBoss(pit) {
    const type = pit.type === 'switch' ? (this.time >= BOSS.cerberus.spawnAt ? 'cerberus' : 'apexcat') : pit.type;
    const B = BOSS[type];
    const scale = 1 + this.time / 60 * 0.05;
    const u = this.add({ kind: 'boss', type, team: 2, x: pit.x, z: pit.z, r: B.r, hp: Math.round(B.hp * scale), maxHp: Math.round(B.hp * scale), dmg: B.dmg * scale, armor: B.armor, mres: B.mres, atkCd: 0, target: 0, abilityCd: 5, f: 0, home: { x: pit.x, z: pit.z }, pit });
    initStatus(u);
    pit.bossId = u.id;
    const where = this.mode === 'blitz' ? 'Stockyard' : type === 'apexcat' ? 'Turtle Pit' : 'Lord Pit';
    this.ev({ t: 'boss', k: type, msg: `${B.name} muncul di ${where}!` });
  }

  spawnAllyCerberus(team, pit) {
    const B = BOSS.cerberus;
    // dorong lane terdekat dari pit
    let lane = 'mid', bd = Infinity;
    for (const [k, L] of Object.entries(this.map.laneData)) { const d = laneProject(L, pit.x, pit.z).d; if (d < bd) { bd = d; lane = k; } }
    const u = this.add({ kind: 'boss', type: 'cerberus', ally: true, team, x: pit.x, z: pit.z, r: 1.8, hp: 6500, maxHp: 6500, dmg: 210, armor: B.armor, mres: B.mres, atkCd: 0, target: 0, abilityCd: 6, f: 0, expire: this.time + 75, wp: 0, lane, laneOff: 0 });
    initStatus(u);
  }

  // ------------------------------------------------------------ stats
  calcStats(h) {
    const b = h.H.base, L = h.lvl - 1;
    const it = { atk: 0, mp: 0, hp: 0, armor: 0, mres: 0, ms: 0, crit: 0, pen: 0, mpen: 0, cdr: 0, as: 0 };
    for (const id of h.items) { const s = ITEMS[id].stats; for (const k in s) it[k] += s[k]; }
    h.istats = it;
    const oldMax = h.maxHp || 0;
    h.maxHp = Math.round(b.hp + b.hpGrow * L + it.hp);
    if (oldMax && h.maxHp > oldMax && !h.dead) h.hp += h.maxHp - oldMax;
    h.hp = Math.min(h.hp ?? h.maxHp, h.maxHp);
    h.has = new Set(h.items);
  }

  // stat dinamis (dipanggil tiap tick)
  dyn(h) {
    const b = h.H.base, L = h.lvl - 1, it = h.istats, now = this.time;
    let armor = b.armor + b.armorGrow * L + it.armor;
    let mres = b.mres + b.mresGrow * L + it.mres;
    if (h.hero === 'structural') {
      let n = 0;
      for (const o of this.heroes) if (o.team !== h.team && !o.dead && d2(o, h) < 36) n++;
      armor += 7 * Math.min(3, n); mres += 7 * Math.min(3, n);
    }
    const P = h.H.passive || {};
    if (P.type === 'flatDef') { armor += P.v; mres += P.v; }
    let ms = b.ms + it.ms;
    let msPct = 0;
    for (const m of h.msBuffs) if (m.until > now) msPct += m.pct;
    if (h.has.has('boots') && now - h.lastCombatAt > 4) msPct += 0.1;
    let slow = 0;
    for (const s of h.slows) if (s.until > now) slow = Math.max(slow, s.pct);
    ms = ms * (1 + msPct) * (1 - slow);
    h.cur = {
      atk: b.atk + b.atkGrow * L + it.atk,
      mp: b.mp + it.mp + L * 6,
      armor, mres, ms,
      crit: Math.min(0.85, it.crit + (h.critStackUntil > now ? 0.06 * (h.critStacks || 0) : 0)), pen: it.pen, mpen: it.mpen, cdr: Math.min(0.4, it.cdr),
      as: b.as * (1 + it.as + L * 0.02 + h.asBuffs.reduce((a, x) => a + (x.until > now ? x.pct : 0), 0)),
      range: b.range,
    };
    return h.cur;
  }

  defOf(u, type) {
    let def;
    if (u.kind === 'hero') def = type === 'phys' ? u.cur.armor : u.cur.mres;
    else def = type === 'phys' ? u.armor : u.mres;
    if (u.shred.until > this.time) def -= u.shred.n * 8;
    if (u.markUntil > this.time) def *= 0.7;
    return def;
  }

  // ------------------------------------------------------------ combat core
  canTarget(src, t) {
    if (!t || t.dead || t.hp <= 0 || t.team === src.team) return false;
    if (t.kind === 'proj') return false;
    if (t.untargetable && t.untargetable > this.time) return false;
    if (src.team !== 2 && !t.visible[src.team]) return false;
    return true;
  }

  damage(src, t, amount, type, o = {}) {
    if (!t || t.hp <= 0 || t.dead) return 0;
    const now = this.time;
    if (t.kind === 'struct' && !t.vuln) { if (src.kind === 'hero') this.ev({ t: 'immune', id: t.id }); return 0; }
    if (t.untargetable && t.untargetable > now) return 0;
    let amt = amount;
    if (type !== 'true') {
      let def = this.defOf(t, type);
      if (src.kind === 'hero') def *= 1 - (type === 'phys' ? src.cur.pen : src.cur.mpen);
      amt *= def >= 0 ? 100 / (100 + def) : 2 - 100 / (100 - def);
    }
    if (o.skill && src.kind === 'hero' && src.has.has('lidar') && t.hp > t.maxHp * 0.7) amt *= 1.2;
    if (o.crit && t.kind === 'hero' && t.has.has('kevlar')) amt *= 0.85;
    if (t.kind === 'struct') {
      if (src.kind === 'hero') {
        // backdoor protection: tanpa minion kawan di dekat struktur, damage hero -50%
        let support = false;
        for (const e of this.ents.values()) if ((e.kind === 'minion' || (e.kind === 'boss' && e.ally)) && e.team === src.team && d2(e, t) < 144) { support = true; break; }
        if (!support) amt *= 0.5;
      }
      if (src.siege || (src.kind === 'minion' && src.type === 'mastiff') || (src.kind === 'boss' && src.ally)) amt *= 2;
    }
    if (t.kind === 'struct' && now > this.map.overtime) amt *= 1 + (now - this.map.overtime) / 240; // overtime: struktur makin rapuh
    if (src.kind === 'struct' && t.kind === 'minion') amt *= 0.5;
    if (src.kind === 'minion') for (const o of this.heroes) if (o.team === src.team && !o.dead && o.H.passive && o.H.passive.type === 'minionAura' && d2(o, src) < 64) { amt *= 1.3; break; } // turret mengikis minion pelan, beri waktu push
    // shield
    let shieldMult = 1;
    if (src.kind === 'hero') {
      if (src.hero === 'drafter' && o.basic) shieldMult = 2;
      if (src.has.has('drill')) shieldMult = Math.max(shieldMult, 1.5);
    }
    if (type === 'magic' && t.meshShield > 0) {
      const take = Math.min(t.meshShield, amt);
      t.meshShield -= take; amt -= take;
    }
    for (const s of t.shields) {
      if (amt <= 0) break;
      if (s.until <= now || s.amt <= 0) continue;
      const cap = amt * shieldMult;
      const take = Math.min(s.amt, cap);
      s.amt -= take; amt -= take / shieldMult;
    }
    amt = Math.max(0, amt);
    t.hp -= amt;
    if (src.kind === 'hero' || t.kind === 'hero') {
      src.lastCombatAt = now; t.lastCombatAt = now;
      if (amt >= 1) this.ev({ t: 'dmg', id: t.id, v: Math.round(amt), k: type, c: o.crit ? 1 : 0, s: src.kind === 'hero' ? src.id : 0 });
    }
    if (src.kind === 'hero') {
      t.attackers.set(src.id, now);
      if (t.kind === 'hero') src.aggroHeroAt = now;
      if (t.kind === 'hero' && t.recallUntil) { t.recallUntil = 0; }
      // 3-Phase Transformer
      if (o.skill && src.has.has('trafo') && src.trafoCd < now) {
        src.trafoCd = now + 1.5;
        const pts = [{ x: t.x, z: t.z }];
        let n = 0;
        for (const e of this.ents.values()) {
          if (n >= 2) break;
          if (e === t || !this.canTarget(src, e) || e.kind === 'struct' || d2(e, t) > 25) continue;
          pts.push({ x: e.x, z: e.z }); n++;
          this.at(0.05 * n, () => this.damage(src, e, 60 + 5 * src.lvl + 0.3 * src.cur.mp, 'magic'));
        }
        if (n) this.ev({ t: 'chain', pts: pts.map((p) => [r1(p.x), r1(p.z)]), c: '#7fd0ff' });
      }
    }
    if (t.kind === 'boss' && !t.ally) { t.lastHitBy = src; t.lastAggroAt = now; if (!t.target || Math.random() < 0.15) t.target = src.id; }
    if (t.hp <= 0) this.kill(t, src);
    return amt;
  }

  heal(src, t, amt) {
    if (!t || t.dead || t.hp <= 0) return;
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + amt);
    if (t.hp - before >= 5 && amt > 30) this.ev({ t: 'heal', id: t.id, v: Math.round(t.hp - before) });
  }

  shield(t, amt, dur) { t.shields.push({ amt, until: this.time + dur }); }

  cc(t, kind, dur, src) {
    if (!t || t.dead || t.hp <= 0) return;
    if (t.kind === 'struct' || t.kind === 'boss') return;
    if (t.ccImmuneUntil > this.time) return;
    const until = this.time + dur;
    if (kind === 'stun') t.stunUntil = Math.max(t.stunUntil, until);
    else if (kind === 'air') { t.stunUntil = Math.max(t.stunUntil, until); t.airUntil = Math.max(t.airUntil, until); }
    else if (kind === 'root') t.rootUntil = Math.max(t.rootUntil, until);
    if (t.recallUntil) t.recallUntil = 0;
  }
  slow(t, pct, dur) { if (t.kind === 'struct') return; if (t.ccImmuneUntil > this.time && t.kind === 'hero') return; t.slows.push({ pct, until: this.time + dur }); }

  kill(t, src) {
    const now = this.time;
    if (t.kind === 'hero') {
      if (t.has.has('harness') && t.harnessReady <= now) {
        t.harnessReady = now + 150;
        t.hp = 1; t.untargetable = now + 2;
        this.ev({ t: 'fx', k: 'harness', x: r1(t.x), z: r1(t.z) });
        this.at(2, () => { if (!t.dead) { t.hp = t.maxHp * 0.3; this.shield(t, 300 + 20 * t.lvl, 3); } });
        return;
      }
      t.dead = true; t.hp = 0; t.deaths++;
      t.respawnAt = now + respawnTime(t.lvl);
      t.recallUntil = 0; t.input.atk = false;
      this.ev({ t: 'die', id: t.id, x: r1(t.x), z: r1(t.z), k: 'hero' });
      const killer = src.kind === 'hero' ? src : this.lastHeroAttacker(t);
      if (killer) {
        killer.kills++;
        this.score[killer.team]++;
        this.giveGold(killer, (230 + 15 * t.lvl));
        this.giveXp(killer, 110 + 25 * t.lvl);
        this.autocadRefresh(killer);
      } else if (src.team !== 2) this.score[src.team]++;
      const assists = [];
      for (const [hid, tm] of t.attackers) {
        const a = this.ents.get(hid);
        if (!a || a === killer || a.kind !== 'hero' || a.team === t.team || now - tm > 10) continue;
        a.assists++; assists.push(a.name);
        this.giveGold(a, 90); this.giveXp(a, 60 + 10 * t.lvl); this.autocadRefresh(a);
      }
      // HSE & support nearby juga dapat assist
      t.attackers.clear();
      this.ev({ t: 'kill', k: killer ? killer.name : (src.kind === 'struct' ? 'Turret' : src.kind === 'boss' ? 'Boss' : 'Minion'), kh: killer ? killer.hero : '', kt: killer ? killer.team : src.team, v: t.name, vh: t.hero, vt: t.team });
      return;
    }
    t.hp = 0;
    t.dead = true;
    this.ev({ t: 'die', id: t.id, x: r1(t.x), z: r1(t.z), k: t.kind, s: t.type || '' });
    if (t.kind === 'minion') {
      const M = MINION[t.type];
      const hk = src.kind === 'hero' ? src : null;
      if (hk) this.giveGold(hk, M.gold);
      for (const h of this.heroes) if (!h.dead && h.team !== t.team && d2(h, t) < 121) {
        this.giveXp(h, M.xp);
        if (h !== hk) this.giveGold(h, Math.round(M.gold * 0.25), true);
      }
    } else if (t.kind === 'struct') {
      const enemy = 1 - t.team;
      for (const h of this.heroes) if (h.team === enemy) { this.giveGold(h, 130, true); this.giveXp(h, 60); }
      const label = STRUCT[t.type].name + (t.lane && this.mode !== 'blitz' ? ` (${t.lane.toUpperCase()})` : '');
      this.ev({ t: 'struct', team: t.team, k: t.type, lane: t.lane, msg: `${label} tim ${t.team === 0 ? 'BIRU' : 'MERAH'} hancur!` });
      if (t.type !== 'base') this.structDown(t);
      else {
        this.over = { winner: enemy, time: now };
        this.ev({ t: 'over', winner: enemy });
      }
    } else if (t.kind === 'boss' && !t.ally) {
      const B = BOSS[t.type];
      const team = src.team === 2 ? null : src.team;
      if (team !== null) {
        for (const h of this.heroes) if (h.team === team) {
          this.giveGold(h, B.gold, true); this.giveXp(h, B.xp);
          if (t.type === 'apexcat' && !h.dead) this.shield(h, 450 + 30 * h.lvl, 60);
        }
        if (t.type === 'cerberus') this.spawnAllyCerberus(team, t.pit || t);
        this.ev({ t: 'bosskill', k: t.type, team, msg: t.type === 'apexcat' ? `Tim ${team === 0 ? 'BIRU' : 'MERAH'} melumpuhkan Rust Dozer — Shield Debu Beton aktif!` : `Tim ${team === 0 ? 'BIRU' : 'MERAH'} membajak Iron Claw Excavator — ia ikut push lane!` });
      }
      if (t.pit) { t.pit.bossId = 0; t.pit.next = now + (t.pit.respawn ?? B.respawn); }
    }
  }

  // buka struktur berikutnya di lane yang sama; penangkal petir runtuh -> base terbuka
  structDown(t) {
    const arm = (e) => {
      const wasArmed = e.armed;
      e.armed = true; e.vuln = true;
      if (!wasArmed) this.ev({ t: 'arm', id: e.id, k: e.type, x: e.x, z: e.z });
    };
    if (t.tier === 3) {
      for (const e of this.ents.values()) if (e.kind === 'struct' && e.team === t.team && e.type === 'base' && !e.dead) arm(e);
      return;
    }
    let next = null;
    for (const e of this.ents.values()) {
      if (e.kind !== 'struct' || e.team !== t.team || e.lane !== t.lane || e.dead || e.tier <= t.tier) continue;
      if (!next || e.tier < next.tier) next = e;
    }
    if (next) arm(next);
  }

  lastHeroAttacker(t) {
    let best = null, bt = -1;
    for (const [hid, tm] of t.attackers) { if (this.time - tm < 10 && tm > bt) { const a = this.ents.get(hid); if (a && a.team !== t.team) { best = a; bt = tm; } } }
    return best;
  }

  autocadRefresh(h) { if (h.has.has('autocad')) for (let i = 0; i < 3; i++) h.cds[i] *= 0.8; }

  giveGold(h, g, shared = false) {
    let v = g;
    if (h.hero === 'qs' && !shared) v *= 1.3;
    h.gold += v; h.goldEarned += v;
    if (!shared && v >= 20) this.ev({ t: 'gold', id: h.id, v: Math.round(v) });
  }

  giveXp(h, xp) {
    if (h.lvl >= MAX_LEVEL) return;
    h.xp += xp;
    while (h.lvl < MAX_LEVEL && h.xp >= xpForLevel(h.lvl)) {
      h.xp -= xpForLevel(h.lvl);
      h.lvl++;
      this.calcStats(h);
      this.ev({ t: 'lvl', id: h.id, v: h.lvl });
    }
  }

  // ------------------------------------------------------------ movement
  tryMove(u, dx, dz) {
    if (dx === 0 && dz === 0) return false;
    const nx = u.x + dx, nz = u.z + dz;
    if (this.free(nx, nz, u.r)) { u.x = nx; u.z = nz; return true; }
    if (dx !== 0 && this.free(nx, u.z, u.r)) { u.x = nx; return true; }
    if (dz !== 0 && this.free(u.x, nz, u.r)) { u.z = nz; return true; }
    return false;
  }

  moveToward(u, tx, tz, speed, stopAt = 0) {
    let dx = tx - u.x, dz = tz - u.z;
    const L = Math.hypot(dx, dz);
    if (L <= stopAt + 0.01) return true;
    const step = Math.min(speed * DT, L - stopAt);
    dx /= L; dz /= L;
    // jalur lewat gerbang jungle bila menyeberang lane <-> stockyard
    u.f = Math.atan2(dx, dz);
    const moved = this.tryMove(u, dx * step, dz * step);
    if (!moved) {
      // coba geser menyamping
      const sx = -dz, sz = dx;
      const sign = (u.id % 2) ? 1 : -1;
      this.tryMove(u, sx * step * sign, sz * step * sign);
    }
    u.moving = true;
    return false;
  }

  // dash: maju bertahap sampai terhalang
  dash(u, dx, dz, len, onStep) {
    const steps = Math.ceil(len / 0.35);
    const sx = dx * len / steps, sz = dz * len / steps;
    const x0 = u.x, z0 = u.z;
    for (let i = 0; i < steps; i++) {
      if (!this.free(u.x + sx, u.z + sz, u.r)) break;
      u.x += sx; u.z += sz;
      if (onStep) onStep();
    }
    u.f = Math.atan2(dx, dz);
    this.ev({ t: 'fx', k: 'dash', x: r1(x0), z: r1(z0), x2: r1(u.x), z2: r1(u.z), c: u.H ? u.H.accent : '#fff' });
  }

  pushOutStructures(u) {
    for (const e of this.ents.values()) {
      if ((e.kind !== 'struct' && !(e.kind === 'boss')) || e === u || e.dead) continue;
      const rr = e.r + u.r;
      const dx = u.x - e.x, dz = u.z - e.z;
      const L2 = dx * dx + dz * dz;
      if (L2 < rr * rr) {
        let L = Math.sqrt(L2);
        let nx, nz;
        if (L < 0.01) { nx = 0; nz = (u.id % 2) ? 1 : -1; L = 0; } else { nx = dx / L; nz = dz / L; }
        // dorong keluar + sedikit tangensial supaya tidak macet di depan turret
        const push = rr - L;
        const tx = -nz * ((u.laneOff ?? (u.id % 2 ? 1 : -1)) >= 0 ? 1 : -1) * 0.25;
        const tz = nx * ((u.laneOff ?? (u.id % 2 ? 1 : -1)) >= 0 ? 1 : -1) * 0.25;
        const nxp = u.x + nx * push + tx * push, nzp = u.z + nz * push + tz * push;
        if (this.free(nxp, nzp, u.r)) { u.x = nxp; u.z = nzp; }
        else if (this.free(u.x + nx * push, u.z + nz * push, u.r)) { u.x += nx * push; u.z += nz * push; }
      }
    }
  }

  separate(list) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const rr = (a.r + b.r) * 0.9;
        const dx = b.x - a.x, dz = b.z - a.z;
        const L2 = dx * dx + dz * dz;
        if (L2 < rr * rr && L2 > 1e-6) {
          const L = Math.sqrt(L2);
          const p = (rr - L) * 0.5;
          const nx = dx / L, nz = dz / L;
          if (this.free(a.x - nx * p, a.z - nz * p, a.r)) { a.x -= nx * p; a.z -= nz * p; }
          if (this.free(b.x + nx * p, b.z + nz * p, b.r)) { b.x += nx * p; b.z += nz * p; }
        }
      }
    }
  }

  // ------------------------------------------------------------ projectiles
  proj(src, opts) {
    const p = this.add({ kind: 'proj', team: src.team, src, x: opts.x ?? src.x, z: opts.z ?? src.z, r: 0.2, speed: opts.speed || 26, style: opts.style || 'ball', f: 0, ...opts });
    p.dead = false;
    p.visible = [true, true, true];
    if (opts.dir) { p.dx = opts.dir[0]; p.dz = opts.dir[1]; p.travel = 0; p.f = Math.atan2(p.dx, p.dz); p.hit = new Set(); }
    return p;
  }

  updateProj(p) {
    if (p.tgt) {
      const t = this.ents.get(p.tgt);
      if (!t || t.dead || t.hp <= 0) { p.dead = true; return; }
      const dx = t.x - p.x, dz = t.z - p.z;
      const L = Math.hypot(dx, dz);
      const step = p.speed * DT;
      p.f = Math.atan2(dx, dz);
      if (L <= step + t.r * 0.5) { p.dead = true; p.onHit(t); return; }
      p.x += dx / L * step; p.z += dz / L * step;
    } else {
      const step = p.speed * DT;
      p.x += p.dx * step; p.z += p.dz * step; p.travel += step;
      if (p.travel >= p.range) { p.dead = true; return; }
      for (const e of this.ents.values()) {
        if (e.kind === 'proj' || e.kind === 'struct' || p.hit.has(e.id) || !this.canTarget(p.src, e)) continue;
        const rr = e.r + (p.width || 0.5);
        if (d2(e, p) < rr * rr) {
          p.hit.add(e.id);
          p.onHit(e);
          if (!p.pierce) { p.dead = true; return; }
        }
      }
    }
  }

  // ------------------------------------------------------------ input from clients
  setInput(h, msg) {
    if (!h) return;
    if (msg.t === 'in') {
      let mx = +msg.mx || 0, mz = +msg.mz || 0;
      const L = Math.hypot(mx, mz);
      if (L > 1) { mx /= L; mz /= L; }
      h.input.mx = mx; h.input.mz = mz; h.input.atk = !!msg.atk;
      if (msg.tg !== undefined) h.input.tg = msg.tg | 0;
    } else if (msg.t === 'cast') {
      const slot = msg.slot | 0;
      if (slot >= 0 && slot <= 2 && h.casts.length < 3) h.casts.push({ slot, x: +msg.x || h.x, z: +msg.z || h.z });
    } else if (msg.t === 'buy') this.buy(h, msg.item);
    else if (msg.t === 'sell') this.sell(h, msg.slot | 0);
    else if (msg.t === 'recall') { if (!h.dead && !h.recallUntil) { h.recallUntil = this.time + 5; this.ev({ t: 'fx', k: 'recall', id: h.id }); } }
  }

  buy(h, id) {
    const it = ITEMS[id];
    if (!it) return false;
    const { cost, used } = itemCost(id, h.items, h.hero === 'qs' ? 0.1 : 0);
    if (h.gold < cost) return false;
    const after = h.items.slice();
    for (const c of used) after.splice(after.indexOf(c), 1);
    if (after.length >= 6) return false;
    h.gold -= cost;
    after.push(id);
    h.items = after;
    this.calcStats(h);
    if (h.pid) this.ev({ t: 'buy', id: h.id, item: id });
    return true;
  }

  sell(h, slot) {
    const id = h.items[slot];
    if (!id) return;
    h.items.splice(slot, 1);
    h.gold += Math.round(ITEMS[id].cost * 0.6);
    this.calcStats(h);
  }

  // ------------------------------------------------------------ hero tick
  tickHero(h) {
    const now = this.time;
    if (h.dead) {
      if (now >= h.respawnAt) {
        const sp = this.map.spawn[h.team];
        h.dead = false; h.x = sp.x; h.z = sp.z; h.hp = h.maxHp;
        h.slows = []; h.shields = []; h.stunUntil = h.rootUntil = h.airUntil = 0;
        this.ev({ t: 'respawn', id: h.id });
      } else return;
    }
    const c = this.dyn(h);
    if (h.bot) botThink(this, h);
    // passive gold
    h.gold += PASSIVE_GOLD * DT;
    // fountain
    if (this.inFountain(h, h.team)) { h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.12 * DT); }
    if (this.inFountain(h, 1 - h.team)) this.damage({ kind: 'fountain', team: 1 - h.team, siege: false }, h, h.maxHp * 0.25 * DT, 'true');
    if (h.dead) return;
    // regen dasar + HoT
    h.hp = Math.min(h.maxHp, h.hp + (2 + h.lvl * 0.4) * DT);
    for (const ho of h.hots) if (ho.until > now) h.hp = Math.min(h.maxHp, h.hp + ho.rate * DT);
    // pasif aura hero tambahan
    const PP = h.H.passive;
    if (PP && PP.type === 'auraSlow') for (const e of this.heroes) if (e.team !== h.team && !e.dead && d2(e, h) < PP.r * PP.r) this.slow(e, PP.v, 0.15);
    if (PP && PP.type === 'pulseHeal' && now >= (h.pulseNext || PP.every)) {
      h.pulseNext = now + PP.every;
      this.ev({ t: 'fx', k: 'gen', shape: 'buff', id: h.id, x: r1(h.x), z: r1(h.z), r: PP.r, c: '#7cff9a', text: 'SUPPLY' });
      for (const a of this.heroes) if (a.team === h.team && !a.dead && d2(a, h) < PP.r * PP.r) this.heal(h, a, PP.v[0] + PP.v[1] * h.lvl);
    }
    // HSE passive
    if (h.hero === 'hse') for (const a of this.heroes) if (a.team === h.team && !a.dead && d2(a, h) < 49) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.01 * DT);
    // copper mesh
    if (h.has.has('mesh') && now >= h.meshNext) { h.meshShield = 300 + h.lvl * 15; h.meshNext = now + 15; }
    // cooldowns
    for (let i = 0; i < 3; i++) if (h.cds[i] > 0) h.cds[i] = Math.max(0, h.cds[i] - DT);
    if (h.atkCd > 0) h.atkCd -= DT;
    if (h.s1RecastUntil && now > h.s1RecastUntil) { h.s1RecastUntil = 0; h.cds[0] = Math.max(h.cds[0], this.skillCd(h, 0) - 3); }
    // history for CTRL+Z
    h.histT += DT;
    if (h.histT >= 0.2) { h.histT = 0; h.history.push({ x: h.x, z: h.z, hp: h.hp, t: now }); if (h.history.length > 20) h.history.shift(); }

    const stunned = h.stunUntil > now;
    const rooted = h.rootUntil > now;
    h.moving = false;
    // recall
    if (h.recallUntil) {
      if (h.input.mx || h.input.mz || h.input.atk || h.casts.length || stunned) { h.recallUntil = 0; this.ev({ t: 'fx', k: 'recallx', id: h.id }); }
      else if (now >= h.recallUntil) {
        h.recallUntil = 0; const sp = this.map.spawn[h.team]; h.x = sp.x; h.z = sp.z;
        this.ev({ t: 'fx', k: 'recalled', id: h.id });
      }
    }
    // casts
    while (h.casts.length) {
      const cst = h.casts.shift();
      if (!stunned) this.cast(h, cst.slot, cst.x, cst.z);
    }
    if (stunned) { h.casts.length = 0; return; }
    // move
    const { mx, mz } = h.input;
    if ((mx || mz) && !rooted) {
      const sp = c.ms * DT;
      this.tryMove(h, mx * sp, mz * sp);
      h.f = Math.atan2(mx, mz);
      h.moving = true;
    }
    // attack
    if (h.input.atk) {
      const range = c.range;
      let t = null;
      if (h.input.tg) { const tt = this.ents.get(h.input.tg); if (this.canTarget(h, tt) && dist(h, tt) <= range + tt.r + 3) t = tt; }
      if (!t) t = this.pickAttackTarget(h, range + 0.4);
      if (!t && !(mx || mz)) {
        const far = this.pickAttackTarget(h, range + 4);
        if (far && !rooted) this.moveToward(h, far.x, far.z, c.ms, range + far.r - 0.1);
      } else if (t) {
        const dd = dist(h, t);
        if (dd > range + t.r + 0.4) { if (!(mx || mz) && !rooted) this.moveToward(h, t.x, t.z, c.ms, range + t.r - 0.1); }
        else if (h.atkCd <= 0) this.basicAttack(h, t);
      }
    }
  }

  pickAttackTarget(h, range) {
    let best = null, bs = Infinity;
    for (const e of this.ents.values()) {
      if (e.kind === 'proj' || !this.canTarget(h, e)) continue;
      const dd = dist(h, e) - e.r;
      if (dd > range) continue;
      // prioritas: hero (HP terendah) > minion/boss > struktur
      let s;
      if (e.kind === 'hero') s = e.hp / e.maxHp;
      else if (e.kind === 'struct') s = 300 + dd;
      else s = 10 + dd + e.hp / 2000;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  basicAttack(h, t) {
    const c = h.cur;
    h.atkCd = 1 / c.as;
    h.lastAttackAt = this.time;
    h.f = Math.atan2(t.x - h.x, t.z - h.z);
    if (h.invisUntil > this.time) h.invisUntil = this.time; // menyerang membatalkan Layer Freeze
    let dmg = c.atk;
    const crit = Math.random() < c.crit;
    if (crit) { dmg *= 1.75; if (h.has.has('iwf')) h.msBuffs.push({ pct: 0.15, until: this.time + 1.5 }); }
    if (h.nextAtkBonus) { dmg *= 1 + h.nextAtkBonus; h.nextAtkBonus = 0; }
    if (h.hero === 'surveyor' && dist(h, t) > 6) dmg *= 1.15;
    const extraTrue = h.aftershock ? c.atk * 0.4 : 0;
    h.aftershock = false;
    const P = h.H.passive || {};
    const hit = (tt) => {
      this.damage(h, tt, dmg, 'phys', { basic: true, crit });
      if (P.type) this.passiveOnHit(h, tt, P);
      if (extraTrue) this.damage(h, tt, extraTrue, 'true');
      if (h.hero === 'surveyor') tt.revealUntil = Math.max(tt.revealUntil, this.time + 2);
    };
    this.ev({ t: 'atk', id: h.id, tg: t.id });
    if (h.H.melee) hit(t);
    else this.proj(h, { tgt: t.id, speed: 30, style: 'atk-' + h.hero, onHit: hit });
  }

  skillCd(h, slot) { return h.H.skills[slot].cd * (1 - (h.cur ? h.cur.cdr : 0)); }

  aimDir(h, x, z) {
    let dx = x - h.x, dz = z - h.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.05) return [Math.sin(h.f), Math.cos(h.f), 0];
    return [dx / L, dz / L, L];
  }

  enemiesIn(h, x, z, r, cb, incStruct = false) {
    const r2 = r * r;
    for (const e of [...this.ents.values()]) {
      if (e.kind === 'proj' || (!incStruct && e.kind === 'struct')) continue;
      if (!this.canTarget(h, e)) continue;
      const dx = e.x - x, dz = e.z - z, rr = r + e.r * 0.6;
      if (dx * dx + dz * dz <= rr * rr) cb(e);
    }
    void r2;
  }
  enemiesInLine(h, ax, az, bx, bz, w, cb) {
    for (const e of [...this.ents.values()]) {
      if (e.kind === 'proj' || e.kind === 'struct' || !this.canTarget(h, e)) continue;
      const ww = w + e.r * 0.6;
      if (segDist2(e.x, e.z, ax, az, bx, bz) <= ww * ww) cb(e);
    }
  }

  cast(h, slot, x, z) {
    const now = this.time;
    const S = h.H.skills[slot];
    if (h.lvl < (slot === 2 ? ULT_LEVEL : slot === 1 ? S2_LEVEL : 1)) return;
    if (h.silenceUntil > now) { this.ev({ t: 'fx', k: 'silenced', id: h.id }); return; }
    const recast = slot === 0 && h.hero === 'drafter' && h.s1RecastUntil > now;
    if (h.cds[slot] > 0) return;
    const c = h.cur, L = h.lvl;
    let [dx, dz, len] = this.aimDir(h, x, z);
    h.f = Math.atan2(dx, dz);
    h.lastAttackAt = now; // membuka posisi di semak sebentar
    if (h.invisUntil > now && !(h.hero === 'drafter' && slot === 1)) h.invisUntil = now;
    if (h.recallUntil) h.recallUntil = 0;
    let cd = this.skillCd(h, slot);
    const fx = (k, extra = {}) => this.ev({ t: 'fx', k, id: h.id, x: r1(h.x), z: r1(h.z), dx: r1(dx * 100) / 100, dz: r1(dz * 100) / 100, ...extra });
    const sk = { skill: true };
    const pt = (range) => { const d = Math.min(len, range); return { px: h.x + dx * d, pz: h.z + dz * d }; };
    this.ev({ t: 'cast', id: h.id, hero: h.hero, slot });

    if (h.H.gen) {
      const res = this.castGeneric(h, slot, dx, dz, len);
      if (res === false) return;
      if (typeof res === 'number') cd = res;
    }
    switch (h.hero) {
      // ---------------------------------------------------- STRUCTURAL
      case 'structural': {
        if (slot === 0) {
          fx('shear', { r: 5 });
          this.enemiesIn(h, h.x, h.z, 5, (e) => {
            const ex = e.x - h.x, ez = e.z - h.z, el = Math.hypot(ex, ez) || 1;
            if ((ex * dx + ez * dz) / el < 0.45) return;
            this.damage(h, e, 140 + 18 * L + 0.85 * c.atk, 'phys', sk);
            this.slow(e, 0.4, 1.5);
          });
        } else if (slot === 1) {
          const { px, pz } = pt(S.range);
          this.ev({ t: 'fx', k: 'pillar-warn', x: r1(px), z: r1(pz), r: S.aoe });
          this.at(0.5, () => {
            this.ev({ t: 'fx', k: 'pillar', x: r1(px), z: r1(pz), r: S.aoe });
            this.enemiesIn(h, px, pz, S.aoe, (e) => { this.damage(h, e, 120 + 16 * L + 0.6 * c.atk, 'phys', sk); this.cc(e, 'root', 1.25, h); });
          });
        } else {
          fx('quake', { r: 6 });
          this.enemiesIn(h, h.x, h.z, 6, (e) => {
            this.damage(h, e, 200 + 26 * L + 1.0 * c.atk, 'phys', sk);
            this.cc(e, 'air', 1, h);
            if (d2(e, h) < 6.25) this.damage(h, e, 150 + 12 * L, 'true', sk);
          });
        }
        break;
      }
      // ---------------------------------------------------- HSE
      case 'hse': {
        if (slot === 0) {
          const { px, pz } = pt(S.range);
          this.ev({ t: 'fx', k: 'lob', x: r1(h.x), z: r1(h.z), x2: r1(px), z2: r1(pz), c: '#ffffff' });
          this.at(0.35, () => {
            this.ev({ t: 'fx', k: 'healzone', x: r1(px), z: r1(pz), r: S.aoe });
            for (const a of this.heroes) if (a.team === h.team && !a.dead && (a.x - px) ** 2 + (a.z - pz) ** 2 <= (S.aoe + 0.5) ** 2) {
              this.heal(h, a, 150 + 22 * L + 1.3 * c.mp);
              a.slows = [];
            }
          });
        } else if (slot === 1) {
          fx('stop', { r: S.range });
          this.enemiesInLine(h, h.x, h.z, h.x + dx * S.range, h.z + dz * S.range, S.width / 2, (e) => {
            this.damage(h, e, 110 + 16 * L + 0.8 * c.mp, 'magic', sk);
            this.cc(e, 'stun', 0.9, h);
          });
        } else {
          fx('ppe', { r: S.aoe });
          for (const a of this.heroes) if (a.team === h.team && !a.dead && d2(a, h) <= S.aoe * S.aoe) {
            this.shield(a, 260 + 32 * L + 1.5 * c.mp, 4);
            a.ccImmuneUntil = now + 3; a.stunUntil = 0; a.rootUntil = 0; a.airUntil = 0; a.slows = [];
            a.hots.push({ rate: (210 + 25 * L) / 3, until: now + 3 });
            this.ev({ t: 'fx', k: 'ppe-on', id: a.id });
          }
        }
        break;
      }
      // ---------------------------------------------------- DRAFTER
      case 'drafter': {
        if (slot === 0) {
          const hitSet = new Set();
          this.dash(h, dx, dz, S.range, () => {
            this.enemiesIn(h, h.x, h.z, 1.4, (e) => {
              if (hitSet.has(e.id)) return;
              hitSet.add(e.id);
              this.damage(h, e, 100 + 15 * L + 0.75 * c.atk, 'phys', sk);
            });
          });
          if (recast) { h.s1RecastUntil = 0; } else { h.s1RecastUntil = now + 3; cd = 0.35; }
        } else if (slot === 1) {
          h.invisUntil = now + 2.5;
          h.msBuffs.push({ pct: 0.3, until: now + 2.5 });
          h.nextAtkBonus = 0.8;
          fx('freeze');
        } else {
          const rec = h.history.find((p) => now - p.t <= 3.1) || h.history[0];
          const x0 = h.x, z0 = h.z;
          if (rec) { h.x = rec.x; h.z = rec.z; h.hp = Math.max(h.hp, rec.hp); }
          this.ev({ t: 'fx', k: 'rewind', x: r1(x0), z: r1(z0), x2: r1(h.x), z2: r1(h.z) });
          this.at(0.15, () => {
            this.ev({ t: 'fx', k: 'hatch', x: r1(h.x), z: r1(h.z), r: 4 });
            this.enemiesIn(h, h.x, h.z, 4, (e) => this.damage(h, e, 230 + 26 * L + 1.1 * c.atk, 'phys', sk));
          });
        }
        break;
      }
      // ---------------------------------------------------- QS
      case 'qs': {
        if (slot === 0) {
          const base = Math.atan2(dx, dz);
          const hits = new Map();
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.2;
            this.proj(h, {
              dir: [Math.sin(a), Math.cos(a)], range: S.range, speed: 26, style: 'boq', width: 0.5,
              onHit: (e) => {
                const n = hits.get(e.id) || 0; hits.set(e.id, n + 1);
                this.damage(h, e, (60 + 9 * L + 0.4 * c.atk) * (n ? 0.5 : 1), 'phys', sk);
              },
            });
          }
        } else if (slot === 1) {
          let best = null, bs = Infinity;
          for (const e of this.ents.values()) {
            if (e.kind === 'proj' || e.kind === 'struct' || !this.canTarget(h, e)) continue;
            const dd = dist(e, h); if (dd > S.range + e.r) continue;
            const s = (e.kind === 'hero' ? 0 : 100) + (e.x - x) ** 2 + (e.z - z) ** 2;
            if (s < bs) { bs = s; best = e; }
          }
          if (!best) return; // tidak ada target: jangan pakai cooldown
          best.markUntil = now + 4; best.revealUntil = now + 4;
          this.damage(h, best, 60 + 10 * L + 0.3 * c.atk, 'phys', sk);
          this.ev({ t: 'fx', k: 'audit', id: best.id, x: r1(best.x), z: r1(best.z) });
        } else {
          const { px, pz } = pt(S.range);
          this.ev({ t: 'fx', k: 'vault-warn', x: r1(px), z: r1(pz), r: S.aoe });
          const goldNow = h.gold;
          this.at(0.8, () => {
            this.ev({ t: 'fx', k: 'vault', x: r1(px), z: r1(pz), r: S.aoe });
            this.enemiesIn(h, px, pz, S.aoe, (e) => this.damage(h, e, 240 + 28 * L + 0.6 * c.atk + 0.08 * goldNow, 'phys', sk));
          });
        }
        break;
      }
      // ---------------------------------------------------- SURVEYOR
      case 'surveyor': {
        if (slot === 0) {
          const { px, pz } = pt(S.range);
          this.reveals.push({ team: h.team, x: px, z: pz, r: S.aoe, until: now + 5 });
          this.ev({ t: 'fx', k: 'drone', team: h.team, x: r1(h.x), z: r1(h.z), x2: r1(px), z2: r1(pz), r: S.aoe });
        } else if (slot === 1) {
          const bx = h.x + dx * S.range, bz = h.z + dz * S.range;
          this.ev({ t: 'fx', k: 'laser', x: r1(h.x), z: r1(h.z), x2: r1(bx), z2: r1(bz), c: '#4dff5a' });
          this.enemiesInLine(h, h.x, h.z, bx, bz, S.width / 2, (e) => this.damage(h, e, 160 + 22 * L + 0.9 * c.atk, 'phys', sk));
        } else {
          const { px, pz } = pt(S.range);
          this.ev({ t: 'fx', k: 'orbital-warn', x: r1(px), z: r1(pz), r: S.aoe });
          this.reveals.push({ team: h.team, x: px, z: pz, r: S.aoe + 2, until: now + 2.2 });
          for (let i = 0; i < 3; i++) {
            this.at(1.0 + i * 0.4, () => {
              const ox = px + (Math.random() - 0.5) * 1.5, oz = pz + (Math.random() - 0.5) * 1.5;
              this.ev({ t: 'fx', k: 'strike', x: r1(ox), z: r1(oz), r: S.aoe });
              this.enemiesIn(h, ox, oz, S.aoe, (e) => this.damage(h, e, 150 + 18 * L + 0.6 * c.atk, 'phys', sk));
            });
          }
        }
        break;
      }
    }
    h.cds[slot] = cd;
    if (h.has.has('hammer')) h.aftershock = true;
  }

  // ------------------------------------------------------------ skill berbasis data (15 hero tambahan)
  specVal(h, spec) { return spec ? spec[0] + spec[1] * h.lvl + spec[2] * (spec[3] === 'mp' ? h.cur.mp : h.cur.atk) : 0; }

  pickUnit(h, x, z, range) {
    let best = null, bs = Infinity;
    for (const e of this.ents.values()) {
      if (e.kind === 'proj' || e.kind === 'struct' || !this.canTarget(h, e)) continue;
      if (dist(e, h) > range + e.r) continue;
      const sc = (e.kind === 'hero' ? 0 : 60) + (e.x - x) ** 2 + (e.z - z) ** 2;
      if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }

  shove(e, fx, fz, distM, toward) {
    if (!e || e.kind === 'struct' || e.kind === 'boss' || e.dead) return;
    if (e.kind === 'hero' && (e.ccImmuneUntil > this.time || (e.H.passive && e.H.passive.type === 'flatDef' && e.hero === 'crane'))) return;
    let dx = e.x - fx, dz = e.z - fz;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    if (toward) { dx = -dx; dz = -dz; distM = Math.max(0, Math.min(distM, L - 1.2)); }
    const steps = Math.ceil(distM / 0.3);
    for (let i = 0; i < steps; i++) if (!this.tryMove(e, dx * distM / steps, dz * distM / steps)) break;
  }

  applyHit(h, e, hit, ox, oz) {
    if (!hit || !e || e.dead || e.hp <= 0) return;
    const now = this.time;
    if (hit.dmg) this.damage(h, e, this.specVal(h, hit.dmg), hit.dt || 'phys', { skill: true });
    if (e.dead || e.hp <= 0) return;
    if (hit.slow) this.slow(e, hit.slow[0], hit.slow[1]);
    if (hit.stun) this.cc(e, 'stun', hit.stun, h);
    if (hit.root) this.cc(e, 'root', hit.root, h);
    if (hit.air) this.cc(e, 'air', hit.air, h);
    if (hit.silence && e.kind === 'hero' && !(e.ccImmuneUntil > now)) e.silenceUntil = Math.max(e.silenceUntil, now + hit.silence);
    if (hit.reveal) e.revealUntil = Math.max(e.revealUntil, now + hit.reveal);
    if (hit.mark) e.markUntil = Math.max(e.markUntil, now + hit.mark);
    if (hit.strip) { e.shields = []; e.meshShield = 0; }
    if (hit.knock) this.shove(e, ox, oz, hit.knock, false);
    if (hit.pull) this.shove(e, h.x, h.z, 30, true);
    if (hit.pullTo) this.shove(e, ox, oz, 30, true);
    if (hit.dmg && h.kind === 'hero') this.onSkillHit(h, e);
  }

  onSkillHit(h, e) {
    const P = h.H.passive || {};
    if (P.type === 'slowOnHit') this.slow(e, P.v, 1.2);
    if (P.type === 'loopSync') for (let i = 0; i < 3; i++) h.cds[i] = Math.max(0, h.cds[i] - P.v);
    if (P.type === 'thirdSkillBurst' && e.kind === 'hero') {
      h.ratioN = (h.ratioN || 0) + 1;
      if (h.ratioN % 3 === 0) {
        this.ev({ t: 'fx', k: 'gen', shape: 'circle', x: r1(e.x), z: r1(e.z), r: 2.5, c: '#ffd23a', text: 'GOLDEN RATIO' });
        this.enemiesIn(h, e.x, e.z, 2.5, (o) => this.damage(h, o, 90 + 12 * h.lvl + 0.5 * h.cur.mp, 'magic'));
      }
    }
  }

  passiveOnHit(h, tt, P) {
    const now = this.time, L = h.lvl;
    switch (P.type) {
      case 'shieldOnHit': {
        const cur = this.shieldOf(h);
        if (cur < P.max) this.shield(h, Math.min(P.max - cur, P.v[0] + P.v[1] * L), 4);
        break;
      }
      case 'slowOnHit': this.slow(tt, P.v, 1.2); break;
      case 'chainEvery3': {
        h.hitN = (h.hitN || 0) + 1;
        if (h.hitN % 3) break;
        const pts = [[r1(tt.x), r1(tt.z)]]; let n = 0;
        for (const e of this.ents.values()) {
          if (n >= 2) break;
          if (e === tt || e.kind === 'proj' || e.kind === 'struct' || !this.canTarget(h, e) || d2(e, tt) > 36) continue;
          n++; pts.push([r1(e.x), r1(e.z)]);
          this.damage(h, e, 60 + 8 * L + 0.3 * h.cur.mp, 'magic');
        }
        this.ev({ t: 'fx', k: 'chain', pts, c: '#9fd0ff' });
        break;
      }
      case 'critStack':
        h.critStacks = Math.min(5, (h.critStackUntil > now ? h.critStacks || 0 : 0) + 1); h.critStackUntil = now + 4; break;
      case 'pctTrue': if (tt.kind !== 'struct') this.damage(h, tt, Math.min(tt.maxHp * P.v, tt.kind === 'boss' ? 150 : 1e9), 'true'); break;
      case 'revealOnHit': tt.revealUntil = Math.max(tt.revealUntil, now + 3); break;
      case 'markOnHit': tt.markUntil = Math.max(tt.markUntil, now + P.v); break;
      case 'thermal':
        h.thermalHot = !h.thermalHot;
        if (h.thermalHot) for (let i = 1; i <= 3; i++) this.at(i * 0.6, () => this.damage(h, tt, 20 + 4 * L + 0.1 * h.cur.mp, 'magic'));
        else this.slow(tt, 0.2, 1.2);
        break;
    }
  }

  buffAllies(h, A, cx, cz) {
    const now = this.time;
    let list = this.heroes.filter((a) => a.team === h.team && !a.dead && (a.x - cx) ** 2 + (a.z - cz) ** 2 <= A.r * A.r);
    if (A.one) {
      list.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      list = list.length ? [list[0]] : [h];
    }
    for (const a of list) {
      if (A.shield) this.shield(a, this.specVal(h, A.shield), 4);
      if (A.heal) this.heal(h, a, this.specVal(h, A.heal));
      if (A.ms) a.msBuffs.push({ pct: A.ms[0], until: now + A.ms[1] });
      if (A.as) a.asBuffs.push({ pct: A.as[0], until: now + A.as[1] });
      if (A.cdr) for (let i = 0; i < 3; i++) a.cds[i] = Math.max(0, a.cds[i] - A.cdr);
      if (A.cleanse) { a.stunUntil = 0; a.rootUntil = 0; a.airUntil = 0; a.slows = []; a.silenceUntil = 0; }
      this.ev({ t: 'fx', k: 'gen', shape: 'buff', id: a.id, x: r1(a.x), z: r1(a.z), r: 1.6, c: h.H.skills ? (h.H.accent || '#7cff9a') : '#7cff9a' });
    }
  }

  castGeneric(h, slot, dx, dz, len) {
    const S = h.H.skills[slot], A = S.area || {}, now = this.time;
    const range = S.range || 0;
    const d = Math.min(len || range, range);
    const px = h.x + dx * d, pz = h.z + dz * d;
    const F = S.fx || {};
    const col = F.c || h.H.accent || '#ffffff';
    const base = { ...F, t: 'fx', k: 'gen', id: h.id, c: col, text: F.text || '', hero: h.hero, slot, flags: Object.keys(F).filter((k) => F[k] === true || typeof F[k] === 'string' && k !== 'c' && k !== 'text').join(',') };
    const ev = (shape, extra) => this.ev({ ...base, shape, x: r1(h.x), z: r1(h.z), dx: Math.round(dx * 100) / 100, dz: Math.round(dz * 100) / 100, ...extra });
    let hitHero = false;
    const hitE = (e, ox, oz) => { if (e.kind === 'hero') hitHero = true; this.applyHit(h, e, S.hit, ox, oz); };
    let cdOverride;
    switch (A.shape) {
      case 'cone': {
        ev('cone', { r: A.r, ang: A.ang });
        const ca = Math.cos(A.ang);
        this.enemiesIn(h, h.x, h.z, A.r, (e) => {
          const ex = e.x - h.x, ez = e.z - h.z, el = Math.hypot(ex, ez) || 1;
          if ((ex * dx + ez * dz) / el >= ca) hitE(e, h.x, h.z);
        });
        break;
      }
      case 'line': {
        const x0 = h.x, z0 = h.z, bx = h.x + dx * A.len, bz = h.z + dz * A.len;
        const go = () => {
          ev('line', { x: r1(x0), z: r1(z0), x2: r1(bx), z2: r1(bz), w: A.w });
          this.enemiesInLine(h, x0, z0, bx, bz, A.w / 2, (e) => hitE(e, x0, z0));
        };
        if (A.delay) { ev('line-warn', { x: r1(x0), z: r1(z0), x2: r1(bx), z2: r1(bz), w: A.w, delay: A.delay }); this.at(A.delay, go); } else go();
        break;
      }
      case 'circle': {
        const cx = A.at === 'point' ? px : h.x, cz = A.at === 'point' ? pz : h.z;
        const go = () => {
          ev('circle', { x: r1(cx), z: r1(cz), r: A.r });
          if (S.hit) this.enemiesIn(h, cx, cz, A.r, (e) => hitE(e, cx, cz));
          if (S.zone) {
            this.zones.push({ team: h.team, src: h, x: cx, z: cz, r: S.zone.r, until: this.time + S.zone.dur, tick: S.zone.tick, next: this.time + 0.05, hit: S.zone.hit });
            ev('zone', { x: r1(cx), z: r1(cz), r: S.zone.r, dur: S.zone.dur });
          }
          if (S.turret) {
            this.zones.push({ team: h.team, src: h, x: cx, z: cz, r: S.turret.range, until: this.time + S.turret.dur, tick: S.turret.every, next: this.time + 0.4, turret: S.turret, col });
            ev('turret', { x: r1(cx), z: r1(cz), dur: S.turret.dur });
          }
          if (S.allies && S.allies.at === 'point') this.buffAllies(h, S.allies, cx, cz);
        };
        if (A.delay) { ev('circle-warn', { x: r1(cx), z: r1(cz), r: A.r, delay: A.delay }); this.at(A.delay, go); } else go();
        break;
      }
      case 'proj': {
        const n = A.fan || 1;
        const base0 = Math.atan2(dx, dz);
        ev('proj', {});
        for (let i = 0; i < n; i++) {
          const a = base0 + (i - (n - 1) / 2) * 0.22;
          this.proj(h, { dir: [Math.sin(a), Math.cos(a)], range, speed: A.speed || 26, style: 'g' + col, width: A.w || 0.6, pierce: !!A.pierce, onHit: (e) => hitE(e, h.x, h.z) });
        }
        break;
      }
      case 'dash': {
        const hit = new Set();
        const x0 = h.x, z0 = h.z;
        this.dash(h, dx, dz, A.len, () => this.enemiesIn(h, h.x, h.z, A.w || 1.4, (e) => { if (!hit.has(e.id)) { hit.add(e.id); hitE(e, x0, z0); } }));
        if (A.endR) { ev('circle', { x: r1(h.x), z: r1(h.z), r: A.endR }); this.enemiesIn(h, h.x, h.z, A.endR, (e) => { if (!hit.has(e.id)) { hit.add(e.id); hitE(e, h.x, h.z); } }); }
        ev('dash', { x: r1(x0), z: r1(z0), x2: r1(h.x), z2: r1(h.z) });
        if (A.resetOnHero && hitHero) cdOverride = 2.5;
        break;
      }
      case 'unit': {
        const t = this.pickUnit(h, px, pz, range + 1);
        if (!t) return false;
        if (A.dashTo) {
          const L = dist(h, t);
          if (L > 1.6) this.dash(h, (t.x - h.x) / L, (t.z - h.z) / L, L - 1.4);
        }
        ev('unit', { x: r1(h.x), z: r1(h.z), x2: r1(t.x), z2: r1(t.z), tg: t.id });
        hitE(t, h.x, h.z);
        break;
      }
      case 'chain': {
        const t = this.pickUnit(h, px, pz, range + 1);
        if (!t) return false;
        const chain = [t];
        let last = t;
        for (let i = 1; i < (A.n || 3); i++) {
          let nb = null, bd = (A.r || 6) ** 2;
          for (const e of this.ents.values()) {
            if (e.kind === 'proj' || e.kind === 'struct' || chain.includes(e) || !this.canTarget(h, e)) continue;
            const dd = d2(e, last); if (dd < bd) { bd = dd; nb = e; }
          }
          if (!nb) break;
          chain.push(nb); last = nb;
        }
        this.ev({ t: 'fx', k: 'chain', pts: [[r1(h.x), r1(h.z)], ...chain.map((e) => [r1(e.x), r1(e.z)])], c: col });
        chain.forEach((e, i) => this.at(i * 0.12, () => hitE(e, h.x, h.z)));
        break;
      }
      default: ev('self', { r: S.aoe || 3 });
    }
    if (S.allies && S.allies.at !== 'point') this.buffAllies(h, S.allies, h.x, h.z);
    else if (S.allies && A.shape === 'self') this.buffAllies(h, S.allies, px, pz);
    return cdOverride;
  }

  tickZones() {
    const now = this.time;
    if (!this.zones.length) return;
    for (const z of this.zones) {
      if (now < z.next) continue;
      z.next += z.tick;
      if (z.turret) {
        let best = null, bd = z.r * z.r;
        for (const e of this.ents.values()) {
          if (e.kind === 'proj' || e.kind === 'struct' || e.team === z.team || e.team === 2 || !this.canTarget(z.src, e)) continue;
          const dd = (e.x - z.x) ** 2 + (e.z - z.z) ** 2;
          if (dd < bd) { bd = dd; best = e; }
        }
        if (best) {
          const dmg = this.specVal(z.src, z.turret.dmg);
          this.proj(z.src, { tgt: best.id, x: z.x, z: z.z, speed: 30, style: 'g' + z.col, onHit: (tt) => this.damage(z.src, tt, dmg, 'phys') });
        }
      } else this.enemiesIn(z.src, z.x, z.z, z.r, (e) => this.applyHit(z.src, e, z.hit, z.x, z.z));
    }
    this.zones = this.zones.filter((z) => z.until > now);
  }

  // ------------------------------------------------------------ minion / boss AI
  acquireFor(u, aggro) {
    let best = null, bs = Infinity;
    const now = this.time;
    for (const e of this.ents.values()) {
      if (e.kind === 'proj' || !this.canTarget(u, e)) continue;
      if (e.team === 2) continue; // minion tidak menyerang boss netral
      const dd = dist(u, e) - e.r;
      if (dd > aggro) continue;
      let s = dd;
      if (e.kind === 'hero') {
        // hero hanya diincar bila ia menyerang hero kawan, atau tak ada target lain
        s += (e.aggroHeroAt && now - e.aggroHeroAt < 2) ? -3 : 25;
      }
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  tickMinion(u) {
    const M = MINION[u.type];
    const now = this.time;
    if (u.atkCd > 0) u.atkCd -= DT;
    u.moving = false;
    if (u.stunUntil > now) return;
    let t = u.target ? this.ents.get(u.target) : null;
    if (!this.canTarget(u, t) || dist(u, t) > 9) { t = null; u.target = 0; }
    if (!t || (u.retarget = (u.retarget || 0) - DT) < 0) {
      u.retarget = 0.5;
      const nt = this.acquireFor(u, 7);
      if (nt) { t = nt; u.target = nt.id; }
    }
    let slow = 0; for (const s of u.slows) if (s.until > now) slow = Math.max(slow, s.pct);
    const ms = M.ms * (1 - slow);
    if (t) {
      const dd = dist(u, t);
      if (dd <= M.range + t.r + u.r) {
        u.f = Math.atan2(t.x - u.x, t.z - u.z);
        if (u.atkCd <= 0) {
          u.atkCd = M.interval; u.lastAttackAt = now;
          this.ev({ t: 'atk', id: u.id, tg: t.id });
          if (M.proj) this.proj(u, { tgt: t.id, speed: 20, style: u.type === 'dog' ? 'bark' : 'cart', onHit: (tt) => this.damage(u, tt, u.dmg, 'phys') });
          else this.damage(u, t, u.dmg, 'phys');
        }
      } else if (u.rootUntil <= now) this.moveToward(u, t.x, t.z, ms, M.range + t.r + u.r - 0.2);
    } else if (u.rootUntil <= now) this.followLane(u, ms, u.lane);
  }

  tickStruct(s) {
    const S = STRUCT[s.type];
    const now = this.time;
    if (s.atkCd > 0) s.atkCd -= DT;
    if (!s.armed) return;
    let t = s.target ? this.ents.get(s.target) : null;
    const inR = (e) => e && this.canTarget(s, e) && dist(s, e) - e.r <= S.range;
    if (!inR(t)) { t = null; s.target = 0; }
    // prioritas: hero musuh yang menyerang hero kawan dalam jangkauan
    for (const h of this.heroes) {
      if (h.team === s.team || h.dead || !inR(h)) continue;
      if (h.aggroHeroAt && now - h.aggroHeroAt < 1.5) {
        let hitAlly = false;
        for (const a of this.heroes) if (a.team === s.team && !a.dead && d2(a, s) < (S.range + 2) ** 2) hitAlly = true;
        if (hitAlly) { t = h; s.target = h.id; break; }
      }
    }
    if (!t) {
      let best = null, bs = Infinity;
      for (const e of this.ents.values()) {
        if (e.kind === 'proj' || e.kind === 'struct' || !inR(e) || e.team === 2) continue;
        const sc = (e.kind === 'hero' ? 100 : 0) + dist(s, e);
        if (sc < bs) { bs = sc; best = e; }
      }
      t = best; s.target = best ? best.id : 0;
    }
    if (!t || s.atkCd > 0) return;
    s.atkCd = S.interval;
    const scale = 1 + now / 60 * 0.06;
    if (s.type === 'water') {
      if (s.ramp.id === t.id) s.ramp.n = Math.min(5, s.ramp.n + 1); else s.ramp = { id: t.id, n: 0 };
      const dmg = S.dmg * scale * (t.kind === 'hero' ? 1 + 0.2 * s.ramp.n : 1);
      this.ev({ t: 'tfire', id: s.id, k: 'water', tg: t.id });
      this.proj(s, { tgt: t.id, speed: 24, style: 'water', z: s.z, x: s.x, onHit: (tt) => {
        this.damage(s, tt, dmg, 'phys');
        this.slow(tt, 0.2, 1);
        if (tt.shred.until < now) tt.shred.n = 0;
        tt.shred.n = Math.min(4, tt.shred.n + 1); tt.shred.until = this.time + 3;
      } });
    } else if (s.type === 'lightning') {
      const chain = [t];
      let last = t;
      for (let i = 0; i < 2; i++) {
        let nb = null, bd = 36;
        for (const e of this.ents.values()) {
          if (e.kind === 'proj' || e.kind === 'struct' || chain.includes(e) || !this.canTarget(s, e) || e.team === 2) continue;
          const dd = d2(e, last); if (dd < bd) { bd = dd; nb = e; }
        }
        if (!nb) break;
        chain.push(nb); last = nb;
      }
      this.ev({ t: 'fx', k: 'bolt', pts: [[s.x, s.z], ...chain.map((e) => [r1(e.x), r1(e.z)])] });
      this.ev({ t: 'tfire', id: s.id, k: 'lightning', tg: t.id });
      chain.forEach((e, i) => {
        this.damage(s, e, S.dmg * scale * (i === 0 ? 1 : 0.7), 'magic');
        if (i === 2 || (chain.length === 1 && e.kind === 'hero')) { this.cc(e, 'stun', 0.6, s); this.slow(e, 0.3, 1.5); }
      });
    } else {
      this.ev({ t: 'tfire', id: s.id, k: 'base', tg: t.id });
      this.proj(s, { tgt: t.id, speed: 22, style: 'signal', onHit: (tt) => this.damage(s, tt, S.dmg * scale, 'magic') });
    }
  }

  tickBoss(b) {
    const now = this.time;
    if (b.atkCd > 0) b.atkCd -= DT;
    if (b.abilityCd > 0) b.abilityCd -= DT;
    b.moving = false;
    if (b.ally) return this.tickAllyBoss(b);
    const B = BOSS[b.type];
    const home = b.home;
    let t = b.target ? this.ents.get(b.target) : null;
    const leashOk = (e) => e && !e.dead && e.hp > 0 && (e.x - home.x) ** 2 + (e.z - home.z) ** 2 < 14 * 14 && e.kind !== 'struct';
    if (!leashOk(t)) {
      // cari penyerang lain di area
      t = null; b.target = 0;
      for (const [hid, tm] of b.attackers) { const e = this.ents.get(hid); if (now - tm < 6 && leashOk(e)) { t = e; b.target = e.id; break; } }
    }
    if (!t) {
      if (this.moveToward(b, home.x, home.z, B.ms, 0.5)) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.15 * DT);
      return;
    }
    const dd = dist(b, t);
    // ability
    if (b.abilityCd <= 0) {
      if (b.type === 'apexcat' && dd > 3 && dd < 10) {
        const x0 = b.x, z0 = b.z;
        b.x = t.x - (t.x - b.x) / dd * 1.5; b.z = t.z - (t.z - b.z) / dd * 1.5;
        this.ev({ t: 'fx', k: 'leap', x: r1(x0), z: r1(z0), x2: r1(b.x), z2: r1(b.z) });
        b.abilityCd = 6;
        for (const e of this.ents.values()) if ((e.kind === 'hero' || e.kind === 'minion') && !e.dead && d2(e, b) < 9) this.damage(b, e, b.dmg * 1.2, 'phys');
        this.ev({ t: 'fx', k: 'cleave', x: r1(b.x), z: r1(b.z), r: 3 });
        return;
      }
      if (b.type === 'cerberus' && dd < 6) {
        b.abilityCd = 8;
        this.ev({ t: 'fx', k: 'howl', x: r1(b.x), z: r1(b.z), r: 6 });
        for (const e of this.heroes) if (!e.dead && d2(e, b) < 36) { this.damage(b, e, b.dmg * 0.8, 'magic'); this.cc(e, 'stun', 1, b); }
        return;
      }
    }
    if (dd <= B.range + t.r + b.r) {
      b.f = Math.atan2(t.x - b.x, t.z - b.z);
      if (b.atkCd <= 0) {
        b.atkCd = B.interval;
        this.ev({ t: 'atk', id: b.id, tg: t.id });
        this.damage(b, t, b.dmg, 'phys');
        if (b.type === 'apexcat') for (const e of this.heroes) if (e !== t && !e.dead && d2(e, t) < 6.25) this.damage(b, e, b.dmg * 0.5, 'phys');
      }
    } else this.moveToward(b, t.x, t.z, B.ms, B.range + t.r + b.r - 0.2);
  }

  tickAllyBoss(b) {
    const now = this.time;
    if (now > b.expire) { b.hp = 0; b.dead = true; this.ev({ t: 'die', id: b.id, x: r1(b.x), z: r1(b.z), k: 'boss', s: 'cerberus' }); return; }
    // keluar dari pit menuju lane (blitz lewat gerbang stockyard)
    const gate = this.map.gate;
    if (b.wp === 0) { if (!gate || this.moveToward(b, gate.x, gate.zIn - 4, 6, 1)) b.wp = 1; return; }
    if (b.wp === 1) {
      if (gate) { if (this.moveToward(b, gate.x, gate.zOut + 3, 6, 1)) b.wp = 2; return; }
      const L = this.lane(b.lane), pr = laneProject(L, b.x, b.z);
      if (pr.d < 3) b.wp = 2; else { const p = lanePoint(L, pr.s); this.moveToward(b, p.x, p.z, 6, 1); }
      return;
    }
    let t = b.target ? this.ents.get(b.target) : null;
    if (!this.canTarget(b, t) || dist(b, t) > 10) {
      t = null; b.target = 0;
      let bs = Infinity;
      for (const e of this.ents.values()) {
        if (e.kind === 'proj' || !this.canTarget(b, e) || e.team === 2) continue;
        if (e.kind === 'struct' && !e.vuln) continue;
        const dd = dist(b, e); if (dd < 8 && dd < bs) { bs = dd; t = e; }
      }
      if (t) b.target = t.id;
    }
    if (b.abilityCd <= 0 && t) {
      b.abilityCd = 7;
      this.ev({ t: 'fx', k: 'howl', x: r1(b.x), z: r1(b.z), r: 6 });
      for (const e of this.ents.values()) if (e.kind === 'minion' && e.team !== b.team && !e.dead && d2(e, b) < 36) e.stunUntil = now + 1.5;
    }
    if (t) {
      const dd = dist(b, t);
      if (dd <= 3.2 + t.r + b.r) {
        b.f = Math.atan2(t.x - b.x, t.z - b.z);
        if (b.atkCd <= 0) { b.atkCd = 1.3; this.ev({ t: 'atk', id: b.id, tg: t.id }); this.damage(b, t, b.dmg, 'phys'); }
      } else this.moveToward(b, t.x, t.z, 5.5, 3 + t.r + b.r);
    } else this.followLane(b, 5.5, b.lane);
  }

  // ------------------------------------------------------------ visibility
  computeVisibility() {
    const now = this.time;
    this.reveals = this.reveals.filter((r) => r.until > now);
    const units = [...this.ents.values()].filter((e) => e.kind !== 'proj' && e.kind !== 'struct' && !e.dead);
    for (const u of units) u.bush = u.kind === 'struct' ? -1 : bushAt(this.map, u.x, u.z);
    for (const e of this.ents.values()) {
      if (e.kind === 'proj' || e.kind === 'struct') { e.visible = [true, true, true]; continue; }
      for (const team of [0, 1]) {
        if (e.team === team || e.kind !== 'hero') { e.visible[team] = true; continue; }
        let vis = true;
        const invis = e.invisUntil > now;
        if (e.bush >= 0 || invis) {
          vis = false;
          if (e.revealUntil > now) vis = true;
          if (!vis && !invis && now - e.lastAttackAt < 1) vis = true;
          if (!vis) for (const r of this.reveals) if (r.team === team && (e.x - r.x) ** 2 + (e.z - r.z) ** 2 < r.r * r.r) { vis = true; break; }
          if (!vis) for (const o of units) {
            if (o.team !== team) continue;
            if (!invis && e.bush >= 0 && o.bush === e.bush) { vis = true; break; }
            if (o.kind === 'hero' && d2(o, e) < 2.25) { vis = true; break; }
          }
        } else if (e.revealUntil > now) vis = true;
        e.visible[team] = vis;
      }
      e.visible[2] = e.visible[0] && e.visible[1];
      if (e.kind === 'hero' && e.bush >= 0 && !e.wasBush) this.ev({ t: 'bush', id: e.id });
      e.wasBush = e.bush >= 0;
    }
  }

  // ------------------------------------------------------------ main tick
  tick() {
    if (this.over) { this.time += DT; return; }
    this.time += DT;
    const now = this.time;
    if (now >= this.nextWave) { this.spawnWave(); this.nextWave += this.map.wave.every; }
    if (!this.otAnnounced && now > this.map.overtime) { this.otAnnounced = true; this.ev({ t: 'boss', k: 'overtime', msg: 'OVERTIME! Deadline proyek — struktur makin rapuh.' }); }
    for (const pit of this.pits) if (!pit.bossId && now >= pit.next) this.spawnBoss(pit);
    // pending
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= now);
      this.pending = this.pending.filter((p) => p.at > now);
      for (const p of due) p.fn();
    }
    this.computeVisibility();
    // urutan proses diselang-seling supaya tidak ada tim yang selalu 'duluan'
    this.flip = !this.flip;
    const hs = this.flip ? this.heroes : [...this.heroes].reverse();
    for (const h of hs) this.tickHero(h);
    this.tickZones();
    const list = [...this.ents.values()];
    if (this.flip) list.reverse();
    for (const e of list) {
      if (e.dead) continue;
      if (e.kind === 'minion') this.tickMinion(e);
      else if (e.kind === 'struct') this.tickStruct(e);
      else if (e.kind === 'boss') this.tickBoss(e);
    }
    for (const e of list) if (e.kind === 'proj' && !e.dead) this.updateProj(e);
    // expire statuses
    for (const e of list) {
      if (e.kind === 'proj' || e.kind === 'struct') continue;
      if (e.slows.length) e.slows = e.slows.filter((s) => s.until > now);
      if (e.msBuffs.length) e.msBuffs = e.msBuffs.filter((s) => s.until > now);
      if (e.shields.length) e.shields = e.shields.filter((s) => s.until > now && s.amt > 0);
      if (e.hots.length) e.hots = e.hots.filter((s) => s.until > now);
      if (e.asBuffs.length) e.asBuffs = e.asBuffs.filter((s) => s.until > now);
    }
    // collision
    const movers = list.filter((e) => (e.kind === 'hero' || e.kind === 'minion') && !e.dead);
    for (const m of movers) this.pushOutStructures(m);
    this.separate(movers);
    // cleanup
    for (const e of list) if (e.dead && e.kind !== 'hero') this.ents.delete(e.id);
  }

  // ------------------------------------------------------------ snapshot
  shieldOf(e) { let s = e.meshShield || 0; for (const x of e.shields) if (x.until > this.time) s += x.amt; return s; }

  snapshot(team, me) {
    const now = this.time;
    const ents = [];
    const far = !!(this.map.big && me);
    for (const e of this.ents.values()) {
      if (e.dead && e.kind !== 'hero') continue;
      if (team !== 2 && e.visible && !e.visible[team]) continue;
      // map besar: minion & proyektil jauh dari kamera tidak dikirim (hemat WiFi)
      if (far && (e.kind === 'minion' || e.kind === 'proj') && d2(e, me) > 2500) continue;
      if (e.kind === 'proj') { ents.push({ i: e.id, k: 'p', s: e.style, x: r1(e.x), z: r1(e.z), f: r1(e.f) }); continue; }
      let fl = 0;
      if (e.stunUntil > now) fl |= 1;
      if (e.airUntil > now) fl |= 2;
      if (e.invisUntil > now) fl |= 4;
      if (e.bush >= 0) fl |= 8;
      if (e.rootUntil > now) fl |= 16;
      if (e.slows && e.slows.length) fl |= 32;
      if (e.dead) fl |= 64;
      if (e.ccImmuneUntil > now) fl |= 128;
      if (e.moving) fl |= 256;
      if (e.kind === 'struct' && !e.vuln) fl |= 1024;
      if (e.recallUntil) fl |= 2048;
      if (e.markUntil > now) fl |= 4096;
      if (e.kind === 'struct' && e.armed) fl |= 8192;
      const o = { i: e.id, k: e.kind[0], tm: e.team, x: r1(e.x), z: r1(e.z), f: r1(e.f || 0), hp: Math.round(e.hp), mh: e.maxHp, fl };
      if (e.kind === 'hero') { o.s = e.hero; o.n = e.name; o.lv = e.lvl; if (e.skin) o.sk = e.skin; const sh = this.shieldOf(e); if (sh > 0) o.sh = Math.round(sh); }
      else o.s = e.type;
      if (e.ally) o.al = 1;
      ents.push(o);
    }
    const snap = { t: 's', time: r1(now), ents, score: this.score };
    if (me) {
      const c = me.cur || this.dyn(me);
      snap.me = {
        id: me.id, gold: Math.floor(me.gold), lvl: me.lvl, xp: Math.round(me.xp), xpn: xpForLevel(me.lvl),
        cds: me.cds.map((v) => r1(v)), cdm: [0, 1, 2].map((i) => r1(this.skillCd(me, i))), rc: me.s1RecastUntil > now ? 1 : 0,
        items: me.items, dead: me.dead, rs: me.dead ? Math.ceil(me.respawnAt - now) : 0,
        st: { atk: Math.round(c.atk), mp: Math.round(c.mp), armor: Math.round(c.armor), mres: Math.round(c.mres), ms: r1(c.ms), crit: Math.round(c.crit * 100), cdr: Math.round(c.cdr * 100), as: Math.round(c.as * 100) / 100 },
        recall: me.recallUntil ? r1(me.recallUntil - now) : 0,
      };
    }
    return snap;
  }

  scoreboard() {
    return this.heroes.map((h) => ({ id: h.id, n: h.name, s: h.hero, sk: h.skin, tm: h.team, lv: h.lvl, k: h.kills, d: h.deaths, a: h.assists, g: Math.round(h.goldEarned), bot: h.bot ? 1 : 0, items: h.items }));
  }
}
