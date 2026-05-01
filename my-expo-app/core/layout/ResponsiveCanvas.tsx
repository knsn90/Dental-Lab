/**
 * ResponsiveCanvas — Tüm yeni ekranlar bu bileşenle sarılır
 *
 *  Otomatik olarak:
 *    • Mobile  → tam genişlik, padding 16
 *    • Tablet  → padding 24
 *    • Desktop → max-width 1280px, ortalanır, padding 40
 *
 *  Kullanım:
 *    <ResponsiveCanvas>
 *      <Text className="text-2xl font-bold">Başlık</Text>
 *      ...
 *    </ResponsiveCanvas>
 *
 *  Variant:
 *    size="sm"  → 720px max (form, settings)
 *    size="md"  → 980px max (orta yoğunluk)
 *    size="lg"  → 1280px max (default — dashboard, liste)
 *    size="xl"  → 1440px max (geniş tablo, kanban)
 */
import React from 'react';
import { View, ScrollView, ScrollViewProps, ViewProps } from 'react-native';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const MAX_WIDTH: Record<Size, string> = {
  sm: 'max-w-prose',     // 720px
  md: 'max-w-canvasMd',  // 980px
  lg: 'max-w-canvas',    // 1280px
  xl: 'max-w-canvasLg',  // 1440px
};

export interface ResponsiveCanvasProps extends ViewProps {
  size?:        Size;
  /** Default: true — ScrollView olarak render edilir. false ise sade View. */
  scroll?:      boolean;
  /** ScrollView'a ekstra props */
  scrollProps?: ScrollViewProps;
  /** Page background'ı override (default: #F1F5F9) */
  bgClassName?: string;
  /** Padding override */
  padClassName?:string;
}

export function ResponsiveCanvas({
  size = 'lg',
  scroll = true,
  children,
  scrollProps,
  bgClassName = 'bg-page',
  padClassName = 'px-4 sm:px-6 lg:px-10 py-6',
  className,
  ...rest
}: ResponsiveCanvasProps) {
  const widthClass = MAX_WIDTH[size];

  const content = (
    <View
      className={`${widthClass} mx-auto w-full ${padClassName} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </View>
  );

  if (!scroll) {
    return <View className={`flex-1 ${bgClassName}`}>{content}</View>;
  }

  return (
    <ScrollView
      className={`flex-1 ${bgClassName}`}
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      {...scrollProps}
    >
      {content}
    </ScrollView>
  );
}
