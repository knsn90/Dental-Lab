/**
 * SettingsHubScreen — Patterns Design Language
 * ─────────────────────────────────────────────
 * Tek seviyeli ayar paneli. Sol sidebar (minimal vertical tabs) + sağ içerik.
 * Patterns /dev/patterns "Dikey (settings sidebar)" referansına birebir uyumlu.
 *
 * Tüm paneller (lab, admin, doctor, clinic) aynı ekranı kullanır.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSegments } from 'expo-router';

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
import { PermissionsScreen } from '../../admin/permissions/PermissionsScreen';
import { EquipmentSection } from '../sections/EquipmentSection';

// ── Display font token ──────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ── Types ────────────────────────────────────────────────────────────────
type SectionKey =
  | 'profile' | 'notifications' | 'general'
  | 'users'   | 'checkin'    | 'stations'      | 'integrations' | 'logs'
  | 'permissions' | 'equipment';

type PanelKind = 'lab' | 'admin' | 'doctor' | 'clinic';

interface NavItem {
  key:   SectionKey;
  label: string;
  sub:   string;
  /** If set, only show this tab when user has this permission */
  requiresPermission?: string;
}

// ── Panel accent mapping ─────────────────────────────────────────────────
const PANEL_ACCENTS: Record<PanelKind, string> = {
  lab:    '#F5C24B',
  admin:  '#E97757',
  doctor: '#6BA888',
  clinic: '#6BA888',
};

function detectPanel(segments: string[]): PanelKind {
  const seg = segments?.[0] ?? '';
  if (seg === '(clinic)') return 'clinic';
  if (seg === '(doctor)') return 'doctor';
  if (seg === '(admin)')  return 'admin';
  return 'lab';
}

// ── Nav items ────────────────────────────────────────────────────────────
const ACCOUNT_ITEMS: NavItem[] = [
  { key: 'profile',       label: 'Profil',      sub: 'Kişisel bilgiler ve güvenlik' },
  { key: 'notifications', label: 'Bildirimler', sub: 'Uyarı ve bildirim tercihleri' },
  { key: 'general',       label: 'Genel',       sub: 'Dil, saat dilimi, format'     },
];

const LAB_ITEMS: NavItem[] = [
  { key: 'users',        label: 'Kullanıcılar',  sub: 'Personel ve stage yetkileri',  requiresPermission: 'manage_users'    },
  { key: 'permissions',  label: 'Yetkiler',      sub: 'Rol bazli erisim yonetimi',    requiresPermission: 'manage_settings' },
  { key: 'checkin',      label: 'QR Check-in',   sub: 'Mesai takip ayarları',         requiresPermission: 'manage_settings' },
  { key: 'stations',     label: 'İstasyonlar',   sub: 'Üretim aşamaları',             requiresPermission: 'manage_settings' },
  { key: 'equipment',   label: 'Demirbaşlar',   sub: 'Cihaz, marka, model ve atamalar', requiresPermission: 'manage_settings' },
  { key: 'integrations', label: 'Entegrasyonlar', sub: 'e-Fatura & POS ayarları',     requiresPermission: 'manage_settings' },
  { key: 'logs',         label: 'Loglar',         sub: 'Sistem aktivite kayıtları',   requiresPermission: 'manage_settings' },
];

function getNavItems(panel: PanelKind): NavItem[] {
  if (panel === 'lab' || panel === 'admin') {
    return [...ACCOUNT_ITEMS, ...LAB_ITEMS];
  }
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

  const { loadTheme } = useColorThemeStore();
  const [active, setActive] = useState<SectionKey>('profile');
  const permStore = usePermissionStore();

  useEffect(() => { loadTheme(panel); }, [panel]);

  // Page title for PatternsShell top bar
  const setPageTitle = usePageTitleStore(s => s.setTitle);
  useEffect(() => {
    setPageTitle('Ayarlar', undefined);
    return () => setPageTitle('', undefined);
  }, []);

  // Filter nav items by RBAC permissions
  const allNavItems = getNavItems(panel);
  const navItems = allNavItems.filter(item => {
    if (!item.requiresPermission) return true;
    if (!permStore.loaded) return true; // show all while loading
    return permStore.permissions.has(item.requiresPermission);
  });
  const activeItem = navItems.find(i => i.key === active);

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#F5F2EA' }}>
      {/* ── Sidebar — patterns "Dikey (settings sidebar)" ────── */}
      <View style={{ width: 200, paddingTop: 24, paddingBottom: 16 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 2, paddingHorizontal: 8 }}
        >
          {navItems.map(item => {
            const isActive = active === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setActive(item.key)}
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
                      backgroundColor: accent,
                      marginLeft: -6,
                      marginRight: 4,
                    }}
                  />
                )}
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? '#0A0A0A' : '#6B6B6B',
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content — patterns style ─────────────────────────── */}
      <View style={{ flex: 1, paddingHorizontal: 0, paddingTop: 0 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: '#F5F2EA',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {/* Section header */}
          {activeItem && (
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
                {activeItem.label}
              </Text>
              <Text style={{ fontSize: 13, color: '#9A9A9A', lineHeight: 19 }}>
                {activeItem.sub}
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
              {active === 'equipment' && <EquipmentSection accentColor={accent} />}
              {active === 'integrations' && <IntegrationsScreen accentColor={accent} />}
              {active === 'logs' && <LogsSection accentColor={accent} />}
              {active === 'permissions' && <PermissionsScreen embedded accentColor={accent} />}
            </View>
          </HubContext.Provider>
        </View>
      </View>
    </View>
  );
}
