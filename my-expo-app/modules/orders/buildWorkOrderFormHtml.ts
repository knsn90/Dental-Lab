/**
 * Klinik için bastırılabilir iş emri formu — kağıda elle doldurulur,
 * lab kurye/asistanı OCR ile tarayıp sipariş açar.
 *
 * Tasarım hedefi (2026 revizyonu):
 *   - Klinik asistanı formu 30–60 saniyede el yazısıyla doldurabilsin
 *   - Lab üretim için temiz, standart bilgi alsın
 *   - Minimal / premium kurumsal dental teknoloji görünümü
 *   - A4 tek sayfa; iki nüsha (klinik + laboratuvar) ayrı sayfa olarak basılır
 *
 * ÖNCEKİ SÜRÜMDEN FARK — bilinçli:
 *   "İşlem tipi" kutuları artık labın `lab_services` kataloğundan değil, SABİT
 *   ve kısa bir listeden (Kron / Köprü / İmplant …) üretiliyor. Katalog adları
 *   30+ kutuya çıkıp formu okunamaz hâle getiriyordu. Spesifik hizmet adı artık
 *   "İŞLEM DETAYI" tablosunun "İşlem / Materyal" sütununa yazılıyor.
 *   BEDELİ: OCR bu kutulardan doğrudan `lab_services` eşleşmesi çıkaramaz;
 *   eşleşme serbest metin sütunundan yapılmalı.
 */

import { formatAddress } from '../../core/util/formatAddress';

