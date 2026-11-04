// app/dev/clinics-nav.tsx — Sağlık Kurumları sol menü demosu (yalnız __DEV__; ağ çağrısı YOK).
// Canlı hesap salt okunur ve girişsiz önizlemede oturum yok: gerçek ClinicsScreen burada
// sahte veriyle çizilir. Bu sayfa açıkken supabase.from / supabase.rpc yerel yanıt verir,
// HİÇBİR istek sunucuya gitmez; yazma çağrıları hata döner. Çıkışta her şey geri alınır:
// supabase fonksiyonları, oturum profili, dil ve ekranın localStorage önbelleği.
// Parametreler: ?noreviews=1 (Değerlendirmeler yetkisi yok) · ?lang=fa
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import i18n from 'i18next';
import { supabase } from '../../core/api/supabase';
import { useAuthStore } from '../../core/store/authStore';
import ClinicsScreen from '../../modules/clinics/screens/ClinicsScreen';
import { currentTrMonth } from '../../modules/reviews/dashboardRules';

const CACHE_KEY = 'clinics_screen_cache_v1';
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const CATS = ['klinik', 'klinik', 'klinik', 'klinik', 'klinik', 'muayenehane', 'muayenehane', 'poliklinik', 'hastane'];
const CLINICS = CATS.map((category, i) => ({
  id: `c${i + 1}`, name: `${category === 'klinik' ? 'Klinik' : category === 'muayenehane' ? 'Muayenehane' : category === 'poliklinik' ? 'Poliklinik' : 'Hastane'} ${String.fromCharCode(65 + i)}`,
  category, is_active: i !== 4, phone: null, email: null, address: null, contact_person: null, notes: null,
  billing_mode: 'per_order', default_payment_terms_days: null, created_at: ago(1000 + i),
}));
const DOCTORS = Array.from({ length: 7 }, (_, i) => ({
  id: `d${i + 1}`, full_name: `Hekim ${i + 1}`, phone: null, specialty: null, is_active: true,
  clinic_id: `c${(i % 5) + 1}`, clinic: { id: `c${(i % 5) + 1}`, name: CLINICS[i % 5].name },
}));
const MANAGERS = [
  { id: 'm1', full_name: 'Yönetici 1', phone: null, email: null, clinic_id: 'c1', is_active: true, user_type: 'clinic_admin', clinic: { id: 'c1', name: CLINICS[0].name } },
  { id: 'm2', full_name: 'Yönetici 2', phone: null, email: null, clinic_id: 'c2', is_active: true, user_type: 'clinic_secretary', clinic: { id: 'c2', name: CLINICS[1].name } },
];
const PENDING = [
  { id: 'p1', requested_at: ago(5), initiated_by: 'clinic', lab_clinic: { name: 'Klinik X' } },
  { id: 'p2', requested_at: ago(30), initiated_by: 'clinic', lab_clinic: { name: 'Klinik Y' } },
];

function reviewsFixture(month: string) {
  const base = { order_number: '2400', clinic_key: 'c:c1', clinic_name: CLINICS[0].name, doctor_name: 'Hekim 1', work_type_label: 'Zirkonya kron', source: 'app',
    overall: 2, fit: null, occlusion: null, contacts: null, esthetics: null, surface: null, on_time: null, comment: null, wa_answer: null, cur_min: 2,
    phone: '0532 000 00 00', called_by_name: null, call_note: null, note_updated_at: null, note_updated_by_name: null, previous_call: false };
  const lows = [
    { ...base, work_order_id: 'w1', created_at: ago(60), period_started_at: ago(60), called_at: null, is_open: true },
    { ...base, work_order_id: 'w2', order_number: '2401', created_at: ago(20), period_started_at: ago(20), called_at: null, is_open: true },
    { ...base, work_order_id: 'w3', order_number: '2402', created_at: ago(10), period_started_at: ago(10), called_at: null, is_open: true },
    { ...base, work_order_id: 'w4', order_number: '2403', created_at: ago(90), period_started_at: ago(90), called_at: ago(70), called_by_name: 'Yönetici 1', is_open: false },
  ];
  return {
    month,
    summary: { avg: 4.5, count: 21, low_count: 4, prev_avg: 4.7, rate: null, has_any: true },
    clinics: [{ key: 'c:c1', kind: 'clinic', name: CLINICS[0].name, series: [4.8, 4.7, 4.6, 4.7, 4.6, 4.3], counts: [3, 4, 4, 5, 6, 8], month_avg: 4.3, month_count: 8, month_low: 4, prev3_avg: 4.6 }],
    reviews: [],
    lows,
  };
}

