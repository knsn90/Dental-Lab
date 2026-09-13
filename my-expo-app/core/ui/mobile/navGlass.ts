// core/ui/mobile/navGlass.ts
// Floating navigation'ın MATERYAL ve GEOMETRİ tek kaynağı — Apple iOS 26
// "liquid glass" dilinin bu uygulamaya uyarlanmış hâli.
//
// Neden ayrı dosya: aynı cam formülü üç ayrı yüzeyde geçiyor (pill bar, yan
// FAB, aktif sekme merceği) ve üç ayrı platform kolunda (iOS 26 native glass /
// iOS·Android BlurView / web backdrop-filter). Değerler tek yerde durmazsa
// yüzeyler birbirinden kayıyor ve "cam" hissi dağılıyor.
//
// İLKE: cam OPAK BEYAZ bir dikdörtgen değildir. Arkadaki içerik hafifçe
// bulanık ve doygunlaşmış olarak SEZİLMELİ. Bu yüzden tül (veil) opaklığı
// okunabilirliğin izin verdiği en DÜŞÜK değerde tutulur; kalan ayrım işi
// kenar ışığı (specular) ve yumuşak ortam gölgesiyle yapılır — sert siyah
// gölge ve belirgin kenarlıkla değil.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { NAV_LENS_ID, navLensAvailable } from './navLens';

/** Geometri — mobil/tablet floating pill. Değerler tek yerde. */
export const NAV = {
  /** Ekran kenarı ile bar arası — floating hissi (yapışık footer değil) */
  wrapPadH: 16,
  /** Bar içerik genişliği üst sınırı (tablet/desktop'ta gereksiz yayılmasın) */
  barMaxW: 420,
  /** Bar iç dolgusu — cam çerçevenin hücreleri sarma payı */
  barPadV: 8,
  barPadH: 8,
  /** Pill ile FAB arası */
  rowGap: 12,
  /** Kapsül: yarıçap her zaman yüksekliğin yarısı (999 = tam kapsül) */
  radius: 999,

  /** Hücre — dokunma hedefi 44pt'a hitSlop ile tamamlanır (bkz. cellHitSlop) */
  cellMinW: 38,
  cellPadH: 8,
  cellPadV: 10,
  iconBox: 24,
  icon: 22,

  /** Yan FAB — bardan bir tık büyük (ana aksiyon hiyerarşisi) */
  fab: 64,
  fabIcon: 28,

  /** Scroll-aware daralma — bar KAYBOLMAZ, yalnız geri çekilir */
  collapse: { translateY: 10, scale: 0.94, opacity: 0.92 },

  /** Basma fiziği */
  press: { cell: 0.95, fab: 0.94 },
} as const;

/**
 * Barın gerçek yüksekliği — iç dolgu + hücre (ikon kutusu + dikey dolgu).
 * 8 + (24 + 20) + 8 = 60pt.
 */
export const NAV_BAR_H = NAV.barPadV * 2 + NAV.iconBox + NAV.cellPadV * 2;

/**
 * Floating navbar'ın ekran altında kapladığı alan + üstünde bırakılması gereken
 * nefes payı. Harita/sheet gibi tam-ekran yüzeyler alt sınırlarını BURADAN
 * hesaplar — sabit 100/120px yazmak yerine.
 *
 * Neden pay (gap) şart: barın backdrop-filter'ı ~24px yarıçapında komşu
 * pikselleri içine çeker. Bir kart barın 4px üstünde bitiyorsa yazıları camın
 * içine sızıyor ve iki yüzey birbirine binmiş gibi okunuyor.
 *
 *   const nav = navBarMetrics(insets.bottom);
 *   <View style={{ bottom: nav.clearance }} />   // navbar'ın güvenli üstü
 */
export function navBarMetrics(bottomInset: number, gap = 14) {
  // PillTabBar'ın `bottomOffset`i ile BİREBİR aynı formül olmalı.
  const offset = Math.max(bottomInset, 8) + 8;
  const top = offset + NAV_BAR_H;
  return { barH: NAV_BAR_H, offset, top, gap, clearance: top + gap };
}

/**
 * 44x44 minimum dokunma hedefi. Hücre görsel olarak 38 geniş kalır (6 sekmeli
 * panelde bar taşmasın), eksik pay hitSlop ile tamamlanır — dokunma alanı
 * görsel kutudan bağımsızdır.
 */
