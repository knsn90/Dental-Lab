import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, RefreshControl, ScrollView, Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useClinicOrders } from '../../clinic/hooks/useClinicOrders';
import { isOrderOverdue, STATUS_CONFIG } from '../constants';
import { WorkOrderStatus } from '../../../lib/types';

const P  = '#0369A1';
const BG = '#F7F9FB';
const CLR = {
  red:    '#EF4444', redBg:    '#FEE2E2',
  amber:  '#F59E0B', amberBg:  '#FEF3C7',
  purple: '#7C3AED', purpleBg: '#EDE9FE',
};

function dateLabel(deliveryDate: string, status: WorkOrderStatus): { text: string; color: string; bg: string } {
  if (status === 'teslim_edildi') return { text: 'Teslim edildi', color: '#94A3B8', bg: '#F1F5F9' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(deliveryDate + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff <  0) return { text: `${Math.abs(diff)}g geç`, color: CLR.red, bg: CLR.redBg };
  if (diff === 0) return { text: 'Bugün',                   color: CLR.purple, bg: CLR.purpleBg };
  if (diff === 1) return { text: 'Yarın',                   color: CLR.amber,  bg: CLR.amberBg };
  if (diff <= 3)  return { text: `${diff} gün kaldı`,       color: CLR.amber,  bg: CLR.amberBg };
  return { text: due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), color: '#64748B', bg: '#F1F5F9' };
}

function initials(name?: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function PlusIcon({ size = 24, color = '#FFFFFF' }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.6} strokeLinecap="round" /></Svg>;
}

