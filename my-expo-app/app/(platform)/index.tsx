import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Building2, CheckCircle2, PauseCircle, RefreshCw, ChevronLeft } from 'lucide-react-native';
import { supabase } from '../../core/api/supabase';
import { listLabs, setLabStatus, type PlatformLab } from '../../modules/platform/api';

const C = {
  bg: '#0B1220', card: '#131C2E', cardHover: '#18233A', line: 'rgba(255,255,255,0.07)',
  ink: '#EAF0FB', ink2: '#9FB0CC', ink3: '#63758F', accent: '#4F8DF7',
  green: '#37C285', amber: '#E6A23C', red: '#E5645B',
};
const FONT = Platform.OS === 'web' ? ('Inter Tight, Inter, system-ui, sans-serif' as any) : undefined;

const planTone = (p: string) =>
  p === 'active' || p === 'pro' || p === 'enterprise' ? C.green : p === 'suspended' ? C.red : C.amber;

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 140, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16 }}>
      <Text style={{ fontFamily: FONT, fontSize: 30, fontWeight: '300', letterSpacing: -1, color: tone ?? C.ink }}>{value}</Text>
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: C.ink3, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

export default function PlatformLabsScreen() {
  const router = useRouter();
  const [labs, setLabs] = useState<PlatformLab[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setLabs(await listLabs()); } catch { setLabs([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const list = labs ?? [];
    const s = q.trim().toLowerCase();
    return s ? list.filter((l) => `${l.name} ${l.slug}`.toLowerCase().includes(s)) : list;
  }, [labs, q]);

  const kpi = useMemo(() => {
    const list = labs ?? [];
    return {
      total: list.length,
      active: list.filter((l) => l.is_active).length,
      trial: list.filter((l) => l.plan === 'trial').length,
      orders: list.reduce((a, l) => a + l.orders, 0),
    };
  }, [labs]);

  const toggle = async (l: PlatformLab) => {
    setBusy(l.id);
    try { await setLabStatus(l.id, !l.is_active); await load(); } finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1160, width: '100%', alignSelf: 'center' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: C.accent }}>Siman · Platform</Text>
            <Text style={{ fontFamily: FONT, fontSize: 34, fontWeight: '300', letterSpacing: -1.2, color: C.ink, marginTop: 2 }}>Laboratuvarlar</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={load} style={btn(C.card)}>
              <RefreshCw size={16} color={C.ink2} strokeWidth={2} />
            </Pressable>
            <Pressable onPress={() => supabase.auth.signOut()} style={btn(C.card)}>
              <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>Çıkış</Text>
            </Pressable>
          </View>
        </View>

        {/* KPIs */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <Kpi label="Toplam lab" value={kpi.total} />
          <Kpi label="Aktif" value={kpi.active} tone={C.green} />
          <Kpi label="Deneme" value={kpi.trial} tone={C.amber} />
          <Kpi label="Toplam sipariş" value={kpi.orders} />
        </View>

        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, height: 44, marginBottom: 16 }}>
          <Search size={16} color={C.ink3} strokeWidth={1.8} />
          <TextInput
            value={q} onChangeText={setQ} placeholder="Lab adı veya slug ara…" placeholderTextColor={C.ink3}
            style={{ flex: 1, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
          />
        </View>

        {/* List */}
        {labs === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : filtered.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center', gap: 8 }}>
            <Building2 size={28} color={C.ink3} strokeWidth={1.5} />
            <Text style={{ color: C.ink3, fontSize: 14 }}>Lab bulunamadı</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {filtered.map((l) => (
              <Pressable key={l.id} onPress={() => router.push(`/(platform)/${l.id}` as any)}
                style={({ hovered }: any) => [{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: hovered ? C.cardHover : C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line,
                  paddingVertical: 14, paddingHorizontal: 16,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }]}>
                {/* status dot */}
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: l.is_active ? C.green : C.red }} />
                {/* name + slug */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.ink, fontSize: 15, fontWeight: '600' }}>{l.name}</Text>
                  <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>{l.slug}</Text>
                </View>
                {/* counts */}
                <View style={{ width: 70, alignItems: 'flex-end' }}>
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{l.users}</Text>
                  <Text style={{ color: C.ink3, fontSize: 11 }}>kullanıcı</Text>
                </View>
                <View style={{ width: 70, alignItems: 'flex-end' }}>
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{l.orders}</Text>
                  <Text style={{ color: C.ink3, fontSize: 11 }}>sipariş</Text>
                </View>
                {/* plan badge */}
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: planTone(l.plan) + '22' }}>
                  <Text style={{ color: planTone(l.plan), fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>{l.plan}</Text>
                </View>
                {/* activate/suspend */}
                <Pressable onPress={(e) => { e.stopPropagation?.(); toggle(l); }} disabled={busy === l.id}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}>
                  {busy === l.id ? <ActivityIndicator size="small" color={C.ink2} />
                    : l.is_active ? <PauseCircle size={18} color={C.amber} strokeWidth={1.8} />
                    : <CheckCircle2 size={18} color={C.green} strokeWidth={1.8} />}
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const btn = (bg: string): any => ({
  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 40, minWidth: 40, paddingHorizontal: 12, borderRadius: 10,
  backgroundColor: bg, borderWidth: 1, borderColor: C.line,
  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
});
