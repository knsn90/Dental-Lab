// core/ui/mobile/PillTabBar.tsx
// Floating pill bottom navigation — Apple iOS 26 "liquid glass" dilinde.
//
// Kompozisyon (değişmedi):  [ HOME · İŞLER · ONAY · ARA · DAHA ]   ( + )
// Pasif hücreler ikon-only; aktif hücre spring ile açılıp ikon + etiket
// gösterir; arkasındaki cam mercek hücreler arasında KAYAR (sıçramaz).
//
// Materyal ve geometri bu dosyada SABİT DEĞİL — tek kaynak `navGlass.ts`.
// Üç platform kolu aynı formülü paylaşır:
//   • iOS 26+  → @callstack/liquid-glass (gerçek native cam, refraksiyon)
//   • iOS/Android → expo-blur ultra-thin material + ince tül
//   • web      → backdrop-filter blur + saturate
// Scroll farkındalığı `navScroll.ts` üzerinden gelir (bkz. wrap transform).

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, Platform, Animated, TextInput, Keyboard, Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import {
  LiquidGlassView,
  LiquidGlassContainerView,
  isLiquidGlassSupported,
} from '@callstack/liquid-glass';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from '../icons';
import { Search, X, CornerDownLeft, CornerDownRight } from '../icons';
import { isRTL } from '../../i18n';
import { autoT } from '../../i18n/autoTranslate';
import { useThemeModeStore } from '../../store/themeModeStore';
import { useCommandPalette } from '../../store/commandPaletteStore';
import { useUiOverlayStore } from '../../store/uiOverlayStore';
import { NAV, NAV_BAR_H, FAB_DOME, cellHitSlop, edgeSeparation, navGlass, navIndicator, navSurfaceStyle, useReduceTransparency, type NavGlass } from './navGlass';
import { navCollapse, useNavScrollBridge, resetNavScroll } from './navScroll';
import { GlassBlurLayer } from './GlassBlurLayer';

export interface PillSearchItem {
  label: string;
  href: string;
  sublabel?: string;
}

export interface PillTabItem {
  routeName: string;
  label: string;
  icon: LucideIcon;
  /** Custom action instead of route push (modal triggers, etc.) */
  onPress?: () => void;
  /** Numeric badge */
  badgeCount?: number;
  /**
   * Bu hücre MoreMenuSheet'in çapasıdır (••• gibi): menü bu hücrenin üstünden
   * açılır ve açıkken hücre seçili görünür. 'more' routeName'i zaten çapadır;
   * etiketli hücreler (ör. teknisyen "Talepler") için bu bayrak kullanılır.
   */
  menuAnchor?: boolean;
}

const isMenuAnchor = (it: PillTabItem) => it.routeName === 'more' || !!it.menuAnchor;

interface Props {
  items: PillTabItem[];
  baseRoute: string;
  accentColor?: string;
  /**
   * Optional separate FAB rendered to the right of the pill (asymmetric layout).
   * When provided, the pill stays narrow and the fabItem becomes a prominent
   * accent-filled circle next to the pill — Apple-style action-first pattern.
   */
  fabItem?: PillTabItem;
  /**
   * Eğer verilirse: routeName === 'search' olan tab'a basınca navbar yerinde
   * bir arama çubuğuna dönüşür (sayfa/menü araması). Sonuçlar bar'ın üstünde açılır.
   */
  searchItems?: PillSearchItem[];
  onSearchNavigate?: (href: string) => void;
  /**
   * OPTIONAL — onboarding tour target hook. Returns a ref-callback for a given
   * routeName (pill cell or fabItem) so the coach-mark overlay can spotlight it.
   * Only the doctor layout passes this; other panels leave it undefined → no-op.
   */
  getItemRef?: (routeName: string) => ((node: any) => void) | undefined;
}

// iOS 26+ native liquid glass available? (via @callstack/liquid-glass)
const LIQUID_GLASS = Platform.OS === 'ios' && !!isLiquidGlassSupported;

/**
 * Aktif mercek en az bu kadar geniş olur. Bar 60pt ve mercek 7pt içeriden
 * oturduğu için yüksekliği 46: etiketsiz hücrede (••• gibi) mercek TAM DAİRE
 * olsun diye alt sınır da 46.
 */
const INDICATOR_MIN = 46;

/** Sayı rozetinin yatay konumu — `end:` inline stili bu projede güvenilir değil. */
const badgeSideStyle = () => (isRTL() ? { left: -7 } : { right: -7 });

/**
 * TopLight — üstten gelen ışık (cam kabarcık hissi).
 *   web    → tek CSS linear-gradient: gerçek yumuşak geçiş, ekstra View yok
 *   native → gradient paketi YOK, o yüzden azalan opaklıkta ÜÇ bant
 *
 * Neden üç bant: tek bir "yarım yüzey" katmanı %50'de SERT bir çizgi bırakıyor
 * ve daireyi/pill'i iki tonlu gösteriyordu (ilk denemede FAB tam ortadan
 * bölünmüş görünüyordu). Üç kademe, kenarı gözle görülmez hâle getiriyor.
 * pointerEvents none: dokunma her zaman altındaki hücreye gider.
 */
const BANDS: Array<[string, number]> = [['22%', 1], ['38%', 0.6], ['56%', 0.3]];