// ── Order Card (clinic-specific) ─────────────────────────────────────
function OrderCard({ order, onPress }: { order: any; onPress: () => void }) {
  const overdue  = isOrderOverdue(order.delivery_date, order.status);
  const cfg      = STATUS_CONFIG[order.status as WorkOrderStatus];
  const dl       = dateLabel(order.delivery_date, order.status);
  const doctor   = order.doctor_profile?.full_name ?? 'Bilinmeyen hekim';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={oc.card}>
      <View style={oc.topRow}>
        <View style={[oc.statusPill, { backgroundColor: overdue ? CLR.redBg : cfg.bgColor }]}>
          <View style={[oc.statusDot, { backgroundColor: overdue ? CLR.red : cfg.color }]} />
          <Text style={[oc.statusLabel, { color: overdue ? CLR.red : cfg.color }]}>
            {overdue ? 'Gecikti' : cfg.label}
          </Text>
        </View>
        {order.is_urgent && (
          <View style={oc.urgentBadge}>
            <Text style={oc.urgentText}>ACİL</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <View style={[oc.dateChip, { backgroundColor: dl.bg }]}>
          <Text style={[oc.dateText, { color: dl.color }]}>{dl.text}</Text>
        </View>
      </View>

      <Text style={oc.workType} numberOfLines={1}>{order.work_type || 'Belirtilmemiş'}</Text>

      <View style={oc.doctorRow}>
        <View style={oc.avatar}><Text style={oc.avatarText}>{initials(doctor)}</Text></View>
        <Text style={oc.doctorName} numberOfLines={1}>{doctor}</Text>
        <Text style={oc.orderNo}>#{order.order_number}</Text>
      </View>

      {order.patient_name && (
        <Text style={oc.patient} numberOfLines={1}>Hasta: {order.patient_name}</Text>
      )}
    </TouchableOpacity>
  );
}

const oc = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    padding: 16, gap: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusPill:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 5 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusLabel:  { fontSize: 11, fontWeight: '700' },
  urgentBadge:  { backgroundColor: CLR.redBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  urgentText:   { fontSize: 9, fontWeight: '900', color: CLR.red, letterSpacing: 0.6 },
  dateChip:     { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  dateText:     { fontSize: 11, fontWeight: '700' },
  workType:     { fontSize: 15, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3, marginTop: 4 },
  doctorRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  avatar:       { width: 22, height: 22, borderRadius: 11, backgroundColor: P, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  doctorName:   { flex: 1, fontSize: 12, fontWeight: '600', color: '#64748B' },
  orderNo:      { fontSize: 11, color: '#94A3B8', fontWeight: '700', letterSpacing: 0.3 },
  patient:      { fontSize: 12, color: '#94A3B8' },
});

// ── Filter Chip ──────────────────────────────────────────────────────
type FilterKey = 'tumu' | 'aktif' | 'geciken' | 'teslim_edildi';
function FilterChip({ label, active, onPress, count }: {
  label: string; active: boolean; onPress: () => void; count?: number;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={[fc.chip, active && fc.chipActive]}>
      <Text style={[fc.text, active && fc.textActive]}>{label}</Text>
      {typeof count === 'number' && count > 0 && (
        <View style={[fc.count, active && fc.countActive]}>
          <Text style={[fc.countText, active && fc.countTextActive]}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
const fc = StyleSheet.create({
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9' },
  chipActive:  { backgroundColor: P, borderColor: P },
  text:        { fontSize: 12, fontWeight: '700', color: '#64748B' },
  textActive:  { color: '#FFFFFF' },
  count:           { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 6, minWidth: 20, alignItems: 'center' },
  countActive:     { backgroundColor: 'rgba(255,255,255,0.22)' },
  countText:       { fontSize: 10, fontWeight: '800', color: '#64748B' },
  countTextActive: { color: '#FFFFFF' },
});

// ── Main ─────────────────────────────────────────────────────────────
export function ClinicOrdersScreen() {
  const router = useRouter();
  const { orders, loading, refetch } = useClinicOrders();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [filter,      setFilter]      = useState<FilterKey>('tumu');
  const [doctorFilter, setDoctorFilter] = useState<string | null>(null);

  // Hekim listesi (filter için)
  const doctors = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach(o => {
      const name = (o as any).doctor_profile?.full_name ?? 'Bilinmeyen';
      if (!map.has(o.doctor_id)) map.set(o.doctor_id, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  const counts = useMemo(() => ({
    tumu:           orders.length,
    aktif:          orders.filter(o => o.status !== 'teslim_edildi' && !isOrderOverdue(o.delivery_date, o.status)).length,
    geciken:        orders.filter(o => isOrderOverdue(o.delivery_date, o.status)).length,
    teslim_edildi:  orders.filter(o => o.status === 'teslim_edildi').length,
  }), [orders]);

  const filtered = useMemo(() => {
    let out = orders.slice().sort((a, b) => (a.delivery_date || '').localeCompare(b.delivery_date || ''));
    if (doctorFilter) out = out.filter(o => o.doctor_id === doctorFilter);
    switch (filter) {
      case 'aktif':         return out.filter(o => o.status !== 'teslim_edildi' && !isOrderOverdue(o.delivery_date, o.status));
      case 'geciken':       return out.filter(o => isOrderOverdue(o.delivery_date, o.status));
      case 'teslim_edildi': return out.filter(o => o.status === 'teslim_edildi');
      default:              return out;
    }
  }, [orders, filter, doctorFilter]);

  const ListHeader = (
    <View>
      <Text style={s.title}>Tüm Siparişler</Text>
      <Text style={s.subtitle}>Klinik çapında iş emirleri</Text>

      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        <FilterChip label="Tümü"         active={filter === 'tumu'}          count={counts.tumu}          onPress={() => setFilter('tumu')} />
        <FilterChip label="Aktif"        active={filter === 'aktif'}         count={counts.aktif}         onPress={() => setFilter('aktif')} />
        <FilterChip label="Geciken"      active={filter === 'geciken'}       count={counts.geciken}       onPress={() => setFilter('geciken')} />
        <FilterChip label="Teslim Edildi" active={filter === 'teslim_edildi'} count={counts.teslim_edildi} onPress={() => setFilter('teslim_edildi')} />
      </ScrollView>

      {/* Doctor filter chips */}
      {doctors.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          <FilterChip label="Tüm Hekimler" active={!doctorFilter} onPress={() => setDoctorFilter(null)} />
          {doctors.map(d => (
            <FilterChip
              key={d.id}
              label={d.name}
              active={doctorFilter === d.id}
              onPress={() => setDoctorFilter(d.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onPress={() => router.push(`/(clinic)/order/${item.id}` as any)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={P} />}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyTitle}>Bu kategoride sipariş yok</Text>
              <Text style={s.emptySub}>Filtreyi değiştirmeyi deneyin.</Text>
            </View>
          ) : null
        }
      />

      {!isDesktop && (
        <TouchableOpacity
          style={s.fab}
          onPress={() => router.push('/(clinic)/new-order' as any)}
          activeOpacity={0.85}
        >
          <PlusIcon size={24} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  list: { padding: 20, paddingBottom: 120 },
  title:    { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.6 },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2, marginBottom: 16 },
  filterRow:{ gap: 8, paddingBottom: 16, paddingRight: 4 },
  emptyState:{ alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle:{ fontSize: 16, fontWeight: '800', color: '#0F172A' },
  emptySub:  { fontSize: 13, color: '#64748B' },
  fab: {
    position: 'absolute', right: 20, bottom: 100,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: P,
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 32px rgba(3,105,161,0.35)' } as any
      : { shadowColor: P, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 }),
  },
});
