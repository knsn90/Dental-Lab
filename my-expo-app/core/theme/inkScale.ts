/**
 * Tema-farkında ink skalası + nötr yüzeyler — `DS.ink[…]` kullanan ekranlar için.
 *
 * NEDEN: eski ekranlar rengi `DS.ink[900…50]` sabit skalasından ve modül seviyesinde
 * sabitlenmiş `#FFFFFF` stil nesnelerinden alıyor. Modül sabitleri hook çağıramadığı
 * için koyu temada kart beyaz / metin siyah kalıyordu. Bu hook aynı anahtarları
 * döndürür; **açık temadaki değerler birebir `DS.ink`** olduğu için bir ekranı
 * çevirmek açık temayı hiç değiştirmez.
 *
 *   const U = useInkUI();
 *   <View style={{ backgroundColor: U.surface, borderColor: U.hairline }}>
 *     <Text style={{ color: U.ink[900] }}>…</Text>
 *
 * Koyu palet `MOBILE_TOKENS_DARK` ile aynı: zemin #0E0E0E · kart #1B1916 ·
 * sub-card #141312 · ink #F7F2E9. Koyu temada gölge görünmez — derinlik
 * yüzey tonu + hairline ile kurulur (kart zeminden AÇILIR, koyulaşmaz).
 */
import { Platform } from 'react-native';
import { DS } from './dsTokens';
import { useThemeModeStore } from '../store/themeModeStore';

export type InkScale = {
  900: string; 800: string; 700: string; 500: string;
  400: string; 300: string; 200: string; 100: string; 50: string;
};

/** Koyu tema ink skalası — açık skalanın rol karşılıkları (metin → krem, yüzey → koyu). */
export const DARK_INK: InkScale = {
  900: '#F7F2E9',                      // birincil metin
  800: 'rgba(247,242,233,0.88)',
  700: 'rgba(247,242,233,0.78)',
  500: 'rgba(247,242,233,0.62)',       // ikincil metin
  400: 'rgba(247,242,233,0.45)',       // soluk metin / etiket
  300: 'rgba(255,255,255,0.24)',       // ayraç / çok soluk metin
  200: 'rgba(255,255,255,0.14)',       // kenarlık
  100: 'rgba(255,255,255,0.10)',       // kenarlık / yumuşak zemin
  50:  '#141312',                      // yumuşak yüzey (sub-card, satır zebra)
};

