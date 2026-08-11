#!/usr/bin/env node
/**
 * APK Bench — build.js
 * Baca data/apps.json + templates/*.html (+ templates/partials/*.html),
 * generate index.html root, <slug>/index.html, <slug>/privacy.html.
 *
 * Jalankan: node build.js
 */
const fs = require('fs');
const path = require('path');
let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  // sharp belum ke-install — build tetap jalan, cuma optimasi gambar dilewati
  // (lihat pesan peringatan yang dicetak nanti di optimizeImage()).
}

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// data/site.json = konfigurasi situs (brand, tagline, dll).
// data/apps/<slug>.json = satu file per aplikasi, biar tidak numpuk di 1 file besar.
// Urutan tampil di homepage mengikuti field "order" di tiap file (kalau tidak ada, urut nama file).
const site = JSON.parse(read('data/site.json'));
const i18n = JSON.parse(read('data/i18n.json'));
const appsDir = path.join(ROOT, 'data/apps');
const appFiles = fs.readdirSync(appsDir).filter((f) => f.endsWith('.json'));
const apps = appFiles
  .map((f) => JSON.parse(fs.readFileSync(path.join(appsDir, f), 'utf8')))
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.slug.localeCompare(b.slug));
const data = { site, apps };

// map nama kategori ID <-> EN, dibangun dari pasangan category/category_en tiap app
// (dipakai buat nentuin URL yang benar pas toggle bahasa di halaman kategori,
// karena slug kategori beda antar bahasa — "keuangan" vs "finance").
const categoryNameIdToEn = new Map();
const categoryNameEnToId = new Map();
for (const app of apps) {
  if (app.category && app.category_en) {
    categoryNameIdToEn.set(app.category, app.category_en);
    categoryNameEnToId.set(app.category_en, app.category);
  }
}


const partialHead = read('templates/partials/head.html');
const partialHeader = read('templates/partials/header.html');
const partialFooter = read('templates/partials/footer.html');

const idxTpl = read('templates/index.template.html');
const appTpl = read('templates/app.template.html');
const privTpl = read('templates/privacy.template.html');
const notFoundTpl = read('templates/404.template.html');
const aboutTpl = read('templates/about.template.html');
const installTpl = read('templates/install.template.html');
const categoryTpl = read('templates/category.template.html');
const installEnTpl = read('templates/install.en.template.html');

const buildDate = new Date().toISOString().slice(0, 10);
const year = new Date().getFullYear();

const FEATURE_ICONS = ['bolt', 'shield', 'memory', 'speed', 'verified', 'tune', 'rocket_launch', 'security'];

const missingKeysWarned = new Set();
function fill(tpl, map) {
  return tpl.replace(/{{(\w+)}}/g, (_, key) => {
    if (key in map) return String(map[key]);
    if (!missingKeysWarned.has(key)) {
      console.log(`⚠ Placeholder {{${key}}} dipakai di template tapi tidak ada di data yang dikirim — jadi kosong diam-diam. Cek build.js.`);
      missingKeysWarned.add(key);
    }
    return '';
  });
}

function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function releaseUrl(app) {
  return `https://github.com/${app.repo}/releases/download/${app.releaseTag}/${app.apkFile}`;
}

// ---------- icon & screenshot helpers ----------
// app.icon / app.screenshots di data/apps.json diisi path RELATIF DARI FOLDER APP,
// mis. "asset/icon.png" untuk file di App/nitropurge/asset/icon.png.
// prefix ditambahkan di depan supaya path tetap benar dipakai dari halaman app
// itu sendiri (prefix '') maupun dari root index.html (prefix '<slug>/').
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function slugifyCategory(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// ---------- optimasi gambar: resize + convert ke WebP ----------
// Sumber asli (jpg/png di <slug>/asset/...) TETAP ADA di disk (tidak dihapus/ditimpa),
// cuma dilewati saat commit (lihat .gitignore). Yang di-generate & di-commit adalah
// versi .webp di lokasi yang sama. Hasilnya di-cache: kalau file .webp sudah ada dan
// lebih baru dari sumbernya, tidak diproses ulang (build tetap cepat).
let sharpWarned = false;
async function optimizeImage(app, relPath, maxWidth, quality) {
  if (!relPath) return relPath;
  const ext = path.extname(relPath).toLowerCase();
  if (ext === '.webp') return relPath; // sudah webp, tidak perlu diproses
  const webpRelPath = relPath.slice(0, -ext.length) + '.webp';

  if (!sharp) {
    if (!sharpWarned) {
      console.log('⚠ sharp belum ke-install (jalankan "npm install" sekali) — gambar dipakai apa adanya, tanpa kompresi.');
      sharpWarned = true;
    }
    return relPath;
  }

  const srcPath = path.join(ROOT, app.slug, relPath);
  const outPath = path.join(ROOT, app.slug, webpRelPath);
  if (!fs.existsSync(srcPath)) return relPath; // biar tidak error kalau file belum ada

  try {
    const srcStat = fs.statSync(srcPath);
    const outExists = fs.existsSync(outPath);
    if (outExists && fs.statSync(outPath).mtimeMs > srcStat.mtimeMs) {
      return webpRelPath; // cache masih valid, tidak perlu proses ulang
    }
    await sharp(srcPath)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality })
      .toFile(outPath);
    return webpRelPath;
  } catch (e) {
    console.log(`⚠ Gagal optimasi ${app.slug}/${relPath}: ${e.message} — dipakai apa adanya.`);
    return relPath;
  }
}

async function optimizeAppImages(app) {
  if (app.icon) app.icon = await optimizeImage(app, app.icon, 512, 90);
  if (app.banner) app.banner = await optimizeImage(app, app.banner, 1024, 85);
  if (app.heroScreenshot) app.heroScreenshot = await optimizeImage(app, app.heroScreenshot, 900, 82);
  if (app.screenshots && app.screenshots.length) {
    app.screenshots = await Promise.all(app.screenshots.map((s) => optimizeImage(app, s, 800, 80)));
  }
}

// sizePx: {w,h} dalam px buat atribut width/height (cegah layout shift saat gambar
// belum kebaca), tidak mempengaruhi ukuran tampil karena class Tailwind tetap menang.
function iconBlock(app, prefix, sizeClass, sizePx, eager) {
  if (!app.icon) return null;
  const loadingAttr = eager ? '' : ' loading="lazy"';
  const dims = sizePx ? ` width="${sizePx.w}" height="${sizePx.h}"` : '';
  return `<img src="${esc(prefix + app.icon)}" alt="${esc(app.name)} icon"${dims}${loadingAttr} class="${sizeClass} rounded-xl object-cover shadow-2xl" />`;
}

