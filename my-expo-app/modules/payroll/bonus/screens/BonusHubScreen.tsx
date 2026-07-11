/**
 * BonusHubScreen — Pill tabs (Özet · Politikalar · Hesaplamalar · Geçmiş).
 * Tasarım dili: docs/DESIGN_LANGUAGE.md
 */

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LayoutDashboard, Wallet, Play, History, ArrowLeft } from 'lucide-react-native';

import { DS } from '../../../../core/theme/dsTokens';

import BonusDashboardScreen from './BonusDashboardScreen';
import BonusPolicyListScreen from './BonusPolicyListScreen';
import BonusPolicyEditorScreen from './BonusPolicyEditorScreen';
import BonusRunsScreen from './BonusRunsScreen';
import TechnicianBonusScreen from './TechnicianBonusScreen';
import BonusAuditScreen from './BonusAuditScreen';

type Mode = 'dashboard' | 'policies' | 'runs' | 'audit' | 'editor' | 'technician';

export default function BonusHubScreen() {
  const [mode, setMode] = useState<Mode>('dashboard');
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
          <View style={{
            flexDirection: 'row', gap: 2, padding: 4,
            backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 999,
            alignSelf: 'flex-start',
          }}>
            <TabBtn icon={LayoutDashboard} label="Özet"        active={mode === 'dashboard'} onPress={() => setMode('dashboard')} />
            <TabBtn icon={Wallet}          label="Politikalar" active={mode === 'policies'}  onPress={() => setMode('policies')} />
            <TabBtn icon={Play}            label="Hesaplamalar" active={mode === 'runs'}     onPress={() => setMode('runs')} />
            <TabBtn icon={History}         label="Geçmiş"      active={mode === 'audit'}    onPress={() => setMode('audit')} />
          </View>
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
            <ArrowLeft size={14} color={DS.ink[900]} />
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

function TabBtn({ icon: Icon, label, active, onPress }:
  { icon: any; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: active ? DS.ink[900] : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon size={13} color={active ? '#FFF' : DS.ink[700]} strokeWidth={1.8} />
      <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : DS.ink[700] }}>
        {label}
      </Text>
    </Pressable>
  );
}