export function buildInkUI(isDark: boolean) {
  const ink = isDark ? DARK_INK : DS.ink;
  const surface     = isDark ? '#1B1916' : '#FFFFFF';
  const hairline    = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)';
  const fieldBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const shadow = Platform.OS === 'web'
    ? { boxShadow: isDark
        ? '0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)'
        : '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' }
    : {};
  return {
    isDark,
    ink,
    /** Kart yüzeyi — koyu temada sayfa zemininden AÇILIR. */
    surface,
    /** Sub-card / tablo başlığı / satır zebra. */
    surfaceSoft:  isDark ? '#141312' : '#FAFAFA',
    /** Sayfa zemini. */
    pageBg:       isDark ? '#0E0E0E' : '#FFFFFF',
    hairline,
    hairlineSoft: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
    fieldBorder,
    chipNeutral:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    /** Satır hover — koyu temada yüzeyden YÜKSELİR (ink[50] koyulaştırırdı). */
    rowHover:     isDark ? 'rgba(255,255,255,0.05)' : DS.ink[50],
    /**
     * DÜZ (beyaz) BUTON — açık temada `#FFFFFF` zemin + ince kenarlık olan her
     * buton/kapsül. Koyu temada kart yüzeyini KULLANMA: buton çoğu zaman kartın
     * ÜSTÜNDE durur, aynı ton olunca kaybolur. Bir kademe KOYU zemin + hairline
     * kenarlık + krem metin okunur ve dokunulabilir durur.
     *
     *   <Pressable style={{ backgroundColor: U.plainBtn.bg, borderWidth: 1,
     *                       borderColor: U.plainBtn.border }}>
     *     <Text style={{ color: U.plainBtn.fg }}>…</Text>
     */
    plainBtn: {
      bg:      isDark ? '#141312' : '#FFFFFF',
      hoverBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.02)',
      border:  isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
      fg:      isDark ? '#F7F2E9' : '#0A0A0A',
      fgMuted: isDark ? 'rgba(247,242,233,0.62)' : '#6B6B6B',
    },
    /** Segmented kontrolde aktif sekmenin yüzeyi. */
    segActive:    isDark ? 'rgba(255,255,255,0.14)' : '#FFFFFF',
    /** `ink[900]` zeminli pill üstündeki metin — koyu temada pill krem olur. */
    onDarkPill:      isDark ? '#141312' : '#FFFFFF',
    onDarkPillMuted: isDark ? 'rgba(20,19,18,0.55)' : 'rgba(255,255,255,0.5)',
    /** Modal arkası karartma. */
    scrim: isDark ? 'rgba(0,0,0,0.60)' : 'rgba(15,23,42,0.4)',

    chipTones: {
      success: isDark ? { bg: 'rgba(45,154,107,0.22)',  fg: '#7BD8AC' } : { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
      warning: isDark ? { bg: 'rgba(232,155,42,0.22)',  fg: '#F0C078' } : { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
      danger:  isDark ? { bg: 'rgba(217,75,75,0.22)',   fg: '#F3A0A0' } : { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
      info:    isDark ? { bg: 'rgba(74,143,201,0.22)',  fg: '#9BC6EC' } : { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
      neutral: isDark ? { bg: 'rgba(255,255,255,0.08)', fg: '#F7F2E9' } : { bg: 'rgba(0,0,0,0.05)',      fg: '#0A0A0A' },
    },

    // ── Paylaşılan tasarım-sistemi yüzeyleri ────────────────────────────
    // Bu nesneler Stok/İK/Performans/Dosyalar ekranlarında BİREBİR kopyalanmıştı;
    // tek yerde tutuluyor. Koyu temada gölge görünmez → kart, zeminden yüzey
    // tonu + hairline ile ayrılır (Apple: materyal ağırlığı hiyerarşi kurar).
    cardSolid: {
      backgroundColor: surface,
      borderRadius: 24,
      padding: 22,
      ...(isDark ? { borderWidth: 1, borderColor: hairline } : {}),
      ...shadow,
    } as any,

    tableCard: {
      backgroundColor: surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: hairline,
      overflow: 'hidden',
    } as any,

    inputStyle: {
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: fieldBorder,
      paddingHorizontal: 14,
      fontSize: 14,
      color: ink[900],
      backgroundColor: isDark ? '#141312' : '#FFFFFF',
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    } as any,

    colHeader: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      color: ink[500],
    } as any,

    modalOverlay: {
      flex: 1,
      backgroundColor: isDark ? 'rgba(0,0,0,0.62)' : 'rgba(15,23,42,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    } as any,

    modalCard: {
      backgroundColor: surface,
      borderRadius: 24,
      width: '100%',
      maxWidth: 520,
      maxHeight: '92%',
      overflow: 'hidden',
      ...(isDark ? { borderWidth: 1, borderColor: hairline } : {}),
      ...(Platform.OS === 'web'
        ? { boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.18)' }
        : {}),
    } as any,

    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: ink[100],
    } as any,

    modalTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: ink[900] } as any,

    modalCloseBtn: {
      width: 28, height: 28, borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      alignItems: 'center', justifyContent: 'center',
    } as any,
  };
}

const LIGHT = buildInkUI(false);
const DARK  = buildInkUI(true);

export type InkUI = ReturnType<typeof buildInkUI>;

/** İki nesne önceden kurulur — yeniden render'da tahsis yok. */
export function useInkUI(): InkUI {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return isDark ? DARK : LIGHT;
}
