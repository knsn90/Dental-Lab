/**
 * SupportDropdown — destek modallarında kategori/öncelik seçimi için
 * basit native dropdown (chip rüzgarı yerine).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, Platform, ScrollView } from 'react-native';
import { ChevronDown, CheckCircle2 } from 'lucide-react-native';

const W = {
  bg:         '#F4F0EB',
  surface:    '#FFFFFF',
  inkStrong:  '#0F172A',
  ink:        '#1F2937',
  inkMute:    '#475569',
  inkSoft:    '#94A3B8',
  border:     'rgba(15,23,42,0.08)',
};

export interface SupportDropdownOption<T extends string> {
  value: T;
  label: string;
  icon?: any;
  colorDot?: string;
}

export function SupportDropdown<T extends string>({
  value, onChange, options, placeholder,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SupportDropdownOption<T>[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  const SelIcon  = selected?.icon;

  return (
    <View style={{ position: 'relative', zIndex: open ? 10 : 1 }}>
      <Pressable
        onPress={() => setOpen(v => !v)}
        style={({ hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 12, paddingVertical: 10,
          borderRadius: 10, borderWidth: 1,
          borderColor: open ? W.inkStrong : W.border,
          backgroundColor: hovered ? W.bg : W.surface,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        })}
      >
        {SelIcon && <SelIcon size={13} color={W.ink} strokeWidth={1.8} />}
        {selected?.colorDot && (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selected.colorDot }} />
        )}
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: selected ? W.inkStrong : W.inkSoft }}>
          {selected?.label ?? placeholder ?? 'Seç...'}
        </Text>
        <ChevronDown
          size={14}
          color={W.inkMute}
          strokeWidth={1.8}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] } as any}
        />
      </Pressable>

      {open && (
        <View
          style={{
            position: 'absolute', top: 46, left: 0, right: 0,
            backgroundColor: W.surface,
            borderRadius: 10, borderWidth: 1, borderColor: W.border,
            shadowColor: '#0F172A', shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
            ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(15,23,42,0.12)' } as any : {}),
            padding: 4, gap: 1,
            maxHeight: 280, overflow: 'hidden',
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map(o => {
              const active = o.value === value;
              const Icon = o.icon;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => { onChange(o.value); setOpen(false); }}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 10, paddingVertical: 9, borderRadius: 7,
                    backgroundColor: active ? W.bg : (hovered ? W.bg : 'transparent'),
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  {Icon && <Icon size={13} color={W.ink} strokeWidth={1.8} />}
                  {o.colorDot && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: o.colorDot }} />
                  )}
                  <Text style={{ flex: 1, fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? W.inkStrong : W.ink }}>
                    {o.label}
                  </Text>
                  {active && <CheckCircle2 size={13} color={W.inkStrong} strokeWidth={1.8} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
