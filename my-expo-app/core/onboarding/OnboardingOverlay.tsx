// core/onboarding/OnboardingOverlay.tsx
// Animated spotlight coach-mark overlay. Renders nothing while inactive.
// Spotlight = four dim rectangles around a padded hole (web+native safe — no
// SVG masking) + an emerald highlight ring, animated between steps with
// react-native-reanimated. Falls back to a centered card when a target is
// missing / unmeasurable or the step has no targetId.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Platform, useWindowDimensions, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  withDelay, Easing,
} from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Check } from '../ui/icons';
import { supabase } from '../api/supabase';
import { useOnboardingStore } from './onboardingStore';
import { useNewOrderModalStore } from '../store/newOrderModalStore';
import { isRTL } from '../i18n';
import { resetNavScroll } from '../ui/mobile/navScroll';

/** Navbar'daki hedefler — kaydırmayla küçülmüş navbar ölçülmeden önce açılır. */
const NAV_TARGETS = new Set(['tour-new-order', 'tour-orders']);
/** Telefon genişliği: kart hedefin karşı kenarına sabitlenir, kompakt çizilir. */
const MOBILE_MAX_W = 769;

/** Klavye yüksekliği — native Keyboard olayları, web'de visualViewport farkı. */
function useKeyboardHeight(enabled: boolean): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    if (!enabled) { setKb(0); return; }
    if (Platform.OS === 'web') {
      const vv: any = typeof window !== 'undefined' ? (window as any).visualViewport : null;
      if (!vv) return;
      const onChange = () => {
        const diff = window.innerHeight - vv.height - (vv.offsetTop || 0);
        setKb(diff > 120 ? diff : 0);   // küçük farklar adres çubuğu oynaması
      };
      vv.addEventListener('resize', onChange);
      vv.addEventListener('scroll', onChange);
      onChange();
      return () => { vv.removeEventListener('resize', onChange); vv.removeEventListener('scroll', onChange); };
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, (e: any) => setKb(e?.endCoordinates?.height ?? 0));
    const b = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => { a.remove(); b.remove(); };
  }, [enabled]);
  return kb;
}

// Doctor emerald theme (CLAUDE.md §7)
const PRIMARY = '#32BB78';
const PRIMARY_DEEP = '#0C8F56';
const INK = '#2F313F';
const DIM = 'rgba(15,23,42,0.72)';

const PAD = 8;          // padding around the target rect
const CARD_MAX_W = 460;
const RING_RADIUS = 16;
const TIMING = { duration: 260, easing: Easing.out(Easing.cubic) } as const;

type Rect = { x: number; y: number; w: number; h: number };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// measureInWindow is async (callback); fall back to getBoundingClientRect on web.
function measureNode(node: any, cb: (r: Rect | null) => void) {
  if (!node) { cb(null); return; }
  try {
    if (typeof node.measureInWindow === 'function') {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        if (w > 0 && h > 0) cb({ x, y, w, h });
        else cb(null);
      });
      return;
    }
  } catch { /* noop */ }
  try {
    if (typeof node.getBoundingClientRect === 'function') {
      const r = node.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) { cb({ x: r.left, y: r.top, w: r.width, h: r.height }); return; }
    }
  } catch { /* noop */ }
  cb(null);
}

