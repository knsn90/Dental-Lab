// modules/delivery/proof/useAnchoredSpring.ts
// Tetikleyiciden açılan, aynı yoldan oraya kapanan pencere hareketi (spec 6, ProvaModal kalıbı).
// Kritik sönümlü yay (k=320, c=36 ≈ 2√k): taşma yok; Animated.spring o anki değerden başlar →
// kapanırken yeniden açılırsa olduğu yerden döner. Hareketi azaltmada yalnız solma.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, useWindowDimensions } from 'react-native';

export type OriginRect = { x: number; y: number; w: number; h: number };

const NATIVE_DRIVER = Platform.OS !== 'web';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduce(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduce(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

/** Ölçülen öğenin pencere koordinatları (pencere oradan büyür). */
export function measureOrigin(node: any, cb: (r: OriginRect | null) => void) {
  if (!node?.measureInWindow) { cb(null); return; }
  node.measureInWindow((x: number, y: number, w: number, h: number) => cb(w || h ? { x, y, w, h } : null));
}

export function useAnchoredSpring(visible: boolean, origin: OriginRect | null) {
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(1)).current;   // 0 = yerinde, 1 = tetikleyicide
  const at = useRef({ dx: 0, dy: 24 });
  const shown = useRef(false);

  useEffect(() => {
    const run = (to: number, done?: () => void) => {
      const anim = reduce
        ? Animated.timing(progress, { toValue: to, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER })
        : Animated.spring(progress, { toValue: to, stiffness: 320, damping: 36, mass: 1, useNativeDriver: NATIVE_DRIVER });
      anim.start(({ finished }) => { if (finished && done) done(); });
    };
    if (visible) {
      if (!shown.current) {
        at.current = origin
          ? { dx: origin.x + origin.w / 2 - width / 2, dy: origin.y + origin.h / 2 - height / 2 }
          : { dx: 0, dy: 24 };
      }
      shown.current = true;
      setMounted(true);
      run(0);
    } else if (shown.current) {
      run(1, () => { shown.current = false; setMounted(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cardStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.6, 0] }),
    transform: reduce ? [] : [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, at.current.dx] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, at.current.dy] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) },
    ],
  };
  const scrimStyle = { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
  return { mounted, cardStyle, scrimStyle, reduce };
}

/** Anlamlı anlarda kısa titreşim (fotoğraf, teslim, eksikle basış). */
export function haptic(ms = 10) {
  try {
    if (Platform.OS === 'web') (globalThis as any).navigator?.vibrate?.(ms);
    else require('react-native').Vibration.vibrate(ms);
  } catch { /* titreşim yoksa sessiz */ }
}
