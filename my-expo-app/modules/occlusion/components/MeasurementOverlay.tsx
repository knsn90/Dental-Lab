// modules/occlusion/components/MeasurementOverlay.tsx
// SVG dashed line + mesafe label'ı — prototipin measure overlay'i
// Web'de SVG native, RN'de react-native-svg kullanılır (zaten yüklü)

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as THREE from 'three';
import { worldToScreen } from '../utils/meshDistance';
import type { MeasurementLine, MeasurementPoint } from '../types/occlusion';

interface Props {
  measurements: MeasurementLine[];
  pendingPoint: MeasurementPoint | null;
  camera:       THREE.Camera | null;
  canvasW:      number;
  canvasH:      number;
}

export function MeasurementOverlay({
  measurements, pendingPoint, camera, canvasW, canvasH,
}: Props) {
  // Frame-based re-project
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
    <View pointerEvents="none" style={s.layer}>
      {/* Web: inline SVG for dashed lines */}
      {Platform.OS === 'web' && (
        // @ts-ignore
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {measurements.map((m) => {
            const a = worldToScreen(m.pointA.position, camera, canvasW, canvasH);
            const b = worldToScreen(m.pointB.position, camera, canvasW, canvasH);
            if (a.behind || b.behind) return null;
            return (
              // @ts-ignore
              <line key={m.id}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="#0F172A" strokeWidth="1.5" strokeDasharray="4 4"
              />
            );
          })}
        </svg>
      )}

      {/* Ölçüm uç noktaları ve mesafe etiketi */}
      {measurements.map((m) => {
        const a = worldToScreen(m.pointA.position, camera, canvasW, canvasH);
        const b = worldToScreen(m.pointB.position, camera, canvasW, canvasH);
        if (a.behind || b.behind) return null;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          <React.Fragment key={m.id}>
            <View style={[s.point, { left: a.x - 4, top: a.y - 4 }]} />
            <View style={[s.point, { left: b.x - 4, top: b.y - 4 }]} />
            <View style={[s.label, { left: mid.x, top: mid.y - 10 }]}>
              <Text style={s.labelText}>{m.distance.toFixed(2)} mm</Text>
            </View>
          </React.Fragment>
        );
      })}

      {/* Pending point */}
      {pendingPoint && (() => {
        const p = worldToScreen(pendingPoint.position, camera, canvasW, canvasH);
        if (p.behind) return null;
        return (
          <View style={[s.point, s.pointPending, { left: p.x - 5, top: p.y - 5 }]} />
        );
      })()}
    </View>
  );
}

const s = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: 'none',
  },
  point: {
    position: 'absolute',
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#0F172A',
    borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  pointPending: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#2563EB',
  },
  label: {
    position: 'absolute',
    transform: [{ translateX: -30 }],
    backgroundColor: '#0F172A',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4,
  },
  labelText: {
    color: '#FFFFFF', fontSize: 11, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
