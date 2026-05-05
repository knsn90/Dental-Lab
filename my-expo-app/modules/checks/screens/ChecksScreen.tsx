/**
 * ChecksScreen — Çek / Senet (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 form, §08 dialog, §03 pill buttons,
 * Lucide icons.
 */
import React, { useState, useContext, useMemo } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, RefreshControl, Platform, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';

import { useChecks } from '../hooks/useChecks';
import {
  createCheck, updateCheckStatus, deleteCheck,
  CHECK_STATUS_LABELS, CHECK_STATUS_COLORS,
  type Check, type CheckStatus, type CreateCheckParams,
} from '../api';
import { useClinics } from '../../clinics/hooks/useClinics';
import { DS } from '../../../core/theme/dsTokens';
import {
  Plus, FileText, Building2, Landmark as BankIcon, Hash,
  Calendar, Clock, CircleCheck, Undo2, Trash2,
  X, Inbox, AlertTriangle, ChevronRight,
} from 'lucide-react-native';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  // @ts-ignore web
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

const tableCard = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden' as const,
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

const STATUS_CHIP: Record<CheckStatus, { bg: string; fg: string }> = {
  beklemede:     CHIP_TONES.warning,
  tahsil_edildi: CHIP_TONES.success,
  iade:          CHIP_TONES.danger,
  iptal:         { bg: 'rgba(0,0,0,0.05)', fg: DS.ink[500] },
};

const modalShadow = '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)';