function screenshotGallery(app, prefix, t) {
  const shots = app.screenshots;
  if (!shots || !shots.length) return '';
  const renderItem = (src, i) =>
    `<img src="${esc(prefix + src)}" alt="${esc(app.name)} screenshot ${i + 1}" loading="lazy" width="192" height="405" class="w-40 md:w-48 aspect-[9/19] object-cover rounded-2xl border border-outline-variant/30 shadow-lg flex-shrink-0" />`;
  // Track digandakan 2x supaya animasi translateX(-50%) loop mulus tanpa jeda.
  const trackOnce = shots.map(renderItem).join('\n          ');
  const trackTwice = trackOnce + '\n          ' + trackOnce;
  const durationSec = Math.max(shots.length * 4, 20);
  return `<!-- Screenshots -->
      <div class="mb-32">
        <div class="flex items-center gap-unit-sm mb-unit-lg">
          <div class="h-[1px] w-8 bg-primary"></div>
          <span class="text-label-md font-label-md text-primary uppercase tracking-[0.2em]">${t.sectionScreenshot}</span>
        </div>
        <div class="relative left-1/2 overflow-hidden" style="width:min(1200px,88vw);transform:translateX(-50%);-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);">
          <div class="flex gap-unit-md screenshot-track" style="width:max-content;animation:screenshot-scroll ${durationSec}s linear infinite;">
          ${trackTwice}
          </div>
        </div>
      </div>
      <style>
        @keyframes screenshot-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .screenshot-track:hover { animation-play-state: paused; }
      </style>`;
}

// Mockup HP di hero: pakai app.heroScreenshot kalau diisi, kalau tidak pakai
// screenshot pertama di app.screenshots, kalau tidak ada sama sekali baru pakai icon.
function phoneMockupBlock(app, prefix) {
  const src = app.heroScreenshot || (app.screenshots && app.screenshots[0]);
  if (src) {
    return `<img src="${esc(prefix + src)}" alt="${esc(app.name)} preview" width="224" height="473" class="w-full h-full object-cover" />`;
  }
  return iconBlock(app, prefix, 'w-20 h-20', { w: 80, h: 80 }, true);
}

// ---------- privacy policy helpers ----------
// Field app.privacy di data/apps.json (opsional) dipakai untuk mengisi
// templates/privacy.template.html. Kalau app belum punya app.privacy,
// dipakai teks placeholder "GANTI:" supaya jelas belum diisi.
function paragraphs(text) {
  // Terima string biasa (dibungkus <p>) atau array of string (tiap item -> <p>).
  // Boleh mengandung tag inline sederhana seperti <strong>, <em>, <code>, <a>.
  const items = Array.isArray(text) ? text : [text];
  return items
    .map((t) => `<p class="font-body-lg text-body-lg text-on-surface-variant mb-unit-md">${t}</p>`)
    .join('\n            ');
}

function bulletList(items) {
  if (!items || !items.length) return '';
  const lis = items.map((li) => `<li>${li}</li>`).join('\n              ');
  return `<ul class="list-disc pl-6 font-body-md text-body-md text-on-surface-variant space-y-1 mb-unit-md">\n              ${lis}\n            </ul>`;
}

function permissionsTable(rows) {
  if (!rows || !rows.length) return '';
  const trs = rows
    .map(
      (r) =>
        `<tr><td class="py-unit-sm pr-unit-md">${r.name}</td><td class="py-unit-sm">${r.use}</td></tr>`
    )
    .join('\n                  ');
  return `<div class="overflow-x-auto mb-unit-lg">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-outline-variant/20">
                    <th class="py-unit-sm pr-unit-md font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Izin</th>
                    <th class="py-unit-sm font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Dipakai Untuk</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/10 font-body-sm text-body-sm text-on-surface-variant">
                  ${trs}
                </tbody>
              </table>
            </div>`;
}

function buildPrivacySections(app) {
  const p = app.privacy;
  if (!p) {
    const fallback = (msg) => paragraphs(msg);
    return {
      PRIVACY_DATA_COLLECTED: fallback(
        'GANTI: jelaskan data apa saja yang dikumpulkan aplikasi ini (mis. tidak ada, data lokal saja, izin kamera, dsb).'
      ),
      PRIVACY_DATA_USAGE: fallback('GANTI: jelaskan tujuan penggunaan data, jika ada.'),
      PRIVACY_DATA_SHARING: fallback(
        'GANTI: jelaskan apakah data dibagikan ke pihak ketiga (mis. analitik, iklan) dan pihak mana saja.'
      ),
      PRIVACY_PERMISSIONS: `<p class="font-body-md text-body-md text-on-surface-variant mb-unit-lg">GANTI: daftar izin Android yang diminta dan alasannya.</p>`,
      PRIVACY_CONTACT: '',
    };
  }

  const dataCollected =
    paragraphs(p.dataCollectedIntro) +
    (p.dataCollectedList ? '\n            ' + bulletList(p.dataCollectedList) : '') +
    (p.dataCollectedNote ? '\n            ' + paragraphs(p.dataCollectedNote) : '');

  const dataSharing = paragraphs(p.dataSharing);

  const permissions =
    permissionsTable(p.permissions) +
    (p.permissionsNote
      ? `\n            <p class="font-body-sm text-body-sm text-on-surface-variant mb-unit-lg">${p.permissionsNote}</p>`
      : '');

  const contact = p.contactName
    ? `<p class="font-body-sm text-body-sm text-on-surface-variant mb-unit-lg">Kontak: <strong>${esc(
        p.contactName
      )}</strong>${p.contactEmail ? ` — <a class="text-primary hover:underline" href="mailto:${esc(p.contactEmail)}">${esc(p.contactEmail)}</a>` : ''}</p>`
    : '';

  return {
    PRIVACY_DATA_COLLECTED: dataCollected,
    PRIVACY_DATA_USAGE: paragraphs(p.dataUsage),
    PRIVACY_DATA_SHARING: dataSharing,
    PRIVACY_PERMISSIONS: permissions,
    PRIVACY_CONTACT: contact,
  };
}

function downloadUrl(app) {
  return app.playStoreUrl ? app.playStoreUrl : releaseUrl(app);
}

function isPlayStore(app) {
  return Boolean(app.playStoreUrl);
}

