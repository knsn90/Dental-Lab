// WasteReportModal — manuel fire/kayıp bildirimi.
// Material seç + miktar gir + opsiyonel sebep → record_waste RPC.
// Sadece manuel (kullanıcı onayı zorunlu).

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, Platform, Pressable,
} from 'react-native';

import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';

interface MaterialOption {
  id:       string;
  name:     string;
  type:     string | null;
  unit:     string | null;
  quantity: number;
}

interface Props {
  visible:    boolean;
  labId:      string;
  userId:     string;
  /** Opsiyonel — fire belirli bir siparişle ilişkiliyse */
  orderId?:   string | null;
  /** Opsiyonel — material önceden seçili açılsın */
  initialMaterialId?: string | null;
  onClose:    () => void;
  onSaved?:   () => void;
}

const REASON_PRESETS = [
  'Kırıldı', 'Yanlış üretim', 'Hatalı kesim', 'Çatlak',
  'Ölçü hatası', 'Renk uyumsuz', 'Diğer',
];

export function WasteReportModal({
  visible, labId, userId, orderId, initialMaterialId, onClose, onSaved,
}: Props) {
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty]               = useState('');
  const [reason, setReason]         = useState('');
  const [search, setSearch]         = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('stock_items')
        .select('id, name, type, unit, quantity')
        .eq('lab_id', labId)
        .order('name');
      if (cancelled) return;
      setMaterials((data ?? []) as MaterialOption[]);
      setSelectedId(initialMaterialId ?? null);
      setQty('');
      setReason('');
      setSearch('');
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [visible, labId, initialMaterialId]);

  const selected = useMemo(
    () => materials.find(m => m.id === selectedId) ?? null,
    [materials, selectedId],
  );

  const filtered = useMemo(() => {
    if (!search) return materials;
    const q = search.toLowerCase();
    return materials.filter(m =>
      m.name.toLowerCase().includes(q) || (m.type ?? '').toLowerCase().includes(q),
    );
  }, [materials, search]);

  const qtyN = parseFloat(qty.replace(',', '.'));
  const valid = selectedId && qtyN > 0 && (!selected || qtyN <= selected.quantity);

  async function handleSubmit() {
    if (!valid || !selected) return;
    setSaving(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc('record_waste', {
      p_item_id:   selected.id,
      p_quantity:  qtyN,
      p_user_id:   userId,
      p_order_id:  orderId ?? null,
      p_reason:    reason.trim() || null,
    });
    setSaving(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    toast.success('Fire kaydedildi');
    onSaved?.();
    onClose();
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation?.()}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              <AppIcon name="alert-triangle" size={16} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Fire Bildirimi</Text>
              <Text style={s.subtitle}>Hatalı üretim, kırılma veya kayıp</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <AppIcon name="x" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#DC2626" />
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
              {/* Material picker */}
              <View>
                <Text style={s.label}>MATERYAL</Text>
                {!selectedId ? (
                  <>
                    <View style={s.searchPill}>
                      <AppIcon name="search" size={14} color="#94A3B8" />
                      <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Ara..."
                        placeholderTextColor="#CBD5E1"
                        style={s.searchInput as any}
                      />
                    </View>
                    <View style={s.matList}>
                      {filtered.length === 0 ? (
                        <Text style={s.empty}>Materyal bulunamadı</Text>
                      ) : filtered.map((m, i) => (
                        <TouchableOpacity
                          key={m.id}
                          onPress={() => { setSelectedId(m.id); setSearch(''); }}
                          style={[s.matRow, i < filtered.length - 1 && s.matRowDivider]}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.matName} numberOfLines={1}>{m.name}</Text>
                            {m.type && <Text style={s.matMeta} numberOfLines={1}>{m.type}</Text>}
                          </View>
                          <Text style={s.matStock}>
                            {m.quantity}{m.unit ? ` ${m.unit}` : ''}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <View style={s.selectedBox}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.selectedName} numberOfLines={1}>{selected?.name}</Text>
                      <Text style={s.selectedMeta} numberOfLines={1}>
                        Stok: {selected?.quantity}{selected?.unit ? ` ${selected.unit}` : ''}
                        {selected?.type ? ` · ${selected.type}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedId(null)}
                      style={s.changeBtn}
                    >
                      <Text style={s.changeBtnText}>Değiştir</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Quantity */}
              {selectedId && (
                <View>
                  <Text style={s.label}>FİRE MİKTARI</Text>
                  <View style={s.qtyRow}>
                    <TextInput
                      value={qty}
                      onChangeText={setQty}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#CBD5E1"
                      style={[
                        s.qtyInput,
                        qtyN > (selected?.quantity ?? 0) && s.qtyInputBad,
                      ]}
                      autoFocus
                    />
                    {selected?.unit && <Text style={s.qtyUnit}>{selected.unit}</Text>}
                  </View>
                  {qtyN > (selected?.quantity ?? 0) && (
                    <Text style={s.errorMini}>Stoktan fazla: en fazla {selected?.quantity}</Text>
                  )}
                </View>
              )}

              {/* Reason */}
              {selectedId && (
                <View>
                  <Text style={s.label}>SEBEP (opsiyonel)</Text>
                  <View style={s.reasonChips}>
                    {REASON_PRESETS.map(p => {
                      const active = reason === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          onPress={() => setReason(active ? '' : p)}
                          style={[s.reasonChip, active && s.reasonChipActive]}
                        >
                          <Text style={[s.reasonChipText, active && s.reasonChipTextActive]}>{p}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Veya kendi açıklamanızı yazın..."
                    placeholderTextColor="#CBD5E1"
                    multiline
                    style={s.reasonInput as any}
                  />
                </View>
              )}

              {error && <Text style={s.errorMsg}>{error}</Text>}
            </ScrollView>
          )}

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity onPress={onClose} style={s.cancelBtn} disabled={saving}>
              <Text style={s.cancelText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={saving || !valid}
              style={[s.confirmBtn, (!valid || saving) && { opacity: 0.5 }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={s.confirmText}>Fire Bildir</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const SHADOW = Platform.select({
  web:     { boxShadow: '0 20px 60px rgba(0,0,0,0.30)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.30, shadowRadius: 60, shadowOffset: { width: 0, height: 20 }, elevation: 10 },
});

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: {
    width: '100%', maxWidth: 540,
    backgroundColor: '#FFFFFF',
    borderRadius: 18, padding: 18, gap: 12,
    ...SHADOW,
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },

  label: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 6 },

  searchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#0F172A', outlineStyle: 'none' } as any,

  matList: {
    backgroundColor: '#F8FAFC', borderRadius: 10,
    maxHeight: 240,
  },
  matRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  matRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  matName:  { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  matMeta:  { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  matStock: { fontSize: 12, fontWeight: '700', color: '#475569' },
  empty: { fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: 24 },

  selectedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FEE2E2', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#FCA5A5',
  },
  selectedName: { fontSize: 14, fontWeight: '800', color: '#7F1D1D' },
  selectedMeta: { fontSize: 11, color: '#991B1B', marginTop: 2 },
  changeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FCA5A5' },
  changeBtnText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput: {
    flex: 1, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
    fontSize: 16, fontWeight: '800', color: '#0F172A',
    backgroundColor: '#F8FAFC',
    outlineStyle: 'none',
  } as any,
  qtyInputBad: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', color: '#DC2626' },
  qtyUnit: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  errorMini: { fontSize: 11, color: '#DC2626', marginTop: 4, fontWeight: '700' },

  reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  reasonChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  reasonChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  reasonChipText:        { fontSize: 11, fontWeight: '600', color: '#475569' },
  reasonChipTextActive:  { color: '#FFFFFF', fontWeight: '700' },
  reasonInput: {
    backgroundColor: '#F8FAFC', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: '#0F172A',
    minHeight: 60, textAlignVertical: 'top',
    outlineStyle: 'none',
  } as any,

  errorMsg: { fontSize: 12, color: '#DC2626', fontWeight: '700' },

  footer: { flexDirection: 'row', gap: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },
});
