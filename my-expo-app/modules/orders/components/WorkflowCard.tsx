// modules/orders/components/WorkflowCard.tsx
// Müdür / Admin için sipariş bazında üretim akışı kartı.
// Siparişin durumuna göre farklı aksiyonlar gösterir.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Modal, Pressable, TextInput, Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { AppIcon } from '../../../core/ui/AppIcon';
import { toast } from '../../../core/ui/Toast';
import { useOrderStages, StageInfo } from '../hooks/useOrderStages';
import { WorkOrder } from '../types';
import { Profile } from '../../../lib/types';

// ── İç tipler ──────────────────────────────────────────────────────────────────

interface Props {
  order: WorkOrder;
  profile: Profile | null;
  /** İş emri yeniden yüklensin */
  onRefresh: () => void;
  /** Fatura oluştur */
  onCreateInvoice: () => void;
  /** Teslimat fişi yazdır */
  onPrintReceipt: () => void;
  /** QR Modal aç */
  onShowQR: () => void;
  /** Print (web) */
  onPrint?: () => void;
}

// Durum renkleri (aşama)
const STAGE_COLOR: Record<string, string> = {
  bekliyor:   '#F59E0B',
  aktif:      '#2563EB',
  tamamlandi: '#16A34A',
  onaylandi:  '#7C3AED',
  reddedildi: '#DC2626',
};

const STAGE_LABEL: Record<string, string> = {
  bekliyor:   'Bekliyor',
  aktif:      'Devam Ediyor',
  tamamlandi: 'Tamamlandı — Onay Bekliyor',
  onaylandi:  'Onaylandı',
  reddedildi: 'Reddedildi',
};

// ── Yardımcı: süre formatla ────────────────────────────────────────────────────

