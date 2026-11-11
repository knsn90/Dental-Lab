/**
 * Klinik seçici — arama kutulu liste; ilk satır "Tüm klinikler", ardından
 * penceredeki klinikler en çok gönderenden aza. Tetikleyicinin altından açılır.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { Check, Search } from '../../../../core/ui/icons';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme } from '../../../../core/theme/usePanelTheme';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { AnchoredPopover, type AnchorRect } from './AnchoredPopover';

export interface ClinicOption { id: string; name: string; total: number }

const web = Platform.OS === 'web';

export function ClinicPicker({ visible, anchor, options, value, onPick, onClose }: {
  visible: boolean;
  anchor: AnchorRect | null;
  /** Sıralı (çoktan aza) — çağıran sıralar. */
  options: ClinicOption[];
  value: string | null;
  onPick: (clinicId: string | null) => void;
  onClose: () => void;
}) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const tint = U.isDark ? '#93C5FD' : accent;
  const [q, setQ] = useState('');
  useEffect(() => { if (visible) setQ(''); }, [visible]);

  const shown = useMemo(() => {
    const k = q.trim().toLocaleLowerCase('tr-TR');
    if (!k) return options;
    return options.filter((o) => o.name.toLocaleLowerCase('tr-TR').includes(k));
  }, [q, options]);

  const row = (id: string | null, name: string, total: number | null) => {
    const on = value === id;
    return (
      <Pressable
        key={id ?? '__all__'}
        onPress={() => { onPick(id); onClose(); }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={({ pressed, hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
          backgroundColor: on ? (U.isDark ? 'rgba(147,197,253,0.14)' : accent + '1A')
            : hovered || pressed ? U.rowHover : 'transparent',
          transform: [{ scale: pressed ? 0.97 : 1 }],
          ...(web ? { cursor: 'pointer' } as any : {}),
        })}
      >
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: on ? '700' : '500', color: on ? tint : U.ink[800] }}>
          {name}
        </Text>
        {total !== null ? (
          <Text style={{ fontSize: 12, color: U.ink[500], fontVariant: ['tabular-nums'] }}>{total}</Text>
        ) : null}
        <View style={{ width: 14 }}>{on ? <Check size={14} color={tint} strokeWidth={2.4} /> : null}</View>
      </Pressable>
    );
  };

  return (
    <AnchoredPopover visible={visible} anchor={anchor} onClose={onClose} width={300}>
      <View style={{ padding: 8, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...U.inputStyle, height: 40, borderRadius: 999 }}>
          <Search size={14} color={U.ink[400]} strokeWidth={2} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus={web}
            placeholder={autoT('Klinik ara')}
            placeholderTextColor={U.ink[400]}
            accessibilityLabel={autoT('Klinik ara')}
            style={{ flex: 1, fontSize: 13, color: U.ink[900], ...(web ? { outlineStyle: 'none' } as any : {}) }}
          />
        </View>
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {!q.trim() ? row(null, autoT('Tüm klinikler'), null) : null}
          {shown.map((o) => row(o.id, o.name, o.total))}
          {shown.length === 0 && q.trim() ? (
            <Text style={{ padding: 12, fontSize: 12.5, color: U.ink[500] }}>{autoT('Eşleşen klinik yok')}</Text>
          ) : null}
        </ScrollView>
      </View>
    </AnchoredPopover>
  );
}
