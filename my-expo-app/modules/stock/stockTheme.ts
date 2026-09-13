/**
 * Stok & Depo — tema-farkında ink skalası ve yüzey stilleri.
 *
 * NEDEN: hub ekranları (StockScreen + Kurulum alt ekranları + Malzeme Talepleri)
 * renkleri `DS.ink[…]` ve modül seviyesinde sabit `#FFFFFF` stil nesnelerinden
 * alıyordu. Modül sabitleri hook çağıramadığı için koyu temada tüm kartlar beyaz,
 * metinler siyah kalıyordu. Buradaki hook aynı anahtarları döndürür — açık temada
 * DEĞERLER BİREBİR ESKİSİ (DS.ink) olduğu için açık tema hiç değişmez.
 *
 * Kullanım:
 *   const U = useStockUI();
 *   <View style={U.cardSolid}><Text style={{ color: U.ink[900] }}>…</Text></View>
 *
 * İlgili: core/theme/mobileDesignTokens.ts (MOBILE_TOKENS_DARK ile aynı palet).
 */
import { Platform } from 'react-native';
import { DS } from '../../core/theme/dsTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { buildInkUI } from '../../core/theme/inkScale';

export type { InkScale } from '../../core/theme/inkScale';

/** Stok hub'ına özel yüzeyler — ortak olanlar (cardSolid/tableCard/colHeader/
 *  modalOverlay/inputStyle…) core/theme/inkScale.ts'ten `...base` ile gelir. */
function build(isDark: boolean) {
  // Ink skalası + nötr yüzeyler TEK kaynaktan (core/theme/inkScale.ts).
  const base = buildInkUI(isDark);
  const { ink, surface, surfaceSoft, hairline, hairlineSoft, fieldBorder } = base;
  const shadow = Platform.OS === 'web'
    ? { boxShadow: isDark
        ? '0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)'
        : '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' }
    : {};

  return {
    ...base,
    /** Koyu pill zemini — `ink[900]` koyu temada krem olur. */
    darkPillBg: isDark ? '#F7F2E9' : DS.ink[900],

    sectionCard: {
      backgroundColor: surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: hairline,
      padding: 16,
      marginBottom: 12,
    } as any,

    modalSheet: {
      backgroundColor: surface,
      borderRadius: 24,
      width: '100%',
      maxWidth: 540,
      maxHeight: '92%',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: hairline,
      ...shadow,
    } as any,

    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 18,
      borderBottomWidth: 1,
      borderBottomColor: hairlineSoft,
    } as any,

    modalFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: hairlineSoft,
    } as any,

    fieldInput: {
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

    ghostBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: fieldBorder,
      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
    } as any,

    darkPillBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 9999,
      backgroundColor: isDark ? '#F7F2E9' : DS.ink[900],
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 80,
      justifyContent: 'center',
      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
    } as any,

  };
}

const LIGHT_UI = build(false);
const DARK_UI  = build(true);

export type StockUI = ReturnType<typeof build>;

/** Stok hub'ının açık/koyu yüzey + ink seti. İki nesne önceden kurulur (yeniden render'da tahsis yok). */
export function useStockUI(): StockUI {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return isDark ? DARK_UI : LIGHT_UI;
}

/** Yalnız ink skalası gereken yerler için kısayol. */
export function useInk() {
  return useStockUI().ink;
}
