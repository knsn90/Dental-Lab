// e-Fatura kartının akış mantığı (saf — test edilir, UI'dan bağımsız).
//
// Kullanıcı kuralı (2026-10-21): gerçek fatura HİÇBİR ZAMAN doğrudan kesilmez.
// Önce taslak oluşturulur (sunucu önizlemesi + imzalı jeton), bilgiler kontrol
// edilir, sonra "Asıl faturayı oluştur". Kart bu aşamaları tek yerden okur.

/** EFaturaStatus ile aynı değerler — tip burada tekrar edilmez, string kabul edilir. */
export type EFaturaStage = 'draft' | 'ready' | 'sent' | 'done' | 'error' | 'cancelled';

/**
 * draft  — taslak yok, ilk adım "Taslak oluştur"
 * ready  — taslak hazır (jeton geçerli), "Asıl faturayı oluştur" açılır
 * sent   — GİB'e iletildi, yanıt bekleniyor
 * done   — kabul edildi / tamamlandı
 * error  — gönderim ya da GİB hatası (yeni taslakla tekrar denenir)
 */
export function efaturaStage(status: string | null | undefined, hasDraft: boolean): EFaturaStage {
  switch (status) {
    case 'sent': return 'sent';
    case 'accepted': return 'done';
    case 'cancelled': return 'cancelled';
    case 'rejected': return 'error';
    case 'error': return hasDraft ? 'ready' : 'error';
    default: return hasDraft ? 'ready' : 'draft';
  }
}

/** Adım çubuğu: 0 Taslak · 1 Kesildi · 2 Onaylandı */
export function stageStep(stage: EFaturaStage): 0 | 1 | 2 {
  if (stage === 'done' || stage === 'cancelled') return 2;
  if (stage === 'sent') return 1;
  return 0;
}

/**
 * efatura_logs.action → okunur etiket (Türkçe kaynak; ekranda autoT ile çevrilir).
 * op = request_body.op: 'merge' (toplu e-fatura) / 'link' (Luca'da kesilen fatura bağlandı).
 */
export function logActionLabel(action: string, errorMessage: string | null | undefined, op?: string | null): string {
  if (action === 'send') {
    if (errorMessage && errorMessage.startsWith('Önizleme kapısı')) return 'Taslaksız gönderim engellendi';
    return op === 'merge' ? 'Toplu e-fatura gönderimi' : 'Gönderim';
  }
  if (op === 'link') return 'Luca\'da kesilen fatura bağlandı';
  if (action === 'status_check' || action === 'query') return 'Durum sorgusu';
  if (action === 'cancel') return 'İptal';
  return action;
}

/** Taslağın kalan geçerlilik süresi (dakika, yukarı yuvarlanır; bitti → 0; bilinmiyor → null). */
export function draftMinutesLeft(expiresAtIso: string | null | undefined, nowMs: number): number | null {
  if (!expiresAtIso) return null;
  const ms = Date.parse(expiresAtIso) - nowMs;
  if (!Number.isFinite(ms)) return null;
  return ms <= 0 ? 0 : Math.ceil(ms / 60_000);
}

/**
 * e-Fatura akışını kilitleyen fatura durumu. Siman faturası "taslak" (henüz kesilmemiş)
 * iken e-fatura taslağı oluşturulamaz (sunucu da reddeder: "önce faturayı kesin") —
 * kart bunun yerine "Faturayı kes" adımını gösterir. İptal faturada akış kapalı.
 * e-Fatura zaten gönderilmişse kilit yok: kayıt (numara/ETTN) gösterilmeye devam eder.
 */
export function efaturaBlocker(
  invoiceStatus: string | null | undefined,
  efaturaStatus: string | null | undefined,
): 'unissued' | 'cancelled' | null {
  if (efaturaStatus === 'sent' || efaturaStatus === 'accepted' || efaturaStatus === 'rejected' || efaturaStatus === 'cancelled') return null;
  if (invoiceStatus === 'taslak') return 'unissued';
  if (invoiceStatus === 'iptal') return 'cancelled';
  return null;
}
