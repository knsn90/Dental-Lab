import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, ChevronRight, AlertTriangle } from 'lucide-react-native';
import { labSnapshot, type LabSnapshot } from '../../../modules/platform/api';
import { C, FONT } from '../../../modules/platform/ui';

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(230,162,60,0.14)', borderBottomWidth: 1, borderBottomColor: 'rgba(230,162,60,0.3)', paddingVertical: 10, paddingHorizontal: 20 }}>
        <Eye size={16} color={C.amber} strokeWidth={2} />
        <Text style={{ color: C.amber, fontSize: 13, fontWeight: '700', flex: 1 }}>
          SALT-OKUNUR · «{lab.name}» olarak görüntülüyorsun (platform admin)
        </Text>
        <Pressable onPress={() => router.replace(`/(platform)/${id}` as any)}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <Text style={{ color: C.ink, fontSize: 12, fontWeight: '600' }}>Çık</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
        <Text style={{ fontFamily: FONT, fontSize: 28, fontWeight: '300', letterSpacing: -1, color: C.ink, marginBottom: 4 }}>{lab.name}</Text>
        <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 20 }}>{lab.slug} · {lab.plan} · {lab.is_active ? 'aktif' : 'askıda'}</Text>

        {/* Counts */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          {([['Kullanıcı', d.counts.users], ['Sipariş', d.counts.orders], ['Klinik', d.counts.clinics], ['Açık talep', d.counts.open_tickets]] as const).map(([label, val]) => (
            <View key={label} style={{ flex: 1, minWidth: 130, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16 }}>
              <Text style={{ fontFamily: FONT, fontSize: 26, fontWeight: '300', color: C.ink }}>{val}</Text>
              <Text style={{ fontSize: 11, color: C.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Son siparişler */}
        <Section title={`Son siparişler (${d.recent_orders.length})`}>
          {d.recent_orders.length === 0 ? <Empty /> : d.recent_orders.map((o, i) => (
            <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT, width: 88 }} numberOfLines={1}>{o.order_number || o.id.slice(0, 8)}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.ink, fontSize: 13.5, fontWeight: '500' }}>{o.patient_name || '—'}{o.is_urgent ? '  ⚡' : ''}</Text>
                <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{o.work_type || '—'}</Text>
              </View>
              <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: orderTone(o.status) + '22' }}>
                <Text style={{ color: orderTone(o.status), fontSize: 11, fontWeight: '700' }}>{o.status || '—'}</Text>
              </View>
              <Text style={{ color: C.ink3, fontSize: 12, width: 84, textAlign: 'right' }}>{new Date(o.created_at).toLocaleDateString()}</Text>
            </View>
          ))}
        </Section>

        {/* Açık talepler */}
        <Section title={`Açık destek talepleri (${d.open_tickets.length})`}>
          {d.open_tickets.length === 0 ? <Empty /> : d.open_tickets.map((t, i) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <AlertTriangle size={14} color={C.amber} strokeWidth={1.8} />
              <Text numberOfLines={1} style={{ flex: 1, color: C.ink, fontSize: 13.5 }}>{t.subject || '—'}</Text>
              <Text style={{ color: C.ink3, fontSize: 12 }}>{t.status || '—'}</Text>
            </View>
          ))}
        </Section>

        {/* Kullanıcılar */}
        <Section title={`Kullanıcılar (${d.users.length})`}>
          {d.users.map((u, i) => (
            <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.ink, fontSize: 13.5, fontWeight: '500' }}>{u.name || '—'}</Text>
                <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{u.email || '—'}</Text>
              </View>
              <Text style={{ color: C.ink2, fontSize: 12 }}>{u.user_type}{u.role ? ` · ${u.role}` : ''}</Text>
            </View>
          ))}
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>{title}</Text>
      <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginBottom: 22 }}>{children}</View>
    </>
  );
}
function Empty() { return <Text style={{ color: C.ink3, fontSize: 13, padding: 16 }}>Kayıt yok.</Text>; }
