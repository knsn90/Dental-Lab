/**
 * Mali İşlemler Hub — Klinik & Muayenehane.
 *
 * Solda sidebar (desktop) / üstte pill bar (mobile), sağda aktif sekme.
 * 5 sekme: Özet · Cari Ekstre · Bekleyen · Online POS · Ödemeler.
 * ('overdue' görünmez bir takma ad: Bekleyen ekranını vadesi-geçen
 *  filtresiyle açar — eski derin bağlantılar kırılmasın.)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTurkeyOnlyFeatures } from '../../../core/store/labSettingsStore';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, Pressable, ScrollView, useWindowDimensions, Platform } from 'react-native';
import {
  LayoutDashboard, BookOpen, Clock, AlertCircle, CreditCard, ListChecks,
} from '../../../core/ui/icons';

import { DS } from '../../../core/theme/dsTokens';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { resolveClinicId } from '../api';
import { Loader, ErrorBar, PAGE_PADDING, DISPLAY } from '../components/atoms';

import { OverviewScreen } from './OverviewScreen';
import { StatementScreen } from './StatementScreen';
import { ClinicStatementScreen } from '../../invoices/screens/ClinicStatementScreen';
import { OpenInvoicesScreen } from './OpenInvoicesScreen';
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

const ALL_TABS: TabDef[] = [
  { key: 'overview',  labelKey: 'clinic.finance.tabs.overview',  hintKey: 'clinic.finance.tabs.overviewHint',  icon: LayoutDashboard, accent: '#0F172A' },
  { key: 'statement', labelKey: 'clinic.finance.tabs.statement', hintKey: 'clinic.finance.tabs.statementHint', icon: BookOpen,        accent: '#0EA5E9' },
  { key: 'open',      labelKey: 'clinic.finance.tabs.open',      hintKey: 'clinic.finance.tabs.openHint',      icon: Clock,           accent: '#D97706' },
  { key: 'pos',       labelKey: 'clinic.finance.tabs.pos',       hintKey: 'clinic.finance.tabs.posHint',       icon: CreditCard,      accent: '#7C3AED' },
  { key: 'payments',  labelKey: 'clinic.finance.tabs.payments',  hintKey: 'clinic.finance.tabs.paymentsHint',  icon: ListChecks,      accent: '#059669' },
];

export function ClinicFinanceHubScreen() {
  // Online POS = iyzico (Türk sağlayıcı). İran labında sekme HİÇ listelenmez;
  // TABS hem şeridi hem route çözümünü beslediği için tek yerden düşürmek yeterli.
  const trOnly = useTurkeyOnlyFeatures();
  const TABS = React.useMemo(
    () => ALL_TABS.filter(t_ => trOnly || t_.key !== 'pos'),
    [trOnly],
  );
  const { t } = useTranslation();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [clinicId, setClinicId] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  // Sekme URL'e yazılır: yenilemede/paylaşımda aynı sekme açılsın.
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  // 'overdue' şeritte yok ama geçerli bir adres (Bekleyen'i ön-filtreli açar) →
  // derin bağlantı çözümünde ayrıca kabul edilir, yoksa Özet'e düşerdi.
  const isValidTab = useCallback(
    (k: unknown) => typeof k === 'string' && (k === 'overdue' || TABS.some(x => x.key === k)),
    [TABS],
  );
  const [tab, setTabRaw] = useState<TabKey>(
    (isValidTab(params.tab) ? params.tab : 'overview') as TabKey,
  );
  const setTab = useCallback((k: TabKey) => {
    setTabRaw(k);
    try { router.setParams({ tab: k } as any); } catch { /* native fallback */ }
  }, [router]);
  useEffect(() => {
    const q = typeof params.tab === 'string' ? params.tab : null;
    if (q && isValidTab(q) && q !== tab) setTabRaw(q as TabKey);
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
      case 'statement': return <ClinicStatementScreen clinicId={clinicId} selfView />;
      case 'open':      return <OpenInvoicesScreen clinicId={clinicId} />;
      // 'overdue' ayrı sekme DEĞİL, aynı ekranın ön-filtreli hâli: vadesi
      // geçenler zaten bekleyenlerin alt kümesi, iki sekme aynı listeyi
      // gösteriyordu. Eski bağlantılar ve Özet'teki kısayol çalışsın diye
      // route anahtarı korunuyor.
      case 'overdue':   return <OpenInvoicesScreen clinicId={clinicId} onlyOverdue />;
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
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: 999,
            }}>
              {TABS.map(t_ => {
                const active = t_.key === tab || (t_.key === 'open' && tab === 'overdue');
                const Icon = t_.icon;
                return (
                  <Pressable
                    key={t_.key}
                    onPress={() => setTab(t_.key)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      // Seçili pill daha geniş dursun (uygulama geneli kural).
                      paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                      backgroundColor: active ? (isDark ? T.card : DS.ink[900]) : 'transparent',
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Icon size={12} color={active ? (isDark ? (T.ink as string) : '#FFF') : (isDark ? (T.ink2 as string) : DS.ink[700])} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? (isDark ? (T.ink as string) : '#FFF') : (isDark ? (T.ink2 as string) : DS.ink[700]) }}>
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
          {/* Sidebar sayfa ile birlikte kaymaz — ana kenar çubuğu gibi yerinde durur. */}
          <View
            style={{
              width: 220, paddingTop: 16, paddingBottom: 16, paddingHorizontal: 12, gap: 4,
              // Burada iç kaydırma yok (en çok 6 sekme) → maxHeight verilmez,
              // aksi halde uzun bir listede sekmeler kırpılabilirdi.
              ...(Platform.OS === 'web'
                ? { position: 'sticky', top: 0, alignSelf: 'flex-start' } as any
                : null),
            }}
          >
            {TABS.map(t_ => {
              const active = t_.key === tab || (t_.key === 'open' && tab === 'overdue');
              const Icon = t_.icon;
              return (
                <Pressable
                  key={t_.key}
                  onPress={() => setTab(t_.key)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                    backgroundColor: active ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {active ? (
                    <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: isDark ? T.ink : DS.ink[900], marginStart: -6, marginEnd: 4 }} />
                  ) : null}
                  <Icon size={14} color={active ? (isDark ? (T.ink as string) : DS.ink[900]) : (isDark ? (T.ink3 as string) : DS.ink[500])} strokeWidth={1.8} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: active ? (isDark ? T.ink : DS.ink[900]) : (isDark ? (T.ink2 as string) : DS.ink[700]) }}>
                      {t(t_.labelKey)}
                    </Text>
                    <Text style={{ fontSize: 10, color: isDark ? (T.ink3 as string) : DS.ink[400], marginTop: 1 }}>{t(t_.hintKey)}</Text>
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
