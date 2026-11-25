// app/dev/performance.tsx — Performans ekranı demo (ağ çağrısı YOK, sahte teknisyen verisi).
// Parametreler: ?lang=en|de|fa · ?dark=1 · ?noperm=1 (lab yöneticisi: view_profit/view_cost yok)
// Yalnız geliştirmede açık (app/dev/_layout.tsx). supabase.rpc/from bu sayfa açıkken sahte yanıt verir.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import i18n from 'i18next';
import { supabase } from '../../core/api/supabase';
import { useAuthStore } from '../../core/store/authStore';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { PerformanceScreen } from '../../modules/performance/screens/PerformanceScreen';

const tech = (id: string, name: string, rate: number, orders: number, hours: number, waste: number, wasteCost: number, eff: number | null, profit: number) => ({
  user_id: id, user_name: name, hourly_rate: rate, used_qty: orders * 3, used_cost: orders * 40,
  waste_qty: waste, waste_cost: wasteCost, efficiency_pct: eff, labor_minutes: hours * 60, labor_hours: hours,
  labor_cost: rate * hours, orders_worked: orders, profit_contribution: profit,
});

/** Sunucu davranışını taklit et: contribution_score her zaman, para alanları yetkiye göre NULL. */
function serverShape(rows: ReturnType<typeof tech>[], profit: boolean, cost: boolean) {
  const max = Math.max(0, ...rows.map(r => r.profit_contribution));
  return rows.map(r => ({
    ...r,
    contribution_score: max > 0 ? (r.profit_contribution > 0 ? Math.round(r.profit_contribution / max * 100) : 0) : null,
    profit_contribution: profit ? r.profit_contribution : null,
    hourly_rate: cost ? r.hourly_rate : null, used_cost: cost ? r.used_cost : null,
    waste_cost: cost ? r.waste_cost : null, labor_cost: cost ? r.labor_cost : null,
  }));
}

const RPC: Record<string, any[]> = {
  report_technician_performance: [
    tech('t1', 'Ahmet Yılmaz', 18, 42, 96, 2, 60, 97.5, 4820),
    tech('t2', 'Elif Kaya', 16, 35, 88, 4, 130, 91.2, 3110),
    tech('t3', 'Murat Demir', 15, 21, 70, 7, 240, 82.4, 640),
    tech('t4', 'Zeynep Arslan', 14, 9, 40, 3, 95, 88.0, -210),
  ],
  report_technician_ratings: [
    { user_id: 't1', avg_overall: 4.8, review_count: 12 },
    { user_id: 't2', avg_overall: 4.3, review_count: 7 },
  ],
};
const VIEW = [
  { technician_id: 't1', quality_pct: 94, on_time_pct: 91, avg_queue_wait_sec: 2400, monthly_rework_count: 0, avg_duration_min: 60 },
  { technician_id: 't2', quality_pct: 86, on_time_pct: 78, avg_queue_wait_sec: 5400, monthly_rework_count: 1, avg_duration_min: 95 },
  { technician_id: 't3', quality_pct: 71, on_time_pct: 62, avg_queue_wait_sec: 9000, monthly_rework_count: 2, avg_duration_min: 150 },
  { technician_id: 't4', quality_pct: 58, on_time_pct: 55, avg_queue_wait_sec: 12000, monthly_rework_count: 3, avg_duration_min: 200 },
];

const MOCK_TABLES = new Set(['v_technician_performance_detail', 'work_orders']);

/** Zincirlenebilir sahte PostgREST sorgusu — her yöntem kendini döner, await → sonuç. */
function fakeQuery(table: string): any {
  const result = table === 'v_technician_performance_detail'
    ? { data: VIEW, error: null, count: VIEW.length }
    : { data: [], error: null, count: 40 }; // work_orders: 40 teslim, 0 yeniden yapım
  const q: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      return () => q;
    },
  });
  return q;
}

export default function PerformanceDemo() {
  const { lang, dark, noperm } = useLocalSearchParams<{ lang?: string; dark?: string; noperm?: string }>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb: any = supabase;
    const origRpc = sb.rpc, origFrom = sb.from;
    // Yalnız bu ekranın kaynakları sahte; geri kalan uygulama gerçek istemciyi kullanır
    // (her şeyi sahtelemek uygulamanın başka döngülerini kilitliyordu).
    const full = noperm !== '1';
    const data = (fn: string) => fn === 'report_technician_performance'
      ? serverShape(RPC[fn] as any, full, full) : RPC[fn];
    sb.rpc = (fn: string, ...rest: any[]) =>
      fn in RPC ? Promise.resolve({ data: data(fn), error: null }) : origRpc.call(sb, fn, ...rest);
    sb.from = (table: string) =>
      MOCK_TABLES.has(table) ? fakeQuery(table) : origFrom.call(sb, table);

    const prevProfile = useAuthStore.getState().profile;
    useAuthStore.setState({ profile: { ...(prevProfile ?? {}), id: 'demo', lab_id: 'demo-lab' } } as any);

    const prevLang = i18n.language;
    if (lang && lang !== prevLang) i18n.changeLanguage(lang);
    const prevDark = useThemeModeStore.getState().resolvedDark;
    if (dark === '1') useThemeModeStore.setState({ resolvedDark: true } as any);

    const prevPerms = usePermissionStore.getState().permissions;
    const want = noperm === '1' ? ['view_performance'] : ['view_performance', 'view_profit', 'view_cost'];
    const apply = () => usePermissionStore.setState({ permissions: new Set(want) } as any);
    apply();
    const unsub = usePermissionStore.subscribe((st) => {
      if (want.some((k) => !st.permissions.has(k))) apply();
    });
    setReady(true);
    return () => {
      unsub();
      sb.rpc = origRpc; sb.from = origFrom;
      useAuthStore.setState({ profile: prevProfile } as any);
      if (lang && lang !== prevLang) i18n.changeLanguage(prevLang);
      if (dark === '1') useThemeModeStore.setState({ resolvedDark: prevDark } as any);
      usePermissionStore.setState({ permissions: prevPerms } as any);
    };
  }, [lang, dark, noperm]);

  if (!ready) return <View />;
  return (
    <View style={{ flex: 1, backgroundColor: dark === '1' ? '#0E0E0E' : '#F5F1EB', paddingTop: 16 }}>
      <PerformanceScreen />
    </View>
  );
}
