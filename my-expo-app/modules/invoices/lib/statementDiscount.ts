// Ekstre indirimi — saf kurallar (numara, hata metni, dönem etiketi).
// Metinler Türkçe kaynaktır; çağıran autoT() ile sarar.

import type { StatementDiscount } from '../types';
import type { StatementLine } from '../buildStatementHtml';

export type DiscountMode = 'amount' | 'percent';
export type SdErrorCode = 'SD_EMPTY' | 'SD_VALUE' | 'SD_CAP';

export function statementDiscountDocNo(n: number): string {
  return 'İND-' + n;
}

const SD_TEXTS: Record<SdErrorCode, string> = {
  SD_VALUE: "İndirim 0'dan büyük olmalı.",
  SD_CAP: 'Bu döneme verilen indirimlerin toplamı dönemin fatura toplamını aşamaz.',
  SD_EMPTY: 'Bu dönemde kesilmiş fatura yok.',
};

export function sdErrorText(code: string | null | undefined): string {
  if (code && Object.prototype.hasOwnProperty.call(SD_TEXTS, code)) {
    return SD_TEXTS[code as SdErrorCode];
  }
  return 'İndirim kaydedilemedi.';
}

// Fatura durum değişikliğinde sunucunun SD kilitleri (zz_sd_invoice_credit tetikleyicisi).
const SD_STATUS_TEXTS: Record<string, string> = {
  SD_DRAFT_LOCKED: 'Bu faturaya ekstre indirimi payı uygulanmış; taslağa çevrilemez. Gerekirse indirimi ekstreden silin.',
  SD_UNCANCEL_LOCKED: 'Bu faturanın ekstre indirimi payı iptalde alacağa döndü; iptal geri alınamaz.',
};

/** Durum değişikliği hatası: SD kilidi → okunur metin; başka hata → ham mesaj; boş → genel metin. */
export function invoiceStatusErrorText(message: string | null | undefined): string {
  const m = String(message ?? '').trim();
  if (!m) return 'İşlem başarısız';
  const hit = m.match(/SD_[A-Z_]+/);
  if (hit && Object.prototype.hasOwnProperty.call(SD_STATUS_TEXTS, hit[0])) return SD_STATUS_TEXTS[hit[0]];
  return m;
}

function ymd(s: string): [number, number, number] {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function discountPeriodLabel(
  from: string,
  to: string,
  monthName: (monthIndex0: number) => string,
): string {
  const [fy, fm, fd] = ymd(from);
  const [ty, tm, td] = ymd(to);
  const lastDay = new Date(Date.UTC(fy, fm, 0)).getUTCDate();
  if (fy === ty && fm === tm && fd === 1 && td === lastDay) {
    return `${monthName(fm - 1)} ${fy}`;
  }
  return `${pad2(fd)}.${pad2(fm)}.${fy} – ${pad2(td)}.${pad2(tm)}.${ty}`;
}

/** Sunucu hata mesajından SD_* kodunu çıkarır; yoksa ham mesaj ('Yetkiniz yok' vb.). Boşsa null. */
export function sdServerError(message: string | null | undefined): string | null {
  const m = String(message ?? '').trim();
  if (!m) return null;
  const hit = m.match(/SD_[A-Z_]+/);
  return hit ? hit[0] : m;
}

const num = (x: unknown): number => Number(x) || 0;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Faturanın toplam indirimi: Σ(kalem brüt − net) + fatura altı indirim; brüt = Σ kalem brüt. */
export function invoiceDiscountOf(inv: {
  items?: ReadonlyArray<{ total: unknown; net_total?: unknown }> | null;
  discount_amount?: unknown;
}): { amount: number; gross: number } {
  let gross = 0;
  let amount = 0;
  for (const it of inv.items ?? []) {
    const t = num(it.total);
    gross += t;
    amount += t - num(it.net_total);
  }
  amount += num(inv.discount_amount);
  return { amount: Math.round(amount * 100) / 100, gross: Math.round(gross * 100) / 100 };
}

/** Ekstre indirim kayıtları → ekstre satırları (yalnız seçili para birimi). Bakiye etkisi `lineDelta`. */
export function discountStatementLines(
  discounts: ReadonlyArray<StatementDiscount>,
  currency: string,
): StatementLine[] {
  return discounts
    .filter(d => d.currency === currency)
    .map(d => ({
      id: 'disc-' + d.id,
      date: d.discount_date,
      type: 'discount' as const,
      description: d.description ?? '',
      invoiceNo: statementDiscountDocNo(d.doc_no),
      debit: 0,
      credit: 0,
      balance: 0,
      discount: num(d.amount),
      discountBase: num(d.base_amount),
    }));
}

/** İndirim sütunu hücresi; tutar yoksa null, yüzdede dayanak yoksa null. */
export function discountCellValue(
  l: { type: string; discount?: number; discountBase?: number },
  mode: DiscountMode,
): { kind: 'amount' | 'percent'; value: number } | null {
  const d = num(l.discount);
  if (d <= 0) return null;
  if (mode === 'amount') return { kind: 'amount', value: d };
  const base = num(l.discountBase);
  if (base <= 0) return null;
  return { kind: 'percent', value: round1((d / base) * 100) };
}

export function hasAnyDiscount(lines: ReadonlyArray<{ discount?: number }>): boolean {
  return lines.some(l => num(l.discount) > 0);
}

/** Yalnız indirim satırlarının toplamı (faturadaki bilgi tutarı sayılmaz). */
export function discountTotal(lines: ReadonlyArray<{ type?: string; discount?: number }>): number {
  let t = 0;
  for (const l of lines) if (l.type === 'discount') t += num(l.discount);
  return Math.round(t * 100) / 100;
}
