/**
 * Fatura PDF HTML builder
 * A4 yazdırma için optimize. Web'de window.print, native'de expo-print üzerinden
 * aynı HTML basılır. Teslimat fişi deseninin aynısı — lab letterhead,
 * önizleme barı, @media print ile bar gizlenir.
 */

import type { Invoice } from './types';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from './types';
import type { LabLetterhead } from '../receipt/buildReceiptHtml';

// ─── Yardımcılar ──────────────────────────────────────────────────────────
function esc(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function fmtMoney(amount: number | string | null | undefined, currency = 'TRY'): string {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return '—';
  const sym = currency === 'TRY' ? '₺' : currency + ' ';
  return sym + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Ana builder ──────────────────────────────────────────────────────────
export function buildInvoiceHtml(invoice: Invoice, lab: LabLetterhead): string {
  const items = invoice.items ?? [];
  const payments = invoice.payments ?? [];
  const balance = Number(invoice.total) - Number(invoice.paid_amount);
  const currency = invoice.currency || 'TRY';

  // Letterhead fields (NULL-safe)
  const labName    = esc(lab.name);
  const labAddress = lab.address    ? esc(lab.address)    : '';
  const labPhone   = lab.phone      ? esc(lab.phone)      : '';
  const labEmail   = lab.email      ? esc(lab.email)      : '';
  const labWebsite = lab.website    ? esc(lab.website)    : '';
  const labTaxNo   = lab.tax_number ? esc(lab.tax_number) : '';
  const labLogo    = lab.logo_url   ? esc(lab.logo_url)   : '';

  // Alıcı bilgileri
  const clinic       = invoice.clinic;
  const doctor       = invoice.doctor;
  const clinicName   = esc(clinic?.name ?? '—');
  const clinicAddr   = clinic?.address ? esc(clinic.address) : '';
  const clinicPhone  = clinic?.phone   ? esc(clinic.phone)   : '';
  const clinicEmail  = clinic?.email   ? esc(clinic.email)   : '';
  const doctorName   = esc(doctor?.full_name ?? '—');

  // Kalem satırları
  const itemRows = items.length > 0
    ? items
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((it, i) => `
          <tr>
            <td class="num">${i + 1}</td>
            <td>${esc(it.description)}</td>
            <td class="num">${Number(it.quantity).toLocaleString('tr-TR')}</td>
            <td class="num">${fmtMoney(it.unit_price, currency)}</td>
            <td class="num right"><b>${fmtMoney(it.total, currency)}</b></td>
          </tr>`).join('')
    : `<tr><td colspan="5" class="empty">Kalem eklenmemiş</td></tr>`;

  // Ödeme satırları (varsa)
  const paymentRows = payments.length > 0
    ? payments
        .slice()
        .sort((a, b) => b.payment_date.localeCompare(a.payment_date))
        .map(p => `
          <tr>
            <td>${fmtDate(p.payment_date)}</td>
            <td>${esc(PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method)}</td>
            <td>${p.reference_no ? esc(p.reference_no) : '—'}</td>
            <td class="num right"><b>${fmtMoney(p.amount, currency)}</b></td>
          </tr>`).join('')
    : '';

  // Status etiketi (renk)
  const statusLabel = INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status;
  const statusColor = {
    taslak:       { fg: '#475569', bg: '#F1F5F9' },
    kesildi:      { fg: '#1D4ED8', bg: '#DBEAFE' },
    kismi_odendi: { fg: '#B45309', bg: '#FEF3C7' },
    odendi:       { fg: '#047857', bg: '#D1FAE5' },
    iptal:        { fg: '#991B1B', bg: '#FEE2E2' },
  }[invoice.status] ?? { fg: '#475569', bg: '#F1F5F9' };

  // Vade geçti mi?
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = invoice.due_date
    && invoice.due_date < today
    && invoice.status !== 'odendi'
    && invoice.status !== 'iptal';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fatura – ${esc(invoice.invoice_number)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { background: #fff; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px; color: #0f172a; line-height: 1.5;
      padding: 32px 36px; max-width: 210mm; margin: 0 auto;
    }

    .letterhead {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #0f172a;
    }
    .letterhead .lab { flex: 1; }
    .letterhead .logo { width: 72px; height: 72px; border-radius: 8px; object-fit: contain; }
    .lab-name { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.2px; }
    .lab-meta { margin-top: 6px; font-size: 11px; color: #475569; line-height: 1.6; }
    .lab-meta span + span::before { content: ' · '; color: #cbd5e1; }

    .title-bar {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 24px; padding: 14px 18px; background: #0f172a; color: #fff;
      border-radius: 8px;
    }
    .title-bar h1 { font-size: 18px; font-weight: 800; letter-spacing: 1.2px; }
    .title-bar .right { text-align: right; }
    .title-bar .inv-no { font-size: 13px; font-weight: 700; }
    .title-bar .status {
      display: inline-block; margin-top: 4px;
      padding: 3px 10px; border-radius: 999px;
      font-size: 11px; font-weight: 700;
      background: ${statusColor.bg}; color: ${statusColor.fg};
    }

    .info-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
      margin-top: 20px;
    }
    .info-card {
      padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 8px;
      background: #fff;
    }
    .info-card .label {
      font-size: 10px; font-weight: 700; color: #64748b;
      text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px;
    }
    .info-card .value { font-size: 14px; font-weight: 700; color: #0f172a; }
    .info-card .meta { font-size: 11px; color: #64748b; margin-top: 3px; line-height: 1.5; }

    .dates-bar {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
      margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
    }
    .dates-bar .cell { padding: 10px 14px; }
    .dates-bar .cell + .cell { border-left: 1px solid #e2e8f0; }
    .dates-bar .label {
      font-size: 10px; font-weight: 700; color: #64748b;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;
    }
    .dates-bar .value { font-size: 13px; font-weight: 700; color: #0f172a; }
    .dates-bar .value.overdue { color: #B91C1C; }
    .dates-bar .value.overdue::after { content: ' · VADE GEÇTİ'; font-size: 10px; font-weight: 800; }

    h2 {
      font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;
      letter-spacing: 0.5px; margin: 24px 0 8px;
    }

    table.items {
      width: 100%; border-collapse: collapse;
      border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
    }
    table.items thead { background: #f8fafc; }
    table.items th {
      text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700;
      color: #475569; text-transform: uppercase; letter-spacing: 0.3px;
      border-bottom: 1px solid #e2e8f0;
    }
    table.items th.num, table.items td.num { text-align: center; }
    table.items th.right, table.items td.right { text-align: right; }
    table.items th:first-child, table.items td:first-child { width: 36px; }
    table.items td {
      padding: 10px 12px; font-size: 12px; color: #0f172a;
      border-bottom: 1px solid #f1f5f9; vertical-align: top;
    }
    table.items tr:last-child td { border-bottom: none; }
    table.items .empty { text-align: center; color: #94a3b8; padding: 24px; font-style: italic; }

    .totals {
      display: flex; justify-content: flex-end; margin-top: 16px;
    }
    .totals table { border-collapse: collapse; min-width: 320px; }
    .totals td {
      padding: 7px 16px; font-size: 12px; color: #334155;
      border-bottom: 1px solid #f1f5f9;
    }
    .totals td.label { text-align: right; }
    .totals td.value { text-align: right; font-weight: 700; min-width: 130px; }
    .totals .grand td {
      border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;
      font-size: 15px; color: #0f172a; padding: 12px 16px;
    }
    .totals .grand td.value { font-weight: 800; }
    .totals .paid td { color: #047857; }
    .totals .balance td { color: #B91C1C; font-weight: 800; }
    .totals .balance.zero td { color: #047857; }

    table.payments {
      width: 100%; border-collapse: collapse; margin-top: 8px;
      border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
    }
    table.payments thead { background: #ecfdf5; }
    table.payments th {
      text-align: left; padding: 9px 12px; font-size: 11px; font-weight: 700;
      color: #065f46; text-transform: uppercase; letter-spacing: 0.3px;
    }
    table.payments th.right, table.payments td.right { text-align: right; }
    table.payments td {
      padding: 9px 12px; font-size: 12px; color: #0f172a;
      border-top: 1px solid #d1fae5;
    }

    .notes-box {
      margin-top: 8px; padding: 10px 14px; background: #f8fafc;
      border: 1px solid #e2e8f0; border-radius: 8px;
      font-size: 12px; color: #334155; line-height: 1.5;
    }

    .footer {
      margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between;
      font-size: 10px; color: #94a3b8;
    }

    /* ─── Önizleme barı (print'te gizli) ─── */
    .preview-bar {
      position: sticky; top: 0; z-index: 100;
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px; margin: -32px -36px 24px;
      padding: 12px 20px;
      background: #0f172a; color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .preview-bar .pb-title { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; }
    .preview-bar .pb-title .muted { color: #94a3b8; font-weight: 500; margin-left: 6px; }
    .preview-bar .pb-actions { display: flex; gap: 8px; }
    .preview-bar button {
      font-family: inherit; font-size: 13px; font-weight: 600;
      padding: 8px 16px; border-radius: 8px; cursor: pointer;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.08); color: #fff;
      transition: background 120ms ease;
    }
    .preview-bar button:hover { background: rgba(255,255,255,0.16); }
    .preview-bar button.primary {
      background: #fff; color: #0f172a; border-color: #fff;
    }
    .preview-bar button.primary:hover { background: #f1f5f9; }

    @media print {
      body { padding: 14mm 16mm; max-width: none; }
      .no-print, .preview-bar { display: none !important; }
      table, .info-card, .dates-bar { break-inside: avoid; }
    }

    @page { size: A4; margin: 0; }
  </style>
</head>
<body>

  <!-- Önizleme barı -->
  <div class="preview-bar no-print">
    <div class="pb-title">
      Fatura Önizleme
      <span class="muted">· ${esc(invoice.invoice_number)}</span>
    </div>
    <div class="pb-actions">
      <button type="button" onclick="window.close()">Kapat</button>
      <button type="button" class="primary" onclick="window.print()">Yazdır / PDF Kaydet</button>
    </div>
  </div>

  <!-- Letterhead -->
  <div class="letterhead">
    <div class="lab">
      <div class="lab-name">${labName}</div>
      <div class="lab-meta">
        ${labAddress ? `<span>${labAddress}</span>` : ''}
        ${labPhone   ? `<span>Tel: ${labPhone}</span>` : ''}
        ${labEmail   ? `<span>${labEmail}</span>` : ''}
        ${labWebsite ? `<span>${labWebsite}</span>` : ''}
        ${labTaxNo   ? `<span>V.No: ${labTaxNo}</span>` : ''}
      </div>
    </div>
    ${labLogo ? `<img src="${labLogo}" alt="${labName}" class="logo" />` : ''}
  </div>

  <!-- Title bar -->
  <div class="title-bar">
    <h1>FATURA</h1>
    <div class="right">
      <div class="inv-no">${esc(invoice.invoice_number)}</div>
      <span class="status">${esc(statusLabel)}</span>
    </div>
  </div>

  <!-- Alıcı + (opsiyonel) iş emri bilgisi -->
  <div class="info-grid">
    <div class="info-card">
      <div class="label">Sayın / Müşteri</div>
      <div class="value">${clinicName}</div>
      <div class="meta">
        ${doctorName !== '—' ? 'Dr. ' + doctorName + '<br/>' : ''}
        ${clinicAddr  ? clinicAddr + '<br/>' : ''}
        ${clinicPhone ? 'Tel: ' + clinicPhone : ''}
        ${clinicEmail ? ' · ' + clinicEmail : ''}
      </div>
    </div>
    <div class="info-card">
      <div class="label">${invoice.work_order ? 'Bağlı İş Emri' : 'Fatura Bilgisi'}</div>
      ${invoice.work_order ? `
        <div class="value">${esc(invoice.work_order.order_number)}</div>
        <div class="meta">
          ${invoice.work_order.patient_name ? 'Hasta: ' + esc(invoice.work_order.patient_name) + '<br/>' : ''}
          ${invoice.work_order.delivery_date ? 'Teslim: ' + fmtDate(invoice.work_order.delivery_date) : ''}
        </div>
      ` : `
        <div class="value">Serbest Fatura</div>
        <div class="meta">İş emri ile ilişkili değil</div>
      `}
    </div>
  </div>

  <!-- Tarihler -->
  <div class="dates-bar">
    <div class="cell">
      <div class="label">Düzenleme Tarihi</div>
      <div class="value">${fmtDate(invoice.issue_date)}</div>
    </div>
    <div class="cell">
      <div class="label">Vade Tarihi</div>
      <div class="value ${isOverdue ? 'overdue' : ''}">${fmtDate(invoice.due_date)}</div>
    </div>
    <div class="cell">
      <div class="label">Para Birimi</div>
      <div class="value">${esc(currency)}</div>
    </div>
  </div>

  <!-- Kalemler -->
  <h2>Hizmet / Ürün Kalemleri</h2>
  <table class="items">
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Açıklama</th>
        <th class="num">Adet</th>
        <th class="num">Birim Fiyat</th>
        <th class="right">Tutar</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- Toplamlar -->
  <div class="totals">
    <table>
      <tr>
        <td class="label">Ara Toplam</td>
        <td class="value">${fmtMoney(invoice.subtotal, currency)}</td>
      </tr>
      <tr>
        <td class="label">KDV (%${Number(invoice.tax_rate).toLocaleString('tr-TR')})</td>
        <td class="value">${fmtMoney(invoice.tax_amount, currency)}</td>
      </tr>
      <tr class="grand">
        <td class="label">Genel Toplam</td>
        <td class="value">${fmtMoney(invoice.total, currency)}</td>
      </tr>
      <tr class="paid">
        <td class="label">Ödenen</td>
        <td class="value">${fmtMoney(invoice.paid_amount, currency)}</td>
      </tr>
      <tr class="balance ${balance <= 0 ? 'zero' : ''}">
        <td class="label">Kalan Bakiye</td>
        <td class="value">${fmtMoney(balance, currency)}</td>
      </tr>
    </table>
  </div>

  ${paymentRows ? `
    <h2>Tahsilat Geçmişi</h2>
    <table class="payments">
      <thead>
        <tr>
          <th>Tarih</th>
          <th>Yöntem</th>
          <th>Referans</th>
          <th class="right">Tutar</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>
  ` : ''}

  ${invoice.notes ? `<h2>Notlar</h2><div class="notes-box">${esc(invoice.notes)}</div>` : ''}

  <div class="footer">
    <span>${labWebsite || ''}</span>
    <span>Yazdırma: ${fmtDateTime(new Date().toISOString())}</span>
  </div>

</body>
</html>`;
}
