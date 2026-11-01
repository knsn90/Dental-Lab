/**
 * Bekleme kategorileri — saf (React/Supabase yok; node --test ile denenir). holdApi bunları yeniden dışa aktarır.
 *
 * 'client_prova' (2. dalga 4): prova klinikteyken sunucu (_prova_hold_sync) siparişi bu kategoriyle bekletir;
 * elle seçilemez (HOLD_PICKABLE'da yok) ve her yerde "Duraklatıldı" yerine "Provada" görünür.
 */
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
  // Sistem kategorisi — yalnız prova akışı açar/kapatır (resume_order reddeder).
  { key: 'client_prova',        label: 'Provada',                responsible: 'client' as const, system: true },
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

/** Elle "İşi beklet" penceresinde seçilebilen kategoriler (sistem kategorileri hariç). */
export const HOLD_PICKABLE = HOLD_CATEGORIES.filter((c) => !(c as { system?: boolean }).system);

type HoldLike = { hold_status?: string | null; hold_category?: string | null } | null | undefined;

/** Sipariş şu an prova beklemesinde mi (prova klinikte). */
export function isProvaHold(o: HoldLike): boolean {
  return !!o && o.hold_status === 'on_hold' && o.hold_category === 'client_prova';
}

/** Bekleme rozeti metni: prova beklemesi "Provada", diğer beklemeler "Duraklatıldı". */
export function holdBadgeText(o: HoldLike): 'Provada' | 'Duraklatıldı' {
  return isProvaHold(o) ? 'Provada' : 'Duraklatıldı';
}
