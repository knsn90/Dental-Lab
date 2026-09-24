// Tahsilat makbuzu (PDF) — klinikten alınan toplu tahsilatın belgesi.
//
// TASARIM: cari hesap ekstresiyle (core/util/buildCariStatementHtml) aynı dil —
// üstte marka çubuğu + beyaz çip içinde lab logosu, altında başlık bloğu, aynı
// ink skalası ve Inter / Inter Tight tipografisi. Ayrı bir görünüm üretmek
// yerine mevcut çıktıların devamı gibi durması hedeflendi.
//
// NEDEN AYRI ŞABLON: ekstre bir hareket defteridir (borç/alacak/bakiye
// yürüyen); makbuz tek bir olayı belgeler — kimden, ne zaman, hangi paralardan.
// Alınan paralar KENDİ para biriminde yazılır (800 USD gerçekten 800 USD),
// baz karşılığı ayrı sütunda durur.
//
// Kağıt her zaman AÇIK temadır; koyu tema token'ı kullanılmaz.
import type { LabLetterhead } from '../receipt/buildReceiptHtml';
import { autoT } from '../../core/i18n/autoTranslate';
import { printLocale } from '../../core/i18n/printLocale';

export interface ReceiptVoucherLine {
  currency: string;
  amount: number;
  rate: number;
  amount_base: number;
}

export interface ReceiptVoucher {
  id: string;
  receipt_date: string;
  payment_method: string;
  reference_no?: string | null;
  notes?: string | null;
  base_currency: string;
  total_base: number;
  lines: ReceiptVoucherLine[];
}

const METHOD_LABEL: Record<string, string> = {
  nakit: 'Nakit', kart: 'Kart', havale: 'Havale', cek: 'Çek', diger: 'Diğer',
};

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const money = (n: number, ccy: string) =>
  `${(Number(n) || 0).toLocaleString(printLocale(), {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} ${esc(ccy)}`;

const fmtDateLong = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString(printLocale(), {
    day: '2-digit', month: 'long', year: 'numeric',
  });
};

