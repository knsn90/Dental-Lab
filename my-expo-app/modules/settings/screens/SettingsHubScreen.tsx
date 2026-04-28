/**
 * SettingsHubScreen
 * ─ Kullanıcılar · QR Check-in · Genel Ayarlar
 * Kullanıcılar ve QR Check-in sekmelerini Ayarlar altında toplar.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../core/ui/AppIcon';
import { HubContext } from '../../../core/ui/HubContext';
import { LabUsersManagement } from '../../admin/users/LabUsersManagement';
import { LabCheckinSettings } from '../../hr/screens/LabCheckinSettings';
import { SettingsScreen } from '../SettingsScreen';
import { StationsSection } from '../sections/StationsSection';

// ─── Tab definitions ──────────────────────────────────────────────────────────
type TabKey = 'users' | 'checkin' | 'stations' | 'settings';

const TABS: { key: TabKey; label: string; icon: string; accent: string; bg: string }[] = [
  { key: 'users',    label: 'Kullanıcılar', icon: 'users',             accent: '#2563EB', bg: '#EFF6FF' },
  { key: 'checkin',  label: 'QR Check-in',  icon: 'qr-code',           accent: '#059669', bg: '#ECFDF5' },
  { key: 'stations', label: 'İstasyonlar',  icon: 'sitemap-outline',   accent: '#D97706', bg: '#FEF3C7' },
  { key: 'settings', label: 'Genel Ayarlar',icon: 'settings',          accent: '#7C3AED', bg: '#EDE9FE' },
];

// ─── Component ────────────────────────────────────────────────────────────────
export interface SettingsHubScreenProps {
  panelType?:    'lab' | 'admin' | 'doctor' | 'clinic';
  panelLabel?:   string;
  defaultAccent?: string;
}

export function SettingsHubScreen({
  panelType    = 'lab',
  panelLabel   = 'Laboratuvar',
  defaultAccent = '#7C3AED',
}: SettingsHubScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const [activeKey, setActiveKey] = useState<TabKey>('users');

  const tab = TABS.find(t => t.key === activeKey)!;

  return (
    <View style={s.root}>
      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Text style={s.title}>Ayarlar</Text>

        {/* Tab bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabRow}
        >
          {TABS.map(t => {
            const active = activeKey === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[
                  s.tab,
                  active && { backgroundColor: t.accent },
                ]}
                onPress={() => setActiveKey(t.key)}
                activeOpacity={0.75}
              >
                <AppIcon
                  name={t.icon as any}
                  size={13}
                  color={active ? '#FFFFFF' : '#64748B'}
                />
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <HubContext.Provider value={true}>
        <View style={s.content}>
          {activeKey === 'users' && <LabUsersManagement />}
          {activeKey === 'checkin' && (
            <LabCheckinSettings accentColor={tab.accent} />
          )}
          {activeKey === 'stations' && (
            <StationsSection />
          )}
          {activeKey === 'settings' && (
            <SettingsScreen
              config={{
                panelType,
                panelLabel,
                defaultAccent,
              }}
              onBack={() => {}}
            />
          )}
        </View>
      </HubContext.Provider>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F9FB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 14,
    // @ts-ignore
    boxShadow: '0 1px 0 #F1F5F9',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
});
