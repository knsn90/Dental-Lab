// useScreenInsets — Tutarlı safe area + bottom navbar clearance.
//
// Mobile dashboards ve list ekranlarında ortak pattern:
//   - paddingTop = insets.top + 8 (status bar + dynamic island clearance)
//   - paddingBottom = 120 (PillTabBar yüksekliği + insets.bottom)
//   - Desktop: yatay padding farklı, top safe area gerekmez
//
// Kullanım:
//   const { contentContainerStyle } = useScreenInsets({ isDesktop, paddingX: 16 });
//   <ScrollView contentContainerStyle={contentContainerStyle}>...</ScrollView>

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';

interface Options {
  isDesktop?: boolean;
  /** Yatay padding. Default: mobile 16, desktop 10 */
  paddingX?: number;
  /** Üst ekstra padding (safe area + bunun toplamı). Default: 8 */
  topExtra?: number;
  /** Alt boşluk (navbar yüksekliği için). Default: 120 */
  bottom?: number;
}

export function useScreenInsets({ isDesktop = false, paddingX, topExtra = 8, bottom = 120 }: Options = {}) {
  const insets = useSafeAreaInsets();
  const px = paddingX ?? (isDesktop ? 10 : 16);

  const contentContainerStyle: ViewStyle = {
    paddingHorizontal: px,
    paddingTop: isDesktop ? topExtra : insets.top + topExtra,
    paddingBottom: bottom,
  };

  return {
    insets,
    contentContainerStyle,
    /** Direct top padding for non-scroll containers */
    paddingTop: isDesktop ? topExtra : insets.top + topExtra,
    paddingBottom: bottom,
  };
}