export function buildReceiptVoucherHtml(
  clinicName: string,
  receipt: ReceiptVoucher,
  lab: LabLetterhead,
): string {
  const method = autoT(METHOD_LABEL[receipt.payment_method] ?? receipt.payment_method);
  // Makbuz no: fiş uuid'sinin ilk bloğu — kısa ve kayda geri götürür.
  const voucherNo = receipt.id.split('-')[0].toUpperCase();

  const rows = (receipt.lines ?? []).map(l => `<tr>
      <td class="ccy"><span class="ccy-tag">${esc(l.currency)}</span></td>
      <td class="r strong">${money(l.amount, l.currency)}</td>
      <td class="r">${money(l.amount_base, receipt.base_currency)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="tr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<!-- Pop-up penceresi uygulamanın CSS'ini miras almaz; display fontu burada
     ayrıca yüklenir. Gelmezse Inter'e, o da yoksa sisteme düşer. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@300;400;500&display=swap" rel="stylesheet">
<title>${autoT('Tahsilat Makbuzu')} — ${esc(clinicName)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink-900: #0B1220; --ink-700: #2C2C2C; --ink-500: #6B6B6B;
    --ink-400: #9A9A9A; --line: #EAEAEA; --line-2: #F5F5F5;
    --bg: #F8F9FB; --paper: #FFFFFF;
    --brand-bg: #0A0A0A; --brand-fg: #FFFFFF;
    --credit: #2D9A6B;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    background: var(--bg); color: var(--ink-900);
    font-size: 11px; line-height: 1.55; letter-spacing: 0.08px;
    -webkit-font-smoothing: antialiased;
  }
  /* Ekranda gerçek bir A4 sayfası gibi görünsün: @page yalnız YAZDIRMADA
     geçerli, tarayıcı önizlemesinde içerik tüm ekrana yayılıyordu. */
  .page { width: 210mm; min-height: 297mm; margin: 24px auto; background: var(--paper);
          box-shadow: 0 4px 24px rgba(0,0,0,0.10); overflow: hidden; }
  @media print {
    body { background: var(--paper); }
    .page { width: auto; min-height: 0; margin: 0; box-shadow: none; }
  }

  .brand-bar { background: var(--brand-bg); color: var(--brand-fg);
               padding: 14px 36px; display: flex; justify-content: space-between; align-items: center; }
  .brand-name { font-size: 13px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; }
  /* Logo KENDİ renkleriyle basılır; beyaz çip üzerinde her marka çubuğunda okunur. */
  .brand-logo-chip { display: inline-flex; align-items: center;
                     background: #FFFFFF; border-radius: 8px; padding: 5px 9px; }
  .brand-name img { height: 22px; max-width: 200px; object-fit: contain; display: block; }
  .brand-meta { font-size: 10px; color: rgba(255,255,255,0.62);
                letter-spacing: 0.4px; text-transform: uppercase; }

  .title-block { padding: 32px 36px 20px; display: flex;
                 justify-content: space-between; align-items: flex-end;
                 border-bottom: 1px solid var(--line); }
  .doc-name { font-size: 9.5px; font-weight: 700; letter-spacing: 1.4px;
              text-transform: uppercase; color: var(--ink-500); margin-bottom: 6px; }
  .doc-title-main { font-family: 'Inter Tight', 'Inter', system-ui, sans-serif;
                    font-weight: 300; font-size: 26px; letter-spacing: -0.6px; line-height: 1.15; }
  .doc-meta { text-align: right; }
  .doc-meta .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-400); }
  .doc-meta .val { font-size: 11.5px; font-weight: 600; margin-top: 2px; }

  .info-grid { display: flex; gap: 36px; padding: 22px 36px 6px; }
  .info-col { flex: 1; }
  .info-eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 1.1px;
                  text-transform: uppercase; color: var(--ink-400); margin-bottom: 5px; }
  .info-val { font-size: 13px; font-weight: 600; }
  .muted-line { font-size: 10.5px; color: var(--ink-500); }

  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  thead th { text-align: left; font-size: 9px; font-weight: 700; letter-spacing: 1px;
             text-transform: uppercase; color: var(--ink-400);
             padding: 9px 36px; background: var(--line-2);
             border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  thead th.r, td.r { text-align: right; }
  tbody td { padding: 12px 36px; border-bottom: 1px solid var(--line-2); font-size: 11.5px; }
  .ccy-tag { display: inline-block; font-size: 9.5px; font-weight: 700; letter-spacing: 0.6px;
             padding: 2px 7px; border-radius: 999px; background: var(--line-2); color: var(--ink-700); }
  .strong { font-weight: 600; }
  .muted { color: var(--ink-500); }

  .total-row { display: flex; justify-content: flex-end; padding: 18px 36px 0; }
  .total-box { min-width: 260px; border-top: 2px solid var(--ink-900); padding-top: 12px;
               display: flex; justify-content: space-between; align-items: baseline; }
  .total-lbl { font-size: 9.5px; font-weight: 700; letter-spacing: 1.1px;
               text-transform: uppercase; color: var(--ink-500); }
  .total-val { font-family: 'Inter Tight', 'Inter', system-ui, sans-serif;
               font-weight: 400; font-size: 22px; letter-spacing: -0.5px; color: var(--credit); }

  .note { margin: 20px 36px 0; font-size: 10.5px; color: var(--ink-700);
          background: var(--line-2); border-radius: 8px; padding: 10px 12px; }
  .sign { display: flex; gap: 48px; padding: 56px 36px 0; }
  .sign div { flex: 1; border-top: 1px solid var(--ink-300, #D4D4D4); padding-top: 7px;
              font-size: 10px; color: var(--ink-500); text-align: center; }
  .foot { margin-top: 30px; padding: 14px 36px 22px; border-top: 1px solid var(--line-2);
          font-size: 9px; color: var(--ink-400); display: flex; justify-content: space-between; }
</style></head>
<body>
<div class="page">
  <div class="brand-bar">
    <div class="brand-name">
      ${lab?.logo_url
        ? `<span class="brand-logo-chip"><img src="${esc(lab.logo_url)}" alt="${esc(lab?.name ?? '')}" /></span>`
        : esc(lab?.name ?? '')}
    </div>
    <div class="brand-meta">${lab?.tax_number ? `VKN ${esc(lab.tax_number)}` : ''}</div>
  </div>

  <div class="title-block">
    <div>
      <div class="doc-name">${autoT('Tahsilat Makbuzu')}</div>
      <div class="doc-title-main">${esc(clinicName)}</div>
    </div>
    <div class="doc-meta">
      <div class="lbl">${autoT('Makbuz No')}</div>
      <div class="val">#${esc(voucherNo)}</div>
      <div class="lbl" style="margin-top:8px">${autoT('Tarih')}</div>
      <div class="val">${fmtDateLong(receipt.receipt_date)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-col">
      <div class="info-eyebrow">${autoT('Tahsil edilen')}</div>
      <div class="info-val">${esc(clinicName)}</div>
    </div>
    <div class="info-col">
      <div class="info-eyebrow">${autoT('Ödeme yöntemi')}</div>
      <div class="info-val">${esc(method)}</div>
    </div>
    <div class="info-col">
      <div class="info-eyebrow">${autoT('Referans')}</div>
      <div class="info-val">${receipt.reference_no ? esc(receipt.reference_no) : '—'}</div>
    </div>
    <div class="info-col">
      <div class="info-eyebrow">${autoT('Düzenleyen')}</div>
      <div class="info-val">${esc(lab?.name ?? '')}</div>
      ${lab?.phone ? `<div class="muted-line">${esc(lab.phone)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead><tr>
      <th>${autoT('Para birimi')}</th>
      <th class="r">${autoT('Alınan tutar')}</th>
      <th class="r">${autoT('Karşılığı')} (${esc(receipt.base_currency)})</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="total-row"><div class="total-box">
    <span class="total-lbl">${autoT('Toplam tahsilat')}</span>
    <span class="total-val">${money(receipt.total_base, receipt.base_currency)}</span>
  </div></div>

  ${receipt.notes ? `<div class="note"><strong>${autoT('Not')}:</strong> ${esc(receipt.notes)}</div>` : ''}

  <div class="sign">
    <div>${autoT('Teslim eden')}</div>
    <div>${autoT('Teslim alan')}</div>
  </div>

  <div class="foot">
    <span>${esc(lab?.name ?? '')}${lab?.address ? ' · ' + esc(lab.address) : ''}</span>
    <span>${autoT('Bu belge elektronik ortamda üretilmiştir.')}</span>
  </div>
</div>
</body></html>`;
}