/** PostgREST sorgu zincirini taklit eder: her yöntem kendini döner, await edilince sonuç verir. */
function fakeQuery(table: string) {
  const st: { inArgs: string[]; write: boolean } = { inArgs: [], write: false };
  const rows = () => {
    if (st.write) return null;
    if (table === 'clinics') return CLINICS;
    if (table === 'doctors') return DOCTORS;
    if (table === 'profiles') return st.inArgs.includes('clinic_secretary') ? MANAGERS : [];
    if (table === 'clinic_lab_memberships') return PENDING;
    if (table === 'labs') return [{ clinic_auto_approve: false }];
    return [];
  };
  const result = () => (st.write ? { data: null, error: { message: 'Demo: kayıt yapılmaz' } } : { data: rows(), error: null });
  const b: any = {};
  for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'is', 'or', 'ilike', 'gte', 'lte', 'gt', 'lt', 'not', 'range', 'filter', 'match', 'contains']) b[m] = () => b;
  b.in = (_c: string, v: string[]) => { st.inArgs = v ?? []; return b; };
  for (const m of ['insert', 'update', 'delete', 'upsert']) b[m] = () => { st.write = true; return b; };
  b.single = () => Promise.resolve(st.write ? result() : { data: (rows() ?? [])[0] ?? null, error: null });
  b.maybeSingle = b.single;
  b.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
  return b;
}

export default function ClinicsNavDemo() {
  const { noreviews, lang } = useLocalSearchParams<{ noreviews?: string; lang?: string }>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = supabase as any;
    const orig = { from: sb.from, rpc: sb.rpc };
    const prevProfile = useAuthStore.getState().profile;
    const prevLang = i18n.language;
    let prevCache: string | null = null;
    try { prevCache = window.localStorage.getItem(CACHE_KEY); window.localStorage.removeItem(CACHE_KEY); } catch { /* yok */ }
    const restoreCache = () => {
      try { prevCache == null ? window.localStorage.removeItem(CACHE_KEY) : window.localStorage.setItem(CACHE_KEY, prevCache); } catch { /* yok */ }
    };

    sb.from = (table: string) => fakeQuery(table);
    sb.rpc = (fn: string, args: any) => {
      if (fn === 'get_review_dashboard') {
        const m = (args?.p_month as string | null) ?? currentTrMonth(new Date());
        return new Promise((r) => setTimeout(() => r({ data: reviewsFixture(m), error: null }), 250));
      }
      if (fn === 'lab_get_or_create_public_code') return Promise.resolve({ data: 'DEMO-2026', error: null });
      return Promise.resolve({ data: null, error: { message: 'Demo: sunucu çağrısı yapılmaz' } });
    };
    useAuthStore.setState({
      profile: { id: 'demo', full_name: 'Demo', user_type: 'lab', role: noreviews === '1' ? 'technician' : 'manager' } as any,
    });
    if (lang && lang !== prevLang) i18n.changeLanguage(lang);
    window.addEventListener?.('beforeunload', restoreCache);
    setReady(true);
    return () => {
      sb.from = orig.from;
      sb.rpc = orig.rpc;
      useAuthStore.setState({ profile: prevProfile });
      if (lang && lang !== prevLang) i18n.changeLanguage(prevLang);
      window.removeEventListener?.('beforeunload', restoreCache);
      restoreCache();
    };
  }, [noreviews, lang]);

  return <View style={{ flex: 1 }}>{ready ? <ClinicsScreen /> : null}</View>;
}
