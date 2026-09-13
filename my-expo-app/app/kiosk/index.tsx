/**
 * /kiosk — Tablet giriş kodu ekranı (public, oturumsuz).
 *
 *  • Cihaz eşleşmemişse: eşleştirme kodu ekranı (admin panelde üretilen 8 haneli kod).
 *  • Eşleşmişse: 6 haneli kişisel kod tuş takımı → kiosk-login → verifyOtp → panel.
 *
 *  Not: /kiosk isPublicRoute'ta (app/_layout.tsx); oturum açılınca router.replace('/')
 *  ile kök routing kullanıcıyı kendi paneline yönlendirir.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Delete } from '../../core/ui/icons';
import { getKioskDevice, saveKioskDevice, clearKioskDevice, type KioskDevice } from '../../core/kiosk/deviceStore';
import { useKioskMode } from '../../core/kiosk/kioskModeStore';
import { kioskPair, kioskLogin, kioskErrorText } from '../../modules/kiosk/api';
import { confirmAsync } from '../../core/util/confirm';

const BG = '#F5F7FB';
const CARD = '#FFFFFF';
const INK = '#0F172A';
const MUTED = '#64748B';
const ACCENT = '#3563A8';
const DANGER = '#DC2626';
const CODE_LEN = 6;

export default function KioskScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState<KioskDevice | null>(null);

  useEffect(() => {
    getKioskDevice().then((d) => { setDevice(d); setReady(true); });
  }, []);

  const onPaired = useCallback(async (d: KioskDevice) => {
    await saveKioskDevice(d);                 // ham jetonu güvenli depoya yaz (kalıcı)
    useKioskMode.getState().setKiosk(true);   // bu tablet artık kiosk → çıkış /kiosk'a döner
    setDevice(d);
  }, []);
  const onUnpair = useCallback(async () => {
    const ok = await confirmAsync('Cihazı kaldır', 'Bu tablet lab bağlantısından çıkarılsın mı? Yeniden kullanmak için tekrar eşleştirme gerekir.', { confirmText: 'Kaldır', destructive: true });
    if (!ok) return;
    await clearKioskDevice();
    useKioskMode.getState().setKiosk(false);
    setDevice(null);
    // Kiosk bayrağı temizlendi → normal e-posta girişine geç (kullanıcı /kiosk'ta kalmasın).
    router.replace('/(auth)/login' as any);
  }, [router]);

  if (!ready) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={ACCENT} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: INK, marginBottom: 4 }}>Siman</Text>
        {device
          ? <CodePad device={device} onUnpair={onUnpair} onSuccess={() => { useKioskMode.getState().setKiosk(true); router.replace('/' as any); }} />
          : <PairForm onPaired={onPaired} />}
      </View>
    </SafeAreaView>
  );
}

// ───────────────────────── Eşleştirme ─────────────────────────
function PairForm({ onPaired }: { onPaired: (d: KioskDevice) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr(''); setBusy(true);
    const res = await kioskPair(code);
    setBusy(false);
    if (!res.ok) { setErr(kioskErrorText(res.error)); return; }
    onPaired({ token: res.device_token!, deviceName: res.device_name ?? '', labName: res.lab_name ?? '' });
  };

  return (
    <View style={{ width: '100%', maxWidth: 420, backgroundColor: CARD, borderRadius: 24, padding: 28, borderWidth: 1, borderColor: '#E6EAF0' }}>
      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>Tableti eşleştir</Text>
      <Text style={{ fontSize: 14, color: MUTED, marginBottom: 18, lineHeight: 20 }}>
        Yöneticinizin panelde oluşturduğu 8 haneli eşleştirme kodunu girin.
      </Text>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8))}
        placeholder="ABCD1234"
        autoCapitalize="characters"
        autoCorrect={false}
        style={{
          borderWidth: 1, borderColor: err ? DANGER : '#D4DAE3', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
          fontSize: 24, letterSpacing: 6, textAlign: 'center', color: INK, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, marginBottom: 12,
        }}
      />
      {err ? <Text style={{ color: DANGER, fontSize: 13, marginBottom: 12 }}>{err}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={busy || code.length !== 8}
        style={{ backgroundColor: code.length === 8 && !busy ? ACCENT : '#AEBACb', borderRadius: 14, paddingVertical: 15, alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: code.length === 8 ? 'pointer' : 'default' } as any : {}) }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Eşleştir</Text>}
      </Pressable>
    </View>
  );
}

// ───────────────────────── Kod tuş takımı ─────────────────────────
function CodePad({ device, onSuccess, onUnpair }: { device: KioskDevice; onSuccess: () => void; onUnpair: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = useCallback(async (full: string) => {
    setBusy(true); setErr('');
    const res = await kioskLogin(device.token, full);
    if (res.ok) { onSuccess(); return; }
    setBusy(false); setCode(''); setErr(kioskErrorText(res.error));
    if (res.error === 'device_invalid') { await clearKioskDevice(); }
  }, [device.token, onSuccess]);

  const press = (d: string) => {
    if (busy) return;
    setErr('');
    setCode((prev) => {
      if (prev.length >= CODE_LEN) return prev;
      const next = prev + d;
      if (next.length === CODE_LEN) submit(next);
      return next;
    });
  };
  const back = () => { if (!busy) setCode((p) => p.slice(0, -1)); };

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={{ width: '100%', maxWidth: 380, alignItems: 'center' }}>
      <Text style={{ fontSize: 15, color: MUTED, marginTop: 4 }}>{device.labName || 'Laboratuvar'}</Text>
      <Text style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20 }}>{device.deviceName}</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: INK, marginBottom: 16 }}>Giriş kodunuzu girin</Text>

      {/* 6 nokta göstergesi */}
      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 10, minHeight: 20 }}>
        {Array.from({ length: CODE_LEN }).map((_, i) => (
          <View key={i} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: i < code.length ? ACCENT : '#D4DAE3' }} />
        ))}
      </View>
      <Text style={{ height: 20, color: DANGER, fontSize: 13, marginBottom: 10 }}>{err}</Text>

      {/* Tuş takımı */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 300, justifyContent: 'center', gap: 12, opacity: busy ? 0.5 : 1 }}>
        {KEYS.map((k, i) => {
          if (k === '') return <View key={i} style={{ width: 84, height: 84 }} />;
          const isDel = k === 'del';
          return (
            <Pressable
              key={i}
              onPress={() => (isDel ? back() : press(k))}
              disabled={busy}
              style={({ pressed }: any) => ({
                width: 84, height: 84, borderRadius: 42, backgroundColor: pressed ? '#E7ECF3' : CARD,
                borderWidth: 1, borderColor: '#E6EAF0', alignItems: 'center', justifyContent: 'center',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              {isDel ? <Delete size={26} color={INK} strokeWidth={1.8} /> : <Text style={{ fontSize: 30, fontWeight: '500', color: INK }}>{k}</Text>}
            </Pressable>
          );
        })}
      </View>

      {busy ? <ActivityIndicator color={ACCENT} style={{ marginTop: 18 }} /> : (
        <Pressable onPress={onUnpair} style={{ marginTop: 24, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <Text style={{ fontSize: 12, color: '#94A3B8' }}>Bu cihazı kaldır</Text>
        </Pressable>
      )}
    </View>
  );
}
