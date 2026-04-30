// MaterialConsumptionModal — stage tamamlamadan ÖNCE açılır.
// Eşleşen materyalleri listeler, kullanıcı her satırın miktarını gözden geçirir/düzenler,
// "Onayla" → record_stage_consumption RPC + onApproved() callback (advance).
// "Vazgeç" → hiçbir şey yapmaz; stage tamamlanmaz.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, StyleSheet, Platform,
} from 'react-native';

import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';

import { STAGE_LABEL, STAGE_COLOR, type Stage } from '../stages';
import {
  getConsumption, isValidConsumption,
  type MaterialLite, type ConsumptionType,
} from '../materialConsumption';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MaterialDB {
  id:                string;
  name:              string;
  type:              string | null;
  unit:              string | null;
  consumption_type:  ConsumptionType;
  units_per_tooth:   number | null;
  consume_at_stage:  string;
  quantity:          number;          // current stock
  unit_cost:         number | null;
}

interface RowState {
  material:      MaterialDB;
  quantity:      string;              // text input
  requires_input: boolean;
  editable:      boolean;
  basis:         string;
  alreadyDone:   boolean;             // bu materyal bu siparişe zaten OUT olarak düştü mü?
}

interface Props {
  visible:       boolean;
  workOrderId:   string;
  stage:         Stage;
  managerId:     string;
  /** Çağrı tarafı bunu sağlar (sipariş tooth_count + case_type) */
  toothCount:    number;
  caseType:      string | null;
  onClose:       () => void;
  /** "Onayla" başarılı → caller stage advance tetikler */
  onApproved:    () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MaterialConsumptionModal({
  visible, workOrderId, stage, managerId, toothCount, caseType,
  onClose, onApproved,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [rows, setRows]       = useState<RowState[]>([]);
  const [error, setError]     = useState<string | null>(null);

  // Load eligible materials when modal opens
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      // 1) Lab id'yi work_order'dan al
      const { data: wo } = await supabase
        .from('work_orders')
        .select('lab_id')
        .eq('id', workOrderId)
        .single();
      if (!wo) { setError('İş emri bulunamadı'); setLoading(false); return; }

      // 2) Bu lab'ın production stoklarından mevcut stage ile eşleşenleri çek
      const { data: items } = await supabase
        .from('stock_items')
        .select('id, name, type, unit, consumption_type, units_per_tooth, consume_at_stage, quantity, unit_cost')
        .eq('lab_id', wo.lab_id)
        .eq('usage_category', 'production')
        .eq('consume_at_stage', stage);

      // 3) case_type filter (client-side, esnek matching)
      const filtered = (items ?? []).filter((m: MaterialDB) => {
        if (!caseType) return true;
        if (!m.type)   return true;   // type yoksa her case'e eşleştir
        return m.type.toLowerCase() === caseType.toLowerCase()
            || m.type.toLowerCase().startsWith(caseType.toLowerCase());
      });

      // 4) Bu siparişte zaten tüketilmiş materyalleri öğren
      const { data: alreadyMovs } = await supabase
        .from('stock_movements')
        .select('item_id')
        .eq('order_id', workOrderId)
        .eq('type', 'OUT');
      const consumedIds = new Set((alreadyMovs ?? []).map((m: any) => m.item_id));

      // 5) Her eşleşen material için prefill hesapla
      const prepared: RowState[] = filtered.map((m: MaterialDB) => {
        const lite: MaterialLite = {
          id: m.id, name: m.name, type: m.type, unit: m.unit,
          consumption_type: m.consumption_type,
          units_per_tooth:  m.units_per_tooth,
          consume_at_stage: m.consume_at_stage,
        };
        const calc = getConsumption(
          { id: workOrderId, case_type: caseType, tooth_count: toothCount },
          lite,
        );
        return {
          material:       m,
          quantity:       calc.quantity > 0 ? String(calc.quantity) : '',
          requires_input: calc.requires_input,
          editable:       calc.editable,
          basis:          calc.basis,
          alreadyDone:    consumedIds.has(m.id),
        };
      });

      if (!cancelled) {
        setRows(prepared);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, workOrderId, stage, toothCount, caseType]);

  // ── Submit ─────────────────────────────────────────────────────────────
  const canSubmit = useMemo(() => {
    if (rows.length === 0) return true;   // boş eşleşme → direkt advance
    return rows.every(r => {
      if (r.alreadyDone) return true;     // skip
      const qty = parseFloat(r.quantity);
      if (r.requires_input && !(qty > 0)) return false;
      if (r.quantity && !(qty > 0)) return false;
      return true;
    });
  }, [rows]);

  async function handleConfirm() {
    if (!canSubmit) {
      setError('Tüm zorunlu miktarları doldurun');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = rows
        .filter(r => !r.alreadyDone)
        .map(r => ({ item_id: r.material.id, quantity: parseFloat(r.quantity) || 0 }))
        .filter(r => r.quantity > 0);

      if (payload.length > 0) {
        const { error: rpcErr } = await supabase.rpc('record_stage_consumption', {
          p_work_order_id: workOrderId,
          p_stage:         stage,
          p_items:         payload,
          p_user_id:       managerId,
        });
        if (rpcErr) throw rpcErr;
      }

      toast.success(payload.length > 0 ? `${payload.length} materyal düşüldü` : 'Aşama onaylandı');
      onApproved();
    } catch (e: any) {
      setError(e?.message ?? 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  }

  function setRowQty(id: string, val: string) {
    setRows(prev => prev.map(r =>
      r.material.id === id ? { ...r, quantity: val.replace(',', '.') } : r,
    ));
  }

  if (!visible) return null;

  const stageColor = STAGE_COLOR[stage] ?? '#0F172A';
  const total = rows.filter(r => !r.alreadyDone)
    .reduce((sum, r) => sum + (parseFloat(r.quantity) || 0) * (r.material.unit_cost ?? 0), 0);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={[s.stagePill, { backgroundColor: stageColor + '14' }]}>
              <Text style={[s.stagePillText, { color: stageColor }]}>{STAGE_LABEL[stage]}</Text>
            </View>
            <Text style={s.title}>Kullanılan Materyaller</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <AppIcon name="x" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={s.subtitle}>
            Bu aşama tamamlanmadan önce stoktan düşülecek miktarları onaylayın.
          </Text>

          {/* Body */}
          {loading ? (
            <View style={s.center}><ActivityIndicator size="large" color="#7C3AED" /></View>
          ) : rows.length === 0 ? (
            <View style={s.empty}>
              <AppIcon name="package" size={28} color="#CBD5E1" />
              <Text style={s.emptyText}>Bu aşama için tanımlı materyal yok</Text>
              <Text style={s.emptyHint}>Stage doğrudan onaylanabilir.</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ paddingVertical: 4 }}>
              {rows.map((r, i) => {
                const qty = parseFloat(r.quantity) || 0;
                const stockAfter = r.material.quantity - qty;
                const insufficient = qty > r.material.quantity && !r.alreadyDone;
                const isLast = i === rows.length - 1;
                return (
                  <View
                    key={r.material.id}
                    style={[s.row, !isLast && s.rowDivider, r.alreadyDone && { opacity: 0.55 }]}
                  >
                    <View style={s.rowHead}>
                      <Text style={s.rowName} numberOfLines={1}>{r.material.name}</Text>
                      {r.material.type && (
                        <View style={s.typePill}>
                          <Text style={s.typePillText}>{r.material.type.toUpperCase()}</Text>
                        </View>
                      )}
                      {r.alreadyDone && (
                        <View style={[s.tag, { backgroundColor: '#ECFDF5', borderColor: '#86EFAC' }]}>
                          <Text style={[s.tagText, { color: '#047857' }]}>✓ Düşüldü</Text>
                        </View>
                      )}
                    </View>

                    <Text style={s.rowMeta}>
                      {r.basis}
                      {' · stok: '}{r.material.quantity}{r.material.unit ? ` ${r.material.unit}` : ''}
                    </Text>

                    {!r.alreadyDone && (
                      <View style={s.qtyRow}>
                        <TextInput
                          value={r.quantity}
                          onChangeText={v => setRowQty(r.material.id, v)}
                          editable={r.editable}
                          keyboardType="numeric"
                          placeholder={r.requires_input ? 'Manuel miktar girin' : '0'}
                          placeholderTextColor="#CBD5E1"
                          style={[
                            s.qtyInput,
                            !r.editable && s.qtyInputLocked,
                            insufficient && s.qtyInputBad,
                          ]}
                        />
                        {r.material.unit && (
                          <Text style={s.unit}>{r.material.unit}</Text>
                        )}
                        {qty > 0 && (
                          <Text style={[s.afterStock, insufficient && { color: '#DC2626' }]}>
                            → kalan: {stockAfter}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {error && <Text style={s.errorText}>{error}</Text>}

          {/* Footer */}
          <View style={s.footer}>
            <View style={{ flex: 1 }}>
              {total > 0 && (
                <Text style={s.totalText}>
                  Tahmini maliyet: <Text style={{ color: '#0F172A', fontWeight: '800' }}>~{total.toLocaleString('tr-TR')} ₺</Text>
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={s.cancelBtn} disabled={saving}>
              <Text style={s.cancelText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={saving || !canSubmit}
              style={[s.confirmBtn, (!canSubmit || saving) && { opacity: 0.5 }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={s.confirmText}>Onayla & İlerlet</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
  stagePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  stagePillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },

  subtitle: { fontSize: 12, color: '#64748B' },

  center: { paddingVertical: 40, alignItems: 'center' },
  empty:  { paddingVertical: 30, alignItems: 'center', gap: 6 },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  emptyHint: { fontSize: 12, color: '#94A3B8' },

  row: { paddingVertical: 10, gap: 4 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  typePill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: '#F1F5F9' },
  typePillText: { fontSize: 9, fontWeight: '800', color: '#475569', letterSpacing: 0.4 },
  tag:    { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  tagText:{ fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  rowMeta: { fontSize: 11, color: '#64748B' },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  qtyInput: {
    flex: 1, maxWidth: 140,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10,
    fontSize: 14, fontWeight: '700', color: '#0F172A',
    backgroundColor: '#F8FAFC',
    outlineStyle: 'none',
  } as any,
  qtyInputLocked: { backgroundColor: '#F1F5F9', color: '#475569' },
  qtyInputBad:    { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', color: '#DC2626' },
  unit: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  afterStock: { fontSize: 11, color: '#94A3B8' },

  errorText: { fontSize: 12, color: '#DC2626', fontWeight: '700' },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  totalText: { fontSize: 12, color: '#64748B' },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F5F9' },
  cancelText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  confirmBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.1 },
});
