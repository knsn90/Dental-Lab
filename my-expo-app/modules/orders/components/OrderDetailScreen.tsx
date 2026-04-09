import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
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

// ── Print helper ──────────────────────────────────────────────────────────────
function handlePrint(order: WorkOrder, qrUrl: string) {
  if (typeof window === 'undefined') return;

  const cfg = STATUS_CONFIG[order.status];
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}&margin=6&bgcolor=ffffff&color=0f172a`;

  const toothCells = (order.tooth_numbers ?? [])
    .slice().sort((a, b) => a - b)
    .map(n => `<span class="tooth">${n}</span>`).join('');

  const opsRows = ((order as any).tooth_ops ?? [])
    .slice().sort((a: any, b: any) => a.tooth - b.tooth)
    .map((op: any) =>
      `<tr>
        <td>${op.tooth}</td>
        <td>${op.work_type ?? '—'}</td>
        <td>${op.shade ?? '—'}</td>
        <td>${op.notes ?? ''}</td>
      </tr>`
    ).join('');

  const historyRows = (order.status_history ?? [])
    .map((h: any) => {
      const d = new Date(h.changed_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `<tr><td>${d}</td><td>${STATUS_CONFIG[h.status as WorkOrderStatus]?.label ?? h.status}</td><td>${h.note ?? ''}</td></tr>`;
    }).join('');

  const deliveryDate = new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  const createdDate  = new Date(order.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>İş Emri – ${order.order_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; color: #0f172a; background: #fff; padding: 32px; }
    h1  { font-size: 22px; font-weight: 800; color: #0f172a; }
    h2  { font-size: 14px; font-weight: 700; color: #475569; margin-top: 24px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; }
    .header-left h1 { margin-bottom: 6px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-top: 8px; }
    .meta-row { display: flex; gap: 6px; align-items: baseline; }
    .meta-label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; min-width: 80px; }
    .meta-val   { font-size: 13px; font-weight: 500; color: #0f172a; }
    .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; background: ${cfg.bgColor}; color: ${cfg.color}; margin-bottom: 8px; }
    .qr-wrap { border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; background: #fff; }
    .qr-wrap img { display: block; width: 140px; height: 140px; }
    .qr-label { font-size: 9px; color: #94a3b8; text-align: center; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { text-align: left; padding: 7px 10px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
    th { background: #f8fafc; font-weight: 700; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
    tr:last-child td { border-bottom: none; }
    .teeth-wrap { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .tooth { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 5px; border: 1.5px solid #2563eb; background: #eff6ff; font-size: 10px; font-weight: 700; color: #2563eb; }
    .notes-box { background: #f8fafc; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #334155; line-height: 1.5; margin-top: 4px; border: 1px solid #e2e8f0; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      <div class="status-pill">${cfg.icon} ${cfg.label}</div>
      <h1>${order.order_number}</h1>
      <div class="meta-grid">
        <div class="meta-row"><span class="meta-label">Hasta</span><span class="meta-val">${order.patient_name ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Hekim</span><span class="meta-val">${order.doctor?.full_name ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Klinik</span><span class="meta-val">${(order.doctor as any)?.clinic?.name ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Oluşturulma</span><span class="meta-val">${createdDate}</span></div>
        <div class="meta-row"><span class="meta-label">Teslim</span><span class="meta-val">${deliveryDate}</span></div>
        <div class="meta-row"><span class="meta-label">İş Türü</span><span class="meta-val">${order.work_type ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Renk</span><span class="meta-val">${order.shade ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Makine</span><span class="meta-val">${order.machine_type === 'milling' ? 'Frezeleme' : '3D Baskı'}</span></div>
      </div>
    </div>
    <div class="qr-wrap">
      <img src="${qrImgUrl}" alt="QR Kod" />
      <div class="qr-label">Panelde görüntüle</div>
    </div>
  </div>

  ${order.notes ? `<h2>Notlar</h2><div class="notes-box">${order.notes}</div>` : ''}

  ${(order.tooth_numbers ?? []).length > 0 ? `
  <h2>Seçili Dişler</h2>
  <div class="teeth-wrap">${toothCells}</div>` : ''}

  ${((order as any).tooth_ops ?? []).length > 0 ? `
  <h2>Operasyonlar</h2>
  <table>
    <thead><tr><th>Diş</th><th>İşlem Türü</th><th>Renk</th><th>Not</th></tr></thead>
    <tbody>${opsRows}</tbody>
  </table>` : ''}

  ${historyRows ? `
  <h2>Durum Geçmişi</h2>
  <table>
    <thead><tr><th>Tarih</th><th>Durum</th><th>Not</th></tr></thead>
    <tbody>${historyRows}</tbody>
  </table>` : ''}

  <div class="footer">
    <span>dental-lab-steel.vercel.app</span>
    <span>${order.order_number} · Yazdırma tarihi: ${new Date().toLocaleDateString('tr-TR')}</span>
  </div>

  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

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
  const [showQR, setShowQR] = useState(false);

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

  const qrUrl = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/order/${order.id}`
    : `https://dental-lab-steel.vercel.app/order/${order.id}`;

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

        {/* Advance status button stays in the top bar */}
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

      {/* ── Info bar (with QR + Print buttons on the right) ── */}
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

        {/* QR + Print buttons — always visible, pinned to right of info bar */}
        <View style={styles.infoBarActions}>
          <TouchableOpacity onPress={() => setShowQR(true)} style={styles.btnQR}>
            <Text style={styles.btnQRText}>⬛ QR</Text>
          </TouchableOpacity>
          {Platform.OS === 'web' && (
            <TouchableOpacity onPress={() => handlePrint(order, qrUrl)} style={styles.btnPrint}>
              <Text style={styles.btnPrintText}>🖨 Yazdır</Text>
            </TouchableOpacity>
          )}
        </View>
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
            <DetailsSection order={order} qrUrl={qrUrl} />
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

      {/* ── QR Modal ── */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <Pressable style={qrs.backdrop} onPress={() => setShowQR(false)}>
          <Pressable style={qrs.card} onPress={() => {}}>
            <Text style={qrs.title}>İş Emri QR Kodu</Text>
            <Text style={qrs.subtitle}>{order.order_number}</Text>

            <View style={qrs.qrWrap}>
              <QRCode
                value={qrUrl}
                size={200}
                color="#0F172A"
                backgroundColor="#FFFFFF"
              />
            </View>

            <Text style={qrs.hint}>
              Tarayarak kendi panelinde açılır
            </Text>
            <Text style={qrs.roleHint}>
              🧑‍⚕️ Hekim · 🔬 Teknisyen · 🛡️ Admin · 👔 Müdür
            </Text>

            <Text style={qrs.url} numberOfLines={2}>{qrUrl}</Text>

            <TouchableOpacity style={qrs.closeBtn} onPress={() => setShowQR(false)}>
              <Text style={qrs.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const qrs = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28,
    alignItems: 'center', width: 300,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  title:    { fontSize: 16, fontWeight: '600', color: '#0F172A', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#64748B', marginBottom: 20 },
  qrWrap:   { padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  hint:     { fontSize: 12, color: '#475569', marginTop: 16, textAlign: 'center' },
  roleHint: { fontSize: 11, color: '#94A3B8', marginTop: 4, textAlign: 'center' },
  url:      { fontSize: 9, color: '#CBD5E1', marginTop: 10, textAlign: 'center' },
  closeBtn: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F5F9' },
  closeBtnText: { fontSize: 13, color: '#475569', fontWeight: '500' },
});

// ── Section components ──

function DetailsSection({ order, qrUrl }: { order: WorkOrder; qrUrl: string }) {
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

      {/* QR inline */}
      <View style={sectionStyles.qrCard}>
        <View style={sectionStyles.qrLeft}>
          <Text style={sectionStyles.qrTitle}>İş Emri QR Kodu</Text>
          <Text style={sectionStyles.qrSub}>Tarayarak kendi panelinde aç</Text>
          <Text style={sectionStyles.qrRoles}>🧑‍⚕️ Hekim · 🔬 Teknisyen · 🛡️ Admin</Text>
          <Text style={sectionStyles.qrUrl} numberOfLines={1}>{qrUrl}</Text>
        </View>
        <View style={sectionStyles.qrCodeWrap}>
          <QRCode value={qrUrl} size={90} color="#0F172A" backgroundColor="#FFFFFF" />
        </View>
      </View>
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
  /* QR inline card */
  qrCard: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 16,
  },
  qrLeft:  { flex: 1, gap: 3 },
  qrTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  qrSub:   { fontSize: 12, color: '#475569' },
  qrRoles: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  qrUrl:   { fontSize: 9, color: '#CBD5E1', marginTop: 4 },
  qrCodeWrap: {
    padding: 8, borderRadius: 10, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
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
  btnQR: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  btnQRText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  btnPrint: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#D1FAE5', backgroundColor: '#F0FDF4',
  },
  btnPrintText: { fontSize: 12, fontWeight: '500', color: '#065F46' },
  btnAdvance: {
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnAdvanceText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 16,
    flexWrap: 'wrap',
  },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoPillLabel: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
  infoPillValue: { fontSize: 12, fontWeight: '700', color: C.textPrimary },
  infoBarActions: {
    flexDirection: 'row', gap: 6, marginLeft: 'auto' as any,
  },

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
