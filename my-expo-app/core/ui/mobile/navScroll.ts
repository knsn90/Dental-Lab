// core/ui/mobile/navScroll.ts
// Floating navbar'ın scroll farkındalığı — TEK paylaşılan Animated.Value.
//
// Davranış: kullanıcı aşağı okurken bar geri çekilir (hafif küçülür + aşağı
// kayar + biraz saydamlaşır), yukarı kaydırınca geri açılır. HİÇBİR ZAMAN
// tamamen kaybolmaz — gezinme her an bir dokunuş uzakta kalır.
//
// Neden burada ve neden bu şekilde:
//  • Değer modül kapsamındadır ve React state'i DEĞİLDİR → scroll sırasında
//    tek bir re-render bile olmaz; animasyon transform/opacity üzerinden
//    native driver'a (web'de compositor'a) gider.
//  • Mod değişmedikçe yeni animasyon başlatılmaz (spring spam yok).
//  • Yön değişiminde biriktirici sıfırlanır → bar zıplamaz; hızlı ve yavaş
//    scroll aynı eşiklerle ama farklı hızda aynı sonucu verir.
//
// Besleme:
//  • WEB  → otomatik. `useNavScrollBridge()` window üzerinde CAPTURE fazında
//    dinler; iç içe her scroll konteyneri (RNW ScrollView = overflow'lu div)
//    tek noktadan yakalanır, ekran dosyalarına dokunmak gerekmez.
//  • NATIVE → opt-in. Uzun içerikli ekranlar `useNavScrollProps()` sonucunu
//    ScrollView/FlatList'e yayar. Beslemeyen ekranda bar açık kalır (bozulma
//    değil, yalnız hareketsiz) — bu yüzden kademeli yayılabilir.

import { useEffect, useMemo } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';

/** 0 = tamamen açık · 1 = geri çekilmiş. Yalnız transform/opacity'de kullan. */
export const navCollapse = new Animated.Value(0);

let mode: 0 | 1 = 0;
let lastY = 0;
/** Yön biriktiricisi — eşiği geçmeyen küçük oynamalar bar'ı tetiklemez. */
let acc = 0;

/** Tepeye bu kadar yakınken bar HER ZAMAN açık (bounce/overscroll dahil). */
const TOP_ZONE = 24;
const DOWN_TRIGGER = 16;
const UP_TRIGGER = 10;

/**
 * Hareketi azalt (a11y) — açıkken bar HİÇ daralmaz: en büyük hareket bu, ve
 * "azalt" diyen kullanıcı için gezinme çubuğunun oynaması rahatsız edici.
 * Web'de matchMedia, native'de AccessibilityInfo (projedeki kalıp: AlertPillX).
 */
let reduceMotion = false;
(function initReduceMotion() {
  try {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      reduceMotion = mq.matches;
      mq.addEventListener?.('change', (e: any) => {
        reduceMotion = !!e.matches;
        if (reduceMotion) { mode = 0; navCollapse.setValue(0); }
      });
    } else {
      AccessibilityInfo.isReduceMotionEnabled?.().then(v => { reduceMotion = !!v; }).catch(() => {});
      AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: any) => {
        reduceMotion = !!v;
        if (reduceMotion) { mode = 0; navCollapse.setValue(0); }
      });
    }
  } catch { /* ölçülemezse hareket açık kalır */ }
})();

function setMode(next: 0 | 1) {
  if (reduceMotion) {
    if (mode !== 0) { mode = 0; navCollapse.setValue(0); }
    return;
  }
  if (mode === next) return;
  mode = next;
  Animated.spring(navCollapse, {
    toValue: next,
    damping: 22,
    stiffness: 190,
    mass: 0.85,
    useNativeDriver: true,
  }).start();
}

/** Ham scroll ofseti bildir (px). Ucuz: çoğu çağrıda hiç iş yapmaz. */
export function reportNavScroll(y: number) {
  if (!Number.isFinite(y)) return;
  const dy = y - lastY;
  lastY = y;
  if (y <= TOP_ZONE) { acc = 0; setMode(0); return; }
  if (dy === 0) return;
  // Yön değişti → biriktiriciyi sıfırla (ani mod değişimi/zıplama olmasın)
  if ((dy > 0 && acc < 0) || (dy < 0 && acc > 0)) acc = 0;
  acc += dy;
  if (acc > DOWN_TRIGGER) { acc = 0; setMode(1); }
  else if (acc < -UP_TRIGGER) { acc = 0; setMode(0); }
}

/** Hareketi azalt tercihi — sheet gibi başka animasyonlar da buna uyar. */
export function prefersReducedMotion(): boolean {
  return reduceMotion;
}

/** Rota değişimi / ekran sıfırlaması — bar açık başlasın. */
export function resetNavScroll() {
  lastY = 0;
  acc = 0;
  setMode(0);
}

/** Ham ScrollView/FlatList onScroll olayını değere çevirir. */
function onScrollEvent(e: any) {
  const y = e?.nativeEvent?.contentOffset?.y;
  if (typeof y === 'number') reportNavScroll(y);
}

/**
 * Ekranların ScrollView/FlatList'e yayacağı props.
 *
 *   const navScroll = useNavScrollProps();
 *   <ScrollView {...navScroll} />
 *
 * Ekranın KENDİ onScroll'u varsa onu ezmemek için:
 *   <FlatList {...mergeNavScroll(myOnScroll)} />
 */
export function useNavScrollProps() {
  return useMemo(() => ({ onScroll: onScrollEvent, scrollEventThrottle: 16 }), []);
}

/** Mevcut bir onScroll ile birlikte kullan — ikisi de çağrılır. */
export function mergeNavScroll(userOnScroll?: (e: any) => void) {
  return {
    scrollEventThrottle: 16,
    onScroll: (e: any) => { onScrollEvent(e); userOnScroll?.(e); },
  };
}

/**
 * WEB köprüsü — navbar'ın kendisi çağırır, ekranlar hiçbir şey yapmaz.
 * `scroll` olayı kabarmaz (bubble etmez) ama CAPTURE fazında window'a düşer;
 * böylece hangi iç konteyner kaydırılırsa kaydırılsın tek dinleyici yeter.
 */
export function useNavScrollBridge() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onScroll = (e: any) => {
      const t = e?.target;
      // Bazı yüzeyler navbar'ı OYNATMAMALI: harita ekranındaki teslimat
      // sheet'i gibi. `dataSet={{ navscroll: 'off' }}` veren konteynerin
      // içinden gelen scroll yok sayılır (navigasyon sabit kalsın).
      try { if (t?.closest?.('[data-navscroll="off"]')) return; } catch { /* yoksay */ }
      const y = t && t !== document && typeof t.scrollTop === 'number'
        ? t.scrollTop
        : window.scrollY;
      reportNavScroll(y);
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, []);
}
