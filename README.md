# APK  Bench — Marketplace APK

Tema visual: dark UI modern (indigo/lavender accent, Space Grotesk + Inter,
Material Symbols) — hasil desain dari Stitch, diintegrasikan ke sistem build
data-driven. Sudah responsif (mobile → desktop) via Tailwind CSS (CDN, tanpa
proses build tambahan).

Situs statis, siap deploy ke GitHub Pages. Struktur URL sesuai alur yang kamu mau:

```
/                       → halaman utama (daftar 9 app)
/nitropurge/            → landing page
/nitropurge/privacy.html
/ember/ ...
/petajiwa/ ...
/petajiwa-ultimate/ ...
/app5/ ... /app9/       → placeholder, tinggal isi
```

## Edit langsung di web GitHub (tanpa install apa pun)

Project ini sudah dilengkapi GitHub Action (`.github/workflows/build.yml`) yang
otomatis menjalankan `node build.js` setiap kali kamu commit perubahan pada
`data/site.json`, salah satu file di `data/apps/`, atau `templates/` lewat
website GitHub. Jadi:

1. Buka file app yang mau diubah, mis. `data/apps/petajiwa.json`, di GitHub →
   klik ikon pensil (Edit) → ubah isinya → **Commit changes**.
2. Tunggu 1-2 menit. Buka tab **Actions** di repo untuk lihat progress
   ("Build site" akan berjalan, lalu commit tambahan otomatis muncul berisi
   hasil generate).
3. Refresh situsnya (hard refresh `Ctrl+Shift+R` kalau masih kelihatan lama).

**Sekali saja perlu disetel di awal:** Settings repo → **Actions** → **General**
→ scroll ke **Workflow permissions** → pilih **Read and write permissions** →
Save. Tanpa ini, Action tidak diizinkan commit balik hasil build ke repo.

## Cara pakai lewat command line (opsional, kalau prefer lokal)

1. **Edit data**, bukan HTML langsung. Konten tiap aplikasi (nama, deskripsi,
   versi, link repo, fitur, privasi) dipecah **satu file per app** supaya tidak
   numpuk di satu file besar:
   - `data/site.json` — konfigurasi situs (brand, tagline, dll)
   - `data/apps/nitropurge.json`, `data/apps/ember.json`, `data/apps/petajiwa.json`,
     `data/apps/petajiwa-ultimate.json`, `data/apps/app5.json` ... `app9.json`

   Tiap file app punya field `"order"` yang menentukan urutan tampil di
   homepage — angka kecil tampil lebih dulu.

2. Ganti `"username"` di `data/apps/*.json` (field `repo` tiap app) dan
   `data/site.json` (`githubUser`) dengan username GitHub kamu.

3. **Isi `playStoreUrl` tiap app** dengan link listing Play Store asli (setelah app di-publish ke Play Store). Kalau `playStoreUrl` diisi, tombol download otomatis jadi "Get it on Google Play" dan mengarah ke Play Store — ini jalur yang direkomendasikan (aman untuk in-app purchase & tidak memicu peringatan keamanan).

   Kalau field `playStoreUrl` dikosongkan (`""`), sistem otomatis fallback ke link APK langsung dari GitHub Releases (`repo` + `releaseTag` + `apkFile`) — pakai ini hanya untuk app yang belum/tidak dipublish ke Play Store.

4. Untuk app5–app9 (masih placeholder `GANTI_NAMA_APP`), isi field: `name`, `tagline`, `description`, `category`, `version`, `minAndroid`, `sizeMb`, `repo`, `playStoreUrl`, `features` di file `data/apps/app5.json` dst.

5. Link download otomatis dirakit ke format:
   `https://github.com/{repo}/releases/download/{releaseTag}/{apkFile}`
   — pastikan file APK itu memang ada di GitHub Releases repo terkait dengan nama & tag yang sama persis.

6. Jalankan build:
   ```
   node build.js
   ```
   Ini akan regenerate `index.html` root + folder tiap app (`index.html` & `privacy.html`).

7. **Isi kebijakan privasi** — isi field `privacy` di file `data/apps/<slug>.json`
   masing-masing app (lihat `data/apps/nitropurge.json` atau `data/apps/petajiwa.json`
   sebagai contoh struktur lengkapnya: `dataCollectedIntro`, `dataCollectedList`,
   `dataCollectedNote`, `dataUsage`, `dataSharing`, `permissions`, `permissionsNote`,
   `contactName`, `contactEmail`). Kalau field `privacy` belum diisi, `privacy.html`
   ter-generate otomatis berisi placeholder `GANTI:`. Untuk ubah *struktur/layout*
   halaman privasi untuk semua app sekaligus, edit `templates/privacy.template.html`.
   Jangan edit `privacy.html` hasil generate secara manual — akan tertimpa tiap
   `build.js` dijalankan lagi.

8. Commit & push semua isi folder ini ke branch yang dipakai GitHub Pages (biasanya `main` dengan Pages diarahkan ke root, atau branch `gh-pages`).

## Struktur file

```
data/site.json                  ← konfigurasi situs (brand, tagline, dll)
data/apps/<slug>.json           ← satu file per aplikasi (nama, deskripsi, fitur, privasi, dll)
templates/index.template.html
templates/app.template.html
templates/privacy.template.html
templates/partials/head.html    ← Tailwind config + font (dipakai semua halaman)
templates/partials/header.html  ← header situs
templates/partials/footer.html  ← footer situs
build.js                        ← generator statis (baca data/site.json + data/apps/*.json)
index.html + <slug>/            ← HASIL GENERATE, jangan edit manual (akan tertimpa)
```

## Catatan desain

- Warna aksen tiap app (`accent` di `data/apps/<slug>.json`) dipakai untuk border atas kartu,
  ikon monogram, dan label kategori — ganti sesuai identitas tiap app.
- Ikon app memakai monogram inisial otomatis (2 huruf dari nama), atau gambar
  asli kalau field `icon` diisi (path relatif dari folder app, mis. `asset/icon.png`).
- Screenshot galeri & mockup layar HP diisi lewat field `screenshots` (array path)
  di file app terkait.
- Situs pakai Tailwind CDN (runtime, tanpa build step) — cukup untuk 9 app,
  tidak perlu Node build tools tambahan selain script `build.js` sendiri.

## Menambah app ke-10 dst

Tinggal buat file baru `data/apps/<slug-baru>.json` (contoh isi bisa dicontek dari
`data/apps/app5.json`), isi field `"order"` sesuai posisi yang diinginkan di
homepage, lalu jalankan `node build.js` lagi. Tidak perlu sentuh HTML/CSS/file app lain.
