// modules/delivery/screens/DeliveryListScreen.tsx
// Lab yöneticisi — teslimat listesi, kurye atama, durum takibi

import React, { useState, useCallback, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, TextInput,
  Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../core/store/authStore';
import { useDeliveries } from '../hooks/useDeliveries';
import {
  fetchCouriers, createDelivery, type Delivery, type Courier,
} from '../api';
import { AppIcon } from '../../../core/ui/AppIcon';
import { toast } from '../../../core/ui/Toast';

const ACCENT = '#2563EB';

// ── Durum renk/etiket ─────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  atandi:         { label: 'Atandı',        color: '#F59E0B', icon: 'clock-outline'      },
  teslim_alindi:  { label: 'Teslim Alındı', color: '#6366F1', icon: 'package-up'         },
  yolda:          { label: 'Yolda',         color: '#2563EB', icon: 'truck-fast-outline'  },
  teslim_edildi:  { label: 'Teslim Edildi', color: '#16A34A', icon: 'check-circle-outline'},
  iade:           { label: 'İade',          color: '#EF4444', icon: 'undo-variant'        },
};

// ── Tarih formatı ────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ── Kurye Atama Modalı ────────────────────────────────────────────────────────

interface AssignModalProps {
  workOrderId: string;
  orderNumber: string;
  labId: string;
  onClose: () => void;
  onDone: () => void;
}

