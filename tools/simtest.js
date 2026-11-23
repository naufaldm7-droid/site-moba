// Uji cepat: pertandingan full-bot tanpa grafis.
//   node tools/simtest.js [menit] [blitz|full]
// MIRROR=1 -> kedua tim memakai komposisi hero yang sama.
import { Game } from '../server/game.js';
import { PLAYABLE } from '../shared/data.js';

const mins = +(process.argv[2] || 20);
const mode = process.argv[3] || 'blitz';
const size = mode === 'full' ? 5 : 3;
const slots = [];
for (const team of [0, 1]) for (let i = 0; i < size; i++) {
  const hero = process.env.MIRROR || size === 5 ? PLAYABLE[i % 5] : PLAYABLE[(i * 2 + team) % 5];
  slots.push({ pid: null, name: `B${team}${i}`, team, hero, bot: true });
}
const g = new Game(slots, { mode });
const evCount = {};
const t0 = Date.now();
let lastLog = 0;
while (!g.over && g.time < mins * 60) {
  g.tick();
  for (const e of g.events) { const k = e.t + (e.k ? ':' + e.k : ''); evCount[k] = (evCount[k] || 0) + 1; }
  for (const e of g.events) if (['struct', 'bosskill', 'boss', 'over'].includes(e.t)) console.log(`[${g.time.toFixed(0)}s] ${e.t} ${e.msg || ''} ${e.winner ?? ''}`);
  g.events = [];
  if (g.time - lastLog > 60) {
    lastLog = g.time;
    const s = g.heroes.map((h) => `${h.hero.slice(0, 2)}${h.team}:L${h.lvl} ${h.kills}/${h.deaths} (${h.x.toFixed(0)},${h.z.toFixed(0)})${h.dead ? 'X' : ''}`).join(' | ');
    console.log(`t=${g.time.toFixed(0)} ents=${g.ents.size} score=${g.score} :: ${s}`);
  }
  for (const e of g.ents.values()) if (Number.isNaN(e.x) || Number.isNaN(e.hp)) { console.log('NaN!', e.kind, e.type || e.hero); process.exit(1); }
}
console.log('selesai', g.over, 'waktu', g.time.toFixed(0), 's, real', Date.now() - t0, 'ms');
const snap = g.snapshot(0, g.heroes[0]);
console.log('snapshot bytes', JSON.stringify(snap).length, 'ents', snap.ents.length);
if (process.env.EV) console.log(JSON.stringify(evCount));
