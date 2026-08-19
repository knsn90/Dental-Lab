/**
 * buildOrderPrintDoc — sipariş İş Kağıdı (A4) HTML'ini üretir.
 *
 * Sipariş detayı ekranındaki `buildPrintHtmlV2Async`'ten BİREBİR taşındı.
 * Taşınma sebebi: plan önizleme ekranına da yazdırma eklendi ve iki ekranın
 * AYNI çıktıyı basması gerekiyor. Kopyalansaydı biri değişip diğeri geride
 * kalırdı — bu projede daha önce adres biçimlendiricinin dört kopyaya
 * bölünmesiyle yaşandı.
 *
 * Ağır bağımlılıklar (print şablonu + diş SVG yolları) dinamik import ile
 * yükleniyor; yazdırmaya basılmadıkça pakete girmez.
 */
import { supabase } from '../../../core/api/supabase';
import type { WorkOrder } from '../types';

export interface OrderPrintMessage {
  content: string;
  created_at: string;
  sender?: { full_name: string; user_type: string } | null;
}

export async function buildOrderPrintDoc(
  order: WorkOrder,
  qrUrl: string,
  messages?: OrderPrintMessage[],
  qrSvgHtml?: string,
): Promise<string> {
  const { buildOrderPrintHtml } = await import('../../../lib/printOrderHtml');
  const { TOOTH_PATHS, TOOTH_LABEL_POS } = await import('../assets/toothPaths');

  // Lab info fetch
  let lab: { name: string; phone?: string | null; logoUrl?: string | null } = { name: 'Nexadent', phone: null, logoUrl: null };
  let logoOnly = false;
  if ((order as any).lab_id) {
    const { data } = await supabase.from('labs').select('name, phone, logo_url, sidebar_brand_mode').eq('id', (order as any).lab_id).maybeSingle();
    if (data) {
      lab = { name: data.name, phone: data.phone, logoUrl: data.logo_url };
      logoOnly = (data as any).sidebar_brand_mode === 'logo' && !!data.logo_url;
    }
  }

  // Attachments (work_order_photos)
  const { data: photos } = await supabase
    .from('work_order_photos')
    .select('caption, storage_path')
    .eq('work_order_id', order.id)
    .order('created_at', { ascending: true });
  const attachments = (photos ?? []).map(p => ({
    name: (p as any).caption || ((p as any).storage_path as string).split('/').pop() || 'Dosya',
  }));

  // Messages mapping
  const mappedMessages = (messages ?? []).map(m => ({
    text: m.content,
    timestamp: m.created_at,
    senderName: m.sender?.full_name ?? 'Hekim',
    type: 'text' as const,
  }));

  // ── Diş → işlem haritası (toothOps) ─────────────────────────────────────
  // Öncelik:
  //   1) order_items.tooth_numbers dolu → her item kendi diş+isim'ini verir
  //   2) work_orders.work_type virgülle birleşik segmentler tooth_numbers ile aynı uzunlukta
  //   3) Fallback: tek bir work_type
  const toothNumbersArr = order.tooth_numbers ?? [];
  const orderItems = (order as any).order_items as Array<{ name: string; quantity: number; tooth_numbers?: number[] | null }> | undefined;
  let toothOps: Array<{ tooth: number; workType: string; shade?: string | null; material?: string | null }> = [];

  const itemsWithTeeth = (orderItems ?? []).filter(it => Array.isArray(it.tooth_numbers) && it.tooth_numbers!.length > 0);
  if (itemsWithTeeth.length > 0) {
    itemsWithTeeth.forEach(it => {
      it.tooth_numbers!.forEach(t => {
        toothOps.push({ tooth: t, workType: it.name, shade: order.shade ?? null });
      });
    });
  } else {
    const wtSegs = (order.work_type ?? '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
    if (wtSegs.length === toothNumbersArr.length && wtSegs.length > 0) {
      toothOps = toothNumbersArr.map((t, i) => ({ tooth: t, workType: wtSegs[i], shade: order.shade ?? null }));
    }
  }

  return buildOrderPrintHtml({
    orderNumber: order.order_number,
    createdAt: order.created_at,
    isUrgent: !!order.is_urgent,
    patient: { name: order.patient_name ?? '—', gender: order.patient_gender ?? null },
    doctor: { name: order.doctor?.full_name ?? '—', phone: order.doctor?.phone ?? null },
    clinic: { name: order.doctor?.clinic_name ?? order.doctor?.clinic?.name ?? '—' },
    lab,
    workType: order.work_type ?? '—',
    shade: order.shade,
    modelType: order.model_type,
    machineType: order.machine_type,
    deliveryDate: order.delivery_date,
    deliveryMethod: '',
    toothNumbers: toothNumbersArr,
    toothOps: toothOps.length > 0 ? toothOps : undefined,
    notes: order.notes,
    labNotes: order.lab_notes,
    attachments,
    messages: mappedMessages,
    qrSvgHtml,
    qrUrl,
    logoOnly,
    toothPaths: TOOTH_PATHS,
    toothLabelPos: TOOTH_LABEL_POS,
  });
}
