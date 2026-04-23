import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { toast } from '../../../core/ui/Toast';
import { CaseStep } from '../types';
import { StepCard } from './StepCard';
import { startStep as apiStartStep } from '../api';
import { completeStep as apiCompleteStep } from '../api';
import { useAuthStore } from '../../../core/store/authStore';

interface Props {
  steps: CaseStep[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function StepTimeline({ steps, loading, onRefresh }: Props) {
  const { profile } = useAuthStore();
  const [activeStepId, setActiveStepId] = useState<string | null>(null);

  const done  = steps.filter(s => s.status === 'done').length;
  const total = steps.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  const handleStart = async (step: CaseStep) => {
    if (!profile?.id) return;
    setActiveStepId(step.id);
    try {
      await apiStartStep(step.id, profile.id);
      onRefresh?.();
    } catch (e: any) {
      toast.error(e.message ?? 'Bir hata oluştu');
    } finally {
      setActiveStepId(null);
    }
  };

  const handleComplete = async (step: CaseStep) => {
    if (!profile?.id) return;
    setActiveStepId(step.id);
    try {
      await apiCompleteStep(step.id, profile.id);
      onRefresh?.();
    } catch (e: any) {
      toast.error(e.message ?? 'Bir hata oluştu');
    } finally {
      setActiveStepId(null);
    }
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
      <View style={{ marginTop: 12 }}>
        {steps.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            loading={loading || activeStepId === step.id}
            onStart={handleStart}
            onComplete={handleComplete}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  progressPct:   { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  progressBg:    { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  progressFill:  { height: 8, backgroundColor: '#0F172A', borderRadius: 4 },
  progressSub:   { fontSize: 11, color: '#94A3B8', marginTop: 4 },
});
