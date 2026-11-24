// SITE CLASH — client: jaringan, lobby, HUD, kontrol (PC & HP).
import { HEROES, PLAYABLE, LOCKED_HEROES, ITEMS, SHOP_ORDER, itemCost, MAPS, ROLES, heroRole, ULT_LEVEL, S2_LEVEL, STRUCT } from '/shared/data.js';
import { Renderer, TEAM_HEX } from './render.js';
import { initAudio, play, heroSfx, setSound, soundOn } from './sfx.js';
import { preloadHero, loadClips, SKINS } from './models.js';
import { Showcase } from './showcase.js';

const $ = (id) => document.getElementById(id);
const ART = (k) => `assets/art/${k}.jpg`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('sc_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sc_' + k, JSON.stringify(v)); } catch { /* mode privat */ } },
};
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;

const SKILL_ICON = {
  structural: ['🔩', '🧱', '🌋'],
  hse: ['🩹', '✋', '🦺'],
  drafter: ['📐', '👻', '↩️'],
  qs: ['📄', '🔍', '💰'],
  surveyor: ['🛸', '📏', '🛰️'],
  architect: ['📏', '🪟', '🏛️'],
  fabricator: ['🛡️', '⚙️', '🏗️'],
  plumbing: ['🔧', '🛢️', '💦'],
  electrical: ['⚡', '🌀', '🔌'],
  electronic: ['🔴', '📶', '🗼'],
  sales: ['📢', '🤝', '📜'],
  supervisor: ['👉', '🚧', '🚛'],
  procurement: ['📦', '🔗', '🪂'],
  qaqc: ['📡', '🗡️', '⛔'],
  commissioning: ['🔵', '💨', '🟢'],
  crane: ['🪝', '⛓️', '🏋️'],
  geotech: ['🟤', '🪨', '🕳️'],
  hvac: ['🌬️', '❄️', '🌪️'],
  doccontrol: ['🗂️', '🚫', '✅'],
  pm: ['✨', '⏩', '👑'],
};
const ITEM_ICON = { rebar: '🔩', wire: '🧵', vest: '🦺', plate: '🛡️', gloves: '🧤', shoes: '🥾', iwf: '🏗️', drill: '💎', hammer: '⚒️', autocad: '💻', trafo: '⚡', lidar: '📡', harness: '🪢', kevlar: '⛑️', mesh: '🕸️', boots: '📻' };
const STAT_NAME = { atk: 'ATK', mp: 'Magic', hp: 'HP', armor: 'Armor', mres: 'M.Def', ms: 'Speed', crit: 'Crit', pen: 'Pen', mpen: 'M.Pen', cdr: 'CDR', as: 'AS' };
const fmtStats = (st) => Object.entries(st).map(([k, v]) => `+${v < 1 && ['crit', 'pen', 'mpen', 'cdr', 'as'].includes(k) ? Math.round(v * 100) + '%' : v} ${STAT_NAME[k]}`).join(', ');

// ------------------------------------------------------------------ rank lokal (EPC Career Ladder)
const TIERS = [
  { n: 'Intern / Trainee', subs: ['Trainee III', 'Trainee II', 'Trainee I'], stars: 3 },
  { n: 'Junior Staff', subs: ['Junior Staff III', 'Junior Staff II', 'Junior Staff I'], stars: 5 },
  { n: 'Senior Staff', subs: ['Senior Staff III', 'Senior Staff II', 'Senior Staff I'], stars: 5 },
  { n: 'Head of Division', subs: ['Section Lead', 'Division Head', 'Department Head', 'Principal Lead'], stars: 5 },
  { n: 'Project Manager', subs: ['Assistant Manager', 'Site Manager', 'Senior Manager', 'Project Manager'], stars: 5 },
  { n: 'EPC Director', subs: ['EPC Director'], stars: Infinity },
];
function rankOf(total) {
  let t = Math.max(0, total);
  for (let ti = 0; ti < TIERS.length; ti++) {
    const T = TIERS[ti];
    for (const s of T.subs) { if (t < T.stars) return { tier: ti, name: s, star: t, max: T.stars }; t -= T.stars; }
  }
  return { tier: 5, name: 'EPC Director', star: t, max: Infinity };
}
function renderRank() {
  const prog = store.get('prog', { stars: 0, pp: 0, wins: 0, games: 0 });
  const r = rankOf(prog.stars);
  $('rank-name').textContent = r.name;
  $('rank-stars').textContent = r.max === Infinity ? `★ × ${r.star}` : '★'.repeat(r.star) + '☆'.repeat(r.max - r.star);
  $('rank-pp').textContent = `${prog.pp} PP · ${prog.wins}/${prog.games} menang`;
}

// ------------------------------------------------------------------ state
const S = {
  ws: null, cid: 0, token: store.get('token', ''), name: store.get('name', ''), selHero: store.get('hero', 'structural'),
  lobby: null, inGame: false, heroId: 0, team: 0, myHero: null, me: null, sb: [], time: 0, score: [0, 0],
  input: { mx: 0, mz: 0, atk: false }, lastSent: { mx: 9, mz: 9, atk: null, t: 0 },
  keys: {}, joy: null, atkHeld: false, aim: null, mouse: { x: 0, y: 0 }, over: null, overShown: false,
  skin: store.get('skin', 0),
};
if (!PLAYABLE.includes(S.selHero)) S.selHero = 'structural';
const R = new Renderer($('gl'), $('overlay'));
const showcase = new Showcase();

// ------------------------------------------------------------------ jaringan
function send(m) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(m)); }
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  S.ws = ws;
  ws.onopen = () => { send({ t: 'hello', name: S.name, token: S.token, hero: S.selHero, skin: S.skin }); $('login-status').textContent = ''; };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); };
  ws.onclose = () => {
    if (S.ws !== ws) return;
    toast('Koneksi ke server terputus — mencoba lagi…');
    setTimeout(() => { if (S.ws === ws) connect(); }, 1500);
  };
}

function onMsg(m) {
  switch (m.t) {
    case 'welcome': S.cid = m.id; S.token = m.token; store.set('token', m.token); break;
    case 'lobby': {
      const linkChanged = !S.lobby || S.lobby.online !== m.online;
      S.lobby = m;
      if (!S.inGame && !S.overShown) showScreen('lobby');
      else if (linkChanged) loadJoinUrls();
      renderLobby();
      break;
    }
    case 'gamestart': enterGame(m); break;
    case 's': onSnap(m); break;
    case 'over': onOver(m); break;
    case 'chat': toast(`${m.n}: ${m.msg}`); break;
  }
}

