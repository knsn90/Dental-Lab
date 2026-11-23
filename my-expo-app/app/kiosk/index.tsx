/**
 * /kiosk — Tablet giriş ekranı (public, oturumsuz).
 *
 *  • Cihaz eşleşmemişse: eşleştirme kodu ekranı (admin panelde üretilen 8 haneli kod).
 *  • Eşleşmişse: önce KİŞİ seçilir (giriş kodu tanımlı ekip), sonra o kişinin 6 haneli
 *    kodu → kiosk-login → verifyOtp → panel. Kişi seçimi zorunlu: yalnız-kod girişte
 *    aynı kodu seçen iki kişi birbirinin hesabına girebiliyordu.
 *
 *  Not: /kiosk isPublicRoute'ta (app/_layout.tsx); oturum açılınca router.replace('/')
 *  ile kök routing kullanıcıyı kendi paneline yönlendirir.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Delete, ChevronLeft, RefreshCw } from '../../core/ui/icons';
import { getKioskDevice, saveKioskDevice, clearKioskDevice, type KioskDevice } from '../../core/kiosk/deviceStore';
import { useKioskMode } from '../../core/kiosk/kioskModeStore';
import { kioskPair, kioskLogin, kioskListUsers, kioskErrorText, type KioskUser } from '../../modules/kiosk/api';
import { confirmAsync } from '../../core/util/confirm';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { autoT } from '../../core/i18n/autoTranslate';

const ACCENT = '#3563A8';
const DANGER = '#DC2626';
const CODE_LEN = 6;
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

/** Açık değerler eski sabitlerle birebir; koyu tema yalnız eklenir. */
function useKioskPalette() {
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  return isDark
    ? {
        isDark, bg: '#0E0E0E', card: '#1B1916', ink: '#F7F2E9', muted: 'rgba(247,242,233,0.62)',
        faint: 'rgba(247,242,233,0.45)', border: 'rgba(255,255,255,0.10)', field: 'rgba(255,255,255,0.14)',
        keyPressed: 'rgba(255,255,255,0.08)', dotOff: 'rgba(255,255,255,0.18)', accent: '#93C5FD',
        btnBg: '#004B87', btnOff: 'rgba(255,255,255,0.12)', danger: '#F87171', avatarBg: 'rgba(147,197,253,0.16)',
      }
    : {
        isDark, bg: '#F5F7FB', card: '#FFFFFF', ink: '#0F172A', muted: '#64748B',
        faint: '#94A3B8', border: '#E6EAF0', field: '#D4DAE3',
        keyPressed: '#E7ECF3', dotOff: '#D4DAE3', accent: ACCENT,
        btnBg: ACCENT, btnOff: '#AEBACB', danger: DANGER, avatarBg: 'rgba(53,99,168,0.10)',
      };
}

