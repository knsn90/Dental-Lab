import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOrderDetail } from '../hooks/useOrderDetail';
import { useAuthStore } from '../../../core/store/authStore';
import { advanceOrderStatus } from '../api';
import { uploadPhoto, pickPhoto, takePhoto } from '../../../lib/photos';
import { StatusTimeline } from '../components/StatusTimeline';
import { StatusUpdateModal } from '../components/StatusUpdateModal';
import { ProvaSection } from '../components/ProvaSection';
import { OrderItemsSection } from '../components/OrderItemsSection';
import { STATUS_CONFIG, isOrderOverdue, formatDeliveryDate, getNextStatus } from '../constants';
import { WorkOrder, WorkOrderStatus } from '../types';
import { fetchPatientOrders } from '../../provas/api';
import { C } from '../../../core/theme/colors';

type Section = 'details' | 'steps' | 'prova' | 'vaka' | 'billing' | 'doctor' | 'files';

const SECTIONS: { key: Section; emoji: string; label: string }[] = [
  { key: 'details', emoji: '📋', label: 'Detaylar' },
  { key: 'steps', emoji: '📍', label: 'Adımlar' },
  { key: 'prova', emoji: '🦷', label: 'Prova' },
  { key: 'vaka', emoji: '🗂️', label: 'Vaka' },
  { key: 'billing', emoji: '💰', label: 'Ücret' },
  { key: 'doctor', emoji: '👨‍⚕️', label: 'Hekim' },
  { key: 'files', emoji: '📸', label: 'Dosyalar' },
];

// Tooth grid — upper (1-16) and lower (17-32)
const UPPER_TEETH = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16];
const LOWER_TEETH = [32,31,30,29,28,27,26,25,24,23,22,21,20,19,18,17];