// ------------------------------------------------------------------ screens
function showScreen(name) {
  for (const s of ['login', 'lobby', 'over']) $('scr-' + s).classList.toggle('hidden', s !== name);
  $('hud').classList.toggle('hidden', name !== 'game');
  document.body.classList.toggle('ingame', name === 'game');
  if (name === 'lobby') { renderRank(); loadJoinUrls(); }
}

$('inp-name').value = S.name;
$('btn-login').onclick = () => {
  initAudio(); play('SFX_UI_Click_Hardhat');
  const n = $('inp-name').value.trim() || 'Engineer';
  S.name = n.slice(0, 16); store.set('name', S.name);
  $('login-status').textContent = 'Menghubungkan ke server…';
  connect();
};
$('inp-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-login').click(); });

async function loadJoinUrls() {
  try {
    const info = await (await fetch('/api/info', { cache: 'no-store' })).json();
    const online = info.online || (S.lobby && S.lobby.online);
    // pemain yang masuk lewat link online tidak perlu melihat IP lokal
    const viaTunnel = /trycloudflare\.com$|onrender\.com$|hf\.space$/.test(location.hostname);
    const urls = viaTunnel ? '' : info.ips.map((i) => `<code>http://${esc(i.ip)}:${info.port}</code>`).join(' ');
    let html = '';
    if (online) html += `🌐 Link online: <code id="online-url">${esc(online)}</code> <button class="btn" id="btn-copy-url" style="padding:3px 8px;font-size:11px">Salin</button>`;
    if (urls) html += `${html ? '<br>' : ''}📶 WiFi/hotspot sama: ${urls}`;
    $('join-urls').innerHTML = html;
    const cb = $('btn-copy-url');
    if (cb) cb.onclick = async () => { try { await navigator.clipboard.writeText(online); toast('Link disalin — kirim ke teman!'); } catch { toast(online, 6000); } };
  } catch { $('join-urls').textContent = ''; }
}

// ------------------------------------------------------------------ lobby
function renderLobby() {
  const L = S.lobby;
  if (!L) return;
  const me = L.players.find((p) => p.id === S.cid);
  const isHost = me && me.host;
  // tim
  const teamName = ['TIM BIRU', 'TIM MERAH', 'PENONTON'];
  let html = '';
  for (const t of [0, 1, 2]) {
    const ps = L.players.filter((p) => p.team === t);
    const cap = t === 2 ? '' : ` (${Math.min(ps.length, L.size)}/${L.size})`;
    const join = me && me.team !== t && L.state === 'lobby' ? `<button class="btn" data-team="${t}">Gabung</button>` : '';
    html += `<div class="team t${t}"><div class="team-head"><span>${teamName[t]}${cap}</span>${join}</div>`;
    for (const p of ps) {
      const H = HEROES[p.hero];
      html += `<div class="slot ${p.id === S.cid ? 'me' : ''}">${t !== 2 ? `<img src="${ART(H.art)}" alt="">` : '👁️'}<span>${esc(p.name)}${t !== 2 ? ` <span class="muted">· ${esc(H.name)}</span>` : ''}</span>${p.host ? '<span class="host">HOST</span>' : ''}</div>`;
    }
    if (t !== 2) for (let i = ps.length; i < L.size; i++) html += `<div class="slot bot">🤖 Bot akan mengisi slot</div>`;
    if (t !== 2 && ps.length > L.size) html += `<div class="muted">Kelebihan pemain → jadi penonton</div>`;
    html += '</div>';
  }
  $('teams').innerHTML = html;
  $('teams').querySelectorAll('[data-team]').forEach((b) => { b.onclick = () => { play('SFX_UI_Click_Hardhat'); send({ t: 'team', team: +b.dataset.team }); }; });
  // hero grid (sekali)
  const grid = $('hero-grid');
  if (!grid.dataset.ready) {
    grid.dataset.ready = '1';
    let g = '';
    for (const k of PLAYABLE) { const H = HEROES[k]; g += `<button class="hcard" data-hero="${k}"><img src="${ART(H.art)}" alt="" loading="lazy"><div class="cap">${esc(H.name)}<i>${esc(H.role)}</i></div></button>`; }
    for (const H of LOCKED_HEROES) g += `<button class="hcard locked" data-locked="1"><img src="${ART(H.art)}" alt="" loading="lazy"><div class="cap">${esc(H.name)}<i>${esc(H.role)}</i></div></button>`;
    grid.innerHTML = g;
    grid.querySelectorAll('.hcard').forEach((c) => {
      c.onclick = () => {
        if (c.dataset.locked) { toast('Hero ini masuk update berikutnya — 5 hero starter sudah bisa dimainkan.'); return; }
        play('SFX_UI_Click_Hardhat');
        S.selHero = c.dataset.hero; store.set('hero', S.selHero);
        send({ t: 'hero', hero: S.selHero });
        renderLobby();
      };
    });
  }
  const myHero = me ? me.hero : S.selHero;
  grid.querySelectorAll('.hcard').forEach((c) => c.classList.toggle('sel', c.dataset.hero === myHero));
  renderHeroDetail(myHero);
  // mode & start
  const MODE_BTN = [[1, '1v1'], [2, '2v2'], [3, '3v3 Blitz'], [5, '5v5 Full EPC']];
  $('size-box').innerHTML = '<span class="muted">Mode:</span>' + MODE_BTN.map(([n, lb]) => `<button class="${L.size === n ? 'on' : ''}" data-size="${n}" ${isHost ? '' : 'disabled'}>${lb}</button>`).join('')
    + `<span class="muted">· Map: ${L.size >= 4 ? '160×160 m, 3 lane, Turtle & Lord' : '140×70 m, 1 lane + Stockyard'}</span>`;
  $('size-box').querySelectorAll('[data-size]').forEach((b) => { b.onclick = () => send({ t: 'size', size: +b.dataset.size }); });
  const st = $('btn-start');
  st.disabled = !isHost || L.state !== 'lobby';
  st.textContent = L.state === 'game' ? 'Pertandingan berjalan…' : isHost ? 'Mulai Proyek!' : 'Menunggu host…';
  $('lobby-status').textContent = L.state === 'game' ? 'Match sedang berlangsung. Kamu akan masuk sebagai penonton.' : isHost ? 'Kamu host. Slot kosong diisi bot.' : '';
}
$('btn-start').onclick = () => { initAudio(); play('SFX_UI_Click_Hardhat'); send({ t: 'start' }); };

