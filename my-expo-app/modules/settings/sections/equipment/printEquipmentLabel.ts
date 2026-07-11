/**
 * Demirbaş etiketi — yazdırılabilir QR kod etiketi üretici.
 *
 *  Web    → yeni sekmede önizleme açılır + otomatik print dialog
 *  Native → expo-print ile PDF + expo-sharing ile paylaş
 *
 *  Etiket boyutu: 62mm x 40mm (yaygın thermal etiket).
 *  QR içeriği: JSON ({ type:'equipment', id, name })  — taranabilir.
 */

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode: any = require('qrcode');

interface EquipmentLite {
  id: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  category?: string | null;
  station?: { name: string } | null;
  assignee?: { full_name: string } | null;
}

interface PrintOpts {
  labName?: string;
  copies?: number; // 1..6
}

export async function buildEquipmentLabelHtml(
  item: EquipmentLite,
  opts: PrintOpts = {},
): Promise<string> {
  const labName = opts.labName ?? 'Siman';
  const copies = Math.max(1, Math.min(6, opts.copies ?? 1));

  // QR içeriği — JSON kod (uygulamadan tarayınca aynı cihaza dönüş kolay)
  const qrPayload = JSON.stringify({
    type: 'equipment',
    id: item.id,
    name: item.name,
  });

  // QR'ı yüksek çözünürlük + H ECL ile üret — data URL olarak göm
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: 'H',
    margin: 0,
    scale: 8,
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });

  const sn = item.serial_number?.trim();
  const brandModel = [item.brand, item.model].filter(Boolean).join(' ').trim();
  const station = item.station?.name?.trim();
  const assignee = item.assignee?.full_name?.trim();

  const labelHtml = `
    <div class="label">
      <div class="qr"><img src="${qrDataUrl}" alt="QR"/></div>
      <div class="info">
        <div class="lab">${escapeHtml(labName)}</div>
        <div class="name">${escapeHtml(item.name)}</div>
        ${brandModel ? `<div class="line">${escapeHtml(brandModel)}</div>` : ''}
        ${sn ? `<div class="sn">SN: ${escapeHtml(sn)}</div>` : ''}
        ${station ? `<div class="line">İstasyon: ${escapeHtml(station)}</div>` : ''}
        ${assignee ? `<div class="line">Atanan: ${escapeHtml(assignee)}</div>` : ''}
        <div class="id">${item.id.slice(0, 8).toUpperCase()}</div>
      </div>
    </div>
  `;

  const repeated = Array.from({ length: copies }, () => labelHtml).join('');

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Demirbaş Etiketi — ${escapeHtml(item.name)}</title>
  <style>
    @page { size: 62mm 40mm; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
      color: #0F172A;
      background: #F1F5F9;
      padding: 12px;
    }
    .sheet {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
    .label {
      width: 62mm;
      height: 40mm;
      background: #FFFFFF;
      border-radius: 2mm;
      padding: 2.5mm;
      display: flex;
      align-items: center;
      gap: 2.5mm;
      page-break-inside: avoid;
      break-inside: avoid;
      border: 0.4mm solid #E2E8F0;
    }
    .qr {
      width: 28mm;
      height: 28mm;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      overflow: hidden;
    }
    .lab {
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: 0.5pt;
      text-transform: uppercase;
      color: #64748B;
      margin-bottom: 0.5mm;
    }
    .name {
      font-size: 10pt;
      font-weight: 700;
      color: #0F172A;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 0.5mm;
    }
    .line {
      font-size: 7pt;
      color: #475569;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sn {
      font-size: 7pt;
      font-weight: 600;
      color: #0F172A;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .id {
      margin-top: auto;
      font-size: 6pt;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      color: #94A3B8;
      letter-spacing: 0.5pt;
    }

    .toolbar {
      position: sticky;
      top: 0;
      background: #F8FAFC;
      border-bottom: 1px solid #E2E8F0;
      padding: 10px 14px;
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      margin: -12px -12px 12px;
      z-index: 10;
    }
    .toolbar h1 {
      font-size: 13px;
      margin: 0;
      font-weight: 600;
      color: #0F172A;
    }
    .toolbar button {
      background: #0F172A;
      color: #FFFFFF;
      border: 0;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .toolbar button:hover { background: #1E293B; }

    @media print {
      body { background: #FFFFFF; padding: 0; }
      .toolbar { display: none; }
      .sheet { gap: 0; }
      .label { border: 0; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h1>Demirbaş Etiketi — ${escapeHtml(item.name)}</h1>
    <button onclick="window.print()">Yazdır / PDF</button>
  </div>
  <div class="sheet">
    ${repeated}
  </div>
  <script>
    // Web'de otomatik print dialog aç (kullanıcı bekleterek kapatabilir)
    if (typeof window !== 'undefined') {
      window.addEventListener('load', function() {
        setTimeout(function() { try { window.print(); } catch (e) {} }, 350);
      });
    }
  </script>
</body>
</html>`;
}

export async function printEquipmentLabel(
  item: EquipmentLite,
  opts: PrintOpts = {},
): Promise<{ ok: boolean; error?: string }> {
  const html = await buildEquipmentLabelHtml(item, opts);

  // ─── Web ──────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return { ok: false, error: 'window yok' };
    const w = window.open('', '_blank');
    if (!w) {
      return { ok: false, error: 'Pop-up engellendi. Lütfen popup iznini açın.' };
    }
    w.document.write(html);
    w.document.close();
    try { w.focus(); } catch { /* no-op */ }
    return { ok: true };
  }

  // ─── Native ──────────────────────────────────────────────────────────
  try {
    const { uri } = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Etiket - ${item.name}`,
        UTI: 'com.adobe.pdf',
      });
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'PDF oluşturulamadı' };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
