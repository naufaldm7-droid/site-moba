// Statistik menang per hero dari banyak match 3v3 bot acak: node tools/herostats.js [jumlah]
import { Game } from '../server/game.js';
import { PLAYABLE } from '../shared/data.js';
const N = +(process.argv[2] || 40);
const st = Object.fromEntries(PLAYABLE.map((k) => [k, { g: 0, w: 0, k: 0, d: 0 }]));
let side = [0, 0];
for (let m = 0; m < N; m++) {
  const pool = [...PLAYABLE].sort(() => Math.random() - 0.5);
  const slots = [];
  for (const team of [0, 1]) for (let i = 0; i < 3; i++) slots.push({ pid: null, name: `B${team}${i}`, team, hero: pool[team * 3 + i], bot: true });
  const g = new Game(slots, { mode: 'blitz' });
  while (!g.over && g.time < 1500) { g.tick(); g.events = []; }
  const w = g.over ? g.over.winner : -1;
  if (w >= 0) side[w]++;
  for (const h of g.heroes) { const s = st[h.hero]; s.g++; s.k += h.kills; s.d += h.deaths; if (h.team === w) s.w++; }
}
console.log('menang sisi biru/merah', side);
for (const [k, s] of Object.entries(st).sort((a, b) => b[1].w / (b[1].g || 1) - a[1].w / (a[1].g || 1)))
  console.log(k.padEnd(14), 'main', String(s.g).padStart(3), 'menang', (s.g ? Math.round(s.w / s.g * 100) : 0) + '%', 'K/D', s.k, '/', s.d);
