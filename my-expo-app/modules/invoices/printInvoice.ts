/**
 * Cross-platform fatura yazdırma (teslimat fişinin aynı deseni).
 *
 *  Web    → yeni sekmede önizleme açılır; kullanıcı üst bardaki
 *           "Yazdır / PDF Kaydet" butonuna tıklar.
 *  Native → expo-print.printToFileAsync ile PDF üret + expo-sharing ile paylaş.
 */

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { buildInvoiceHtml } from './buildInvoiceHtml';
import type { Invoice } from './types';
import type { LabLetterhead } from '../receipt/buildReceiptHtml';
import { supabase } from '../../core/api/supabase';

// Aynı oturumda aynı lab'ı tekrar çekmeyelim
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
    return { id: labId, name: 'Laboratuvar' };
  }
  cachedLab = data as LabLetterhead;
  cachedLabForId = labId;
  return cachedLab;
}

export async function printInvoice(
  invoice: Invoice,
  labId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  // labId parametre gelmediyse invoice.lab_id'yi kullan
  const resolvedLabId = labId ?? invoice.lab_id;
  if (!resolvedLabId) return { ok: false, error: 'lab_id bulunamadı' };

  const lab = await fetchLab(resolvedLabId);
  const html = buildInvoiceHtml(invoice, lab);
  const filename = `Fatura-${invoice.invoice_number}.pdf`;

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
        dialogTitle: filename,
        UTI: 'com.adobe.pdf',
      });
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'PDF oluşturulamadı' };
  }
}