// ── Helpers ──────────────────────────────────────────────────────────
function fmtMoney(n: number): string {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_FILTERS: { v: CheckStatus | 'all'; l: string }[] = [
  { v: 'all',            l: 'Tümü' },
  { v: 'beklemede',      l: 'Beklemede' },
  { v: 'tahsil_edildi',  l: 'Tahsil Edildi' },
  { v: 'iade',           l: 'İade' },
  { v: 'iptal',          l: 'İptal' },
];

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ChecksScreen() {
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const [statusFilter, setStatusFilter] = useState<CheckStatus | 'all'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const { checks, loading, refetch } = useChecks(statusFilter === 'all' ? undefined : statusFilter);

  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const pending = checks.filter(c => c.status === 'beklemede');
    const totalPending = pending.reduce((s, c) => s + Number(c.amount), 0);
    const overdue = pending.filter(c => c.due_date < today);
    const totalOverdue = overdue.reduce((s, c) => s + Number(c.amount), 0);
    const soon = pending.filter(c => {
      const days = Math.round((new Date(c.due_date).getTime() - Date.now()) / 86400000);
      return days >= 0 && days <= 7;
    });
    const totalSoon = soon.reduce((s, c) => s + Number(c.amount), 0);
    return { totalPending, totalOverdue, overdueCount: overdue.length, totalSoon, soonCount: soon.length, pendingCount: pending.length };
  }, [checks, today]);

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
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isDesktop ? 0 : 16, paddingBottom: 48, gap: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DS.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — §10 glassmorphism ────────────────────────── */}
        <View style={{
          borderRadius: 28, overflow: 'hidden',
          backgroundColor: DS.lab.bg, padding: isDesktop ? 36 : 24,
          position: 'relative',
        }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: DS.lab.bgDeep, opacity: 0.6 }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: DS.lab.bgDeep, opacity: 0.4 }} />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 12 }}>
                Bekleyen Çek / Senet
              </Text>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 48 : 36, letterSpacing: -1.4, color: DS.ink[900] }}>
                {fmtMoney(stats.totalPending)}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 6 }}>
                {stats.pendingCount} adet beklemede
              </Text>
            </View>

            {/* Add button — §03 pill dark */}
            <Pressable
              onPress={() => setAddOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                backgroundColor: DS.ink[900], cursor: 'pointer' as any,
              }}
            >
              <Plus size={14} color="#FFF" strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>Çek Ekle</Text>
            </Pressable>
          </View>

          {/* Quick stats */}
          <View style={{ flexDirection: 'row', gap: isDesktop ? 32 : 20, marginTop: 20, flexWrap: 'wrap' }}>
            {stats.totalOverdue > 0 && (
              <View>
                <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400] }}>Gecikmiş</Text>
                <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: CHIP_TONES.danger.fg, marginTop: 4 }}>
                  {fmtMoney(stats.totalOverdue)}
                </Text>
                <Text style={{ fontSize: 10, color: CHIP_TONES.danger.fg }}>{stats.overdueCount} adet</Text>
              </View>
            )}
            {stats.totalSoon > 0 && (
              <View>
                <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400] }}>7 gün içinde</Text>
                <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: CHIP_TONES.warning.fg, marginTop: 4 }}>
                  {fmtMoney(stats.totalSoon)}
                </Text>
                <Text style={{ fontSize: 10, color: CHIP_TONES.warning.fg }}>{stats.soonCount} adet</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Status filter pills ─────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, alignItems: 'center' }}
        >
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f.v;
            const chip = f.v !== 'all' ? STATUS_CHIP[f.v as CheckStatus] : null;
            return (
              <Pressable
                key={f.v}
                onPress={() => setStatusFilter(f.v)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? (chip?.fg ?? DS.ink[900]) : 'rgba(0,0,0,0.08)',
                  backgroundColor: active ? (chip?.bg ?? DS.ink[50]) : '#FFF',
                  cursor: 'pointer' as any,
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: active ? '600' : '500',
                  color: active ? (chip?.fg ?? DS.ink[900]) : DS.ink[500],
                }}>
                  {f.l}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Check list ──────────────────────────────────────── */}
        {checks.length === 0 ? (
          <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Inbox size={32} color={DS.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>
              Çek / senet kaydı yok
            </Text>
          </View>
        ) : isDesktop ? (
          /* ── Desktop: tableCard §09 ──────────────────────── */
          <View style={tableCard}>
            {/* Toolbar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
                Çek / Senet Listesi
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: DS.ink[400] }}>
                {checks.length} kayıt
              </Text>
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              {[
                { label: 'TUTAR',     flex: 1.3 },
                { label: 'KLİNİK',    flex: 2 },
                { label: 'BANKA / NO', flex: 1.8 },
                { label: 'DÜZENLEME', flex: 1.2 },
                { label: 'VADE',      flex: 1.2 },
                { label: 'KALAN',     flex: 0.8 },
                { label: 'DURUM',     flex: 1 },
                { label: 'İŞLEM',     flex: 1.5 },
              ].map((h, i) => (
                <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500] }}>
                  {h.label}
                </Text>
              ))}
            </View>

            {/* Rows */}
            {checks.map((ck, i) => {
              const sc = STATUS_CHIP[ck.status];
              const isOverdue = ck.due_date < today && ck.status === 'beklemede';
              const daysLeft = Math.round((new Date(ck.due_date).getTime() - Date.now()) / 86400000);
              return (
                <View key={ck.id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 20, paddingVertical: 14,
                  borderBottomWidth: i < checks.length - 1 ? 1 : 0,
                  borderBottomColor: 'rgba(0,0,0,0.04)',
                  backgroundColor: isOverdue ? 'rgba(217,75,75,0.03)' : 'transparent',
                }}>
                  {/* Amount */}
                  <Text style={{ flex: 1.3, fontSize: 14, fontWeight: '600', color: isOverdue ? CHIP_TONES.danger.fg : DS.ink[900] }}>
                    {fmtMoney(Number(ck.amount))}
                  </Text>

                  {/* Clinic */}
                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {ck.clinic?.name ? (
                      <>
                        <Building2 size={13} color={DS.ink[400]} strokeWidth={1.6} />
                        <Text style={{ fontSize: 13, color: DS.ink[800] }} numberOfLines={1}>{ck.clinic.name}</Text>
                      </>
                    ) : (
                      <Text style={{ fontSize: 12, color: DS.ink[300] }}>—</Text>
                    )}
                  </View>

                  {/* Bank + number */}
                  <View style={{ flex: 1.8 }}>
                    {ck.bank_name ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <BankIcon size={11} color={DS.ink[400]} strokeWidth={1.6} />
                        <Text style={{ fontSize: 12, color: DS.ink[700] }} numberOfLines={1}>
                          {ck.bank_name}{ck.check_number ? ` · ${ck.check_number}` : ''}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: DS.ink[300] }}>—</Text>
                    )}
                  </View>

                  {/* Issue date */}
                  <Text style={{ flex: 1.2, fontSize: 12, color: DS.ink[500] }}>
                    {fmtDate(ck.issue_date)}
                  </Text>

                  {/* Due date */}
                  <Text style={{ flex: 1.2, fontSize: 12, fontWeight: isOverdue ? '600' : '500', color: isOverdue ? CHIP_TONES.danger.fg : DS.ink[800] }}>
                    {fmtDate(ck.due_date)}
                  </Text>

                  {/* Days left */}
                  <View style={{ flex: 0.8 }}>
                    {ck.status === 'beklemede' && (
                      <Text style={{ fontSize: 11, fontWeight: '600', color: isOverdue ? CHIP_TONES.danger.fg : daysLeft <= 7 ? CHIP_TONES.warning.fg : DS.ink[500] }}>
                        {isOverdue ? `${Math.abs(daysLeft)}g gecikti` : `${daysLeft}g`}
                      </Text>
                    )}
                  </View>

                  {/* Status */}
                  <View style={{ flex: 1 }}>
                    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: sc.bg }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: sc.fg }}>
                        {CHECK_STATUS_LABELS[ck.status]}
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={{ flex: 1.5, flexDirection: 'row', gap: 4 }}>
                    {ck.status === 'beklemede' && (
                      <>
                        <Pressable
                          onPress={() => handleStatusChange(ck, 'tahsil_edildi')}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: CHIP_TONES.success.bg, cursor: 'pointer' as any }}
                        >
                          <CircleCheck size={11} color={CHIP_TONES.success.fg} strokeWidth={2} />
                          <Text style={{ fontSize: 10, fontWeight: '600', color: CHIP_TONES.success.fg }}>Tahsil</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleStatusChange(ck, 'iade')}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: CHIP_TONES.warning.bg, cursor: 'pointer' as any }}
                        >
                          <Undo2 size={11} color={CHIP_TONES.warning.fg} strokeWidth={2} />
                          <Text style={{ fontSize: 10, fontWeight: '600', color: CHIP_TONES.warning.fg }}>İade</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDelete(ck)}
                          style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: CHIP_TONES.danger.bg, cursor: 'pointer' as any }}
                        >
                          <Trash2 size={11} color={CHIP_TONES.danger.fg} strokeWidth={2} />
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Footer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FAFAFA' }}>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>{checks.length} kayıt</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>
                Bekleyen: {fmtMoney(stats.totalPending)}
              </Text>
            </View>
          </View>
        ) : (
          /* ── Mobile: cardSolid §05 ──────────────────────────── */
          <View style={{ gap: 10 }}>
            {checks.map(ck => {
              const sc = STATUS_CHIP[ck.status];
              const isOverdue = ck.due_date < today && ck.status === 'beklemede';
              const daysLeft = Math.round((new Date(ck.due_date).getTime() - Date.now()) / 86400000);

              return (
                <View key={ck.id} style={{
                  ...cardSolid, gap: 12,
                  borderWidth: isOverdue ? 1 : 0,
                  borderColor: isOverdue ? 'rgba(217,75,75,0.2)' : 'transparent',
                }}>
                  {/* Top */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 12,
                      backgroundColor: isOverdue ? CHIP_TONES.danger.bg : CHIP_TONES.warning.bg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileText size={18} color={isOverdue ? CHIP_TONES.danger.fg : CHIP_TONES.warning.fg} strokeWidth={1.6} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: isOverdue ? CHIP_TONES.danger.fg : DS.ink[900] }}>
                          {fmtMoney(Number(ck.amount))}
                        </Text>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: sc.bg }}>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: sc.fg }}>{CHECK_STATUS_LABELS[ck.status]}</Text>
                        </View>
                      </View>
                      {ck.clinic?.name && (
                        <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>{ck.clinic.name}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: isOverdue ? CHIP_TONES.danger.fg : DS.ink[800] }}>
                        {fmtDate(ck.due_date)}
                      </Text>
                      {ck.status === 'beklemede' && (
                        <Text style={{ fontSize: 10, color: isOverdue ? CHIP_TONES.danger.fg : CHIP_TONES.warning.fg, marginTop: 1 }}>
                          {isOverdue ? `${Math.abs(daysLeft)}g gecikti` : `${daysLeft}g kaldı`}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Bank info */}
                  {ck.bank_name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <BankIcon size={12} color={DS.ink[400]} strokeWidth={1.6} />
                      <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                        {ck.bank_name}{ck.check_number ? ` · No: ${ck.check_number}` : ''}
                      </Text>
                    </View>
                  )}

                  {/* Actions */}
                  {ck.status === 'beklemede' && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable
                        onPress={() => handleStatusChange(ck, 'tahsil_edildi')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: CHIP_TONES.success.bg, cursor: 'pointer' as any }}
                      >
                        <CircleCheck size={13} color={CHIP_TONES.success.fg} strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: CHIP_TONES.success.fg }}>Tahsil Edildi</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleStatusChange(ck, 'iade')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: CHIP_TONES.warning.bg, cursor: 'pointer' as any }}
                      >
                        <Undo2 size={13} color={CHIP_TONES.warning.fg} strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: CHIP_TONES.warning.fg }}>İade</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(ck)}
                        style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: CHIP_TONES.danger.bg, cursor: 'pointer' as any }}
                      >
                        <Trash2 size={13} color={CHIP_TONES.danger.fg} strokeWidth={2} />
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Add modal — §08 dialog ────────────────────────── */}
      <CheckFormModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); refetch(); }}
      />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// FORM MODAL — §08 dialog + §05.5 form
