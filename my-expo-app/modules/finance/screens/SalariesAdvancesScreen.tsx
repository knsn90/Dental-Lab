/**
 * SalariesAdvancesScreen — Maaşlar + Avanslar tek hub.
 *
 * Üstte 2 sekmeli pill bar (patterns Variant 1):
 *   • Maaş Ödemeleri
 *   • Avanslar
 *
 * Aynı personel-ödeme akışını paylaşır; sadece görüntülenen ekran değişir.
 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Wallet, Banknote } from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { SalariesScreen } from './SalariesScreen';
import { AdvancesScreen } from './AdvancesScreen';

type Mode = 'salaries' | 'advances';

const TABS: { key: Mode; label: string; icon: any }[] = [
  { key: 'salaries', label: 'Maaş Ödemeleri', icon: Wallet },
  { key: 'advances', label: 'Avanslar',       icon: Banknote },
];

export function SalariesAdvancesScreen() {
  const [mode, setMode] = useState<Mode>('salaries');

  return (
    <View style={{ flex: 1 }}>
      {/* Pill tab bar */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
        <View style={{
          flexDirection: 'row', gap: 2, padding: 4,
          backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 999,
          alignSelf: 'flex-start',
        }}>
          {TABS.map(t => {
            const active = t.key === mode;
            const Icon = t.icon;
            return (
              <Pressable
                key={t.key}
                onPress={() => setMode(t.key)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: active ? DS.ink[900] : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Icon size={13} color={active ? '#FFF' : DS.ink[700]} strokeWidth={1.8} />
                <Text style={{
                  fontSize: 12, fontWeight: active ? '600' : '500',
                  color: active ? '#FFF' : DS.ink[700],
                }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {mode === 'salaries' ? <SalariesScreen /> : <AdvancesScreen />}
      </View>
    </View>
  );
}
