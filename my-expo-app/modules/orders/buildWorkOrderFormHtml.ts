/**
 * Klinik için bastırılabilir iş emri formu — kağıda elle doldurulur,
 * lab kurye/asistanı OCR ile tarayıp sipariş açar.
 *
 * Tasarım hedefi:
 *   - Sıfır eğitim, sıfır yazı (doktor sadece kutu işaretler)
 *   - OCR doğruluğu için yapılandırılmış kutular + QR kod
 *   - Klinik bilgisi formun üstünde matbu (kliniğin kağıdı gibi hissetsin)
 *   - A4 tek sayfa, 2 kopya basılabilir
 */

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
  /** Form numarası başlangıcı (sıralı blok için, opsiyonel) */
  serialPrefix?: string;
  /** Kaç kopya basılsın — default 2 (klinik + lab) */
  copies?: number;
}

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** QR kod — qrserver.com free API (200×200 PNG) */
function qrUrl(data: string, size = 110): string {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encoded}`;
}

function renderTeethGrid(): string {
  // FDI numaralandırma — üst (1-2 kadran) + alt (3-4 kadran)
  const upper = [
    [18, 17, 16, 15, 14, 13, 12, 11], // sağ üst → orta
    [21, 22, 23, 24, 25, 26, 27, 28], // orta → sol üst
  ];
  const lower = [
    [48, 47, 46, 45, 44, 43, 42, 41], // sağ alt → orta
    [31, 32, 33, 34, 35, 36, 37, 38], // orta → sol alt
  ];
  const renderRow = (arr: number[]) => arr.map(n =>
    `<div class="tooth"><div class="tooth-num">${n}</div><div class="tooth-box"></div></div>`
  ).join('');
  return `
    <div class="teeth-section">
      <div class="teeth-half">
        <div class="teeth-label">ÜST ÇENE</div>
        <div class="teeth-row">${renderRow(upper[0])}<div class="midline"></div>${renderRow(upper[1])}</div>
      </div>
      <div class="teeth-half">
        <div class="teeth-label">ALT ÇENE</div>
        <div class="teeth-row">${renderRow(lower[0])}<div class="midline"></div>${renderRow(lower[1])}</div>
      </div>
    </div>
  `;
}

const WORK_TYPES = [
  'Zirkonyum', 'Metal-Porselen', 'E-max', 'Tam Seramik',
  'İmplant Üstü', 'Hareketli Protez', 'Geçici Kron', 'Onlay/Inlay',
];

const SHADES = ['A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'C1', 'C2', 'D2', 'D3'];

const IMPRESSION_TYPES = ['Klasik (Ölçü Kaşığı)', 'Dijital (STL)', 'Putty/Wash'];

const URGENCY = [
  { val: 'normal', label: 'Normal' },
  { val: 'acil',   label: 'Acil' },
  { val: 'cok_acil', label: 'Çok Acil' },
];

function renderSingleForm(input: WorkOrderFormInput, copyLabel?: string): string {
  const qrData = `WORKORDER:${input.clinic.id}`;
  return `
  <div class="form-sheet">
    ${copyLabel ? `<div class="copy-label">${esc(copyLabel)}</div>` : ''}

    <!-- HEADER -->
    <div class="form-header">
      <div class="lab-block">
        ${input.lab.logoUrl ? `<img src="${esc(input.lab.logoUrl)}" alt="" class="lab-logo" />` : `<div class="lab-name">${esc(input.lab.name)}</div>`}
        <div class="lab-meta">${[input.lab.phone, input.lab.address].filter(Boolean).map(esc).join(' · ')}</div>
      </div>
      <div class="doc-title-block">
        <div class="doc-eyebrow">İŞ EMRİ FORMU</div>
        <div class="doc-title">${esc(input.clinic.name)}</div>
        ${input.clinic.phone ? `<div class="clinic-meta">${esc(input.clinic.phone)}</div>` : ''}
      </div>
      <div class="qr-block">
        <img src="${qrUrl(qrData)}" alt="QR" class="qr-img" />
        <div class="qr-text">Lab tarama kodu</div>
      </div>
    </div>

    <!-- TOP ROW: hasta + tarih + aciliyet -->
    <div class="top-row">
      <div class="field flex-2">
        <div class="field-label">Hasta Adı</div>
        <div class="field-line"></div>
      </div>
      <div class="field">
        <div class="field-label">Tarih</div>
        <div class="date-boxes">
          <div class="date-box">G</div><div class="date-box">G</div>
          <span class="date-sep">/</span>
          <div class="date-box">A</div><div class="date-box">A</div>
          <span class="date-sep">/</span>
          <div class="date-box">Y</div><div class="date-box">Y</div>
          <div class="date-box">Y</div><div class="date-box">Y</div>
        </div>
      </div>
      <div class="field">
        <div class="field-label">Teslim Tarihi</div>
        <div class="date-boxes">
          <div class="date-box">G</div><div class="date-box">G</div>
          <span class="date-sep">/</span>
          <div class="date-box">A</div><div class="date-box">A</div>
          <span class="date-sep">/</span>
          <div class="date-box">Y</div><div class="date-box">Y</div>
          <div class="date-box">Y</div><div class="date-box">Y</div>
        </div>
      </div>
    </div>

    <!-- ACİLİYET CHECKBOX -->
    <div class="row-checks">
      <div class="check-label">Aciliyet:</div>
      ${URGENCY.map(u => `<div class="check-item"><div class="check-box"></div><span>${esc(u.label)}</span></div>`).join('')}
    </div>

    <!-- TEETH DIAGRAM -->
    ${renderTeethGrid()}

    <!-- WORK TYPE GRID -->
    <div class="section-title">İşlem Tipi</div>
    <div class="check-grid">
      ${WORK_TYPES.map(t => `<div class="check-item"><div class="check-box"></div><span>${esc(t)}</span></div>`).join('')}
    </div>

    <!-- SHADE GRID -->
    <div class="section-title">Renk (Vita Skalası)</div>
    <div class="shade-grid">
      ${SHADES.map(s => `<div class="check-item"><div class="check-box"></div><span class="shade-code">${esc(s)}</span></div>`).join('')}
      <div class="check-item"><div class="check-box"></div><span>Diğer:</span><div class="inline-line"></div></div>
    </div>

    <!-- IMPRESSION -->
    <div class="section-title">Ölçü Yöntemi</div>
    <div class="check-grid two-col">
      ${IMPRESSION_TYPES.map(t => `<div class="check-item"><div class="check-box"></div><span>${esc(t)}</span></div>`).join('')}
    </div>

    <!-- NOTES -->
    <div class="section-title">Özel Notlar</div>
    <div class="notes-lines">
      <div class="note-line"></div>
      <div class="note-line"></div>
      <div class="note-line"></div>
    </div>

    <!-- FOOTER: signatures -->
    <div class="form-footer">
      <div class="signature-block">
        <div class="signature-label">Doktor İmza</div>
        <div class="signature-line"></div>
      </div>
      <div class="signature-block">
        <div class="signature-label">Teslim Alan</div>
        <div class="signature-line"></div>
      </div>
      <div class="signature-block">
        <div class="signature-label">Lab Onay</div>
        <div class="signature-line"></div>
      </div>
    </div>

    <div class="form-foot-note">
      Bu form fotoğraflanıp lab sistemine yüklenir — otomatik iş emri açılır.
      ${input.serialPrefix ? `· Form serisi: <strong>${esc(input.serialPrefix)}</strong>` : ''}
    </div>
  </div>
  `;
}

export function buildWorkOrderFormHtml(input: WorkOrderFormInput): string {
  const copies = input.copies ?? 2;
  const sheets = Array.from({ length: copies }, (_, i) =>
    renderSingleForm(input, copies > 1 ? (i === 0 ? 'KLİNİK NÜSHASI' : 'LAB NÜSHASI') : undefined)
  ).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>İş Emri Formu — ${esc(input.clinic.name)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink-900: #0B1220;
    --ink-700: #1F2937;
    --ink-500: #4B5563;
    --ink-400: #6B7280;
    --line:    #D1D5DB;
    --line-2:  #E5E7EB;
    --bg:      #F8F9FB;
    --paper:   #FFFFFF;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    background: var(--bg);
    color: var(--ink-900);
    font-size: 11px;
    line-height: 1.4;
    padding: 20px 0;
  }

  /* Toolbar */
  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 20px; background: var(--ink-900); color: #fff;
  }
  .toolbar .title { flex: 1; font-size: 13px; font-weight: 500; }
  .toolbar button {
    padding: 7px 18px; border-radius: 6px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600;
  }
  .toolbar .btn-print { background: #FFFFFF; color: var(--ink-900); }
  .toolbar .btn-close { background: rgba(255,255,255,0.10); color: #FFFFFF; }
  @media print {
    .toolbar { display: none !important; }
    body { background: #FFFFFF; padding: 0; }
    .form-sheet { box-shadow: none !important; border: none !important; page-break-after: always; }
    .form-sheet:last-child { page-break-after: auto; }
  }

  .form-sheet {
    max-width: 800px;
    margin: 60px auto 24px;
    background: var(--paper);
    padding: 24px 28px;
    border: 1.5px solid var(--ink-900);
    position: relative;
    page-break-inside: avoid;
  }
  .copy-label {
    position: absolute; top: 8px; right: 28px;
    font-size: 9px; font-weight: 700;
    letter-spacing: 1.4px; text-transform: uppercase;
    color: var(--ink-400);
  }

  /* Header */
  .form-header {
    display: grid; grid-template-columns: 1fr 1.4fr 130px;
    gap: 16px; align-items: center;
    padding-bottom: 12px; margin-bottom: 14px;
    border-bottom: 2px solid var(--ink-900);
  }
  .lab-block .lab-logo { height: 32px; max-width: 160px; object-fit: contain; margin-bottom: 4px; }
  .lab-name { font-size: 14px; font-weight: 700; color: var(--ink-900); }
  .lab-meta { font-size: 9.5px; color: var(--ink-500); margin-top: 2px; line-height: 1.4; }

  .doc-title-block { text-align: center; }
  .doc-eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 2.4px; color: var(--ink-500); margin-bottom: 4px; }
  .doc-title { font-size: 18px; font-weight: 700; color: var(--ink-900); letter-spacing: -0.3px; line-height: 1.2; }
  .clinic-meta { font-size: 10px; color: var(--ink-500); margin-top: 4px; }

  .qr-block { text-align: center; }
  .qr-img { width: 76px; height: 76px; border: 1px solid var(--line-2); }
  .qr-text { font-size: 8px; color: var(--ink-400); margin-top: 4px; letter-spacing: 0.4px; }

  /* Top row */
  .top-row {
    display: grid; grid-template-columns: 2fr 1fr 1fr;
    gap: 14px; margin-bottom: 12px;
  }
  .field { display: flex; flex-direction: column; }
  .field.flex-2 { grid-column: span 1; }
  .field-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1px;
    color: var(--ink-500); margin-bottom: 4px; text-transform: uppercase;
  }
  .field-line {
    border-bottom: 1.5px solid var(--ink-900);
    height: 22px;
  }
  .date-boxes { display: flex; gap: 3px; align-items: center; }
  .date-box {
    width: 18px; height: 22px;
    border: 1.2px solid var(--ink-700);
    border-radius: 2px;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; color: var(--ink-400);
  }
  .date-sep { font-size: 13px; color: var(--ink-400); padding: 0 2px; }

  /* Aciliyet row */
  .row-checks {
    display: flex; gap: 14px; align-items: center;
    margin-bottom: 14px; padding: 8px 12px;
    background: #FFF8E7; border-left: 3px solid #D97706;
  }
  .check-label { font-size: 10px; font-weight: 700; color: var(--ink-700); letter-spacing: 0.6px; }

  /* Teeth grid */
  .teeth-section {
    display: flex; flex-direction: column;
    margin-bottom: 14px; padding: 12px;
    background: #F9FAFB; border: 1px solid var(--line-2); border-radius: 6px;
  }
  .teeth-half { margin-bottom: 8px; }
  .teeth-half:last-child { margin-bottom: 0; }
  .teeth-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1.2px;
    color: var(--ink-500); margin-bottom: 6px; text-align: center;
  }
  .teeth-row {
    display: flex; gap: 3px; justify-content: center; align-items: flex-end;
  }
  .tooth {
    display: flex; flex-direction: column; align-items: center;
  }
  .tooth-num {
    font-size: 8.5px; color: var(--ink-500); font-weight: 600;
    margin-bottom: 2px; font-variant-numeric: tabular-nums;
  }
  .tooth-box {
    width: 26px; height: 26px;
    border: 1.5px solid var(--ink-700);
    border-radius: 3px;
    background: #FFFFFF;
  }
  .midline {
    width: 1.5px; height: 26px;
    background: var(--ink-900);
    margin: 0 6px;
    align-self: flex-end;
  }

  /* Section titles */
  .section-title {
    font-size: 10px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--ink-500);
    margin: 10px 0 6px;
    padding-bottom: 4px; border-bottom: 1px solid var(--line-2);
  }

  /* Check grids */
  .check-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px;
    margin-bottom: 4px;
  }
  .check-grid.two-col { grid-template-columns: repeat(3, 1fr); }
  .shade-grid {
    display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px 10px;
    margin-bottom: 4px;
  }
  .check-item {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: var(--ink-700);
  }
  .check-box {
    width: 14px; height: 14px; min-width: 14px;
    border: 1.5px solid var(--ink-700);
    border-radius: 2px;
    background: #FFFFFF;
  }
  .shade-code {
    font-weight: 700; font-variant-numeric: tabular-nums;
    font-size: 11.5px;
  }
  .inline-line {
    flex: 1; min-width: 50px;
    border-bottom: 1px solid var(--ink-700);
    height: 14px;
  }

  /* Notes */
  .notes-lines { display: flex; flex-direction: column; gap: 14px; padding: 6px 0; }
  .note-line {
    height: 1.5px; background: var(--ink-700);
  }

  /* Footer signatures */
  .form-footer {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 24px; margin-top: 18px;
    padding-top: 14px; border-top: 1px solid var(--line-2);
  }
  .signature-block { display: flex; flex-direction: column; align-items: center; }
  .signature-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1px;
    color: var(--ink-500); text-transform: uppercase; margin-bottom: 18px;
  }
  .signature-line {
    width: 100%; border-bottom: 1.5px solid var(--ink-700);
  }

  .form-foot-note {
    margin-top: 10px; text-align: center;
    font-size: 8.5px; color: var(--ink-400);
    font-style: italic;
  }
</style>
</head>
<body>

<div class="toolbar">
  <span class="title">İş Emri Formu · ${esc(input.clinic.name)}</span>
  <button class="btn-print" onclick="window.print()">Yazdır / PDF Kaydet</button>
  <button class="btn-close" onclick="window.close()">Kapat</button>
</div>

${sheets}

</body>
</html>`;
}
