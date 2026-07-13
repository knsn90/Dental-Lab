import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, AlertTriangle } from 'lucide-react-native';
import { labSnapshot, type LabSnapshot } from '../../../modules/platform/api';
import { C, FONT, SERIF, Kpi, Panel, SectionLabel, Chip, hexA } from '../../../modules/platform/ui';

const orderTone = (s?: string | null) =>
  s === 'delivered' ? C.green : s === 'production' || s === 'in_production' ? C.accent : s === 'qc' ? C.violet : C.amber;

export default function PlatformViewLab() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<LabSnapshot | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setD(await labSnapshot(String(id))); } catch { setD(null); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>;
  const lab = d.lab;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Salt-okunur banner */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: hexA(C.amber, 0.14), borderBottomWidth: 1, borderBottomColor: hexA(C.amber, 0.3), paddingVertical: 11, paddingHorizontal: 20 }}>
        <Eye size={16} color={C.amber} strokeWidth={2} />
        <Text style={{ color: C.amber, fontSize: 13, fontWeight: '700', flex: 1 }}>
          SALT-OKUNUR · «{lab.name}» olarak görüntülüyorsun (platform admin)
        </Text>
        <Pressable onPress={() => router.replace(`/(platform)/${id}` as any)}
          style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: hexA(C.ink, 0.06), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <Text style={{ color: C.ink, fontSize: 12, fontWeight: '700' }}>Çık</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
        <View style={{ paddingBottom: 22, marginBottom: 26, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <Text style={{ ...SERIF, fontSize: 40, letterSpacing: -1.4, lineHeight: 44, color: C.ink }}>{lab.name}</Text>
          <Text style={{ color: C.ink3, fontSize: 13, marginTop: 8 }}>{lab.slug} · {lab.plan} · {lab.is_active ? 'aktif' : 'askıda'}</Text>
        </View>

        {/* Counts */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 26 }}>
          <Kpi label="Kullanıcı" value={d.counts.users} />
          <Kpi label="Sipariş" value={d.counts.orders} />
          <Kpi label="Klinik" value={d.counts.clinics} />
          <Kpi label="Açık talep" value={d.counts.open_tickets} tone={d.counts.open_tickets > 0 ? C.amber : C.ink} />
        </View>

        {/* Son siparişler */}
        <SectionLabel>{`Son siparişler (${d.recent_orders.length})`}</SectionLabel>
        <Panel padding={0} style={{ marginBottom: 24 }}>
          {d.recent_orders.length === 0 ? <Empty /> : d.recent_orders.map((o, i) => (
            <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT, width: 88 }} numberOfLines={1}>{o.order_number || o.id.slice(0, 8)}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.ink, fontSize: 13.5, fontWeight: '600' }}>{o.patient_name || '—'}{o.is_urgent ? <Text style={{ color: C.red, fontWeight: '700' }}>  · acil</Text> : null}</Text>
                <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{o.work_type || '—'}</Text>
              </View>
              <Chip tone={orderTone(o.status)} dot>{o.status || '—'}</Chip>
              <Text style={{ color: C.ink3, fontSize: 12, width: 84, textAlign: 'right' }}>{new Date(o.created_at).toLocaleDateString()}</Text>
            </View>
          ))}
        </Panel>

        {/* Açık talepler */}
        <SectionLabel icon={AlertTriangle} tone={C.amber}>{`Açık destek talepleri (${d.open_tickets.length})`}</SectionLabel>
        <Panel padding={0} style={{ marginBottom: 24 }}>
          {d.open_tickets.length === 0 ? <Empty /> : d.open_tickets.map((t, i) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <AlertTriangle size={14} color={C.amber} strokeWidth={1.8} />
              <Text numberOfLines={1} style={{ flex: 1, color: C.ink, fontSize: 13.5 }}>{t.subject || '—'}</Text>
              <Text style={{ color: C.ink3, fontSize: 12 }}>{t.status || '—'}</Text>
            </View>
          ))}
        </Panel>

        {/* Kullanıcılar */}
        <SectionLabel>{`Kullanıcılar (${d.users.length})`}</SectionLabel>
        <Panel padding={0}>
          {d.users.map((u, i) => (
            <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.ink, fontSize: 13.5, fontWeight: '600' }}>{u.name || '—'}</Text>
                <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{u.email || '—'}</Text>
              </View>
              <Text style={{ color: C.ink2, fontSize: 12 }}>{u.user_type}{u.role ? ` · ${u.role}` : ''}</Text>
            </View>
          ))}
        </Panel>
      </ScrollView>
    </View>
  );
}

function Empty() { return <Text style={{ color: C.ink3, fontSize: 13, padding: 18 }}>Kayıt yok.</Text>; }
