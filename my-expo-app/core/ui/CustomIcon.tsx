/**
 * CustomIcon — Stroke-style SVG icon component
 *
 * Uses path data from /assets/icons/customIconData.ts (386 stroke icons).
 * Pass `color` to tint the stroke; fill is always transparent.
 */
import React from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { CUSTOM_ICONS } from '../../assets/icons/customIconData';

export interface CustomIconProps {
  /** Icon number: 1–386 */
  n: number;
  size?: number;
  color?: string;
  style?: any;
}

export function CustomIcon({ n, size = 24, color = '#000000', style }: CustomIconProps) {
  const data = CUSTOM_ICONS[n];
  if (!data) return null;

  // Extract viewBox width to compute a scale-invariant stroke width.
  // visual px = factor × size  →  0.04 × 28px ≈ 1.1px
  const vbWidth = parseFloat(data.viewBox.split(' ')[2]) || 328;
  const strokeWidth = vbWidth * 0.028;

  return (
    <Svg
      viewBox={data.viewBox}
      width={size}
      height={size}
      style={style}
    >
      <G
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={data.strokeLinecap as any}
        strokeLinejoin={data.strokeLinejoin as any}
      >
        {data.paths.map((d, i) => (
          <Path key={i} d={d} />
        ))}
      </G>
    </Svg>
  );
}
