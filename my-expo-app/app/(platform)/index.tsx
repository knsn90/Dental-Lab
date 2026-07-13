import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { AlertTriangle, TrendingUp, Filter as FunnelIcon, Repeat, Building2, CheckCircle2, Clock, PauseCircle, Users as UsersIcon, Package, Stethoscope } from 'lucide-react-native';
import { platformStats, growthSeries, platformMetrics, type PlatformStats, type GrowthPoint, type PlatformMetrics } from '../../modules/platform/api';
import { C, SERIF, Kpi, Panel, PageHeader, SectionLabel, Chip, planTone } from '../../modules/platform/ui';

export default function PlatformOverview() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);

  useEffect(() => {
    platformStats().then(setStats).catch(() => setStats(null));
    growthSeries().then(setGrowth).catch(() => setGrowth([]));
    platformMetrics().then(setMetrics).catch(() => setMetrics(null));
  }, []);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const maxLabs = Math.max(1, ...growth.map((g) => g.new_labs));
  const maxOrders = Math.max(1, ...growth.map((g) => g.orders));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1160, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Platform" title="Genel" accent="bakış"
          description="Tüm laboratuvarlar, büyüme ve elde tutma metrikleri tek ekranda." />

        {!stats ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <>
            {/* KPIs */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
              <Kpi label="Laboratuvar" value={stats.totals.labs} icon={Building2} />
              <Kpi label="Aktif" value={stats.totals.active} tone={C.green} icon={CheckCircle2} />
              <Kpi label="Deneme" value={stats.totals.trial} tone={C.amber} icon={Clock} />
              <Kpi label="Askıda" value={stats.totals.suspended} tone={C.red} icon={PauseCircle} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 30 }}>
              <Kpi label="Kullanıcı" value={stats.totals.users} icon={UsersIcon} />
              <Kpi label="Sipariş" value={stats.totals.orders} icon={Package} />
              <Kpi label="Klinik" value={stats.totals.clinics} icon={Stethoscope} />
            </View>

            {/* Dikkat gerektirenler */}
            <SectionLabel icon={AlertTriangle} tone={C.amber}>Dikkat</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 30 }}>
              {[
                ['Denemesi 7g içinde bitiyor', stats.attention.trial_ending_7d, C.amber],
                ['Hiç siparişi yok', stats.attention.no_orders, C.ink2],
                ['30g sessiz', stats.attention.silent_30d, C.red],
              ].map(([label, val, tone]) => (
                <Panel key={label as string} padding={18} style={{ flex: 1, minWidth: 190 }}>
                  <Text style={{ ...SERIF, fontSize: 30, letterSpacing: -1, color: tone as string, lineHeight: 34 }}>{val as number}</Text>
                  <Text style={{ color: C.ink3, fontSize: 12.5, marginTop: 4 }}>{label as string}</Text>
                </Panel>
              ))}
            </View>

            {/* Plan dağılımı */}
            <SectionLabel>Plan dağılımı</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 30 }}>
              {Object.entries(stats.plans).map(([plan, n]) => (
                <Chip key={plan} tone={planTone(plan)} dot>{`${plan.toUpperCase()}  ·  ${n as number}`}</Chip>
              ))}
            </View>

            {/* Büyüme (son 12 hafta) */}
            <SectionLabel icon={TrendingUp} tone={C.accent}>Büyüme · son 12 hafta</SectionLabel>
            <Panel padding={20} style={{ marginBottom: 30 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
                {growth.map((g, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                    <View style={{ width: '68%', height: Math.max(2, (g.orders / maxOrders) * 84), backgroundColor: C.accent, borderRadius: 4, opacity: 0.92 }} />
                    <View style={{ width: '68%', height: Math.max(2, (g.new_labs / maxLabs) * 24), backgroundColor: C.green, borderRadius: 4 }} />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 18, marginTop: 14 }}>
                <Legend color={C.accent} label="Sipariş / hafta" />
                <Legend color={C.green} label="Yeni lab / hafta" />
              </View>
            </Panel>

            {/* Funnel + Retention */}
            {metrics && (
              <>
                <SectionLabel icon={FunnelIcon} tone={C.violet}>Dönüşüm hunisi</SectionLabel>
                <Panel padding={20} style={{ gap: 12, marginBottom: 30 }}>
                  {[
                    ['Kayıtlı lab', metrics.funnel.labs, metrics.funnel.labs],
                    ['Kullanıcısı var', metrics.funnel.with_users, metrics.funnel.labs],
                    ['Sipariş verdi', metrics.funnel.with_orders, metrics.funnel.labs],
                    ['Son 30g aktif', metrics.funnel.active_30d, metrics.funnel.labs],
                  ].map(([label, val, base]) => (
                    <View key={label as string} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: C.ink2, fontSize: 13 }}>{label as string}</Text>
                        <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600' }}>{val as number} <Text style={{ color: C.ink3 }}>· %{pct(val as number, base as number)}</Text></Text>
                      </View>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: C.soft, overflow: 'hidden' }}>
                        <View style={{ width: `${pct(val as number, base as number)}%`, height: 8, backgroundColor: C.violet, borderRadius: 4 }} />
                      </View>
                    </View>
                  ))}
                </Panel>

                <SectionLabel icon={Repeat} tone={C.green}>Elde tutma · son 30 gün</SectionLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                  <Kpi label="Yeni lab (30g)" value={metrics.retention.new_30d} />
                  <Kpi label="Aktifleşme" value={`%${pct(metrics.retention.activated_30d, metrics.retention.new_30d)}`} tone={C.green} />
                  <Kpi label="7g aktif" value={metrics.retention.active_7d} />
                  <Kpi label="Churn (30g sessiz)" value={metrics.retention.churned} tone={C.red} />
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: C.ink3, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
