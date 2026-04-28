import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useColorThemeStore } from '../../core/store/colorThemeStore';
import { ProfileSection } from './sections/ProfileSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { GeneralSection } from './sections/GeneralSection';
import { NotificationsSection } from './sections/NotificationsSection';

import { AppIcon } from '../../core/ui/AppIcon';

// ── Panel configs ──────────────────────────────────────────────────────────
export interface SettingsPanelConfig {
  panelType: 'lab' | 'admin' | 'doctor' | 'clinic_admin';
  panelLabel: string;
  defaultAccent: string;
}

// ── Nav items ──────────────────────────────────────────────────────────────
type SectionKey = 'profil' | 'gorunum' | 'bildirimler' | 'genel';

interface NavItem {
  key: SectionKey;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sub: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'profil',      icon: 'user',          label: 'Profil',      sub: 'Kişisel bilgiler, güvenlik' },
  { key: 'gorunum',     icon: 'sun',           label: 'Görünüm',     sub: 'Tema, yazı tipi, boyut' },
  { key: 'bildirimler', icon: 'bell',          label: 'Bildirimler', sub: 'Uyarı ve bildirim tercihleri' },
  { key: 'genel',       icon: 'settings',      label: 'Genel',       sub: 'Dil, saat dilimi, format' },
];

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  config: SettingsPanelConfig;
  onBack?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────
export function SettingsScreen({ config, onBack }: Props) {
  const { getTheme, loadTheme } = useColorThemeStore();
  const [active, setActive] = useState<SectionKey>('profil');

  useEffect(() => {
    loadTheme(config.panelType);
  }, [config.panelType]);

  const theme = getTheme(config.panelType);
  const accent = theme.primary;

  return (
    <SafeAreaView style={s.root}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <View style={s.topBar}>
        {onBack && (
          <TouchableOpacity style={s.backBtn} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <AppIcon name="arrow-left" size={18} color="#64748B" />
          </TouchableOpacity>
        )}
        <View style={s.topBarTitle}>
          <Text style={s.topBarHeading}>Ayarlar</Text>
          <Text style={s.topBarSub}>{config.panelLabel} paneli</Text>
        </View>
      </View>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <View style={s.body}>
        {/* Left sidebar */}
        <View style={s.sidebar}>
          <Text style={s.sidebarHeading}>KATEGORİLER</Text>
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[s.navItem, isActive && { backgroundColor: accent + '12' }]}
                onPress={() => setActive(item.key)}
                activeOpacity={0.75}
              >
                <View style={[s.navIconWrap, isActive && { backgroundColor: accent + '20' }]}>
                  <AppIcon
                    name={item.icon}
                    size={16}
                    color={isActive ? accent : '#94A3B8'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.navLabel, isActive && { color: accent, fontWeight: '700' }]}>
                    {item.label}
                  </Text>
                  <Text style={s.navSub} numberOfLines={1}>{item.sub}</Text>
                </View>
                {isActive && (
                  <View style={[s.navActiveDot, { backgroundColor: accent }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Vertical divider */}
        <View style={s.divider} />

        {/* Right content */}
        <View style={s.content}>
          {/* Content header */}
          <View style={s.contentHeader}>
            <View style={[s.contentHeaderIcon, { backgroundColor: accent + '15' }]}>
              <AppIcon
                name={NAV_ITEMS.find((n) => n.key === active)?.icon ?? 'settings'}
                size={18}
                color={accent}
              />
            </View>
            <View>
              <Text style={s.contentHeading}>
                {NAV_ITEMS.find((n) => n.key === active)?.label} Ayarları
              </Text>
              <Text style={s.contentSub}>
                {NAV_ITEMS.find((n) => n.key === active)?.sub}
              </Text>
            </View>
          </View>

          <View style={s.contentDivider} />

          {/* Section content */}
          <View style={{ flex: 1 }}>
            {active === 'profil' && (
              <ProfileSection accentColor={accent} />
            )}
            {active === 'gorunum' && (
              <AppearanceSection
                panelType={config.panelType}
                accentColor={accent}
                defaultAccent={config.defaultAccent}
              />
            )}
            {active === 'bildirimler' && (
              <NotificationsSection panelType={config.panelType} accentColor={accent} />
            )}
            {active === 'genel' && (
              <GeneralSection panelType={config.panelType} accentColor={accent} />
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF4',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
  },
  topBarHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 22,
  },
  topBarSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },

  // Body
  body: {
    flex: 1,
    flexDirection: 'row',
  },

  // Sidebar
  sidebar: {
    width: 210,
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: '#E8EDF4',
  },
  sidebarHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: '#CBD5E1',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 2,
    gap: 10,
    position: 'relative',
  },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  navSub: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 1,
  },
  navActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // Divider
  divider: {
    width: 1,
    backgroundColor: '#E8EDF4',
  },

  // Content
  content: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 16,
    backgroundColor: '#fff',
  },
  contentHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  contentSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  contentDivider: {
    height: 1,
    backgroundColor: '#E8EDF4',
  },
});
