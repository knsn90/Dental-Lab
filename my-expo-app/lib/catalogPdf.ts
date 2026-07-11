/**
 * Catalog HTML generator — dijital katalog (Nexadent template adaptasyonu).
 * 2 sütun layout: sol (tanışalım + teknolojiler + fiyatlar) / sağ (neden biz + iletişim).
 * Tüm içerik data-driven.
 */

export interface CatalogService {
  id: string;
  name: string;
  category: string | null;
  price: number;
  currency: string;
  sort_order?: number | null;
  production_days?: number | null;
  unit?: string | null;
}

export interface CatalogTech {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
}

export interface CatalogInput {
  labName: string;
  labLogoUrl?: string | null;
  coverTitle: string;
  coverSubtitle: string;
  coverTagline: string;
  aboutTitle: string;
  aboutText: string;
  whyUs: string[];
  techIntro: string;
  technologies: CatalogTech[];
  services: CatalogService[];
  categoryOrder: string[];
  showPrices: boolean;
  currency: string;
  contact: {
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    instagram?: string;
  };
  accent: string;
  accentSoft: string;
  footerNote?: string;
}

const CAT_LABEL: Record<string, string> = {
  cad_cam: 'CAD/CAM', scanner: 'AĞIZ İÇİ TARAYICI', furnace: 'FIRIN', milling: 'FREZE',
  printer: '3D YAZICI', sintering: 'SİNTERLEME', polishing: 'POLİSAJ',
  articulator: 'ARTİKÜLATÖR', compressor: 'KOMPRESÖR', other: 'TEKNOLOJİ',
};

const escape = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const trUpper = (s: string) => s.toLocaleUpperCase('tr-TR');
const currencySym = (c: string) => (c === 'EUR' ? '€' : c === 'USD' ? '$' : c === 'GBP' ? '£' : '₺');

// ─── Inline SVG icons (Lucide style — 2D linear, 24×24, stroke=currentColor) ───
const SVG = (path: string, size: number = 22, sw: number = 1.6) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const ICONS = {
  // Section title icons
  users:    `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  cog:      `<path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 20.66-1-1.73"/><path d="M11 10.27 7 3.34"/><path d="m20.66 17-1.73-1"/><path d="m3.34 7 1.73 1"/><path d="M14 12h8"/><path d="M2 12h2"/><path d="m20.66 7-1.73 1"/><path d="m3.34 17 1.73-1"/><path d="m17 3.34-1 1.73"/><path d="m11 13.73-4 6.93"/>`,
  tag:      `<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>`,
  // Tech category icons
  cad_cam:  `<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>`,
  scanner:  `<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/>`,
  furnace:  `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,
  milling:  `<path d="m6 13.5 3.5-3.5"/><path d="m9 17 5-5"/><path d="m13 21 5-5"/><path d="M12 2 2 12l10 10L22 12 12 2z"/>`,
  printer:  `<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>`,
  sintering:`<rect width="20" height="15" x="2" y="4" rx="2"/><rect width="8" height="7" x="8" y="8"/><path d="M2 12h2"/><path d="M20 12h2"/>`,
  polishing:`<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>`,
  articulator:`<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>`,
  compressor:`<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>`,
  other:    `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
  // Why-us icons (rotation)
  monitor:  `<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>`,
  clock:    `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  gem:      `<polygon points="6 3 18 3 22 9 12 22 2 9"/><line x1="11" x2="13" y1="3" y2="9"/><line x1="2" x2="22" y1="9" y2="9"/>`,
  zap:      `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
  check:    `<polyline points="20 6 9 17 4 12"/>`,
  tooth:    `<path d="M12 5.5c-1.074-.586-2.583-1-4-1-2.343 0-4 1.5-4 4.5 0 4 1 5 2 8.5.4 1.4 1.5 2 2.5 2 1.214 0 2-1 2.5-2.5.5-1.5.5-3 1-3s.5 1.5 1 3c.5 1.5 1.286 2.5 2.5 2.5 1 0 2.1-.6 2.5-2 1-3.5 2-4.5 2-8.5 0-3-1.657-4.5-4-4.5-1.417 0-2.926.414-4 1z"/>`,
  shield:   `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`,
  layers:   `<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>`,
  award:    `<circle cx="12" cy="8" r="6"/><path d="m9 14-1.5 8.5L12 19l4.5 3.5L15 14"/>`,
  cube:     `<path d="m21 16-9 5-9-5V8l9-5 9 5z"/><path d="M12 21V12"/><path d="M12 12 3.5 7.5"/><path d="M20.5 7.5 12 12"/>`,
  // Footer icons
  globe:    `<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>`,
  phone:    `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>`,
  mail:     `<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>`,
  instagram:`<rect width="20" height="20" x="2" y="2" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>`,
  mappin:   `<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>`,
};

