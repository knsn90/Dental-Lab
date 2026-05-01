import React, { useState, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useChecks } from '../hooks/useChecks';
import {
  createCheck, updateCheckStatus, deleteCheck,
  CHECK_STATUS_LABELS, CHECK_STATUS_COLORS,
  type Check, type CheckStatus, type CreateCheckParams,
} from '../api';
import { useClinics } from '../../clinics/hooks/useClinics';
import { useBreakpoint } from '../../../core/layout/Responsive';

import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';

function fmtMoney(n: number): string {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_FILTERS: { v: CheckStatus | 'all'; l: string }[] = [
  { v: 'all', l: 'Tümü' },
  { v: 'beklemede', l: 'Beklemede' },
  { v: 'tahsil_edildi', l: 'Tahsil Edildi' },
  { v: 'iade', l: 'İade' },
  { v: 'iptal', l: 'İptal' },
];

export function ChecksScreen() {
  const { px } = useBreakpoint();
  const isEmbedded = useContext(HubContext);
  const safeEdges = isEmbedded ? ([] as any) : (['top'] as any);
  const [statusFilter, setStatusFilter] = useState<CheckStatus | 'all'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const { checks, loading, refetch } = useChecks(statusFilter === 'all' ? undefined : statusFilter);

  const today = new Date().toISOString().slice(0, 10);
  const totalPending = checks
    .filter(c => c.status === 'beklemede')
    .reduce((s, c) => s + Number(c.amount), 0);

  const handleStatusChange = (check: Check, newStatus: CheckStatus) => {
    Alert.alert(
      'Durum Güncelle',
      `"${CHECK_STATUS_LABELS[newStatus]}" olarak işaretlensin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Evet', onPress: async () => { await updateCheckStatus(check.id, newStatus); refetch(); } },
      ],
    );
  };

  const handleDelete = (check: Check) => {
    Alert.alert('Çek Sil', 'Bu çek kaydını silmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => { await deleteCheck(check.id); refetch(); } },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={safeEdges}>
      {/* Header — embedded ise başlık gizli */}
      <View style={[s.header, { paddingHorizontal: px }]}>
        <View style={{ flex: 1 }}>
          {!isEmbedded && <Text style={s.title}>Çek / Senet</Text>}
          {!isEmbedded && <Text style={s.subtitle}>Bekleyen: {fmtMoney(totalPending)}</Text>}
          {isEmbedded && <Text style={s.subtitle}>Bekleyen: {fmtMoney(totalPending)}</Text>}
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setAddOpen(true)} activeOpacity={0.85}>
          <AppIcon name={'plus' as any} size={16} color="#fff" />
          <Text style={s.addBtnText}>Çek Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* Status filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: px, paddingVertical: 8, gap: 6, flexDirection: 'row' }}>
        {STATUS_FILTERS.map(f => {
          const active = statusFilter === f.v;
          const col = f.v !== 'all' ? CHECK_STATUS_COLORS[f.v as CheckStatus] : null;
          return (
            <TouchableOpacity key={f.v}
              style={[s.chip, active && (col ? { borderColor: col.fg, backgroundColor: col.bg } : s.chipActive)]}
              onPress={() => setStatusFilter(f.v)} activeOpacity={0.8}>
              <Text style={[s.chipText, active && (col ? { color: col.fg, fontWeight: '700' } : s.chipTextActive)]}>
                {f.l}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <ScrollView
        style={{ flex: 1, backgroundColor: CardSpec.pageBg }}
        contentContainerStyle={{ padding: px, paddingBottom: 48, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#AEAEB2" />}
        showsVerticalScrollIndicator={false}
      >
        {checks.length === 0 ? (
          <View style={s.empty}>
            <AppIcon name={'file-document-remove-outline' as any} size={40} color="#CBD5E1" />
            <Text style={s.emptyText}>Çek / senet kaydı yok</Text>
          </View>
        ) : (
          checks.map(ck => (
            <CheckCard key={ck.id} check={ck} today={today}
              onStatusChange={(st) => handleStatusChange(ck, st)}
              onDelete={() => handleDelete(ck)} />
          ))
        )}
      </ScrollView>

      {/* Add modal */}
      <CheckFormModal visible={addOpen} onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); refetch(); }} />
    </SafeAreaView>
  );
}

// ─── Check Card ────────────────────────────────────────────────────────────────
function CheckCard({ check: ck, today, onStatusChange, onDelete }: {
  check: Check; today: string;
  onStatusChange: (s: CheckStatus) => void; onDelete: () => void;
}) {
  const sc = CHECK_STATUS_COLORS[ck.status];
  const isOverdue = ck.due_date < today && ck.status === 'beklemede';
  const daysLeft = Math.round((new Date(ck.due_date).getTime() - Date.now()) / 86400000);

  return (
    <View style={[cc.wrap, isOverdue && cc.wrapOverdue]}>
      <View style={cc.top}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name={'file-document-outline' as any} size={16} color={isOverdue ? '#EF4444' : '#64748B'} />
            <Text style={cc.amount}>{fmtMoney(Number(ck.amount))}</Text>
            <View style={[cc.badge, { backgroundColor: sc.bg }]}>
              <Text style={[cc.badgeText, { color: sc.fg }]}>{CHECK_STATUS_LABELS[ck.status]}</Text>
            </View>
          </View>
          {ck.clinic?.name && <Text style={cc.clinic}>{ck.clinic.name}</Text>}
          {ck.bank_name && <Text style={cc.meta}>🏦 {ck.bank_name}{ck.check_number ? ` · No: ${ck.check_number}` : ''}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[cc.dueDate, isOverdue && { color: '#EF4444', fontWeight: '700' }]}>
            {fmtDate(ck.due_date)}
          </Text>
          <Text style={[cc.daysLabel, isOverdue && { color: '#EF4444' }]}>
            {ck.status === 'beklemede'
              ? isOverdue ? `${Math.abs(daysLeft)} gün gecikti` : `${daysLeft} gün kaldı`
              : fmtDate(ck.issue_date) + ' düzenlendi'}
          </Text>
        </View>
      </View>

      {ck.status === 'beklemede' && (
        <View style={cc.actions}>
          <TouchableOpacity style={cc.actionBtn} onPress={() => onStatusChange('tahsil_edildi')} activeOpacity={0.8}>
            <AppIcon name={'check-circle-outline' as any} size={14} color="#047857" />
            <Text style={[cc.actionText, { color: '#047857' }]}>Tahsil Edildi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cc.actionBtn} onPress={() => onStatusChange('iade')} activeOpacity={0.8}>
            <AppIcon name={'arrow-u-left-top' as any} size={14} color="#B45309" />
            <Text style={[cc.actionText, { color: '#B45309' }]}>İade</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cc.actionBtn} onPress={onDelete} activeOpacity={0.8}>
            <AppIcon name={'delete-outline' as any} size={14} color="#EF4444" />
            <Text style={[cc.actionText, { color: '#EF4444' }]}>Sil</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Form Modal ───────────────────────────────────────────────────────────────
function CheckFormModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const { clinics } = useClinics();
  const [clinicId, setClinicId] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (visible) {
      setClinicId(''); setCheckNumber(''); setBankName('');
      setAmount(''); setDueDate(''); setNotes(''); setError('');
      setIssueDate(new Date().toISOString().slice(0, 10));
    }
  }, [visible]);

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { setError('Geçerli tutar girin.'); return; }
    if (!dueDate)         { setError('Vade tarihi zorunludur.'); return; }

    setSaving(true);
    const params: CreateCheckParams = {
      clinic_id: clinicId || null, check_number: checkNumber || undefined,
      bank_name: bankName || undefined, amount: amt,
      issue_date: issueDate, due_date: dueDate, notes: notes || undefined,
    };
    const { error: apiErr } = await createCheck(params);
    setSaving(false);
    if (apiErr) { setError((apiErr as any).message ?? 'Hata oluştu.'); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={mf.overlay}>
        <View style={mf.card}>
          <View style={mf.header}>
            <Text style={mf.title}>Çek / Senet Ekle</Text>
            <TouchableOpacity onPress={onClose} style={mf.closeBtn}>
              <AppIcon name={'close' as any} size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }} showsVerticalScrollIndicator={false}>
            {/* Clinic */}
            <View>
              <Text style={mf.label}>KLİNİK (ops.)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[mf.chip, !clinicId && mf.chipActive]} onPress={() => setClinicId('')}>
                    <Text style={[mf.chipText, !clinicId && mf.chipTextActive]}>Seçilmedi</Text>
                  </TouchableOpacity>
                  {clinics.map(cl => (
                    <TouchableOpacity key={cl.id} style={[mf.chip, clinicId === cl.id && mf.chipActive]}
                      onPress={() => setClinicId(cl.id)}>
                      <Text style={[mf.chipText, clinicId === cl.id && mf.chipTextActive]} numberOfLines={1}>{cl.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            {/* Amount + Due */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={mf.label}>TUTAR (₺)</Text>
                <TextInput style={mf.input} value={amount} onChangeText={setAmount}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                  placeholder="0,00" placeholderTextColor="#CBD5E1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={mf.label}>VADE TARİHİ</Text>
                <TextInput style={mf.input} value={dueDate} onChangeText={setDueDate}
                  placeholder="YYYY-AA-GG" placeholderTextColor="#CBD5E1" />
              </View>
            </View>
            {/* Bank + Number */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={mf.label}>BANKA</Text>
                <TextInput style={mf.input} value={bankName} onChangeText={setBankName}
                  placeholder="Banka adı..." placeholderTextColor="#CBD5E1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={mf.label}>ÇEK NO</Text>
                <TextInput style={mf.input} value={checkNumber} onChangeText={setCheckNumber}
                  placeholder="Çek numarası..." placeholderTextColor="#CBD5E1" />
              </View>
            </View>
            <View>
              <Text style={mf.label}>DÜZENLEME TARİHİ</Text>
              <TextInput style={mf.input} value={issueDate} onChangeText={setIssueDate}
                placeholder="YYYY-AA-GG" placeholderTextColor="#CBD5E1" />
            </View>
            <View>
              <Text style={mf.label}>NOT (ops.)</Text>
              <TextInput style={[mf.input, { minHeight: 48, textAlignVertical: 'top' }]}
                value={notes} onChangeText={setNotes} multiline
                placeholder="Opsiyonel..." placeholderTextColor="#CBD5E1" />
            </View>
            {error ? <Text style={mf.error}>{error}</Text> : null}
          </ScrollView>
          <View style={mf.footer}>
            <TouchableOpacity style={mf.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={mf.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[mf.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              <Text style={mf.saveText}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: CardSpec.pageBg },
  header:   { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 12 },
  title:    { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  addBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#2563EB' },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  chip:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  chipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipText: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  chipTextActive: { color: '#2563EB', fontWeight: '700' },
  empty:    { alignItems: 'center', paddingVertical: 64, gap: 12 },
  emptyText: { fontSize: 15, color: '#94A3B8', fontWeight: '500' },
});

const cc = StyleSheet.create({
  wrap:      { backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, overflow: 'hidden', ...Shadows.card },
  wrapOverdue: { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: '#FEF2F2' },
  top:       { flexDirection: 'row', padding: 16, gap: 12 },
  amount:    { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  badge:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  clinic:    { fontSize: 13, fontWeight: '600', color: '#475569' },
  meta:      { fontSize: 11, color: '#94A3B8' },
  dueDate:   { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  daysLabel: { fontSize: 11, color: '#64748B' },
  actions:   { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9' },
  actionText: { fontSize: 12, fontWeight: '600' },
});

const mf = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:     { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90%', overflow: 'hidden' },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:    { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  label:    { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  input:    { fontSize: 14, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  chip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#0F172A', backgroundColor: '#0F172A' },
  chipText: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  error:    { fontSize: 12, color: '#EF4444' },
  footer:   { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  saveBtn:  { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
