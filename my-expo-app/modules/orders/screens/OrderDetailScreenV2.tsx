import { localeTag, isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
/**
 * OrderDetailScreenV2 — Patterns dili (NativeWind), gerçek WorkOrder verisi
 *
 *   Mockup (OrderDetailMockup.tsx) tabanlı, useOrderDetail ile canlı veri.
 *   Multi-turn implementation:
 *     Tur 1 (bu): header + hero + aktif istasyon + çalışmalar tablosu +
 *                 sağ kolon (doktor/klinik + diş şeması)
 *     Tur 2: Tabs (Aktivite/Dosya/Yorum) — ChatSection/FilesSection
 *     Tur 3: Mali bilgi + print/QR + ilgili siparişler
 *     Tur 4: Action handlers + permissions + edge cases
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Modal, useWindowDimensions, Image, ActivityIndicator, TextInput, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { supabase } from '../../../core/api/supabase';
import { buildOrderPrintDoc } from '../lib/buildOrderPrintDoc';
import { getSignedUrls } from '../../../lib/photos';
import { useOrderDetail } from '../hooks/useOrderDetail';
import { SupportButton } from '../../support/components/SupportButton';
import { useOrderStages } from '../hooks/useOrderStages';
import { LivingToothChart } from '../components/LivingToothChart';
import { LinearProgressX, PercentRingX, StepsTimelineX } from '../../../core/ui/ProgressX';
import { Bell, Printer, Check, ArrowUpRight, ChevronLeft, ChevronRight, Phone, MapPin, Download, MessageSquare, FileText, Image as ImageIcon, File as FileIcon, RotateCcw, UserCheck, Upload, AlertTriangle, CircleCheck, Circle, Clock, ChevronDown, ChevronUp, ListChecks, Play, Truck, Eye, Trash2, Plus, SkipForward, Pause, Layers, CornerUpLeft, User } from 'lucide-react-native';

// Lazy viewer-3d (three.js ayrı chunk) — tek paylaşılan retry'lı lazy instance.
import { Viewer3DModalLazy as Viewer3DModal } from '../../viewer-3d/Viewer3DLazy';
import { unzipToViewer, unzipToViewerNative, isArchiveExt } from '../fileArchive';
import { holdOrder, resumeOrder, HOLD_CATEGORIES, holdCategoryLabel, holdDays } from '../holdApi';

// HTML tasarım (exocad web viewer) native önizleme — sadece native'de WebView yükle
// (web'de iframe kullanılır, require çağrılmaz → web bundle'ı etkilenmez).
const HtmlWebView: any = Platform.OS !== 'web' ? require('react-native-webview').WebView : null;

function is3DFileExt(path: string): 'stl' | 'ply' | 'obj' | null {
  const ext = path.toLowerCase().split('.').pop();
  if (ext === 'stl') return 'stl';
  if (ext === 'ply') return 'ply';
  if (ext === 'obj') return 'obj';
  return null;
}

/** patient_dob (YYYY-MM-DD) → yaş. */
function ageFromDob(dob?: string | null): number | null {
  if (!dob) return null;
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const b = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const md = now.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < b.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

/** Hasta yaş + cinsiyet küçük etiketi: "38 yaş · Kadın". */
function patientAgeGenderLabel(order: any): string {
  const parts: string[] = [];
  const age = ageFromDob(order?.patient_dob);
  if (age != null) parts.push(`${age} yaş`);
  const g = order?.patient_gender;
  if (g === 'kadın') parts.push('Kadın');
  else if (g === 'erkek') parts.push('Erkek');
  return parts.join(' · ');
}
import { STATUS_CONFIG, getNextStatus, isOrderOverdue, OP_CATEGORY } from '../constants';
import { getOrderStageLabel } from '../utils/currentStage';
import { titleCaseTR } from '../../../core/utils/textCase';
import { confirmAsync } from '../../../core/util/confirm';
import { openFileUrl } from '../../../core/util/openFile';
import { StageMaterialModal } from '../components/StageMaterialModal';
import { fetchStageMaterialContext, confirmStageMaterials } from '../api';
import { advanceOrderStatus, forceActivateStage, revertStage, updateDeliveryStatus, addOrderStage, removeOrderStage, requestDesignApproval, adminCompleteStage, adminSkipStage, adminActivateStage, fetchRevisionLinks, type RevisionLink } from '../api';
import { StageWorkflowTimeline } from '../components/StageWorkflowTimeline';
import { OriginFillButton, OriginFillPressable } from '../../../core/ui/OriginFillButton';
import { RevisionModal } from '../components/RevisionModal';
import { useContinuationOrder } from '../useContinuationOrder';
import { AddStageModal } from '../components/AddStageModal';
import { DeliveryModal } from '../components/DeliveryModal';
import { DeliveryFeeModal } from '../components/DeliveryFeeModal';
import { OrderLogisticsCard } from '../components/OrderLogisticsCard';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { CourierLiveMap } from '../../courier/CourierLiveMap';
import { DoctorChangeModal } from '../components/DoctorChangeModal';
import { Pencil } from 'lucide-react-native';
import { Star } from 'lucide-react-native';
import { hexA } from '../../../core/theme/stationPalette';
import { DS } from '../../../core/theme/dsTokens';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { OrderReviewsSection } from '../../reviews/components/OrderReviewsSection';
import { getMyReviewForOrder, listReviewsForOrder } from '../../reviews/api';
import type { OrderReview } from '../../reviews/types';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { ChatDetail } from '../components/MessagesPopup';
import { useChatMessages } from '../hooks/useChatMessages';
import { toast } from '../../../core/ui/Toast';
import { ImageLightbox } from '../../../core/ui/ImageLightbox';
import { saveMeshThumb } from '../../../lib/photos';
import { NativeImageViewer } from '../../../core/ui/mobile/NativeImageViewer';
import MobileViewer3D from '../../viewer-3d/mobile/MobileViewer3D';
import { X as CloseIcon } from 'lucide-react-native';
import { QCRejectModal } from '../components/QCRejectModal';
import { ReassignModal } from '../components/ReassignModal';
import { TriageModal } from '../components/TriageModal';
import { ReplanModal } from '../components/ReplanModal';
import { AdminDangerSection } from '../components/AdminDangerSection';
import { OrderClientActions } from '../components/OrderClientActions';
import { StageFileUpload } from '../components/StageFileUpload';
import { FaceScanButton } from '../components/FaceScanButton';
import { formatDuration } from '../stations/stageStates';
import { STAGE_ORDER, STAGE_LABEL, STAGE_COLOR, legacyStatusToStage } from '../stages';
import type { Stage } from '../stages';
import type { WorkOrderStatus } from '../../../lib/types';
import type { WorkOrder } from '../types';
import type { StatusHistory, WorkOrderPhoto } from '../../../lib/types';

// ── Profit RPC return shape ─────────────────────────────────────────
interface ProfitData {
  sale_price:      number;
  discount_amount: number;
  net_revenue:     number;
  material_cost:   number;
  labor_cost:      number;
  /** Kurye/kargo masrafı — siparişin tüm hareketleri (iptal hariç). */
  logistics_cost:  number;
  overhead_cost:   number;
  total_cost:      number;
  profit:          number;
  margin_pct:      number | null;
  /** Lab'ın baz para birimi — ₺ hardcode edilmez. */
  currency:        string;
  /** Baz dışı dövizdeki kurye ücretleri; çevrilmez, ayrı gösterilir. */
  logistics_other: Record<string, number>;
}
// Defansif: RPC numeric alanları string dönebilir, alan hiç gelmeyebilir.
const fmtTL = (n: unknown) =>
  (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Sipariş detayındaki "Mali Bilgi" kartı — geçici olarak kapalı (istek üzerine). */
const SHOW_FINANCIAL_CARD = false;

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const, fontWeight: '300' as const };

// ── VITA shade color (referans) ─────────────────────────────────────
const VITA_SHADE_HEX: Record<string, string> = {
  A1:    '#F0E2C0', A2:   '#E6CFA1', A3:   '#D9B27C', 'A3.5': '#C99A5E', A4: '#B07F4A',
  B1:    '#EFDFB6', B2:   '#E5CB94', B3:   '#D4AE6F', B4:    '#BC8F4F',
  C1:    '#D9CFB7', C2:   '#C7B89A', C3:   '#A8987B', C4:    '#897962',
  D2:    '#D7C2A6', D3:   '#C2A98B', D4:   '#A88E72',
};
const readableInk = (hex: string) => {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#3A2E1F' : '#FFFFFF';
};

// Status → patterns timeline index (0..4)
// "Hazır" ayrı bir aşama değil — paketleme bitince zaten hazırdır; sonraki gerçek
// aşama kuryenin teslim alması. Bu yüzden 4. adım "Kurye" (elden teslimde gizlenir).
const STATUS_LABELS = ['Alındı', 'Üretim', 'Final QC', 'Kurye', 'Teslim'];
const STATUS_LABELS_ELDEN = ['Alındı', 'Üretim', 'Final QC', 'Teslim']; // elden → kurye adımı yok

/**
 * Sipariş statüsü → 5 adımlı üst timeline indeksi.
 *
 * TAM liste olmak ZORUNDA. Eskiden bu, beş elemanlı bir dizide `indexOf`'tu ve
 * eksik statüler -1 döndürüyordu; çağıran taraftaki `idx >= 0 ? idx : 0`
 * fallback'i bunu sessizce "Alındı"ya çeviriyordu. Sonuç: kuryeye verilmiş bir
 * sipariş timeline'da "Alındı"da duruyordu (canlıda 7 sipariş etkilenmişti —
 * uretimde/kuryede/tasarim_onayi_bekleniyor statüleri dizide hiç yoktu).
 * Yeni statü eklenirken buraya da eklenmezse aynı sessiz hata geri döner;
 * bilinmeyen statü artık `null` döndürür ve timeline hiçbir adımı yanlış
 * biçimde "şu an" göstermez.
 */
const STATUS_STEP: Record<string, number> = {
  atama_bekleniyor:         0,
  alindi:                   0,
  kutu_atandi:              0,
  tasarim_onayi_bekleniyor: 1,  // onay üretim sürerken alınır
  uretimde:                 1,
  asamada:                  1,
  kalite_kontrol:           2,
  teslimata_hazir:          3,  // kurye adımı: alınmayı bekliyor
  kurye_bekleniyor:         3,
  kuryede:                  3,
  teslim_edildi:            4,
};

/** Elden teslimde "Kurye" adımı yok → 5'li skalayı 4'lüye indir. */
function statusStep(status: string | null | undefined, elden: boolean): number | null {
  const idx = STATUS_STEP[String(status ?? '')];
  if (idx == null) return null;
  if (!elden) return idx;
  return idx >= 4 ? 3 : Math.min(idx, 2);
}

// Panel → patterns DS theme (renk paleti)
// Aktif panel route segments primary signal — role değil, hangi panelin
// içinde gezildiği önemli (admin lab paneline girince saffron görmeli).
type PanelTheme = 'lab' | 'clinic' | 'doctor' | 'exec';
function panelToTheme(userType?: string | null, panelGroup?: string): PanelTheme {
  // Önce route segment kontrol et (hangi panelde gezildiğini gösterir)
  if (panelGroup === '(lab)')      return 'lab';
  if (panelGroup === '(clinic)')   return 'clinic';
  if (panelGroup === '(doctor)')   return 'doctor';
  if (panelGroup === '(admin)')    return 'exec';
  // Segment yoksa user_type'a düş
  if (userType === 'lab')          return 'lab';
  if (userType === 'clinic_admin') return 'clinic';
  if (userType === 'doctor')       return 'doctor';
  if (userType === 'admin')        return 'exec';
  return 'lab';
}
function themeAccent(theme: PanelTheme): string {
  // ClinicDashboard (#32BB78 emerald) ile uyumlu — klinik ve doctor aynı tonda
  if (theme === 'clinic') return '#32BB78';
  if (theme === 'doctor') return '#32BB78';
  if (theme === 'exec')   return '#4771AB';
  return '#F5C24B';
}
function themeHero(theme: PanelTheme): { bg: string; gradEnd: string; kicker: string; dark: boolean } {
  // Canlı zümrüt gradient (400 → 600), beyaz metin (dark:true)
  if (theme === 'clinic') return { bg: '#32BB78', gradEnd: '#0C8F56', kicker: 'rgba(255,255,255,0.92)', dark: true };
  if (theme === 'doctor') return { bg: '#32BB78', gradEnd: '#0C8F56', kicker: 'rgba(255,255,255,0.92)', dark: true };
  if (theme === 'exec')   return { bg: '#FFFFFF', gradEnd: '#FFFFFF', kicker: '#9C3814', dark: false };
  return { bg: '#FFF6D9', gradEnd: '#F5C24B', kicker: '#6B5A1F', dark: false };
}
// Sayfa zemin rengi — panel theme'iyle uyumlu (hero altındaki kısım)
// Önemli: beyaz kartlar sayfa zemininden ayrışsın diye HER panel için
// hafif tonlu off-white kullanıyoruz (kart gölgesi/kenarı görünür kalsın).
function themePage(theme: PanelTheme): string {
  // Shell (PatternsShell.palette) ile aynı zemin tonları → kart bordürleri uyumlu görünür.
  // Bakınız: MOBILE_PANEL_THEMES.{klinik,doctor,exec,lab}.bgPage
  if (theme === 'clinic' || theme === 'doctor') return '#F9FAFB';   // emerald panel off-white
  if (theme === 'exec')                         return '#F7F9FC';   // exec kobalt off-white (tek zemin)
  return '#FAF6E8'; // lab/default cream (saffron — shell ile aynı)
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function OrderDetailScreenV2() {
  const { id, triage: triageParam } = useLocalSearchParams<{ id: string; triage?: string }>();
  const router = useRouter();
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { order, signedUrls, thumbUrls, loading, error, refetch } = useOrderDetail(id);
  const { stages: orderStages, activeStage, completedCount, totalStages, lanes, isMultiLane, refetch: refetchStages } = useOrderStages(id ?? undefined);
  // "Atanmamış" senaryosu — aktif yoksa ilk bekliyor aşamayı reassign hedefi olarak kullan
  const reassignTargetStage = activeStage ?? orderStages.find(s => s.status === 'bekliyor') ?? null;
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 1024;
  // Panel detection erkene alındı — RPC guard'ları için gerekli (doctor/klinik mali RPC çağırmaz)
  const _segmentsEarly = useSegments() as string[];
  const _panelGroupEarly = _segmentsEarly?.[0] ?? '';
  const _isDoctorOrClinic = _panelGroupEarly === '(doctor)' || _panelGroupEarly === '(clinic)';

  const [chartW, setChartW] = useState(280);
  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  const [jawView, setJawView] = useState<'both' | 'upper' | 'lower'>('both');
  const [printOpen, setPrintOpen] = useState(false);
  const [printPreviewHtml, setPrintPreviewHtml] = useState<string | null>(null);
  const [addStageOpen, setAddStageOpen] = useState(false);
  // İşi Beklet modalı
  const [holdOpen, setHoldOpen]     = useState(false);
  const [holdCat, setHoldCat]       = useState<string>('client_missing_file');
  const [holdReason, setHoldReason] = useState('');
  const [holdBusy, setHoldBusy]     = useState(false);
  const [holdErr, setHoldErr]       = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<'doctor_note' | 'files'>('doctor_note');
  const [chatOpen, setChatOpen] = useState(false);
  const [profit, setProfit] = useState<ProfitData | null>(null);
  const [related, setRelated] = useState<Array<{ id: string; order_number: string; work_type: string | null; status: string; delivery_date: string | null; }>>([]);
  const [materials, setMaterials] = useState<Array<{ name: string; quantity: number; unit: string | null; line_cost: number }>>([]);
  const [advancing, setAdvancing] = useState(false);
  // Değerlendirme (Faz 1) — hekim/klinik teslim edilen işe puan verir
  const [myReview, setMyReview] = useState<OrderReview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewAutoPromptId = useRef<string | null>(null);  // iş başına bir kez oto-aç
  const [orderRating, setOrderRating] = useState<{ avg: number; count: number } | null>(null);
  // Route param order_number slug'ı olabilir (/order/LAB-2026-0118) — chat sorgusu
  // work_order_id UUID ister; bu yüzden her zaman çözülmüş order.id kullanılır.
  // Mesaj kutusu, ASIL işin geçmişini de gösterir: revizyon → revision_of_id,
  // devam siparişi → continues_order_id üzerinden ebeveyni miras alır.
  const revParentIds = (() => {
    const ids = [(order as any)?.revision_of_id, (order as any)?.continues_order_id].filter(Boolean) as string[];
    return ids.length ? ids : undefined;
  })();
  const { messages: chatMessages } = useChatMessages((order as any)?.id ?? '', profile?.id, revParentIds);
  const [togglingUrgent, setTogglingUrgent] = useState(false);
  const [qcRejectOpen, setQcRejectOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  // Revizyon (teslim sonrası yeniden yapım) — modal + karşılıklı bağlantı rozetleri
  const [revisionOpen, setRevisionOpen] = useState(false);
  // Devam siparişi (geçici→nihai planlı devam) — sihirbazı önceden-dolu açar
  const { startContinuation, starting: contStarting } = useContinuationOrder();
  const [revLinks, setRevLinks] = useState<{ parent: RevisionLink | null; children: RevisionLink[] }>({ parent: null, children: [] });
  // Devam siparişi (tedavi zinciri) bağlantıları — bu iş neyin devamı + bundan açılan devamlar
  const [contLinks, setContLinks] = useState<{ parent: { id: string; order_number: string } | null; children: { id: string; order_number: string }[] }>({ parent: null, children: [] });
  const [doctorChangeOpen, setDoctorChangeOpen] = useState(false);
  const [activeDelivery, setActiveDelivery] = useState<any | null>(null);
  /** Siparişin TÜM kurye hareketleri (final teslimat + ara bacaklar), yeniden eskiye. */
  const [deliveryLegs, setDeliveryLegs] = useState<any[]>([]);
  const [callCourierOpen, setCallCourierOpen] = useState(false);   // ara hareket modalı
  const [feeTarget, setFeeTarget] = useState<any | null>(null);     // ücret gir/düzelt
  const [legsTick, setLegsTick]   = useState(0);                    // manuel yenileme tetiği
  /** Mali panel para birimi sembolü — RPC'nin döndüğü lab baz para birimi. */
  const profitSym = CURRENCY_META[(profit?.currency ?? 'TRY') as Currency]?.symbol ?? (profit?.currency ?? '');

  // ── Lojistik kartındaki rota önizlemesi için gereken üç veri ──────────────
  // Google Maps anahtarı + laboratuvar adresi entegrasyon ayarlarından,
  // klinik adresi siparişin kliniğinden gelir. Hiçbiri yoksa harita gizlenir.
  const [mapsApiKey, setMapsApiKey]     = useState<string | null>(null);
  const [labAddress, setLabAddress]     = useState<string | null>(null);
  const [clinicAddress, setClinicAddress] = useState<string | null>(null);
  const orderClinicId = (order as any)?.doctor?.clinic?.id as string | undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [maps, courier] = await Promise.all([
          supabase.rpc('get_active_provider', { p_type: 'maps' }),
          // Kuryede birden çok sağlayıcı aynı anda aktif olabilir (motokurye +
          // kargo); RPC tipteki ilk satırı döndürüyor, o yüzden hepsi okunup
          // alış adresi OLAN kayıt seçiliyor.
          supabase.from('provider_credentials')
            .select('provider, credentials')
            .eq('type', 'courier').eq('is_active', true),
        ]);
        if (cancelled) return;
        const m: any = Array.isArray(maps.data) ? maps.data[0] : maps.data;
        if (m?.provider === 'google-maps' && m?.credentials?.api_key) setMapsApiKey(m.credentials.api_key);
        // Shipink alış adresini tek alanda değil parçalı tutar (sokak/ilçe/il).
        const labAddr = ((courier.data ?? []) as any[])
          .map((r) => String(r?.credentials?.pickup_address ?? '').trim()
            || [r?.credentials?.pickup_street, r?.credentials?.pickup_district, r?.credentials?.pickup_city]
                 .map((x) => String(x ?? '').trim()).filter(Boolean).join(', '))
          .find((a) => a);
        if (labAddr) setLabAddress(labAddr);
      } catch { /* entegrasyon yoksa önizleme çizilmez */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!orderClinicId) { setClinicAddress(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('clinics').select('address').eq('id', orderClinicId).maybeSingle();
        if (!cancelled) setClinicAddress((data as any)?.address ?? null);
      } catch { /* yoksa önizleme gizlenir */ }
    })();
    return () => { cancelled = true; };
  }, [orderClinicId]);

  // Kurye hareketlerini çek + realtime izle.
  // NOT: route param'ı order_number slug'ı olabilir; work_order_id UUID ister.
  const orderUuid = (order as any)?.id as string | undefined;
  useEffect(() => {
    if (!orderUuid) return;
    const fetchDeliveries = async () => {
      const { data } = await supabase
        .from('deliveries')
        .select('id, mode, status, courier_id, external_provider, external_tracking_no, external_tracking_code, external_label_url, picked_up_at, delivered_at, created_at, notes, destination_name, destination_address, destination_phone, purpose, direction, fee_amount, fee_currency, fee_source, stage_snapshot, courier:profiles!deliveries_courier_profiles_fkey(full_name)')
        .eq('work_order_id', orderUuid)
        .order('created_at', { ascending: false });
      const rows = (data ?? []) as any[];
      setDeliveryLegs(rows);
      // "Aktif teslimat" = siparişin FİNAL teslimatı. Ara kurye hareketleri (eksik
      // parça, model alma...) timeline'ı ve "Kuryeye Gönder" butonunu etkilemez.
      // İptal edilen teslimat aktif sayılmaz → buton geri gelir.
      const finalLeg = rows.find(r => (r.purpose ?? 'teslimat') === 'teslimat');
      setActiveDelivery(finalLeg && finalLeg.status === 'iptal' ? null : (finalLeg ?? null));
    };
    fetchDeliveries();
    const ch = supabase
      .channel(`delivery-${orderUuid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `work_order_id=eq.${orderUuid}` }, () => fetchDeliveries())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderUuid, legsTick]);

  // Adres çubuğu kozmetiği (yalnız web): /order/<uuid> → /order/<order_number>.
  // fetchWorkOrderById ikisini de çözer; bu yalnız GÖRÜNEN URL'yi okunur yapar
  // Revizyonda orijinalin DOSYALARI devralınır — kopyalanmaz, salt okunur gösterilir.
  const [inheritedFiles, setInheritedFiles] = useState<{ photos: any[]; urls: Record<string, string> }>({ photos: [], urls: {} });
  useEffect(() => {
    // Revizyon (revision_of_id) VEYA devam siparişi (continues_order_id) → ASIL işin
    // dosyaları (taramalar/fotoğraflar) devralınır; kopyalanmaz, salt okunur gösterilir.
    const pid = ((order as any)?.revision_of_id ?? (order as any)?.continues_order_id) as string | undefined;
    if (!pid) { setInheritedFiles({ photos: [], urls: {} }); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('work_orders')
        .select('order_number, photos:work_order_photos(*)')
        .eq('id', pid)
        .maybeSingle();
      const ph = (((data as any)?.photos ?? []) as any[]).map(p => ({ ...p, __inherited: true }));
      if (cancelled || ph.length === 0) return;
      const urls = await getSignedUrls(ph.map(p => p.storage_path).filter(Boolean));
      if (!cancelled) setInheritedFiles({ photos: ph, urls });
    })().catch(() => { /* dosya devralma opsiyonel */ });
    return () => { cancelled = true; };
  }, [(order as any)?.revision_of_id, (order as any)?.continues_order_id]);

  // Revizyon bağlantıları — bu sipariş neyin revizyonu + bundan açılan revizyonlar
  useEffect(() => {
    const oid = (order as any)?.id as string | undefined;
    if (!oid) { setRevLinks({ parent: null, children: [] }); return; }
    let cancelled = false;
    fetchRevisionLinks(oid, (order as any)?.revision_of_id ?? null)
      .then(r => { if (!cancelled) setRevLinks(r); })
      .catch(() => { /* rozet opsiyonel — sessiz geç */ });
    return () => { cancelled = true; };
  }, [(order as any)?.id, (order as any)?.revision_of_id]);

  // Tedavi zinciri (devam siparişi) bağlantıları — ebeveyn (continues_order_id) +
  // bu işten açılmış devam siparişleri. Karşılıklı, tıklanınca ilgili siparişe gider.
  useEffect(() => {
    const oid = (order as any)?.id as string | undefined;
    if (!oid) { setContLinks({ parent: null, children: [] }); return; }
    const parentId = (order as any)?.continues_order_id as string | undefined;
    let cancelled = false;
    (async () => {
      const [parentRes, childRes] = await Promise.all([
        parentId
          ? supabase.from('work_orders').select('id, order_number').eq('id', parentId).maybeSingle()
          : Promise.resolve({ data: null } as any),
        supabase.from('work_orders').select('id, order_number').eq('continues_order_id', oid).order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      setContLinks({
        parent: (parentRes as any)?.data ?? null,
        children: ((childRes as any)?.data as { id: string; order_number: string }[]) ?? [],
      });
    })().catch(() => { /* rozet opsiyonel — sessiz geç */ });
    return () => { cancelled = true; };
  }, [(order as any)?.id, (order as any)?.continues_order_id]);

  // (LAB-2026-0042). history.replaceState → remount/refetch YOK, expo-router
  // state korunur; eski UUID linkleri/QR'lar çalışmaya devam eder.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const num = (order as any)?.order_number as string | undefined;
    if (!num || !id) return;
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID.test(String(id))) return; // zaten slug ile gelinmiş
    try {
      const path = window.location.pathname;
      const nice = path.replace(String(id), encodeURIComponent(num));
      if (nice !== path) window.history.replaceState(window.history.state, '', nice + (window.location.search || ''));
    } catch { /* no-op */ }
  }, [id, (order as any)?.order_number]);

  // ── Aşama timeline'ına virtual Kurye + Teslim aşamaları ekle ─────────────
  // order_stages sadece üretim aşamalarını tutar. Teslimat akışı (kurye atandı →
  // yola çıktı → teslim edildi) deliveries tablosunda. Kullanıcılar tek bir
  // timeline görmek istiyor → virtual stage olarak ekle.
  const combinedStages = useMemo<any[]>(() => {
    const realStages = orderStages ?? [];
    const orderStatus = (order as any)?.status as string | undefined;
    const deliveryMethod = (order as any)?.delivery_method as 'kurye' | 'kargo' | 'elden' | null | undefined;
    const isDeliveryStarted = !!activeDelivery
      || ['teslimata_hazir', 'kurye_bekleniyor', 'kuryede', 'teslim_edildi'].includes(orderStatus ?? '');
    if (!isDeliveryStarted) return realStages;

    // Kurye virtual stage durumu
    const courierStatus: 'tamamlandi' | 'aktif' | 'bekliyor' = (() => {
      if (orderStatus === 'teslim_edildi' || activeDelivery?.status === 'teslim_edildi') return 'tamamlandi';
      if (activeDelivery && ['yolda', 'teslim_alindi'].includes(activeDelivery.status)) return 'aktif';
      if (activeDelivery) return 'aktif';
      return 'bekliyor';
    })();
    // Teslim virtual stage durumu
    const deliveryStatus: 'tamamlandi' | 'aktif' | 'bekliyor' = (() => {
      if (orderStatus === 'teslim_edildi' || activeDelivery?.status === 'teslim_edildi') return 'tamamlandi';
      if (activeDelivery?.status === 'yolda') return 'aktif';
      return 'bekliyor';
    })();
    // Courier name
    const courierName = activeDelivery?.mode === 'external'
      ? (activeDelivery.external_provider ?? 'Kargo')
      : null; // internal courier needs lookup; skip for now

    const lastSeq = realStages.length > 0
      ? Math.max(...realStages.map(s => (s as any).sequence_order ?? 0))
      : 0;

    const virtualCourier = {
      id: `__virtual_courier_${id}`,
      status: courierStatus as any,
      sequence_order: lastSeq + 1,
      station: { id: '__courier', name: 'Kurye', color: '#0EA5E9', icon: null },
      technician: courierName ? { id: '__courier', full_name: courierName } : null,
      started_at: activeDelivery?.picked_up_at ?? null,
      completed_at: activeDelivery?.delivered_at ?? null,
      assigned_at: null,
      active_work_seconds: 0,
      machine_runtime_seconds: 0,
      queue_waiting_seconds: 0,
      paused_seconds_total: 0,
      is_virtual: true,
    };
    const virtualDelivery = {
      id: `__virtual_delivery_${id}`,
      status: deliveryStatus as any,
      sequence_order: lastSeq + 2,
      station: { id: '__delivery', name: 'Teslim', color: '#10B981', icon: null },
      technician: null,
      started_at: null,
      completed_at: activeDelivery?.delivered_at ?? null,
      assigned_at: null,
      active_work_seconds: 0,
      machine_runtime_seconds: 0,
      queue_waiting_seconds: 0,
      paused_seconds_total: 0,
      is_virtual: true,
    };
    // Elden teslim → kurye aşaması yok, sadece "Teslim". Kurye/kargo/eski → ikisi de.
    if (deliveryMethod === 'elden') return [...realStages, virtualDelivery];
    return [...realStages, virtualCourier, virtualDelivery];
  }, [orderStages, activeDelivery, (order as any)?.status, (order as any)?.delivery_method, id]);
  // Material confirm modal — aşamayı tamamlarken malzeme onayı
  const [materialModalStageId, setMaterialModalStageId] = useState<string | null>(null);
  const [stageCompleting, setStageCompleting] = useState(false);
  const [bbkTracking, setBbkTracking] = useState(false);
  const [cancelingDelivery, setCancelingDelivery] = useState(false);
  const [shpBusy, setShpBusy] = useState(false);
  const [editDeliveryTarget, setEditDeliveryTarget] = useState<{ id: string; orderId: string } | null>(null);
  // Aşama aksiyon dropdown'u — hangi aşamanın menüsü açık (birincil "Tamamla" + ▼).
  const [stageMenuOpen, setStageMenuOpen] = useState<string | null>(null);
  const [stagesExpanded, setStagesExpanded] = useState(false);
  // Faz 4b: çok-şeritte AŞAMA DETAYLARI iş (şerit) başına collapse gruplar.
  const [expandedLanes, setExpandedLanes] = useState<Record<number, boolean>>({});
  const [triageOpen, setTriageOpen] = useState(false);
  const [triageAutoOpened, setTriageAutoOpened] = useState(false);
  const [replanOpen, setReplanOpen] = useState(false);

  // Canlı zaman sayacı — siyah karttaki "TOPLAM SÜRE" ve "BU AŞAMA"
  // değerlerinin saniye saniye akmasını sağlar. TOPLAM SÜRE her durumda
  // (aktif aşama olmasa bile) firstStart'tan beri saymaya devam eder.
  const [, setTimeTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTimeTick(x => x + 1), 1_000);
    return () => clearInterval(t);
  }, []);

  const isManager = profile?.role === 'manager' || profile?.user_type === 'admin';
  // Triaj yetkisi: admin + lab_manager (C seçildi)
  // 'triage' station'ına atanmış teknisyen kontrolü ileride eklenebilir
  const canTriage = isManager;

  // Henüz triajlanmamış mı?
  const needsTriage = !!order && !(order as any).triaged_at && ((order.status as string) === 'alindi' || (order.status as string) === 'aktif');

  // Yeniden planlanabilir mi? — triajlı + hiçbir aşama TAMAMLANMAMIŞ.
  // 'skipped' aşamalar normaldir (atlanmış), göz ardı edilir. Tamamlanmamış
  // (bekliyor/aktif/durakladi vb.) aşamalar yeniden planlanabilir.
  const replanEditable = (orderStages ?? []).filter(s => s.status !== 'skipped');
  const canReplan = canTriage && !!order && !!(order as any).triaged_at
    && replanEditable.length > 0
    && replanEditable.every(s => s.status !== 'tamamlandi' && s.status !== 'onaylandi');
  // ── Tasarım hekim onayı ──
  const designApprovalStatus = (order as any)?.doctor_approval_status as string | null;
  const designApprovalPending = designApprovalStatus === 'pending';
  // Lab tasarımı onaya gönderebilir mi? — triajlı + bekliyor/onaylı değil
  const canSendDesignApproval = canTriage && !!order && !!(order as any).triaged_at
    && designApprovalStatus !== 'pending' && designApprovalStatus !== 'approved';
  const [sendingApproval, setSendingApproval] = useState(false);
  const handleSendDesignApproval = useCallback(async () => {
    if (!order || sendingApproval) return;
    setSendingApproval(true);
    const res = await requestDesignApproval(order.id);
    setSendingApproval(false);
    if (!res.ok) { toast.error(res.error ?? 'Gönderilemedi'); return; }
    toast.success('Tasarım hekim onayına gönderildi');
    refetch();
  }, [order, sendingApproval, refetch]);

  // Auto-open: triaj manager + henüz triajlanmamış → ilk yüklemede modal'ı aç (kullanıcı kapatabilir)
  // Ayrıca: ?triage=open query param ile zorla açma (mobile list "Planlama" lane'inden gelen tıklamalar)
  useEffect(() => {
    const forceOpen = triageParam === 'open' || triageParam === '1';
    const wantsTriage = canTriage && (needsTriage || forceOpen) && !!order;
    if (!wantsTriage || triageAutoOpened || triageOpen) return;

    // LAB & ADMIN: yeni tam-ekran Plan Önizleme & Onay ekranına yönlendir (replace → geri-döngü olmaz).
    // Diğer paneller: mevcut TriageModal davranışı korunur.
    if (_panelGroupEarly === '(lab)' || _panelGroupEarly === '(admin)') {
      setTriageAutoOpened(true);
      router.replace(`/${_panelGroupEarly}/order/plan/${id}` as any);
      return;
    }
    setTriageOpen(true);
    setTriageAutoOpened(true);
  }, [canTriage, needsTriage, triageAutoOpened, triageOpen, triageParam, order, _panelGroupEarly, id, router]);

  // ── Mali bilgi (profit RPC) ─────────────────────────────────────
  // Doctor/klinik panel'de mali RPC çağrılmaz (gereksiz network + RLS hatası)
  useEffect(() => {
    if (!orderUuid || _isDoctorOrClinic) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('calculate_order_profit', { p_work_order_id: orderUuid });
      if (!cancelled) setProfit((data?.[0] ?? null) as ProfitData | null);
    })();
    return () => { cancelled = true; };
  }, [orderUuid, _isDoctorOrClinic, legsTick]);

  // ── Materyal hareketleri (calculate_order_cost RPC) ──────────────
  useEffect(() => {
    if (!orderUuid || _isDoctorOrClinic) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('calculate_order_cost', { p_work_order_id: orderUuid });
      if (!cancelled) setMaterials((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [orderUuid, _isDoctorOrClinic]);

  // ── İlgili siparişler (aynı hasta) ──────────────────────────────
  useEffect(() => {
    if (!id || !order?.patient_name) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('work_orders')
        .select('id, order_number, work_type, status, delivery_date')
        .eq('patient_name', order.patient_name)
        .neq('id', id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!cancelled) setRelated((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [id, order?.patient_name]);

  // Teslim edilen iş + hekim/klinik → mevcut değerlendirmemi getir;
  // henüz değerlendirilmemişse modalı otomatik aç (iş başına bir kez).
  useEffect(() => {
    if (!id || !_isDoctorOrClinic || order?.status !== 'teslim_edildi') { setMyReview(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await getMyReviewForOrder(id);
      if (cancelled) return;
      setMyReview(data);
      if (!data && reviewAutoPromptId.current !== id) {
        reviewAutoPromptId.current = id;
        setReviewOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [id, _isDoctorOrClinic, order?.status]);

  // Teslim edilen iş → işin ortalama değerlendirme puanı (tüm paneller; status kartında gösterilir)
  useEffect(() => {
    if (!id || order?.status !== 'teslim_edildi') { setOrderRating(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await listReviewsForOrder(id);
      if (cancelled) return;
      if (!data.length) { setOrderRating({ avg: 0, count: 0 }); return; }
      const avg = data.reduce((s, r) => s + (r.overall || 0), 0) / data.length;
      setOrderRating({ avg, count: data.length });
    })();
    return () => { cancelled = true; };
  }, [id, order?.status, myReview]);

  const segments = useSegments() as string[];
  const panelGroup = segments?.[0] ?? '';
  const panelTheme = panelToTheme(profile?.user_type, panelGroup);
  const panelAccent = themeAccent(panelTheme);
  const heroPalette = themeHero(panelTheme);
  // İç yumuşak-panel dolgusu — panel-uyumlu. Klinik/hekim: yeşil-50 (#EDFCF3);
  // diğer paneller mevcut krem (#FAF8F4) tonunda kalır. (bg-cream-panel yerine)
  const softPanelBg = (panelTheme === 'clinic' || panelTheme === 'doctor') ? '#EDFCF3'
    : panelTheme === 'exec' ? '#F7F9FC'
    : '#FAF8F4';
  // ProgressX (DsTheme) 'doctor' bilmiyor → 'tech' (mavi tonu) ile eşle
  const progressTheme: 'lab' | 'clinic' | 'exec' | 'tech' = panelTheme === 'doctor' ? 'tech' : panelTheme;

  // Page title — PatternsShell toolbar satırında gösterilir
  const { setTitle: setPageTitle, clear: clearPageTitle } = usePageTitleStore();
  const _clinic = order?.doctor?.clinic_name ?? order?.doctor?.clinic?.name ?? '';
  useEffect(() => {
    if (order) {
      setPageTitle(
        order.order_number,
        `Siparişler › ${_clinic || '—'}`
      );
    }
    return () => clearPageTitle();
  }, [order?.order_number, _clinic, panelGroup]);

  // Derived ────────────────────────────────────────────────────────
  const isElden = (order as any)?.delivery_method === 'elden';
  const statusIdx = order ? (statusStep(order.status, isElden) ?? 0) : 0;
  const overdue = order ? isOrderOverdue(order.delivery_date, order.status, (order as any).hold_status) : false;
  // ── İşi Beklet — beklerken gecikme sayacı durur, kart "BEKLEMEDE" gösterir ──
  const onHold      = (order as any)?.hold_status === 'on_hold';
  const heldDays    = onHold ? holdDays((order as any)?.hold_started_at) : 0;
  const heldByClient = (order as any)?.hold_responsible !== 'lab';
  // Kalan gün — her iki taraf da yerel gün başına sabitlenir; saat farkı
  // yüzünden geciken sipariş "Bugün" (veya bugün teslim "1 gün gecikti")
  // görünmesin (off-by-one).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deliveryDate = order?.delivery_date ? new Date(order.delivery_date + 'T00:00:00') : null;
  const daysLeft = deliveryDate ? daysBetween(today, deliveryDate) : null;
  // Tick once per minute so the active-stage progress advances live
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const progressPct = useMemo(() => {
    if (!order) return 0;
    if (order.status === 'teslim_edildi') return 100;

    // combinedStages = gerçek üretim aşamaları + virtual Kurye + Teslim.
    // İlerleme bunlara göre hesaplanır → Kurye/Teslim aşamaları tamamlanmadan
    // ring %100'e çıkmaz.
    const total = combinedStages.length;
    if (total > 0) {
      const completed = combinedStages.filter(
        (s: any) => s.status === 'tamamlandi' || s.status === 'onaylandi',
      ).length;
      // Aktif aşamanın kısmi ilerlemesi (elapsed / estimated) — sadece gerçek prod aşamaları için
      let activeFraction = 0;
      if (activeStage?.started_at && activeStage.estimated_minutes && activeStage.estimated_minutes > 0) {
        const elapsedMin = Math.max(0, (nowTick - new Date(activeStage.started_at).getTime()) / 60_000);
        activeFraction = Math.min(elapsedMin / activeStage.estimated_minutes, 1);
      }
      return Math.min(100, Math.round(((completed + activeFraction) / total) * 100));
    }

    // Fallback — macro status index over 5-step pipeline
    return Math.round(((statusIdx + 1) / STATUS_LABELS.length) * 100);
  }, [order, statusIdx, combinedStages, activeStage, nowTick]);

  const allTeeth = order?.tooth_numbers ?? [];
  const upperTeeth = useMemo(() => allTeeth.filter(t => t < 30), [allTeeth]);
  const lowerTeeth = useMemo(() => allTeeth.filter(t => t >= 30), [allTeeth]);
  const visibleTeethCount =
    jawView === 'upper' ? upperTeeth.length :
    jawView === 'lower' ? lowerTeeth.length :
                          allTeeth.length;

  // Tooth chart hep tüm dişleri alır — jawView gösterimi forceJawMode ile yapılır
  const toothChartOrder = useMemo(() => ({
    tooth_numbers: allTeeth,
    photos: [],
  } as unknown as WorkOrder), [allTeeth]);
  const forcedJaw = jawView === 'both' ? undefined : jawView;

  // ── Diş renk haritası — order_items'a göre dağıt ──────────────────
  // Birden fazla item varsa her birine farklı renk; tek item / yoksa panelAccent
  // Panel yeşiline (accent) yakın tonlar hariç — belirgin ayrı hue'lar
  const TOOTH_PALETTE = ['#3B82F6', '#F59E0B', '#7C3AED', '#EC4899', '#0EA5E9', '#EF4444'];
  const toothColorMap = useMemo(() => {
    const items = (order as any)?.order_items as Array<{ id: string; quantity: number; name: string; tooth_numbers?: number[] | null }> | undefined;
    const map: Record<number, string> = {};
    if (allTeeth.length === 0) return map;

    // Renk = benzersiz İŞLEM adına göre (aynı işlem → aynı renk, farklı işlem → farklı renk).
    // İlk işlem panel accent'i (yeşil), sonrakiler paletten.
    const nameColor = new Map<string, string>();
    const colorForName = (name: string) => {
      const key = (name ?? '').trim().toLocaleLowerCase('tr-TR');
      if (!nameColor.has(key)) {
        const idx = nameColor.size;
        nameColor.set(key, idx === 0 ? panelAccent : TOOTH_PALETTE[(idx - 1) % TOOTH_PALETTE.length]);
      }
      return nameColor.get(key)!;
    };

    // ── 1) En iyi: tooth_numbers dolu item'lar (yeni siparişler) ────────────
    if (items && items.length > 0) {
      const itemsWithTeeth = items.filter(it => Array.isArray(it.tooth_numbers) && it.tooth_numbers!.length > 0);
      if (itemsWithTeeth.length > 0) {
        itemsWithTeeth.forEach((it) => {
          const color = colorForName(it.name ?? '');
          it.tooth_numbers!.forEach(t => { map[t] = color; });
        });
        allTeeth.forEach(t => { if (!map[t]) map[t] = panelAccent; });
        return map;
      }
    }

    // ── 2) Orta yol: work_orders.work_type virgülle birleşik segmentler ─────
    // Submit sırasında "form.tooth_ops.map(o => o.work_type).join(', ')" yazılıyor.
    // Sıra korunduğu için tooth_numbers ile 1:1 eşleştirme yapabiliriz.
    const wtRaw = (order as any)?.work_type as string | undefined;
    if (wtRaw && allTeeth.length > 1) {
      const wtSegs = wtRaw.split(/,\s*/).map(s => s.trim()).filter(Boolean);
      if (wtSegs.length === allTeeth.length) {
        // Tam eşleşme — her diş kendi segment'ine
        const uniqueWts: string[] = [];
        const wtIndex = new Map<string, number>();
        wtSegs.forEach(w => { if (!wtIndex.has(w)) { wtIndex.set(w, uniqueWts.length); uniqueWts.push(w); } });
        allTeeth.forEach((t, i) => {
          const idx = wtIndex.get(wtSegs[i]) ?? 0;
          map[t] = idx === 0 ? panelAccent : TOOTH_PALETTE[(idx - 1) % TOOTH_PALETTE.length];
        });
        return map;
      }
    }

    // ── 3) Legacy: order_items quantity oranı ─────────────────────────────
    if (items && items.length > 1) {
      let cursor = 0;
      items.forEach((it) => {
        const color = colorForName(it.name ?? '');
        const slice = Math.max(1, Math.round((it.quantity / Math.max(1, items.reduce((s, x) => s + x.quantity, 0))) * allTeeth.length));
        for (let j = 0; j < slice && cursor < allTeeth.length; j++) {
          map[allTeeth[cursor]] = color;
          cursor++;
        }
      });
      while (cursor < allTeeth.length) {
        map[allTeeth[cursor]] = panelAccent;
        cursor++;
      }
      return map;
    }

    // ── 4) Tek/sıfır item ya da fallback yok → hepsi panel accent ─────────
    allTeeth.forEach(t => { map[t] = panelAccent; });
    return map;
  }, [order, allTeeth, panelAccent]);

  // Render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView className="flex-1">
        <LoadingSpinner fullScreen message="Yükleniyor…" />
      </SafeAreaView>
    );
  }
  if (error || !order) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: themePage(panelTheme) }}>
        <Text className="text-[14px] text-ink-500">Sipariş bulunamadı.</Text>
      </SafeAreaView>
    );
  }

  const doctorName  = order.doctor?.full_name ?? '—';
  const clinicName  = order.doctor?.clinic_name ?? order.doctor?.clinic?.name ?? '—';
  const doctorPhone = order.doctor?.phone ?? '';
  // Şu an gösterilecek aşama başlığı — aktif stage varsa onun adı, yoksa
  // getOrderStageLabel (current_stage_name / status label) fallback
  const currentStation = activeStage?.station?.name ?? getOrderStageLabel(order as any);
  // "istasyonu" sonek sadece gerçek bir production stage aktifken eklenir;
  // "Hazır" / "Teslim Edildi" / "Kuryede" gibi label'larda eklenmemeli
  const currentStationSuffix = activeStage?.station?.name ? ' istasyonu' : '';
  // Hem mobil hem desktop branch'lerinde kullanılan istasyon adı
  const stageName = activeStage?.station?.name ?? (STATUS_CONFIG[order.status as WorkOrderStatus]?.label ?? 'Bekliyor');

  // ── Faz 4b: şerit → diş etiketi + collapse durumu ──────────────────────────
  const laneTeethLabel = (lane: number) => {
    const its = ((order as any)?.order_items ?? []) as Array<any>;
    const teeth = its
      .filter(it => (it.lane ?? 1) === lane)
      .flatMap(it => (Array.isArray(it.tooth_numbers) ? it.tooth_numbers : []));
    return teeth.length ? teeth.join(', ') : `Şerit ${lane}`;
  };
  // Şeridin İŞ TÜRÜ etiketi (aşama adı yerine gösterilir). İsmin sonundaki diş
  // parantezini temizle — dişler zaten ayrı "DİŞ …" olarak gösteriliyor.
  const laneWorkTypeLabel = (lane: number) => {
    const its = ((order as any)?.order_items ?? []) as Array<any>;
    const names = Array.from(new Set(
      its
        .filter(it => (it.lane ?? 1) === lane)
        .map(it => String(it.name ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim())
        .filter(Boolean),
    ));
    return names.length ? names.join(' · ') : `Şerit ${lane}`;
  };
  // Çok-şeritte VARSAYILAN: tüm şeritler açık → her şeridin aşamaları ayrı ayrı
  // görünür (yalnız aktif şerit açık değil). Kullanıcı istediğini kapatabilir.
  const isLaneOpen = (lane: number) => expandedLanes[lane] ?? true;
  const toggleLane = (lane: number) => setExpandedLanes(p => ({ ...p, [lane]: !(p[lane] ?? true) }));

  // Faz 4b: AŞAMA DETAYLARI görüntü listesi — çok-şeritte iş (şerit) başına
  // collapse grup başlığı + (açıksa) o şeridin aşamaları; sonda teslimat virtual'ları.
  const displayStages: any[] = (() => {
    if (!isMultiLane) return combinedStages;
    const out: any[] = [];
    for (const l of lanes as any[]) {
      out.push({ __laneHeader: true, id: `__lh_${l.lane}`, lane: l.lane, teeth: laneTeethLabel(l.lane),
        workType: laneWorkTypeLabel(l.lane),
        done: l.completedCount, total: l.totalStages, current: l.currentStage?.station?.name ?? null });
      if (isLaneOpen(l.lane)) out.push(...l.stages);
    }
    const virtuals = combinedStages.filter((s: any) => s.is_virtual);
    if (virtuals.length) out.push(...virtuals);
    return out;
  })();

  // Print — basit window.print() (full QR HTML için Tur 4'te detaylandırılacak)
  const qrUrl = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/order/${order.id}`
    : `https://dental-lab-steel.vercel.app/order/${order.id}`;
  const handleNavigateRelated = (relatedId: string) => {
    if (panelGroup && panelGroup.startsWith('(')) {
      router.push(`/${panelGroup}/order/${relatedId}` as any);
    } else {
      router.push(`/dev/order-detail-v2/${relatedId}` as any);
    }
  };

  // ── Permissions ─────────────────────────────────────────────────
  const isAssigned = !!profile && (order as any).assigned_to === profile.id;
  const canAdvance = isManager || isAssigned;

  // Müdür/admin: canlı siparişten aşama sil (sıra otomatik yeniden düzenlenir).
  // NOT: useCallback DEĞİL — bu satır component'in erken-return'lerinden sonra
  // geliyor; hook olursa "rendered more hooks" hatası verir. Düz fonksiyon.
  const handleRemoveStage = async (stg: any) => {
    const label = stg?.station?.name ?? 'Aşama';
    const ok = await confirmAsync('Aşamayı Sil', `"${label}" ${autoT('aşamasını silmek istediğine emin misin? Sıralama otomatik düzenlenir.')}`, { confirmText: 'Sil', destructive: true });
    if (!ok) return;
    const r = await removeOrderStage(stg.id);
    if (!r.ok) { toast.error(r.error ?? 'Aşama silinemedi'); return; }
    toast.success('Aşama silindi.');
    refetch(); refetchStages();
  };
  // ── Admin/müdür aşama override: her durumda Tamamla / Atla / Aktif et ──
  const handleAdminCompleteStage = async (stg: any) => {
    const label = stg?.station?.name ?? 'Aşama';
    const ok = await confirmAsync('Aşamayı Tamamla', `"${label}" ${autoT('aşamasını tamamlamak istediğine emin misin? Sonraki aşama otomatik başlar.')}`, { confirmText: 'Tamamla' });
    if (!ok) return;
    const r = await adminCompleteStage(stg.id);
    if (!r.ok) { toast.error(r.error ?? 'Aşama tamamlanamadı'); return; }
    toast.success(`"${label}" tamamlandı.`);
    refetch(); refetchStages();
  };
  const handleAdminSkipStage = async (stg: any) => {
    const label = stg?.station?.name ?? 'Aşama';
    const ok = await confirmAsync('Aşamayı Atla', `"${label}" ${autoT('aşamasını ATLAMAK istediğine emin misin? Aşama "atlandı" olarak işaretlenir, sonraki aşama başlar.')}`, { confirmText: 'Atla' });
    if (!ok) return;
    const r = await adminSkipStage(stg.id);
    if (!r.ok) { toast.error(r.error ?? 'Aşama atlanamadı'); return; }
    toast.success(`"${label}" atlandı.`);
    refetch(); refetchStages();
  };
  const handleAdminActivateStage = async (stg: any) => {
    const label = stg?.station?.name ?? 'Aşama';
    const r = await adminActivateStage(stg.id);
    if (!r.ok) { toast.error(r.error ?? 'Aşama aktif edilemedi'); return; }
    toast.success(`"${label}" aktif edildi.`);
    refetch(); refetchStages();
  };
  // Üretim aşamasındayken üretim stage'leri bitmediyse manuel "Final QC'a geç" gizlenir
  // — workflow her aşama tek tek "Tamamla & ilerlet" ile ilerletilir
  const hasPendingProductionStages = ((order?.status as string) === 'asamada') && (
    (orderStages?.length ?? 0) > 0 &&
    orderStages.some(s => s.status === 'aktif' || s.status === 'bekliyor')
  );
  const nextStatus = getNextStatus(order.status as WorkOrderStatus);
  const nextStatusLabel = nextStatus ? (STATUS_CONFIG[nextStatus]?.label ?? nextStatus) : null;

  // ── Aşamayı tamamla (üst durum geçişi: alindi → uretimde → KK → ...) ──
  const handleAdvanceStage = async () => {
    if (!profile || !nextStatus || advancing) return;
    // Tasarım hekim onayı bekliyorsa ilerleme kilitli (admin override hariç)
    if (designApprovalPending && !isManager) { toast.error('Hekim onayı bekleniyor — ilerlenemiyor'); return; }
    if (designApprovalPending && isManager) { toast.error('Hekim onayı bekleniyor — önce onay/red gelmeli'); return; }
    setAdvancing(true);
    const { error } = await advanceOrderStatus(order.id, nextStatus, profile.id);
    setAdvancing(false);
    if (error) {
      toast.error('Durum güncellenemedi: ' + (error as any).message);
    } else {
      toast.success(`Sipariş "${STATUS_CONFIG[nextStatus]?.label ?? nextStatus}" durumuna geçti`);
      refetch();
    }
  };

  // ── Üretim aşamasını tamamla — malzeme tüketen istasyon ise modal aç ──
  const handleCompleteProductionStage = async (stageId: string) => {
    if (stageCompleting) return;
    setStageCompleting(true);
    try {
      const { data, error } = await fetchStageMaterialContext(stageId);
      if (error || !data) {
        toast.error('Aşama bilgisi alınamadı: ' + (error ?? 'unknown'));
        return;
      }
      // Malzeme tüketmiyor → çok-katmanlı dayanıklı tamamlama
      if (!data.station.consumes_materials) {
        const { completeStageResilient } = await import('../api/timing');
        const res = await completeStageResilient(stageId, []);
        if (!res.ok) {
          toast.error('Aşama tamamlanamadı: ' + (res.error ?? ''));
          return;
        }
        toast.success(`${data.station.name} tamamlandı`);
        refetch();
        refetchStages();
      } else {
        // Modal aç — onay verilince RPC payload ile çağrılır
        setMaterialModalStageId(stageId);
      }
    } finally {
      setStageCompleting(false);
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  MOBILE — Variant B B3 dark hero (early return)
  // ══════════════════════════════════════════════════════════════
  // AŞAMA DETAYLARI timeline — desktop + mobil TEK bileşenden (StageWorkflowTimeline).
  const stageTimelineEl = (
    <StageWorkflowTimeline
      combinedStages={combinedStages} displayStages={displayStages}
      stagesExpanded={stagesExpanded} setStagesExpanded={setStagesExpanded}
      stageMenuOpen={stageMenuOpen} setStageMenuOpen={setStageMenuOpen}
      completedCount={completedCount} order={order} profile={profile} isManager={isManager}
      panelAccent={panelAccent} panelTheme={panelTheme}
      handleCompleteProductionStage={handleCompleteProductionStage}
      handleAdminCompleteStage={handleAdminCompleteStage}
      handleAdminActivateStage={handleAdminActivateStage}
      handleAdminSkipStage={handleAdminSkipStage} handleRemoveStage={handleRemoveStage}
      setReassignOpen={setReassignOpen} setAddStageOpen={setAddStageOpen}
      refetch={refetch} refetchStages={refetchStages}
      fmtDate={fmtDate} isLaneOpen={isLaneOpen} toggleLane={toggleLane}
      activeDelivery={activeDelivery} setDeliveryModalOpen={setDeliveryModalOpen} stageCompleting={stageCompleting}
    />
  );

  if (!isDesktop) {
    const { OrderDetailMobileHandoff } = require('./OrderDetailMobileHandoff');
    const stageIdx = Math.min(Math.max(0, statusIdx), 4);
    // Desktop kartı bilgileri — zamanlama (operatör/kuyruk dk) + aşama detayları
    const mOperatorMins = Math.round((orderStages.reduce((s, x: any) => s + (x.active_work_seconds ?? 0), 0)) / 60);
    const mQueueMins = Math.round((orderStages.reduce((s, x: any) => s + (x.queue_waiting_seconds ?? 0), 0)) / 60);
    const mStageDetails = (orderStages ?? [])
      .filter((s: any) => s.status !== 'skipped')
      .map((s: any) => ({ name: s.station?.name ?? '—', status: s.status }));

    // Paralel şerit (desktop ile aynı mantık): çok-şeritte hero + aşama detayları
    // şerit-başına ayrılır. Tek-şeritte undefined → mobil bugünkü görünümü korur.
    const mLaneSummary = isMultiLane ? lanes.map((l: any) => ({
      lane:    l.lane,
      teeth:   laneTeethLabel(l.lane),
      station: laneWorkTypeLabel(l.lane),
      pct:     l.progressPct,
      done:    l.completedCount,
      total:   l.totalStages,
    })) : undefined;
    const mLaneStageGroups = isMultiLane ? lanes.map((l: any) => ({
      lane:   l.lane,
      teeth:  laneTeethLabel(l.lane),
      stages: (l.stages ?? []).map((s: any) => ({ name: s.station?.name ?? '—', status: s.status })),
    })) : undefined;

    // segments[0] route-group formatında (örn: '(doctor)') — MobilePanel'e map
    const panelKind = panelGroup === '(doctor)'  ? 'doctor'
                    : panelGroup === '(clinic)'  ? 'klinik'
                    : panelGroup === '(admin)'   ? 'exec'
                    : panelGroup === '(station)' ? 'teknisyen'
                    : 'lab';

    // Kalan gün
    const deliveryDateStr = (order as any).delivery_date as string | undefined;
    const remainingDays = deliveryDateStr ? Math.max(0, Math.ceil((new Date(deliveryDateStr).getTime() - Date.now()) / 86400000)) : 0;
    const fmtTr = (s?: string | null) => s ? new Date(s).toLocaleDateString(localeTag()) : '—';

    // Aktif istasyon — stageName/techName desktop branch'inde de kullanılıyor, dış scope'a alındı
    const techName = activeStage?.technician?.full_name ?? null;
    const techInit = techName ? techName.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : undefined;

    // Aktivite log — son 3 status history
    const activities = (order.status_history ?? []).slice(0, 3).map((h: any) => ({
      title: `${STATUS_CONFIG[h.status as WorkOrderStatus]?.label ?? h.status}${h.note ? ' · ' + h.note : ''}`,
      user: h.actor?.full_name ?? 'Sistem',
      time: h.created_at ? new Date(h.created_at).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' }) : '',
      kind: h.status === order.status ? 'prod' : 'done',
    }));

    // ── Teslimat aksiyonu (mobil) — desktop ile birebir aynı mantık ──
    const mDeliveryMethod = (order as any).delivery_method as 'kurye' | 'kargo' | 'elden' | null | undefined;
    let mDeliveryButton: { label: string; icon?: 'truck' | 'check'; onPress: () => void } | null = null;
    let mDeliveryStatusLabel: string | null = null;
    if (isManager && (order.status as string) === 'teslimata_hazir' && !activeDelivery) {
      if (mDeliveryMethod === 'elden') {
        mDeliveryButton = {
          label: 'Elden Teslim Edildi', icon: 'check',
          onPress: async () => {
            const ok = await confirmAsync('Elden Teslim', 'Sipariş elden teslim edildi olarak işaretlensin mi?', { confirmText: 'Teslim Edildi' });
            if (!ok) return;
            const { error: e } = await supabase
              .from('work_orders')
              .update({ status: 'teslim_edildi', delivered_at: new Date().toISOString() })
              .eq('id', order.id);
            if (e) { alert(`Hata: ${e.message}`); return; }
            refetch();
          },
        };
      } else {
        mDeliveryButton = { label: 'Kuryeye Gönder', icon: 'truck', onPress: () => setDeliveryModalOpen(true) };
      }
    }
    if (activeDelivery && activeDelivery.status !== 'teslim_edildi') {
      mDeliveryStatusLabel = activeDelivery.mode === 'external'
        ? `${activeDelivery.external_provider ?? 'Kargo'}${activeDelivery.external_tracking_no ? ` · ${activeDelivery.external_tracking_no}` : ''}`
        : 'Bizim kurye';
      if (isManager) {
        mDeliveryButton = {
          label: 'Teslim Edildi', icon: 'check',
          onPress: async () => {
            const r = await updateDeliveryStatus(activeDelivery.id, 'teslim_edildi');
            if (!r.ok) { alert(`Hata: ${r.error}`); return; }
            refetch();
          },
        };
      }
    }

    return (
      <>
      <OrderDetailMobileHandoff
        deliveryButton={mDeliveryButton}
        deliveryStatusLabel={mDeliveryStatusLabel}
        panel={panelKind}
        orderNumber={String((order as any).order_number ?? order.id)}
        patient={(order as any).patient_name ?? 'Hasta'}
        toothCount={(order.tooth_numbers ?? []).length}
        isUrgent={!!order.is_urgent}
        doctorName={doctorName}
        clinicName={clinicName}
        remainingDays={remainingDays}
        deliveryDate={fmtTr(deliveryDateStr)}
        currentStageIdx={stageIdx}
        totalStages={Math.max(orderStages.length, 5)}
        stageName={stageName}
        timelineSteps={isElden ? STATUS_LABELS_ELDEN : STATUS_LABELS}
        timelineCurrent={statusIdx}
        timelineTheme={progressTheme}
        operatorMins={mOperatorMins}
        queueMins={mQueueMins}
        stageDetails={mStageDetails}
        laneSummary={mLaneSummary}
        laneStageGroups={mLaneStageGroups}
        onCreateRevision={isManager && (order.status as string) === 'teslim_edildi' ? () => setRevisionOpen(true) : undefined}
        revisionLinks={[
          ...(revLinks.parent ? [{
            id: revLinks.parent.id, kind: 'parent' as const,
            label: `${revLinks.parent.order_number} revizyonu${(order as any).revision_responsible === 'lab' ? ' · garanti' : ''}`,
          }] : []),
          ...revLinks.children.map(ch => ({
            id: ch.id, kind: 'child' as const,
            label: `Revizyon: ${ch.order_number}${ch.revision_responsible === 'lab' ? ' · garanti' : ''}`,
          })),
        ]}
        onOpenRelated={handleNavigateRelated}
        technicianName={techName ?? undefined}
        technicianInitials={techInit}
        overdue={!!overdue}
        rating={(order.status as string) === 'teslim_edildi' ? orderRating : undefined}
        onAssignTech={isManager && reassignTargetStage ? () => setReassignOpen(true) : undefined}
        stageTimelineNode={stageTimelineEl}
        ringPercent={Math.round(progressPct)}
        remainingTime={remainingDays > 0 ? `${remainingDays}g` : 'Bugün'}
        teeth={order.tooth_numbers ?? []}
        material={(() => {
          const raw = (order as any).work_type as string | undefined;
          if (!raw) return 'Sipariş';
          const parts = raw.split(/,\s*/).map(s => s.trim()).filter(Boolean);
          const uniq = Array.from(new Set(parts));
          return uniq.length === 1 && parts.length > 1
            ? `${uniq[0]} · ${parts.length} diş`
            : uniq.join(', ');
        })()}
        materialSub={undefined}
        colorShade={(order as any).shade ?? '—'}
        attachmentCount={(order.photos ?? []).length}
        attachments={[]}
        attachmentsNode={
          <FilesList
            photos={[...(order.photos ?? []), ...inheritedFiles.photos]}
            signedUrls={{ ...(signedUrls ?? {}), ...inheritedFiles.urls }}
            thumbUrls={thumbUrls}
            workOrderId={order.id}
            accentColor={panelAccent}
            onUploaded={refetch}
          />
        }
        operatorProgress={Math.round(progressPct)}
        activities={activities.length > 0 ? activities : [
          { title: 'Sipariş alındı', user: 'Sistem', time: '—', kind: 'wait' },
        ]}
        doctorNote={(order as any).notes ?? null}
        onBack={() => {
          // Sipariş detayı Siparişler listesinin alt sayfasıdır → geri her zaman
          // o listeye döner (Özet'ten/karttan açılsa bile). Lab listesi 'all-orders'.
          if (panelGroup.startsWith('(')) {
            const ordersRoute = panelGroup === '(lab)' ? 'all-orders' : 'orders';
            router.replace(`/${panelGroup}/${ordersRoute}` as any);
          } else {
            // Top-level /order/[id] (bildirim/derin bağlantı) — panel bilinmiyor.
            safeBack('/');
          }
        }}
        onChat={() => setChatOpen(true)}
        cancelNode={<OrderClientActions order={order as any} panelGroup={panelGroup} onChanged={refetch} />}
        logisticsNode={
          <OrderLogisticsCard
            legs={deliveryLegs}
            accent={panelAccent}
            rowBg={softPanelBg}
            isManager={isManager}
            canCall={order.status !== 'iptal'}
            onCall={() => setCallCourierOpen(true)}
            onEditFee={leg => setFeeTarget(leg)}
            fmtDate={fmtDate}
            mapsApiKey={mapsApiKey}
            labAddress={labAddress}
            clinicAddress={clinicAddress}
            onOpenTracking={leg => {
              // courier-tracking rotası yalnız bu dört panelde var; istasyon vb.
              // panellerden gelindiğinde lab'a düşülür.
              const hasRoute = ['(admin)', '(lab)', '(clinic)', '(doctor)'].includes(panelGroup);
              const base = hasRoute ? panelGroup : '(lab)';
              router.push(`/${base}/courier-tracking?delivery=${leg.id}` as any);
            }}
            clientView={panelGroup === '(clinic)' || panelGroup === '(doctor)'}
            frameless
          />
        }
        activeTooth={activeTooth}
        activeToothDetail={(() => {
          if (activeTooth == null) return null;
          const items = (order.order_items ?? []) as Array<any>;
          // Tıklanan dişe ait order_item'lar — bir dişte birden çok işlem olabilir
          const matches = items.filter(it => Array.isArray(it.tooth_numbers) && it.tooth_numbers.includes(activeTooth));
          const matched = matches[0];
          const matchedNames = Array.from(new Set(matches.map(m => String(m.name ?? '').trim()).filter(Boolean)));
          // Eşleşme yoksa work_type'ı sadeleştirip fallback göster (legacy / tooth_numbers boş)
          const rawWt = (order as any).work_type as string | undefined;
          const wtParts = rawWt ? rawWt.split(/,\s*/).map(s => s.trim()).filter(Boolean) : [];
          const uniqueWt = Array.from(new Set(wtParts));
          const fallbackWt = uniqueWt.length === 1 && wtParts.length > 1
            ? `${uniqueWt[0]} · ${wtParts.length} diş`
            : uniqueWt.join(', ') || undefined;
          return {
            // Eşleşen item(ler) varsa hepsinin adını göster; yoksa work_type fallback
            itemName:  matchedNames.length ? matchedNames.join(' · ') : fallbackWt,
            // İkincil satır tekrarı önlemek için boş — diş bilgisi shade/price ile veriliyor
            workType:  undefined,
            shade:     matched?.shade ?? (order as any).shade ?? undefined,
            price:     matched?.price,
          };
        })()}
        toothChart={
          <View
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - chartW) > 2) setChartW(w);
            }}
          >
            <LivingToothChart
              order={toothChartOrder}
              containerWidth={chartW}
              accentColor={panelAccent}
              colorMap={toothColorMap}
              activeTooth={activeTooth}
              onToothPress={(fdi) => setActiveTooth(prev => (prev === fdi ? null : fdi))}
              forceJawMode={forcedJaw}
              frameless
            />
          </View>
        }
        onPrint={Platform.OS === 'web' ? () => handlePrintFull() : undefined}
        onPause={undefined}
        // teslimata_hazir + aktif teslimat: doğru aksiyon deliveryButton'da
        // (Kuryeye Gönder / Teslim Edildi) — genel ilerlet burada gizlenir,
        // yoksa aynı geçiş için iki buton çıkıyor (desktop ile aynı kural).
        onStageDone={canAdvance && !!nextStatus && !designApprovalPending
          && !activeDelivery && (order.status as string) !== 'teslimata_hazir'
          ? () => handleAdvanceStage() : undefined}
        onAddAttachment={undefined}
      />
      {/* Order-scoped chat modal — mobile branch için (Mesaj tab / sticky chat butonu) */}
      <OrderChatPopup
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        order={order}
        currentUserId={profile?.id ?? null}
        viewerType={profile?.user_type ?? null}
        panelAccent={panelAccent}
      />
      {/* Revizyon modalı — mobil (desktop ile aynı akış) */}
      <RevisionModal
        visible={revisionOpen}
        orderId={order.id}
        orderNumber={String((order as any).order_number ?? order.id)}
        labId={(order as any).lab_id ?? null}
        accentColor={panelAccent}
        onClose={() => setRevisionOpen(false)}
        onCreated={(newId) => { setRevisionOpen(false); handleNavigateRelated(newId); }}
      />

      {/* Kuryeye Gönder modalı — mobil (desktop ile aynı; kargo → sadece dış) */}
      {isManager && (
        <DeliveryModal
          visible={deliveryModalOpen}
          workOrderId={order.id}
          labId={(profile as any)?.lab_id ?? profile?.id ?? ''}
          accentColor={panelAccent}
          lockExternal={mDeliveryMethod === 'kargo'}
          editDelivery={editDeliveryTarget}
          onClose={() => { setDeliveryModalOpen(false); setEditDeliveryTarget(null); }}
          onCreated={() => { refetch(); }}
        />
      )}

      {/* Kurye Çağır — ara hareket (mobil) */}
      {isManager && (
        <DeliveryModal
          visible={callCourierOpen}
          workOrderId={order.id}
          labId={(profile as any)?.lab_id ?? profile?.id ?? ''}
          accentColor={panelAccent}
          extraLeg
          stageSnapshot={stageName}
          onClose={() => setCallCourierOpen(false)}
          onCreated={() => { setLegsTick(t => t + 1); refetch(); }}
        />
      )}

      {/* Kurye ücreti gir / düzelt (mobil) */}
      {isManager && (
        <DeliveryFeeModal
          leg={feeTarget}
          accentColor={panelAccent}
          onClose={() => setFeeTarget(null)}
          onSaved={() => { setLegsTick(t => t + 1); refetch(); }}
        />
      )}
      </>
    );
  }

  // ── Acil işaretle toggle ────────────────────────────────────────
  const handleToggleUrgent = async () => {
    if (!profile || togglingUrgent) return;
    setTogglingUrgent(true);
    const { error } = await supabase
      .from('work_orders')
      .update({ is_urgent: !order.is_urgent })
      .eq('id', order.id);
    setTogglingUrgent(false);
    if (error) toast.error(autoT('Güncellenemedi:') + ' ' + (error as any).message);
    else {
      toast.success(order.is_urgent ? 'Acil işareti kaldırıldı' : 'Acil olarak işaretlendi');
      refetch();
    }
  };

  // ── Print popup ─────────────────────────────────────────────────
  // ── İşi Beklet / Devam ettir ──────────────────────────────────────
  const submitHold = async () => {
    if (!order) return;
    setHoldBusy(true); setHoldErr(null);
    const res = await holdOrder({
      orderId:     order.id,
      reason:      holdReason,
      category:    holdCat,
      orderNumber: (order as any).order_number,
      doctorId:    (order as any).doctor_id,
      clinicId:    (order as any).doctor?.clinic?.id ?? null,
    });
    setHoldBusy(false);
    if (!res.ok) { setHoldErr(res.error ?? 'Bekletilemedi'); return; }
    setHoldOpen(false); setHoldReason('');
    refetch();
  };

  const submitResume = async () => {
    if (!order) return;
    setHoldBusy(true);
    const res = await resumeOrder(order.id);
    setHoldBusy(false);
    if (!res.ok) { setHoldErr(res.error ?? 'Devam ettirilemedi'); return; }
    refetch();
  };

  const handlePrintFull = async () => {
    setPrintOpen(true);
    // Önizleme HTML'ini hazırla (yeni A5 layout)
    if (typeof window !== 'undefined' && order) {
      try {
        const qrSvgHtml = (document.getElementById('dental-qr-container') as HTMLElement | null)
          ?.querySelector('svg')?.outerHTML ?? '';
        const html = await buildOrderPrintDoc(order, qrUrl, chatMessages, qrSvgHtml);
        setPrintPreviewHtml(html);
      } catch (e) {
        console.error('print preview build failed', e);
      }
    }
  };
  const handleActualPrint = () => {
    if (typeof window === 'undefined') return;
    const iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: themePage(panelTheme) }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120 }}>
      <View
        className={`w-full gap-4 ${isDesktop ? 'flex-row' : 'flex-col'}`}
      >
        {/* ═══════════ SOL KOLON ═══════════ */}
        <View className={`gap-4 ${isDesktop ? 'flex-1' : ''}`}>

          {/* DEĞERLENDİRME — teslim edilen iş, hekim/klinik (Faz 1)
              Tasarım: dashboard PendingReviewsCard ile aynı dil (panel accent gradient +
              beyaz glow + yıldız dairesi + kicker + ok çipi). */}
          {order?.status === 'teslim_edildi' && _isDoctorOrClinic && (
            <Pressable onPress={() => setReviewOpen(true)} style={{ cursor: 'pointer' as any }}>
              <View style={{
                borderRadius: 28, overflow: 'hidden', position: 'relative',
                backgroundColor: '#0C8F56',
                // @ts-ignore web gradient — panel accent (deep → primary)
                backgroundImage: `linear-gradient(135deg, #0C8F56 0%, ${panelAccent} 100%)`,
              }}>
                {/* Ambient glow */}
                <View pointerEvents="none" style={{ position: 'absolute', top: -30, end: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: '#FFFFFF', opacity: 0.12 }} />

                <View style={{ paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                    <Star size={18} color="#FFFFFF" strokeWidth={1.8} fill={myReview ? '#FFFFFF' : 'transparent'} />
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View className="flex-row items-center" style={{ gap: 6 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' }} />
                      <Text style={{ fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Değerlendir</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginTop: 3 }}>
                      {myReview ? 'Değerlendirmeni gör / düzenle' : 'Bu işi değerlendir'}
                    </Text>
                    {myReview ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} size={13} color="#FFFFFF" strokeWidth={1.6} fill={myReview.overall >= n ? '#FFFFFF' : 'transparent'} />
                        ))}
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>Uyum, estetik, oklüzyon ve daha fazlasını puanla</Text>
                    )}
                  </View>

                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowUpRight size={14} color="#FFFFFF" strokeWidth={1.8} />
                  </View>
                </View>
              </View>
            </Pressable>
          )}

          {/* DEĞERLENDİRME (salt-okunur) — lab/admin teslim edilen işin puanını görür (Faz 4) */}
          {order?.status === 'teslim_edildi' && !_isDoctorOrClinic && (
            <OrderReviewsSection workOrderId={id} accent={panelAccent} />
          )}

          {/* HERO — Clean paper aesthetic: cream zemin + coral accent stripe + soft glow */}
          <View
            className="rounded-[28px] p-8 overflow-hidden relative border border-black/[0.06]"
            style={{
              backgroundColor: heroPalette.bg,
              // @ts-ignore web gradient
              backgroundImage: panelTheme === 'exec'
                ? undefined
                : `linear-gradient(180deg, ${heroPalette.bg} 0%, ${heroPalette.gradEnd} 200%)`,
            }}
          >
            <View className="flex-row justify-between items-start mb-6 flex-wrap gap-4">
              <View className="flex-1" style={{ minWidth: 200 }}>
                <View className="flex-row items-center gap-2 mb-2">
                  <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.32, color: heroPalette.kicker }}>
                    Hasta · {allTeeth.length} diş çalışması
                  </Text>
                  {order.is_urgent && (
                    <View className="flex-row items-center gap-1.5 px-2.5 py-0.5 rounded-full" style={{ backgroundColor: heroPalette.dark ? 'rgba(255,255,255,0.20)' : 'rgba(217,75,75,0.12)' }}>
                      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: heroPalette.dark ? '#FFFFFF' : '#9C2E2E' }} />
                      <Text className="text-[11px] font-medium" style={{ color: heroPalette.dark ? '#FFFFFF' : '#9C2E2E' }}>Acil</Text>
                    </View>
                  )}
                </View>
                {!!patientAgeGenderLabel(order) && (
                  <Text style={{ fontSize: 13, fontWeight: '500', marginBottom: 3, color: heroPalette.dark ? 'rgba(255,255,255,0.6)' : '#9A9A9A' }}>
                    {patientAgeGenderLabel(order)}
                  </Text>
                )}
                <Text style={{ ...DISPLAY, fontSize: 54, letterSpacing: -2.16, lineHeight: 51, color: heroPalette.dark ? '#FFFFFF' : '#0A0A0A' }}>
                  {order.patient_name ? titleCaseTR(order.patient_name) : '—'}
                </Text>
                <Text className="text-[13px] mt-2" style={{ color: heroPalette.dark ? 'rgba(255,255,255,0.85)' : '#3C3C3C' }}>
                  {doctorName} · {clinicName}
                </Text>
                <Text className="text-[12px] mt-1" style={{ color: heroPalette.dark ? 'rgba(255,255,255,0.65)' : '#6B6B6B' }}>
                  Giriş: {fmtDate(order.created_at)}
                </Text>

                {/* Revizyon bağlantıları — karşılıklı, tıklanınca ilgili siparişe gider */}
                {(revLinks.parent || revLinks.children.length > 0) && (
                  <View className="flex-row flex-wrap items-center mt-2.5" style={{ gap: 6 }}>
                    {revLinks.parent && (
                      <Pressable onPress={() => handleNavigateRelated(revLinks.parent!.id)}>
                        <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: heroPalette.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.05)',
                                   ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <CornerUpLeft size={11} color={heroPalette.dark ? '#FFFFFF' : '#6B6B6B'} strokeWidth={2} />
                          <Text className="text-[11.5px] font-medium" style={{ color: heroPalette.dark ? '#FFFFFF' : '#2C2C2C' }}>
                            {revLinks.parent.order_number} revizyonu
                            {(order as any).revision_no ? ` · #${(order as any).revision_no}` : ''}
                            {(order as any).revision_responsible === 'lab' ? ' · garanti' : ''}
                          </Text>
                        </View>
                      </Pressable>
                    )}
                    {revLinks.children.map(ch => (
                      <Pressable key={ch.id} onPress={() => handleNavigateRelated(ch.id)}>
                        <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: heroPalette.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.05)',
                                   ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <RotateCcw size={11} color={heroPalette.dark ? '#FFFFFF' : '#6B6B6B'} strokeWidth={2} />
                          <Text className="text-[11.5px] font-medium" style={{ color: heroPalette.dark ? '#FFFFFF' : '#2C2C2C' }}>
                            Revizyon: {ch.order_number}
                            {ch.revision_responsible === 'lab' ? ' · garanti' : ''}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Tedavi zinciri (devam siparişi) — mavi; asıl iş ↔ devam siparişleri */}
                {(contLinks.parent || contLinks.children.length > 0) && (
                  <View className="flex-row flex-wrap items-center mt-2.5" style={{ gap: 6 }}>
                    {contLinks.parent && (
                      <Pressable onPress={() => handleNavigateRelated(contLinks.parent!.id)}>
                        <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: heroPalette.dark ? 'rgba(255,255,255,0.16)' : 'rgba(53,99,168,0.12)',
                                   ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <CornerUpLeft size={11} color={heroPalette.dark ? '#FFFFFF' : '#3563A8'} strokeWidth={2} />
                          <Text className="text-[11.5px] font-medium" style={{ color: heroPalette.dark ? '#FFFFFF' : '#3563A8' }}>
                            Asıl iş: {contLinks.parent.order_number}
                          </Text>
                        </View>
                      </Pressable>
                    )}
                    {contLinks.children.map(ch => (
                      <Pressable key={ch.id} onPress={() => handleNavigateRelated(ch.id)}>
                        <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: heroPalette.dark ? 'rgba(255,255,255,0.16)' : 'rgba(53,99,168,0.12)',
                                   ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <Layers size={11} color={heroPalette.dark ? '#FFFFFF' : '#3563A8'} strokeWidth={2} />
                          <Text className="text-[11.5px] font-medium" style={{ color: heroPalette.dark ? '#FFFFFF' : '#3563A8' }}>
                            Devam: {ch.order_number}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
              {/* İşi beklemede — gecikme yerine BEKLEMEDE + neden (sayaç durdu) */}
              {onHold && order.status !== 'teslim_edildi' && order.status !== 'iptal' && (
                <View className="items-end" style={{ flexShrink: 0, maxWidth: 260 }}>
                  <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.32, color: '#E89B2A' }}>
                    Beklemede
                  </Text>
                  <View className="flex-row items-baseline mt-1.5" style={{ gap: 8 }}>
                    <Text style={{ ...DISPLAY, fontSize: 56, letterSpacing: -2.24, lineHeight: 52, color: heroPalette.dark ? '#FFFFFF' : '#0A0A0A' }}>
                      {heldDays}
                    </Text>
                    <Text className="uppercase" style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '500', fontSize: 11, letterSpacing: 2.2, color: heroPalette.dark ? 'rgba(255,255,255,0.70)' : '#6B6B6B' }}>
                      gün
                    </Text>
                  </View>
                  <Text className="text-[12px] mt-1" style={{ textAlign: 'end' as any, color: heroPalette.dark ? 'rgba(255,255,255,0.80)' : '#3C3C3C' }}>
                    {holdCategoryLabel((order as any).hold_category)}
                  </Text>
                  {!!(order as any).hold_reason && (
                    <Text className="text-[11px] mt-0.5" numberOfLines={2} style={{ textAlign: 'end' as any, color: heroPalette.dark ? 'rgba(255,255,255,0.60)' : '#6B6B6B' }}>
                      {(order as any).hold_reason}
                    </Text>
                  )}
                  {heldByClient && (
                    <Text className="text-[10.5px] mt-1" style={{ textAlign: 'end' as any, color: '#E89B2A' }}>
                      Teslim tarihi devam edince ötelenecek
                    </Text>
                  )}
                </View>
              )}
              {/* Kalan gün — sağ üst, başlıkla hizalı (dar header'da bile sabit kalır) */}
              {!onHold && daysLeft != null && order.status !== 'teslim_edildi' && order.status !== 'iptal' && (
                <View className="items-end" style={{ flexShrink: 0 }}>
                  <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.32, color: heroPalette.kicker }}>
                    {overdue ? 'Gecikti' : 'Kalan'}
                  </Text>
                  <View className="flex-row items-baseline mt-1.5" style={{ gap: 8 }}>
                    <Text style={{ ...DISPLAY, fontSize: 56, letterSpacing: -2.24, lineHeight: 52, color: heroPalette.dark ? '#FFFFFF' : '#0A0A0A' }}>
                      {Math.abs(daysLeft)}
                    </Text>
                    <Text className="uppercase" style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '500', fontSize: 11, letterSpacing: 2.2, color: heroPalette.dark ? 'rgba(255,255,255,0.70)' : '#6B6B6B' }}>
                      gün
                    </Text>
                  </View>
                  <Text className="text-[12px] mt-1" style={{ color: heroPalette.dark ? 'rgba(255,255,255,0.80)' : '#3C3C3C' }}>
                    Teslim {fmtDate(order.delivery_date)}
                  </Text>
                </View>
              )}

              {/* QR — hero'nun sağ üst köşesi; taranabilirlik için her zaman beyaz zemin */}
              <Pressable
                onPress={handlePrintFull}
                className="items-center"
                style={{ flexShrink: 0 }}
                accessibilityLabel={`Sipariş ${order.order_number} QR kodu · yazdır`}
              >
                <View
                  style={{
                    width: 78, height: 78, borderRadius: 16,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                    alignItems: 'center', justifyContent: 'center',
                    padding: 6,
                    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' } as any : {}),
                  }}
                >
                  {Platform.OS === 'web' ? (
                    // @ts-ignore — RN-Web img passthrough
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrUrl)}&margin=1&bgcolor=ffffff&color=0a0a0a`}
                      alt="QR"
                      width={66}
                      height={66}
                      style={{ display: 'block', borderRadius: 3 }}
                    />
                  ) : (
                    <Image
                      source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrUrl)}&margin=1&bgcolor=ffffff&color=0a0a0a` }}
                      style={{ width: 66, height: 66, borderRadius: 3 }}
                      resizeMode="contain"
                    />
                  )}
                </View>
                <Text
                  className="text-[10px] font-mono font-semibold mt-1.5"
                  numberOfLines={1}
                  style={{ color: heroPalette.dark ? 'rgba(255,255,255,0.70)' : '#6B6B6B' }}
                >
                  #{order.order_number}
                </Text>
              </Pressable>
            </View>

            {/* Aksiyonlar — kendi tam-genişlik satırı, taşarsa sarar (countdown'ı aşağı itmez) */}
            <View className="mb-6">
                <View className="flex-row items-center flex-wrap gap-2">
                  <SupportButton
                    variant="icon"
                    size="sm"
                    onDark={heroPalette.dark}
                    accessibilityLabel="Bu vaka için destek aç"
                    context={{
                      source: 'order',
                      order_id: order.id,
                      order_number: String((order as any).order_number ?? ''),
                      patient_name: order.patient_name ?? undefined,
                      doctor_name: doctorName,
                      clinic_name: clinicName,
                      stage_key: stageName,
                      stage_label: stageName,
                    }}
                    workOrderId={order.id}
                    stageKey={stageName}
                    subjectHint={`Vaka #${(order as any).order_number ?? ''} · `}
                  />
                  <Pressable onPress={handlePrintFull} className={`w-8 h-8 rounded-full items-center justify-center ${heroPalette.dark ? 'bg-white/20' : 'bg-black/[0.06]'}`}>
                    <Printer size={14} color={heroPalette.dark ? '#FFFFFF' : '#0A0A0A'} strokeWidth={1.8} />
                  </Pressable>
                  <OrderClientActions order={order as any} panelGroup={panelGroup} compact onChanged={refetch} onDark={heroPalette.dark} />
                  {/* İşi Beklet / Devam ettir — lab tarafı. Hekim kaynaklı beklemede
                      gecikme sayacı durur, devam edince teslim tarihi ötelenir. */}
                  {(panelGroup === '(lab)' || panelGroup === '(admin)')
                    && order.status !== 'teslim_edildi' && order.status !== 'iptal' && (
                    onHold ? (
                                              <PillBtn onDark={heroPalette.dark} variant="primary" size="sm" icon={Play} onPress={submitResume} disabled={holdBusy}>
                          {holdBusy ? 'Devam ediliyor…' : 'Devam ettir'}
                        </PillBtn>
                    ) : (
                                              <PillBtn onDark={heroPalette.dark} variant="surface" size="sm" icon={Pause} onPress={() => { setHoldErr(null); setHoldOpen(true); }}>
                          İşi beklet
                        </PillBtn>
                    )
                  )}
                  {/* Henüz triajlanmamış → "Planlamayı yap" — LAB yeni route'a, diğerleri modal */}
                  {canTriage && needsTriage && (
                    <Pressable onPress={() => {
                      if (_panelGroupEarly === '(lab)' || _panelGroupEarly === '(admin)') router.push(`/${_panelGroupEarly}/order/plan/${id}` as any);
                      else setTriageOpen(true);
                    }}>
                      <PillBtn onDark={heroPalette.dark} variant="primary" size="sm" icon={ListChecks}>
                        Planlamayı yap & başlat
                      </PillBtn>
                    </Pressable>
                  )}
                  {/* Yeniden Planla — triajlı + üretim başlamamış (manager/admin) */}
                  {canReplan && !needsTriage && (
                                          <PillBtn onDark={heroPalette.dark} variant="surface" size="sm" icon={ListChecks} onPress={() => setReplanOpen(true)}>
                        Yeniden Planla
                      </PillBtn>
                  )}
                  {/* Onay bekliyor rozeti */}
                  {designApprovalPending && (
                    <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(232,155,42,0.14)' }}>
                      <Clock size={12} color="#B7791F" strokeWidth={1.8} />
                      <Text className="text-[12px] font-semibold" style={{ color: '#B7791F' }}>Hekim onayı bekliyor</Text>
                    </View>
                  )}
                  {/* Hekim Onayına Gönder — lab manager, triajlı, henüz pending/approved değil */}
                  {canSendDesignApproval && !needsTriage && (
                                          <PillBtn onDark={heroPalette.dark} variant="surface" size="sm" icon={UserCheck} onPress={handleSendDesignApproval} disabled={sendingApproval}>
                        {sendingApproval ? 'Gönderiliyor…' : 'Hekim Onayına Gönder'}
                      </PillBtn>
                  )}
                  {/* Manuel "Final QC'a geç" — aktif teslimat varken gizli (delivery flow yönetir).
                      teslimata_hazir'da da gizli: orada doğru aksiyon "Kuryeye Gönder" /
                      "Elden Teslim Edildi" (aşağıdaki blok). Aksi halde ikisi birden çıkıp
                      aynı geçiş için iki buton oluyordu — üstelik bu buton kurye akışını
                      atlayarak teslimat kaydı oluşturmadan siparişi teslim edilmiş yapıyordu. */}
                  {canAdvance && nextStatus && !needsTriage && !hasPendingProductionStages && !activeDelivery && !designApprovalPending
                    && (order.status as string) !== 'teslimata_hazir' && (
                                          <PillBtn onDark={heroPalette.dark} variant="primary" size="sm" icon={Check} onPress={handleAdvanceStage} disabled={advancing}>
                        {advancing ? 'Güncelleniyor…' : `${nextStatusLabel}'a geç`}
                      </PillBtn>
                  )}
                  {/* Aşamalar bitmemişse manuel butonu yerine bilgilendirici chip */}
                  {hasPendingProductionStages && (
                    <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: heroPalette.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.05)' }}>
                      <Clock size={12} color={heroPalette.dark ? '#FFFFFF' : '#6B6B6B'} strokeWidth={1.8} />
                      <Text className="text-[12px] font-medium" style={{ color: heroPalette.dark ? '#FFFFFF' : '#2C2C2C' }}>
                        {completedCount}/{totalStages} aşama tamamlandı
                      </Text>
                    </View>
                  )}
                  {!nextStatus && (
                    <View className="flex-row items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: heroPalette.dark ? 'rgba(255,255,255,0.20)' : 'rgba(16,185,129,0.12)' }}>
                      <Check size={12} color={heroPalette.dark ? '#FFFFFF' : '#0F6E50'} strokeWidth={2.4} />
                      <Text className="text-[12px] font-medium" style={{ color: heroPalette.dark ? '#FFFFFF' : '#0F6E50' }}>Teslim edildi</Text>
                    </View>
                  )}
                  {/* Revizyon oluştur — teslim edilmiş siparişte hekim revize isterse.
                      Orijinal kapalı kalır, bağlı yeni sipariş planlamaya düşer. */}
                  {isManager && (order.status as string) === 'teslim_edildi' && (
                                          <PillBtn onDark={heroPalette.dark} variant="ghost" size="sm" icon={RotateCcw} onPress={() => setRevisionOpen(true)}>
                        Revizyon Oluştur
                      </PillBtn>
                  )}
                  {/* Devam siparişi — teslim edilmiş işin planlı sonraki aşaması (ör.
                      geçici→nihai). Revizyon DEĞİL: hasta+diş+dosyalar dolu gelir,
                      iş tipi/materyal sıfırdan seçilir; tam ücretli yeni sipariş. */}
                  {(isManager || _isDoctorOrClinic) && (order.status as string) === 'teslim_edildi' && (
                                          <PillBtn onDark={heroPalette.dark} variant="ghost" size="sm" icon={Layers} onPress={() => startContinuation(order.id)} disabled={!!contStarting}>
                        {contStarting ? 'Açılıyor…' : 'Devam Siparişi'}
                      </PillBtn>
                  )}
                  {/* Teslimata hazır + henüz teslimat yok → teslim şekline göre aksiyon */}
                  {isManager && (order.status as string) === 'teslimata_hazir' && !activeDelivery && (
                    (order as any).delivery_method === 'elden' ? (
                      // Elden teslim → kurye yok, direkt teslim
                      <Pressable
                        onPress={async () => {
                          const ok = await confirmAsync('Elden Teslim', 'Sipariş elden teslim edildi olarak işaretlensin mi?', { confirmText: 'Teslim Edildi' });
                          if (!ok) return;
                          const { error: e } = await supabase
                            .from('work_orders')
                            .update({ status: 'teslim_edildi', delivered_at: new Date().toISOString() })
                            .eq('id', order.id);
                          if (e) { alert(`Hata: ${e.message}`); return; }
                          refetch();
                        }}
                      >
                        <PillBtn onDark={heroPalette.dark} variant="primary" size="sm" icon={Check}>
                          Elden Teslim Edildi
                        </PillBtn>
                      </Pressable>
                    ) : (
                                              <PillBtn onDark={heroPalette.dark} variant="primary" size="sm" onPress={() => setDeliveryModalOpen(true)}>
                          Kuryeye Gönder
                        </PillBtn>
                    )
                  )}
                  {/* Aktif teslimat varsa status + manuel "Teslim edildi" */}
                  {activeDelivery && activeDelivery.status !== 'teslim_edildi' && (
                    <View className="flex-row items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(234,122,76,0.12)' }}>
                      <Truck size={12} color="#9C5E0E" strokeWidth={2} />
                      <Text className="text-[12px] font-medium" style={{ color: '#9C5E0E' }}>
                        {activeDelivery.mode === 'external'
                          ? `${activeDelivery.external_provider ?? 'Kargo'}${activeDelivery.external_tracking_no ? ` · ${activeDelivery.external_tracking_no}` : ''}`
                          : 'Bizim kurye'}
                      </Text>
                    </View>
                  )}
                  {isManager && activeDelivery && activeDelivery.status !== 'teslim_edildi' && (
                    <Pressable
                      onPress={async () => {
                        const r = await updateDeliveryStatus(activeDelivery.id, 'teslim_edildi');
                        if (!r.ok) { alert(`Hata: ${r.error}`); return; }
                        refetch();
                      }}
                    >
                      <PillBtn onDark={heroPalette.dark} variant="primary" size="sm" icon={Check}>
                        Teslim Edildi
                      </PillBtn>
                    </Pressable>
                  )}
                  {/* BanaBiKurye — teslim adresini/notu düzenle (/edit-order) */}
                  {isManager && activeDelivery && activeDelivery.external_provider === 'BanaBiKurye'
                    && activeDelivery.external_tracking_no && activeDelivery.status !== 'teslim_edildi' && (
                    <Pressable
                      onPress={() => {
                        setEditDeliveryTarget({ id: activeDelivery.id, orderId: String(activeDelivery.external_tracking_no) });
                        setDeliveryModalOpen(true);
                      }}
                    >
                      <PillBtn onDark={heroPalette.dark} variant="surface" size="sm" icon={Pencil}>Düzenle</PillBtn>
                    </Pressable>
                  )}
                  {/* BanaBiKurye — canlı durum senkronu (polling) */}
                  {isManager && activeDelivery && activeDelivery.external_provider === 'BanaBiKurye'
                    && activeDelivery.external_tracking_no && activeDelivery.status !== 'teslim_edildi' && (
                    <Pressable
                      disabled={bbkTracking}
                      onPress={async () => {
                        setBbkTracking(true);
                        const { data, error: e } = await supabase.functions.invoke('banabikurye-dispatch', {
                          body: { action: 'track', order_id: activeDelivery.external_tracking_no },
                        });
                        if (e || !(data as any)?.ok) {
                          setBbkTracking(false);
                          toast.error((data as any)?.message ?? e?.message ?? 'Durum alınamadı');
                          return;
                        }
                        const bbk = (data as any)?.bbk_status ?? '—';
                        const mapped = (data as any)?.delivery_status ?? null;
                        if (mapped && mapped !== activeDelivery.status) {
                          const r = await updateDeliveryStatus(activeDelivery.id, mapped);
                          setBbkTracking(false);
                          if (!r.ok) { toast.error(autoT('Güncellenemedi:') + ' ' + (r.error ?? '')); return; }
                          toast.success(`BanaBiKurye: ${bbk} → durum güncellendi`);
                          refetch(); refetchStages();
                        } else {
                          setBbkTracking(false);
                          toast.success(`BanaBiKurye durumu: ${bbk}`);
                        }
                      }}
                    >
                      <PillBtn onDark={heroPalette.dark} variant="surface" size="sm" icon={RotateCcw}>
                        {bbkTracking ? 'Sorgulanıyor…' : 'Durumu Güncelle'}
                      </PillBtn>
                    </Pressable>
                  )}
                  {/* Shipink — takip durumunu sorgula ve teslimata yaz */}
                  {isManager && activeDelivery && activeDelivery.external_provider === 'Shipink'
                    && activeDelivery.external_tracking_no && activeDelivery.status !== 'teslim_edildi' && (
                    <Pressable
                      disabled={shpBusy}
                      onPress={async () => {
                        setShpBusy(true);
                        const { data, error: e } = await supabase.functions.invoke('shipink-dispatch', {
                          body: { action: 'check', tracking_number: activeDelivery.external_tracking_no, delivery_id: activeDelivery.id },
                        });
                        setShpBusy(false);
                        if (e || !(data as any)?.ok) {
                          toast.error((data as any)?.message ?? e?.message ?? 'Durum alınamadı');
                          return;
                        }
                        const raw    = (data as any)?.status_raw || '—';
                        const mapped = (data as any)?.status ?? null;
                        // Eşleme edge function'da yapılıp kayda yazıldı; burada
                        // yalnız ekranı tazeliyoruz. Tanınmayan durumda kayıt
                        // DEĞİŞMEZ — ham metni göstermek yanlış statü yazmaktan iyi.
                        if (mapped && mapped !== activeDelivery.status) {
                          toast.success(`Shipink: ${raw} → durum güncellendi`);
                          refetch(); refetchStages();
                        } else {
                          toast.success(`Shipink durumu: ${raw}`);
                        }
                      }}
                    >
                      <PillBtn onDark={heroPalette.dark} variant="surface" size="sm" icon={RotateCcw}>
                        {shpBusy ? 'Sorgulanıyor…' : 'Durumu Güncelle'}
                      </PillBtn>
                    </Pressable>
                  )}
                  {/* Shipink — kutuya yapıştırılacak kargo etiketi (barkod).
                      Bağlantı kayıtta yoksa (etiket gönderi anında hazır
                      olmayabiliyor) gönderi id'siyle yeniden sorulur. */}
                  {isManager && activeDelivery && activeDelivery.external_provider === 'Shipink'
                    && (activeDelivery.external_label_url || activeDelivery.external_tracking_code) && (
                    <Pressable
                      disabled={shpBusy}
                      onPress={async () => {
                        let url: string | null = activeDelivery.external_label_url ?? null;
                        if (!url) {
                          setShpBusy(true);
                          const { data, error: e } = await supabase.functions.invoke('shipink-dispatch', {
                            body: { action: 'label', shipment_id: activeDelivery.external_tracking_code },
                          });
                          setShpBusy(false);
                          if (e || !(data as any)?.ok) {
                            toast.error((data as any)?.message ?? e?.message ?? 'Etiket alınamadı');
                            return;
                          }
                          url = (data as any)?.label_url ?? null;
                          if (url) {
                            await supabase.from('deliveries').update({ external_label_url: url }).eq('id', activeDelivery.id);
                            refetch();
                          }
                        }
                        if (!url) { toast.error('Etiket henüz hazır değil — birkaç dakika sonra tekrar deneyin.'); return; }
                        if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.open(url, '_blank'); }
                        else await Linking.openURL(url);
                      }}
                    >
                      <PillBtn onDark={heroPalette.dark} variant="surface" size="sm" icon={Printer}>
                        {shpBusy ? 'Alınıyor…' : 'Kargo Etiketi'}
                      </PillBtn>
                    </Pressable>
                  )}
                  {/* Teslimatı iptal et → "Kuryeye Gönder" durumuna geri döner (yeniden çağrılabilir) */}
                  {isManager && activeDelivery && activeDelivery.status !== 'teslim_edildi' && (
                    <Pressable
                      disabled={cancelingDelivery}
                      onPress={async () => {
                        const ok = await confirmAsync('Teslimatı İptal Et', 'Teslimat iptal edilsin mi? Sipariş "Kuryeye Gönder" durumuna döner, kurye yeniden çağrılabilir.', { confirmText: 'İptal Et', destructive: true });
                        if (!ok) return;
                        setCancelingDelivery(true);
                        // BanaBiKurye ise gerçek siparişi de iptal et (best-effort)
                        if (activeDelivery.external_provider === 'BanaBiKurye' && activeDelivery.external_tracking_no) {
                          try {
                            await supabase.functions.invoke('banabikurye-dispatch', {
                              body: { action: 'cancel', order_id: activeDelivery.external_tracking_no },
                            });
                          } catch { /* yine de yerel iptal et */ }
                        }
                        // Shipink ise gerçek gönderiyi de iptal et (best-effort).
                        // İptal ucu takip numarasını DEĞİL gönderi id'sini ister.
                        if (activeDelivery.external_provider === 'Shipink' && activeDelivery.external_tracking_code) {
                          try {
                            await supabase.functions.invoke('shipink-dispatch', {
                              body: { action: 'cancel', shipment_id: activeDelivery.external_tracking_code },
                            });
                          } catch { /* yine de yerel iptal et */ }
                        }
                        const r = await updateDeliveryStatus(activeDelivery.id, 'iptal');
                        setCancelingDelivery(false);
                        if (!r.ok) { toast.error('İptal edilemedi: ' + (r.error ?? '')); return; }
                        toast.success('Teslimat iptal edildi — kurye yeniden çağrılabilir.');
                        refetch(); refetchStages();
                      }}
                    >
                      <PillBtn onDark={heroPalette.dark} variant="surface" size="sm" icon={CloseIcon}>
                        {cancelingDelivery ? 'İptal ediliyor…' : 'Teslimatı İptal Et'}
                      </PillBtn>
                    </Pressable>
                  )}
                </View>
            </View>

            {/* Status timeline — "Hazır" yok; 4. adım Kurye (elden teslimde gizli) */}
            <StepsTimelineX
              steps={isElden ? STATUS_LABELS_ELDEN : STATUS_LABELS}
              current={statusIdx}
              theme={progressTheme}
              variant={heroPalette.dark ? 'dark' : 'light'}
              // Renkli (yeşil) hero'da accent = hero-bg olacağından daireler kaybolur:
              // beyaz daire + koyu-yeşil işaret kullan.
              accentColor={heroPalette.dark ? '#FFFFFF' : undefined}
              markColor={heroPalette.dark ? '#0C8F56' : undefined}
            />


            {/* NOT: "Planlamayı Onayla" bloğu kaldırıldı. Planlamayı kaydetmek
                artık approve_triage'ı da çağırıyor (TriageModal.handleSave), yani
                ayrı bir onay adımı yok. Eski buton iş başladıktan sonra bile
                görünüyordu ve basılırsa aktif aşamanın yanına ikinci bir aşama
                açıyordu. */}

            {/* Canlı kurye haritası — internal teslimat aktif iken */}
            {activeDelivery
              && activeDelivery.mode === 'internal'
              && activeDelivery.status !== 'teslim_edildi'
              && activeDelivery.status !== 'iptal' && (
              <View style={{ marginTop: 4, marginHorizontal: -16, marginBottom: -16 }}>
                <CourierLiveMap
                  deliveryId={activeDelivery.id}
                  destinationLabel={
                    (activeDelivery as any)?.destination_address
                    ?? (order as any)?.doctor?.full_name
                    ?? undefined
                  }
                  accent={panelAccent}
                  height={320}
                />
              </View>
            )}

            {/* NOT: Üretim sub-timeline (peach band) kaldırıldı —
                aynı bilgi siyah "Aşama Detayları" kartının içinde collapse olarak duruyor. */}
          </View>

          {/* AKTİF İSTASYON + AŞAMA DETAYLARI — admin paneli için deep coral gradient,
             diğer temalarda klasik siyah kart */}
          <View
            className="rounded-3xl overflow-hidden"
            style={{
              backgroundColor: panelTheme === 'exec' ? '#141C2B'
                : (panelTheme === 'clinic' || panelTheme === 'doctor') ? '#2F313F'
                : '#0A0A0A',
              ...(panelTheme === 'exec' && Platform.OS === 'web'
                ? {
                    // @ts-ignore — radial glow + diagonal kobalt overlay
                    backgroundImage: [
                      `radial-gradient(circle at 95% 5%, rgba(71,113,171,0.38) 0%, rgba(71,113,171,0) 50%)`,
                      `radial-gradient(circle at 0% 100%, rgba(80,136,196,0.20) 0%, rgba(80,136,196,0) 45%)`,
                      `linear-gradient(135deg, #223252 0%, #0F1626 100%)`,
                    ].join(', '),
                  } as any
                : {}),
              // Klinik/hekim — özet TasksCard ile aynı: charcoal + deep-yeşil diyagonal overlay
              ...((panelTheme === 'clinic' || panelTheme === 'doctor') && Platform.OS === 'web'
                ? { backgroundImage: `linear-gradient(135deg, #2F313F 0%, #0C8F5633 100%)` } as any
                : {}),
            }}
          >
            {/* Üst sıra — şu an + sorumlu */}
            <View className="p-6 flex-row items-center gap-5 flex-wrap">
              <PercentRingX value={progressPct} size={88} theme={progressTheme} />
              <View className="flex-1" style={{ minWidth: 160 }}>
                <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.1, color: panelAccent }}>
                  Şu an
                </Text>
                <Text className="text-white mt-0.5" style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.4 }}>
                  {isMultiLane ? `${lanes.length} iş şeridi · paralel` : `${currentStation}${currentStationSuffix}`}
                </Text>
                {overdue && (
                  <View className="flex-row items-center gap-1.5 mt-1.5">
                    <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#FFD86B' }} />
                    <Text className="text-[12px] font-medium" style={{ color: '#FFD86B' }}>
                      {Math.abs(daysLeft ?? 0)} gün gecikti
                    </Text>
                  </View>
                )}
              </View>
              {/* Sorumlu = aktif aşamaya atanan teknisyen — teslim edildiyse değerlendirme yıldızları */}
              {(() => {
                if (order?.status === 'teslim_edildi') {
                  const avg = orderRating?.avg ?? 0;
                  const cnt = orderRating?.count ?? 0;
                  const rounded = Math.round(avg);
                  return (
                    <View className="flex-row items-center gap-2.5 pl-3.5 pr-3.5 py-2 rounded-full bg-white/10">
                      <View className="flex-row" style={{ gap: 2 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} size={16} strokeWidth={1.6} color="#FFD86B" fill={cnt > 0 && rounded >= n ? '#FFD86B' : 'transparent'} />
                        ))}
                      </View>
                      <View>
                        <Text className="text-[13px] font-medium text-white">{cnt > 0 ? avg.toFixed(1) : '—'}</Text>
                        <Text className="text-[10px] text-white/55">{cnt > 0 ? `${cnt} değerlendirme` : 'Değerlendirilmedi'}</Text>
                      </View>
                    </View>
                  );
                }
                const techName = activeStage?.technician?.full_name ?? null;
                if (techName) {
                  return (
                    <View className="flex-row items-center gap-2.5 ps-2 pe-3.5 py-2 rounded-full bg-white/10">
                      <Avatar name={techName} size={32} bg={panelAccent} fg="#0A0A0A" />
                      <View>
                        <Text className="text-[13px] font-medium text-white">{techName.split(' ')[0]}</Text>
                        <Text className="text-[10px] text-white/55">Sorumlu</Text>
                      </View>
                    </View>
                  );
                }
                return (
                  <Pressable
                    onPress={isManager && reassignTargetStage ? () => setReassignOpen(true) : undefined}
                    className="flex-row items-center gap-2.5 ps-2 pe-3.5 py-2 rounded-full bg-white/5 border border-white/10"
                    style={isManager ? ({
                      // @ts-ignore web
                      cursor: 'pointer',
                    } as any) : undefined}
                  >
                    <View style={{
                      width: 32, height: 32, borderRadius: 16,
                      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
                      borderStyle: 'dashed',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text className="text-white/40 text-[11px] font-bold">?</Text>
                    </View>
                    <View>
                      <Text className="text-[12px] font-medium text-white/70">Atanmamış</Text>
                      <Text className="text-[10px] text-white/40">
                        {isManager ? 'Tıkla, ata' : 'Sorumlu yok'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })()}
            </View>

            {/* Faz 4b: çok-şeritte her şeridin kendi aktif aşaması + ilerlemesi (dark strip) */}
            {isMultiLane && (
              <View style={{ paddingHorizontal: 24, paddingBottom: 12, gap: 9 }}>
                {lanes.map((l: any) => {
                  // Aşama adı yerine şeridin İŞ TÜRÜ (kullanıcı isteği)
                  const st = laneWorkTypeLabel(l.lane);
                  return (
                    <View key={l.lane} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ minWidth: 58, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: '700' }}>DİŞ</Text>
                        <Text numberOfLines={1} style={{ color: panelAccent, fontSize: 12, fontWeight: '800', letterSpacing: 0.3, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>{laneTeethLabel(l.lane)}</Text>
                      </View>
                      <Text numberOfLines={1} style={{ flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{st}</Text>
                      <View style={{ width: 96, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
                        <View style={{ width: `${l.progressPct}%`, height: 6, borderRadius: 3, backgroundColor: panelAccent }} />
                      </View>
                      <Text style={{ width: 36, textAlign: 'end' as any, color: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: '700' }}>{l.progressPct}%</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Zaman dağılımı — siparişin kümülatif timing'i (dark strip).
                Hekim ve klinik panelleri için gizli — bu metrikler lab/admin operasyonel
                kullanımı için anlamlı. */}
            {panelTheme !== 'clinic' && panelTheme !== 'doctor' && orderStages.length > 0 && (() => {
              const sumActive  = orderStages.reduce((s, x) => s + (x.active_work_seconds     ?? 0), 0);
              const sumMachine = orderStages.reduce((s, x) => s + (x.machine_runtime_seconds ?? 0), 0);
              const sumQueue   = orderStages.reduce((s, x) => s + (x.queue_waiting_seconds   ?? 0), 0);
              const sumPause   = orderStages.reduce((s, x) => s + (x.paused_seconds_total    ?? 0), 0);

              // İş başlangıcı = ilk started_at (en küçük) — teknisyen "başlat" dedikten sonra
              const firstStart = orderStages
                .map(s => s.started_at)
                .filter((x): x is string => !!x)
                .sort()[0] ?? null;

              // Aktif aşama (status='aktif'). Yoksa ya kuyrukta ya da tamamlanmış demektir.
              const activeS = orderStages.find(s => s.status === 'aktif');
              const stageStart = activeS?.started_at ?? null;
              const stageElapsed = stageStart
                ? Math.max(0, Math.floor((Date.now() - new Date(stageStart).getTime()) / 1000))
                : 0;

              // İş tamamen bitti mi? → execution stage'lerin hepsi onaylandi/tamamlandi
              // ve aktif yok ise. Bu durumda TOPLAM SÜRE son completed_at'te DURUR.
              const execStages = orderStages.filter(s => s.status !== 'skipped');
              const allDone =
                execStages.length > 0 &&
                !activeS &&
                execStages.every(s => s.status === 'tamamlandi' || s.status === 'onaylandi');
              const lastCompleted = allDone
                ? execStages
                    .map(s => s.completed_at)
                    .filter((x): x is string => !!x)
                    .sort()
                    .slice(-1)[0] ?? null
                : null;

              // TOPLAM SÜRE:
              //  - aktif veya devam eden iş varsa → canlı tick (Date.now)
              //  - iş tamamen bittiyse → lastCompleted - firstStart (donar)
              const totalElapsed = firstStart
                ? Math.max(
                    0,
                    Math.floor(
                      ((lastCompleted ? new Date(lastCompleted).getTime() : Date.now())
                        - new Date(firstStart).getTime()) / 1000,
                    ),
                  )
                : 0;

              const fmtDateTime = (iso: string) => {
                const d = new Date(iso);
                return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
              };

              // Canlı elapsed → her saniye akan H:MM:SS / D g HH:MM:SS biçim
              const fmtLive = (sec: number): string => {
                if (sec < 0) sec = 0;
                const d = Math.floor(sec / 86400);
                const h = Math.floor((sec % 86400) / 3600);
                const m = Math.floor((sec % 3600) / 60);
                const s = sec % 60;
                const pad = (n: number) => n.toString().padStart(2, '0');
                if (d > 0) return `${d}${autoT('g')} ${pad(h)}:${pad(m)}:${pad(s)}`;
                return `${pad(h)}:${pad(m)}:${pad(s)}`;
              };

              const breakdownCells = [
                { key: 'active',  label: 'Operatör', value: sumActive,  color: panelAccent,             show: true },
                { key: 'machine', label: 'Makine',   value: sumMachine, color: '#67E8F9',               show: sumMachine > 0 },
                { key: 'queue',   label: 'Kuyruk',   value: sumQueue,   color: 'rgba(255,255,255,0.6)', show: true },
                { key: 'pause',   label: 'Pause',    value: sumPause,   color: '#FCD34D',               show: sumPause > 0 },
              ].filter(c => c.show);

              return (
                <View style={{
                  paddingHorizontal: 24, paddingVertical: 14,
                  borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
                  gap: 12,
                }}>
                  <Text style={{
                    fontSize: 10, fontWeight: '700',
                    letterSpacing: 1.2, textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.55)',
                  }}>
                    Zamanlama
                  </Text>

                  {/* Üst sıra: TOPLAM ve BU AŞAMA — elapsed counters + başlangıç tarihi */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
                    {firstStart && (
                      <View style={{ minWidth: 140 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                            Toplam Süre
                          </Text>
                          {allDone ? (
                            <Text style={{ fontSize: 8.5, fontWeight: '700', color: '#86EFAC', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                              · Bitti
                            </Text>
                          ) : (
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#86EFAC' }} />
                          )}
                        </View>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                          {fmtLive(totalElapsed)}
                        </Text>
                        <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
                          Başladı · {fmtDateTime(firstStart)}
                          {allDone && lastCompleted ? ` → ${fmtDateTime(lastCompleted)}` : ''}
                        </Text>
                      </View>
                    )}
                    {stageStart && (
                      <View style={{ minWidth: 140 }}>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: panelAccent, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                          Bu Aşama
                        </Text>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                          {fmtLive(stageElapsed)}
                        </Text>
                        <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
                          {activeS?.station?.name ?? '—'} · {fmtDateTime(stageStart)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Alt sıra: breakdown chip'leri */}
                  {breakdownCells.length > 0 && (
                    <View style={{
                      flexDirection: 'row', flexWrap: 'wrap', gap: 18,
                      paddingTop: 10,
                      borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
                    }}>
                      {breakdownCells.map(c => (
                        <View key={c.key} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color, alignSelf: 'center' }} />
                          <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' }}>
                            {c.label}
                          </Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                            {formatDuration(c.value)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}

          {stageTimelineEl}
          </View>

          {/* ÇALIŞMALAR TABLOSU — basit (gerçek work item modeli yok, tooth listesi tek satır) */}
          <View className="bg-white rounded-3xl border border-black/[0.06] overflow-hidden">
            <View className="px-6 py-5 flex-row items-center flex-wrap gap-3">
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>Çalışma</Text>
              <View className="px-2 py-0.5 rounded-full bg-ink-50">
                <Text className="text-[11px] font-medium">{allTeeth.length} diş</Text>
              </View>
              <View className="flex-1" />
              {order.shade && (() => {
                const bg = VITA_SHADE_HEX[order.shade] ?? '#EAEAEA';
                const fg = readableInk(bg);
                return (
                  <View
                    className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border border-black/[0.08]"
                    style={{ backgroundColor: bg }}
                  >
                    <View className="w-2 h-2 rounded-full opacity-70" style={{ backgroundColor: fg }} />
                    <Text className="text-[11px] font-semibold" style={{ color: fg, letterSpacing: 0.2 }}>{order.shade} renk</Text>
                  </View>
                );
              })()}
            </View>

            <View className="flex-row px-4 py-2.5" style={{ backgroundColor: softPanelBg }}>
              {['DİŞ', 'ÇALIŞMA', 'ADET', 'İLERLEME', ''].map((h, i) => (
                <Text
                  key={i}
                  className="text-[10px] font-semibold uppercase text-ink-500"
                  style={{
                    flex: i === 1 ? 2 : i === 3 ? 1.4 : i === 4 ? 0.4 : 1,
                    letterSpacing: 0.8,
                  }}
                >
                  {h}
                </Text>
              ))}
            </View>

            {(() => {
              // Her order_item ayrı satır (farklı işlemler farklı satırlarda).
              // tooth_numbers'lı item yoksa → tek satır fallback (work_type).
              const oi = ((order.order_items ?? []) as Array<any>).filter(it => it?.name);
              const rows: Array<{ key: string; name: string; qty: number; teeth: number[]; lane: number }> =
                oi.length > 0
                  ? oi.map((it, idx) => ({
                      key: String(it.id ?? idx),
                      name: it.name,
                      qty: it.quantity ?? (Array.isArray(it.tooth_numbers) ? it.tooth_numbers.length : 1),
                      teeth: Array.isArray(it.tooth_numbers) ? it.tooth_numbers : [],
                      lane: (it.lane ?? 1) as number,
                    }))
                  : [{ key: 'all', name: order.work_type || '—', qty: allTeeth.length, teeth: allTeeth, lane: 1 }];
              // Faz 4: çok-şeritte her item KENDİ şeridinin gerçek %'sini + aktif aşamasını gösterir.
              const laneInfoOf = (lane: number) => lanes.find((l: any) => l.lane === lane) ?? null;
              return rows.map(row => {
                const li = isMultiLane ? laneInfoOf(row.lane) : null;
                const rowPct = li ? li.progressPct : progressPct;
                const laneStation = li?.currentStage?.station?.name ?? (li && li.completedCount >= li.totalStages ? 'Tamamlandı' : null);
                return (
                <View key={row.key} className="flex-row px-4 py-3.5 items-center border-t border-black/[0.04]">
                  <View className="flex-1 flex-row gap-1 flex-wrap">
                    {row.teeth.length === 0 ? (
                      <Text className="text-[11px] text-ink-400">—</Text>
                    ) : (
                      row.teeth.slice(0, 8).map(t => {
                        const toothColor = toothColorMap[t] ?? panelAccent;
                        const fg = readableInk(toothColor);
                        const isActive = activeTooth === t;
                        return (
                          <Pressable
                            key={t}
                            onPress={() => setActiveTooth(prev => (prev === t ? null : t))}
                            style={{
                              paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                              backgroundColor: toothColor,
                              ...(Platform.OS === 'web' ? { cursor: 'pointer', outline: isActive ? `2px solid ${toothColor}` : 'none', outlineOffset: 2 } as any : {}),
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: fg, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>{t}</Text>
                          </Pressable>
                        );
                      })
                    )}
                    {row.teeth.length > 8 && (
                      <Text className="text-[11px] text-ink-500" style={{ alignSelf: 'center' }}>+{row.teeth.length - 8}</Text>
                    )}
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text className="text-[13px] font-medium text-ink-900" numberOfLines={2}>{row.name}</Text>
                    {isMultiLane && laneStation && (
                      <Text className="text-[10.5px] text-ink-500" numberOfLines={1} style={{ marginTop: 2 }}>
                        {laneStation}
                      </Text>
                    )}
                  </View>
                  <Text className="text-[13px] text-ink-500" style={{ flex: 1 }}>{row.qty} {row.teeth.length > 0 ? 'diş' : 'adet'}</Text>
                  <View className="flex-row items-center gap-2.5" style={{ flex: 1.4 }}>
                    <View className="flex-1">
                      <LinearProgressX value={rowPct} theme={progressTheme} compact hideLabel animate />
                    </View>
                    <Text className="text-[11px] text-ink-500" style={{ textAlign: 'end' as any, width: 32 }}>{rowPct}%</Text>
                  </View>
                  <View className="items-end" style={{ flex: 0.4 }}>
                    <ArrowUpRight size={16} color="#9A9A9A" strokeWidth={1.6} />
                  </View>
                </View>
                );
              });
            })()}
          </View>

          {/* MATERYAL HAREKETLERİ */}
          {materials.length > 0 && (
            <View className="bg-white rounded-3xl border border-black/[0.06] p-6">
              <View className="flex-row items-center mb-3.5">
                <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                  Materyal hareketleri
                </Text>
                <View className="flex-1" />
                <View className="px-2 py-0.5 rounded-full bg-ink-50">
                  <Text className="text-[11px] font-medium text-ink-700">
                    {materials.length} kalem
                  </Text>
                </View>
              </View>
              <View className="flex-row flex-wrap gap-2.5">
                {materials.map((m, i) => (
                  <View
                    key={i}
                    className="flex-1 px-4 py-3.5 rounded-2xl"
                    style={{ backgroundColor: softPanelBg, minWidth: 200 }}
                  >
                    <Text numberOfLines={1} className="text-[13px] font-medium text-ink-900">
                      {m.name}
                    </Text>
                    <View className="flex-row justify-between mt-2">
                      <Text className="text-[11px] text-ink-500">
                        {m.quantity} {m.unit ?? ''}
                      </Text>
                      {isManager && (
                        <Text className="text-[11px] font-medium text-ink-900">
                          ₺ {fmtTL(m.line_cost)}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* HIZLI İŞLEM · ETİKETLER */}
          <View className="bg-white rounded-3xl border border-black/[0.06] p-5">
            <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-3" style={{ letterSpacing: 1.1 }}>
              Hızlı işlem · etiket
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {isManager && activeStage && (
                <Pressable onPress={() => setReassignOpen(true)}>
                  <Chip tone="outline" icon={UserCheck}>Yeniden ata</Chip>
                </Pressable>
              )}
              {isManager && ((order.status as string) === 'kalite_kontrol' || (order.status as string) === 'asamada') && (
                <Pressable onPress={() => setQcRejectOpen(true)}>
                  <Chip tone="danger" icon={RotateCcw}>QC Red</Chip>
                </Pressable>
              )}
              <Pressable onPress={handleToggleUrgent} disabled={togglingUrgent}>
                {order.is_urgent ? (
                  <Chip tone="danger" dot>Acil · Kaldır</Chip>
                ) : (
                  <Chip tone="outline">+ Acil işaretle</Chip>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {/* ═══════════ SAĞ KOLON ═══════════ */}
        <View className="gap-4" style={{ width: isDesktop ? 360 : undefined }}>

          {/* MESAJ KUTUSU — sağ kolon en üstünde (QR hero'ya taşındı)
              Eskiden kartın altında tam genişlikte dolu bir "Mesaj gönder"
              çubuğu vardı; hemen altındaki Lojistik kartının "Kurye çağır"
              çubuğuyla birlikte sağ kolon iki kalın butona dönüşüyordu. Artık
              eylem içeriğin kendisinde: boşken satırın tamamı tıklanır, dolu
              iken son mesaj önizlemesi zaten sohbeti açar. */}
          <View className="bg-white rounded-3xl border border-black/[0.06] p-5">
            <View className="flex-row items-center gap-2 mb-3.5">
              <MessageSquare size={12} color="#9A9A9A" strokeWidth={1.8} />
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                Mesaj kutusu
              </Text>
              <View className="flex-1" />
              {chatMessages.length > 0 && (
                <>
                  <Text className="text-[11px] font-medium text-ink-400">{chatMessages.length} mesaj</Text>
                  <Pressable
                    onPress={() => setChatOpen(true)}
                    style={({ pressed }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                      backgroundColor: hexA(panelAccent, 0.10),
                      opacity: pressed ? 0.6 : 1,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    <Text className="text-[11.5px] font-semibold" style={{ color: panelAccent }}>Aç</Text>
                    <ChevronRight size={12} color={panelAccent} strokeWidth={2.4} />
                  </Pressable>
                </>
              )}
            </View>

            {(() => {
              const last = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
              if (!last) {
                return (
                  <Pressable
                    onPress={() => setChatOpen(true)}
                    style={({ pressed }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      padding: 14, borderRadius: 16, backgroundColor: softPanelBg,
                      opacity: pressed ? 0.7 : 1,
                      transform: [{ scale: pressed ? 0.99 : 1 }],
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    <View
                      className="w-[34px] h-[34px] rounded-full items-center justify-center"
                      style={{ backgroundColor: hexA(panelAccent, 0.12) }}
                    >
                      <MessageSquare size={16} color={panelAccent} strokeWidth={1.9} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-[13px] font-semibold text-ink-900">İlk mesajı yaz</Text>
                      <Text className="text-[11.5px] text-ink-400 mt-px">Bu vaka için henüz mesaj yok</Text>
                    </View>
                    <ChevronRight size={15} color="#9A9A9A" strokeWidth={2} />
                  </Pressable>
                );
              }
              const who = last.sender?.full_name ?? 'Bilinmeyen';
              const body = String(last.content ?? '').trim() || 'Dosya gönderildi';
              return (
                <Pressable
                  onPress={() => setChatOpen(true)}
                  style={({ pressed }: any) => ({
                    borderRadius: 16, padding: 14, backgroundColor: softPanelBg,
                    opacity: pressed ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <View className="flex-row items-center gap-2 mb-1.5">
                    <View
                      className="w-6 h-6 rounded-full items-center justify-center"
                      style={{ backgroundColor: hexA(panelAccent, 0.14) }}
                    >
                      <Text className="text-[10px] font-semibold" style={{ color: panelAccent }}>
                        {who.trim().charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                    <Text className="text-[12px] font-medium text-ink-900 flex-1" numberOfLines={1}>
                      {who}
                    </Text>
                    <Text className="text-[10.5px] text-ink-400">{fmtDate(last.created_at)}</Text>
                  </View>
                  <Text className="text-[12.5px] text-ink-700 leading-5" numberOfLines={3}>
                    {body}
                  </Text>
                </Pressable>
              );
            })()}
          </View>

          {/* LOJİSTİK — siparişin tüm kurye hareketleri (desktop + mobil ortak bileşen) */}
          <OrderLogisticsCard
            legs={deliveryLegs}
            accent={panelAccent}
            rowBg={softPanelBg}
            isManager={isManager}
            canCall={order.status !== 'iptal'}
            onCall={() => setCallCourierOpen(true)}
            onEditFee={leg => setFeeTarget(leg)}
            fmtDate={fmtDate}
            mapsApiKey={mapsApiKey}
            labAddress={labAddress}
            clinicAddress={clinicAddress}
            onOpenTracking={leg => {
              // courier-tracking rotası yalnız bu dört panelde var; istasyon vb.
              // panellerden gelindiğinde lab'a düşülür.
              const hasRoute = ['(admin)', '(lab)', '(clinic)', '(doctor)'].includes(panelGroup);
              const base = hasRoute ? panelGroup : '(lab)';
              router.push(`/${base}/courier-tracking?delivery=${leg.id}` as any);
            }}
            clientView={panelGroup === '(clinic)' || panelGroup === '(doctor)'}
          />

          {/* DİŞ ŞEMASI */}
          <View
            className="bg-white rounded-3xl border border-black/[0.06] p-4"
            onLayout={e => {
              const w = e.nativeEvent.layout.width - 32;
              if (w > 0 && Math.abs(w - chartW) > 2) setChartW(w);
            }}
          >
            <View className="flex-row items-center mb-2.5 px-1">
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                Diş Şeması
              </Text>
              <View className="flex-1" />
              <Text className="text-[11px] text-ink-500">{visibleTeethCount} diş</Text>
            </View>

            <LivingToothChart
              order={toothChartOrder}
              containerWidth={chartW}
              accentColor={panelAccent}
              colorMap={toothColorMap}
              activeTooth={activeTooth}
              onToothPress={(fdi) => setActiveTooth(prev => (prev === fdi ? null : fdi))}
              forceJawMode={forcedJaw}
              frameless
            />

            <View className="flex-row gap-0.5 p-0.5 rounded-full mt-3.5 self-center" style={{ backgroundColor: softPanelBg }}>
              {([
                { id: 'both',  label: 'Tümü', count: allTeeth.length },
                { id: 'upper', label: 'Üst',  count: upperTeeth.length },
                { id: 'lower', label: 'Alt',  count: lowerTeeth.length },
              ] as const).map(opt => {
                const active = jawView === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setJawView(opt.id)}
                    className={`py-1 px-2.5 rounded-full items-center ${active ? 'bg-ink-900' : ''}`}
                  >
                    <Text className={`text-[9px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}>
                      {opt.label}{' '}
                      <Text className={active ? 'text-white/60' : 'text-ink-400'}>({opt.count})</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Diş detay paneli — tıklanan diş */}
            {activeTooth && (
              <View className="mt-3 p-4 rounded-2xl border border-black/[0.06]" style={{ backgroundColor: '#FBFAF6' }}>
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className="w-9 h-9 rounded-xl items-center justify-center"
                      style={{ backgroundColor: toothColorMap[activeTooth] ?? panelAccent }}
                    >
                      <Text className="text-[13px] font-mono font-bold" style={{ color: readableInk(toothColorMap[activeTooth] ?? panelAccent) }}>
                        {activeTooth}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[14px] font-semibold text-ink-900">Diş #{activeTooth}</Text>
                      <Text className="text-[11px] text-ink-400">
                        {activeTooth >= 11 && activeTooth <= 28 ? 'Üst çene' : 'Alt çene'}
                        {' · '}
                        {activeTooth >= 11 && activeTooth <= 18 ? 'Sağ' :
                         activeTooth >= 21 && activeTooth <= 28 ? 'Sol' :
                         activeTooth >= 31 && activeTooth <= 38 ? 'Sol' : 'Sağ'}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setActiveTooth(null)} className="w-7 h-7 rounded-full bg-black/[0.06] items-center justify-center">
                    <Text className="text-[12px] text-ink-500">✕</Text>
                  </Pressable>
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                    <Text className="text-[12px] text-ink-500">Çalışma</Text>
                    <Text className="text-[12px] font-medium text-ink-900" style={{ maxWidth: 220, textAlign: 'end' as any }}>
                      {(() => {
                        // Aktif dişe ait spesifik işlem — 3 katmanlı resolve
                        if (activeTooth == null) return order.work_type || '—';
                        // 1) order_items.tooth_numbers eşleşmesi — bir dişte BİRDEN
                        //    ÇOK işlem olabilir (ör. Zirkon + PMMA geçici) → hepsini göster.
                        const items = (order as any)?.order_items as Array<{ name: string; tooth_numbers?: number[] | null }> | undefined;
                        if (items && items.length > 0) {
                          const hits = items.filter(it => Array.isArray(it.tooth_numbers) && it.tooth_numbers!.includes(activeTooth));
                          if (hits.length) return Array.from(new Set(hits.map(h => h.name))).join('\n');
                        }
                        // 2) work_type virgülle birleşik segmentler + tooth_numbers index
                        const teeth = order.tooth_numbers ?? [];
                        const segs = (order.work_type || '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
                        if (segs.length === teeth.length && teeth.length > 0) {
                          const idx = teeth.indexOf(activeTooth);
                          if (idx >= 0) return segs[idx];
                        }
                        // 3) Fallback: ilk segment veya tüm string
                        return segs[0] || order.work_type || '—';
                      })()}
                    </Text>
                  </View>
                  {order.shade && (
                    <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                      <Text className="text-[12px] text-ink-500">Renk</Text>
                      <View className="flex-row items-center gap-1.5">
                        <View className="w-3 h-3 rounded-full" style={{ backgroundColor: VITA_SHADE_HEX[order.shade] ?? '#CCC' }} />
                        <Text className="text-[12px] font-medium text-ink-900">{order.shade}</Text>
                      </View>
                    </View>
                  )}
                  <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                    <Text className="text-[12px] text-ink-500">Aşama</Text>
                    <Text className="text-[12px] font-medium text-ink-900">{getOrderStageLabel(order as any)}</Text>
                  </View>
                  <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                    <Text className="text-[12px] text-ink-500">İlerleme</Text>
                    <View className="flex-row items-center gap-2" style={{ width: 120 }}>
                      <View className="flex-1">
                        <LinearProgressX value={progressPct} theme={progressTheme} compact hideLabel animate />
                      </View>
                      <Text className="text-[11px] text-ink-500">{progressPct}%</Text>
                    </View>
                  </View>
                  {order.machine_type && (
                    <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                      <Text className="text-[12px] text-ink-500">Makine</Text>
                      <Text className="text-[12px] font-medium text-ink-900">{order.machine_type}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* TABS — Aktivite / Dosyalar / Yorumlar */}
          <View className="bg-white rounded-3xl border border-black/[0.06] p-5">
            <View className="flex-row gap-1 p-1 rounded-xl mb-3.5" style={{ backgroundColor: softPanelBg }}>
              {([
                { id: 'doctor_note', label: 'Hekim Notu', count: (order.notes && String(order.notes).trim().length > 0) ? 1 : 0 },
                { id: 'files',       label: 'Dosyalar',     count: (order.photos ?? []).length },
              ] as const).map(tb => {
                const active = sideTab === tb.id;
                return (
                  <Pressable
                    key={tb.id}
                    onPress={() => setSideTab(tb.id)}
                    className={`flex-1 px-2.5 py-2 rounded-[9px] flex-row items-center justify-center gap-1.5 ${active ? 'bg-white' : ''}`}
                    style={active ? ({ /* @ts-ignore */ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as any) : undefined}
                  >
                    <Text className={`text-[12px] font-medium ${active ? 'text-ink-900' : 'text-ink-500'}`}>
                      {tb.label}
                    </Text>
                    {tb.count > 0 && (
                      <View className={`px-1.5 py-px rounded-full ${active ? 'bg-ink-900' : 'bg-black/5'}`}>
                        <Text className={`text-[10px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}>
                          {tb.count}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {sideTab === 'doctor_note' && (
              order.notes && String(order.notes).trim().length > 0 ? (
                <View className="rounded-2xl p-4" style={{ backgroundColor: softPanelBg }}>
                  <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-2" style={{ letterSpacing: 1.1 }}>
                    Hekim Notu
                  </Text>
                  <Text className="text-[13px] text-ink-900 leading-5">
                    {order.notes}
                  </Text>
                </View>
              ) : (
                <Text className="text-[12px] text-ink-400 italic px-1 py-3">
                  Hekim henüz not eklemedi.
                </Text>
              )
            )}
            {sideTab === 'files' && (
              <FilesList
                photos={[...(order.photos ?? []), ...inheritedFiles.photos]}
                signedUrls={{ ...(signedUrls ?? {}), ...inheritedFiles.urls }}
                thumbUrls={thumbUrls}
                workOrderId={order.id}
                accentColor={panelAccent}
                onUploaded={refetch}
              />
            )}
          </View>

          {/* MALİ BİLGİ — kullanıcı isteğiyle GEÇİCİ olarak gizlendi (2026-07-21).
              Kart ve calculate_order_profit hesabı (malzeme/işçilik/lojistik)
              çalışır durumda; geri açmak için SHOW_FINANCIAL_CARD = true yap.
              Para birimi RPC'den gelen lab baz para birimidir (₺ sabit değil). */}
          {SHOW_FINANCIAL_CARD && isManager && profit && (
            <View className="bg-ink-900 rounded-3xl p-5">
              <View className="flex-row items-center mb-3.5">
                <Text className="text-[11px] font-semibold uppercase text-white/50" style={{ letterSpacing: 1.1 }}>
                  Mali Bilgi
                </Text>
                <View className="flex-1" />
                <View
                  className="flex-row items-center gap-1.5 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: panelAccent + '33' }}
                >
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: panelAccent }} />
                  <Text className="text-[10px] font-medium" style={{ color: panelAccent }}>
                    {(Number(profit.sale_price) || 0) > 0 ? 'Tanımlı' : 'Beklemede'}
                  </Text>
                </View>
              </View>
              <View className="gap-2.5">
                <View className="flex-row justify-between items-baseline">
                  <Text className="text-[12px] text-white/60">Satış fiyatı</Text>
                  <Text className="text-white" style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.66 }}>
                    {profitSym} {fmtTL(profit.sale_price)}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-[12px] text-white/60">Materyal</Text>
                  <Text className="text-[12px] text-white">{profitSym} {fmtTL(profit.material_cost)}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-[12px] text-white/60">İşçilik</Text>
                  <Text className="text-[12px] text-white">{profitSym} {fmtTL(profit.labor_cost)}</Text>
                </View>
                {/* Lojistik — kurye/kargo masrafı, siparişin tüm hareketleri */}
                {(Number(profit.logistics_cost) || 0) > 0 && (
                  <View className="flex-row justify-between">
                    <Text className="text-[12px] text-white/60">Lojistik</Text>
                    <Text className="text-[12px] text-white">{profitSym} {fmtTL(profit.logistics_cost)}</Text>
                  </View>
                )}
                {/* Baz dışı dövizdeki kurye ücretleri — kur çevrimi yok, ayrı satır */}
                {Object.entries(profit.logistics_other ?? {}).map(([cur, amt]) => (
                  <View key={cur} className="flex-row justify-between">
                    <Text className="text-[12px] text-white/60">Lojistik ({cur})</Text>
                    <Text className="text-[12px] text-white">{fmtTL(amt)} {cur}</Text>
                  </View>
                ))}
                {(Number(profit.overhead_cost) || 0) > 0 && (
                  <View className="flex-row justify-between">
                    <Text className="text-[12px] text-white/60">Genel gider</Text>
                    <Text className="text-[12px] text-white">{profitSym} {fmtTL(profit.overhead_cost)}</Text>
                  </View>
                )}
                <View className="h-px bg-white/10 my-0.5" />
                <View className="flex-row justify-between items-baseline">
                  <Text className="text-[12px]" style={{ color: panelAccent }}>Net kâr</Text>
                  <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.84, color: panelAccent }}>
                    {profitSym} {fmtTL(profit.profit)}
                  </Text>
                </View>
                {profit.margin_pct != null && (
                  <Text className="text-[10px] text-white/50" style={{ textAlign: 'end' as any }}>
                    Marj %{(Number(profit.margin_pct) || 0).toFixed(0)}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* DOKTOR & KLİNİK — QR ile yer değiştirildi, alta taşındı */}
          <View className="bg-white rounded-3xl border border-black/[0.06] p-5">
            <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-3.5" style={{ letterSpacing: 1.1 }}>
              Doktor & Klinik
            </Text>
            <View className="flex-row items-center gap-3 mb-3">
              <Avatar name={doctorName} size={40} bg="#3B82F6" fg="#FFF" />
              <View className="flex-1">
                <Text className="text-[13px] font-medium text-ink-900">{doctorName}</Text>
                <Text className="text-[11px] text-ink-500">{clinicName}</Text>
              </View>
              {isManager && (
                <Pressable
                  onPress={() => setDoctorChangeOpen(true)}
                  className="w-8 h-8 rounded-lg border border-black/[0.08] items-center justify-center"
                  style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}
                >
                  <Pencil size={14} color="#0A0A0A" strokeWidth={1.8} />
                </Pressable>
              )}
              <Pressable className="w-8 h-8 rounded-lg border border-black/[0.08] items-center justify-center">
                <Bell size={15} color="#0A0A0A" strokeWidth={1.6} />
              </Pressable>
            </View>
            {(doctorPhone || clinicName) && (
              <View className="px-3 py-2.5 rounded-[10px] gap-2" style={{ backgroundColor: softPanelBg }}>
                {doctorPhone ? (
                  <View className="flex-row items-center gap-1.5">
                    <Phone size={11} color="#6B6B6B" strokeWidth={1.8} />
                    <Text className="text-[11px] text-ink-500">{doctorPhone}</Text>
                  </View>
                ) : null}
                {clinicName ? (
                  <View className="flex-row items-start gap-1.5">
                    <View className="mt-0.5"><MapPin size={11} color="#6B6B6B" strokeWidth={1.8} /></View>
                    <Text className="flex-1 text-[11px] text-ink-500 leading-4">{clinicName}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* İLGİLİ SİPARİŞLER */}
          {related.length > 0 && (
            <View className="bg-white rounded-3xl border border-black/[0.06] p-5">
              <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-3" style={{ letterSpacing: 1.1 }}>
                İlgili siparişler
              </Text>
              {related.map((o, i) => {
                const cfg = STATUS_CONFIG[o.status as keyof typeof STATUS_CONFIG];
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => handleNavigateRelated(o.id)}
                    className={`px-3 py-2.5 rounded-xl flex-row items-center gap-2.5 ${i > 0 ? 'mt-2' : ''}`}
                    style={{ backgroundColor: softPanelBg }}
                  >
                    <View className="flex-1">
                      <Text className="text-[11px] font-mono text-ink-400">{o.order_number}</Text>
                      <Text className="text-[12px] font-medium text-ink-900 mt-0.5">
                        {o.work_type ?? '—'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[11px] text-ink-500">{fmtDate(o.delivery_date)}</Text>
                      <View
                        className="px-1.5 py-px rounded mt-0.5"
                        style={{ backgroundColor: (cfg?.color ?? '#94A3B8') + '20' }}
                      >
                        <Text
                          className="text-[10px] font-medium"
                          style={{ color: cfg?.color ?? '#475569' }}
                        >
                          {cfg?.label ?? o.status}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Yönetim — yalnız admin (düzenle / pasife al / kalıcı sil) — sağ kolonun en altında */}
          {profile?.user_type === 'admin' && (
            <AdminDangerSection
              orderId={order.id}
              order={order}
              isArchived={!!(order as any).is_archived}
              onArchived={() => { refetch(); }}
              onDeleted={() => safeBack(`/(${panelGroup})/orders`)}
              onEdited={() => { refetch(); }}
            />
          )}
        </View>
      </View>

      {/* Order-scoped chat — Mesaj kutusu tab, ana ChatDetail bileşenini bu işe sabitler */}
      <OrderChatPopup
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        order={order}
        currentUserId={profile?.id ?? null}
        viewerType={profile?.user_type ?? null}
        panelAccent={panelAccent}
      />

      {/* QC Reject Modal */}
      {isManager && (
        <QCRejectModal
          visible={qcRejectOpen}
          workOrderId={order.id}
          rejectedBy={profile?.id ?? ''}
          availableStages={(() => {
            const currentStage = legacyStatusToStage(order.status);
            const idx = STAGE_ORDER.indexOf(currentStage);
            return STAGE_ORDER.slice(0, Math.max(0, idx)) as Stage[];
          })()}
          onClose={() => setQcRejectOpen(false)}
          onDone={() => refetch()}
        />
      )}

      {/* Doktor / Klinik değiştir — sipariş özelinde */}
      {isManager && order && (
        <DoctorChangeModal
          visible={doctorChangeOpen}
          workOrderId={order.id}
          currentDoctorId={(order as any)?.doctor_id ?? null}
          accentColor={panelAccent}
          onClose={() => setDoctorChangeOpen(false)}
          onChanged={() => refetch()}
        />
      )}

      {/* Revizyon Modal — teslim sonrası yeniden yapım (bağlı yeni sipariş) */}
      <RevisionModal
        visible={revisionOpen}
        orderId={order.id}
        orderNumber={String((order as any).order_number ?? order.id)}
        labId={(order as any).lab_id ?? null}
        accentColor={panelAccent}
        onClose={() => setRevisionOpen(false)}
        onCreated={(newId) => { setRevisionOpen(false); handleNavigateRelated(newId); }}
      />

      {/* Delivery Modal — Kuryeye Gönder (final teslimat) */}
      {isManager && (
        <DeliveryModal
          visible={deliveryModalOpen}
          workOrderId={order.id}
          labId={(profile as any)?.lab_id ?? profile?.id ?? ''}
          accentColor={panelAccent}
          lockExternal={(order as any)?.delivery_method === 'kargo'}
          editDelivery={editDeliveryTarget}
          onClose={() => { setDeliveryModalOpen(false); setEditDeliveryTarget(null); }}
          onCreated={() => { refetch(); }}
        />
      )}

      {/* Kurye Çağır — üretim sırasındaki ara hareket (eksik parça, model alma…) */}
      {isManager && (
        <DeliveryModal
          visible={callCourierOpen}
          workOrderId={order.id}
          labId={(profile as any)?.lab_id ?? profile?.id ?? ''}
          accentColor={panelAccent}
          extraLeg
          stageSnapshot={stageName}
          onClose={() => setCallCourierOpen(false)}
          onCreated={() => { setLegsTick(t => t + 1); refetch(); }}
        />
      )}

      {/* Kurye ücreti gir / düzelt */}
      {isManager && (
        <DeliveryFeeModal
          leg={feeTarget}
          accentColor={panelAccent}
          onClose={() => setFeeTarget(null)}
          onSaved={() => { setLegsTick(t => t + 1); refetch(); }}
        />
      )}

      {/* Reassign Modal — aktif stage yoksa ilk bekliyor stage'i hedef al */}
      {isManager && reassignTargetStage && (
        <ReassignModal
          visible={reassignOpen}
          stageId={reassignTargetStage.id}
          stage={legacyStatusToStage(order.status)}
          stationId={(reassignTargetStage as any).station?.id ?? (reassignTargetStage as any).station_id ?? null}
          labId={profile?.lab_id ?? profile?.id ?? ''}
          currentOwnerId={reassignTargetStage.technician?.id}
          onClose={() => setReassignOpen(false)}
          onReassigned={() => { refetch(); refetchStages(); }}
        />
      )}

      {/* Aşama ekle modal — müdür/admin: istasyon + konum seç */}
      {isManager && order && (
        <AddStageModal
          visible={addStageOpen}
          onClose={() => setAddStageOpen(false)}
          orderId={order.id}
          labId={(profile as any)?.lab_id ?? profile?.id ?? ''}
          stages={orderStages as any}
          accentColor={panelAccent}
          onAdded={() => { refetch(); refetchStages(); }}
        />
      )}

      {/* Triaj modal — auto-open + manual */}
      {order && canTriage && (() => {
        // Order'ın work_type'ını → kategori (OP_CATEGORY mapping)
        const wt = order.work_type ?? '';
        const workCategory = OP_CATEGORY[wt] ?? null;
        return (
          <TriageModal
            visible={triageOpen}
            orderId={order.id}
            caseType={(order as any).case_type ?? null}
            workCategory={workCategory}
            labId={profile?.lab_id ?? profile?.id ?? null}
            accentColor={panelAccent}
            onClose={() => setTriageOpen(false)}
            onSaved={() => { setTriageOpen(false); refetch(); refetchStages(); }}
          />
        );
      })()}

      {/* Yeniden Planla — sıra + teknisyen düzenle */}
      {order && (
        <ReplanModal
          visible={replanOpen}
          orderId={order.id}
          labId={(order as any).lab_id ?? profile?.lab_id ?? null}
          accentColor={panelAccent}
          stages={(orderStages ?? [])
            .filter(s => s.status !== 'skipped' && s.status !== 'tamamlandi' && s.status !== 'onaylandi')
            .map(s => ({ id: s.id, station: s.station, technician: s.technician }))}
          onClose={() => setReplanOpen(false)}
          onSaved={() => { setReplanOpen(false); refetch(); refetchStages(); }}
        />
      )}

      {/* İşi Beklet — neden + kategori. Müşteri kaynaklıysa devam edince teslim ötelenir. */}
      <Modal visible={holdOpen} transparent animationType="fade" onRequestClose={() => setHoldOpen(false)}>
        <Pressable onPress={() => setHoldOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 480, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#0A0A0A' }}>İşi beklet</Text>
              <Text style={{ fontSize: 12.5, color: '#6B6B6B', lineHeight: 18 }}>
                Beklerken gecikme sayacı durur. Bekleme hekim/klinik kaynaklıysa devam ettirdiğinde
                teslim tarihi bekleme süresi kadar ötelenir — gecikme lab'a yazılmaz.
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#0A0A0A' }}>Neden kategorisi</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {HOLD_CATEGORIES.map(c => {
                  const sel = holdCat === c.key;
                  return (
                    <Pressable key={c.key} onPress={() => setHoldCat(c.key)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
                        backgroundColor: sel ? panelAccent : '#F1F5F9',
                        borderWidth: 1, borderColor: sel ? panelAccent : 'rgba(0,0,0,0.08)',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: sel ? '#FFFFFF' : '#334155' }}>{c.label}</Text>
                      <Text style={{ fontSize: 9.5, fontWeight: '700', color: sel ? 'rgba(255,255,255,0.8)' : '#9A9A9A' }}>
                        {c.responsible === 'client' ? 'MÜŞTERİ' : 'LAB'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11, color: '#9A9A9A' }}>
                {HOLD_CATEGORIES.find(c => c.key === holdCat)?.responsible === 'client'
                  ? 'Müşteri kaynaklı → teslim tarihi ötelenecek, hekime bildirim gider.'
                  : 'Lab kaynaklı → teslim tarihi ÖTELENMEZ, gecikme lab\'da kalır.'}
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#0A0A0A' }}>Açıklama</Text>
              <TextInput
                value={holdReason}
                onChangeText={setHoldReason}
                placeholder="Örn: Üst çene taraması eksik, hekimden bekleniyor"
                placeholderTextColor="#9A9A9A"
                multiline
                style={{ minHeight: 72, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 14, padding: 12, fontSize: 13, color: '#0A0A0A', textAlignVertical: 'top' }}
              />
            </View>

            {!!holdErr && <Text style={{ fontSize: 12, color: '#D94B4B' }}>{holdErr}</Text>}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable onPress={() => setHoldOpen(false)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Vazgeç</Text>
              </Pressable>
              <Pressable onPress={submitHold} disabled={holdBusy || !holdReason.trim()}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: panelAccent, opacity: (holdBusy || !holdReason.trim()) ? 0.5 : 1 }}>
                <Pause size={14} color="#FFF" strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>{holdBusy ? 'Bekletiliyor…' : 'Beklet'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Material Confirm Modal — aşamayı malzeme onayıyla tamamla */}
      <StageMaterialModal
        visible={!!materialModalStageId}
        stageId={materialModalStageId}
        accentColor={panelAccent}
        onClose={() => setMaterialModalStageId(null)}
        onConfirmed={() => {
          setMaterialModalStageId(null);
          toast.success('Aşama tamamlandı, sıradaki başlatıldı');
          refetch();
          refetchStages();
        }}
      />

      {/* Print Preview Popup */}
      <Modal
        visible={printOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { setPrintOpen(false); setPrintPreviewHtml(null); }}
      >
        <Pressable
          onPress={() => { setPrintOpen(false); setPrintPreviewHtml(null); }}
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              width: Math.min(width * 0.55, 580),
              height: Math.min(height * 0.92, 880),
              backgroundColor: '#fff',
              borderRadius: 24,
              overflow: 'hidden',
              // @ts-ignore
              boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            }}
          >
            {/* Toolbar */}
            <View className="flex-row items-center justify-between px-5 py-3 border-b border-black/[0.06]">
              <Text className="text-[15px] font-semibold text-ink-900">İş Kağıdı</Text>
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={async () => {
                    if (typeof window === 'undefined') return;
                    // QR SVG (DOM'da rendered BrandedQR/QRCode)
                    const qrSvgHtml = (document.getElementById('dental-qr-container') as HTMLElement | null)
                      ?.querySelector('svg')?.outerHTML ?? '';
                    const html = await buildOrderPrintDoc(order, qrUrl, chatMessages, qrSvgHtml);
                    const w = window.open('', '_blank');
                    if (!w) return;
                    w.document.write(html + '<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>');
                    w.document.close();
                  }}
                  className="flex-row items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-ink-900"
                >
                  <Printer size={14} color="#FFF" strokeWidth={1.8} />
                  <Text className="text-[12px] font-medium text-white">Yazdır</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setPrintOpen(false); setPrintPreviewHtml(null); }}
                  className="w-8 h-8 rounded-full items-center justify-center bg-black/[0.06]"
                >
                  <Text className="text-[14px] text-ink-500">✕</Text>
                </Pressable>
              </View>
            </View>

            {/* A5 İş Emri önizleme — Yeni Sipariş ile aynı HTML şablonu */}
            {Platform.OS === 'web' && printPreviewHtml ? (
              React.createElement('iframe', {
                srcDoc: printPreviewHtml,
                style: { flex: 1, width: '100%', height: '100%', border: 0, backgroundColor: '#F5F2EA' },
                title: 'İş Emri Önizleme',
              })
            ) : (
            <ScrollView
              className="flex-1"
              style={{ backgroundColor: '#F5F2EA', display: 'none' }}
              contentContainerStyle={{ padding: 24 }}
            >
              <View className="bg-white rounded-2xl p-6" style={{ maxWidth: 520, alignSelf: 'center', width: '100%',
                // @ts-ignore
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

                {/* Header */}
                <View className="flex-row justify-between items-start pb-3 mb-3" style={{ borderBottomWidth: 2.5, borderBottomColor: '#0A0A0A' }}>
                  <View>
                    <Text className="text-[16px] font-bold text-ink-900" style={{ letterSpacing: -0.4 }}>Aydın Lab</Text>
                    <Text className="text-[8px] text-ink-400 mt-0.5">Diş Protez Laboratuvarı · İstanbul</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1.5 }}>İş Kağıdı</Text>
                    <Text className="text-[13px] font-bold font-mono text-ink-900 mt-0.5">{order.order_number}</Text>
                    <Text className="text-[8px] text-ink-400 mt-0.5">{fmtDate(order.created_at)}</Text>
                  </View>
                </View>

                {order.is_urgent && (
                  <View className="py-1 mb-3 rounded" style={{ backgroundColor: '#9C2E2E' }}>
                    <Text className="text-[10px] font-bold text-white text-center" style={{ letterSpacing: 2 }}>⚠ ACİL</Text>
                  </View>
                )}

                {/* Patient + Order Info */}
                <View className="flex-row gap-3 mb-3">
                  <View className="flex-1 rounded-lg border border-black/[0.08] overflow-hidden">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Hasta / Hekim</Text>
                    </View>
                    <View className="px-2.5 py-2">
                      <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 18, letterSpacing: -0.6, color: '#0A0A0A' }}>
                        {order.patient_name ?? '—'}
                      </Text>
                      <Text className="text-[9px] text-ink-500 mt-1">
                        <Text className="font-semibold text-ink-900">{order.doctor?.full_name ?? '—'}</Text>
                        {clinicName !== '—' ? ` · ${clinicName}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-1 rounded-lg border border-black/[0.08] overflow-hidden">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Sipariş Detayı</Text>
                    </View>
                    {[
                      ['İş Tipi', order.work_type ?? '—', true],
                      ['Renk', order.shade ?? '—', false],
                      ['Teslim', fmtDate(order.delivery_date), true],
                      ['Durum', STATUS_CONFIG[order.status as WorkOrderStatus]?.label ?? order.status, false],
                    ].map(([lbl, val, bold], i) => (
                      <View key={i} className="flex-row px-2.5 py-1 border-t border-black/[0.04]">
                        <Text className="text-[8px] font-semibold uppercase text-ink-400" style={{ width: 52, letterSpacing: 0.3 }}>{lbl as string}</Text>
                        <Text className={`text-[10px] ${bold ? 'font-bold' : 'font-medium'} text-ink-900`}>{val as string}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Teknik */}
                <View className="rounded-lg border border-black/[0.08] overflow-hidden mb-3">
                  <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                    <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Teknik Bilgiler</Text>
                  </View>
                  <View className="flex-row">
                    {[
                      ['Makine', order.machine_type === 'milling' ? 'Freze' : order.machine_type === '3d_printing' ? '3D Baskı' : '—'],
                      ['Model', order.model_type === 'dijital' ? 'Dijital' : order.model_type === 'fiziksel' ? 'Fiziksel' : order.model_type ?? '—'],
                      ['Teknisyen', order.assignee?.full_name ?? '—'],
                    ].map(([lbl, val], i) => (
                      <View key={i} className="flex-1 px-2.5 py-1.5" style={i < 2 ? { borderEndWidth: 1, borderEndColor: 'rgba(0,0,0,0.04)' } : undefined}>
                        <Text className="text-[7px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 0.3 }}>{lbl}</Text>
                        <Text className="text-[10px] font-medium text-ink-900 mt-0.5">{val}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Diş Şeması — gerçek LivingToothChart */}
                <View className="rounded-lg border border-black/[0.08] overflow-hidden mb-3">
                  <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                    <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>
                      Diş Şeması — {allTeeth.length} diş
                    </Text>
                  </View>
                  <View className="p-2">
                    <LivingToothChart
                      order={toothChartOrder}
                      containerWidth={440}
                      containerHeight={220}
                      accentColor={panelAccent}
                      colorMap={toothColorMap}
                      frameless
                    />
                  </View>
                </View>

                {/* Items */}
                {(order.order_items ?? []).length > 0 && (
                  <View className="rounded-lg border border-black/[0.08] overflow-hidden mb-3">
                    <View className="flex-row px-2.5 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="flex-1 text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 0.6 }}>Kalem / Hizmet</Text>
                      <Text className="text-[7px] font-bold uppercase text-ink-400 text-center" style={{ width: 40, letterSpacing: 0.6 }}>Adet</Text>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ textAlign: 'end' as any, width: 60, letterSpacing: 0.6 }}>Fiyat</Text>
                    </View>
                    {(order.order_items ?? []).map((it: any, i: number) => (
                      <View key={i} className="flex-row px-2.5 py-1.5 border-t border-black/[0.03]">
                        <View className="flex-1 pe-2">
                          <Text className="text-[10px] text-ink-900">{it.name}</Text>
                          {!!it.notes && String(it.notes).trim().length > 0 && (
                            <Text className="text-[8.5px] text-ink-500 mt-0.5">{it.notes}</Text>
                          )}
                        </View>
                        <Text className="text-[10px] text-ink-500 text-center" style={{ width: 40 }}>{it.quantity}</Text>
                        <Text className="text-[10px] text-ink-900" style={{ textAlign: 'end' as any, width: 60 }}>
                          {it.price > 0 ? `₺${it.price.toLocaleString('tr-TR')}` : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Notes */}
                <View className="flex-row gap-2 mb-3">
                  <View className="flex-1 rounded-lg border border-black/[0.08] overflow-hidden">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Hekim Notu</Text>
                    </View>
                    <View className="px-2.5 py-2" style={{ minHeight: 32 }}>
                      <Text className="text-[9px] text-ink-600">{order.notes || '—'}</Text>
                    </View>
                  </View>
                  <View className="flex-1 rounded-lg border border-black/[0.08] overflow-hidden">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Lab Notu</Text>
                    </View>
                    <View className="px-2.5 py-2" style={{ minHeight: 32 }}>
                      <Text className="text-[9px] text-ink-600">{order.lab_notes || '—'}</Text>
                    </View>
                  </View>
                </View>

                {/* Doctor Messages */}
                {chatMessages.filter(m => m.sender?.user_type === 'doctor' || m.sender?.user_type === 'clinic_admin').length > 0 && (
                  <View className="rounded-lg border border-black/[0.08] overflow-hidden mb-3">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>
                        Hekim Mesajları ({chatMessages.filter(m => m.sender?.user_type === 'doctor' || m.sender?.user_type === 'clinic_admin').length})
                      </Text>
                    </View>
                    <View className="px-2.5 py-1.5">
                      {chatMessages
                        .filter(m => m.sender?.user_type === 'doctor' || m.sender?.user_type === 'clinic_admin')
                        .map((m, i) => (
                          <View key={i} className={`py-1.5 ${i > 0 ? 'border-t border-black/[0.03]' : ''}`}>
                            <Text className="text-[7px] text-ink-400">
                              <Text className="font-semibold text-ink-500">{m.sender?.full_name ?? 'Hekim'}</Text>
                              {' · '}{fmtDate(m.created_at)}
                            </Text>
                            <Text className="text-[9px] text-ink-900 mt-0.5">{m.content}</Text>
                          </View>
                        ))}
                    </View>
                  </View>
                )}

                {/* Footer — QR + Signatures */}
                <View className="flex-row justify-between items-end pt-3 mt-2" style={{ borderTopWidth: 1.5, borderTopColor: '#0A0A0A' }}>
                  <View className="items-center">
                    {/* @ts-ignore web img */}
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}&margin=4&bgcolor=ffffff&color=0a0a0a`} width={52} height={52} style={{ borderRadius: 4 }} />
                    <Text className="text-[7px] text-ink-300 mt-1">{order.order_number}</Text>
                  </View>
                  <View className="flex-row gap-4">
                    {['Teslim Alan', 'Teknisyen', 'Kalite Kontrol'].map(lbl => (
                      <View key={lbl} className="items-center">
                        <View style={{ width: 68, height: 28 }} />
                        <View style={{ width: 68, borderTopWidth: 1, borderTopColor: '#0A0A0A' }} />
                        <Text className="text-[7px] text-ink-400 mt-1 uppercase" style={{ letterSpacing: 0.3 }}>{lbl}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Değerlendirme modalı — teslim edilen iş (Faz 1) */}
      <ReviewModal
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
        workOrderId={id}
        orderLabel={order ? `${order.order_number}${order.patient_name ? ' · ' + order.patient_name : ''}` : undefined}
        existing={myReview}
        raterRole={panelGroup === '(clinic)' ? 'clinic' : 'doctor'}
        onSaved={(r) => setMyReview(r)}
      />
    </ScrollView>
  );
}

// ═══════════════ TAB CONTENT ═══════════════
function ActivityFeed({ history }: { history: StatusHistory[] }) {
  if (history.length === 0) {
    return (
      <View className="py-6 items-center">
        <Text className="text-[12px] text-ink-400">Henüz aktivite kaydı yok</Text>
      </View>
    );
  }
  const sorted = [...history].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  );
  return (
    <View className="relative">
      <View className="absolute bg-black/[0.06]" style={{ start: 13, top: 14, bottom: 14, width: 1.5 }} />
      {sorted.map((h, i) => {
        const who = (h as any).changer?.full_name ?? 'Sistem';
        const newCfg = STATUS_CONFIG[h.new_status];
        const action = h.old_status
          ? `${STATUS_CONFIG[h.old_status]?.label ?? h.old_status} → ${newCfg?.label ?? h.new_status}`
          : `${newCfg?.label ?? h.new_status} olarak ayarladı`;
        const time = h.created_at ? timeAgo(h.created_at) : '';
        const dotBg = newCfg?.color ?? '#9A9A9A';
        return (
          <View key={h.id ?? i} className="flex-row gap-3 py-2.5 relative z-10">
            <View
              className="w-7 h-7 rounded-full items-center justify-center"
              style={{ backgroundColor: dotBg }}
            >
              <Text className="text-white text-[12px]">•</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[12px]">
                <Text className="font-medium text-ink-900">{who}</Text>{' '}
                <Text className="text-ink-500">{action}</Text>
              </Text>
              {h.note ? (
                <Text className="text-[11px] text-ink-700 mt-1">{h.note}</Text>
              ) : null}
              <Text className="text-[11px] text-ink-400 mt-0.5">{time}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Accent üzerinde okunabilir ön-plan: açık accent'te (lab safranı) ink, koyuda beyaz. */
function onAccent(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#FFFFFF';
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(parseInt(h.slice(0, 2), 16))
          + 0.7152 * lin(parseInt(h.slice(2, 4), 16))
          + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
  return L > 0.5 ? '#0A0A0A' : '#FFFFFF';
}
/** #RRGGBB → rgba(...) */
function alphaOf(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// Dosya kategorisi — Taramalar (3D/zip) · Fotoğraflar (görsel) · Belgeler (diğer)
type FileCat = 'scan' | 'photo' | 'doc';
function fileCategoryOf(pathOrName: string): FileCat {
  const p = (pathOrName || '').toLowerCase();
  if (/\.(stl|ply|obj|zip|3mf|dcm)$/.test(p)) return 'scan';
  if (/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|svg)$/.test(p)) return 'photo';
  return 'doc';
}
/** Galeri ileri/geri düğmesi — görselin dikey ortasında yüzer. */
const galleryNavBtn = {
  position: 'absolute' as const,
  top: '50%' as any, marginTop: -15,
  width: 30, height: 30, borderRadius: 15,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  backgroundColor: 'rgba(255,255,255,0.92)',
  ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,23,42,0.16)' } as any) : {}),
};

const FILE_CAT_META: { key: FileCat; label: string }[] = [
  { key: 'scan',  label: 'Taramalar' },
  { key: 'photo', label: 'Fotoğraflar' },
  { key: 'doc',   label: 'Belgeler' },
];

function FilesList({
  photos, signedUrls, thumbUrls, workOrderId, accentColor, onUploaded,
}: {
  photos: WorkOrderPhoto[];
  signedUrls: Record<string, string>;
  /** Küçük boy URL'ler (Supabase render/image). Boşsa tam boya düşülür. */
  thumbUrls?: Record<string, string>;
  workOrderId: string;
  accentColor: string;
  onUploaded?: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Kategori aç/kapa durumu (varsayılan: KAPALI — kullanıcı isterse açar)
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  // 3D viewer state
  const [viewer3DFile, setViewer3DFile] = useState<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj'; textureUrl?: string|null } | null>(null);
  // Uygulama-içi görsel / HTML tasarım önizleme (yeni tab yerine popup) — dosya modalı ile aynı davranış
  const [imageViewer, setImageViewer] = useState<{ url: string; name: string } | null>(null);
  const [htmlViewer, setHtmlViewer]   = useState<{ url?: string; html?: string; name: string } | null>(null);
  // Zip tarama arşivi: açılıyor göstergesi + zip içi görseller + revoke edilecek blob URL'ler
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [zipImages, setZipImages] = useState<{ url: string; name: string }[] | null>(null);
  const zipUrlsRef = useRef<string[]>([]);
  const revokeZipUrls = () => {
    zipUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    zipUrlsRef.current = [];
  };
  const closeHtmlViewer = () => {
    if (htmlViewer?.url?.startsWith('blob:')) { try { URL.revokeObjectURL(htmlViewer.url); } catch {} }
    setHtmlViewer(null);
  };

  // OBJ'nin AYNI KLASÖRÜNDEKİ texture (PNG/JPG) signed URL'ini bul.
  // Object Capture çıktısı: facescan-{ts}/baked_mesh.obj + baked_mesh_tex0.png
  const siblingTextureUrl = (objPath: string): string | null => {
    const slash = objPath.lastIndexOf('/');
    if (slash < 0) return null;
    const dir = objPath.slice(0, slash);
    const tex = photos.find(p =>
      p.storage_path.startsWith(dir + '/') && /\.(png|jpe?g)$/i.test(p.storage_path)
    );
    if (!tex) return null;
    return signedUrls[tex.storage_path] ?? (tex as any).signed_url ?? null;
  };

  // İndirme dosya adı — caption'da uzantı yoksa gerçek uzantıyı ekle (zip zip iner).
  const zipDownloadName = (f: WorkOrderPhoto): string => {
    const base = f.storage_path.split('/').pop() ?? 'file';
    const realExt = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
    let name = (f.caption?.trim() || base);
    if (realExt && !name.toLowerCase().endsWith('.' + realExt)) name = `${name}.${realExt}`;
    return name;
  };

  const openPreview = (f: WorkOrderPhoto) => {
    const url = signedUrls[f.storage_path] ?? (f as any).signed_url ?? null;
    // İmzalı URL yok (henüz yüklenmedi ya da storage erişimi yok) → sessiz kalma.
    if (!url) { toast.error('Dosyaya erişilemedi. Birazdan tekrar deneyin.'); return; }
    const filename = f.caption ?? f.storage_path.split('/').pop() ?? '';
    const ext = (f.storage_path.split('.').pop() || '').toLowerCase();
    // Görsel → uygulama-içi lightbox (web + native). SVG native'de RN Image ile
    // render olmaz → native'de aşağıdaki sistem-tarayıcı yoluna düşer.
    const isRasterImg = ['jpg','jpeg','png','gif','webp','bmp','heic','heif','avif'].includes(ext);
    if (isRasterImg || (ext === 'svg' && Platform.OS === 'web')) {
      setImageViewer({ url, name: filename });
      return;
    }
    // 3D (STL/PLY/OBJ) → uygulama-içi viewer (web three.js · native WebView+three.js).
    const fmt = is3DFileExt(f.storage_path);
    if (fmt) {
      const textureUrl = fmt === 'obj' ? siblingTextureUrl(f.storage_path) : null;
      setViewer3DFile({ id: f.id, name: filename, url, format: fmt, textureUrl });
      return;
    }
    // ZIP → native: fflate ile aç (data-URI), içindeki mesh'leri 3D viewer'da göster.
    if (isArchiveExt(f.storage_path) && Platform.OS !== 'web') {
      setExtractingId(f.id);
      (async () => {
        try {
          const r = await unzipToViewerNative(url, { idPrefix: f.id });
          if (r.files.length > 0) {
            setZipImages(r.images.length ? r.images : null);
            setZipSource({ url, name: zipDownloadName(f) });   // indirme → kaynak zip
            setViewerAll(r.files);
          } else if (r.images.length > 0) {
            setZipImages(r.images);
            setImageViewer(r.images[0]);
          } else {
            openFileUrl(url);
          }
        } catch { openFileUrl(url); }
        finally { setExtractingId(null); }
      })();
      return;
    }
    // HTML tasarım (exocad web viewer) → uygulama-içi görüntüleyici (web: iframe · native: WebView).
    // content-type text olabildiği için içeriği çekip gömüyoruz (yazı değil tasarım render edilir).
    // Desktop/webapp ile birebir: dosya dışarı çıkmadan uygulama içinde açılır.
    if (ext === 'html' || ext === 'htm') {
      setExtractingId(f.id);
      (async () => {
        try {
          const res = await fetch(url); const text = await res.text();
          if (Platform.OS === 'web') {
            setHtmlViewer({ url: URL.createObjectURL(new Blob([text], { type: 'text/html' })), name: filename });
          } else {
            setHtmlViewer({ html: text, name: filename });
          }
        } catch { openFileUrl(url); }
        finally { setExtractingId(null); }
      })();
      return;
    }
    // Native: kalan tipler (PDF vb.) için web-içi görüntüleyici yok → sistem tarayıcısı.
    if (Platform.OS !== 'web') { openFileUrl(url); return; }
    // ZIP → tarayıcı içinde aç, içindeki mesh'leri 3D viewer'da göster (klinikler tüm
    // taramaları tek zip içine koyuyor). Mesh yoksa görsel lightbox, o da yoksa indir.
    if (isArchiveExt(f.storage_path) && Platform.OS === 'web') {
      setExtractingId(f.id);
      (async () => {
        try {
          revokeZipUrls();
          const r = await unzipToViewer(url, { idPrefix: f.id });
          zipUrlsRef.current = r.objectUrls;
          if (r.files.length > 0) {
            setZipImages(r.images.length ? r.images : null);
            setZipSource({ url, name: zipDownloadName(f) });   // indirme → kaynak zip
            setViewerAll(r.files);
          } else if (r.images.length > 0) {
            setZipImages(r.images);
            setImageViewer(r.images[0]);
          } else if (typeof window !== 'undefined') {
            window.open(url, '_blank');
          }
        } catch { if (typeof window !== 'undefined') window.open(url, '_blank'); }
        finally { setExtractingId(null); }
      })();
      return;
    }
    if (typeof window !== 'undefined') window.open(url, '_blank');
  };

  const forceDownload = async (f: WorkOrderPhoto) => {
    const url = signedUrls[f.storage_path] ?? (f as any).signed_url ?? null;
    if (!url) return;
    // Dosya adı — caption'da uzantı yoksa gerçek uzantıyı ekle (ör. "Üst Çene · OrthoCAD" → ".zip").
    // Böylece ZIP, ZIP olarak iner (içi AÇILMAZ) — tüm platformlarda ham dosya.
    const base = f.storage_path.split('/').pop() ?? 'file';
    const realExt = (base.includes('.') ? base.split('.').pop()! : '').toLowerCase();
    let name = (f.caption?.trim() || base);
    if (realExt && !name.toLowerCase().endsWith('.' + realExt)) name = `${name}.${realExt}`;
    // Supabase signed URL'e `download` parametresi → sunucu Content-Disposition: attachment
    // döner; tarayıcı ham dosyayı İNDİRİR (blob/CORS/iOS-PWA sorunları olmadan, zip açılmadan).
    const dlUrl = url + (url.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(name);
    // Native: sistem indiricisi/tarayıcısı. Web (desktop + PWA): <a download> ile tetikle.
    if (Platform.OS !== 'web' || typeof document === 'undefined') { openFileUrl(dlUrl); return; }
    try {
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 100);
    } catch {
      try { window.open(dlUrl, '_blank'); } catch {}
    }
  };

  // Multi-file viewer (tüm 3D dosyaları üst üste aç) — Faz 7
  const [viewerAll, setViewerAll] = useState<Array<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj'; textureUrl?: string|null }> | null>(null);
  // ZIP'ten açılan viewer'da indirme kaynağı (mesh yerine kaynak zip insin)
  const [zipSource, setZipSource] = useState<{ url: string; name: string } | null>(null);
  const all3DFiles = useMemo(() => {
    return photos
      .map(f => {
        const filename = f.caption ?? f.storage_path.split('/').pop() ?? '';
        const fmt = is3DFileExt(f.storage_path);
        const url = signedUrls[f.storage_path] ?? (f as any).signed_url ?? null;
        if (!fmt || !url) return null;
        const textureUrl = fmt === 'obj' ? siblingTextureUrl(f.storage_path) : null;
        return { id: f.id, name: filename, url, format: fmt, textureUrl };
      })
      .filter(Boolean) as Array<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj'; textureUrl?: string|null }>;
  }, [photos, signedUrls]);

  // 2D referans fotoğraflar — gülüş tasarımı / ekartörlü resim vb. (jpg/png)
  const referenceImages = useMemo(() => {
    return photos
      .map(f => {
        const filename = f.caption ?? f.storage_path.split('/').pop() ?? 'Resim';
        const isImg = /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(f.storage_path);
        const url = signedUrls[f.storage_path] ?? (f as any).signed_url ?? null;
        // Lightbox alt şeridi küçük boyu kullanır; yoksa tam boya düşer.
        const thumb = (thumbUrls ?? {})[f.storage_path] ?? url;
        return isImg && url ? { id: f.id, name: filename, url, thumb } : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string; url: string; thumb: string }>;
  }, [photos, signedUrls]);

  // Kategori grupları — Taramalar / Fotoğraflar / Belgeler (boş olanlar gizli)
  // Fotoğraf kategorisi galeri olarak gösterilir: üstte büyük görsel, altta
  // küçük karolar. Silme YOK — detay ekranı okuma/inceleme alanı.
  const [galleryId, setGalleryId] = useState<string | null>(null);

  const photoGroups = useMemo(() => {
    const by: Record<FileCat, WorkOrderPhoto[]> = { scan: [], photo: [], doc: [] };
    for (const f of photos) by[fileCategoryOf(f.caption || f.storage_path)].push(f);
    return FILE_CAT_META.map(m => ({ ...m, files: by[m.key] })).filter(g => g.files.length > 0);
  }, [photos]);

  // ÖNEMLİ: StageFileUpload her zaman aynı JSX pozisyonunda render edilmeli;
  // photos.length 0→1 geçişinde unmount olmamalı. Aksi halde modalOpen state
  // sıfırlanır ve modal kapanır.
  return (
    <View className="gap-3">
      {/* Multi-file "Tümünü 3D Aç" butonu — 2+ STL/PLY/OBJ varsa görünür (web + native).
          Tüm taramaları tek sahnede katmanlar halinde açar (desktop paritesi). */}
      {all3DFiles.length >= 2 && (() => {
        // Panel accent'li pill CTA (tasarım dili: radius 999, accent = panel primary,
        // accent-tonlu yumuşak gölge). Ön-plan kontrast-farkında: lab safranında ink.
        const fg = onAccent(accentColor);
        return (
          <Pressable
            onPress={() => { setZipSource(null); setViewerAll(all3DFiles); }}
            android_ripple={{ color: alphaOf(fg, 0.12) }}
            /* NOT: object style ZORUNLU — NativeWind v4'te fonksiyon-stilli Pressable
               native'de backgroundColor'ı düşürüyor (buton beyaz kalıyordu). */
            style={{
              alignSelf: 'center',
              flexDirection: 'row', alignItems: 'center', gap: 9,
              height: 40, paddingHorizontal: 13, borderRadius: 999,
              backgroundColor: accentColor,
              shadowColor: accentColor, shadowOpacity: 0.30, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
              elevation: 3,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Layers size={16} color={fg} strokeWidth={2.2} />
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: fg, letterSpacing: -0.2 }} numberOfLines={1}>
              Tümünü 3D Aç
            </Text>
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: alphaOf(fg, 0.20), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: fg }}>{all3DFiles.length}</Text>
            </View>
          </Pressable>
        );
      })()}
      {photos.length === 0 ? (
        <View className="py-4 items-center">
          <Text className="text-[12px] text-ink-400">Bu siparişe henüz dosya eklenmedi</Text>
        </View>
      ) : (
        <View>
          {photoGroups.map((g) => {
          const isCollapsed = !openCats[g.key];
          const catColor = g.key === 'photo' ? '#10B981' : g.key === 'scan' ? '#3B82F6' : '#6B7280';
          return (
          <View key={g.key} style={{ marginBottom: 2 }}>
            {/* Kategori başlığı — tıklayınca aç/kapa (varsayılan kapalı) */}
            <Pressable
              onPress={() => setOpenCats(s => ({ ...s, [g.key]: !s[g.key] }))}
              hitSlop={4}
              /* NOT: object style ZORUNLU — NativeWind v4'te fonksiyon-stilli
                 Pressable native'de stili düşürüp satırı column'a çeviriyor;
                 rozet tam-genişlik bar oluyordu (web'de sorun yok). */
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              {isCollapsed ? <ChevronRight size={14} color="#64748B" strokeWidth={2} /> : <ChevronDown size={14} color="#64748B" strokeWidth={2} />}
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: '#475569' }}>{g.label}</Text>
              <View style={{ minWidth: 20, height: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: catColor + '1A', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: catColor }}>{g.files.length}</Text>
              </View>
            </Pressable>
            {!isCollapsed && g.key === 'photo' && (() => {
              // İmzalı URL'i olan görseller — henüz gelmemiş olanlar atlanır,
              // boş kutu göstermek yerine geldiğinde kendiliğinden belirir.
              const imgs = g.files
                .map(f => ({
                  f,
                  url: signedUrls[f.storage_path] ?? (f as any).signed_url ?? null,
                  // Şerit karoları küçük boyu kullanır; henüz gelmediyse tam boya düşer.
                  thumb: (thumbUrls ?? {})[f.storage_path] ?? signedUrls[f.storage_path] ?? (f as any).signed_url ?? null,
                }))
                .filter(x => !!x.url) as Array<{ f: typeof g.files[number]; url: string; thumb: string }>;
              if (!imgs.length) return null;
              const cur = imgs.find(x => x.f.id === galleryId) ?? imgs[0];
              const idx = imgs.findIndex(x => x.f.id === cur.f.id);
              const step = (d: number) => setGalleryId(imgs[(idx + d + imgs.length) % imgs.length].f.id);
              return (
                <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                  {/* Büyük görsel — tıklayınca mevcut önizleyici açılır */}
                  <View style={{ position: 'relative' }}>
                    <Pressable
                      onPress={() => openPreview(cur.f)}
                      style={{
                        width: '100%', height: 220, borderRadius: 12, overflow: 'hidden',
                        backgroundColor: '#0F172A08',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}
                    >
                      <Image source={{ uri: cur.url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    </Pressable>
                    {imgs.length > 1 && (
                      <>
                        {/* Konum start/end ile aynalanır; ok da aynalanmazsa
                            RTL'de "geri" düğmesi ileri ok gösterirdi. */}
                        <Pressable onPress={() => step(-1)} style={[galleryNavBtn, isRTL() ? { right: 8 } : { left: 8 }]} hitSlop={8}>
                          {isRTL()
                            ? <ChevronRight size={16} color="#0F172A" strokeWidth={2} />
                            : <ChevronLeft size={16} color="#0F172A" strokeWidth={2} />}
                        </Pressable>
                        <Pressable onPress={() => step(1)} style={[galleryNavBtn, isRTL() ? { left: 8 } : { right: 8 }]} hitSlop={8}>
                          {isRTL()
                            ? <ChevronLeft size={16} color="#0F172A" strokeWidth={2} />
                            : <ChevronRight size={16} color="#0F172A" strokeWidth={2} />}
                        </Pressable>
                        <View style={{
                          position: 'absolute', bottom: 8, alignSelf: 'center',
                          paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999,
                          backgroundColor: 'rgba(15,23,42,0.72)',
                        }}>
                          <Text style={{ fontSize: 10.5, color: '#FFF', fontWeight: '600' }}>{idx + 1} / {imgs.length}</Text>
                        </View>
                      </>
                    )}
                  </View>
                  {/* Şerit — tek sıra, bitişik karolar; seçili olan genişler.
                      Sarmalayan ızgara yerine yatay kaydırma: 20 fotoğrafta bile
                      tek satır kalır, büyük görselin altındaki yükseklik sabit. */}
                  {imgs.length > 1 && (
                    /* Sabit genişlik + yatay kaydırma yerine ESNEK pay: kaç
                       fotoğraf olursa olsun hepsi tek sıraya sığar, taşma yok.
                       Seçili karo 2.4 kat pay alıp öne çıkar.
                       Aradaki beyaz çizgi: satır zemini beyaz + 2px gap. */
                    <View style={{
                      flexDirection: 'row', marginTop: 8, gap: 2,
                      borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF',
                    }}>
                      {imgs.map(x => {
                        const active = x.f.id === cur.f.id;
                        return (
                          <Pressable
                            key={x.f.id}
                            onPress={() => setGalleryId(x.f.id)}
                            style={{
                              flex: active ? 2.4 : 1,
                              height: 68, minWidth: 0,
                              backgroundColor: '#EEF2F6',
                              opacity: active ? 1 : 0.78,
                              ...(Platform.OS === 'web'
                                ? ({ cursor: 'pointer',
                                     transition: 'flex-grow 220ms ease-out, opacity 220ms ease-out' } as any)
                                : {}),
                            }}
                          >
                            <Image source={{ uri: x.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}
            {!isCollapsed && g.key !== 'photo' && g.files.map((f) => {
            const ext = (f.storage_path.split('.').pop() ?? '').toUpperCase().slice(0, 4);
            const isImage = /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.storage_path);
            // Tür ayrımı: STL/PLY/OBJ, ZIP, HTML ve PDF ayrı renk+ikon alır.
            // Öncesinde görsel olmayan her şey aynı mavi dosya ikonuydu.
            const lowExt = ext.toLowerCase();
            const isMesh = ['stl', 'ply', 'obj', '3mf'].includes(lowExt);
            const isZip  = ['zip', 'rar', '7z', 'gz'].includes(lowExt);
            const isHtml = ['html', 'htm'].includes(lowExt);
            const isPdf  = lowExt === 'pdf';
            const color = isImage ? '#10B981'
                        : isMesh ? '#3B82F6'
                        : isZip  ? '#D97706'
                        : isHtml ? '#8B5CF6'
                        : isPdf  ? '#DC2626'
                        : '#64748B';
            const Icon = isImage ? ImageIcon : isMesh ? Layers : FileIcon;
            const filename = f.caption ?? f.storage_path.split('/').pop() ?? '—';
            return (
              <View
                key={f.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 9,
                  paddingHorizontal: 12, paddingVertical: 5, paddingStart: 28,
                }}
              >
                <View
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: color + '1A',
                    borderWidth: 1, borderColor: color + '33',
                  }}
                >
                  <Icon size={11} color={color} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#0A0A0A', flexShrink: 1 }}>
                    {filename}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#9A9A9A', flexShrink: 0 }} numberOfLines={1}>
                    {ext}{f.tooth_number != null ? ` · Diş ${f.tooth_number}` : ''}
                  </Text>
                </View>
                {/* Preview button — STL/PLY/OBJ ise 3D viewer, zip ise açıp 3D, diğerleri yeni tab */}
                <Pressable
                  onPress={() => openPreview(f)}
                  disabled={extractingId === f.id}
                  hitSlop={6}
                  // @ts-ignore web tooltip
                  title={isArchiveExt(f.storage_path) ? 'Zip aç ve 3D göster' : 'Önizle'}
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    ...(Platform.OS === 'web' && extractingId !== f.id ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  {extractingId === f.id
                    ? <ActivityIndicator size="small" color="#475569" />
                    : <Eye size={12} color="#475569" strokeWidth={1.8} />}
                </Pressable>
                {/* Download button — zorla indirme */}
                <Pressable
                  onPress={() => forceDownload(f)}
                  hitSlop={6}
                  // @ts-ignore web tooltip
                  title="İndir"
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Download size={12} color="#475569" strokeWidth={1.8} />
                </Pressable>
              </View>
            );
            })}
          </View>
          );
          })}
        </View>
      )}
      {/* 3D Yüz Tarama — sadece TrueDepth'li iPhone'larda görünür, diğer
          platformlarda null döner. Mevcut StageFileUpload akışını bozmaz. */}
      <FaceScanButton
        workOrderId={workOrderId}
        accentColor={accentColor}
        onUploaded={onUploaded}
      />

      {/* StageFileUpload sabit pozisyon — re-render'da unmount olmaz.
          triggerStyle='row': iç içe kart yerine inline trigger satırı (üstteki foto listesiyle aynı tarz). */}
      <StageFileUpload
        workOrderId={workOrderId}
        accentColor={accentColor}
        onUploaded={onUploaded}
        hideFileList
        triggerStyle="row"
      />

      {/* 3D Viewer Modal — STL/PLY/OBJ önizleme için lazy chunk */}
      {viewer3DFile && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModal
            visible={!!viewer3DFile}
            files={[viewer3DFile]}
            referenceImages={referenceImages}
            title={viewer3DFile.name}
            onClose={() => setViewer3DFile(null)}
          />
        </React.Suspense>
      )}
      {/* 3D Viewer — native (WebView + three.js) */}
      {viewer3DFile && Platform.OS !== 'web' && (
        <MobileViewer3D
          visible={!!viewer3DFile}
          files={[viewer3DFile]}
          title={viewer3DFile.name}
          onClose={() => setViewer3DFile(null)}
          onThumbnail={(dataUrl) => {
            // Mesh zaten yüklü — küçük resmi bir kez üretip sakla. Sonraki
            // açılışlarda dosya listesi 16-29 MB indirmeden önizleme gösterir.
            const f = photos.find(p => p.id === viewer3DFile.id);
            if (f?.storage_path) void saveMeshThumb(f.storage_path, dataUrl);
          }}
        />
      )}

      {/* Görsel önizleme — zoom (scroll/pinch) + pan + next/prev + safe-area (uygulama-içi).
          Zip içi görseller varsa onlar arasında gezilir. */}
      {imageViewer && (() => {
        const src = (zipImages ?? referenceImages) as Array<{ url: string; name: string; thumb?: string }>;
        const lbImages = src.length
          ? src.map(r => ({ url: r.url, name: r.name, thumb: r.thumb }))
          : [imageViewer];
        let lbIndex = lbImages.findIndex(im => im.url === imageViewer.url);
        if (lbIndex < 0) { lbImages.unshift(imageViewer); lbIndex = 0; }
        const close = () => { setImageViewer(null); if (zipImages) { setZipImages(null); revokeZipUrls(); } };
        return (
          <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
            {Platform.OS === 'web' ? (
              <ImageLightbox
                images={lbImages}
                index={lbIndex}
                topInset={insets.top}
                onClose={close}
                onIndexChange={(i) => setImageViewer({ url: lbImages[i].url, name: lbImages[i].name })}
              />
            ) : (
              <NativeImageViewer
                images={lbImages}
                index={lbIndex}
                topInset={insets.top}
                onClose={close}
                onIndexChange={(i) => setImageViewer({ url: lbImages[i].url, name: lbImages[i].name })}
              />
            )}
          </Modal>
        );
      })()}

      {/* HTML tasarım önizleme — exocad web viewer iframe (uygulama-içi) */}
      {htmlViewer && Platform.OS === 'web' && (
        <Modal visible transparent animationType="fade" onRequestClose={closeHtmlViewer}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16,
            // env() CSS fallback — modal context'inde insets.top 0 dönse bile notch'u temizler
            paddingTop: (`max(${Math.max(16, insets.top + 8)}px, calc(env(safe-area-inset-top, 0px) + 12px))`) as any,
            paddingBottom: (`max(${Math.max(16, insets.bottom)}px, calc(env(safe-area-inset-bottom, 0px) + 12px))`) as any }}>
            <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#0A0A0A' }} numberOfLines={1}>{htmlViewer.name}</Text>
                <Pressable onPress={() => window.open(htmlViewer.url, '_blank')} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F1F5F9' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155' }}>Yeni sekmede aç</Text>
                </Pressable>
                <Pressable onPress={closeHtmlViewer} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18, lineHeight: 18, color: '#334155' }}>×</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                {React.createElement('iframe', {
                  src: htmlViewer.url,
                  style: { flex: 1, width: '100%', height: '100%', border: 0, backgroundColor: '#FFFFFF' },
                  title: htmlViewer.name,
                })}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* HTML tasarım önizleme — native (WebView, uygulama-içi exocad viewer) */}
      {htmlViewer && Platform.OS !== 'web' && HtmlWebView && (
        <Modal visible transparent animationType="fade" onRequestClose={closeHtmlViewer}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12,
            paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: Math.max(insets.bottom, 12) }}>
            <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#0A0A0A' }} numberOfLines={1}>{htmlViewer.name}</Text>
                <Pressable onPress={closeHtmlViewer} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18, lineHeight: 18, color: '#334155' }}>×</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
                <HtmlWebView
                  originWhitelist={['*']}
                  source={{ html: htmlViewer.html ?? '' }}
                  style={{ flex: 1, backgroundColor: '#FFFFFF' }}
                  javaScriptEnabled
                  domStorageEnabled
                  allowFileAccess
                  allowUniversalAccessFromFileURLs
                  originAllowsMixedContent
                  scalesPageToFit
                  startInLoadingState
                  renderLoading={() => (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator size="large" color="#4771AB" />
                    </View>
                  )}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Multi-file viewer — "Tümünü 3D Aç" veya zip'ten çıkan mesh'ler tek sahnede.
          Zip'ten geldiyse referans görseller zip içindekiler olur. */}
      {viewerAll && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModal
            visible={!!viewerAll}
            files={viewerAll}
            referenceImages={zipImages ?? referenceImages}
            title={`${viewerAll.length} dosya birlikte`}
            sourceDownload={zipSource ?? undefined}
            onClose={() => { setViewerAll(null); setZipImages(null); setZipSource(null); revokeZipUrls(); }}
          />
        </React.Suspense>
      )}
      {/* ZIP taraması / çoklu 3D — native (WebView + three.js) */}
      {viewerAll && Platform.OS !== 'web' && (
        <MobileViewer3D
          visible={!!viewerAll}
          files={viewerAll}
          title={`${viewerAll.length} dosya birlikte`}
          onClose={() => { setViewerAll(null); setZipImages(null); setZipSource(null); }}
        />
      )}
    </View>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)        return 'az önce';
  if (diff < 3600)      return `${Math.floor(diff / 60)} ${autoT('dk önce')}`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)} ${autoT('sa önce')}`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ${autoT('g önce')}`;
  return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' });
}

// ═══════════════ ORDER CHAT POPUP — ana ChatDetail bu işe sabitlenmiş ═══════════════
// Ana mesaj kutusunun TÜM özellikleri (attachments, ses, read receipts, vb.)
// burada da çalışır — sadece bu siparişin thread'ine sabit, sohbet listesi yok.
function OrderChatPopup({
  visible, onClose, order, currentUserId, viewerType, panelAccent,
}: {
  visible: boolean;
  onClose: () => void;
  order: WorkOrder;
  currentUserId: string | null;
  viewerType: any;
  panelAccent: string;
}) {
  // ChatDetail'in beklediği "selectedOrder" şekline çevir.
  // Inbox listesi item'ı gibi davranır — work_order_id zorunlu.
  const selectedOrder = useMemo(() => ({
    work_order_id:  order.id,
    order_number:   order.order_number,
    patient_name:   order.patient_name,
    work_type:      order.work_type,
    status:         order.status,
    tooth_numbers:  order.tooth_numbers,
    shade:          order.shade,
    delivery_date:  order.delivery_date,
    is_urgent:      order.is_urgent,
    doctor:         order.doctor,
    machine_type:   (order as any).machine_type,
    notes:          (order as any).notes,
  }), [order]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        className="flex-1 items-center justify-center"
        style={{
          backgroundColor: 'rgba(10,14,26,0.52)',
          // Global mesaj popup'ıyla tutarlı koyu+blur zemin. animationType="fade"
          // Modal'ın kendisini fade'ler; backdrop'ta element-opacity animasyonu
          // olmadığı için backdropFilter arkadaki uygulamayı bulanıklaştırabiliyor.
          ...(Platform.OS === 'web'
            ? ({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any)
            : {}),
        }}
      >
        <View
          className="bg-white rounded-3xl border border-black/[0.06] overflow-hidden"
          style={{
            width: '94%', maxWidth: 720, height: '88%', maxHeight: 880,
            // @ts-ignore web shadow
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          }}
        >
          {/* Patterns kapatma butonu — sağ üstte yüzer */}
          <Pressable
            onPress={onClose}
            className="absolute z-10 w-9 h-9 rounded-full items-center justify-center bg-white border border-black/[0.06]"
            style={{
              top: 14, end: 14,
              // @ts-ignore web shadow
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <CloseIcon size={16} color="#0A0A0A" strokeWidth={2} />
          </Pressable>

          {/* Ana ChatDetail — tüm özellikleriyle */}
          <ChatDetail
            selectedOrder={selectedOrder}
            accentColor={panelAccent}
            currentUserId={currentUserId}
            viewerType={viewerType}
          />
        </View>
      </View>
    </Modal>
  );
}

// Legacy compat — eski callers için stub. Yeni HTML async olduğundan callers async olmalı.
function buildPrintHtmlV2(order: WorkOrder, qrUrl: string, messages?: Array<{ content: string; created_at: string; sender?: { full_name: string; user_type: string } | null }>): string {
  // Bu fonksiyon artık kullanılmıyor; geçici fallback HTML — gerçek yazdırma async build path'inden geliyor.
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}&margin=4&bgcolor=ffffff&color=0a0a0a`;
  const teeth = (order.tooth_numbers ?? []).sort((a, b) => a - b);
  const doctor = order.doctor?.full_name ?? '—';
  const clinic = order.doctor?.clinic_name ?? order.doctor?.clinic?.name ?? '';
  const cfg = STATUS_CONFIG[order.status as WorkOrderStatus];
  const createdDate = fmtDate(order.created_at);
  const deliveryDate = fmtDate(order.delivery_date);
  const assignee = order.assignee?.full_name ?? '—';
  const items = order.order_items ?? [];
  const notes = order.notes ?? '';
  const labNotes = order.lab_notes ?? '';
  const machineLabel = order.machine_type === 'milling' ? 'Freze (CAD/CAM)' : order.machine_type === '3d_printing' ? '3D Baskı' : order.machine_type ?? '—';
  const modelLabel = order.model_type === 'dijital' ? 'Dijital' : order.model_type === 'fiziksel' ? 'Fiziksel Model' : order.model_type === 'fotograf' ? 'Fotoğraf' : order.model_type === 'cad' ? 'CAD Dosyası' : '—';

  // Hekim mesajları
  const doctorMessages = (messages ?? []).filter(m => m.sender?.user_type === 'doctor' || m.sender?.user_type === 'clinic_admin');

  const itemRows = items.length > 0
    ? items.map(it => `
        <tr>
          <td>${it.name}</td>
          <td class="c">${it.quantity}</td>
          <td class="r">${it.price > 0 ? '₺' + it.price.toLocaleString('tr-TR') : '—'}</td>
        </tr>`).join('')
    : '';

  // FDI tooth grid — 18→11 | 21→28 (üst) ve 48→41 | 31→38 (alt)
  const upperRight = [18,17,16,15,14,13,12,11];
  const upperLeft  = [21,22,23,24,25,26,27,28];
  const lowerRight = [48,47,46,45,44,43,42,41];
  const lowerLeft  = [31,32,33,34,35,36,37,38];
  const selectedSet = new Set(teeth);

  const toothCell = (fdi: number) => {
    const sel = selectedSet.has(fdi);
    return `<td class="tc ${sel ? 'sel' : ''}">${fdi}</td>`;
  };

  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>İŞ KAĞIDI — ${order.order_number}</title>
  <style>
    @page { size: A5 portrait; margin: 8mm; }
    @media print {
      html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter Tight', Inter, -apple-system, sans-serif;
      color: #0A0A0A; background: #F5F2EA; font-size: 10px; line-height: 1.35;
      padding: 24px; margin: 0;
    }
    .page {
      background: #fff; max-width: 520px; margin: 0 auto; padding: 24px;
      border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    @media print {
      body { background: #fff !important; padding: 0 !important; }
      .page { max-width: none; box-shadow: none; border-radius: 0; padding: 0; margin: 0; }
    }

    /* ── Header ── */
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 2.5px solid #0A0A0A; margin-bottom: 10px; }
    .hdr-left .lab { font-size: 15px; font-weight: 800; letter-spacing: -0.4px; }
    .hdr-left .sub { font-size: 8px; color: #777; margin-top: 1px; }
    .hdr-right { text-align: right; }
    .hdr-right .tag { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #999; }
    .hdr-right .no { font-family: 'SF Mono', monospace; font-size: 13px; font-weight: 700; margin-top: 2px; }
    .hdr-right .dt { font-size: 8px; color: #999; margin-top: 2px; }

    /* ── Urgent ── */
    .urg { background: #9C2E2E; color: #fff; text-align: center; padding: 3px; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }

    /* ── Two-col info ── */
    .two-col { display: flex; gap: 10px; margin-bottom: 10px; }
    .col-l, .col-r { flex: 1; }

    /* ── Info box ── */
    .ibox { border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
    .ibox-title { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; background: #FAFAF5; padding: 4px 8px; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .irow { display: flex; border-bottom: 1px solid rgba(0,0,0,0.04); }
    .irow:last-child { border-bottom: none; }
    .irow .lbl { width: 72px; font-size: 8px; color: #999; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 5px 8px; flex-shrink: 0; }
    .irow .val { flex: 1; font-size: 10px; font-weight: 500; padding: 5px 8px; }
    .irow .val.bold { font-weight: 700; }

    /* ── Patient ── */
    .patient { font-size: 18px; font-weight: 300; letter-spacing: -0.6px; line-height: 1.15; padding: 4px 0 2px; }

    /* ── FDI Tooth Grid ── */
    .fdi { border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
    .fdi-title { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; background: #FAFAF5; padding: 4px 8px; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .fdi-grid { padding: 6px 4px; }
    .fdi-grid table { width: 100%; border-collapse: collapse; }
    .fdi-grid td { text-align: center; padding: 0; }
    .tc { font-family: monospace; font-size: 9px; font-weight: 500; color: #CCC;
      height: 26px; vertical-align: middle; border: 1px solid rgba(0,0,0,0.06); }
    .tc.sel { background: #0A0A0A; color: #F5C24B; font-weight: 700; border-color: #0A0A0A; border-radius: 3px; }
    .fdi-mid { height: 3px; }
    .fdi-label { font-size: 7px; color: #BBB; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 0 2px; border: none !important; width: 20px; }

    /* ── Items ── */
    .itbl { width: 100%; border-collapse: collapse; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
    .itbl th { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #999; background: #FAFAF5; padding: 4px 8px; text-align: left; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .itbl td { font-size: 10px; padding: 5px 8px; border-bottom: 1px solid rgba(0,0,0,0.03); }
    .itbl tr:last-child td { border-bottom: none; }
    .c { text-align: center; }
    .r { text-align: right; }

    /* ── Notes / Messages ── */
    .nbox { border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
    .nbox-hd { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; background: #FAFAF5; padding: 4px 8px; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .nbox-bd { padding: 6px 8px; font-size: 9px; color: #3C3C3C; white-space: pre-wrap; min-height: 22px; }
    .nbox-empty { color: #CCC; font-style: italic; }
    .msg { padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.03); }
    .msg:last-child { border-bottom: none; }
    .msg-meta { font-size: 7px; color: #999; margin-bottom: 1px; }
    .msg-meta strong { color: #555; }
    .msg-text { font-size: 9px; color: #0A0A0A; }

    /* ── Footer ── */
    .ftr { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 10px; border-top: 1.5px solid #0A0A0A; margin-top: 8px; }
    .ftr-qr img { width: 56px; height: 56px; }
    .ftr-qr-txt { font-size: 7px; color: #BBB; text-align: center; margin-top: 2px; }
    .sigs { display: flex; gap: 16px; }
    .sig { text-align: center; }
    .sig-line { width: 72px; border-top: 1px solid #0A0A0A; margin-bottom: 3px; margin-top: 28px; }
    .sig-lbl { font-size: 7px; color: #777; text-transform: uppercase; letter-spacing: 0.4px; }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="hdr">
    <div class="hdr-left">
      <div class="lab">Aydın Lab</div>
      <div class="sub">Diş Protez Laboratuvarı · İstanbul</div>
    </div>
    <div class="hdr-right">
      <div class="tag">İş Kağıdı</div>
      <div class="no">${order.order_number}</div>
      <div class="dt">${createdDate}</div>
    </div>
  </div>

  ${order.is_urgent ? '<div class="urg">⚠ ACİL</div>' : ''}

  <!-- TWO COLUMN: Patient + Order Info -->
  <div class="two-col">
    <div class="col-l">
      <div class="ibox">
        <div class="ibox-title">Hasta / Hekim Bilgisi</div>
        <div style="padding: 6px 8px;">
          <div class="patient">${order.patient_name ?? '—'}</div>
          <div style="font-size:9px; color:#666; margin-top:2px;">
            <strong style="color:#0A0A0A">${doctor}</strong>${clinic ? ' · ' + clinic : ''}
          </div>
        </div>
      </div>
    </div>
    <div class="col-r">
      <div class="ibox">
        <div class="ibox-title">Sipariş Detayı</div>
        <div class="irow"><div class="lbl">İş Tipi</div><div class="val bold">${order.work_type ?? '—'}</div></div>
        <div class="irow"><div class="lbl">Renk</div><div class="val">${order.shade ?? '—'}</div></div>
        <div class="irow"><div class="lbl">Teslim</div><div class="val bold">${deliveryDate}</div></div>
        <div class="irow"><div class="lbl">Durum</div><div class="val">${cfg?.label ?? order.status}</div></div>
      </div>
    </div>
  </div>

  <!-- INFO ROW -->
  <div class="ibox">
    <div class="ibox-title">Teknik Bilgiler</div>
    <div style="display:flex;">
      <div style="flex:1; border-right:1px solid rgba(0,0,0,0.06);">
        <div class="irow"><div class="lbl">Makine</div><div class="val">${machineLabel}</div></div>
      </div>
      <div style="flex:1; border-right:1px solid rgba(0,0,0,0.06);">
        <div class="irow"><div class="lbl">Model</div><div class="val">${modelLabel}</div></div>
      </div>
      <div style="flex:1;">
        <div class="irow"><div class="lbl">Teknisyen</div><div class="val">${assignee}</div></div>
      </div>
    </div>
  </div>

  <!-- FDI TOOTH CHART -->
  <div class="fdi">
    <div class="fdi-title">Diş Şeması — ${teeth.length} diş seçili</div>
    <div class="fdi-grid">
      <table>
        <tr>
          ${upperRight.map(t => toothCell(t)).join('')}
          <td class="fdi-label"></td>
          ${upperLeft.map(t => toothCell(t)).join('')}
        </tr>
        <tr class="fdi-mid"><td colspan="17"></td></tr>
        <tr>
          ${lowerRight.map(t => toothCell(t)).join('')}
          <td class="fdi-label"></td>
          ${lowerLeft.map(t => toothCell(t)).join('')}
        </tr>
      </table>
    </div>
  </div>

  <!-- ITEMS -->
  ${items.length > 0 ? `
  <table class="itbl">
    <thead><tr><th>Kalem / Hizmet</th><th class="c">Adet</th><th class="r">Birim Fiyat</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>` : ''}

  <!-- NOTES -->
  <div class="two-col">
    <div class="col-l">
      <div class="nbox">
        <div class="nbox-hd">Hekim Notu</div>
        <div class="nbox-bd">${notes || '<span class="nbox-empty">—</span>'}</div>
      </div>
    </div>
    <div class="col-r">
      <div class="nbox">
        <div class="nbox-hd">Lab Notu (dahili)</div>
        <div class="nbox-bd">${labNotes || '<span class="nbox-empty">—</span>'}</div>
      </div>
    </div>
  </div>

  <!-- DOCTOR MESSAGES -->
  ${doctorMessages.length > 0 ? `
  <div class="nbox">
    <div class="nbox-hd">Hekim Mesajları (${doctorMessages.length})</div>
    <div class="nbox-bd" style="padding:4px 8px;">
      ${doctorMessages.map(m => `
        <div class="msg">
          <div class="msg-meta"><strong>${m.sender?.full_name ?? 'Hekim'}</strong> · ${fmtDate(m.created_at)}</div>
          <div class="msg-text">${m.content}</div>
        </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- FOOTER -->
  <div class="ftr">
    <div class="ftr-qr">
      <img src="${qrImg}" alt="QR" />
      <div class="ftr-qr-txt">${order.order_number}</div>
    </div>
    <div class="sigs">
      <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Teslim Alan</div></div>
      <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Teknisyen</div></div>
      <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Kalite Kontrol</div></div>
    </div>
  </div>

</div>
</body>
</html>`;
}

// ═══════════════ HELPERS ═══════════════
function Avatar({ name, size = 32, bg, fg }: { name: string; size?: number; bg: string; fg: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <View
      className="items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '600', color: fg, letterSpacing: -0.3 }}>{initials}</Text>
    </View>
  );
}

function Chip({ children, tone, dot = false, icon: Icon }: {
  children: React.ReactNode;
  tone: 'outline' | 'neutral' | 'danger';
  dot?: boolean;
  icon?: any;
}) {
  if (tone === 'danger') {
    return (
      <View
        className="flex-row items-center gap-1.5 px-3 py-1 rounded-full"
        style={{ backgroundColor: 'rgba(217,75,75,0.12)' }}
      >
        {Icon && <Icon size={12} color="#9C2E2E" strokeWidth={1.8} />}
        {dot && <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#9C2E2E' }} />}
        <Text className="text-[12px] font-medium" style={{ color: '#9C2E2E' }}>{children}</Text>
      </View>
    );
  }
  const cls = tone === 'neutral' ? 'bg-black/5' : 'bg-transparent border border-ink-300';
  return (
    <View className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full ${cls}`}>
      {Icon && <Icon size={12} color="#0A0A0A" strokeWidth={1.8} />}
      {dot && <View className="w-1.5 h-1.5 rounded-full bg-ink-900" />}
      <Text className="text-[12px] font-medium text-ink-900">{children}</Text>
    </View>
  );
}

function PillBtn({ children, variant = 'primary', size = 'md', icon: Icon, onDark = false, onPress, disabled }: {
  children: React.ReactNode;
  variant?: 'primary' | 'surface' | 'ghost';
  size?: 'sm' | 'md';
  icon?: any; // Lucide ForwardRefExoticComponent — accept any to avoid type friction
  /** Renkli/koyu zemin (yeşil hero) üstünde: primary→beyaz pill + yeşil metin, surface→şeffaf-beyaz outline. */
  onDark?: boolean;
  /** Verilirse buton kendisi basılabilir olur + origin-fill efekti kazanır. */
  onPress?: () => void;
  disabled?: boolean;
}) {
  const sizeCls = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2';
  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[13px]';
  const iconSize = size === 'sm' ? 14 : 16;
  const variantCls = onDark
    ? (variant === 'primary' ? 'bg-white border-white' :
       variant === 'surface' ? 'bg-white/15 border-white/40' :
                               'bg-transparent border-transparent')
    : (variant === 'primary' ? 'bg-ink-900 border-ink-900' :
       variant === 'surface' ? 'bg-white border-ink-200' :
                               'bg-transparent border-transparent');
  const fgClass = onDark
    ? (variant === 'primary' ? 'text-[#0C8F56]' : 'text-white')
    : (variant === 'primary' ? 'text-white' : 'text-ink-900');
  const fgHex = onDark
    ? (variant === 'primary' ? '#0C8F56' : '#FFFFFF')
    : (variant === 'primary' ? '#FFFFFF' : '#0A0A0A');

  // variantCls NativeWind class'ı; OriginFillPressable style aldığı için
  // aynı değerleri hex olarak da tutuyoruz.
  const bgHex = onDark
    ? (variant === 'primary' ? '#FFFFFF' : variant === 'surface' ? 'rgba(255,255,255,0.15)' : 'transparent')
    : (variant === 'primary' ? '#0A0A0A' : variant === 'surface' ? '#FFFFFF' : 'transparent');
  const bdHex = onDark
    ? (variant === 'primary' ? '#FFFFFF' : variant === 'surface' ? 'rgba(255,255,255,0.40)' : 'transparent')
    : (variant === 'primary' ? '#0A0A0A' : variant === 'surface' ? '#EAEAEA' : 'transparent');

  // Dolgu rengi = mevcut zeminin tersi. Beyaza dönen varyantlarda buton beyaz
  // kart üstünde kaybolmasın diye dolu haldeyken ince bir kenar gösterilir.
  const fillHex = onDark
    ? (variant === 'primary' ? '#0C8F56' : '#FFFFFF')
    : (variant === 'primary' ? '#FFFFFF' : '#0A0A0A');
  const fillFgHex = onDark
    ? (variant === 'primary' ? '#FFFFFF' : '#0A0A0A')
    : (variant === 'primary' ? '#0A0A0A' : '#FFFFFF');
  // Açık dolgu (beyaz) → stroke şart; koyu dolguda gerekmiyor.
  const fillBorder = fillHex === '#FFFFFF'
    ? (onDark ? 'rgba(255,255,255,0.55)' : '#EAEAEA')
    : undefined;

  const inner = (color: string) => (
    <View className={`flex-row items-center gap-1.5 ${sizeCls}`}>
      {Icon && <Icon size={iconSize} color={color} strokeWidth={1.8} />}
      <Text className={`font-medium ${textSize}`} style={{ color }}>{children}</Text>
    </View>
  );

  // onPress verilmediyse (salt görsel kullanım) eski davranış: düz View.
  if (!onPress) {
    return (
      <View className={`flex-row items-center gap-1.5 rounded-full border ${sizeCls} ${variantCls}`}>
        {Icon && <Icon size={iconSize} color={fgHex} strokeWidth={1.8} />}
        <Text className={`font-medium ${textSize} ${fgClass}`}>{children}</Text>
      </View>
    );
  }

  return (
    <OriginFillPressable
      onPress={onPress}
      disabled={disabled}
      content={inner}
      baseContentColor={fgHex}
      fillContentColor={fillFgHex}
      fillColor={fillHex}
      fillBorderColor={fillBorder}
      radius={999}
      style={{ borderWidth: 1, backgroundColor: bgHex, borderColor: bdHex }}
    />
  );
}
