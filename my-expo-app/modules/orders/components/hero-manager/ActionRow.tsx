// ActionRow — [Reassign] [Note] [🔴 Urgent]
// Urgent visually stronger (red glow when active).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

interface Props {
  onReassign:    () => void;
  onNote:        () => void;
  onUrgent:      () => void;
  reassignDisabled?: boolean;
  noteActive?:   boolean;
  urgentActive?: boolean;
}

export function ActionRow({
  onReassign, onNote, onUrgent,
  reassignDisabled, noteActive, urgentActive,
}: Props) {
  return (
    <View style={s.row}>
      <Btn label="Yeniden Ata" onPress={onReassign} disabled={reassignDisabled} />
      <Btn label="Not"          onPress={onNote}    active={noteActive} />
      <UrgentBtn                onPress={onUrgent}  active={!!urgentActive} />
    </View>
  );
}

function Btn({
  label, onPress, disabled, active,
}: { label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[s.btn, active && s.btnActive, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.btnText, active && s.btnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function UrgentBtn({ onPress, active }: { onPress: () => void; active: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[s.urgent, active && s.urgentActive]}
    >
      <Text style={[s.urgentText, active && { color: '#FFFFFF' }]}>🔴 ACİL</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },

  // Neutral btn (Reassign / Note)
  btn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'transparent',
  },
  btnActive: {
    backgroundColor: '#FFFFFF', borderColor: '#FFFFFF',
    ...Platform.select({
      web: { boxShadow: '0 0 12px rgba(255,255,255,0.30)' } as any,
      default: {},
    }),
  },
  btnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },
  btnTextActive: { color: '#0F172A', fontWeight: '800' },

  // Urgent btn — extra emphasis
  urgent: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.50)',
    backgroundColor: 'rgba(220,38,38,0.18)',
  },
  urgentActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
    ...Platform.select({
      web: { boxShadow: '0 0 14px rgba(220,38,38,0.55)' } as any,
      default: {},
    }),
  },
  urgentText: { fontSize: 11, fontWeight: '800', color: '#FCA5A5', letterSpacing: 0.3 },
});
