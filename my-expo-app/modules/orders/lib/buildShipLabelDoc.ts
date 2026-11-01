/**
 * buildShipLabelDoc — bir kurye hareketinin GÖNDERİ FİŞİ HTML'i (A6).
 *
 * Gönderen/alıcı hareketin yönünden çözülür (shipLabel.resolveShipParties).
 * Lab: ad + logo + fatura künyesindeki açık adres + telefon. Klinik: kayıtlı
 * ad, adres, telefon; hekim adı siparişten. Hasta bilgisi basılmaz.
 *
 * Şablon ve QR üreticisi dinamik import ile yüklenir.
 */
import { supabase } from '../../../core/api/supabase';
import type { WorkOrder } from '../types';
import { DELIVERY_PURPOSE_LABELS, type DeliveryPurpose } from '../api';
import { autoT } from '../../../core/i18n/autoTranslate';
import { htmlAttrs, printLocale } from '../../../core/i18n/printLocale';
import { isRTL } from '../../../core/i18n';
import { resolveShipParties, isFinalLeg, labPartyAddress } from './shipLabel';
import { localQrSvg } from './qrSvg';

const LEG_SELECT = 'id, mode, purpose, direction, notes, created_at, external_provider, external_tracking_no, '
  + 'destination_name, destination_address, destination_phone, origin_name, origin_address, '
  + 'courier:profiles!deliveries_courier_profiles_fkey(full_name)';

/** Siparişin kliniği. doctor_id polimorfik (doctors ya da profiles) — ikisi de denenir. */
async function loadClinic(order: WorkOrder): Promise<{ name: string; address: string; phone: string }> {
  const o = order as any;
  let clinicId: string | null = o.clinic_id ?? o.doctor?.clinic?.id ?? null;
  if (!clinicId && o.doctor_id) {
    const [d, p] = await Promise.all([
      supabase.from('doctors').select('clinic_id').eq('id', o.doctor_id).maybeSingle(),
      supabase.from('profiles').select('clinic_id').eq('id', o.doctor_id).maybeSingle(),
    ]);
    clinicId = (d.data as any)?.clinic_id ?? (p.data as any)?.clinic_id ?? null;
  }
  const fallbackName = o.doctor?.clinic?.name ?? o.doctor?.clinic_name ?? '';
  if (!clinicId) return { name: fallbackName, address: '', phone: '' };
  const { data } = await supabase.from('clinics').select('name, address, phone').eq('id', clinicId).maybeSingle();
  return {
    name: (data as any)?.name ?? fallbackName,
    address: (data as any)?.address ?? '',
    phone: (data as any)?.phone ?? '',
  };
}

export async function buildShipLabelDoc(order: WorkOrder, legId: string, opts: { qrUrl: string }): Promise<string> {
  const { buildShipLabelHtml } = await import('../../../lib/printShipLabelHtml');
  const labId = (order as any).lab_id as string | undefined;

  const [legRes, labRes, clinic, qrSvg] = await Promise.all([
    supabase.from('deliveries').select(LEG_SELECT).eq('id', legId).maybeSingle(),
    labId
      ? supabase.from('labs').select('name, logo_url, phone, address, street, district, city').eq('id', labId).maybeSingle()
      : Promise.resolve({ data: null } as const),
    loadClinic(order),
    localQrSvg(opts.qrUrl),
  ]);
  const leg = legRes.data as any;
  if (!leg) throw new Error(legRes.error?.message || 'Kurye hareketi bulunamadı');
  const lab = (labRes.data ?? {}) as any;

  const { from, to } = resolveShipParties({
    leg,
    lab: { name: lab.name ?? '', address: labPartyAddress(lab), phone: lab.phone ?? '' },
    clinic: { name: clinic.name, person: order.doctor?.full_name ?? '', address: clinic.address, phone: clinic.phone },
  });

  const carrier = leg.mode === 'internal'
    ? [autoT('Bizim kurye'), leg.courier?.full_name].filter(Boolean).join(' · ')
    : (leg.external_provider || autoT('Dış kargo'));

  return buildShipLabelHtml({
    orderNumber: order.order_number,
    date: leg.created_at,
    final: isFinalLeg(leg.purpose),
    purposeLabel: DELIVERY_PURPOSE_LABELS[(leg.purpose ?? 'teslimat') as DeliveryPurpose] ?? 'Diğer',
    note: leg.notes,
    from,
    to,
    lab: { name: lab.name ?? '', logoUrl: lab.logo_url ?? null },
    carrier,
    trackingNo: leg.external_tracking_no,
    qrSvg,
    qrUrl: opts.qrUrl,
    t: autoT,
    locale: printLocale(),
    htmlAttrs: htmlAttrs(),
    rtl: isRTL(),
  });
}
