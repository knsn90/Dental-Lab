// app/dev/reviews-dashboard.tsx — Değerlendirmeler ekranı demo (yalnız __DEV__; ağ çağrısı YOK).
// Canlı hesap salt okunur olduğu için liste, pencere, boş/hata durumları burada denenir.
// Parametreler: ?empty=1 (hiç değerlendirme yok) · ?err=1 (yükleme hatası) · ?focus=w2 · ?lang=fa
// get_review_dashboard / review_followup_set_call bu sayfa açıkken sahte veriyle yanıtlanır.
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import i18n from 'i18next';
import { supabase } from '../../core/api/supabase';
import { useInkUI } from '../../core/theme/inkScale';
import { ReviewsDashboard } from '../../modules/reviews/components/dashboard/ReviewsDashboard';
import { currentTrMonth } from '../../modules/reviews/dashboardRules';
import type { ReviewDashboard, ReviewLowRow, ReviewDashRow } from '../../modules/reviews/types';

const H = 3600_000;
const ago = (h: number) => new Date(Date.now() - h * H).toISOString();

function review(p: Partial<ReviewDashRow>): ReviewDashRow {
  return {
    work_order_id: 'w', order_number: '2400', clinic_key: 'c:a', clinic_name: 'Klinik A', doctor_name: 'Hekim 1',
    work_type_label: 'Zirkonya kron', created_at: ago(30), source: 'app',
    overall: 5, fit: null, occlusion: null, contacts: null, esthetics: null, surface: null, on_time: null,
    comment: null, wa_answer: null, cur_min: 5, ...p,
  };
}
function low(p: Partial<ReviewLowRow>): ReviewLowRow {
  return {
    ...review({}), phone: '0532 000 00 00', period_started_at: ago(10), called_at: null, called_by_name: null,
    call_note: null, note_updated_at: null, note_updated_by_name: null, is_open: true, previous_call: false, ...p,
  } as ReviewLowRow;
}

