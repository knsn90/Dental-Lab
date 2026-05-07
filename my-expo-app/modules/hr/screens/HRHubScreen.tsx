/**
 * HRHubScreen — İnsan Kaynakları tek modül hub ekranı
 *
 * 4 sekme: Çalışanlar · İzin & Devam · Performans · Dosyalar
 *
 * Desktop: sol sidebar (icon + label) + sağ content
 * Mobile:  horizontal pill bar + full-width content
 *
 * Matches StockScreen hub layout pattern.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  useWindowDimensions, Platform,
} from 'react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { DS } from '../../../core/theme/dsTokens';
import {
  Users, CalendarDays, Trophy, FolderOpen, Plus,
} from 'lucide-react-native';

import { EmployeesScreen }   from '../../employees/screens/EmployeesScreen';
import { HRScreen }          from './HRScreen';
import { PerformanceScreen } from '../../performance/screens/PerformanceScreen';
import { DocumentsScreen }   from '../../documents/screens/DocumentsScreen';

// ── Display font ──
const DISPLAY = {
  fontFamily: DS.font?.display ?? 'Inter',
  fontWeight: '300' as const,
};

// ── Tab tanımları ──
const TABS = [
  { key: 'employees',   label: 'Çalışanlar',   hint: 'Çalışan listesi ve profilleri',    icon: Users,        accent: '#0F172A' },
  { key: 'hr',          label: 'İzin & Devam',  hint: 'İzin talepleri ve devamsızlık',     icon: CalendarDays, accent: '#0F172A' },
  { key: 'performance', label: 'Performans',     hint: 'Teknisyen ve istasyon performansı', icon: Trophy,       accent: '#D97706' },
  { key: 'documents',   label: 'Dosyalar',       hint: 'Belgeler ve dökümanlar',            icon: FolderOpen,   accent: '#DC2626' },
] as const;

type TabKey = typeof TABS[number]['key'];

// ── Hub Screen ──
export function HRHubScreen() {
  const [tab, setTab] = useState<TabKey>('employees');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const activeTab = TABS.find(t => t.key === tab)!;
  const accentColor = activeTab.accent;

  const renderContent = () => {
    switch (tab) {
      case 'employees':   return <EmployeesScreen />;
      case 'hr':          return <HRScreen />;
      case 'performance': return <PerformanceScreen />;
      case 'documents':   return <DocumentsScreen />;
      default:            return null;
    }
  };

  return (
    <View style={{ flex: 1 }}>

      {/* ── Mobile: Horizontal pill bar ─────────────────────────── */}
      {!isDesktop && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: DS.ink[50], borderRadius: 9999 }}>
              {TABS.map(t => {
                const active = t.key === tab;
                const TabIcon = t.icon;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                      backgroundColor: active ? t.accent : 'transparent',
                    }}
                  >
                    <TabIcon
                      size={12}
                      strokeWidth={active ? 2.2 : 1.8}
                      color={active ? '#FFFFFF' : t.accent}
                    />
                    <Text style={{ fontSize: 11, fontWeight: active ? '700' : '600', color: active ? '#FFFFFF' : DS.ink[500] }}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Layout ──────────────────────────────────────────────── */}
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>

          {/* ── Desktop Sidebar ─────────────────────────────────── */}
          <View style={{ width: 220, paddingTop: 24, paddingBottom: 16 }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 2, paddingHorizontal: 10 }}
            >
              {TABS.map(t => {
                const isActive = t.key === tab;
                const TabIcon = t.icon;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
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
                    {isActive && (
                      <View
                        style={{
                          width: 3,
                          height: 16,
                          borderRadius: 2,
                          backgroundColor: t.accent,
                          marginLeft: -6,
                          marginRight: 4,
                        }}
                      />
                    )}
                    <View style={{
                      width: 28, height: 28, borderRadius: 8,
                      backgroundColor: isActive ? t.accent + '14' : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <TabIcon
                        size={15}
                        strokeWidth={isActive ? 2 : 1.6}
                        color={isActive ? t.accent : '#9A9A9A'}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? '600' : '400',
                        color: isActive ? '#0A0A0A' : '#6B6B6B',
                        flex: 1,
                      }}
                    >
                      {t.label}
                    </Text>
                    {isActive && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Desktop Content ──────────────────────────────────── */}
          <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            {/* Title bar */}
            <View style={{ paddingHorizontal: 28, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View>
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
            </View>

            <HubContext.Provider value={true}>
              {/* hr & documents have their own dual-panel scroll — render directly */}
              {(tab === 'hr' || tab === 'documents') ? (
                <View style={{ flex: 1 }}>
                  {renderContent()}
                </View>
              ) : (
                <ScrollView
                  contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 60 }}
                  showsVerticalScrollIndicator={false}
                >
                  {renderContent()}
                  <View style={{ height: 40 }} />
                </ScrollView>
              )}
            </HubContext.Provider>
          </View>
        </View>
      ) : (
        /* ── Mobile: full-width content ─────────────────────────── */
        <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 4 }}>
          <HubContext.Provider value={true}>
            {(tab === 'hr' || tab === 'documents') ? (
              <View style={{ flex: 1 }}>
                {renderContent()}
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={{ paddingBottom: 60 }}
                showsVerticalScrollIndicator={false}
              >
                {renderContent()}
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </HubContext.Provider>
        </View>
      )}
    </View>
  );
}
