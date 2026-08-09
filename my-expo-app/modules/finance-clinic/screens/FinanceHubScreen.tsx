/**
 * Mali İşlemler Hub — Klinik & Muayenehane.
 *
 * Solda sidebar (desktop) / üstte pill bar (mobile), sağda aktif sekme.
 * 6 sekme: Özet · Cari Ekstre · Bekleyen · Vadesi Geçen · Online POS · Ödemeler.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import {
  LayoutDashboard, BookOpen, Clock, AlertCircle, CreditCard, ListChecks,
} from 'lucide-react-native';

import { DS } from '../../../core/theme/dsTokens';
import { resolveClinicId } from '../api';
import { Loader, ErrorBar, PAGE_PADDING, DISPLAY } from '../components/atoms';

import { OverviewScreen } from './OverviewScreen';
import { StatementScreen } from './StatementScreen';
import { OpenInvoicesScreen } from './OpenInvoicesScreen';
import { OverdueScreen } from './OverdueScreen';
import { OnlinePosScreen } from './OnlinePosScreen';
import { PaymentHistoryScreen } from './PaymentHistoryScreen';

type TabKey = 'overview' | 'statement' | 'open' | 'overdue' | 'pos' | 'payments';

interface TabDef {
  key: TabKey;
  labelKey: string;
  hintKey: string;
  icon: any;
  accent: string;
}

const TABS: TabDef[] = [
  { key: 'overview',  labelKey: 'clinic.finance.tabs.overview',  hintKey: 'clinic.finance.tabs.overviewHint',  icon: LayoutDashboard, accent: '#0F172A' },
  { key: 'statement', labelKey: 'clinic.finance.tabs.statement', hintKey: 'clinic.finance.tabs.statementHint', icon: BookOpen,        accent: '#0EA5E9' },
  { key: 'open',      labelKey: 'clinic.finance.tabs.open',      hintKey: 'clinic.finance.tabs.openHint',      icon: Clock,           accent: '#D97706' },
  { key: 'overdue',   labelKey: 'clinic.finance.tabs.overdue',   hintKey: 'clinic.finance.tabs.overdueHint',   icon: AlertCircle,     accent: '#DC2626' },
  { key: 'pos',       labelKey: 'clinic.finance.tabs.pos',       hintKey: 'clinic.finance.tabs.posHint',       icon: CreditCard,      accent: '#7C3AED' },
  { key: 'payments',  labelKey: 'clinic.finance.tabs.payments',  hintKey: 'clinic.finance.tabs.paymentsHint',  icon: ListChecks,      accent: '#059669' },
];

export function ClinicFinanceHubScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [clinicId, setClinicId] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  // Sekme URL'e yazılır: yenilemede/paylaşımda aynı sekme açılsın.
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const [tab, setTabRaw] = useState<TabKey>(
    (TABS.some(x => x.key === params.tab) ? params.tab : 'overview') as TabKey,
  );
  const setTab = useCallback((k: TabKey) => {
    setTabRaw(k);
    try { router.setParams({ tab: k } as any); } catch { /* native fallback */ }
  }, [router]);
  useEffect(() => {
    const q = typeof params.tab === 'string' ? params.tab : null;
    if (q && TABS.some(x => x.key === q) && q !== tab) setTabRaw(q as TabKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = await resolveClinicId();
        if (alive) setClinicId(id);
      } catch (e: any) {
        if (alive) setError(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ---------- empty state'ler ---------- */
  if (loading) return <Loader />;
  if (error) {
    return (
      <View style={{ padding: PAGE_PADDING }}>
        <ErrorBar message={error} />
      </View>
    );
  }
  if (!clinicId) {
    return (
      <View style={{ padding: PAGE_PADDING }}>
        <ErrorBar message={t('clinic.finance.error.clinicNotFound')} />
      </View>
    );
  }

  /* ---------- aktif sekme içeriği ---------- */
  const renderContent = () => {
    switch (tab) {
      case 'overview':  return <OverviewScreen clinicId={clinicId} onJump={setTab} />;
      case 'statement': return <StatementScreen clinicId={clinicId} />;
      case 'open':      return <OpenInvoicesScreen clinicId={clinicId} />;
      case 'overdue':   return <OverdueScreen clinicId={clinicId} />;
      case 'pos':       return <OnlinePosScreen clinicId={clinicId} />;
      case 'payments':  return <PaymentHistoryScreen clinicId={clinicId} />;
    }
  };

  /* ====================================================================== */

  return (
    <View style={{ flex: 1 }}>
      {/* MOBILE: yatay scroll pill bar */}
      {!isDesktop ? (
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 8, paddingBottom: 4 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
            <View style={{
              flexDirection: 'row', gap: 2, padding: 4,
              backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 999,
            }}>
              {TABS.map(t_ => {
                const active = t_.key === tab;
                const Icon = t_.icon;
                return (
                  <Pressable
                    key={t_.key}
                    onPress={() => setTab(t_.key)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: active ? DS.ink[900] : 'transparent',
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Icon size={12} color={active ? '#FFF' : DS.ink[700]} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : DS.ink[700] }}>
                      {t(t_.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* DESKTOP: sidebar + content */}
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ width: 220, paddingTop: 16, paddingBottom: 16, paddingHorizontal: 12, gap: 4 }}>
            {TABS.map(t_ => {
              const active = t_.key === tab;
              const Icon = t_.icon;
              return (
                <Pressable
                  key={t_.key}
                  onPress={() => setTab(t_.key)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                    backgroundColor: active ? 'rgba(0,0,0,0.05)' : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {active ? (
                    <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: DS.ink[900], marginLeft: -6, marginRight: 4 }} />
                  ) : null}
                  <Icon size={14} color={active ? DS.ink[900] : DS.ink[500]} strokeWidth={1.8} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[700] }}>
                      {t(t_.labelKey)}
                    </Text>
                    <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: 1 }}>{t(t_.hintKey)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {renderContent()}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {renderContent()}
        </View>
      )}
    </View>
  );
}