import { autoT } from '../../core/i18n/autoTranslate';
import { htmlAttrs, printLocale } from '../../core/i18n/printLocale';
export interface WorkOrderFormInput {
  clinic: {
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
  };
  lab: {
    name: string;
    logoUrl?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  /**
   * Kliniğin hekimleri — "Hekim" alanının altına ipucu olarak basılır.
   *
   * NEDEN: `work_orders.doctor_id` siparişin sahibini belirler (RLS, cari,
   * hekim performansı buna bağlı). Çok hekimli poliklinikte siparişin kime ait
   * olduğu kâğıttan okunabilmeli.
   */
  doctors?: Array<{ name: string }>;
  /**
   * Labın hizmet kataloğu. Yeni düzende kutu üretmez; "İşlem / Materyal"
   * sütununun altına örnek olarak en sık kullanılan birkaç ad yazdırılır.
   */
  services?: Array<{ name: string; category?: string | null }>;
  /** @deprecated Yeni düzen anatomik şema yerine numara kutuları kullanıyor. */
  toothPaths?: Record<number, string[]>;
  /** @deprecated Bkz. `toothPaths`. */
  toothLabelPos?: Record<number, [number, number]>;
  /** Form numarası öneki (sıralı blok için, opsiyonel) */
  serialPrefix?: string;
  /** Kaç nüsha — 1: yalnız klinik, 2 (varsayılan): klinik + laboratuvar */
  copies?: number;
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * Adresi tek satırlık okunur metne indirger.
 *
 * Adres bazı kayıtlarda JSON olarak tutuluyor (`{"il":"İstanbul",…}`) — ham
 * basılınca kâğıtta küme parantezli çöp çıkıyordu. `formatAddress` JSON'u
 * çözüyor; burada ayrıca satır sonları ve tekrar eden virgül/boşluklar
 * temizleniyor, çok uzun adresler kısaltılıyor (başlık tek satır kalmalı).
 */
function tidyAddress(raw: string | null | undefined, max = 72): string {
  const s = formatAddress(raw)
    // `formatAddress` bina numarasına "No: " ekliyor; kayıtta zaten "No.21"
    // yazıyorsa "No: No.21" çıkıyor. Ortak yardımcıyı (fatura/klinik ekranları
    // da kullanıyor) değiştirmemek için tekrarı burada yutuyoruz.
    .replace(/\bNo:\s*(No[.:]?\s*)/gi, 'No: ')
    .replace(/\s*[\r\n]+\s*/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(,\s*)+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '');
  return s.length > max ? s.slice(0, max - 1).replace(/[,\s]+$/, '') + '…' : s;
}

/** QR kod — qrserver.com ücretsiz API (PNG) */
function qrUrl(data: string, size = 160): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(data)}`;
}

// ── FDI diş numaraları ──────────────────────────────────────────────────────
const FDI_UPPER_R = [18, 17, 16, 15, 14, 13, 12, 11];
const FDI_UPPER_L = [21, 22, 23, 24, 25, 26, 27, 28];
const FDI_LOWER_R = [48, 47, 46, 45, 44, 43, 42, 41];
const FDI_LOWER_L = [31, 32, 33, 34, 35, 36, 37, 38];

// ── Sabit seçenek listeleri ─────────────────────────────────────────────────
/** Birincil işlem tipleri — az sayıda, büyük kutu. Okunabilirlik > kapsayıcılık. */
const WORK_TYPES_PRIMARY = ['Kron', 'Köprü', 'İmplant', 'Geçici', 'Lamine', 'Guide', 'Plak', 'Model', 'Diğer'];
/** İkincil işlemler — küçük kutu, ana listeyi kalabalıklaştırmadan. */
const WORK_TYPES_SECONDARY = ['CAD/CAM tasarım', '3D baskı', 'Ortodonti', 'Tamir / revizyon'];

const RECORD_TYPES = ['STL / IOS', 'Fiziksel ölçü', 'Model', 'Fotoğraf'];
const IMPLANT_TOPS = ['TiBase', 'Screw', 'Hibrit', 'Bar', 'Custom'];
const SHADE_QUICK = ['A1', 'A2', 'A3', 'B1', 'BL'];
const DELIVERY_METHODS = ['Kurye', 'Kargo', 'Elden'];
const APPROVALS = ['Tasarım onayı istenir', 'Telefonla bilgi veriniz', 'Fotoğrafla onay'];

/** Not alanı satır sayısı — imza blokları kalkınca boşalan yer buraya verildi. */
const NOTE_LINES = 7;

const URGENCY = [
  { label: 'Normal', color: 'var(--accent)' },
  { label: 'Acil', color: '#F97316' },
  { label: 'Çok acil', color: '#DC2626' },
];

// ── Parça üreticiler ────────────────────────────────────────────────────────

/** Kutu + etiket. `sm` ikincil satırlar için küçük varyant. */
function check(label: string, sm = false): string {
  return `<label class="chk${sm ? ' chk-sm' : ''}"><span class="box"></span>${esc(label)}</label>`;
}

/** Yuvarlak seçim (radio görünümlü) — birbirini dışlayan seçenekler için. */
function radio(label: string, dotColor?: string): string {
  const dot = dotColor ? `<span class="dot" style="background:${dotColor}"></span>` : '';
  return `<label class="chk rad"><span class="ring"></span>${dot}${esc(label)}</label>`;
}

/**
 * El yazısı alanı. `value` verilirse alan MATBU basılır (çizgi üstünde değer
 * yazılı olur) — form klinik başına üretildiği için klinik künyesi elle
 * doldurulmaz, kağıda basılı gelir.
 */
function field(label: string, opts: { hint?: string; value?: string | null } = {}): string {
  const v = (opts.value ?? '').trim();
  return `
    <div class="field">
      <div class="field-label">${esc(label)}</div>
      <div class="field-line${v ? ' field-filled' : ''}">${v ? `<span class="field-value">${esc(v)}</span>` : ''}</div>
      ${opts.hint ? `<div class="field-hint">${esc(opts.hint)}</div>` : ''}
    </div>`;
}

/**
 * Yazı satırı yerine seçenekli alan (ör. Cinsiyet K / E).
 * Elle yazmaktan hızlı, OCR'da da serbest metinden güvenilir.
 */
function fieldChoice(label: string, options: string[]): string {
  return `
    <div class="field">
      <div class="field-label">${esc(label)}</div>
      <div class="field-choice">${options.map(o => radio(o)).join('')}</div>
    </div>`;
}

/** Tek çene yarımı — her diş numarası kendi yuvarlatılmış kutusunda. */
function toothRow(nums: number[]): string {
  return nums.map(n => `<span class="tooth">${n}</span>`).join('');
}

function renderArch(title: string, right: number[], left: number[]): string {
  return `
    <div class="arch">
      <div class="arch-title">${esc(title)}</div>
      <div class="arch-row">
        <span class="arch-half">${toothRow(right)}</span>
        <span class="arch-mid"></span>
        <span class="arch-half">${toothRow(left)}</span>
      </div>
    </div>`;
}

/** İŞLEM DETAYI tablosu — formun en geniş çalışma alanı. */
function renderDetailTable(rows = 5): string {
  const body = Array.from({ length: rows }, () =>
    `<tr><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  return `
    <table class="detail">
      <thead>
        <tr>
          <th style="width:16%">${autoT('Diş / Bölge')}</th>
          <th style="width:32%">${autoT('İşlem / Materyal')}</th>
          <th style="width:12%">Renk</th>
          <th style="width:9%">${autoT('Adet')}</th>
          <th style="width:31%">${autoT('Özel not')}</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

type Variant = 'clinic' | 'lab';

function renderPage(input: WorkOrderFormInput, variant: Variant): string {
  const isLab = variant === 'lab';
  const qrData = `WORKORDER:${input.clinic.id}`;

  // Katalogdan birkaç örnek ad — asistan "İşlem / Materyal" sütununa ne
  // yazacağını bilsin diye ipucu; kutu değil, yalnız metin.
  const sampleServices = (input.services ?? [])
    .map(s => s.name).filter(Boolean).slice(0, 6).join(' · ');

  const doctorHint = (input.doctors ?? []).map(d => d.name).filter(Boolean).slice(0, 4).join(' · ');

  return `
<section class="page">

