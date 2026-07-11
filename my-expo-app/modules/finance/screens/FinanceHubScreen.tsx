/**
 * FinanceHubScreen — Mali İşlemler Hub (Patterns Design Language)
 *
 * Sidebar: Ayarlar sayfasıyla aynı minimal vertical-tab pattern.
 * Mobile: gruplu pill strip.
 * PatternsShell header "Mali İşlemler" başlığını gösterir.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  useWindowDimensions, Modal, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  TrendingUp, Users, PieChart, BarChart2, FileText, Building2,
  CreditCard, TrendingDown, Landmark, Tag, Wallet, Truck,
  Sparkles, CheckSquare,
  Menu, X,
} from 'lucide-react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DS } from '../../../core/theme/dsTokens';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

import { InvoicesListScreen }  from '../../invoices/screens/InvoicesListScreen';
import { ClinicBalanceScreen } from '../../invoices/screens/ClinicBalanceScreen';
import { ExpensesScreen }      from '../../expenses/screens/ExpensesScreen';
import { ChecksScreen }        from '../../checks/screens/ChecksScreen';
import { CashScreen }          from '../../cash/screens/CashScreen';
import { FinanceReportScreen } from './FinanceReportScreen';
import { PriceListScreen }     from './PriceListScreen';
import { ProfitabilityScreen } from './ProfitabilityScreen';
import { TechnicianPerformanceScreen } from './TechnicianPerformanceScreen';
import { BudgetScreen } from './BudgetScreen';
import { SalariesAdvancesScreen } from './SalariesAdvancesScreen';
import { AdvanceRequestsAdminScreen } from '../../advance-requests/screens/AdvanceRequestsAdminScreen';
import BonusHubScreen from '../../payroll/bonus/screens/BonusHubScreen';
import { SuppliersScreen } from '../../suppliers/screens/SuppliersScreen';
import { PaymentApprovalsScreen } from '../../finance-clinic/screens/PaymentApprovalsScreen';

// ── Display font token ──────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ── Tab tanımları ────────────────────────────────────────────────────
interface TabDef {
  key:   string;
  label: string;
  icon:  React.ComponentType<any>;
  accent: string;
  hint:  string;
}

const ANALYSIS_TABS: TabDef[] = [
  { key: 'profitability', label: 'Karlılık',       icon: TrendingUp, accent: '#059669', hint: 'Kar marjı analizi' },
  { key: 'tech_perf',     label: 'Personel Verim', icon: Users,      accent: '#7C3AED', hint: 'Teknisyen üretim' },
  { key: 'budget',        label: 'Bütçe',          icon: PieChart,   accent: '#7C3AED', hint: 'Plan vs. gerçek' },
  { key: 'report',        label: 'Rapor',          icon: BarChart2,  accent: '#0F172A', hint: 'Aylık özet' },
];

const COLLECTION_TABS: TabDef[] = [
  { key: 'invoices',          label: 'Faturalar',        icon: FileText,   accent: '#2563EB', hint: 'Fatura yönetimi' },
  { key: 'clinic_balance',    label: 'Sağlık Kurumları', icon: Building2,  accent: '#0EA5E9', hint: 'Sağlık kurumu bakiyeleri' },
  { key: 'payment_approvals', label: 'Ödeme Onayları',   icon: CheckSquare, accent: '#D97706', hint: 'Klinik bildirimleri' },
  { key: 'suppliers',         label: 'Tedarikçiler',     icon: Truck,      accent: '#7C3AED', hint: 'Firma cari hesapları' },
  { key: 'checks',            label: 'Çek / Senet',      icon: CreditCard, accent: '#D97706', hint: 'Vadeli ödemeler' },
];

const OPERATION_TABS: TabDef[] = [
  { key: 'expenses',  label: 'Giderler',      icon: TrendingDown, accent: '#DC2626', hint: 'Sabit + değişken' },
  { key: 'salaries',  label: 'Maaşlar',       icon: Wallet,       accent: '#7C3AED', hint: 'Maaş + avans ödemeleri' },
  { key: 'advances',  label: 'Avans Talepleri', icon: Wallet,     accent: '#D97706', hint: 'Personel avans talepleri' },
  { key: 'bonus',     label: 'Prim Motoru',   icon: Sparkles,     accent: '#EA7A4C', hint: 'Bonus politikaları' },
  { key: 'cash',      label: 'Kasa / Banka',  icon: Landmark,     accent: '#059669', hint: 'Hesap hareketleri' },
  { key: 'pricelist', label: 'Fiyat Listesi', icon: Tag,          accent: '#0891B2', hint: 'Hizmet katalog' },
];

const TAB_GROUPS = [
  { title: 'Analiz',    items: ANALYSIS_TABS },
  { title: 'Hesaplar',  items: COLLECTION_TABS },
  { title: 'Operasyon', items: OPERATION_TABS },
];
const ALL_TABS = TAB_GROUPS.flatMap(g => g.items);

// Sidebar accent artık panel-aware: aktif çubuk için theme.primary kullanılır
// (lab → safran, admin → kobalt). Sabit renk yok.

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
interface FinanceHubProps {
  /** Aktif tab'ı seçili göstermek için override (örn. statement sayfası clinic_balance'ı highlight eder). */
  forceActiveKey?: string;
  /** Tab içeriği yerine render edilecek özel içerik (örn. ClinicStatementScreen). */
  overrideContent?: React.ReactNode;
}