export function OnboardingOverlay({ host = 'root' }: { host?: 'root' | 'newOrder' }) {
  const active = useOnboardingStore(s => s.active);
  const stepIndex = useOnboardingStore(s => s.stepIndex);
  const steps = useOnboardingStore(s => s.steps);
  const next = useOnboardingStore(s => s.next);
  const prev = useOnboardingStore(s => s.prev);
  const finish = useOnboardingStore(s => s.finish);
  const skip = useOnboardingStore(s => s.skip);
  const overlayHost = useOnboardingStore(s => s.overlayHost);
  // KVKK onayı / ödeme hatırlatması gibi zorunlu pencere açıkken bekle.
  const blocked = useOnboardingStore(s => s.blockers > 0);
  const insets = useSafeAreaInsets();

  // Yalnız aktif host çizer + yan-etkileri yürütür → çift karartma / çift
  // aksiyon olmaz. Modal-içi overlay 'newOrder', kök overlay 'root'.
  const isActiveHost = overlayHost === host;

  const { width: W, height: H } = useWindowDimensions();
  const isMobile = W < MOBILE_MAX_W;
  const kbH = useKeyboardHeight(active && isMobile);

  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(220);
  // Katmanın PENCEREDEKİ başlangıcı. Hedefler pencereye göre ölçülür ama katman
  // ebeveyninin içinde çizilir: iOS'ta yeni-sipariş modalı SafeAreaView(top)
  // içinde → katman durum çubuğu kadar aşağıda başlıyor, spotlight ve kart o
  // kadar kayıyordu ("boş yerleri gösteriyor"). Ölçüp farkı düşüyoruz.
  // Web'de katman body'ye portal + fixed → hep 0.
  const rootRef = useRef<any>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  /** Katman başlangıcını ölç (native). Modal kayarak açılırken ara değer
   *  gelebilir; bu yüzden her hedef ölçümünde YENİDEN çağrılır. */
  const readOrigin = (cb: (o: { x: number; y: number }) => void) => {
    const n = rootRef.current;
    if (Platform.OS === 'web' || !n || typeof n.measureInWindow !== 'function') { cb({ x: 0, y: 0 }); return; }
    n.measureInWindow((x: number, y: number) => cb({ x: x || 0, y: y || 0 }));
  };

  // ─── Spotlight hole shared values ─────────────────────────────────────────
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const sw = useSharedValue(0);
  const sh = useSharedValue(0);
  const seeded = useRef(false);

  // ─── Fade / slide shared values ───────────────────────────────────────────
  const overlayOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardTY = useSharedValue(10);
  const cardScale = useSharedValue(0.96);

  // ─── Attention loops (breathing halo + CTA pulse) ─────────────────────────
  const pulse = useSharedValue(0);   // 0→1 expanding halo, repeats
  const ctaPulse = useSharedValue(0); // CTA breathing 0→1→0

  const step = active ? steps[stepIndex] : undefined;
  const isLast = active && stepIndex === steps.length - 1;

  // Overlay fade-in / reset seed on activation change.
  useEffect(() => {
    overlayOpacity.value = withTiming(active ? 1 : 0, { duration: 200 });
    if (active) {
      // Continuous loops — expanding halo + gentle CTA breathing.
      pulse.value = 0;
      pulse.value = withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false,
      );
      ctaPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ), -1, false,
      );
    } else {
      seeded.current = false; setRect(null);
    }
  }, [active, overlayOpacity, pulse, ctaPulse]);

  // Card fade + slide + pop per step.
  useEffect(() => {
    if (!active) return;
    cardOpacity.value = 0;
    cardTY.value = 12;
    cardScale.value = 0.96;
    cardOpacity.value = withDelay(60, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
    cardTY.value = withDelay(60, withTiming(0, { duration: 300, easing: Easing.out(Easing.back(1.4)) }));
    cardScale.value = withDelay(60, withTiming(1, { duration: 300, easing: Easing.out(Easing.back(1.6)) }));
  }, [stepIndex, active, cardOpacity, cardTY, cardScale]);

  // Execute the step's side-effect (open form / change wizard step) once when
  // it becomes active — only on the active host so it never fires twice.
  useEffect(() => {
    if (!active || !isActiveHost || blocked) return;
    const a = steps[stepIndex]?.action;
    if (!a) return;
    // openNewOrder YALNIZ kök host'ta: form-içi overlay bunu çalıştırırsa
    // (form zaten açık) tekrar tekrar router.push eder → sonsuz döngü.
    if (a.openNewOrder && host === 'root') {
      // Panele göre aç: masaüstünde route, mobilde modal. Layout 'no-open'
      // opener'ını kaydeder; yoksa modal store'a düş.
      const opener = useOnboardingStore.getState().refs.get('no-open');
      if (opener?.open) { try { opener.open(); } catch { /* noop */ } }
      else useNewOrderModalStore.getState().setOpen(true);
    }
    if (a.closeNewOrder && host === 'root') useNewOrderModalStore.getState().setOpen(false);
    // formStep yalnız form-içi host'ta (controller orada kayıtlı).
    if (a.formStep && host === 'newOrder') {
      const ctrl = useOnboardingStore.getState().refs.get('no-form-controller');
      try { ctrl?.goToStep?.(a.formStep); } catch { /* noop */ }
    }
  }, [active, isActiveHost, blocked, stepIndex, steps]);

  // Measure the current target (re-run on step / window resize). Retries a few
  // times because a formStep action re-renders the wizard and the new section
  // needs a beat to lay out before its ref can be measured.
  useEffect(() => {
    if (!active || !isActiveHost || blocked) return;
    const s = steps[stepIndex];
    if (!s || !s.targetId) { setRect(null); return; }
    let cancelled = false;
    // Adım değişiminde eski spotlight'ı bırakma — hedef ölçülene dek ortalı kart.
    setRect(null);
    // Navbar kaydırmayla küçülmüş/aşağı itilmiş olabilir → normal boyuna aç;
    // yoksa spotlight navbar'ın OLMASI gereken boş yeri gösteriyordu.
    if (NAV_TARGETS.has(s.targetId)) { try { resetNavScroll(); } catch { /* noop */ } }
    let scrolled = false;
    const doMeasure = () => {
      const node = useOnboardingStore.getState().refs.get(s.targetId!);
      readOrigin((o) => measureNode(node, (r) => {
        if (cancelled || !r) return;
        setOrigin(prev => (Math.abs(prev.x - o.x) > 0.5 || Math.abs(prev.y - o.y) > 0.5 ? o : prev));
        // Web: hedef görünür alanın dışındaysa bir kez ortaya kaydır; sonraki
        // ölçümler yeni konumu yakalar (formun alttaki alanları).
        const visibleH = H - kbH;
        if (Platform.OS === 'web' && !scrolled && (r.y < 0 || r.y + Math.min(r.h, visibleH) > visibleH)) {
          scrolled = true;
          try { node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); } catch { /* noop */ }
        }
        setRect({ x: r.x - o.x, y: r.y - o.y, w: r.w, h: r.h });
      }));
    };
    doMeasure();
    // Staggered re-measures: modal mount / wizard step swap / scroll settle.
    const timers = [90, 260, 500, 800, 1200].map(ms => setTimeout(doMeasure, ms));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [active, isActiveHost, blocked, stepIndex, steps, W, H, kbH]);

  // Animate the hole to the measured rect.
  useEffect(() => {
    if (!active || !rect) return;
    const hx = clamp(rect.x - PAD, 0, W);
    const hy = clamp(rect.y - PAD, 0, H);
    const hw = Math.min(rect.w + PAD * 2, W - hx);
    const hh = Math.min(rect.h + PAD * 2, H - hy);
    if (!seeded.current) {
      // Gentle "spotlight opens" from the target center.
      sx.value = hx + hw / 2;
      sy.value = hy + hh / 2;
      sw.value = 0;
      sh.value = 0;
      seeded.current = true;
    }
    sx.value = withTiming(hx, TIMING);
    sy.value = withTiming(hy, TIMING);
    sw.value = withTiming(hw, TIMING);
    sh.value = withTiming(hh, TIMING);
  }, [rect, active, W, H, sx, sy, sw, sh]);

  // ─── Animated styles ──────────────────────────────────────────────────────
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTY.value }, { scale: cardScale.value }],
  }));
  const topStyle = useAnimatedStyle(() => ({
    position: 'absolute', left: 0, right: 0, top: 0,
    height: Math.max(0, sy.value), backgroundColor: DIM,
  }));
  const bottomStyle = useAnimatedStyle(() => ({
    position: 'absolute', left: 0, right: 0,
    top: sy.value + sh.value,
    height: Math.max(0, H - (sy.value + sh.value)), backgroundColor: DIM,
  }));
  const leftStyle = useAnimatedStyle(() => ({
    position: 'absolute', left: 0, top: sy.value,
    width: Math.max(0, sx.value), height: sh.value, backgroundColor: DIM,
  }));
  const rightStyle = useAnimatedStyle(() => ({
    position: 'absolute', top: sy.value, left: sx.value + sw.value,
    width: Math.max(0, W - (sx.value + sw.value)), height: sh.value, backgroundColor: DIM,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    position: 'absolute', left: sx.value, top: sy.value,
    width: sw.value, height: sh.value,
    borderRadius: RING_RADIUS, borderWidth: 2, borderColor: PRIMARY,
    // Subtle breathing on the solid ring itself.
    opacity: 0.85 + ctaPulse.value * 0.15,
  }));
  // ── Web rounded hole ──────────────────────────────────────────────────────
  // On web a single rounded box + a huge boxShadow spread dims everything
  // OUTSIDE the rounded rect — perfect rounded corners, no artifacts. The
  // static boxShadow lives in a plain style; only position animates here.
  const holePosStyle = useAnimatedStyle(() => ({
    left: sx.value, top: sy.value, width: sw.value, height: sh.value,
  }));
  // Expanding halo that pulses outward from the spotlight ring (scales from
  // its own center — RN transforms are center-origin).
  const haloStyle = useAnimatedStyle(() => ({
    position: 'absolute', left: sx.value, top: sy.value,
    width: sw.value, height: sh.value,
    borderRadius: RING_RADIUS, borderWidth: 2, borderColor: PRIMARY,
    opacity: (1 - pulse.value) * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.16 }],
  }));
  const ctaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ctaPulse.value * 0.04 }],
  }));

  if (!active || !step || !isActiveHost || blocked) return null;

  // ─── Tooltip card position (JS; updates per step) ─────────────────────────
  const rtl = isRTL();
  const cardW = Math.min(CARD_MAX_W, W - 32);
  const kbOpen = isMobile && kbH > 0;
  let cardLeft: number;
  let cardTop: number;
  if (isMobile && rect) {
    // TELEFON: kart hedefin KARŞI kenarına sabitlenir. Hedefin altına/üstüne
    // sığmadığında eskiden alanın ÜSTÜNE biniyordu → form alanı doldurulamıyordu.
    // Klavye açıkken yalnız klavyenin üstündeki görünür alan hesaba katılır.
    // Kart konumu katmanın yerel koordinatında (origin düşülmüş).
    const visibleH = H - kbH - origin.y;
    const topLimit = Math.max(8, insets.top + 8 - origin.y);
    const bottomLimit = kbOpen ? visibleH - 8 : H - origin.y - insets.bottom - 12;
    const targetMid = rect.y + rect.h / 2;
    cardLeft = (W - cardW) / 2;
    cardTop = targetMid > (topLimit + bottomLimit) / 2
      ? topLimit                                   // hedef altta → kart üstte
      : Math.max(topLimit, bottomLimit - cardH);   // hedef üstte → kart altta
  } else if (rect) {
    const holeY = clamp(rect.y - PAD, 0, H);
    const holeH = Math.min(rect.h + PAD * 2, H - holeY);
    const centerX = rect.x + rect.w / 2;
    cardLeft = clamp(centerX - cardW / 2, 16, Math.max(16, W - 16 - cardW));
    const belowTop = holeY + holeH + 14;
    if (belowTop + cardH <= H - 16) cardTop = belowTop;
    else cardTop = clamp(holeY - 14 - cardH, 16, Math.max(16, H - 16 - cardH));
  } else {
    cardLeft = (W - cardW) / 2;
    cardTop = clamp((H - cardH) / 2, 16, Math.max(16, H - 16 - cardH));
  }

  const markDone = () => {
    // Fire-and-forget; PostgrestBuilder has no .catch — wrap in Promise.resolve.
    // Panel başına RPC (mark_doctor_onboarded / mark_clinic_onboarded) store'dan gelir.
    const rpc = useOnboardingStore.getState().markRpc || 'mark_doctor_onboarded';
    try { Promise.resolve(supabase.rpc(rpc as any)).catch(() => {}); }
    catch { /* noop */ }
  };
  const onSkip = () => { markDone(); skip(); };
  const onNext = () => { if (isLast) { markDone(); finish(); } else { next(); } };

  const overlayNode = (
    // Modal DEĞİL: RN-Web Modal'ın kendi full-screen kapsayıcısı (pointer-events
    // auto) tıklamayı yutar ve box-none içerik ata elementi geçiremez. Bunun
    // yerine fixed (web) / absolute (native) bir katman; box-none ile dokunuşlar
    // formun alanlarına geçer, yalnız ipucu kartı etkileşimli kalır.
      <Animated.View
        ref={rootRef}
        pointerEvents="box-none"
        style={[
          // zIndex katmanı: masaüstünde form bir ROUTE (z~0) olduğundan turu
          // Modal tier'ının (9999) ALTINA (9000) alıyoruz → form yine kararır
          // ama sonradan açılan takvim/dropdown/picker Modal'ları (9999, body'ye
          // portal) turun ÜSTÜnde görünür (RN-Web Modal container div'i erken
          // eklendiği için eşit zIndex + DOM sırası yeterli değildi). Mobilde
          // form kendisi fullScreen Modal (9999) olduğundan turun onu örtmesi
          // için yüksek kalmalı.
          Platform.OS === 'web'
            ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: W >= 769 ? 9000 : 100000 } as any)
            : StyleSheet.absoluteFill,
          overlayStyle,
        ]}
      >

        {rect ? (
          <>
            {Platform.OS === 'web' ? (
              // Single rounded hole; boxShadow spread dims the surround.
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    borderRadius: RING_RADIUS,
                    boxShadow: `0 0 0 9999px ${DIM}`,
                  } as any,
                  holePosStyle,
                ]}
              />
            ) : (
              <>
                <Animated.View pointerEvents="none" style={topStyle} />
                <Animated.View pointerEvents="none" style={bottomStyle} />
                <Animated.View pointerEvents="none" style={leftStyle} />
                <Animated.View pointerEvents="none" style={rightStyle} />
              </>
            )}
            <Animated.View pointerEvents="none" style={haloStyle} />
            <Animated.View pointerEvents="none" style={ringStyle} />
          </>
        ) : (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />
        )}

        {/* Tooltip card */}
        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - cardH) > 2) setCardH(h);
          }}
          style={[
            styles.card,
            isMobile && styles.cardCompact,
            { left: cardLeft, top: cardTop, width: cardW },
            cardAnimStyle,
          ]}
        >
          <Text style={[styles.title, isMobile && styles.titleCompact]} numberOfLines={kbOpen ? 1 : undefined}>{step.title}</Text>
          {/* Klavye açıkken yalnız başlık + düğmeler: alanı ve klavyeyi kapatmasın */}
          {!kbOpen && <Text style={[styles.body, isMobile && styles.bodyCompact]}>{step.body}</Text>}

          {/* Progress dots */}
          {!kbOpen && <View style={[styles.dotsRow, isMobile && { marginTop: 12 }]}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === stepIndex
                    ? { backgroundColor: PRIMARY, width: 18 }
                    : { backgroundColor: '#D4D4D4' },
                ]}
              />
            ))}
          </View>}

          {/* Controls */}
          <View style={[styles.controls, isMobile && { marginTop: kbOpen ? 8 : 14 }]}>
            <Pressable onPress={onSkip} hitSlop={8} style={webCursor}>
              {({ pressed }: any) => (
                <Text style={[styles.skipText, { opacity: pressed ? 0.5 : 1 }]}>Atla</Text>
              )}
            </Pressable>

            <View style={styles.controlsRight}>
              {stepIndex > 0 && (
                <Pressable onPress={prev} hitSlop={8} style={[styles.ghostBtn, webCursor]}>
                  {({ pressed }: any) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: pressed ? 0.5 : 1 }}>
                      {rtl ? <ChevronRight size={16} color={INK} strokeWidth={2.2} />
                           : <ChevronLeft size={16} color={INK} strokeWidth={2.2} />}
                      <Text style={styles.ghostText}>Geri</Text>
                    </View>
                  )}
                </Pressable>
              )}
              <Animated.View style={ctaAnimStyle}>
                <Pressable onPress={onNext} hitSlop={8} style={[styles.pill, webCursor]}>
                  {({ pressed }: any) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.85 : 1 }}>
                      <Text style={styles.pillText}>{isLast ? 'Bitir' : 'İleri'}</Text>
                      {isLast
                        ? <Check size={16} color="#FFFFFF" strokeWidth={2.6} />
                        : rtl ? <ChevronLeft size={16} color="#FFFFFF" strokeWidth={2.6} />
                              : <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.6} />}
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
  );

  // Web: transform'lu ata elemanlar position:fixed'i bozar (fixed o ataya göre
  // konumlanır → spotlight kayar). document.body'ye portal'layarak viewport'a
  // sabitlenir. Native'de böyle bir tuzak yok, doğrudan render.
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ReactDOM = require('react-dom');
      return ReactDOM.createPortal(overlayNode, document.body);
    } catch { /* portal yoksa düz render'a düş */ }
  }
  return overlayNode;
}

const webCursor = (Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined);

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 26,
    paddingTop: 24,
    paddingBottom: 20,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 16px 40px rgba(15,23,42,0.24)' } as any)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 14 },
          elevation: 18,
        }),
  },
  cardCompact: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleCompact: {
    fontSize: 16,
  },
  bodyCompact: {
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: PRIMARY_DEEP,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(47,49,63,0.86)',
    marginTop: 9,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  controlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skipText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: 'rgba(47,49,63,0.5)',
  },
  ghostBtn: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 999,
  },
  ghostText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: INK,
  },
  pill: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
});
