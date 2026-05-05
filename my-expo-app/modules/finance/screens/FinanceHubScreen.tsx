/**
 * FinanceHubScreen — Mali İşlemler Hub (Patterns Design Language)
 *
 * Sidebar: Ayarlar sayfasıyla aynı minimal vertical-tab pattern.
 * Mobile: gruplu pill strip.
 * PatternsShell header "Mali İşlemler" başlığını gösterir.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  useWindowDimensions,
} from 'react-native';
import {
  TrendingUp, Users, PieChart, BarChart2, FileText, Building2,
  CreditCard, TrendingDown, Landmark, Tag,
} from 'lucide-react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';

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
  { key: 'invoices',       label: 'Faturalar',   icon: FileText,   accent: '#2563EB', hint: 'Fatura yönetimi' },
  { key: 'clinic_balance', label: 'Cari Hesap',  icon: Building2,  accent: '#0EA5E9', hint: 'Klinik bakiyeleri' },
  { key: 'checks',         label: 'Çek / Senet', icon: CreditCard, accent: '#D97706', hint: 'Vadeli ödemeler' },
];

const OPERATION_TABS: TabDef[] = [
  { key: 'expenses',  label: 'Giderler',      icon: TrendingDown, accent: '#DC2626', hint: 'Sabit + değişken' },
  { key: 'cash',      label: 'Kasa / Banka',  icon: Landmark,     accent: '#059669', hint: 'Hesap hareketleri' },
  { key: 'pricelist', label: 'Fiyat Listesi', icon: Tag,          accent: '#0891B2', hint: 'Hizmet katalog' },
];

const TAB_GROUPS = [
  { title: 'Analiz',    items: ANALYSIS_TABS },
  { title: 'Tahsilat',  items: COLLECTION_TABS },
  { title: 'Operasyon', items: OPERATION_TABS },
];
const ALL_TABS = TAB_GROUPS.flatMap(g => g.items);

// Sidebar accent — uses a neutral warm tone like Settings
const SIDEBAR_ACCENT = '#F5C24B';

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function FinanceHubScreen() {
  const [activeKey, setActiveKey] = useState('profitability');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  // PatternsShell başlık
  const { setTitle, clear } = usePageTitleStore();
  useEffect(() => {
    setTitle('Mali İşlemler', '');
    return clear;
  }, []);

  const activeTab = ALL_TABS.find(t => t.key === activeKey)!;

  return (
    <View style={{ flex: 1 }}>

      {/* ── Filter Bar — mobile only (desktop uses sidebar) ──── */}
      {!isDesktop && (
        <View className="px-4 pt-3 pb-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, alignItems: 'center' }}
          >
            {TAB_GROUPS.map((group, gi) => (
              <React.Fragment key={gi}>
                {gi > 0 && (
                  <View className="w-px h-5 bg-black/[0.08] mx-1" />
                )}
                <View className="flex-row gap-0.5 p-0.5 bg-cream-panel rounded-full">
                  {group.items.map(tab => {
                    const active = tab.key === activeKey;
                    const TabIcon = tab.icon;
                    return (
                      <Pressable
                        key={tab.key}
                        onPress={() => setActiveKey(tab.key)}
                        className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                        style={active ? { backgroundColor: tab.accent } : undefined}
                      >
                        <TabIcon
                          size={12}
                          strokeWidth={active ? 2.2 : 1.8}
                          color={active ? '#FFFFFF' : tab.accent}
                        />
                        <Text
                          className={`text-[12px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}
                        >
                          {tab.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </React.Fragment>
            ))}
          </ScrollView>
        </View>
      )}

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
                      color: '#9A9A9A',
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
                          backgroundColor: isActive ? '#FFFFFF' : 'transparent',
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
                              backgroundColor: SIDEBAR_ACCENT,
                              marginLeft: -6,
                              marginRight: 4,
                            }}
                          />
                        )}
                        <TabIcon
                          size={15}
                          strokeWidth={isActive ? 2 : 1.6}
                          color={isActive ? '#0A0A0A' : '#9A9A9A'}
                        />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: isActive ? '600' : '400',
                            color: isActive ? '#0A0A0A' : '#6B6B6B',
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
            {/* Section header */}
            {activeTab && (
              <View style={{ paddingHorizontal: 28, paddingTop: 16, paddingBottom: 12 }}>
                <Text
                  style={{
                    ...DISPLAY,
                    fontSize: 24,
                    letterSpacing: -0.5,
                    color: '#0A0A0A',
                    marginBottom: 4,
                  }}
                >
                  {activeTab.label}
                </Text>
                <Text style={{ fontSize: 13, color: '#9A9A9A', lineHeight: 19 }}>
                  {activeTab.hint}
                </Text>
              </View>
            )}

            {/* Section body */}
            <HubContext.Provider value={true}>
              <View style={{ flex: 1, minHeight: 0 }}>
                <TabContent activeKey={activeKey} />
              </View>
            </HubContext.Provider>
          </View>
        </View>
      ) : (
        /* Mobile: just content */
        <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 4 }}>
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
      {activeKey === 'checks'         && <ChecksScreen />}
      {activeKey === 'expenses'       && <ExpensesScreen />}
      {activeKey === 'cash'           && <CashScreen />}
      {activeKey === 'pricelist'      && <PriceListScreen />}
    </>
  );
}

export default FinanceHubScreen;