const icon = (key: keyof typeof ICONS, size: number = 22, sw: number = 1.6) => SVG(ICONS[key], size, sw);

// Tech kategori → SVG icon eşlemesi
const CAT_ICON: Record<string, keyof typeof ICONS> = {
  cad_cam: 'cad_cam', scanner: 'scanner', furnace: 'furnace', milling: 'milling',
  printer: 'printer', sintering: 'sintering', polishing: 'polishing',
  articulator: 'articulator', compressor: 'compressor', other: 'cube',
};

// Why-us cycle
const WHY_ICONS: (keyof typeof ICONS)[] = ['monitor', 'clock', 'gem', 'zap', 'check', 'tooth', 'shield', 'layers', 'award', 'cube'];

// Bilinen marka/model görselleri — name veya brand alanı eşleşirse görsel kullan
type BrandImage = { match: RegExp; url: string };
const BRAND_IMAGES: BrandImage[] = [
  // SprintRay
  { match: /sprint\s*ray.*pro\s*2/i, url: 'https://sprintray.com/wp-content/uploads/2024/03/Pro2-Hero.png' },
  { match: /sprint\s*ray.*midas/i,   url: 'https://sprintray.com/wp-content/uploads/2024/04/midas.png' },
  { match: /sprint\s*ray/i,          url: 'https://sprintray.com/wp-content/uploads/2024/03/Pro2-Hero.png' },
  // Medit
  { match: /medit.*i900/i,           url: 'https://medit.com/wp-content/uploads/2023/11/i900.png' },
  { match: /medit.*i700/i,           url: 'https://medit.com/wp-content/uploads/2022/09/i700.png' },
  { match: /medit/i,                 url: 'https://medit.com/wp-content/uploads/2023/11/i900.png' },
  // Anycubic
  { match: /anycubic.*photon.*m7/i,  url: 'https://cdn.shopify.com/s/files/1/0265/1818/4863/files/Photon-Mono-M7-Pro-front.png' },
  // Zirkonzahn
  { match: /zirkonzahn.*m5/i,        url: 'https://www.zirkonzahn.com/local/img/m5.png' },
];

const findBrandImage = (name: string, brand?: string | null): string | null => {
  const needle = `${name} ${brand ?? ''}`;
  for (const { match, url } of BRAND_IMAGES) {
    if (match.test(needle)) return url;
  }
  return null;
};


// Katalog renk temaları — UI seçici + PDF accent kaynağı.
export interface CatalogPalette { id: string; label: string; accent: string; accentSoft: string; }
export const CATALOG_PALETTES: CatalogPalette[] = [
  { id: 'lacivert',  label: 'Lacivert',  accent: '#1f3f95', accentSoft: '#eef2fb' },
  { id: 'turkuaz',   label: 'Turkuaz',   accent: '#0891b2', accentSoft: '#e6f6fb' },
  { id: 'zumrut',    label: 'Zümrüt',    accent: '#15803d', accentSoft: '#e9f5ec' },
  { id: 'bordo',     label: 'Bordo',     accent: '#9f1239', accentSoft: '#fbeaef' },
  { id: 'mor',       label: 'Mor',       accent: '#6d28d9', accentSoft: '#f1ebfb' },
  { id: 'antrasit',  label: 'Antrasit',  accent: '#1f2937', accentSoft: '#eef1f5' },
  { id: 'amber',     label: 'Amber',     accent: '#b45309', accentSoft: '#fdf3e7' },
];

