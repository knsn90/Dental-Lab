// MaterialForecastSection — sipariş için tahmini materyal tüketimi.
// Üretim başlamadan/sürerken hangi materyalden ne kadar gerekli ve stok yeterli mi gösterir.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { AppIcon } from '../../../core/ui/AppIcon';
import { STAGE_LABEL, STAGE_COLOR, type Stage } from '../stages';

interface ForecastRow {
  item_id:          string;
  name:             string;
  type:             string | null;
  consume_at_stage: string;
  units_per_tooth:  number;
  tooth_count:      number;
  qty_needed:       number;
  unit:             string | null;
  current_stock:    number;
  min_stock:        number;
  unit_cost:        number;
  estimated_cost:   number;
  sufficient:       boolean;
  already_consumed: boolean;
}

interface Props {
  workOrderId: string;
}

export function MaterialForecastSection({ workOrderId }: Props) {
  const [rows, setRows]       = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.rpc('forecast_order_materials', {
        p_work_order_id: workOrderId,
      });
      if (!cancelled) {
        setRows((data ?? []) as ForecastRow[]);
        setLoading(false);
      }
    })();
    // Realtime: stock_items veya order değişince yenile
    const channel = supabase
      .channel(`order_forecast_${workOrderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_items' }, async () => {
        const { data } = await supabase.rpc('forecast_order_materials', { p_work_order_id: workOrderId });
        if (!cancelled) setRows((data ?? []) as ForecastRow[]);
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  if (loading) {
    return (
      <View style={s.card}>
        <ActivityIndicator size="small" color="#94A3B8" />
      </View>
    );
  }

  // Hiç eşleşen materyal yoksa hiç render etme — boş kart spam etmesin
  if (rows.length === 0) return null;

  const totalCost = rows.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0);
  const hasShort  = rows.some(r => !r.sufficient && !r.already_consumed);

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.iconWrap}>
          <AppIcon name="package" size={14} color="#0284C7" />
        </View>
        <Text style={s.title}>Tahmini Materyal Tüketimi</Text>
        {hasShort && (
          <View style={s.shortBadge}>
            <Text style={s.shortBadgeText}>STOK YETERSİZ</Text>
          </View>
        )}
        {totalCost > 0 && (
          <Text style={s.totalCost}>~{totalCost.toLocaleString('tr-TR')} ₺</Text>
        )}
      </View>

      <View style={s.list}>
        {rows.map((row, i) => {
          const stage     = row.consume_at_stage as Stage;
          const stageColor= STAGE_COLOR[stage] ?? '#64748B';
          const stageLbl  = STAGE_LABEL[stage] ?? stage;
          const isLast    = i === rows.length - 1;
          const sufficient= row.sufficient;
          const consumed  = row.already_consumed;

          return (
            <View key={row.item_id} style={[s.row, !isLast && s.rowDivider]}>
              {/* Stage pill */}
              <View style={[s.stagePill, { backgroundColor: stageColor + '14', borderColor: stageColor + '33' }]}>
                <Text style={[s.stagePillText, { color: stageColor }]}>{stageLbl}</Text>
              </View>

              <View style={s.body}>
                <Text style={s.name} numberOfLines={1}>{row.name}</Text>
                <Text style={s.formula} numberOfLines={1}>
                  {row.tooth_count} diş × {row.units_per_tooth} = <Text style={s.formulaStrong}>{row.qty_needed}</Text>
                  {row.unit ? <Text style={s.unitText}> {row.unit}</Text> : null}
                  {' '}· stok: {row.current_stock}
                  {row.estimated_cost > 0 ? `  ·  ~${row.estimated_cost.toLocaleString('tr-TR')} ₺` : ''}
                </Text>
              </View>

              {/* Status */}
              <View style={[
                s.statusPill,
                consumed   ? s.consumedPill :
                sufficient ? s.okPill : s.shortPill,
              ]}>
                <Text style={[
                  s.statusText,
                  consumed   ? s.consumedText :
                  sufficient ? s.okText : s.shortText,
                ]}>
                  {consumed ? '✓ Tüketildi' : sufficient ? 'Stok OK' : '⚠ Eksik'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const SHADOW = Platform.select({
  web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
});

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    padding: 14,
    gap: 12,
    ...SHADOW,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: '#E0F2FE',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  shortBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
    borderWidth: 1, borderColor: '#FCA5A5',
  },
  shortBadgeText: { fontSize: 9, fontWeight: '800', color: '#DC2626', letterSpacing: 0.4 },
  totalCost: { fontSize: 12, fontWeight: '700', color: '#475569' },

  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },

  stagePill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  stagePillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  formula: { fontSize: 11, color: '#64748B' },
  formulaStrong: { color: '#0F172A', fontWeight: '800' },
  unitText: { color: '#94A3B8' },

  statusPill: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },

  okPill:    { backgroundColor: '#ECFDF5' },
  okText:    { color: '#059669' },
  shortPill: { backgroundColor: '#FEE2E2' },
  shortText: { color: '#DC2626' },
  consumedPill: { backgroundColor: '#F1F5F9' },
  consumedText: { color: '#64748B' },
});
