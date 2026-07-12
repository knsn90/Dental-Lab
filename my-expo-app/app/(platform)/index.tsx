import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { AlertTriangle, TrendingUp } from 'lucide-react-native';
import { platformStats, growthSeries, type PlatformStats, type GrowthPoint } from '../../modules/platform/api';
import { C, FONT, PlatformNav, Kpi, planTone } from '../../modules/platform/ui';

export default function PlatformOverview() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);

  useEffect(() => {
    platformStats().then(setStats).catch(() => setStats(null));
    growthSeries().then(setGrowth).catch(() => setGrowth([]));
  }, []);

  const maxLabs = Math.max(1, ...growth.map((g) => g.new_labs));
  const maxOrders = Math.max(1, ...growth.map((g) => g.orders));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1160, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="" />

        {!stats ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <>
            {/* KPIs */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <Kpi label="Laboratuvar" value={stats.totals.labs} />
              <Kpi label="Aktif" value={stats.totals.active} tone={C.green} />
              <Kpi label="Deneme" value={stats.totals.trial} tone={C.amber} />
              <Kpi label="Askıda" value={stats.totals.suspended} tone={C.red} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
              <Kpi label="Kullanıcı" value={stats.totals.users} />
              <Kpi label="Sipariş" value={stats.totals.orders} />
              <Kpi label="Klinik" value={stats.totals.clinics} />
            </View>

            {/* Dikkat gerektirenler */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={15} color={C.amber} strokeWidth={2} />
              <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Dikkat</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
              {[
                ['Denemesi 7g içinde bitiyor', stats.attention.trial_ending_7d, C.amber],
                ['Hiç siparişi yok', stats.attention.no_orders, C.ink2],
                ['30g sessiz', stats.attention.silent_30d, C.red],
              ].map(([label, val, tone]) => (
                <View key={label as string} style={{ flex: 1, minWidth: 180, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14 }}>
                  <Text style={{ fontFamily: FONT, fontSize: 24, fontWeight: '300', color: tone as string }}>{val as number}</Text>
                  <Text style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>{label as string}</Text>
                </View>
              ))}
            </View>

            {/* Plan dağılımı */}
            <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Plan dağılımı</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {Object.entries(stats.plans).map(([plan, n]) => (
                <View key={plan} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 999, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: planTone(plan) }} />
                  <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' }}>{plan}</Text>
                  <Text style={{ color: C.ink3, fontSize: 13 }}>{n as number}</Text>
                </View>
              ))}
            </View>

            {/* Büyüme (son 12 hafta) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TrendingUp size={15} color={C.accent} strokeWidth={2} />
              <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Büyüme · son 12 hafta</Text>
            </View>
            <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
                {growth.map((g, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                    <View style={{ width: '70%', height: Math.max(2, (g.orders / maxOrders) * 84), backgroundColor: C.accent, borderRadius: 3, opacity: 0.9 }} />
                    <View style={{ width: '70%', height: Math.max(2, (g.new_labs / maxLabs) * 24), backgroundColor: C.green, borderRadius: 3 }} />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                <Legend color={C.accent} label="Sipariş / hafta" />
                <Legend color={C.green} label="Yeni lab / hafta" />
              </View>
            </View>
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
