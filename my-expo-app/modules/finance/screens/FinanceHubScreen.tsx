/**
 * FinanceHubScreen — Modern Mali İşlemler Hub
 *
 *  Layout:
 *    Desktop ≥ 980 → Sol sidebar (sticky) + sağ content
 *    Mobile        → Üst pill chip strip (yatay scroll) + content
 *
 *  Her sekme kendi accent rengini taşır:
 *    • Aktif sekme: dolu chip (sidebar) veya pill (mobil) — accent bg + beyaz text
 *    • Pasif: hafif accent tint + accent text
 *
 *  Sidebar group'lara ayrıldı:
 *    • ANALİZ        Karlılık · Personel Verim · Bütçe · Rapor
 *    • TAHSİLAT      Faturalar · Cari Hesap · Çek/Senet
 *    • OPERASYON     Giderler · Kasa/Banka · Fiyat Listesi
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, useWindowDimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HubContext } from '../../../core/ui/HubContext';
import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';

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

// ── Sekme tanımları (3 grup) ─────────────────────────────────────────────────
interface TabDef {
  key:     string;
  label:   string;
  icon:    string;
  accent:  string;
  bg:      string;
  hint?:   string;     // Sidebar'da küçük ikincil metin
}

const NAV_GROUPS: { title: string; items: TabDef[] }[] = [
  {
    title: 'ANALİZ',
    items: [
      { key: 'profitability', label: 'Karlılık',       icon: 'trending-up',     accent: '#059669', bg: '#ECFDF5', hint: 'Kar marjı analizi'  },
      { key: 'tech_perf',     label: 'Personel Verim', icon: 'users',           accent: '#7C3AED', bg: '#EDE9FE', hint: 'Teknisyen üretim'   },
      { key: 'budget',        label: 'Bütçe',          icon: 'chart-pie',       accent: '#7C3AED', bg: '#EDE9FE', hint: 'Plan vs. gerçek'    },
      { key: 'report',        label: 'Rapor',          icon: 'bar-chart-2',     accent: '#0F172A', bg: '#F1F5F9', hint: 'Aylık özet'         },
    ],
  },
  {
    title: 'TAHSİLAT',
    items: [
      { key: 'invoices',      label: 'Faturalar',     icon: 'file-text',     accent: '#2563EB', bg: '#EFF6FF', hint: 'Fatura yönetimi'   },
      { key: 'clinic_balance',label: 'Cari Hesap',    icon: 'building-2',    accent: '#0EA5E9', bg: '#E0F2FE', hint: 'Klinik bakiyeleri' },
      { key: 'checks',        label: 'Çek / Senet',   icon: 'credit-card',   accent: '#D97706', bg: '#FFFBEB', hint: 'Vadeli ödemeler'   },
    ],
  },
  {
    title: 'OPERASYON',
    items: [
      { key: 'expenses',      label: 'Giderler',      icon: 'trending-down', accent: '#DC2626', bg: '#FEF2F2', hint: 'Sabit + değişken'  },
      { key: 'cash',          label: 'Kasa / Banka',  icon: 'landmark',      accent: '#059669', bg: '#ECFDF5', hint: 'Hesap hareketleri' },
      { key: 'pricelist',     label: 'Fiyat Listesi', icon: 'tag',           accent: '#0891B2', bg: '#ECFEFF', hint: 'Hizmet katalog'    },
    ],
  },
];

const ALL_TABS: TabDef[] = NAV_GROUPS.flatMap(g => g.items);
type TabKey = string;

// ─── Hub Screen ──────────────────────────────────────────────────────────────
export function FinanceHubScreen() {
  const [activeKey, setActiveKey] = useState<TabKey>('profitability');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 980;

  const activeTab = ALL_TABS.find(t => t.key === activeKey)!;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Üst başlık banner — accent renkli ── */}
      <View style={[s.banner, { backgroundColor: activeTab.bg, borderBottomColor: activeTab.accent + '22' }]}>
        <View style={s.bannerLeft}>
          <View style={[s.bannerIcon, { backgroundColor: activeTab.accent }]}>
            <AppIcon name={activeTab.icon} size={18} color="#FFFFFF" strokeWidth={2.25} />
          </View>
          <View>
            <Text style={s.bannerKicker}>Mali İşlemler</Text>
            <Text style={[s.bannerTitle, { color: activeTab.accent }]}>{activeTab.label}</Text>
            {activeTab.hint && (
              <Text style={[s.bannerHint, { color: activeTab.accent + 'BB' }]}>{activeTab.hint}</Text>
            )}
          </View>
        </View>
      </View>

      {/* ── Mobile: yatay pill strip ── */}
      {!isDesktop && (
        <View style={[s.mobileTabWrap, { borderBottomColor: '#F1F5F9' }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.mobileTabScroll}
          >
            {ALL_TABS.map(tab => {
              const active = tab.key === activeKey;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveKey(tab.key)}
                  activeOpacity={0.85}
                  style={[
                    s.pill,
                    active
                      ? { backgroundColor: tab.accent, borderColor: tab.accent }
                      : { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' },
                  ]}
                >
                  <AppIcon
                    name={tab.icon}
                    size={13}
                    color={active ? '#FFFFFF' : tab.accent}
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                  <Text style={[s.pillText, active ? { color: '#FFFFFF' } : { color: tab.accent }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Desktop: sidebar + content split ── */}
      <View style={[s.body, isDesktop && { flexDirection: 'row' }]}>
        {isDesktop && (
          <View style={s.sidebarWrap}>
            <View style={s.sidebarCard}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 10, gap: 18 }}
              >
                {NAV_GROUPS.map(group => (
                  <View key={group.title} style={{ gap: 4 }}>
                    <Text style={s.groupLabel}>{group.title}</Text>
                    {group.items.map(tab => {
                      const active = tab.key === activeKey;
                      return (
                        <TouchableOpacity
                          key={tab.key}
                          onPress={() => setActiveKey(tab.key)}
                          activeOpacity={0.85}
                          style={[
                            s.navRow,
                            active && { backgroundColor: tab.accent + '12' },
                          ]}
                        >
                          {/* Active accent strip (sol kenar) */}
                          {active && <View style={[s.activeStrip, { backgroundColor: tab.accent }]} />}

                          <View style={[
                            s.navIcon,
                            { backgroundColor: active ? tab.accent : tab.bg },
                          ]}>
                            <AppIcon
                              name={tab.icon}
                              size={14}
                              color={active ? '#FFFFFF' : tab.accent}
                              strokeWidth={active ? 2.25 : 1.75}
                            />
                          </View>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={[
                                s.navLabel,
                                active && { color: tab.accent, fontWeight: '700' },
                              ]}
                              numberOfLines={1}
                            >
                              {tab.label}
                            </Text>
                            {tab.hint && (
                              <Text style={s.navHint} numberOfLines={1}>{tab.hint}</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Content */}
        <HubContext.Provider value={true}>
          <View style={s.content}>
            {activeKey === 'profitability'  && <ProfitabilityScreen />}
            {activeKey === 'tech_perf'      && <TechnicianPerformanceScreen />}
            {activeKey === 'invoices'       && <InvoicesListScreen />}
            {activeKey === 'clinic_balance' && <ClinicBalanceScreen />}
            {activeKey === 'expenses'       && <ExpensesScreen />}
            {activeKey === 'budget'         && <BudgetScreen />}
            {activeKey === 'checks'         && <ChecksScreen />}
            {activeKey === 'cash'           && <CashScreen />}
            {activeKey === 'pricelist'      && <PriceListScreen />}
            {activeKey === 'report'         && <FinanceReportScreen />}
          </View>
        </HubContext.Provider>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: CardSpec.pageBg },

  // Banner (üst başlık)
  banner:    { paddingHorizontal: 22, paddingVertical: 18, borderBottomWidth: 1 },
  bannerLeft:{ flexDirection: 'row', alignItems: 'center', gap: 14 },
  bannerIcon:{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...Shadows.cardLite },
  bannerKicker: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, textTransform: 'uppercase' },
  bannerTitle:  { fontSize: 24, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  bannerHint:   { fontSize: 12, fontWeight: '500', marginTop: 2 },

  // Mobile pill tab bar
  mobileTabWrap:  { backgroundColor: '#FFFFFF', borderBottomWidth: 1 },
  mobileTabScroll:{ paddingHorizontal: 14, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  pill:           { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  pillText:       { fontSize: 12, fontWeight: '700', letterSpacing: -0.1 },

  // Body (desktop split)
  body:    { flex: 1 },

  // Desktop sidebar
  sidebarWrap: { width: 240, padding: 12, paddingRight: 6 },
  sidebarCard: {
    flex: 1,
    backgroundColor: CardSpec.bg,
    borderRadius: CardSpec.radius,
    borderWidth: 1,
    borderColor: CardSpec.border,
    ...Shadows.card,
  } as any,
  groupLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },

  navRow:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10,
    position: 'relative',
  },
  activeStrip: {
    position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2,
  },
  navIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  navLabel:{ fontSize: 13, fontWeight: '600', color: '#0F172A', letterSpacing: -0.1 },
  navHint: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  content: { flex: 1, padding: 12, paddingLeft: 6 },
});
