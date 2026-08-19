/**
 * SettingsHubScreen — Patterns Design Language
 * ─────────────────────────────────────────────
 * Tek seviyeli ayar paneli. Sol sidebar (minimal vertical tabs) + sağ içerik.
 * Patterns /dev/patterns "Dikey (settings sidebar)" referansına birebir uyumlu.
 *
 * Tüm paneller (lab, admin, doctor, clinic) aynı ekranı kullanır.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTurkeyOnlyFeatures } from '../../../core/store/labSettingsStore';
import { safeBack } from '../../../core/util/safeBack';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, Pressable, useWindowDimensions, Modal, Platform } from 'react-native';
import { useSegments, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Menu, X, Check } from 'lucide-react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { useColorThemeStore } from '../../../core/store/colorThemeStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { usePermissionStore } from '../../../core/store/permissionStore';

import { LabUsersManagement } from '../../admin/users/LabUsersManagement';
import { LabCheckinSettings } from '../../hr/screens/LabCheckinSettings';
import { StationsSection } from '../sections/StationsSection';
import { ProfileSection } from '../sections/ProfileSection';
import { NotificationsSection } from '../sections/NotificationsSection';
import { GeneralSection } from '../sections/GeneralSection';
import { IntegrationsScreen } from '../../integrations/screens/IntegrationsScreen';
import { LogsSection } from '../sections/LogsSection';
import { CurrencyRatesScreen } from './CurrencyRatesScreen';
import { SuppliersScreen } from '../../suppliers/screens/SuppliersScreen';
import { PermissionsScreen } from '../../admin/permissions/PermissionsScreen';
import { WorkflowStudioScreen } from '../../triage/screens/WorkflowStudioScreen';
import { EquipmentSection } from '../sections/EquipmentSection';
import { WorkHoursSection } from '../sections/WorkHoursSection';
import { MOBILE_PANEL_THEMES } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { isRTL } from '../../../core/i18n';

// ── Display font token ──────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ── Types ────────────────────────────────────────────────────────────────
type SectionKey =
  | 'profile' | 'notifications' | 'general'
  | 'users'   | 'checkin'    | 'stations'      | 'integrations' | 'logs'
  | 'permissions' | 'equipment' | 'currency' | 'suppliers' | 'workhours'
  | 'workflows';

type PanelKind = 'lab' | 'admin' | 'doctor' | 'clinic' | 'station';

interface NavItem {
  key:   SectionKey;
  label: string;
  sub:   string;
  /** If set, only show this tab when user has this permission */
  requiresPermission?: string;
  /** Yalnız TR bölgesinde görünür (e-Fatura/iyzico gibi Türkiye'ye özgü). */
  trOnly?: boolean;
  /** Sol menüde hangi başlık altında görünsün. Boşsa öncekinin grubuna girer.
      13 madde düz liste hâlindeyken "hangi ayar nerede" taranarak bulunuyordu. */
  group?: string;
}

// ── Panel accent mapping ─────────────────────────────────────────────────
const PANEL_ACCENTS: Record<PanelKind, string> = {
  lab:     '#F5C24B',
  admin:   '#4771AB',
  doctor:  '#32BB78',
  clinic:  '#32BB78',
  station: '#3B82F6',
};

// Light mode page bg — MOBILE_PANEL_THEMES.bgPage ile aynı (PatternsShell + Mobile uyumlu)
const PANEL_BG_LIGHT: Record<PanelKind, string> = {
  lab:     MOBILE_PANEL_THEMES.lab.bgPage,        // #F5F1EB krem
  admin:   MOBILE_PANEL_THEMES.exec.bgPage,       // #F5F1EB krem
  doctor:  MOBILE_PANEL_THEMES.doctor.bgPage,     // #F4FAF6 sage soft
  clinic:  MOBILE_PANEL_THEMES.klinik.bgPage,     // #F4FAF6 sage soft
  station: MOBILE_PANEL_THEMES.teknisyen.bgPage,  // #F5F9FD açık mavi
};
const PANEL_BG_DARK = '#0E0E0E';