  <!-- ══ Başlık ══
       Marka LABIN: sol üstte laboratuvarın logosu ve iletişimi.
       Manşet ise KLİNİĞİN: form klinik başına basıldığı için kliniğin adı ve
       iletişimi matbu gelir, elle doldurulmaz. -->
  <header class="head">
    <div class="brand">
      ${input.lab.logoUrl
        ? `<img class="logo" src="${esc(input.lab.logoUrl)}" alt="${esc(input.lab.name)}" />`
        : `<div class="mark">
             <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
               <path d="M12 4.6c-1.6-1-3.2-1.4-4.6-1C5.4 4.2 4.2 6 4.2 8.6c0 2.2.6 4.6 1.6 7 .8 2 1.7 3.3 2.7 3.3.8 0 1.2-.5 1.6-1.7l.9-2.8c.3-.9.6-1.3 1-1.3s.7.4 1 1.3l.9 2.8c.4 1.2.8 1.7 1.6 1.7 1 0 1.9-1.3 2.7-3.3 1-2.4 1.6-4.8 1.6-7 0-2.6-1.2-4.4-3.2-5-1.4-.4-3 0-4.6 1z"
                     fill="none" stroke="#12A9A2" stroke-width="1.6" stroke-linejoin="round"/>
             </svg>
             <span class="mark-text">${esc((input.lab.name || 'LAB').split(/\s+/)[0].toLocaleUpperCase('tr-TR'))}</span>
           </div>`}
      <div class="lab-meta">
        <div class="lab-name">${esc(input.lab.name)}</div>
        ${[input.lab.phone, tidyAddress(input.lab.address, 58)].filter(Boolean).map(t =>
          `<div class="lab-line">${esc(t)}</div>`).join('')}
      </div>
    </div>

    <div class="brand-copy">
      <div class="eyebrow">${autoT('İş Emri Formu')}</div>
      <h1 class="title">${esc(input.clinic.name)}</h1>
      <div class="clinic-line">${
        [input.clinic.phone, tidyAddress(input.clinic.address)].filter(Boolean).map(esc).join(' · ') || '&nbsp;'
      }</div>
      <div class="subtitle">${isLab
        ? 'Laboratuvar nüshası • Kabul, planlama ve üretim takibi'
        : 'Klinik nüshası • Hızlı teslim ve üretim kaydı'}</div>
    </div>

