// modules/orders/components/WorkflowTimeline.tsx
// Kompakt iş akışı zaman çizelgesi — workstation üst sağında durur.
// Sadece SEÇİLEN iş emrinin stage'lerini gösterir.
//
// State indicators:
//   ✓ tamamlandi/onaylandi   ● aktif (pulse)   ○ bekliyor
//   ⏸ durakladi              ⚙ makine_bekliyor  ⏳ onay_bekliyor
//   ⚠ bloklu                 ↺ yeniden          ⊘ skipped/iptal/reddedildi

import React from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { ChevronLeft, ChevronRight, Check, Pause, Cog, Hourglass, AlertOctagon, RotateCcw, Ban } from '../../../core/ui/icons';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { isRTL } from '../../../core/i18n';
import { getStageStateMeta, type StageStatus } from '../stations/stageStates';

export interface TimelineStage {
  id:           string;
  station_name: string | null;
  status:       StageStatus | string;
  sequence:     number;
}

const SECONDARY_STATE_ICON: Record<string, any> = {
  durakladi:        Pause,
  makine_bekliyor:  Cog,
  onay_bekliyor:    Hourglass,
  bloklu:           AlertOctagon,
  yeniden:          RotateCcw,
  iptal:            Ban,
  reddedildi:       Ban,
  skipped:          Ban,
};

// Web-only keyframe injection — bir kez document'e eklenir, idempotent.
let _pulseKeyframesInjected = false;
function ActivePulseKeyframes({ accent }: { accent: string }) {
  if (typeof document === 'undefined') return null;
  if (!_pulseKeyframesInjected) {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes wfActivePulse {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.04); }
      }
      @keyframes wfActiveDotPulse {
        0%, 100% { transform: scale(1);   opacity: 1;   }
        50%      { transform: scale(1.3); opacity: 0.7; }
      }
      @keyframes wfActiveRing {
        0%   { box-shadow: 0 0 0 0   ${hexA(accent, 0.55)}; }
        100% { box-shadow: 0 0 0 12px ${hexA(accent, 0)};  }
      }
    `;
    document.head.appendChild(style);
    _pulseKeyframesInjected = true;
  }
  return null;
}

export function WorkflowTimeline({
  stages, currentStageId, accentColor,
}: {
  stages: TimelineStage[];
  currentStageId?: string | null;
  accentColor?: string;
}) {
  const P = useStationTheme();
  if (!stages || stages.length === 0) return null;
  const accent = accentColor ?? P.accent;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 4, gap: 4, alignItems: 'center' }}
    >
      {stages.map((s, i) => (
        <React.Fragment key={s.id}>
          <TimelineChip stage={s} isCurrent={s.id === currentStageId} accent={accent} />
          {i < stages.length - 1 && (
            isRTL()
              ? <ChevronLeft size={11} color={P.ink300} strokeWidth={1.6} />
              : <ChevronRight size={11} color={P.ink300} strokeWidth={1.6} />
          )}
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

function TimelineChip({
  stage, isCurrent, accent,
}: {
  stage: TimelineStage;
  isCurrent: boolean;
  accent: string;
}) {
  const P = useStationTheme();
  const meta = getStageStateMeta(stage.status);

  const isDone        = stage.status === 'tamamlandi' || stage.status === 'onaylandi';
  const isActive      = stage.status === 'aktif';
  const isUpcoming    = stage.status === 'bekliyor';
  const isCancelled   = stage.status === 'iptal' || stage.status === 'reddedildi' || stage.status === 'skipped';
  const isProblematic = stage.status === 'bloklu';
  const SecondaryIcon = SECONDARY_STATE_ICON[stage.status as string];

  // Renkler — state-meta ile uyumlu
  const bg = isActive
    ? accent
    : isDone
      ? hexA(accent, 0.12)
      : isCancelled
        ? P.ink50
        : isProblematic
          ? P.dangerBg
          : meta.bgTint;

  const fg = isActive
    ? '#FFFFFF'
    : isDone
      ? P.accentDeep
      : isCancelled
        ? P.ink400
        : meta.color;

  const borderColor = isActive
    ? accent
    : isDone
      ? hexA(accent, 0.30)
      : hexA(meta.color, 0.20);

  return (
    <View style={{
      position: 'relative',
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
      backgroundColor: bg,
      borderWidth: isCurrent ? 2 : 1,
      borderColor: isCurrent ? accent : borderColor,
      flexDirection: 'row', alignItems: 'center', gap: 6,
      opacity: isUpcoming ? 0.75 : isCancelled ? 0.55 : 1,
      ...(Platform.OS === 'web' && isActive
        ? {
            boxShadow: `0 4px 12px ${hexA(accent, 0.30)}`,
            // Aktif chip için sürekli pulse — dikkat çeker
            animation: 'wfActivePulse 1.6s ease-in-out infinite',
          } as any
        : {}),
    }}>
      {/* Active stage için web-only pulse keyframe — bir kez inject */}
      {Platform.OS === 'web' && isActive && <ActivePulseKeyframes accent={accent} />}
      {/* State indicator */}
      <View style={{
        width: 14, height: 14, borderRadius: 999,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: isActive
          ? 'rgba(255,255,255,0.25)'
          : isDone
            ? hexA(accent, 0.22)
            : 'transparent',
        borderWidth: isUpcoming ? 1 : 0,
        borderColor: P.ink300,
      }}>
        {isDone ? (
          <Check size={9} color={fg} strokeWidth={3} />
        ) : isActive ? (
          <View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: '#FFFFFF',
            ...(Platform.OS === 'web'
              ? {
                  animation: 'wfActiveDotPulse 1.4s ease-in-out infinite, wfActiveRing 1.8s ease-out infinite',
                  boxShadow: `0 0 0 0 ${hexA(accent, 0.55)}`,
                } as any
              : {}),
          }} />
        ) : SecondaryIcon ? (
          <SecondaryIcon size={9} color={fg} strokeWidth={2.2} />
        ) : (
          <Text style={{ fontSize: 8.5, fontWeight: '700', color: fg, lineHeight: 12 }}>
            {stage.sequence}
          </Text>
        )}
      </View>
      <Text
        style={{ fontSize: 10.5, fontWeight: isActive ? '700' : '600', color: fg, letterSpacing: 0.2 }}
        numberOfLines={1}
      >
        {stage.station_name ?? '—'}
      </Text>
    </View>
  );
}
