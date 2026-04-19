import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../../../lib/supabase';

interface Movement {
  id: string;
  item_name: string;
  type: 'IN' | 'OUT' | 'WASTE';
  quantity: number;
  unit?: string;
  note?: string;
  created_at: string;
}

const TYPE_CFG = {
  IN:    { label: 'Giriş',   color: '#059669', bg: '#D1FAE5', icon: 'arrow-down-circle-outline' },
  OUT:   { label: 'Çıkış',   color: '#2563EB', bg: '#DBEAFE', icon: 'arrow-up-circle-outline'   },
  WASTE: { label: 'Fire',    color: '#DC2626', bg: '#FEE2E2', icon: 'alert-circle-outline'       },
} as const;

function TypeBadge({ type }: { type: Movement['type'] }) {
  const c = TYPE_CFG[type] ?? TYPE_CFG.OUT;
  return (
    <View style={[b.pill, { backgroundColor: c.bg }]}>
      <MaterialCommunityIcons name={c.icon as any} size={13} color={c.color} />
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
        .select('id, item_name, type, quantity, unit, note, created_at')
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
            <MaterialCommunityIcons name="database-off-outline" size={40} color="#94A3B8" />
          </View>
          <Text style={s.emptyTitle}>Tablo bulunamadı</Text>
          <Text style={s.emptySub}>Supabase'de "stock_movements" tablosu oluşturulduğunda hareketler burada görünür.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <MaterialCommunityIcons name="swap-horizontal" size={40} color="#94A3B8" />
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

            if (isDesktop) {
              return (
                <View style={[s.row, !isLast && s.rowBorder]}>
                  <View style={[s.typeAccent, { backgroundColor: cfg.color }]} />
                  <View style={{ flex: 3, paddingLeft: 16 }}>
                    <Text style={s.rowName} numberOfLines={1}>{item.item_name}</Text>
                    {item.note && <Text style={s.rowNote} numberOfLines={1}>{item.note}</Text>}
                  </View>
                  <View style={{ flex: 1.5 }}>
                    <TypeBadge type={item.type} />
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={[s.rowQty, { color: cfg.color }]}>
                      {item.type === 'IN' ? '+' : '-'}{item.quantity}
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
              <View style={s.card}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName} numberOfLines={1}>{item.item_name}</Text>
                    {item.note && <Text style={s.rowNote}>{item.note}</Text>}
                  </View>
                  <TypeBadge type={item.type} />
                </View>
                <View style={s.cardBottom}>
                  <Text style={[s.rowQty, { color: cfg.color }]}>
                    {item.type === 'IN' ? '+' : '-'}{item.quantity}{item.unit ? ` ${item.unit}` : ''}
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
  safe:   { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },

  tableHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 8, backgroundColor: '#FAFBFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  th:        { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6 },

  list: { paddingBottom: 40 },

  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, backgroundColor: '#FFFFFF' },
  rowBorder:  { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  typeAccent: { width: 3, position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  rowName:    { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  rowNote:    { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  rowQty:     { fontSize: 15, fontWeight: '700' },
  rowUnit:    { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  rowDate:    { fontSize: 12, color: '#94A3B8' },

  card:       { marginHorizontal: 16, marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', padding: 14 },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  emptyIcon:  { width: 80, height: 80, borderRadius: 20, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  emptySub:   { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
});