    <div class="head-right">
      <div class="qr-wrap">
        <img class="qr" src="${qrUrl(qrData)}" alt="QR" />
        <div class="qr-cap">${autoT('SIMAN İş Emri QR')}</div>
      </div>
    </div>
  </header>

  <!-- ══ Teslim kontrol bandı ══ -->
  <div class="band">
    <div class="band-cell band-urgency">
      <div class="cap">${autoT('Teslim önceliği')}</div>
      <div class="urg">${URGENCY.map(u => radio(u.label, u.color)).join('')}</div>
    </div>
    <div class="band-cell band-due">
      <div class="cap cap-accent">Teslim tarihi / saati</div>
      <div class="band-line band-line-strong"></div>
    </div>
    <div class="band-cell band-created">
      <div class="cap">${autoT('Kayıt tarihi')}</div>
      <div class="band-line"></div>
    </div>
  </div>

  <!-- ══ Hasta & klinik ══ -->
  <section class="sec">
    <div class="sec-head"><h2>${autoT('Hasta &amp; klinik bilgisi')}</h2></div>
    <!-- Klinik adı burada tekrar edilmiyor: sayfa başlığında matbu duruyor.
         Boşalan yer hasta künyesine verildi — laboratuvar kaydı ve estetik
         kararlar için yaş/cinsiyet üretimde gerçekten kullanılıyor. -->
    <div class="grid-patient">
      ${field('Hasta adı / kodu')}
      ${field('Yaş / doğum tarihi')}
      ${fieldChoice('Cinsiyet', ['K', 'E'])}
    </div>
    <div class="grid-4">
      ${field('Hekim', { hint: doctorHint || undefined })}
      ${field('Hekim telefonu', { hint: input.clinic.phone ? `klinik: ${input.clinic.phone}` : undefined })}
      ${field('Klinik referansı')}
      ${field('Sorumlu asistan')}
    </div>
  </section>

  <!-- ══ Diş seçimi ══ -->
  <section class="sec">
    <div class="sec-head">
      <h2>${autoT('Diş seçimi')}</h2>
      <span class="sec-note">${autoT('İşlem yapılacak dişleri daire içine alınız')}</span>
    </div>
    <div class="teeth">
      ${renderArch('Üst çene', FDI_UPPER_R, FDI_UPPER_L)}
      ${renderArch('Alt çene', FDI_LOWER_R, FDI_LOWER_L)}
    </div>
  </section>

  <!-- ══ İşlem tipi ══ -->
  <section class="sec">
    <div class="sec-head"><h2>${autoT('İşlem tipi')}</h2></div>
    <div class="types">${WORK_TYPES_PRIMARY.map(t => check(t)).join('')}</div>
    <div class="types types-sec">${WORK_TYPES_SECONDARY.map(t => check(t, true)).join('')}</div>
  </section>

  <!-- ══ İşlem detayı ══ -->
  <section class="sec sec-grow">
    <div class="sec-head">
      <h2>${autoT('İşlem detayı')}</h2>
      ${sampleServices ? `<span class="sec-note">${esc(sampleServices)}</span>` : ''}
    </div>
    ${renderDetailTable(5)}
  </section>

  <!-- ══ Kayıt + implant ══ -->
  <div class="grid-2">
    <section class="sec box">
      <div class="sec-head"><h2>${autoT('Ölçü / dijital kayıt')}</h2></div>
      <div class="types types-sec">${RECORD_TYPES.map(t => check(t, true)).join('')}</div>
      ${field('Tarama / dosya referansı')}
    </section>
    <section class="sec box">
      <div class="sec-head"><h2>${autoT('İmplant detayı (varsa)')}</h2></div>
      <div class="grid-2 tight">
        ${field('Sistem / marka')}
        ${field('Çap / boy')}
      </div>
      <div class="types types-sec">${IMPLANT_TOPS.map(t => radio(t)).join('')}</div>
    </section>
  </div>

