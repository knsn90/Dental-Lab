// HeroManagerSection — orchestrates manager controls inline inside heroCard.
// No background, no border. Holds state for note input + RPC mutations.
//
// Layout:
//   1. SLAAlert        (only when red/yellow)
//   2. InfoStrip
//   3. ChipGroup       (delay reasons)
//   4. ChipGroup       (priority — low/normal/high; urgent is in ActionRow)
//   5. ActionRow       (Reassign · Note · 🔴 Urgent)
//   6. NoteInput       (inline expand)
//   7. AdvancedActions (collapsed)

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Text, ActivityIndicator, Platform } from 'react-native';

import { supabase } from '../../../../core/api/supabase';
import { toast } from '../../../../core/ui/Toast';
import { type Stage, STAGE_LABEL, getNextStage } from '../../stages';
import {
  STAGE_SLA_MINUTES, slaStatus, humanIdle,
  DELAY_REASON_OPTIONS, type DelayReason,
} from '../../slaConfig';
import { ReassignModal } from '../ReassignModal';

import { SLAAlert }        from './SLAAlert';
import { ChipGroup }       from './ChipGroup';
import { ActionRow }       from './ActionRow';
import { AdvancedActions } from './AdvancedActions';

type Priority = 'low' | 'normal' | 'high' | 'urgent';

const PRIORITY_OPTIONS = [
  { key: 'low' as const,    label: 'Düşük'  },
  { key: 'normal' as const, label: 'Normal' },
  { key: 'high' as const,   label: 'Yüksek' },
];

const DELAY_OPTIONS = DELAY_REASON_OPTIONS.map(o => ({ key: o.key, label: o.label }));

export interface HeroManagerSectionProps {
  workOrderId:    string;
  managerId:      string;
  labId:          string;
  currentStage:   Stage | null;
  ownerName:      string | null;
  ownerId?:       string | null;
  activeStageId?: string | null;
  startedAt?:     string | null;
  reworkCount:    number;
  priority:       Priority;
  delayReason:    DelayReason | null;
  doctorApprovalRequired?: boolean;
  managerReviewRequired?:  boolean;
  onChanged:      () => void;
}