function usePanelBg(panel: PanelKind): string {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return isDark ? PANEL_BG_DARK : PANEL_BG_LIGHT[panel];
}

function detectPanel(segments: string[]): PanelKind {
  const seg = segments?.[0] ?? '';
  if (seg === '(clinic)')  return 'clinic';
  if (seg === '(doctor)')  return 'doctor';
  if (seg === '(admin)')   return 'admin';
  if (seg === '(station)') return 'station';
  return 'lab';
}

// ── Nav items ────────────────────────────────────────────────────────────
const ACCOUNT_ITEMS: NavItem[] = [
  { key: 'profile',       label: 'Profil',      sub: 'Kişisel bilgiler ve güvenlik', group: 'Hesap' },
  { key: 'notifications', label: 'Bildirimler', sub: 'Uyarı ve bildirim tercihleri' },
  { key: 'general',       label: 'Genel',       sub: 'Dil, saat dilimi, format'     },
];

const LAB_ITEMS: NavItem[] = [
  // ── Organizasyon: kim, hangi yetkiyle, hangi düzende çalışıyor ──
  { key: 'users',        label: 'Kullanıcılar',  sub: 'Personel ve stage yetkileri',  requiresPermission: 'manage_users',    group: 'Organizasyon' },
  { key: 'permissions',  label: 'Yetkiler',      sub: 'Rol bazli erisim yonetimi',    requiresPermission: 'manage_settings' },
  { key: 'workhours',    label: 'Çalışma Saatleri', sub: 'Vardiya, öğle, eşzamanlı iş', requiresPermission: 'manage_settings' },
  { key: 'checkin',      label: 'QR Check-in',   sub: 'Mesai takip ayarları',         requiresPermission: 'manage_settings' },
  // ── Operasyon: üretim ve para akışını yapılandıran ayarlar ──
  { key: 'stations',     label: 'İstasyonlar',   sub: 'Üretim aşamaları',             requiresPermission: 'manage_settings', group: 'Operasyon' },
  { key: 'currency',     label: 'Döviz Kurları',  sub: 'EUR/USD/GBP kur yönetimi',     requiresPermission: 'manage_settings' },
  { key: 'integrations', label: 'Entegrasyonlar', sub: 'e-Fatura & POS ayarları',     requiresPermission: 'manage_settings', trOnly: true },
  // ── Sistem: gözlem ──
  // NOT: "WhatsApp Destek" buradan CIKARILDI — ayar degil, gunluk operasyon
  // ekrani. Artik kenar cubugunda Destek'in yaninda kendi girdisi var.
  { key: 'logs',         label: 'Loglar',         sub: 'Sistem aktivite kayıtları',   requiresPermission: 'manage_settings', group: 'Sistem' },
];

/** Yalnız admin panelinde: İş Akışları kenar çubuğundan buraya taşındı.
    Lab panelinde hâlâ kenar çubuğunda durduğu için orada tekrar gösterilmez. */
const ADMIN_ONLY_ITEMS: NavItem[] = [
  { key: 'workflows', label: 'İş Akışları', sub: 'Üretim akışı tasarımcısı', requiresPermission: 'manage_settings', group: 'Gelişmiş' },
];

function getNavItems(panel: PanelKind): NavItem[] {
  if (panel === 'lab' || panel === 'admin') {
    return [...ACCOUNT_ITEMS, ...LAB_ITEMS, ...(panel === 'admin' ? ADMIN_ONLY_ITEMS : [])];
  }
  // station/doctor/clinic — sadece hesap (Profil + Bildirimler + Genel)
  return ACCOUNT_ITEMS;
}

// ── Props ────────────────────────────────────────────────────────────────
export interface SettingsHubScreenProps {
  panelType?:     PanelKind;
  panelLabel?:    string;
  defaultAccent?: string;
}