function ToothGrid({ selected }: { selected: number[] }) {
  return (
    <View style={toothStyles.wrap}>
      <Text style={toothStyles.label}>Üst Çene</Text>
      <View style={toothStyles.row}>
        {UPPER_TEETH.map((n) => (
          <View
            key={n}
            style={[toothStyles.tooth, selected.includes(n) && toothStyles.toothSelected]}
          >
            <Text style={[toothStyles.toothNum, selected.includes(n) && toothStyles.toothNumSelected]}>
              {n}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[toothStyles.label, { marginTop: 10 }]}>Alt Çene</Text>
      <View style={toothStyles.row}>
        {LOWER_TEETH.map((n) => (
          <View
            key={n}
            style={[toothStyles.tooth, selected.includes(n) && toothStyles.toothSelected]}
          >
            <Text style={[toothStyles.toothNum, selected.includes(n) && toothStyles.toothNumSelected]}>
              {n}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { order, signedUrls, loading, refetch } = useOrderDetail(id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;

  const [activeSection, setActiveSection] = useState<Section>('details');
  const [modalVisible, setModalVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.textSecondary }}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const overdue = isOrderOverdue(order.delivery_date, order.status);
  const nextStatus = getNextStatus(order.status);
  const cfg = STATUS_CONFIG[order.status];

  const daysLeft = Math.ceil(
    (new Date(order.delivery_date + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const handleStatusUpdate = async (newStatus: WorkOrderStatus, note: string) => {
    if (!profile) return;
    const { error } = await advanceOrderStatus(order.id, newStatus, profile.id, note || undefined);
    if (error) Alert.alert('Hata', 'Durum güncellenemedi: ' + (error as any).message);
    else refetch();
  };

  const handleAddPhoto = async () => {
    if (!profile) return;
    if (typeof window !== 'undefined') {
      // Web: open file picker
      const uri = await pickPhoto();
      if (!uri) return;
      setUploadingPhoto(true);
      const { error } = await uploadPhoto(uri, order.id, profile.id);
      setUploadingPhoto(false);
      if (error) Alert.alert('Hata', error);
      else refetch();
      return;
    }
    Alert.alert('Fotoğraf Ekle', 'Kaynak seçin', [
      {
        text: 'Galeri',
        onPress: async () => {
          const uri = await pickPhoto();
          if (!uri) return;
          setUploadingPhoto(true);
          const { error } = await uploadPhoto(uri, order.id, profile.id);
          setUploadingPhoto(false);
          if (error) Alert.alert('Hata', error);
          else refetch();
        },
      },
      {
        text: 'Kamera',
        onPress: async () => {
          const uri = await takePhoto();
          if (!uri) return;
          setUploadingPhoto(true);
          const { error } = await uploadPhoto(uri, order.id, profile.id);
          setUploadingPhoto(false);
          if (error) Alert.alert('Hata', error);
          else refetch();
        },
      },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  const createdDate = new Date(order.created_at).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Top bar ── */}
      <View style={[styles.topBar, overdue && styles.topBarOverdue]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>

        <View style={styles.topMeta}>
          <View style={[styles.stagePill, { backgroundColor: cfg.bgColor }]}>
            <View style={[styles.stageDot, { backgroundColor: cfg.color }]} />
            <Text style={[styles.stageLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.topOrderNum}>{order.order_number}</Text>
          {order.doctor && (
            <Text style={styles.topDoctor}>{order.doctor.full_name.toUpperCase()}</Text>
          )}
          {order.is_urgent && <Text style={styles.urgentTag}>🔴 ACİL</Text>}
          {overdue && <Text style={styles.overdueTag}>⚠️ GECİKEN</Text>}
        </View>

        <View style={styles.topActions}>
          {nextStatus && (
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              style={styles.btnAdvance}
            >
              <Text style={styles.btnAdvanceText}>
                {order.status === 'alindi' ? '▶ Başlat' : '✓ Tamamla'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Info bar ── */}
      <View style={styles.infoBar}>
        <InfoPill label="Durum" value={cfg.label} color={cfg.color} />
        <InfoPill label="Başlangıç" value={createdDate} />
        <InfoPill
          label="Kalan Gün"
          value={
            order.status === 'teslim_edildi'
              ? 'Teslim Edildi'
              : daysLeft < 0
              ? `${Math.abs(daysLeft)} gün geçti`
              : `${daysLeft} gün`
          }
          color={daysLeft < 0 && order.status !== 'teslim_edildi' ? C.danger : undefined}
        />
        <InfoPill label="Teslim" value={formatDeliveryDate(order.delivery_date)} />
      </View>

      {/* ── Body ── */}
      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        {/* Section sidebar */}
        <View style={[styles.sectionSidebar, isDesktop && styles.sectionSidebarDesktop]}>
          {SECTIONS.map((s) => (
            <TouchableOpacity
              key={s.key}
              onPress={() => setActiveSection(s.key)}
              style={[
                styles.sectionItem,
                activeSection === s.key && styles.sectionItemActive,
              ]}
            >
              <Text style={styles.sectionEmoji}>{s.emoji}</Text>
              {isDesktop && (
                <Text
                  style={[
                    styles.sectionLabel,
                    activeSection === s.key && styles.sectionLabelActive,
                  ]}
                >
                  {s.label}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <ScrollView style={styles.contentArea} contentContainerStyle={styles.contentPad}>
          {activeSection === 'details' && (
            <DetailsSection order={order} />
          )}
          {activeSection === 'steps' && (
            <StepsSection history={order.status_history ?? []} />
          )}
          {activeSection === 'prova' && (
            <ProvaSection workOrderId={order.id} />
          )}
          {activeSection === 'vaka' && (
            <VakaSection
              patientId={order.patient_id}
              patientName={order.patient_name}
              orderId={order.id}
            />
          )}
          {activeSection === 'billing' && (
            <OrderItemsSection workOrderId={order.id} />
          )}
          {activeSection === 'doctor' && (
            <DoctorSection order={order} />
          )}
          {activeSection === 'files' && (
            <FilesSection
              order={order}
              signedUrls={signedUrls}
              uploading={uploadingPhoto}
              onAdd={handleAddPhoto}
            />
          )}
        </ScrollView>
      </View>

      <StatusUpdateModal
        visible={modalVisible}
        currentStatus={order.status}
        onConfirm={handleStatusUpdate}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ── Section components ──

function DetailsSection({ order }: { order: WorkOrder }) {
  return (
    <View>
      {/* Work info table */}
      <Text style={sectionStyles.heading}>İş Tanımı</Text>
      <View style={sectionStyles.table}>
        <TableRow label="Tanım" value={order.work_type} bold />
        <TableRow label="Standart" value={order.shade ?? '—'} />
        <TableRow label="Adet" value="1" />
        {order.notes ? <TableRow label="Notlar" value={order.notes} /> : null}
        <TableRow
          label="Makine"
          value={order.machine_type === 'milling' ? '⚙️ Frezeleme' : '🖨️ 3D Baskı'}
        />
      </View>

      {/* Tooth diagram */}
      <Text style={[sectionStyles.heading, { marginTop: 20 }]}>Diş Numaraları</Text>
      <ToothGrid selected={order.tooth_numbers} />
    </View>
  );
}

function StepsSection({ history }: { history: any[] }) {
  return (
    <View>
      <Text style={sectionStyles.heading}>Durum Geçmişi</Text>
      <StatusTimeline history={history} />
    </View>
  );
}

function DoctorSection({ order }: { order: WorkOrder }) {
  const doc = order.doctor;
  if (!doc) return <Text style={{ color: C.textMuted }}>Hekim bilgisi yok</Text>;
  return (
    <View>
      <Text style={sectionStyles.heading}>Hekim Bilgisi</Text>
      <View style={sectionStyles.table}>
        <TableRow label="Ad Soyad" value={doc.full_name} bold />
        {doc.clinic?.name && <TableRow label="Klinik" value={doc.clinic.name} />}
        {(doc as any).phone && <TableRow label="Telefon" value={(doc as any).phone} />}
      </View>
    </View>
  );
}

function FilesSection({
  order,
  signedUrls,
  uploading,
  onAdd,
}: {
  order: WorkOrder;
  signedUrls: Record<string, string>;
  uploading: boolean;
  onAdd: () => void;
}) {
  return (
    <View>
      <View style={sectionStyles.filesHeader}>
        <Text style={sectionStyles.heading}>Dosyalar ({order.photos?.length ?? 0})</Text>
        <TouchableOpacity onPress={onAdd} style={sectionStyles.addBtn} disabled={uploading}>
          <Text style={sectionStyles.addBtnText}>{uploading ? 'Yükleniyor...' : '+ Ekle'}</Text>
        </TouchableOpacity>
      </View>
      {!order.photos || order.photos.length === 0 ? (
        <View style={sectionStyles.noFiles}>
          <Text style={sectionStyles.noFilesText}>📁 Henüz dosya yok</Text>
          <Text style={sectionStyles.noFilesSubText}>Fotoğraf eklemek için + Ekle butonuna basın</Text>
        </View>
      ) : (
        <View style={sectionStyles.photoGrid}>
          {order.photos.map((photo: any) => {
            const url = signedUrls[photo.storage_path];
            return url ? (
              <Image key={photo.id} source={{ uri: url }} style={sectionStyles.photo} />
            ) : null;
          })}
        </View>
      )}
    </View>
  );
}

function VakaSection({
  patientId,
  patientName,
  orderId,
}: {
  patientId: string | null;
  patientName: string | null;
  orderId: string;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatientOrders(patientId, patientName, orderId).then(({ data }) => {
      setOrders(data ?? []);
      setLoading(false);
    });
  }, [patientId, patientName, orderId]);

  if (!patientId && !patientName) {
    return (
      <View>
        <Text style={sectionStyles.heading}>Vaka Geçmişi</Text>
        <View style={sectionStyles.noFiles}>
          <Text style={sectionStyles.noFilesText}>👤 Hasta bilgisi girilmemiş</Text>
          <Text style={sectionStyles.noFilesSubText}>
            İş emrinde hasta adı veya TC eklenirse vaka geçmişi burada görünür
          </Text>
        </View>
      </View>
    );
  }

  const STATUS_EMOJI: Record<string, string> = {
    alindi: '📥',
    uretimde: '⚙️',
    kalite_kontrol: '🔍',
    teslimata_hazir: '📦',
    teslim_edildi: '✅',
  };

  return (
    <View>
      <Text style={sectionStyles.heading}>
        Vaka Geçmişi — {patientName ?? patientId}
      </Text>
      {loading ? (
        <Text style={{ color: C.textMuted, padding: 12 }}>Yükleniyor...</Text>
      ) : orders.length === 0 ? (
        <View style={sectionStyles.noFiles}>
          <Text style={sectionStyles.noFilesText}>📂 Başka iş emri bulunamadı</Text>
          <Text style={sectionStyles.noFilesSubText}>
            Bu hastaya ait tek iş emri bu
          </Text>
        </View>
      ) : (
        <View style={sectionStyles.table}>
          {orders.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={sectionStyles.tableRow}
              onPress={() => router.push(`/(lab)/order/${o.id}`)}
            >
              <Text style={sectionStyles.tableLabel}>{o.order_number}</Text>
              <Text style={{ flex: 1, fontSize: 13, color: C.textPrimary }}>{o.work_type}</Text>
              <Text style={{ fontSize: 13, color: C.textSecondary }}>
                {STATUS_EMOJI[o.status] ?? ''} {STATUS_CONFIG[o.status as WorkOrderStatus]?.label ?? o.status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function TableRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={sectionStyles.tableRow}>
      <Text style={sectionStyles.tableLabel}>{label}</Text>
      <Text style={[sectionStyles.tableValue, bold && { fontWeight: '700', color: C.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

function InfoPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.infoPill}>
      <Text style={styles.infoPillLabel}>{label}:</Text>
      <Text style={[styles.infoPillValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const toothStyles = StyleSheet.create({
  wrap: { backgroundColor: C.background, borderRadius: 10, padding: 12 },
  label: { fontSize: 11, fontWeight: '600', color: C.textSecondary, marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tooth: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  toothSelected: { backgroundColor: C.primary, borderColor: C.primary },
  toothNum: { fontSize: 9, fontWeight: '600', color: C.textMuted },
  toothNumSelected: { color: '#FFFFFF' },
});

const sectionStyles = StyleSheet.create({
  heading: { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
  table: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableLabel: { width: 110, fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  tableValue: { flex: 1, fontSize: 13, color: C.textSecondary },
  filesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  noFiles: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  noFilesText: { fontSize: 16, color: C.textMuted },
  noFilesSubText: { fontSize: 13, color: C.textMuted },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: 120, height: 120, borderRadius: 10 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
    flexWrap: 'wrap',
  },
  topBarOverdue: { backgroundColor: C.dangerBg },
  backBtn: { paddingRight: 4 },
  backText: { fontSize: 14, color: C.primary, fontWeight: '600' },
  topMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  stageDot: { width: 7, height: 7, borderRadius: 4 },
  stageLabel: { fontSize: 12, fontWeight: '700' },
  topOrderNum: { fontSize: 14, fontWeight: '800', color: C.textPrimary },
  topDoctor: { fontSize: 13, fontWeight: '700', color: C.textSecondary },
  urgentTag: { fontSize: 12, color: '#DC2626', fontWeight: '700', backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  overdueTag: { fontSize: 12, color: C.danger, fontWeight: '700' },
  topActions: { flexDirection: 'row', gap: 8 },
  btnAdvance: {
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnAdvanceText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  infoBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 20,
    flexWrap: 'wrap',
  },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoPillLabel: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
  infoPillValue: { fontSize: 12, fontWeight: '700', color: C.textPrimary },

  body: { flex: 1, flexDirection: 'column' },
  bodyDesktop: { flexDirection: 'row' },

  sectionSidebar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 8,
  },
  sectionSidebarDesktop: {
    flexDirection: 'column',
    width: 130,
    borderBottomWidth: 0,
    borderRightWidth: 1,
    borderRightColor: C.border,
    paddingHorizontal: 0,
    paddingTop: 8,
  },
  sectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  sectionItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: C.primary,
  },
  sectionEmoji: { fontSize: 18 },
  sectionLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  sectionLabelActive: { color: C.primary, fontWeight: '700' },

  contentArea: { flex: 1 },
  contentPad: { padding: 20 },
});
