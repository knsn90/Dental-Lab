/**
 * NOMiniStepper — Sol 200px stepper sidebar
 * ──────────────────────────────────────────
 * Krem (#F5F2EA) zemin, "İlerleme" eyebrow, 4 adım satırı,
 * altta siyah "İpucu" kartı.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { NO, NOType, NORadius } from './NOTokens';
import { NOStepNum, NOStepState } from './NOStepNum';
import { NOEyebrow } from './NOFormPrimitives';

export interface StepDef {
  id: number;
  label: string;
  sub?: string;
}

const DEFAULT_STEPS: StepDef[] = [
  { id: 1, label: 'Klinik & Hasta' },
  { id: 2, label: 'Vaka detayları' },
  { id: 3, label: 'Diş & Protez' },
  { id: 4, label: 'Özet & Gönder' },
];

export interface NOMiniStepperProps {
  current: number;
  steps?: StepDef[];
  onStepPress?: (step: number) => void;
}

export function NOMiniStepper({
  current,
  steps = DEFAULT_STEPS,
  onStepPress,
}: NOMiniStepperProps) {
  return (
    <View
      style={{
        width: 200,
        paddingVertical: 24,
        paddingHorizontal: 16,
        backgroundColor: NO.bgStage,
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <NOEyebrow>İlerleme</NOEyebrow>

      <View style={{ marginTop: 6, flexDirection: 'column', gap: 2 }}>
        {steps.map((s) => {
          const state: NOStepState =
            s.id < current ? 'done' : s.id === current ? 'current' : 'todo';
          const canPress = state === 'done' && onStepPress;

          const row = (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: NORadius.md,
                backgroundColor: state === 'current' ? '#FFFFFF' : 'transparent',
              }}
            >
              <NOStepNum n={s.id} state={state} />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: state === 'current' ? '500' : '400',
                  color: state === 'todo' ? NO.inkMute : NO.inkStrong,
                }}
              >
                {s.label}
              </Text>
            </View>
          );

          if (canPress) {
            return (
              <Pressable key={s.id} onPress={() => onStepPress!(s.id)}>
                {row}
              </Pressable>
            );
          }
          return <View key={s.id}>{row}</View>;
        })}
      </View>

      {/* İpucu card */}
      <View style={{ marginTop: 'auto' as any }}>
        <View
          style={{
            padding: 14,
            backgroundColor: NO.inkStrong,
            borderRadius: 14,
          }}
        >
          <Text
            style={{
              ...NOType.nano,
              color: NO.saffron,
              marginBottom: 6,
            }}
          >
            İPUCU
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.8)',
              lineHeight: 16,
            }}
          >
            Her kart bağımsız — istediğin sırada doldurabilirsin.
          </Text>
        </View>
      </View>
    </View>
  );
}