// ---------- changelog (opsional, isi field "changelog" di data/apps/<slug>.json) ----------
// Format: [{ "version": "1.0.3", "date": "2026-07-20", "notes": ["...", "..."] }, ...]
function buildChangelog(entries, t) {
  if (!entries || !entries.length) return '';
  const items = entries
    .map((entry, i) => {
      const notes = (entry.notes || [])
        .map((n) => `<li class="text-body-sm font-body-sm text-on-surface-variant">${n}</li>`)
        .join('\n              ');
      const isLatest = i === 0;
      return `<div class="relative pl-unit-xl pb-unit-lg last:pb-0">
            <div class="absolute left-0 top-1 w-3 h-3 rounded-full ${isLatest ? 'bg-primary' : 'bg-surface-container-highest'}"></div>
            <div class="absolute left-[5px] top-4 bottom-0 w-[2px] bg-surface-container-highest last:hidden"></div>
            <div class="flex items-center gap-unit-sm mb-unit-xs flex-wrap">
              <span class="text-body-md font-body-md text-on-surface font-semibold">v${entry.version}</span>
              ${isLatest ? `<span class="text-label-sm font-label-sm text-primary bg-primary/10 px-unit-sm py-[2px] rounded-full">${t.changelogLatest}</span>` : ''}
              <span class="text-label-sm font-label-sm text-on-surface-variant">${entry.date || ''}</span>
            </div>
            <ul class="list-disc pl-5 space-y-1">
              ${notes}
            </ul>
          </div>`;
    })
    .join('\n          ');
  return `<!-- Changelog -->
      <div class="mb-32 reveal">
        <div class="flex items-center gap-unit-sm mb-unit-lg">
          <div class="h-[1px] w-8 bg-primary"></div>
          <span class="text-label-md font-label-md text-primary uppercase tracking-[0.2em]">${t.sectionChangelog}</span>
        </div>
        <div class="max-w-2xl">
          ${items}
        </div>
      </div>`;
}

// ---------- jumlah download asli dari GitHub Releases ----------
// Fetch sekali per repo (bukan per app, App bisa punya 2+ apps di 1 repo kalau mau),
// di-cache 1 jam ke data/.download-cache.json biar tidak boros API call / kena rate limit
// pas build berkali-kali dalam waktu singkat. Kalau fetch gagal (offline, rate limit,
// dsb.) build TETAP jalan normal, badge download cuma tidak muncul untuk app itu.
const DOWNLOAD_CACHE_PATH = path.join(ROOT, 'data', '.download-cache.json');
const DOWNLOAD_CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam

// ---------- validasi data sebelum build ----------
// Nangkep typo/data rusak (path gambar salah, field wajib kosong, slug dobel)
// SEBELUM sempat ke-generate & ke-push, bukan diam-diam dilewati.
function validateData(apps) {
  const errors = [];
  const seenSlugs = new Set();
  const requiredFields = ['name', 'slug', 'category', 'accent', 'tagline', 'description', 'version', 'minAndroid', 'sizeMb'];

  for (const app of apps) {
    const label = app.slug || app.name || '(tanpa slug/nama)';

    for (const field of requiredFields) {
      if (app[field] === undefined || app[field] === null || app[field] === '') {
        errors.push(`${label}: field "${field}" kosong/tidak ada`);
      }
    }

    if (!app.repo && !app.playStoreUrl) {
      errors.push(`${label}: butuh salah satu dari "repo" atau "playStoreUrl" (buat link download)`);
    }

    if (app.slug) {
      if (seenSlugs.has(app.slug)) {
        errors.push(`slug "${app.slug}" dipakai lebih dari satu app (harus unik)`);
      }
      seenSlugs.add(app.slug);
    }

    if (app.accent && !/^#[0-9a-fA-F]{6}$/.test(app.accent)) {
      errors.push(`${label}: "accent" harus format hex 6 digit (contoh: #6C4DFF), sekarang: "${app.accent}"`);
    }

    const imagePaths = [];
    if (app.icon) imagePaths.push(app.icon);
    if (app.heroScreenshot) imagePaths.push(app.heroScreenshot);
    if (app.screenshots) imagePaths.push(...app.screenshots);
    for (const rel of imagePaths) {
      const full = path.join(ROOT, app.slug || '', rel);
      if (!fs.existsSync(full)) {
        errors.push(`${label}: gambar "${rel}" tidak ditemukan di ${app.slug}/${rel} (cek typo path?)`);
      }
    }
  }

  if (errors.length) {
    console.error(`\n[VALIDASI GAGAL] ${errors.length} masalah ditemukan di data/apps/*.json:\n`);
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    console.error('\nPerbaiki dulu sebelum build lanjut.\n');
    process.exit(1);
  }
}

function readDownloadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(DOWNLOAD_CACHE_PATH, 'utf8'));
    if (Date.now() - raw.fetchedAt < DOWNLOAD_CACHE_TTL_MS) return raw.counts || {};
  } catch (e) {
    // belum ada cache atau rusak, lanjut fetch fresh
  }
  return null;
}

function writeDownloadCache(counts) {
  try {
    fs.writeFileSync(DOWNLOAD_CACHE_PATH, JSON.stringify({ fetchedAt: Date.now(), counts }, null, 2));
  } catch (e) {
    // gagal nulis cache bukan masalah fatal, lewati saja
  }
}

async function fetchDownloadCount(app) {
  if (!app.repo || !app.releaseTag) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://api.github.com/repos/${app.repo}/releases/tags/${app.releaseTag}`, {
      headers: { 'User-Agent': 'apk-bench-build', Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const assets = json.assets || [];
    return assets.reduce((sum, a) => sum + (a.download_count || 0), 0);
  } catch (e) {
    return null;
  }
}

function formatDownloadCount(n, lang) {
  if (lang === 'en') {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
  }
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}JT`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}RB`;
  return String(n);
}

async function getDownloadCounts(apps) {
  const cached = readDownloadCache();
  if (cached) {
    console.log('↺ Pakai cache jumlah download (< 1 jam terakhir)');
    return cached;
  }
  console.log('↻ Mengambil jumlah download dari GitHub Releases...');
  const results = await Promise.all(
    apps.map(async (app) => [app.slug, await fetchDownloadCount(app)])
  );
  const counts = Object.fromEntries(results);
  writeDownloadCache(counts);
  return counts;
}

function buildJsonLd(app, pageUrl, imageUrl, lang) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: (lang === 'en' && app.name_en) || app.name,
    description: (lang === 'en' && app.tagline_en) || app.tagline,
    applicationCategory: (lang === 'en' && app.category_en) || app.category,
    operatingSystem: `Android ${app.minAndroid}+`,
    softwareVersion: app.version,
    fileSize: `${app.sizeMb}MB`,
    url: pageUrl,
    image: imageUrl,
    inLanguage: lang,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

function buildHead(map) { return fill(partialHead, map); }
function buildHeader(map) { return fill(partialHeader, map); }
function buildFooter(map) { return fill(partialFooter, map); }