function TopLight({ webGradient, tint, radius = NAV.radius }: { webGradient: string; tint: string; radius?: number }) {
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { borderRadius: radius, backgroundImage: webGradient } as any]}
      />
    );
  }
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { borderRadius: radius, overflow: 'hidden' }]}>
      {BANDS.map(([h, o]) => (
        <View key={h} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h as any, backgroundColor: tint, opacity: o }} />
      ))}
    </View>
  );
}

/** Bar yüzeyi: üst ışık + üst kenar hairline (cam kenarı). */
function Specular({ g, radius = NAV.radius }: { g: NavGlass; radius?: number }) {
  return (
    <>
      <TopLight webGradient={g.webSpecular} tint={g.specularWash} radius={radius} />
      {Platform.OS !== 'web' && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius, overflow: 'hidden' }]}
        >
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: g.specularTop }} />
        </View>
      )}
    </>
  );
}

export function PillTabBar({ items, baseRoute, accentColor, fabItem, searchItems, onSearchNavigate, getItemRef }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const dark     = useThemeModeStore(s => s.resolvedDark);
  const rtl      = isRTL();
  // "Enter" köşe oku yön bildirir → RTL'de aynalanır
  const EnterIcon = rtl ? CornerDownRight : CornerDownLeft;

  // ─── Search-morph durumu ───────────────────────────────────────────────
  const searchEnabled = !!searchItems && !!onSearchNavigate;
  const [searchActive, setSearchActive] = useState(false);
  const [query, setQuery] = useState('');
  const searchAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  // Klavye yüksekliği — arama açıkken navbar'ı klavyenin üstüne kaydır
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e: any) => setKbHeight(e?.endCoordinates?.height ?? 0));
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { s.remove(); h.remove(); };
  }, []);

  const openSearch = () => {
    setSearchActive(true);
    Animated.spring(searchAnim, { toValue: 1, damping: 20, stiffness: 220, mass: 0.9, useNativeDriver: true }).start();
    setTimeout(() => inputRef.current?.focus(), 60);
  };
  const closeSearch = () => {
    inputRef.current?.blur();
    Animated.timing(searchAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setSearchActive(false);
      setQuery('');
    });
  };
  const filteredSearch = useMemo(() => {
    if (!searchItems) return [];
    const q = query.trim().toLowerCase();
    if (!q) return searchItems;
    return searchItems.filter(it =>
      it.label.toLowerCase().includes(q) || (it.sublabel ?? '').toLowerCase().includes(q),
    );
  }, [searchItems, query]);

  // Menü açıkken ••• SEÇİLİ görünür: menü oradan açıldı ama rota değişmedi,
  // dolayısıyla pathname'den anlaşılamaz. Kayan mercek de oraya kayar.
  const moreMenuOpen = useUiOverlayStore(st => st.moreMenuOpen);

  const activeIdx = (() => {
    if (moreMenuOpen) {
      const mi = items.findIndex(isMenuAnchor);
      if (mi >= 0) return mi;
    }
    // Grup segmentleri ('/(admin)') URL'de GÖRÜNMEZ: panel kökünde usePathname
    // '/' döndürürken baseRoute '/(admin)' geliyordu → eşitlik hiç tutmuyor,
    // hiçbir sekme eşleşmiyor ve fallback "Daha"yı aktif gösteriyordu
    // (Özet'te bile ••• seçili duruyordu). İki tarafı da normalize et.
    const norm = (p: string) => (p ?? '').replace(/\/\([^)]*\)/g, '').replace(/\/+$/, '');
    const path = norm(pathname);
    const base = norm(baseRoute);
    if (path === base) {
      const idx = items.findIndex(it => it.routeName === 'index');
      return idx >= 0 ? idx : 0;
    }
    for (let i = 0; i < items.length; i++) {
      if (items[i].onPress) continue;
      const seg = items[i].routeName;
      if (seg === 'index') continue;
      if (pathname.includes('/' + seg)) return i;
    }
    // Sipariş detayı top-level rota (/order/[id]) — "Siparişler" listesinin bir
    // alt sayfası; o sekme aktif kalmalı. ('/orders' loop'ta zaten eşleşir.)
    if (/(^|\/)order(\/|$)/.test(pathname)) {
      const ordersIdx = items.findIndex(it => it.routeName === 'orders' || it.routeName === 'all-orders');
      if (ordersIdx >= 0) return ordersIdx;
    }
    // Bilinen sekme eşleşmedi (ör. ayarlar/profil — "Daha" arkasındaki sayfalar)
    // → "Daha (...)" sekmesini aktif göster; yoksa fallback 0
    const moreIdx = items.findIndex(it => it.routeName === 'more');
    return moreIdx >= 0 ? moreIdx : 0;
  })();

  // "Daha (•••)" hücresinin ekran-uzayı merkezi — "Tüm Menü" popover'ı buradan
  // yukarı açılır ve kuyruğunu bu x'e hizalar. Hücre genişliği sekme sayısına
  // göre değiştiği için (space-evenly) sabit hesap yetmiyor, ÖLÇÜYORUZ.
  const moreNode = useRef<any>(null);
  const setMoreAnchorX = useUiOverlayStore(st => st.setMoreAnchorX);
  const publishMoreAnchor = React.useCallback(() => {
    const node = moreNode.current;
    if (!node?.measureInWindow) return;
    try {
      node.measureInWindow((x: number, _y: number, w: number) => {
        if (typeof x === 'number' && w > 0) setMoreAnchorX(x + w / 2);
      });
    } catch { /* ölçülemezse menü varsayılan konumu kullanır */ }
  }, [setMoreAnchorX]);

  const handle = (item: PillTabItem) => {
    // Search tab → navbar'ı arama çubuğuna dönüştür (prop verildiyse)
    if (item.routeName === 'search' && searchEnabled) { openSearch(); return; }
    // Menü açılmadan HEMEN ÖNCE ölç: bar scroll ile geri çekilmiş olabilir,
    // kuyruk yine •••'nin tam altına düşsün.
    if (isMenuAnchor(item)) publishMoreAnchor();
    if (item.onPress) { item.onPress(); return; }
    if (item.routeName === 'index') router.push(baseRoute as any);
    else router.push(`${baseRoute}/${item.routeName}` as any);
  };

  // Home indicator ile bar arasında nefes — bar ekranın altına YAPIŞMAZ.
  const bottomOffset = Math.max(insets.bottom, 8) + 8;
  const accent = accentColor ?? '#32BB78';
  // İnce materyal (küçük, etkileşimli chrome). Erişilebilirlikte saydamlık
  // kapalıysa opak yüzeye düşer.
  const solidGlass = useReduceTransparency();
  const glass = navGlass(dark, 'thin', solidGlass);
  const ind = navIndicator(dark, accent);

  // Scroll farkındalığı — web'de tek capture dinleyicisi tüm ekranları kapsar;
  // native'de ekranlar `useNavScrollProps()` ile besler (bkz. navScroll.ts).
  useNavScrollBridge();
  // Rota değişince bar açık başlar (yeni sayfa tepeden açılıyor).
  useEffect(() => { resetNavScroll(); }, [pathname]);

  // ─── WhatsApp-style sliding indicator pill ─────────────────────────────
  // Her hücrenin layout'u (x + width) ölçülür; aktif hücre değişince tek bir
  // shared pill spring ile yeni hücrenin x/width'ine kayar.
  const [cellRects, setCellRects] = React.useState<Array<{ x: number; w: number } | null>>(
    () => items.map(() => null),
  );
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const rect = cellRects[activeIdx];
    if (!rect) return;
    // Gösterge hücrenin MERKEZİNE çapalanır. Eskiden sol kenardan başlayıp
    // stilde minWidth ile genişletiliyordu; etiketsiz "•••" hücresi 38pt
    // olduğu için daire 8pt sağa taşıyor ve noktalar merkezden kayıyordu.
    const w = Math.max(rect.w, INDICATOR_MIN);
    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: rect.x + rect.w / 2 - w / 2, damping: 18, stiffness: 220, mass: 0.9,
        useNativeDriver: false,
      }),
      Animated.spring(indicatorW, {
        toValue: w, damping: 18, stiffness: 220, mass: 0.9,
        useNativeDriver: false,
      }),
      Animated.timing(indicatorOpacity, {
        toValue: 1, duration: 160, useNativeDriver: false,
      }),
    ]).start();
  }, [activeIdx, cellRects, indicatorX, indicatorW, indicatorOpacity]);

  /**
   * Hücre DOM/host düğümleri — mercek konumunu ölçmek için.
   *
   * NEDEN gerekli (web-only hata): react-native-web'de `onLayout`
   * ResizeObserver ile uygulanıyor → eleman YER DEĞİŞTİRDİĞİNDE tetiklenmiyor,
   * yalnız BOYUTU değişince. Aktif etiket açılıp kapandığında (space-evenly)
   * diğer hücreler kayar ama boyutları aynı kalır; onLayout hiç gelmez ve
   * önbellekteki x bayatlar. Ölçülen sonuç: ••• hücresi 259.5'te, mercek
   * 275'te — 15.5px sağda. Bu yüzden web'de konumu doğrudan `offsetLeft`
   * ile okuyoruz (RNW View'ları `position:relative` olduğu için offsetParent
   * bar'ın kendisi; `left:` ile AYNI referans).
   */
  const cellEls = useRef<any[]>([]);
  const remeasureCells = React.useCallback(() => {
    if (Platform.OS !== 'web') return;
    setCellRects(prev => {
      const next = prev.slice();
      let changed = false;
      for (let i = 0; i < cellEls.current.length; i++) {
        const el = cellEls.current[i];
        if (!el || typeof el.offsetLeft !== 'number' || !el.offsetWidth) continue;
        const x = el.offsetLeft;
        const w = el.offsetWidth;
        const cur = next[i];
        if (!cur || Math.abs(cur.x - x) > 0.5 || Math.abs(cur.w - w) > 0.5) {
          next[i] = { x, w };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const handleCellLayout = (idx: number) => (e: any) => {
    // Web: olayın koordinatı bayat olabilir → tüm hücreleri birlikte oku.
    // (Aktif hücrenin etiketi her karede yeniden boyutlanır, bu yüzden bu
    // geri çağrı animasyon boyunca tetiklenir ve senkron kalır.)
    if (Platform.OS === 'web') { remeasureCells(); return; }
    const { x, width } = e.nativeEvent.layout;
    setCellRects(prev => {
      const cur = prev[idx];
      if (cur && Math.abs(cur.x - x) < 0.5 && Math.abs(cur.w - width) < 0.5) return prev;
      const next = prev.slice();
      next[idx] = { x, w: width };
      return next;
    });
  };

  // Aktif sekme değişti → etiket açılma/kapanma animasyonu bitene kadar
  // güvenlik ağı olarak birkaç kez daha ölç (ResizeObserver kaçırırsa).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const ids = [0, 60, 180, 360, 560].map(ms => setTimeout(remeasureCells, ms));
    return () => ids.forEach(clearTimeout);
  }, [activeIdx, items.length, remeasureCells]);

  // Aktif sekme göstergesi — TEK katman: accent tint + ince kenar.
  //
  // Bilinçli olarak İKİNCİ bir cam/materyal DEĞİL (iOS 26'da da LiquidGlassView
  // kullanılmıyordu artık): sheet camı + bar camı + öğe camı üst üste
  // gelince yüzeyler bulanık bir çorbaya dönüşüyor, ikonların netliği
  // düşüyor ve her katman ayrıca GPU yakıyor. Cam işini BAR yapar; seçili öğe
  // yalnız "burada duruyorsun" der.
  const slidingIndicator = (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 7, bottom: 7,
        left: indicatorX,
        // Genişlik + konum effect'te birlikte hesaplanıyor (hücre merkezine
        // hizalı, en az 46 → etiketsiz hücrede tam daire). Burada minWidth
        // VERİLMEZ: verilirse konum hesabıyla çelişip ikonu kaydırır.
        width: indicatorW,
        opacity: indicatorOpacity,
        borderRadius: NAV.radius,
        backgroundColor: ind.fill,
        borderWidth: 1,
        borderColor: ind.border,
      }}
    />
  );

  const cells = items.map((item, i) => {
    const tourRef = getItemRef?.(item.routeName);
    // "Daha" hücresinde İKİ ref birlikte: onboarding spotlight'ı (varsa) ve
    // popover çapası. Biri diğerini ezmemeli.
    const cellRef = (node: any) => {
      cellEls.current[i] = node;
      if (isMenuAnchor(item)) moreNode.current = node;
      tourRef?.(node);
    };
    return (
      <PillCell
        key={item.routeName + i}
        item={item}
        active={i === activeIdx}
        accentColor={accent}
        dark={dark}
        onPress={() => handle(item)}
        onLayout={(e: any) => {
          handleCellLayout(i)(e);
          if (isMenuAnchor(item)) publishMoreAnchor();
        }}
        itemRef={cellRef}
      />
    );
  });

  // ─── Search-morph: bar içeriği aktifken arama satırına dönüşür ───────────
  const searchRow = (
    <Animated.View style={[s.searchRow, { opacity: searchAnim }]}>
      <Search size={18} color={dark ? 'rgba(247,242,233,0.6)' : 'rgba(20,16,12,0.5)'} strokeWidth={2} />
      <TextInput
        ref={inputRef}
        value={query}
        onChangeText={setQuery}
        placeholder={autoT('Sayfa ara…')}
        placeholderTextColor={dark ? 'rgba(247,242,233,0.4)' : 'rgba(20,16,12,0.4)'}
        style={[s.searchInput, { color: dark ? '#F7F2E9' : '#0E0E0E', textAlign: rtl ? 'right' : undefined }]}
        returnKeyType="search"
        autoCorrect={false}
        onSubmitEditing={() => {
          const first = filteredSearch[0];
          if (first) { onSearchNavigate?.(first.href); closeSearch(); }
        }}
      />
      <Pressable onPress={closeSearch} hitSlop={8} style={[s.searchClose, { backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(20,16,12,0.06)' }]}>
        <X size={16} color={dark ? 'rgba(247,242,233,0.7)' : 'rgba(20,16,12,0.6)'} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );

  const barInner = searchActive ? searchRow : (<>{slidingIndicator}{cells}</>);

  // Sonuç listesi — bar'ın üstünde açılır
  const resultsOverlay = searchActive ? (
    <Animated.View
      style={[
        s.resultsCard,
        {
          opacity: searchAnim,
          transform: [{ translateY: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          backgroundColor: dark ? '#1B1916' : '#FFFFFF',
          borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.06)',
        },
      ]}
    >
      {filteredSearch.length === 0 ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12.5, color: dark ? 'rgba(247,242,233,0.5)' : 'rgba(20,16,12,0.45)' }}>
            {autoT('Eşleşen sayfa yok')}
          </Text>
        </View>
      ) : (
        filteredSearch.slice(0, 6).map((it) => (
          <Pressable
            key={it.href}
            onPress={() => { onSearchNavigate?.(it.href); closeSearch(); }}
            style={s.resultRow}
          >
            <View style={[s.resultIcon, { backgroundColor: `${accent}1A` }]}>
              <EnterIcon size={14} color={accent} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: dark ? '#F7F2E9' : '#0E0E0E' }} numberOfLines={1}>
                {it.label}
              </Text>
              {!!it.sublabel && (
                <Text style={{ fontSize: 11.5, color: dark ? 'rgba(247,242,233,0.5)' : 'rgba(20,16,12,0.45)', marginTop: 1 }} numberOfLines={1}>
                  {it.sublabel}
                </Text>
              )}
            </View>
          </Pressable>
        ))
      )}
    </Animated.View>
  ) : null;

  // Bar content — either GlassView, BlurView, or plain web fallback
  // Genişlik yönetimi:
  //  • arama açık        → tam genişliğe uzar (arama input'u için)
  //  • FAB'lı panel      → flex:1 ile FAB'dan kalan alana sığar (aktif label
  //                        açılınca ekranı TAŞMAZ; ikonlar içeride ortalanır)
  //  • FAB'sız panel     → içeriğe göre daralır (kompakt, sıkı grup)
  const barFlex: any = searchActive
    ? { alignSelf: 'stretch' }
    // FAB'lı panel: sabit gap taşmaya yol açıyor (aktif label + FAB dar alanda).
    // flex:1 + space-evenly → hücreler kalan alana EŞİT dağılır, kenara taşmaz.
    : (fabItem ? { flex: 1, justifyContent: 'space-evenly', gap: 0 } : null);
  const barContent =
    LIQUID_GLASS ? (
      // iOS 26+ — gerçek liquid glass: arkadaki içerik materyalin içinde
      // kırılır. `clear` + hafif nötr tül: yüzey okunur ama opak değil.
      <LiquidGlassView
        effect="clear"
        colorScheme={dark ? 'dark' : 'light'}
        interactive
        tintColor={glass.liquidTint}
        style={[s.bar, barFlex, glass.nativeShadow, { overflow: 'visible' }]}
      >
        <Specular g={glass} />
        {barInner}
      </LiquidGlassView>
    ) : Platform.OS === 'ios' || Platform.OS === 'android' ? (
      // iOS < 26 / Android — ultra-thin material + okunabilirliğin izin
      // verdiği EN AZ tül. (Eskiden %86 beyaz tüldü: cam değil, beyaz pill.)
      <BlurView
        intensity={glass.blurIntensity}
        tint={glass.blurTint}
        style={[s.bar, barFlex, glass.nativeShadow]}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.veil }]} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
          borderRadius: NAV.radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: glass.border,
        }]} />
        <Specular g={glass} />
        {barInner}
      </BlurView>
    ) : (
      // web — iki katmanlı cam: ebeveyn refraksiyon (mercek), çocuk blur+renk
      <View style={[s.bar, barFlex, navSurfaceStyle(glass)]}>
        <GlassBlurLayer glass={glass} radius={NAV.radius} />
        <Specular g={glass} />
        {barInner}
      </View>
    );

  // Layout — pill bar + side FAB, single row.
  // (Search moved to TopActionBar in top-right of the screen.)
  //   ┌─────────────────────────────────────┐
  //   │  [ Pill bar          ]  [  FAB   ]  │
  //   └─────────────────────────────────────┘
  // Arama aktifken FAB gizlenir → bar tüm genişliği arama çubuğuna verir.
  const content = (fabItem && !searchActive) ? (
    <View style={s.asymRow}>
      {barContent}
      <FabButton item={fabItem} accentColor={accent} itemRef={getItemRef?.(fabItem.routeName)} />
    </View>
  ) : (
    barContent
  );

  // Arama açık + klavye varsa → navbar'ı klavyenin hemen üstüne taşı
  const wrapBottom = searchActive && kbHeight > 0
    ? kbHeight + 8
    : bottomOffset;

  // Scroll-aware geri çekilme — YALNIZ transform + opacity: animasyon
  // compositor/native driver'da koşar, scroll sırasında tek re-render yok.
  // Arama açıkken kilitli (bar klavyenin üstüne taşınmışken küçülmemeli).
  const collapseStyle = searchActive
    ? null
    : {
        // Ölçek alt kenardan büyür/küçülür → bar "aşağı çekiliyor" gibi
        // okunur, ortadan büzülmüş gibi değil.
        transformOrigin: 'center bottom',
        opacity: navCollapse.interpolate({ inputRange: [0, 1], outputRange: [1, NAV.collapse.opacity] }),
        transform: [
          { translateY: navCollapse.interpolate({ inputRange: [0, 1], outputRange: [0, NAV.collapse.translateY] }) },
          { scale: navCollapse.interpolate({ inputRange: [0, 1], outputRange: [1, NAV.collapse.scale] }) },
        ],
      };

  // Ayrım bölgesi — içerik yüzen chrome'a değdiği yerde geri çekilir
  // (Apple'ın scroll-edge effect ilkesi). Koyu katman/ağır gradyan YOK:
  // maske şeridi yukarı doğru tamamen kaybolur. Yalnız web (native'de
  // backdrop-filter yok).
  const edge = edgeSeparation(dark);

  return (
    <>
    {/* Navbar üstünde biten katman (Mesajlar) açıkken barın ARKASINDAKİ şeridi
        aynı tonla karart — katmanın karartması bar üst kenarında kesilmesin. */}
    <NavDimStrip height={bottomOffset + NAV_BAR_H} />
    <Animated.View pointerEvents="box-none" style={[s.wrap, { bottom: wrapBottom }, collapseStyle as any]}>
      {edge && !searchActive ? (
        <View
          pointerEvents="none"
          // 16px: barın üstünde kalan boşluğa sığar. Daha uzunu, üstteki
          // yüzeyin (kurye sheet'i) yuvarlak alt köşesini bulandırıyordu.
          style={[{ position: 'absolute', left: 0, right: 0, bottom: '100%' as any, height: 16 }, edge]}
        />
      ) : null}
      {resultsOverlay}
      {content}
    </Animated.View>
    </>
  );
}

