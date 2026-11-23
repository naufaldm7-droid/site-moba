// SITE CLASH server: HTTP statis + WebSocket real-time. Jalan 100% di laptop ini (LAN / hotspot).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game, DT } from './game.js';
import { HEROES, PLAYABLE, SNAP_HZ, TICK_HZ } from '../shared/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
const ROUTES = [
  ['/vendor/', path.join(ROOT, 'node_modules', 'three', 'build')],
  ['/shared/', path.join(ROOT, 'shared')],
  ['/', path.join(ROOT, 'client')],
];

function lanIPs() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, ip: a.address });
  }
  return out;
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ port: PORT, ips: lanIPs(), state: room.state, players: room.clients.size }));
    return;
  }
  for (const [prefix, dir] of ROUTES) {
    if (!url.startsWith(prefix)) continue;
    let rel = url.slice(prefix.length) || 'index.html';
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir)) break; // cegah path traversal
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': prefix === '/vendor/' ? 'max-age=86400' : 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404); res.end('404');
});

// ------------------------------------------------------------------ room (1 room per server)
const room = {
  state: 'lobby',
  clients: new Map(), // ws -> client
  size: 3,
  game: null,
  heroOf: new Map(), // token -> hero entity id
};
let nextCid = 1;

function send(ws, msg) { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(msg) { const s = JSON.stringify(msg); for (const ws of room.clients.keys()) send(ws, s); }
function hostClient() { for (const c of room.clients.values()) if (c.named) return c; return null; }

function lobbyState() {
  const host = hostClient();
  return {
    t: 'lobby', state: room.state, size: room.size,
    players: [...room.clients.values()].filter((c) => c.named).map((c) => ({ id: c.id, name: c.name, team: c.team, hero: c.hero, host: c === host })),
  };
}
const pushLobby = () => broadcast(lobbyState());

function startGame() {
  const players = [...room.clients.values()].filter((c) => c.named && c.team !== 2);
  const slots = [];
  for (const team of [0, 1]) {
    const mine = players.filter((p) => p.team === team).slice(0, room.size);
    const used = new Set();
    for (const p of mine) {
      let hero = p.hero && HEROES[p.hero] ? p.hero : null;
      if (!hero || used.has(hero)) hero = PLAYABLE.find((k) => !used.has(k));
      used.add(hero);
      slots.push({ pid: p.token, name: p.name, team, hero, bot: false });
    }
    const botNames = ['Bot Pak Mandor', 'Bot Bu Drafter', 'Bot Mas QC', 'Bot Pak Rigger', 'Bot Mbak HSE', 'Bot Bang Surveyor'];
    let i = team * 3;
    while (slots.filter((s) => s.team === team).length < room.size) {
      const free = PLAYABLE.filter((k) => !used.has(k));
      const hero = free[Math.floor(Math.random() * free.length)];
      used.add(hero);
      slots.push({ pid: null, name: botNames[i++ % botNames.length], team, hero, bot: true });
    }
  }
  room.game = new Game(slots);
  room.heroOf.clear();
  for (const h of room.game.heroes) if (h.pid) room.heroOf.set(h.pid, h.id);
  room.state = 'game';
  for (const [ws, c] of room.clients) sendGameStart(ws, c);
  pushLobby();
  console.log(`[game] mulai ${room.size}v${room.size}:`, slots.map((s) => `${s.name}(${s.hero}${s.bot ? ',bot' : ''})`).join(', '));
}

function sendGameStart(ws, c) {
  const g = room.game;
  const hid = room.heroOf.get(c.token);
  const h = hid ? g.ents.get(hid) : null;
  c.heroId = h ? h.id : 0;
  c.viewTeam = h ? h.team : 2;
  if (h) h.bot = false;
  send(ws, { t: 'gamestart', heroId: c.heroId, team: c.viewTeam, size: room.size, sb: g.scoreboard() });
}

function endGame() {
  const g = room.game;
  broadcast({ t: 'over', winner: g.over.winner, sb: g.scoreboard(), time: Math.round(g.time) });
  room.game = null;
  room.state = 'lobby';
  pushLobby();
}

// ------------------------------------------------------------------ websocket
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
wss.on('connection', (ws, req) => {
  const c = { id: nextCid++, name: '', named: false, team: 0, hero: 'structural', token: '', heroId: 0, viewTeam: 2, ip: req.socket.remoteAddress };
  room.clients.set(ws, c);
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const g = room.game;
    if (m.t === 'hello') {
      c.name = String(m.name || 'Engineer').replace(/[<>]/g, '').slice(0, 16) || 'Engineer';
      c.token = typeof m.token === 'string' && m.token.length >= 8 ? m.token.slice(0, 40) : crypto.randomUUID();
      c.named = true;
      // tim default: yang lebih sedikit
      const named = [...room.clients.values()].filter((o) => o.named && o !== c);
      const blue = named.filter((o) => o.team === 0).length, red = named.filter((o) => o.team === 1).length;
      c.team = blue <= red ? 0 : 1;
      if (HEROES[m.hero]) c.hero = m.hero;
      send(ws, { t: 'welcome', id: c.id, token: c.token });
      pushLobby();
      if (room.state === 'game' && g) {
        // reconnect ke hero lama, atau jadi penonton
        sendGameStart(ws, c);
        if (c.heroId) { const h = g.ents.get(c.heroId); if (h) { h.bot = false; h.name = c.name; } }
      }
      return;
    }
    if (!c.named) return;
    switch (m.t) {
      case 'team': if (room.state === 'lobby' && [0, 1, 2].includes(m.team)) { c.team = m.team; pushLobby(); } break;
      case 'hero': if (room.state === 'lobby' && HEROES[m.hero]) { c.hero = m.hero; pushLobby(); } break;
      case 'size': if (room.state === 'lobby' && hostClient() === c && [1, 2, 3].includes(m.size)) { room.size = m.size; pushLobby(); } break;
      case 'start': if (room.state === 'lobby' && hostClient() === c) startGame(); break;
      case 'chat': broadcast({ t: 'chat', n: c.name, tm: c.team, msg: String(m.msg || '').slice(0, 120) }); break;
      case 'surrender': if (g && c.heroId && hostClient() === c && !g.over) { const h = g.ents.get(c.heroId); g.over = { winner: 1 - h.team, time: g.time }; g.ev({ t: 'over', winner: 1 - h.team }); } break;
      default:
        if (g && c.heroId) g.setInput(g.ents.get(c.heroId), m);
    }
  });
  ws.on('close', () => {
    room.clients.delete(ws);
    if (room.game && c.heroId) {
      const h = room.game.ents.get(c.heroId);
      // hero diambil alih bot sampai pemain kembali
      if (h && ![...room.clients.values()].some((o) => o.token === c.token)) { h.bot = true; h.brain = {}; }
    }
    pushLobby();
  });
});

