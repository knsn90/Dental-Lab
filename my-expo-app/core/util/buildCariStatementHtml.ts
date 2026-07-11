/**
 * Cari Hesap Ekstresi — paylaşılan HTML builder.
 * Hem klinik (ClinicStatementScreen) hem tedarikçi (SupplierDetailScreen) tarafından kullanılır.
 *
 * Tasarım kaynağı: Dribbble bank-statement layout
 *   - Üstte açık-gri yuvarlatılmış header kartı
 *     · Sol: Statement Period
 *     · Sağ: LOGO (lab adı)
 *     · İkinci satır: Holder bilgisi · Hesap Özeti · Hesap Detayları (3 kolon)
 *   - Tablo: T_ID solda, renkli sol-border (yeşil/kırmızı), tarih, karşı taraf, +/− tutar, kapanış bakiyesi
 *   - Footer: Copyright sol · Page right
 */

export interface CariLine {
  /** Belge no / referans (T_ID) */
  refNo?: string | null;
  /** Açıklama / not (Reference altında) */
  reference?: string | null;
  /** ISO tarih (YYYY-MM-DD veya tam ISO) */
  date: string;
  /** Saat opsiyonel (HH:mm) */
  time?: string | null;
  /** Karşı taraf adı (üst satır) */
  counterparty?: string | null;
  /** Karşı taraf alt bilgi (parantez içinde, IBAN/ref vb.) */
  counterpartySub?: string | null;
  /** Pozitif tutar — type ile birlikte yorumlanır */
  amount: number;
  /** Para birimi sembolü/kod (örn 'TRY', 'EUR') */
  currency: string;
  /** debit = borç (kırmızı −) · credit = alacak (yeşil +) */
  type: 'debit' | 'credit';
  /** Kümülatif bakiye (mutlak değer + ba ayrı) */
  balance: number;
}

