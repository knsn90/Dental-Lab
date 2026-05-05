import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, useWindowDimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../core/api/supabase';

import { AppIcon } from '../../../core/ui/AppIcon';

interface Movement {
  id: string;
  item_name: string;
  type: 'IN' | 'OUT' | 'WASTE' | 'ADJUST';
  quantity: number;
  unit?: string;
  note?: string;
  source?: string | null;
  stage?: string | null;
  is_reversed?: boolean;
  user?: { full_name: string } | null;
  created_at: string;
}

const TYPE_CFG = {
  IN:     { label: 'Giriş',  color: '#059669', bg: '#D1FAE5', icon: 'arrow-down-circle-outline' },
  OUT:    { label: 'Çıkış',  color: '#2563EB', bg: '#DBEAFE', icon: 'arrow-up-circle-outline'   },
  WASTE:  { label: 'Fire',   color: '#DC2626', bg: '#FEE2E2', icon: 'alert-circle-outline'      },
  ADJUST: { label: 'Düzelt', color: '#7C3AED', bg: '#EDE9FE', icon: 'tune-variant'              },
} as const;

function TypeBadge({ type }: { type: Movement['type'] }) {
  const c = TYPE_CFG[type] ?? TYPE_CFG.OUT;
  return (
    <View style={[b.pill, { backgroundColor: c.bg }]}>
      <AppIcon name={c.icon as any} size={13} color={c.color} />
      <Text style={[b.text, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}
const b = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  text: { fontSize: 12, fontWeight: '600' },
});

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function StockMovementsScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [items, setItems]       = useState<Movement[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [tableExists, setTableExists] = useState(true);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefresh(true); else setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, item_name, type, quantity, unit, note, source, stage, is_reversed, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setTableExists(false);
        }
        setItems([]);
      } else {
        setTableExists(true);
        setItems((data ?? []) as Movement[]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('stock_movements_screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>

      {/* Desktop table header */}
      {isDesktop && !loading && tableExists && items.length > 0 && (
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 3 }]}>ÜRÜN ADI</Text>
          <Text style={[s.th, { flex: 1.5 }]}>İŞLEM</Text>
          <Text style={[s.th, { flex: 1, textAlign: 'center' }]}>MİKTAR</Text>
          <Text style={[s.th, { flex: 2, textAlign: 'right' }]}>TARİH</Text>
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#0F172A" />
        </View>
      ) : !tableExists ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <AppIcon name="database-off-outline" size={40} color="#94A3B8" />
          </View>
          <Text style={s.emptyTitle}>Tablo bulunamadı</Text>
          <Text style={s.emptySub}>Supabase'de "stock_movements" tablosu oluşturulduğunda hareketler burada görünür.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <AppIcon name="swap-horizontal" size={40} color="#94A3B8" />
          </View>
          <Text style={s.emptyTitle}>Hareket kaydı yok</Text>
          <Text style={s.emptySub}>Henüz stok girişi, çıkışı veya fire kaydı eklenmemiş.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          renderItem={({ item, index }) => {
            const isLast = index === items.length - 1;
            const cfg = TYPE_CFG[item.type] ?? TYPE_CFG.OUT;

            const sign = item.type === 'IN' ? '+' : item.type === 'ADJUST' ? '±' : '−';

            if (isDesktop) {
              return (
                <View style={[s.row, !isLast && s.rowBorder, item.is_reversed && { opacity: 0.5 }]}>
                  <View style={[s.typeAccent, { backgroundColor: cfg.color }]} />
                  <View style={{ flex: 3, paddingLeft: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={[s.rowName, item.is_reversed && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
                        {item.item_name}
                      </Text>
                      {item.stage && (
                        <View style={s.tag}>
                          <Text style={s.tagText}>{item.stage}</Text>
                        </View>
                      )}
                      {item.is_reversed && (
                        <View style={[s.tag, { backgroundColor: '#F1F5F9' }]}>
                          <Text style={[s.tagText, { color: '#94A3B8' }]}>İADE EDİLDİ</Text>
                        </View>
                      )}
                      {item.source === 'rework_return' && (
                        <View style={[s.tag, { backgroundColor: '#ECFDF5' }]}>
                          <Text style={[s.tagText, { color: '#047857' }]}>↺ İADE</Text>
                        </View>
                      )}
                    </View>
                    {(item.note || item.source) && (
                      <Text style={s.rowNote} numberOfLines={1}>
                        {item.note ?? ''}
                        {item.source && item.source !== 'production' && item.source !== 'rework_return' && !item.note ? `Kaynak: ${item.source}` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1.5 }}>
                    <TypeBadge type={item.type} />
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={[s.rowQty, { color: cfg.color }]}>
                      {sign}{item.quantity}
                    </Text>
                    {item.unit && <Text style={s.rowUnit}>{item.unit}</Text>}
                  </View>
                  <Text style={[s.rowDate, { flex: 2, textAlign: 'right', paddingRight: 20 }]}>
                    {fmtDate(item.created_at)}
                  </Text>
                </View>
              );
            }

            // Mobile card
            return (
              <View style={[s.card, item.is_reversed && { opacity: 0.5 }]}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowName, item.is_reversed && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
                      {item.item_name}
                    </Text>
                    {(item.stage || item.is_reversed || item.source === 'rework_return') && (
                      <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {item.stage && <View style={s.tag}><Text style={s.tagText}>{item.stage}</Text></View>}
                        {item.is_reversed && <View style={[s.tag, { backgroundColor: '#F1F5F9' }]}><Text style={[s.tagText, { color: '#94A3B8' }]}>İADE EDİLDİ</Text></View>}
                        {item.source === 'rework_return' && <View style={[s.tag, { backgroundColor: '#ECFDF5' }]}><Text style={[s.tagText, { color: '#047857' }]}>↺ İADE</Text></View>}
                      </View>
                    )}
                    {item.note && <Text style={s.rowNote}>{item.note}</Text>}
                  </View>
                  <TypeBadge type={item.type} />
                </View>
                <View style={s.cardBottom}>
                  <Text style={[s.rowQty, { color: cfg.color }]}>
                    {sign}{item.quantity}{item.unit ? ` ${item.unit}` : ''}
                  </Text>
                  <Text style={s.rowDate}>{fmtDate(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F1F5F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },

  tableHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 16, paddingRight: 16, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', marginHorizontal: 16, marginTop: 12, ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } as any) : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }) },
  th:        { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6 },

  list: { paddingBottom: 40, paddingHorizontal: 16, paddingTop: 12 },
  listCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', overflow: 'hidden', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any) : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 }) },

  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', marginBottom: 8, ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } as any) : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }) },
  rowBorder:  {},
  typeAccent: { width: 3, position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  rowName:    { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  rowNote:    { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  rowQty:     { fontSize: 15, fontWeight: '700' },
  rowUnit:    { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  rowDate:    { fontSize: 12, color: '#94A3B8' },

  card:       { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', padding: 14, backgroundColor: '#FFFFFF', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any) : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 }) },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  emptyIcon:  { width: 80, height: 80, borderRadius: 20, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  emptySub:   { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

  tag:        { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: '#F1F5F9' },
  tagText:    { fontSize: 9, fontWeight: '800', color: '#475569', letterSpacing: 0.4 },
});
