/**
 * Faturalar listesi ile mobil fatura tablosunun ortak görüntü yardımcıları.
 *
 * NEDEN ayrı dosya: InvoicesListScreen bir lazyRoute hedefi; bileşenler (ve dev demo)
 * ondan bir şey içe aktarırsa ekran ana pakete çekilir (#130). Ortak parçalar burada.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { useInkUI, type InkUI } from '../../../core/theme/inkScale';
import type { InvoiceStatus, Invoice } from '../types';

// cardSolid / CHIP_TONES / STATUS_CHIP artık `useInkUI()`ten türetilir — modül
// seviyesindeki sabitler hook çağıramadığı için koyu temada beyaz kalıyorlardı.
export function chipTones(U: InkUI) {
  const t = U.chipTones;
  return {
    success: { bg: t.success.bg, text: t.success.fg },
    warning: { bg: t.warning.bg, text: t.warning.fg },
    danger:  { bg: t.danger.bg,  text: t.danger.fg },
    info:    { bg: t.info.bg,    text: t.info.fg },
    neutral: { bg: U.ink[100],   text: U.ink[500] },
  };
}

export function statusChip(U: InkUI): Record<InvoiceStatus, { bg: string; text: string }> {
  const C = chipTones(U);
  return {
    taslak:       C.neutral,
    kesildi:      C.info,
    kismi_odendi: C.warning,
    odendi:       C.success,
    iptal:        C.danger,
  };
}

export function fmtMoney(n: number | string | null | undefined, currency = 'TRY'): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  const sym = CURRENCY_META[currency as Currency]?.symbol ?? '₺';
  return sym + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── e-Fatura rozeti — iç "Kesildi" durumu ile resmi e-faturayı ayırt eder ───
export function EFaturaBadge({ invoice }: { invoice: Invoice }) {
  const U = useInkUI();
  if (!invoice.efatura_uuid) return null;
  const st = invoice.efatura_status ?? 'sent';
  const tone = st === 'accepted' ? U.chipTones.success
    : st === 'sent' || st === 'queued' ? U.chipTones.info
    : st === 'cancelled' ? U.chipTones.neutral : U.chipTones.danger;
  const label = st === 'accepted' ? 'e-Fatura · kabul'
    : st === 'sent' || st === 'queued' ? 'e-Fatura · gönderildi'
    : st === 'cancelled' ? 'e-Fatura · iptal'
    : st === 'rejected' ? 'e-Fatura · red' : 'e-Fatura · hata';
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tone.bg }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: tone.fg }}>{autoT(label)}</Text>
    </View>
  );
}
