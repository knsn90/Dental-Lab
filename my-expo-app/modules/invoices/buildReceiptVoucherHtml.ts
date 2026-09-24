// Tahsilat makbuzu (PDF) — klinikten alınan toplu tahsilatın belgesi.
//
// NEDEN AYRI ŞABLON: fatura ve ekstre şablonları kalem/hareket listesi kurar;
// makbuz ise tek bir olayı belgeler — kimden, ne zaman, hangi paralardan, ne
// kadar. Alınan paralar KENDİ para biriminde yazılır (800 USD gerçekten 800
// USD'dir), baz karşılığı yanında parantezle verilir.
//
// Kağıt her zaman AÇIK temadır; koyu tema token'ı kullanılmaz.
import type { LabLetterhead } from '../receipt/buildReceiptHtml';
import { autoT } from '../../core/i18n/autoTranslate';

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
  `${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(ccy)}`;

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString('tr-TR', {
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

  const rows = (receipt.lines ?? []).map(l => {
    const sameAsBase = l.currency === receipt.base_currency;
    return `<tr>
      <td>${esc(l.currency)}</td>
      <td class="r">${money(l.amount, l.currency)}</td>
      <td class="r muted">${sameAsBase ? '—' : (Number(l.rate) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 6 })}</td>
      <td class="r">${money(l.amount_base, receipt.base_currency)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${autoT('Tahsilat Makbuzu')} ${esc(voucherNo)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  /* Ekranda gercek bir A4 sayfasi gibi gorunsun: @page yalniz YAZDIRMADA
     gecerli, tarayici onizlemesinde icerik tum ekran genisligine yayiliyordu. */
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #0A0A0A; font-size: 12px; margin: 0; background: #F1F2F4; }
  .sheet { width: 210mm; min-height: 297mm; margin: 24px auto; background: #FFFFFF;
           padding: 18mm 16mm; box-shadow: 0 4px 24px rgba(0,0,0,0.10); }
  @media print {
    body { background: #FFFFFF; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 18mm 16mm; box-shadow: none; }
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #0A0A0A; padding-bottom: 12px; margin-bottom: 22px; }
  .lab { font-size: 16px; font-weight: 700; letter-spacing: -0.2px; }
  .lab-sub { color: #6B6B6B; font-size: 11px; line-height: 1.5; margin-top: 3px; }
  .doc { text-align: right; }
  .doc h1 { font-size: 15px; margin: 0 0 4px; letter-spacing: 0.4px; text-transform: uppercase; }
  .doc .no { font-family: ui-monospace, Menlo, Consolas, monospace; color: #6B6B6B; }
  .meta { display: flex; gap: 28px; margin-bottom: 20px; }
  .meta div { font-size: 11px; }
  .meta .k { color: #6B6B6B; text-transform: uppercase; letter-spacing: 0.6px; font-size: 9.5px; }
  .meta .v { font-weight: 600; margin-top: 2px; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px;
       color: #6B6B6B; border-bottom: 1px solid #D4D4D4; padding: 7px 6px; font-weight: 600; }
  td { padding: 9px 6px; border-bottom: 1px solid #EAEAEA; }
  .r { text-align: right; }
  .muted { color: #6B6B6B; }
  .total { margin-top: 16px; display: flex; justify-content: flex-end; }
  .total .box { border-top: 2px solid #0A0A0A; padding-top: 10px; min-width: 240px;
                display: flex; justify-content: space-between; align-items: baseline; }
  .total .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #6B6B6B; }
  .total .val { font-size: 17px; font-weight: 700; }
  .note { margin-top: 20px; font-size: 11px; color: #2C2C2C; }
  .sign { margin-top: 54px; display: flex; justify-content: space-between; gap: 40px; }
  .sign div { flex: 1; border-top: 1px solid #9A9A9A; padding-top: 6px;
              font-size: 10.5px; color: #6B6B6B; text-align: center; }
  .foot { margin-top: 26px; font-size: 9.5px; color: #9A9A9A; text-align: center; }
</style></head>
<body>
<div class="sheet">
  <div class="head">
    <div>
      <div class="lab">${esc(lab?.name ?? '')}</div>
      <div class="lab-sub">
        ${lab?.address ? esc(lab.address) + '<br/>' : ''}
        ${[lab?.phone, lab?.email].filter(Boolean).map(esc).join(' · ')}
        ${lab?.tax_number ? '<br/>' + autoT('Vergi No') + ': ' + esc(lab.tax_number) : ''}
      </div>
    </div>
    <div class="doc">
      <h1>${autoT('Tahsilat Makbuzu')}</h1>
      <div class="no">#${esc(voucherNo)}</div>
    </div>
  </div>

  <div class="meta">
    <div><div class="k">${autoT('Tahsil edilen')}</div><div class="v">${esc(clinicName)}</div></div>
    <div><div class="k">${autoT('Tarih')}</div><div class="v">${fmtDate(receipt.receipt_date)}</div></div>
    <div><div class="k">${autoT('Ödeme yöntemi')}</div><div class="v">${esc(method)}</div></div>
    ${receipt.reference_no ? `<div><div class="k">${autoT('Referans')}</div><div class="v">${esc(receipt.reference_no)}</div></div>` : ''}
  </div>

  <table>
    <thead><tr>
      <th>${autoT('Para birimi')}</th>
      <th class="r">${autoT('Alınan tutar')}</th>
      <th class="r">${autoT('Kur')}</th>
      <th class="r">${autoT('Karşılığı')} (${esc(receipt.base_currency)})</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="total"><div class="box">
    <span class="lbl">${autoT('Toplam tahsilat')}</span>
    <span class="val">${money(receipt.total_base, receipt.base_currency)}</span>
  </div></div>

  ${receipt.notes ? `<div class="note"><strong>${autoT('Not')}:</strong> ${esc(receipt.notes)}</div>` : ''}

  <div class="sign">
    <div>${autoT('Teslim eden')}</div>
    <div>${autoT('Teslim alan')}</div>
  </div>

  <div class="foot">${autoT('Bu belge elektronik ortamda üretilmiştir.')}</div>
</div>
</body></html>`;
}