export function HeroManagerSection(props: HeroManagerSectionProps) {
  const {
    workOrderId, managerId, labId, currentStage, ownerName, ownerId, activeStageId,
    startedAt, reworkCount, priority, delayReason,
    doctorApprovalRequired = false, managerReviewRequired = false,
    onChanged,
  } = props;

  const [now, setNow]                   = useState(Date.now());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [noteOpen, setNoteOpen]         = useState(false);
  const [noteText, setNoteText]         = useState('');
  const [busy, setBusy]                 = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Derived
  const idleMs   = startedAt ? now - new Date(startedAt).getTime() : 0;
  const sla      = slaStatus(currentStage, idleMs);
  const idleStr  = startedAt ? humanIdle(idleMs) : '—';

  // ── Mutations ───────────────────────────────────────────────────────────
  async function setPriority(p: Priority) {
    if (priority === p) return;
    setBusy('priority');
    const { error } = await supabase.from('work_orders').update({ priority: p }).eq('id', workOrderId);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }

  async function setDelay(reason: DelayReason | null) {
    setBusy('delay');
    const { error } = await supabase.rpc('set_delay_reason', {
      p_work_order_id: workOrderId,
      p_reason:        reason,
      p_manager_id:    managerId,
      p_notes:         null,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }

  async function forceNextStage() {
    if (!currentStage) return;
    const next = getNextStage(currentStage, doctorApprovalRequired, managerReviewRequired);
    if (!next) { toast.warning('Sonraki stage yok'); return; }
    if (typeof window !== 'undefined' && !window.confirm(
      `⚠ Bu işlem checklist'i atlar.\n${STAGE_LABEL[currentStage]} → ${STAGE_LABEL[next]}\n\nDevam edilsin mi?`
    )) return;
    setBusy('force');
    const { error } = await supabase.rpc('force_advance_stage', {
      p_work_order_id: workOrderId, p_manager_id: managerId, p_next_stage: next,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`İlerletildi → ${STAGE_LABEL[next]}`);
    onChanged();
  }

  async function skipToQC() {
    if (typeof window !== 'undefined' && !window.confirm(
      '⚠ Üretim atlanacak ve iş direkt QC\'ye gidecek. Devam edilsin mi?'
    )) return;
    setBusy('qc');
    const { error } = await supabase.rpc('skip_to_qc', {
      p_work_order_id: workOrderId, p_manager_id: managerId,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('QC\'ye atlandı');
    onChanged();
  }

  async function saveNote() {
    if (!noteText.trim()) { setNoteOpen(false); return; }
    setBusy('note');
    const { error } = await supabase.rpc('add_manager_note', {
      p_work_order_id: workOrderId, p_manager_id: managerId, p_note: noteText.trim(),
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Not kaydedildi');
    setNoteText('');
    setNoteOpen(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <SLAAlert stage={currentStage} delayTime={idleStr} status={sla} />

      {/* Sadece > 0 ise göster — heroStepsRow ve heroActiveStrip zaten stage+owner gösteriyor */}
      {reworkCount > 0 && (
        <Text style={s.reworkHint}>↻ Rework: {reworkCount}</Text>
      )}

      {/* Single flowing row — gruplar gap ile ayrılır, ayraç çizgisi yok */}
      <View style={s.flow}>
        <ChipGroup
          options={DELAY_OPTIONS}
          selected={delayReason}
          onChange={setDelay}
          disabled={busy === 'delay'}
        />
        <ChipGroup
          options={PRIORITY_OPTIONS}
          selected={priority === 'urgent' ? null : priority}
          onChange={(k) => k && setPriority(k as Priority)}
          toggle={false}
          disabled={busy === 'priority'}
        />
        <ActionRow
          onReassign={() => setReassignOpen(true)}
          onNote={() => setNoteOpen(o => !o)}
          onUrgent={() => setPriority(priority === 'urgent' ? 'normal' : 'urgent')}
          reassignDisabled={!activeStageId || !currentStage}
          noteActive={noteOpen}
          urgentActive={priority === 'urgent'}
        />
      </View>

      {noteOpen && (
        <View style={s.noteWrap}>
          <TextInput
            style={s.noteInput as any}
            value={noteText}
            onChangeText={setNoteText}
            placeholder="Not yaz..."
            placeholderTextColor="rgba(255,255,255,0.40)"
            multiline
            autoFocus
          />
          <View style={s.noteActions}>
            <TouchableOpacity
              onPress={() => { setNoteOpen(false); setNoteText(''); }}
              style={s.noteBtn}
            >
              <Text style={s.noteBtnText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveNote}
              disabled={busy === 'note' || !noteText.trim()}
              style={[s.noteBtn, s.noteBtnPrimary, !noteText.trim() && { opacity: 0.4 }]}
            >
              {busy === 'note'
                ? <ActivityIndicator size="small" color="#0F172A" />
                : <Text style={[s.noteBtnText, { color: '#0F172A', fontWeight: '800' }]}>Kaydet</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <AdvancedActions
        onForceNext={forceNextStage}
        onSkipToQC={skipToQC}
        forceDisabled={busy === 'force' || !currentStage}
        qcDisabled={busy === 'qc' || currentStage === 'QC' || currentStage === 'SHIPPED'}
      />

      {reassignOpen && activeStageId && currentStage && (
        <ReassignModal
          visible
          stageId={activeStageId}
          stage={currentStage}
          labId={labId}
          currentOwnerId={ownerId ?? null}
          onClose={() => setReassignOpen(false)}
          onReassigned={onChanged}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    gap: 10,
  },
  flow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,                              // gruplar arası nefes; chip'ler kendi 8px gap'lerini korur
  },
  reworkHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FCA5A5',
    letterSpacing: 0.3,
  },

  noteWrap:    { gap: 8 },
  noteInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: '#FFFFFF',
    minHeight: 60, textAlignVertical: 'top',
    outlineStyle: 'none',
  } as any,
  noteActions: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  noteBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    minWidth: 84, alignItems: 'center', justifyContent: 'center',
  },
  noteBtnPrimary: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  noteBtnText:    { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});