function renderHeroDetail(k) {
  const H = HEROES[k];
  if (!H) return;
  const ic = SKILL_ICON[k];
  const lv = ['', ` <span class="muted">(Lv ${S2_LEVEL})</span>`, ` <span class="muted">(Ult · Lv ${ULT_LEVEL})</span>`];
  const RL = ROLES[heroRole(k)];
  $('hero-detail').innerHTML = `<div id="showcase-slot" style="background-image:url(${ART(H.art)})"></div>
    <h2>${esc(H.name)}</h2><div class="role">${esc(H.role)}</div>
    <div class="rolechip">${RL.icon} <b>${esc(RL.name)}</b> — ${esc(RL.desc)}</div>
    <div class="sk"><div class="ic">★</div><div><b>Pasif · ${esc(H.passive.name)}</b><br><span>${esc(H.passive.desc)}</span></div></div>
    ${H.skills.map((s, i) => `<div class="sk"><div class="ic">${ic[i]}</div><div><b>${'QER'[i]} · ${esc(s.name)}</b>${lv[i]}<br><span>${esc(s.desc)} CD ${s.cd} dtk.</span></div></div>`).join('')}
    <div class="muted" style="margin-top:10px">Skin (semua terbuka)</div>
    <div class="skins">${SKINS.map((k) => `<button class="skin-btn t${k.id} ${S.skin === k.id ? 'on' : ''}" data-skin="${k.id}" title="${esc(k.tier)}">${esc(k.name)}</button>`).join('')}</div>
    <div class="muted" style="margin-top:10px">Build rekomendasi</div>
    <div class="build">${H.build.map((b) => `<span>${ITEM_ICON[b]} ${esc(ITEMS[b].name)}</span>`).join('')}</div>`;
  $('hero-detail').querySelectorAll('[data-skin]').forEach((b) => {
    b.onclick = () => { S.skin = +b.dataset.skin; store.set('skin', S.skin); send({ t: 'skin', skin: S.skin }); play('SFX_UI_Click_Hardhat'); renderHeroDetail(k); };
  });
  $('showcase-slot').appendChild(showcase.el);
  showcase.show(k, S.skin);
}

// ------------------------------------------------------------------ game start / snapshot
function enterGame(m) {
  S.inGame = true; S.overShown = false; S.over = null;
  S.heroId = m.heroId; S.team = m.team; S.sb = m.sb || [];
  loadClips(); for (const p of S.sb) preloadHero(p.s);
  const mine = S.sb.find((x) => x.id === m.heroId);
  S.myHero = mine ? mine.s : null;
  R.reset();
  R.setMe(m.heroId, m.team === 2 ? 0 : m.team);
  S.map = MAPS[m.mode] || MAPS.blitz;
  R.setMap(S.map.id);
  setupMinimap(S.map);
  R.spectate = m.heroId ? null : { x: S.map.w / 2, z: S.map.h / 2 };
  showScreen('game');
  $('feed').innerHTML = '';
  const spectator = !m.heroId;
  $('skills').classList.toggle('hidden', spectator);
  $('me-panel').classList.toggle('hidden', spectator);
  $('joy-hint').classList.toggle('hidden', spectator || !IS_TOUCH);
  $('gold').classList.toggle('hidden', spectator);
  $('btn-shop').classList.toggle('hidden', spectator);
  if (S.myHero) {
    const H = HEROES[S.myHero];
    $('me-img').src = ART(H.art);
    $('me-name').textContent = S.name + ' · ' + H.name;
    for (let i = 0; i < 3; i++) $('btn-s' + i).querySelector('.ic').textContent = SKILL_ICON[S.myHero][i];
  }
  document.querySelectorAll('.sbtn .key').forEach((k) => k.classList.toggle('hidden', IS_TOUCH));
  const help = $('help');
  help.innerHTML = spectator ? '<b>MODE PENONTON</b> — match sedang berjalan.' : IS_TOUCH
    ? '<b>Joystick</b>: sentuh & geser di kiri layar · <b>⚔</b> tahan untuk menyerang<br><b>Skill</b>: ketuk = auto-aim · geser tombol = bidik manual · 🏠 recall'
    : '<b>WASD</b> jalan · <b>SPASI</b> tahan serang · <b>Q / E / R</b> skill (bidik dengan mouse, lepas untuk cast)<br><b>B</b> recall · <b>P</b> toko · <b>Tab</b> papan skor · scroll = zoom';
  help.classList.remove('hidden');
  clearTimeout(S.helpT); S.helpT = setTimeout(() => help.classList.add('hidden'), 9000);
  S.role = mine && mine.rl && S.map.big ? ROLES[mine.rl] : null;
  banner(S.role ? `ROLE: ${S.role.name.toUpperCase()}` : 'PROYEK DIMULAI!', S.role ? S.role.desc : 'Lindungi Kontainer Office — hancurkan milik lawan');
}

function onSnap(m) {
  if (!S.inGame) return;
  S.time = m.time; S.timeAt = performance.now();
  S.score = m.score;
  if (m.me) S.me = m.me;
  if (m.sb) S.sb = m.sb;
  R.applySnapshot(m);
  if (!S.heroId) {
    // penonton: kamera ikut pusat aksi
    let n = 0, x = 0, z = 0;
    for (const o of m.ents) if (o.k === 'h' && !(o.fl & 64)) { x += o.x; z += o.z; n++; }
    if (n) R.spectate = { x: x / n, z: z / n };
  }
  for (const e of m.ev || []) { R.onEvent(e); uiEvent(e); }
}

function camDist(x, z) { return Math.hypot(x - R.camTarget.x, z - R.camTarget.z); }
function volAt(x, z) { return Math.max(0, Math.min(1, 1 - (camDist(x, z) - 10) / 28)); }
function posOf(id) { const r = R.ents.get(id); return r ? r : null; }

