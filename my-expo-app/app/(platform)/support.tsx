import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SupportIcon } from '../../core/ui/SupportIcon';
import { supportTickets, type SupportTicket } from '../../modules/platform/api';
import { C, FONT, PageHeader, Panel, Chip, IconChip } from '../../modules/platform/ui';

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
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Operasyon" title="Destek"
          description="Tüm laboratuvarların destek talepleri — en yeni önce."
          stats={rows ? [{ label: 'Açık', value: (rows ?? []).filter((t) => t.status !== 'closed' && t.status !== 'resolved').length }] : undefined}
          actions={([[true, 'Açık'], [false, 'Tümü']] as const).map(([v, label]) => {
            const on = openOnly === v;
            return (
              <Pressable key={label} onPress={() => setOpenOnly(v)}
                style={{ paddingHorizontal: 16, height: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: on ? C.soft : C.card, borderWidth: 1, borderColor: on ? C.accent : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ color: on ? C.accentDeep : C.ink2, fontSize: 13, fontWeight: on ? '700' : '600' }}>{label}</Text>
              </Pressable>
            );
          }) as any} />

        {rows === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : filtered.length === 0 ? (
          <Panel style={{ alignItems: 'center', paddingVertical: 44, gap: 10 }}>
            <IconChip icon={SupportIcon} tone={C.ink3} size={52} /><Text style={{ color: C.ink3, fontSize: 14 }}>Talep yok</Text>
          </Panel>
        ) : (
          <Panel padding={0}>
            {filtered.map((t, i) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: prioTone(t.priority) }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 }}>{t.subject || '—'}</Text>
                  <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>
                    {t.lab_name || '—'}{t.user_name ? `  ·  ${t.user_name}` : ''}{t.category ? `  ·  ${t.category}` : ''}
                  </Text>
                </View>
                <Chip tone={statusTone(t.status)} dot>{(t.status || '—').toUpperCase()}</Chip>
                <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT, width: 92, textAlign: 'end' as any }}>{new Date(t.created_at).toLocaleDateString()}</Text>
              </View>
            ))}
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}
