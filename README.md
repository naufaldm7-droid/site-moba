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
6. Host (pemain pertama) memilih mode 1v1 / 2v2 / 3v3 lalu **Mulai Proyek!** — slot kosong diisi bot.

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

## Isi versi 0.1 (sesuai GDD, mode 3v3 Blitz Site)

- **Arena** 140×70 m: lane utama, Stockyard jungle, kontainer sebagai dinding, ilalang = Stealth Bush.
- **Struktur**: Toren Air (water jet: slow + armor shred), Penangkal Petir (chain lightning 3 target, aktif setelah toren runtuh),
  Kontainer Office 3 lantai (base). Backdoor protection, super wave, overtime setelah menit 10.
- **Minion**: Kucing Penjaga (melee), Anjing Patroli (ranged), Mastiff Gerobak (siege tiap 3 gelombang).
- **Boss**: The Apex Alley Cat (menit 1:15, hadiah Shield Debu Beton), Cerberus of the Yard (menit 4, ikut push lane bersama tim pembunuh).
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
shared/data.js    data hero, item, map, balance (dipakai server & client)
client/           Three.js renderer, HUD, kontrol, SFX
tools/simtest.js  uji cepat 3v3 full-bot tanpa grafis: node tools/simtest.js
tools/make_thumbs.py  bikin thumbnail JPG dari concept art PNG
```

Balance di-tuning lewat `shared/data.js`; cek hasilnya dengan `node tools/simtest.js 20`.

## Rencana berikutnya

Mode 5v5 (3 lane), 15 hero sisanya, skin tiers, draft pick & ban, model 3D Blender (.glb) menggantikan model prosedural.
