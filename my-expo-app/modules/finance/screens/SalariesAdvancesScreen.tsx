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
import { View, Text, Pressable, Platform } from 'react-native';
import { Wallet, Banknote } from '../../../core/ui/icons';
import { DS } from '../../../core/theme/dsTokens';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { SalariesScreen } from './SalariesScreen';
import { AdvancesScreen } from './AdvancesScreen';

type Mode = 'salaries' | 'advances';

const TABS: { key: Mode; label: string; icon: any }[] = [
  { key: 'salaries', label: 'Maaş Ödemeleri', icon: Wallet },
  { key: 'advances', label: 'Avanslar',       icon: Banknote },
];

export function SalariesAdvancesScreen() {
  const [mode, setMode] = useState<Mode>('salaries');
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  return (
    <View style={{ flex: 1 }}>
      {/* Pill tab bar */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
        <View style={{
          flexDirection: 'row', gap: 2, padding: 4,
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: 999,
          alignSelf: 'flex-start',
        }}>
          {TABS.map(t => {
            const active = t.key === mode;
            const Icon = t.icon;
            return (
              <Pressable
                key={t.key}
                onPress={() => setMode(t.key)}
                // Fonksiyon-stilli Pressable native'de row'u düşürüyor (iki pill
                // üst üste biniyordu) → native'de object stil. CLAUDE.md §1c ölçüleri.
                style={Platform.OS === 'web'
                  ? ((({ pressed }: any) => ({
                      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
                      paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                      backgroundColor: active ? (isDark ? 'rgba(255,255,255,0.16)' : DS.ink[900]) : 'transparent',
                      opacity: pressed ? 0.85 : 1,
                    })) as any)
                  : {
                      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
                      paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                      backgroundColor: active ? (isDark ? 'rgba(255,255,255,0.16)' : DS.ink[900]) : 'transparent',
                    }}
              >
                <Icon size={13} color={active ? '#FFF' : (isDark ? T.ink3 : DS.ink[700])} strokeWidth={1.8} />
                <Text style={{
                  fontSize: 12, fontWeight: active ? '600' : '500',
                  color: active ? '#FFF' : (isDark ? T.ink3 : DS.ink[700]),
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
