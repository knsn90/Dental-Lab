// modules/orders/components/TimingBreakdown.tsx
// Operatör vs Makine vs Kuyruk vs Pause süresi — workstation içinde küçük strip.
// canEdit=true ise her hücreye düzeltme kalemi eklenir (manager-only).

import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Clock, Cog, Hourglass, Pause, Pencil } from '../../../core/ui/icons';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { formatDuration } from '../stations/stageStates';
import { OverrideTimingModal, type OverridableField } from './OverrideTimingModal';

export interface TimingFields {
  active_work_seconds:     number;
  machine_runtime_seconds: number;
  queue_waiting_seconds:   number;
  paused_seconds_total:    number;
  operator_setup_seconds?: number;
}

export function TimingBreakdown({
  timing, stageId, canEdit = false, onChanged,
}: {
  timing:    TimingFields;
  stageId?:  string;
  canEdit?:  boolean;
  onChanged?: () => void;
}) {
  const P = useStationTheme();
  const [editField, setEditField] = useState<OverridableField | null>(null);
  const [editValue, setEditValue] = useState<number>(0);

  const items: Array<{
    key: 'active' | 'machine' | 'queue' | 'pause';
    label: string;
    value: number;
    icon: any;
    color: string;
    sub: string;
    overrideField?: OverridableField;
  }> = [
    {
      key: 'active', label: 'Operatör',
      value: timing.active_work_seconds,
      icon: Clock, color: P.accent, sub: 'Aktif çalışma',
      overrideField: 'active_work_seconds',
    },
    {
      key: 'machine', label: 'Makine',
      value: timing.machine_runtime_seconds,
      icon: Cog, color: '#0891B2', sub: 'Runtime',
      overrideField: 'machine_runtime_seconds',
    },
    {
      key: 'queue', label: 'Kuyruk',
      value: timing.queue_waiting_seconds,
      icon: Hourglass, color: P.ink400, sub: 'Bekleme',
      overrideField: 'queue_waiting_seconds',
    },
    {
      key: 'pause', label: 'Pause',
      value: timing.paused_seconds_total,
      icon: Pause, color: '#B5752A', sub: 'Toplam',
      // Pause override edilemez (paused_seconds_total override list'inde yok)
    },
  ];

  // canEdit ise sıfır değerli hücreyi de göster (override edebilsin)
  const visibleItems = canEdit ? items : items.filter(i => i.value > 0);
  if (visibleItems.length === 0) return null;

  function handleEdit(field: OverridableField, currentValue: number) {
    setEditField(field);
    setEditValue(currentValue);
  }

  return (
    <>
      <View style={{
        borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
        backgroundColor: P.surface, overflow: 'hidden',
      }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 10,
          borderBottomWidth: 1, borderBottomColor: P.ink100,
          backgroundColor: P.surfaceAlt,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Zaman Dağılımı
          </Text>
          {canEdit && (
            <View style={{
              paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
              backgroundColor: hexA('#EA580C', 0.10),
              borderWidth: 1, borderColor: hexA('#EA580C', 0.22),
            }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#EA580C', letterSpacing: 0.4 }}>
                YÖNETİCİ MODU
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {visibleItems.map((it, idx) => {
            const Icon = it.icon;
            const editable = canEdit && it.overrideField && stageId;
            return (
              <View
                key={it.key}
                style={{
                  width: visibleItems.length <= 2 ? '50%' : visibleItems.length === 3 ? '33.333%' : '25%',
                  paddingHorizontal: 14, paddingVertical: 11,
                  borderEndWidth: idx < visibleItems.length - 1 ? 1 : 0,
                  borderEndColor: P.ink100,
                  gap: 5,
                  position: 'relative',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{
                    width: 18, height: 18, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: hexA(it.color, 0.12),
                  }}>
                    <Icon size={10} color={it.color} strokeWidth={1.8} />
                  </View>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink500, letterSpacing: 0.7, textTransform: 'uppercase' }}>
                    {it.label}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: P.ink900, letterSpacing: -0.2 }}>
                  {formatDuration(it.value)}
                </Text>
                <Text style={{ fontSize: 10, color: P.ink400 }}>
                  {it.sub}
                </Text>

                {/* Edit pencil */}
                {editable && (
                  <Pressable
                    onPress={() => handleEdit(it.overrideField!, it.value)}
                    hitSlop={6}
                    style={({ hovered }: any) => ({
                      position: 'absolute' as any,
                      top: 8, end: 8,
                      width: 22, height: 22, borderRadius: 6,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: hovered ? hexA('#EA580C', 0.16) : hexA('#EA580C', 0.08),
                      borderWidth: 1, borderColor: hexA('#EA580C', 0.22),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    <Pencil size={10} color="#EA580C" strokeWidth={1.8} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Override Modal */}
      <OverrideTimingModal
        visible={editField !== null}
        stageId={stageId ?? null}
        field={editField}
        currentSeconds={editValue}
        onClose={() => setEditField(null)}
        onSaved={() => { setEditField(null); onChanged?.(); }}
      />
    </>
  );
}