// ---------- generate satu app (index.html + privacy.html) untuk 1 bahasa ----------
function generateAppPage(app, lang, ctx) {
  const { t, outRoot, siteUrlLang, downloadCounts, appsIndexJsonLang, siteFooterNote } = ctx;
  const dir = path.join(outRoot, app.slug);
  fs.mkdirSync(dir, { recursive: true });

  const initialsStr = app.initials || initials(app.name);

  const appName = (lang === 'en' && app.name_en) || app.name;
  const appTagline = (lang === 'en' && app.tagline_en) || app.tagline;
  const appDescription = (lang === 'en' && app.description_en) || app.description;
  const appFeatures = (lang === 'en' && app.features_en) || app.features;
  const appCategory = (lang === 'en' && app.category_en) || app.category;
  const appChangelog = (lang === 'en' && app.changelog_en) || app.changelog;

  const langSwitchUrl = lang === 'id' ? `../en/${app.slug}/` : `../../${app.slug}/`;

  const siteMap = {
    SITE_BRAND: data.site.brand,
    GITHUB_USER: data.site.githubUser,
    APP_COUNT: data.apps.length,
    YEAR: year,
    ROOT_PATH: '../',
    SITE_ROOT_ABS: `${data.site.siteUrl}/`,
    APPS_INDEX_JSON: appsIndexJsonLang,
    LANG_SWITCH_URL: langSwitchUrl,
    I18N_NAV_APPS: t.navApps,
    I18N_NAV_INSTALL: t.navInstall,
    I18N_NAV_ABOUT: t.navAbout,
    I18N_NAV_GITHUB: t.navGithub,
    I18N_SEARCH_PLACEHOLDER: t.searchPlaceholder,
    I18N_SEARCH_NO_RESULTS: t.searchNoResults,
    I18N_SEARCH_ARIA: t.searchAria,
    I18N_MENU_ARIA: t.menuAria,
    I18N_BACK_TO_TOP_ARIA: t.backToTopAria,
    I18N_LANG_SWITCH: t.langSwitch,
    I18N_LANG_SWITCH_ARIA: t.langSwitchAria,
    SITE_FOOTER_NOTE: siteFooterNote,
  };

  const featureCards = appFeatures
    .map((f, i) => {
      const icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
      return `<div class="p-unit-lg rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors group">
          <div class="w-12 h-12 rounded-lg bg-surface-container-highest flex items-center justify-center mb-unit-lg group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-primary text-[28px]">${icon}</span>
          </div>
          <h3 class="text-headline-md font-headline-md text-on-surface mb-unit-xs">${f}</h3>
        </div>`;
    })
    .join('\n        ');

  // Gambar app cuma disimpan fisik di <slug>/asset/... (tidak diduplikasi ke en/<slug>/asset/).
  // Halaman ID ada di kedalaman yang sama (../<slug>/asset/... == asset/... dari dalam <slug>/),
  // tapi halaman EN 1 folder lebih dalam (en/<slug>/) jadi butuh path relatif naik 2 tingkat dulu.
  const imgPrefix = lang === 'id' ? '' : `../../${app.slug}/`;
  const initialsDivHero = `<div class="w-24 h-24 rounded-xl flex items-center justify-center text-2xl font-bold shadow-2xl" style="background:${app.accent}22;color:${app.accent}">${initialsStr}</div>`;
  const initialsDivPhone = `<div class="w-20 h-20 rounded-3xl flex items-center justify-center text-2xl font-bold" style="background:${app.accent}22;color:${app.accent}">${initialsStr}</div>`;

  const appImage = app.banner
    ? `${data.site.siteUrl}/${app.slug}/${app.banner}`
    : app.icon
    ? `${data.site.siteUrl}/${app.slug}/${app.icon}`
    : `${data.site.siteUrl}/favicon.svg`;
  const bannerBlock = app.banner
    ? `<img src="${esc(imgPrefix + app.banner)}" alt="${esc(appName)} banner" loading="eager" width="1024" height="500" class="w-full rounded-2xl object-cover mb-32 shadow-xl" style="aspect-ratio:1024/500"/>`
    : '';

  const otherApps = data.apps.filter((a) => a.slug !== app.slug).slice(0, 4);
  const otherAppsCards = otherApps
    .map((oa) => {
      const oaName = (lang === 'en' && oa.name_en) || oa.name;
      const oaCategory = (lang === 'en' && oa.category_en) || oa.category;
      const oaInitials = oa.initials || initials(oa.name);
      const oaIconPrefix = lang === 'id' ? `../${oa.slug}/` : `../../${oa.slug}/`;
      const oaIcon =
        iconBlock(oa, oaIconPrefix, 'w-12 h-12', { w: 48, h: 48 }) ||
        `<div class="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold" style="background:${oa.accent}22;color:${oa.accent}">${oaInitials}</div>`;
      return `<a href="../${oa.slug}/" class="group flex items-center gap-unit-md p-unit-md rounded-xl bg-surface-container-low hover:bg-surface-container transition-all duration-300 hover:-translate-y-1" style="border-top:2px solid ${oa.accent}">
          ${oaIcon}
          <div class="min-w-0">
            <div class="text-body-md font-body-md text-on-surface group-hover:text-primary transition-colors truncate">${oaName}</div>
            <div class="text-label-sm font-label-sm text-on-surface-variant truncate">${oaCategory}</div>
          </div>
        </a>`;
    })
    .join('\n        ');

  // Privacy policy cuma ada dalam Bahasa Indonesia (tidak diterjemahkan otomatis —
  // dokumen legal berisiko kalau salah terjemah). Versi EN tetap link ke halaman ID-nya.
  const appPrivacyUrl = lang === 'id' ? 'privacy.html' : `../../${app.slug}/privacy.html`;

  const commonMap = {
    ...siteMap,
    APP_NAME: appName,
    APP_TAGLINE: appTagline,
    APP_DESCRIPTION: appDescription,
    APP_CATEGORY: appCategory,
    APP_VERSION: app.version,
    APP_MIN_ANDROID: app.minAndroid,
    APP_SIZE_MB: app.sizeMb,
    APP_REPO: app.repo,
    APP_ACCENT: app.accent,
    APP_INITIALS: initialsStr,
    APP_PRIVACY_URL: appPrivacyUrl,
    APP_DOWNLOAD_URL: downloadUrl(app),
    APP_DOWNLOAD_LABEL: isPlayStore(app) ? 'Get it on Google Play' : (lang === 'en' ? 'Download APK' : 'Unduh APK'),
    APP_DOWNLOAD_ICON: isPlayStore(app) ? 'shop' : 'download',
    FEATURE_CARDS: featureCards,
    BUILD_DATE: buildDate,
    APP_ICON_HERO: iconBlock(app, imgPrefix, 'w-24 h-24', { w: 96, h: 96 }, true) || initialsDivHero,
    APP_ICON_PHONE: phoneMockupBlock(app, imgPrefix) || initialsDivPhone,
    SCREENSHOT_GALLERY: screenshotGallery(app, imgPrefix, t),
    OTHER_APPS_CARDS: otherAppsCards,
    BANNER_BLOCK: bannerBlock,
    BREADCRUMB_CATEGORY_URL: `../?category=${encodeURIComponent(appCategory)}`,
    CHANGELOG_SECTION: buildChangelog(appChangelog, t),
    I18N_SKIP_LINK: t.skipLink,
    I18N_PRIVACY_LABEL: t.privacyPolicyLabel,
    I18N_INSTALL_HELP_LINK: t.installHelpLink,
    I18N_SECTION_ABOUT: t.sectionAbout,
    I18N_SECTION_SPECS: t.sectionSpecs,
    I18N_SPEC_VERSION: t.specVersion,
    I18N_SPEC_MIN_ANDROID: t.specMinAndroid,
    I18N_SPEC_SIZE: t.specSize,
    I18N_SPEC_UPDATED: t.specUpdated,
    I18N_SECTION_OTHER_APPS: t.sectionOtherApps,
    LANG_ATTR: lang,
    DOWNLOAD_BADGE: (() => {
      const count = downloadCounts[app.slug];
      if (count === null || count === undefined) return '';
      return `<div class="flex items-center gap-unit-xs px-unit-sm py-unit-xs bg-surface-container-high rounded-full">
              <span class="material-symbols-outlined text-primary text-[16px]">download</span>
              <span class="font-label-sm text-label-sm text-on-surface">${formatDownloadCount(count, lang)} ${t.downloadsSuffix}</span>
            </div>`;
    })(),
    ...buildPrivacySections(app),
  };

  const appPageMap = {
    ...commonMap,
    PAGE_TITLE: `${appName} — ${data.site.brand}`,
    PAGE_DESCRIPTION: appTagline,
    PAGE_URL: `${siteUrlLang}/${app.slug}/`,
    PAGE_IMAGE: appImage,
    JSONLD: buildJsonLd(app, `${siteUrlLang}/${app.slug}/`, appImage, lang),
  };

  const header = buildHeader(siteMap);
  const footer = buildFooter(siteMap);
  const headApp = buildHead(appPageMap);

  fs.writeFileSync(
    path.join(dir, 'index.html'),
    fill(appTpl, { ...appPageMap, HEAD: headApp, HEADER: header, FOOTER: footer })
  );

  // privacy.html cuma di-generate untuk bahasa Indonesia (lihat catatan appPrivacyUrl di atas)
  if (lang === 'id') {
    const privacyPageMap = {
      ...commonMap,
      PAGE_TITLE: `Kebijakan Privasi — ${app.name}`,
      PAGE_DESCRIPTION: `Kebijakan privasi untuk ${app.name}.`,
      PAGE_URL: `${siteUrlLang}/${app.slug}/privacy.html`,
      PAGE_IMAGE: appImage,
      JSONLD: '', // halaman kebijakan privasi tidak butuh structured data SoftwareApplication
    };
    const headPrivacy = buildHead(privacyPageMap);
    fs.writeFileSync(
      path.join(dir, 'privacy.html'),
      fill(privTpl, { ...privacyPageMap, HEAD: headPrivacy, HEADER: header, FOOTER: footer })
    );
  }

  console.log(`✓ [${lang}] ${app.slug}/index.html${lang === 'id' ? ' + privacy.html' : ''}`);
}