function uiEvent(e) {
  const meId = S.heroId;
  switch (e.t) {
    case 'start': play('SFX_Turret_Water_Ready', 0.8); break;
    case 'atk': {
      const r = posOf(e.id); if (!r) break;
      const v = volAt(r.px, r.pz) * (e.id === meId ? 1 : 0.5);
      if (r.k === 'h') play(heroSfx(r.s, 3), v);
      else if (r.k === 'm') play(r.s === 'cat' ? 'SFX_Minion_Cat_Attack' : 'SFX_Minion_Dog_Bark', v * 0.35, 0.12);
      else if (r.k === 'b') play('SFX_Hit', v);
      break;
    }
    case 'cast': { const r = posOf(e.id); if (r) play(heroSfx(e.hero, e.slot), volAt(r.px, r.pz)); break; }
    case 'tfire': { const r = posOf(e.id); if (r) play(e.k === 'water' ? 'SFX_Turret_Water_Fire' : e.k === 'lightning' ? 'SFX_Turret_Lightning_Zap' : 'SFX_Base_Fire', volAt(r.px, r.pz) * 0.8); break; }
    case 'arm': play(e.k === 'lightning' ? 'SFX_Turret_Lightning_Ready' : 'SFX_Base_Container_Ready', 0.9); break;
    case 'die': if (e.k === 'struct') play('SFX_Struct_Collapse', 1); break;
    case 'dmg': if (e.id === meId && e.v > 40) play('SFX_Hit', 0.5, 0.15); break;
    case 'camp': if (e.team === S.team) toast(`${e.n} mendapat ${e.k === 'red' ? 'Buff Merah (+12% damage)' : 'Buff Biru (cooldown lebih cepat)'}`, 2400); break;
    case 'bush': if (e.id === meId) play('SFX_Env_Bush_Rustle', 0.8); break;
    case 'lvl': if (e.id === meId) play('SFX_UI_Level', 0.8); break;
    case 'gold': if (e.id === meId) play('SFX_UI_Gold', 0.4, 0.1); break;
    case 'buy': if (e.id === meId) play('SFX_UI_Gold', 0.8); break;
    case 'boss':
      if (e.k === 'overtime') { banner('OVERTIME!', 'Deadline proyek — struktur makin rapuh'); break; }
      play(e.k === 'apexcat' ? 'SFX_Boss_ApexCat_Roar' : 'SFX_Boss_Cerberus_Howl', 0.9);
      banner(e.k === 'apexcat' ? 'RUST DOZER D9' : 'IRON CLAW EXCAVATOR', 'mesin tua menyala sendiri!');
      break;
    case 'bosskill': banner(e.team === S.team ? 'BOSS DIKALAHKAN!' : 'LAWAN MENGAMBIL BOSS', e.msg); break;
    case 'struct': banner(e.team === S.team ? 'STRUKTUR KITA RUNTUH!' : 'STRUKTUR LAWAN RUNTUH!', e.msg); break;
    case 'kill': addFeed(e); if (e.vh && e.vt === S.team && posOf(meId) && e.v === S.name) banner('KAMU GUGUR', 'oleh ' + e.k); break;
    case 'fx':
      if (e.k === 'howl') { play('SFX_Boss_Cerberus_Howl', volAt(e.x, e.z)); }
      if (e.k === 'leap') play('SFX_Boss_ApexCat_Roar', volAt(e.x, e.z) * 0.7, 1);
      break;
    case 'immune': if (posOf(meId)) toast('Struktur kebal — hancurkan struktur di depannya dulu.', 1500); break;
  }
}

function addFeed(e) {
  const kh = HEROES[e.kh], vh = HEROES[e.vh];
  const el = document.createElement('div');
  el.className = 'kf';
  el.innerHTML = `${kh ? `<img src="${ART(kh.art)}" alt="">` : ''}<span class="t${e.kt}">${esc(e.k)}</span> ⚔ ${vh ? `<img src="${ART(vh.art)}" alt="">` : ''}<span class="t${e.vt}">${esc(e.v)}</span>`;
  const f = $('feed');
  f.prepend(el);
  while (f.children.length > 4) f.lastChild.remove();
  setTimeout(() => el.remove(), 7000);
}

let bannerT = 0;
function banner(title, sub) {
  const b = $('banner');
  b.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  b.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.remove('show'), 2800);
}
let toastT = 0;
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}

// ------------------------------------------------------------------ over
function onOver(m) {
  S.inGame = false; S.overShown = true;
  closeModals();
  releaseInputs();
  const win = S.heroId ? m.winner === S.team : null;
  const t = $('over-title');
  t.className = 'over-title ' + (win === false ? 'lose' : 'win');
  t.textContent = win === null ? `TIM ${m.winner === 0 ? 'BIRU' : 'MERAH'} MENANG` : win ? 'SERAH TERIMA PROYEK!' : 'PROYEK GAGAL — ADDENDUM';
  let sub = `Durasi ${fmtTime(m.time)}`;
  if (win !== null) {
    const prog = store.get('prog', { stars: 0, pp: 0, wins: 0, games: 0 });
    const before = rankOf(prog.stars);
    const mine = m.sb.find((x) => x.id === S.heroId);
    const pp = (win ? 60 : 25) + (mine ? mine.k * 5 + mine.a * 2 : 0);
    prog.games++; prog.pp += pp;
    if (win) { prog.wins++; prog.stars++; }
    else if (before.tier > 0) prog.stars = Math.max(0, prog.stars - 1); // Trainee: perlindungan bintang
    store.set('prog', prog);
    const after = rankOf(prog.stars);
    sub += ` · +${pp} Project Points · ${win ? '+1 ★' : before.tier > 0 ? '−1 ★' : 'bintang aman (Trainee)'} · Rank: ${after.name}`;
    play(win ? 'SFX_UI_RankUp_Stamp' : 'SFX_UI_Lose', 1);
  }
  $('over-sub').textContent = sub;
  $('over-table').innerHTML = sbTable(m.sb);
  showScreen('over');
}
$('btn-over').onclick = () => { S.overShown = false; play('SFX_UI_Click_Hardhat'); showScreen('lobby'); renderLobby(); };

function sbTable(sb) {
  let h = '<table class="sbt"><tr><th>Engineer</th><th>Lv</th><th>K / D / A</th><th>Gold</th><th>Item</th></tr>';
  for (const p of [...sb].sort((a, b) => a.tm - b.tm)) {
    const H = HEROES[p.s];
    h += `<tr class="t${p.tm} ${p.id === S.heroId ? 'me' : ''}"><td><img src="${ART(H.art)}" alt="">${esc(p.n)}${p.bot ? ' 🤖' : ''}</td><td>${p.lv}</td><td>${p.k} / ${p.d} / ${p.a}</td><td>${p.g}</td><td class="itm-mini">${(p.items || []).map((i) => ITEM_ICON[i]).join('')}</td></tr>`;
  }
  return h + '</table>';
}
const fmtTime = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ input
function screenToWorldDir(dx, dy) { return S.team === 1 ? [-dx, -dy] : [dx, dy]; }