// ── Component ────────────────────────────────────────────────────────────
export function SettingsHubScreen({
  panelType: panelTypeProp,
  defaultAccent,
}: SettingsHubScreenProps = {}) {
  const segments = useSegments();
  const panel = panelTypeProp ?? detectPanel(segments);
  const accent = PANEL_ACCENTS[panel];
  const panelBg = usePanelBg(panel);

  const { loadTheme } = useColorThemeStore();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const VALID_KEYS: SectionKey[] = [
    'profile','notifications','general','users','checkin','stations',
    'integrations','logs','permissions','equipment','currency','suppliers','workflows','workhours',
  ];
  const initialFromUrl = typeof params.tab === 'string' && (VALID_KEYS as string[]).includes(params.tab)
    ? params.tab as SectionKey
    : null;
  const [active, setActiveRaw] = useState<SectionKey>(initialFromUrl ?? 'profile');
  const [menuOpen, setMenuOpen] = useState(false);

  // URL değişirse state'i senkronla (browser back/forward)
  useEffect(() => {
    const t = typeof params.tab === 'string' ? params.tab : null;
    if (t && (VALID_KEYS as string[]).includes(t) && t !== active) {
      setActiveRaw(t as SectionKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab]);

  // Tab değişimi → state + URL query string update
  const setActive = useCallback((k: SectionKey) => {
    setActiveRaw(k);
    try { router.setParams({ tab: k } as any); } catch { /* native fallback */ }
  }, [router]);

  const permStore = usePermissionStore();
  const { t } = useTranslation();
  // Nav item label/sub → i18n (key kataloğla birebir: settings.sections.<key>.*)
  const navLabel = (k: string) => t(`settings.sections.${k}.label`);
  const navSub = (k: string) => t(`settings.sections.${k}.sub`);

  useEffect(() => { loadTheme(panel); }, [panel]);

  // Page title for PatternsShell top bar
  const setPageTitle = usePageTitleStore(s => s.setTitle);
  useEffect(() => {
    setPageTitle(t('settings.title'), undefined);
    return () => setPageTitle('', undefined);
  }, [t]);

  // Responsive — mobile'da sidebar yatay sekmeye dönüşür
  const { width: _vw } = useWindowDimensions();
  const isNarrow = _vw < 768;
  const insets = useSafeAreaInsets();
  // PillTabBar height (~78) + safe-area bottom; sayfa içeriği altta nav'e değmesin
  const bottomPad = isNarrow ? Math.max(insets.bottom, 8) + 96 : 0;

  const trOnly = useTurkeyOnlyFeatures();

  // Filter nav items by RBAC permissions
  const allNavItems = getNavItems(panel);
  const navItems = allNavItems.filter(item => {
    // Bölge süzgeci izinden ÖNCE: İran labında e-Fatura/POS ayarı hiç listelenmez.
    if (item.trOnly && !trOnly) return false;
    if (!item.requiresPermission) return true;
    if (!permStore.loaded) return true; // show all while loading
    return permStore.permissions.has(item.requiresPermission);
  });
  const activeItem = navItems.find(i => i.key === active);

  return (
    <View style={{ flex: 1, flexDirection: isNarrow ? 'column' : 'row', backgroundColor: isNarrow ? panelBg : 'transparent' }}>
      {/* ── Mobile header — back + title (only on narrow) ─────────────
          NOT: TopActionBar üst-sağda kalıcı olarak duruyor (~insets.top+6,
          height 38). Header'ı onun altına ittiriyoruz ki çakışma olmasın. */}
      {isNarrow && (
        <View
          style={{
            paddingTop: Math.max(insets.top, 12) + 72,
            paddingHorizontal: 12,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: panelBg,
          }}
        >
          <Pressable
            onPress={() => { try { safeBack('/'); } catch {} }}
            style={({ pressed }: any) => ({
              width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: pressed ? 'rgba(0,0,0,0.06)' : 'transparent',
              // @ts-ignore web
              cursor: 'pointer',
            })}
            accessibilityLabel="Geri"
          >
            {isRTL() ? <ChevronRight size={22} color="#0A0A0A" strokeWidth={2} /> : <ChevronLeft size={22} color="#0A0A0A" strokeWidth={2} />}
          </Pressable>
          <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.4, color: '#0A0A0A' }}>
            Ayarlar
          </Text>
        </View>
      )}

      {/* ── Nav — Desktop: dikey sidebar · Mobile: F2 HubTabBar (3 inline + ☰) ────── */}
      {isNarrow ? (
        (() => {
          // En önemli 3 tab — geri kalanlar ☰ drawer'a düşer.
          // ACCOUNT_ITEMS (Profil/Bildirimler/Genel) + ekstra varsa ilk LAB item'ı,
          // ama sade ve tutarlı için: ilk 3 nav item.
          const INLINE_COUNT = 3;
          const inlineItems = navItems.slice(0, INLINE_COUNT);
          const overflowItems = navItems.slice(INLINE_COUNT);
          const activeInOverflow = overflowItems.some(it => it.key === active);
          const activeOverflowLabel = navItems.some(it => it.key === active) ? navLabel(active) : undefined;

          return (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: panelBg }}>
              <View style={{
                flexDirection: 'row', gap: 3, padding: 3,
                backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 9999,
                alignItems: 'center',
              }}>
                {inlineItems.map(item => {
                  const isActive = active === item.key && !activeInOverflow;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setActive(item.key)}
                      style={{
                        flex: 1, alignItems: 'center', justifyContent: 'center',
                        paddingVertical: 8, borderRadius: 9999,
                        backgroundColor: isActive ? accent : 'transparent',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      } as any}
                    >
                      <Text style={{
                        fontSize: 12, fontWeight: isActive ? '700' : '600',
                        color: isActive ? '#FFFFFF' : '#6B6B6B',
                      }}>
                        {navLabel(item.key)}
                      </Text>
                    </Pressable>
                  );
                })}

                {overflowItems.length > 0 ? (
                  <>
                    <View style={{ width: 1, height: 16, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: 2 }} />
                    <Pressable
                      onPress={() => setMenuOpen(true)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 12, paddingVertical: 8,
                        borderRadius: 9999,
                        backgroundColor: activeInOverflow ? accent : 'transparent',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      } as any}
                    >
                      <Menu size={14} color={activeInOverflow ? '#FFFFFF' : '#6B6B6B'} strokeWidth={1.8} />
                      {activeInOverflow ? (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }} numberOfLines={1}>
                          {activeOverflowLabel}
                        </Text>
                      ) : null}
                    </Pressable>
                  </>
                ) : null}
              </View>

              {/* ── Overflow Drawer (sağdan slide) ── */}
              <Modal
                visible={menuOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuOpen(false)}
              >
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  <Pressable
                    onPress={() => setMenuOpen(false)}
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
                  />
                  <View style={{
                    width: Math.min(320, _vw * 0.85),
                    backgroundColor: '#FFFFFF',
                    paddingTop: insets.top + 12,
                    paddingHorizontal: 16,
                    paddingBottom: insets.bottom + 16,
                    ...(Platform.OS === 'web' ? { boxShadow: '-4px 0 24px rgba(0,0,0,0.18)' } as any : {}),
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <Text style={{ ...DISPLAY, fontSize: 18, color: '#0A0A0A' }}>
                        Tüm Ayarlar
                      </Text>
                      <Pressable
                        onPress={() => setMenuOpen(false)}
                        hitSlop={8}
                        style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) } as any}
                      >
                        <X size={20} color="#6B6B6B" strokeWidth={1.8} />
                      </Pressable>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 2 }}>
                      {navItems.map(item => {
                        const isActive = active === item.key;
                        return (
                          <Pressable
                            key={item.key}
                            onPress={() => { setActive(item.key); setMenuOpen(false); }}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 10,
                              paddingHorizontal: 12, paddingVertical: 12,
                              borderRadius: 12,
                              backgroundColor: isActive ? `${accent}14` : 'transparent',
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                            } as any}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{
                                fontSize: 14, fontWeight: isActive ? '700' : '600',
                                color: isActive ? accent : '#0A0A0A',
                              }}>
                                {navLabel(item.key)}
                              </Text>
                              {item.sub ? (
                                <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 2 }} numberOfLines={1}>
                                  {navSub(item.key)}
                                </Text>
                              ) : null}
                            </View>
                            {isActive ? (
                              <Check size={16} color={accent} strokeWidth={2.2} />
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            </View>
          );
        })()
      ) : (
        <View style={{ width: 200, paddingTop: 24, paddingBottom: 16 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 2, paddingHorizontal: 8 }}
          >
            {navItems.map((item, idx) => {
              const isActive = active === item.key;
              // Grup başlığı: yalnız `group` tanımlı olan ilk maddede basılır;
              // sonrakiler bir öncekinin grubuna girer.
              const header = item.group && item.group !== navItems[idx - 1]?.group ? item.group : null;
              return (
                <React.Fragment key={item.key}>
                {header && (
                  <Text style={{
                    fontSize: 9.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
                    color: 'rgba(15,23,42,0.35)',
                    paddingHorizontal: 14, marginTop: idx === 0 ? 0 : 14, marginBottom: 4,
                  }}>
                    {header}
                  </Text>
                )}
                <Pressable
                  onPress={() => setActive(item.key)}
                  style={({ hovered, pressed }: any) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: isActive ? '#FFFFFF' : hovered ? 'rgba(15,23,42,0.04)' : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                    ...(Platform.OS === 'web'
                      ? { cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '120ms' } as any
                      : null),
                  })}
                >
                  {isActive && (
                    <View
                      style={{
                        width: 3, height: 16, borderRadius: 2,
                        backgroundColor: accent,
                        marginStart: -6, marginEnd: 4,
                      }}
                    />
                  )}
                  <Text style={{
                    fontSize: 13,
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? '#0A0A0A' : '#6B6B6B',
                  }}>
                    {navLabel(item.key)}
                  </Text>
                </Pressable>
                </React.Fragment>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Content — patterns style ─────────────────────────── */}
      <View style={{ flex: 1, paddingHorizontal: 0, paddingTop: 0 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: isNarrow ? 'transparent' : panelBg,
            borderRadius: isNarrow ? 0 : 16,
            overflow: 'hidden',
          }}
        >
          {/* Section header — mobile'da daha sıkı padding, başlık zaten üstte var */}
          {activeItem && !isNarrow && (
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
                {navLabel(activeItem.key)}
              </Text>
              <Text style={{ fontSize: 13, color: '#9A9A9A', lineHeight: 19 }}>
                {navSub(activeItem.key)}
              </Text>
            </View>
          )}
          {activeItem && isNarrow && (
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
              <Text style={{ fontSize: 12, color: '#9A9A9A', lineHeight: 17 }}>
                {navSub(activeItem.key)}
              </Text>
            </View>
          )}

          {/* Section body */}
          <HubContext.Provider value={true}>
            <View style={{ flex: 1, minHeight: 0 }}>
              {active === 'profile' && (
                <ProfileSection accentColor={accent} />
              )}
{active === 'notifications' && (
                <NotificationsSection panelType={panel} accentColor={accent} />
              )}
              {active === 'general' && (
                <GeneralSection panelType={panel} accentColor={accent} />
              )}
              {active === 'users' && <LabUsersManagement accentColor={accent} />}
              {active === 'checkin' && (
                <LabCheckinSettings accentColor={accent} />
              )}
              {active === 'stations' && <StationsSection accentColor={accent} />}
              {active === 'workhours' && <WorkHoursSection accentColor={accent} />}
              {active === 'equipment' && <EquipmentSection accentColor={accent} />}
              {active === 'suppliers' && <SuppliersScreen accentColor={accent} />}
              {active === 'currency' && <CurrencyRatesScreen accentColor={accent} />}
              {active === 'suppliers' && <SuppliersScreen accentColor={accent} />}
              {active === 'integrations' && <IntegrationsScreen accentColor={accent} />}
              {active === 'logs' && <LogsSection accentColor={accent} />}
              {active === 'permissions' && <PermissionsScreen embedded accentColor={accent} />}
              {active === 'workflows' && <WorkflowStudioScreen embedded />}
            </View>
          </HubContext.Provider>
        </View>
      </View>
    </View>
  );
}
