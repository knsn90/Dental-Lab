import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { LifeBuoy } from 'lucide-react-native';
import { supportTickets, type SupportTicket } from '../../modules/platform/api';
import { C, FONT, PlatformNav } from '../../modules/platform/ui';

const prioTone = (p?: string | null) => (p === 'high' || p === 'urgent' || p === 'critical' ? C.red : p === 'low' ? C.ink3 : C.amber);
const statusTone = (s?: string | null) => (s === 'closed' || s === 'resolved' ? C.green : s === 'open' ? C.accent : C.amber);

export default function PlatformSupport() {
  const [rows, setRows] = useState<SupportTicket[] | null>(null);
  const [openOnly, setOpenOnly] = useState(true);

  useEffect(() => { supportTickets(null, 200).then(setRows).catch(() => setRows([])); }, []);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    return openOnly ? list.filter((t) => t.status !== 'closed' && t.status !== 'resolved') : list;
  }, [rows, openOnly]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="support" />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Text style={{ color: C.ink3, fontSize: 13, flex: 1 }}>Tüm laboratuvarların destek talepleri (en yeni önce).</Text>
          {([[true, 'Açık'], [false, 'Tümü']] as const).map(([v, label]) => (
            <Pressable key={label} onPress={() => setOpenOnly(v)}
              style={{ paddingHorizontal: 14, height: 38, justifyContent: 'center', borderRadius: 10, backgroundColor: openOnly === v ? 'rgba(79,141,247,0.16)' : C.card, borderWidth: 1, borderColor: openOnly === v ? 'rgba(79,141,247,0.4)' : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ color: openOnly === v ? C.ink : C.ink2, fontSize: 13, fontWeight: '600' }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {rows === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : filtered.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center', gap: 8 }}>
            <LifeBuoy size={28} color={C.ink3} strokeWidth={1.5} />
            <Text style={{ color: C.ink3, fontSize: 14 }}>Talep yok</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
            {filtered.map((t, i) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: prioTone(t.priority) }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{t.subject || '—'}</Text>
                  <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>
                    {t.lab_name || '—'}{t.user_name ? `  ·  ${t.user_name}` : ''}{t.category ? `  ·  ${t.category}` : ''}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: statusTone(t.status) + '22' }}>
                  <Text style={{ color: statusTone(t.status), fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{t.status || '—'}</Text>
                </View>
                <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT, width: 92, textAlign: 'right' }}>{new Date(t.created_at).toLocaleDateString()}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
