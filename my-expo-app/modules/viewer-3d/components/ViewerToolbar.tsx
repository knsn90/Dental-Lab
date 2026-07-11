/**
 * ViewerToolbar — Pill-shaped vertical dock with inverse-contrast active state.
 *
 * Tasarım dili:
 *   • Kapsül şekli — dark mode'da beyaz, light mode'da koyu (kontrast)
 *   • Aktif buton: tam ters renkli dolu daire (page bg = active bg)
 *   • Hover'da sağa kayan tooltip pill (dock'un dışında, soldan görünür)
 *   • Gruplar arası ekstra dikey boşluk, separator yok
 */
import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import {
  Maximize2, RotateCcw, Box, ImageDown, Ruler, Scissors, Grid3x3, Layers, ScanLine, Magnet, Image as ImageIcon, Activity,
} from 'lucide-react-native';
import { PRESETS, type CameraPreset } from '../lib/cameraPresets';
import type { CutAxis } from '../types';
import { useViewerTheme } from '../lib/viewerTheme';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

interface Props {
  fov: number;
  onFovChange: (fov: number) => void;
  onPreset: (p: CameraPreset) => void;
  onFit: () => void;
  onReset: () => void;
  onScreenshot?: () => void;
  measureMode?: boolean;
  onToggleMeasure?: () => void;
  onClearMeasurements?: () => void;
  measurementCount?: number;
  cutAxis?: CutAxis;
  onCutAxisChange?: (a: CutAxis) => void;
  cutPosition?: number;
  onCutPositionChange?: (v: number) => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  layersOpen?: boolean;
  onToggleLayers?: () => void;
  xrayMode?: boolean;
  onToggleXray?: () => void;
  autoAlign?: boolean;
  onToggleAutoAlign?: () => void;
  /** Faz A: gülüş tasarımı fotoğraf overlay toggle */
  smileOpen?: boolean;
  onToggleSmile?: () => void;
  /** Kapanış (oklüzyon) analizi aç/kapat */
  occlusionActive?: boolean;
  onToggleOcclusion?: () => void;
}

interface DockColors {
  dockBg: string;
  dockFg: string;
  activeBg: string;
  activeFg: string;
  tooltipBg: string;
  tooltipFg: string;
  popBg: string;
  popFg: string;
  popBorder: string;
}

/**
 * Hex → rgba string. Alpha 0..1.
 */
function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function useDockColors(accent: string): DockColors {
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  // Beyaz pill + accent-renkli aktif buton (panel rengiyle vurgu).
  return {
    dockBg: '#FFFFFF',
    dockFg: '#27272A',
    activeBg: accent,
    activeFg: '#FFFFFF',
    // Tooltip: beyaz pill'e karşı koyu pill (kontrast)
    tooltipBg: '#27272A',
    tooltipFg: '#FFFFFF',
    popBg: isDark ? 'rgba(24,24,27,0.96)' : 'rgba(255,255,255,0.98)',
    popFg: isDark ? '#FAFAFA' : '#18181B',
    popBorder: hexAlpha(accent, 0.35),
  };
}

