// Ön ekstre — saf kurallar. Metinler Türkçe kaynaktır; çağıran autoT() ile sarar.
// Node testinde çalıştığı için yerel importlar yalnız `import type`.

import type {
  ApprovalResult, DisputeStatus, PreStatementInvoice, PreStatementItem, PsActor, StatementLinkStatus, StatementRequestContacts,
  StatementSendChannel,
} from '../types';

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
  PS_LINK_INVALID: 'Bu bağlantı artık geçerli değil. Lab\'dan yeni bağlantı isteyin.',
  PS_NO_RECIPIENT: 'Kliniğin onay verecek yönetici hesabı yok',
  PS_CHANNELS: 'En az bir gönderim kanalı seçin',
  PS_RATE: 'Bu kliniğe az önce onay isteği gönderildi. Lütfen birkaç dakika sonra tekrar deneyin.',
  INV_APPROVAL_REQUIRED: 'Bu lab\'da fatura klinik onayıyla kesinleşir; "Klinik adına onay kaydet"i kullanın',
};

/** Sunucu hata mesajındaki PS_ ve INV_APPROVAL_REQUIRED kodunu okunur metne çevirir; tanınmazsa null. */
export function preStatementErrorText(msg: string): string | null {
  const hit = String(msg ?? '').match(/PS_[A-Z_]+|INV_APPROVAL_REQUIRED/);
  if (hit && Object.prototype.hasOwnProperty.call(PS_TEXTS, hit[0])) return PS_TEXTS[hit[0]];
  return null;
}

// ─── "Onay iste" gönderim durumu (plan 4 Task 5) ─────────────────────────

const SEND_ERROR_TEXTS: Record<string, string> = {
  NO_CONTACT: 'Alıcının iletişim bilgisi yok',
  EMAIL_OPTOUT: 'Alıcının e-posta bildirimleri kapalı',
  WA_TEMPLATE: 'WhatsApp şablonu onay bekliyor',
  NO_SECRET: 'Gönderim ayarı eksik',
  HTTP_ERR: 'Gönderilemedi',
};

/** Kanal sonucu (request_pre_statement_approval → sends[]) okunur metne. Ham kod gösterilmez. */
export function sendStatusText(status: string, error: string | null | undefined): string {
  const e = error && Object.prototype.hasOwnProperty.call(SEND_ERROR_TEXTS, error) ? SEND_ERROR_TEXTS[error] : null;
  switch (status) {
    case 'queued': return 'Gönderim sıraya alındı';
    case 'skipped_probe': return 'Deneme modu: gönderilmedi';
    case 'skipped': return e ?? 'Gönderilmedi';
    case 'unavailable': return e ?? 'Kanal kullanılamıyor';
    case 'failed': return e ?? 'Gönderilemedi';
    default: return 'Gönderilemedi';
  }
}

export type SendTone = 'success' | 'warning' | 'danger' | 'neutral';

export function sendStatusTone(status: string): SendTone {
  if (status === 'queued') return 'success';
  if (status === 'skipped_probe') return 'neutral';
  if (status === 'skipped' || status === 'unavailable') return 'warning';
  return 'danger';
}

// ─── Bağlantı / gönderim durumu satırı (plan 4 son düzeltme I2) ──────────

const CHANNEL_LABELS: Record<string, string> = { email: 'E-posta', whatsapp: 'WhatsApp' };

/**
 * get_statement_link_status → tek satır: "Son gönderim: 01.12 · E-posta: Gönderim sıraya alındı ·
 * Etkin bağlantı · Son geçerlilik: 24.12". Hiçbiri yoksa "Gönderim yok". Ton son gönderimden.
 * `tr` her Türkçe parçaya ayrı uygulanır (tarih çevrilmez).
 */
export function statementLinkStatusLine(
  s: StatementLinkStatus | null | undefined, fmtDate: (iso: string) => string, tr: (s: string) => string,
): { text: string; tone: SendTone } {
  const parts: string[] = [];
  const send = s?.last_send ?? null;
  const link = s?.active_link ?? null;
  if (send) {
    parts.push(`${tr('Son gönderim')}: ${fmtDate(send.created_at)}`);
    if (send.trigger === 'month_end') parts.push(tr('Ay sonu'));
    const ch = Object.prototype.hasOwnProperty.call(CHANNEL_LABELS, send.channel) ? CHANNEL_LABELS[send.channel] : 'Kanal';
    parts.push(`${tr(ch)}: ${tr(sendStatusText(send.status, send.error))}`);
  }
  if (link) {
    if (link.used) parts.push(link.used_at ? `${tr('Bağlantıyla onaylandı')}: ${fmtDate(link.used_at)}` : tr('Bağlantıyla onaylandı'));
    else parts.push(`${tr('Etkin bağlantı')} · ${tr('Son geçerlilik')}: ${fmtDate(link.expires_at)}`);
  }
  if (parts.length === 0) return { text: tr('Gönderim yok'), tone: 'neutral' };
  const tone: SendTone = send ? sendStatusTone(send.status) : link?.used ? 'success' : 'neutral';
  return { text: parts.join(' · '), tone };
}

