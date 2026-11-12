// app/dev/clinic-summary.tsx — Klinik müşteri kartı demo (ağ çağrısı YOK, sahte özet).
// Parametreler: ?lang=en|de|fa · ?dark=1 · ?open=1 (popup açık başlar) · ?noperm=1 (ciro/borç yetkisi yok)
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import i18n from 'i18next';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import { useInkUI } from '../../core/theme/inkScale';
import { PAGE_PADDING } from '../../core/ui/pageMetrics';
import { ClinicSummaryStrip } from '../../modules/clinicSummary/components/ClinicSummaryStrip';
import { ClinicSummaryModal } from '../../modules/clinicSummary/components/ClinicSummaryModal';
import type { ClinicSummary } from '../../modules/clinicSummary/summary';
import { TopClinicsCard } from '../../modules/clinicSummary/components/TopClinicsCard';

const fig = (orders: number, uye: number, cene: number, revenue: { currency: string; amount: number }[], base: number) =>
  ({ orders, qty: { uye, cene, adet: 0 }, revenue, revenueBase: base });

const DEMO_SUMMARIES: ClinicSummary[] = [
  {
    clinicId: 'c1', name: 'Dent Klinik Kadıköy',
    all: fig(214, 612, 9, [{ currency: 'TRY', amount: 1284500 }, { currency: 'EUR', amount: 4200 }], 1431000),
    month: fig(18, 47, 1, [{ currency: 'TRY', amount: 96400 }], 96400),
    lastOrderAt: '2026-11-11T09:20:00', balance: [{ currency: 'TRY', amount: 182300 }, { currency: 'EUR', amount: 900 }],
    overdue: [{ currency: 'TRY', amount: 64000 }], aging: null, oldestOverdueDays: 47,
    rating: { avg: 4.6, count: 23 },
  },
  {
    clinicId: 'c2', name: 'Gülüş Ağız ve Diş',
    all: fig(96, 241, 0, [{ currency: 'TRY', amount: 518000 }], 518000),
    month: fig(7, 19, 0, [{ currency: 'TRY', amount: 38000 }], 38000),
    lastOrderAt: '2026-11-08T14:00:00', balance: [{ currency: 'TRY', amount: 22000 }],
    overdue: [], aging: { current: 22000, d30: 0, d60: 0, d90: 0 }, oldestOverdueDays: null, rating: null,
  },
  {
    clinicId: 'c3', name: 'Yeni Klinik',
    all: fig(0, 0, 0, [], 0), month: fig(0, 0, 0, [], 0),
    lastOrderAt: null, balance: [], overdue: [], aging: null, oldestOverdueDays: null, rating: null,
  },
];

const EXTRA_TOP: ClinicSummary[] = [['c4','Ortodonti Merkezi Bakırköy',31,12],['c5','Smile Design Nişantaşı',22,9],['c6','Ankara Diş Polikliniği',11,3]].map(([id,name,u,o]) => ({
  clinicId: id as string, name: name as string, all: fig(o as number, u as number, 0, [], (u as number) * 900), month: fig(o as number, u as number, 0, [], (u as number) * 900),
  lastOrderAt: null, balance: [], overdue: [], aging: null, oldestOverdueDays: null, rating: null,
}));

const DEMO_MESSAGES = [
  { id: 'm1', workOrderId: 'o1', orderNumber: 'S-1042', content: 'Renk A2 olsun, prova için perşembe uygun mu?', createdAt: '2026-11-11T10:00:00' },
  { id: 'm2', workOrderId: 'o2', orderNumber: 'S-1038', content: 'Ölçüyü kurye ile gönderdik.', createdAt: '2026-11-09T16:30:00' },
];

export default function ClinicSummaryDemo() {
  const { lang, dark, open, noperm } = useLocalSearchParams<{ lang?: string; dark?: string; open?: string; noperm?: string }>();
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(open === '1' ? 'c1' : null);
  const U = useInkUI();

  useEffect(() => {
    const prevLang = i18n.language;
    if (lang && lang !== prevLang) i18n.changeLanguage(lang);
    const prevDark = useThemeModeStore.getState().resolvedDark;
    if (dark === '1') useThemeModeStore.setState({ resolvedDark: true } as any);
    const prevPerms = usePermissionStore.getState().permissions;
    const want = noperm === '1' ? [] : ['view_profit', 'view_clinic_balance'];
    const apply = () => usePermissionStore.setState({ permissions: new Set(want) } as any);
    apply();
    // Oturumsuz tarayıcıda auth dinleyicisi izinleri temizler → demo izinlerini geri yaz.
    const unsub = usePermissionStore.subscribe((st) => {
      if (want.some((k) => !st.permissions.has(k))) apply();
    });
    setReady(true);
    return () => {
      unsub();
      if (lang && lang !== prevLang) i18n.changeLanguage(prevLang);
      if (dark === '1') useThemeModeStore.setState({ resolvedDark: prevDark } as any);
      usePermissionStore.setState({ permissions: prevPerms } as any);
    };
  }, [lang, dark, noperm]);

  if (!ready) return <View />;
  const current = DEMO_SUMMARIES.find((s) => s.clinicId === openId) ?? null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: dark === '1' ? '#0E0E0E' : '#F5F1EB' }}
      contentContainerStyle={{ padding: PAGE_PADDING, gap: 12, maxWidth: 720 }}>
      <View style={{ width: 360, minHeight: 330 }}><TopClinicsCard fill summaries={new Map([...DEMO_SUMMARIES, ...EXTRA_TOP].map((x) => [x.clinicId, x]))} onOpen={setOpenId} /></View>
      <TopClinicsCard compact summaries={new Map(DEMO_SUMMARIES.map((x) => [x.clinicId, { ...x, month: { ...x.month, orders: 0, qty: { uye: 0, cene: 0, adet: 0 }, revenueBase: 0 } }]))} onOpen={setOpenId} />
      {DEMO_SUMMARIES.map((s) => (
        <View key={s.clinicId} style={U.cardSolid}>
          <Pressable onPress={() => setOpenId(s.clinicId)}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>{s.name}</Text>
          </Pressable>
          <ClinicSummaryStrip clinicId={s.clinicId} summary={s} onOpen={() => setOpenId(s.clinicId)} />
        </View>
      ))}
      <ClinicSummaryModal clinicId={openId} summary={current} messages={DEMO_MESSAGES} onClose={() => setOpenId(null)} />
    </ScrollView>
  );
}
