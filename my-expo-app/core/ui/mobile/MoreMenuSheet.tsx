/**
 * MoreMenuSheet — "Tüm Menü" · navbar'daki ••• hücresine ÇAPALI popover.
 *
 * Neden sheet değil: eski hâli alttan tam-genişlik bir bottom sheet olarak
 * açılıyordu ve floating navbar'ın TAMAMINI kapatıyordu — menü nereden
 * açıldığı belirsizleşiyor, gezinme çubuğu kayboluyordu. Artık iOS bağlam
 * menüsü gibi davranır: ••• düğmesinin hemen üstünde, ona bakan küçük bir
 * kuyrukla, düğmeden büyüyerek açılır; navbar görünür kalır.
 *
 *  • Konum: ••• hücresinin ekran-uzayı merkezi (uiOverlayStore.moreAnchorX,
 *    PillTabBar ölçer) + barın kendi geometrisi (navGlass NAV sabitleri).
 *    Ölçüm yoksa sağ-alt varsayılanına düşer.
 *  • Yüzey: aynı cam AİLESİ (tek kaynak `navGlass`) ama KALIN ağırlık.
 *    Apple'ın malzeme hiyerarşisi: küçük etkileşimli chrome (bar) ince,
 *    büyük metinli yüzey (menü) kalın olur; iki AÇIK yarı-saydam yüzey üst
 *    üste gelirse okunabilirlik çöker. Kuyruk da aynı camdan (kırpılmış,
 *    döndürülmüş kare → kendi blur'unu taşır).
 *  • Modal DEĞİL: RN Modal ayrı bir katman açıp navbar'ı görsel olarak da
 *    örtüyordu. Ağaç içinde absolute overlay + tam ekran şeffaf dokunma
 *    yakalayıcı: dışarı (veya tekrar •••) dokunmak kapatır, navbar görünür.
 *  • API DEĞİŞMEDİ: visible/onClose/items/title/subtitle/accentColor aynı.
 */
