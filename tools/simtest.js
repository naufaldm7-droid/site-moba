// Uji cepat: 3v3 full bot tanpa grafis. node tools/simtest.js [menit]
import { Game, DT } from '../server/game.js';
const mins = +(process.argv[2] || 20);
const heroes = ['structural', 'hse', 'drafter', 'qs', 'surveyor'];
const slots = [];
for (const team of [0, 1]) for (let i = 0; i < 3; i++) slots.push({ pid: null, name: `B${team}${i}`, team, hero: process.env.MIRROR ? heroes[i] : heroes[(i * 2 + (process.env.SWAP ? 1 - team : team)) % 5], bot: true });
const g = new Game(slots);
let evCount = {};
const t0 = Date.now();
let lastLog = 0;
while (!g.over && g.time < mins * 60) {
  g.tick();
  for (const e of g.events) evCount[e.t + (e.k ? ':' + e.k : '')] = (evCount[e.t + (e.k ? ':' + e.k : '')] || 0) + 1;
  for (const e of g.events) if (['struct', 'bosskill', 'boss', 'over'].includes(e.t)) console.log(`[${g.time.toFixed(0)}s] ${e.t} ${e.msg || ''} ${e.winner ?? ''}`);
  g.events = [];
  if (g.time - lastLog > 60) {
    lastLog = g.time;
    const s = g.heroes.map((h) => `${h.hero[0]}${h.team}:L${h.lvl} ${h.kills}/${h.deaths} g${Math.round(h.gold)} i${h.items.length} (${h.x.toFixed(0)},${h.z.toFixed(0)})${h.dead ? 'X' : ''}`).join(' | ');
    console.log(`t=${g.time.toFixed(0)} ents=${g.ents.size} score=${g.score} :: ${s}`);
  }
  // sanity
  for (const e of g.ents.values()) if (Number.isNaN(e.x) || Number.isNaN(e.hp)) { console.log('NaN!', e.kind, e.type || e.hero); process.exit(1); }
}
console.log('selesai', g.over, 'waktu', g.time.toFixed(0), 's, real', Date.now() - t0, 'ms');
console.log(JSON.stringify(evCount));
const snap = g.snapshot(0, g.heroes[0]);
console.log('snapshot bytes', JSON.stringify(snap).length);