export const cellHitSlop = { top: 8, bottom: 8, left: 3, right: 3 } as const;

export interface NavGlass {
  /** expo-blur yoğunluğu (iOS < 26 / Android) */
  blurIntensity: number;
  blurTint: 'systemUltraThinMaterialLight' | 'systemUltraThinMaterialDark';
  /** Blur üstündeki İNCE tül — okunabilirlik için gereken en az opaklık */
  veil: string;
  /** iOS 26 LiquidGlassView tintColor — native mercek üstü nötr tül */
  liquidTint: string;
  /** Cam kenarı — belirgin çizgi değil, ışık kırılması */
  border: string;
  /** Üst kenar specular hairline */
  specularTop: string;
  /** Üst yarı yumuşak ışık yıkaması */
  specularWash: string;
  /** Web: yüzey + backdrop-filter + geniş yumuşak gölge */
  webSurface: string;
  /**
   * Blur + renk zinciri (MERCEK HARİÇ). Kendi katmanında uygulanır — bkz.
   * webLens ve GlassBlurLayer.
   */
  webBackdrop: string;
  /**
   * Refraksiyon merceği (`url(#...)`) ya da null.
   *
   * ÖLÇÜLDÜ: Chromium, `backdrop-filter: url(#lens) blur(7px)` gibi KARIŞIK
   * bir zincirde yer değiştirmeyi uygulamıyor — ölçek 0.16'dan 0.80'e
   * çıkarıldığında bile fark 1 luminans seviyesinde kaldı. Mercek TEK BAŞINA
   * çalışıyor (fark 48-54). Bu yüzden iki katman: ebeveyn yalnız merceği
   * uygular, üstteki çocuk katman blur+renk zincirini. Bu kurulumda
   * refraksiyon bileşimde yaşıyor (fark 1.1 → 6.68).
   */
  webLens: string | null;
  webShadow: string;
  /** Web: cam üstü specular gradient (tek katmanda, ekstra View yok) */
  webSpecular: string;
  /** Native gölge — siyah ama çok düşük opaklık, geniş yayılım */
  nativeShadow: {
    shadowColor: string; shadowOpacity: number; shadowRadius: number;
    shadowOffset: { width: number; height: number }; elevation: number;
  };
}

/**
 * Materyal AĞIRLIĞI — Apple'ın malzeme hiyerarşisi (bkz. apple-design §12):
 *   • 'thin'  → küçük, etkileşimli chrome (bar, FAB, çip). Arkasındaki içerik
 *               sezilir; yüzey dikkati üzerine çekmez.
 *   • 'thick' → BÜYÜK yüzey (menü popover'ı). "Bigger surfaces should read as
 *               thicker": daha güçlü blur + daha kapalı tül + daha derin gölge.
 *
 * Neden şart: iki AÇIK yarı-saydam yüzeyi üst üste koymak okunabilirliği
 * çökertir ("never stack a light translucent surface on another"). Menü barın
 * ve haritanın üstünde duruyor; ince camla açıldığında alttaki kart yazıları
 * menü etiketleriyle çakışıyordu — kullanıcı cihazda gördü.
 *
 *   • 'menu'  → İÇERİK YÜZEYİ (Tüm Menü popover'ı). iOS bağlam menüsü gibi
 *               neredeyse OPAK: arkada bulanık bir iz kalır ama yüzey beyaz
 *               okunur ve kenarı ink hairline ile çizilir.
 *
 * Neden 'thick' menüye yetmedi: menü açık sayfa zemini (#F5F1EB) ve beyaz kart
 * listesinin üstünde duruyor. Beyaz tül + BEYAZ kenarlık + yumuşak gölge, beyaz
 * zeminde hiç kenar bırakmıyor → menü arka plana karışıyor (kullanıcı cihazda
 * gördü). Çözüm opaklığı yükseltmek DEĞİL yalnız: kenarı ink'e çevirmek şart.
 */
export type GlassWeight = 'thin' | 'thick' | 'menu';

