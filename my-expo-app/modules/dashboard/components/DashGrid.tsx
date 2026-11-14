// Özet panolarının ortak ızgarası (kullanıcı: "üst satırdaki 4 kartın genişlikleri aynı olsun, alt sıra da aynı
// hizada dursun, farklı ekranlara uysun"). Her satır iki YARIM'dan, her yarım bir ya da iki HÜCRE'den oluşur;
// bütün satırlar aynı iç içe yapıyı kullandığı için sütun sınırları sıradan sıraya birebir hizalanır.
// Genişlik ölçülmez (flex-basis + wrap): yer daralınca önce yarımlar alt alta iner (4 → 2 sütun), daha darda
// hücreler de (→ 1 sütun). Kart, hücrenin yüksekliğini flex:1 ile doldurur; aynı satırdaki kartlar eş boylu kalır.
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, Platform } from 'react-native';

/** Kartların okunur kaldığı en dar sütun */
const CELL_MIN = 220;

export function DashRow({ gap, children, style }: { gap: number; children: React.ReactNode; style?: any }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignContent: 'stretch', gap }, style]}>{children}</View>;
}

/** Satırın yarısı — içindeki DashCell'ler yan yana (tek hücre yarımın tamamını kaplar) */
export function DashHalf({ gap, children }: { gap: number; children: React.ReactNode }) {
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: CELL_MIN * 2 + gap, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'stretch', gap }}>
      {children}
    </View>
  );
}

function reducedMotion(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

/**
 * Hareketli hücre (isteğe bağlı): ilk gelişte belirip hafifçe yükselir (hepsi aynı anda); fare
 * üstüne gelince 3px kalkar, ayrılınca yaylanarak iner. Yalnız transform + opacity →
 * yerleşim değişmez. "Hareketi azalt" açıksa ikisi de kapalı.
 */
// Giriş dalgası: ilk hücre bağlandığı an başlar. Dalganın içinde bağlanan bütün hücreler
// AYNI ANDA açılır; verisi geç gelen (dalga bittikten sonra bağlanan) hücre giriş hareketi
// yapmadan doğrudan görünür — yoksa kartlar tek tek, farklı zamanlarda açılıyor gibi olur.
let waveStartedAt = 0;
let mountedCells = 0;
const WAVE_MS = 350;

function MotionCell({ index: _index, style, children }: { index: number; style: any; children: React.ReactNode }) {
  const reduce = reducedMotion();
  const inWave = useRef<boolean | null>(null);
  if (inWave.current === null) {
    const now = Date.now();
    if (mountedCells === 0 || waveStartedAt === 0) waveStartedAt = now;
    inWave.current = now - waveStartedAt <= WAVE_MS;
  }
  useEffect(() => {
    mountedCells += 1;
    return () => { mountedCells -= 1; if (mountedCells <= 0) { mountedCells = 0; waveStartedAt = 0; } };
  }, []);
  const enter = useRef(new Animated.Value(reduce || !inWave.current ? 1 : 0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !inWave.current) return;
    Animated.timing(enter, {
      // Bütün kartlar AYNI ANDA açılır (kullanıcı kararı): sıralı gecikme yok
      toValue: 1, duration: 420, delay: 0,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const to = (v: number) => {
    if (reduce) return;
    Animated.spring(lift, { toValue: v, speed: 22, bounciness: 5, useNativeDriver: true }).start();
  };
  const hover = Platform.OS === 'web' ? ({ onMouseEnter: () => to(1), onMouseLeave: () => to(0) } as any) : {};
  return (
    <Animated.View
      {...hover}
      style={[style, {
        opacity: enter,
        transform: [{
          translateY: Animated.add(
            enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
            lift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }),
          ),
        }],
      }]}
    >
      {children}
    </Animated.View>
  );
}

const CELL_STYLE = { flexGrow: 1, flexShrink: 1, flexBasis: CELL_MIN, minWidth: 0 };
const THIRD_STYLE = { flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0 };

/** `motion`: verilirse hücre hareketli olur (değer = sıradaki gecikme sırası). */
export function DashCell({ children, motion }: { children: React.ReactNode; motion?: number }) {
  if (motion != null) return <MotionCell index={motion} style={CELL_STYLE}>{children}</MotionCell>;
  return <View style={CELL_STYLE}>{children}</View>;
}

/** Satırın üçte biri — üç kartlı satırlar için. Daralınca 2'li, sonra tek sütuna iner. */
export function DashThird({ children, motion }: { children: React.ReactNode; motion?: number }) {
  if (motion != null) return <MotionCell index={motion} style={THIRD_STYLE}>{children}</MotionCell>;
  return <View style={THIRD_STYLE}>{children}</View>;
}

/** Satırda tek kart kaldığında boş YARIM yer tutucu — tek kart tüm satıra yayılmasın,
 *  diğer satırlardaki yarımlarla aynı genişlikte kalsın (kullanıcı isteği, 2026-11-12). */
export function DashHalfSpacer({ gap }: { gap: number }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexGrow: 1, flexShrink: 1, flexBasis: CELL_MIN * 2 + gap, minWidth: 0, height: 0 }} />;
}
