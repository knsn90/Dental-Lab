/**
 * İş emri etiketi boyut seçici — A4 / A5 / A6.
 *
 * Kompakt segmented kapsül: dış kap düz-buton yüzeyi (U.plainBtn), seçili
 * dilim koyu pill (U.ink[900] + U.onDarkPill). Pill ölçüsü sözleşmeden:
 * pasif 12 / aktif 18 yatay dolgu, 8 dikey. Her iki temada okunur.
 * İpucu metinleri veri (JSX değil) → autoT ile çevrilir.
 */
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { type LabelSize, LABEL_SIZES } from '../lib/workLabel';

const HINT: Record<LabelSize, string> = {
  A4: 'Tam sayfa · işlem tablosuyla',
  A5: 'Yarım sayfa',
  A6: 'Kutu etiketi',
};

export function LabelSizePicker({ value, onChange, disabled }: {
  value: LabelSize;
  onChange: (s: LabelSize) => void;
  disabled?: boolean;
}) {
  const U = useInkUI();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row', alignItems: 'center', padding: 2, borderRadius: 999,
        backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {LABEL_SIZES.map(s => {
        const on = s === value;
        return (
          <GlassTooltip key={s} title={s} text={autoT(HINT[s])} placement="bottom">
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !!disabled }}
              accessibilityLabel={`${s} · ${autoT(HINT[s])}`}
              disabled={disabled || on}
              onPress={() => onChange(s)}
              style={({ hovered }: any) => ({
                paddingHorizontal: on ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                backgroundColor: on ? U.ink[900] : hovered ? U.plainBtn.hoverBg : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: on || disabled ? 'default' : 'pointer' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: on ? '700' : '600', color: on ? U.onDarkPill : U.plainBtn.fgMuted }}>{s}</Text>
            </Pressable>
          </GlassTooltip>
        );
      })}
    </View>
  );
}
