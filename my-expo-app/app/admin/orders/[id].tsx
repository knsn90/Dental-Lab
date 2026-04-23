import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAdminOrderDetail } from '../../../modules/admin/orders/hooks';
import { deleteOrder } from '../../../modules/admin/orders/service';

const C = {
  primary: '#0F172A', primaryBg: '#F1F5F9',
  accent: '#7C3AED', accentBg: '#F5F3FF',
  background: '#FFFFFF', surface: '#FFFFFF', surfaceAlt: '#F8FAFC',
  textPrimary: '#0F172A', textSecondary: '#64748B', textMuted: '#94A3B8',
  border: '#F1F5F9',
  success: '#059669', successBg: '#ECFDF5',
  warning: '#D97706', warningBg: '#FFFBEB',
  danger: '#DC2626', dangerBg: '#FEF2F2',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  alindi:           { label: 'Alındı',          color: '#0F172A', bgColor: '#F1F5F9' },
  uretimde:         { label: 'Üretimde',         color: '#D97706', bgColor: '#FFFBEB' },
  kalite_kontrol:   { label: 'Kalite Kontrol',   color: '#7C3AED', bgColor: '#F5F3FF' },
  teslimata_hazir:  { label: 'Teslimata Hazır',  color: '#059669', bgColor: '#ECFDF5' },
  teslim_edildi:    { label: 'Teslim Edildi',    color: '#374151', bgColor: '#F3F4F6' },
};

const STATUS_ORDER = ['alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: C.textSecondary, bgColor: C.surfaceAlt };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: cfg.bgColor }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
    </View>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${formatDate(dateStr)} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value ?? '—'}</Text>
    </View>
  );
}

