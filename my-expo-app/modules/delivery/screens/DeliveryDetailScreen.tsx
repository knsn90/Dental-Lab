// modules/delivery/screens/DeliveryDetailScreen.tsx
// Teslimat detayı — GPS geçmişi, durum timeline, kurye bilgisi

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchDeliveryById, updateDeliveryStatus, type Delivery, type GpsPing } from '../api';
import { AppIcon } from '../../../core/ui/AppIcon';
import { toast } from '../../../core/ui/Toast';

const ACCENT = '#2563EB';

const STATUS_STEPS = [
  { status: 'atandi',         label: 'Kurye Atandı',    icon: 'account-check-outline' },
  { status: 'teslim_alindi',  label: 'İş Alındı',       icon: 'package-up'            },
  { status: 'yolda',          label: 'Yola Çıkıldı',    icon: 'truck-fast-outline'    },
  { status: 'teslim_edildi',  label: 'Teslim Edildi',   icon: 'check-circle-outline'  },
] as const;

const STATUS_ORDER = STATUS_STEPS.map(s => s.status);

function stepIndex(status: string) {
  return STATUS_ORDER.indexOf(status as any);
}

function fmt(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', opts ?? {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// ── GPS harita yerine koordinat + link kartı ───────────────────────────────────

function GpsCard({ ping }: { ping: GpsPing }) {
  const ago = Math.floor((Date.now() - new Date(ping.recorded_at).getTime()) / 1000);
  const agoText = ago < 60 ? `${ago}sn önce`
    : ago < 3600 ? `${Math.floor(ago / 60)}dk önce`
    : `${Math.floor(ago / 3600)}s önce`;

  function openMaps() {
    const url = mapsUrl(ping.lat, ping.lng);
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  }

  return (
    <TouchableOpacity style={gs.card} onPress={openMaps} activeOpacity={0.8}>
      <View style={gs.iconWrap}>
        <AppIcon name="map-marker-radius-outline" set="mci" size={24} color={ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={gs.coords}>
          {ping.lat.toFixed(5)}, {ping.lng.toFixed(5)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Text style={gs.meta}>{agoText}</Text>
          {ping.accuracy_m && <Text style={gs.meta}>±{Math.round(ping.accuracy_m)}m</Text>}
          {ping.speed_kmh   && <Text style={gs.meta}>{Math.round(ping.speed_kmh)} km/h</Text>}
        </View>
      </View>
      <View style={gs.mapBtn}>
        <AppIcon name="open-in-new" set="mci" size={16} color={ACCENT} />
        <Text style={gs.mapBtnText}>Harita</Text>
      </View>
    </TouchableOpacity>
  );
}

const gs = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#EFF6FF', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: '#BFDBFE',
  },
  iconWrap:   { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  coords:     { fontSize: 14, fontWeight: '700', color: '#1E40AF', fontVariant: ['tabular-nums'] },
  meta:       { fontSize: 12, color: '#3B82F6' },
  mapBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  mapBtnText: { fontSize: 12, fontWeight: '700', color: ACCENT },
});

// ── Ana Ekran ─────────────────────────────────────────────────────────────────

export function DeliveryDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [pings,    setPings]    = useState<GpsPing[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [advancing,setAdvancing]= useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    const { delivery: d, pings: p, error } = await fetchDeliveryById(id);
    if (!error) { setDelivery(d); setPings(p); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function advance() {
    if (!delivery) return;
    const current = stepIndex(delivery.status);
    const next    = STATUS_ORDER[current + 1];
    if (!next) return;
    setAdvancing(true);
    const { error } = await updateDeliveryStatus(delivery.id, next);
    setAdvancing(false);
    if (error) Alert.alert('Hata', error.message);
    else { toast.success(`Durum güncellendi: ${STATUS_STEPS[current + 1]?.label}`); load(); }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={ACCENT} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!delivery) {
    return (
      <SafeAreaView style={s.container}>
        <TouchableOpacity style={{ padding: 20 }} onPress={() => router.back()}>
          <Text style={{ color: ACCENT }}>← Geri</Text>
        </TouchableOpacity>
        <Text style={{ textAlign: 'center', color: '#94A3B8', marginTop: 40 }}>Teslimat bulunamadı.</Text>
      </SafeAreaView>
    );
  }

  const wo      = delivery.work_order as any;
  const courier = delivery.courier as any;
  const curIdx  = stepIndex(delivery.status);
  const isLast  = curIdx === STATUS_ORDER.length - 1;
  const nextStep = !isLast ? STATUS_STEPS[curIdx + 1] : null;
  const lastPing = pings[0] ?? null;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <AppIcon name="arrow-left" size={20} color={ACCENT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Teslimat Detayı</Text>
          <Text style={s.sub}>#{wo?.order_number ?? id.slice(0, 8)}</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={load}>
          <AppIcon name="refresh-cw" size={16} color={ACCENT} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Durum timeline ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Durum Akışı</Text>
          {STATUS_STEPS.map((step, i) => {
            const done    = i <= curIdx;
            const current = i === curIdx;
            return (
              <View key={step.status} style={tl.row}>
                <View style={tl.left}>
                  <View style={[tl.dot, done ? tl.dotDone : tl.dotPending, current && tl.dotCurrent]}>
                    {done && <AppIcon name={step.icon as any} set="mci" size={12} color="#fff" />}
                  </View>
                  {i < STATUS_STEPS.length - 1 && (
                    <View style={[tl.line, done && i < curIdx ? tl.lineDone : null]} />
                  )}
                </View>
                <View style={tl.content}>
                  <Text style={[tl.label, !done && tl.labelPending, current && tl.labelCurrent]}>
                    {step.label}
                  </Text>
                  <Text style={tl.time}>
                    {step.status === 'atandi'        ? fmt(delivery.assigned_at)
                   : step.status === 'teslim_alindi' ? fmt(delivery.picked_up_at)
                   : step.status === 'yolda'         ? fmt(delivery.picked_up_at)
                   : step.status === 'teslim_edildi' ? fmt(delivery.delivered_at)
                   : '—'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Son GPS konumu ── */}
        {lastPing ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Son Konum</Text>
            <GpsCard ping={lastPing} />
            {pings.length > 1 && (
              <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>
                Son {pings.length} ping kaydı mevcut
              </Text>
            )}
          </View>
        ) : delivery.status === 'yolda' ? (
          <View style={[s.card, { alignItems: 'center', gap: 8, paddingVertical: 24 }]}>
            <AppIcon name="map-marker-off-outline" set="mci" size={32} color="#CBD5E1" />
            <Text style={{ color: '#94A3B8', fontSize: 14 }}>GPS konumu henüz alınmadı</Text>
          </View>
        ) : null}

        {/* ── İş emri bilgisi ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>İş Emri</Text>
          <Row label="İş Türü"  value={wo?.work_type ?? '—'} />
          <Row label="Teslim"   value={wo?.delivery_date ? new Date(wo.delivery_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long' }) : '—'} />
          {wo?.doctor?.full_name  && <Row label="Hekim"   value={wo.doctor.full_name} />}
          {wo?.doctor?.clinic_name && <Row label="Klinik" value={wo.doctor.clinic_name} />}
        </View>

        {/* ── Kurye bilgisi ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Kurye</Text>
          <Row label="Ad"   value={courier?.full_name ?? '—'} />
          <Row label="Tür"  value={courier?.courier_type === 'iç' ? 'İç Kurye' : 'Dış Kurye'} />
          {courier?.phone && (
            <TouchableOpacity
              style={s.callBtn}
              onPress={() => Linking.openURL(`tel:${courier.phone}`)}
            >
              <AppIcon name="phone" size={16} color="#fff" />
              <Text style={s.callBtnText}>{courier.phone}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Teslim alıcı (varsa) ── */}
        {delivery.recipient_name && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Teslim Alıcı</Text>
            <Row label="Ad" value={delivery.recipient_name} />
            {delivery.recipient_note && <Row label="Not" value={delivery.recipient_note} />}
          </View>
        )}

        {/* ── İlerlet butonu ── */}
        {nextStep && (
          <TouchableOpacity
            style={[s.advanceBtn, advancing && s.advanceBtnDisabled]}
            onPress={advance}
            disabled={advancing}
          >
            {advancing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <AppIcon name={nextStep.icon as any} set="mci" size={18} color="#fff" />
                <Text style={s.advanceBtnText}>→ {nextStep.label}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Yardımcı bileşenler ───────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
      <Text style={{ fontSize: 12, color: '#94A3B8', width: 64 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1E293B', flex: 1 }}>{value}</Text>
    </View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn:    { padding: 4 },
  title:      { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  sub:        { fontSize: 13, color: '#64748B' },
  refreshBtn: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0', padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardTitle:  { fontSize: 13, fontWeight: '700', color: '#94A3B8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#16A34A', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    alignSelf: 'flex-start', marginTop: 8,
  },
  callBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  advanceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 16,
    shadowColor: ACCENT, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  advanceBtnDisabled: { opacity: 0.6 },
  advanceBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
});

// Timeline stiller
const tl = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 14, marginBottom: 4 },
  left:  { alignItems: 'center', width: 24 },
  dot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  dotPending: { backgroundColor: '#E2E8F0' },
  dotDone:    { backgroundColor: '#16A34A' },
  dotCurrent: { backgroundColor: ACCENT, shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 4, elevation: 2 },
  line:       { width: 2, flex: 1, backgroundColor: '#E2E8F0', minHeight: 20, marginVertical: 2 },
  lineDone:   { backgroundColor: '#16A34A' },
  content:    { flex: 1, paddingBottom: 16 },
  label:      { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  labelPending:{ color: '#94A3B8' },
  labelCurrent:{ color: ACCENT, fontWeight: '800' },
  time:       { fontSize: 12, color: '#94A3B8', marginTop: 2 },
});
