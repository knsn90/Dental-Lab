// UsedMaterialsSection — sipariş materyal hareketleri (OUT + reversed IN'ler).
// list_order_materials RPC'si üzerinden çekilir; her stage geçişinde audit kaydı birikir.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { AppIcon } from '../../../core/ui/AppIcon';

interface MovementRow {
  movement_id:   string;
  item_id:       string | null;
  name:          string;
  type:          string | null;       // material type (zirconia/...)
  movement_type: 'OUT' | 'IN';
  quantity:      number;
  unit:          string | null;
  source:        string;              // production / rework_return / manual / ...
  stage:         string | null;
  is_reversed:   boolean;
  reference_id:  string | null;
  created_at:    string;
  note:          string | null;
}

interface Props {
  workOrderId: string;
}

export function UsedMaterialsSection({ workOrderId }: Props) {
  const [rows, setRows]       = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase.rpc('list_order_materials', {
        p_work_order_id: workOrderId,
      });
      if (cancelled) return;
      if (!error && data) setRows(data as MovementRow[]);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel(`order_materials_${workOrderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements', filter: `order_id=eq.${workOrderId}` },
        () => load(),
      )
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

  if (rows.length === 0) {
    return (
      <View style={s.card}>
        <View style={s.header}>
          <View style={s.iconWrap}>
            <AppIcon name="package" size={14} color="#7C3AED" />
          </View>
          <Text style={s.title}>Materyal Hareketleri</Text>
        </View>
        <Text style={s.empty}>
          Henüz materyal tüketimi/iadesi yok. Üretim aşamaları tamamlandıkça otomatik listelenecek.
        </Text>
      </View>
    );
  }

  // Compute net consumption (active OUT - all IN reversal)
  const activeOuts = rows.filter(r => r.movement_type === 'OUT' && !r.is_reversed);
  const reversals  = rows.filter(r => r.movement_type === 'IN');

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.iconWrap}>
          <AppIcon name="package" size={14} color="#7C3AED" />
        </View>
        <Text style={s.title}>Materyal Hareketleri</Text>
        <View style={s.count}>
          <Text style={s.countText}>
            {activeOuts.length} aktif
            {reversals.length > 0 ? ` · ${reversals.length} iade` : ''}
          </Text>
        </View>
      </View>

      <View style={s.list}>
        {rows.map((row, i) => {
          const isLast = i === rows.length - 1;
          const isOut      = row.movement_type === 'OUT';
          const isIn       = row.movement_type === 'IN';
          const isReversed = isOut && row.is_reversed;
          const isReturn   = isIn && row.source === 'rework_return';

          const date = new Date(row.created_at);
          const dotColor =
            isReversed ? '#94A3B8' :       // soluk gri (iade edilmiş)
            isReturn   ? '#16A34A' :       // yeşil (iade)
            isOut      ? '#7C3AED' :       // mor (aktif tüketim)
            '#94A3B8';

          const sign     = isOut ? '−' : '+';
          const amtColor =
            isReversed ? '#94A3B8' :
            isReturn   ? '#059669' :
            '#DC2626';

          return (
            <View key={row.movement_id} style={[s.row, !isLast && s.rowDivider]}>
              <View style={[s.rowDot, { backgroundColor: dotColor }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.rowHead}>
                  <Text
                    style={[
                      s.rowName,
                      isReversed && { textDecorationLine: 'line-through', color: '#94A3B8' },
                    ]}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  {row.stage && (
                    <View style={s.stagePill}>
                      <Text style={s.stagePillText}>{row.stage}</Text>
                    </View>
                  )}
                  {isReversed && (
                    <View style={s.reversedTag}>
                      <Text style={s.reversedTagText}>İADE EDİLDİ</Text>
                    </View>
                  )}
                  {isReturn && (
                    <View style={s.returnTag}>
                      <Text style={s.returnTagText}>↺ İADE</Text>
                    </View>
                  )}
                </View>
                <Text style={s.rowMeta} numberOfLines={1}>
                  {date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {isReturn ? ' · Stoğa iade' : isOut ? ' · Tüketim' : ''}
                  {row.source && row.source !== 'production' && row.source !== 'rework_return' ? ` · ${row.source}` : ''}
                </Text>
              </View>
              <Text
                style={[
                  s.rowQty,
                  { color: amtColor },
                  isReversed && { textDecorationLine: 'line-through' },
                ]}
              >
                {sign}{row.quantity}
                {row.unit ? <Text style={[s.rowQtyUnit, { color: amtColor }]}> {row.unit}</Text> : null}
              </Text>
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
    backgroundColor: '#EDE9FE',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  count: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  countText: { fontSize: 11, fontWeight: '800', color: '#475569' },

  empty: { fontSize: 12, color: '#94A3B8', lineHeight: 17, paddingVertical: 4 },

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
  rowDot: { width: 6, height: 6, borderRadius: 3 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  stagePill: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999, backgroundColor: '#F1F5F9',
  },
  stagePillText: { fontSize: 9, fontWeight: '800', color: '#475569', letterSpacing: 0.4 },
  reversedTag: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999, backgroundColor: '#F1F5F9',
    borderWidth: 1, borderColor: '#E5E5EA',
  },
  reversedTagText: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.4 },
  returnTag: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999, backgroundColor: '#ECFDF5',
    borderWidth: 1, borderColor: '#86EFAC',
  },
  returnTagText: { fontSize: 9, fontWeight: '800', color: '#047857', letterSpacing: 0.4 },
  rowMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  rowQty:     { fontSize: 14, fontWeight: '800', flexShrink: 0 },
  rowQtyUnit: { fontSize: 11, fontWeight: '600' },
});
