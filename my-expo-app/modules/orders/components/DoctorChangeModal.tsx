// modules/orders/components/DoctorChangeModal.tsx
// Admin/manager bir sipariş için doktor (ve dolayısıyla klinik) değiştirir.
// doctors tablosundan arama + seçim → work_orders.doctor_id update.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput, ScrollView, Platform,
} from 'react-native';
import { Search, X, UserCheck, Check, Building2 } from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface DoctorOption {
  id:           string;
  full_name:    string;
  phone?:       string | null;
  clinic_name?: string | null;
  is_active?:   boolean;
}

interface Props {
  visible:        boolean;
  workOrderId:    string;
  currentDoctorId?: string | null;
  onClose:        () => void;
  onChanged:      () => void;
  accentColor?:   string;
}

export function DoctorChangeModal({ visible, workOrderId, currentDoctorId, onClose, onChanged, accentColor = '#4771AB' }: Props) {
  const [list,   setList]    = useState<DoctorOption[]>([]);
  const [search, setSearch]  = useState('');
  const [picked, setPicked]  = useState<string | null>(currentDoctorId ?? null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setPicked(currentDoctorId ?? null);
    (async () => {
      setLoading(true);
      // External doctors (doctors tablosu) + profiles içindeki user_type='doctor'
      const [{ data: ext }, { data: profs }] = await Promise.all([
        supabase.from('doctors').select('id, full_name, phone, clinic:clinics(name), is_active').order('full_name'),
        supabase.from('profiles').select('id, full_name, phone, clinic_name, is_active').eq('user_type', 'doctor').order('full_name'),
      ]);
      const merged: DoctorOption[] = [];
      (ext ?? []).forEach((d: any) => merged.push({
        id: d.id, full_name: d.full_name, phone: d.phone,
        clinic_name: d.clinic?.name ?? null, is_active: d.is_active ?? true,
      }));
      (profs ?? []).forEach((p: any) => merged.push({
        id: p.id, full_name: p.full_name, phone: p.phone,
        clinic_name: p.clinic_name ?? null, is_active: p.is_active ?? true,
      }));
      // Dedup by id
      const map = new Map<string, DoctorOption>();
      merged.forEach(d => { if (d.is_active !== false && !map.has(d.id)) map.set(d.id, d); });
      setList([...map.values()]);
      setLoading(false);
    })();
  }, [visible, currentDoctorId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(d =>
      d.full_name.toLowerCase().includes(q)
      || d.clinic_name?.toLowerCase().includes(q)
      || d.phone?.toLowerCase().includes(q),
    );
  }, [list, search]);

  async function handleSave() {
    if (!picked || picked === currentDoctorId) { onClose(); return; }
    setSaving(true); setError(null);
    const { error: dbErr } = await supabase
      .from('work_orders')
      .update({ doctor_id: picked })
      .eq('id', workOrderId);
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onChanged();
    onClose();
  }

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable
          onPress={() => { /* swallow */ }}
          style={{
            width: '100%', maxWidth: 520, maxHeight: '90%',
            backgroundColor: '#FFFFFF', borderRadius: 20,
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(15,23,42,0.20)' } as any : {}),
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accentColor}18` }}>
              <UserCheck size={18} color={accentColor} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1, textTransform: 'uppercase' }}>Sipariş</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#0A0A0A' }}>Hekim / Klinik Değiştir</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
              <X size={14} color="#6B6B6B" />
            </Pressable>
          </View>

          {/* Search */}
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.04)' }}>
              <Search size={14} color="#9A9A9A" strokeWidth={1.8} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Hekim adı, klinik veya telefon ile ara..."
                placeholderTextColor="#9A9A9A"
                style={{ flex: 1, fontSize: 13, color: '#0A0A0A', ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}) }}
              />
            </View>
          </View>

          {/* List */}
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 6 }}>
            {loading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={accentColor} />
              </View>
            ) : filtered.length === 0 ? (
              <Text style={{ fontSize: 12, color: '#9A9A9A', padding: 24, textAlign: 'center' }}>
                Eşleşen hekim yok
              </Text>
            ) : (
              filtered.map(d => {
                const active = picked === d.id;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => setPicked(d.id)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 12, borderRadius: 12,
                      borderWidth: 1, borderColor: active ? accentColor : 'rgba(0,0,0,0.06)',
                      backgroundColor: active ? `${accentColor}08` : '#FFF',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accentColor}18` }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: accentColor }}>
                        {d.full_name.split(' ').map(s => s[0]).slice(0, 2).join('')}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A' }} numberOfLines={1}>{d.full_name}</Text>
                      {d.clinic_name ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Building2 size={10} color="#9A9A9A" strokeWidth={1.8} />
                          <Text style={{ fontSize: 11, color: '#6B6B6B' }} numberOfLines={1}>{d.clinic_name}</Text>
                        </View>
                      ) : null}
                    </View>
                    {active && <Check size={16} color={accentColor} strokeWidth={2.4} />}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {error && (
            <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '500', paddingHorizontal: 22, paddingBottom: 6 }}>{error}</Text>
          )}

          {/* Footer */}
          <View style={{ flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#3C3C3C' }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || !picked || picked === currentDoctorId}
              style={{
                flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 12, borderRadius: 12, backgroundColor: accentColor,
                opacity: (saving || !picked || picked === currentDoctorId) ? 0.5 : 1,
              }}
            >
              <Check size={14} color="#FFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>Kaydet</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