  <!-- ══ Renk · teslim · onay ══ -->
  <div class="grid-3 cards">
    <section class="sec box">
      <div class="sec-head"><h2>Renk</h2></div>
      <div class="band-line"></div>
      <div class="types types-sec">${SHADE_QUICK.map(s => check(s, true)).join('')}</div>
    </section>
    <section class="sec box">
      <div class="sec-head"><h2>${autoT('Teslim şekli')}</h2></div>
      <div class="types types-sec">${DELIVERY_METHODS.map(s => radio(s)).join('')}</div>
      ${field('Teslim alacak kişi')}
    </section>
    <section class="sec box">
      <div class="sec-head"><h2>${autoT('Onay &amp; iletişim')}</h2></div>
      <div class="types types-sec col">${APPROVALS.map(s => check(s, true)).join('')}</div>
    </section>
  </div>

  <!-- ══ Not ══ -->
  <section class="sec">
    <div class="sec-head"><h2>${isLab ? 'Laboratuvar notu / üretim talimatı' : 'Klinik notu / özel talep'}</h2></div>
    <div class="note">
      ${Array.from({ length: NOTE_LINES }, () => '<div class="note-line"></div>').join('')}
    </div>
  </section>

  <!-- ══ Footer ══ -->
  <footer class="foot">
    <div class="foot-meta">
      <span>SIMAN / ${esc(input.lab.name)} • ${isLab ? 'Laboratuvar nüshası' : 'Klinik nüshası'} • Formu QR üzerinden takip edebilirsiniz.</span>
      <span class="rev">Rev. 01 • 2026</span>
    </div>
  </footer>

</section>`;
}

export function buildWorkOrderFormHtml(input: WorkOrderFormInput): string {
  const copies = input.copies ?? 2;
  const variants: Variant[] = copies >= 2 ? ['clinic', 'lab'] : ['clinic'];
  const pages = variants.map(v => renderPage(input, v)).join('\n');

  return `<!doctype html>
<html ${htmlAttrs()}><head>
<meta charset="utf-8" />
<title>İş Emri Formu — ${esc(input.clinic.name)}</title>
<style>
  /* ── Marka ───────────────────────────────────────────────────────────── */
  :root {
    --ink:        #111827;   /* ana metin + başlıklar */
    --navy:       #0F172A;   /* logo zemini, tablo başlığı */
    --accent:     #12A9A2;   /* turkuaz vurgu */
    --line:       #CBD5E1;   /* ince açık gri border */
    --line-soft:  #E2E8F0;
    --muted:      #64748B;
    --paper:      #FFFFFF;
  }

