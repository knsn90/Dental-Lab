import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { ScrollText } from 'lucide-react-native';
import { auditLog, type AuditRow } from '../../modules/platform/api';
import { C, FONT, PageHeader, Panel, IconChip } from '../../modules/platform/ui';

const ACTION_LABEL: Record<string, string> = {
  set_status: 'Durum değişikliği', set_plan: 'Plan değişikliği', extend_trial: 'Deneme uzatma',
  update_meta: 'Bilgi güncelleme', offboard: 'Offboard', add_platform_admin: 'Platform admin eklendi',
  remove_platform_admin: 'Platform admin çıkarıldı',
};

export default function PlatformAudit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => { auditLog(200).then(setRows).catch(() => setRows([])); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Sistem" title="Denetim" accent="kaydı"
          description="Platform yöneticilerinin tüm eylemleri — en yeni önce." />

        {rows === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : rows.length === 0 ? (
          <Panel style={{ alignItems: 'center', paddingVertical: 44, gap: 10 }}>
            <IconChip icon={ScrollText} tone={C.ink3} size={52} /><Text style={{ color: C.ink3, fontSize: 14 }}>Henüz kayıt yok.</Text>
          </Panel>
        ) : (
          <Panel padding={0}>
            {rows.map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.ink, fontSize: 13.5, fontWeight: '600' }}>
                    {ACTION_LABEL[r.action] ?? r.action}
                    {r.lab_name ? <Text style={{ color: C.ink3, fontWeight: '400' }}>  ·  {r.lab_name}</Text> : null}
                  </Text>
                  <Text style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>
                    {r.actor ?? '—'}{r.detail && Object.keys(r.detail).length ? `  ·  ${JSON.stringify(r.detail)}` : ''}
                  </Text>
                </View>
                <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT }}>{new Date(r.created_at).toLocaleString()}</Text>
              </View>
            ))}
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}