/**
 * Web filtre zinciri. Sıra önemli: önce MERCEK (yer değiştirme), sonra ince
 * blur ve renk düzeltme.
 *
 * Mercek varsa blur BİLİNÇLİ olarak düşer (26 → 10): arkadaki yazının netliğini
 * bozan şey artık bulanıklık değil, büyüteç etkisiyle YAYILMA. Mercek yoksa
 * (Safari/eski tarayıcı) kanıtlanmış blur+kontrast zincirine düşülür — orada
 * ayrımı blur yapmak zorunda.
 */
function webFilter(dark: boolean, weight: GlassWeight, lens: boolean): string {
  if (weight === 'menu') {
    // Yüzey neredeyse opak → filtrenin işi yalnız kenarlardan sızan izi
    // yumuşatmak. brightness/contrast oyunu yok: metin kontrastı yüzeyin
    // kendisinden gelir.
    return dark ? 'blur(30px) saturate(140%)' : 'blur(30px) saturate(150%)';
  }
  if (weight === 'thick') {
    return dark
      ? 'blur(40px) saturate(160%) brightness(0.62) contrast(0.90)'
      : 'blur(40px) saturate(180%) brightness(1.10) contrast(0.82)';
  }
  // Mercek varsa blur BİLİNÇLİ olarak düşer (26 → 7): arkadaki yazının
  // netliğini bozan iş merceğe geçer. Mercek yoksa (Safari) ayrımı blur
  // yapmak zorunda → kanıtlanmış güçlü zincir.
  if (lens) {
    return dark
      ? 'blur(7px) saturate(150%) brightness(0.74) contrast(0.95)'
      : 'blur(7px) saturate(185%) brightness(1.06) contrast(0.94)';
  }
  return dark
    ? 'blur(26px) saturate(150%) brightness(0.68) contrast(0.88)'
    : 'blur(26px) saturate(170%) brightness(1.12) contrast(0.80)';
}

/** Bar / FAB / disk / menü yüzeylerinin ortak cam formülü. */
export function navGlass(dark: boolean, weight: GlassWeight = 'thin', solid = false): NavGlass {
  // Mercek YALNIZ ince yüzeyde (yüzen kontrol katmanı). Kalın menü/sheet
  // yüzeyinde kırılma görünmez — yüzey neredeyse opak — ama ekstra bir GPU
  // geçişi maliyeti çıkarır.
  const lens = !solid && weight === 'thin' && navLensAvailable();
  const base = {
    ...navGlassBase(dark),
    webBackdrop: webFilter(dark, 'thin', lens),
    webLens: lens ? `url(#${NAV_LENS_ID})` : null,
  };
  if (weight === 'thin' && !solid) return base;
  if (solid) {
    // prefers-reduced-transparency: saydamlık YOK. Blur'u da bırakırız —
    // "make translucent surfaces frostier/solid: raise opacity, drop the blur".
    return {
      ...base,
      blurIntensity: 0,
      veil: dark ? '#1B1916' : '#FFFFFF',
      liquidTint: dark ? '#1B1916' : '#FFFFFF',
      webSurface: dark ? '#1B1916' : '#FFFFFF',
      webBackdrop: 'none',
      webLens: null,
      webSpecular: 'none',
      border: dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.14)',
      specularWash: 'transparent',
    };
  }
  if (weight === 'menu') {
    // Menü materyali — beyaz/karakutu yüzey + INK kenar + derin gölge.
    return dark
      ? {
          ...base,
          blurIntensity: 100,
          veil: 'rgba(27,25,22,0.97)',
          liquidTint: 'rgba(27,25,22,0.97)',
          webSurface: 'rgba(27,25,22,0.96)',
          webBackdrop: webFilter(true, 'menu', false),
          webLens: null,
          webSpecular: 'none',
          border: 'rgba(255,255,255,0.12)',
          specularTop: 'rgba(255,255,255,0.10)',
          specularWash: 'transparent',
          webShadow:
            '0 26px 60px -16px rgba(0,0,0,0.72), 0 8px 20px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
          nativeShadow: {
            shadowColor: '#000', shadowOpacity: 0.62, shadowRadius: 34,
            shadowOffset: { width: 0, height: 16 }, elevation: 24,
          },
        }
      : {
          ...base,
          blurIntensity: 100,
          veil: 'rgba(255,255,255,0.97)',
          liquidTint: 'rgba(255,255,255,0.97)',
          webSurface: 'rgba(255,255,255,0.96)',
          webBackdrop: webFilter(false, 'menu', false),
          webLens: null,
          webSpecular: 'none',
          // ★ Kenar BEYAZ değil: beyaz zeminde tek ayrım aracı bu hairline.
          border: 'rgba(15,23,42,0.10)',
          specularTop: 'rgba(255,255,255,0.90)',
          specularWash: 'transparent',
          webShadow:
            '0 26px 56px -16px rgba(15,23,42,0.28), 0 8px 20px -10px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.85)',
          nativeShadow: {
            shadowColor: '#0F172A', shadowOpacity: 0.28, shadowRadius: 32,
            shadowOffset: { width: 0, height: 14 }, elevation: 22,
          },
        };
  }
  // thick — menü materyali
  return dark
    ? {
        ...base,
        blurIntensity: 96,
        veil: 'rgba(18,17,16,0.82)',
        liquidTint: 'rgba(18,17,16,0.78)',
        webSurface: 'rgba(24,23,22,0.80)',
        webBackdrop: webFilter(true, 'thick', false),
        webLens: null,
        webShadow:
          '0 26px 60px -16px rgba(0,0,0,0.72), 0 8px 20px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        nativeShadow: {
          shadowColor: '#000', shadowOpacity: 0.62, shadowRadius: 34,
          shadowOffset: { width: 0, height: 16 }, elevation: 22,
        },
      }
    : {
        ...base,
        blurIntensity: 96,
        veil: 'rgba(255,255,255,0.88)',
        liquidTint: 'rgba(255,255,255,0.86)',
        webSurface: 'rgba(255,255,255,0.84)',
        webBackdrop: webFilter(false, 'thick', false),
        webLens: null,
        // Metinli büyük yüzey → daha derin gölge (context-aware shadow)
        webShadow:
          '0 26px 56px -16px rgba(15,23,42,0.30), 0 8px 20px -10px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.80)',
        nativeShadow: {
          shadowColor: '#0F172A', shadowOpacity: 0.26, shadowRadius: 32,
          shadowOffset: { width: 0, height: 14 }, elevation: 20,
        },
      };
}

