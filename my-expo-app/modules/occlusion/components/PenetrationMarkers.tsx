// modules/occlusion/components/PenetrationMarkers.tsx
// HTML overlay — worldToScreen ile projekte edilen pulsing markers
// Prototip: app/app.jsx OverlayLayer (showPen kısmı)

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import * as THREE from 'three';
import { worldToScreen } from '../utils/meshDistance';
import type { PenetrationPoint, Severity } from '../types/occlusion';

interface Props {
  points:        PenetrationPoint[];
  camera:        THREE.Camera | null;
  canvasW:       number;
  canvasH:       number;
  activePen:     PenetrationPoint | null;
  setActivePen:  (p: PenetrationPoint) => void;
  pulseEnabled?: boolean;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  high:   '#DC2626',
  medium: '#D97706',
  low:    '#059669',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high:   'Yüksek',
  medium: 'Orta',
  low:    'Düşük',
};

export function PenetrationMarkers({
  points, camera, canvasW, canvasH, activePen, setActivePen, pulseEnabled = true,
}: Props) {
  // Her frame'de re-project için tick
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick((t) => (t + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!camera) return null;

  return (
    <View pointerEvents="box-none" style={s.layer}>
      {points.map((p, i) => {
        const screen = worldToScreen(p.position, camera, canvasW, canvasH);
        if (screen.behind) return null;
        const active = activePen?.id === p.id;
        const color  = SEVERITY_COLOR[p.severity];
        return (
          <TouchableOpacity
            key={p.id}
            style={[
              s.marker,
              {
                left: screen.x - 14,
                top:  screen.y - 14,
              },
              active && s.markerActive,
            ]}
            onPress={() => setActivePen(p)}
            activeOpacity={0.8}
          >
            {pulseEnabled && Platform.OS === 'web' && (
              <View
                // @ts-ignore
                style={[s.pulse, { backgroundColor: color, animationName: 'pen-pulse', animationDuration: '1.5s', animationIterationCount: 'infinite', animationTimingFunction: 'ease-out' } as any]}
              />
            )}
            <View style={[s.dot, { backgroundColor: color }, active && s.dotActive]}>
              <Text style={s.pinNumber}>{i + 1}</Text>
            </View>
            {active && (
              <View style={s.tooltip}>
                <View style={s.tipRow}>
                  <Text style={s.tipKey}>Derinlik</Text>
                  <Text style={s.tipVal}>{p.depth.toFixed(2)} mm</Text>
                </View>
                <View style={s.tipRow}>
                  <Text style={s.tipKey}>Alan</Text>
                  <Text style={s.tipVal}>{p.area.toFixed(1)} mm²</Text>
                </View>
                <View style={s.tipRow}>
                  <Text style={s.tipKey}>Şiddet</Text>
                  <Text style={[s.tipVal, { color }]}>{SEVERITY_LABEL[p.severity]}</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {/* Web'de pulse keyframe */}
      {Platform.OS === 'web' && (
        // @ts-ignore
        <style>{`
          @keyframes pen-pulse {
            0%   { transform: scale(1);   opacity: 0.6; }
            100% { transform: scale(2.2); opacity: 0;   }
          }
        `}</style>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: 'box-none',
  },
  marker: {
    position: 'absolute',
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  markerActive: { zIndex: 10 },
  pulse: {
    position: 'absolute',
    width: 28, height: 28, borderRadius: 14,
    opacity: 0.6,
  },
  dot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.2,
    shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  dotActive: {
    transform: [{ scale: 1.15 }],
    borderWidth: 3,
  },
  pinNumber: {
    color: '#FFFFFF', fontSize: 11, fontWeight: '700',
  },
  tooltip: {
    position: 'absolute',
    top: 32, left: 18,
    backgroundColor: '#0F172A',
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 6, gap: 4,
    minWidth: 130,
  },
  tipRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  tipKey: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
  tipVal: { fontSize: 10, color: '#FFFFFF', fontWeight: '700', fontVariant: ['tabular-nums'] },
});
