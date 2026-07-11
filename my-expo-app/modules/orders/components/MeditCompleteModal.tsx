// modules/orders/components/MeditCompleteModal.tsx
// Medit Link'ten gelen siparişlerde eksik bilgileri (diş, vaka türü, not)
// tek bir formda tamamlamak için. Save → work_orders update + banner kapanır.

import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput, ScrollView, Platform,
} from 'react-native';
import { X, Check, Sparkles } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { WORK_TYPES } from '../constants';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface Props {
  visible:     boolean;
  workOrderId: string;
  initialTeeth?: number[];
  initialWorkType?: string;
  initialNotes?: string;
  onClose:     () => void;
  onSaved:     () => void;
  accentColor?: string;
}

// FDI numbering — 4 quadrant × 8 teeth
const UPPER_RIGHT = [18,17,16,15,14,13,12,11];
const UPPER_LEFT  = [21,22,23,24,25,26,27,28];
const LOWER_LEFT  = [31,32,33,34,35,36,37,38];
const LOWER_RIGHT = [48,47,46,45,44,43,42,41];

export function MeditCompleteModal({
  visible, workOrderId, initialTeeth = [], initialWorkType, initialNotes,
  onClose, onSaved, accentColor = '#4771AB',
}: Props) {
  const [teeth,    setTeeth]    = useState<Set<number>>(new Set(initialTeeth));
  const [workType, setWorkType] = useState<string>(initialWorkType && initialWorkType !== 'medit_import' ? initialWorkType : '');
  const [notes,    setNotes]    = useState<string>(initialNotes ?? '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const teethCount = teeth.size;
  const canSave    = teethCount > 0 && !!workType && !saving;

  const toggle = (t: number) => {
    setTeeth(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const handleSave = async () => {
    setError(null);
    if (!canSave) { setError('En az 1 diş seç ve vaka türünü belirt'); return; }
    setSaving(true);
    const { error: dbErr } = await supabase
      .from('work_orders')
      .update({
        tooth_numbers: [...teeth].sort((a, b) => a - b),
        work_type:     workType,
        notes:         notes.trim() || null,
      })
      .eq('id', workOrderId);
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onSaved();
    onClose();
  };

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={() => { /* swallow */ }}
          style={{
            width: '100%', maxWidth: 640,
            backgroundColor: '#FFFFFF', borderRadius: 20,
            maxHeight: '90%',
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(15,23,42,0.20)' } as any : {}),
          }}
        >
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            padding: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accentColor}18` }}>
              <Sparkles size={18} color={accentColor} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1, textTransform: 'uppercase' }}>Medit Link Tamamla</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#0A0A0A' }}>Eksik bilgileri doldur</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
              <X size={14} color="#6B6B6B" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
            {/* Tooth picker */}
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>Diş Seçimi (FDI)</Text>
                <Text style={{ fontSize: 11, color: accentColor, fontWeight: '700' }}>{teethCount} diş</Text>
              </View>
              <View style={{ gap: 6 }}>
                {/* Upper jaw */}
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[...UPPER_RIGHT, ...UPPER_LEFT].map(t => (
                    <ToothPill key={t} fdi={t} active={teeth.has(t)} onPress={() => toggle(t)} accent={accentColor} />
                  ))}
                </View>
                {/* Lower jaw */}
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[...LOWER_RIGHT.slice().reverse(), ...LOWER_LEFT.slice().reverse()].map(t => (
                    <ToothPill key={t} fdi={t} active={teeth.has(t)} onPress={() => toggle(t)} accent={accentColor} />
                  ))}
                </View>
              </View>
            </View>

            {/* Work type */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>Vaka Türü</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {WORK_TYPES.map(wt => {
                  const active = workType === wt;
                  return (
                    <Pressable
                      key={wt}
                      onPress={() => setWorkType(wt)}
                      style={{
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                        borderWidth: 1, borderColor: active ? accentColor : 'rgba(0,0,0,0.08)',
                        backgroundColor: active ? `${accentColor}12` : '#FFF',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: active ? accentColor : '#3C3C3C' }}>{wt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Notes */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>İş Detayı / Not</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Renk, ek talimat, ölçü detayı..."
                multiline
                style={{
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 13,
                  minHeight: 80, textAlignVertical: 'top',
                  // @ts-ignore web
                  outlineWidth: 0,
                }}
              />
            </View>

            {error && <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '500' }}>{error}</Text>}
          </ScrollView>

          {/* Footer */}
          <View style={{
            flexDirection: 'row', gap: 8, padding: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
            backgroundColor: '#FBF9F4',
            borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
          }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#3C3C3C' }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={{
                flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 12, borderRadius: 12,
                backgroundColor: accentColor,
                opacity: !canSave ? 0.5 : 1,
              }}
            >
              <Check size={14} color="#FFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>Kaydet & Planlamaya Aç</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ToothPill({ fdi, active, onPress, accent }: { fdi: number; active: boolean; onPress: () => void; accent: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 30, height: 34, borderRadius: 6,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? accent : '#F4F8FC',
        borderWidth: 1, borderColor: active ? accent : 'rgba(0,0,0,0.08)',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color: active ? '#FFF' : '#3C3C3C' }}>{fdi}</Text>
    </Pressable>
  );
}
