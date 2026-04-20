// modules/occlusion/hooks/useMeasurement.ts
// Ölçüm durum makinesi
// Prototip: app/app.jsx pendingPoint + measurements state'i

import { useState, useCallback } from 'react';
import type { MeasurementLine, MeasurementPoint, SceneClickEvent } from '../types/occlusion';

type MeasurementState =
  | { kind: 'idle' }
  | { kind: 'pending'; pointA: MeasurementPoint };

export function useMeasurement() {
  const [state, setState]           = useState<MeasurementState>({ kind: 'idle' });
  const [measurements, setMeasurements] = useState<MeasurementLine[]>([]);

  const pendingPoint = state.kind === 'pending' ? state.pointA : null;

  /**
   * Measurement modunda canvas click → state machine geçişi
   *  idle    + click → pending { pointA }
   *  pending + click → idle, yeni MeasurementLine ekle
   */
  const handleClick = useCallback((event: SceneClickEvent) => {
    if (state.kind === 'idle') {
      const pointA: MeasurementPoint = {
        id:       `MP${Date.now()}`,
        position: event.position.clone(),
        meshType: event.meshType,
      };
      setState({ kind: 'pending', pointA });
    } else {
      const pointB: MeasurementPoint = {
        id:       `MP${Date.now()}_b`,
        position: event.position.clone(),
        meshType: event.meshType,
      };
      const distance = state.pointA.position.distanceTo(pointB.position);
      const line: MeasurementLine = {
        id:       `M${Date.now()}`,
        pointA:   state.pointA,
        pointB,
        distance: parseFloat(distance.toFixed(3)),
      };
      setMeasurements((prev) => [...prev, line]);
      setState({ kind: 'idle' });
    }
  }, [state]);

  /** Mod değişince pending'i temizle */
  const resetPending = useCallback(() => setState({ kind: 'idle' }), []);

  const removeMeasurement = useCallback((id: string) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setMeasurements([]);
    setState({ kind: 'idle' });
  }, []);

  return {
    measurements,
    pendingPoint,
    handleClick,
    resetPending,
    removeMeasurement,
    clearAll,
  };
}
