/**
 * SmileOverlay — Faz A: 2D gülüş foto overlay (manuel hizalama).
 *
 * Canvas üzerinde yarı şeffaf foto + drag/zoom/opaklık/aynalama kontrolleri.
 * Kullanıcı 3D çene modelini fotoğraftaki dişlerle çakıştırır.
 *
 * Faz B (ileri): Bezier smile arc, otomatik incisal-tip snap.
 * Faz C (ileri): MediaPipe face landmark auto-align.
 */
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Image as ImageIcon, FlipHorizontal2, X, RotateCw, Spline, Eraser, MoveHorizontal, Sparkles, Loader2 } from '../../../core/ui/icons';
import type { ReferenceImage } from '../types';
import { detectFace, type FaceLandmarks } from '../lib/faceDetect';

interface Props {
  images: ReferenceImage[];
  visible: boolean;
  onClose: () => void;
  /** Toolbar accent rengi — panel'e uygun pill butonlar için */
  accent: string;
  /** Smile arc çizildiğinde "Eğriye hizala" → 3D model rotation. */
  onApplyCurveRoll?: (deg: number) => void;
}

interface Transform {
  x: number;       // px translate
  y: number;
  scale: number;   // 0.1 - 3.0
  rotation: number; // deg
  opacity: number; // 0..1
  flipX: boolean;
}

const DEFAULT_T: Transform = {
  x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.55, flipX: false,
};

interface Point { x: number; y: number; }
type DrawMode = 'none' | 'curve' | 'guides';