export function buildCatalogPdfHtml(input: CatalogInput): string {
  const {
    labName, labLogoUrl,
    coverTitle, coverSubtitle, coverTagline,
    aboutTitle, aboutText, whyUs,
    techIntro, technologies,
    services, categoryOrder, showPrices, currency,
    contact, accent, accentSoft, footerNote,
  } = input;

  const grouped: Record<string, CatalogService[]> = {};
  services.forEach((sv) => {
    const cat = sv.category || 'Diğer';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(sv);
  });
  const orderedCats = categoryOrder.length
    ? categoryOrder.filter((c) => grouped[c])
    : Object.keys(grouped);

  const dateStr = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' });
  const refStr = `KTL-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const fmtPrice = (sv: CatalogService) => {
    if (!showPrices) return `<span class="priceBlank">—</span>`;
    if (!sv.price || sv.price <= 0) return `<span class="priceBlank">—</span>`;
    const localized = sv.price.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    const u = sv.unit ? ` <span style="font-size:0.8em;color:#94A3B8">/ ${sv.unit}</span>` : '';
    return `<span class="priceVal">${currencySym(sv.currency || currency)}${localized}${u}</span>`;
  };

  // Accent renginden gradient ikinci tonu — basit lighten
  const accentDark = accent;
  const accentLight = accent + 'CC'; // 80% opacity hint

  // Tagline — slogan parçalarını ayır (hero feature'ları için)
  const taglineParts = coverTagline.split(/[·•|]/).map(s => s.trim()).filter(Boolean);

  // Contact footer items
  const contactItems: string[] = [];
  if (contact.website)   contactItems.push(`<div class="footerItem">${icon('globe', 16, 1.7)} ${escape(contact.website)}</div>`);
  if (contact.phone)     contactItems.push(`<div class="footerItem">${icon('phone', 16, 1.7)} ${escape(contact.phone)}</div>`);
  if (contact.email)     contactItems.push(`<div class="footerItem">${icon('mail', 16, 1.7)} ${escape(contact.email)}</div>`);
  if (contact.instagram) contactItems.push(`<div class="footerItem">${icon('instagram', 16, 1.7)} ${escape(contact.instagram)}</div>`);
  if (contact.address)   contactItems.push(`<div class="footerItem">${icon('mappin', 16, 1.7)} ${escape(contact.address)}</div>`);

  // ── Dijital Katalog — responsive (mobil/masaüstü) + A4 baskı ────────────
  const soft = `${accent}14`;
  const heroChips = taglineParts.slice(0, 4).map(t => `<span class="chip">${escape(t)}</span>`).join('');
  const whyDefault = ['Tam dijital iş akışı', 'Hızlı, ekspres teslimat', 'CAD/CAM & 3D üretim', 'Çok aşamalı kalite kontrol', 'Premium estetik malzemeler'];
  const whySrc = (whyUs && whyUs.length) ? whyUs : whyDefault;
  const whyHtml = whySrc.slice(0, 6).map((w, i) =>
    `<div class="why-card"><span class="why-ic">${icon(WHY_ICONS[i % WHY_ICONS.length], 17, 1.9)}</span><span class="why-tx">${escape(w)}</span></div>`).join('');
  const tablesHtml = orderedCats.map((cat) => {
    const items = grouped[cat] ?? [];
    const rows = items.map((sv) => {
      const meta = sv.production_days != null ? `<span class="ln-meta">${sv.production_days} gün</span>` : '';
      return `<div class="ln"><div class="ln-l"><span class="ln-n">${escape(sv.name)}</span>${meta}</div><div class="ln-p">${fmtPrice(sv)}</div></div>`;
    }).join('');
    return `<div class="cat"><div class="cat-h"><span class="cat-t">${escape(cat)}</span><span class="cat-n">${items.length}</span></div><div class="cat-body">${rows}</div></div>`;
  }).join('');
  const STEPS: [string, string, string][] = [
    ['1', 'Tarama', 'Dijital ölçü alınır'],
    ['2', 'Tasarım', 'CAD ile modelleme'],
    ['3', 'Üretim', 'CAM / 3D üretim'],
    ['4', 'Kontrol', 'Kalite denetimi'],
    ['5', 'Teslimat', 'Hızlı sevkiyat'],
  ];
  const stepsHtml = STEPS.map(([n, t, d]) => `<div class="step"><div class="step-n">${n}</div><div class="step-t">${escape(t)}</div><div class="step-d">${escape(d)}</div></div>`).join('');
  const heroLogo = labLogoUrl
    ? `<div class="brand-logo"><img src="${escape(labLogoUrl)}" alt="${escape(labName)}" /></div>`
    : `<div class="brand-mark">${escape((labName[0] ?? 'L').toLocaleUpperCase('tr-TR'))}</div>`;
  const priceNote = showPrices ? `Tüm fiyatlar ${currencySym(currency)} cinsindendir.` : 'Fiyatlar talep üzerine paylaşılır.';

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escape(labName)} · Hizmet Kataloğu</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{
    --accent:${accent};
    --accent-2:${accentLight};
    --ink:#16213a; --muted:#67728c; --line:#e6eaf2; --soft:${soft}; --bg:#eef1f6;
  }
  *{ margin:0; padding:0; box-sizing:border-box; }
  svg{ display:inline-block; vertical-align:middle; flex-shrink:0; }
  html{ -webkit-text-size-adjust:100%; }
  body{ font-family:'Inter',-apple-system,sans-serif; background:var(--bg); color:var(--ink); -webkit-font-smoothing:antialiased; line-height:1.5; }

  /* Belge kabı — ekranda kart, A4'te tam sayfa */
  .doc{ width:100%; max-width:840px; margin:0 auto; background:#fff; }
  @media screen{ body{ padding:16px; } .doc{ border-radius:18px; overflow:hidden; box-shadow:0 12px 48px rgba(20,33,58,.10); } }

  /* Bölüm düzeni */
  .sec{ padding:clamp(22px,5vw,44px); }
  .sec + .sec{ border-top:1px solid var(--line); }
  .eyebrow{ display:inline-block; font-size:11px; font-weight:700; letter-spacing:1.6px; text-transform:uppercase; color:var(--accent); margin-bottom:10px; }
  .sec h2{ font-size:clamp(20px,3.6vw,28px); font-weight:800; letter-spacing:-0.5px; color:var(--ink); }
  .sec .lead{ margin-top:12px; color:var(--muted); font-size:clamp(13px,2.4vw,15px); max-width:62ch; }

  /* HERO */
  .hero{ position:relative; overflow:hidden; padding:clamp(28px,6vw,52px); color:#fff;
    background:linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%); }
  .hero::after{ content:""; position:absolute; right:-80px; top:-80px; width:280px; height:280px; border-radius:50%;
    background:radial-gradient(circle, rgba(255,255,255,.22), transparent 70%); pointer-events:none; }
  .hero-top{ display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:clamp(24px,5vw,40px); position:relative; z-index:1; flex-wrap:wrap; }
  .brand-logo{ background:#fff; border-radius:14px; padding:10px 14px; box-shadow:0 8px 22px rgba(0,0,0,.16); }
  .brand-logo img{ max-height:54px; max-width:180px; object-fit:contain; display:block; }
  .brand-mark{ width:56px; height:56px; border-radius:16px; background:rgba(255,255,255,.18); border:1.5px solid rgba(255,255,255,.45);
    display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:800; color:#fff; }
  .hero-ref{ font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,.8); text-align:right; }
  .hero h1{ font-size:clamp(30px,7vw,52px); font-weight:800; letter-spacing:-1.2px; line-height:1.04; position:relative; z-index:1; }
  .hero .sub{ margin-top:12px; font-size:clamp(14px,3vw,18px); color:rgba(255,255,255,.9); max-width:48ch; position:relative; z-index:1; }
  .chips{ margin-top:clamp(18px,4vw,26px); display:flex; flex-wrap:wrap; gap:8px; position:relative; z-index:1; }
  .chip{ font-size:12px; font-weight:600; padding:7px 13px; border-radius:999px; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.28); color:#fff; }

  /* NEDEN BİZ */
  .why-grid{ margin-top:18px; display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; }
  .why-card{ display:flex; align-items:center; gap:11px; padding:14px 16px; border:1px solid var(--line); border-radius:14px; background:#fff; }
  .why-ic{ width:38px; height:38px; flex-shrink:0; border-radius:11px; background:var(--soft); color:var(--accent); display:flex; align-items:center; justify-content:center; }
  .why-tx{ font-size:13.5px; font-weight:600; color:var(--ink); }

  /* HİZMETLER */
  .svc-note{ margin-top:6px; font-size:12.5px; color:var(--muted); }
  .cat-grid{ margin-top:18px; display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
  .cat{ border:1px solid var(--line); border-radius:16px; overflow:hidden; break-inside:avoid; }
  .cat-h{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:var(--accent); color:#fff; }
  .cat-t{ font-size:13px; font-weight:700; letter-spacing:.2px; }
  .cat-n{ font-size:11px; font-weight:700; background:rgba(255,255,255,.2); border-radius:999px; padding:2px 9px; }
  .ln{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 16px; border-bottom:1px solid var(--line); }
  .ln:last-child{ border-bottom:none; }
  .ln-l{ min-width:0; }
  .ln-n{ display:block; font-size:13px; font-weight:600; color:var(--ink); }
  .ln-meta{ display:block; font-size:10.5px; color:var(--muted); margin-top:2px; }
  .ln-p{ font-size:14.5px; font-weight:800; color:var(--accent); white-space:nowrap; text-align:right; }
  .priceVal{ color:var(--accent); }
  .priceBlank{ color:#c3cbdb; font-weight:600; letter-spacing:2px; }

  /* SÜREÇ */
  .steps{ margin-top:18px; display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; }
  .step{ text-align:center; padding:16px 10px; border:1px solid var(--line); border-radius:14px; background:#fff; break-inside:avoid; }
  .step-n{ width:34px; height:34px; margin:0 auto 8px; border-radius:50%; background:var(--accent); color:#fff; font-weight:800; font-size:14px; display:flex; align-items:center; justify-content:center; }
  .step-t{ font-size:13px; font-weight:700; color:var(--ink); }
  .step-d{ font-size:11px; color:var(--muted); margin-top:3px; }

  /* FOOTER */
  .foot{ display:flex; flex-wrap:wrap; gap:10px 22px; }
  .footerItem{ display:flex; align-items:center; gap:7px; font-size:13px; color:var(--muted); font-weight:500; }
  .footerItem svg{ color:var(--accent); }
  .foot-note{ width:100%; margin-top:10px; font-size:11px; color:#9aa5ba; }

  /* ── A4 BASKI ── */
  @page{ size:A4 portrait; margin:12mm; }
  @media print{
    html, body{ background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    body{ padding:0; }
    .doc{ max-width:none; box-shadow:none; border-radius:0; }
    .hero{ padding:26px 28px; }
    .sec{ padding:22px 28px; }
    .hero h1{ font-size:34px; }
    .sec h2{ font-size:22px; }
    .why-card, .cat, .step{ break-inside:avoid; }
    .sec h2, .eyebrow{ break-after:avoid; }
  }
</style>
</head>
<body>
<div class="doc">

  <!-- HERO -->
  <header class="hero">
    <div class="hero-top">
      ${heroLogo}
      <div class="hero-ref">Hizmet Kataloğu${refStr ? `<br/>${escape(refStr)} · ${escape(dateStr)}` : ''}</div>
    </div>
    <h1>${escape(labName)}</h1>
    <div class="sub">${escape(coverSubtitle || 'Dijital Diş Laboratuvarı')}</div>
    ${heroChips ? `<div class="chips">${heroChips}</div>` : ''}
  </header>

  <!-- HAKKIMIZDA -->
  ${(aboutText && aboutText.trim()) ? `<section class="sec">
    <span class="eyebrow">Hakkımızda</span>
    <h2>${escape(aboutTitle || 'Tanışalım')}</h2>
    <p class="lead">${escape(aboutText)}</p>
  </section>` : ''}

  <!-- NEDEN BİZ -->
  <section class="sec">
    <span class="eyebrow">Neden biz</span>
    <h2>Bizi farklı kılan</h2>
    <div class="why-grid">${whyHtml}</div>
  </section>

  <!-- HİZMETLER & FİYATLAR -->
  <section class="sec">
    <span class="eyebrow">Hizmetler</span>
    <h2>Hizmetler &amp; Fiyatlar</h2>
    <div class="svc-note">${priceNote}</div>
    <div class="cat-grid">${tablesHtml || '<div class="svc-note">Henüz hizmet eklenmemiş.</div>'}</div>
  </section>

  <!-- SÜREÇ -->
  <section class="sec">
    <span class="eyebrow">Süreç</span>
    <h2>Dijital iş akışımız</h2>
    <div class="steps">${stepsHtml}</div>
  </section>

  <!-- İLETİŞİM -->
  <section class="sec">
    <span class="eyebrow">İletişim</span>
    <h2>${escape(labName)}</h2>
    <div class="foot" style="margin-top:14px">
      ${contactItems.join('')}
      ${footerNote ? `<div class="foot-note">${escape(footerNote)}</div>` : ''}
    </div>
  </section>

</div>
</body>
</html>`;
}