// ---------- generate seluruh situs untuk 1 bahasa (id atau en) ----------
function generateSite(lang, downloadCounts) {
  const t = i18n[lang];
  const outRoot = lang === 'id' ? ROOT : path.join(ROOT, 'en');
  const siteUrlLang = lang === 'id' ? data.site.siteUrl : `${data.site.siteUrl}/en`;
  const siteTagline = (lang === 'en' && data.site.taglineEn) || data.site.tagline;
  const siteFooterNote = (lang === 'en' && data.site.footerNoteEn) || data.site.footerNote;
  fs.mkdirSync(outRoot, { recursive: true });

  const appsIndexJsonLang = JSON.stringify(
    data.apps.map((a) => ({
      name: (lang === 'en' && a.name_en) || a.name,
      slug: a.slug,
      category: (lang === 'en' && a.category_en) || a.category,
      accent: a.accent,
    }))
  );

  const ctx = { t, outRoot, siteUrlLang, downloadCounts, appsIndexJsonLang, siteFooterNote };
  for (const app of data.apps) {
    generateAppPage(app, lang, ctx);
  }

  // depthFromLangRoot: 0 buat homepage (kartu langsung di root bahasa), 2 buat halaman
  // kategori (kategori/<cat>/ atau en/category/<cat>/, 2 folder lebih dalam).
  function renderAppCard(app, depthFromLangRoot) {
    const appName = (lang === 'en' && app.name_en) || app.name;
    const appTagline = (lang === 'en' && app.tagline_en) || app.tagline;
    const appCategory = (lang === 'en' && app.category_en) || app.category;
    const initialsStr = app.initials || initials(app.name);
    const up = '../'.repeat(depthFromLangRoot);
    const hrefToApp = `${up}${app.slug}/`;
    const iconDepthFromTrueRoot = depthFromLangRoot + (lang === 'en' ? 1 : 0);
    const cardIconPrefix = '../'.repeat(iconDepthFromTrueRoot) + `${app.slug}/`;
    const iconHtml =
      iconBlock(app, cardIconPrefix, 'w-16 h-16', { w: 64, h: 64 }) ||
      `<div class="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold" style="background:${app.accent}22;color:${app.accent}">${initialsStr}</div>`;
    return `<a href="${hrefToApp}" data-name="${esc(appName.toLowerCase())}" data-category="${esc(appCategory)}" class="group relative bg-surface-container-low p-unit-lg rounded-xl transition-all duration-300 hover:bg-surface-container hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 block" style="border-top:2px solid ${app.accent}">
        <div class="flex justify-between items-start mb-unit-lg">
          ${iconHtml}
          <span class="font-label-sm text-label-sm px-unit-sm py-unit-xs bg-surface-container-highest text-on-surface-variant rounded-full">v${app.version}</span>
        </div>
        <h3 class="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors">${appName}</h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-unit-xs line-clamp-1">${appTagline}</p>
        <div class="mt-unit-xl flex items-center justify-between">
          <span class="px-unit-sm py-[2px] font-label-sm text-[10px] uppercase tracking-wider rounded" style="background:${app.accent}1a;color:${app.accent}">${appCategory}</span>
          <span class="font-body-sm text-body-sm text-on-tertiary-fixed-variant">${app.sizeMb} MB</span>
        </div>
      </a>`;
  }

  // ---------- root marketplace page ----------
  const cards = data.apps.map((app) => renderAppCard(app, 0)).join('\n      ');

  const categories = [...new Set(data.apps.map((a) => (lang === 'en' && a.category_en) || a.category))].sort();
  const categoryOptions = categories
    .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
    .join('\n        ');

  const rootLangSwitchUrl = lang === 'id' ? 'en/' : '../';

  const rootSiteMap = {
    SITE_BRAND: data.site.brand,
    GITHUB_USER: data.site.githubUser,
    APP_COUNT: data.apps.length,
    YEAR: year,
    ROOT_PATH: './',
    SITE_ROOT_ABS: `${data.site.siteUrl}/`,
    APPS_INDEX_JSON: appsIndexJsonLang,
    LANG_SWITCH_URL: rootLangSwitchUrl,
    I18N_NAV_APPS: t.navApps,
    I18N_NAV_INSTALL: t.navInstall,
    I18N_NAV_ABOUT: t.navAbout,
    I18N_NAV_GITHUB: t.navGithub,
    I18N_SEARCH_PLACEHOLDER: t.searchPlaceholder,
    I18N_SEARCH_NO_RESULTS: t.searchNoResults,
    I18N_SEARCH_ARIA: t.searchAria,
    I18N_MENU_ARIA: t.menuAria,
    I18N_BACK_TO_TOP_ARIA: t.backToTopAria,
    I18N_LANG_SWITCH: t.langSwitch,
    I18N_LANG_SWITCH_ARIA: t.langSwitchAria,
    SITE_FOOTER_NOTE: siteFooterNote,
  };

  const rootJsonLd = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: data.apps.map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrlLang}/${a.slug}/`,
      name: (lang === 'en' && a.name_en) || a.name,
    })),
  })}</script>`;

  const rootMap = {
    ...rootSiteMap,
    PAGE_TITLE: `${data.site.brand} — ${siteTagline}`,
    PAGE_DESCRIPTION: siteTagline,
    PAGE_URL: `${siteUrlLang}/`,
    PAGE_IMAGE: `${data.site.siteUrl}/favicon.svg`,
    JSONLD: rootJsonLd,
    SITE_HEADLINE_LINE1: data.site.headlineLine1 || 'Katalog aplikasi',
    SITE_HEADLINE_LINE2: data.site.headlineLine2 || 'Android independen.',
    SITE_TAGLINE: siteTagline,
    SITE_FOOTER_NOTE: siteFooterNote,
    MODULE_CARDS: cards,
    CATEGORY_OPTIONS: categoryOptions,
    I18N_SKIP_LINK: t.skipLink,
    I18N_RECENT_RELEASES: t.recentReleases,
    I18N_CATEGORY_ALL: t.categoryAll,
    I18N_GRID_NO_RESULTS: t.gridNoResults,
    I18N_CTA_BUTTON: t.ctaButton,
    LANG_ATTR: lang,
  };

  fs.writeFileSync(
    path.join(outRoot, 'index.html'),
    fill(idxTpl, { ...rootMap, HEAD: buildHead(rootMap), HEADER: buildHeader(rootSiteMap), FOOTER: buildFooter(rootSiteMap) })
  );
  console.log(`✓ [${lang}] index.html`);

  // ---------- halaman per kategori ----------
  // URL: /kategori/<slug>/ (ID), /en/category/<slug>/ (EN) — biar Google bisa index
  // "semua app Keuangan" dst sebagai halaman tersendiri, bukan cuma filter JS di homepage.
  const categorySegment = lang === 'id' ? 'kategori' : 'category';
  for (const catName of categories) {
    const catSlug = slugifyCategory(catName);
    const catDir = path.join(outRoot, categorySegment, catSlug);
    fs.mkdirSync(catDir, { recursive: true });

    const appsInCategory = data.apps.filter((a) => ((lang === 'en' && a.category_en) || a.category) === catName);
    const catCards = appsInCategory.map((app) => renderAppCard(app, 2)).join('\n        ');
    const countText =
      appsInCategory.length === 1 ? t.categoryCountOne : t.categoryCountMany.replace('{n}', appsInCategory.length);

    const counterpartCatName = lang === 'id' ? categoryNameIdToEn.get(catName) : categoryNameEnToId.get(catName);
    // dari ID (kategori/X/, 2 level) ke true root perlu ../../ lalu masuk en/category/...
    // dari EN (en/category/X/, 3 level) ke true root perlu ../../../ lalu masuk kategori/...
    const upToTrueRoot = lang === 'id' ? '../../' : '../../../';
    const counterpartLangSwitchUrl = counterpartCatName
      ? lang === 'id'
        ? `${upToTrueRoot}en/category/${slugifyCategory(counterpartCatName)}/`
        : `${upToTrueRoot}kategori/${slugifyCategory(counterpartCatName)}/`
      : lang === 'id'
      ? `${upToTrueRoot}en/`
      : `${upToTrueRoot}`;

    const catSiteMap = {
      ...rootSiteMap,
      ROOT_PATH: '../../',
      LANG_SWITCH_URL: counterpartLangSwitchUrl,
    };
    const catMap = {
      ...catSiteMap,
      PAGE_TITLE: `${catName} — ${data.site.brand}`,
      PAGE_DESCRIPTION: `${countText} ${t.categoryLabel.toLowerCase()} ${catName} — ${siteTagline}`,
      PAGE_URL: `${siteUrlLang}/${categorySegment}/${catSlug}/`,
      PAGE_IMAGE: `${data.site.siteUrl}/favicon.svg`,
      JSONLD: '',
      CATEGORY_NAME: catName,
      CATEGORY_COUNT_TEXT: countText,
      MODULE_CARDS: catCards,
      I18N_SKIP_LINK: t.skipLink,
      I18N_CATEGORY_LABEL: t.categoryLabel,
      LANG_ATTR: lang,
    };
    fs.writeFileSync(
      path.join(catDir, 'index.html'),
      fill(categoryTpl, { ...catMap, HEAD: buildHead(catMap), HEADER: buildHeader(catSiteMap), FOOTER: buildFooter(catSiteMap) })
    );
  }
  console.log(`✓ [${lang}] ${categories.length} halaman kategori (${categorySegment}/*)`);

  // ---------- 404.html ----------
  // Path relatif tidak bisa dipakai di 404 (GitHub Pages bisa nyajikan file ini dari
  // kedalaman URL manapun), jadi header/footer 404 pakai ROOT_PATH absolut.
  const notFoundLangSwitchUrl = lang === 'id' ? `${data.site.siteUrl}/en/404.html` : `${data.site.siteUrl}/404.html`;
  const notFoundSiteMap = {
    ...rootSiteMap,
    ROOT_PATH: `${siteUrlLang}/`,
    SITE_ROOT_ABS: `${data.site.siteUrl}/`,
    LANG_SWITCH_URL: notFoundLangSwitchUrl,
  };
  const notFoundMap = {
    ...notFoundSiteMap,
    PAGE_TITLE: `${t.notFoundTitle} — ${data.site.brand}`,
    PAGE_DESCRIPTION: t.notFoundBody,
    PAGE_URL: `${siteUrlLang}/404.html`,
    PAGE_IMAGE: `${data.site.siteUrl}/favicon.svg`,
    JSONLD: '',
    I18N_SKIP_LINK: t.skipLink,
    I18N_404_TITLE: t.notFoundTitle,
    I18N_404_BODY: t.notFoundBody,
    I18N_404_BACK_HOME: t.notFoundBackHome,
    LANG_ATTR: lang,
  };
  fs.writeFileSync(
    path.join(outRoot, '404.html'),
    fill(notFoundTpl, { ...notFoundMap, HEAD: buildHead(notFoundMap), HEADER: buildHeader(notFoundSiteMap), FOOTER: buildFooter(notFoundSiteMap) })
  );
  console.log(`✓ [${lang}] 404.html`);

  // ---------- about.html ----------
  const contactEmailBlock = data.site.supportEmail
    ? `<a href="mailto:${esc(data.site.supportEmail)}" class="flex-1 flex items-center gap-unit-md p-unit-lg rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors">
              <div class="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-primary text-[20px]">mail</span></div>
              <div><div class="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider">${t.contactEmailLabel}</div><div class="text-body-md font-body-md text-on-surface">${esc(data.site.supportEmail)}</div></div>
            </a>`
    : '';
  const aboutParagraphsSrc = (lang === 'en' && data.site.aboutParagraphsEn) || data.site.aboutParagraphs || [];
  const aboutParagraphsHtml = aboutParagraphsSrc
    .map((p) => `<p class="text-body-lg font-body-lg text-on-surface-variant leading-relaxed">${p}</p>`)
    .join('\n          ');
  const aboutMap = {
    ...rootSiteMap,
    PAGE_TITLE: `${t.aboutHeading} — ${data.site.brand}`,
    PAGE_DESCRIPTION: siteTagline,
    PAGE_URL: `${siteUrlLang}/about.html`,
    PAGE_IMAGE: `${data.site.siteUrl}/favicon.svg`,
    JSONLD: '',
    ABOUT_PARAGRAPHS: aboutParagraphsHtml,
    CONTACT_EMAIL_BLOCK: contactEmailBlock,
    I18N_SKIP_LINK: t.skipLink,
    I18N_ABOUT_BREADCRUMB: t.aboutBreadcrumb,
    I18N_ABOUT_HEADING: t.aboutHeading,
    I18N_CONTACT_HEADING: t.contactHeading,
    I18N_CONTACT_BODY: t.contactBody,
    I18N_CONTACT_REPORT_BUG: t.contactReportBug,
    LANG_ATTR: lang,
  };
  fs.writeFileSync(
    path.join(outRoot, 'about.html'),
    fill(aboutTpl, { ...aboutMap, HEAD: buildHead(aboutMap), HEADER: buildHeader(rootSiteMap), FOOTER: buildFooter(rootSiteMap) })
  );
  console.log(`✓ [${lang}] about.html`);

  // ---------- install.html ----------
  const installMap = {
    ...rootSiteMap,
    PAGE_TITLE: `${t.navInstall} — ${data.site.brand}`,
    PAGE_DESCRIPTION: siteTagline,
    PAGE_URL: `${siteUrlLang}/install.html`,
    PAGE_IMAGE: `${data.site.siteUrl}/favicon.svg`,
    JSONLD: '',
  };
  const installTemplateForLang = lang === 'en' ? installEnTpl : installTpl;
  fs.writeFileSync(
    path.join(outRoot, 'install.html'),
    fill(installTemplateForLang, { ...installMap, HEAD: buildHead(installMap), HEADER: buildHeader(rootSiteMap), FOOTER: buildFooter(rootSiteMap) })
  );
  console.log(`✓ [${lang}] install.html`);

  return { siteUrlLang, categorySegment, categorySlugs: categories.map(slugifyCategory) };
}

