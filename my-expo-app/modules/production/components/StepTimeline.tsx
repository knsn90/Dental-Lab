import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { CaseStep } from '../types';
import { StepCard } from './StepCard';
import { useStartStep } from '../hooks/useStartStep';
import { useCompleteStep } from '../hooks/useCompleteStep';

interface Props {
  steps: CaseStep[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function StepTimeline({ steps, loading, onRefresh }: Props) {
  const { startStep, loading: starting, error: startError } = useStartStep();
  const { completeStep, loading: completing, error: completeError } = useCompleteStep();
  const [activeStepId, setActiveStepId] = useState<string | null>(null);

  const done  = steps.filter(s => s.status === 'done').length;
  const total = steps.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  const handleStart = async (step: CaseStep) => {
    setActiveStepId(step.id);
    const ok = await startStep(step.id);
    if (ok) onRefresh?.();
    else Alert.alert('Hata', startError ?? 'Başlatılamadı');
    setActiveStepId(null);
  };

  const handleComplete = async (step: CaseStep) => {
    setActiveStepId(step.id);
    const ok = await completeStep(step.id);
    if (ok) onRefresh?.();
    else Alert.alert('Hata', completeError ?? 'Tamamlanamadı');
    setActiveStepId(null);
  };

  return (
    <View style={styles.wrap}>
      {/* Progress bar */}
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>Üretim İlerlemesi</Text>
        <Text style={styles.progressPct}>{pct}%</Text>
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
      </View>
      <Text style={styles.progressSub}>{done} / {total} adım tamamlandı</Text>

      {/* Steps */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
        {steps.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            loading={loading || activeStepId === step.id}
            onStart={handleStart}
            onComplete={handleComplete}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  progressPct:   { fontSize: 13, fontWeight: '800', color: '#2563EB' },
  progressBg:    { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  progressFill:  { height: 8, backgroundColor: '#2563EB', borderRadius: 4 },
  progressSub:   { fontSize: 11, color: '#94A3B8', marginTop: 4 },
});