export default function KioskScreen() {
  const router = useRouter();
  const P = useKioskPalette();
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
    const ok = await confirmAsync(autoT('Cihazı kaldır'), autoT('Bu tablet lab bağlantısından çıkarılsın mı? Yeniden kullanmak için tekrar eşleştirme gerekir.'), { confirmText: autoT('Kaldır'), destructive: true });
    if (!ok) return;
    await clearKioskDevice();
    useKioskMode.getState().setKiosk(false);
    setDevice(null);
    // Kiosk bayrağı temizlendi → normal e-posta girişine geç (kullanıcı /kiosk'ta kalmasın).
    router.replace('/(auth)/login' as any);
  }, [router]);
  const onDeviceInvalid = useCallback(async () => {
    await clearKioskDevice();
    setDevice(null);
  }, []);

  if (!ready) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: P.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={P.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: P.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: P.ink, marginBottom: 4 }}>Siman</Text>
        {device
          ? <SignIn device={device} onUnpair={onUnpair} onDeviceInvalid={onDeviceInvalid} onSuccess={() => { useKioskMode.getState().setKiosk(true); router.replace('/' as any); }} />
          : <PairForm onPaired={onPaired} />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ───────────────────────── Eşleştirme ─────────────────────────
function PairForm({ onPaired }: { onPaired: (d: KioskDevice) => void }) {
  const P = useKioskPalette();
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

  const canSubmit = code.length === 8 && !busy;
  return (
    <View style={{ width: '100%', maxWidth: 420, backgroundColor: P.card, borderRadius: 24, padding: 28, borderWidth: 1, borderColor: P.border }}>
      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: P.muted, marginBottom: 8 }}>Tableti eşleştir</Text>
      <Text style={{ fontSize: 14, color: P.muted, marginBottom: 18, lineHeight: 20 }}>
        Yöneticinizin panelde oluşturduğu 8 haneli eşleştirme kodunu girin.
      </Text>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8))}
        placeholder="ABCD1234"
        placeholderTextColor={P.faint}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        accessibilityLabel={autoT('Eşleştirme kodu')}
        onSubmitEditing={() => { if (canSubmit) submit(); }}
        style={{
          borderWidth: 1, borderColor: err ? P.danger : P.field, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
          fontSize: 24, letterSpacing: 6, textAlign: 'center', color: P.ink, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, marginBottom: 12,
        }}
      />
      {err ? <Text style={{ color: P.danger, fontSize: 13, marginBottom: 12 }}>{err}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        accessibilityRole="button"
        style={{ backgroundColor: canSubmit ? P.btnBg : P.btnOff, borderRadius: 14, paddingVertical: 15, alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: code.length === 8 ? 'pointer' : 'default' } as any : {}) }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Eşleştir</Text>}
      </Pressable>
    </View>
  );
}

// ───────────────────────── Kişi seçimi + kod ─────────────────────────
function SignIn({ device, onSuccess, onUnpair, onDeviceInvalid }: {
  device: KioskDevice; onSuccess: () => void; onUnpair: () => void; onDeviceInvalid: () => void;
}) {
  const P = useKioskPalette();
  const [users, setUsers] = useState<KioskUser[] | null>(null);
  const [listErr, setListErr] = useState('');
  const [picked, setPicked] = useState<KioskUser | null>(null);

  const load = useCallback(async () => {
    setListErr(''); setUsers(null);
    const res = await kioskListUsers(device.token);
    if (!res.ok) {
      if (res.error === 'device_invalid') { onDeviceInvalid(); return; }
      setListErr(kioskErrorText(res.error)); setUsers([]); return;
    }
    setUsers(res.users);
    // Tek kişi varsa doğrudan koda geç.
    if (res.users.length === 1) setPicked(res.users[0]);
  }, [device.token, onDeviceInvalid]);
  useEffect(() => { load(); }, [load]);

  const header = (
    <>
      <Text style={{ fontSize: 15, color: P.muted, marginTop: 4 }}>{device.labName || autoT('Laboratuvar')}</Text>
      <Text style={{ fontSize: 13, color: P.faint, marginBottom: 20 }}>{device.deviceName}</Text>
    </>
  );
  const footer = (
    <Pressable onPress={onUnpair} accessibilityRole="button" style={{ marginTop: 24, padding: 6, ...webPointer }}>
      <Text style={{ fontSize: 12, color: P.faint }}>Bu cihazı kaldır</Text>
    </Pressable>
  );

  if (picked) {
    return (
      <View style={{ width: '100%', maxWidth: 380, alignItems: 'center' }}>
        {header}
        <CodePad
          device={device}
          user={picked}
          canChangeUser={(users?.length ?? 0) !== 1}
          onBack={() => setPicked(null)}
          onSuccess={onSuccess}
          onDeviceInvalid={onDeviceInvalid}
        />
        {footer}
      </View>
    );
  }

  return (
    <View style={{ width: '100%', maxWidth: 560, alignItems: 'center' }}>
      {header}
      <Text style={{ fontSize: 15, fontWeight: '600', color: P.ink, marginBottom: 16 }}>Kim giriş yapıyor?</Text>
      {users === null ? (
        <ActivityIndicator color={P.accent} style={{ marginVertical: 24 }} />
      ) : listErr ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Text style={{ color: P.danger, fontSize: 13, textAlign: 'center' }}>{listErr}</Text>
          <Pressable onPress={load} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, ...webPointer }}>
            <RefreshCw size={15} color={P.ink} strokeWidth={1.8} />
            <Text style={{ color: P.ink, fontWeight: '600', fontSize: 13 }}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : users.length === 0 ? (
        <Text style={{ color: P.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 340 }}>
          Bu laboratuvarda henüz giriş kodu belirlemiş kimse yok. Kod, Ayarlar › Tablet Girişi bölümünden belirlenir.
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
          {users.map((u) => <UserTile key={u.user_id} user={u} onPress={() => setPicked(u)} />)}
        </View>
      )}
      {footer}
    </View>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase('tr-TR');
}

