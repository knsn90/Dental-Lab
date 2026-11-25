/**
 * buildProvaSlipDoc — PROVA FİŞİ HTML'i (A5). Prova kliniğe giderken kutuya konur;
 * lab notu uygulamada yazılıp basılır, hekim notu kutusu kalemle doldurulup geri gelir.
 *
 * İş satırları iş emri etiketiyle aynı kaynaktan (collectWorkRows). Hasta yalnız
 * baş harfleriyle (KVKK). Şablon ve QR üreticisi dinamik import ile yüklenir.
 */
import { supabase } from '../../../core/api/supabase';
import type { WorkOrder } from '../types';
import { autoT } from '../../../core/i18n/autoTranslate';
import { htmlAttrs, printLocale } from '../../../core/i18n/printLocale';
import { isRTL } from '../../../core/i18n';
import { patientInitials } from './workLabel';
import { localQrSvg } from './qrSvg';
import { collectWorkRows } from './buildOrderPrintDoc';

export interface ProvaSlipDocOptions {
  qrUrl: string;
  /** "2. Prova" — çevrilmiş. */
  provaLabel: string;
  labNote?: string | null;
  screenBg?: string;
  /** Geçici / daimi — rozet ve hekim seçenekleri buna göre basılır. */
  kind?: 'gecici' | 'daimi' | null;
}

export async function buildProvaSlipDoc(order: WorkOrder, opts: ProvaSlipDocOptions): Promise<string> {
  const { buildProvaSlipHtml } = await import('../../../lib/printProvaSlipHtml');
  const labId = (order as any).lab_id as string | undefined;
  const [labRes, qrSvg] = await Promise.all([
    labId
      ? supabase.from('labs').select('name, logo_url').eq('id', labId).maybeSingle()
      : Promise.resolve({ data: null } as const),
    localQrSvg(opts.qrUrl),
  ]);
  const lab = (labRes.data ?? {}) as any;
  const { ops } = collectWorkRows(order);
  return buildProvaSlipHtml({
    orderNumber: order.order_number,
    provaLabel: opts.provaLabel,
    date: new Date(),
    deliveryDate: order.delivery_date,
    patientInitials: patientInitials(order.patient_name) || null,
    clinicName: order.doctor?.clinic_name ?? order.doctor?.clinic?.name ?? '',
    doctorName: order.doctor?.full_name ?? '',
    lab: { name: lab.name ?? '', logoUrl: lab.logo_url ?? null },
    ops,
    labNote: opts.labNote,
    qrSvg,
    qrUrl: opts.qrUrl,
    t: autoT,
    locale: printLocale(),
    htmlAttrs: htmlAttrs(),
    rtl: isRTL(),
    screenBg: opts.screenBg,
    kind: opts.kind ?? null,
  });
}
