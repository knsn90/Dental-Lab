import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { auditLog, type AuditRow } from '../../modules/platform/api';
import { C, FONT, PlatformNav } from '../../modules/platform/ui';

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
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="audit" />
        <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 14 }}>Platform yöneticilerinin tüm eylemleri (en yeni önce).</Text>

        {rows === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : rows.length === 0 ? (
          <Text style={{ color: C.ink3, fontSize: 14, paddingVertical: 32, textAlign: 'center' }}>Henüz kayıt yok.</Text>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
            {rows.map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
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
          </View>
        )}
      </ScrollView>
    </View>
  );
}
