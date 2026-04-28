/**
 * FinanceHubScreen — Mali İşlemler tek modül hub ekranı
 *
 * 6 sekme: Faturalar · Giderler · Çek/Senet · Kasa/Banka · Fiyat Listesi · Rapor
 * HubContext ile alt ekranlara "embedded" sinyali verilir;
 * böylece her ekranın kendi SafeAreaView'i top inset uygulamaz.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { HubContext } from '../../../core/ui/HubContext';
import { AppIcon } from '../../../core/ui/AppIcon';

import { InvoicesListScreen }  from '../../invoices/screens/InvoicesListScreen';
import { ExpensesScreen }      from '../../expenses/screens/ExpensesScreen';
import { ChecksScreen }        from '../../checks/screens/ChecksScreen';
import { CashScreen }          from '../../cash/screens/CashScreen';
import { FinanceReportScreen } from './FinanceReportScreen';
import { PriceListScreen }     from './PriceListScreen';

// ── Tab tanımları ──────────────────────────────────────────────────────────────
const TABS = [
  { key: 'invoices',  label: 'Faturalar',     icon: 'file-text',     accent: '#2563EB', bg: '#EFF6FF' },
  { key: 'expenses',  label: 'Giderler',      icon: 'trending-down', accent: '#DC2626', bg: '#FEF2F2' },
  { key: 'checks',    label: 'Çek/Senet',    icon: 'credit-card',   accent: '#D97706', bg: '#FFFBEB' },
  { key: 'cash',      label: 'Kasa/Banka',   icon: 'landmark',      accent: '#059669', bg: '#ECFDF5' },
  { key: 'pricelist', label: 'Fiyat Listesi', icon: 'tag',           accent: '#0891B2', bg: '#ECFEFF' },
  { key: 'report',    label: 'Rapor',         icon: 'bar-chart-2',   accent: '#7C3AED', bg: '#EDE9FE' },
] as const;

type TabKey = typeof TABS[number]['key'];

// ── Hub Screen ─────────────────────────────────────────────────────────────────
export function FinanceHubScreen() {
  const [activeKey, setActiveKey] = useState<TabKey>('invoices');
  const insets = useSafeAreaInsets();
  const activeTab = TABS.find(t => t.key === activeKey)!;

  return (
    <View style={s.root}>
      {/* ── Sticky tab header (handles top safe area itself) ── */}
      <View style={[s.header, { paddingTop: insets.top, borderBottomColor: activeTab.accent + '22' }]}>

        {/* Section title row */}
        <View style={s.titleRow}>
          <View style={[s.titleIcon, { backgroundColor: activeTab.bg }]}>
            <AppIcon name={activeTab.icon} size={16} color={activeTab.accent} strokeWidth={2} />
          </View>
          <Text style={[s.titleText, { color: activeTab.accent }]}>Mali İşlemler</Text>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabScroll}
        >
          {TABS.map((tab) => {
            const active = tab.key === activeKey;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.tab, active && { borderBottomColor: tab.accent }]}
                onPress={() => setActiveKey(tab.key)}
                activeOpacity={0.75}
              >
                <AppIcon
                  name={tab.icon}
                  size={14}
                  color={active ? tab.accent : '#94A3B8'}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <Text style={[s.tabLabel, active && { color: tab.accent, fontWeight: '700' }]}>
                  {tab.label}
                </Text>
                {/* Active indicator dot */}
                {active && (
                  <View style={[s.activeDot, { backgroundColor: tab.accent }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content: sub-screen embedded inside HubContext ── */}
      <HubContext.Provider value={true}>
        <View style={s.content}>
          {activeKey === 'invoices'  && <InvoicesListScreen />}
          {activeKey === 'expenses'  && <ExpensesScreen />}
          {activeKey === 'checks'    && <ChecksScreen />}
          {activeKey === 'cash'      && <CashScreen />}
          {activeKey === 'pricelist' && <PriceListScreen />}
          {activeKey === 'report'    && <FinanceReportScreen />}
        </View>
      </HubContext.Provider>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    // @ts-ignore
    ...(Platform.OS === 'web' ? ({
      boxShadow: '0 1px 0 rgba(15,23,42,0.06)',
    } as any) : {
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    }),
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
  },
  titleIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  tabScroll: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
    marginBottom: -1,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
  },
  activeDot: {
    position: 'absolute',
    bottom: -1,
    left: '50%',
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  content: {
    flex: 1,
  },
});
