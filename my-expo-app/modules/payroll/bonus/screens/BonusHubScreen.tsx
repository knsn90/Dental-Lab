/**
 * BonusHubScreen — Pill tabs (Özet · Politikalar · Hesaplamalar · Geçmiş).
 * Tasarım dili: docs/DESIGN_LANGUAGE.md
 */

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { isRTL } from '../../../../core/i18n';

import { DS } from '../../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../../core/theme/usePanelTheme';
import { SlideTabBar } from '../../../../core/ui/SlideTabBar';

import BonusDashboardScreen from './BonusDashboardScreen';
import BonusPolicyListScreen from './BonusPolicyListScreen';
import BonusPolicyEditorScreen from './BonusPolicyEditorScreen';
import BonusRunsScreen from './BonusRunsScreen';
import TechnicianBonusScreen from './TechnicianBonusScreen';
import BonusAuditScreen from './BonusAuditScreen';

type Mode = 'dashboard' | 'policies' | 'runs' | 'audit' | 'editor' | 'technician';

/** Şeritte görünen modlar — 'editor' ve 'technician' alt sayfa, sekme değil. */
type TabKey = 'dashboard' | 'policies' | 'runs' | 'audit';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'dashboard', label: 'Özet' },
  { key: 'policies',  label: 'Politikalar' },
  { key: 'runs',      label: 'Hesaplamalar' },
  { key: 'audit',     label: 'Geçmiş' },
];

export default function BonusHubScreen() {
  const [mode, setMode] = useState<Mode>('dashboard');
  // SlideTabBar cursor'ı beyaz metin basar → koyu ink şart.
  const panelTheme = usePanelTheme();
  const [editorId, setEditorId] = useState<string | null>(null);
  const [techState, setTechState] = useState<{ id: string; name?: string } | null>(null);
  const [prevMode, setPrevMode] = useState<Mode>('dashboard');
  const openTech = (id: string, name?: string) => {
    setPrevMode(mode === 'technician' ? prevMode : mode);
    setTechState({ id, name });
    setMode('technician');
  };

  const showTabs = mode !== 'editor' && mode !== 'technician';

  return (
    <View style={{ flex: 1 }}>
      {/* TAB BAR */}
      <View style={{ paddingTop: 4, paddingBottom: 16, paddingHorizontal: 16 }}>
        {showTabs ? (
          /* Uygulamanın ortak sekme çubuğu — Siparişler / Onaylar / Kurumlar /
             Karlılık / Faturalar ile aynı bileşen. İkonlar düştü: komşu
             sayfaların hiçbirinde yok ve etiketler zaten açık. */
          <SlideTabBar
            items={TABS}
            activeKey={mode as TabKey}
            onChange={(k) => setMode(k as Mode)}
            accentColor={panelTheme.accent}
            style={{ marginStart: -4 }}
          />
        ) : mode === 'editor' ? (
          <Pressable
            onPress={() => setMode('policies')}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              alignSelf: 'flex-start',
              backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[300],
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {isRTL() ? <ArrowRight size={14} color={DS.ink[900]} /> : <ArrowLeft size={14} color={DS.ink[900]} />}
            <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[900] }}>Politikalara dön</Text>
          </Pressable>
        ) : null}
      </View>

      {/* CONTENT */}
      <View style={{ flex: 1, marginHorizontal: -4 }}>
        {mode === 'dashboard' ? (
          <BonusDashboardScreen
            onOpenPolicies={() => setMode('policies')}
            onOpenEditor={(id) => { setEditorId(id); setMode('editor'); }}
            onOpenRuns={() => setMode('runs')}
            onOpenTechnician={openTech}
          />
        ) : mode === 'policies' ? (
          <BonusPolicyListScreen onOpenEditor={(id) => { setEditorId(id); setMode('editor'); }} />
        ) : mode === 'runs' ? (
          <BonusRunsScreen onOpenTechnician={openTech} />
        ) : mode === 'audit' ? (
          <BonusAuditScreen />
        ) : mode === 'technician' && techState ? (
          <TechnicianBonusScreen
            employeeId={techState.id}
            initialName={techState.name ?? null}
            onBack={() => setMode(prevMode)}
          />
        ) : (
          <BonusPolicyEditorScreen embeddedId={editorId ?? undefined} onBack={() => setMode('policies')} />
        )}
      </View>
    </View>
  );
}

