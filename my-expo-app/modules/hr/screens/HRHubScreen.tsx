/**
 * HRHubScreen — İnsan Kaynakları tek modül hub ekranı
 *
 * 4 sekme: Ekip · İzin & Devam · Performans · Dosyalar
 *
 * Desktop: sol sidebar (icon + label) + sağ content
 * Mobile:  horizontal pill bar + full-width content
 *
 * Matches StockScreen hub layout pattern.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal,
  useWindowDimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HubContext } from '../../../core/ui/HubContext';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import {
  Users, CalendarDays, Trophy, FolderOpen, Plus, Cpu, UserCog, Menu, X,
} from '../../../core/ui/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { EmployeesScreen }   from '../../employees/screens/EmployeesScreen';
import { HRScreen }          from './HRScreen';
import { PerformanceScreen } from '../../performance/screens/PerformanceScreen';
import { DocumentsScreen }   from '../../documents/screens/DocumentsScreen';
import { SkillCatalogScreen, StationPermissionsScreen } from './TeamCompetencyScreens';

// ── Display font ──
const DISPLAY = {
  fontFamily: DS.font?.display ?? 'Inter',
  fontWeight: '300' as const,
};

// ── Tab tanımları ──
const TABS = [
  { key: 'employees',   label: 'Ekip',   hint: 'Personel listesi ve profilleri',    icon: Users,        accent: '#0F172A' },
  { key: 'people',      label: 'Personel',       hint: 'Teknisyen istasyon yetkileri',      icon: UserCog,      accent: '#0F172A' },
  { key: 'skills',      label: 'Yetkinlikler',   hint: 'Beceri kataloğu',                   icon: Cpu,          accent: '#0F172A' },
  { key: 'hr',          label: 'İzin & Devam',  hint: 'İzin talepleri ve devamsızlık',     icon: CalendarDays, accent: '#0F172A' },
  { key: 'performance', label: 'Performans',     hint: 'Teknisyen ve istasyon performansı', icon: Trophy,       accent: '#D97706' },
  { key: 'documents',   label: 'Dosyalar',       hint: 'Belgeler ve dökümanlar',            icon: FolderOpen,   accent: '#DC2626' },
] as const;

type TabKey = typeof TABS[number]['key'];

// ── Hub Screen ──
export function HRHubScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const initialTab: TabKey = (TABS.some(t => t.key === params.tab) ? params.tab : 'employees') as TabKey;
  const [tab, setTabRaw] = useState<TabKey>(initialTab);

  // Sekme URL'e YAZILIR: yenilemede (F5) ya da bağlantı paylaşımında aynı
  // sekme açılsın. Eskiden ?tab= yalnız OKUNUYORDU; state'e yazılmadığı için
  // sayfa yenilenince her zaman ilk sekmeye ("Ekip") düşüyordu.
  const setTab = useCallback((k: TabKey) => {
    setTabRaw(k);
    try { router.setParams({ tab: k } as any); } catch { /* native fallback */ }
  }, [router]);

  // Geri/ileri tuşu ya da dışarıdan gelen derin bağlantı state'i güncellesin.
  useEffect(() => {
    const t = typeof params.tab === 'string' ? params.tab : null;
    if (t && TABS.some(x => x.key === t) && t !== tab) setTabRaw(t as TabKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab]);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const insets = useSafeAreaInsets();
  const theme = usePanelTheme();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const activeTab = TABS.find(t => t.key === tab)!;
  // Mobil sekme şeridinin sonundaki hamburger — tüm sekmeler tek listede.
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const accentColor = theme.primary;

  /** Sekme aksanı: nötr koyu lacivert (#0F172A) koyu zeminde kaybolur → ink'e çevir. */
  const tabAccent = useCallback(
    (a: string) => (isDark && a === '#0F172A' ? T.ink : a),
    [isDark, T.ink],
  );

  const renderContent = () => {
    switch (tab) {
      case 'employees':   return <EmployeesScreen />;
      case 'people':      return <StationPermissionsScreen />;
      case 'skills':      return <SkillCatalogScreen />;
      case 'hr':          return <HRScreen />;
      case 'performance': return <PerformanceScreen />;
      case 'documents':   return <DocumentsScreen />;
      default:            return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>

      {/* Mobilde sayfa başlığı — masaüstündeki başlık çubuğunun karşılığı;
          mobilde hiç görünmüyordu (kullanıcı bildirdi). */}
      <MobilePageTitle title={activeTab.label} subtitle={activeTab.hint} />

      {/* ── Sekme şeridi — mobil (Finans hub kalıbı: tam genişlik hap + hamburger) ── */}
      {!isDesktop && (() => {
        // Ekrana sığsın: üç ana bölüm inline, gerisi menüde. Açık sekme
        // inline listede değilse ona da yer açılır (nerede olduğun görünsün).
        const PRIMARY_KEYS = ['employees', 'hr', 'performance'];
        const PRIMARY_INLINE = PRIMARY_KEYS
          .map(k => TABS.find(t => t.key === k))
          .filter((t): t is typeof TABS[number] => !!t);
        const activeInPrimary = PRIMARY_INLINE.some(t => t.key === tab);
        const inlineTabs = activeInPrimary ? PRIMARY_INLINE : [...PRIMARY_INLINE, activeTab];
        return (
          <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 4, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: T.cardSoft, borderRadius: 9999, alignItems: 'center' }}>
              {inlineTabs.map(t => {
                const active = t.key === tab;
                const TabIcon = t.icon;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={{
                      // Seçili sekme daha çok pay alır (uygulama geneli pill kuralı).
                      flex: active ? 1.55 : 1,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                      paddingHorizontal: active ? 12 : 8, paddingVertical: 8, borderRadius: 9999,
                      backgroundColor: active ? theme.primary : 'transparent',
                    }}
                  >
                    <TabIcon size={12} strokeWidth={active ? 2.2 : 1.8} color={active ? '#FFFFFF' : theme.primary} />
                    <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: active ? '700' : '600', color: active ? '#FFFFFF' : T.ink3 }}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}

              <View style={{ width: 1, height: 16, backgroundColor: T.hairline, marginHorizontal: 2 }} />

              <Pressable
                onPress={() => setTabMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Tüm menü"
                style={{ alignItems: 'center', justifyContent: 'center', width: 36, height: 30, borderRadius: 9999 }}
              >
                <Menu size={16} strokeWidth={2} color={theme.primary} />
              </Pressable>
            </View>
          </View>
        );
      })()}

      {/* ── Hamburger menü — sağ kenardan kayan drawer (Finans ile aynı) ── */}
      <Modal visible={tabMenuOpen} transparent animationType="fade" onRequestClose={() => setTabMenuOpen(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Pressable
            onPress={() => setTabMenuOpen(false)}
            style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' }}
            accessibilityLabel="Menüyü kapat"
          />
          <View
            style={{
              width: Math.min(320, width * 0.85),
              height: '100%',
              backgroundColor: T.card,
              paddingTop: Math.max(insets.top, 12) + 8,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
              ...(Platform.OS === 'web' ? ({ boxShadow: '-4px 0 24px rgba(15,23,42,0.18)' } as any) : {}),
            }}
          >
            <View style={{ paddingHorizontal: 20, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3, marginBottom: 2 }}>
                  Ekip
                </Text>
                <Text style={{ fontSize: 22, letterSpacing: -0.4, color: T.ink, fontWeight: '300' }}>
                  Tüm menü
                </Text>
              </View>
              <Pressable onPress={() => setTabMenuOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: T.hairline, alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color={T.ink2} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}>
              {TABS.map(t => {
                const active = t.key === tab;
                const TabIcon = t.icon;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => { setTab(t.key); setTabMenuOpen(false); }}
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
                      <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '600', color: active ? theme.primary : T.ink }}>{t.label}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{t.hint}</Text>
                    </View>
                    {active && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.primary }} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Layout ──────────────────────────────────────────────── */}
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>

          {/* ── Desktop Sidebar ─────────────────────────────────── */}
          {/* Sidebar sayfa ile birlikte kaymaz — ana kenar çubuğu gibi yerinde durur. */}
          <View
            style={{
              width: 220, paddingTop: 24, paddingBottom: 16,
              ...(Platform.OS === 'web'
                ? { position: 'sticky', top: 0, alignSelf: 'flex-start', maxHeight: '100vh' } as any
                : null),
            }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1, minHeight: 0 }}
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
                      backgroundColor: isActive ? T.card : 'transparent',
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
                          backgroundColor: tabAccent(t.accent),
                          marginStart: -6,
                          marginEnd: 4,
                        }}
                      />
                    )}
                    <View style={{
                      width: 28, height: 28, borderRadius: 8,
                      backgroundColor: isActive ? tabAccent(t.accent) + (isDark ? '1F' : '14') : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <TabIcon
                        size={15}
                        strokeWidth={isActive ? 2 : 1.6}
                        color={isActive ? tabAccent(t.accent) : T.ink3}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? '600' : '400',
                        color: isActive ? T.ink : T.ink2,
                        flex: 1,
                      }}
                    >
                      {t.label}
                    </Text>
                    {isActive && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tabAccent(t.accent) }} />
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