import React, { useEffect, useRef, useState } from 'react';
import { isRTL } from '../../i18n';
import {
  View, Text, Pressable, Animated, Easing, Platform, BackHandler,
  useWindowDimensions, ScrollView, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { ChevronRight, ChevronLeft } from '../icons';
import { autoT } from '../../i18n/autoTranslate';
import type { LucideIcon } from '../icons';
import { useMobileTokens } from '../../theme/mobileDesignTokens';
import { useThemeModeStore } from '../../store/themeModeStore';
import { useUiOverlayStore } from '../../store/uiOverlayStore';
import { SimanWordmark } from '../SimanWordmark';
import { NAV, navBarMetrics, navGlass, navSurfaceStyle, topEdgeLight, useReduceTransparency } from './navGlass';
import { GlassBlurLayer } from './GlassBlurLayer';

export interface MoreItem {
  key: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  accent?: string;
  badge?: number;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items: MoreItem[];
  accentColor?: string;
}

// Bar yüksekliği/ofseti navGlass'tan (navBarMetrics) — tek kaynak.
/** Kuyruk — •••'ye bakan elmas ucu. Kare 45° döner, üst yarısı kırpılır. */
const TAIL_W = 20;
const TAIL_H = 10;
const TAIL_SQ = 14;
/** Kuyruğun kart kenarından en az uzaklığı (köşe yuvarlaklığına girmesin). */
const TAIL_INSET = 26;

export function MoreMenuSheet({ visible, onClose, items, accentColor = '#0F172A', title, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // KALIN materyal (apple-design §12): menü büyük ve metin dolu bir yüzey.
  // Barın ince camıyla aynı formülü kullanırsa alttaki kart/harita yazıları
  // menü etiketlerinin içinden okunuyor ve ikisi çakışıyor.
  const solidGlass = useReduceTransparency();
  // 'menu' ağırlığı: neredeyse opak beyaz (koyuda #1B1916) + ink hairline kenar.
  // 'thick' cam, beyaz kart listesinin üstünde kenarsız kalıyordu → menü arka
  // plana karışıyordu (kullanıcı cihazda gördü, 2026-09-12).
  const glass = navGlass(isDark, 'menu', solidGlass);
  const anchorX = useUiOverlayStore(s => s.moreAnchorX);
  const setMoreMenuOpen = useUiOverlayStore(s => s.setMoreMenuOpen);

  // Navbar'daki ••• hücresi menü açıkken seçili görünsün (kayan mercek oraya
  // kayar) — rota değişmediği için bunu store üzerinden bildiriyoruz.
  useEffect(() => {
    setMoreMenuOpen(visible);
    return () => setMoreMenuOpen(false);
  }, [visible, setMoreMenuOpen]);

  // Kapanış animasyonu bitene kadar ağaçta kal (Modal yok → elle yönetiyoruz)
  const [render, setRender] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRender(true);
      Animated.spring(anim, {
        toValue: 1, damping: 20, stiffness: 260, mass: 0.85, useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setRender(false); });
    }
  }, [visible, anim]);

  // Android donanım geri tuşu — Modal'ın onRequestClose'unun yerine
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!render) return null;

  // ── Geometri ────────────────────────────────────────────────────────────
  // Barın ekrandaki alt ofseti PillTabBar ile AYNI formül; menü barın üstünde
  // kuyruk payı bırakarak durur.
  const nav = navBarMetrics(insets.bottom, 0);
  const cardBottom = nav.top + TAIL_H + 4;

  // Geniş kart: sayfa kenarı kuralına (16pt) kadar açılır, tablette 420'de
  // durur — satır etiketleri ("Sağlık Kurumları") sıkışmasın.
  const cardW = Math.min(420, W - NAV.wrapPadH * 2);
  // Ölçüm yoksa: pill'in sağ ucundaki son hücrenin yaklaşık merkezi
  const fallbackAnchor = W - NAV.wrapPadH - NAV.fab - NAV.rowGap - NAV.barPadH - NAV.cellMinW / 2;
  const anchor = anchorX ?? fallbackAnchor;
  // Kart, kuyruğu sağ tarafta kalacak şekilde çapaya yakın hizalanır; ekran
  // kenarlarına taşmaz.
  const rawRight = anchor + TAIL_INSET + TAIL_W / 2;
  const cardRight = Math.min(Math.max(rawRight, NAV.wrapPadH + cardW), W - NAV.wrapPadH);
  const cardLeft = cardRight - cardW;
  const tailCenter = Math.min(Math.max(anchor - cardLeft, TAIL_INSET), cardW - TAIL_INSET);

  const maxCardH = Math.max(220, Math.floor(H * 0.62));

  // Ayraç çizgileri — cam kenarı DEĞİL, içerik ayracı (çok kısık ink).
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)';
  // Kuyruğun yüzeyi: web'de barın cam formülü, native'de barın tülü (+ blur).
  const tailSurface = Platform.OS === 'web' ? glass.webSurface : glass.veil;
  const webGlass = Platform.OS === 'web'
    ? ({ backdropFilter: glass.webBackdrop, WebkitBackdropFilter: glass.webBackdrop } as any)
    : null;

  // Düğmeden büyüme: ölçek + hafif aşağıdan yükselme. transformOrigin kuyruğun
  // olduğu noktada → menü gerçekten ••• düğmesinden açılıyormuş gibi okunur.
  const animStyle = {
    opacity: anim,
    transformOrigin: `${Math.round(tailCenter)}px 100%`,
    transform: [
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
    ],
  } as any;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Dokunma yakalayıcı — ŞEFFAF: navbar görünür kalır (eski sheet onu
          tamamen örtüyordu). Dışarı ya da tekrar ••• dokunuşu kapatır. */}
      <Pressable
        onPress={onClose}
        style={StyleSheet.absoluteFillObject}
        accessibilityLabel={autoT('Menüyü kapat')}
      />

      {/* Kuyruk — 45° döndürülmüş kare, üst yarısı kırpılır.
          Neden böyle: kenarlık-üçgeni hilesi kendi blur'unu taşıyamaz (0x0
          kutu → backdrop-filter'ın boyayacağı alan yok) ve kuyruk camın
          yanında donuk bir leke gibi duruyordu. Kare gerçek bir kutu olduğu
          için barın cam formülünü aynen alır; sarmalayıcı `overflow:hidden`
          kartla ÇAKIŞAN yarısını keser → çift kompozisyon lekesi olmaz. */}
      <Animated.View
        pointerEvents="none"
        style={[{
          position: 'absolute',
          left: cardLeft + tailCenter - TAIL_W / 2,
          bottom: cardBottom - TAIL_H,
          width: TAIL_W,
          height: TAIL_H,
          overflow: 'hidden',
        }, animStyle]}
      >
        <View style={[{
          position: 'absolute',
          top: -TAIL_SQ / 2,
          left: (TAIL_W - TAIL_SQ) / 2,
          width: TAIL_SQ, height: TAIL_SQ,
          transform: [{ rotate: '45deg' }],
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: tailSurface,
          borderWidth: 1,
          borderColor: glass.border,
        }, webGlass]}>
          {(Platform.OS === 'ios' || Platform.OS === 'android') && (
            <BlurView
              intensity={glass.blurIntensity}
              tint={glass.blurTint}
              style={[StyleSheet.absoluteFillObject, { zIndex: -1 }]}
            />
          )}
        </View>
      </Animated.View>

      {/* Kart */}
      <Animated.View
        style={[{
          position: 'absolute',
          left: cardLeft,
          bottom: cardBottom,
          width: cardW,
          maxHeight: maxCardH,
          borderRadius: 26,
          overflow: 'hidden',
          // Barın cam formülü — TEK kaynak (navGlass). Menü barın devamı.
          ...navSurfaceStyle(glass),
        }, animStyle]}
      >
        {/* Web camının blur katmanı (ayrı çocuk — bkz. GlassBlurLayer) */}
        <GlassBlurLayer glass={glass} radius={26} />
        {/* Native cam: ultra-thin material + barın tülü + kenar ışığı */}
        {(Platform.OS === 'ios' || Platform.OS === 'android') && (
          <>
            <BlurView
              intensity={glass.blurIntensity}
              tint={glass.blurTint}
              style={[StyleSheet.absoluteFillObject, { zIndex: -1 }]}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: glass.veil, zIndex: -1 }]} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
              borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, borderColor: glass.border,
            }]} />
          </>
        )}
        {/* Üst kenar ışığı — barla aynı specular */}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, Platform.OS === 'web'
            ? ({ borderRadius: 26, backgroundImage: topEdgeLight(isDark) } as any)
            : { borderRadius: 26 }]}
        >
          {Platform.OS !== 'web' && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: glass.specularTop }} />
          )}
        </View>

        {/* Başlık — popover'da kompakt (eski sheet'te 24px başlık + drag handle
            vardı; burada gereksiz yer kaplıyor). */}
        {(title || subtitle) ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
            {title ? (
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: T.ink, letterSpacing: -0.3 }} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2, letterSpacing: -0.1 }} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : <View style={{ height: 8 }} />}

        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 4 }}
        >
          {items.map((item, idx) => (
            <React.Fragment key={item.key}>
              <ListRow
                item={item}
                accentColor={accentColor}
                onPress={() => { onClose(); setTimeout(item.onPress, 80); }}
                inkColor={T.ink}
                chevronColor={T.ink3}
                badgeBorderColor={isDark ? '#1B1916' : '#FFFFFF'}
                isDark={isDark}
              />
              {idx < items.length - 1 && (
                <View style={{ height: 1, marginStart: 58, marginEnd: 10, backgroundColor: hairline }} />
              )}
            </React.Fragment>
          ))}
        </ScrollView>

        {/* Powered by Siman — platform kimliği (white-label) */}
        <View style={{
          // Marka kilidi — RTL'de sıra ters dönmesin (bkz. PatternsShell)
          flexDirection: isRTL() ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          paddingVertical: 9,
          borderTopWidth: 1, borderTopColor: hairline,
        }}>
          <Text style={{ fontSize: 9.5, color: T.ink3 }} numberOfLines={1}>Powered by</Text>
          <SimanWordmark height={8} color="#9A9A9A" />
        </View>
      </Animated.View>
    </View>
  );
}

