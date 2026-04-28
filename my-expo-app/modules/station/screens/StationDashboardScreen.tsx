// modules/station/screens/StationDashboardScreen.tsx
// Teknisyen ana ekranı — aktif iş + kuyruk

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Animated, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../core/store/authStore';
import { useStationJobs } from '../hooks/useStationJobs';
import { AppIcon } from '../../../core/ui/AppIcon';
import { F } from '../../../core/theme/typography';
import { C } from '../../../core/theme/colors';
import type { StationJob } from '../api';

const ACCENT = '#16A34A'; // İstasyon yeşili

// ── Zamanlayıcı ───────────────────────────────────────────────────────────────
function useTimer(startedAt: string | null) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    const calc = () => {
      const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      setElapsed(Math.max(0, diff));
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Aktif İş Kartı ────────────────────────────────────────────────────────────
function ActiveJobCard({
  job, onComplete,
}: {
  job: StationJob;
  onComplete: (id: string) => void;
}) {
  const timer   = useTimer(job.started_at);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const isOverdue = job.work_order.delivery_date < new Date().toISOString().split('T')[0];

  const handleComplete = () => {
    Alert.alert(
      'Aşamayı Tamamla',
      `"${job.station_name}" aşamasını tamamlamak istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Tamamla', style: 'default', onPress: () => onComplete(job.id) },
      ],
    );
  };

  return (
    <Animated.View style={[s.activeCard, { transform: [{ scale: pulseAnim }] }]}>
      {/* Başlık */}
      <View style={s.activeHeader}>
        <View style={[s.stationBadge, { backgroundColor: job.station_color + '22' }]}>
          <View style={[s.stationDot, { backgroundColor: job.station_color }]} />
          <Text style={[s.stationBadgeText, { color: job.station_color }]}>
            {job.station_name}
          </Text>
        </View>
        {job.work_order.is_rush && (
          <View style={s.rushBadge}>
            <AppIcon name="zap" size={11} color="#FFFFFF" />
            <Text style={s.rushText}>ACİL</Text>
          </View>
        )}
      </View>

      {/* İş bilgisi */}
      <Text style={s.orderNumber}>{job.work_order.order_number}</Text>
      <Text style={s.workType}>{job.work_order.work_type}</Text>

      <View style={s.infoRow}>
        <InfoChip icon="user" label={job.work_order.doctor_name ?? '—'} />
        {job.work_order.shade && <InfoChip icon="droplet" label={`Renk: ${job.work_order.shade}`} />}
        {job.work_order.box_code && <InfoChip icon="box" label={job.work_order.box_code} />}
      </View>

      <View style={s.teethRow}>
        {(job.work_order.tooth_numbers ?? []).slice(0, 10).map((t) => (
          <View key={t} style={s.toothChip}>
            <Text style={s.toothNum}>{t}</Text>
          </View>
        ))}
        {(job.work_order.tooth_numbers ?? []).length > 10 && (
          <Text style={s.toothMore}>+{(job.work_order.tooth_numbers ?? []).length - 10}</Text>
        )}
      </View>

      {/* Teslim tarihi */}
      <View style={[s.deadlineRow, isOverdue && s.deadlineOverdue]}>
        <AppIcon name="calendar" size={13} color={isOverdue ? '#EF4444' : '#64748B'} />
        <Text style={[s.deadlineText, isOverdue && { color: '#EF4444' }]}>
          Teslim: {job.work_order.delivery_date}
          {isOverdue ? '  ⚠ GECİKMİŞ' : ''}
        </Text>
      </View>

      {/* Zamanlayıcı */}
      <View style={s.timerRow}>
        <AppIcon name="clock" size={16} color={ACCENT} />
        <Text style={s.timerText}>{timer}</Text>
      </View>

      {/* Tamamla butonu */}
      <TouchableOpacity style={s.completeBtn} onPress={handleComplete} activeOpacity={0.85}>
        <AppIcon name="check-circle" size={20} color="#FFFFFF" />
        <Text style={s.completeBtnText}>Tamamladım</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Sıra Kartı (bekleyen iş) ─────────────────────────────────────────────────
function QueueCard({
  job, onAccept, hasActive,
}: {
  job: StationJob;
  onAccept: (id: string) => void;
  hasActive: boolean;
}) {
  return (
    <View style={s.queueCard}>
      <View style={s.queueLeft}>
        <View style={[s.seqBubble, { backgroundColor: ACCENT + '18' }]}>
          <Text style={[s.seqNum, { color: ACCENT }]}>{job.sequence_order}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.queueOrder}>{job.work_order.order_number}</Text>
          <Text style={s.queueType}>{job.work_order.work_type}</Text>
          <Text style={s.queueStation}>{job.station_name}</Text>
        </View>
      </View>
      {!hasActive && (
        <TouchableOpacity
          style={s.acceptBtn}
          onPress={() => onAccept(job.id)}
          activeOpacity={0.8}
        >
          <Text style={s.acceptBtnText}>Teslim Al</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Yardımcı ─────────────────────────────────────────────────────────────────
function InfoChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={s.infoChip}>
      <AppIcon name={icon as any} size={11} color="#64748B" />
      <Text style={s.infoChipText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────
export function StationDashboardScreen() {
  const router     = useRouter();
  const { profile } = useAuthStore();
  const {
    activeJob, queuedJobs, doneJobs,
    loading, refresh, accept, complete,
  } = useStationJobs(profile?.id);

  const handleAccept = async (stageId: string) => {
    const { error } = await accept(stageId);
    if (error) Alert.alert('Hata', error.message);
  };

  const handleComplete = async (stageId: string) => {
    const { error } = await complete(stageId);
    if (error) Alert.alert('Hata', error.message);
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Merhaba, {profile?.full_name?.split(' ')[0] ?? 'Teknisyen'} 👋</Text>
          <Text style={s.headerSub}>
            {activeJob
              ? `"${activeJob.station_name}" üzerinde çalışıyorsunuz`
              : queuedJobs.length > 0
              ? `${queuedJobs.length} iş bekliyor`
              : 'Bekleyen iş yok'}
          </Text>
        </View>
        <TouchableOpacity
          style={s.headerBtn}
          onPress={() => router.push('/(station)/settings' as any)}
        >
          <AppIcon name="settings" size={20} color="#64748B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={ACCENT} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Aktif İş */}
        {activeJob ? (
          <>
            <SectionLabel text="Aktif İş" icon="zap" color={ACCENT} />
            <ActiveJobCard job={activeJob} onComplete={handleComplete} />
          </>
        ) : (
          <View style={s.emptyActive}>
            <AppIcon name="inbox" size={40} color="#CBD5E1" />
            <Text style={s.emptyActiveText}>Aktif iş yok</Text>
            <Text style={s.emptyActiveSub}>Aşağıdan bir iş teslim alabilirsiniz</Text>
          </View>
        )}

        {/* Sıradaki İşler */}
        {queuedJobs.length > 0 && (
          <>
            <SectionLabel text={`Sıradaki İşler (${queuedJobs.length})`} icon="list" color="#64748B" />
            {queuedJobs.map((job) => (
              <QueueCard
                key={job.id}
                job={job}
                onAccept={handleAccept}
                hasActive={!!activeJob}
              />
            ))}
          </>
        )}

        {/* Tamamlanan İşler (bugün) */}
        {doneJobs.length > 0 && (
          <>
            <SectionLabel text={`Onay Bekleyen (${doneJobs.length})`} icon="clock" color="#D97706" />
            {doneJobs.map((job) => (
              <View key={job.id} style={[s.queueCard, s.doneCard]}>
                <View style={s.queueLeft}>
                  <View style={[s.seqBubble, { backgroundColor: '#FEF3C7' }]}>
                    <AppIcon name="clock" size={14} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.queueOrder}>{job.work_order.order_number}</Text>
                    <Text style={s.queueType}>{job.work_order.work_type}</Text>
                    {job.duration_min && (
                      <Text style={s.doneDuration}>⏱ {job.duration_min} dk</Text>
                    )}
                  </View>
                </View>
                <View style={s.pendingApproval}>
                  <Text style={s.pendingApprovalText}>Müdür Onayı{'\n'}Bekleniyor</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Boş durum */}
        {!activeJob && queuedJobs.length === 0 && doneJobs.length === 0 && !loading && (
          <View style={s.emptyAll}>
            <Text style={s.emptyAllEmoji}>🎉</Text>
            <Text style={s.emptyAllText}>Tüm işler tamamlandı!</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ text, icon, color }: { text: string; icon: string; color: string }) {
  return (
    <View style={s.sectionLabel}>
      <AppIcon name={icon as any} size={14} color={color} />
      <Text style={[s.sectionLabelText, { color }]}>{text}</Text>
    </View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F7F9FB' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  greeting:   { fontSize: 18, fontFamily: F.bold, color: C.textPrimary, fontWeight: '700' },
  headerSub:  { fontSize: 13, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },
  headerBtn:  { padding: 8 },

  scroll: { padding: 16, paddingTop: 8 },

  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 20, marginBottom: 10,
  },
  sectionLabelText: { fontSize: 12, fontFamily: F.semibold, fontWeight: '600', letterSpacing: 0.5 },

  // Aktif kart
  activeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: ACCENT + '40',
    ...(Platform.OS === 'web'
      ? { boxShadow: `0 4px 24px ${ACCENT}18` } as any
      : { shadowColor: ACCENT, shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 }),
  },
  activeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  stationBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  stationDot: { width: 7, height: 7, borderRadius: 99 },
  stationBadgeText: { fontSize: 12, fontFamily: F.semibold, fontWeight: '600' },
  rushBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EF4444', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  rushText: { fontSize: 10, fontFamily: F.bold, color: '#FFFFFF', fontWeight: '800' },

  orderNumber: { fontSize: 22, fontFamily: F.bold, color: C.textPrimary, fontWeight: '800', marginBottom: 4 },
  workType:    { fontSize: 15, fontFamily: F.medium, color: C.textSecondary, marginBottom: 12 },

  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F1F5F9', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  infoChipText: { fontSize: 11, fontFamily: F.medium, color: C.textSecondary },

  teethRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 },
  toothChip: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: ACCENT + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  toothNum:  { fontSize: 11, fontFamily: F.bold, color: ACCENT, fontWeight: '700' },
  toothMore: { fontSize: 11, fontFamily: F.regular, color: C.textMuted, alignSelf: 'center' },

  deadlineRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F8FAFC', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12,
  },
  deadlineOverdue: { backgroundColor: '#FEF2F2' },
  deadlineText: { fontSize: 12, fontFamily: F.medium, color: C.textSecondary },

  timerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    justifyContent: 'center', marginBottom: 16,
  },
  timerText: { fontSize: 32, fontFamily: F.bold, color: ACCENT, fontWeight: '800', letterSpacing: 2 },

  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 14,
  },
  completeBtnText: { fontSize: 16, fontFamily: F.bold, color: '#FFFFFF', fontWeight: '700' },

  // Boş aktif
  emptyActive: { alignItems: 'center', paddingVertical: 32 },
  emptyActiveText: { fontSize: 16, fontFamily: F.semibold, color: C.textSecondary, marginTop: 12 },
  emptyActiveSub:  { fontSize: 13, fontFamily: F.regular, color: C.textMuted, marginTop: 4 },

  // Sıra kartı
  queueCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  doneCard: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  queueLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  seqBubble: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  seqNum:      { fontSize: 16, fontFamily: F.bold, fontWeight: '700' },
  queueOrder:  { fontSize: 14, fontFamily: F.bold, color: C.textPrimary, fontWeight: '700' },
  queueType:   { fontSize: 12, fontFamily: F.regular, color: C.textSecondary },
  queueStation:{ fontSize: 11, fontFamily: F.medium, color: ACCENT, marginTop: 2 },
  doneDuration:{ fontSize: 11, fontFamily: F.medium, color: '#D97706', marginTop: 2 },

  acceptBtn: {
    backgroundColor: ACCENT + '15', borderRadius: 10, borderWidth: 1,
    borderColor: ACCENT + '40', paddingHorizontal: 14, paddingVertical: 8,
  },
  acceptBtnText: { fontSize: 13, fontFamily: F.semibold, color: ACCENT, fontWeight: '600' },

  pendingApproval: {
    backgroundColor: '#FEF3C7', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  pendingApprovalText: { fontSize: 10, fontFamily: F.medium, color: '#92400E', textAlign: 'center' },

  // Tümü boş
  emptyAll: { alignItems: 'center', paddingVertical: 60 },
  emptyAllEmoji: { fontSize: 48 },
  emptyAllText: { fontSize: 18, fontFamily: F.bold, color: C.textPrimary, marginTop: 12, fontWeight: '700' },
});
