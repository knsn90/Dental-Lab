/**
 * Cross-platform teslimat fişi yazdırma.
 *
 *  Web    → yeni sekmede fiş önizlemesi açılır. Kullanıcı üstteki barda
 *           "Yazdır / PDF Kaydet" butonuna tıklayarak yazdırır veya PDF'e
 *           kaydeder. Otomatik print diyaloğu açılmaz — önce önizleme.
 *  Native → expo-print.printToFileAsync ile PDF üret + expo-sharing ile paylaş
 *           (WhatsApp, e-posta, Dosyalar, vb.)
 */

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { buildReceiptHtml, LabLetterhead } from './buildReceiptHtml';
import type { WorkOrder } from '../orders/types';
import { supabase } from '../../core/api/supabase';

// Lab letterhead cache — aynı oturumda aynı lab'ı tekrar çekmeyelim
let cachedLab: LabLetterhead | null = null;
let cachedLabForId: string | null = null;

async function fetchLab(labId: string): Promise<LabLetterhead> {
  if (cachedLab && cachedLabForId === labId) return cachedLab;
  const { data, error } = await supabase
    .from('labs')
    .select('id, name, address, phone, email, website, tax_number, logo_url')
    .eq('id', labId)
    .single();
  if (error || !data) {
    // Fallback — letterhead olmadan bile fiş üretilebilsin
    return { id: labId, name: 'Laboratuvar' };
  }
  cachedLab = data as LabLetterhead;
  cachedLabForId = labId;
  return cachedLab;
}

export async function printDeliveryReceipt(
  order: WorkOrder,
  labId: string | null | undefined,
): Promise<{ ok: boolean; error?: string }> {
  if (!labId) return { ok: false, error: 'lab_id bulunamadı' };

  const lab = await fetchLab(labId);
  const html = buildReceiptHtml(order, lab);
  const filename = `TeslimatFisi-${order.order_number}.pdf`;

  // ─── Web ──────────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return { ok: false, error: 'window yok' };
    const w = window.open('', '_blank');
    if (!w) {
      return { ok: false, error: 'Pop-up engellendi. Lütfen popup iznini açın.' };
    }
    w.document.write(html);
    w.document.close();
    // Otomatik print tetiklenmez — kullanıcı önce önizlemeyi görür, sonra
    // HTML içindeki "Yazdır / PDF Kaydet" butonuna tıklar.
    try { w.focus(); } catch { /* no-op */ }
    return { ok: true };
  }

  // ─── Native (iOS / Android) ──────────────────────────────────────────
  try {
    const { uri } = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: filename,
        UTI: 'com.adobe.pdf',
      });
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'PDF oluşturulamadı' };
  }
}