// ---------- generate semua halaman (ID lalu EN) ----------
async function main() {
validateData(data.apps);

const downloadCounts = await getDownloadCounts(data.apps);

console.log('↻ Optimasi gambar (resize + WebP)...');
await Promise.all(data.apps.map((app) => optimizeAppImages(app)));

const idResult = generateSite('id', downloadCounts);
const enResult = generateSite('en', downloadCounts);

// ---------- sitemap.xml (mencakup ID + EN) ----------
function appImageUrls(app) {
  const urls = [];
  if (app.banner) urls.push(`${data.site.siteUrl}/${app.slug}/${app.banner}`);
  if (app.icon) urls.push(`${data.site.siteUrl}/${app.slug}/${app.icon}`);
  if (app.screenshots) urls.push(...app.screenshots.map((s) => `${data.site.siteUrl}/${app.slug}/${s}`));
  return urls.map(escXml);
}

const sitemapUrls = [
  { loc: `${data.site.siteUrl}/`, priority: '1.0' },
  { loc: `${data.site.siteUrl}/en/`, priority: '0.9' },
  { loc: `${data.site.siteUrl}/about.html`, priority: '0.5' },
  { loc: `${data.site.siteUrl}/en/about.html`, priority: '0.4' },
  { loc: `${data.site.siteUrl}/install.html`, priority: '0.5' },
  { loc: `${data.site.siteUrl}/en/install.html`, priority: '0.4' },
  ...idResult.categorySlugs.map((slug) => ({
    loc: `${data.site.siteUrl}/${idResult.categorySegment}/${slug}/`,
    priority: '0.6',
  })),
  ...enResult.categorySlugs.map((slug) => ({
    loc: `${data.site.siteUrl}/en/${enResult.categorySegment}/${slug}/`,
    priority: '0.5',
  })),
  ...data.apps.flatMap((app) => [
    { loc: `${data.site.siteUrl}/${app.slug}/`, priority: '0.8', images: appImageUrls(app) },
    { loc: `${data.site.siteUrl}/en/${app.slug}/`, priority: '0.7', images: appImageUrls(app) },
    { loc: `${data.site.siteUrl}/${app.slug}/privacy.html`, priority: '0.3' },
  ]),
];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${sitemapUrls
  .map((u) => {
    const imageTags = (u.images || [])
      .map((img) => `<image:image><image:loc>${img}</image:loc></image:image>`)
      .join('');
    return `  <url><loc>${escXml(u.loc)}</loc><lastmod>${buildDate}</lastmod><priority>${u.priority}</priority>${imageTags}</url>`;
  })
  .join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml);
console.log('✓ sitemap.xml (ID + EN + kategori + gambar)');

// ---------- robots.txt ----------
const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${data.site.siteUrl}/sitemap.xml
`;
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robotsTxt);
console.log('✓ robots.txt');

// ---------- manifest.json (PWA) ----------
const manifest = {
  name: data.site.brand,
  short_name: data.site.brand,
  description: data.site.tagline,
  start_url: `${data.site.siteUrl}/`,
  scope: `${data.site.siteUrl}/`,
  display: 'standalone',
  background_color: '#131313',
  theme_color: '#131313',
  icons: [{ src: `${data.site.siteUrl}/favicon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
};
fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('✓ manifest.json');

