/**
 * ExpenseMobileTable — Giderler mobil tablosu.
 *
 * Kullanıcı: "mobilde giderler sayfasının tablosunu diğer tablolar gibi (ekstre gibi) yap".
 * Ekstre mobil tablosuyla aynı kalıp: tableCard + panel accent başlık şeridi,
 * hairline ayrımlı satırlar, surfaceSoft alt satırda kayıt sayısı + para birimi toplamları.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { MobileTableX, MobileTableRowX, MobileTableIconX, useMobileTableText } from '../../../core/ui/MobileTableX';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import type { CurrencyTotal } from '../../../core/money/aggregations';
import { Pencil, Trash2 } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { EXPENSE_CATEGORY_LABELS, type Expense } from '../api';
import { CAT_ICON, PAY_METHODS, fmtDate, fmtMoney } from '../lib/expenseDisplay';

export function ExpenseMobileTable({ rows, totals, accent, onOpen, onEdit, onDelete }: {
  rows: Expense[];
  totals: CurrencyTotal[];
  /** Başlık şeridi zemini — panel accent'i (masaüstü tablosuyla aynı) */
  accent: string;
  onOpen: (e: Expense) => void;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}) {
  const U = useInkUI();
  const T = useMobileTableText();

  return (
    <MobileTableX
      title="Gider Listesi" count={rows.length} countLabel="kayıt" accent={accent}
      footer={<>
        <Text style={T.footNote}>{rows.length} kayıt</Text>
        <View style={{ flex: 1 }} />
        <Text style={T.footLabel}>Toplam:</Text>
        <MoneyMultiX slices={totals} variant="inline" />
      </>}
    >

      {rows.map((e, i) => {
        const Icon = CAT_ICON[e.category];
        const method = PAY_METHODS.find(m => m.v === e.payment_method)?.l ?? e.payment_method;
        return (
          <MobileTableRowX key={e.id} isLast={i === rows.length - 1} onPress={() => onOpen(e)}>
            <MobileTableIconX icon={Icon} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={T.title} numberOfLines={1}>
                {e.description}
              </Text>
              <Text style={T.sub} numberOfLines={1}>
                {EXPENSE_CATEGORY_LABELS[e.category]}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Text style={T.meta}>{fmtDate(e.expense_date)}</Text>
                {method ? <Text style={{ fontSize: 10, color: U.ink[400] }}>{method}</Text> : null}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={T.amount}>
                {fmtMoney(e.amount, (e as any).currency ?? 'TRY')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <GlassTooltip title={autoT('Düzenle')} text={autoT('Gideri düzenle')}>
                  <Pressable
                    onPress={(ev: any) => { ev?.stopPropagation?.(); onEdit(e); }}
                    style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: U.chipNeutral, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                  >
                    <Pencil size={12} color={U.ink[500]} strokeWidth={1.8} />
                  </Pressable>
                </GlassTooltip>
                <GlassTooltip title={autoT('Sil')} text={autoT('Gideri sil')}>
                  <Pressable
                    onPress={(ev: any) => { ev?.stopPropagation?.(); onDelete(e); }}
                    style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: U.chipTones.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
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
