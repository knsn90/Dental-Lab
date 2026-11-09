// Ön ekstre — saf kurallar. Metinler Türkçe kaynaktır; çağıran autoT() ile sarar.
// Node testinde çalıştığı için yerel importlar yalnız `import type`.

import type { ApprovalResult, DisputeStatus, PreStatementInvoice, PsActor } from '../types';

/** Yalnız onaylayıcı ve lab ayarı açıkken onaylayabilir. */
export function canApprove(actor: PsActor | null, enabled: boolean): boolean {
  return actor === 'approver' && enabled;
}

/** Lab tarafı yazma (not, klinik adına onay) — yalnız manage_finance yetkili lab kullanıcısı. */
export function canLabWrite(actor: PsActor | null, canManage: boolean): boolean {
  return actor === 'lab' && canManage === true;
}

export function invoiceHasOpenDispute(inv: PreStatementInvoice): boolean {
  return (inv.items ?? []).some((it) => it.dispute_status === 'acik' || it.dispute_status === 'yanitlandi');
}

/** Fatura düzeyi rozet: herhangi bir kalem 'acik' → 'acik'; yoksa 'yanitlandi' varsa o; aksi halde null. */
export function invoiceDisputeStatus(inv: PreStatementInvoice): DisputeStatus | null {
  const items = inv.items ?? [];
  if (items.some((it) => it.dispute_status === 'acik')) return 'acik';
  if (items.some((it) => it.dispute_status === 'yanitlandi')) return 'yanitlandi';
  return null;
}

/** updated_at sunucudan gelen dizgiyle AYNEN geçer (Date'e çevrilirse mikrosaniye kaybolur → "değişti" sayılır). */
export function approvalPayload(invoices: PreStatementInvoice[]): { id: string; updated_at: string }[] {
  return invoices.map((i) => ({ id: i.id, updated_at: i.updated_at }));
}

export function undisputedCount(invoices: PreStatementInvoice[]): number {
  return invoices.filter((i) => !invoiceHasOpenDispute(i)).length;
}

export function disputeLabel(s: DisputeStatus): string {
  if (s === 'acik') return 'İtiraz';
  if (s === 'yanitlandi') return 'Yanıtlandı';
  return 'Çözüldü';
}

const PS_TEXTS: Record<string, string> = {
  PS_SCOPE: 'Bu ekstreye erişiminiz yok',
  PS_NOT_DRAFT: 'Bu kalemin faturası kesinleşmiş',
  PS_BODY: 'Not 1–2000 karakter olmalı',
  PS_DISABLED: 'Lab bu ayarı kapattı',
  PS_REASON_REQUIRED: 'Gerekçe zorunlu',
  PS_MODE: 'Geçersiz onay türü',
  PS_EMPTY: 'Onaylanacak fatura seçilmedi',
  INV_APPROVAL_REQUIRED: 'Bu lab\'da fatura klinik onayıyla kesinleşir; "Klinik adına onay kaydet"i kullanın',
};

/** Sunucu hata mesajındaki PS_ ve INV_APPROVAL_REQUIRED kodunu okunur metne çevirir; tanınmazsa null. */
export function preStatementErrorText(msg: string): string | null {
  const hit = String(msg ?? '').match(/PS_[A-Z_]+|INV_APPROVAL_REQUIRED/);
  if (hit && Object.prototype.hasOwnProperty.call(PS_TEXTS, hit[0])) return PS_TEXTS[hit[0]];
  return null;
}

export function summarizeApproval(r: ApprovalResult): { issued: number; changed: number; disputed: number } {
  return {
    issued: r.issued.length,
    changed: r.skipped.filter((s) => s.reason === 'changed').length,
    disputed: r.skipped.filter((s) => s.reason === 'disputed').length,
  };
}

export interface ApprovalBadgeInput {
  via: string;
  reason: string | null;
  created_at: string;
}

/**
 * Onay geçmişi rozet metni. Lab'ın kaydettiği onay ('lab') hekim/klinik onayından AYRI görünür
 * (anti-hedef 2): "Lab tarafından kaydedildi · tarih · gerekçe". Diğer yollar "Klinik onayladı · tarih".
 */
export function approvalBadgeText(
  a: ApprovalBadgeInput, fmtDate: (iso: string) => string, tr: (s: string) => string,
): string {
  const date = fmtDate(a.created_at);
  if (a.via === 'lab') {
    const reason = String(a.reason ?? '').trim();
    return [tr('Lab tarafından kaydedildi'), date, reason].filter(Boolean).join(' · ');
  }
  return [tr('Klinik onayladı'), date].filter(Boolean).join(' · ');
}
