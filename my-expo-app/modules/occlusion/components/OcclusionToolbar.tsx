// modules/occlusion/components/OcclusionToolbar.tsx
// 4 modluk sol rail toolbar — prototipin .toolrail'i
// Prototip: app/app.jsx Toolbar component

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Mode } from '../types/occlusion';

interface Props {
  mode:         Mode;
  onModeChange: (m: Mode) => void;
  position?:    'left' | 'top';
}

const ITEMS: { id: Mode; icon: string; tip: string }[] = [
  { id: 'view',        icon: 'rotate-3d-variant',    tip: 'Görüntüle' },
  { id: 'heatmap',     icon: 'palette-swatch',        tip: 'Isı Haritası' },
  { id: 'penetration', icon: 'alert-decagram-outline',tip: 'Penetrasyon' },
  { id: 'measurement', icon: 'ruler',                 tip: 'Ölçüm' },
];

export function OcclusionToolbar({ mode, onModeChange, position = 'left' }: Props) {
  const horizontal = position === 'top';
  return (
    <View style={[
      s.rail,
      horizontal ? s.horizontal : s.vertical,
    ]}>
      {ITEMS.map((it) => {
        const active = mode === it.id;
        return (
          <TouchableOpacity
            key={it.id}
            style={[s.btn, active && s.btnActive]}
            onPress={() => onModeChange(it.id)}
            activeOpacity={0.8}
            // @ts-ignore — web-only tooltip
            title={Platform.OS === 'web' ? it.tip : undefined}
          >
            <MaterialCommunityIcons
              name={it.icon as any}
              size={18}
              color={active ? '#FFFFFF' : '#64748B'}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  rail: {
    position:        'absolute',
    backgroundColor: '#FFFFFF',
    borderWidth:     1,
    borderColor:     '#F1F5F9',
    borderRadius:    12,
    padding:         4,
    gap:             4,
    shadowColor:     '#000',
    shadowOpacity:   0.04,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 2 },
    elevation:       2,
  },
  vertical: {
    left:            16,
    top:             '50%',
    transform:       [{ translateY: -80 }],
    flexDirection:   'column',
  },
  horizontal: {
    top:             64,
    left:            12,
    flexDirection:   'row',
  },
  btn: {
    width:           36,
    height:          36,
    borderRadius:    8,
    alignItems:      'center',
    justifyContent:  'center',
  },
  btnActive: {
    backgroundColor: '#0F172A',
  },
});

// ─── View preset pills ──────────────────────────────────────
interface ViewPresetsProps {
  value:    'front' | 'top' | 'right' | 'left' | 'iso';
  onChange: (v: 'front' | 'top' | 'right' | 'left' | 'iso') => void;
  isMobile?: boolean;
}

export function ViewPresets({ value, onChange, isMobile }: ViewPresetsProps) {
  const presets = [
    { id: 'front', label: 'Ön' },
    { id: 'top',   label: 'Üst' },
    { id: 'right', label: 'Sağ' },
    { id: 'left',  label: 'Sol' },
    { id: 'iso',   label: 'İzo' },
  ] as const;
  return (
    <View style={isMobile ? vps.pillsMobile : vps.pills}>
      {presets.map((p) => {
        const active = value === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            style={[vps.pill, active && vps.pillActive]}
            onPress={() => onChange(p.id)}
            activeOpacity={0.85}
          >
            <Text style={[vps.label, active && vps.labelActive]}>{p.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const vps = StyleSheet.create({
  pills: {
    position:        'absolute',
    bottom:          140,
    left:            '50%',
    transform:       [{ translateX: -110 }],
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    backgroundColor: '#FFFFFF',
    borderWidth:     1,
    borderColor:     '#F1F5F9',
    borderRadius:    999,
    padding:         4,
    shadowColor:     '#000',
    shadowOpacity:   0.04,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 2 },
  },
  pillsMobile: {
    position:        'absolute',
    top:             112,
    left:            12,
    flexDirection:   'row',
    alignItems:      'center',
    alignSelf:       'flex-start',
    gap:             4,
    backgroundColor: '#FFFFFF',
    borderWidth:     1,
    borderColor:     '#F1F5F9',
    borderRadius:    999,
    padding:         4,
    shadowColor:     '#000',
    shadowOpacity:   0.04,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 2 },
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      999,
  },
  pillActive: {
    backgroundColor: '#0F172A',
  },
  label: {
    fontSize:    12,
    fontWeight:  '600',
    color:       '#64748B',
    letterSpacing: 0.2,
  },
  labelActive: {
    color: '#FFFFFF',
  },
});
