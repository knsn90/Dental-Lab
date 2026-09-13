// modules/kiosk/screens/MyAccessCodeSection.tsx
// Ayarlar → "Giriş Kodum": kullanıcı tablet giriş kodunu (6 haneli PIN) belirler/kaldırır.
// Herkese açık (teknisyen/doktor/klinik dahil) — tablette bu kodla giriş yapılır.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { myCodeStatus, setMyCode, clearMyCode } from '../api';
import { confirmAsync } from '../../../core/util/confirm';
import { toast } from '../../../core/ui/Toast';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

const INK = '#0F172A';
const MUTED = '#64748B';
const DANGER = '#DC2626';

export function MyAccessCodeSection({ accentColor = '#3563A8' }: { accentColor?: string }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const ink = isDark ? (T.ink as string) : INK;
  const muted = isDark ? (T.ink3 as string) : MUTED;
  const hair = isDark ? (T.hairline as string) : '#E6EAF0';
  const [loading, setLoading] = useState(true);
  const [hasCode, setHasCode] = useState(false);
  const [oldCode, setOldCode] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const refresh = () => { setLoading(true); myCodeStatus().then((s) => { setHasCode(s.hasCode); setLoading(false); }); };
  useEffect(refresh, []);

  const save = async () => {
    setErr('');
    if (hasCode && !/^[0-9]{6}$/.test(oldCode)) { setErr('Mevcut kodunuzu girin.'); return; }
    if (!/^[0-9]{6}$/.test(code)) { setErr('Kod 6 haneli (rakam) olmalı.'); return; }
    if (code !== confirm) { setErr('Kodlar eşleşmiyor.'); return; }
    setBusy(true);
    const res = await setMyCode(code, hasCode ? oldCode : undefined);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error === 'old_code_mismatch' ? 'Mevcut kod yanlış.' : 'Kaydedilemedi. Tekrar deneyin.');
      return;
    }
    setOldCode(''); setCode(''); setConfirm(''); setHasCode(true);
    toast.success('Giriş kodunuz kaydedildi.');
  };

  const remove = async () => {
    const ok = await confirmAsync('Kodu kaldır', 'Tablet giriş kodunuz kaldırılsın mı? Tabletlerde kodla giriş yapamazsınız.', { confirmText: 'Kaldır', destructive: true });
    if (!ok) return;
    setBusy(true);
    const res = await clearMyCode();
    setBusy(false);
    if (res.ok) { setHasCode(false); toast.success('Kod kaldırıldı.'); }
  };

  const inputStyle = (bad?: boolean) => ({
    borderWidth: 1, borderColor: bad ? DANGER : (isDark ? (T.hairline as string) : '#D4DAE3'), borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 20, letterSpacing: 6, textAlign: 'center' as const, color: ink, maxWidth: 220,
    backgroundColor: isDark ? (T.cardSoft as string) : undefined,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  });

  if (loading) return <View style={{ padding: 24 }}><ActivityIndicator color={accentColor} /></View>;

  return (
    <View style={{ padding: 20, gap: 16, maxWidth: 480 }}>
      <View>
        <Text style={{ fontSize: 18, fontWeight: '700', color: ink }}>Giriş Kodum</Text>
        <Text style={{ fontSize: 13, color: muted, marginTop: 4, lineHeight: 19 }}>
          Lab tabletlerinde e-posta/şifre yerine bu 6 haneli kodla giriş yaparsınız. Kodu yalnız
          siz bilirsiniz; yönetici yalnız sıfırlayabilir.
        </Text>
      </View>

      {hasCode && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(45,154,107,0.10)', borderRadius: 10, padding: 12 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2D9A6B' }} />
          <Text style={{ fontSize: 13, color: '#0F6E50', fontWeight: '600' }}>Giriş kodunuz tanımlı.</Text>
        </View>
      )}

      <View style={{ gap: 10 }}>
        {hasCode && (
          <>
            <Text style={{ fontSize: 13, fontWeight: '600', color: ink }}>Mevcut kod</Text>
            <TextInput value={oldCode} onChangeText={(t) => setOldCode(t.replace(/[^0-9]/g, '').slice(0, 6))} placeholder="••••••" keyboardType="number-pad" secureTextEntry style={inputStyle(!!err)} />
          </>
        )}
        <Text style={{ fontSize: 13, fontWeight: '600', color: ink, marginTop: hasCode ? 4 : 0 }}>{hasCode ? 'Yeni kod' : 'Kod belirle'} (6 hane)</Text>
        <TextInput value={code} onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))} placeholder="••••••" keyboardType="number-pad" secureTextEntry style={inputStyle(!!err)} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: ink, marginTop: 4 }}>Tekrar</Text>
        <TextInput value={confirm} onChangeText={(t) => setConfirm(t.replace(/[^0-9]/g, '').slice(0, 6))} placeholder="••••••" keyboardType="number-pad" secureTextEntry style={inputStyle(!!err)} />
      </View>

      {err ? <Text style={{ color: DANGER, fontSize: 13 }}>{err}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Pressable onPress={save} disabled={busy} style={{ backgroundColor: accentColor, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, opacity: busy ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Kaydet</Text>}
        </Pressable>
        {hasCode && (
          <Pressable onPress={remove} disabled={busy} style={{ borderWidth: 1, borderColor: hair, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <Text style={{ color: DANGER, fontWeight: '600' }}>Kodu kaldır</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
