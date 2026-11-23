# SITE CLASH: Laydown Legends

MOBA 3D bertema proyek EPC / konstruksi. Server berjalan di **laptop ini** (tanpa server kantor / cloud),
pemain masuk lewat **browser** di PC atau HP yang terhubung ke WiFi / hotspot yang sama.

![Denah lane](client/assets/art/site_clash_schematic_denah_lane.jpg)

## Cara main (tuan rumah / laptop server)

1. Pasang [Node.js](https://nodejs.org) 18+ (sekali saja).
2. Klik dua kali **`START_SERVER.bat`** — dependensi otomatis terpasang, server jalan di port 3000, browser terbuka.
3. Jendela server menampilkan alamat untuk perangkat lain, misalnya `http://192.168.0.181:3000`.
4. Jika Windows Firewall bertanya, pilih **Allow** untuk *Private network*.
5. Teman membuka alamat itu di browser HP / laptop (satu WiFi atau hotspot yang sama), isi nama, pilih tim & hero.
6. Host (pemain pertama) memilih mode **1v1 / 2v2 / 3v3 Blitz** atau **5v5 Full EPC** lalu **Mulai Proyek!** — slot kosong diisi bot.

Manual: `npm install` lalu `npm start`. Ganti port: `set PORT=8080 && npm start`.

## Kontrol

| | PC | HP (landscape) |
|---|---|---|
| Jalan | WASD / panah | joystick: sentuh & geser di kiri layar |
| Serang | tahan SPASI | tahan tombol ⚔ |
| Skill | Q / E / R, bidik dengan mouse, lepas untuk cast | ketuk = auto-aim, geser tombol = bidik manual, lepas di **BATAL** untuk batal |
| Recall | B | 🏠 |
| Toko / skor | P / Tab | 🛒 / 📋 |

Tips HP: buka menu browser → *Add to Home screen* supaya layar penuh.

## Mode permainan (sesuai GDD & denah)

| | 3v3 Blitz Site | 5v5 Full EPC Project |
|---|---|---|
| Map | 140×70 m, 1 lane + Stockyard jungle | 160×160 m, 3 lane (Top: Workshop Fabrikasi, Mid diagonal: Jalan Utama Laydown, Bottom: Tumpukan Kontainer) + jungle |
| Struktur per tim | Toren Air → Penangkal Petir → Base | per lane: Toren Air outer → Toren Air inner → Penangkal Petir; base terbuka saat salah satu Penangkal Petir runtuh |
| Boss | Apex Alley Cat (1:15), berganti Cerberus (4:00) | Turtle: Apex Alley Cat (1:30) · Lord: Cerberus (6:00), dua pit terpisah |
| Durasi (uji bot vs bot) | ±8–15 menit | ±11–20 menit, overtime mulai menit 15 |

Map 5v5 simetris titik (diputar 180°) supaya kedua tim adil. Bot 5v5 dibagi ke lane top / mid / bot / bot / mid.
Di map 5v5 server hanya mengirim minion & proyektil dalam radius 50 m dari hero tiap pemain, supaya WiFi laptop tidak terbebani.

## Isi versi 0.2

- **Arena**: kontainer sebagai dinding, ilalang = Stealth Bush, kontainer keliling dibuat otomatis dari batas area.
- **Struktur**: Toren Air (water jet: slow + armor shred), Penangkal Petir (chain lightning 3 target, aktif setelah toren runtuh),
  Kontainer Office 3 lantai (base). Backdoor protection, super wave, overtime setelah menit 10.
- **Minion**: Kucing Penjaga (melee), Anjing Patroli (ranged), Mastiff Gerobak (siege tiap 3 gelombang).
- **Boss**: The Apex Alley Cat (hadiah Shield Debu Beton), Cerberus of the Yard (ikut push lane terdekat bersama tim pembunuh).
- **5 hero starter** dengan pasif + 3 skill: Structural Engineer, HSE Officer, Drafter (CAD/BIM), Estimator/QS, Surveyor.
  15 hero lain tampil di lobby sebagai "segera hadir".
- **Toko 6 slot**: komponen Tier 1 → item Tier 3 EPC beserta pasifnya, quick-buy rekomendasi per hero, jual 60%.
- **Bot AI**: farming, trade, mundur & recall, beli item, ambil boss.
- **SFX prosedural** (WebAudio) memakai Asset Key dari katalog audio GDD — tanpa file .wav.
- **Rank lokal** EPC Career Ladder (Trainee → EPC Director) + Project Points, disimpan di browser masing-masing.

## Struktur kode

```
server/index.js   HTTP statis + WebSocket, lobby, loop 30 Hz
server/game.js    simulasi server-authoritative (combat, skill, struktur, minion, boss, stealth)
server/bot.js     AI bot hero
shared/data.js    data hero, item, MAPS (blitz & full: lane waypoint, struktur, pit, semak), balance
client/           Three.js renderer, HUD, kontrol, SFX
tools/simtest.js  uji cepat full-bot tanpa grafis: node tools/simtest.js [menit] [blitz|full]
tools/make_thumbs.py  bikin thumbnail JPG dari concept art PNG
```

Balance di-tuning lewat `shared/data.js`; cek hasilnya dengan `node tools/simtest.js 20 full`.

## Rencana berikutnya

15 hero sisanya, fog of war untuk 5v5, camp jungle (Genset/Comp buff), skin tiers, draft pick & ban,
model 3D Blender (.glb) menggantikan model prosedural.
