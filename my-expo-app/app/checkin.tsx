/**
 * /checkin?token=XXXX
 *
 * Çalışan QR kodu okutunca buraya gelir.
 * GPS izni alınır → qr_checkin() RPC'si çağrılır → sonuç gösterilir.
 *
 * Bu sayfa herkesin erişebileceği public bir route değil;
 * kullanıcı zaten login olmuş olmalı (Supabase session gerekli).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Location from 'expo-location';

import { qrCheckin, type QrCheckinResult } from '../modules/hr/api';
import { useAuthStore } from '../core/store/authStore';

// ─── Theme ────────────────────────────────────────────────────────────────────
const PRIMARY = '#2563EB';

type Phase =
  | 'checking_auth'    // oturum kontrol ediliyor
  | 'requesting_gps'   // GPS izni isteniyor
  | 'loading'          // RPC çağrısı
  | 'success_in'       // giriş başarılı
  | 'success_out'      // çıkış başarılı
  | 'error';           // hata

// ─── Main ────────────────────────────────────────────────────────────────────
export default function CheckinPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { profile, loading: authLoading } = useAuthStore();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('checking_auth');
  const [result, setResult] = useState<QrCheckinResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [gpsSkipped, setGpsSkipped] = useState(false);
  const ran = useRef(false);

  // ─── Auth ready → GPS → RPC ─────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      // login'e yönlendir, sonra geri dön
      router.replace(`/(auth)/login?redirect=/checkin?token=${token}`);
      return;
    }
    if (ran.current) return;
    ran.current = true;
    runCheckin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile]);

  async function runCheckin(skipGps = false) {
    if (!token) {
      setErrorMsg('Geçersiz QR kodu. Lütfen tekrar deneyin.');
      setPhase('error');
      return;
    }

    let lat = 0;
    let lng = 0;
    let method: 'qr_gps' | 'qr_only' = 'qr_only';

    if (!skipGps) {
      setPhase('requesting_gps');
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat    = loc.coords.latitude;
          lng    = loc.coords.longitude;
          method = 'qr_gps';
        } else {
          // GPS reddedildi → QR only modda devam et
          setGpsSkipped(true);
        }
      } catch {
        setGpsSkipped(true);
      }
    } else {
      setGpsSkipped(true);
    }

    setPhase('loading');

    try {
      const res = await qrCheckin(token, lat, lng, method);
      setResult(res);

      if (res.ok && res.action === 'check_in')  { setPhase('success_in');  return; }
      if (res.ok && res.action === 'check_out') { setPhase('success_out'); return; }

      // Error
      const msgs: Record<string, string> = {
        invalid_token:    'Geçersiz QR kodu. Lab yöneticinize bildirin.',
        out_of_range:     `Lab'a çok uzaktasınız (${res.distance_m ?? '?'}m uzak, izin: ${res.allowed_m ?? 150}m).`,
        employee_not_found: "Bu lab'da kayıtlı çalışan bulunamadı.",
        already_complete: 'Bugünkü giriş/çıkışınız zaten tamamlandı.',
      };
      setErrorMsg(msgs[res.error ?? ''] ?? 'Bilinmeyen hata.');
      setPhase('error');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Sunucu hatası. Lütfen tekrar deneyin.');
      setPhase('error');
    }
  }

  // ─── Retry without GPS ───────────────────────────────────────────────────
  function retryWithoutGps() {
    ran.current = false;
    setResult(null);
    setErrorMsg('');
    runCheckin(true);
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.center} keyboardShouldPersistTaps="handled">
        {/* Logo area */}
        <View style={s.logoBox}>
          <View style={[s.logoCircle, { backgroundColor: PRIMARY }]}>
            <Feather name="clock" size={36} color="#fff" />
          </View>
          <Text style={s.logoTitle}>Dental Lab</Text>
          <Text style={s.logoSub}>Giriş / Çıkış Sistemi</Text>
        </View>

        {/* Phase cards */}
        {(phase === 'checking_auth' || phase === 'requesting_gps' || phase === 'loading') && (
          <LoadingCard phase={phase} />
        )}

        {phase === 'success_in' && result && (
          <SuccessCard
            action="check_in"
            time={result.time ?? '—'}
            name={result.employee ?? ''}
            gpsSkipped={gpsSkipped}
            onClose={() => router.back()}
          />
        )}

        {phase === 'success_out' && result && (
          <SuccessCard
            action="check_out"
            time={result.time ?? '—'}
            name={result.employee ?? ''}
            workMinutes={result.work_minutes}
            gpsSkipped={gpsSkipped}
            onClose={() => router.back()}
          />
        )}

        {phase === 'error' && (
          <ErrorCard
            message={errorMsg}
            isOutOfRange={result?.error === 'out_of_range'}
            onRetryWithoutGps={retryWithoutGps}
            onClose={() => router.back()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub components ───────────────────────────────────────────────────────────

function LoadingCard({ phase }: { phase: Phase }) {
  const labels: Record<Phase, string> = {
    checking_auth:  'Oturum doğrulanıyor...',
    requesting_gps: 'Konum alınıyor...',
    loading:        'Kayıt işleniyor...',
    success_in:     '',
    success_out:    '',
    error:          '',
  };
  return (
    <View style={s.card}>
      <ActivityIndicator size="large" color={PRIMARY} />
      <Text style={s.loadingText}>{labels[phase]}</Text>
    </View>
  );
}

function SuccessCard({
  action, time, name, workMinutes, gpsSkipped, onClose,
}: {
  action: 'check_in' | 'check_out';
  time: string;
  name: string;
  workMinutes?: number;
  gpsSkipped?: boolean;
  onClose: () => void;
}) {
  const isIn = action === 'check_in';
  return (
    <View style={s.card}>
      <View style={[s.iconCircle, { backgroundColor: '#D1FAE5' }]}>
        <Feather name={isIn ? 'log-in' : 'log-out'} size={32} color="#059669" />
      </View>

      <Text style={[s.resultTitle, { color: '#059669' }]}>
        {isIn ? 'Giriş Kaydedildi' : 'Çıkış Kaydedildi'}
      </Text>

      <Text style={s.employeeName}>{name}</Text>

      <View style={s.timeBox}>
        <Feather name="clock" size={16} color="#64748B" />
        <Text style={s.timeText}>{time}</Text>
      </View>

      {!isIn && workMinutes != null && (
        <View style={s.statRow}>
          <Feather name="activity" size={14} color="#2563EB" />
          <Text style={s.statText}>
            {Math.floor(workMinutes / 60)}s {workMinutes % 60}dk çalışıldı
          </Text>
        </View>
      )}

      {gpsSkipped && (
        <View style={s.warnRow}>
          <Feather name="alert-circle" size={13} color="#D97706" />
          <Text style={s.warnText}>GPS kullanılmadı (QR-only mod)</Text>
        </View>
      )}

      <TouchableOpacity style={[s.btn, { backgroundColor: PRIMARY }]} onPress={onClose}>
        <Text style={s.btnText}>Tamam</Text>
      </TouchableOpacity>
    </View>
  );
}

function ErrorCard({
  message, isOutOfRange, onRetryWithoutGps, onClose,
}: {
  message: string;
  isOutOfRange: boolean;
  onRetryWithoutGps: () => void;
  onClose: () => void;
}) {
  return (
    <View style={s.card}>
      <View style={[s.iconCircle, { backgroundColor: '#FEE2E2' }]}>
        <Feather name="x-circle" size={32} color="#DC2626" />
      </View>

      <Text style={[s.resultTitle, { color: '#DC2626' }]}>İşlem Başarısız</Text>
      <Text style={s.errorMsg}>{message}</Text>

      {isOutOfRange && (
        <TouchableOpacity style={[s.btn, { backgroundColor: '#F59E0B' }]} onPress={onRetryWithoutGps}>
          <Feather name="wifi-off" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={s.btnText}>GPS Olmadan Dene</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[s.btn, { backgroundColor: '#E2E8F0' }]} onPress={onClose}>
        <Text style={[s.btnText, { color: '#374151' }]}>Geri Dön</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  logoBox: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  logoSub: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
      web:     { boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
    }),
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  employeeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
  },
  timeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  timeText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF9C3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  warnText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  btn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  loadingText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  errorMsg: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
  },
});
