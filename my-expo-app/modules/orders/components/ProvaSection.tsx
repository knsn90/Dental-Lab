import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { fetchProvas, createProva, updateProva } from '../../provas/api';
import { fetchOrderItems } from '../api';
import { Prova, ProvaType, PROVA_TYPES } from '../../provas/types';
import { OrderItem } from '../types';
import { C } from '../../../core/theme/colors';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  planlandı:   { label: '📅 Planlandı',    color: '#1D4ED8', bg: '#EFF6FF' },
  gönderildi:  { label: '📤 Gönderildi',   color: '#D97706', bg: '#FFFBEB' },
  döndü:       { label: '📥 Döndü',        color: '#7C3AED', bg: '#F5F3FF' },
  tamamlandı:  { label: '✅ Tamamlandı',   color: '#059669', bg: '#ECFDF5' },
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// ─── Add/Edit Prova Modal ─────────────────────────────────────────────────────

interface PlanModalProps {
  visible: boolean;
  orderItems: OrderItem[];
  nextNumber: number;
  onClose: () => void;
  onSave: (data: {
    order_item_id: string | null;
    order_item_name: string | null;
    prova_type: ProvaType | null;
    scheduled_date: string | null;
    quota: number | null;
    lab_notes: string | null;
  }) => void;
}

