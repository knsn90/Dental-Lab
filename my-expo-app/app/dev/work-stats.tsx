// app/dev/work-stats.tsx — İş İstatistikleri demo (yalnız __DEV__; ağ çağrısı YOK).
// Canlı veri salt okunur ve oturumsuz tarayıcıda admin rotası açılmaz; ekran burada
// sahte veriyle denenir. Parametreler: ?empty=1 (hiç sipariş yok) · ?err=1 (yükleme
// hatası) · ?err=switch (ilk pencere gelir, ay değişince okuma hata verir) · ?lang=en|de|fa · ?dark=1. Bu sayfa açıkken work_orders / doctors / clinics /
// lab_services okumaları sahte satırlarla yanıtlanır; oturum profiline sahte lab_id yazılır.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import i18n from 'i18next';
import { supabase } from '../../core/api/supabase';
import { useAuthStore } from '../../core/store/authStore';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { WorkStatsScreen } from '../../modules/admin/workStats/WorkStatsScreen';

const LAB = 'demo-lab';
const CLINICS = [
  { id: 'c1', name: 'Dent Klinik Kadıköy' },
  { id: 'c2', name: 'Gülüş Ağız ve Diş' },
  { id: 'c3', name: 'Beyaz İnci Diş' },
];
const DOCTORS = [
  { id: 'd1', clinic_id: 'c1' }, { id: 'd2', clinic_id: 'c2' }, { id: 'd3', clinic_id: 'c3' },
  { id: 'd4', clinic_id: null },
];
const SERVICES = [
  { name: 'Zirkonya kron', unit: 'üye' }, { name: 'E.max', unit: 'üye' },
  { name: 'Gece plağı', unit: 'çene' }, { name: 'İmplant parçası', unit: 'adet' },
];
// Üye hedefleri (spec §12 ölçümüyle aynı): Haz 36 · Tem 19 · Ağu 75 · Eyl 32 · Eki 84 · Kas 63
const MONTHS: [number, number, number][] = [[2026, 5, 36], [2026, 6, 19], [2026, 7, 75], [2026, 8, 32], [2026, 9, 84], [2026, 10, 63]];

function buildOrders() {
  const out: any[] = [];
  let n = 1;
  for (const [y, m, total] of MONTHS) {
    let left = total;
    let i = 0;
    while (left > 0) {
      const teeth = Math.min(left, 1 + ((i * 7 + m) % 4));
      left -= teeth;
      const doc = DOCTORS[(i + m) % 4].id;
      out.push({
        id: `o${n}`, order_number: `NEX-${2400 + n}`, work_type: i % 3 === 0 ? 'E.max' : 'Zirkonya kron',
        status: i % 9 === 8 ? 'teslim_edildi' : 'uretimde',
        created_at: new Date(y, m, 2 + (i % 25), 10).toISOString(),
        tooth_numbers: Array.from({ length: teeth }, (_, k) => 11 + k), doctor_id: doc,
      });
      n++; i++;
    }
    // iptal (sayılmaz) + çene + adet
    out.push({ id: `o${n++}`, order_number: `NEX-${2400 + n}`, work_type: 'Zirkonya kron', status: 'iptal', created_at: new Date(y, m, 5).toISOString(), tooth_numbers: [11, 12], doctor_id: 'd1' });
    out.push({ id: `o${n++}`, order_number: `NEX-${2400 + n}`, work_type: 'Gece plağı', status: 'uretimde', created_at: new Date(y, m, 6).toISOString(), tooth_numbers: [11, 21, 31, 41], doctor_id: 'd2' });
    if (m === 10) out.push({ id: `o${n++}`, order_number: `NEX-${2400 + n}`, work_type: 'İmplant parçası', status: 'uretimde', created_at: new Date(y, m, 7).toISOString(), tooth_numbers: [36], doctor_id: 'd3' });
  }
  return out;
}

/** PostgREST sorgu kurucusunun yeterli taklidi: zincirlenir, await edilince {data,error}. */
function fakeBuilder(table: string, opts: { empty: boolean; err: boolean; errSwitch: boolean; firstGte: { v?: string } }) {
  const st: { gte?: string; from?: number; to?: number; limit?: number; asc: boolean; cols: string } = { asc: true, cols: '' };
  const rows = (): any[] => {
    if (table === 'work_orders') {
      let r = opts.empty ? [] : buildOrders();
      if (st.gte) r = r.filter((o) => o.created_at >= st.gte!);
      r.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      if (st.limit) r = r.slice(0, st.limit);
      return r;
    }
    if (table === 'doctors') return DOCTORS;
    if (table === 'clinics') return CLINICS;
    if (table === 'lab_services') return SERVICES;
    return [];
  };
  const run = () => {
    if (opts.err) return { data: null, error: { message: 'demo' } };
    if (opts.errSwitch && table === 'work_orders' && st.gte) {
      if (!opts.firstGte.v) opts.firstGte.v = st.gte;
      else if (st.gte !== opts.firstGte.v) return { data: null, error: { message: 'demo' } };
    }
    let r = rows();
    if (st.from !== undefined && st.to !== undefined) r = r.slice(st.from, st.to + 1);
    return { data: r, error: null };
  };
  const b: any = {
    select: (c: string) => { st.cols = c; return b; },
    eq: () => b,
    gte: (_c: string, v: string) => { st.gte = v; return b; },
    order: () => b,
    range: (f: number, t: number) => { st.from = f; st.to = t; return b; },
    limit: (n: number) => { st.limit = n; return b; },
    then: (res: any, rej: any) => new Promise((r) => setTimeout(() => r(run()), 250)).then(res, rej),
  };
  return b;
}

const FAKE = new Set(['work_orders', 'doctors', 'clinics', 'lab_services']);

export default function WorkStatsDemo() {
  const { empty, err, lang, dark } = useLocalSearchParams<{ empty?: string; err?: string; lang?: string; dark?: string }>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const opts = { empty: empty === '1', err: err === '1', errSwitch: err === 'switch', firstGte: {} as { v?: string } };
    const origFrom = (supabase as any).from;
    (supabase as any).from = (t: string) => (FAKE.has(t) ? fakeBuilder(t, opts) : origFrom.call(supabase, t));
    const prevProfile = useAuthStore.getState().profile;
    useAuthStore.setState({ profile: { ...(prevProfile as any), lab_id: LAB } as any });
    const prevLang = i18n.language;
    if (lang && lang !== prevLang) i18n.changeLanguage(lang);
    const prevDark = useThemeModeStore.getState().resolvedDark;
    if (dark === '1') useThemeModeStore.setState({ resolvedDark: true } as any);
    setReady(true);
    return () => {
      (supabase as any).from = origFrom;
      useAuthStore.setState({ profile: prevProfile });
      if (lang && lang !== prevLang) i18n.changeLanguage(prevLang);
      if (dark === '1') useThemeModeStore.setState({ resolvedDark: prevDark } as any);
    };
  }, [empty, err, lang, dark]);

  if (!ready) return <View />;
  return <WorkStatsScreen />;
}
