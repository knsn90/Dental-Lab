// İşi Beklet (hold) — lab kaynaklı OLMAYAN beklemeler lab gecikmesine yazılmasın.
//
// Akış: hekim eksik tarama gönderdi → iş beklemeye alınır (neden + kategori).
// Beklerken sipariş "GECİKTİ" değil "BEKLEMEDE" görünür (isOrderOverdue hold'a duyarlı).
// Devam ettirilince bekleme MÜŞTERİ kaynaklıysa teslim tarihi bekleme kadar ötelenir
// (resume_order RPC) → lab cezalanmaz. Lab kaynaklı beklemede ötelenmez.
import { supabase } from '../../core/api/supabase';
import { dispatchNotification } from '../../core/notifications/dispatch';

/** Bekletme nedeni kategorileri. responsible='client' olanlar teslim tarihini öteler. */
export const HOLD_CATEGORIES = [
  { key: 'client_missing_file', label: 'Eksik dosya / tarama',   responsible: 'client' as const },
  // Fiziksel eksik: abutment/analog, model, eski protez vb. klinikten gelmesi
  // gereken PARÇA. 'Eksik dosya / tarama' dijital karşılığı; ikisi ayrı çünkü
  // hekime giden bildirimde ne göndermesi gerektiği net olmalı.
  { key: 'client_missing_part', label: 'Eksik parça / model',   responsible: 'client' as const },
  { key: 'client_approval',     label: 'Hekim onayı bekleniyor', responsible: 'client' as const },
  { key: 'client_other',        label: 'Diğer (hekim/klinik)',   responsible: 'client' as const },
  { key: 'material',            label: 'Malzeme bekleniyor',     responsible: 'lab' as const },
  { key: 'lab_other',           label: 'Diğer (lab içi)',        responsible: 'lab' as const },
];

export function holdCategoryLabel(key?: string | null): string {
  return HOLD_CATEGORIES.find(c => c.key === key)?.label ?? 'Beklemede';
}
export function holdResponsibleOf(key: string): 'client' | 'lab' {
  return HOLD_CATEGORIES.find(c => c.key === key)?.responsible ?? 'client';
}

/** Bekleme süresini gün olarak (yaklaşık) hesapla — rozet/etiket için. */
export function holdDays(startedAt?: string | null): number {
  if (!startedAt) return 0;
  const ms = Date.now() - new Date(startedAt).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * İşi beklet. Hekim/klinik kullanıcılarına neden bildirimi de gider
 * (müşteri kaynaklı beklemede — onların aksiyonu gerekiyor).
 */
export async function holdOrder(opts: {
  orderId: string;
  reason: string;
  category: string;
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
 * Devam ettir. Dönen sayı: teslim tarihinin ötelendiği gün (0 = ötelenmedi).
 */
export async function resumeOrder(orderId: string): Promise<{ ok: boolean; extendedDays?: number; error?: string }> {
  const { data, error } = await supabase.rpc('resume_order', { p_order: orderId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, extendedDays: typeof data === 'number' ? data : 0 };
}
