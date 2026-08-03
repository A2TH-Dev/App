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
const data = JSON.parse(read('data/apps.json'));

const partialHead = read('templates/partials/head.html');
const partialHeader = read('templates/partials/header.html');
const partialFooter = read('templates/partials/footer.html');

const idxTpl = read('templates/index.template.html');
const appTpl = read('templates/app.template.html');
const privTpl = read('templates/privacy.template.html');

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

function iconBlock(app, prefix, sizeClass) {
  if (!app.icon) return null;
  return `<img src="${esc(prefix + app.icon)}" alt="${esc(app.name)} icon" class="${sizeClass} rounded-xl object-cover shadow-2xl" />`;
}

function screenshotGallery(app, prefix) {
  const shots = app.screenshots;
  if (!shots || !shots.length) return '';
  const items = shots
    .map(
      (src, i) =>
        `<img src="${esc(prefix + src)}" alt="${esc(app.name)} screenshot ${i + 1}" loading="lazy" class="w-40 md:w-48 aspect-[9/19] object-cover rounded-2xl border border-outline-variant/30 shadow-lg flex-shrink-0 snap-center" />`
    )
    .join('\n        ');
  return `<!-- Screenshots -->
      <div class="mb-32">
        <div class="flex items-center gap-unit-sm mb-unit-lg">
          <div class="h-[1px] w-8 bg-primary"></div>
          <span class="text-label-md font-label-md text-primary uppercase tracking-[0.2em]">Screenshot</span>
        </div>
        <div class="flex gap-unit-md overflow-x-auto pb-unit-md snap-x snap-mandatory" style="scrollbar-width:none;">
        ${items}
        </div>
      </div>`;
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

function buildHead(map) { return fill(partialHead, map); }
function buildHeader(map) { return fill(partialHeader, map); }
function buildFooter(map) { return fill(partialFooter, map); }

// ---------- generate per-app pages ----------
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

  const commonMap = {
    ...siteMap,
    PAGE_TITLE: `${app.name} — ${data.site.brand}`,
    PAGE_DESCRIPTION: app.tagline,
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
    APP_ICON_HERO: iconBlock(app, imgPrefix, 'w-24 h-24') || initialsDivHero,
    APP_ICON_PHONE: iconBlock(app, imgPrefix, 'w-full h-full') || initialsDivPhone,
    SCREENSHOT_GALLERY: screenshotGallery(app, imgPrefix),
    ...buildPrivacySections(app),
  };

  const head = buildHead(commonMap);
  const header = buildHeader(commonMap);
  const footer = buildFooter(commonMap);

  fs.writeFileSync(
    path.join(dir, 'index.html'),
    fill(appTpl, { ...commonMap, HEAD: head, HEADER: header, FOOTER: footer })
  );
  fs.writeFileSync(
    path.join(dir, 'privacy.html'),
    fill(privTpl, { ...commonMap, HEAD: head, HEADER: header, FOOTER: footer })
  );
  console.log(`✓ ${app.slug}/index.html + privacy.html`);
}

// ---------- generate root marketplace page ----------
const cards = data.apps
  .map((app) => {
    const initialsStr = app.initials || initials(app.name);
    const iconHtml =
      iconBlock(app, `${app.slug}/`, 'w-16 h-16') ||
      `<div class="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold" style="background:${app.accent}22;color:${app.accent}">${initialsStr}</div>`;
    return `<a href="${app.slug}/" class="group relative bg-surface-container-low p-unit-lg rounded-xl transition-all duration-300 hover:bg-surface-container hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 block" style="border-top:2px solid ${app.accent}">
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

const rootSiteMap = {
  SITE_BRAND: data.site.brand,
  GITHUB_USER: data.site.githubUser,
  APP_COUNT: data.apps.length,
  YEAR: year,
  ROOT_PATH: './',
};

const rootMap = {
  ...rootSiteMap,
  PAGE_TITLE: `${data.site.brand} — ${data.site.tagline}`,
  PAGE_DESCRIPTION: data.site.tagline,
  SITE_HEADLINE_LINE1: data.site.headlineLine1 || 'Katalog aplikasi',
  SITE_HEADLINE_LINE2: data.site.headlineLine2 || 'Android independen.',
  SITE_TAGLINE: data.site.tagline,
  SITE_FOOTER_NOTE: data.site.footerNote,
  MODULE_CARDS: cards,
};

const rootHead = buildHead(rootMap);
const rootHeader = buildHeader(rootMap);
const rootFooter = buildFooter(rootMap);

fs.writeFileSync(
  path.join(ROOT, 'index.html'),
  fill(idxTpl, { ...rootMap, HEAD: rootHead, HEADER: rootHeader, FOOTER: rootFooter })
);
console.log('✓ index.html (root)');
console.log(`\nSelesai. ${data.apps.length} aplikasi ter-generate.`);