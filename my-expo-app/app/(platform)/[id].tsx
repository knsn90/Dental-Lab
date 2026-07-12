import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Users, Building2, FileText, ClipboardList } from 'lucide-react-native';
import { labDetail, setLabStatus, setLabPlan, PLANS, type PlatformLabDetail, type Plan } from '../../modules/platform/api';

const C = {
  bg: '#0B1220', card: '#131C2E', line: 'rgba(255,255,255,0.07)',
  ink: '#EAF0FB', ink2: '#9FB0CC', ink3: '#63758F', accent: '#4F8DF7',
  green: '#37C285', amber: '#E6A23C', red: '#E5645B',
};
const FONT = Platform.OS === 'web' ? ('Inter Tight, Inter, system-ui, sans-serif' as any) : undefined;
const planTone = (p: string) => (p === 'active' || p === 'pro' || p === 'enterprise' ? C.green : p === 'suspended' ? C.red : C.amber);

export default function PlatformLabDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<PlatformLabDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setD(await labDetail(String(id))); } catch { setD(null); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const doStatus = async (active: boolean) => { setBusy(true); try { await setLabStatus(String(id), active); await load(); } finally { setBusy(false); } };
  const doPlan = async (p: Plan) => { setBusy(true); try { await setLabPlan(String(id), p); await load(); } finally { setBusy(false); } };

  if (!d) {
    return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>;
  }
  const lab = d.lab;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 980, width: '100%', alignSelf: 'center' }}>
        {/* Back */}
        <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <ChevronRight size={16} color={C.ink3} strokeWidth={2} style={{ transform: [{ rotate: '180deg' }] }} />
          <Text style={{ color: C.ink3, fontSize: 13 }}>Laboratuvarlar</Text>
        </Pressable>

        {/* Title */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: lab.is_active ? C.green : C.red }} />
          <Text style={{ fontFamily: FONT, fontSize: 32, fontWeight: '300', letterSpacing: -1.1, color: C.ink }}>{lab.name}</Text>
        </View>
        <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 20 }}>{lab.slug} · {new Date(lab.created_at).toLocaleDateString()}</Text>

        {/* Counts */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          {([['Kullanıcı', d.counts.users, Users], ['Sipariş', d.counts.orders, ClipboardList], ['Klinik', d.counts.clinics, Building2], ['Fatura', d.counts.invoices, FileText]] as const).map(([label, val, Icon]) => (
            <View key={label} style={{ flex: 1, minWidth: 130, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16 }}>
              <Icon size={16} color={C.ink3} strokeWidth={1.8} />
              <Text style={{ fontFamily: FONT, fontSize: 26, fontWeight: '300', color: C.ink, marginTop: 8 }}>{val}</Text>
              <Text style={{ fontSize: 11, color: C.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Plan + status controls */}
        <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 18, marginBottom: 24 }}>
          <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Abonelik</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {PLANS.map((p) => {
              const on = lab.plan === p;
              return (
                <Pressable key={p} disabled={busy} onPress={() => doPlan(p)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? planTone(p) : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: on ? planTone(p) : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: on ? '#0B1220' : C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable disabled={busy || lab.is_active} onPress={() => doStatus(true)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: lab.is_active ? 'rgba(255,255,255,0.04)' : C.green, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ color: lab.is_active ? C.ink3 : '#062017', fontWeight: '700', fontSize: 13 }}>Aktifleştir</Text>
            </Pressable>
            <Pressable disabled={busy || !lab.is_active} onPress={() => doStatus(false)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: !lab.is_active ? 'rgba(255,255,255,0.04)' : C.red, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ color: !lab.is_active ? C.ink3 : '#2a0a08', fontWeight: '700', fontSize: 13 }}>Askıya al</Text>
            </Pressable>
          </View>
        </View>

        {/* Users */}
        <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Kullanıcılar ({d.users.length})</Text>
        <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
          {d.users.map((u, i) => (
            <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '500' }}>{u.name || '—'}</Text>
                <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{u.email || '—'}</Text>
              </View>
              <Text style={{ color: C.ink2, fontSize: 12 }}>{u.user_type}{u.role ? ` · ${u.role}` : ''}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