function PlanModal({ visible, orderItems, nextNumber, onClose, onSave }: PlanModalProps) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [provaType, setProvaType] = useState<ProvaType | null>(null);
  const [scheduledDate, setScheduledDate] = useState(today());
  const [quota, setQuota] = useState('');
  const [labNotes, setLabNotes] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setItemId(null); setProvaType(null);
    setScheduledDate(today()); setQuota(''); setLabNotes(''); setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSave = () => {
    if (!provaType) { setError('Prova türü seçiniz'); return; }
    if (!scheduledDate) { setError('Tarih giriniz'); return; }
    const selectedItem = orderItems.find(i => i.id === itemId);
    onSave({
      order_item_id: itemId,
      order_item_name: selectedItem?.name ?? null,
      prova_type: provaType,
      scheduled_date: scheduledDate,
      quota: quota ? parseInt(quota, 10) : null,
      lab_notes: labNotes || null,
    });
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={modal.overlay}>
        <View style={modal.sheet}>
          <View style={modal.header}>
            <Text style={modal.title}>🦷 Prova {nextNumber} Planla</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={modal.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Denture selector */}
            {orderItems.length > 0 && (
              <View style={modal.section}>
                <Text style={modal.label}>Protez Seçin (isteğe bağlı)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <TouchableOpacity
                    style={[modal.chip, itemId === null && modal.chipActive]}
                    onPress={() => setItemId(null)}
                  >
                    <Text style={[modal.chipText, itemId === null && modal.chipTextActive]}>Tümü</Text>
                  </TouchableOpacity>
                  {orderItems.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[modal.chip, itemId === item.id && modal.chipActive]}
                      onPress={() => setItemId(item.id)}
                    >
                      <Text style={[modal.chipText, itemId === item.id && modal.chipTextActive]}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Prova type */}
            <View style={modal.section}>
              <Text style={modal.label}>Prova Türü *</Text>
              <View style={modal.typeGrid}>
                {PROVA_TYPES.map(pt => (
                  <TouchableOpacity
                    key={pt.value}
                    style={[modal.typeBtn, provaType === pt.value && { backgroundColor: pt.bg, borderColor: pt.color }]}
                    onPress={() => setProvaType(pt.value)}
                  >
                    <Text style={modal.typeEmoji}>{pt.emoji}</Text>
                    <Text style={[modal.typeLabel, provaType === pt.value && { color: pt.color, fontWeight: '700' }]}>
                      {pt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Scheduled date */}
            <View style={modal.section}>
              <Text style={modal.label}>Planlanan Tarih *</Text>
              <TextInput
                style={modal.input}
                value={scheduledDate}
                onChangeText={setScheduledDate}
                placeholder="YYYY-AA-GG"
                placeholderTextColor={C.textMuted}
              />
            </View>

            {/* Quota */}
            <View style={modal.section}>
              <Text style={modal.label}>Kota (isteğe bağlı)</Text>
              <TextInput
                style={modal.input}
                value={quota}
                onChangeText={setQuota}
                placeholder="Örn: 3"
                keyboardType="number-pad"
                placeholderTextColor={C.textMuted}
              />
              <Text style={modal.hint}>Bu prova için maksimum deneme sayısını belirler</Text>
            </View>

            {/* Lab notes */}
            <View style={modal.section}>
              <Text style={modal.label}>Lab Notu (isteğe bağlı)</Text>
              <TextInput
                style={[modal.input, { minHeight: 60, textAlignVertical: 'top' }]}
                value={labNotes}
                onChangeText={setLabNotes}
                placeholder="Teknik notlar, özel talimatlar..."
                placeholderTextColor={C.textMuted}
                multiline
              />
            </View>

            {error ? (
              <View style={modal.errorBanner}>
                <Text style={modal.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={modal.saveBtn} onPress={handleSave}>
              <Text style={modal.saveBtnText}>📅 Provayı Planla</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProvaSection({ workOrderId }: { workOrderId: string }) {
  const { profile } = useAuthStore();
  const [provas, setProvas] = useState<Prova[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<{ id: string; value: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [provaRes, itemRes] = await Promise.all([
      fetchProvas(workOrderId),
      fetchOrderItems(workOrderId),
    ]);
    setProvas((provaRes.data as Prova[]) ?? []);
    setOrderItems((itemRes.data as OrderItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [workOrderId]);

  const handlePlan = async (data: Parameters<PlanModalProps['onSave']>[0]) => {
    if (!profile) return;
    setShowModal(false);
    const nextNum = (provas.length > 0 ? Math.max(...provas.map(p => p.prova_number)) : 0) + 1;
    await createProva({ work_order_id: workOrderId, prova_number: nextNum, created_by: profile.id, ...data });
    load();
  };

  const handleSend = async (p: Prova) => {
    await updateProva(p.id, { status: 'gönderildi', sent_date: today() });
    load();
  };
  const handleReturn = async (p: Prova) => {
    await updateProva(p.id, { status: 'döndü', return_date: today() });
    load();
  };
  const handleDone = async (p: Prova) => {
    await updateProva(p.id, { status: 'tamamlandı' });
    load();
  };
  const handleSaveDoctorNote = async () => {
    if (!editingNote) return;
    await updateProva(editingNote.id, { doctor_notes: editingNote.value });
    setEditingNote(null);
    load();
  };

  if (loading) return <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />;

  // Group provas by order_item_name for display
  const groups = provas.reduce<Record<string, Prova[]>>((acc, p) => {
    const key = p.order_item_name ?? 'Genel';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return (
    <View>
      <View style={s.sectionHeader}>
        <Text style={s.heading}>Prova Takibi</Text>
        <TouchableOpacity style={s.planBtn} onPress={() => setShowModal(true)}>
          <Text style={s.planBtnText}>+ Prova Planla</Text>
        </TouchableOpacity>
      </View>

      {provas.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🦷</Text>
          <Text style={s.emptyTitle}>Henüz prova planlanmadı</Text>
          <Text style={s.emptySub}>Provayı planlamak için türü, tarihi ve isteğe bağlı kotayı belirleyin</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setShowModal(true)}>
            <Text style={s.emptyBtnText}>📅 İlk Provayı Planla</Text>
          </TouchableOpacity>
        </View>
      ) : (
        Object.entries(groups).map(([groupName, items]) => (
          <View key={groupName} style={s.group}>
            {Object.keys(groups).length > 1 && (
              <Text style={s.groupLabel}>{groupName}</Text>
            )}
            {items.map(prova => {
              const cfg = STATUS_CFG[prova.status];
              const typeCfg = PROVA_TYPES.find(t => t.value === prova.prova_type);
              const doneCount = items.filter(p => p.prova_type === prova.prova_type && p.status === 'tamamlandı').length;
              return (
                <View key={prova.id} style={s.card}>
                  {/* Card header */}
                  <View style={s.cardHeader}>
                    <View style={s.cardTitleRow}>
                      <Text style={s.provaNum}>Prova {prova.prova_number}</Text>
                      {typeCfg && (
                        <View style={[s.typePill, { backgroundColor: typeCfg.bg }]}>
                          <Text style={[s.typePillText, { color: typeCfg.color }]}>
                            {typeCfg.emoji} {typeCfg.label}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  {/* Dates row */}
                  <View style={s.datesRow}>
                    <DateChip label="Planlanan" value={formatDate(prova.scheduled_date)} icon="📅" />
                    {prova.sent_date && <DateChip label="Gönderildi" value={formatDate(prova.sent_date)} icon="📤" />}
                    {prova.return_date && <DateChip label="Döndü" value={formatDate(prova.return_date)} icon="📥" />}
                  </View>

                  {/* Quota bar */}
                  {prova.quota && prova.quota > 0 ? (
                    <View style={s.quotaRow}>
                      <Text style={s.quotaLabel}>Kota</Text>
                      <View style={s.quotaBar}>
                        {Array.from({ length: prova.quota }).map((_, i) => (
                          <View
                            key={i}
                            style={[
                              s.quotaDot,
                              i < doneCount && { backgroundColor: C.primary },
                            ]}
                          />
                        ))}
                      </View>
                      <Text style={s.quotaCount}>{doneCount}/{prova.quota}</Text>
                    </View>
                  ) : null}

                  {/* Doctor notes */}
                  <View style={s.noteBlock}>
                    <Text style={s.noteLabel}>Doktor Notu:</Text>
                    {editingNote?.id === prova.id ? (
                      <View style={s.editRow}>
                        <TextInput
                          style={s.noteInput}
                          value={editingNote.value}
                          onChangeText={v => setEditingNote({ id: prova.id, value: v })}
                          multiline
                          autoFocus
                          placeholder="Doktorun geri bildirimi..."
                          placeholderTextColor={C.textMuted}
                        />
                        <View style={s.editActions}>
                          <TouchableOpacity style={s.saveBtn} onPress={handleSaveDoctorNote}>
                            <Text style={s.saveBtnText}>Kaydet</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingNote(null)}>
                            <Text style={s.cancelBtnText}>İptal</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setEditingNote({ id: prova.id, value: prova.doctor_notes ?? '' })}
                      >
                        <Text style={prova.doctor_notes ? s.noteValue : s.notePlaceholder}>
                          {prova.doctor_notes || 'Eklemek için tıklayın...'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {prova.lab_notes ? (
                    <View style={s.noteBlock}>
                      <Text style={s.noteLabel}>Lab Notu:</Text>
                      <Text style={s.noteValue}>{prova.lab_notes}</Text>
                    </View>
                  ) : null}

                  {/* Actions */}
                  <View style={s.actionsRow}>
                    {prova.status === 'planlandı' && (
                      <TouchableOpacity style={[s.actionBtn, s.sendBtn]} onPress={() => handleSend(prova)}>
                        <Text style={[s.actionBtnText, { color: '#D97706' }]}>📤 Gönder</Text>
                      </TouchableOpacity>
                    )}
                    {prova.status === 'gönderildi' && (
                      <TouchableOpacity style={[s.actionBtn, s.returnBtn]} onPress={() => handleReturn(prova)}>
                        <Text style={[s.actionBtnText, { color: '#7C3AED' }]}>📥 Döndü</Text>
                      </TouchableOpacity>
                    )}
                    {prova.status === 'döndü' && (
                      <TouchableOpacity style={[s.actionBtn, s.doneBtn]} onPress={() => handleDone(prova)}>
                        <Text style={[s.actionBtnText, { color: '#059669' }]}>✅ Tamamlandı</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))
      )}

      <PlanModal
        visible={showModal}
        orderItems={orderItems}
        nextNumber={(provas.length > 0 ? Math.max(...provas.map(p => p.prova_number)) : 0) + 1}
        onClose={() => setShowModal(false)}
        onSave={handlePlan}
      />
    </View>
  );
}

function DateChip({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={s.dateChip}>
      <Text style={s.dateChipIcon}>{icon}</Text>
      <View>
        <Text style={s.dateChipLabel}>{label}</Text>
        <Text style={s.dateChipValue}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  heading: { fontSize: 15, fontWeight: '700', color: C.textPrimary },
  planBtn: {
    backgroundColor: C.primary, paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: 8,
  },
  planBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.textSecondary },
  emptySub: { fontSize: 13, color: C.textMuted, textAlign: 'center', maxWidth: 280 },
  emptyBtn: {
    marginTop: 4, backgroundColor: C.primaryBg,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.primary,
  },
  emptyBtnText: { color: C.primary, fontWeight: '700', fontSize: 14 },
  group: { marginBottom: 8 },
  groupLabel: {
    fontSize: 12, fontWeight: '700', color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 6, marginLeft: 2,
  },
  card: {
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    padding: 14, marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 10,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  provaNum: { fontSize: 14, fontWeight: '800', color: C.textPrimary },
  typePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 16 },
  typePillText: { fontSize: 11, fontWeight: '700' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  datesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateChipIcon: { fontSize: 14 },
  dateChipLabel: { fontSize: 10, color: C.textMuted, fontWeight: '500' },
  dateChipValue: { fontSize: 12, fontWeight: '700', color: C.textPrimary },
  quotaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  quotaLabel: { fontSize: 11, color: C.textMuted, fontWeight: '600', width: 32 },
  quotaBar: { flexDirection: 'row', gap: 4 },
  quotaDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: C.border, borderWidth: 1, borderColor: C.border,
  },
  quotaCount: { fontSize: 12, fontWeight: '700', color: C.textPrimary },
  noteBlock: { marginBottom: 8 },
  noteLabel: { fontSize: 11, color: C.textMuted, fontWeight: '600', marginBottom: 3 },
  noteValue: { fontSize: 13, color: C.textPrimary, lineHeight: 18 },
  notePlaceholder: { fontSize: 13, color: C.textMuted, fontStyle: 'italic' },
  editRow: { gap: 6 },
  noteInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 8,
    padding: 10, fontSize: 13, color: C.textPrimary,
    backgroundColor: C.background, minHeight: 60, textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', gap: 8 },
  saveBtn: {
    flex: 1, backgroundColor: C.primary,
    paddingVertical: 8, borderRadius: 8, alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
  },
  cancelBtnText: { color: C.textSecondary, fontWeight: '600', fontSize: 13 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1.5, alignItems: 'center',
  },
  sendBtn: { backgroundColor: '#FFFBEB', borderColor: '#D97706' },
  returnBtn: { backgroundColor: '#F5F3FF', borderColor: '#7C3AED' },
  doneBtn: { backgroundColor: '#ECFDF5', borderColor: '#059669' },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
});

// ─── Modal Styles ─────────────────────────────────────────────────────────────

const modal = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  sheet: {
    backgroundColor: C.surface, borderRadius: 16,
    width: '100%', maxWidth: 520,
    maxHeight: '90%', padding: 20,
    ...(Platform.OS === 'web' ? { boxShadow: '0 20px 60px rgba(0,0,0,0.2)' } as any : {
      shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.2, shadowRadius: 20, elevation: 20,
    }),
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 17, fontWeight: '800', color: C.textPrimary },
  close: { fontSize: 18, color: C.textMuted, fontWeight: '600', padding: 4 },
  section: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 6 },
  hint: { fontSize: 11, color: C.textMuted, marginTop: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: C.border, marginRight: 8,
    backgroundColor: C.background,
  },
  chipActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  chipText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  chipTextActive: { color: C.primary, fontWeight: '700' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1.5,
    borderColor: C.border, backgroundColor: C.background,
  },
  typeEmoji: { fontSize: 16 },
  typeLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: C.textPrimary,
    backgroundColor: C.background,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2', borderRadius: 8,
    padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: '#FECACA',
  },
  errorText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },
  saveBtn: {
    backgroundColor: C.primary, paddingVertical: 14,
    borderRadius: 12, alignItems: 'center', marginTop: 4, marginBottom: 8,
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