function navGlassBase(dark: boolean): NavGlass {
  return dark
    ? {
        blurIntensity: 84,
        blurTint: 'systemUltraThinMaterialDark',
        // Koyuda tül daha gerekli: siyah zeminde ince cam kontrast bırakmıyor.
        veil: 'rgba(16,16,18,0.46)',
        liquidTint: 'rgba(24,22,20,0.40)',
        border: 'rgba(255,255,255,0.09)',
        specularTop: 'rgba(255,255,255,0.14)',
        specularWash: 'rgba(255,255,255,0.04)',
        webSurface: 'rgba(22,22,24,0.56)',
        // Koyuda luminans TERS yöne: arkadaki AÇIK metin karartılarak geri
        // çekilir (brightness < 1), kontrast yine düzleştirilir.
        webBackdrop: 'blur(26px) saturate(150%) brightness(0.68) contrast(0.88)',
        webLens: null,
        webShadow:
          '0 20px 44px -14px rgba(0,0,0,0.62), 0 6px 16px -8px rgba(0,0,0,0.45), ' +
          'inset 0 1.5px 0 rgba(255,255,255,0.16), inset 1px 0 0 rgba(255,255,255,0.08), ' +
          'inset -1px 0 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(255,255,255,0.05), ' +
          'inset 0 -8px 14px -10px rgba(0,0,0,0.45)',
        webSpecular:
          'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 42%, rgba(255,255,255,0) 100%)',
        nativeShadow: {
          shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 26,
          shadowOffset: { width: 0, height: 12 }, elevation: 16,
        },
      }
    : {
        // Native'de brightness/contrast filtresi YOK. Oradaki ayrım aracı
        // blur YOĞUNLUĞU (opaklık değil): 56 → 80'de arkadaki metnin biçimi
        // dağılır, rengi kalır. iOS 26'da bu iş gerçek LiquidGlassView
        // materyaline devredilir.
        blurIntensity: 80,
        blurTint: 'systemUltraThinMaterialLight',
        // Tül YÜKSELTİLEREK çözülmez: %86'da bar "buzlu beyaz plastik" oluyor,
        // %52'de arkadaki kart yazıları camın içinden okunup ikonlarla
        // yarışıyor. Ayrımı yapan şey aşağıdaki webBackdrop filtre zinciri;
        // tül yalnız yüzeyin VAR olduğunu söyleyen ince beyaz materyal.
        veil: 'rgba(255,255,255,0.58)',
        liquidTint: 'rgba(255,255,255,0.48)',
        border: 'rgba(255,255,255,0.58)',
        specularTop: 'rgba(255,255,255,0.75)',
        specularWash: 'rgba(255,255,255,0.20)',
        webSurface: 'rgba(255,255,255,0.66)',
        // ★ LIQUID GLASS'IN ÇEKİRDEĞİ — "rgba + blur" DEĞİL:
        //   blur       → biçimi dağıtır
        //   saturate   → rengi canlı tutar (içerik yok olmaz, SEZİLİR kalır)
        //   brightness → arkadaki koyu metni yüzeyin luminansına doğru iter
        //   contrast   → metin/zemin farkını düzleştirir: yazı OKUNMAZ olur,
        //                renk ve biçim kalır
        // Filtre arkadaki GERÇEK piksellere uygulandığı için materyal içeriğe
        // göre kendiliğinden uyarlanır: beyaz zeminde yüzey daha kapalı okunur,
        // koyu/renkli zeminde alttaki renk cama sızar. Opaklığı artırmak bu
        // davranışı YOK EDER (içerik kaybolur), o yüzden %66'da tutuluyor.
        webBackdrop: 'blur(26px) saturate(170%) brightness(1.12) contrast(0.80)',
        webLens: null,
        // Gölge siyah-sert değil: lacivert-gri, geniş yayılım, düşük opaklık.
        // İç halka (inset) ŞART: camı "büyüteç" gibi okutan şey kenarında
        // toplanan ışıktır. Üst kenar en parlak (ışık yukarıdan), yanlar orta,
        // alt kenar kısık → 1px'lik düz kenarlıktan çok daha fiziksel.
        webShadow:
          '0 18px 40px -14px rgba(15,23,42,0.20), 0 6px 16px -8px rgba(15,23,42,0.12), ' +
          'inset 0 1.5px 0 rgba(255,255,255,0.92), inset 1px 0 0 rgba(255,255,255,0.55), ' +
          'inset -1px 0 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(255,255,255,0.32), ' +
          'inset 0 -8px 14px -10px rgba(15,23,42,0.22)',
        webSpecular:
          'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.14) 38%, rgba(255,255,255,0) 100%)',
        nativeShadow: {
          shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 }, elevation: 14,
        },
      };
}

