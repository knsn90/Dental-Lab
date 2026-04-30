// modules/orders/components/StageChecklistModal.tsx
// Generic stage checklist modal — STAGE_CHECKLIST tablosundan beslenir.
// Her stage için aynı mantık: tüm tikler dolu → "Onayla & Devam".
// DESIGN için ek olarak hekim onay toggle'ı.

import React, { useState } from 'react';
import { Modal, Pressable, View, Text, ScrollView, TouchableOpacity, TextInput, Switch, Platform, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';
import { STAGE_CHECKLIST, STAGE_LABEL, STAGE_COLOR, type Stage } from '../stages';
import { MaterialConsumptionModal } from './MaterialConsumptionModal';

interface Props {
  visible:           boolean;
  stage:             Stage;
  workOrderId:       string;
  managerId:         string;
  doctorId?:         string | null;
  /** İş emrinin requires_design_approval flag'i — DESIGN için modal'a default gelir */
  requiresDoctorApproval?: boolean;
  onClose:           () => void;
  /** Checklist tamam + (gerekirse) hekim onay toggle açıkdeğil → caller advance tetikler */
  onApproved:        () => void;
}

export function StageChecklistModal({
  visible, stage, workOrderId, managerId, doctorId,
  requiresDoctorApproval = false,
  onClose, onApproved,
}: Props) {
  const items = STAGE_CHECKLIST[stage] ?? [];
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map(i => [i.key, false])),
  );
  const [notes, setNotes] = useState('');
  const [needsDoctor, setNeedsDoctor] = useState(stage === 'DESIGN' && requiresDoctorApproval);
  const [saving, setSaving] = useState(false);
  // Material consumption confirmation step (shown after checklist save, before advance)
  const [consumptionOpen, setConsumptionOpen]   = useState(false);
  const [consumeContext, setConsumeContext]     = useState<{ toothCount: number; caseType: string | null } | null>(null);

  const allChecked = items.length === 0 || items.every(i => checks[i.key]);
  const stageColor = STAGE_COLOR[stage];

  const toggle = (key: string) => setChecks(c => ({ ...c, [key]: !c[key] }));

  async function handleSave() {
    if (!allChecked) {
      toast.error('Tüm kontrol maddelerini işaretle');
      return;
    }
    setSaving(true);

    // 1. checklist_log'a yaz (her item için bir satır, upsert)
    const rows = items.map(i => ({
      work_order_id: workOrderId,
      stage,
      item_key:      i.key,
      checked:       checks[i.key],
      checked_by:    managerId,
      checked_at:    new Date().toISOString(),
    }));
    if (rows.length > 0) {
      const { error: clErr } = await supabase
        .from('checklist_log')
        .upsert(rows, { onConflict: 'work_order_id,stage,item_key' });
      if (clErr) {
        setSaving(false);
        toast.error('Checklist kayıt: ' + clErr.message);
        return;
      }
    }

    // 2. DESIGN + doctor flag → design_qc_checks insert (legacy modeli korur)
    if (stage === 'DESIGN') {
      await supabase.from('design_qc_checks').insert({
        stage_id: null,    // optional — RPC tarafında bağlanır
        work_order_id: workOrderId,
        margin_ok:      checks.margin_ok      ?? false,
        die_spacing_ok: checks.die_spacing_ok ?? false,
        contacts_ok:    checks.contacts_ok    ?? false,
        occlusion_ok:   checks.occlusion_ok   ?? false,
        anatomy_ok:     checks.anatomy_ok     ?? false,
        stl_export_ok:  checks.stl_export_ok  ?? false,
        notes:          notes || null,
        checked_by:     managerId,
        checked_at:     new Date().toISOString(),
        needs_doctor_approval: needsDoctor,
        doctor_id:      needsDoctor ? doctorId ?? null : null,
      });
    }

    setSaving(false);

    if (stage === 'DESIGN' && needsDoctor) {
      // Token üret + doktora otomatik mesaj gönder (in-app inbox)
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lab.esenkim.com';
      const { data: token, error: tokErr } = await supabase
        .rpc('generate_and_send_doctor_approval', {
          p_work_order_id: workOrderId,
          p_manager_id:    managerId,
          p_base_url:      origin,
        });
      if (tokErr) {
        toast.error('Onay isteği gönderilemedi: ' + tokErr.message);
        return;
      }
      const link = `${origin}/doctor-approval/${token}`;

      // Yedek olarak clipboard'a da kopyala
      if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
        try { await (navigator as any).clipboard.writeText(link); } catch {}
      }
      toast.success('Hekime onay isteği gönderildi (48h geçerli)');
      console.log('[Doctor Approval Link]', link);
      onClose();
      return;
    }
    // Checklist tamam → materyal tüketim onay adımı (zorunlu)
    // toothCount + case_type'ı work_orders'tan çek
    const { data: wo } = await supabase
      .from('work_orders')
      .select('case_type, tooth_numbers')
      .eq('id', workOrderId)
      .single();
    const toothCount = (wo as any)?.tooth_numbers?.length ?? 0;
    setConsumeContext({ toothCount, caseType: (wo as any)?.case_type ?? null });
    setConsumptionOpen(true);
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation?.()}>
          {/* Header */}
          <View style={s.header}>
            <View style={[s.iconWrap, { backgroundColor: stageColor + '22' }]}>
              <AppIcon name="shield-check-outline" size={20} color={stageColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{STAGE_LABEL[stage]} — QC</Text>
              <Text style={s.subtitle}>Stage tamamlama kontrol listesi</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <AppIcon name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            {/* Checklist */}
            <View style={s.list}>
              {items.length === 0 ? (
                <Text style={s.emptyText}>Bu stage için checklist yok</Text>
              ) : items.map((it) => {
                const checked = !!checks[it.key];
                return (
                  <TouchableOpacity
                    key={it.key}
                    onPress={() => toggle(it.key)}
                    activeOpacity={0.7}
                    style={[s.item, checked && { borderColor: stageColor, backgroundColor: stageColor + '14' }]}
                  >
                    <View style={[s.checkbox, checked && { backgroundColor: stageColor, borderColor: stageColor }]}>
                      {checked && <AppIcon name="check" size={12} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.itemLabel, checked && { color: '#0F172A' }]}>{it.label}</Text>
                      {it.hint && <Text style={s.itemHint}>{it.hint}</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Notlar */}
            <Text style={s.fieldLabel}>Not (opsiyonel)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder="Ek notlar, uyarılar..."
              placeholderTextColor="#94A3B8"
              style={s.input}
            />

            {/* DESIGN-only: Hekim onayı toggle */}
            {stage === 'DESIGN' && (
              <View style={s.doctorRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.doctorTitle}>Hekim onayı iste</Text>
                  <Text style={s.doctorHint}>
                    Aktif → Stage durur, hekim approval link ile karar verir
                  </Text>
                </View>
                <Switch
                  value={needsDoctor}
                  onValueChange={setNeedsDoctor}
                  trackColor={{ false: '#E2E8F0', true: stageColor + 'AA' }}
                  thumbColor={needsDoctor ? stageColor : '#FFFFFF'}
                />
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity onPress={onClose} style={s.cancelBtn} activeOpacity={0.7}>
              <Text style={s.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!allChecked || saving}
              style={[s.saveBtn, { backgroundColor: stageColor }, (!allChecked || saving) && { opacity: 0.5 }]}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={s.saveText}>
                    {stage === 'DESIGN' && needsDoctor ? 'Hekime Gönder' : 'Onayla & Devam'}
                  </Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>

      {/* ── Material consumption confirmation step ─────────────────────── */}
      {consumptionOpen && consumeContext && (
        <MaterialConsumptionModal
          visible
          workOrderId={workOrderId}
          stage={stage}
          managerId={managerId}
          toothCount={consumeContext.toothCount}
          caseType={consumeContext.caseType}
          onClose={() => {
            setConsumptionOpen(false);
            // Vazgeç → stage hâlâ aktif kalır, advance YOK
          }}
          onApproved={() => {
            setConsumptionOpen(false);
            toast.success('Materyaller düşüldü, sonraki aşamaya geçiliyor');
            onApproved();   // Caller advance_to_next_stage
          }}
        />
      )}
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
      default: {},
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 1 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },

  list: { gap: 6, marginBottom: 14 },
  emptyText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', paddingVertical: 20 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  itemLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
  itemHint:  { fontSize: 10, fontWeight: '500', color: '#94A3B8', marginTop: 2 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' as const },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, padding: 10, fontSize: 13,
    color: '#0F172A',
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 14,
  },

  doctorRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, gap: 10,
  },
  doctorTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  doctorHint:  { fontSize: 11, color: '#64748B', marginTop: 2 },

  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  cancelText:{ fontSize: 13, fontWeight: '600', color: '#475569' },
  saveBtn:   { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveText:  { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});

export default StageChecklistModal;
