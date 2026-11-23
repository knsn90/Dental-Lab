/**
 * buildOrderPrintDoc — siparişin İŞ EMRİ ETİKETİ HTML'ini üretir (A4/A5/A6).
 *
 * Etiket kutuya yapıştırılıp laboratuvarda teknisyenlerin elinde dolaşır.
 * Sipariş detayı ve plan önizleme ekranları AYNI çıktıyı basar; bu yüzden veri
 * hazırlığı tek yerde. Kopyalansaydı biri değişip diğeri geride kalırdı — bu
 * projede daha önce adres biçimlendiricinin dört kopyaya bölünmesiyle yaşandı.
 *
 * Sağlık Bakanlığı gereği hastanın adı etikete GİTMEZ: şablona yalnız baş
 * harfler verilir. Fiyat, lab iç notu, lab'ın kendi mesajları ve imza alanları
 * basılmaz. Klinikten gelen yazılı mesajlar "Hekim notları" olarak basılır (A4/A5).
 *
 * Şablon ve QR üreticisi dinamik import ile yükleniyor; yazdırmaya
 * basılmadıkça pakete girmez.
 */
import { supabase } from '../../../core/api/supabase';
import type { WorkOrder } from '../types';
import { readImplantInfo } from '../implantInfo';
import { brandWithModel } from '../implantCatalogModel';
import { autoT } from '../../../core/i18n/autoTranslate';
import { htmlAttrs, printLocale } from '../../../core/i18n/printLocale';
import { isRTL } from '../../../core/i18n';
import {
  type LabelSize, type LabelToothOp, type LabelOpRow, type WorkLine,
  patientInitials, summarizeWork, labelOps,
} from './workLabel';
import { localQrSvg } from './qrSvg';

export interface WorkLabelDocOptions {
  size: LabelSize;
  /** QR'ın açtığı adres — `${origin}/order/<no>`. */
  qrUrl: string;
  /** Önizlemede kağıdın arkasındaki zemin (koyu temada koyu). Baskıya girmez. */
  screenBg?: string;
  /** Alttaki kutulara basılacak metinler (boşsa kutu elle yazmaya çizgili kalır). */
  labWork?: string | null;
  labNotes?: string | null;
  /** Hekim notlarını (sipariş notu + klinik mesajları) bas — varsayılan açık. */
  doctorNotes?: boolean;
}

// Müşteri (klinik/hekim) tarafı kullanıcı tipleri — yalnız bunların mesajı basılır.
const CLIENT_TYPES = new Set(['doctor', 'clinic', 'clinic_admin', 'clinic_secretary']);
// Kağıtta yer: A5'te en yeni 4, A4'te 6 mesaj (her biri en çok 3 satır).
const MAX_NOTES: Record<LabelSize, number> = { A4: 6, A5: 4, A6: 0 };

/**
 * Hekim notları: sipariş notu (varsa, en başta) + klinikten gelen yazılı sohbet
 * mesajları (reddedilenler hariç). Çok mesajda en yeniler basılır; kalan sayı ve
 * basılamayan ses/dosya sayısı ayrıca döner.
 */
