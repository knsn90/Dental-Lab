// modules/orders/components/MasterWorkflowTimeline.tsx
// Üst-seviye iş yaşam döngüsü:
//   Alındı → İş Planlama → Üretim → QC → Hazır → Teslim
//
// Hero kartının üst stripinde durur, "büyük resmi" gösterir.
// Üretim adımı altında WorkflowTimeline (sub-stages) zaten render ediliyor.

import React from 'react';
import { View, Text, Platform } from 'react-native';
import {
  Inbox, ListTodo, Cog, ShieldCheck, PackageCheck, Truck, Check,
} from '../../../core/ui/icons';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';

// Active step için web-only keyframe — bir kez document'e inject
let _masterPulseInjected = false;
function MasterPulseKeyframes({ accent, dark }: { accent: string; dark: boolean }) {
  if (typeof document === 'undefined') return null;
  if (!_masterPulseInjected) {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes masterActiveScale {
        0%, 100% { transform: scale(1);    }
        50%      { transform: scale(1.08); }
      }
      @keyframes masterActiveRing {
        0%   { box-shadow: 0 0 0 0   ${hexA(accent, dark ? 0.55 : 0.45)},
                            0 0 0 4px ${hexA(accent, dark ? 0.30 : 0.20)}; }
        100% { box-shadow: 0 0 0 16px ${hexA(accent, 0)},
                            0 0 0 4px  ${hexA(accent, dark ? 0.30 : 0.20)}; }
      }
    `;
    document.head.appendChild(style);
    _masterPulseInjected = true;
  }
  return null;
}

export type MasterStep =
  | 'alindi'      // sipariş oluşturuldu
  | 'planlama'   // triaje hazır, henüz triajlanmadı
  | 'uretim'     // production stages aktif
  | 'qc'         // QC istasyonunda
  | 'hazir'      // tamamlandı, kuryeyi/hekimi bekliyor
  | 'teslim';    // teslim edildi

export interface MasterStepData {
  step: MasterStep;
  status: 'completed' | 'active' | 'upcoming';
}

const STEP_DEFS: { key: MasterStep; label: string; icon: any }[] = [
  { key: 'alindi',   label: 'Alındı',     icon: Inbox },
  { key: 'planlama', label: 'Planlama',   icon: ListTodo },
  { key: 'uretim',   label: 'Üretim',     icon: Cog },
  { key: 'qc',       label: 'QC',         icon: ShieldCheck },
  { key: 'hazir',    label: 'Hazır',      icon: PackageCheck },
  { key: 'teslim',   label: 'Teslim',     icon: Truck },
];

export function MasterWorkflowTimeline({
  currentStep, accentColor, onDarkBg = false,
}: {
  currentStep: MasterStep;
  accentColor?: string;
  /** Denim hero üzerinde mi render ediliyor? Renkler ona göre. */
  onDarkBg?: boolean;
}) {
  const P = useStationTheme();
  const accent = accentColor ?? P.accent;
  const currentIdx = STEP_DEFS.findIndex(s => s.key === currentStep);

  // onDarkBg ise beyaz tonlarda render et
  const palette = onDarkBg
    ? {
        completedBg:    'rgba(255,255,255,0.20)',
        completedFg:    '#FFFFFF',
        completedLabel: '#FFFFFF',
        activeBg:       accent,
        activeFg:       '#FFFFFF',          // ikon rengi (mavi daire içinde)
        activeLabel:    '#FFFFFF',          // label rengi (zeminde)
        upcomingBg:     'rgba(255,255,255,0.08)',
        upcomingFg:     'rgba(255,255,255,0.55)',
        upcomingLabel:  'rgba(255,255,255,0.55)',
        connectorOn:    'rgba(255,255,255,0.35)',
        connectorOff:   'rgba(255,255,255,0.12)',
      }
    : {
        completedBg:    hexA(accent, 0.14),
        completedFg:    accent,
        completedLabel: P.ink700,
        activeBg:       accent,
        activeFg:       '#FFFFFF',          // ikon (mavi daire içinde beyaz)
        activeLabel:    P.ink900,           // label (beyaz zeminde koyu) ← görünür
        upcomingBg:     P.ink50,
        upcomingFg:     P.ink400,
        upcomingLabel:  P.ink400,
        connectorOn:    hexA(accent, 0.35),
        connectorOff:   P.ink100,
      };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
      {STEP_DEFS.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isActive    = idx === currentIdx;
        const isUpcoming  = idx > currentIdx;
        const Icon        = step.icon;
        const bg = isActive ? palette.activeBg : isCompleted ? palette.completedBg : palette.upcomingBg;
        const fg = isActive ? palette.activeFg : isCompleted ? palette.completedFg : palette.upcomingFg;

        return (
          <React.Fragment key={step.key}>
            <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}>
              <View style={{
                width: 30, height: 30, borderRadius: 999,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: bg,
                borderWidth: isActive ? 0 : 1.5,
                borderColor: isCompleted ? hexA(palette.completedFg, 0.30) : palette.connectorOff,
                ...(Platform.OS === 'web' && isActive
                  ? {
                      boxShadow: `0 0 0 4px ${hexA(accent, onDarkBg ? 0.30 : 0.20)}`,
                      animation: 'masterActiveRing 1.8s ease-out infinite, masterActiveScale 1.6s ease-in-out infinite',
                    } as any
                  : {}),
              }}>
                {Platform.OS === 'web' && isActive && <MasterPulseKeyframes accent={accent} dark={onDarkBg} />}
                {isCompleted
                  ? <Check size={14} color={fg} strokeWidth={2.5} />
                  : <Icon size={14} color={fg} strokeWidth={isActive ? 2.2 : 1.8} />}
              </View>
              <Text style={{
                fontSize: 8.5,
                fontWeight: isActive ? '700' : isCompleted ? '600' : '500',
                color: isActive
                  ? palette.activeLabel
                  : isCompleted ? palette.completedLabel
                  : palette.upcomingLabel,
                letterSpacing: 0.1,
                textTransform: 'uppercase',
                textAlign: 'center',
              }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {step.label}
              </Text>
            </View>

            {idx < STEP_DEFS.length - 1 && (
              <View style={{
                width: 14, flexShrink: 0, height: 2, marginHorizontal: 2, marginTop: -16,
                backgroundColor: idx < currentIdx ? palette.connectorOn : palette.connectorOff,
                borderRadius: 1,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

/**
 * Stage status'ünü ve work_order durumunu master step'e map'le.
 * - Üretim'in alt-aşamalarını tek 'uretim' macro adımına indirgiyor.
 * - QC istasyonu aktif olsa bile macro 'qc' gösterilir.
 */
export function deriveMasterStep(
  workOrderStatus: string | null,
  stationName: string | null,
  stageStatus: string | null,
  triagedAt: string | null,
): MasterStep {
  const status = workOrderStatus ?? '';
  if (status === 'teslim_edildi') return 'teslim';
  if (status === 'kuryede' || status === 'kurye_bekleniyor') return 'teslim';
  if (status === 'teslimata_hazir') return 'hazir';
  if (stationName === 'Kalite Kontrol') return 'qc';
  if (stageStatus === 'tamamlandi' || stageStatus === 'onaylandi') return 'hazir';
  if (triagedAt && stationName) return 'uretim';
  if (!triagedAt) return 'planlama';
  return 'alindi';
}
