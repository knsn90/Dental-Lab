// AdvancedActions — collapsed by default. No red container.
// On expand: Force Next Stage · Send to QC.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

interface Props {
  onForceNext: () => void;
  onSkipToQC:  () => void;
  forceDisabled?: boolean;
  qcDisabled?:    boolean;
}

export function AdvancedActions({
  onForceNext, onSkipToQC, forceDisabled, qcDisabled,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.wrap}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} activeOpacity={0.7} style={s.toggle}>
        <Text style={s.toggleText}>
          {open ? '▾ ' : '▸ '}⚠ Gelişmiş Aksiyonlar
        </Text>
      </TouchableOpacity>
      {open && (
        <View style={s.row}>
          <DangerBtn label="Stage'i İlerlet" onPress={onForceNext} disabled={forceDisabled} />
          <DangerBtn label="QC'ye Gönder"     onPress={onSkipToQC}  disabled={qcDisabled} />
        </View>
      )}
    </View>
  );
}

function DangerBtn({
  label, onPress, disabled,
}: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[s.btn, disabled && { opacity: 0.4 }]}
    >
      <Text style={s.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  toggle: { alignSelf: 'flex-start' },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.45)',
    backgroundColor: 'transparent',
  },
  btnText: { fontSize: 11, fontWeight: '800', color: '#FCA5A5', letterSpacing: 0.3 },
});
