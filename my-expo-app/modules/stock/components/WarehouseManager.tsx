// modules/stock/components/WarehouseManager.tsx
// Depo (warehouses) + Konum (stock_locations) yönetim paneli.
// LocationsTab içinde kullanılır.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, TextInput, Platform, Modal, ScrollView, Alert } from 'react-native';
import { Warehouse, MapPin, Plus, Pencil, Trash2, X, Building2 } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { usePermissions } from '../../../core/hooks/usePermissions';
import { DS } from '../../../core/theme/dsTokens';

export interface WarehouseRow {
  id: string;
  lab_id: string;
  name: string;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface LocationRow {
  id: string;
  lab_id: string;
  warehouse_id: string | null;
  name: string;
  notes: string | null;
  is_active: boolean;
}

interface Props {
  accentColor: string;
  onChange?: () => void;
  /** Üst başlık satırını (ikon + başlık + Depo Ekle butonu) gizler. */
  hideHeader?: boolean;
}

export interface WarehouseManagerRef {
  openAddWarehouse: () => void;
}

const cardStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: 18,
  padding: 18,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.04)',
  ...(Platform.OS === 'web'
    ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }
    : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 }),
} as any;

const inputStyle = {
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.08)',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
  backgroundColor: '#FFF',
  color: DS.ink[900],
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
} as any;