export function ViewerToolbar({
  fov, onFovChange, onPreset, onFit, onReset, onScreenshot,
  measureMode, onToggleMeasure, onClearMeasurements, measurementCount = 0,
  cutAxis = 'none', onCutAxisChange, cutPosition = 0, onCutPositionChange,
  showGrid, onToggleGrid,
  layersOpen, onToggleLayers,
  xrayMode, onToggleXray,
  autoAlign, onToggleAutoAlign,
  smileOpen, onToggleSmile,
  occlusionActive, onToggleOcclusion,
}: Props) {
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [fovOpen, setFovOpen] = useState(false);
  const [cutOpen, setCutOpen] = useState(false);
  const T = useViewerTheme();
  const D = useDockColors(T.accent);

  const closeMenus = () => { setPresetMenuOpen(false); setFovOpen(false); setCutOpen(false); };

  // Tool tanım listesi — gruplar arası ufak boşluk için "groupGap" işareti.
  type Item =
    | { kind: 'btn'; icon: any; label: string; onPress: () => void; active?: boolean }
    | { kind: 'gap' };

  const items: Item[] = [
    // VIEW
    { kind: 'btn', icon: Maximize2,  label: 'Sığdır', onPress: onFit },
    { kind: 'btn', icon: RotateCcw,  label: 'Sıfırla', onPress: onReset },
    {
      kind: 'btn', icon: Box, label: 'Görünüm açıları',
      active: presetMenuOpen,
      onPress: () => { setPresetMenuOpen(o => !o); setFovOpen(false); setCutOpen(false); },
    },
    { kind: 'gap' },
    // ANALYSIS
    ...(onToggleMeasure ? [{
      kind: 'btn' as const,
      icon: Ruler,
      label: measureMode ? `Ölçüm aktif (${measurementCount})` : 'Mesafe ölç',
      active: measureMode,
      onPress: onToggleMeasure!,
    }] : []),
    ...(onToggleOcclusion ? [{
      kind: 'btn' as const,
      icon: Activity,
      label: occlusionActive ? 'Kapanış analizi açık' : 'Kapanış analizi',
      active: !!occlusionActive,
      onPress: onToggleOcclusion!,
    }] : []),
    { kind: 'gap' },
    // DISPLAY
    ...(onToggleLayers ? [{
      kind: 'btn' as const,
      icon: Layers,
      label: layersOpen ? 'Katmanları gizle' : 'Katmanlar',
      active: !!layersOpen,
      onPress: onToggleLayers!,
    }] : []),
    ...(onToggleGrid ? [{
      kind: 'btn' as const,
      icon: Grid3x3,
      label: showGrid ? 'Izgara açık' : 'Izgara',
      active: !!showGrid,
      onPress: onToggleGrid!,
    }] : []),
    ...(onToggleXray ? [{
      kind: 'btn' as const,
      icon: ScanLine,
      label: xrayMode ? 'X-Ray açık' : 'X-Ray modu',
      active: !!xrayMode,
      onPress: onToggleXray!,
    }] : []),
    ...(onToggleSmile ? [{
      kind: 'btn' as const,
      icon: ImageIcon,
      label: smileOpen ? 'Gülüş foto açık' : 'Gülüş foto overlay',
      active: !!smileOpen,
      onPress: onToggleSmile!,
    }] : []),
    { kind: 'gap' },
    // WORKFLOW
    ...(onScreenshot ? [{
      kind: 'btn' as const,
      icon: ImageDown,
      label: 'Ekran görüntüsü',
      onPress: onScreenshot!,
    }] : []),
  ];

  return (
    <>
      <View style={{
        position: 'absolute', top: 14, right: 14,
        backgroundColor: D.dockBg,
        borderRadius: 999,
        paddingVertical: 8, paddingHorizontal: 6,
        alignItems: 'center',
        gap: 2,
        shadowColor: '#000',
        shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
        zIndex: 15,
      } as any}>
        {items.map((it, idx) => {
          if (it.kind === 'gap') return <View key={`g${idx}`} style={{ height: 10 }} />;
          return (
            <DockButton
              key={`b${idx}`}
              Icon={it.icon}
              label={it.label}
              active={!!it.active}
              onPress={it.onPress}
              D={D}
            />
          );
        })}
      </View>

      {/* ── Pop-out: Camera Presets ── */}
      {presetMenuOpen && (
        <PopCard D={D} top={28}>
          <PopHeader D={D}>Kamera Açıları</PopHeader>
          {PRESETS.map(p => (
            <Pressable
              key={p.key}
              onPress={() => { onPreset(p.key); closeMenus(); }}
              style={({ hovered }: any) => ({
                paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
                backgroundColor: hovered ? D.activeBg + '22' : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Text style={{ color: D.popFg, fontSize: 12.5, fontWeight: '600' }}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </PopCard>
      )}

      {/* ── Pop-out: FOV ── */}
      {fovOpen && (
        <PopCard D={D} top={86} width={220}>
          <PopHeader D={D}>Görüş Açısı</PopHeader>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 4 }}>
            <Text style={{ color: D.popFg, opacity: 0.55, fontSize: 10 }}>10° — 90°</Text>
            <View style={{
              paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
              backgroundColor: T.accent,
            }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{fov}°</Text>
            </View>
          </View>
          {Platform.OS === 'web' ? (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            React.createElement('input' as any, {
              type: 'range', min: 10, max: 90, step: 1, value: fov,
              onChange: (e: any) => onFovChange(parseInt(e.target.value, 10)),
              style: { width: '100%', accentColor: T.accent, cursor: 'pointer' },
            })
          ) : null}
        </PopCard>
      )}

      {/* ── Pop-out: Cut plane ── */}
      {cutOpen && onCutAxisChange && (
        <PopCard D={D} top={144} width={240}>
          <PopHeader D={D}>Kesit Düzlemi</PopHeader>
          <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8 }}>
            {(['none', 'x', 'y', 'z'] as const).map(ax => {
              const active = cutAxis === ax;
              return (
                <Pressable
                  key={ax}
                  onPress={() => onCutAxisChange(ax)}
                  style={({ hovered }: any) => ({
                    flex: 1, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: active ? D.activeBg : hovered ? D.activeBg + '22' : 'transparent',
                    alignItems: 'center',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Text style={{ color: active ? D.activeFg : D.popFg, fontSize: 11, fontWeight: '700' }}>
                    {ax === 'none' ? 'Yok' : ax.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {cutAxis !== 'none' && onCutPositionChange && (
            <View style={{ paddingHorizontal: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ color: D.popFg, opacity: 0.55, fontSize: 10 }}>Konum</Text>
                <View style={{
                  paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
                  backgroundColor: T.accent,
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{cutPosition.toFixed(1)} mm</Text>
                </View>
              </View>
              {Platform.OS === 'web' ? (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                React.createElement('input' as any, {
                  type: 'range', min: -50, max: 50, step: 0.5, value: cutPosition,
                  onChange: (e: any) => onCutPositionChange(parseFloat(e.target.value)),
                  style: { width: '100%', accentColor: T.accent, cursor: 'pointer' },
                })
              ) : null}
            </View>
          )}
        </PopCard>
      )}
    </>
  );
}

/* ──────────────────── DockButton ──────────────────── */
function DockButton({ Icon, label, active, onPress, D }: {
  Icon: any;
  label: string;
  active: boolean;
  onPress: () => void;
  D: DockColors;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        onPress={onPress}
        // RN-web hover support
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{
          width: 38, height: 38, borderRadius: 19,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: active
            ? D.activeBg
            : hovered ? D.activeBg + '18' : 'transparent',
          ...(Platform.OS === 'web' ? {
            cursor: 'pointer',
            transition: 'background-color 160ms ease',
          } as any : {}),
        } as any}
      >
        <Icon size={16} color={active ? D.activeFg : D.dockFg} strokeWidth={2} />
      </Pressable>

      {/* Hover tooltip pill — toolbar'ın sol tarafına çıkar */}
      {hovered && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', right: 48, top: '50%' as any,
            transform: [{ translateY: -13 }],
            backgroundColor: D.tooltipBg,
            paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 999,
            shadowColor: '#000', shadowOpacity: 0.20, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
            ...(Platform.OS === 'web' ? {
              whiteSpace: 'nowrap',
              animation: 'fadeInRight 140ms ease',
            } as any : {}),
          } as any}
        >
          <Text style={{
            color: D.tooltipFg, fontSize: 11.5, fontWeight: '600',
            letterSpacing: 0.1,
          }}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ──────────────────── PopCard ──────────────────── */
function PopCard({ D, top, width = 180, children }: {
  D: DockColors; top: number; width?: number; children: React.ReactNode;
}) {
  return (
    <View style={{
      position: 'absolute', right: 70, top,
      backgroundColor: D.popBg,
      borderRadius: 16, padding: 10,
      borderWidth: 1, borderColor: D.popBorder,
      width, gap: 2,
      shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
      zIndex: 16,
      ...(Platform.OS === 'web' ? { backdropFilter: 'blur(14px) saturate(1.2)' } as any : {}),
    } as any}>
      {children}
    </View>
  );
}

function PopHeader({ D, children }: { D: DockColors; children: React.ReactNode }) {
  return (
    <Text style={{
      color: D.popFg, opacity: 0.55,
      fontSize: 9, fontWeight: '800',
      letterSpacing: 0.9, textTransform: 'uppercase',
      paddingHorizontal: 6, paddingTop: 2, paddingBottom: 8,
    }}>
      {children}
    </Text>
  );
}
