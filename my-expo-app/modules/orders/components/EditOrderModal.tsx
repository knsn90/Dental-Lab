/**
 * EditOrderModal — Admin-only sipariş düzenleme.
 *
 * Düzenlenebilir alanlar:
 *   • Hasta adı
 *   • Çalışma tipi (work_type) / Vaka tipi (case_type)
 *   • Renk (color) · Malzeme (material) · CAD versiyon
 *   • Teslim tarihi (delivery_date)
 *   • Acil mi (is_urgent)
 *   • Not (description / notes)
 *
 * Diş seçimi, doktor/klinik gibi yapısal alanlar burada değil — yapı bozuluyor.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput, ScrollView} from 'react-native';
import { X, Check, Pencil, AlertCircle, Flame } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { DatePicker } from '../../../core/ui/DatePicker';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface OrderLite {
  id: string;
  patient_name?: string | null;
  work_type?: string | null;
  case_type?: string | null;
  color?: string | null;
  material?: string | null;
  cad_version?: string | null;
  delivery_date?: string | null;
  is_urgent?: boolean | null;
  description?: string | null;
  notes?: string | null;
}

interface Props {
  visible: boolean;
  order: OrderLite | null;
  accentColor?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function EditOrderModal({ visible, order, accentColor = '#0A0A0A', onClose, onSaved }: Props) {
  const [patientName, setPatientName] = useState('');
  const [workType, setWorkType] = useState('');
  const [caseType, setCaseType] = useState('');
  const [color, setColor] = useState('');
  const [material, setMaterial] = useState('');
  const [cadVersion, setCadVersion] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !order) return;
    setPatientName(order.patient_name ?? '');
    setWorkType(order.work_type ?? '');
    setCaseType(order.case_type ?? '');
    setColor(order.color ?? '');
    setMaterial(order.material ?? '');
    setCadVersion(order.cad_version ?? '');
    setDeliveryDate(order.delivery_date ?? '');
    setIsUrgent(!!order.is_urgent);
    setNotes(order.notes ?? order.description ?? '');
    setError('');
  }, [visible, order]);

  const handleSave = async () => {
    if (!order) return;
    setSaving(true); setError('');
    const { error: e } = await supabase
      .from('work_orders')
      .update({
        patient_name: patientName.trim() || null,
        work_type: workType.trim() || null,
        case_type: caseType.trim() || null,
        color: color.trim() || null,
        material: material.trim() || null,
        cad_version: cadVersion.trim() || null,
        delivery_date: deliveryDate || null,
        is_urgent: isUrgent,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);
    setSaving(false);
    if (e) { setError(e.message); return; }
    onSaved();
  };

  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const sectionEyebrow: any = { fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 };
  const sectionSubtitle: any = { fontSize: 11, color: '#9A9A9A', fontWeight: '400', marginBottom: 14 };
  const fieldLabel: any = { fontSize: 11, fontWeight: '600', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7 };
  const cleanInput: any = { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 14, height: 44, fontSize: 14, color: '#0A0A0A', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 24, width: 600, maxWidth: '100%', maxHeight: '92%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18, gap: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: accentColor + '14',
                borderWidth: 1, borderColor: accentColor + '22',
              }}>
                <Pencil size={20} color={accentColor} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Sipariş düzenle · Yönetici
                </Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 24, letterSpacing: -0.5, color: '#0A0A0A', lineHeight: 30, marginTop: 2 }} numberOfLines={1}>
                  {order?.patient_name ?? 'Sipariş'}
                </Text>
                <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 2 }}>
                  Yapısal alanlar (doktor, diş seçimi) burada değiştirilemez.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 18,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={15} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginHorizontal: 28 }} />

          <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 22, paddingBottom: 22 }} showsVerticalScrollIndicator={false}>

            {/* HASTA & VAKA */}
            <Text style={sectionEyebrow}>Hasta & vaka</Text>
            <Text style={sectionSubtitle}>Hasta adı ve sipariş tipi</Text>
            <View style={{ marginBottom: 22, gap: 12 }}>
              <View>
                <Text style={fieldLabel}>Hasta adı</Text>
                <TextInput style={cleanInput} value={patientName} onChangeText={setPatientName} placeholder="Ad Soyad" placeholderTextColor="#9A9A9A" />
              </View>
              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={fieldLabel}>Çalışma tipi (work_type)</Text>
                  <TextInput style={cleanInput} value={workType} onChangeText={setWorkType} placeholder="örn. Kron, Köprü, İmplant…" placeholderTextColor="#9A9A9A" />
                </View>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={fieldLabel}>Vaka tipi (case_type)</Text>
                  <TextInput style={cleanInput} value={caseType} onChangeText={setCaseType} placeholder="örn. zirconia_crown" placeholderTextColor="#9A9A9A" autoCapitalize="none" />
                </View>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginBottom: 22 }} />

            {/* TEKNİK */}
            <Text style={sectionEyebrow}>Teknik</Text>
            <Text style={sectionSubtitle}>Renk, malzeme ve CAD versiyon</Text>
            <View style={{ marginBottom: 22, flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={fieldLabel}>Renk</Text>
                <TextInput style={cleanInput} value={color} onChangeText={setColor} placeholder="örn. A2" placeholderTextColor="#9A9A9A" />
              </View>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={fieldLabel}>Malzeme</Text>
                <TextInput style={cleanInput} value={material} onChangeText={setMaterial} placeholder="örn. zirkonyum" placeholderTextColor="#9A9A9A" />
              </View>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={fieldLabel}>CAD versiyon</Text>
                <TextInput style={cleanInput} value={cadVersion} onChangeText={setCadVersion} placeholder="v1, v2…" placeholderTextColor="#9A9A9A" />
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginBottom: 22 }} />

            {/* TESLİM & ACİL */}
            <Text style={sectionEyebrow}>Teslim & öncelik</Text>
            <Text style={sectionSubtitle}>Teslim tarihi ve acil işareti</Text>
            <View style={{ marginBottom: 22, flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text style={fieldLabel}>Teslim tarihi</Text>
                <DatePicker value={deliveryDate} onChange={setDeliveryDate} placeholder="Tarih seç" />
              </View>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text style={fieldLabel}>Öncelik</Text>
                <Pressable
                  onPress={() => setIsUrgent(v => !v)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 14, height: 44, borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isUrgent ? '#9C2E2E' : 'rgba(0,0,0,0.08)',
                    backgroundColor: isUrgent ? 'rgba(156,46,46,0.10)' : '#FFFFFF',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Flame size={14} color={isUrgent ? '#9C2E2E' : '#9A9A9A'} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: isUrgent ? '#9C2E2E' : '#6B6B6B' }}>
                    {isUrgent ? 'Acil' : 'Normal'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginBottom: 22 }} />

            {/* NOT */}
            <Text style={sectionEyebrow}>Not</Text>
            <Text style={sectionSubtitle}>Açıklama / hekim notu</Text>
            <View>
              <TextInput
                style={[cleanInput, { height: 96, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Sipariş notu, özel istekler vb."
                placeholderTextColor="#9A9A9A"
                multiline
              />
            </View>

            {error ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                padding: 12, marginTop: 14, backgroundColor: '#9C2E2E0F', borderRadius: 12,
                borderWidth: 1, borderColor: '#9C2E2E22',
              }}>
                <AlertCircle size={14} color="#9C2E2E" strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 18, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', backgroundColor: '#FBF9F4' }}>
            <Text style={{ flex: 1, fontSize: 11, color: '#9A9A9A', fontStyle: 'italic' }}>
              Değişiklikler audit log'a yansır.
            </Text>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B6B' }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: accentColor, opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer', boxShadow: `0 6px 20px ${accentColor}44` } as any : {}),
              }}
            >
              <Check size={14} color="#FFF" strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>
                {saving ? 'Kaydediliyor…' : 'Güncelle'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