function Avatar({ user, size }: { user: KioskUser; size: number }) {
  const P = useKioskPalette();
  if (user.avatar_url) {
    return <Image source={{ uri: user.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: P.avatarBg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: P.accent, fontWeight: '700', fontSize: size * 0.36 }}>{initialsOf(user.full_name)}</Text>
    </View>
  );
}

function UserTile({ user, onPress }: { user: KioskUser; onPress: () => void }) {
  const P = useKioskPalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={user.full_name}
      style={({ pressed }: any) => ({
        width: 124, alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 10, borderRadius: 18,
        backgroundColor: pressed ? P.keyPressed : P.card, borderWidth: 1, borderColor: P.border, ...webPointer,
      })}
    >
      <Avatar user={user} size={56} />
      <Text numberOfLines={2} style={{ color: P.ink, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{user.full_name}</Text>
    </Pressable>
  );
}

// ───────────────────────── Kod tuş takımı ─────────────────────────
function CodePad({ device, user, canChangeUser, onBack, onSuccess, onDeviceInvalid }: {
  device: KioskDevice; user: KioskUser; canChangeUser: boolean; onBack: () => void; onSuccess: () => void; onDeviceInvalid: () => void;
}) {
  const P = useKioskPalette();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = useCallback(async (full: string) => {
    setBusy(true); setErr('');
    const res = await kioskLogin(device.token, user.user_id, full);
    if (res.ok) { onSuccess(); return; }
    setBusy(false); setCode(''); setErr(kioskErrorText(res.error));
    if (res.error === 'device_invalid') { onDeviceInvalid(); }
  }, [device.token, user.user_id, onSuccess, onDeviceInvalid]);

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

  // Fiziksel klavye (web/tablet klavyesi): rakam + geri silme.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Escape' && canChangeUser) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Avatar user={user} size={40} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: P.ink }}>{user.full_name}</Text>
      </View>
      {canChangeUser && (
        <Pressable onPress={onBack} disabled={busy} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14, padding: 4, ...webPointer }}>
          <ChevronLeft size={15} color={P.accent} strokeWidth={2} />
          <Text style={{ fontSize: 13, color: P.accent, fontWeight: '600' }}>Başka kişi</Text>
        </Pressable>
      )}
      <Text style={{ fontSize: 15, fontWeight: '600', color: P.ink, marginBottom: 16 }}>Giriş kodunuzu girin</Text>

      {/* 6 nokta göstergesi */}
      <View accessibilityLabel={`${code.length} / ${CODE_LEN}`} style={{ flexDirection: 'row', gap: 14, marginBottom: 10, minHeight: 20 }}>
        {Array.from({ length: CODE_LEN }).map((_, i) => (
          <View key={i} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: i < code.length ? P.accent : P.dotOff }} />
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={{ minHeight: 20, color: P.danger, fontSize: 13, marginBottom: 10, textAlign: 'center', maxWidth: 320 }}>{err}</Text>

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
              accessibilityRole="button"
              accessibilityLabel={isDel ? autoT('Sil') : k}
              style={({ pressed }: any) => ({
                width: 84, height: 84, borderRadius: 42, backgroundColor: pressed ? P.keyPressed : P.card,
                borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center', ...webPointer,
              })}
            >
              {isDel ? <Delete size={26} color={P.ink} strokeWidth={1.8} /> : <Text style={{ fontSize: 30, fontWeight: '500', color: P.ink }}>{k}</Text>}
            </Pressable>
          );
        })}
      </View>

      {busy ? <ActivityIndicator color={P.accent} style={{ marginTop: 18 }} /> : null}
    </View>
  );
}