  /* Baskıda renkler solmasın; @page marjı 0 — kenar boşluğunu sayfa
     kendisi verir, böylece tarayıcı marjı düzeni kaydırmaz. */
  @page { size: A4; margin: 0; }
  @media print {
    html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .page { page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #F1F5F9; }
  body {
    font-family: Inter, Arial, Helvetica, "Helvetica Neue", sans-serif;
    color: var(--ink);
    font-size: 8.4pt;
    line-height: 1.25;
    -webkit-font-smoothing: antialiased;
  }

  /* A4 sayfa. Satırlar: başlık · esneyen gövde · footer.
     Sabit yükseklikli calc() YOK — footer payı yapısal olarak korunur. */
  .page {
    width: 210mm; height: 297mm;
    padding: 10mm 11mm 8mm;
    background: var(--paper);
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    grid-auto-rows: min-content;
    row-gap: 1.7mm;
    overflow: hidden;
    margin: 0 auto;
  }
  @media screen { .page { box-shadow: 0 2px 18px rgba(15,23,42,.14); margin: 10mm auto; } }

  /* ── Başlık ──────────────────────────────────────────────────────────── */
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6mm; }
  .brand { display: flex; flex-direction: column; gap: 1.6mm; width: 44mm; flex: none; }
  .logo { max-width: 42mm; max-height: 13mm; object-fit: contain; display: block; }
  .lab-name { font-size: 7.4pt; font-weight: 700; color: var(--ink); }
  .lab-line { font-size: 6.2pt; color: var(--muted); line-height: 1.35; }
  .brand-copy { flex: 1; min-width: 0; }
  .clinic-line { font-size: 7pt; color: var(--muted); margin-top: .8mm; }
  .mark {
    display: flex; align-items: center; gap: 2mm;
    background: var(--navy); border-radius: 3mm;
    padding: 2.4mm 3.4mm; min-width: 25mm;
  }
  .mark-text { color: #fff; font-size: 11pt; font-weight: 700; letter-spacing: 2.2px; }
  .eyebrow { font-size: 6.6pt; font-weight: 700; letter-spacing: 1.9px; color: var(--accent); text-transform: uppercase; }
  .title { font-size: 17pt; font-weight: 700; letter-spacing: -.4px; line-height: 1.05; margin-top: .6mm; }
  .subtitle { font-size: 7.6pt; color: var(--muted); margin-top: 1mm; }

  .head-right { display: flex; align-items: flex-start; gap: 4mm; }
  .qr-wrap { text-align: center; }
  .qr { width: 17mm; height: 17mm; display: block; border: 1px solid var(--line); border-radius: 2mm; padding: 1mm; background: #fff; }
  .qr-cap { font-size: 5.8pt; font-weight: 700; letter-spacing: .9px; color: var(--muted); text-transform: uppercase; margin-top: 1.2mm; }

  /* ── Teslim bandı ────────────────────────────────────────────────────── */
  .band {
    display: grid; grid-template-columns: 1.25fr 1.1fr .75fr;
    border: 1px solid var(--line); border-radius: 3mm; overflow: hidden;
  }
  .band-cell { padding: 2mm 3.6mm; border-inline-start: 1px solid var(--line-soft); }
  .band-cell:first-child { border-inline-start: 0; }
  .band-due { background: #F0FDFA; }
  .cap { font-size: 6.4pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); }
  .cap-accent { color: var(--accent); }
  .urg { display: flex; gap: 5mm; margin-top: 2.4mm; }
  .band-line { border-bottom: 1px solid var(--line); height: 6.2mm; margin-top: .8mm; }
  .band-line-strong { border-bottom: 1.6px solid var(--accent); height: 7.4mm; }

  /* ── Bölüm iskeleti ──────────────────────────────────────────────────── */
  .sec-head { display: flex; align-items: baseline; gap: 3mm; margin-bottom: 1.2mm; }
  .sec-head h2 {
    font-size: 7.4pt; font-weight: 700; letter-spacing: 1.6px;
    text-transform: uppercase; color: var(--ink);
  }
  .sec-head h2::before {
    content: ''; display: inline-block; width: 2mm; height: 2mm; border-radius: .6mm;
    background: var(--accent); margin-inline-end: 2mm; vertical-align: middle;
  }
  .sec-note { font-size: 6.8pt; color: var(--muted); }
  .box { border: 1px solid var(--line); border-radius: 3mm; padding: 2.4mm 3mm; }
  .sec-grow { display: flex; flex-direction: column; min-height: 0; }

  /* ── Alanlar ─────────────────────────────────────────────────────────── */
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.4mm 6mm; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.4mm 5mm; }
  .grid-patient { display: grid; grid-template-columns: 2fr 1.1fr 1fr; gap: 2.4mm 5mm; margin-bottom: 2.4mm; }
  .field-choice { display: flex; gap: 5mm; height: 5.2mm; align-items: center; }
  .grid-2.tight { gap: 4mm; margin-bottom: 1.5mm; }
  .field-label { font-size: 6.4pt; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); }
  .field-line { border-bottom: 1px solid var(--line); height: 5.2mm; display: flex; align-items: flex-end; }
  .field-filled { border-bottom-color: var(--line-soft); }
  .field-value { font-size: 8.4pt; font-weight: 600; color: var(--ink); padding-bottom: .6mm; }
  .field-hint { font-size: 6.2pt; color: #94A3B8; margin-top: .6mm; }

  /* ── Diş seçimi ──────────────────────────────────────────────────────── */
  .teeth { display: grid; gap: 2mm; }
  .arch { display: flex; align-items: center; gap: 3mm; }
  .arch-title {
    font-size: 6.2pt; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
    color: var(--muted); width: 15mm; flex: none;
  }
  .arch-row { display: flex; align-items: center; gap: 1.2mm; flex: 1; }
  .arch-half { display: flex; gap: 1.2mm; }
  .arch-mid { width: 3mm; }
  .tooth {
    width: 9.4mm; height: 7mm; border: 1px solid var(--line); border-radius: 2mm;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 8pt; font-weight: 600; color: var(--ink); background: #fff;
  }

  /* ── Kutucuklar ──────────────────────────────────────────────────────── */
  .types { display: flex; flex-wrap: wrap; gap: 2mm 3.6mm; }
  .types-sec { gap: 2mm 4mm; margin-top: 2mm; }
  .types.col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.8mm 3mm; }
  .chk { display: inline-flex; align-items: center; gap: 1.8mm; font-size: 8pt; font-weight: 500; }
  .chk-sm { font-size: 7.4pt; font-weight: 400; }
  .box, .chk .box { }
  .chk .box {
    width: 3.8mm; height: 3.8mm; border: 1.2px solid #94A3B8; border-radius: 1mm;
    display: inline-block; flex: none; background: #fff;
  }
  .chk-sm .box { width: 3.2mm; height: 3.2mm; }
  .chk .ring {
    width: 3.6mm; height: 3.6mm; border: 1.2px solid #94A3B8; border-radius: 50%;
    display: inline-block; flex: none; background: #fff;
  }
  .chk .dot { width: 2mm; height: 2mm; border-radius: 50%; display: inline-block; flex: none; margin-inline-start: -.6mm; }

  /* ── İşlem detayı tablosu ────────────────────────────────────────────── */
  .detail { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--line); border-radius: 3mm; overflow: hidden; }
  .detail thead th {
    background: var(--navy); color: #fff; text-align: start;
    font-size: 6.6pt; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
    padding: 2.6mm 3mm;
  }
  .detail tbody td { border-top: 1px solid var(--line-soft); height: 7mm; padding: 0 3mm; }
  .detail tbody td + td { border-inline-start: 1px solid var(--line-soft); }