addEventListener('keydown', (e) => {
  if (!S.inGame || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (e.repeat) { if (k === 'tab') e.preventDefault(); return; }
  initAudio();
  S.keys[k] = true;
  if (k === ' ' || k === 'j') { S.atkHeld = true; e.preventDefault(); }
  const slot = { q: 0, e: 1, r: 2, 1: 0, 2: 1, 3: 2 }[k];
  if (slot !== undefined && S.heroId) beginAim(slot, 'key');
  if (k === 'b') send({ t: 'recall' });
  if (k === 'p') toggleShop();
  if (k === 'tab') { e.preventDefault(); openScoreboard(); }
  if (k === 'escape') { if (S.aim) cancelAim(); else closeModals(); }
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  S.keys[k] = false;
  if (k === ' ' || k === 'j') S.atkHeld = false;
  const slot = { q: 0, e: 1, r: 2, 1: 0, 2: 1, 3: 2 }[k];
  if (slot !== undefined && S.aim && S.aim.mode === 'key' && S.aim.slot === slot) releaseAim();
  if (k === 'tab') $('scoreboard').classList.add('hidden');
});
addEventListener('blur', releaseInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseInputs(); });
function releaseInputs() { S.keys = {}; S.atkHeld = false; S.joy = null; $('joy').classList.add('hidden'); cancelAim(); }

const gl = $('gl');
gl.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('pointermove', (e) => { S.mouse.x = e.clientX; S.mouse.y = e.clientY; if (S.aim && S.aim.mode === 'key') updateKeyAim(); });
gl.addEventListener('wheel', (e) => { R.zoom = Math.max(0.75, Math.min(1.45, R.zoom + Math.sign(e.deltaY) * 0.08)); }, { passive: true });
gl.addEventListener('pointerdown', (e) => {
  initAudio();
  if (!S.inGame) return;
  if (e.button === 2) { cancelAim(); return; }
  if (S.aim && S.aim.mode === 'key') { releaseAim(); return; } // klik kiri = cast
  if (!S.heroId) return;
  // joystick dinamis di setengah kiri layar
  if (e.clientX < innerWidth * 0.55 && !S.joy) {
    S.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0 };
    const j = $('joy'); j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; j.classList.remove('hidden');
    j.firstElementChild.style.transform = '';
    $('joy-hint').classList.add('hidden');
    gl.setPointerCapture(e.pointerId);
  }
});
gl.addEventListener('pointermove', (e) => {
  if (!S.joy || e.pointerId !== S.joy.id) return;
  let dx = e.clientX - S.joy.x0, dy = e.clientY - S.joy.y0;
  const L = Math.hypot(dx, dy), max = 55;
  if (L > max) { dx = dx / L * max; dy = dy / L * max; }
  S.joy.x = dx / max; S.joy.y = dy / max;
  $('joy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
});
const endJoy = (e) => { if (S.joy && e.pointerId === S.joy.id) { S.joy = null; $('joy').classList.add('hidden'); } };
gl.addEventListener('pointerup', endJoy);
gl.addEventListener('pointercancel', endJoy);

// tombol serang
const atkBtn = $('btn-atk');
atkBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); initAudio(); S.atkHeld = true; atkBtn.classList.add('pressed'); atkBtn.setPointerCapture(e.pointerId); });
const atkUp = () => { S.atkHeld = false; atkBtn.classList.remove('pressed'); };
atkBtn.addEventListener('pointerup', atkUp); atkBtn.addEventListener('pointercancel', atkUp);
$('btn-recall').addEventListener('pointerdown', (e) => { e.preventDefault(); send({ t: 'recall' }); play('SFX_UI_Click_Hardhat', 0.6); });

// tombol skill: ketuk = auto-aim, geser = bidik manual
for (let i = 0; i < 3; i++) {
  const b = $('btn-s' + i);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); initAudio(); if (beginAim(i, 'touch', e)) b.setPointerCapture(e.pointerId); });
  b.addEventListener('pointermove', (e) => { if (S.aim && S.aim.mode === 'touch' && S.aim.pid === e.pointerId) updateTouchAim(e); });
  b.addEventListener('pointerup', (e) => { if (S.aim && S.aim.mode === 'touch' && S.aim.pid === e.pointerId) releaseAim(); });
  b.addEventListener('pointercancel', () => cancelAim());
}

function myEnt() { return R.ents.get(S.heroId); }
function skillReady(slot) {
  const me = S.me;
  if (!me || me.dead) return false;
  const lvReq = slot === 2 ? ULT_LEVEL : slot === 1 ? S2_LEVEL : 1;
  if (me.lvl < lvReq) { toast(`Skill terbuka di level ${lvReq}`); return false; }
  if (me.cds[slot] > 0.05) return false;
  return true;
}

