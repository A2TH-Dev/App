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

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// data/site.json = konfigurasi situs (brand, tagline, dll).
// data/apps/<slug>.json = satu file per aplikasi, biar tidak numpuk di 1 file besar.
// Urutan tampil di homepage mengikuti field "order" di tiap file (kalau tidak ada, urut nama file).
const site = JSON.parse(read('data/site.json'));
const appsDir = path.join(ROOT, 'data/apps');
const appFiles = fs.readdirSync(appsDir).filter((f) => f.endsWith('.json'));
const apps = appFiles
  .map((f) => JSON.parse(fs.readFileSync(path.join(appsDir, f), 'utf8')))
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.slug.localeCompare(b.slug));
const data = { site, apps };

const appsIndexJson = JSON.stringify(
  apps.map((a) => ({ name: a.name, slug: a.slug, category: a.category, accent: a.accent }))
);

const partialHead = read('templates/partials/head.html');
const partialHeader = read('templates/partials/header.html');
const partialFooter = read('templates/partials/footer.html');

const idxTpl = read('templates/index.template.html');
const appTpl = read('templates/app.template.html');
const privTpl = read('templates/privacy.template.html');
const notFoundTpl = read('templates/404.template.html');

const buildDate = new Date().toISOString().slice(0, 10);
const year = new Date().getFullYear();

const FEATURE_ICONS = ['bolt', 'shield', 'memory', 'speed', 'verified', 'tune', 'rocket_launch', 'security'];