// ---------- feed.xml (RSS, Bahasa Indonesia) ----------
// Item diurutkan dari entri changelog terbaru tiap app (kalau ada), fallback ke buildDate.
function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const feedItems = [...data.apps]
  .map((app) => {
    const latestChangelog = app.changelog && app.changelog[0];
    const pubDate = latestChangelog && latestChangelog.date ? new Date(latestChangelog.date) : new Date(buildDate);
    return { app, pubDate };
  })
  .sort((a, b) => b.pubDate - a.pubDate)
  .map(
    ({ app, pubDate }) => `  <item>
    <title>${escXml(app.name)} v${escXml(app.version)}</title>
    <link>${data.site.siteUrl}/${app.slug}/</link>
    <guid>${data.site.siteUrl}/${app.slug}/</guid>
    <description>${escXml(app.tagline)}</description>
    <pubDate>${pubDate.toUTCString()}</pubDate>
  </item>`
  )
  .join('\n');
const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escXml(data.site.brand)}</title>
  <link>${data.site.siteUrl}/</link>
  <description>${escXml(data.site.tagline)}</description>
${feedItems}
</channel>
</rss>
`;
fs.writeFileSync(path.join(ROOT, 'feed.xml'), feedXml);
console.log('✓ feed.xml');

// ---------- deteksi folder app lama yang ketinggalan (tidak dihapus otomatis,
// cuma diperingatkan — biar tidak ada halaman "hantu" yang diam-diam masih
// hidup di GitHub Pages padahal sudah tidak ada di data/apps/) ----------
const KNOWN_NON_APP_DIRS = new Set([
  'node_modules', '.git', '.github', 'templates', 'data', 'en', '.vscode', '.idea',
]);
function findOrphanFolders(dir, currentSlugs) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !KNOWN_NON_APP_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(dir, name, 'index.html')) && !currentSlugs.has(name));
}
const currentSlugs = new Set(data.apps.map((a) => a.slug));
const orphansRoot = findOrphanFolders(ROOT, currentSlugs);
const orphansEn = findOrphanFolders(path.join(ROOT, 'en'), currentSlugs);
if (orphansRoot.length || orphansEn.length) {
  console.log('\n⚠ Ketemu folder app LAMA yang sudah tidak ada di data/apps/ tapi masih tersisa di disk:');
  orphansRoot.forEach((s) => console.log(`  - ${s}/`));
  orphansEn.forEach((s) => console.log(`  - en/${s}/`));
  console.log('  Halaman ini masih LIVE di GitHub Pages (bisa diakses langsung lewat URL) walau sudah tidak ke-link dari homepage.');
  console.log('  Hapus manual foldernya kalau appnya memang sudah tidak dipakai lagi, lalu commit penghapusannya.\n');
}

// ---------- self-check otomatis: scan SEMUA halaman hasil generate ----------
// Cek link/gambar internal yang putus & tag <div> yang tidak seimbang. Ini versi
// otomatis dari audit manual yang biasa dijalankan tiap kali diminta "cek menyeluruh"
// — sekarang jalan tiap build, bukan cuma pas diminta.
function decodeHtmlEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
const SELF_CHECK_SKIP_DIRS = new Set(['node_modules', 'templates', 'data', '.github', '.git']);
function runSelfCheck() {
  const htmlFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SELF_CHECK_SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) htmlFiles.push(full);
    }
  }
  walk(ROOT);

  const brokenLinks = [];
  const unbalancedDivs = [];
  const leakedPlaceholders = [];

  for (const file of htmlFiles) {
    const baseDir = path.dirname(file);
    const html = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(ROOT, file);

    const noScript = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    const refs = [...noScript.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => decodeHtmlEntities(m[1]));
    for (const ref of refs) {
      if (/^https?:|^mailto:|^#/.test(ref) || ref.includes('?')) continue;
      const clean = ref.split('#')[0];
      if (!clean) continue;
      const target = clean.endsWith('/') ? path.join(baseDir, clean, 'index.html') : path.join(baseDir, clean);
      if (!fs.existsSync(target)) brokenLinks.push(`${relFile} -> ${ref}`);
    }

    const opens = (html.match(/<div\b/g) || []).length;
    const closes = (html.match(/<\/div>/g) || []).length;
    if (opens !== closes) unbalancedDivs.push(`${relFile} (${opens} <div> vs ${closes} </div>)`);

    if (/{{[A-Z_]+}}/.test(html)) leakedPlaceholders.push(relFile);
  }

  const problems = [];
  if (brokenLinks.length) problems.push(`${brokenLinks.length} link/gambar putus:\n  ` + brokenLinks.join('\n  '));
  if (unbalancedDivs.length) problems.push(`${unbalancedDivs.length} halaman dengan <div> tidak seimbang:\n  ` + unbalancedDivs.join('\n  '));
  if (leakedPlaceholders.length) problems.push(`${leakedPlaceholders.length} halaman dengan placeholder {{...}} bocor:\n  ` + leakedPlaceholders.join('\n  '));

  if (problems.length) {
    console.error(`\n[SELF-CHECK GAGAL] Hasil generate rusak:\n\n${problems.join('\n\n')}\n`);
    process.exit(1);
  }
  console.log(`✓ Self-check: ${htmlFiles.length} halaman dicek, semua link/gambar valid, tag seimbang.`);
}

// Cek dasar "well-formed" buat file XML (tanpa perlu library XML parser eksternal):
// tidak ada karakter "&" mentah yang bukan bagian dari entity valid (&amp; &lt; &gt; &quot; &apos; &#123;).
function checkXmlEscaping(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const badAmpersands = content.match(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/g);
  if (!badAmpersands) return [];
  return [`${path.relative(ROOT, filePath)}: ${badAmpersands.length} karakter "&" tidak ter-escape (bikin XML invalid)`];
}

runSelfCheck();

const xmlProblems = [
  ...checkXmlEscaping(path.join(ROOT, 'sitemap.xml')),
  ...checkXmlEscaping(path.join(ROOT, 'feed.xml')),
];
if (xmlProblems.length) {
  console.error(`\n[SELF-CHECK GAGAL] Masalah XML:\n\n  ${xmlProblems.join('\n  ')}\n`);
  process.exit(1);
}
console.log(`✓ Self-check XML: sitemap.xml & feed.xml well-formed.`);

console.log(`\nSelesai. ${data.apps.length} aplikasi ter-generate, dalam 2 bahasa (id + en).`);
}

main().catch((err) => {
  console.error('[ERROR] Build gagal:', err.message);
  process.exit(1);
});