function beginAim(slot, mode, e) {
  if (!S.myHero || !skillReady(slot)) return false;
  const sk = HEROES[S.myHero].skills[slot];
  if (sk.kind === 'self') { castSkill(slot, null); $('btn-s' + slot).classList.add('pressed'); setTimeout(() => $('btn-s' + slot).classList.remove('pressed'), 120); return false; }
  S.aim = { slot, sk, mode, pid: e ? e.pointerId : null, sx: e ? e.clientX : 0, sy: e ? e.clientY : 0, dragged: mode === 'key', angle: 0, x: 0, z: 0, cancel: false };
  $('btn-s' + slot).classList.add('pressed');
  if (mode === 'key') updateKeyAim();
  return true;
}
function updateKeyAim() {
  const A = S.aim, me = myEnt();
  if (!A || !me) return;
  const g = R.screenToGround(S.mouse.x, S.mouse.y);
  if (!g) return;
  let dx = g.x - me.px, dz = g.z - me.pz;
  const L = Math.hypot(dx, dz) || 1;
  A.angle = Math.atan2(dx, dz);
  const range = A.sk.range || 0;
  const d = Math.min(L, range);
  A.x = me.px + dx / L * d; A.z = me.pz + dz / L * d;
  R.showIndicator(A.sk, A);
}
function updateTouchAim(e) {
  const A = S.aim, me = myEnt();
  if (!A || !me) return;
  const dx = e.clientX - A.sx, dy = e.clientY - A.sy;
  const L = Math.hypot(dx, dy);
  if (L > 14) A.dragged = true;
  if (!A.dragged) return;
  const [wx, wz] = screenToWorldDir(dx, dy);
  const wl = Math.hypot(wx, wz) || 1;
  A.angle = Math.atan2(wx, wz);
  const f = Math.min(1, L / 80);
  const range = A.sk.range || 0;
  A.x = me.px + wx / wl * range * (A.sk.kind === 'point' ? f : 1);
  A.z = me.pz + wz / wl * range * (A.sk.kind === 'point' ? f : 1);
  const cz = $('cancel-zone');
  cz.classList.remove('hidden');
  const rc = cz.getBoundingClientRect();
  A.cancel = e.clientX > rc.left - 10 && e.clientX < rc.right + 10 && e.clientY > rc.top - 10 && e.clientY < rc.bottom + 10;
  cz.classList.toggle('hot', A.cancel);
  R.showIndicator(A.sk, A);
}
function releaseAim() {
  const A = S.aim;
  if (!A) return;
  if (!A.cancel) {
    if (A.dragged) castSkill(A.slot, { x: A.x, z: A.z });
    else castSkill(A.slot, autoAim(A.sk));
  }
  cancelAim();
}
function cancelAim() {
  if (S.aim) $('btn-s' + S.aim.slot).classList.remove('pressed');
  S.aim = null;
  R.showIndicator(null);
  $('cancel-zone').classList.add('hidden');
  $('cancel-zone').classList.remove('hot');
}
function castSkill(slot, pt) {
  const me = myEnt();
  if (!me) return;
  const p = pt || { x: me.px, z: me.pz };
  send({ t: 'cast', slot, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });
}
// auto-aim: hero musuh terdekat, lalu unit musuh; skill heal → kawan HP terendah
function autoAim(sk) {
  const me = myEnt();
  if (!me) return null;
  const range = (sk.range || 6) + 2.5;
  let best = null, bs = Infinity;
  if (sk.ally) {
    for (const r of R.ents.values()) {
      if (r.k !== 'h' || r.tm !== S.team || r.hidden || (r.d.fl & 64)) continue;
      const d = Math.hypot(r.px - me.px, r.pz - me.pz);
      if (d > range) continue;
      const s = r.d.hp / r.d.mh;
      if (s < bs) { bs = s; best = r; }
    }
    return best ? { x: best.px, z: best.pz } : { x: me.px, z: me.pz };
  }
  for (const r of R.ents.values()) {
    if (r.k === 'p' || r.k === 's' || r.tm === S.team || r.hidden || (r.d.fl & 64)) continue;
    const d = Math.hypot(r.px - me.px, r.pz - me.pz);
    if (d > range) continue;
    const s = d + (r.k === 'h' ? 0 : 30);
    if (s < bs) { bs = s; best = r; }
  }
  if (best) return { x: best.px, z: best.pz };
  const L = (sk.range || 4) * 0.8;
  return { x: me.px + Math.sin(me.f) * L, z: me.pz + Math.cos(me.f) * L };
}

function updateInput(dt) {
  let kx = 0, ky = 0;
  const K = S.keys;
  if (K.a || K.arrowleft) kx -= 1;
  if (K.d || K.arrowright) kx += 1;
  if (K.w || K.arrowup) ky -= 1;
  if (K.s || K.arrowdown) ky += 1;
  if (S.joy) { kx = S.joy.x; ky = S.joy.y; if (Math.hypot(kx, ky) < 0.18) kx = ky = 0; }
  const L = Math.hypot(kx, ky);
  if (L > 1) { kx /= L; ky /= L; }
  const [mx, mz] = screenToWorldDir(kx, ky);
  S.input.mx = mx; S.input.mz = mz;
  S.input.atk = S.atkHeld;
  const ls = S.lastSent;
  ls.t += dt;
  const changed = Math.abs(ls.mx - mx) > 0.05 || Math.abs(ls.mz - mz) > 0.05 || ls.atk !== S.input.atk;
  if ((changed && ls.t > 0.04) || ls.t > 0.25) {
    send({ t: 'in', mx: Math.round(mx * 100) / 100, mz: Math.round(mz * 100) / 100, atk: S.input.atk });
    ls.mx = mx; ls.mz = mz; ls.atk = S.input.atk; ls.t = 0;
  }
}

// ------------------------------------------------------------------ toko
const SHOP_TABS = [['rec', 'Rekomendasi'], ['atk', 'Serangan'], ['mp', 'Magic/MEP'], ['def', 'HSE Defense'], ['move', 'Mobilitas']];
let shopTab = 'rec', shopSel = null, shopSig = '';
$('btn-shop').onclick = () => { play('SFX_UI_Click_Hardhat'); toggleShop(); };
$('shop-x').onclick = () => $('shop').classList.add('hidden');
$('shop').addEventListener('pointerdown', (e) => { if (e.target.id === 'shop') $('shop').classList.add('hidden'); });
function toggleShop() { if (!S.heroId) return; const sh = $('shop'); sh.classList.toggle('hidden'); shopSig = ''; renderShop(); }
function closeModals() { $('shop').classList.add('hidden'); $('scoreboard').classList.add('hidden'); }
function costFor(id) { return itemCost(id, S.me ? S.me.items : [], S.myHero === 'qs' ? 0.1 : 0).cost; }