/**
 * Aktif sekme merceği — düz mavi daire DEĞİL. Katmanlar:
 *   fill      → çok hafif accent/beyaz tül
 *   border    → 1px accent kırılması
 *   highlight → üst yarıda specular ışık (cam kabarcık hissi)
 * Üçü tek Animated.View içinde taşınır, böylece gösterge kayarken bütün
 * olarak hareket eder (parça parça sıçramaz).
 */
export function navIndicator(dark: boolean, accent: string) {
  return dark
    ? {
        // Koyu temada accent tinti siyah çubukta kahverengi leke gibi okunuyor
        // (safran panelinde ölçüldü) → nötr cam.
        fill: 'rgba(255,255,255,0.10)',
        border: 'rgba(255,255,255,0.13)',
        highlight: 'rgba(255,255,255,0.07)',
        highlightGradient: topLight('rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)'),
        liquidTint: 'rgba(60,55,50,0.72)',
      }
    : {
        // %12 accent camın üstünde GRİ okunuyordu (kullanıcı cihazda gördü):
        // blur + doygunluk tinti yutuyor. %18 tül + %30 kenar → açık mavi
        // kapsül net görünür, hâlâ "düz dolu daire" değil.
        // İkinci bir cam/blur DEĞİL — yalnız tint + ince kenar. Üst üste
        // materyal yığmak (sheet camı + bar camı + öğe camı) hem bulanık bir
        // çorba yapıyor hem GPU'yu boşa yakıyor.
        fill: accent + '24',        // ~%14 accent
        border: accent + '42',      // ~%26 accent
        highlight: 'rgba(255,255,255,0.34)',
        highlightGradient: topLight('rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)'),
        liquidTint: 'rgba(255,255,255,0.85)',
      };
}

