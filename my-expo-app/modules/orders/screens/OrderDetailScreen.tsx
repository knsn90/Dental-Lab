import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { toast } from '../../../core/ui/Toast';
import QRCode from 'react-native-qrcode-svg';
import Feather from '@expo/vector-icons/Feather';
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
import { ToothNumberPicker } from '../components/ToothNumberPicker';
import { STATUS_CONFIG, isOrderOverdue, formatDeliveryDate, getNextStatus } from '../constants';
import { WorkOrder, WorkOrderStatus } from '../types';
import { fetchPatientOrders } from '../../provas/api';
import { C } from '../../../core/theme/colors';
import { useChatMessages } from '../hooks/useChatMessages';
import { uploadChatAttachment } from '../chatApi';
import { ToothIcon } from '../../../components/icons/ToothIcon';
import { StepTimeline } from '../../production/components/StepTimeline';
import { useCaseSteps } from '../../production/hooks/useCaseSteps';
import { printDeliveryReceipt } from '../../receipt/printReceipt';
import { createInvoiceFromOrder } from '../../invoices/api';

type Section = 'details' | 'steps' | 'prova' | 'vaka' | 'billing' | 'doctor' | 'files' | 'chat';

const SECTIONS: { key: Section; icon: string; label: string }[] = [
  { key: 'details', icon: 'clipboard',      label: 'Detaylar' },
  { key: 'steps',   icon: 'clock',          label: 'Adımlar'  },
  { key: 'prova',   icon: '__tooth__',       label: 'Prova'    },
  { key: 'vaka',    icon: 'folder',         label: 'Vaka'     },
  { key: 'billing', icon: 'tag',            label: 'Ücret'    },
  { key: 'doctor',  icon: 'user',           label: 'Hekim'    },
  { key: 'files',   icon: 'image',          label: 'Dosyalar' },
  { key: 'chat',    icon: 'message-square', label: 'Mesajlar' },
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
    if (error) toast.error('Durum güncellenemedi: ' + (error as any).message);
    else refetch();
  };

  const handlePrintReceipt = async () => {
    const res = await printDeliveryReceipt(order, profile?.lab_id);
    if (!res.ok && res.error) toast.error(res.error);
  };

  const handleCreateInvoice = async () => {
    const { data, error } = await createInvoiceFromOrder(order.id);
    if (error || !data) {
      toast.error((error as any)?.message ?? 'Fatura oluşturulamadı');
      return;
    }
    router.push(`/(lab)/invoice/${data.id}` as any);
  };

  const handleAddPhoto = async (toothNumber?: number | null) => {
    if (!profile) return;
    if (typeof window !== 'undefined') {
      const uri = await pickPhoto();
      if (!uri) return;
      setUploadingPhoto(true);
      const { error } = await uploadPhoto(uri, order.id, profile.id, toothNumber);
      setUploadingPhoto(false);
      if (error) toast.error(error);
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
          const { error } = await uploadPhoto(uri, order.id, profile.id, toothNumber);
          setUploadingPhoto(false);
          if (error) toast.error(error);
          else refetch();
        },
      },
      {
        text: 'Kamera',
        onPress: async () => {
          const uri = await takePhoto();
          if (!uri) return;
          setUploadingPhoto(true);
          const { error } = await uploadPhoto(uri, order.id, profile.id, toothNumber);
          setUploadingPhoto(false);
          if (error) toast.error(error);
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
          <Text style={styles.backText}>‹ Geri</Text>
        </TouchableOpacity>

        <View style={styles.topMeta}>
          <View style={[styles.stagePill, { backgroundColor: cfg.bgColor }]}>
            <View style={[styles.stageDot, { backgroundColor: cfg.color }]} />
            <Text style={[styles.stageLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.topOrderNum}>{order.order_number}</Text>
          {order.doctor && (
            <Text style={styles.topDoctor}>{order.doctor.full_name}</Text>
          )}
          {order.is_urgent && (
            <View style={styles.urgentTag}>
              <Text style={styles.urgentTagText}>ACİL</Text>
            </View>
          )}
          {overdue && (
            <View style={styles.overdueTag}>
              <Text style={styles.overdueTagText}>GECİKEN</Text>
            </View>
          )}
        </View>

        {nextStatus && (
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            style={styles.btnAdvance}
            activeOpacity={0.75}
          >
            <Text style={styles.btnAdvanceText}>
              {order.status === 'alindi' ? 'Başlat' : 'Tamamla'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Info bar ── */}
      <View style={styles.infoBar}>
        <InfoPill label="Durum" value={cfg.label} color={cfg.color} />
        <InfoPill label="Oluşturulma" value={createdDate} />
        <InfoPill
          label="Kalan Gün"
          value={
            order.status === 'teslim_edildi'
              ? 'Teslim Edildi'
              : daysLeft < 0
              ? `${Math.abs(daysLeft)}g geçti`
              : `${daysLeft} gün`
          }
          color={daysLeft < 0 && order.status !== 'teslim_edildi' ? '#EF4444' : undefined}
        />
        <InfoPill label="Teslim" value={formatDeliveryDate(order.delivery_date)} />
        <View style={styles.infoBarSpacer} />
        <TouchableOpacity onPress={() => setShowQR(true)} style={styles.btnQR}>
          <Text style={styles.btnQRText}>QR</Text>
        </TouchableOpacity>
        {Platform.OS === 'web' && (
          <TouchableOpacity
            onPress={() => router.push(`/order/occlusion/${order.id}` as any)}
            style={styles.btnOcclusion}
            activeOpacity={0.8}
          >
            <Feather name={'box' as any} size={14} color="#1E40AF" />
            <Text style={styles.btnOcclusionText}>Oklüzyon</Text>
          </TouchableOpacity>
        )}
        {Platform.OS === 'web' && (
          <TouchableOpacity onPress={() => handlePrint(order, qrUrl)} style={styles.btnPrint}>
            <Text style={styles.btnPrintText}>Yazdır</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handlePrintReceipt}
          style={styles.btnReceipt}
          activeOpacity={0.8}
        >
          <Feather name={'file-text' as any} size={14} color="#0F172A" />
          <Text style={styles.btnReceiptText}>Teslimat Fişi</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCreateInvoice}
          style={styles.btnInvoice}
          activeOpacity={0.8}
        >
          <Feather name={'file-text' as any} size={14} color="#FFFFFF" />
          <Text style={styles.btnInvoiceText}>Fatura Oluştur</Text>
        </TouchableOpacity>
      </View>

      {/* ── Body ── */}
      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>

        {/* Section navigation */}
        {isDesktop ? (
          <View style={styles.sectionSidebarDesktop}>
            {SECTIONS.map((s) => {
              const active = activeSection === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setActiveSection(s.key)}
                  style={[styles.sectionItemDesktop, active && styles.sectionItemDesktopActive]}
                  activeOpacity={0.75}
                >
                  {s.icon === '__tooth__' ? (
                    <ToothIcon size={18} color={active ? '#0F172A' : '#94A3B8'} />
                  ) : (
                    <Feather
                      name={s.icon as any}
                      size={18}
                      color={active ? '#0F172A' : '#94A3B8'}
                    />
                  )}
                  <Text style={[styles.sectionLabel, active && styles.sectionLabelActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.sectionTabsScroll}
            contentContainerStyle={styles.sectionTabsContent}
          >
            <View style={styles.sectionTabBar}>
              {SECTIONS.map((s) => {
                const active = activeSection === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => setActiveSection(s.key)}
                    style={[styles.sectionTab, active && styles.sectionTabActive]}
                    activeOpacity={0.75}
                  >
                    {s.icon === '__tooth__' ? (
                      <ToothIcon size={15} color={active ? '#0F172A' : '#94A3B8'} />
                    ) : (
                      <Feather
                        name={s.icon as any}
                        size={15}
                        color={active ? '#0F172A' : '#94A3B8'}
                      />
                    )}
                    <Text style={[styles.sectionTabLabel, active && styles.sectionTabLabelActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Content */}
        <ScrollView style={styles.contentArea} contentContainerStyle={styles.contentPad}>
          {activeSection === 'details' && (
            <DetailsSection order={order} qrUrl={qrUrl} onAddFile={handleAddPhoto} />
          )}
          {activeSection === 'steps' && (
            <StepsSection workOrderId={order.id} history={order.status_history ?? []} />
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
          {activeSection === 'chat' && (
            <ChatSection workOrderId={order.id} orderNotes={order.notes} />
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
  qrWrap:   { padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9' },
  hint:     { fontSize: 12, color: '#475569', marginTop: 16, textAlign: 'center' },
  roleHint: { fontSize: 11, color: '#94A3B8', marginTop: 4, textAlign: 'center' },
  url:      { fontSize: 9, color: '#CBD5E1', marginTop: 10, textAlign: 'center' },
  closeBtn: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9' },
  closeBtnText: { fontSize: 13, color: '#0F172A', fontWeight: '600' },
});

// ── Section components ──

// ── Tooth job card ────────────────────────────────────────────────────────────
function ToothJobCard({ tooth, order, isActive, onPress, onAddFile }: {
  tooth: number;
  order: WorkOrder;
  isActive?: boolean;
  onPress?: () => void;
  onAddFile?: () => void;
}) {
  const chips        = (order.work_type ?? '').trim().split(/\s+/).filter(Boolean);
  const machine      = order.machine_type === 'milling' ? 'Frezeleme' : '3D Baskı';
  // Count only files that belong to THIS tooth
  const photosCount  = (order.photos ?? []).filter(p => p.tooth_number === tooth).length;
  const hasNotes     = Boolean(order.notes);
  const hasLabNotes  = order.lab_notes_visible && Boolean(order.lab_notes);
  const notesCount   = (hasNotes ? 1 : 0) + (hasLabNotes ? 1 : 0);

  return (
    <TouchableOpacity
      style={[tcStyles.card, isActive && tcStyles.cardActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Header — tooth icon + number */}
      <View style={tcStyles.header}>
        <ToothIcon size={15} color={isActive ? '#0F172A' : '#0F172A'} />
        <Text style={[tcStyles.toothNum, isActive && tcStyles.toothNumActive]}>{tooth}</Text>
        {isActive && (
          <View style={tcStyles.activePill}>
            <Text style={tcStyles.activePillText}>Aktif</Text>
          </View>
        )}
      </View>

      {/* Work-type chips */}
      <View style={tcStyles.chips}>
        {chips.map((chip, i) => (
          <View key={i} style={tcStyles.chip}>
            <Text style={tcStyles.chipText}>{chip}</Text>
          </View>
        ))}
      </View>

      {/* Meta: shade + machine */}
      <View style={tcStyles.metaRow}>
        {order.shade ? (
          <View style={tcStyles.metaItem}>
            <Text style={tcStyles.metaLabel}>Shade</Text>
            <Text style={tcStyles.metaValue}>{order.shade}</Text>
          </View>
        ) : null}
        <View style={tcStyles.metaItem}>
          <Text style={tcStyles.metaLabel}>Makine</Text>
          <Text style={tcStyles.metaValue}>{machine}</Text>
        </View>
      </View>

      {/* Footer badges + add-file button */}
      <View style={tcStyles.footer}>
        {/* Files badge */}
        <TouchableOpacity
          style={[tcStyles.badge, tcStyles.badgeFile, photosCount > 0 && tcStyles.badgeFileActive]}
          onPress={onAddFile}
          activeOpacity={0.7}
        >
          <Feather name={'paperclip' as any} size={11} color={photosCount > 0 ? '#0F172A' : '#94A3B8'} />
          <Text style={[tcStyles.badgeText, photosCount > 0 && tcStyles.badgeTextActive]}>
            {photosCount > 0 ? `${photosCount} dosya` : 'Dosya ekle'}
          </Text>
        </TouchableOpacity>

        {/* Notes badge */}
        {notesCount > 0 && (
          <View style={tcStyles.badge}>
            <Feather name={'message-square' as any} size={11} color="#64748B" />
            <Text style={tcStyles.badgeText}>Notlar ({notesCount})</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const tcStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  cardActive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#0F172A',
    borderWidth: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toothNum: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  toothNumActive: { color: '#0F172A' },
  activePill: {
    marginLeft: 'auto' as any,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  activePillText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chipText: { fontSize: 11, fontWeight: '600', color: '#0F172A' },
  metaRow:  { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  metaValue: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 7,
    flexWrap: 'wrap',
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeFile: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  badgeFileActive: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
  },
  badgeText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  badgeTextActive: { color: '#0F172A', fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────────────────────

function DetailsSection({ order, qrUrl, onAddFile }: {
  order: WorkOrder;
  qrUrl: string;
  onAddFile?: (tooth: number) => void;
}) {
  const [toothColW, setToothColW]     = useState(0);
  const sorted = React.useMemo(
    () => [...(order.tooth_numbers ?? [])].sort((a, b) => a - b),
    [order.tooth_numbers],
  );
  const [activeTooth, setActiveTooth] = useState<number | null>(sorted[0] ?? null);

  // Tooltip text per tooth for diagram hover
  const machine = order.machine_type === 'milling' ? 'Frezeleme' : '3D Baskı';
  const toothInfo = React.useMemo(() => {
    const info: Record<number, string> = {};
    sorted.forEach(t => {
      const parts = [order.work_type, order.shade, machine].filter(Boolean);
      info[t] = parts.join(' · ');
    });
    return info;
  }, [sorted, order.work_type, order.shade, machine]);

  return (
    <View>
      {/* ── Side-by-side row: Diş Kartları  |  Diş Haritası ── */}
      <View style={detailRowStyles.row}>

        {/* Left column — per-tooth job cards */}
        <View style={detailRowStyles.col}>
          {sorted.length > 0 ? (
            <>
              {sorted.map(tooth => (
                <ToothJobCard
                  key={tooth}
                  tooth={tooth}
                  order={order}
                  isActive={tooth === activeTooth}
                  onPress={() => setActiveTooth(tooth)}
                  onAddFile={onAddFile ? () => onAddFile(tooth) : undefined}
                />
              ))}
            </>
          ) : (
            <View style={tcStyles.card}>
              <Text style={{ fontSize: 13, color: '#94A3B8' }}>Diş seçilmemiş</Text>
            </View>
          )}
        </View>

        {/* Right column — interactive tooth map */}
        <View
          style={detailRowStyles.col}
          onLayout={e => setToothColW(e.nativeEvent.layout.width)}
        >
          <Text style={sectionStyles.heading}>Diş Numaraları</Text>
          {sorted.length > 0 ? (
            <View style={toothDiagramStyles.card}>
              <ToothNumberPicker
                selected={order.tooth_numbers ?? []}
                onChange={() => {/* selection is fixed in detail view */}}
                containerWidth={toothColW || undefined}
                activeTooth={activeTooth}
                onToothPress={fdi => {
                  if ((order.tooth_numbers ?? []).includes(fdi)) {
                    setActiveTooth(fdi);
                  }
                }}
                toothInfo={toothInfo}
              />
            </View>
          ) : (
            <Text style={toothDiagramStyles.empty}>Diş seçilmemiş</Text>
          )}
        </View>

      </View>

      {/* QR — full width below */}
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

function StepsSection({ workOrderId, history }: { workOrderId: string; history: any[] }) {
  const { steps, loading, refetch } = useCaseSteps(workOrderId);

  return (
    <View style={{ gap: 20 }}>
      {/* MES Production Steps */}
      <View>
        <Text style={sectionStyles.heading}>Üretim Adımları</Text>
        {steps.length === 0 && !loading ? (
          <View style={prodEmptyWrap}>
            <Text style={prodEmptyText}>
              Bu iş emri için üretim adımı bulunamadı.{'\n'}
              İş emri oluşturulurken ölçüm tipi seçilmemişse adımlar oluşturulmamış olabilir.
            </Text>
          </View>
        ) : (
          <StepTimeline steps={steps} loading={loading} onRefresh={refetch} />
        )}
      </View>

      {/* Status History */}
      {history.length > 0 && (
        <View>
          <Text style={sectionStyles.heading}>Durum Geçmişi</Text>
          <StatusTimeline history={history} />
        </View>
      )}
    </View>
  );
}

const prodEmptyWrap: import('react-native').ViewStyle = {
  backgroundColor: '#F8FAFC',
  borderRadius: 12,
  padding: 16,
  borderWidth: 1,
  borderColor: '#F1F5F9',
};
const prodEmptyText: import('react-native').TextStyle = {
  fontSize: 13,
  color: '#94A3B8',
  textAlign: 'center',
  lineHeight: 20,
};

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
  onAdd: (tooth?: number | null) => void;
}) {
  const photos = order.photos ?? [];

  // Group by tooth_number; null → general
  const grouped = React.useMemo(() => {
    const map: Record<string, typeof photos> = {};
    photos.forEach(p => {
      const key = p.tooth_number != null ? String(p.tooth_number) : '__general__';
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    // Sort keys: teeth numerically first, then general
    const keys = Object.keys(map).sort((a, b) => {
      if (a === '__general__') return 1;
      if (b === '__general__') return -1;
      return parseInt(a) - parseInt(b);
    });
    return keys.map(k => ({ key: k, photos: map[k] }));
  }, [photos]);

  const sortedTeeth = (order.tooth_numbers ?? []).slice().sort((a, b) => a - b);

  return (
    <View>
      {/* Header */}
      <View style={sectionStyles.filesHeader}>
        <Text style={sectionStyles.heading}>Dosyalar ({photos.length})</Text>
        <TouchableOpacity onPress={() => onAdd(null)} style={sectionStyles.addBtn} disabled={uploading}>
          <Text style={sectionStyles.addBtnText}>{uploading ? 'Yükleniyor...' : '+ Genel'}</Text>
        </TouchableOpacity>
      </View>

      {/* Per-tooth quick upload row */}
      {sortedTeeth.length > 0 && (
        <View style={fStyles.toothUploadRow}>
          <Text style={fStyles.toothUploadLabel}>Diş bazlı ekle:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {sortedTeeth.map(t => (
              <TouchableOpacity
                key={t}
                style={fStyles.toothUploadBtn}
                onPress={() => onAdd(t)}
                disabled={uploading}
                activeOpacity={0.75}
              >
                <ToothIcon size={12} color="#0F172A" />
                <Text style={fStyles.toothUploadNum}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Empty state */}
      {photos.length === 0 ? (
        <View style={sectionStyles.noFiles}>
          <Text style={sectionStyles.noFilesText}>📁 Henüz dosya yok</Text>
          <Text style={sectionStyles.noFilesSubText}>Dosya eklemek için + Genel veya diş numarasına basın</Text>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {grouped.map(group => (
            <View key={group.key}>
              {/* Group header */}
              <View style={fStyles.groupHeader}>
                {group.key === '__general__' ? (
                  <Text style={fStyles.groupTitle}>📁 Genel Dosyalar</Text>
                ) : (
                  <View style={fStyles.groupTitleRow}>
                    <ToothIcon size={14} color="#0F172A" />
                    <Text style={fStyles.groupTitle}>Diş {group.key}</Text>
                  </View>
                )}
                <Text style={fStyles.groupCount}>{group.photos.length} dosya</Text>
              </View>

              {/* Thumbnails */}
              <View style={sectionStyles.photoGrid}>
                {group.photos.map((photo) => {
                  const url = signedUrls[photo.storage_path];
                  return url ? (
                    <TouchableOpacity
                      key={photo.id}
                      onPress={() => { if (typeof window !== 'undefined') window.open(url, '_blank'); }}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: url }} style={sectionStyles.photo} />
                    </TouchableOpacity>
                  ) : null;
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// FilesSection internal styles
const fStyles = StyleSheet.create({
  toothUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  toothUploadLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  toothUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
  },
  toothUploadNum: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  groupCount: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
});

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

// ── Audio Player ─────────────────────────────────────────────────────────────
function AudioPlayer({ url, isMe }: { url: string; isMe: boolean }) {
  const [playing, setPlaying]       = React.useState(false);
  const [duration, setDuration]     = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const audioRef = React.useRef<any>(null);

  // Pseudo-random waveform heights seeded from url so they're stable
  const bars = React.useMemo(() => {
    let h = 0;
    for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) & 0xffff;
    return Array.from({ length: 30 }, () => {
      h = (h * 1664525 + 1013904223) & 0xffff;
      return 4 + (h % 20); // 4–23 px
    });
  }, [url]);

  const progress = duration > 0 ? currentTime / duration : 0;

  function fmtT(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true);  }
  };

  const playBg   = isMe ? 'rgba(255,255,255,0.2)' : '#0F172A';
  const barDone  = isMe ? '#FFFFFF'               : '#0F172A';
  const barRest  = isMe ? 'rgba(255,255,255,0.35)' : '#CBD5E1';
  const timeCol  = isMe ? 'rgba(255,255,255,0.75)' : '#64748B';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center',
                   gap: 9, paddingTop: 2, paddingBottom: 2 }}>
      {/* @ts-ignore */}
      <audio ref={audioRef} src={url}
        onLoadedMetadata={(e: any) => setDuration(e.target.duration)}
        onTimeUpdate={(e: any) => setCurrentTime(e.target.currentTime)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); audioRef.current && (audioRef.current.currentTime = 0); }}
        style={{ display: 'none' }}
      />

      {/* Play / Pause */}
      <TouchableOpacity onPress={toggle}
        style={{ width: 34, height: 34, borderRadius: 17,
                 backgroundColor: playBg,
                 alignItems: 'center', justifyContent: 'center' }}>
        <Feather
          name={(playing ? 'pause' : 'play') as any}
          size={18}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Waveform bars */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 }}>
        {bars.map((h, i) => (
          <View key={i} style={{
            width: 3, height: h, borderRadius: 2,
            backgroundColor: (i / bars.length) < progress ? barDone : barRest,
          }} />
        ))}
      </View>

      {/* Time */}
      <Text style={{ fontSize: 11, fontWeight: '600', color: timeCol, minWidth: 34, textAlign: 'right' }}>
        {duration > 0 ? fmtT(playing ? currentTime : duration) : '--:--'}
      </Text>
    </View>
  );
}

// ── Chat Section ─────────────────────────────────────────────────────────────

function ChatSection({
  workOrderId,
  embedded,
  orderNotes,
}: {
  workOrderId: string;
  embedded?: boolean;
  orderNotes?: string | null;
}) {
  const { profile } = useAuthStore();
  const { messages, loading, sending, send, sendWithAttachment } = useChatMessages(workOrderId);
  const [text, setText]               = useState('');
  const [uploading, setUploading]     = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds]   = useState(0);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [pendingFile, setPendingFile]       = useState<File | null>(null);
  const [pendingCaption, setPendingCaption] = useState('');
  const scrollRef     = React.useRef<ScrollView>(null);
  const imageInputRef = React.useRef<any>(null);
  const scanInputRef  = React.useRef<any>(null);
  const docInputRef   = React.useRef<any>(null);
  const recorderRef   = React.useRef<any>(null);
  const chunksRef     = React.useRef<Blob[]>([]);
  const recTimerRef   = React.useRef<any>(null);

  const scrollToEnd = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);

  const handleSend = async () => {
    if (!profile || !text.trim()) return;
    const content = text.trim();
    setText('');
    const err = await send(profile.id, content);
    if (err) {
      setText(content); // restore text on failure
      toast.error(
        err.includes('does not exist')
          ? 'Mesaj tablosu henüz oluşturulmamış. Lütfen Supabase SQL Editor\'da 011_order_messages.sql ve 011b_order_messages_attachments.sql migration\'larını çalıştırın.'
          : err
      );
    } else {
      scrollToEnd();
    }
  };

  /* ── File picker ─────────────────────────────────────────────────────── */
  const handleFileChange = (e: any) => {
    const file: File = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be picked again
    setAttachMenuOpen(false);
    setPendingFile(file);
    setPendingCaption('');
  };

  const handleSendPending = async () => {
    if (!pendingFile || !profile) return;
    let type: 'image' | 'audio' | 'file' = 'file';
    if (pendingFile.type.startsWith('image/')) type = 'image';
    else if (pendingFile.type.startsWith('audio/')) type = 'audio';

    setUploading(true);
    const { url, error } = await uploadChatAttachment(pendingFile, workOrderId, pendingFile.name);
    setUploading(false);

    if (error || !url) { toast.error(error ?? 'Yükleme başarısız'); return; }
    const err = await sendWithAttachment(profile.id, pendingCaption.trim(), { url, type, name: pendingFile.name, size: pendingFile.size });
    if (err) { toast.error(err); return; }
    setPendingFile(null);
    setPendingCaption('');
    scrollToEnd();
  };

  /* ── Voice recorder ──────────────────────────────────────────────────── */
  const startRecording = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!profile) return;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext  = mimeType.includes('webm') ? 'webm' : 'ogg';
        setUploading(true);
        const { url, error } = await uploadChatAttachment(blob, workOrderId, `voice_${Date.now()}.${ext}`);
        setUploading(false);
        if (error || !url) { toast.error(error ?? 'Ses yüklenemedi'); return; }
        const err = await sendWithAttachment(profile.id, '', { url, type: 'audio', name: 'Sesli Mesaj', size: blob.size });
        if (err) { toast.error(err); return; }
        scrollToEnd();
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      toast.error('Mikrofon erişimi reddedildi');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    clearInterval(recTimerRef.current);
    setIsRecording(false);
    setRecSeconds(0);
  };

  const cancelRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    clearInterval(recTimerRef.current);
    setIsRecording(false);
    setRecSeconds(0);
  };

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const fmtSec = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const fmtSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /* ── Render ───────────────────────────────────────────────────────────── */
  const hasContent = messages.length > 0 || !!orderNotes;

  return (
    <View style={[cs.container, embedded && cs.containerEmbedded]}>

      {/* Message list */}
      <ScrollView
        ref={scrollRef}
        style={cs.list}
        contentContainerStyle={cs.listContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <View style={cs.emptyBox}>
            <Text style={cs.emptyText}>Yükleniyor...</Text>
          </View>
        ) : !hasContent ? (
          <View style={cs.emptyBox}>
            <Feather name={'message-square' as any} size={32} color="#CBD5E1" />
            <Text style={cs.emptyTitle}>Henüz mesaj yok</Text>
            <Text style={cs.emptyText}>Hekim veya lab mesaj gönderdiğinde burada görünür</Text>
          </View>
        ) : (
          <>
          {/* Order note — shown as the first "message" from the doctor */}
          {orderNotes ? (
            <View style={cs.msgRow}>
              <View style={[cs.avatar, cs.avatarDoctor]}>
                <Feather name={'user' as any} size={14} color="#FFFFFF" />
              </View>
              <View style={[cs.bubble, cs.bubbleThem, cs.bubbleNote]}>
                <Text style={cs.noteLabel}>İş Emri Notu · Hekim</Text>
                <Text style={cs.msgText}>{orderNotes}</Text>
              </View>
            </View>
          ) : null}
          {messages.map((msg) => {
            const isMe       = msg.sender_id === profile?.id;
            const senderName = msg.sender?.full_name ?? 'Bilinmiyor';
            const senderType = msg.sender?.user_type ?? '';
            const roleLabel  = senderType === 'doctor' ? 'Hekim'
                             : senderType === 'lab'    ? 'Lab'
                             : senderType === 'admin'  ? 'Admin' : senderType;
            return (
              <View key={msg.id} style={[cs.msgRow, isMe && cs.msgRowMe]}>
                {!isMe && (
                  <View style={cs.avatar}>
                    <Text style={cs.avatarText}>{senderName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={[cs.bubble, isMe ? cs.bubbleMe : cs.bubbleThem]}>
                  {!isMe && (
                    <Text style={cs.senderName}>{senderName} · {roleLabel}</Text>
                  )}

                  {/* Image attachment */}
                  {msg.attachment_type === 'image' && msg.attachment_url ? (
                    <TouchableOpacity
                      onPress={() => { if (typeof window !== 'undefined') window.open(msg.attachment_url!, '_blank'); }}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: msg.attachment_url }} style={cs.attachImage} resizeMode="cover" />
                    </TouchableOpacity>
                  ) : null}

                  {/* Audio attachment */}
                  {msg.attachment_type === 'audio' && msg.attachment_url ? (
                    <AudioPlayer url={msg.attachment_url} isMe={isMe} />
                  ) : null}

                  {/* File attachment */}
                  {msg.attachment_type === 'file' && msg.attachment_url ? (
                    <TouchableOpacity
                      style={[cs.fileChip, isMe && cs.fileChipMe]}
                      onPress={() => { if (typeof window !== 'undefined') window.open(msg.attachment_url!, '_blank'); }}
                      activeOpacity={0.8}
                    >
                      <Feather name={'file-text' as any} size={20} color={isMe ? '#FFF' : '#0F172A'} />
                      <View style={{ flex: 1 }}>
                        <Text style={[cs.fileChipName, isMe && { color: '#FFF' }]} numberOfLines={1}>
                          {msg.attachment_name ?? 'Dosya'}
                        </Text>
                        {msg.attachment_size ? (
                          <Text style={[cs.fileChipSize, isMe && { color: 'rgba(255,255,255,0.6)' }]}>
                            {fmtSize(msg.attachment_size)}
                          </Text>
                        ) : null}
                      </View>
                      <Feather name={'download' as any} size={16} color={isMe ? 'rgba(255,255,255,0.7)' : '#94A3B8'} />
                    </TouchableOpacity>
                  ) : null}

                  {/* Text */}
                  {msg.content ? (
                    <Text style={[cs.msgText, isMe && cs.msgTextMe]}>{msg.content}</Text>
                  ) : null}

                  <Text style={[cs.msgTime, isMe && cs.msgTimeMe]}>{fmtTime(msg.created_at)}</Text>
                </View>
              </View>
            );
          })}
          </>
        )}
      </ScrollView>

      {/* Hidden file inputs (web only) */}
      {Platform.OS === 'web' ? (
        <>
          {/* @ts-ignore */}
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          {/* @ts-ignore */}
          <input ref={scanInputRef}  type="file" accept=".stl,.ply,.obj,.step,.stp,.dcm" style={{ display: 'none' }} onChange={handleFileChange} />
          {/* @ts-ignore */}
          <input ref={docInputRef}   type="file" style={{ display: 'none' }} onChange={handleFileChange} />
        </>
      ) : null}

      {/* File preview modal */}
      {pendingFile ? (
        <Modal transparent animationType="fade" onRequestClose={() => setPendingFile(null)}>
          <Pressable style={cs.previewOverlay} onPress={() => setPendingFile(null)}>
            <Pressable style={cs.previewCard} onPress={e => e.stopPropagation()}>
              {/* Header */}
              <View style={cs.previewHeader}>
                <Text style={cs.previewTitle}>Dosya Gönder</Text>
                <TouchableOpacity onPress={() => setPendingFile(null)}>
                  <Feather name={'x' as any} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* File preview area */}
              {pendingFile.type.startsWith('image/') ? (
                // @ts-ignore
                <Image
                  source={{ uri: URL.createObjectURL(pendingFile) }}
                  style={cs.previewImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={cs.previewFileIcon}>
                  <Feather
                    name={
                      pendingFile.name.match(/\.(stl|ply|obj|step|stp)$/i)
                        ? ('box' as any)
                        : ('file-text' as any)
                    }
                    size={48}
                    color="#0F172A"
                  />
                  <Text style={cs.previewFileName} numberOfLines={2}>{pendingFile.name}</Text>
                  <Text style={cs.previewFileSize}>{fmtSize(pendingFile.size)}</Text>
                </View>
              )}

              {/* Caption input */}
              <View style={cs.previewCaptionRow}>
                <TextInput
                  style={cs.previewCaption}
                  placeholder="Başlık ekle (isteğe bağlı)..."
                  placeholderTextColor="#94A3B8"
                  value={pendingCaption}
                  onChangeText={setPendingCaption}
                />
              </View>

              {/* Actions */}
              <View style={cs.previewActions}>
                <TouchableOpacity style={cs.previewCancelBtn} onPress={() => setPendingFile(null)}>
                  <Text style={cs.previewCancelText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cs.previewSendBtn, uploading && cs.sendBtnDisabled]}
                  onPress={handleSendPending}
                  disabled={uploading}
                >
                  <Feather name={uploading ? ('loader' as any) : ('send' as any)} size={16} color="#FFFFFF" />
                  <Text style={cs.previewSendText}>{uploading ? 'Gönderiliyor...' : 'Gönder'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* Recording bar */}
      {isRecording ? (
        <View style={cs.recordBar}>
          <View style={cs.recDot} />
          <Text style={cs.recTime}>{fmtSec(recSeconds)}</Text>
          <Text style={cs.recLabel}>Kayıt yapılıyor</Text>
          <TouchableOpacity style={cs.recCancelBtn} onPress={cancelRecording}>
            <Feather name={'x' as any} size={18} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity style={cs.recSendBtn} onPress={stopRecording} disabled={uploading}>
            <Feather name={'send' as any} size={16} color="#FFFFFF" />
            <Text style={cs.recSendText}>Gönder</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Input bar */
        <View style={cs.inputBar}>
          {/* Attach menu — web only */}
          {Platform.OS === 'web' ? (
            <View style={{ position: 'relative' }}>
              {/* WhatsApp-style vertical menu — stacks upward above button */}
              {attachMenuOpen && (
                <>
                  {/* Full backdrop to catch outside clicks */}
                  <Pressable style={cs.attachBackdrop} onPress={() => setAttachMenuOpen(false)} />
                  {/* Menu items */}
                  <View style={cs.attachMenu}>
                    {/* Fotoğraf — top */}
                    <TouchableOpacity
                      style={cs.attachItem}
                      onPress={() => { setAttachMenuOpen(false); imageInputRef.current?.click(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={cs.attachItemLabel}>Fotoğraf</Text>
                      <View style={[cs.attachIconCircle, { backgroundColor: '#0F172A' }]}>
                        <Feather name={'image' as any} size={22} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>

                    {/* Dijital Tarama — middle */}
                    <TouchableOpacity
                      style={cs.attachItem}
                      onPress={() => { setAttachMenuOpen(false); scanInputRef.current?.click(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={cs.attachItemLabel}>Dijital Tarama</Text>
                      <View style={[cs.attachIconCircle, { backgroundColor: '#0891B2' }]}>
                        <Feather name={'box' as any} size={22} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>

                    {/* Dosya — bottom (closest to button) */}
                    <TouchableOpacity
                      style={cs.attachItem}
                      onPress={() => { setAttachMenuOpen(false); docInputRef.current?.click(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={cs.attachItemLabel}>Dosya</Text>
                      <View style={[cs.attachIconCircle, { backgroundColor: '#7C3AED' }]}>
                        <Feather name={'file-text' as any} size={22} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Paperclip / close toggle button */}
              <TouchableOpacity
                style={[cs.toolBtn, attachMenuOpen && cs.toolBtnActive]}
                onPress={() => setAttachMenuOpen(v => !v)}
                disabled={uploading || sending}
                activeOpacity={0.7}
              >
                <Feather
                  name={attachMenuOpen ? ('x' as any) : ('paperclip' as any)}
                  size={20}
                  color={attachMenuOpen ? '#0F172A' : uploading ? '#CBD5E1' : '#64748B'}
                />
              </TouchableOpacity>
            </View>
          ) : null}

          <TextInput
            style={cs.input}
            placeholder="Mesaj yaz..."
            placeholderTextColor="#94A3B8"
            value={text}
            onChangeText={setText}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          {/* Mic button — web only, show when no text */}
          {Platform.OS === 'web' && !text.trim() ? (
            <TouchableOpacity
              style={cs.toolBtn}
              onPress={startRecording}
              disabled={uploading || sending}
              activeOpacity={0.7}
            >
              <Feather name={'mic' as any} size={20} color="#64748B" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[cs.sendBtn, (!text.trim() || sending || uploading) && cs.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending || uploading}
            activeOpacity={0.75}
          >
            <Feather
              name={uploading ? 'loader' : 'send'}
              size={18}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    minHeight: 520,
  },
  containerEmbedded: {
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 0,
    flex: 1,
  },

  list: { flex: 1 },
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  emptyText:  { fontSize: 13, color: '#94A3B8', textAlign: 'center', maxWidth: 240 },

  // Message rows
  msgRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  msgRowMe: { flexDirection: 'row-reverse' },

  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText:   { fontSize: 12, fontWeight: '700', color: '#64748B' },
  avatarDoctor: { backgroundColor: '#6366F1' },

  bubble: {
    maxWidth: '72%',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 4,
  },
  bubbleThem: { backgroundColor: '#F1F5F9', borderBottomLeftRadius: 4  },
  bubbleMe:   { backgroundColor: '#0F172A', borderBottomRightRadius: 4 },
  bubbleNote: { backgroundColor: '#EEF2FF', borderLeftWidth: 3, borderLeftColor: '#6366F1', maxWidth: '85%' },

  noteLabel:   { fontSize: 10, fontWeight: '700', color: '#6366F1', marginBottom: 2, letterSpacing: 0.2 },
  senderName:  { fontSize: 10, fontWeight: '600', color: '#64748B', marginBottom: 1 },
  msgText:     { fontSize: 14, color: '#0F172A', lineHeight: 20 },
  msgTextMe:   { color: '#FFFFFF' },
  msgTime:     { fontSize: 10, color: '#94A3B8', alignSelf: 'flex-end' },
  msgTimeMe:   { color: 'rgba(255,255,255,0.45)' },

  // Attachment — image
  attachImage: {
    width: 200, height: 150, borderRadius: 10, marginTop: 2,
  },

  // Attachment — file chip
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
  },
  fileChipMe: { backgroundColor: 'rgba(255,255,255,0.15)' },
  fileChipName: { fontSize: 12, fontWeight: '600', color: '#0F172A', flex: 1 },
  fileChipSize: { fontSize: 10, color: '#64748B', marginTop: 1 },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  toolBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    height: 38,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 14,
    color: '#0F172A',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },

  // Recording bar
  recordBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  recDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recTime: { fontSize: 14, fontWeight: '700', color: '#EF4444', minWidth: 40 },
  recLabel:{ fontSize: 12, color: '#64748B', flex: 1 },
  recCancelBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  recSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  recSendText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  // Attach menu — WhatsApp vertical style
  toolBtnActive: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  // Full-area invisible backdrop to close menu on outside click
  attachBackdrop: {
    position: 'absolute',
    // @ts-ignore
    top: -2000,
    left: -2000,
    right: -2000,
    bottom: -2000,
    zIndex: 98,
  },
  // Vertical list — floats above the button, aligned to left edge
  attachMenu: {
    position: 'absolute',
    bottom: 46,
    left: 0,
    flexDirection: 'column',
    gap: 6,
    // @ts-ignore
    zIndex: 99,
  },
  // Each row: [label pill] [icon circle]
  attachItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  // Label pill to the left of the circle
  attachItemLabel: {
    backgroundColor: '#1E293B',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
    // @ts-ignore
    userSelect: 'none',
  },
  // Colored circle icon
  attachIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    // @ts-ignore
    boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
  },

  // File preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  previewTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  previewImage: {
    width: '100%',
    height: 240,
    backgroundColor: '#F8FAFC',
  },
  previewFileIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
    backgroundColor: '#F8FAFC',
  },
  previewFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    maxWidth: 280,
  },
  previewFileSize: { fontSize: 12, color: '#94A3B8' },
  previewCaptionRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  previewCaption: {
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    // @ts-ignore
    outlineStyle: 'none',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    justifyContent: 'flex-end',
  },
  previewCancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  previewCancelText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  previewSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0F172A',
  },
  previewSendText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

// ─────────────────────────────────────────────────────────────────────────────

function InfoPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.infoPill}>
      <Text style={styles.infoPillLabel}>{label}</Text>
      <Text style={[styles.infoPillValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const toothDiagramStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  empty: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
    fontStyle: 'italic',
  },
});

const detailRowStyles = StyleSheet.create({
  // Horizontal flex row — wraps to vertical on narrow screens
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'flex-start',
  },
  // Each column takes equal space; minimum 220 so it wraps on phones
  col: {
    flex: 1,
    minWidth: 220,
  },
});

const sectionStyles = StyleSheet.create({
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
  table: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    marginBottom: 16,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FFFFFF',
  },
  tableLabel: { width: 110, fontSize: 13, color: '#94A3B8', fontWeight: '500' },
  tableValue: { flex: 1, fontSize: 13, color: '#0F172A', fontWeight: '500' },
  filesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.1 },
  noFiles: { alignItems: 'center', paddingVertical: 40, gap: 8, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  noFilesText: { fontSize: 15, color: '#94A3B8' },
  noFilesSubText: { fontSize: 13, color: '#CBD5E1', textAlign: 'center', maxWidth: 260 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: 120, height: 120, borderRadius: 12 },
  qrCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 14,
    gap: 16,
    marginBottom: 16,
  },
  qrLeft:  { flex: 1, gap: 3 },
  qrTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  qrSub:   { fontSize: 12, color: '#475569' },
  qrRoles: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  qrUrl:   { fontSize: 9, color: '#CBD5E1', marginTop: 4 },
  qrCodeWrap: {
    padding: 8, borderRadius: 10, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  // ── Top bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  topBarOverdue: { backgroundColor: '#FEF2F2' },

  backBtn: { paddingRight: 4 },
  backText: { fontSize: 16, color: '#0F172A', fontWeight: '600', letterSpacing: -0.2 },

  topMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  stageDot: { width: 6, height: 6, borderRadius: 3 },
  stageLabel: { fontSize: 11, fontWeight: '700' },
  topOrderNum: { fontSize: 14, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  topDoctor: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  urgentTag: {
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  urgentTagText: { fontSize: 10, fontWeight: '700', color: '#EF4444', letterSpacing: 0.3 },
  overdueTag: {
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  overdueTagText: { fontSize: 10, fontWeight: '700', color: '#EF4444', letterSpacing: 0.3 },

  btnAdvance: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  btnAdvanceText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.1 },

  // ── Info bar ──
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 0,
    flexWrap: 'wrap',
  },
  infoPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
    gap: 1,
  },
  infoPillLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoPillValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  infoBarSpacer: { flex: 1 },
  btnQR: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    marginLeft: 4,
  },
  btnQRText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  btnPrint: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
    marginLeft: 6,
  },
  btnPrintText: { fontSize: 12, fontWeight: '600', color: '#065F46' },
  btnReceipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginLeft: 6,
  },
  btnReceiptText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  btnInvoice: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#2563EB',
    marginLeft: 6,
  },
  btnInvoiceText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  btnOcclusion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
    marginLeft: 6,
  },
  btnOcclusionText: { fontSize: 12, fontWeight: '600', color: '#1E40AF' },

  // ── Body ──
  body: { flex: 1, flexDirection: 'column' },
  bodyDesktop: { flexDirection: 'row' },

  // ── Section navigation — mobile pill tabs ──
  sectionTabsScroll: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexGrow: 0,
  },
  sectionTabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  sectionTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  sectionTabActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(15,23,42,0.12)',
  },
  sectionTabLabel: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  sectionTabLabelActive: { fontSize: 12, fontWeight: '700', color: '#0F172A' },

  // ── Section navigation — desktop sidebar ──
  sectionSidebarDesktop: {
    width: 130,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  sectionItemDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 2,
  },
  sectionItemDesktopActive: {
    backgroundColor: '#F1F5F9',
  },
  sectionLabel: { flex: 1, fontSize: 13, color: '#64748B', fontWeight: '500' },
  sectionLabelActive: { color: '#0F172A', fontWeight: '700' },

  // ── Content ──
  contentArea: { flex: 1, backgroundColor: '#FFFFFF' },
  contentPad: { padding: 16, paddingBottom: 40 },

  // ── Desktop chat panel ──
  chatPanel: {
    width: 280,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
    flexDirection: 'column',
  },
  chatPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  chatPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.1,
  },
});
