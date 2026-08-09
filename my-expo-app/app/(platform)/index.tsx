import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, TrendingUp, Filter as FunnelIcon, Repeat, ArrowUpRight, Clock, Inbox, Moon } from 'lucide-react-native';
import { PercentRingX } from '../../core/ui/ProgressX';
import { platformStats, growthSeries, platformMetrics, type PlatformStats, type GrowthPoint, type PlatformMetrics } from '../../modules/platform/api';
import { C, SERIF, NUM, Kpi, Panel, PageHeader, SectionLabel, Banner, IconBtn, planTone } from '../../modules/platform/ui';

const web = Platform.OS === 'web';

export default function PlatformOverview() {
  const router = useRouter();
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

  const attention = stats?.attention;
  const urgent = attention ? attention.silent_30d + attention.trial_ending_7d : 0;
  const activationPct = metrics ? pct(metrics.retention.activated_30d, metrics.retention.new_30d) : 0;
  const openLabs = () => router.replace('/(platform)/labs' as any);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1180, width: '100%', alignSelf: 'center' }}>
        {!stats ? (
          <>
            <PageHeader eyebrow="Platform" title="Genel" accent="bakış" description="Tüm laboratuvarlar, büyüme ve elde tutma metrikleri tek ekranda." />
            <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
          </>
        ) : (
          <>
            <PageHeader eyebrow="Platform" title="Genel" accent="bakış"
              description="Tüm laboratuvarlar, büyüme ve elde tutma metrikleri tek ekranda."
              pills={[
                { label: 'Aktif', value: stats.totals.active, tone: C.green },
                { label: 'Deneme', value: stats.totals.trial, tone: C.amber },
                { label: 'Askıda', value: stats.totals.suspended, tone: C.red },
              ]}
              stats={[
                { label: 'Laboratuvar', value: stats.totals.labs },
                { label: 'Kullanıcı', value: stats.totals.users },
                { label: 'Sipariş', value: stats.totals.orders },
                { label: 'Klinik', value: stats.totals.clinics },
              ]}
            />

            {/* Acil dikkat — full-bleed banner */}
            {urgent > 0 && (
              <Banner tone={C.red} icon={AlertTriangle} title={`${urgent} lab dikkat gerektiriyor`}
                action={<IconBtn icon={ArrowUpRight} tone={C.red} onPress={openLabs} />}>
                {attention!.silent_30d} lab 30 gündür sessiz · {attention!.trial_ending_7d} denemesi 7 gün içinde bitiyor
              </Banner>
            )}

            {/* Dikkat defteri — bölünmüş tek kart (üç yüzen kutu yerine) */}
            <SectionLabel icon={AlertTriangle} tone={C.amber}>Dikkat</SectionLabel>
            <AttentionLedger onOpen={openLabs} items={[
              { label: 'Denemesi 7g içinde bitiyor', value: stats.attention.trial_ending_7d, tone: C.amber, icon: Clock },
              { label: 'Hiç siparişi yok', value: stats.attention.no_orders, tone: C.ink2, icon: Inbox },
              { label: '30g sessiz', value: stats.attention.silent_30d, tone: C.red, icon: Moon },
            ]} />

            {/* Plan dağılımı — oran çubuğu + lejant */}
            <SectionLabel>Plan dağılımı</SectionLabel>
            <PlanBar plans={stats.plans} />

            {/* Büyüme (son 12 hafta) */}
            <SectionLabel icon={TrendingUp} tone={C.accent}>Büyüme · son 12 hafta</SectionLabel>
            <Panel padding={20} style={{ marginBottom: 30 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 18 }}>
                  <Legend color={C.accent} label="Sipariş / hafta" />
                  <Legend color={C.green} label="Yeni lab / hafta" />
                </View>
                <Text style={{ ...NUM, fontSize: 11.5, fontWeight: '600', color: C.ink3 }}>
                  Zirve · <Text style={{ color: C.accent, fontWeight: '700' }}>{maxOrders}</Text> sipariş
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 116, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 0 }}>
                {growth.map((g, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                    <View style={{ width: '66%', height: Math.max(2, (g.orders / maxOrders) * 84), backgroundColor: C.accent, borderTopLeftRadius: 3, borderTopRightRadius: 3, opacity: 0.92 }} />
                    <View style={{ width: '66%', height: Math.max(2, (g.new_labs / maxLabs) * 22), backgroundColor: C.green, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                  </View>
                ))}
              </View>
            </Panel>

            {/* Funnel + Retention */}
            {metrics && (
              <>
                <SectionLabel icon={FunnelIcon} tone={C.violet}>Dönüşüm hunisi</SectionLabel>
                <Panel padding={20} style={{ gap: 14, marginBottom: 30 }}>
                  {[
                    ['Kayıtlı lab', metrics.funnel.labs, metrics.funnel.labs],
                    ['Kullanıcısı var', metrics.funnel.with_users, metrics.funnel.labs],
                    ['Sipariş verdi', metrics.funnel.with_orders, metrics.funnel.labs],
                    ['Son 30g aktif', metrics.funnel.active_30d, metrics.funnel.labs],
                  ].map(([label, val, base]) => (
                    <View key={label as string} style={{ gap: 7 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Text style={{ color: C.ink2, fontSize: 13 }}>{label as string}</Text>
                        <Text style={{ ...NUM, color: C.ink, fontSize: 13, fontWeight: '700' }}>{val as number} <Text style={{ color: C.ink3, fontWeight: '600' }}>· %{pct(val as number, base as number)}</Text></Text>
                      </View>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: C.soft, overflow: 'hidden' }}>
                        <View style={{ width: `${pct(val as number, base as number)}%`, height: 8, backgroundColor: C.violet, borderRadius: 4 }} />
                      </View>
                    </View>
                  ))}
                </Panel>

                <SectionLabel icon={Repeat} tone={C.green}>Elde tutma · son 30 gün</SectionLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>
                  <Panel padding={18} style={{ alignItems: 'center', justifyContent: 'center', minWidth: 190 }}>
                    <PercentRingX value={activationPct} size={128} theme="exec" textColor={C.ink} />
                    <Text style={{ fontSize: 10.5, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: C.ink3, marginTop: 10 }}>Aktifleşme</Text>
                  </Panel>
                  <View style={{ flex: 1, minWidth: 260, flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                    <Kpi label="Yeni lab (30g)" value={metrics.retention.new_30d} />
                    <Kpi label="7g aktif" value={metrics.retention.active_7d} tone={C.green} />
                    <Kpi label="Churn (30g sessiz)" value={metrics.retention.churned} tone={C.red} />
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Dikkat defteri — tek kart, dikey hairline'larla bölünmüş hücreler.
 * >0 hücre: tone renkli metrik + "Lab'lara git →" aksiyonu (tıklanır);
 * 0 hücre: susturulmuş ink3 + "Sorun yok". */
function AttentionLedger({ items, onOpen }: { items: { label: string; value: number; tone: string; icon: any }[]; onOpen: () => void }) {
  return (
    <Panel padding={0} style={{ marginBottom: 30, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {items.map((it, i) => {
          const active = it.value > 0;
          const Icon = it.icon;
          return (
            <Pressable key={it.label} onPress={active ? onOpen : undefined}
              style={({ hovered }: any) => ({
                flex: 1, minWidth: 190, paddingVertical: 20, paddingHorizontal: 22,
                borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: C.line,
                backgroundColor: hovered && active ? C.cardHover : 'transparent',
                ...(web && active ? ({ cursor: 'pointer' } as any) : {}),
              })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Icon size={14} color={active ? it.tone : C.ink3} strokeWidth={2} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: C.ink3 }}>{it.label}</Text>
              </View>
              <Text style={{ ...SERIF, ...NUM, fontSize: 38, letterSpacing: -1.6, lineHeight: 40, color: active ? it.tone : C.ink3 }}>{it.value}</Text>
              {active ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 9 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: it.tone }}>Lab'lara git</Text>
                  <ArrowUpRight size={13} color={it.tone} strokeWidth={2.2} />
                </View>
              ) : (
                <Text style={{ fontSize: 11.5, color: C.ink3, marginTop: 9 }}>Sorun yok</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </Panel>
  );
}

/** Plan dağılımı — tek satır oran çubuğu (segmentler beyaz hairline'la ayrık) + lejant. */
function PlanBar({ plans }: { plans: Record<string, number> }) {
  const entries = Object.entries(plans);
  const total = Math.max(1, entries.reduce((a, [, n]) => a + (n as number), 0));
  return (
    <View style={{ marginBottom: 30 }}>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: C.soft }}>
        {entries.map(([plan, n], i) => (
          <View key={plan} style={{ width: `${((n as number) / total) * 100}%`, backgroundColor: planTone(plan), borderRightWidth: i === entries.length - 1 ? 0 : 2, borderRightColor: C.card }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 13 }}>
        {entries.map(([plan, n]) => (
          <View key={plan} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: planTone(plan) }} />
            <Text style={{ color: C.ink2, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.3 }}>{plan.toUpperCase()}</Text>
            <Text style={{ ...NUM, color: C.ink3, fontSize: 12.5, fontWeight: '600' }}>{n as number}</Text>
          </View>
        ))}
      </View>
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
