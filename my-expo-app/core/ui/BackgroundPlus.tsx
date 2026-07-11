/**
 * BackgroundPlus — heropatterns "plus" deseni (RN-Web uyumlu).
 *
 * Web: inline SVG data-uri tile + radial mask (fade)
 * Native: no-op (görsel arka plan deseni desktop/web içindir)
 */
import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';

interface Props {
  plusSize?: number;
  plusColor?: string;
  plusOpacity?: number;       // 0..1
  backgroundColor?: string;
  fade?: boolean;
  style?: any;
}

export const BackgroundPlus: React.FC<Props> = ({
  plusColor = '#E0A82E',
  plusOpacity = 0.4,
  backgroundColor = 'transparent',
  plusSize = 60,
  fade = true,
  style,
}) => {
  if (Platform.OS !== 'web') return null;

  const encodedColor = encodeURIComponent(plusColor);
  const op = plusOpacity.toFixed(2);

  const svg =
    `%3Csvg width='${plusSize}' height='${plusSize}' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E` +
    `%3Cg fill='none' fill-rule='evenodd'%3E` +
    `%3Cg fill='${encodedColor}' fill-opacity='${op}'%3E` +
    `%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E` +
    `%3C/g%3E%3C/g%3E%3C/svg%3E`;

  const webStyle: any = {
    backgroundColor,
    backgroundImage: `url("data:image/svg+xml,${svg}")`,
    ...(fade
      ? {
          maskImage: 'radial-gradient(circle, white 10%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(circle, white 10%, transparent 90%)',
        }
      : {}),
  };

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, webStyle, style]}
    />
  );
};

export default BackgroundPlus;