/**
 * Üstten gelen ışık gradyanı (yalnız web). SERT %50 kenarı olan tek katmanlı
 * yarım-yüzey ışığı yerine gerçek geçiş: FAB ve gösterge iki tonlu görünmesin
 * (ilk denemede tam ortadan bölünmüş görünüyordu).
 */
export function topLight(top: string, mid: string): string {
  return `linear-gradient(180deg, ${top} 0%, ${mid} 40%, rgba(255,255,255,0) 100%)`;
}

/**
 * UZUN yüzeyler (menü kartı) için üst kenar ışığı — durakları PX cinsinden.
 * Barın yüzde-tabanlı specular'ı 60pt'ta doğru, 500pt'luk bir kartta üst
 * yarısını bulanık beyaz bir yıkamaya çeviriyor. Bu sürüm, kart ne kadar uzun
 * olursa olsun ışığı üst kenarda tutar.
 */
export function topEdgeLight(dark: boolean): string {
  return dark
    ? 'linear-gradient(180deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.03) 40px, rgba(255,255,255,0) 88px)'
    : 'linear-gradient(180deg, rgba(255,255,255,0.55) 0px, rgba(255,255,255,0.12) 40px, rgba(255,255,255,0) 88px)';
}

/**
 * AYRIM BÖLGESİ — Apple'ın "scroll edge effect" ilkesi (apple-design §12):
 * yüzen chrome'un içerikle buluştuğu yerde 1px ayraç yerine ilerleyen bir
 * bulanıklık. Barın hemen üstünde ince bir şerit; maske sayesinde yukarı
 * doğru tamamen kaybolur → koyu katman ya da ağır gradyan YOK, yalnız
 * içeriğin geri çekildiği yumuşak bir geçiş.
 */
export function edgeSeparation(dark: boolean): any {
  if (Platform.OS !== 'web') return null;
  const filter = dark
    ? 'blur(8px) saturate(140%) brightness(0.82)'
    : 'blur(8px) saturate(160%) brightness(1.06) contrast(0.92)';
  const mask = 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0) 100%)';
  return {
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
}

/** Dolu accent FAB üstündeki kubbe ışığı — daireyi "ışık alan" yapar. */
export const FAB_DOME = topLight('rgba(255,255,255,0.26)', 'rgba(255,255,255,0.07)');

/**
 * `prefers-reduced-transparency` (web) / Reduce Transparency (iOS·Android).
 * Açıksa cam yüzeyler OPAK'a düşer — erişilebilirlik ayarı, tasarım tercihi
 * değil. Blur da kapatılır (bkz. apple-design §14).
 */
export function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
      setReduce(mq.matches);
      const onChange = (e: any) => { if (alive) setReduce(!!e.matches); };
      mq.addEventListener?.('change', onChange);
      return () => { alive = false; mq.removeEventListener?.('change', onChange); };
    }
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then(v => { if (alive) setReduce(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', (v: any) => {
      if (alive) setReduce(!!v);
    });
    return () => { alive = false; (sub as any)?.remove?.(); };
  }, []);
  return reduce;
}

/** Web'de gölge/backdrop, native'de shadow* — çağrı yerini temiz tutar. */
export function navSurfaceStyle(g: NavGlass): any {
  return Platform.OS === 'web'
    ? {
        backgroundColor: g.webSurface,
        borderWidth: 1,
        borderColor: g.border,
        // Ebeveyn katman: YALNIZ refraksiyon (varsa). Blur/renk zinciri üstteki
        // GlassBlurLayer'da — karışık zincirde Chromium merceği düşürüyor.
        ...(g.webLens ? { backdropFilter: g.webLens, WebkitBackdropFilter: g.webLens } : null),
        boxShadow: g.webShadow,
      }
    : { backgroundColor: 'transparent', ...g.nativeShadow };
}

/** Blur+renk katmanının stili (cam yüzeyin İLK çocuğu olarak render edilir). */
export function navBlurLayerStyle(g: NavGlass): any {
  if (Platform.OS !== 'web' || g.webBackdrop === 'none') return null;
  return { backdropFilter: g.webBackdrop, WebkitBackdropFilter: g.webBackdrop };
}