// ------------------------------------------------------------------ game loop (akumulator, stabil di timer Windows)
let last = process.hrtime.bigint();
let acc = 0;
let tickN = 0;
const SNAP_EVERY = Math.round(TICK_HZ / SNAP_HZ);
setInterval(() => {
  const now = process.hrtime.bigint();
  acc += Number(now - last) / 1e9;
  last = now;
  const g = room.game;
  if (!g) { acc = 0; return; }
  if (acc > 0.25) acc = 0.25;
  while (acc >= DT) {
    acc -= DT;
    g.tick();
    tickN++;
    if (tickN % SNAP_EVERY === 0) {
      const events = g.events; g.events = [];
      const sb = tickN % TICK_HZ === 0 ? g.scoreboard() : null;
      const cache = {};
      for (const [ws, c] of room.clients) {
        if (!c.named) continue;
        const h = c.heroId ? g.ents.get(c.heroId) : null;
        const team = h ? h.team : 2;
        let snap;
        if (h) snap = g.snapshot(team, h);
        else snap = cache[team] || (cache[team] = g.snapshot(team, null));
        snap.ev = events;
        if (sb) snap.sb = sb;
        send(ws, snap);
      }
    }
    if (g.over && g.time - g.over.time > 4) { endGame(); break; }
  }
}, 4);

server.listen(PORT, '0.0.0.0', () => {
  const line = '='.repeat(64);
  console.log(line);
  console.log('  SITE CLASH: LAYDOWN LEGENDS — server jalan di laptop ini');
  console.log(line);
  console.log(`  Main di laptop ini : http://localhost:${PORT}`);
  for (const { name, ip } of lanIPs()) console.log(`  HP / PC lain       : http://${ip}:${PORT}   (${name})`);
  console.log('  Semua perangkat harus di WiFi / hotspot yang sama.');
  console.log('  Jika Windows Firewall bertanya, pilih "Allow" (Private network).');
  console.log('  Tutup jendela ini / Ctrl+C untuk mematikan server.');
  console.log(line);
});
