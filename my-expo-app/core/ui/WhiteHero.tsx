/**
 * WhiteHero — "BEYAZ HERO" (kullanıcının adlandırdığı imza hero stili).
 *
 * Kaynağı Prim Motoru panosunun hero kartıdır; kullanıcı bu stili ve
 * tipografisini beğenip ada bağladı ("beyaz hero"), başka sayfalarda adıyla
 * istenebilsin diye buraya taşındı.
 *
 * ANATOMİ (açık tema):
 *   dış kap  → panel accent'inin EN SOLUK tonu (`theme.bg`), radius 28, padding 14
 *   iç kart  → %55 beyaz cam, radius 22, padding 26, beyaz-70 kenarlık
 *   kicker   → 11px, uppercase, letterSpacing 1.1, ink[500]
 *   başlık   → DISPLAY 44px, letterSpacing -1.5, lineHeight 48, ink[900]
 *   açıklama → 14px, ink[500], maxWidth 520, lineHeight 21
 *   stats    → sağda, DISPLAY 40px + 10px uppercase etiket, aralarında 28px
 *   actions  → altta pill düğme şeridi
 *
 * KOYU TEMA: dış kap lacivert hero yüzeyine (`useSpotlightSurface`) döner, iç
 * kart %6 beyaz cama iner, metinler beyazlaşır ve stat'lar saydam kutucuk olur —
 * aksi halde beyaz cam kart koyu sayfada patlıyor, krem metni yutuyordu.
 *
 * Kullanım:
 *   <WhiteHero
 *     kicker="Prim Motoru · Eylül 2026"
 *     title={<>Bu ay <Text style={{ color: accentInk }}>₺124.500</Text></>}
 *     description="3 aktif politika · 8/12 teknisyen prim hak etti."
 *     stats={[{ value: '8', label: 'Hak Eden' }]}
 *     actions={<PillButton …/>}
 *   />
 */
import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { useInkUI } from '../theme/inkScale';
import { useThemeModeStore } from '../store/themeModeStore';
import { usePanelTheme } from '../theme/usePanelTheme';
import { useHeroSurface, HeroGlow } from './HeroGlow';

/** Beyaz hero'nun başlık/rakam fontu. */
export const WHITE_HERO_DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

export interface WhiteHeroProps {
  /** Üst mikro etiket (uppercase). */
  kicker: string;
  /**
   * Kicker'ın SOLUNA giren küçük öğe (ör. geri düğmesi). Kicker bir <Text>
   * olduğu için içine Pressable konamıyordu; bu slot aynı satırda durur.
   * Verilmezse düzen hiç değişmez.
   */
  leading?: React.ReactNode;
  /** Büyük başlık — vurgulu parça için içine <Text> koyabilirsin. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Sağdaki büyük sayılar. */
  stats?: { value: string; label: string }[];
  /** Alttaki düğme şeridi. */
  actions?: React.ReactNode;
  /** Alt şeridin hizası: `start` (varsayılan, sol) · `end` (alt sağ köşe). */
  actionsAlign?: 'start' | 'end';
  /**
   * Kartın SAĞ ÜST köşesindeki birincil eylem. `actions` alt şeride yayılır;
   * tek bir CTA varsa şerit açmak yerine başlık hizasında durması istenir.
   */
  cta?: React.ReactNode;
  /**
   * Başlık bloğunun altına giren serbest içerik (ör. para birimi kartları).
   * Metin DEĞİL bileşen basacaksan `title` yerine burayı kullan: title bir
   * <Text> içinde render edilir, içine View koyulamaz.
   */
  children?: React.ReactNode;
  /**
   * Zemin tonunu belirleyen accent. Verilmezse aktif panelden gelir
   * (yönetim lacivert, lab safran, klinik/hekim zümrüt, istasyon mavi).
   */
  accent?: string;
  /** Soluk dış zemin rengi (accent ile birlikte özelleştirilir). */
  tint?: string;
  style?: any;
}

