// OrderCostSection — sipariş Mali Bilgi: satış fiyatı, maliyet, kar, marj.
//   • Sale price inline edit (manager only)
//   • Profit + margin renk kodlu (yeşil >20% / sarı <20% / kırmızı <0)
//   • Material breakdown (snapshot fiyatlarla)
//   • Future placeholders: labor, overhead

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, TextInput, TouchableOpacity } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';

interface CostRow {
  item_id:    string;
  name:       string;
  type:       string | null;
  quantity:   number;
  unit:       string | null;
  unit_cost:  number;
  line_cost:  number;
}

interface LaborRow {
  stage_log_id:  string;
  stage:         string;
  owner_id:      string | null;
  owner_name:    string | null;
  hourly_rate:   number;
  start_time:    string;
  end_time:      string | null;
  duration_min:  number | null;
  labor_cost:    number;
  reworked:      boolean;
}

interface ProfitData {
  sale_price:      number;
  discount_amount: number;
  net_revenue:     number;
  material_cost:   number;
  labor_cost:      number;
  overhead_cost:   number;
  total_cost:      number;
  profit:          number;
  margin_pct:      number | null;
}

interface Props {
  workOrderId:    string;
  isManager?:     boolean;            // sale_price edit yetkisi
  cachedTotal?:   number | null;
}

