// ChipGroup — reusable chip selector.
//   selected → filled + subtle glow
//   default  → outline only
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

export interface ChipOption<K extends string = string> {
  key:   K;
  label: string;
}

interface Props<K extends string> {
  options:   ChipOption<K>[];
  selected:  K | null;
  onChange:  (key: K | null) => void;
  /** When true, picking the selected option clears it (toggle). Default true. */
  toggle?:   boolean;
  disabled?: boolean;
}

export function ChipGroup<K extends string>({
  options, selected, onChange, toggle = true, disabled,
}: Props<K>) {
  return (
    <View style={s.row}>
      {options.map(opt => {
        const active = selected === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onChange(active && toggle ? null : opt.key)}
            disabled={disabled || (!toggle && active)}
            activeOpacity={0.75}
            style={[s.chip, active && s.chipActive, disabled && { opacity: 0.4 }]}
          >
            <Text style={[s.chipText, active && s.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    ...Platform.select({
      web: { boxShadow: '0 0 12px rgba(255,255,255,0.30)' } as any,
      default: {},
    }),
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  chipTextActive: { color: '#0F172A', fontWeight: '800' },
});
