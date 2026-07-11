// modules/orders/components/StageStateControls.tsx
// Aşamaya state aksiyonları: Pause / Resume / Makineye Gönder / Onay Bekle / Bloklu / Yeniden Yap.
// Hangi butonların görüneceği mevcut state'e göre değişir.

import React, { useState } from 'react';
import { View, Text, Pressable, Platform} from 'react-native';
import { Pause, Play, Cog, Hourglass, AlertOctagon, RotateCcw } from 'lucide-react-native';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { toast } from '../../../core/ui/Toast';
import { pauseStage, resumeStage, transitionStageState } from '../api/timing';
import type { StageStatus } from '../stations/stageStates';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface ActionDef {
  key:        'pause' | 'resume' | 'machine' | 'approval' | 'block' | 'rework';
  label:      string;
  icon:       any;
  color:      string;
  bgTint:     string;
  /** RPC fn — başarısız olursa false döner */
  invoke:     (stageId: string, reason?: string) => Promise<{ ok: boolean; error?: string }>;
  /** Bu state'de görünür mü? */
  visibleIn:  StageStatus[];
}

const ACTIONS: ActionDef[] = [
  {
    key: 'pause', label: 'Durdur', icon: Pause,
    color: '#B5752A', bgTint: '#FEF3C7',
    invoke: (id, r) => pauseStage(id, r),
    visibleIn: ['aktif'],
  },
  {
    key: 'resume', label: 'Devam Et', icon: Play,
    color: '#3B82F6', bgTint: '#EAF2FA',
    invoke: (id, r) => resumeStage(id, r),
    visibleIn: ['durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden'],
  },
  {
    key: 'machine', label: 'Makine Bekle', icon: Cog,
    color: '#0891B2', bgTint: '#CFFAFE',
    invoke: (id, r) => transitionStageState(id, 'makine_bekliyor', r),
    visibleIn: ['aktif'],
  },
  {
    key: 'approval', label: 'Onay Bekle', icon: Hourglass,
    color: '#7C3AED', bgTint: '#EDE9FE',
    invoke: (id, r) => transitionStageState(id, 'onay_bekliyor', r),
    visibleIn: ['aktif'],
  },
  {
    key: 'block', label: 'Blokla', icon: AlertOctagon,
    color: '#DC2626', bgTint: '#FEE2E2',
    invoke: (id, r) => transitionStageState(id, 'bloklu', r),
    visibleIn: ['aktif','durakladi','makine_bekliyor','onay_bekliyor'],
  },
  {
    key: 'rework', label: 'Yeniden Yap', icon: RotateCcw,
    color: '#EA580C', bgTint: '#FED7AA',
    invoke: (id, r) => transitionStageState(id, 'yeniden', r),
    visibleIn: ['aktif','tamamlandi'],
  },
];

export function StageStateControls({
  stageId, currentStatus, onChanged,
}: {
  stageId:       string;
  currentStatus: StageStatus | string;
  onChanged?:    () => void;
}) {
  const P = useStationTheme();
  const [busy, setBusy] = useState<string | null>(null);

  const visible = ACTIONS.filter(a => a.visibleIn.includes(currentStatus as StageStatus));
  if (visible.length === 0) return null;

  async function run(action: ActionDef) {
    if (busy) return;
    setBusy(action.key);
    try {
      const res = await action.invoke(stageId);
      if (!res.ok) {
        toast.error(`${action.label} başarısız: ${res.error ?? ''}`);
        return;
      }
      toast.success(`${action.label} ✓`);
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{
      borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
      backgroundColor: P.surface, overflow: 'hidden',
    }}>
      <View style={{
        paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: P.ink100,
        backgroundColor: P.surfaceAlt,
      }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          Aşama Aksiyonları
        </Text>
      </View>
      <View style={{
        flexDirection: 'row', flexWrap: 'wrap', gap: 8,
        paddingHorizontal: 14, paddingVertical: 12,
      }}>
        {visible.map(a => {
          const Icon = a.icon;
          const isLoading = busy === a.key;
          const isDisabled = !!busy && !isLoading;
          return (
            <Pressable
              key={a.key}
              onPress={() => run(a)}
              disabled={isDisabled || isLoading}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                backgroundColor: hovered ? a.color : a.bgTint,
                borderWidth: 1, borderColor: hexA(a.color, 0.30),
                opacity: isDisabled ? 0.4 : 1,
                ...(Platform.OS === 'web' ? {
                  cursor: isDisabled || isLoading ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.15s',
                } as any : {}),
              })}
            >
              <Icon size={12} color={a.color} strokeWidth={2} />
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: a.color, letterSpacing: 0.3 }}>
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
