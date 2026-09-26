// GlassTooltip — site geneli hover balonu (tasarım dili §5 "GlassTooltip").
// Web sürümü: GlassTooltip.web.tsx (liquid glass balon, body'ye portal).
// Native'de hover yok, dokunma = eylem → balon çizilmez; sarılan öğeye aynı
// metni `accessibilityHint` olarak ver.
import React from 'react';
import { View } from 'react-native';

export type GlassTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface GlassTooltipProps {
  children: React.ReactNode;
  /** Kalın ilk satır (genelde butonun adı). */
  title?: string;
  /** Ne işe yaradığını anlatan açıklama. */
  text: string;
  /** Tercih edilen yön; sığmazsa ters yöne döner. Varsayılan `top`. */
  placement?: GlassTooltipPlacement;
  /** Balon genişliği (px). Varsayılan 190. */
  width?: number;
  /** Sarmalayıcı stili. Sarmalayıcı düzende şeffaftır (kendi hizası yok); sarılan öğe
   *  `flex: 1` ile büyüyorsa aynı `flex`'i buraya da ver. */
  style?: any;
  /** false → balon gösterilmez (ör. devre dışı düğme). */
  enabled?: boolean;
}

export function GlassTooltip({ children, style }: GlassTooltipProps) {
  return style ? <View style={style}>{children}</View> : <>{children}</>;
}