// ═════════════════════════════════════════════════════════════════════
function CheckFormModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
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
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 520, maxHeight: '90%', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', boxShadow: modalShadow } as any}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
              Çek / Senet Ekle
            </Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={DS.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            {/* Clinic picker */}
            <View style={{ gap: 6 }}>
              <FL>Klinik (opsiyonel)</FL>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    onPress={() => setClinicId('')}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: !clinicId ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                      backgroundColor: !clinicId ? DS.ink[50] : '#FFF',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: !clinicId ? '600' : '500', color: !clinicId ? DS.ink[900] : DS.ink[500] }}>Seçilmedi</Text>
                  </Pressable>
                  {clinics.map(cl => (
                    <Pressable
                      key={cl.id}
                      onPress={() => setClinicId(cl.id)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: clinicId === cl.id ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                        backgroundColor: clinicId === cl.id ? DS.ink[50] : '#FFF',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: clinicId === cl.id ? '600' : '500', color: clinicId === cl.id ? DS.ink[900] : DS.ink[500] }} numberOfLines={1}>{cl.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Amount + Due */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>Tutar</FL>
                <FI value={amount} onChangeText={setAmount} placeholder="0,00"
                  keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>Vade Tarihi</FL>
                <FI value={dueDate} onChangeText={setDueDate} placeholder="YYYY-AA-GG" />
              </View>
            </View>

            {/* Bank + Number */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>Banka</FL>
                <FI value={bankName} onChangeText={setBankName} placeholder="Banka adı..." />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>Çek No</FL>
                <FI value={checkNumber} onChangeText={setCheckNumber} placeholder="Çek numarası..." />
              </View>
            </View>

            {/* Issue date */}
            <View style={{ gap: 6 }}>
              <FL>Düzenleme Tarihi</FL>
              <FI value={issueDate} onChangeText={setIssueDate} placeholder="YYYY-AA-GG" />
            </View>

            {/* Notes */}
            <View style={{ gap: 6 }}>
              <FL>Not (opsiyonel)</FL>
              <FI value={notes} onChangeText={setNotes} placeholder="..." multiline
                style={{ minHeight: 48, textAlignVertical: 'top' as any }} />
            </View>

            {error ? <Text style={{ fontSize: 12, color: CHIP_TONES.danger.fg }}>{error}</Text> : null}
          </ScrollView>

          {/* Footer — §08 ghost + dark pill right-aligned */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, cursor: 'pointer' as any }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
                backgroundColor: DS.ink[900], opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Form helpers ────────────────────────────────────────────────────
function FL({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[400] }}>
      {children}
    </Text>
  );
}

function FI(props: any) {
  const { style: extra, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={DS.ink[300]}
      {...rest}
      style={[{
        height: 44, paddingHorizontal: 14, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
        fontSize: 14, color: DS.ink[900], outline: 'none' as any,
      }, extra]}
    />
  );
}

export default ChecksScreen;