// ─── Girişsiz bağlantı sayfası: onay durumu (plan 4 son düzeltme I3) ─────

export type LinkApproveState = 'disabled' | 'approved' | 'approve' | 'blocked';

/**
 * 'blocked': bağlantı geçerli ve okunur ama alıcı artık kliniğin onaylayıcısı değil (sunucu can_approve=false);
 * onay/not düğmeleri yerine sakin bir not gösterilir.
 */
export function linkApproveState(
  d: { enabled: boolean; approved: boolean; can_approve: boolean } | null | undefined,
): LinkApproveState {
  if (!d || !d.enabled) return 'disabled';
  if (d.approved) return 'approved';
  return d.can_approve ? 'approve' : 'blocked';
}

/** Kanal kutusu pasifse nedeni (Türkçe kaynak); seçilebilirse null. */
export function channelDisabledReason(
  channel: StatementSendChannel, c: StatementRequestContacts | null | undefined,
): string | null {
  if (!c) return 'Alıcı bilgisi yükleniyor';
  if (!c.has_recipient) return PS_TEXTS.PS_NO_RECIPIENT;
  if (channel === 'email') {
    if (!c.has_email) return 'Alıcının e-posta adresi yok';
    if (c.email_optout) return 'Alıcının e-posta bildirimleri kapalı';
    return null;
  }
  if (!c.has_phone) return 'Alıcının telefon numarası yok';
  if (!c.whatsapp_available) return 'WhatsApp şablonu onay bekliyor';
  return null;
}

/** Girişsiz onay sayfası adresi. origin: web'de window.location.origin, native'de https://siman.app. */
export function buildStatementLinkUrl(token: string, origin: string): string {
  return `${String(origin ?? '').replace(/\/+$/, '')}/s/${token}`;
}

/**
 * Bağlantının alan adı: yerel (localhost, 127.*) ve önizleme (*.vercel.app) adreslerinde canlı
 * alan adı; aksi halde bulunulan alan adı korunur (ör. lab alan adı nexadent.net).
 */
export function linkOrigin(hostname: string, origin: string): string {
  const h = String(hostname ?? '').toLowerCase();
  if (!h || !origin || h === 'localhost' || h.startsWith('127.') || h.endsWith('.vercel.app')) return 'https://siman.app';
  return origin;
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

// ─── Çok işli ekstre: süzme ve gruplama (plan 4 Task 7) ─────────────────

/** İ, I, i, ı birbirine eşit sayılır (iki taraf da aynı biçime katlanır). */
const trLower = (v: unknown): string => String(v ?? '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFC');

/**
 * Yalnız GÖRÜNÜM süzer: kalemler süzülür, fatura toplamı/updated_at aynen kalır; kalemi kalmayan
 * fatura düşer. Onay RPC'si sunucuda klinik+dönem başınadır; çağıran onayı süzülmüş listeyle DEĞİL
 * tam listeyle göndermelidir.
 */
export function filterPreStatement(
  inv: PreStatementInvoice[], q: { text?: string; work?: string | null },
): PreStatementInvoice[] {
  const text = trLower(q.text).trim();
  const work = q.work ? String(q.work) : null;
  if (!text && !work) return inv;
  const out: PreStatementInvoice[] = [];
  for (const i of inv) {
    const items = (i.items ?? []).filter((it) => {
      if (work && String(it.description ?? '').trim() !== work) return false;
      if (!text) return true;
      return trLower(it.patient_initials).includes(text) || trLower(it.order_no).includes(text);
    });
    if (items.length > 0) out.push({ ...i, items });
  }
  return out;
}

export interface DoctorOrderGroup {
  doctor: string;
  orders: { order_no: string; items: PreStatementItem[]; subtotal: number }[];
  subtotal: number;
}

/** Hekim → sipariş gruplaması (ilk görülme sırası korunur). Eksik hekim/sipariş "—". */
export function groupItemsByDoctorOrder(inv: PreStatementInvoice): DoctorOrderGroup[] {
  const docs = new Map<string, Map<string, PreStatementItem[]>>();
  for (const it of inv.items ?? []) {
    const d = String(it.doctor_name ?? '').trim() || '—';
    const o = String(it.order_no ?? '').trim() || '—';
    let om = docs.get(d);
    if (!om) { om = new Map(); docs.set(d, om); }
    const arr = om.get(o);
    if (arr) arr.push(it); else om.set(o, [it]);
  }
  const sum = (xs: PreStatementItem[]) => xs.reduce((s, x) => s + (Number(x.total) || 0), 0);
  return [...docs.entries()].map(([doctor, om]) => {
    const orders = [...om.entries()].map(([order_no, items]) => ({ order_no, items, subtotal: sum(items) }));
    return { doctor, orders, subtotal: orders.reduce((s, o) => s + o.subtotal, 0) };
  });
}

/** Süzme seçicisi için benzersiz, sıralı iş açıklamaları. */
export function workTypes(inv: PreStatementInvoice[]): string[] {
  const set = new Set<string>();
  for (const i of inv) for (const it of i.items ?? []) {
    const d = String(it.description ?? '').trim();
    if (d) set.add(d);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
}
