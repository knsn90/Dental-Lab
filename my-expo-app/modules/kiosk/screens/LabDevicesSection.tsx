// modules/kiosk/screens/LabDevicesSection.tsx
// Ayarlar → "Tabletler": lab yöneticisi/admin kayıtlı tabletleri yönetir.
// Cihaz ekle → eşleştirme kodu; yeniden eşleştir; iptal. (RLS: manage_settings)
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { Tablet, Plus, RefreshCw, Trash2 } from '../../../core/ui/icons';
import { listLabDevices, createLabDevice, repairLabDevice, revokeLabDevice, type LabDevice } from '../api';
import { confirmAsync } from '../../../core/util/confirm';
import { toast } from '../../../core/ui/Toast';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

const INK = '#0F172A';
const MUTED = '#64748B';
const DANGER = '#DC2626';

function fmt(ts: string | null): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; }
}
function statusOf(d: LabDevice): { label: string; color: string } {
  if (!d.active) return { label: 'İptal edildi', color: MUTED };
  if (d.device_token_hash) return { label: 'Aktif', color: '#2D9A6B' };
  return { label: 'Eşleşme bekliyor', color: '#D97706' };
}

export function LabDevicesSection({ accentColor = '#3563A8' }: { accentColor?: string }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const ink = isDark ? (T.ink as string) : INK;
  const muted = isDark ? (T.ink3 as string) : MUTED;
  const hair = isDark ? (T.hairline as string) : '#E6EAF0';
  const hairInput = isDark ? (T.hairline as string) : '#D4DAE3';
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<LabDevice[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<{ name: string; code: string; expires: string } | null>(null);

  const refresh = () => { setLoading(true); listLabDevices().then((d) => { setDevices(d); setLoading(false); }); };
  useEffect(refresh, []);

  const add = async () => {
    if (!name.trim()) { toast.error('Cihaz adı girin.'); return; }
    setBusy(true);
    const res = await createLabDevice(name.trim());
    setBusy(false);
    if (!res.ok) { toast.error('Oluşturulamadı.'); return; }
    setPairing({ name: name.trim(), code: res.pairing_code ?? '', expires: res.pairing_expires_at ?? '' });
    setName('');
    refresh();
  };

  const repair = async (d: LabDevice) => {
    const res = await repairLabDevice(d.id);
    if (!res.ok) { toast.error('İşlem başarısız.'); return; }
    setPairing({ name: d.name, code: res.pairing_code ?? '', expires: res.pairing_expires_at ?? '' });
    refresh();
  };

  const revoke = async (d: LabDevice) => {
    const ok = await confirmAsync('Cihazı kaldır', `"${d.name}" iptal edilsin mi? Bu tablette kodla giriş durur; yeniden kullanmak için tekrar eşleştirme gerekir.`, { confirmText: 'İptal Et', destructive: true });
    if (!ok) return;
    const res = await revokeLabDevice(d.id);
    if (res.ok) { toast.success('Cihaz iptal edildi.'); refresh(); }
    else toast.error('İşlem başarısız.');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View>
        <Text style={{ fontSize: 18, fontWeight: '700', color: ink }}>Tabletler</Text>
        <Text style={{ fontSize: 13, color: muted, marginTop: 4, lineHeight: 19 }}>
          Personelin giriş koduyla açabileceği kayıtlı tabletler. Yeni tablet ekleyip eşleştirme
          kodunu tablette <Text style={{ fontWeight: '700' }}>siman.app/kiosk</Text> ekranına girin.
        </Text>
      </View>

      {/* Eşleştirme kodu kutusu */}
      {pairing && (
        <View style={{ borderWidth: 1, borderColor: accentColor, borderRadius: 16, padding: 18, backgroundColor: 'rgba(53,99,168,0.06)' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Eşleştirme Kodu · {pairing.name}</Text>
          <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: 8, color: ink, marginVertical: 8, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>{pairing.code}</Text>
          <Text style={{ fontSize: 12.5, color: muted }}>Tablette <Text style={{ fontWeight: '700', color: ink }}>siman.app/kiosk</Text> aç → bu kodu gir. Son geçerlilik: {fmt(pairing.expires)}</Text>
          <Pressable onPress={() => setPairing(null)} style={{ marginTop: 10, alignSelf: 'flex-start', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <Text style={{ fontSize: 13, color: accentColor, fontWeight: '600' }}>Kapat</Text>
          </Pressable>
        </View>
      )}

      {/* Yeni tablet ekle */}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextInput
          value={name} onChangeText={setName} placeholder="Cihaz adı (ör. Üretim Tableti 1)"
          style={{ flex: 1, minWidth: 200, borderWidth: 1, backgroundColor: isDark ? (T.cardSoft as string) : undefined, borderColor: hairInput, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: ink }}
        />
        <Pressable onPress={add} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accentColor, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, opacity: busy ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <Plus size={16} color="#fff" strokeWidth={2.2} />
          <Text style={{ color: '#fff', fontWeight: '700' }}>Tablet Ekle</Text>
        </Pressable>
      </View>

      {/* Liste */}
      {loading ? <ActivityIndicator color={accentColor} style={{ marginTop: 16 }} />
        : devices.length === 0 ? <Text style={{ color: muted, fontSize: 13, marginTop: 8 }}>Henüz tablet eklenmedi.</Text>
        : devices.map((d) => {
            const st = statusOf(d);
            return (
              <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: hair, borderRadius: 14, padding: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(53,99,168,0.10)', alignItems: 'center', justifyContent: 'center' }}>
                  <Tablet size={20} color={accentColor} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: ink }} numberOfLines={1}>{d.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: st.color }} />
                    <Text style={{ fontSize: 12, color: st.color, fontWeight: '600' }}>{st.label}</Text>
                    {d.active && d.device_token_hash ? (
                      <Text style={{ fontSize: 11, color: muted }}>· Son görülme: {fmt(d.last_seen_at)}</Text>
                    ) : null}
                  </View>
                </View>
                {d.active && (
                  <>
                    <Pressable onPress={() => repair(d)} style={{ padding: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                      <RefreshCw size={17} color={muted} strokeWidth={1.8} />
                    </Pressable>
                    <Pressable onPress={() => revoke(d)} style={{ padding: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                      <Trash2 size={17} color={DANGER} strokeWidth={1.8} />
                    </Pressable>
                  </>
                )}
              </View>
            );
          })}
    </ScrollView>
  );
}
