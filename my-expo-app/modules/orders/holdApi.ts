// İşi Beklet (hold) — lab kaynaklı OLMAYAN beklemeler lab gecikmesine yazılmasın.
//
// Akış: hekim eksik tarama gönderdi → iş beklemeye alınır (neden + kategori).
// Beklerken sipariş "GECİKTİ" değil "BEKLEMEDE" görünür (isOrderOverdue hold'a duyarlı).
// Devam ettirilince bekleme MÜŞTERİ kaynaklıysa teslim tarihi bekleme kadar ötelenir
// (resume_order RPC) → lab cezalanmaz. Lab kaynaklı beklemede ötelenmez.
import { supabase } from '../../core/api/supabase';
import { dispatchNotification } from '../../core/notifications/dispatch';
import { labTodayOf } from '../../core/metrics/orderDefs';

export * from './holdCategories';
import { holdCategoryLabel, holdResponsibleOf } from './holdCategories';

/**
 * İşi beklet. Hekim/klinik kullanıcılarına neden bildirimi de gider
 * (müşteri kaynaklı beklemede — onların aksiyonu gerekiyor; geriye dönük girilmişse de).
 * `startedOn` (lab günü YYYY-MM-DD): unutulan bekleme o günün başından başlar
 * (20261102100000); verilmezse bugün/şimdi. Sınırları sunucu da denetler.
 */
export async function holdOrder(opts: {
  orderId: string;
  reason: string;
  category: string;
  startedOn?: string | null;
  orderNumber?: string | null;
  doctorId?: string | null;
  clinicId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const responsible = holdResponsibleOf(opts.category);
  const { error } = await supabase.rpc('hold_order', {
    p_order:       opts.orderId,
    p_reason:      opts.reason,
    p_category:    opts.category,
    p_responsible: responsible,
    ...(opts.startedOn ? { p_started_on: opts.startedOn } : {}),
  });
  if (error) return { ok: false, error: error.message };

  // Müşteri kaynaklıysa hekim + klinik kullanıcılarını bilgilendir (fire-and-forget).
  if (responsible === 'client') {
    try {
      const targets = new Set<string>();
      if (opts.doctorId) {
        const { data: doc } = await supabase.from('profiles').select('id').eq('id', opts.doctorId).maybeSingle();
        if ((doc as any)?.id) targets.add((doc as any).id);
      }
      if (opts.clinicId) {
        const { data: cu } = await supabase.from('profiles').select('id').eq('clinic_id', opts.clinicId);
        for (const r of (cu ?? []) as any[]) if (r?.id) targets.add(r.id);
      }
      if (targets.size > 0) {
        const num = opts.orderNumber ? ` · ${opts.orderNumber}` : '';
        void dispatchNotification({
          category:     'order_status',
          userIds:      Array.from(targets),
          title:        `İşiniz beklemede${num}`,
          body:         `${holdCategoryLabel(opts.category)}${opts.reason?.trim() ? ` — ${opts.reason.trim()}` : ''}`,
          resourceType: 'work_order',
          resourceId:   opts.orderId,
          actionUrl:    `/order/${opts.orderId}`,
        }).catch(() => null);
      }
    } catch { /* bildirim hatası akışı bozmasın */ }
  }
  return { ok: true };
}

/**
 * Devam ettir. Dönen sayı: teslim tarihinin ötelendiği gün (0 = ötelenmedi; lab kaynaklıda hep 0).
 * `startedOn`: açık beklemenin başlangıcını daha ERKEN bir güne çeker; `endedOn`: parça/onayın
 * geldiği geçmiş gün. Değişmeyen gün gönderilmez (sunucu bugünü/mevcut başlangıcı kullanır).
 */
export async function resumeOrder(
  orderId: string,
  opts?: { startedOn?: string | null; endedOn?: string | null },
): Promise<{ ok: boolean; extendedDays?: number; error?: string }> {
  const { data, error } = await supabase.rpc('resume_order', {
    p_order: orderId,
    ...(opts?.startedOn ? { p_started_on: opts.startedOn } : {}),
    ...(opts?.endedOn ? { p_ended_on: opts.endedOn } : {}),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, extendedDays: typeof data === 'number' ? data : 0 };
}

/**
 * Aynı siparişin önceki beklemesinin (prova dahil) bittiği lab günü — yeni beklemenin en erken
 * başlangıcı. Okunamazsa null: pencere yalnız açılış gününü taban alır, sunucu yine reddeder.
 */
export async function fetchPrevHoldEndDay(orderId: string, tz: string | null): Promise<string | null> {
  const { data, error } = await supabase
    .from('work_order_holds')
    .select('ended_at')
    .eq('work_order_id', orderId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const at = (data as { ended_at?: string | null } | null)?.ended_at;
  if (error || !at) return null;
  return labTodayOf(tz, new Date(at));
}
