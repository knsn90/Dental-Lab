import React from 'react';
import { Platform, View } from 'react-native';

import { AppIcon } from '../../core/ui/AppIcon';

interface DentistIconProps {
  size?: number;
  color?: string;
}

/**
 * Custom dentist icon — doctor figure with medical cap + tooth.
 * Web: inline SVG  |  Native: MaterialCommunityIcons fallback
 */
export function DentistIcon({ size = 24, color = '#000000' }: DentistIconProps) {
  if (Platform.OS === 'web') {
    return (
      <View style={{ width: size, height: size }}>
        {/* @ts-ignore — SVG is valid on web */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* ── Doctor figure (left) ── */}

          {/* Head */}
          {/* @ts-ignore */}
          <circle cx="8" cy="10" r="3" />

          {/* Cap — curved top */}
          {/* @ts-ignore */}
          <path d="M5 9.5 Q8 5.5 11 9.5" />
          {/* @ts-ignore */}
          <line x1="4.5" y1="9.5" x2="11.5" y2="9.5" />

          {/* Medical cross on cap */}
          {/* @ts-ignore */}
          <line x1="7.25" y1="7.5" x2="8.75" y2="7.5" />
          {/* @ts-ignore */}
          <line x1="8" y1="6.75" x2="8" y2="8.25" />

          {/* Shoulders / body */}
          {/* @ts-ignore */}
          <path d="M3.5 20 C3.5 15.5 5.5 14 8 14 C10.5 14 12.5 15.5 12.5 20" />

          {/* Lab coat V-neck collar */}
          {/* @ts-ignore */}
          <path d="M6.5 14 L8 16.5 L9.5 14" />

          {/* ── Tooth (right) ── */}
          {/* @ts-ignore */}
          <path d="
            M18 4
            C 16 4 15 5.5 15 7.5
            C 15 10.5 15.5 12.5 16 14
            C 16.25 14.75 16.75 15 17 14
            C 17.25 13.25 17.5 12.5 18 12.5
            C 18.5 12.5 18.75 13.25 19 14
            C 19.25 15 19.75 14.75 20 14
            C 20.5 12.5 21 10.5 21 7.5
            C 21 5.5 20 4 18 4 Z
          " />
        </svg>
      </View>
    );
  }

  // Native fallback
  return <AppIcon name="account-circle-outline" size={size} color={color} />;
}