// ─── List Row ──────────────────────────────────────────────────────────
function ListRow({
  item, accentColor, onPress, inkColor, chevronColor, badgeBorderColor, isDark,
}: {
  item: MoreItem;
  accentColor: string;
  onPress: () => void;
  inkColor: string;
  chevronColor: string;
  badgeBorderColor: string;
  isDark: boolean;
}) {
  const Icon = item.icon;
  const itemAccent = item.accent ?? accentColor;
  const rtl = isRTL();
  // Satır sonu chevron'u yön bildirir → RTL'de aynalanır
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  // STATIC style — RN 0.83 + new arch iOS'ta Pressable style callback fn
  // bazen uygulanmıyor (flexDirection: 'row' atılıyor, default column kalıyor).
  // Static array hep çalışır. (bkz. feedback_native_pressable_row_collapse)
  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer' as any,
      transition: 'background-color 120ms' as any,
    } : {}),
  };
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }}
      accessibilityRole="menuitem"
      accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
      style={rowStyle}
    >
      {/* Icon squircle — solid accent tint, no border (modern iOS) */}
      <View style={{
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: itemAccent,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color="#FFFFFF" strokeWidth={2} />
        {item.badge ? (
          <View style={{
            position: 'absolute', top: -3, ...(rtl ? { left: -3 } : { right: -3 }),
            minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 5,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#DC2626',
            borderWidth: 2, borderColor: badgeBorderColor,
          }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>
              {item.badge > 99 ? '99+' : item.badge}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Label — tek satır, icon ile mükemmel hizalı */}
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 15, fontWeight: '600', color: inkColor,
          letterSpacing: -0.2,
        }}
      >
        {item.label}
      </Text>

      {/* Chevron — iOS native ince */}
      <Chevron size={16} color={chevronColor} strokeWidth={2.2} />
    </Pressable>
  );
}
