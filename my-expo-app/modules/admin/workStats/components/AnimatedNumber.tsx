/**
 * Yayla akan sayı — useSpringValue'nun değerini metne yazar. Ekrandaki mevcut
 * değerden hedefe gider, yolda yeni hedef gelirse oradan döner. Hareket
 * azaltılmışsa son değer doğrudan yazılır (useSpringValue doğrudan atar).
 */
import React, { useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { useSpringValue } from '../useSpringValue';
import { printLocale } from '../../../../core/i18n/printLocale';
import { formatStatNumber } from '../formatStatNumber';

export function AnimatedNumber({ value, decimals = 0, style, accessibilityLabel }: {
  value: number; decimals?: number; style?: TextStyle | TextStyle[]; accessibilityLabel?: string;
}) {
  const v = useSpringValue(value);
  const [shown, setShown] = useState(value);
  const f = Math.pow(10, decimals);
  useAnimatedReaction(
    () => Math.round(v.value * f) / f,
    (cur, prev) => { if (cur !== prev) runOnJS(setShown)(cur); },
    [f],
  );
  return (
    <Text style={style} accessibilityLabel={accessibilityLabel}>
      {formatStatNumber(shown, decimals, printLocale())}
    </Text>
  );
}