function AssignCourierModal({ workOrderId, orderNumber, labId, onClose, onDone }: AssignModalProps) {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Modal açılınca kuryeleri yükle
  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await fetchCouriers(labId);
      setCouriers((data ?? []) as Courier[]);
      setLoading(false);
    })();
  }, [labId]);

  async function handleAssign() {
    if (!selected) return;
    setSaving(true);
    const { error } = await createDelivery(workOrderId, selected);
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
    } else {
      toast.success('Kurye atandı ✓');
      onDone();
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={am.overlay} activeOpacity={1} onPress={onClose} />
      <View style={am.sheet}>
        <View style={am.handle} />
        <Text style={am.title}>Kurye Ata</Text>
        <Text style={am.sub}>#{orderNumber}</Text>

        {loading ? (
          <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
        ) : couriers.length === 0 ? (
          <Text style={am.empty}>Aktif kurye bulunamadı.</Text>
        ) : (
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {couriers.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[am.row, selected === c.id && am.rowSelected]}
                onPress={() => setSelected(c.id)}
              >
                <View style={[am.avatar, { backgroundColor: c.courier_type === 'iç' ? ACCENT : '#7C3AED' }]}>
                  <Text style={am.avatarText}>{c.full_name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={am.courierName}>{c.full_name}</Text>
                  <Text style={am.courierMeta}>
                    {c.courier_type === 'iç' ? 'İç Kurye' : `Dış — ${c.company_name ?? ''}`}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </Text>
                </View>
                {selected === c.id && (
                  <AppIcon name="check-circle" set="mci" size={20} color={ACCENT} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <TouchableOpacity
          style={[am.btn, (!selected || saving) && am.btnDisabled]}
          onPress={handleAssign}
          disabled={!selected || saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={am.btnText}>Onayla ve Ata</Text>
          }
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const am = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }, elevation: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 16 },
  title:  { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  sub:    { fontSize: 13, color: '#64748B', marginTop: 2, marginBottom: 16 },
  empty:  { textAlign: 'center', color: '#94A3B8', paddingVertical: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  rowSelected: { backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  courierName: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  courierMeta: { fontSize: 12, color: '#64748B' },
  btn: {
    marginTop: 16, backgroundColor: ACCENT, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});

// ── Teslimat Kartı ─────────────────────────────────────────────────────────────

function DeliveryCard({
  delivery,
  onPress,
}: {
  delivery: Delivery;
  onPress: () => void;
}) {
  const meta = STATUS_META[delivery.status] ?? STATUS_META.atandi;
  const wo   = delivery.work_order as any;
  const c    = delivery.courier as any;

  function callCourier() {
    if (!c?.phone) return;
    Linking.openURL(`tel:${c.phone}`);
  }

  return (
    <TouchableOpacity style={dc.card} onPress={onPress} activeOpacity={0.8}>
      {/* Durum satırı */}
      <View style={dc.topRow}>
        <View style={[dc.statusPill, { backgroundColor: meta.color + '18' }]}>
          <AppIcon name={meta.icon as any} set="mci" size={13} color={meta.color} />
          <Text style={[dc.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={dc.orderNum}>#{wo?.order_number ?? '—'}</Text>
        {delivery.status === 'yolda' && (
          <View style={dc.liveDot} />
        )}
      </View>

      {/* İş türü + hekim */}
      <Text style={dc.workType}>{wo?.work_type ?? '—'}</Text>
      {wo?.doctor?.full_name && (
        <Text style={dc.doctor}>{wo.doctor.full_name}</Text>
      )}

      {/* Kurye + telefon */}
      <View style={dc.courierRow}>
        <AppIcon name="account-tie-outline" set="mci" size={14} color="#64748B" />
        <Text style={dc.courierName}>{c?.full_name ?? '—'}</Text>
        {c?.phone && (
          <TouchableOpacity onPress={callCourier} style={dc.phoneBtn}>
            <AppIcon name="phone-outline" set="mci" size={13} color={ACCENT} />
          </TouchableOpacity>
        )}
      </View>

      {/* Zaman */}
      <View style={dc.timeRow}>
        <Text style={dc.timeLabel}>Atandı:</Text>
        <Text style={dc.timeVal}>{fmt(delivery.assigned_at)}</Text>
        {delivery.picked_up_at && (
          <>
            <Text style={dc.timeLabel}>Alındı:</Text>
            <Text style={dc.timeVal}>{fmt(delivery.picked_up_at)}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const dc = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    padding: 14, gap: 4,
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  topRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  orderNum:   { fontSize: 14, fontWeight: '800', color: '#0F172A', flex: 1 },
  liveDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563EB', opacity: 0.8 },
  workType:   { fontSize: 13, color: '#64748B' },
  doctor:     { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  courierRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  courierName:{ fontSize: 13, fontWeight: '600', color: '#475569', flex: 1 },
  phoneBtn:   { padding: 4 },
  timeRow:    { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' },
  timeLabel:  { fontSize: 11, color: '#94A3B8' },
  timeVal:    { fontSize: 11, fontWeight: '600', color: '#475569' },
});

// ── Ana Ekran ─────────────────────────────────────────────────────────────────

export function DeliveryListScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { deliveries, loading, refresh } = useDeliveries(profile?.lab_id);
  const [refreshing, setRefreshing] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ id: string; orderNumber: string } | null>(null);
  const isEmbedded = useContext(HubContext);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  // Özet istatistikler
  const stats = {
    total:         deliveries.length,
    yolda:         deliveries.filter(d => d.status === 'yolda').length,
    atandi:        deliveries.filter(d => d.status === 'atandi').length,
    teslim_alindi: deliveries.filter(d => d.status === 'teslim_alindi').length,
  };

  return (
    <SafeAreaView style={s.container} edges={isEmbedded ? ([] as any) : ['top']}>
      {/* Başlık */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Teslimatlar</Text>
          <Text style={s.sub}>{stats.total} aktif · {stats.yolda} yolda</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={refresh}>
          <AppIcon name="refresh-cw" size={18} color={ACCENT} />
        </TouchableOpacity>
      </View>

      {/* Özet kartları */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statsRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {[
          { label: 'Atandı',        count: stats.atandi,        color: '#F59E0B' },
          { label: 'Teslim Alındı', count: stats.teslim_alindi, color: '#6366F1' },
          { label: 'Yolda',         count: stats.yolda,         color: '#2563EB' },
        ].map(({ label, count, color }) => (
          <View key={label} style={[s.statCard, { borderColor: color + '40' }]}>
            <Text style={[s.statCount, { color }]}>{count}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Liste */}
      {loading && !refreshing ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : deliveries.length === 0 ? (
        <View style={s.center}>
          <AppIcon name="truck-outline" set="mci" size={48} color="#CBD5E1" />
          <Text style={s.emptyTitle}>Aktif Teslimat Yok</Text>
          <Text style={s.emptySub}>İş emirleri tamamlandığında burada görünür.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} />
          }
          showsVerticalScrollIndicator={false}
        >
          {deliveries.map(d => (
            <DeliveryCard
              key={d.id}
              delivery={d}
              onPress={() => router.push(`/(lab)/delivery/${d.id}` as any)}
            />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Kurye atama modalı */}
      {assignTarget && profile?.lab_id && (
        <AssignCourierModal
          workOrderId={assignTarget.id}
          orderNumber={assignTarget.orderNumber}
          labId={profile.lab_id}
          onClose={() => setAssignTarget(null)}
          onDone={() => { setAssignTarget(null); refresh(); }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  title:      { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  sub:        { fontSize: 13, color: '#64748B', marginTop: 2 },
  refreshBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  statsRow:   { flexShrink: 0, paddingVertical: 12 },
  statCard: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, alignItems: 'center', minWidth: 90,
  },
  statCount: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle:{ fontSize: 18, fontWeight: '700', color: '#475569' },
  emptySub:  { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 },
});