const fmt = (n: number) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function OrderCostSection({ workOrderId, isManager = false, cachedTotal }: Props) {
  const [rows, setRows]       = useState<CostRow[]>([]);
  const [labor, setLabor]     = useState<LaborRow[]>([]);
  const [profit, setProfit]   = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput]     = useState('');
  const [savingPrice, setSavingPrice]   = useState(false);

  async function loadAll() {
    const [{ data: rowData }, { data: profitData }, { data: laborData }] = await Promise.all([
      supabase.rpc('calculate_order_cost',   { p_work_order_id: workOrderId }),
      supabase.rpc('calculate_order_profit', { p_work_order_id: workOrderId }),
      supabase.rpc('list_order_labor',       { p_work_order_id: workOrderId }),
    ]);
    setRows((rowData ?? []) as CostRow[]);
    setLabor((laborData ?? []) as LaborRow[]);
    const p = (profitData?.[0] ?? null) as ProfitData | null;
    setProfit(p);
    setPriceInput(p?.sale_price ? String(p.sale_price) : '');
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAll().catch(() => {});
    const channel = supabase
      .channel(`order_cost_${workOrderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements', filter: `order_id=eq.${workOrderId}` },
        () => { if (!cancelled) loadAll(); },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'work_orders', filter: `id=eq.${workOrderId}` },
        () => { if (!cancelled) loadAll(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_log', filter: `work_order_id=eq.${workOrderId}` },
        () => { if (!cancelled) loadAll(); },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  async function handleSavePrice() {
    const n = parseFloat(priceInput.replace(',', '.'));
    if (isNaN(n) || n < 0) {
      toast.error('Geçerli bir tutar girin');
      return;
    }
    setSavingPrice(true);
    const { error } = await supabase
      .from('work_orders')
      .update({ sale_price: n })
      .eq('id', workOrderId);
    setSavingPrice(false);
    if (error) { toast.error('Kayıt: ' + error.message); return; }
    setEditingPrice(false);
    toast.success('Fiyat güncellendi');
    loadAll();
  }

  if (loading) {
    return (
      <View style={s.card}>
        <ActivityIndicator size="small" color="#94A3B8" />
      </View>
    );
  }

  // Profit color
  const margin = profit?.margin_pct ?? null;
  const profitVal = profit?.profit ?? 0;
  const profitColor =
    profitVal < 0           ? '#DC2626' :
    margin !== null && margin < 20 ? '#D97706' :
    '#059669';
  const profitBg =
    profitVal < 0           ? '#FEE2E2' :
    margin !== null && margin < 20 ? '#FEF3C7' :
    '#ECFDF5';

  const hasPrice = (profit?.sale_price ?? 0) > 0;

  return (
    <View style={s.card}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.iconWrap}>
          <AppIcon name="receipt" size={14} color="#059669" />
        </View>
        <Text style={s.title}>Mali Bilgi</Text>
        {hasPrice && (
          <View style={[s.profitBadge, { backgroundColor: profitBg }]}>
            <Text style={[s.profitBadgeText, { color: profitColor }]}>
              {profitVal >= 0 ? '+' : ''}{fmt(profitVal)} ₺
              {margin !== null ? `  ·  %${margin}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── Financial summary ──────────────────────────────────────────── */}
      <View style={s.summaryGrid}>
        {/* Sale price — editable for manager */}
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Satış Fiyatı</Text>
          {editingPrice ? (
            <View style={s.priceEditRow}>
              <TextInput
                value={priceInput}
                onChangeText={setPriceInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#CBD5E1"
                autoFocus
                style={s.priceInput as any}
              />
              <Text style={s.priceCurrency}>₺</Text>
              <TouchableOpacity
                onPress={handleSavePrice}
                disabled={savingPrice}
                style={[s.priceBtn, s.priceBtnPrimary, savingPrice && { opacity: 0.5 }]}
              >
                {savingPrice
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={s.priceBtnTextPrimary}>Kaydet</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEditingPrice(false); setPriceInput(profit?.sale_price ? String(profit.sale_price) : ''); }} style={s.priceBtn}>
                <AppIcon name="x" size={14} color="#64748B" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => isManager && setEditingPrice(true)}
              disabled={!isManager}
              style={s.priceDisplay}
              activeOpacity={isManager ? 0.7 : 1}
            >
              <Text style={[s.summaryValue, !hasPrice && { color: '#CBD5E1' }]}>
                {hasPrice ? `${fmt(profit!.sale_price)} ₺` : 'Belirsiz'}
              </Text>
              {isManager && (
                <AppIcon name="edit-2" size={11} color="#94A3B8" />
              )}
            </TouchableOpacity>
          )}
        </View>

        {(profit?.discount_amount ?? 0) > 0 && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>İndirim</Text>
            <Text style={s.summaryValueMuted}>−{fmt(profit!.discount_amount)} ₺</Text>
          </View>
        )}

        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Materyal Maliyeti</Text>
          <Text style={s.summaryValue}>{fmt(profit?.material_cost ?? 0)} ₺</Text>
        </View>

        <View style={s.summaryRow}>
          <Text style={(profit?.labor_cost ?? 0) > 0 ? s.summaryLabel : s.summaryLabelMuted}>
            İşçilik
          </Text>
          <Text style={(profit?.labor_cost ?? 0) > 0 ? s.summaryValue : s.summaryValueMuted}>
            {(profit?.labor_cost ?? 0) > 0 ? `${fmt(profit!.labor_cost)} ₺` : '—'}
          </Text>
        </View>

        <View style={s.summaryRow}>
          <Text style={(profit?.overhead_cost ?? 0) > 0 ? s.summaryLabel : s.summaryLabelMuted}>
            Genel Gider
          </Text>
          <Text style={(profit?.overhead_cost ?? 0) > 0 ? s.summaryValue : s.summaryValueMuted}>
            {(profit?.overhead_cost ?? 0) > 0 ? `${fmt(profit!.overhead_cost)} ₺` : '—'}
          </Text>
        </View>

        <View style={s.divider} />

        {hasPrice ? (
          <>
            <View style={s.summaryRow}>
              <Text style={s.totalLabel}>KAR</Text>
              <Text style={[s.totalValue, { color: profitColor }]}>
                {profitVal >= 0 ? '' : '−'}{fmt(Math.abs(profitVal))} ₺
              </Text>
            </View>
            {margin !== null && (
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Marj</Text>
                <Text style={[s.summaryValue, { color: profitColor, fontWeight: '800' }]}>
                  %{margin}
                </Text>
              </View>
            )}
          </>
        ) : (
          <Text style={s.hint}>
            {isManager
              ? '💡 Satış fiyatı girin, kar ve marj otomatik hesaplansın.'
              : '— Satış fiyatı henüz belirlenmedi.'}
          </Text>
        )}
      </View>

      {/* ── Material breakdown ────────────────────────────────────────── */}
      {rows.length > 0 && (
        <View style={s.breakdownBox}>
          <Text style={s.breakdownTitle}>MATERYAL DAĞILIMI</Text>
          <View style={s.list}>
            {rows.map((row, i) => {
              const isLast = i === rows.length - 1;
              return (
                <View key={row.item_id} style={[s.row, !isLast && s.rowDivider]}>
                  <View style={[s.dot, { backgroundColor: row.type ? typeColor(row.type) : '#94A3B8' }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rowName} numberOfLines={1}>{row.name}</Text>
                    <Text style={s.rowMeta} numberOfLines={1}>
                      {fmt(row.quantity)}{row.unit ? ` ${row.unit}` : ''} × {fmt(row.unit_cost)} ₺
                    </Text>
                  </View>
                  <Text style={s.rowAmount}>
                    {fmt(row.line_cost)} <Text style={s.rowCurrency}>₺</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Labor breakdown ───────────────────────────────────────────── */}
      {labor.filter(l => l.labor_cost > 0).length > 0 && (
        <View style={s.breakdownBox}>
          <Text style={s.breakdownTitle}>İŞÇİLİK DAĞILIMI</Text>
          <View style={s.list}>
            {labor.filter(l => l.labor_cost > 0 || l.duration_min !== null).map((row, i, arr) => {
              const isLast = i === arr.length - 1;
              const dur    = row.duration_min ?? 0;
              const h      = Math.floor(dur / 60);
              const m      = Math.round(dur % 60);
              const durStr = h > 0 ? `${h}s ${m}dk` : `${m}dk`;
              return (
                <View key={row.stage_log_id} style={[s.row, !isLast && s.rowDivider, row.reworked && { opacity: 0.55 }]}>
                  <View style={[s.dot, { backgroundColor: '#0284C7' }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rowName} numberOfLines={1}>
                      {row.stage}
                      {row.reworked && <Text style={{ color: '#DC2626', fontWeight: '700' }}>  · reworked</Text>}
                    </Text>
                    <Text style={s.rowMeta} numberOfLines={1}>
                      {row.owner_name ?? 'Atanmadı'} · {durStr}
                      {row.hourly_rate > 0 ? ` × ${fmt(row.hourly_rate)} ₺/sa` : ''}
                    </Text>
                  </View>
                  <Text style={s.rowAmount}>
                    {fmt(row.labor_cost)} <Text style={s.rowCurrency}>₺</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function typeColor(t: string): string {
  const k = t.toLowerCase();
  if (k.includes('zircon')) return '#7C3AED';
  if (k.includes('emax'))   return '#DB2777';
  if (k.includes('pmma'))   return '#0891B2';
  if (k.includes('metal'))  return '#475569';
  if (k.includes('glaze'))  return '#D97706';
  return '#64748B';
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
    backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  profitBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  profitBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: -0.1 },

  // Summary
  summaryGrid: { gap: 6 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel:      { fontSize: 13, color: '#475569', fontWeight: '600' },
  summaryLabelMuted: { fontSize: 13, color: '#94A3B8', fontWeight: '500', fontStyle: 'italic' },
  summaryValue:      { fontSize: 14, color: '#0F172A', fontWeight: '700' },
  summaryValueMuted: { fontSize: 13, color: '#CBD5E1', fontWeight: '600' },

  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 4 },

  totalLabel: { fontSize: 11, fontWeight: '800', color: '#0F172A', letterSpacing: 0.6 },
  totalValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },

  hint: { fontSize: 11, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 4 },

  // Sale price edit
  priceDisplay: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceInput: {
    width: 100,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2563EB',
    borderRadius: 8,
    fontSize: 13, fontWeight: '700', color: '#0F172A',
    backgroundColor: '#FFFFFF',
    outlineStyle: 'none',
  } as any,
  priceCurrency: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  priceBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  priceBtnPrimary: { backgroundColor: '#2563EB' },
  priceBtnTextPrimary: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },

  // Breakdown box
  breakdownBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  breakdownTitle: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8 },
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowName: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  rowMeta: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  rowAmount: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  rowCurrency: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
});
