/**
 * buildOrderPrintDoc — siparişin İŞ EMRİ ETİKETİ HTML'ini üretir (A4/A5/A6).
 *
 * Etiket kutuya yapıştırılıp laboratuvarda teknisyenlerin elinde dolaşır.
 * Sipariş detayı ve plan önizleme ekranları AYNI çıktıyı basar; bu yüzden veri
 * hazırlığı tek yerde. Kopyalansaydı biri değişip diğeri geride kalırdı — bu
 * projede daha önce adres biçimlendiricinin dört kopyaya bölünmesiyle yaşandı.
 *
 * Sağlık Bakanlığı gereği hastanın adı etikete GİTMEZ: şablona yalnız baş
 * harfler verilir. Fiyat, mesajlar, lab iç notu ve imza alanları basılmaz.
 *
 * Şablon ve QR üreticisi dinamik import ile yükleniyor; yazdırmaya
 * basılmadıkça pakete girmez.
 */
import { supabase } from '../../../core/api/supabase';
import type { WorkOrder } from '../types';
import { readImplantInfo } from '../implantInfo';
import { autoT } from '../../../core/i18n/autoTranslate';
import { htmlAttrs, printLocale } from '../../../core/i18n/printLocale';
import { isRTL } from '../../../core/i18n';
import {
  type LabelSize, type LabelToothOp, type LabelOpRow,
  patientInitials, summarizeWork, labelOps,
} from './workLabel';
import { localQrSvg } from './qrSvg';

export interface WorkLabelDocOptions {
  size: LabelSize;
  /** QR'ın açtığı adres — `${origin}/order/<no>`. */
  qrUrl: string;
  /** Önizlemede kağıdın arkasındaki zemin (koyu temada koyu). Baskıya girmez. */
  screenBg?: string;
}

type PrintItem = { name: string; quantity: number; tooth_numbers?: number[] | null; notes?: string | null };

export async function buildOrderPrintDoc(order: WorkOrder, opts: WorkLabelDocOptions): Promise<string> {
  const { buildWorkLabelHtml } = await import('../../../lib/printWorkLabelHtml');

  // Lab adı + logosu
  let lab: { name: string; logoUrl?: string | null } = { name: '', logoUrl: null };
  if ((order as any).lab_id) {
    const { data } = await supabase.from('labs').select('name, logo_url').eq('id', (order as any).lab_id).maybeSingle();
    if (data) lab = { name: data.name ?? '', logoUrl: data.logo_url };
  }

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
          implantSystem: (d?.system ?? '').trim() || implant.brand || null,
          implantType:   (d?.type ?? '').trim() || null,
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
    qrSvg: await localQrSvg(opts.qrUrl),
    qrUrl: opts.qrUrl,
    t: autoT,
    locale: printLocale(),
    htmlAttrs: htmlAttrs(),
    rtl: isRTL(),
    screenBg: opts.screenBg,
  });
}
