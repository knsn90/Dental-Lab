/**
 * SupplierMobileTable — Tedarikçiler mobil listesi (MobileTableX kalıbı).
 *
 * Kullanıcı: "tedarikçiler sayfasını da aynı şekilde" (ekstre / giderler / faturalar tablosu).
 * Solda firma + kategori/iletişim + son hareket; sağda bakiye (kendi para biriminde),
 * Borç/Alacak etiketi ve düzenle / sil düğmeleri.
 */
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { Building2, Pencil, Trash2 } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { MobileTableX, MobileTableRowX, MobileTableIconX, useMobileTableText } from '../../../core/ui/MobileTableX';
import { CATEGORY_LABELS, balanceColor, type Supplier, type SupplierBalance } from '../api';

export function SupplierMobileTable({ suppliers, balanceMap, baseCurrency, onOpen, onEdit, onRemove }: {
  suppliers: Supplier[];
  balanceMap: Record<string, SupplierBalance>;
  baseCurrency: string;
  onOpen: (s: Supplier) => void;
  onEdit: (s: Supplier) => void;
  /** Bakiyesi/geçmişi varsa pasife alır, yoksa siler (onay ekranın kendisinde) */
  onRemove: (s: Supplier) => void;
}) {
  const U = useInkUI();
  const T = useMobileTableText();

  return (
    <MobileTableX title="Tedarikçiler" count={suppliers.length} countLabel="kayıt">
      {suppliers.map((s, i) => {
        const bal = balanceMap[s.id];
        const tone = bal ? balanceColor(Number(bal.balance_account)) : 'zero';
        // Katı per-currency: tedarikçi kendi hesap para biriminde
        const balCur = (s.default_currency || baseCurrency) as Currency;
        const balanceText = formatMoney(Math.abs(Number(bal?.balance_account) || 0), balCur, { fractionDigits: 0 });
        const lastDate = bal?.last_transaction_date
          ? new Date(bal.last_transaction_date).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' })
          : null;
        const toneColor = tone === 'debt' ? U.chipTones.danger.fg : tone === 'credit' ? U.chipTones.success.fg : U.ink[400];
        const toneLabel = tone === 'debt' ? 'Borç' : tone === 'credit' ? 'Alacak' : 'Eşit';
        const sub = [
          CATEGORY_LABELS[s.category] ? autoT(CATEGORY_LABELS[s.category]) : null,
          s.default_currency !== baseCurrency ? s.default_currency : null,
          s.contact_person || null,
          s.phone || null,
        ].filter(Boolean).join(' · ');

        return (
          <MobileTableRowX key={s.id} isLast={i === suppliers.length - 1} onPress={() => onOpen(s)}>
            <MobileTableIconX icon={Building2} />

            <View style={{ flex: 1, minWidth: 0, opacity: s.is_active ? 1 : 0.6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[T.title, { flexShrink: 1 }]} numberOfLines={1}>{s.name}</Text>
                {!s.is_active && (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: U.chipNeutral }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: U.ink[500] }}>Pasif</Text>
                  </View>
                )}
              </View>
              {sub ? <Text style={T.sub} numberOfLines={1}>{sub}</Text> : null}
              <Text style={[T.meta, { marginTop: 2 }]} numberOfLines={1}>
                {lastDate ?? autoT('Henüz hareket yok')}
                {bal && bal.purchase_count > 0 ? <Text> · {bal.purchase_count} alış</Text> : null}
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[T.amount, { color: tone === 'zero' ? U.ink[400] : toneColor }]}>
                  {tone === 'zero' ? '—' : balanceText}
                </Text>
                {tone !== 'zero' ? (
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', color: toneColor, marginTop: 1 }}>{toneLabel}</Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <GlassTooltip title={autoT('Düzenle')} text={autoT('Firma bilgilerini düzenle')}>
                  <Pressable
                    onPress={(e: any) => { e?.stopPropagation?.(); onEdit(s); }}
                    style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipNeutral, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                  >
                    <Pencil size={12} color={U.ink[500]} strokeWidth={1.8} />
                  </Pressable>
                </GlassTooltip>
                <GlassTooltip title={autoT('Sil')} text={autoT('Firmayı sil veya pasife al')}>
                  <Pressable
                    onPress={(e: any) => { e?.stopPropagation?.(); onRemove(s); }}
                    style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.danger.bg, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                  >
                    <Trash2 size={12} color={U.chipTones.danger.fg} strokeWidth={1.8} />
                  </Pressable>
                </GlassTooltip>
              </View>
            </View>
          </MobileTableRowX>
        );
      })}
    </MobileTableX>
  );
}