export default function AdminOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const router = useRouter();

  const { order, loading, updating, changeStatus, refresh } = useAdminOrderDetail(id ?? '');

  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleStatusSave = async () => {
    if (!newStatus) return;
    await changeStatus(newStatus, statusNote || undefined);
    setNewStatus('');
    setStatusNote('');
    setStatusDropdownOpen(false);
    refresh();
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteOrder(id ?? '');
      router.replace('/admin/orders' as any);
    } catch (e: any) {
      Alert.alert('Hata', e.message ?? 'Sipariş silinemedi');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={C.accent} size="large" />
          <Text style={styles.loadingText}>Sipariş yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>Sipariş bulunamadı</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentStatusIndex = STATUS_ORDER.indexOf(order.status);

  const leftColumn = (
    <View style={[styles.column, { flex: 2 }]}>
      {/* Order header */}
      <View style={styles.card}>
        <View style={styles.orderHeaderRow}>
          <View>
            <Text style={styles.orderNumber}>{order.order_number}</Text>
            <Text style={styles.createdAt}>Oluşturulma: {formatDateTime(order.created_at)}</Text>
          </View>
          {order.is_urgent && (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentBadgeText}>🚨 ACİL</Text>
            </View>
          )}
        </View>
      </View>

      {/* Info grid */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sipariş Bilgileri</Text>
        <View style={styles.infoGrid}>
          <InfoRow label="İş Tipi" value={order.work_type} />
          <InfoRow label="Renk (Shade)" value={order.shade} />
          <InfoRow label="Makine Tipi" value={order.machine_type === 'milling' ? 'Freze (Milling)' : '3D Baskı'} />
          <InfoRow label="Departman" value={order.department} />
          <InfoRow label="Hasta Adı" value={order.patient_name} />
          <InfoRow label="Diş Numaraları" value={order.tooth_numbers?.join(', ') || '—'} />
          <InfoRow label="Teslim Tarihi" value={formatDate(order.delivery_date)} />
          {order.delivered_at && <InfoRow label="Teslim Edildi" value={formatDateTime(order.delivered_at)} />}
          <InfoRow label="Hekim" value={order.doctor_name} />
          <InfoRow label="Klinik" value={order.clinic_name} />
        </View>
      </View>

      {/* Status timeline */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Statü Takibi</Text>
        <View style={styles.timeline}>
          {STATUS_ORDER.map((s, idx) => {
            const cfg = STATUS_CONFIG[s];
            const isPast = idx < currentStatusIndex;
            const isCurrent = idx === currentStatusIndex;
            const isFuture = idx > currentStatusIndex;
            return (
              <View key={s} style={styles.timelineItem}>
                <View style={[
                  styles.timelineDot,
                  isCurrent && { backgroundColor: cfg.color, borderColor: cfg.color },
                  isPast && { backgroundColor: C.success, borderColor: C.success },
                  isFuture && { backgroundColor: C.border, borderColor: C.border },
                ]} />
                {idx < STATUS_ORDER.length - 1 && (
                  <View style={[
                    styles.timelineLine,
                    (isPast || isCurrent) && { backgroundColor: C.success },
                  ]} />
                )}
                <Text style={[
                  styles.timelineLabel,
                  isCurrent && { color: cfg.color, fontWeight: '700' },
                  isPast && { color: C.success },
                  isFuture && { color: C.textMuted },
                ]}>
                  {cfg.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Notes */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Notlar</Text>
        <Text style={styles.notesLabel}>Hekim Notu</Text>
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>{order.notes || 'Not yok'}</Text>
        </View>
        <Text style={[styles.notesLabel, { marginTop: 12 }]}>Lab Notu</Text>
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>{order.lab_notes || 'Not yok'}</Text>
        </View>
      </View>
    </View>
  );

  const rightColumn = (
    <View style={[styles.column, { flex: 1 }]}>
      {/* Status update card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Durumu Güncelle</Text>
        <View style={styles.currentStatusRow}>
          <Text style={styles.currentStatusLabel}>Mevcut Durum:</Text>
          <StatusBadge status={order.status} />
        </View>

        {/* Status dropdown */}
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => setStatusDropdownOpen((v) => !v)}
        >
          <Text style={styles.dropdownButtonText}>
            {newStatus
              ? (STATUS_CONFIG[newStatus]?.label ?? newStatus)
              : 'Yeni statü seçin...'}
          </Text>
          <Text style={styles.dropdownArrow}>{statusDropdownOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {statusDropdownOpen && (
          <View style={styles.dropdownMenu}>
            {STATUS_ORDER.map((s) => {
              const cfg = STATUS_CONFIG[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.dropdownItem, newStatus === s && styles.dropdownItemActive]}
                  onPress={() => {
                    setNewStatus(s);
                    setStatusDropdownOpen(false);
                  }}
                >
                  <View style={[styles.dropdownDot, { backgroundColor: cfg.color }]} />
                  <Text style={[styles.dropdownItemText, newStatus === s && { color: C.accent, fontWeight: '700' }]}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TextInput
          style={styles.noteInput}
          placeholder="Not ekle (isteğe bağlı)..."
          placeholderTextColor={C.textMuted}
          value={statusNote}
          onChangeText={setStatusNote}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.saveButton, (!newStatus || updating) && styles.saveButtonDisabled]}
          onPress={handleStatusSave}
          disabled={!newStatus || updating}
        >
          {updating ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Kaydet</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Danger zone */}
      <View style={[styles.card, styles.dangerCard]}>
        <Text style={[styles.cardTitle, { color: C.danger }]}>Tehlikeli Bölge</Text>
        <Text style={styles.dangerDesc}>
          Bu işlem geri alınamaz. Sipariş kalıcı olarak silinecektir.
        </Text>
        {confirmDelete ? (
          <View style={styles.confirmRow}>
            <Text style={styles.confirmText}>Emin misiniz?</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setConfirmDelete(false)}
              >
                <Text style={styles.confirmCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteButton}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmDeleteText}>Evet, Sil</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>🗑 Siparişi Sil</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Siparişler</Text>
        </TouchableOpacity>

        {isDesktop ? (
          <View style={styles.desktopLayout}>
            {leftColumn}
            {rightColumn}
          </View>
        ) : (
          <>
            {leftColumn}
            {rightColumn}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: C.textSecondary, fontSize: 14 },
  errorText: { color: C.danger, fontSize: 16, fontWeight: '600' },
  backButton: {
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 14,
    color: C.accent,
    fontWeight: '600',
  },
  desktopLayout: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  column: {
    gap: 16,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 14,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: C.textPrimary,
  },
  createdAt: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 4,
  },
  urgentBadge: {
    backgroundColor: C.dangerBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  urgentBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.danger,
  },
  infoGrid: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  infoLabel: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: C.textPrimary,
    fontWeight: '600',
    flex: 1.5,
    textAlign: 'right',
  },
  // Timeline
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  timelineLine: {
    height: 2,
    width: 20,
    backgroundColor: C.border,
    marginHorizontal: 2,
  },
  timelineLabel: {
    fontSize: 11,
    color: C.textMuted,
    marginLeft: 4,
    fontWeight: '500',
  },
  // Notes
  notesLabel: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '600',
    marginBottom: 6,
  },
  notesBox: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  notesText: {
    fontSize: 13,
    color: C.textPrimary,
    lineHeight: 20,
  },
  // Status update
  currentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  currentStatusLabel: {
    fontSize: 13,
    color: C.textSecondary,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  dropdownButtonText: {
    fontSize: 13,
    color: C.textPrimary,
  },
  dropdownArrow: {
    fontSize: 10,
    color: C.textMuted,
  },
  dropdownMenu: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    zIndex: 100,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
  },
  dropdownItemActive: {
    backgroundColor: C.accentBg,
  },
  dropdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dropdownItemText: {
    fontSize: 13,
    color: C.textPrimary,
  },
  noteInput: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: 13,
    color: C.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 12,
    // @ts-ignore
    outlineStyle: 'none',
  },
  saveButton: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Danger zone
  dangerCard: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  dangerDesc: {
    fontSize: 12,
    color: C.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  deleteButton: {
    backgroundColor: C.dangerBg,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteButtonText: {
    color: C.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmRow: {
    gap: 10,
  },
  confirmText: {
    fontSize: 13,
    color: C.danger,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancelButton: {
    flex: 1,
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  confirmCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  confirmDeleteButton: {
    flex: 1,
    backgroundColor: C.danger,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmDeleteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