function fill(tpl, map) {
  return tpl.replace(/{{(\w+)}}/g, (_, key) => (key in map ? String(map[key]) : ''));
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

// sizePx: {w,h} dalam px buat atribut width/height (cegah layout shift saat gambar
// belum kebaca), tidak mempengaruhi ukuran tampil karena class Tailwind tetap menang.
function iconBlock(app, prefix, sizeClass, sizePx, eager) {
  if (!app.icon) return null;
  const loadingAttr = eager ? '' : ' loading="lazy"';
  const dims = sizePx ? ` width="${sizePx.w}" height="${sizePx.h}"` : '';
  return `<img src="${esc(prefix + app.icon)}" alt="${esc(app.name)} icon"${dims}${loadingAttr} class="${sizeClass} rounded-xl object-cover shadow-2xl" />`;
}

function screenshotGallery(app, prefix) {
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
          <span class="text-label-md font-label-md text-primary uppercase tracking-[0.2em]">Screenshot</span>
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
function buildChangelog(app) {
  const entries = app.changelog;
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
              ${isLatest ? '<span class="text-label-sm font-label-sm text-primary bg-primary/10 px-unit-sm py-[2px] rounded-full">Terbaru</span>' : ''}
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
          <span class="text-label-md font-label-md text-primary uppercase tracking-[0.2em]">Yang Baru</span>
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

function formatDownloadCount(n) {
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

function buildJsonLd(app, pageUrl, imageUrl) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: app.name,
    description: app.tagline,
    applicationCategory: app.category,
    operatingSystem: `Android ${app.minAndroid}+`,
    softwareVersion: app.version,
    fileSize: `${app.sizeMb}MB`,
    url: pageUrl,
    image: imageUrl,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

function buildHead(map) { return fill(partialHead, map); }
function buildHeader(map) { return fill(partialHeader, map); }
function buildFooter(map) { return fill(partialFooter, map); }

// ---------- generate per-app pages ----------
async function main() {
const downloadCounts = await getDownloadCounts(data.apps);

for (const app of data.apps) {
  const dir = path.join(ROOT, app.slug);
  fs.mkdirSync(dir, { recursive: true });

  const initialsStr = app.initials || initials(app.name);

  const siteMap = {
    SITE_BRAND: data.site.brand,
    GITHUB_USER: data.site.githubUser,
    APP_COUNT: data.apps.length,
    YEAR: year,
    ROOT_PATH: '../',
    APPS_INDEX_JSON: appsIndexJson,
  };

  const featureCards = app.features
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

  const imgPrefix = ''; // gambar app ada di <slug>/asset/..., path di JSON sudah relatif dari situ
  const initialsDivHero = `<div class="w-24 h-24 rounded-xl flex items-center justify-center text-2xl font-bold shadow-2xl" style="background:${app.accent}22;color:${app.accent}">${initialsStr}</div>`;
  const initialsDivPhone = `<div class="w-20 h-20 rounded-3xl flex items-center justify-center text-2xl font-bold" style="background:${app.accent}22;color:${app.accent}">${initialsStr}</div>`;

  const appImage = app.icon ? `${data.site.siteUrl}/${app.slug}/${app.icon}` : `${data.site.siteUrl}/favicon.svg`;

  const otherApps = data.apps.filter((a) => a.slug !== app.slug).slice(0, 4);
  const otherAppsCards = otherApps
    .map((oa) => {
      const oaInitials = oa.initials || initials(oa.name);
      const oaIcon =
        iconBlock(oa, `../${oa.slug}/`, 'w-12 h-12', { w: 48, h: 48 }) ||
        `<div class="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold" style="background:${oa.accent}22;color:${oa.accent}">${oaInitials}</div>`;
      return `<a href="../${oa.slug}/" class="group flex items-center gap-unit-md p-unit-md rounded-xl bg-surface-container-low hover:bg-surface-container transition-all duration-300 hover:-translate-y-1" style="border-top:2px solid ${oa.accent}">
          ${oaIcon}
          <div class="min-w-0">
            <div class="text-body-md font-body-md text-on-surface group-hover:text-primary transition-colors truncate">${oa.name}</div>
            <div class="text-label-sm font-label-sm text-on-surface-variant truncate">${oa.category}</div>
          </div>
        </a>`;
    })
    .join('\n        ');

  const commonMap = {
    ...siteMap,
    APP_NAME: app.name,
    APP_TAGLINE: app.tagline,
    APP_DESCRIPTION: app.description,
    APP_CATEGORY: app.category,
    APP_VERSION: app.version,
    APP_MIN_ANDROID: app.minAndroid,
    APP_SIZE_MB: app.sizeMb,
    APP_REPO: app.repo,
    APP_ACCENT: app.accent,
    APP_INITIALS: initialsStr,
    APP_DOWNLOAD_URL: downloadUrl(app),
    APP_DOWNLOAD_LABEL: isPlayStore(app) ? 'Get it on Google Play' : 'Unduh APK',
    APP_DOWNLOAD_ICON: isPlayStore(app) ? 'shop' : 'download',
    FEATURE_CARDS: featureCards,
    BUILD_DATE: buildDate,
    APP_ICON_HERO: iconBlock(app, imgPrefix, 'w-24 h-24', { w: 96, h: 96 }, true) || initialsDivHero,
    APP_ICON_PHONE: phoneMockupBlock(app, imgPrefix) || initialsDivPhone,
    SCREENSHOT_GALLERY: screenshotGallery(app, imgPrefix),
    OTHER_APPS_CARDS: otherAppsCards,
    BREADCRUMB_CATEGORY_URL: `../?category=${encodeURIComponent(app.category)}`,
    CHANGELOG_SECTION: buildChangelog(app),
    DOWNLOAD_BADGE: (() => {
      const count = downloadCounts[app.slug];
      if (count === null || count === undefined) return '';
      return `<div class="flex items-center gap-unit-xs px-unit-sm py-unit-xs bg-surface-container-high rounded-full">
              <span class="material-symbols-outlined text-primary text-[16px]">download</span>
              <span class="font-label-sm text-label-sm text-on-surface">${formatDownloadCount(count)} unduhan</span>
            </div>`;
    })(),
    ...buildPrivacySections(app),
  };

  const appPageMap = {
    ...commonMap,
    PAGE_TITLE: `${app.name} — ${data.site.brand}`,
    PAGE_DESCRIPTION: app.tagline,
    PAGE_URL: `${data.site.siteUrl}/${app.slug}/`,
    PAGE_IMAGE: appImage,
    JSONLD: buildJsonLd(app, `${data.site.siteUrl}/${app.slug}/`, appImage),
  };
  const privacyPageMap = {
    ...commonMap,
    PAGE_TITLE: `Kebijakan Privasi — ${app.name}`,
    PAGE_DESCRIPTION: `Kebijakan privasi untuk ${app.name}.`,
    PAGE_URL: `${data.site.siteUrl}/${app.slug}/privacy.html`,
    PAGE_IMAGE: appImage,
  };

  const headApp = buildHead(appPageMap);
  const headPrivacy = buildHead(privacyPageMap);
  const header = buildHeader(siteMap);
  const footer = buildFooter(siteMap);

  fs.writeFileSync(
    path.join(dir, 'index.html'),
    fill(appTpl, { ...appPageMap, HEAD: headApp, HEADER: header, FOOTER: footer })
  );
  fs.writeFileSync(
    path.join(dir, 'privacy.html'),
    fill(privTpl, { ...privacyPageMap, HEAD: headPrivacy, HEADER: header, FOOTER: footer })
  );
  console.log(`✓ ${app.slug}/index.html + privacy.html`);
}

// ---------- generate root marketplace page ----------
const cards = data.apps
  .map((app) => {
    const initialsStr = app.initials || initials(app.name);
    const iconHtml =
      iconBlock(app, `${app.slug}/`, 'w-16 h-16', { w: 64, h: 64 }) ||
      `<div class="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold" style="background:${app.accent}22;color:${app.accent}">${initialsStr}</div>`;
    return `<a href="${app.slug}/" data-name="${esc(app.name.toLowerCase())}" data-category="${esc(app.category)}" class="group relative bg-surface-container-low p-unit-lg rounded-xl transition-all duration-300 hover:bg-surface-container hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 block" style="border-top:2px solid ${app.accent}">
        <div class="flex justify-between items-start mb-unit-lg">
          ${iconHtml}
          <span class="font-label-sm text-label-sm px-unit-sm py-unit-xs bg-surface-container-highest text-on-surface-variant rounded-full">v${app.version}</span>
        </div>
        <h3 class="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors">${app.name}</h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-unit-xs line-clamp-1">${app.tagline}</p>
        <div class="mt-unit-xl flex items-center justify-between">
          <span class="px-unit-sm py-[2px] font-label-sm text-[10px] uppercase tracking-wider rounded" style="background:${app.accent}1a;color:${app.accent}">${app.category}</span>
          <span class="font-body-sm text-body-sm text-on-tertiary-fixed-variant">${app.sizeMb} MB</span>
        </div>
      </a>`;
  })
  .join('\n      ');

const categories = [...new Set(data.apps.map((a) => a.category))].sort();
const categoryOptions = categories
  .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
  .join('\n        ');

const rootSiteMap = {
  SITE_BRAND: data.site.brand,
  GITHUB_USER: data.site.githubUser,
  APP_COUNT: data.apps.length,
  YEAR: year,
  ROOT_PATH: './',
  APPS_INDEX_JSON: appsIndexJson,
};

const rootJsonLd = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: data.apps.map((a, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: `${data.site.siteUrl}/${a.slug}/`,
    name: a.name,
  })),
})}</script>`;

const rootMap = {
  ...rootSiteMap,
  PAGE_TITLE: `${data.site.brand} — ${data.site.tagline}`,
  PAGE_DESCRIPTION: data.site.tagline,
  PAGE_URL: `${data.site.siteUrl}/`,
  PAGE_IMAGE: `${data.site.siteUrl}/favicon.svg`,
  JSONLD: rootJsonLd,
  SITE_HEADLINE_LINE1: data.site.headlineLine1 || 'Katalog aplikasi',
  SITE_HEADLINE_LINE2: data.site.headlineLine2 || 'Android independen.',
  SITE_TAGLINE: data.site.tagline,
  SITE_FOOTER_NOTE: data.site.footerNote,
  MODULE_CARDS: cards,
  CATEGORY_OPTIONS: categoryOptions,
};

const rootHead = buildHead(rootMap);
const rootHeader = buildHeader(rootMap);
const rootFooter = buildFooter(rootMap);

fs.writeFileSync(
  path.join(ROOT, 'index.html'),
  fill(idxTpl, { ...rootMap, HEAD: rootHead, HEADER: rootHeader, FOOTER: rootFooter })
);
console.log('✓ index.html (root)');

// ---------- sitemap.xml ----------
const sitemapUrls = [
  { loc: `${data.site.siteUrl}/`, priority: '1.0' },
  ...data.apps.flatMap((app) => [
    { loc: `${data.site.siteUrl}/${app.slug}/`, priority: '0.8' },
    { loc: `${data.site.siteUrl}/${app.slug}/privacy.html`, priority: '0.3' },
  ]),
];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${buildDate}</lastmod><priority>${u.priority}</priority></url>`)
  .join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml);
