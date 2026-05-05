// modules/delivery/screens/CourierDeliveryScreen.tsx
// Kurye ana ekranı — aktif teslimat + GPS başlat/durdur + durum güncelleme

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, TextInput, Alert,
  Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../core/store/authStore';
import { useCourierDelivery } from '../hooks/useCourierDelivery';
import { AppIcon } from '../../../core/ui/AppIcon';
import { toast } from '../../../core/ui/Toast';

const ACCENT   = '#2563EB';
const GREEN    = '#16A34A';

// ── GPS Göstergesi ────────────────────────────────────────────────────────────

function GpsBadge({ tracking, lastPingAt, error }: {
  tracking: boolean;
  lastPingAt: Date | null;
  error: string | null;
}) {
  const anim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!tracking) { anim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [tracking]);

  if (!tracking && !lastPingAt) return null;

  return (
    <View style={[gps.badge, error ? gps.badgeError : tracking ? gps.badgeActive : gps.badgeDone]}>
      <Animated.View style={[gps.dot, { opacity: anim, backgroundColor: error ? '#EF4444' : GREEN }]} />
      <Text style={[gps.text, { color: error ? '#EF4444' : tracking ? GREEN : '#94A3B8' }]}>
        {error
          ? 'Konum alınamadı'
          : tracking
          ? `GPS Aktif${lastPingAt ? ` · ${lastPingAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
          : 'GPS Durduruldu'}
      </Text>
    </View>
  );
}

const gps = StyleSheet.create({
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start' },
  badgeActive: { backgroundColor: '#DCFCE7' },
  badgeDone:   { backgroundColor: '#F1F5F9' },
  badgeError:  { backgroundColor: '#FEF2F2' },
  dot:         { width: 8, height: 8, borderRadius: 4 },
  text:        { fontSize: 12, fontWeight: '600' },
});

// ── Durum Adımı ───────────────────────────────────────────────────────────────

const STATUS_FLOW = [
  { from: 'atandi',        to: 'teslim_alindi', label: 'Teslim Aldım',  color: '#6366F1', icon: 'package-up'           },
  { from: 'teslim_alindi', to: 'yolda',         label: 'Yola Çıkıyorum',color: ACCENT,    icon: 'truck-fast-outline'   },
  { from: 'yolda',         to: 'teslim_edildi', label: 'Teslim Ettim',  color: GREEN,     icon: 'check-circle-outline' },
] as const;

// ── Teslimat Yok ──────────────────────────────────────────────────────────────

