import React, { useState } from 'react';
import { Platform, View, Text, useWindowDimensions } from 'react-native';
import Svg, { G, Path, Text as SvgText, Rect } from 'react-native-svg';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';
import { TOOTH_PATHS, TOOTH_LABEL_POS } from '../assets/toothPaths';

// ── FDI quadrant groups ──────────────────────────────────────────────
const Q1 = [18, 17, 16, 15, 14, 13, 12, 11]; // upper-right
const Q2 = [21, 22, 23, 24, 25, 26, 27, 28]; // upper-left
const Q3 = [31, 32, 33, 34, 35, 36, 37, 38]; // lower-left
const Q4 = [48, 47, 46, 45, 44, 43, 42, 41]; // lower-right

const UPPER_SET = new Set([11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28]);
const LOWER_SET = new Set([31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48]);

// ── SVG viewport ────────────────────────────────────────────────────
const VB_X = -320;
const VB_W = 3720;

// Full chart  Y: 200 → 4580
const FULL_VB  = { y: 200,  h: 4380 }; // both jaws
// Upper jaw   Y: 200 → 2420  (teeth 11-28 max-Y≈2145 + padding)
const UPPER_VB = { y: 200,  h: 2320 };
// Lower jaw   Y: 2460 → 4580 (teeth 31-48 min-Y≈2725 − padding)
const LOWER_VB = { y: 2460, h: 2120 };

// ── Props ────────────────────────────────────────────────────────────
interface Props {
  /** Currently selected FDI tooth numbers (11–48). */
  selected: number[];
  /** Called with the updated selection whenever a tooth is tapped. */
  onChange: (teeth: number[]) => void;
  /** Available pixel width of the containing box. */
  containerWidth?: number;
  /** Currently focused/active tooth (shows a ring highlight). */
  activeTooth?: number | null;
  /** Called when a tooth is pressed — if provided, overrides the default toggle. */
  onToothPress?: (fdi: number) => void;
  /** Called on hover enter/leave (web only). */
  onToothHover?: (fdi: number | null) => void;
  /** Short tooltip text per tooth (shown on hover as SVG overlay). */
  toothInfo?: Record<number, string>;
  /** Per-tooth fill color override (confirmed teeth colored by work type). */
  colorMap?: Record<number, string>;
  /** Override the primary accent color (default: theme PRIMARY). */
  accentColor?: string;
  /**
   * When true: eğer seçili dişler yalnızca üst ya da yalnızca alt çenedeyse,
   * boş çeneyi gizler ve SVG'yi yarıya küçültür.
   */
  hideEmptyJaw?: boolean;
}