// ─── Navbar arkası karartma şeridi ──────────────────────────────────────────
// MessagesPopup'ın backdrop'ıyla BİREBİR: aynı renk, web'de aynı blur, aynı
// açılış/kapanış süresi → iki karartma bar üst kenarında dikişsiz birleşir.
const DIM_COLOR = 'rgba(10,14,26,0.52)';
function NavDimStrip({ height }: { height: number }) {
  const close = useUiOverlayStore(st => st.navDimClose);
  const on = !!close;
  const anim = useRef(new Animated.Value(0)).current;
  const [render, setRender] = useState(on);
  useEffect(() => {
    if (on) {
      setRender(true);
      Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: Platform.OS !== 'web' }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: Platform.OS !== 'web' })
        .start(({ finished }) => { if (finished) setRender(false); });
    }
  }, [on, anim]);
  if (!render) return null;
  return (
    <Animated.View
      pointerEvents={on ? 'auto' : 'none'}
      style={[{
        position: 'absolute', left: 0, right: 0, bottom: 0, height,
        backgroundColor: DIM_COLOR, opacity: anim,
      }, Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any) : null]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={() => close?.()} accessibilityLabel={autoT('Kapat')} />
    </Animated.View>
  );
}

// ─── Search button — liquid-glass circle above the FAB ─────────────────────
// iOS 26+: native GlassView (gerçek liquid glass)
// iOS/Android: BlurView (frosted glass)
// Web: backdrop-filter blur
function SearchAboveFab({ accentColor }: { accentColor?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const onPress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 11, stiffness: 280, useNativeDriver: true }),
    ]).start();
    try { useCommandPalette.getState().openPalette(); } catch { /* noop */ }
  };

  const iconColor = isDark ? '#F7F2E9' : '#0E0E0E';
  const accentBorder = accentColor
    ? (isDark ? `${accentColor}55` : `${accentColor}66`)
    : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)');
  const shadowStyle = Platform.OS === 'web'
    ? ({
        boxShadow: isDark
          ? '0 10px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)'
          : '0 10px 24px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
      } as any)
    : {
        shadowColor: '#000',
        shadowOpacity: isDark ? 0.4 : 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      };

  // ─ iOS 26+ native liquid glass
  if (LIQUID_GLASS) {
    // Apply an explicit neutral tintColor on the glass material itself —
    // this overrides background-pixel refraction so the disc reads as the
    // same neutral white as the pill bar (which is over the cream page bg).
    return (
      <Pressable onPress={onPress} hitSlop={8}>
        <Animated.View style={[s.searchAbove, shadowStyle, {
          transform: [{ scale }],
          backgroundColor: 'transparent',
          borderWidth: 0,
          overflow: 'hidden',
        }]}>
          <LiquidGlassView
            effect="regular"
            colorScheme={isDark ? 'dark' : 'light'}
            interactive
            // Half-translucent neutral tint — same airy glass feel as the
            // top action buttons (QR / Bell / Profile).
            tintColor={isDark ? 'rgba(27,25,22,0.55)' : 'rgba(255,255,255,0.55)'}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 28 }]}
          />
          <Search size={22} color={iconColor} strokeWidth={2} />
        </Animated.View>
      </Pressable>
    );
  }

  // ─ iOS < 26 + Android: BlurView frosted glass
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return (
      <Pressable onPress={onPress} hitSlop={8}>
        <Animated.View style={[s.searchAbove, shadowStyle, {
          transform: [{ scale }],
          backgroundColor: 'transparent',
          borderWidth: 0,
          overflow: 'hidden',
        }]}>
          <BlurView
            intensity={isDark ? 55 : 45}
            tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Tint overlay — yumuşatılmış, blur'a alan bırakıyor */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
            backgroundColor: isDark ? 'rgba(10,10,10,0.42)' : 'rgba(255,255,255,0.32)',
          }]} />
          {/* Accent-tinted border (panel'e bağ) */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
            borderRadius: 999,
            borderWidth: 1,
            borderColor: accentBorder,
          }]} />
          <Search size={20} color={iconColor} strokeWidth={2} />
        </Animated.View>
      </Pressable>
    );
  }

  // ─ Web fallback
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Animated.View style={[s.searchAbove, shadowStyle, {
        transform: [{ scale }],
        backgroundColor: isDark ? 'rgba(20,16,12,0.55)' : 'rgba(255,255,255,0.55)',
        borderColor: accentBorder,
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
      } as any]}>
        <Search size={20} color={iconColor} strokeWidth={2} />
      </Animated.View>
    </Pressable>
  );
}

