import React, { useState, useEffect } from 'react';
import { Platform, View, Text, useWindowDimensions } from 'react-native';
import Svg, { G, Path, Text as SvgText, Rect, Circle } from 'react-native-svg';

// Web tarafında "tooth-active-pulse" keyframes — bir kez document.head'e enjekte
function injectToothPulseKeyframes() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const id = 'tooth-active-pulse-keyframes';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    @keyframes tooth-active-pulse {
      0%, 100% { transform: scale(1);    opacity: 0.40; }
      50%      { transform: scale(1.18); opacity: 0.10; }
    }
    .tooth-active-halo {
      animation: tooth-active-pulse 2s ease-in-out infinite;
      transform-box: fill-box;
      transform-origin: center;
      will-change: transform, opacity;
    }
    @keyframes tooth-selected-working {
      0%, 100% { opacity: 0.00; transform: scale(1.00); }
      50%      { opacity: 0.55; transform: scale(1.08); }
    }
    .tooth-selected-halo {
      animation: tooth-selected-working 2.4s ease-in-out infinite;
      transform-box: fill-box;
      transform-origin: center;
      will-change: transform, opacity;
    }
    @keyframes tooth-selected-breathe {
      0%, 100% { opacity: 1.00; }
      50%      { opacity: 0.85; }
    }
    .tooth-selected-breathe {
      animation: tooth-selected-breathe 2.4s ease-in-out infinite;
      will-change: opacity;
    }
  `;
  document.head.appendChild(style);
}
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
// ViewBox'lar dişleri sıkı çevreler — etrafta görünmez boşluk yok.
// Çene etiketleri için tutarlı dar padding (≈80 unit)
const FULL_VB  = { y: 200,  h: 4200 };   // 200 → 4400, kırpık padding
const UPPER_VB = { y: 200,  h: 2080 };   // 200 → 2280: teeth max-Y≈2145 + ÜST ÇENE label
const LOWER_VB = { y: 2400, h: 2000 };   // 2400 → 4400: ALT ÇENE label + teeth

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
  /**
   * Açıkça hangi çenenin gösterileceğini zorla.
   * 'upper' | 'lower' | 'both' — verilirse `hideEmptyJaw` heuristic'inin
   * önüne geçer ve seçili dişten bağımsız olarak ilgili çene render edilir.
   */
  forceJawMode?: 'upper' | 'lower' | 'both';
  /**
   * Opsiyonel: SVG yüksekliğini override et (aspect-ratio kilidini kır).
   * Verilirse `preserveAspectRatio` ile birlikte kullanılır.
   * Default: dW * (vbH / vbW) — aspect korunur.
   */
  containerHeight?: number;
  /**
   * SVG `preserveAspectRatio` davranışı.
   *  - 'meet'  (default): aspect korunur, boş alan oluşabilir
   *  - 'slice': aspect korunur, fazlalık kırpılır → dişler büyür
   *  - 'none' : aspect korunmaz → dişler çarpık görünebilir
   */
  fit?: 'meet' | 'slice' | 'none';
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
  forceJawMode,
  containerHeight,
  fit = 'meet',
}: Props) {
  const PRIMARY = accentColor ?? C.primary;
  const { width: screenWidth } = useWindowDimensions();

  // Web: keyframes (active + selected pulse) bir kez document.head'e enjekte et
  useEffect(() => { injectToothPulseKeyframes(); }, []);

  const dW = containerWidth
    ? Math.max(Math.round(containerWidth - 16), 160)
    : Math.min(Math.max(screenWidth - 80, 160), 500);

  // ── Çene tespiti ─────────────────────────────────────────────────
  const hasUpper = selected.some(t => UPPER_SET.has(t));
  const hasLower = selected.some(t => LOWER_SET.has(t));

  const jawMode: 'both' | 'upper' | 'lower' =
    forceJawMode
      ? forceJawMode
      : hideEmptyJaw && selected.length > 0 && !(hasUpper && hasLower)
        ? hasUpper ? 'upper' : 'lower'
        : 'both';

  // ── Yatay tightening: sadece bir kadran seçiliyse boş tarafı kırp ──
  // SVG GÖRSEL düzeni (hasta karşımızdaymış gibi):
  //   Q1 (11-18, hasta sağ) → VIEWER SOL  ← x küçük
  //   Q2 (21-28, hasta sol) → VIEWER SAĞ  ← x büyük
  //   Q3 (31-38, hasta sol) → VIEWER SAĞ
  //   Q4 (41-48, hasta sağ) → VIEWER SOL
  const hasQ1 = selected.some(t => t >= 11 && t <= 18);
  const hasQ2 = selected.some(t => t >= 21 && t <= 28);
  const hasQ3 = selected.some(t => t >= 31 && t <= 38);
  const hasQ4 = selected.some(t => t >= 41 && t <= 48);

  // Çeyrek-çene kırpması devre dışı — yalnızca yarı çene (üst/alt) gösterilir.
  // Tek kadranda iş olsa bile boş kadran açıkta tutulur, görsel olarak yarı çene.
  const onlyLeft  = false;
  const onlyRight = false;
  void hasQ1; void hasQ2; void hasQ3; void hasQ4;

  const activeVB = jawMode === 'upper' ? UPPER_VB
                 : jawMode === 'lower' ? LOWER_VB
                 : FULL_VB;

  // Çeyrek çene viewBox — tek kadranda seçim varsa orta hattan (11/21 veya 31/41) kes
  // VB_X=-320, VB_W=3720 → merkez x=1540, sağ uç=3400, sol uç=-320
  // Sol çeyrek (Q1/Q4):  -320 → 1540, width = 1860
  // Sağ çeyrek (Q2/Q3):  1540 → 3400, width = 1860
  const CENTER_X       = -320 + 3720 / 2;            // 1540
  const QUARTER_WIDTH  = 3720 / 2;                   // 1860

  // Çeyrek modda viewBox margin yok — label diş şemasının İÇİNDE durur
  const isQuarter = onlyLeft || onlyRight;

  const vbX = onlyRight ? CENTER_X : VB_X;
  const vbW = isQuarter ? QUARTER_WIDTH : VB_W;

  // Label POSITION — U-arch INTERIOR (iç kenara yakın, dişlerin iç oyuğunda)
  //   Q1 (onlyLeft, upper):  iç kenar = SAĞ taraf (midline yakın), interior y=middle
  //   Q2 (onlyRight, upper): iç kenar = SOL taraf (midline yakın), interior y=middle
  //   Q3/Q4 (lower): aynı mantık
  const LABEL_INSET_FROM_INNER = 180;
  const quarterLabelX =
    onlyLeft  ? vbX + vbW - LABEL_INSET_FROM_INNER :   // Q1/Q4: SAĞ iç kenar
    onlyRight ? vbX + LABEL_INSET_FROM_INNER :         // Q2/Q3: SOL iç kenar
    0;
  const quarterLabelY = activeVB.y + activeVB.h * 0.55;  // U-arch ortası (interior)

  const viewBox = `${vbX} ${activeVB.y} ${vbW} ${activeVB.h}`;
  const dH = Math.round(dW * (activeVB.h / vbW));

  // Web-only hover state
  const [hoverTooth, setHoverTooth] = useState<number | null>(null);

  // Scale factors — aktif viewBox genişliği kullan (kırpma uygulanmışsa daha küçük)
  const svgPx     = vbW / dW;
  const SW_MAIN   = svgPx * 1.1;     // ana hat — incelendi (2 → 1.1)
  const SW_DETAIL = svgPx * 0.7;     // detay (oluk vs.) — incelendi (1.3 → 0.7)
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

    // Fill: confirmed=assigned color, selected=primary, active=light, hovered=very light, default=TRANSPARENT
    const fillColor = confirmedColor
      ? confirmedColor
      : isSelected
      ? PRIMARY
      : isActive
      ? '#F1F5F9'
      : isHovered
      ? '#F1F5F9'
      : 'transparent';                          // seçili olmayan: transparan

    // Stroke: confirmed/selected/active = canlı renk, default = SOLUK gri (transparan hissi)
    const strokeColor = confirmedColor
      ? confirmedColor
      : isSelected || isActive
      ? PRIMARY
      : isHovered
      ? '#93C5FD'
      : 'rgba(148,163,184,0.35)';                // slate-400 alpha 35% — soluk

    const strokeWidth = isActive && !isSelected && !confirmedColor ? SW_MAIN * 2.2 : SW_MAIN;

    const detailColor = (confirmedColor || isSelected)
      ? 'rgba(255,255,255,0.38)'
      : isActive
      ? 'rgba(15,23,42,0.12)'
      : 'rgba(148,163,184,0.35)';                // detay çizgileri de soluk

    const textColor = (confirmedColor || isSelected)
      ? '#FFFFFF'
      : isActive
      ? '#0F172A'
      : 'rgba(71,85,105,0.45)';                  // numaraları da soluk

    const haloColor = confirmedColor ?? (isSelected ? PRIMARY : isActive ? '#F1F5F9' : 'transparent');

    // Sadece SEÇİLİ dişler tıklanabilir (popup için).
    // onToothPress yoksa (seçim modu): hepsi tıklanabilir.
    const isInteractive = onToothPress ? isSelected : true;

    const gProps: any = isInteractive
      ? { onPress: () => handlePress(fdi) }
      : { pointerEvents: 'none' };       // tıklamayı/hover'ı engelle

    // Web-only hover handlers — sadece interactive dişlerde
    if (Platform.OS === 'web' && isInteractive) {
      gProps.onMouseEnter = () => handleHoverEnter(fdi);
      gProps.onMouseLeave = handleHoverLeave;
      // @ts-ignore — RN-Web cursor passthrough
      gProps.style = { cursor: 'pointer' };
    } else if (Platform.OS === 'web' && !isInteractive) {
      // @ts-ignore
      gProps.style = { cursor: 'default' };
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

        {/* "Üzerinde çalışılıyor" — seçili dişler için yumuşak pulse halo (web) */}
        {Platform.OS === 'web' && (isSelected || !!confirmedColor) && (
          <Path
            // @ts-ignore — RN-Web SVG className passthrough
            className="tooth-selected-halo"
            d={paths[0]}
            fill="none"
            stroke={confirmedColor ?? PRIMARY}
            strokeWidth={SW_MAIN * 4}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0}
          />
        )}

        {/* Tooth outline */}
        <Path
          // @ts-ignore — seçili dişlerde fill nefes alır gibi (web only)
          className={Platform.OS === 'web' && (isSelected || !!confirmedColor) ? 'tooth-selected-breathe' : undefined}
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

        {/* Number label — halo + fill (Outfit fontu) */}
        <SvgText
          x={cx} y={cy}
          fontSize={FONT_SZ} fontWeight="700"
          fontFamily={F.bold}
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
          fontFamily={F.bold}
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
          fontFamily={F.semibold}
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

  // Çene label pozisyonları (viewBox koordinatlarında, x merkezde)
  const JAW_LABEL_CX = vbX + vbW / 2;              // aktif viewBox merkezi (kırpılmış olabilir)
  const JAW_LABEL_FS = 140;                         // viewBox-relative font size
  const JAW_LABEL_FILL = 'rgba(148,163,184,0.55)';  // slate-400 alpha

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg
        width={dW}
        height={containerHeight ?? dH}
        viewBox={viewBox}
        preserveAspectRatio={
          fit === 'none'  ? 'none'                :
          fit === 'slice' ? 'xMidYMid slice'      :
                            'xMidYMid meet'
        }
      >
        {/* Üst çene: jawMode lower değilse göster */}
        {jawMode !== 'lower' && [...Q1, ...Q2].map(renderTooth)}
        {/* Alt çene: jawMode upper değilse göster */}
        {jawMode !== 'upper' && [...Q4, ...Q3].map(renderTooth)}

        {/* ── Çene etiketleri — full modda yatay (orta), çeyrek modda dikey (dış kenar) ── */}
        {jawMode !== 'lower' && !isQuarter && (
          <SvgText
            x={JAW_LABEL_CX}
            y={2120}
            fontSize={JAW_LABEL_FS}
            fontWeight="700"
            fontFamily={F.bold}
            fill={JAW_LABEL_FILL}
            textAnchor="middle"
            // @ts-ignore
            dominantBaseline="central"
            // @ts-ignore
            pointerEvents="none"
          >
            ÜST ÇENE
          </SvgText>
        )}
        {jawMode !== 'upper' && !isQuarter && (
          <SvgText
            x={JAW_LABEL_CX}
            y={2460}
            fontSize={JAW_LABEL_FS}
            fontWeight="700"
            fontFamily={F.bold}
            fill={JAW_LABEL_FILL}
            textAnchor="middle"
            // @ts-ignore
            dominantBaseline="central"
            // @ts-ignore
            pointerEvents="none"
          >
            ALT ÇENE
          </SvgText>
        )}

        {/* Çeyrek mod: dış kenarda dikey küçük etiket (dişlere binmez) */}
        {isQuarter && (
          <SvgText
            x={quarterLabelX}
            y={quarterLabelY}
            fontSize={90}
            fontWeight="700"
            fontFamily={F.bold}
            fill={JAW_LABEL_FILL}
            textAnchor="middle"
            // @ts-ignore
            dominantBaseline="central"
            // @ts-ignore
            pointerEvents="none"
            transform={`rotate(${onlyLeft ? -90 : 90}, ${quarterLabelX}, ${quarterLabelY})`}
          >
            {jawMode === 'upper' ? 'ÜST ÇENE' : 'ALT ÇENE'}
          </SvgText>
        )}

        {renderHoverTooltip()}
      </Svg>

      {/* "Seçili: ..." özet satırı kaldırıldı */}
    </View>
  );
}