export interface CariStatementInput {
  /** Belge başlığı: "Cari Hesap Ekstresi" gibi (header logo sağındaki yerde de yazar) */
  documentTitle?: string;
  /** Dönem başı / sonu (ISO YYYY-MM-DD), null → "Tüm dönem" */
  periodFrom?: string | null;
  periodTo?: string | null;
  /** Lab bilgisi — sağ üst logo + alt metinler */
  lab: {
    name: string;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    taxNo?: string | null;
  };
  /** Cari sahibi (klinik / tedarikçi) — sol kart */
  holder: {
    name: string;
    addressLines?: (string | null | undefined)[];
    taxNo?: string | null;
    taxOffice?: string | null;
    phone?: string | null;
    email?: string | null;
    iban?: string | null;
  };
  /** Açılış bakiyesi — varsa Hesap Özeti'nde gösterilir (genelde 0) */
  openingBalance?: number;
  /** Kapanış bakiyesi — net cari */
  closingBalance: number;
  /** Para birimi (genelde TRY) */
  currency: string;
  /** Hareketler — eskiden yeniye, balance running */
  lines: CariLine[];
  /** Footer copyright metni (default: lab.name + yıl) */
  copyright?: string;
}

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(n: number, currency: string, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = opts.sign ? (n > 0 ? '+ ' : n < 0 ? '− ' : '') : '';
  return `${sign}${abs} ${currency}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateLong(iso?: string | null): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function buildCariStatementHtml(input: CariStatementInput): string {
  const docTitle = input.documentTitle ?? 'Cari Hesap Ekstresi';
  const opening = input.openingBalance ?? 0;
  const closing = input.closingBalance;
  const currency = input.currency || 'TRY';
  const period =
    input.periodFrom && input.periodTo
      ? `${fmtDateLong(input.periodFrom)} – ${fmtDateLong(input.periodTo)}`
      : input.periodFrom
        ? `${fmtDateLong(input.periodFrom)} ve sonrası`
        : input.periodTo
          ? `${fmtDateLong(input.periodTo)} ve öncesi`
          : 'Tüm dönem';

  const addressLines = (input.holder.addressLines ?? []).filter(Boolean) as string[];
  const yearNow = new Date().getFullYear();
  const copyrightText = input.copyright ?? `© ${esc(input.lab.name)} ${yearNow}`;

  // Toplam Borç / Alacak (mali müşavir özet kutusu için)
  const totalDebit  = input.lines.reduce((s, l) => s + (l.type === 'debit'  ? l.amount : 0), 0);
  const totalCredit = input.lines.reduce((s, l) => s + (l.type === 'credit' ? l.amount : 0), 0);
  const closingBa   = closing > 0.01 ? 'B' : closing < -0.01 ? 'A' : '—';

  const rowsHtml = input.lines
    .map((l) => {
      const isCredit = l.type === 'credit';
      const borderColor = isCredit ? '#0F766E' : '#9C2E2E';
      const moneyColor = isCredit ? '#0F766E' : '#9C2E2E';
      const moneyText = fmtMoney(isCredit ? l.amount : -l.amount, l.currency || currency, { sign: true });
      const balText = fmtMoney(Math.abs(l.balance), l.currency || currency);
      const baFlag = l.balance > 0.01 ? 'B' : l.balance < -0.01 ? 'A' : '—';
      return `<tr>
        <td class="t-id">
          <div class="t-id-row"><span class="t-id-label">Belge No</span><strong>${esc(l.refNo ?? '—')}</strong></div>
          ${l.reference ? `<div class="ref-row"><span class="ref-tag">${esc(l.reference)}</span></div>` : ''}
        </td>
        <td class="date-cell" style="box-shadow:inset 3px 0 0 ${borderColor}">
          <div class="date-text">${fmtDate(l.date)}</div>
          ${l.time ? `<div class="time-text">${esc(l.time)}</div>` : ''}
        </td>
        <td class="party-cell">
          <div class="party-name">${esc(l.counterparty ?? '')}</div>
          ${l.counterpartySub ? `<div class="party-sub">${esc(l.counterpartySub)}</div>` : ''}
        </td>
        <td class="money-cell" style="color:${moneyColor}">${esc(moneyText)}</td>
        <td class="balance-cell">
          <div class="balance-num">${esc(balText)}</div>
          <div class="ba-flag">${baFlag}</div>
        </td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(docTitle)} — ${esc(input.holder.name)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink-900: #0B1220;
    --ink-700: #1F2937;
    --ink-500: #4B5563;
    --ink-400: #6B7280;
    --ink-300: #9CA3AF;
    --line:    #E5E7EB;
    --line-2:  #F3F4F6;
    --bg:      #F8F9FB;
    --paper:   #FFFFFF;
    --accent:  #0B1220;
    --debit:   #9C2E2E;
    --credit:  #0F766E;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: var(--bg);
    color: var(--ink-900);
    font-size: 11px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  /* Pop-up toolbar */
  .toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 20px; background: var(--ink-900); color: #fff;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .toolbar .title { flex: 1; font-size: 13px; font-weight: 500; letter-spacing: -0.1px; }
  .toolbar button {
    padding: 7px 18px; border-radius: 6px; border: none; cursor: pointer;
    font-size: 12px; font-weight: 600; letter-spacing: -0.1px;
  }
  .toolbar .btn-print { background: #FFFFFF; color: var(--ink-900); }
  .toolbar .btn-close { background: rgba(255,255,255,0.10); color: #FFFFFF; }

  @media print {
    .toolbar { display: none !important; }
    body { background: #FFFFFF; }
    .page { box-shadow: none !important; margin: 0 !important; border: none !important; }
  }

  .page {
    max-width: 880px;
    margin: 64px auto 32px;
    background: var(--paper);
    padding: 0;
    box-shadow: 0 1px 0 rgba(15,23,42,0.04), 0 12px 32px rgba(15,23,42,0.06);
    border: 1px solid var(--line);
  }

  /* ───── Brand bar (top, accent strip) ───── */
  .brand-bar {
    background: var(--ink-900);
    color: #FFFFFF;
    padding: 14px 36px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .brand-name {
    font-size: 13px; font-weight: 600; letter-spacing: 0.4px;
    text-transform: uppercase;
  }
  .brand-name img { height: 22px; max-width: 200px; object-fit: contain; filter: brightness(0) invert(1); }
  .brand-meta {
    font-size: 10px; color: rgba(255,255,255,0.6);
    letter-spacing: 0.4px; text-transform: uppercase;
  }

  /* ───── Document title ───── */
  .title-block {
    padding: 32px 36px 20px;
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 1px solid var(--line);
  }
  .doc-name {
    font-size: 9.5px; font-weight: 700; letter-spacing: 1.4px;
    text-transform: uppercase; color: var(--ink-500);
    margin-bottom: 6px;
  }
  .doc-title-main {
    font-size: 22px; font-weight: 600; letter-spacing: -0.6px;
    color: var(--ink-900); line-height: 1.2;
  }
  .doc-meta {
    text-align: right;
    font-size: 10px; color: var(--ink-400); line-height: 1.6;
  }
  .doc-meta .lbl {
    font-size: 9px; font-weight: 700; letter-spacing: 0.8px;
    text-transform: uppercase; color: var(--ink-500);
  }
  .doc-meta .val { font-size: 11px; color: var(--ink-900); font-weight: 500; }

  /* ───── Info grid (3 columns) ───── */
  .info-grid {
    display: grid; grid-template-columns: 1.2fr 1fr 1fr;
    border-bottom: 1px solid var(--line);
  }
  .info-col {
    padding: 22px 24px;
    border-right: 1px solid var(--line);
  }
  .info-col:last-child { border-right: none; }
  .info-col:first-child { padding-left: 36px; }
  .info-col:last-child  { padding-right: 36px; }

  .info-eyebrow {
    font-size: 9px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--ink-500);
    margin-bottom: 10px;
  }
  .holder-name {
    font-size: 14px; font-weight: 600; color: var(--ink-900);
    letter-spacing: -0.2px; margin-bottom: 6px;
  }
  .muted-line { font-size: 10.5px; color: var(--ink-500); line-height: 1.6; }

  .kv-row {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 10.5px; padding: 4px 0;
    border-bottom: 1px dashed var(--line-2);
  }
  .kv-row:last-child { border-bottom: none; }
  .kv-label { color: var(--ink-500); }
  .kv-value { color: var(--ink-900); font-weight: 500; font-variant-numeric: tabular-nums; }
  .kv-value.lg { font-size: 13px; font-weight: 700; }
  .kv-value.credit { color: var(--credit); }
  .kv-value.debit  { color: var(--debit); }

  /* ───── Transactions table ───── */
  .table-wrap { padding: 0 36px; }

  table { width: 100%; border-collapse: collapse; margin-top: 4px; }

  thead th {
    text-align: left;
    font-size: 9px; font-weight: 700; color: var(--ink-500);
    letter-spacing: 1.2px; text-transform: uppercase;
    padding: 18px 12px 10px;
    border-bottom: 2px solid var(--ink-900);
  }
  thead th.num { text-align: right; }
  thead th .pos { color: var(--credit); }
  thead th .neg { color: var(--debit); }

  tbody td {
    padding: 14px 12px;
    border-bottom: 1px solid var(--line-2);
    vertical-align: top;
    font-size: 11px; color: var(--ink-700);
  }
  tbody tr:last-child td { border-bottom: 1px solid var(--line); }

  td.t-id { width: 220px; padding-right: 16px; }
  .t-id-row {
    display: flex; gap: 10px; align-items: baseline;
    font-size: 11px; color: var(--ink-900); margin-bottom: 4px;
  }
  .t-id-label {
    font-size: 9px; font-weight: 700; letter-spacing: 0.8px;
    text-transform: uppercase; color: var(--ink-400);
    min-width: 60px;
  }
  .t-id-row strong { font-weight: 600; font-variant-numeric: tabular-nums; }
  .ref-row { margin-top: 4px; }
  .ref-tag {
    display: inline-block; padding: 2px 8px;
    background: var(--line-2); border-radius: 3px;
    font-size: 9.5px; font-weight: 500; color: var(--ink-700);
    letter-spacing: 0.1px;
  }

  td.date-cell {
    width: 100px; padding-left: 14px;
    font-size: 11px; color: var(--ink-700);
  }
  .date-text { font-weight: 600; color: var(--ink-900); font-variant-numeric: tabular-nums; }
  .time-text { color: var(--ink-400); margin-top: 2px; font-size: 10px; }

  td.party-cell { font-size: 11px; color: var(--ink-900); }
  .party-name { font-weight: 500; }
  .party-sub {
    color: var(--ink-400); margin-top: 2px;
    font-size: 10px; word-break: break-all;
    font-variant-numeric: tabular-nums;
  }

  td.money-cell {
    width: 140px; text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 600; font-size: 12px;
    letter-spacing: -0.1px;
  }
  td.balance-cell {
    width: 140px; text-align: right;
    font-variant-numeric: tabular-nums; color: var(--ink-900);
  }
  .balance-num { font-size: 12px; font-weight: 600; }
  .ba-flag {
    display: inline-block; margin-top: 4px;
    padding: 1px 6px; border-radius: 2px;
    font-size: 9px; font-weight: 700; letter-spacing: 0.4px;
    background: var(--line-2); color: var(--ink-500);
  }

  /* ───── Summary footer row ───── */
  .summary-bar {
    margin: 0 36px;
    border-top: 2px solid var(--ink-900);
    padding: 16px 0 0;
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 32px; align-items: baseline;
  }
  .summary-bar .lbl {
    font-size: 9px; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--ink-500);
  }
  .summary-bar .num {
    font-size: 14px; font-weight: 700; color: var(--ink-900);
    font-variant-numeric: tabular-nums; margin-top: 4px;
  }
  .summary-bar .num.credit { color: var(--credit); }
  .summary-bar .num.debit  { color: var(--debit); }

  /* ───── Footer ───── */
  .footer {
    padding: 22px 36px 28px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9.5px; color: var(--ink-400);
    letter-spacing: 0.2px;
    border-top: 1px solid var(--line);
    margin-top: 24px;
  }
  .footer .legend { color: var(--ink-500); }
  .footer strong { color: var(--ink-900); font-weight: 600; }
</style>
</head>
<body>

<div class="toolbar">
  <span class="title">${esc(docTitle)} · ${esc(input.holder.name)}</span>
  <button class="btn-print" onclick="window.print()">Yazdır / PDF Kaydet</button>
  <button class="btn-close" onclick="window.close()">Kapat</button>
</div>

<div class="page">
  <!-- Brand strip -->
  <div class="brand-bar">
    <div class="brand-name">
      ${input.lab.logoUrl ? `<img src="${esc(input.lab.logoUrl)}" alt="" />` : esc(input.lab.name)}
    </div>
    <div class="brand-meta">${input.lab.taxNo ? `VKN ${esc(input.lab.taxNo)}` : ''}</div>
  </div>

  <!-- Document title block -->
  <div class="title-block">
    <div>
      <div class="doc-name">${esc(docTitle)}</div>
      <div class="doc-title-main">${esc(input.holder.name)}</div>
    </div>
    <div class="doc-meta">
      <div class="lbl">Dönem</div>
      <div class="val">${esc(period)}</div>
      <div class="lbl" style="margin-top:8px">Düzenlenme</div>
      <div class="val">${new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    </div>
  </div>

  <!-- Info grid (3 columns) -->
  <div class="info-grid">
    <div class="info-col">
      <div class="info-eyebrow">Cari Bilgileri</div>
      <div class="holder-name">${esc(input.holder.name)}</div>
      ${addressLines.map(l => `<div class="muted-line">${esc(l)}</div>`).join('')}
      ${input.holder.phone ? `<div class="muted-line">${esc(input.holder.phone)}</div>` : ''}
      ${input.holder.email ? `<div class="muted-line">${esc(input.holder.email)}</div>` : ''}
      ${input.holder.taxNo ? `<div class="muted-line" style="margin-top:6px"><strong style="color:var(--ink-700)">VKN</strong> ${esc(input.holder.taxNo)}</div>` : ''}
      ${input.holder.taxOffice ? `<div class="muted-line"><strong style="color:var(--ink-700)">V.D.</strong> ${esc(input.holder.taxOffice)}</div>` : ''}
      ${input.holder.iban ? `<div class="muted-line"><strong style="color:var(--ink-700)">IBAN</strong> ${esc(input.holder.iban)}</div>` : ''}
    </div>

    <div class="info-col">
      <div class="info-eyebrow">Hesap Özeti</div>
      <div class="kv-row"><span class="kv-label">Açılış Bakiyesi</span><span class="kv-value">${fmtMoney(opening, currency)}</span></div>
      <div class="kv-row"><span class="kv-label">Toplam Borç</span><span class="kv-value debit">${fmtMoney(totalDebit, currency)}</span></div>
      <div class="kv-row"><span class="kv-label">Toplam Alacak</span><span class="kv-value credit">${fmtMoney(totalCredit, currency)}</span></div>
      <div class="kv-row"><span class="kv-label">Hareket</span><span class="kv-value">${input.lines.length}</span></div>
    </div>

    <div class="info-col">
      <div class="info-eyebrow">Kapanış Bakiyesi</div>
      <div class="kv-value lg ${closing > 0.01 ? 'debit' : closing < -0.01 ? 'credit' : ''}" style="font-size:22px; letter-spacing:-0.4px;">${fmtMoney(Math.abs(closing), currency)}</div>
      <div class="muted-line" style="margin-top:4px">
        ${closing > 0.01 ? 'Borç bakiyesi (B)' : closing < -0.01 ? 'Alacak bakiyesi (A)' : 'Hesap eşit'}
      </div>
      <div class="muted-line" style="margin-top:10px"><strong style="color:var(--ink-700)">Para Birimi</strong> ${esc(currency)}</div>
    </div>
  </div>

  <!-- Transactions -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Belge / Referans</th>
          <th>Tarih</th>
          <th>Karşı Taraf</th>
          <th class="num">Tutar <span class="pos">(+)</span> <span class="neg">(−)</span></th>
          <th class="num">Bakiye</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="text-align:center;color:var(--ink-400);padding:40px;font-style:italic">Bu dönemde hareket bulunmuyor.</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- Summary bar -->
  <div class="summary-bar">
    <div>
      <div class="lbl">Toplam</div>
      <div class="num" style="font-size:11px;font-weight:600;color:var(--ink-500);">${input.lines.length} hareket</div>
    </div>
    <div>
      <div class="lbl">Toplam Borç</div>
      <div class="num debit">${fmtMoney(totalDebit, currency)}</div>
    </div>
    <div>
      <div class="lbl">Toplam Alacak</div>
      <div class="num credit">${fmtMoney(totalCredit, currency)}</div>
    </div>
    <div>
      <div class="lbl">Kapanış Bakiyesi (${closingBa})</div>
      <div class="num ${closing > 0.01 ? 'debit' : closing < -0.01 ? 'credit' : ''}">${fmtMoney(Math.abs(closing), currency)}</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="legend"><strong>B</strong> Borç bakiyesi · <strong>A</strong> Alacak bakiyesi</div>
    <div>${copyrightText} · Sayfa 1</div>
  </div>
</div>

</body>
</html>`;
}