// ── Component ────────────────────────────────────────────────────────
export function ToothNumberPicker({
  selected,
  onChange,
  containerWidth,
  activeTooth,
  onToothPress,
  onToothHover,
  toothInfo,
  colorMap,
  accentColor,
  hideEmptyJaw = false,
}: Props) {
  const PRIMARY = accentColor ?? C.primary;
  const { width: screenWidth } = useWindowDimensions();

  const dW = containerWidth
    ? Math.max(Math.round((containerWidth - 16) * 0.96), 160)
    : Math.min(Math.max(screenWidth - 80, 160), 340);

  // ── Çene tespiti ─────────────────────────────────────────────────
  const hasUpper = selected.some(t => UPPER_SET.has(t));
  const hasLower = selected.some(t => LOWER_SET.has(t));

  const jawMode: 'both' | 'upper' | 'lower' =
    hideEmptyJaw && selected.length > 0 && !(hasUpper && hasLower)
      ? hasUpper ? 'upper' : 'lower'
      : 'both';

  const activeVB = jawMode === 'upper' ? UPPER_VB
                 : jawMode === 'lower' ? LOWER_VB
                 : FULL_VB;

  const viewBox = `${VB_X} ${activeVB.y} ${VB_W} ${activeVB.h}`;
  const dH = Math.round(dW * (activeVB.h / VB_W));

  // Web-only hover state
  const [hoverTooth, setHoverTooth] = useState<number | null>(null);

  // Scale factors
  const svgPx     = VB_W / dW;
  const SW_MAIN   = svgPx * 2;
  const SW_DETAIL = svgPx * 1.3;
  const FONT_SZ   = svgPx * 10.5;
  const FONT_OUT  = svgPx * 2;

  const handlePress = (fdi: number) => {
    if (onToothPress) {
      onToothPress(fdi);
    } else {
      onChange(
        selected.includes(fdi)
          ? selected.filter(t => t !== fdi)
          : [...selected, fdi],
      );
    }
  };

  const handleHoverEnter = (fdi: number) => {
    setHoverTooth(fdi);
    onToothHover?.(fdi);
  };

  const handleHoverLeave = () => {
    setHoverTooth(null);
    onToothHover?.(null);
  };

  // Render a single tooth
  const renderTooth = (fdi: number) => {
    const paths = TOOTH_PATHS[fdi];
    const pos   = TOOTH_LABEL_POS[fdi];
    if (!paths || !pos) return null;

    const [cx, cy] = pos;

    const isSelected = selected.includes(fdi);
    const isActive   = fdi === activeTooth;
    const isHovered  = fdi === hoverTooth;
    const confirmedColor = colorMap?.[fdi]; // color assigned when tooth is confirmed

    // Fill: confirmed=assigned color, selected=primary, active=light, hovered=very light, default=white
    const fillColor = confirmedColor
      ? confirmedColor
      : isSelected
      ? PRIMARY
      : isActive
      ? '#F1F5F9'
      : isHovered
      ? '#F1F5F9'
      : '#FFFFFF';

    // Stroke: confirmed=assigned color (lighter if also active), selected/active=primary, default=gray
    const strokeColor = confirmedColor
      ? confirmedColor
      : isSelected || isActive
      ? PRIMARY
      : isHovered
      ? '#93C5FD'
      : '#94A3B8';

    const strokeWidth = isActive && !isSelected && !confirmedColor ? SW_MAIN * 2.2 : SW_MAIN;

    const detailColor = (confirmedColor || isSelected)
      ? 'rgba(255,255,255,0.38)'
      : isActive
      ? 'rgba(15,23,42,0.12)'
      : '#94A3B8';

    const textColor = (confirmedColor || isSelected) ? '#FFFFFF' : isActive ? '#0F172A' : '#475569';
    const haloColor = confirmedColor ?? (isSelected ? PRIMARY : isActive ? '#F1F5F9' : '#FFFFFF');

    const gProps: any = {
      onPress: () => handlePress(fdi),
    };

    // Web-only hover handlers
    if (Platform.OS === 'web') {
      gProps.onMouseEnter = () => handleHoverEnter(fdi);
      gProps.onMouseLeave = handleHoverLeave;
    }

    return (
      <G key={fdi} {...gProps}>
        {/* Active ring glow (rendered under the tooth) */}
        {isActive && (
          <Path
            d={paths[0]}
            fill="none"
            stroke="#93C5FD"
            strokeWidth={SW_MAIN * 5}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.4}
          />
        )}

        {/* Tooth outline */}
        <Path
          d={paths[0]}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Internal detail lines */}
        {paths.slice(1).map((d, i) => (
          <Path
            key={i}
            d={d}
            fill="none"
            stroke={detailColor}
            strokeWidth={isSelected ? SW_DETAIL * 1.8 : SW_DETAIL}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Number label — halo + fill */}
        <SvgText
          x={cx} y={cy}
          fontSize={FONT_SZ} fontWeight="700"
          fill={haloColor} stroke={haloColor}
          strokeWidth={FONT_OUT} strokeLinejoin="round"
          textAnchor="middle"
          // @ts-ignore
          dominantBaseline="central"
        >
          {String(fdi)}
        </SvgText>
        <SvgText
          x={cx} y={cy}
          fontSize={FONT_SZ} fontWeight="700"
          fill={textColor}
          textAnchor="middle"
          // @ts-ignore
          dominantBaseline="central"
        >
          {String(fdi)}
        </SvgText>
      </G>
    );
  };

  // Hover tooltip rendered as SVG overlay
  const renderHoverTooltip = () => {
    if (!hoverTooth) return null;
    const pos = TOOTH_LABEL_POS[hoverTooth];
    if (!pos) return null;
    const [cx, cy] = pos;
    const label  = String(hoverTooth);
    const info   = toothInfo?.[hoverTooth] ?? '';
    const text   = info ? `${label} · ${info}` : label;
    const textLen = text.length;

    // Tooltip box dimensions in SVG units
    const TW = svgPx * (textLen * 5.5 + 14);
    const TH = svgPx * 18;
    const TR = svgPx * 5;
    const FS = svgPx * 8.5;
    const PAD = svgPx * 4;

    // Position tooltip above the tooth
    const tx = cx - TW / 2;
    const ty = cy - TH - svgPx * 22;

    return (
      <G key="tooltip" pointerEvents="none">
        {/* Shadow rect */}
        <Rect
          x={tx + svgPx} y={ty + svgPx * 1.5}
          width={TW} height={TH}
          rx={TR} ry={TR}
          fill="rgba(0,0,0,0.12)"
        />
        {/* Background */}
        <Rect
          x={tx} y={ty}
          width={TW} height={TH}
          rx={TR} ry={TR}
          fill="#1E293B"
        />
        {/* Text */}
        <SvgText
          x={cx} y={ty + TH / 2}
          fontSize={FS} fontWeight="600"
          fill="#FFFFFF"
          textAnchor="middle"
          // @ts-ignore
          dominantBaseline="central"
        >
          {text}
        </SvgText>
      </G>
    );
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={dW} height={dH} viewBox={viewBox}>
        {/* Üst çene: jawMode lower değilse göster */}
        {jawMode !== 'lower' && [...Q1, ...Q2].map(renderTooth)}
        {/* Alt çene: jawMode upper değilse göster */}
        {jawMode !== 'upper' && [...Q4, ...Q3].map(renderTooth)}
        {renderHoverTooltip()}
      </Svg>

      {/* Selection summary strip */}
      {selected.length > 0 && (
        <View style={{
          flexDirection: 'row', flexWrap: 'wrap',
          marginTop: 8, padding: 8,
          backgroundColor: '#F1F5F9',
          borderRadius: 10, alignSelf: 'stretch',
        }}>
          <Text style={{ fontSize: 11, color: '#64748B', fontFamily: F.medium }}>
            Seçili:{' '}
          </Text>
          <Text style={{ fontSize: 11, color: PRIMARY, fontFamily: F.semibold, flex: 1 }}>
            {[...selected].sort((a, b) => a - b).join(', ')}
          </Text>
        </View>
      )}
    </View>
  );
}