export function WhiteHero({
  kicker, leading, title, description, stats, actions, actionsAlign = 'start', cta, children, accent, tint, style,
}: WhiteHeroProps) {
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const panel = usePanelTheme();
  const acc = accent ?? panel.primary;
  const heroBg = useHeroSurface(acc);

  const kickerColor = isDark ? 'rgba(255,255,255,0.85)' : U.ink[500];
  const titleColor  = isDark ? '#FFFFFF' : U.ink[900];
  const descColor   = isDark ? 'rgba(255,255,255,0.60)' : U.ink[500];

  // Dar ekran: sabit 44/40px tipografi telefonda kartı taşırıyordu — üç stat
  // yan yana ~500px istiyor, kart 340px (kullanıcı cihazda gördü). Masaüstü
  // değerleri DEĞİŞMEZ; yalnız <640px'te ölçek düşer ve statlar tam genişliğe
  // yayılır.
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 640;

  return (
    <View style={[{
      borderRadius: 28, overflow: 'hidden', padding: 14,
      position: 'relative',
      ...(isDark ? heroBg : { backgroundColor: tint ?? panel.bg }),
    }, style]}>
      {isDark ? (
        <>
          <HeroGlow size={130} opacity={0.18} delay={0}    style={{ top: -46, end: -34 }} />
          <HeroGlow size={110} opacity={0.10} delay={1400} style={{ bottom: -52, start: -26 }} />
        </>
      ) : null}

      <View style={{
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)',
        borderRadius: 22, padding: narrow ? 18 : 26,
        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.7)',
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: cta ? 'flex-start' : 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <View style={{ flex: 1, minWidth: narrow ? 0 : 260, ...(narrow ? { flexBasis: '100%' as any } : null) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {leading}
              <Text style={{
                fontSize: 11, fontWeight: '500', letterSpacing: 1.1,
                textTransform: 'uppercase', color: kickerColor,
              }}>
                {kicker}
              </Text>
            </View>
            {title ? (
              <Text style={{ ...WHITE_HERO_DISPLAY, fontSize: narrow ? 30 : 44, letterSpacing: narrow ? -0.9 : -1.5, lineHeight: narrow ? 34 : 48, color: titleColor }}>
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text style={{ fontSize: 14, color: descColor, marginTop: 12, maxWidth: 520, lineHeight: 21 }}>
                {description}
              </Text>
            ) : null}
          </View>

          {cta ? <View style={{ alignSelf: 'flex-start' }}>{cta}</View> : null}

          {stats && stats.length > 0 ? (
            <View style={{
              flexDirection: 'row', flexWrap: 'wrap',
              gap: narrow ? 12 : (isDark ? 8 : 28),
              ...(narrow ? { width: '100%' as any, justifyContent: 'space-between' as const } : null),
            }}>
              {stats.map(st => (
                <View
                  key={st.label}
                  style={{
                    alignItems: 'flex-end',
                    flexShrink: 1, minWidth: 0,
                    ...(isDark ? {
                      minWidth: 92, paddingVertical: 8, paddingHorizontal: 12,
                      borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)',
                    } : null),
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ ...WHITE_HERO_DISPLAY, fontSize: narrow ? 22 : 40, letterSpacing: narrow ? -0.6 : -1.4, lineHeight: narrow ? 26 : 40, color: titleColor }}
                  >
                    {st.value}
                  </Text>
                  <Text style={{ fontSize: 10, color: kickerColor, textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 4 }}>
                    {st.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Serbest içerik başlık satırının ALTINDA, kartın TAM genişliğinde durur.
            Sol sütunun içinde kalırsa kutucuk şeritleri daralır ve sağa yaslanan
            bir şerit (alt sekmeler) sağ üstteki CTA ile hizalanamaz. */}
        {children}

        {actions ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: actionsAlign === 'end' ? 'flex-end' : 'flex-start' }}>
            {actions}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Beyaz hero'nun İÇİNDEKİ içerik için mürekkep/kutucuk renkleri.
 *
 * Hero açık temada AÇIK bir yüzey, koyu temada lacivert. Bu yüzden içerideki
 * metinler sabit beyaz KALAMAZ — açık temada kaybolurlar. Her beyaz-hero
 * kullanan ekran bu hook'tan okur, elle hex yazmaz.
 */
export function useWhiteHeroInk(accent?: string) {
  const U = useInkUI();
  const panel = usePanelTheme();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return {
    isDark,
    /**
     * Başlıktaki VURGULU rakamın rengi. Koyu temada accent lacivert zeminde
     * okunmaz → açık gök mavisi kullanılır (Prim Motoru ile aynı kural).
     */
    accentInk: isDark ? '#93C5FD' : (accent ?? panel.primary),
    ink:      isDark ? '#FFFFFF' : (U.ink[900] as string),
    inkSoft:  isDark ? 'rgba(255,255,255,0.85)' : (U.ink[500] as string),
    inkFaint: isDark ? 'rgba(255,255,255,0.60)' : (U.ink[400] as string),
    /** Hero içi istatistik kutucuğu. */
    tileBg:     isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.70)',
    tileBorder: isDark ? 'transparent' : 'rgba(255,255,255,0.9)',
    /** MoneyMultiX `onAccent` değeri — açık temada normal kart stili kalsın. */
    moneyOnAccent: isDark ? '#FFFFFF' : undefined,
  };
}