export function FinanceHubScreen({ forceActiveKey, overrideContent }: FinanceHubProps = {}) {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const validKeys = ALL_TABS.map(t => t.key);

  // Tab state — URL (?tab=) ile senkron, refresh sonrası korunur
  const initialFromUrl = typeof params.tab === 'string' && validKeys.includes(params.tab) ? params.tab : null;
  const [activeKey, setActiveKeyRaw] = useState<string>(forceActiveKey ?? initialFromUrl ?? 'profitability');

  // URL'deki tab değişirse state'i güncelle (browser back/forward için)
  useEffect(() => {
    const t = typeof params.tab === 'string' ? params.tab : null;
    if (t && validKeys.includes(t) && t !== activeKey) {
      setActiveKeyRaw(t);
    }
  }, [params.tab]);

  // Tab değiştir → state + URL query string güncellenir
  const setActiveKey = useCallback((key: string) => {
    setActiveKeyRaw(key);
    try {
      router.setParams({ tab: key } as any);
    } catch { /* ignore — native bazı sürümlerde setParams yok */ }
  }, [router]);

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = width >= 1024;
  const theme = usePanelTheme();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [overflowOpen, setOverflowOpen] = useState(false);

  // PatternsShell başlık
  const { setTitle, clear } = usePageTitleStore();
  useEffect(() => {
    setTitle('Finans', '');
    return clear;
  }, []);

  const activeTab = ALL_TABS.find(t => t.key === activeKey)!;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>

      <MobilePageTitle title="Finans" subtitle="Gelir, gider ve nakit akışı" />

      {/* ── Filter Bar — mobile only (HR tab bar pattern + overflow sheet) ── */}
      {!isDesktop && (() => {
        // Ekrana sığacak şekilde — sadece 3 önemli başlık inline:
        // Karlılık (analiz) · Faturalar (hesaplar) · Giderler (operasyon)
        const PRIMARY_KEYS = ['profitability', 'invoices', 'expenses'];
        const PRIMARY_INLINE = PRIMARY_KEYS
          .map(k => ALL_TABS.find(t => t.key === k))
          .filter((t): t is TabDef => !!t);
        const activeInPrimary = PRIMARY_INLINE.some(t => t.key === activeKey);
        const activeTab = ALL_TABS.find(t => t.key === activeKey);
        const inlineTabs = activeInPrimary
          ? PRIMARY_INLINE
          : (activeTab ? [...PRIMARY_INLINE, activeTab] : PRIMARY_INLINE);
        return (
        <View style={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 }}>
          {/* Full-width pill — inline tab'lar eşit dağılır, sağda hamburger menü */}
          <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: T.cardSoft, borderRadius: 9999, alignItems: 'center' }}>
            {inlineTabs.map(tab => {
              const active = tab.key === activeKey;
              const TabIcon = tab.icon;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveKey(tab.key)}
                  style={{
                    flex: 1,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    paddingHorizontal: 8, paddingVertical: 7, borderRadius: 9999,
                    backgroundColor: active ? theme.primary : 'transparent',
                  }}
                >
                  <TabIcon
                    size={12}
                    strokeWidth={active ? 2.2 : 1.8}
                    color={active ? '#FFFFFF' : theme.primary}
                  />
                  <Text style={{ fontSize: 11, fontWeight: active ? '700' : '600', color: active ? '#FFFFFF' : T.ink3 }} numberOfLines={1}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}

            {/* ince ayırıcı */}
            <View style={{ width: 1, height: 16, backgroundColor: T.hairline, marginHorizontal: 2 }} />

            {/* Hamburger menü — sağ tarafta sabit, flex almaz */}
            <Pressable
              onPress={() => setOverflowOpen(true)}
              style={{
                alignItems: 'center', justifyContent: 'center',
                width: 36, height: 30, borderRadius: 9999,
                backgroundColor: 'transparent',
              }}
            >
              <Menu size={16} strokeWidth={2} color={theme.primary} />
            </Pressable>
          </View>
        </View>
        );
      })()}

      {/* ── Hamburger Drawer — sağ kenardan kayan side drawer ── */}
      <Modal visible={overflowOpen} transparent animationType="fade" onRequestClose={() => setOverflowOpen(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Backdrop — drawer'ın solundaki kalan alan, tıklayınca kapanır */}
          <Pressable
            onPress={() => setOverflowOpen(false)}
            style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' }}
            accessibilityLabel="Menüyü kapat"
          />
          {/* Drawer paneli — sağ kenar */}
          <View
            style={{
              width: Math.min(320, width * 0.85),
              height: '100%',
              backgroundColor: T.card,
              paddingTop: Math.max(insets.top, 12) + 8,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
              ...(typeof window !== 'undefined' ? {
                // @ts-ignore web
                boxShadow: '-4px 0 24px rgba(15,23,42,0.18)',
              } as any : {}),
            }}
          >
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3, marginBottom: 2 }}>
                  Finans
                </Text>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: T.ink }}>
                  Tüm menü
                </Text>
              </View>
              <Pressable onPress={() => setOverflowOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: T.hairline, alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color={T.ink2} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}>
              {(() => {
                const HIDE = new Set(['profitability', 'invoices', 'expenses']);
                return [
                  { title: 'Analiz', items: ANALYSIS_TABS.filter(t => !HIDE.has(t.key)) },
                  { title: 'Hesaplar', items: COLLECTION_TABS.filter(t => !HIDE.has(t.key)) },
                  { title: 'Operasyon', items: OPERATION_TABS.filter(t => !HIDE.has(t.key)) },
                ].filter(g => g.items.length > 0);
              })().map(group => (
                <View key={group.title} style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3, paddingHorizontal: 6, paddingVertical: 8 }}>
                    {group.title}
                  </Text>
                  {group.items.map(tab => {
                    const active = tab.key === activeKey;
                    const TabIcon = tab.icon;
                    return (
                      <Pressable
                        key={tab.key}
                        onPress={() => { setActiveKey(tab.key); setOverflowOpen(false); }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                          backgroundColor: active ? `${theme.primary}14` : 'transparent',
                        }}
                      >
                        <View style={{
                          width: 32, height: 32, borderRadius: 10,
                          backgroundColor: active ? theme.primary : `${theme.primary}14`,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <TabIcon size={15} strokeWidth={active ? 2.2 : 1.8} color={active ? '#FFFFFF' : theme.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13.5, fontWeight: '600', color: active ? theme.primary : T.ink }} numberOfLines={1}>{tab.label}</Text>
                          <Text style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }} numberOfLines={1}>{tab.hint}</Text>
                        </View>
                        {active && (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.primary }} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Content ──────────────────────────────────────────── */}
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>

          {/* ── Sidebar — Settings-style minimal vertical tabs ── */}
          <View style={{ width: 200, paddingTop: 24, paddingBottom: 16 }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 2, paddingHorizontal: 8 }}
            >
              {TAB_GROUPS.map((group, gi) => (
                <View key={group.title}>
                  {/* Group label */}
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: T.ink3,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      paddingHorizontal: 14,
                      paddingTop: gi === 0 ? 0 : 16,
                      paddingBottom: 8,
                    }}
                  >
                    {group.title}
                  </Text>

                  {group.items.map(tab => {
                    const isActive = tab.key === activeKey;
                    const TabIcon = tab.icon;
                    return (
                      <Pressable
                        key={tab.key}
                        onPress={() => setActiveKey(tab.key)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 12,
                          backgroundColor: isActive ? T.card : 'transparent',
                          // @ts-ignore web
                          cursor: 'pointer',
                        }}
                      >
                        {/* Active bar indicator */}
                        {isActive && (
                          <View
                            style={{
                              width: 3,
                              height: 16,
                              borderRadius: 2,
                              backgroundColor: theme.primary,
                              marginLeft: -6,
                              marginRight: 4,
                            }}
                          />
                        )}
                        <TabIcon
                          size={15}
                          strokeWidth={isActive ? 2 : 1.6}
                          color={isActive ? T.ink : T.ink3}
                        />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: isActive ? '600' : '400',
                            color: isActive ? T.ink : T.ink2,
                          }}
                        >
                          {tab.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>

          {/* ── Right content ─────────────────────────────────── */}
          <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            {/* Section header — pricelist kendi F2 hero başlığını render eder */}
            {activeTab && activeKey !== 'pricelist' && (
              <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 }}>
                <Text
                  style={{
                    ...DISPLAY,
                    fontSize: 24,
                    letterSpacing: -0.5,
                    color: T.ink,
                    marginBottom: 4,
                  }}
                >
                  {activeTab.label}
                </Text>
                <Text style={{ fontSize: 13, color: T.ink3, lineHeight: 19 }}>
                  {activeTab.hint}
                </Text>
              </View>
            )}

            {/* Section body */}
            <HubContext.Provider value={true}>
              <View style={{ flex: 1, minHeight: 0 }}>
                {overrideContent ?? <TabContent activeKey={activeKey} />}
              </View>
            </HubContext.Provider>
          </View>
        </View>
      ) : (
        /* Mobile: just content */
        <View style={{ flex: 1, paddingHorizontal: 0, paddingTop: 4 }}>
          <HubContext.Provider value={true}>
            <View style={{ flex: 1 }}>
              <TabContent activeKey={activeKey} />
            </View>
          </HubContext.Provider>
        </View>
      )}
    </View>
  );
}

// ─── Tab Content ─────────────────────────────────────────────────────
function TabContent({ activeKey }: { activeKey: string }) {
  return (
    <>
      {activeKey === 'profitability'  && <ProfitabilityScreen />}
      {activeKey === 'tech_perf'      && <TechnicianPerformanceScreen />}
      {activeKey === 'budget'         && <BudgetScreen />}
      {activeKey === 'report'         && <FinanceReportScreen />}
      {activeKey === 'invoices'       && <InvoicesListScreen />}
      {activeKey === 'clinic_balance' && <ClinicBalanceScreen />}
      {activeKey === 'payment_approvals' && <PaymentApprovalsScreen />}
      {activeKey === 'suppliers'      && <SuppliersScreen />}
      {activeKey === 'checks'         && <ChecksScreen />}
      {activeKey === 'expenses'       && <ExpensesScreen />}
      {activeKey === 'salaries'       && <SalariesAdvancesScreen />}
      {activeKey === 'advances'       && <AdvanceRequestsAdminScreen />}
      {activeKey === 'bonus'          && <BonusHubScreen />}
      {activeKey === 'cash'           && <CashScreen />}
      {activeKey === 'pricelist'      && <PriceListScreen />}
    </>
  );
}

export default FinanceHubScreen;
