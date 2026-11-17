/**
 * Genel ekstre PDF'inin sonuna eklenen "Onay bekleyen ve taslak kalemler" bölümü.
 *
 * Kesinleşmiş ekstre (yürüyen bakiye) DEĞİŞMEZ; bu bölüm onun ALTINDA, açıkça
 * "bakiyeye dahil değil" diye etiketlenmiş ayrı bir tablo olarak durur. Böylece
 * klinik tek belgede hesabının tamamını görür. Yalnız ham HTML üretir → metinler autoT.
 */
import { autoT } from '../../../core/i18n/autoTranslate';
import { printLocale } from '../../../core/i18n/printLocale';
import { formatMoney, type Currency } from '../../../core/money/currency';

export type PendingAppendixRow = {
  ref: string;
  date: string | null;
  description: string;
  status: 'awaiting' | 'draft';
  amount: number;
};

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function d(iso: string | null): string {
  if (!iso) return '—';
  try {
    const x = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return x.toLocaleDateString(printLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

export function buildPendingAppendixHtml(
  rows: PendingAppendixRow[], currency: string, finalizedBalance: number,
): string {
  if (rows.length === 0) return '';
  const m = (n: number) => formatMoney(Number(n) || 0, (currency || 'TRY') as Currency, { fractionDigits: 2 });
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const th = 'text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#6B6B6B;padding:8px 10px;border-bottom:1px solid #E5E0D6;';
  const td = 'font-size:12px;color:#1A1A1A;padding:8px 10px;border-bottom:1px solid #F0ECE4;';
  const chip = (s: PendingAppendixRow['status']) => s === 'awaiting'
    ? `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:#FDF0DC;color:#92560E;">${esc(autoT('Onay bekliyor'))}</span>`
    : `<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:#F1EFE8;color:#5F5E5A;">${esc(autoT('Taslak'))}</span>`;
  const body = rows.map(r => `<tr>
      <td style="${td}white-space:nowrap;">${esc(r.ref || '—')}</td>
      <td style="${td}white-space:nowrap;">${esc(d(r.date))}</td>
      <td style="${td}">${esc(r.description || '—')}</td>
      <td style="${td}">${chip(r.status)}</td>
      <td style="${td}text-align:right;white-space:nowrap;font-weight:600;">${esc(m(r.amount))}</td>
    </tr>`).join('');

  return `
<section class="pending-appendix" style="margin:28px 0 0;page-break-inside:auto;break-inside:auto;font-family:inherit;">
  <div style="border:1.5px dashed #E89B2A;border-radius:14px;padding:16px 18px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#1A1A1A;">${esc(autoT('Onay bekleyen ve taslak kalemler'))}</div>
        <div style="font-size:11px;color:#6B6B6B;margin-top:2px;">${esc(autoT('Henüz kesinleşmedi; yukarıdaki bakiyeye dahil değildir'))}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#92560E;">${esc(autoT('Bekleyen toplam'))}</div>
        <div style="font-size:16px;font-weight:700;color:#92560E;">${esc(m(total))}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${th}">${esc(autoT('Belge No'))}</th>
        <th style="${th}">${esc(autoT('Tarih'))}</th>
        <th style="${th}">${esc(autoT('Açıklama'))}</th>
        <th style="${th}">${esc(autoT('Durum'))}</th>
        <th style="${th}text-align:right;">${esc(autoT('Tutar'))}</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      <tr><td style="font-size:12px;color:#6B6B6B;padding:3px 10px;">${esc(autoT('Kesinleşmiş bakiye'))}</td><td style="font-size:12px;text-align:right;padding:3px 10px;">${esc(m(finalizedBalance))}</td></tr>
      <tr><td style="font-size:12px;color:#6B6B6B;padding:3px 10px;">${esc(autoT('Onay bekleyen ve taslak'))}</td><td style="font-size:12px;text-align:right;padding:3px 10px;">${esc(m(total))}</td></tr>
      <tr><td style="font-size:13px;font-weight:700;color:#1A1A1A;padding:6px 10px;border-top:1px solid #E5E0D6;">${esc(autoT('Bekleyenlerle birlikte toplam bakiye'))}</td><td style="font-size:13px;font-weight:700;text-align:right;padding:6px 10px;border-top:1px solid #E5E0D6;">${esc(m(finalizedBalance + total))}</td></tr>
    </table>
  </div>
</section>`;
}

/** Eki belge sayfasının içine, alt bilginin (footer) hemen önüne yerleştirir; yoksa </body> öncesine.
 *  Ek boşsa belge aynen döner. */
export function appendBeforeBody(html: string, appendix: string): string {
  if (!appendix) return html;
  const f = html.lastIndexOf('<!-- Footer -->');
  if (f >= 0) return html.slice(0, f) + appendix + '\n  ' + html.slice(f);
  const i = html.lastIndexOf('</body>');
  return i < 0 ? html + appendix : html.slice(0, i) + appendix + html.slice(i);
}
