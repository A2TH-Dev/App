# APK Bench — Marketplace APK

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
`data/apps.json` atau `templates/` lewat website GitHub. Jadi:

1. Buka `data/apps.json` di GitHub → klik ikon pensil (Edit) → ubah isinya →
   **Commit changes**.
2. Tunggu 1-2 menit. Buka tab **Actions** di repo untuk lihat progress
   ("Build site" akan berjalan, lalu commit tambahan otomatis muncul berisi
   hasil generate).
3. Refresh situsnya (hard refresh `Ctrl+Shift+R` kalau masih kelihatan lama).

**Sekali saja perlu disetel di awal:** Settings repo → **Actions** → **General**
→ scroll ke **Workflow permissions** → pilih **Read and write permissions** →
Save. Tanpa ini, Action tidak diizinkan commit balik hasil build ke repo.

## Cara pakai lewat command line (opsional, kalau prefer lokal)

1. **Edit data**, bukan HTML langsung. Semua konten (nama, deskripsi, versi, link repo, fitur) ada di satu file:
   `data/apps.json`

2. Ganti `"username"` di `apps.json` (field `repo` tiap app dan `site.githubUser`) dengan username GitHub kamu.

3. **Isi `playStoreUrl` tiap app** dengan link listing Play Store asli (setelah app di-publish ke Play Store). Kalau `playStoreUrl` diisi, tombol download otomatis jadi "Get it on Google Play" dan mengarah ke Play Store — ini jalur yang direkomendasikan (aman untuk in-app purchase & tidak memicu peringatan keamanan).

   Kalau field `playStoreUrl` dikosongkan (`""`), sistem otomatis fallback ke link APK langsung dari GitHub Releases (`repo` + `releaseTag` + `apkFile`) — pakai ini hanya untuk app yang belum/tidak dipublish ke Play Store.

4. Untuk app5–app9 (masih placeholder `GANTI_NAMA_APP`), isi field: `name`, `tagline`, `description`, `category`, `version`, `minAndroid`, `sizeMb`, `repo`, `playStoreUrl`, `features`.

4. Link download otomatis dirakit ke format:
   `https://github.com/{repo}/releases/download/{releaseTag}/{apkFile}`
   — pastikan file APK itu memang ada di GitHub Releases repo terkait dengan nama & tag yang sama persis.

5. Jalankan build:
   ```
   node build.js
   ```
   Ini akan regenerate `index.html` root + folder tiap app (`index.html` & `privacy.html`).

6. **Isi kebijakan privasi** — tiap `privacy.html` ter-generate masih berisi placeholder `GANTI:`. Edit langsung di `templates/privacy.template.html` kalau mau ubah struktur untuk semua app sekaligus, atau edit file hasil generate per-app kalau isinya beda-beda per app (tapi ingat: akan tertimpa kalau `build.js` dijalankan lagi — lebih aman taruh konten privasi spesifik di `apps.json` sebagai field baru kalau kontennya beda-beda banyak).

7. Commit & push semua isi folder ini ke branch yang dipakai GitHub Pages (biasanya `main` dengan Pages diarahkan ke root, atau branch `gh-pages`).

## Struktur file

```
data/apps.json               ← satu-satunya sumber data
templates/index.template.html
templates/app.template.html
templates/privacy.template.html
templates/partials/head.html    ← Tailwind config + font (dipakai semua halaman)
templates/partials/header.html  ← header situs
templates/partials/footer.html  ← footer situs
build.js                     ← generator statis
index.html + <slug>/         ← HASIL GENERATE, jangan edit manual (akan tertimpa)
```

## Catatan desain

- Warna aksen tiap app (`accent` di apps.json) dipakai untuk border atas kartu,
  ikon monogram, dan label kategori — ganti sesuai identitas tiap app.
- Ikon app memakai monogram inisial otomatis (2 huruf dari nama). Kalau nanti
  punya ikon PNG asli, tinggal ganti div monogram di `templates/app.template.html`
  dan `build.js` (bagian `MODULE_CARDS`) dengan tag `<img>`.
- Mockup "layar HP" di halaman app masih placeholder monogram — ganti dengan
  screenshot asli dengan menambah field `screenshot` di apps.json lalu edit
  template.
- Situs pakai Tailwind CDN (runtime, tanpa build step) — cukup untuk 9 app,
  tidak perlu Node build tools tambahan selain script `build.js` sendiri.

## Menambah app ke-10 dst

Tinggal tambah satu object baru di array `apps` pada `apps.json`, lalu `node build.js` lagi. Tidak perlu sentuh HTML/CSS.
