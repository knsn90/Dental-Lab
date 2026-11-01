// modules/delivery/proof/proofModel.ts
// Kurye teslim kanıtının saf modeli (React/Supabase yok; node --test ile denenir).
// Kurallar: spec 4.1–4.4 — fotoğraf her kendi kurye teslimde zorunlu; kliniğe teslimde
// ayrıca ad + imza ya da "İmza alınamadı" nedeni. Sunucudaki deliver_with_proof aynı kuralı uygular.
// Döndürülen ipuçları Türkçe kaynak metindir; ekranda autoT ile çevrilir.

export type ProofDirection = 'lab_to_clinic' | 'clinic_to_lab' | 'lab_to_other' | 'other_to_lab';

export const SKIP_REASONS = ['Resepsiyonda kimse yoktu', 'İmzalamak istemedi', 'Paket kapıya bırakıldı', 'Diğer'] as const;
export const OTHER_REASON = 'Diğer';
export const OVERRIDE_MIN_LEN = 6;

/** Ad ve "Diğer" notu için en kısa uzunluk — sunucuyla aynı (deliver_with_proof). */
const NAME_MIN = 2;
const OTHER_MIN = 3;

export interface ProofDraft {
  hasPhoto: boolean;
  recipientName: string;
  hasSignature: boolean;
  skip: boolean;
  reason: string | null;
  otherText: string;
}

export interface ProofEval {
  ok: boolean;
  hint: string | null;
  steps: boolean[];
  recipientName: string | null;
  skipReason: string | null;
}

export type ProofKind = 'courier' | 'nosig' | 'override' | 'provider' | 'provider_empty' | 'none';

export interface ProofLegFields {
  status?: string | null;
  mode?: string | null;
  direction?: string | null;
  proof_source?: string | null;
  signature_skipped_reason?: string | null;
  provider_proof_checked_at?: string | null;
}

/** Yön boşsa kliniğe teslim sayılır (DB'de coalesce(direction, 'lab_to_clinic')). */
export function needsSignature(direction: string | null | undefined): boolean {
  return (direction ?? 'lab_to_clinic') === 'lab_to_clinic';
}

export function evaluateProof(d: ProofDraft, direction: string | null | undefined): ProofEval {
  const name = d.recipientName.trim();
  const nameOk = name.length >= NAME_MIN;
  const reason = d.reason === OTHER_REASON ? d.otherText.trim() : (d.reason ?? '').trim();
  const reasonOk = d.reason === OTHER_REASON ? reason.length >= OTHER_MIN : reason.length > 0;

  if (!needsSignature(direction)) {
    return {
      ok: d.hasPhoto, hint: d.hasPhoto ? null : 'Önce fotoğraf çekin',
      steps: [d.hasPhoto], recipientName: null, skipReason: null,
    };
  }

  const steps = [d.hasPhoto, d.skip || nameOk, d.skip ? reasonOk : d.hasSignature];
  let hint: string | null = null;
  if (!d.hasPhoto) hint = 'Önce fotoğraf çekin';
  else if (d.skip) { if (!reasonOk) hint = 'İmzanın neden alınamadığını seçin'; }
  else if (!nameOk) hint = 'Teslim alanın adını yazın';
  else if (!d.hasSignature) hint = 'İmza alın ya da "İmza alınamadı"yı açın';

  return {
    ok: hint === null,
    hint,
    steps,
    recipientName: nameOk ? name : null,
    skipReason: d.skip && reasonOk ? reason : null,
  };
}

const OPEN_RANK: Record<string, number> = { yolda: 0, teslim_alindi: 1, atandi: 2, beklemede: 2 };

/** "Tara": siparişte bu kuryenin sırası gelen açık teslimatı (yolda > aldı > atandı; aynıysa en eski). */
export function pickOpenDelivery(rows: { id: string; status: string; created_at: string }[]): string | null {
  const open = rows.filter(r => r.status in OPEN_RANK);
  if (!open.length) return null;
  open.sort((a, b) => (OPEN_RANK[a.status] - OPEN_RANK[b.status]) || a.created_at.localeCompare(b.created_at));
  return open[0].id;
}

export function proofKindOf(leg: ProofLegFields): ProofKind {
  if (leg.status !== 'teslim_edildi') return 'none';
  if (leg.proof_source === 'manager_override') return 'override';
  if (leg.proof_source === 'provider') return 'provider';
  if (leg.proof_source === 'courier') return leg.signature_skipped_reason ? 'nosig' : 'courier';
  if (leg.mode === 'external' && leg.provider_proof_checked_at) return 'provider_empty';
  return 'none';
}

export function overrideReasonOk(s: string): boolean {
  return s.trim().length >= OVERRIDE_MIN_LEN;
}

export const SIBLINGS_CHANGED_TEXT = 'Birlikte kapatılacak teslimatlardan biri kapandı; liste yenilendi, yeniden deneyin';

/**
 * Gönderim hatasını kuryenin anlayacağı Türkçe kaynak metne çevirir (ekranda autoT ile çevrilir).
 * Depolama/ağ hataları İngilizce gelir; sunucunun Türkçe RPC mesajları olduğu gibi geçer.
 */
export function proofErrorText(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return 'Teslimat bulunamadı';
  const low = s.toLowerCase();
  if (low.includes('row-level security') || low.includes('unauthorized') || low.includes('403')) {
    return 'Kanıt yüklenemedi: teslimat kapanmış ya da size atanmamış';
  }
  if (low.includes('exceeded the maximum') || low.includes('too large') || low.includes('413')) {
    return 'Fotoğraf çok büyük; yeniden çekin';
  }
  if (low.includes('failed to fetch') || low.includes('network request failed') || low.includes('networkerror')) {
    return 'Bağlantı yok; yeniden deneyin';
  }
  return s;
}

/** Hata sonrası tazelenen kardeş listesiyle seçimi kırpar: yalnız hâlâ açık olanlar kalır, yenisi eklenmez. */
export function pruneSiblings<T extends { delivery_id: string }>(prev: T[], fresh: { delivery_id: string }[]): { next: T[]; changed: boolean } {
  const open = new Set(fresh.map((f) => f.delivery_id));
  const next = prev.filter((p) => open.has(p.delivery_id));
  return { next, changed: next.length !== prev.length };
}

/** Dosya yolu: <lab>/<teslimat>/<tür>-<zaman>.<uzantı> — dp_insert politikası ilk iki parçayı denetler. */
export function proofPath(labId: string, deliveryId: string, kind: 'photo' | 'signature', ext: string, now = Date.now()): string {
  return `${labId}/${deliveryId}/${kind}-${now}.${ext}`;
}