function fixture(month: string, empty: boolean): ReviewDashboard {
  if (empty) {
    return { month, summary: { avg: null, count: 0, low_count: 0, prev_avg: null, rate: null, has_any: false }, clinics: [], reviews: [], lows: [] };
  }
  const cur = month === currentTrMonth(new Date());
  const lows: ReviewLowRow[] = [
    low({ work_order_id: 'w1', order_number: '2466', clinic_key: 'c:c', clinic_name: 'Klinik C', doctor_name: 'Hekim 2', work_type_label: 'E.max kron',
      source: 'whatsapp', overall: 1, wa_answer: 1, cur_min: 1, comment: 'Renk uymadı.', period_started_at: ago(52), created_at: ago(52) }),
    low({ work_order_id: 'w2', order_number: '2481', clinic_key: 'c:c', clinic_name: 'Klinik C', doctor_name: 'Hekim 1', work_type_label: 'Zirkonya köprü',
      overall: 3, fit: 2, contacts: 3, cur_min: 2, comment: 'Distal kontakt açık geldi, ağızda düzelttik.', period_started_at: ago(20), created_at: ago(20), phone: null }),
    low({ work_order_id: 'w3', order_number: '2459', clinic_key: 'c:a', clinic_name: 'Klinik A', doctor_name: 'Hekim 3', work_type_label: 'Metal destekli kron',
      overall: 4, on_time: 3, cur_min: 3, is_open: false, called_at: ago(70), called_by_name: 'Yönetici 1',
      call_note: 'Kurye gecikmesi; bir sonraki işte sabah teslim sözü verildi.', note_updated_at: ago(70), note_updated_by_name: 'Yönetici 1', created_at: ago(80) }),
    low({ work_order_id: 'w4', order_number: '2390', clinic_key: 'd:x', clinic_name: 'Hekim 4', doctor_name: 'Hekim 4', work_type_label: 'Gece plağı',
      overall: 2, cur_min: 2, previous_call: true, called_at: ago(400), called_by_name: 'Yönetici 2', call_note: 'İlk arama.', period_started_at: ago(100), created_at: ago(900) }),
  ];
  return {
    month,
    summary: cur
      ? { avg: 4.56, count: 23, low_count: 3, prev_avg: 4.78, rate: null, has_any: true }
      : { avg: 4.4, count: 18, low_count: 1, prev_avg: 4.4, rate: { delivered: 40, reviewed: 17 }, has_any: true },
    clinics: [
      { key: 'c:a', kind: 'clinic', name: 'Klinik A', series: [4.8, 4.8, 4.9, 4.7, 4.6, 4.5], counts: [3, 4, 5, 4, 6, 7], month_avg: 4.5, month_count: 7, month_low: 1, prev3_avg: 4.8 },
      { key: 'c:b', kind: 'clinic', name: 'Klinik B', series: [4.5, 4.6, 4.7, null, 4.8, 4.9], counts: [2, 3, 2, 0, 4, 6], month_avg: 4.9, month_count: 6, month_low: 0, prev3_avg: 4.7 },
      { key: 'c:c', kind: 'clinic', name: 'Klinik C', series: [4.6, 4.7, 4.6, 4.5, 4.0, 3.4], counts: [2, 2, 3, 3, 2, 4], month_avg: 3.4, month_count: 4, month_low: 2, prev3_avg: 4.6 },
      { key: 'c:d', kind: 'clinic', name: 'Klinik D', series: [4.9, 4.9, 4.8, 4.9, 4.9, null], counts: [1, 2, 1, 2, 1, 0], month_avg: null, month_count: 0, month_low: 0, prev3_avg: 4.9 },
      { key: 'd:x', kind: 'doctor', name: 'Hekim 4', series: [null, null, null, null, null, 5], counts: [0, 0, 0, 0, 0, 1], month_avg: 5, month_count: 1, month_low: 0, prev3_avg: null },
    ],
    reviews: [
      review({ work_order_id: 'w2', order_number: '2481', clinic_key: 'c:c', clinic_name: 'Klinik C', overall: 3, fit: 2, contacts: 3, cur_min: 2, comment: 'Distal kontakt açık geldi.' }),
      review({ work_order_id: 'w5', order_number: '2490', clinic_key: 'c:c', clinic_name: 'Klinik C', overall: 5, cur_min: 5, source: 'whatsapp', wa_answer: 5 }),
      review({ work_order_id: 'w6', order_number: '2477', clinic_key: 'c:a', clinic_name: 'Klinik A', overall: 5, cur_min: 5 }),
    ],
    lows: cur ? lows : [lows[3]],
  };
}

export default function ReviewsDashboardDemo() {
  const U = useInkUI();
  const { empty, err, focus, lang } = useLocalSearchParams<{ empty?: string; err?: string; focus?: string; lang?: string }>();
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const orig = (supabase as any).rpc;
    (supabase as any).rpc = (fn: string, args: any) => {
      if (fn === 'get_review_dashboard') {
        if (err === '1') return Promise.resolve({ data: null, error: { message: 'demo hata' } });
        const m = (args?.p_month as string | null) ?? currentTrMonth(new Date());
        return new Promise(r => setTimeout(() => r({ data: fixture(m, empty === '1'), error: null }), 300));
      }
      if (fn === 'review_followup_set_call') {
        const unmark = args?.p_action === 'unmark';
        const note = typeof args?.p_note === 'string' && args.p_note.trim() ? args.p_note.trim() : null;
        return Promise.resolve({ data: {
          called_at: unmark ? null : new Date().toISOString(), called_by_name: unmark ? null : 'Yönetici 1',
          call_note: unmark ? null : note, note_updated_at: !unmark && note ? new Date().toISOString() : null,
          note_updated_by_name: !unmark && note ? 'Yönetici 1' : null, is_open: unmark, previous_call: false,
        }, error: null });
      }
      return orig.call(supabase, fn, args);
    };
    const prevLang = i18n.language;
    if (lang && lang !== prevLang) i18n.changeLanguage(lang);
    setReady(true);
    return () => {
      (supabase as any).rpc = orig;
      if (lang && lang !== prevLang) i18n.changeLanguage(prevLang);
    };
  }, [empty, err, lang]);

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: U.pageBg }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      <View style={{ maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
        {ready ? <ReviewsDashboard focusWorkOrderId={focus ?? null} scrollRef={scrollRef} /> : null}
      </View>
    </ScrollView>
  );
}
