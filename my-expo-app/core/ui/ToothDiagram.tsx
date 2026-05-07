/**
 * ToothDiagram — interactive FDI 32-tooth picker.
 * Two arches (upper/lower), 16 teeth each, tap-to-toggle.
 * Selected: primary fill, accent numeral. Inactive: surface bg, ink-500 numeral.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { DS } from '../theme/dsTokens';
import { MFONT, useMobileTheme } from '../theme/mobileTheme';

// FDI numbering — quadrant order:
// Upper right (18→11) | Upper left (21→28)
// Lower right (48→41) | Lower left (31→38)
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

interface Props {
  selected: number[];
  onToggle: (toothNumber: number) => void;
  /** Color override — defaults to active role primary */
  primaryColor?: string;
  /** "dark" → translucent white pill bg for inactive (use on dark hero) */
  variant?: 'light' | 'dark';
}

export function ToothDiagram({ selected, onToggle, primaryColor, variant = 'light' }: Props) {
  const theme = useMobileTheme();
  const primary = primaryColor ?? theme.primary;
  const inactiveBg = variant === 'dark' ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const inactiveText = variant === 'dark' ? 'rgba(255,255,255,0.55)' : DS.ink[500];
  const inactiveBorder = variant === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const activeText = theme.accent;

  const renderArch = (numbers: number[]) => (
    <View style={styles.archRow}>
      {numbers.map((n) => {
        const active = selected.includes(n);
        return (
          <Pressable
            key={n}
            onPress={() => onToggle(n)}
            style={[
              styles.tooth,
              {
                backgroundColor: active ? primary : inactiveBg,
                borderColor: active ? primary : inactiveBorder,
              },
            ]}
          >
            <Text style={[
              styles.toothNum,
              { color: active ? activeText : inactiveText, fontWeight: active ? '700' : '500' },
            ]}>
              {n}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {renderArch(UPPER)}
      <View style={[styles.midline, { backgroundColor: variant === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]} />
      {renderArch(LOWER)}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  archRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
  },
  tooth: {
    width: 30,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toothNum: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
  },
  midline: {
    height: 1,
    marginVertical: 6,
    borderRadius: 1,
  },
});
