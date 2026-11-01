/**
 * Giderler ekranı ile mobil gider tablosunun ortak görüntü yardımcıları.
 *
 * NEDEN ayrı dosya: ExpensesScreen bir lazyRoute hedefi; bileşenler (ve dev demo)
 * ondan bir şey içe aktarırsa ekran ana pakete çekilir (#130). Ortak parçalar burada.
 */
import type React from 'react';
import { Platform } from 'react-native';
import { localeTag } from '../../../core/i18n';
import { formatMoney, type Currency } from '../../../core/money/currency';
import {
  Package, Building, Users, Wrench, Receipt, MoreHorizontal, Truck,
  Banknote, CreditCard, Landmark, FileText, CircleDot,
} from '../../../core/ui/icons';
import type { ExpenseCategory, ExpensePaymentMethod } from '../api';

// ── Category → Lucide icon mapping ──────────────────────────────────
export const CAT_ICON: Record<ExpenseCategory, React.ComponentType<any>> = {
  malzeme:  Package,
  kira:     Building,
  personel: Users,
  ekipman:  Wrench,
  vergi:    Receipt,
  kurye:    Truck,
  diger:    MoreHorizontal,
};

export const PAY_METHODS: { v: ExpensePaymentMethod; l: string; icon: React.ComponentType<any> }[] = [
  { v: 'nakit',  l: 'Nakit',  icon: Banknote },
  { v: 'kart',   l: 'Kart',   icon: CreditCard },
  { v: 'havale', l: 'Havale', icon: Landmark },
  { v: 'cek',    l: 'Çek',    icon: FileText },
  { v: 'diger',  l: 'Diğer',  icon: CircleDot },
];

// Katı per-currency: tutar KENDİ para biriminde.
export function fmtMoney(n: number | string | null | undefined, currency: string = 'TRY'): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  return formatMoney(Number(v) || 0, (currency as Currency), { fractionDigits: 2 });
}
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Pressable satır stili — fonksiyon-stil YALNIZ web'de verilir.
 *
 * NEDEN: fonksiyon-stilli (`style={({hovered}) => …}`) bir Pressable iOS'ta
 * satır layout'unu düşürüyor — ikon üstte, tutar tam genişlikte kalıyor.
 * Web'de hover geri bildirimi aynen korunur; native'de basılmamış hâlin
 * düz nesnesi verilir.
 */
export function rowStyle(fn: (state: any) => any): any {
  return Platform.OS === 'web' ? fn : fn({ hovered: false, pressed: false });
}
