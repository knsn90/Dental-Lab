/**
 * İş tipi satırının altında açılan 12 aylık mini grafik (spec §7.4). Satırın
 * olduğu yerden açılır (üstten aşağı yayla); hareket azaltılmışsa yalnız solma.
 * Kayıt dönemi öncesi aylar kesik çizgili boş sütun.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, Platform } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, useReducedMotion,
} from 'react-native-reanimated';
import { useInkUI } from '../../../../core/theme/inkScale';
import { printLocale } from '../../../../core/i18n/printLocale';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { monthLabel, type MonthKey } from '../months';
import { barPct } from '../overview';
import { VALUE_SPRING } from '../useSpringValue';

export function MiniSeries({ series, months, selected, unitLabel, color }: {
  series: (number | null)[];
  months: MonthKey[];
  selected: MonthKey;
  unitLabel: string;
  /** Satırın çubuk tonu (üye: accent; çene/adet: ikinci ton). */
  color: string;
}) {
  const U = useInkUI();
  const reduced = useReducedMotion();
  const locale = printLocale();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = reduced ? withTiming(1, { duration: 140 }) : withSpring(1, VALUE_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.3),
    transform: reduced ? [] : [{ translateY: (1 - p.value) * -6 }, { scaleY: 0.9 + 0.1 * p.value }],
  }));
  const max = useMemo(() => series.reduce<number>((m, v) => (v != null && v > m ? v : m), 1), [series]);

  return (
    <Animated.View
      style={[{
        marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: U.hairlineSoft,
        ...(Platform.OS === 'web' ? { transformOrigin: 'top' } as any : {}),
      }, anim]}
    >
      <View style={{ flexDirection: 'row', height: 64, gap: 4, direction: 'ltr' } as any}>
        {series.map((v, i) => {
          const m = months[i];
          const on = m === selected;
          const short = monthLabel(m, locale, 'short');
          return (
            <View
              key={m}
              accessible
              accessibilityLabel={`${monthLabel(m, locale, 'long')}: ${v == null ? autoT('kayıt yok') : `${v} ${unitLabel}`}`}
              style={{ flex: 1, alignItems: 'center', gap: 3 }}
            >
              <Text style={{ fontSize: 9.5, fontWeight: on ? '700' : '500', color: on ? U.ink[900] : U.ink[400], fontVariant: ['tabular-nums'] }}>
                {v == null ? ' ' : String(v)}
              </Text>
              <View
                style={{
                  flex: 1, width: '100%', maxWidth: 16, borderRadius: 999, overflow: 'hidden', justifyContent: 'flex-end',
                  ...(v == null
                    ? { borderWidth: 1, borderStyle: 'dashed', borderColor: U.ink[300] }
                    : { backgroundColor: U.chipNeutral }),
                }}
              >
                {v ? (
                  <View style={{ height: `${barPct(v, max, 8)}%`, borderRadius: 999, backgroundColor: color, opacity: on ? 1 : 0.45 }} />
                ) : null}
              </View>
              <Text numberOfLines={1} style={{ fontSize: 9, textTransform: 'uppercase', color: on ? U.ink[900] : U.ink[400], fontWeight: on ? '700' : '500' }}>
                {short}
              </Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}