function NoDeliveryView({ onRefresh }: { onRefresh: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <AppIcon name="truck-outline" set="mci" size={56} color="#CBD5E1" />
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#475569' }}>Aktif Teslimat Yok</Text>
      <Text style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22 }}>
        Size atanmış bir teslimat bulunmuyor. Yöneticiden yeni teslimat bekleniyor.
      </Text>
      <TouchableOpacity
        style={{ backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
        onPress={onRefresh}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Yenile</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────

export function CourierDeliveryScreen() {
  const { profile } = useAuthStore();

  // courierId: kurye olarak profilin "couriers" tablosundaki ID'si
  // Şimdilik profile.id'yi courier profile_id olarak kullanıyoruz
  const { delivery, loading, tracking, lastPingAt, pingError,
          startTracking, stopTracking, updateStatus, refresh } = useCourierDelivery(profile?.id ?? null);

  const [recipientName, setRecipientName] = useState('');
  const [saving,        setSaving]        = useState(false);
  const [showRecipient, setShowRecipient] = useState(false);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={ACCENT} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!delivery) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>Teslimat Paneli</Text>
          <Text style={s.greet}>{profile?.full_name ?? ''}</Text>
        </View>
        <NoDeliveryView onRefresh={refresh} />
      </SafeAreaView>
    );
  }

  const wo = delivery.work_order as any;
  const nextFlow = STATUS_FLOW.find(f => f.from === delivery.status);

  async function handleAdvance() {
    if (!nextFlow) return;

    // Teslim edildi → alıcı adı sorulsun
    if (nextFlow.to === 'teslim_edildi') {
      if (!recipientName.trim()) {
        setShowRecipient(true);
        return;
      }
    }

    setSaving(true);
    const { error } = await updateStatus(nextFlow.to as any, {
      recipient_name: recipientName.trim() || undefined,
    });
    setSaving(false);

    if (error) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'Güncelleme başarısız');
    } else {
      toast.success(`${nextFlow.label} ✓`);
      setShowRecipient(false);
      setRecipientName('');
    }
  }

  const isDelivered = delivery.status === 'teslim_edildi';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Teslimat Paneli</Text>
          <Text style={s.greet}>{profile?.full_name ?? 'Kurye'}</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={refresh}>
          <AppIcon name="refresh-cw" size={18} color={ACCENT} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── GPS Durumu ── */}
        {!isDelivered && (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.cardTitle}>GPS Konumu</Text>
              <GpsBadge tracking={tracking} lastPingAt={lastPingAt} error={pingError} />
            </View>

            {delivery.status === 'yolda' && (
              <TouchableOpacity
                style={[s.gpsToggle, tracking ? s.gpsToggleStop : s.gpsToggleStart]}
                onPress={tracking ? stopTracking : startTracking}
              >
                <AppIcon
                  name={tracking ? 'pause-circle-outline' : 'map-marker-radius-outline'}
                  set="mci" size={18} color="#fff"
                />
                <Text style={s.gpsToggleText}>
                  {tracking ? 'GPS Durdur' : 'GPS Başlat'}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={s.gpsInfo}>
              Konumunuz {Math.round(60)} saniyede bir merkeze iletilir.
            </Text>
          </View>
        )}

        {/* ── Teslimat Bilgisi ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Teslimat</Text>
          <View style={s.infoGrid}>
            <InfoRow label="Sipariş"   value={`#${wo?.order_number ?? '—'}`} />
            <InfoRow label="İş Türü"   value={wo?.work_type ?? '—'} />
            {wo?.doctor?.full_name  && <InfoRow label="Hekim"  value={wo.doctor.full_name} />}
            {wo?.doctor?.clinic_name && <InfoRow label="Klinik" value={wo.doctor.clinic_name} />}
            <InfoRow
              label="Teslim Tarihi"
              value={wo?.delivery_date
                ? new Date(wo.delivery_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
                : '—'}
              highlight
            />
          </View>
        </View>

        {/* ── Durum ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Mevcut Durum</Text>
          {STATUS_FLOW.map((step, i) => {
            const order  = ['atandi', 'teslim_alindi', 'yolda', 'teslim_edildi'];
            const curIdx = order.indexOf(delivery.status);
            const stepIdx = order.indexOf(step.to);
            const done    = stepIdx <= curIdx;
            return (
              <View key={step.to} style={tl.row}>
                <View style={[tl.dot, done ? { backgroundColor: step.color } : tl.dotPending]}>
                  {done && <AppIcon name={step.icon as any} set="mci" size={11} color="#fff" />}
                </View>
                <Text style={[tl.label, !done && tl.labelPending]}>{step.label}</Text>
              </View>
            );
          })}
        </View>

        {/* ── Alıcı adı girişi (teslim edildi için) ── */}
        {showRecipient && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Teslim Alan</Text>
            <TextInput
              style={s.input}
              placeholder="Teslim alan kişinin adı…"
              value={recipientName}
              onChangeText={setRecipientName}
              autoFocus
            />
          </View>
        )}

        {/* ── Aksiyon Butonu ── */}
        {!isDelivered && nextFlow && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: nextFlow.color }, saving && s.actionBtnDisabled]}
            onPress={handleAdvance}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <AppIcon name={nextFlow.icon as any} set="mci" size={22} color="#fff" />
                <Text style={s.actionBtnText}>{nextFlow.label}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* ── Tamamlandı mesajı ── */}
        {isDelivered && (
          <View style={s.doneCard}>
            <AppIcon name="check-circle" set="mci" size={40} color={GREEN} />
            <Text style={s.doneTitle}>Teslimat Tamamlandı!</Text>
            <Text style={s.doneSub}>
              {delivery.delivered_at
                ? new Date(delivery.delivered_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : ''}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
      <Text style={{ fontSize: 12, color: '#94A3B8', width: 100 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: highlight ? '800' : '600', color: highlight ? '#DC2626' : '#1E293B', flex: 1 }}>{value}</Text>
    </View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0FDF4' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  title:      { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  greet:      { fontSize: 13, color: '#64748B', marginTop: 1 },
  refreshBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1, gap: 8,
  },
  cardTitle:  { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  infoGrid:   { gap: 0 },
  gpsToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 12, marginTop: 4,
  },
  gpsToggleStart: { backgroundColor: GREEN },
  gpsToggleStop:  { backgroundColor: '#EF4444' },
  gpsToggleText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  gpsInfo:        { fontSize: 12, color: '#94A3B8', textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    padding: 12, fontSize: 15, color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderRadius: 16, paddingVertical: 18,
    shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  doneCard: {
    backgroundColor: '#F0FDF4', borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  doneTitle: { fontSize: 20, fontWeight: '800', color: '#14532D' },
  doneSub:   { fontSize: 14, color: '#16A34A' },
});

const tl = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot:         { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dotPending:  { backgroundColor: '#E2E8F0' },
  label:       { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  labelPending:{ color: '#94A3B8' },
});