function renderShop() {
  if ($('shop').classList.contains('hidden') || !S.me) return;
  const me = S.me;
  const sig = me.gold + '|' + me.items.join(',') + '|' + shopTab + '|' + shopSel;
  if (sig === shopSig) return;
  shopSig = sig;
  $('shop-gold').innerHTML = `🪙 <b style="color:var(--own)">${me.gold}</b>`;
  $('shop-tabs').innerHTML = SHOP_TABS.map(([k, n]) => `<button class="${shopTab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('');
  $('shop-tabs').querySelectorAll('button').forEach((b) => { b.onclick = () => { shopTab = b.dataset.tab; renderShop(); }; });
  const ids = shopTab === 'rec' ? [...new Set(HEROES[S.myHero].build.flatMap((b) => [...(ITEMS[b].from || []), b]))] : SHOP_ORDER.filter((id) => ITEMS[id].cat === shopTab);
  $('shop-items').innerHTML = ids.map((id) => {
    const it = ITEMS[id], c = costFor(id);
    const owned = me.items.includes(id);
    return `<button class="item ${it.tier === 3 ? 't3' : ''} ${shopSel === id ? 'sel' : ''} ${c > me.gold ? 'cant' : ''} ${owned ? 'owned' : ''}" data-id="${id}"><div class="nm"><span class="ic">${ITEM_ICON[id]}</span>${esc(it.name)}</div><div class="cost">🪙 ${c}${c !== it.cost ? ` <s class="muted">${it.cost}</s>` : ''}</div><div class="st">${fmtStats(it.stats)}</div></button>`;
  }).join('');
  $('shop-items').querySelectorAll('.item').forEach((b) => { b.onclick = () => { shopSel = b.dataset.id; renderShop(); }; b.ondblclick = () => buy(b.dataset.id); });
  const it = shopSel && ITEMS[shopSel];
  if (it) {
    const c = costFor(shopSel);
    $('shop-detail').innerHTML = `<b>${ITEM_ICON[shopSel]} ${esc(it.name)}</b><br>${fmtStats(it.stats)}${it.passive ? `<br><span class="pas">${esc(it.passive)}</span>` : ''}${it.from ? `<br>Dirakit dari: ${it.from.map((f) => esc(ITEMS[f].name)).join(' + ')}` : ''}`;
    const full = me.items.length >= 6 && !(it.from || []).some((f) => me.items.includes(f));
    $('shop-buy').disabled = c > me.gold || full;
    $('shop-buy').textContent = full ? 'Slot penuh' : c > me.gold ? `Kurang 🪙 ${c - me.gold}` : `Beli 🪙 ${c}`;
  } else { $('shop-detail').textContent = 'Pilih item untuk melihat detail.'; $('shop-buy').disabled = true; $('shop-buy').textContent = 'Beli'; }
  let inv = '';
  for (let i = 0; i < 6; i++) { const id = me.items[i]; inv += id ? `<button data-slot="${i}" title="Jual"><span>${ITEM_ICON[id]}</span>${esc(ITEMS[id].name)}</button>` : '<button disabled><span>·</span></button>'; }
  $('shop-inv').innerHTML = inv;
  $('shop-inv').querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => { const id = me.items[+b.dataset.slot]; if (confirm(`Jual ${ITEMS[id].name} seharga ${Math.round(ITEMS[id].cost * 0.6)}?`)) send({ t: 'sell', slot: +b.dataset.slot }); }; });
}
$('shop-buy').onclick = () => { if (shopSel) buy(shopSel); };
function buy(id) { send({ t: 'buy', item: id }); }

function nextQuickBuy() {
  const me = S.me;
  if (!me || !S.myHero) return null;
  for (const id of HEROES[S.myHero].build) {
    if (me.items.includes(id)) continue;
    const c = costFor(id);
    if (c <= me.gold && (me.items.length < 6 || (ITEMS[id].from || []).some((f) => me.items.includes(f)))) return { id, c, label: ITEMS[id].name };
    for (const f of ITEMS[id].from || []) if (!me.items.includes(f) && me.items.length < 6 && costFor(f) <= me.gold) return { id: f, c: costFor(f), label: ITEMS[f].name, forName: ITEMS[id].name };
    return null;
  }
  return null;
}
$('quickbuy').onclick = () => { const q = nextQuickBuy(); if (q) buy(q.id); };

// ------------------------------------------------------------------ papan skor
$('btn-sb').onclick = () => openScoreboard(true);
$('sb-x').onclick = () => $('scoreboard').classList.add('hidden');
function openScoreboard(toggle) {
  const m = $('scoreboard');
  if (toggle && !m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
  $('sb-table').innerHTML = sbTable(S.sb);
  const host = S.lobby && S.lobby.players.find((p) => p.id === S.cid && p.host);
  $('btn-surrender').classList.toggle('hidden', !host || !S.heroId);
  m.classList.remove('hidden');
}
$('btn-surrender').onclick = () => { if (confirm('Menyerah dan akhiri pertandingan?')) send({ t: 'surrender' }); };
$('btn-sound').onclick = () => { setSound(!soundOn()); $('btn-sound').textContent = soundOn() ? '🔊' : '🔇'; };
$('btn-full').onclick = async () => {
  try {
    if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape').catch(() => {}); }
    else await document.exitFullscreen();
  } catch { toast('Layar penuh tidak didukung di browser ini'); }
};

// ------------------------------------------------------------------ HUD
let hudT = 0, mmT = 0;
const mm = $('minimap'), mmx = mm.getContext('2d');
let mmBg = null;
function setupMinimap(M) {
  mm.width = M.big ? 320 : 400; mm.height = Math.round(mm.width * M.h / M.w);
  mm.style.setProperty('--mm-ar', String(M.w / M.h));
  mm.classList.toggle('square', !!M.big);
  mmBg = null;
}
function drawMinimapBg() {
  const M = S.map;
  const c = document.createElement('canvas'); c.width = mm.width; c.height = mm.height;
  const g = c.getContext('2d');
  const sx = c.width / M.w, sz = c.height / M.h;
  g.fillStyle = '#2a221b'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#6d6152';
  for (const w of M.walk) g.fillRect(w.x1 * sx, w.z1 * sz, (w.x2 - w.x1) * sx, (w.z2 - w.z1) * sz);
  g.strokeStyle = 'rgba(230,210,170,.35)'; g.lineWidth = M.laneWidth * sx * 0.7; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pts of Object.values(M.lanes)) { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x * sx, z * sz) : g.moveTo(x * sx, z * sz))); g.stroke(); }
  g.fillStyle = '#9a5a2e';
  for (const w of M.walls) g.fillRect(w.x1 * sx, w.z1 * sz, (w.x2 - w.x1) * sx, (w.z2 - w.z1) * sz);
  g.fillStyle = '#4f7a3a';
  for (const b of M.bushes) g.fillRect(b.x1 * sx, b.z1 * sz, (b.x2 - b.x1) * sx, (b.z2 - b.z1) * sz);
  g.strokeStyle = '#d8a520'; g.lineWidth = 2; g.setLineDash([4, 4]);
  for (const bp of M.pits) { g.beginPath(); g.arc(bp.x * sx, bp.z * sz, bp.r * sx, 0, 7); g.stroke(); }
  return c;
}
function drawMinimap() {
  if (!S.map) return;
  if (!mmBg) mmBg = drawMinimapBg();
  const W = mm.width, H = mm.height, sx = W / S.map.w, sz = H / S.map.h;
  mmx.save();
  mmx.clearRect(0, 0, W, H);
  if (S.team === 1) { mmx.translate(W, H); mmx.rotate(Math.PI); }
  mmx.drawImage(mmBg, 0, 0);
  for (const r of R.ents.values()) {
    if (r.k === 'p' || r.hidden) continue;
    const x = r.px * sx, z = r.pz * sz, fl = r.d.fl;
    const col = r.tm === 2 ? '#c08cff' : TEAM_HEX[r.tm];
    if (r.k === 's') { mmx.fillStyle = col; const s = r.s === 'base' ? 14 : 9; mmx.fillRect(x - s / 2, z - s / 2, s, s); mmx.strokeStyle = '#000'; mmx.strokeRect(x - s / 2, z - s / 2, s, s); }
    else if (r.k === 'm') { mmx.fillStyle = col; mmx.fillRect(x - 2, z - 2, 4, 4); }
    else if (r.k === 'b') { mmx.fillStyle = col; mmx.beginPath(); mmx.arc(x, z, 7, 0, 7); mmx.fill(); }
    else if (r.k === 'h' && !(fl & 64)) {
      mmx.fillStyle = col; mmx.strokeStyle = r.id === S.heroId ? '#ffd23a' : '#000'; mmx.lineWidth = r.id === S.heroId ? 3 : 1.5;
      mmx.beginPath(); mmx.arc(x, z, 7, 0, 7); mmx.fill(); mmx.stroke();
    }
  }
  // area kamera
  mmx.strokeStyle = 'rgba(255,255,255,.5)'; mmx.lineWidth = 1.5;
  mmx.strokeRect((R.camTarget.x - 20) * sx, (R.camTarget.z - 11) * sz, 40 * sx, 22 * sz);
  mmx.restore();
}

function hudFrame(dt) {
  hudT += dt; mmT += dt;
  if (mmT > 0.12) { mmT = 0; drawMinimap(); }
  // indikator aim mengikuti hero
  if (S.aim && S.aim.dragged) R.showIndicator(S.aim.sk, S.aim);
  if (hudT < 0.1) return;
  hudT = 0;
  const t = S.time + (S.timeAt ? (performance.now() - S.timeAt) / 1000 : 0);
  $('clock').textContent = fmtTime(t);
  $('sc0').textContent = S.score[0]; $('sc1').textContent = S.score[1];
  const me = S.me;
  if (!me || !S.heroId) return;
  const mine = S.sb.find((x) => x.id === S.heroId);
  if (mine) $('kda').textContent = `${S.role ? S.role.icon + ' ' + S.role.name + ' · ' : ''}K/D/A ${mine.k}/${mine.d}/${mine.a}`;
  $('gold-v').textContent = me.gold;
  const ent = myEnt();
  const hp = ent ? ent.d.hp : 0, mh = ent ? ent.d.mh : 1;
  $('me-hpbar').style.width = (Math.max(0, hp) / mh * 100).toFixed(1) + '%';
  $('me-hptxt').textContent = `${Math.max(0, Math.round(hp))} / ${mh}`;
  $('me-xpbar').style.width = (me.xp / me.xpn * 100).toFixed(1) + '%';
  $('me-lv').textContent = me.lvl;
  $('me-stat').textContent = `⚔${me.st.atk} 🛡${me.st.armor} ✦${me.st.mres}`;
  const itemsHtml = Array.from({ length: 6 }, (_, i) => { const id = me.items[i]; return `<div class="${id && ITEMS[id].tier === 3 ? 't3' : ''}">${id ? ITEM_ICON[id] : ''}</div>`; }).join('');
  if ($('me-items').dataset.sig !== me.items.join()) { $('me-items').innerHTML = itemsHtml; $('me-items').dataset.sig = me.items.join(); }
  // skill
  for (let i = 0; i < 3; i++) {
    const b = $('btn-s' + i);
    const lvReq = i === 2 ? ULT_LEVEL : i === 1 ? S2_LEVEL : 1;
    const locked = me.lvl < lvReq;
    const cd = me.cds[i], cm = me.cdm[i] || 1;
    b.classList.toggle('locked', locked);
    b.classList.toggle('ready', !locked && cd <= 0 && !me.dead);
    b.classList.toggle('recast', i === 0 && !!me.rc);
    b.querySelector('.cd').style.setProperty('--p', cd > 0 ? Math.min(100, cd / cm * 100) + '%' : '0%');
    b.querySelector('.cdt').textContent = locked ? `Lv${lvReq}` : cd > 0 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
  }
  // mati
  document.body.classList.toggle('dead', !!me.dead);
  const dEl = $('death');
  if (me.dead) { dEl.classList.remove('hidden'); dEl.innerHTML = `KEMBALI KE SITE DALAM ${me.rs}<small>Manfaatkan untuk belanja di 🛒 Toko</small>`; }
  else dEl.classList.add('hidden');
  // recall
  const rb = $('recallbar');
  if (me.recall > 0) { rb.classList.remove('hidden'); rb.firstElementChild.style.width = ((5 - me.recall) / 5 * 100) + '%'; } else rb.classList.add('hidden');
  // quick buy
  const q = nextQuickBuy();
  const qb = $('quickbuy');
  if (q) { qb.classList.remove('hidden'); const sig = q.id + q.c; if (qb.dataset.sig !== sig) { qb.dataset.sig = sig; qb.innerHTML = `${ITEM_ICON[q.id]} Beli ${esc(q.label)} · ${q.c}${q.forName ? `<small>komponen ${esc(q.forName)}</small>` : ''}`; } }
  else qb.classList.add('hidden');
  renderShop();
  if (!$('scoreboard').classList.contains('hidden')) $('sb-table').innerHTML = sbTable(S.sb);
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (S.inGame) {
    if (S.heroId) updateInput(dt);
    const ms = S.me ? S.me.st.ms : 0;
    if (S.heroId) R.predict(S.input, dt, ms);
    R.frame(dt, S.input);
    hudFrame(dt);
  } else showcase.tick(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// otomatis masuk bila nama sudah tersimpan
if (S.name) { $('login-status').textContent = 'Menghubungkan…'; connect(); }
showScreen(S.name ? 'lobby' : 'login');
if (S.name) $('scr-lobby').classList.remove('hidden');
// debug helper
window.__sc = { S, R };
void STRUCT;
