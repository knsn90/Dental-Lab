/**
 * Teslimat Fişi HTML builder
 * A4 yazdırma optimize — hem web'de window.print hem de native'de expo-print
 * üzerinden aynı HTML'i basar.
 *
 * Girdi: WorkOrder (ilişkili doctor, order_items ile) + Lab letterhead (name,
 *        address, phone, email, website, tax_number, logo_url).
 */

import type { WorkOrder } from '../orders/types';

// ─── Lab letterhead (labs tablosundan) ────────────────────────────────────
export interface LabLetterhead {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  tax_number?: string | null;
  logo_url?: string | null;
}

// ─── Tarih yardımcıları ───────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(
      'tr-TR',
      opts ?? { day: '2-digit', month: 'long', year: 'numeric' }
    );
  } catch {
    return '—';
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

// HTML kaçış (basit, inject güvenliği için)
function esc(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Ana builder ───────────────────────────────────────────────────────────
export function buildReceiptHtml(order: WorkOrder, lab: LabLetterhead): string {
  const teeth = (order.tooth_numbers ?? []).slice().sort((a, b) => a - b);
  const items = order.order_items ?? [];

  // Diş ve işlem satırları (order_items varsa onu, yoksa tooth_numbers + work_type'ı tek satır olarak)
  const itemRows = items.length > 0
    ? items.map(it => `
      <tr>
        <td>${esc(it.name)}</td>
        <td class="num">${esc(it.quantity)}</td>
        <td>${esc(it.notes ?? '')}</td>
      </tr>`).join('')
    : `<tr>
        <td>${esc(order.work_type)}${teeth.length ? ' — Dişler: ' + teeth.join(', ') : ''}</td>
        <td class="num">${teeth.length || 1}</td>
        <td>${esc(order.shade ?? '')}</td>
      </tr>`;

  // Teslim tarihi — delivered_at varsa onu, yoksa planlanan delivery_date
  const deliveredWhen = order.delivered_at
    ? fmtDateTime(order.delivered_at)
    : fmtDate(order.delivery_date);

  const issueDate = fmtDate(new Date().toISOString());
  const receiptNo = `TF-${order.order_number.replace(/^LAB-/, '')}`;

  // Letterhead fields (NULL-safe)
  const labName     = esc(lab.name);
  const labAddress  = lab.address  ? esc(lab.address)  : '';
  const labPhone    = lab.phone    ? esc(lab.phone)    : '';
  const labEmail    = lab.email    ? esc(lab.email)    : '';
  const labWebsite  = lab.website  ? esc(lab.website)  : '';
  const labTaxNo    = lab.tax_number ? esc(lab.tax_number) : '';
  const labLogo     = lab.logo_url ? esc(lab.logo_url) : '';

  // Alıcı bilgileri
  const doctorName  = esc(order.doctor?.full_name ?? '—');
  const clinicName  = esc(order.doctor?.clinic?.name ?? order.doctor?.clinic_name ?? '—');
  const doctorPhone = esc(order.doctor?.phone ?? '—');
  const patientName = esc(order.patient_name ?? '—');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Teslimat Fişi – ${esc(order.order_number)}</title>
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
      margin-top: 24px; padding: 12px 16px; background: #0f172a; color: #fff;
      border-radius: 8px;
    }
    .title-bar h1 { font-size: 16px; font-weight: 800; letter-spacing: 1px; }
    .title-bar .receipt-info { font-size: 11px; font-weight: 500; text-align: right; opacity: .9; }
    .title-bar .receipt-info b { font-weight: 700; }

    .info-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0;
      margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
    }
    .info-cell { padding: 10px 14px; }
    .info-cell + .info-cell { border-left: 1px solid #e2e8f0; }
    .info-cell .label {
      font-size: 10px; font-weight: 600; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
    }
    .info-cell .value { font-size: 13px; font-weight: 600; color: #0f172a; }
    .info-cell .sub { font-size: 11px; color: #64748b; margin-top: 2px; }

    h2 {
      font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase;
      letter-spacing: 0.5px; margin: 24px 0 8px;
    }
    table {
      width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px;
      overflow: hidden;
    }
    thead { background: #f8fafc; }
    th {
      text-align: left; padding: 10px 14px; font-size: 11px; font-weight: 700;
      color: #475569; text-transform: uppercase; letter-spacing: 0.3px;
      border-bottom: 1px solid #e2e8f0;
    }
    th.num, td.num { text-align: center; width: 80px; }
    td {
      padding: 10px 14px; font-size: 12px; color: #0f172a;
      border-bottom: 1px solid #f1f5f9;
    }
    tr:last-child td { border-bottom: none; }

    .notes-box {
      margin-top: 8px; padding: 10px 14px; background: #f8fafc;
      border: 1px solid #e2e8f0; border-radius: 8px;
      font-size: 12px; color: #334155; line-height: 1.5;
    }

    .signatures {
      display: grid; grid-template-columns: 1fr 1fr; gap: 32px;
      margin-top: 48px;
    }
    .sig-box {
      border-top: 1px solid #0f172a; padding-top: 8px;
      text-align: center;
    }
    .sig-box .role {
      font-size: 10px; font-weight: 700; color: #475569;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .sig-box .name { font-size: 13px; font-weight: 600; margin-top: 2px; color: #0f172a; }
    .sig-box .meta { font-size: 10px; color: #94a3b8; margin-top: 1px; }

    .terms {
      margin-top: 32px; padding: 12px 14px; background: #fffbeb;
      border: 1px solid #fde68a; border-radius: 8px;
      font-size: 10px; color: #78350f; line-height: 1.5;
    }
    .terms b { color: #92400e; }

    .footer {
      margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between;
      font-size: 10px; color: #94a3b8;
    }

    /* ─── Ekranda önizleme için üst aksiyon barı (print'te gizli) ─── */
    .preview-bar {
      position: sticky; top: 0; z-index: 100;
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px; margin: -32px -36px 24px;
      padding: 12px 20px;
      background: #0f172a; color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .preview-bar .pb-title {
      font-size: 13px; font-weight: 600; letter-spacing: 0.3px;
    }
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
      .terms { break-inside: avoid; }
      .signatures { break-inside: avoid; }
    }

    @page { size: A4; margin: 0; }
  </style>
</head>
<body>

  <!-- Önizleme barı (yalnızca ekranda görünür, print'te gizli) -->
  <div class="preview-bar no-print">
    <div class="pb-title">
      Teslimat Fişi Önizleme
      <span class="muted">· ${esc(receiptNo)}</span>
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

  <!-- Title bar: TESLİMAT FİŞİ + no + tarih -->
  <div class="title-bar">
    <h1>TESLİMAT FİŞİ</h1>
    <div class="receipt-info">
      <div>No: <b>${esc(receiptNo)}</b></div>
      <div>Düzenleme: <b>${issueDate}</b></div>
    </div>
  </div>

  <!-- Alıcı bilgileri + iş emri + teslim tarihi -->
  <div class="info-grid">
    <div class="info-cell">
      <div class="label">Teslim Edilen Klinik</div>
      <div class="value">${clinicName}</div>
      <div class="sub">Dr. ${doctorName}${doctorPhone !== '—' ? ` · Tel: ${doctorPhone}` : ''}</div>
    </div>
    <div class="info-cell">
      <div class="label">Hasta</div>
      <div class="value">${patientName}</div>
      ${order.patient_phone ? `<div class="sub">Tel: ${esc(order.patient_phone)}</div>` : ''}
    </div>
  </div>

  <div class="info-grid" style="margin-top: 8px;">
    <div class="info-cell">
      <div class="label">İş Emri No</div>
      <div class="value">${esc(order.order_number)}</div>
      <div class="sub">Oluşturma: ${fmtDate(order.created_at)}</div>
    </div>
    <div class="info-cell">
      <div class="label">Teslim Tarihi</div>
      <div class="value">${esc(deliveredWhen)}</div>
      ${order.delivered_at ? '<div class="sub">Gerçekleşen teslim</div>' : '<div class="sub">Planlanan teslim</div>'}
    </div>
  </div>

  <!-- Kalemler -->
  <h2>Teslim Edilen Kalemler</h2>
  <table>
    <thead>
      <tr>
        <th>Açıklama</th>
        <th class="num">Adet</th>
        <th>Not</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  ${order.notes ? `<h2>Notlar</h2><div class="notes-box">${esc(order.notes)}</div>` : ''}

  <!-- İmza alanları -->
  <div class="signatures">
    <div class="sig-box">
      <div class="role">Teslim Eden</div>
      <div class="name">${labName}</div>
      <div class="meta">İmza / Kaşe</div>
    </div>
    <div class="sig-box">
      <div class="role">Teslim Alan</div>
      <div class="name">${clinicName}</div>
      <div class="meta">İmza</div>
    </div>
  </div>

  <!-- Şartlar -->
  <div class="terms">
    <b>Teslim Alma Şartları:</b> Ürünler teslim anında kontrol edilmelidir.
    Teslimattan sonraki 24 saat içinde bildirilmeyen hasar / uyumsuzluk
    durumlarından laboratuvar sorumlu tutulamaz. Garanti kapsamındaki sorunlar
    için lütfen laboratuvarımızla iletişime geçiniz.
  </div>

  <div class="footer">
    <span>${labWebsite || ''}</span>
    <span>Yazdırma: ${fmtDateTime(new Date().toISOString())}</span>
  </div>

</body>
</html>`;
}