console.log('✓ sitemap.xml');

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

// ---------- 404.html ----------
// Path relatif tidak bisa dipakai di 404 (GitHub Pages bisa nyajikan file ini dari
// kedalaman URL manapun), jadi header/footer 404 pakai ROOT_PATH absolut.
const notFoundSiteMap = {
  SITE_BRAND: data.site.brand,
  GITHUB_USER: data.site.githubUser,
  APP_COUNT: data.apps.length,
  YEAR: year,
  ROOT_PATH: `${data.site.siteUrl}/`,
  APPS_INDEX_JSON: appsIndexJson,
};
const notFoundMap = {
  ...notFoundSiteMap,
  PAGE_TITLE: `Halaman Tidak Ditemukan — ${data.site.brand}`,
  PAGE_DESCRIPTION: `Halaman yang kamu cari tidak ada di ${data.site.brand}.`,
  PAGE_URL: `${data.site.siteUrl}/404.html`,
  PAGE_IMAGE: `${data.site.siteUrl}/favicon.svg`,
};
const notFoundHead = buildHead(notFoundMap);
const notFoundHeader = buildHeader(notFoundSiteMap);
const notFoundFooter = buildFooter(notFoundSiteMap);
fs.writeFileSync(
  path.join(ROOT, '404.html'),
  fill(notFoundTpl, { ...notFoundMap, HEAD: notFoundHead, HEADER: notFoundHeader, FOOTER: notFoundFooter })
);
console.log('✓ 404.html');

// ---------- feed.xml (RSS) ----------
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

console.log(`\nSelesai. ${data.apps.length} aplikasi ter-generate.`);
}

main().catch((err) => {
  console.error('[ERROR] Build gagal:', err.message);
  process.exit(1);
});