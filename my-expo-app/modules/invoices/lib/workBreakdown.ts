// İş dökümü: kesinleşmiş faturanın kalem listesi (get_invoice_work_breakdown RPC) → tek faturalı ön ekstre.
// Saf (node --test ile çalışır). Yerel içe aktarma yalnız `import type`. Çeviri çağırana bırakılır
// (autoT node'da çalışmaz); Türkçe sabitler WORK_BREAKDOWN_TEXTS'te, çağıran autoT ile çevirir.
import type { PreStatement, PreStatementInvoice, PreStatementItem } from '../types';

/** get_invoice_work_breakdown yanıtı: PreStatementInvoice + klinik/lab adı. */
export interface WorkBreakdownRpc extends PreStatementInvoice {
  clinic_name: string | null;
  lab_name: string | null;
}

/** Arayüz/PDF metinleri (Türkçe anahtar; çağıran autoT ile çevirir). */
export const WORK_BREAKDOWN_TEXTS = {
  title: 'iş dökümü',
  scope: 'Bu faturanın iş dökümünü görme yetkiniz yok.',
  notFinalized: 'İş dökümü yalnız kesinleşmiş faturada alınır.',
  empty: 'Bu faturada kalem yok.',
} as const;

/** İş dökümü yalnız kesinleşmiş faturada (RPC'nin kabul ettiği küme). */
export function isWorkBreakdownStatus(status: string | null | undefined): boolean {
  return status === 'kesildi' || status === 'kismi_odendi' || status === 'odendi';
}

const num = (n: unknown): number => Number(n) || 0;
const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Tek faturalı PreStatement: kesinleşmiş bakiye / vadesi geçen bilinmez (null) → PDF'te açılış satırı gizlenir.
 * Kalem sırası RPC sırasıdır (sunucu sort_order, created_at, id ile sıralar). Kalem yoksa WB_EMPTY.
 */
export function workBreakdownToPreStatement(rpc: WorkBreakdownRpc | null | undefined): PreStatement {
  const items = rpc?.items ?? [];
  if (!rpc || !Array.isArray(items) || items.length === 0) throw new Error('WB_EMPTY');
  const currency = rpc.currency || 'TRY';
  const invItems: PreStatementItem[] = items.map((it) => ({
    ...it,
    quantity: num(it.quantity),
    unit_price: num(it.unit_price),
    total: num(it.total),
    gross_total: num(it.gross_total),
    dispute_status: null,
    notes: [],
  }));
  const { clinic_name: _c, lab_name: _l, ...inv } = rpc;
  const invoice: PreStatementInvoice = {
    ...inv,
    currency,
    subtotal: num(rpc.subtotal),
    tax: num(rpc.tax),
    total: num(rpc.total),
    items: invItems,
  };
  return {
    enabled: true,
    actor: 'viewer',
    can_manage: false,
    scope: 'full',
    summary: [{ currency, finalized_balance: null, overdue: null, pending: r2(invoice.total) }],
    invoices: [invoice],
  };
}

/** "<no> iş dökümü" — `t` yalnız sabit kısmı çevirir (çağıran autoT verir). */
export function workBreakdownTitle(invoiceNumber: string, t: (s: string) => string = (s) => s): string {
  return `${(invoiceNumber ?? '').trim()} ${t(WORK_BREAKDOWN_TEXTS.title)}`;
}

/** PDF dosya adı: Is-Dokumu-<no>.pdf (güvenli karakterler). */
export function workBreakdownFileName(invoiceNumber: string): string {
  const safe = (invoiceNumber ?? '').replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Fatura';
  return `Is-Dokumu-${safe}.pdf`;
}

/** RPC/adaptör hatasını kullanıcı metnine (Türkçe anahtar) çevirir; tanınmayan hata → null. */
export function workBreakdownErrorText(e: unknown): string | null {
  const err = (e ?? {}) as { message?: unknown; code?: unknown };
  const msg = String(err.message ?? '');
  const code = String(err.code ?? '');
  if (msg.includes('PS_SCOPE') || code === '42501') return WORK_BREAKDOWN_TEXTS.scope;
  if (msg.includes('INV_NOT_FINALIZED')) return WORK_BREAKDOWN_TEXTS.notFinalized;
  if (msg.includes('WB_EMPTY')) return WORK_BREAKDOWN_TEXTS.empty;
  return null;
}
