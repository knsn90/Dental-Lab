/**
 * Değerlendirmeler ekranının küçük ortak parçaları: basma tepkisi, durum tonları,
 * sayı/ay biçimleri. Yalnız bu klasördeki bileşenler kullanır.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Animated, Platform, AccessibilityInfo, type ViewStyle, type StyleProp } from 'react-native';
import { useInkUI } from '../../../../core/theme/inkScale';
import { localeTag } from '../../../../core/i18n';

/** Kullanıcı hareketi azaltmayı seçtiyse true. Web'de matchMedia, native'de A11y API. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    if (Platform.OS === 'web') {
      const mq = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
      if (!mq) return;
      setReduced(mq.matches);
      const onChange = (e: any) => alive && setReduced(!!e.matches);
      mq.addEventListener?.('change', onChange);
      return () => { alive = false; mq.removeEventListener?.('change', onChange); };
    }
    AccessibilityInfo.isReduceMotionEnabled?.().then(v => { if (alive) setReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => alive && setReduced(!!v));
    return () => { alive = false; (sub as any)?.remove?.(); };
  }, []);
  return reduced;
}

/**
 * Basılınca ANINDA küçülen düğme (pointer-down'da). Hareket azaltılmışsa küçülmez.
 * Yerleşim stili (flex/genişlik) `containerStyle`'a, görünüm `style`'a verilir —
 * içteki Animated.View'a yerleşim verilirse Pressable büzülür.
 */
export function PressScale({ onPress, disabled, style, containerStyle, children, accessibilityLabel }: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const to = (v: number) => {
    if (reduced || disabled) return;
    Animated.spring(scale, { toValue: v, useNativeDriver: Platform.OS !== 'web', speed: 40, bounciness: 0 }).start();
  };
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onPressIn={() => to(0.97)}
      onPressOut={() => to(1)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={[containerStyle, Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer' } as any) : null]}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style, disabled ? { opacity: 0.4 } : null]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Kırmızı/yeşil durum tonları; koyu temada açık metin (CLAUDE.md ortak status renkleri). */
export function useReviewTones() {
  const U = useInkUI();
  return {
    bad: U.isDark ? U.chipTones.danger.fg : '#D94B4B',
    good: U.isDark ? U.chipTones.success.fg : '#2D9A6B',
    line: U.isDark ? 'rgba(255,255,255,0.28)' : (U.ink[300] as string),
    badTone: U.chipTones.danger,
    goodTone: U.chipTones.success,
  };
}

/** Tam sayı, dilin rakamlarıyla (Farsça'da Farsça rakam). */
export function fmtInt(n: number, lang: string): string {
  try { return new Intl.NumberFormat(lang).format(n); } catch { return String(n); }
}

/** Oran (0–1) yüzde olarak, ondalıksız: "%41" / "41%". */
export function fmtPct(ratio: number, lang: string): string {
  try { return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(ratio); }
  catch { return `%${Math.round(ratio * 100)}`; }
}

/**
 * 'YYYY-MM-01' → "Kasım 2026". Aylar miladi takvim ayıdır (TR saati), bu yüzden
 * Farsça'da da miladi ay adı yazılır — Celali ay adı iki ayı karıştırırdı.
 */
export function monthLabel(month: string, lang: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 15);
  const tag = lang === 'fa' ? 'fa-IR-u-ca-gregory' : localeTag(lang);
  try { return new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' }).format(d); }
  catch { return month.slice(0, 7); }
}


/** 'YYYY-MM-01' → "Kas" (miladi kısa ay adı; Farsça'da da miladi). */
export function monthShortLabel(month: string, lang: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 15);
  const tag = lang === 'fa' ? 'fa-IR-u-ca-gregory' : localeTag(lang);
  try { return new Intl.DateTimeFormat(tag, { month: 'short' }).format(d); }
  catch { return month.slice(5, 7); }
}
