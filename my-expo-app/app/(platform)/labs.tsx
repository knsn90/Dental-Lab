import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Building2, CheckCircle2, PauseCircle, Download } from 'lucide-react-native';
import { listLabs, setLabStatus, type PlatformLab } from '../../modules/platform/api';
import { C, FONT, PlatformNav, planTone, downloadCsv } from '../../modules/platform/ui';

type Filter = 'all' | 'active' | 'suspended' | 'trial';

export default function PlatformLabs() {
  const router = useRouter();
  const [labs, setLabs] = useState<PlatformLab[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => { try { setLabs(await listLabs()); } catch { setLabs([]); } }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = labs ?? [];
    if (filter === 'active') list = list.filter((l) => l.is_active);
    else if (filter === 'suspended') list = list.filter((l) => !l.is_active);
    else if (filter === 'trial') list = list.filter((l) => l.plan === 'trial');
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((l) => `${l.name} ${l.slug}`.toLowerCase().includes(s));
    return list;
  }, [labs, q, filter]);

  const toggle = async (l: PlatformLab) => {
    setBusy(l.id);
    try { await setLabStatus(l.id, !l.is_active); await load(); } finally { setBusy(null); }
  };

  const exportCsv = () => {
    downloadCsv('labs.csv', [
      ['Ad', 'Slug', 'Plan', 'Aktif', 'Kullanıcı', 'Sipariş', 'Oluşturma'],
      ...filtered.map((l) => [l.name, l.slug, l.plan, l.is_active ? 'evet' : 'hayır', l.users, l.orders, new Date(l.created_at).toISOString().slice(0, 10)]),
    ]);
  };

  const FILTERS: [Filter, string][] = [['all', 'Tümü'], ['active', 'Aktif'], ['trial', 'Deneme'], ['suspended', 'Askıda']];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1160, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="labs" />

        {/* Controls */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, height: 42, flex: 1, minWidth: 220 }}>
            <Search size={16} color={C.ink3} strokeWidth={1.8} />
            <TextInput value={q} onChangeText={setQ} placeholder="Lab adı veya slug ara…" placeholderTextColor={C.ink3}
              style={{ flex: 1, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
          </View>
          {FILTERS.map(([k, label]) => (
            <Pressable key={k} onPress={() => setFilter(k)}
              style={{ paddingHorizontal: 14, height: 42, justifyContent: 'center', borderRadius: 12, backgroundColor: filter === k ? 'rgba(79,141,247,0.16)' : C.card, borderWidth: 1, borderColor: filter === k ? 'rgba(79,141,247,0.4)' : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ color: filter === k ? C.ink : C.ink2, fontSize: 13, fontWeight: '600' }}>{label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={exportCsv}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 42, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <Download size={15} color={C.ink2} strokeWidth={1.8} />
            <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>CSV</Text>
          </Pressable>
        </View>

        {labs === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : filtered.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center', gap: 8 }}>
            <Building2 size={28} color={C.ink3} strokeWidth={1.5} />
            <Text style={{ color: C.ink3, fontSize: 14 }}>Lab bulunamadı</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={{ color: C.ink3, fontSize: 12, marginBottom: 2 }}>{filtered.length} lab</Text>
            {filtered.map((l) => (
              <Pressable key={l.id} onPress={() => router.push(`/(platform)/${l.id}` as any)}
                style={({ hovered }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: hovered ? C.cardHover : C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 14, paddingHorizontal: 16, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }]}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: l.is_active ? C.green : C.red }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.ink, fontSize: 15, fontWeight: '600' }}>{l.name}</Text>
                  <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>{l.slug}</Text>
                </View>
                <View style={{ width: 66, alignItems: 'flex-end' }}>
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{l.users}</Text>
                  <Text style={{ color: C.ink3, fontSize: 11 }}>kullanıcı</Text>
                </View>
                <View style={{ width: 66, alignItems: 'flex-end' }}>
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{l.orders}</Text>
                  <Text style={{ color: C.ink3, fontSize: 11 }}>sipariş</Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: planTone(l.plan) + '22' }}>
                  <Text style={{ color: planTone(l.plan), fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{l.plan}</Text>
                </View>
                <Pressable onPress={(e: any) => { e.stopPropagation?.(); toggle(l); }} disabled={busy === l.id}
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