export async function collectDoctorNotes(order: WorkOrder, size: LabelSize) {
  const fmt = new Intl.DateTimeFormat(printLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const lines: { who: string; when: string; text: string }[] = [];
  let audio = 0, files = 0;
  const { data } = await supabase
    .from('order_messages')
    .select('content, created_at, attachment_type, approval_status, external_source, external_sender, sender:profiles!order_messages_sender_id_fkey(full_name, user_type)')
    .eq('work_order_id', order.id)
    .order('created_at', { ascending: true });
  for (const m of (data ?? []) as any[]) {
    if (m.approval_status === 'rejected') continue;
    const sender = Array.isArray(m.sender) ? m.sender[0] : m.sender;
    const fromClient = sender ? CLIENT_TYPES.has(sender.user_type) : !!m.external_source;
    if (!fromClient) continue;
    if (m.attachment_type === 'audio') audio++;
    else if (m.attachment_type) files++;
    const text = String(m.content ?? '').trim();
    if (!text) continue;
    lines.push({
      who: sender?.full_name || m.external_sender || autoT('Klinik'),
      when: m.created_at ? fmt.format(new Date(m.created_at)) : '',
      text,
    });
  }
  const max = MAX_NOTES[size];
  const more = Math.max(0, lines.length - max);
  const kept = more > 0 ? lines.slice(-max) : lines;
  const orderNote = (order.notes ?? '').trim();
  if (orderNote) kept.unshift({ who: autoT('Sipariş notu'), when: '', text: orderNote });
  return { lines: kept, more, media: { audio, files } };
}

type PrintItem = { name: string; quantity: number; tooth_numbers?: number[] | null; notes?: string | null };

/**
 * Siparişin iş satırları: dişler, iş özeti (en kalabalık başta) ve diş→işlem
 * tablosu. İş emri etiketi ve prova fişi aynı veriyi basar — tek yerde.
 */
export function collectWorkRows(order: WorkOrder): { teeth: number[]; work: WorkLine[]; ops: LabelOpRow[] } {
  // ── Diş → işlem haritası (toothOps) ─────────────────────────────────────
  // Öncelik:
  //   1) order_items.tooth_numbers dolu → her item kendi diş+isim'ini verir
  //   2) work_orders.work_type virgülle birleşik segmentler tooth_numbers ile aynı uzunlukta
  const toothNumbersArr = order.tooth_numbers ?? [];
  const orderItems = (order as any).order_items as PrintItem[] | undefined;
  let toothOps: LabelToothOp[] = [];

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

  // ── İmplant detayını diş satırlarına işle ───────────────────────────────
  // Diş bazlı marka boşsa vaka geneli markaya düşülür (implantLineFor ile aynı kural).
  {
    const implant = readImplantInfo(order as any, orderItems ?? []);
    if (implant.hasAny) {
      const known = new Set(toothOps.map(o => o.tooth));
      for (const t of implant.teeth) {
        const d = implant.details[t];
        const patch = {
          implantSystem: brandWithModel((d?.system ?? '').trim() || implant.brand, d?.model) || null,
          // Platform/çap ayrı sütun değil; türün yanında yazılır ("Bone Level · RP (Standart)").
          implantType:   [d?.type, d?.platform].map(s => (s ?? '').trim()).filter(Boolean).join(' · ') || null,
          abutment:      (d?.abutment ?? '').trim() || null,
          screw:         (d?.screw ?? '').trim() || null,
        };
        if (known.has(t)) {
          toothOps.forEach(o => { if (o.tooth === t) Object.assign(o, patch); });
        } else {
          // İmplant dişi çalışma satırlarında yoksa da etikette görünsün.
          toothOps.push({ tooth: t, workType: order.work_type ?? '—', shade: order.shade ?? null, ...patch });
        }
      }
    }
  }

  const teeth = [...new Set([...toothNumbersArr, ...toothOps.map(o => o.tooth)])];
  const work = summarizeWork({ items: orderItems, workType: order.work_type, teethCount: teeth.length });

  // A4 tablosu: diş haritası varsa ondan; yoksa iş satırlarından (tek işte dişler o işe ait).
  let ops: LabelOpRow[] = labelOps(toothOps);
  if (ops.length === 0) {
    ops = work.map(w => ({
      work: w.name, detail: '', shade: (order.shade ?? '').trim(),
      teeth: work.length === 1 ? [...teeth].sort((a, b) => a - b) : [],
    }));
  }

  return { teeth, work, ops };
}

export async function buildOrderPrintDoc(order: WorkOrder, opts: WorkLabelDocOptions): Promise<string> {
  const { buildWorkLabelHtml } = await import('../../../lib/printWorkLabelHtml');

  // Lab adı + logosu
  let lab: { name: string; logoUrl?: string | null } = { name: '', logoUrl: null };
  if ((order as any).lab_id) {
    const { data } = await supabase.from('labs').select('name, logo_url').eq('id', (order as any).lab_id).maybeSingle();
    if (data) lab = { name: data.name ?? '', logoUrl: data.logo_url };
  }

  const { teeth, work, ops } = collectWorkRows(order);
  // Mesajlar okunamazsa iş kağıdı yine basılsın (eski tek not bölümüne düşer).
  const notes = opts.doctorNotes !== false && opts.size !== 'A6'
    ? await collectDoctorNotes(order, opts.size).catch(() => null)
    : null;

  return buildWorkLabelHtml({
    size: opts.size,
    orderNumber: order.order_number,
    createdAt: order.created_at,
    deliveryDate: order.delivery_date,
    isUrgent: !!order.is_urgent,
    patientInitials: patientInitials(order.patient_name),
    clinicName: order.doctor?.clinic_name ?? order.doctor?.clinic?.name ?? '',
    doctorName: order.doctor?.full_name ?? '',
    lab,
    work,
    shade: order.shade,
    teeth,
    note: order.notes,
    ops,
    labWork: opts.labWork,
    labNotes: opts.labNotes,
    doctorNotes: notes?.lines,
    doctorNotesMore: notes?.more,
    doctorNotesMedia: notes?.media,
    qrSvg: await localQrSvg(opts.qrUrl),
    qrUrl: opts.qrUrl,
    t: autoT,
    locale: printLocale(),
    htmlAttrs: htmlAttrs(),
    rtl: isRTL(),
    screenBg: opts.screenBg,
  });
}