export const WarehouseManager = React.forwardRef<WarehouseManagerRef, Props>(function WarehouseManager(
  { accentColor, onChange, hideHeader }: Props,
  ref,
) {
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? profile?.id ?? null;
  const { can } = usePermissions();
  // Lokasyon yetkisi: manage_stock_locations veya manage_warehouses → ekle/düzenle/sil
  const canManage = can('manage_stock_locations') || can('manage_warehouses');

  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [whModal, setWhModal] = useState<{ visible: boolean; row: Partial<WarehouseRow> | null }>({ visible: false, row: null });
  const [locModal, setLocModal] = useState<{ visible: boolean; row: Partial<LocationRow> | null; warehouseId: string | null }>({ visible: false, row: null, warehouseId: null });

  const fetchAll = useCallback(async () => {
    if (!labId) return;
    const [w, l] = await Promise.all([
      supabase.from('warehouses').select('*').eq('lab_id', labId).order('name'),
      supabase.from('stock_locations').select('*').eq('lab_id', labId).order('name'),
    ]);
    if (!w.error) setWarehouses((w.data as WarehouseRow[]) ?? []);
    if (!l.error) setLocations((l.data as LocationRow[]) ?? []);
    setLoading(false);
  }, [labId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveWarehouse = async () => {
    const row = whModal.row;
    if (!row || !row.name?.trim() || !labId) return;
    const payload: any = {
      lab_id: labId,
      name: row.name.trim(),
      address: row.address?.trim() || null,
      notes: row.notes?.trim() || null,
    };
    let err: any = null;
    if (row.id) {
      const r = await supabase.from('warehouses').update(payload).eq('id', row.id);
      err = r.error;
    } else {
      const r = await supabase.from('warehouses').insert(payload);
      err = r.error;
    }
    if (err) {
      if (Platform.OS === 'web') alert('Depo kaydedilemedi: ' + err.message);
      else Alert.alert('Hata', err.message);
      return;
    }
    setWhModal({ visible: false, row: null });
    fetchAll();
    onChange?.();
  };

  const deleteWarehouse = async (w: WarehouseRow) => {
    const ok = Platform.OS === 'web'
      ? confirm(`"${w.name}" deposunu silmek istediğine emin misin? İçindeki konumlar deposuz kalacak.`)
      : true;
    if (!ok) return;
    const { error } = await supabase.from('warehouses').delete().eq('id', w.id);
    if (error) {
      if (Platform.OS === 'web') alert('Silinemedi: ' + error.message);
      else Alert.alert('Hata', error.message);
      return;
    }
    fetchAll();
    onChange?.();
  };

  const saveLocation = async () => {
    const row = locModal.row;
    if (!row || !row.name?.trim() || !labId) return;
    const payload: any = {
      lab_id: labId,
      warehouse_id: row.warehouse_id ?? locModal.warehouseId ?? null,
      name: row.name.trim(),
      notes: row.notes?.trim() || null,
    };
    let err: any = null;
    if (row.id) {
      const r = await supabase.from('stock_locations').update(payload).eq('id', row.id);
      err = r.error;
    } else {
      const r = await supabase.from('stock_locations').insert(payload);
      err = r.error;
    }
    if (err) {
      if (Platform.OS === 'web') alert('Konum kaydedilemedi: ' + err.message);
      else Alert.alert('Hata', err.message);
      return;
    }
    setLocModal({ visible: false, row: null, warehouseId: null });
    fetchAll();
    onChange?.();
  };

  const deleteLocation = async (l: LocationRow) => {
    const ok = Platform.OS === 'web'
      ? confirm(`"${l.name}" konumunu silmek istediğine emin misin?`)
      : true;
    if (!ok) return;
    const { error } = await supabase.from('stock_locations').delete().eq('id', l.id);
    if (error) {
      if (Platform.OS === 'web') alert('Silinemedi: ' + error.message);
      else Alert.alert('Hata', error.message);
      return;
    }
    fetchAll();
    onChange?.();
  };

  const unassignedLocations = locations.filter(l => !l.warehouse_id);

  React.useImperativeHandle(ref, () => ({
    openAddWarehouse: () => setWhModal({ visible: true, row: { name: '', address: '', notes: '' } }),
  }), []);

  return (
    <View style={hideHeader ? { gap: 14 } : [cardStyle, { gap: 14 }]}>
      {/* Header */}
      {!hideHeader && (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentColor + '14', alignItems: 'center', justifyContent: 'center' }}>
          <Building2 size={16} color={accentColor} strokeWidth={1.6} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: DS.ink[900] }}>Depo & Konum Yönetimi</Text>
          <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>
            Depo ekle, depo içine raf/dolap konumları tanımla.
          </Text>
        </View>
        {canManage && (
          <Pressable
            onPress={() => setWhModal({ visible: true, row: { name: '', address: '', notes: '' } })}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: accentColor, borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 8,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any}
          >
            <Plus size={14} color="#FFF" strokeWidth={2} />
            <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Depo Ekle</Text>
          </Pressable>
        )}
      </View>
      )}

      {/* Warehouses list */}
      {loading ? (
        <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center', paddingVertical: 20 }}>Yükleniyor…</Text>
      ) : warehouses.length === 0 && unassignedLocations.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
          <Warehouse size={28} color={DS.ink[200]} strokeWidth={1.2} />
          <Text style={{ fontSize: 13, color: DS.ink[400] }}>Henüz depo ya da konum yok.</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {warehouses.map(w => {
            const wLocs = locations.filter(l => l.warehouse_id === w.id);
            return (
              <View key={w.id} style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderRadius: 12, padding: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Warehouse size={15} color={accentColor} strokeWidth={1.6} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{w.name}</Text>
                    {!!w.address && <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{w.address}</Text>}
                  </View>
                  {canManage && (
                    <>
                      <Pressable
                        onPress={() => setLocModal({ visible: true, row: { name: '', notes: '', warehouse_id: w.id }, warehouseId: w.id })}
                        hitSlop={8}
                        style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                      >
                        <Plus size={14} color={accentColor} strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        onPress={() => setWhModal({ visible: true, row: w })}
                        hitSlop={8}
                        style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                      >
                        <Pencil size={13} color={DS.ink[400]} strokeWidth={1.6} />
                      </Pressable>
                      <Pressable
                        onPress={() => deleteWarehouse(w)}
                        hitSlop={8}
                        style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                      >
                        <Trash2 size={13} color="#DC2626" strokeWidth={1.6} />
                      </Pressable>
                    </>
                  )}
                </View>

                {wLocs.length === 0 ? (
                  <Text style={{ fontSize: 11, color: DS.ink[400], fontStyle: 'italic', paddingLeft: 23 }}>
                    {canManage ? 'Henüz konum yok — sağdaki + ile ekle.' : 'Henüz konum yok.'}
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 23 }}>
                    {wLocs.map(l => (
                      <View key={l.id} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: accentColor + '0F', borderRadius: 8,
                        paddingLeft: 10, paddingRight: 4, paddingVertical: 4,
                      }}>
                        <MapPin size={11} color={accentColor} strokeWidth={1.6} />
                        <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800], paddingRight: canManage ? 0 : 6 }}>{l.name}</Text>
                        {canManage && (
                          <>
                            <Pressable
                              onPress={() => setLocModal({ visible: true, row: l, warehouseId: l.warehouse_id })}
                              hitSlop={6}
                              style={{ padding: 4, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                            >
                              <Pencil size={10} color={DS.ink[500]} strokeWidth={1.6} />
                            </Pressable>
                            <Pressable
                              onPress={() => deleteLocation(l)}
                              hitSlop={6}
                              style={{ padding: 4, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                            >
                              <X size={10} color="#DC2626" strokeWidth={1.6} />
                            </Pressable>
                          </>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {unassignedLocations.length > 0 && (
            <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.12)', borderRadius: 12, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MapPin size={14} color={DS.ink[400]} strokeWidth={1.6} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>Deposuz Konumlar</Text>
                {canManage && (
                  <Pressable
                    onPress={() => setLocModal({ visible: true, row: { name: '', notes: '', warehouse_id: null }, warehouseId: null })}
                    hitSlop={8}
                    style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                  >
                    <Plus size={14} color={accentColor} strokeWidth={2} />
                  </Pressable>
                )}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {unassignedLocations.map(l => (
                  <View key={l.id} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: '#F3F4F6', borderRadius: 8,
                    paddingLeft: 10, paddingRight: 4, paddingVertical: 4,
                  }}>
                    <MapPin size={11} color={DS.ink[500]} strokeWidth={1.6} />
                    <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800], paddingRight: canManage ? 0 : 6 }}>{l.name}</Text>
                    {canManage && (
                      <>
                        <Pressable
                          onPress={() => setLocModal({ visible: true, row: l, warehouseId: null })}
                          hitSlop={6}
                          style={{ padding: 4, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                        >
                          <Pencil size={10} color={DS.ink[500]} strokeWidth={1.6} />
                        </Pressable>
                        <Pressable
                          onPress={() => deleteLocation(l)}
                          hitSlop={6}
                          style={{ padding: 4, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                        >
                          <X size={10} color="#DC2626" strokeWidth={1.6} />
                        </Pressable>
                      </>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {warehouses.length === 0 && canManage && (
            <Pressable
              onPress={() => setLocModal({ visible: true, row: { name: '', notes: '', warehouse_id: null }, warehouseId: null })}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.15)',
                borderRadius: 12, padding: 12,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              } as any}
            >
              <Plus size={13} color={DS.ink[500]} strokeWidth={1.6} />
              <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>Deposuz Konum Ekle</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Warehouse Modal */}
      <Modal visible={whModal.visible} transparent animationType="fade" onRequestClose={() => setWhModal({ visible: false, row: null })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 20, width: '100%', maxWidth: 480, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Warehouse size={18} color={accentColor} strokeWidth={1.6} />
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>
                {whModal.row?.id ? 'Depoyu Düzenle' : 'Yeni Depo'}
              </Text>
              <Pressable onPress={() => setWhModal({ visible: false, row: null })} hitSlop={8}>
                <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
              </Pressable>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Depo adı *</Text>
              <TextInput
                style={inputStyle}
                value={whModal.row?.name ?? ''}
                onChangeText={t => setWhModal(s => ({ ...s, row: { ...s.row, name: t } }))}
                placeholder="Ana Depo, Şube 1, vb."
                placeholderTextColor={DS.ink[400]}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Adres</Text>
              <TextInput
                style={inputStyle}
                value={whModal.row?.address ?? ''}
                onChangeText={t => setWhModal(s => ({ ...s, row: { ...s.row, address: t } }))}
                placeholder="Opsiyonel"
                placeholderTextColor={DS.ink[400]}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Notlar</Text>
              <TextInput
                style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]}
                value={whModal.row?.notes ?? ''}
                onChangeText={t => setWhModal(s => ({ ...s, row: { ...s.row, notes: t } }))}
                placeholder="Opsiyonel"
                placeholderTextColor={DS.ink[400]}
                multiline
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Pressable
                onPress={() => setWhModal({ visible: false, row: null })}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[700] }}>İptal</Text>
              </Pressable>
              <Pressable
                onPress={saveWarehouse}
                disabled={!whModal.row?.name?.trim()}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                  backgroundColor: whModal.row?.name?.trim() ? accentColor : DS.ink[200],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Kaydet</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Location Modal */}
      <Modal visible={locModal.visible} transparent animationType="fade" onRequestClose={() => setLocModal({ visible: false, row: null, warehouseId: null })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 20, width: '100%', maxWidth: 480, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MapPin size={18} color={accentColor} strokeWidth={1.6} />
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>
                {locModal.row?.id ? 'Konumu Düzenle' : 'Yeni Konum'}
              </Text>
              <Pressable onPress={() => setLocModal({ visible: false, row: null, warehouseId: null })} hitSlop={8}>
                <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
              </Pressable>
            </View>

            {warehouses.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Depo</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <Pressable
                    onPress={() => setLocModal(s => ({ ...s, row: { ...s.row, warehouse_id: null } }))}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                      backgroundColor: (locModal.row?.warehouse_id ?? null) === null ? accentColor : '#F3F4F6',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: (locModal.row?.warehouse_id ?? null) === null ? '#FFF' : DS.ink[700] }}>Depo Yok</Text>
                  </Pressable>
                  {warehouses.map(w => {
                    const active = locModal.row?.warehouse_id === w.id;
                    return (
                      <Pressable
                        key={w.id}
                        onPress={() => setLocModal(s => ({ ...s, row: { ...s.row, warehouse_id: w.id } }))}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                          backgroundColor: active ? accentColor : '#F3F4F6',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFF' : DS.ink[700] }}>{w.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Konum adı *</Text>
              <TextInput
                style={inputStyle}
                value={locModal.row?.name ?? ''}
                onChangeText={t => setLocModal(s => ({ ...s, row: { ...s.row, name: t } }))}
                placeholder="Raf A1, Dolap 2 - Üst, vb."
                placeholderTextColor={DS.ink[400]}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Notlar</Text>
              <TextInput
                style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]}
                value={locModal.row?.notes ?? ''}
                onChangeText={t => setLocModal(s => ({ ...s, row: { ...s.row, notes: t } }))}
                placeholder="Opsiyonel"
                placeholderTextColor={DS.ink[400]}
                multiline
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Pressable
                onPress={() => setLocModal({ visible: false, row: null, warehouseId: null })}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[700] }}>İptal</Text>
              </Pressable>
              <Pressable
                onPress={saveLocation}
                disabled={!locModal.row?.name?.trim()}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                  backgroundColor: locModal.row?.name?.trim() ? accentColor : DS.ink[200],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Kaydet</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

export default WarehouseManager;