// ─── Side FAB — separate accent-filled circle next to the pill ──────────────
function FabButton({ item, accentColor, itemRef }: { item: PillTabItem; accentColor: string; itemRef?: (node: any) => void }) {
  // Tek değer → scale + opacity: fiziksel basma hissi, iki ayrı animasyon yok.
  const pressAnim = useRef(new Animated.Value(0)).current;
  const Icon  = item.icon;
  const badgeSide = badgeSideStyle();
  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, NAV.press.fab] });
  const opacity = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  const a11yLabel = item.badgeCount && item.badgeCount > 0
    ? `${item.label}, ${item.badgeCount}`
    : item.label;

  // Basıldığı an hızla çöker, bırakılınca spring ile geri gelir (Apple hissi:
  // hızlı, kısa, fiziksel — abartılı zıplama değil).
  const down = () => Animated.spring(pressAnim, { toValue: 1, damping: 26, stiffness: 520, mass: 0.6, useNativeDriver: true }).start();
  const up   = () => Animated.spring(pressAnim, { toValue: 0, damping: 15, stiffness: 320, mass: 0.7, useNativeDriver: true }).start();

  const handle = () => {
    if (item.onPress) item.onPress();
  };

  // iOS 26+: tinted liquid-glass FAB — accent emerges through the glass material.
  // Note: keep shadow neutral (black, low opacity) — saffron shadow would bleed
  // onto nearby glass surfaces (search button) via screen-pixel refraction.
  if (LIQUID_GLASS) {
    return (
      <Pressable
        ref={itemRef} onPress={handle} hitSlop={6}
        onPressIn={down} onPressOut={up}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        <Animated.View
          style={[
            s.fab,
            {
              transform: [{ scale }],
              opacity,
              // Gölge NÖTR kalır: accent renkli gölge, yandaki cam yüzeylere
              // ekran-pikseli kırılmasıyla sızıp onları renklendiriyor.
              shadowColor: '#000',
              shadowOpacity: 0.20,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              overflow: 'hidden',
            },
          ]}
        >
          <LiquidGlassView
            effect="regular"
            tintColor={accentColor}
            interactive
            style={[StyleSheet.absoluteFillObject, { borderRadius: NAV.fab / 2 }]}
          />
          <Icon size={NAV.fabIcon} color="#FFFFFF" strokeWidth={2.4} />
          {!!item.badgeCount && item.badgeCount > 0 && (
            <View style={[s.countBadge, badgeSide, { borderColor: accentColor }]}>
              <Text style={s.countBadgeText}>
                {item.badgeCount > 99 ? '99+' : String(item.badgeCount)}
              </Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      ref={itemRef} onPress={handle} hitSlop={6}
      onPressIn={down} onPressOut={up}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      <Animated.View
        style={[
          s.fab,
          { backgroundColor: accentColor, transform: [{ scale }], opacity, overflow: 'hidden' },
          Platform.OS === 'web'
            ? ({
                // Accent'li ama YUMUŞAK: geniş yayılım + düşük opaklık, üstüne
                // nötr bir derinlik gölgesi. Barla aynı ışık ailesinden.
                boxShadow: `0 12px 30px -8px ${accentColor}70, 0 4px 12px -4px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.28)`,
              } as any)
            : {
                shadowColor: accentColor,
                shadowOpacity: 0.42,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 12,
              },
        ]}
      >
        {/* Kubbe ışığı — dolu daire "düz mavi disk" değil, ışık alan bir kubbe
            gibi okunur; barın cam diliyle aynı ışık ailesinden. */}
        <TopLight webGradient={FAB_DOME} tint="rgba(255,255,255,0.10)" radius={NAV.fab / 2} />
        <Icon size={NAV.fabIcon} color="#FFFFFF" strokeWidth={2.4} />
        {!!item.badgeCount && item.badgeCount > 0 && (
          <View style={[s.countBadge, badgeSide, { borderColor: accentColor }]}>
            <Text style={s.countBadgeText}>
              {item.badgeCount > 99 ? '99+' : String(item.badgeCount)}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Single cell — collapses to icon-only or expands to icon+label pill ──────
function PillCell({
  item, active, accentColor, dark, onPress, onLayout, itemRef,
}: {
  item: PillTabItem;
  active: boolean;
  accentColor: string;
  dark: boolean;
  onPress: () => void;
  onLayout?: (e: any) => void;
  itemRef?: (node: any) => void;
}) {
  const Icon  = item.icon;
  // Basma fiziği tek değerden (scale + opacity) — native driver.
  const pressAnim = useRef(new Animated.Value(0)).current;
  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, NAV.press.cell] });
  const pressOpacity = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] });
  const expand = useRef(new Animated.Value(active ? 1 : 0)).current;
  const rtl = isRTL();
  const badgeSide = badgeSideStyle();

  useEffect(() => {
    Animated.spring(expand, {
      toValue: active ? 1 : 0,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: false, // maxWidth / margin animations require JS driver
    }).start();
  }, [active, expand]);

  const down = () => Animated.spring(pressAnim, { toValue: 1, damping: 26, stiffness: 520, mass: 0.6, useNativeDriver: true }).start();
  const up   = () => Animated.spring(pressAnim, { toValue: 0, damping: 15, stiffness: 320, mass: 0.7, useNativeDriver: true }).start();

  // Inactive tints
  // Cam üzerinde alfa'lı gri "solgun" okunuyor: yarı saydam yüzeyde metin/ikon
  // DAHA yüksek kontrast ister (apple-design §12 vibrancy). Alfa yerine net ink.
  const inactiveTint = dark ? '#EFE9DF' : '#26262A';

  // Interpolations from `expand` (0 → 1)
  const labelOpacity = expand.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, 0, 1],
  });
  const labelMaxWidth = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 80],
  });
  const labelMarginLeft = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });

  // Rozet sayısı etikete katılır: ekran okuyucu "Siparişler, 3" duyurur.
  const a11yLabel = item.badgeCount && item.badgeCount > 0
    ? `${item.label}, ${item.badgeCount}`
    : item.label;

  return (
    <Pressable
      ref={itemRef}
      onPress={onPress}
      onPressIn={down}
      onPressOut={up}
      // Hücre görsel olarak 38 geniş (6 sekmeli panelde bar taşmasın); eksik
      // pay hitSlop ile 44pt dokunma hedefine tamamlanır.
      hitSlop={cellHitSlop}
      style={s.cellPressable}
      onLayout={onLayout}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      // RNW bu sürümde accessibilityState.selected'ı DOM'a yazmıyor (ölçüldü:
      // aria-selected null geliyordu) → web'de ARIA'yı doğrudan ver, yoksa
      // ekran okuyucu hangi sekmede olduğunu söylemiyor.
      {...(Platform.OS === 'web' ? ({ 'aria-selected': active } as any) : null)}
      accessibilityLabel={a11yLabel}
    >
      <Animated.View style={[s.cellInner, { transform: [{ scale }], opacity: pressOpacity }]}>
        {/* NOTE: Pill background artık parent'taki shared sliding indicator
            tarafından çiziliyor (WhatsApp-style smooth motion). */}

        <View style={s.iconWrap}>
          <Icon
            size={NAV.icon}
            color={active ? accentColor : inactiveTint}
            // Aktif ikon bir tık daha belirgin; ikonlar KALIN değil (Apple dili)
            strokeWidth={active ? 2.1 : 1.8}
          />
          {!!item.badgeCount && item.badgeCount > 0 && (
            <View style={[s.countBadge, badgeSide, { borderColor: dark ? '#0A0A0A' : '#FFFFFF' }]}>
              <Text style={s.countBadgeText}>
                {item.badgeCount > 99 ? '99+' : String(item.badgeCount)}
              </Text>
            </View>
          )}
        </View>

        {/* Expanding label slot — "more" sekmesinde yazı yok (sadece ••• ikon) */}
        {item.routeName !== 'more' && (
          <Animated.View
            style={{
              maxWidth: labelMaxWidth,
              // Animated logical margin yerine açık yön — RTL'de etiket ikona yapışmasın
              ...(rtl ? { marginRight: labelMarginLeft } : { marginLeft: labelMarginLeft }),
              opacity: labelOpacity,
              overflow: 'hidden',
            }}
          >
            <Text
              style={[s.label, { color: accentColor }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    start: 0,
    end: 0,
    paddingHorizontal: NAV.wrapPadH,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    // Apple-grouping (proximity): ikonlar geniş space-between ile dağıtılmak
    // yerine sıkı bir grup halinde ortalanır; bar içeriğe göre daralır (kompakt pill).
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 12,
    // 8 + 44 (hücre) + 8 = 60pt bar — kapsül yarıçapı yüksekliğin yarısı.
    paddingVertical: NAV.barPadV,
    paddingHorizontal: NAV.barPadH + 2,
    borderRadius: NAV.radius,
    maxWidth: NAV.barMaxW,
    overflow: 'hidden',
    // Gölge platforma göre navGlass'tan gelir (koyu/açık farklı) — burada
    // sabit gölge YOK, yoksa iki gölge üst üste biner.
  },

  // ─── Search-morph: bar içi arama satırı + sonuç kartı ───
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
  },
  searchClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
    paddingVertical: 6,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 32px rgba(15,23,42,0.18)' } as any
      : {
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
          elevation: 18,
        }),
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  resultIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bottom row — pill flex + FAB on same baseline
  asymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: NAV.rowGap,
    width: '100%',
    // Tablet/geniş ekranda küme ortada ve kompakt kalır — kenardan kenara
    // yayılan bir footer'a dönüşmez.
    maxWidth: NAV.barMaxW + NAV.rowGap + NAV.fab,
    alignSelf: 'center',
  },

  // FAB column — search button above, FAB below (legacy, unused with new layout)
  fabStack: {
    alignItems: 'center',
    gap: 8,
  },

  // Yan FAB — bardan (60) bir tık büyük daire: ana aksiyon hiyerarşisi
  fab: {
    width: NAV.fab,
    height: NAV.fab,
    borderRadius: NAV.fab / 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  // Search button — 56px equal to FAB, neutral liquid-glass disc
  searchAbove: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Each cell is a touch surface (Pressable) wrapping the layout View
  cellPressable: {
    // no flex — cells take only space their content needs
  },

  cellInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Yatay ölçüler DARALTILMIŞ kalır (12→8 / 44→38): 6 sekmeli panelde aktif
    // etiket + ••• aynı bara sığsın, kenara taşmasın. Dokunma hedefi hitSlop
    // ile 44pt'a tamamlanır (bkz. cellHitSlop).
    paddingHorizontal: NAV.cellPadH,
    paddingVertical: NAV.cellPadV,
    borderRadius: NAV.radius,
    minWidth: NAV.cellMinW,
    overflow: 'hidden',
  },

  iconWrap: {
    width: NAV.iconBox,
    height: NAV.iconBox,
    alignItems: 'center',
    justifyContent: 'center',
  },

  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },

  countBadge: {
    position: 'absolute',
    top: -5,
    // yatay konum çağrı yerinde (isRTL) verilir — `end:` bu projede güvenilir değil
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
