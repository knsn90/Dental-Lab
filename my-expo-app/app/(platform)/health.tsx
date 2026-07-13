import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { ShieldCheck, ShieldAlert, Database, Clock, Puzzle } from 'lucide-react-native';
import { systemHealth, type SystemHealth } from '../../modules/platform/api';
import { C, FONT, SERIF, PageHeader, Panel, SectionLabel, Chip } from '../../modules/platform/ui';

export default function PlatformHealth() {
  const [h, setH] = useState<SystemHealth | null>(null);
  useEffect(() => { systemHealth().then(setH).catch(() => setH(null)); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Sistem" title="Sistem" accent="sağlığı"
          description="RLS güvenlik duruşu, altyapı, zamanlanmış işler ve veri hacmi." />

        {!h ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <>
            {/* RLS duruşu */}
            <SectionLabel icon={h.rls.disabled > 0 ? ShieldAlert : ShieldCheck} tone={h.rls.disabled > 0 ? C.amber : C.green}>RLS güvenlik duruşu</SectionLabel>
            <Panel style={{ marginBottom: 22 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginBottom: h.rls.disabled > 0 ? 16 : 0 }}>
                <Stat label="Genel tablo" value={h.rls.tables} />
                <Stat label="RLS açık" value={h.rls.enabled} tone={C.green} />
                <Stat label="RLS kapalı" value={h.rls.disabled} tone={h.rls.disabled > 0 ? C.amber : C.ink} />
              </View>
              {h.rls.disabled > 0 && (
                <View>
                  <Text style={{ color: C.ink3, fontSize: 12, marginBottom: 8 }}>RLS'siz tablolar (gözden geçir):</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {h.rls.disabled_list.map((t) => <Chip key={t} tone={C.amber}>{t}</Chip>)}
                  </View>
                </View>
              )}
            </Panel>

            {/* Uzantılar + fonksiyonlar */}
            <SectionLabel icon={Puzzle} tone={C.accent}>Altyapı</SectionLabel>
            <Panel style={{ marginBottom: 22 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
                <Stat label="SECURITY DEFINER fn" value={h.definer_functions} />
                {Object.entries(h.extensions).map(([ext, on]) => (
                  <Stat key={ext} label={ext} value={on ? 'aktif' : 'yok'} tone={on ? C.green : C.ink3} />
                ))}
              </View>
            </Panel>

            {/* Cron */}
            <SectionLabel icon={Clock} tone={C.violet}>{`Zamanlanmış işler (${h.cron_jobs.length})`}</SectionLabel>
            <Panel style={{ marginBottom: 22 }}>
              {h.cron_jobs.length === 0 ? (
                <Text style={{ color: C.ink3, fontSize: 13 }}>Cron işi yok / pg_cron kapalı.</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {h.cron_jobs.map((j) => (
                    <View key={j.job} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: j.active ? C.green : C.ink3 }} />
                      <Text style={{ color: C.ink, fontSize: 13, flex: 1 }} numberOfLines={1}>{j.job}</Text>
                      <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT }}>{j.schedule}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Panel>

            {/* Satır sayıları */}
            <SectionLabel icon={Database} tone={C.ink2}>Veri hacmi</SectionLabel>
            <Panel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
                {Object.entries(h.rows).map(([tbl, n]) => <Stat key={tbl} label={tbl} value={n} />)}
              </View>
            </Panel>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={{ minWidth: 120 }}>
      <Text style={{ ...SERIF, fontSize: 26, letterSpacing: -0.8, color: tone ?? C.ink }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
