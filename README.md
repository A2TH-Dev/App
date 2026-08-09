# APK Bench — Marketplace APK

Tema visual: dark UI modern (indigo/lavender accent, Space Grotesk + Inter,
Material Symbols) — hasil desain dari Stitch, diintegrasikan ke sistem build
data-driven. Sudah responsif (mobile → desktop) via Tailwind CSS (CDN, tanpa
proses build tambahan).

Situs statis, siap deploy ke GitHub Pages, **dalam 2 bahasa sekaligus** (ID di
root, EN di `/en/`), lengkap dengan validasi data otomatis, optimasi gambar
otomatis (JPG/PNG → WebP), sitemap, RSS feed, dan halaman PWA-ready.

```
/                       → halaman utama ID (daftar app)
/en/                    → halaman utama EN
/nitropurge/            → landing page app (ID)
/nitropurge/privacy.html
/en/nitropurge/         → landing page app (EN, privacy tetap link ke versi ID)
/about.html, /en/about.html       → halaman Tentang + kontak/lapor bug
/install.html, /en/install.html   → panduan cara install APK
/404.html, /en/404.html           → halaman 404 custom
/sitemap.xml, /robots.txt, /manifest.json, /feed.xml
```

## Edit langsung di web GitHub (tanpa install apa pun)

Project ini sudah dilengkapi GitHub Action (`.github/workflows/build.yml`) yang
otomatis menjalankan `node build.js` setiap kali kamu commit perubahan pada
`data/site.json`, `data/i18n.json`, salah satu file di `data/apps/`, atau
`templates/` lewat website GitHub. Jadi:

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

1. **Install dependency sekali saja** (Node.js 18+ wajib, buat fetch API bawaan):
   ```
   npm install
   ```
   Ini masang `sharp` (buat kompresi gambar otomatis). Kalau langkah ini
   dilewati, build tetap jalan normal — cuma gambar tidak dikompres ke WebP.

2. **Edit data**, bukan HTML langsung. Konten tiap aplikasi (nama, deskripsi,
   versi, link repo, fitur, changelog, privasi) dipecah **satu file per app**
   supaya tidak numpuk di satu file besar:
   - `data/site.json` — konfigurasi situs (brand, tagline, tentang, kontak, dll)
   - `data/i18n.json` — semua teks UI (tombol, label, nav) dalam ID & EN
   - `data/apps/nitropurge.json`, `data/apps/ember.json`, dst — satu file per app

   Tiap file app punya field `"order"` yang menentukan urutan tampil di
   homepage — angka kecil tampil lebih dulu.

3. Ganti `"username"` di `data/apps/*.json` (field `repo` tiap app) dan
   `data/site.json` (`githubUser`) dengan username GitHub kamu.

4. **Isi `playStoreUrl` tiap app** dengan link listing Play Store asli (setelah
   app di-publish). Kalau `playStoreUrl` diisi, tombol download otomatis jadi
   "Get it on Google Play". Kalau dikosongkan (`""`), sistem fallback ke link
   APK langsung dari GitHub Releases (`repo` + `releaseTag` + `apkFile`).

   Field `repo` + `releaseTag` tetap dipakai untuk mengambil **jumlah download
   asli** dari GitHub Releases API (badge di halaman app), terlepas dari apakah
   `playStoreUrl` diisi atau tidak — pastikan repo & tag itu benar-benar ada di
   GitHub kamu, kalau tidak cocok badge-nya cuma tidak muncul (tidak error).

5. Untuk app5–app9 (masih placeholder `GANTI_NAMA_APP`), isi field: `name`,
   `tagline`, `description`, `category`, `version`, `minAndroid`, `sizeMb`,
   `repo`, `playStoreUrl`, `features` di file `data/apps/app5.json` dst.

6. **(Opsional) Isi versi Inggris tiap app** — tambah field `tagline_en`,
   `description_en`, `category_en`, `features_en`, `changelog_en` kalau mau
   halaman `/en/<slug>/` menampilkan konten asli berbahasa Inggris. Kalau
   tidak diisi, otomatis fallback tampil versi Indonesia (tidak error/kosong).