function elapsedLabel(since: string | null): string {
  if (!since) return '';
  const mins = Math.round((Date.now() - new Date(since).getTime()) / 60000);
  if (mins < 60) return `${mins} dk`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}s ${m > 0 ? m + 'dk' : ''}`;
}

// ── Red formu (modal) ──────────────────────────────────────────────────────────

function RejectModal({
  visible,
  onClose,
  onConfirm,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');

  function handleConfirm() {
    if (!reason.trim()) {
      Alert.alert('Red nedeni gerekli', 'Lütfen red gerekçesini yazın.');
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={rm.backdrop} onPress={onClose}>
        <Pressable style={rm.sheet} onPress={() => {}}>
          <Text style={rm.title}>Aşamayı Reddet</Text>
          <Text style={rm.subtitle}>
            Bu aşama teknisyene iade edilecek. Neden reddettinizi yazın.
          </Text>

          <TextInput
            style={rm.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Red gerekçesi…"
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={4}
            maxLength={400}
          />

          <View style={rm.actions}>
            <TouchableOpacity style={rm.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={rm.cancelText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[rm.confirmBtn, loading && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <AppIcon name="x" size={15} color="#fff" />
                  <Text style={rm.confirmText}>Reddet</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const rm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 460,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 48,
    elevation: 16,
    padding: 24,
    gap: 14,
  },
  handle: { display: 'none' as any },   // artık kullanılmıyor
  title:    { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 13, color: '#64748B', lineHeight: 19 },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0',
    padding: 13, fontSize: 14, color: '#0F172A',
    minHeight: 96, textAlignVertical: 'top',
    // @ts-ignore
    outlineStyle: 'none',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  confirmBtn: {
    flex: 2, backgroundColor: '#DC2626', borderRadius: 10,
    paddingVertical: 12, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  confirmText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

// ── Aşama özet satırı ──────────────────────────────────────────────────────────

function StagePill({ stage, isActive }: { stage: StageInfo; isActive: boolean }) {
  const color = STAGE_COLOR[stage.status] ?? '#94A3B8';
  return (
    <View style={[sp.row, isActive && sp.rowActive]}>
      <View style={[sp.seq, { backgroundColor: color }]}>
        <Text style={sp.seqText}>{stage.sequence_order}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={sp.name} numberOfLines={1}>
          {stage.station?.name ?? '—'}
        </Text>
        {stage.technician && (
          <Text style={sp.tech} numberOfLines={1}>{stage.technician.full_name}</Text>
        )}
      </View>
      <View style={[sp.pill, { backgroundColor: color + '22' }]}>
        <Text style={[sp.pillText, { color }]}>
          {stage.status === 'tamamlandi' ? '✓ Onay Bekliyor' : STAGE_LABEL[stage.status] ?? stage.status}
        </Text>
      </View>
    </View>
  );
}

const sp = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC', borderRadius: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
    paddingVertical: 8, paddingHorizontal: 10,
    marginBottom: 5,
  },
  rowActive: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  seq: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  seqText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  name: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  tech: { fontSize: 11, color: '#64748B', marginTop: 1 },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '700' },
});

// ── Ana bileşen ────────────────────────────────────────────────────────────────

export function WorkflowCard({
  order,
  profile,
  onRefresh,
  onCreateInvoice,
  onPrintReceipt,
  onShowQR,
  onPrint,
}: Props) {
  const router = useRouter();
  const { stages, activeStage, pendingStages, loading, refetch } = useOrderStages(order.id);

  const [approving, setApproving]         = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejecting, setRejecting]         = useState(false);
  const [movingQC, setMovingQC]           = useState(false);

  const isManager = profile?.role === 'manager' || profile?.user_type === 'admin';

  // ── Aşama Onayla (advance_to_next_stage RPC) ──────────────────────────────
  async function handleApprove() {
    if (!profile || !activeStage) return;
    setApproving(true);

    const { data, error } = await supabase.rpc('advance_to_next_stage', {
      p_work_order_id: order.id,
      p_approver_id:   profile.id,
    });

    setApproving(false);

    if (error) {
      toast.error('Onay başarısız: ' + error.message);
      return;
    }

    const result = data as any;
    if (result?.ok) {
      if (result.status === 'kalite_kontrol') {
        toast.success('Tüm aşamalar tamamlandı → Kalite kontrole geçildi ✓');
      } else {
        toast.success('Aşama onaylandı, sonraki aşama başlatıldı ✓');
      }
      await refetch();
      onRefresh();
    } else {
      toast.error(result?.error ?? 'Bilinmeyen hata');
    }
  }

  // ── Aşama Reddet (reject_stage RPC) ───────────────────────────────────────
  async function handleReject(reason: string) {
    if (!profile || !activeStage) return;
    setRejecting(true);

    const { error } = await supabase.rpc('reject_stage', {
      p_stage_id:    activeStage.id,
      p_approver_id: profile.id,
      p_reason:      reason,
    });

    setRejecting(false);
    setRejectVisible(false);

    if (error) {
      toast.error('Red işlemi başarısız: ' + error.message);
    } else {
      toast.success('Aşama reddedildi, teknisyene iade edildi');
      await refetch();
      onRefresh();
    }
  }

  // ── Kalite kontrolden geç → teslimata_hazir ───────────────────────────────
  async function handleQCApprove() {
    if (!profile) return;
    setMovingQC(true);

    const { error } = await supabase
      .from('work_orders')
      .update({ status: 'teslimata_hazir' })
      .eq('id', order.id);

    if (!error) {
      await supabase.from('order_events').insert({
        work_order_id: order.id,
        event_type:    'kalite_gecti',
        actor_id:      profile.id,
      }).then(() => {});
    }

    setMovingQC(false);

    if (error) {
      toast.error('Güncelleme başarısız: ' + error.message);
    } else {
      toast.success('Kalite kontrolü geçti → Teslimata Hazır ✓');
      onRefresh();
    }
  }

  // ── Durum bazlı içerik ─────────────────────────────────────────────────────
  const status = order.status as string;

  // ── Aşama aktif/tamamlandı bölümü ─────────────────────────────────────────
  function renderActiveStageBlock() {
    if (!activeStage) return null;

    const stageColor  = STAGE_COLOR[activeStage.status] ?? '#94A3B8';
    const isCompleted = activeStage.status === 'tamamlandi';
    const elapsed     = activeStage.started_at
      ? elapsedLabel(activeStage.started_at)
      : null;

    return (
      <View style={s.activeBlock}>
        {/* İstasyon başlığı */}
        <View style={s.activeHeader}>
          <View style={[s.stationDot, { backgroundColor: activeStage.station?.color ?? stageColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.stationName}>{activeStage.station?.name ?? '—'}</Text>
            <Text style={s.stationMeta}>
              {activeStage.technician
                ? activeStage.technician.full_name
                : 'Teknisyen atanmadı'}
              {elapsed ? `  ·  ${elapsed}` : ''}
            </Text>
          </View>
          <View style={[s.statusPill, { backgroundColor: stageColor + '22' }]}>
            <Text style={[s.statusPillText, { color: stageColor }]}>
              {isCompleted ? '⏳ Onay' : '▶ Devam'}
            </Text>
          </View>
        </View>

        {/* Teknisyen notu */}
        {activeStage.technician_note ? (
          <View style={s.noteBox}>
            <Text style={s.noteLabel}>Teknisyen notu</Text>
            <Text style={s.noteText}>{activeStage.technician_note}</Text>
          </View>
        ) : null}

        {/* Onay / Red butonları — sadece tamamlandi + manager */}
        {isCompleted && isManager && (
          <View style={s.approvalRow}>
            <TouchableOpacity
              style={[s.rejectBtn, rejecting && { opacity: 0.5 }]}
              onPress={() => setRejectVisible(true)}
              disabled={rejecting || approving}
              activeOpacity={0.8}
            >
              <AppIcon name="x" size={15} color="#DC2626" />
              <Text style={s.rejectBtnText}>Reddet</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.approveBtn, approving && { opacity: 0.5 }]}
              onPress={handleApprove}
              disabled={approving || rejecting}
              activeOpacity={0.8}
            >
              {approving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <AppIcon name="check" size={15} color="#fff" />
                  <Text style={s.approveBtnText}>Onayla</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.card}>

      {/* ── Bölüm 1: Üretim Akışı ─────────────────────────────────────────── */}
      {isManager && (
        <>
          <View style={s.sectionHeader}>
            <AppIcon name={'sitemap-outline' as any} size={14} color="#2563EB" />
            <Text style={s.sectionTitle}>Üretim Akışı</Text>
            {loading && <ActivityIndicator size="small" color="#94A3B8" style={{ marginLeft: 4 }} />}
          </View>

          {/* ── alindi / atama_bekleniyor — rota planla ── */}
          {(status === 'alindi' || status === 'atama_bekleniyor' || status === 'kutu_atandi') && (
            stages.length === 0 ? (
              <View style={s.routeEmpty}>
                <AppIcon name={'map-marker-path' as any} size={26} color="#CBD5E1" />
                <Text style={s.routeEmptyTitle}>Üretim Rotası Yok</Text>
                <Text style={s.routeEmptyText}>
                  İstasyonları ve teknisyenleri atayarak üretim rotasını tanımlayın.
                </Text>
                <TouchableOpacity
                  style={s.routeBtn}
                  onPress={() => router.push(`/(lab)/order/route/${order.id}` as any)}
                  activeOpacity={0.8}
                >
                  <AppIcon name="plus" size={15} color="#fff" />
                  <Text style={s.routeBtnText}>Rota Oluştur</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Planlı aşamalar */}
                {stages.map(st => (
                  <StagePill key={st.id} stage={st}
                    isActive={st.status === 'aktif' || st.status === 'tamamlandi'} />
                ))}
                <TouchableOpacity
                  style={s.editRouteBtn}
                  onPress={() => router.push(`/(lab)/order/route/${order.id}` as any)}
                  activeOpacity={0.75}
                >
                  <AppIcon name={'pencil-outline' as any} size={13} color="#2563EB" />
                  <Text style={s.editRouteBtnText}>Rotayı Düzenle</Text>
                </TouchableOpacity>
              </>
            )
          )}

          {/* ── asamada — aktif aşama + approve/reject ── */}
          {status === 'asamada' && (
            <>
              {renderActiveStageBlock()}
              {/* Bekleyen aşamalar özeti */}
              {pendingStages.length > 0 && (
                <View style={s.pendingList}>
                  <Text style={s.pendingLabel}>Sırada ({pendingStages.length})</Text>
                  {pendingStages.map(st => (
                    <StagePill key={st.id} stage={st} isActive={false} />
                  ))}
                </View>
              )}
              <TouchableOpacity
                style={s.editRouteBtn}
                onPress={() => router.push(`/(lab)/order/route/${order.id}` as any)}
                activeOpacity={0.75}
              >
                <AppIcon name={'sitemap-outline' as any} size={13} color="#2563EB" />
                <Text style={s.editRouteBtnText}>Rota Yönet</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── kalite_kontrol ── */}
          {status === 'kalite_kontrol' && (
            <View style={s.qcBlock}>
              <View style={s.qcIcon}>
                <AppIcon name={'shield-check-outline' as any} size={22} color="#7C3AED" />
              </View>
              <Text style={s.qcTitle}>Kalite Kontrolü</Text>
              <Text style={s.qcText}>
                Tüm üretim aşamaları tamamlandı. Kalite kontrolü yaparak işi teslimata hazırlayın.
              </Text>
              <View style={s.qcActions}>
                <TouchableOpacity
                  style={s.qcRejectBtn}
                  onPress={() => router.push(`/(lab)/order/route/${order.id}` as any)}
                  activeOpacity={0.8}
                >
                  <AppIcon name="rotate-ccw" size={14} color="#DC2626" />
                  <Text style={s.qcRejectText}>Geri Gönder</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.qcApproveBtn, movingQC && { opacity: 0.5 }]}
                  onPress={handleQCApprove}
                  disabled={movingQC}
                  activeOpacity={0.8}
                >
                  {movingQC ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <AppIcon name="check" size={15} color="#fff" />
                      <Text style={s.qcApproveText}>Kalite Onayı</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── teslimata_hazir ── */}
          {(status === 'teslimata_hazir' || status === 'kurye_bekleniyor' || status === 'kuryede') && (
            <TouchableOpacity
              style={s.deliveryBtn}
              onPress={() => router.push('/(lab)/deliveries' as any)}
              activeOpacity={0.8}
            >
              <AppIcon name={'truck-fast-outline' as any} size={15} color="#fff" />
              <Text style={s.deliveryBtnText}>Teslimat Yönet</Text>
            </TouchableOpacity>
          )}

          {/* ── teslim_edildi ── */}
          {status === 'teslim_edildi' && (
            <View style={s.doneBadge}>
              <Text style={s.doneEmoji}>✅</Text>
              <Text style={s.doneText}>Teslim Edildi</Text>
            </View>
          )}

          <View style={s.divider} />
        </>
      )}

      {/* ── Bölüm 2: Yardımcı Aksiyonlar ─────────────────────────────────── */}
      <View style={s.sectionHeader}>
        <AppIcon name={'tools' as any} size={14} color="#64748B" />
        <Text style={[s.sectionTitle, { color: '#64748B' }]}>Aksiyonlar</Text>
      </View>

      <ActionItem
        icon="file-document-outline"
        label="Fatura Oluştur"
        color="#2563EB"
        onPress={onCreateInvoice}
      />
      <ActionItem
        icon="qrcode"
        label="QR Kod"
        color="#475569"
        onPress={onShowQR}
      />
      {Platform.OS === 'web' && onPrint && (
        <ActionItem
          icon="printer"
          label="Yazdır"
          color="#475569"
          onPress={onPrint}
        />
      )}
      <ActionItem
        icon="receipt-text-outline"
        label="Teslimat Fişi"
        color="#475569"
        onPress={onPrintReceipt}
      />
      {isManager && Platform.OS === 'web' && (
        <ActionItem
          icon="cube-scan"
          label="Oklüzyon"
          color="#7C3AED"
          onPress={() => router.push(`/order/occlusion/${order.id}` as any)}
          last
        />
      )}

      {/* Reddet Modal */}
      <RejectModal
        visible={rejectVisible}
        onClose={() => setRejectVisible(false)}
        onConfirm={handleReject}
        loading={rejecting}
      />
    </View>
  );
}

// ── Utility action item ─────────────────────────────────────────────────────

function ActionItem({
  icon, label, color, onPress, last = false,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.actionItem, last && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <AppIcon name={icon as any} size={14} color={color} />
      <Text style={[s.actionItemText, { color }]}>{label}</Text>
      <AppIcon name="chevron-right" size={12} color="#CBD5E1" />
    </TouchableOpacity>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    flex: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700',
    color: '#2563EB', letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  divider: {
    height: 1, backgroundColor: '#F1F5F9',
    marginHorizontal: 14, marginVertical: 4,
  },

  // ── Rota boş ──
  routeEmpty: {
    alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 6,
    paddingTop: 4,
  },
  routeEmptyTitle: {
    fontSize: 13, fontWeight: '700', color: '#0F172A',
  },
  routeEmptyText: {
    fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 18,
  },
  routeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 20, marginTop: 6,
  },
  routeBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  editRouteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, backgroundColor: '#EFF6FF', borderRadius: 10,
    paddingVertical: 8, marginHorizontal: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  editRouteBtnText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },

  // ── Aktif aşama ──
  activeBlock: {
    marginHorizontal: 14, marginBottom: 8,
    backgroundColor: '#F0F9FF', borderRadius: 12,
    borderWidth: 1, borderColor: '#BAE6FD',
    padding: 12, gap: 10,
  },
  activeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stationDot: { width: 12, height: 12, borderRadius: 6, marginTop: 1 },
  stationName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  stationMeta: { fontSize: 11, color: '#64748B', marginTop: 1 },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  noteBox: {
    backgroundColor: '#FFFFFF', borderRadius: 8,
    borderWidth: 1, borderColor: '#E0F2FE',
    borderLeftWidth: 3, borderLeftColor: '#0EA5E9',
    padding: 10, gap: 3,
  },
  noteLabel: { fontSize: 10, fontWeight: '700', color: '#0EA5E9', textTransform: 'uppercase' },
  noteText:  { fontSize: 12, color: '#334155', lineHeight: 18 },

  // Approve/Reject
  approvalRow: {
    flexDirection: 'row', gap: 8,
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#FEF2F2', borderRadius: 10,
    paddingVertical: 10, borderWidth: 1, borderColor: '#FECACA',
  },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  approveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#16A34A', borderRadius: 10, paddingVertical: 10,
  },
  approveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Pending list
  pendingList: { marginHorizontal: 14, marginBottom: 4 },
  pendingLabel: {
    fontSize: 11, fontWeight: '600', color: '#94A3B8',
    marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3,
  },

  // ── Kalite kontrol ──
  qcBlock: {
    marginHorizontal: 14, marginBottom: 8,
    alignItems: 'center', gap: 8,
    backgroundColor: '#FAF5FF', borderRadius: 12,
    borderWidth: 1, borderColor: '#DDD6FE',
    padding: 16,
  },
  qcIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#EDE9FE',
    alignItems: 'center', justifyContent: 'center',
  },
  qcTitle: { fontSize: 15, fontWeight: '800', color: '#5B21B6' },
  qcText:  { fontSize: 12, color: '#7C3AED', textAlign: 'center', lineHeight: 18 },
  qcActions: { flexDirection: 'row', gap: 8, width: '100%' },
  qcRejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#FEF2F2', borderRadius: 10,
    paddingVertical: 10, borderWidth: 1, borderColor: '#FECACA',
  },
  qcRejectText:  { fontSize: 12, fontWeight: '700', color: '#DC2626' },
  qcApproveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 10,
  },
  qcApproveText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Delivery
  deliveryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#7C3AED', borderRadius: 12,
    paddingVertical: 11, marginHorizontal: 14, marginBottom: 8,
  },
  deliveryBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Done
  doneBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, marginHorizontal: 14, marginBottom: 8,
    backgroundColor: '#F0FDF4', borderRadius: 12,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  doneEmoji: { fontSize: 20 },
  doneText:  { fontSize: 14, fontWeight: '700', color: '#15803D' },

  // ── Utility actions ──
  actionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  actionItemText: {
    flex: 1, fontSize: 13, fontWeight: '600', color: '#475569',
  },
});