export function SmileOverlay({ images, visible, onClose, accent, onApplyCurveRoll }: Props) {
  const [activeId, setActiveId] = useState<string | null>(images[0]?.id ?? null);
  const [t, setT] = useState<Transform>(DEFAULT_T);
  const dragRef = useRef<{ x0: number; y0: number; tx0: number; ty0: number } | null>(null);
  // Faz B: Smile arc + reference guides
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [curvePts, setCurvePts] = useState<Point[]>([]);
  const [showGuides, setShowGuides] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // Faz C: MediaPipe auto-detect
  const [detecting, setDetecting] = useState(false);
  const [detectErr, setDetectErr] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<FaceLandmarks | null>(null);

  if (!visible || images.length === 0) return null;
  const active = images.find((i) => i.id === activeId) ?? images[0];
  if (!active) return null;

  const updateT = (patch: Partial<Transform>) => setT((s) => ({ ...s, ...patch }));

  // Web pointer drag handlers
  const onPointerDown = (e: any) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault?.();
    dragRef.current = { x0: e.clientX, y0: e.clientY, tx0: t.x, ty0: t.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: any) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x0;
    const dy = e.clientY - dragRef.current.y0;
    setT((s) => ({ ...s, x: dragRef.current!.tx0 + dx, y: dragRef.current!.ty0 + dy }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  // Wheel zoom
  const onWheel = (e: any) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault?.();
    const delta = e.deltaY > 0 ? 0.94 : 1.06;
    setT((s) => ({ ...s, scale: Math.max(0.1, Math.min(3, s.scale * delta)) }));
  };

  if (Platform.OS !== 'web') return null;

  // Click handler — overlay container'a göre relative koordinat
  const onOverlayClick = (e: any) => {
    if (drawMode !== 'curve') return;
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setCurvePts((pts) => (pts.length >= 5 ? pts : [...pts, { x: px, y: py }]));
  };

  // ── Auto-detect (MediaPipe Face Landmarker) ────────────────────────
  const handleAutoDetect = async () => {
    setDetecting(true);
    setDetectErr(null);
    try {
      const lms = await detectFace(active.url);
      if (!lms) {
        setDetectErr('Yüz bulunamadı');
        setLandmarks(null);
        return;
      }
      setLandmarks(lms);
      // Foto'yu inter-pupillary line yatay olacak şekilde döndür (level eyes).
      // Pupil tilt pozitifse (sağ göz aşağıdaysa), foto'yu -tilt kadar döndürerek
      // eksenleri yatayla hizalarız.
      setT((s) => ({ ...s, rotation: -lms.pupilTiltDeg }));
      // 3D çene için de aynı tilt → simetri için
      if (onApplyCurveRoll) onApplyCurveRoll(-lms.pupilTiltDeg);
    } catch (e: any) {
      setDetectErr(e?.message || 'Tespit başarısız');
      setLandmarks(null);
    } finally {
      setDetecting(false);
    }
  };

  // 5-point bezier → SVG path (Catmull-Rom-like smooth curve)
  const buildCurvePath = (pts: Point[]): string => {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    // Smooth cubic Bezier through points using Catmull-Rom conversion
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  return (
    <>
      {/* Foto overlay — canvas üstünde, toolbar altında */}
      <View
        // @ts-ignore RN ref → div
        ref={overlayRef as any}
        // @ts-ignore web onClick
        onClick={onOverlayClick}
        style={{
          position: 'absolute', inset: 0,
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'box-none',
          zIndex: 10,
        } as any}
      >
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {React.createElement('img' as any, {
          src: active.url,
          alt: active.name,
          draggable: false,
          onPointerDown: drawMode === 'curve' ? undefined : onPointerDown,
          onPointerMove: drawMode === 'curve' ? undefined : onPointerMove,
          onPointerUp: drawMode === 'curve' ? undefined : onPointerUp,
          onWheel: drawMode === 'curve' ? undefined : onWheel,
          style: {
            maxWidth: '70%',
            maxHeight: '70%',
            opacity: t.opacity,
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.flipX ? -t.scale : t.scale}, ${t.scale}) rotate(${t.rotation}deg)`,
            transformOrigin: 'center center',
            cursor: drawMode === 'curve' ? 'crosshair' : (dragRef.current ? 'grabbing' : 'grab'),
            userSelect: 'none',
            pointerEvents: drawMode === 'curve' ? 'none' : 'auto',
            mixBlendMode: 'multiply',
            filter: 'contrast(1.05)',
          },
        })}

        {/* SVG annotation katmanı — curve + reference guides */}
        {React.createElement('svg' as any, {
          width: '100%',
          height: '100%',
          style: {
            position: 'absolute', inset: 0,
            pointerEvents: 'none',
          },
        }, [
          // Smile curve
          curvePts.length >= 2 && React.createElement('path' as any, {
            key: 'curve',
            d: buildCurvePath(curvePts),
            stroke: accent,
            strokeWidth: 2.5,
            fill: 'none',
            strokeDasharray: '0',
          }),
          // Curve control points
          ...curvePts.map((p, i) => React.createElement('circle' as any, {
            key: `pt-${i}`,
            cx: p.x, cy: p.y, r: 6,
            fill: '#FFFFFF',
            stroke: accent,
            strokeWidth: 2.5,
          })),
          // Reference guides (orta dikey + yatay)
          showGuides && React.createElement('line' as any, {
            key: 'vmid',
            x1: '50%', y1: '0', x2: '50%', y2: '100%',
            stroke: accent, strokeWidth: 1.5, strokeDasharray: '6 6', opacity: 0.7,
          }),
          showGuides && React.createElement('line' as any, {
            key: 'hmid',
            x1: '0', y1: '50%', x2: '100%', y2: '50%',
            stroke: accent, strokeWidth: 1.5, strokeDasharray: '6 6', opacity: 0.7,
          }),
        ])}
      </View>

      {/* Floating control panel — alt orta, beyaz pill */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute', bottom: 56, left: 0, right: 0,
          flexDirection: 'row', justifyContent: 'center',
          zIndex: 16,
        } as any}
      >
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 14, paddingVertical: 10,
          backgroundColor: '#FFFFFF',
          borderRadius: 999,
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
          shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 },
          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } as any : {}),
        } as any}>
          {/* Foto seçici (birden fazla varsa) */}
          {images.length > 1 && (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {images.map((img) => {
                const isActive = img.id === active.id;
                return (
                  <Pressable
                    key={img.id}
                    onPress={() => { setActiveId(img.id); setT(DEFAULT_T); }}
                    style={({ hovered }: any) => ({
                      width: 32, height: 32, borderRadius: 8,
                      overflow: 'hidden',
                      borderWidth: 2,
                      borderColor: isActive ? accent : hovered ? '#CBD5E1' : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {React.createElement('img' as any, {
                      src: img.url,
                      alt: img.name,
                      style: { width: '100%', height: '100%', objectFit: 'cover' },
                    })}
                  </Pressable>
                );
              })}
              <View style={{ width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 2 }} />
            </View>
          )}

          {/* Opaklık */}
          <View style={{ flexDirection: 'column', gap: 2, minWidth: 110 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 9.5, color: '#71717A', fontWeight: '700', letterSpacing: 0.4 }}>OPAKLIK</Text>
              <Text style={{ fontSize: 9.5, color: accent, fontWeight: '800' }}>{Math.round(t.opacity * 100)}%</Text>
            </View>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {React.createElement('input' as any, {
              type: 'range', min: 10, max: 100, step: 1,
              value: Math.round(t.opacity * 100),
              onChange: (e: any) => updateT({ opacity: parseInt(e.target.value, 10) / 100 }),
              style: { width: '100%', accentColor: accent, cursor: 'pointer' },
            })}
          </View>

          {/* Ölçek */}
          <View style={{ flexDirection: 'column', gap: 2, minWidth: 110 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 9.5, color: '#71717A', fontWeight: '700', letterSpacing: 0.4 }}>ÖLÇEK</Text>
              <Text style={{ fontSize: 9.5, color: accent, fontWeight: '800' }}>{t.scale.toFixed(2)}×</Text>
            </View>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {React.createElement('input' as any, {
              type: 'range', min: 0.1, max: 3, step: 0.01,
              value: t.scale,
              onChange: (e: any) => updateT({ scale: parseFloat(e.target.value) }),
              style: { width: '100%', accentColor: accent, cursor: 'pointer' },
            })}
          </View>

          {/* Rotasyon */}
          <View style={{ flexDirection: 'column', gap: 2, minWidth: 90 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 9.5, color: '#71717A', fontWeight: '700', letterSpacing: 0.4 }}>DÖNDÜR</Text>
              <Text style={{ fontSize: 9.5, color: accent, fontWeight: '800' }}>{Math.round(t.rotation)}°</Text>
            </View>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {React.createElement('input' as any, {
              type: 'range', min: -45, max: 45, step: 1,
              value: t.rotation,
              onChange: (e: any) => updateT({ rotation: parseFloat(e.target.value) }),
              style: { width: '100%', accentColor: accent, cursor: 'pointer' },
            })}
          </View>

          <View style={{ width: 1, height: 24, backgroundColor: '#E2E8F0' }} />

          {/* Auto-detect (MediaPipe Face Landmarker) */}
          <Pressable
            onPress={handleAutoDetect}
            disabled={detecting}
            // @ts-ignore
            title={landmarks ? `Tespit edildi (tilt ${landmarks.pupilTiltDeg.toFixed(1)}°)` : 'Otomatik yüz tespiti'}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 10, height: 32, borderRadius: 999,
              backgroundColor: detecting
                ? '#A78BFA'
                : landmarks
                  ? '#10B981'
                  : hovered ? accent : accent + 'DD',
              opacity: detecting ? 0.8 : 1,
              ...(Platform.OS === 'web' ? {
                cursor: detecting ? 'wait' : 'pointer',
                transition: 'background-color 140ms ease',
              } as any : {}),
            })}
          >
            {detecting
              ? <Loader2 size={13} color="#FFFFFF" strokeWidth={2.4} />
              : <Sparkles size={13} color="#FFFFFF" strokeWidth={2.4} />}
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>
              {detecting
                ? 'Analiz…'
                : landmarks
                  ? `✓ ${landmarks.pupilTiltDeg.toFixed(1)}°`
                  : 'Auto'}
            </Text>
          </Pressable>

          {detectErr && (
            <Text style={{ color: '#DC2626', fontSize: 9.5, fontWeight: '700' }}>
              {detectErr}
            </Text>
          )}

          {/* Smile arc çizim modu */}
          <Pressable
            onPress={() => setDrawMode(drawMode === 'curve' ? 'none' : 'curve')}
            // @ts-ignore web tooltip
            title={drawMode === 'curve' ? `Çizim kapat (${curvePts.length}/5)` : 'Gülüş eğrisi çiz (5 nokta)'}
            style={({ hovered }: any) => ({
              width: 32, height: 32, borderRadius: 999,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: drawMode === 'curve' ? accent : hovered ? '#F4F4F5' : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Spline size={14} color={drawMode === 'curve' ? '#FFFFFF' : '#27272A'} strokeWidth={2} />
          </Pressable>

          {/* "Eğriye hizala" — 3D çeneyi smile arc'a göre döndür */}
          {curvePts.length >= 3 && onApplyCurveRoll && (() => {
            // Lineer regresyon ile eğri eğimi (degrees)
            const n = curvePts.length;
            let sx = 0, sy = 0;
            for (const p of curvePts) { sx += p.x; sy += p.y; }
            const mx = sx / n, my = sy / n;
            let num = 0, den = 0;
            for (const p of curvePts) {
              num += (p.x - mx) * (p.y - my);
              den += (p.x - mx) * (p.x - mx);
            }
            const slope = den > 0.0001 ? num / den : 0;
            // SVG Y aşağı pozitif → screen tilt'i invert et
            const tiltDeg = -Math.atan(slope) * (180 / Math.PI);
            const tiltAbs = Math.abs(tiltDeg);
            return (
              <Pressable
                onPress={() => onApplyCurveRoll(tiltDeg)}
                // @ts-ignore
                title={`3D çeneyi ${tiltDeg.toFixed(1)}° döndür`}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, height: 32, borderRadius: 999,
                  backgroundColor: hovered ? accent : accent + 'DD',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 140ms ease' } as any : {}),
                })}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>
                  Hizala {tiltAbs.toFixed(1)}°
                </Text>
              </Pressable>
            );
          })()}

          {/* Curve temizle (sadece nokta varsa) */}
          {curvePts.length > 0 && (
            <Pressable
              onPress={() => setCurvePts([])}
              // @ts-ignore
              title="Eğriyi temizle"
              style={({ hovered }: any) => ({
                width: 32, height: 32, borderRadius: 999,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: hovered ? '#FEE2E2' : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Eraser size={13} color="#DC2626" strokeWidth={2} />
            </Pressable>
          )}

          {/* Referans çizgiler (vertical + horizontal midline) */}
          <Pressable
            onPress={() => setShowGuides(v => !v)}
            // @ts-ignore
            title={showGuides ? 'Kılavuz çizgileri gizle' : 'Orta hat kılavuzlarını göster'}
            style={({ hovered }: any) => ({
              width: 32, height: 32, borderRadius: 999,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: showGuides ? accent : hovered ? '#F4F4F5' : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <MoveHorizontal size={14} color={showGuides ? '#FFFFFF' : '#27272A'} strokeWidth={2} />
          </Pressable>

          <View style={{ width: 1, height: 24, backgroundColor: '#E2E8F0' }} />

          {/* Flip horizontal */}
          <Pressable
            onPress={() => updateT({ flipX: !t.flipX })}
            style={({ hovered }: any) => ({
              width: 32, height: 32, borderRadius: 999,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: t.flipX ? accent : hovered ? '#F4F4F5' : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <FlipHorizontal2 size={14} color={t.flipX ? '#FFFFFF' : '#27272A'} strokeWidth={2} />
          </Pressable>

          {/* Reset */}
          <Pressable
            onPress={() => {
              setT(DEFAULT_T);
              setCurvePts([]);
              setShowGuides(false);
              setDrawMode('none');
            }}
            style={({ hovered }: any) => ({
              width: 32, height: 32, borderRadius: 999,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: hovered ? '#F4F4F5' : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <RotateCw size={14} color="#27272A" strokeWidth={2} />
          </Pressable>

          {/* Close */}
          <Pressable
            onPress={onClose}
            style={({ hovered }: any) => ({
              width: 32, height: 32, borderRadius: 999,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: hovered ? '#FEE2E2' : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <X size={14} color="#DC2626" strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
    </>
  );
}

/** Toolbar'da göstermek için ikon export */
export const SmileOverlayIcon = ImageIcon;