  /* ── Not ─────────────────────────────────────────────────────────────── */
  .note { border: 1px solid var(--line); border-radius: 3mm; padding: 2mm 3.5mm 0; }
  .note-line { border-bottom: 1px solid var(--line-soft); height: 5mm; }
  .note-line:last-child { border-bottom: 0; }

  /* ── Footer ──────────────────────────────────────────────────────────── */
  .foot { border-top: 1px solid var(--line); padding-top: 2.4mm; }
  .foot-meta { display: flex; justify-content: space-between; align-items: baseline; font-size: 6.6pt; color: var(--muted); }
  .rev { font-weight: 700; letter-spacing: .8px; }
</style>
</head>
<body>
${pages}
<script>
  // Yazdırma diyaloğu, QR görseli yüklendikten sonra açılsın; erken açılırsa
  // QR boş basılıyor.
  (function () {
    var imgs = Array.prototype.slice.call(document.images);
    var pending = imgs.filter(function (i) { return !i.complete; }).length;
    function go() { setTimeout(function () { window.print(); }, 120); }
    if (pending === 0) { go(); return; }
    imgs.forEach(function (i) {
      if (i.complete) return;
      i.addEventListener('load', function () { if (--pending === 0) go(); });
      i.addEventListener('error', function () { if (--pending === 0) go(); });
    });
    setTimeout(go, 2500);   // ağ takılırsa yine de bas
  })();
</script>
</body></html>`;
}