7. **Screenshot & icon**: taruh file asli (JPG/PNG) di `<slug>/asset/`, isi
   path-nya di field `icon` / `screenshots` pada JSON app. `build.js` otomatis
   generate versi `.webp` yang dikompres di folder yang sama dan pakai itu di
   HTML — file asli TETAP disimpan (tidak dihapus/ditimpa), cuma dipakai
   sebagai sumber.

8. **Isi changelog (opsional)** — field `changelog` (array `{version, date,
   notes}`) di JSON app, tampil sebagai timeline "Yang Baru" di halaman app.

9. Jalankan build:
   ```
   node build.js
   ```
   Build akan **validasi data dulu** (path gambar, field wajib, slug dobel) —
   kalau ada yang salah, build berhenti dengan pesan jelas sebelum sempat
   generate/push apa pun. Kalau ada placeholder template yang datanya tidak
   terkirim, build juga akan cetak peringatan (`⚠ Placeholder {{X}} ...`) biar
   ketauan dari awal, bukan diam-diam jadi teks kosong di situs.

10. **Isi kebijakan privasi** — isi field `privacy` di `data/apps/<slug>.json`
    (lihat `nitropurge.json` sebagai contoh struktur lengkap). Privacy policy
    **selalu Bahasa Indonesia** di kedua versi situs (ID & EN) — sengaja tidak
    diterjemahkan otomatis karena risiko salah terjemah untuk dokumen legal.
    Jangan edit `privacy.html` hasil generate secara manual.

11. Commit & push semua isi folder ini (`push-to-github.bat` di Windows sudah
    otomatis jalanin `npm install` sekali kalau perlu, build, lalu push).

## Struktur file

```
data/site.json                  ← konfigurasi situs (brand, tagline, tentang, kontak)
data/i18n.json                  ← teks UI (nav, tombol, label) dalam ID & EN
data/apps/<slug>.json           ← satu file per aplikasi
templates/index.template.html
templates/app.template.html
templates/privacy.template.html ← selalu ID, tidak ada versi EN
templates/about.template.html
templates/install.template.html    ← versi ID
templates/install.en.template.html ← versi EN (konten beda total, bukan token)
templates/404.template.html
templates/partials/head.html    ← meta tags, OG/Twitter card, JSON-LD, CSS global
templates/partials/header.html  ← header + search global + toggle bahasa
templates/partials/footer.html  ← footer + tombol back-to-top
build.js                        ← generator statis, baca semua data/, tulis semua output
index.html + <slug>/ + en/      ← HASIL GENERATE, jangan edit manual (akan tertimpa)
```

## Catatan desain

- Warna aksen tiap app (`accent`) dipakai untuk border atas kartu, ikon
  monogram, dan label kategori — ganti sesuai identitas tiap app.
- Ikon app memakai monogram inisial otomatis, atau gambar asli kalau field
  `icon` diisi.
- Situs pakai Tailwind CDN (runtime, tanpa build step) — cukup untuk skala
  ini, tidak perlu Node build tools tambahan selain `build.js` sendiri.
- Situs **tidak menampilkan link source code per-app** ke publik (sengaja) —
  fungsinya cuma showcase produk + link download, bukan open-source browser.
  Link GitHub di header/footer hanya ke profil developer, bukan repo app
  manapun.
- Tidak ada analytics/tracking terpasang — sengaja, karena beberapa app yang
  dijual di sini fokus privasi.

## Menambah app ke-10 dst

Buat file baru `data/apps/<slug-baru>.json` (contoh bisa dicontek dari
`data/apps/app5.json`), isi field `"order"`, lalu `node build.js`. Tidak perlu
sentuh HTML/CSS/file app lain — termasuk tidak perlu bikin apa pun manual di
folder `en/`, itu ikut ke-generate otomatis.