/**
 * StageProgressBar — "Son Siparişler" tablosundaki ilerleme hücresi.
 *
 * İnce pill ray + dolgu; dolgu açılışta 0'dan hedefe kritik sönümlü yayla akar
 * (satır sırasına göre kısa gecikme → aşağı doğru dalga). Oran değişince
 * bulunduğu yerden yeni değere süzülür. Hareketi azalt açıksa animasyon yok.
 * Sağda "3/9" (aşama) ya da yüzde. Koyu tema: ray hairline, metin token.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, Platform, AccessibilityInfo } from 'react-native';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

const WEB = Platform.OS === 'web';

export function StageProgressBar({
  done, total, pct, color, delayIndex = 0,
}: {
  /** Tamamlanan / toplam aşama — biliniyorsa etiket "3/9" olur. */
  done?: number | null;
  total?: number | null;
  /** 0–1 oran (aşama yoksa durumdan türetilmiş). */
  pct: number;
  color: string;
  delayIndex?: number;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const target = Math.max(0, Math.min(1, Number(pct) || 0));
  const p = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduce(!!v); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (reduce) { p.setValue(target); return; }
    const delay = first.current ? 120 + delayIndex * 55 : 0;
    first.current = false;
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(p, { toValue: target, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [target, reduce, delayIndex, p]);

  const label = total && total > 0 ? `${done ?? 0}/${total}` : `${Math.round(target * 100)}%`;
  const track = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
        style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: track, overflow: 'hidden' }}
      >
        <Animated.View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 999, backgroundColor: color,
            // Web: scaleX (GPU, düzen değişmez). Native: genişlik (yüzde transform yok).
            ...(WEB
              ? { width: '100%', transformOrigin: 'left center', transform: [{ scaleX: p }] } as any
              : { width: p.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }),
          }}
        />
      </View>
      <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, fontVariant: ['tabular-nums'], minWidth: 30, textAlign: 'right' }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Aşama verisi yoksa (eski/aşamasız sipariş) durumdan kaba ilerleme.
 * Teslim edilen her zaman tam dolu.
 */
export function statusProgress(status: string | null | undefined): number {
  const m: Record<string, number> = {
    alindi: 0.1, asamada: 0.35, uretimde: 0.5, kalite_kontrol: 0.75,
    teslimata_hazir: 0.9, kurye_bekleniyor: 0.92, kuryede: 0.95, teslim_edildi: 1,
  };
  return m[String(status ?? '')] ?? 0;
}
