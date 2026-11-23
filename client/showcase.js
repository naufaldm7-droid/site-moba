// Showcase hero di layar pemilihan: model 3D beranimasi memperagakan role & jurusnya.
import * as THREE from 'three';
import { RoomEnvironment } from '/vendor/jsm/environments/RoomEnvironment.js';
import { makeHero, applySkin, clipFor, skillMove, roleColor, ONE_SHOT } from './models.js';
import { HEROES, ROLES, heroRole } from '/shared/data.js';

export class Showcase {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'showcase';
    this.el.innerHTML = '<canvas></canvas><div class="show-role"></div><div class="show-move"></div>';
    const canvas = this.el.querySelector('canvas');
    this.roleEl = this.el.querySelector('.show-role'); this.moveEl = this.el.querySelector('.show-move');
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.gl.outputColorSpace = THREE.SRGBColorSpace; this.gl.toneMapping = THREE.ACESFilmicToneMapping; this.gl.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.gl);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.7;
    this.cam = new THREE.PerspectiveCamera(30, 1.5, 0.1, 60);
    this.scene.add(new THREE.HemisphereLight(0xfff0dd, 0x2a2420, 0.9));
    const key = new THREE.DirectionalLight(0xffd9b0, 2.6); key.position.set(2.5, 4, 4); this.scene.add(key);
    this.rim = new THREE.DirectionalLight(0x3fa8ff, 3.2); this.rim.position.set(-3, 3, -4); this.scene.add(this.rim);
    // lantai: cakram gelap + cincin warna role
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.9, 48), new THREE.MeshStandardMaterial({ color: '#1a1512', roughness: 0.35, metalness: 0.6 }));
    disc.rotation.x = -Math.PI / 2; this.scene.add(disc);
    this.ringM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.72, 1.9, 64), this.ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; this.scene.add(ring);
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), this.ringM.clone()); this.pulse.rotation.x = -Math.PI / 2; this.pulse.position.y = 0.02; this.pulse.visible = false; this.scene.add(this.pulse);
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), this.ringM.clone()); this.orb.visible = false; this.scene.add(this.orb);
    this.pivot = new THREE.Group(); this.scene.add(this.pivot);
    this.time = 0; this.key = ''; this.token = 0; this.m = null;
  }

  async show(hero, skin = 0) {
    const key = hero + ':' + skin;
    if (key === this.key) return;
    this.key = key;
    const token = ++this.token;
    const m = await makeHero(hero);
    if (!m || token !== this.token) return;
    if (this.m) this.pivot.remove(this.m.root);
    applySkin(m, hero, HEROES[hero], skin);
    this.m = m; this.hero = hero;
    this.pivot.add(m.root);
    m.root.updateMatrixWorld(true);
    const h = Math.min(2.2, Math.max(1.5, new THREE.Box3().setFromObject(m.root).max.y));
    this.cam.position.set(0, h * 0.66, 4.5); this.cam.lookAt(0, h * 0.5, 0);
    const col = skin === 2 ? '#ffd060' : skin === 3 ? '#3fe0ff' : roleColor(hero, HEROES[hero]);
    this.rim.color.set(col); this.ringM.color.set(col); this.pulse.material.color.set(col); this.orb.material.color.set(col);
    const H = HEROES[hero], role = ROLES[heroRole(hero)];
    this.roleEl.textContent = `${role.icon} ${role.name} · ${H.role}`;
    this.seq = [
      { state: 'idle', dur: 1.5, label: H.melee ? 'Petarung jarak dekat' : 'Penyerang jarak jauh' },
      { state: 'attack', dur: 0.9, label: 'Serangan dasar' }, { state: 'attack', dur: 0.8, label: 'Serangan dasar', alt: true },
      ...H.skills.map((s, i) => ({ state: 'cast', slot: i, dur: i === 2 ? 1.5 : 1.15, label: `${'QER'[i]} · ${s.name}` })),
      { state: 'run', dur: 1.5, label: 'Bergerak' }, { state: 'victory', dur: 2.4, label: 'Menang!' },
    ];
    this.step = -1; this.stepT = 99; this.cur = null;
  }

  tick(dt) {
    if (!this.m || !this.el.isConnected || this.el.offsetParent === null) return;
    const c = this.el.querySelector('canvas'), w = c.clientWidth, hh = c.clientHeight;
    if (w && (c.width !== Math.round(w * this.gl.getPixelRatio()) || this.lastH !== hh)) { this.gl.setSize(w, hh, false); this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); this.lastH = hh; }
    this.time += dt; this.stepT += dt;
    const m = this.m;
    let s = this.seq[this.step];
    if (!s || this.stepT >= s.dur) {
      this.step = (this.step + 1) % this.seq.length; this.stepT = 0; s = this.seq[this.step];
      const name = clipFor(this.hero, s.state, s.slot || 0, !!s.alt);
      const act = m.actions[name] || m.actions.Idle_Loop;
      if (ONE_SHOT.has(name)) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; } else act.setLoop(THREE.LoopRepeat, Infinity);
      act.timeScale = s.state === 'cast' || s.state === 'attack' ? 1.25 : 1;
      act.reset().setEffectiveWeight(1).fadeIn(0.18).play();
      if (this.cur && this.cur !== act) this.cur.fadeOut(0.18);
      this.cur = act;
      this.moveEl.textContent = s.label;
      this.mv = s.state === 'cast' ? skillMove(this.hero, s.slot) : null;
      this.fx = s.state === 'cast' || s.state === 'attack';
      this.pulse.visible = s.state === 'cast'; this.orb.visible = this.fx && !HEROES[this.hero].melee;
    }
    m.mixer.update(dt);
    // gerak jurus: loncat / putar / condong
    let hop = 0, spin = 0, lean = 0;
    const mv = this.mv;
    if (mv) { const k = Math.min(1, this.stepT / (mv.t * 1.3)); if (mv.hop) hop = Math.sin(k * Math.PI) * mv.hop * 0.6; if (mv.spin) spin = k < 1 ? k * Math.PI * 2 * mv.spin : 0; if (mv.lean) lean = Math.sin(k * Math.PI) * mv.lean; }
    m.root.position.y = hop; m.root.rotation.x = lean;
    this.pivot.rotation.y = Math.sin(this.time * 0.45) * 0.55 + spin;
    const k = Math.min(1, this.stepT / 0.7);
    if (this.pulse.visible) { const sc = 0.4 + k * 2.2; this.pulse.scale.set(sc, sc, sc); this.pulse.material.opacity = 0.9 * (1 - k); }
    if (this.orb.visible) { const d = Math.min(1, Math.max(0, (this.stepT - 0.25) / 0.45)); this.orb.position.set(0.25 + d * 0.4, 1.25, 0.5 + d * 3.2); this.orb.scale.setScalar(1 + d * 1.5); this.orb.material.opacity = d > 0 && d < 1 ? 1 : 0; }
    this.gl.render(this.scene, this.cam);
  }
}
