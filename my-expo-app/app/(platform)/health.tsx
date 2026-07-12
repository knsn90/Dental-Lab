import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { ShieldCheck, ShieldAlert, Database, Clock, Puzzle } from 'lucide-react-native';
import { systemHealth, type SystemHealth } from '../../modules/platform/api';
import { C, FONT, PlatformNav } from '../../modules/platform/ui';

export default function PlatformHealth() {
  const [h, setH] = useState<SystemHealth | null>(null);
  useEffect(() => { systemHealth().then(setH).catch(() => setH(null)); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1000, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="health" />

        {!h ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <>
            {/* RLS duruşu */}
            <Section icon={h.rls.disabled > 0 ? ShieldAlert : ShieldCheck} iconColor={h.rls.disabled > 0 ? C.amber : C.green} title="RLS güvenlik duruşu">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: h.rls.disabled > 0 ? 14 : 0 }}>
                <Stat label="Genel tablo" value={h.rls.tables} />
                <Stat label="RLS açık" value={h.rls.enabled} tone={C.green} />
                <Stat label="RLS kapalı" value={h.rls.disabled} tone={h.rls.disabled > 0 ? C.amber : C.ink} />
              </View>
              {h.rls.disabled > 0 && (
                <View>
                  <Text style={{ color: C.ink3, fontSize: 12, marginBottom: 6 }}>RLS'siz tablolar (gözden geçir):</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {h.rls.disabled_list.map((t) => (
                      <View key={t} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(230,162,60,0.12)' }}>
                        <Text style={{ color: C.amber, fontSize: 11.5, fontFamily: FONT }}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </Section>

            {/* Uzantılar + fonksiyonlar */}
            <Section icon={Puzzle} iconColor={C.accent} title="Altyapı">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Stat label="SECURITY DEFINER fn" value={h.definer_functions} />
                {Object.entries(h.extensions).map(([ext, on]) => (
                  <Stat key={ext} label={ext} value={on ? 'aktif' : 'yok'} tone={on ? C.green : C.ink3} />
                ))}
              </View>
            </Section>

            {/* Cron */}
            <Section icon={Clock} iconColor={C.violet} title={`Zamanlanmış işler (${h.cron_jobs.length})`}>
              {h.cron_jobs.length === 0 ? (
                <Text style={{ color: C.ink3, fontSize: 13 }}>Cron işi yok / pg_cron kapalı.</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {h.cron_jobs.map((j) => (
                    <View key={j.job} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: j.active ? C.green : C.ink3 }} />
                      <Text style={{ color: C.ink, fontSize: 13, flex: 1 }} numberOfLines={1}>{j.job}</Text>
                      <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT }}>{j.schedule}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* Satır sayıları */}
            <Section icon={Database} iconColor={C.ink2} title="Veri hacmi">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {Object.entries(h.rows).map(([tbl, n]) => (
                  <Stat key={tbl} label={tbl} value={n} />
                ))}
              </View>
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ icon: Icon, iconColor, title, children }: { icon: any; iconColor: string; title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={15} color={iconColor} strokeWidth={2} />
        <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
      </View>
      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 18 }}>{children}</View>
    </View>
  );
}
function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={{ minWidth: 120 }}>
      <Text style={{ fontFamily: FONT, fontSize: 24, fontWeight: '300', color: tone ?? C.ink }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
