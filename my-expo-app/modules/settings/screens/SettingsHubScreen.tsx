/**
 * SettingsHubScreen — Cards Design System
 * ─────────────────────────────────────────
 * Tek seviyeli ayar paneli. Sol sidebar (gruplu nav) + sağ içerik kartları.
 * Tüm kartlar: bg #FFFFFF · radius 14 · shadow 0 8px 24px rgba(0,0,0,0.15)
 * Page bg: #F1F5F9
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../core/ui/AppIcon';
import { HubContext } from '../../../core/ui/HubContext';
import { useColorThemeStore } from '../../../core/store/colorThemeStore';

import { LabUsersManagement } from '../../admin/users/LabUsersManagement';
import { LabCheckinSettings } from '../../hr/screens/LabCheckinSettings';
import { StationsSection } from '../sections/StationsSection';
import { ProfileSection } from '../sections/ProfileSection';
import { AppearanceSection } from '../sections/AppearanceSection';
import { NotificationsSection } from '../sections/NotificationsSection';
import { GeneralSection } from '../sections/GeneralSection';

// ── Types ─────────────────────────────────────────────────────────────────
type SectionKey =
  | 'profile' | 'appearance' | 'notifications' | 'general'
  | 'users'   | 'checkin'    | 'stations';

interface NavGroup {
  title: string;
  items: NavItem[];
}
interface NavItem {
  key:   SectionKey;
  label: string;
  sub:   string;
  icon:  string;
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'HESAP',
    items: [
      { key: 'profile',       label: 'Profil',      sub: 'Kişisel bilgiler ve güvenlik', icon: 'user'  },
      { key: 'appearance',    label: 'Görünüm',     sub: 'Tema ve yazı boyutu',          icon: 'sun'   },
      { key: 'notifications', label: 'Bildirimler', sub: 'Uyarı ve bildirim tercihleri', icon: 'bell'  },
      { key: 'general',       label: 'Genel',       sub: 'Dil, saat dilimi, format',     icon: 'globe' },
    ],
  },
  {
    title: 'LABORATUVAR',
    items: [
      { key: 'users',    label: 'Kullanıcılar', sub: 'Personel ve stage yetkileri', icon: 'users'           },
      { key: 'checkin',  label: 'QR Check-in',  sub: 'Mesai takip ayarları',        icon: 'qr-code'         },
      { key: 'stations', label: 'İstasyonlar',  sub: 'Üretim aşamaları',            icon: 'sitemap-outline' },
    ],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────
export interface SettingsHubScreenProps {
  panelType?:    'lab' | 'admin' | 'doctor' | 'clinic';
  panelLabel?:   string;
  defaultAccent?: string;
}

// ── Component ─────────────────────────────────────────────────────────────
export function SettingsHubScreen({
  panelType    = 'lab',
  panelLabel   = 'Laboratuvar',
  defaultAccent = '#7C3AED',
}: SettingsHubScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const { getTheme, loadTheme } = useColorThemeStore();
  const [active, setActive] = useState<SectionKey>('profile');

  useEffect(() => { loadTheme(panelType); }, [panelType]);
  const theme  = getTheme(panelType);
  const accent = theme.primary;

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      {/* ── Body: sidebar + content ───────────────────────────────────── */}
      <View style={s.body}>
        {/* ── Sidebar Card ─────────────────────────────────────────── */}
        <View style={s.sidebarWrap}>
          <View style={s.sidebarCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 10, gap: 14 }}
            >
              {NAV_GROUPS.map(group => (
                <View key={group.title} style={{ gap: 4 }}>
                  <Text style={s.groupTitle}>{group.title}</Text>
                  {group.items.map(item => {
                    const isActive = active === item.key;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={[s.navItem, isActive && { backgroundColor: accent + '12' }]}
                        onPress={() => setActive(item.key)}
                        activeOpacity={0.75}
                      >
                        <View
                          style={[
                            s.navIcon,
                            { backgroundColor: isActive ? accent : '#F1F5F9' },
                          ]}
                        >
                          <AppIcon
                            name={item.icon as any}
                            size={14}
                            color={isActive ? '#FFFFFF' : '#64748B'}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[
                              s.navLabel,
                              isActive && { color: accent, fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                          <Text style={s.navSub} numberOfLines={1}>{item.sub}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* ── Content Area (no extra header — sidebar shows what's active) */}
        <View style={s.contentWrap}>
          <HubContext.Provider value={true}>
            <View style={s.sectionBody}>
              {active === 'profile' && (
                <ProfileSection accentColor={accent} />
              )}
              {active === 'appearance' && (
                <AppearanceSection
                  panelType={panelType}
                  accentColor={accent}
                  defaultAccent={defaultAccent}
                />
              )}
              {active === 'notifications' && (
                <NotificationsSection panelType={panelType} accentColor={accent} />
              )}
              {active === 'general' && (
                <GeneralSection panelType={panelType} accentColor={accent} />
              )}
              {active === 'users' && <LabUsersManagement />}
              {active === 'checkin' && (
                <LabCheckinSettings accentColor={accent} />
              )}
              {active === 'stations' && <StationsSection />}
            </View>
          </HubContext.Provider>
        </View>
      </View>
    </View>
  );
}

// ── Cards Design System ───────────────────────────────────────────────────
const CARD_SHADOW = Platform.select({
  web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
  default: {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },

  // ── Body Layout ─────────────────────────────────────────────────────────
  body: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
  },

  // ── Sidebar Card ────────────────────────────────────────────────────────
  sidebarWrap: {
    width: 260,
    flexShrink: 0,
  },
  sidebarCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    ...CARD_SHADOW,
  },

  groupTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 4,
  },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
  },
  navIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  navSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },

  // ── Content Area ────────────────────────────────────────────────────────
  contentWrap: {
    flex: 1,
    minWidth: 0,
  },
  sectionBody: {
    flex: 1,
    minHeight: 0,
  },
});
