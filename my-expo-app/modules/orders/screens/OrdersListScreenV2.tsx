import { localeTag, isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
/**
 * OrdersListScreenV2 — Patterns design language (NativeWind)
 *
 * Mevcut OrdersListScreen'in tamamen yeniden yazılmış hali.
 * Tüm StyleSheet kaldırıldı, className ile NativeWind kullanılıyor.
 *
 * Özellikler:
 *   - Status tab filtresi (sliding underline)
 *   - Arama (expandable)
 *   - Acil / Geciken toggle'ları
 *   - Sıralama modal
 *   - Liste / Kanban geçişi
 *   - Desktop: tablo  ·  Mobile: kart listesi
 *   - Teknisyen atama modalı
 *   - Sayfa başlığı entegrasyonu (PatternsShell)
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';

// ── Footer "PLANLAMA BEKLİYOR" yazısı için subtle pulse (web only) ──
function injectFooterPulseKeyframes() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const id = 'planlama-footer-pulse';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    @keyframes planlama-text-pulse {
      0%, 100% { opacity: 1.00; letter-spacing: 1.4px; }
      50%      { opacity: 0.55; letter-spacing: 2.0px; }
    }
    .planlama-text-pulse {
      animation: planlama-text-pulse 2.4s ease-in-out infinite;
      will-change: opacity, letter-spacing;
    }
  `;
  document.head.appendChild(style);
}
import {
  View, Text, ScrollView, RefreshControl, Pressable, Image,
  TextInput, Modal, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { Search, X, SlidersHorizontal, ArrowUpDown, ChevronLeft, ChevronRight, Flame, Clock, LayoutList, Columns3, UserCheck, Pencil, Archive, Trash2, RotateCcw, AlertCircle, ShieldAlert, ListChecks, Camera, CornerDownLeft, CornerDownRight, Inbox } from '../../../core/ui/icons';
import { RowActionsMenu, type RowAction } from '../../../core/ui/RowActionsMenu';
import { ScanWorkOrderModal } from '../components/ScanWorkOrderModal';
// Admin düzenleme artık yeni-sipariş SİHİRBAZINI (aynı 4 adım) düzenleme modunda açar.
const NewOrderEditWizard: any = React.lazy(() => import('./NewOrderScreen').then((m) => ({ default: (m as any).NewOrderScreen })));
import { archiveOrder, restoreOrder, hardDeleteOrder } from '../api';
import { titleCaseTR } from '../../../core/utils/textCase';

import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/api/supabase';
import { bootMark } from '../../../core/debug/bootTrace';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useNavScrollProps } from '../../../core/ui/mobile/navScroll';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { toast } from '../../../core/ui/Toast';

import { useOrders } from '../hooks/useOrders';
import { useClinicOrders } from '../../clinic/hooks/useClinicOrders';
import { useAssignTechnician } from '../../admin/orders/hooks';
import { advanceOrderStatus } from '../api';
import { StatusUpdateModal } from '../components/StatusUpdateModal';
import { KanbanBoard } from '../components/KanbanBoard';
import { WorkOrder, WorkOrderStatus } from '../types';
import { STATUS_CONFIG, isOrderOverdue } from '../constants';
import { OrderStatusInfo } from '../../../core/ui/OrderStatusInfo';
import { getOrderStageLabel } from '../utils/currentStage';
import { OrdersKanbanB2Mobile } from './OrdersKanbanB2Mobile';
import { DoctorOrdersMobile } from './DoctorOrdersMobile';
import { PendingPaperOrdersScreen } from './PendingPaperOrdersScreen';
import { mapStationToStage } from '../stationMapping';
import { STAGE_LABEL, STAGE_COLOR, legacyStatusToStage, type Stage } from '../stages';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

// ── Panel detection helper ─────────────────────────────────────────
type PanelKind = 'lab' | 'clinic' | 'doctor' | 'admin';

/**
 * Satır sonu işlemleri — masaüstü satırı ve mobil kart AYNI listeyi kullanır.
 *
 * Eskiden iki yerde üç ayrı ikon elle yazılıydı; biri güncellenip diğeri
 * unutulduğunda aynı sipariş iki görünümde farklı işlem seti sunuyordu.
 */
function rowActions(
  order: WorkOrder,
  onEdit?: (o: WorkOrder) => void,
  onArchive?: (o: WorkOrder) => void,
  onDelete?: (o: WorkOrder) => void,
): RowAction[] {
  const isArchived = !!(order as any).is_archived;
  const out: RowAction[] = [];
  if (onEdit)    out.push({ key: 'edit',    label: 'Düzenle', icon: Pencil, onPress: () => onEdit(order) });
  if (onArchive) out.push({
    key: 'archive',
    label: isArchived ? 'Geri yükle' : 'Pasife al',
    icon: isArchived ? RotateCcw : Archive,
    tone: 'warning',
    onPress: () => onArchive(order),
  });
  // Sil her zaman SON — menüde ayırıcıyla ayrılır (RowActionsMenu).
  if (onDelete)  out.push({ key: 'delete', label: 'Kalıcı sil', icon: Trash2, tone: 'danger', onPress: () => onDelete(order) });
  return out;
}

function detectPanel(segments: string[]): PanelKind {
  const seg = segments?.[0] ?? '';
  if (seg === '(clinic)') return 'clinic';
  if (seg === '(doctor)') return 'doctor';
  if (seg === '(admin)')  return 'admin';
  return 'lab';
}

/** Normalise clinic orders (doctor_profile → doctor) to common WorkOrder shape */
function normaliseClinicOrders(orders: any[]): WorkOrder[] {
  return orders.map(o => ({
    ...o,
    doctor: o.doctor ?? (o.doctor_profile ? { full_name: o.doctor_profile.full_name, id: o.doctor_profile.id } : undefined),
  }));
}

// ── Display font ────────────────────────────────────────────────────
const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const };

// Koyu kartta okunmayan koyu ön-plan (status/accent) renkleri için açık karşılıkları.
// Yalnız METİN/İKON önplanı için — arka plan/zemin rengi DEĞİŞMEZ.
const DARK_FG: Record<string, string> = {
  '#1E3A8A': '#93C5FD', '#1E5A8A': '#93C5FD', '#1F5689': '#93C5FD', '#3563A8': '#93C5FD',
  '#0F6E50': '#6EE7B7', '#059669': '#6EE7B7', '#1F6B47': '#6EE7B7',
  '#9C2E2E': '#FCA5A5', '#DC2626': '#FCA5A5',
  '#92400E': '#E8B45E', '#B45309': '#E8B45E', '#D97706': '#E8B45E', '#9C5E0E': '#E8B45E',
};
function darkFg(isDark: boolean, fg: string, fallback?: string): string {
  return isDark ? (DARK_FG[fg] ?? fallback ?? fg) : fg;
}

// ── Types ───────────────────────────────────────────────────────────
type ViewMode = 'list' | 'kanban';
type SortBy   = 'delivery_date' | 'created_at' | 'order_number' | 'is_urgent';
type SortDir  = 'asc' | 'desc';

const STATUS_FILTERS: { value: WorkOrderStatus | 'all'; label: string }[] = [
  { value: 'all',             label: 'Tümü'   },
  { value: 'alindi',          label: 'Planlama' },
  { value: 'uretimde',        label: 'Üretim' },
  { value: 'kalite_kontrol',  label: 'KK'     },
  { value: 'teslimata_hazir', label: 'Hazır'  },
  { value: 'teslim_edildi',   label: 'Teslim' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'delivery_date', label: 'Teslim Tarihi'  },
  { value: 'created_at',    label: 'Oluşturma'      },
  { value: 'order_number',  label: 'Sipariş No'     },
  { value: 'is_urgent',     label: 'Aciliyet'       },
];

// ── Helpers ─────────────────────────────────────────────────────────
function deliveryText(d: string, status: WorkOrderStatus, holdStatus?: string | null): string {
  if (status === 'teslim_edildi') return 'Teslim edildi';
  // Beklemedeki iş gecikme göstermez — sayaç durdu (bkz. isOrderOverdue / hold).
  if (holdStatus === 'on_hold') return 'Beklemede';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(d + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0)   return `${Math.abs(diff)}g gecikti`;
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff <= 6)  return `${diff} ${autoT('gün')}`;
  return due.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' });
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}

function stageOf(o: WorkOrder): Stage {
  const fromStation = (o as any).current_stage_name as string | null | undefined;
  return fromStation
    ? mapStationToStage(fromStation, legacyStatusToStage(o.status))
    : legacyStatusToStage(o.status);
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════
export function OrdersListScreenV2() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  // Ana sayfa (Lab/Admin/Doctor/Clinic dashboard) ile aynı bg tonu.
  const T = useMobileTokens();
  // Floating navbar scroll farkındalığı (bkz. core/ui/mobile/navScroll.ts)
  const navScrollProps = useNavScrollProps();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // SlideTabBar cursor'ı beyaz metin basar → koyu ink şart (panel `primary`si
  // lab'da safran sarısı, beyaz yazıyla okunmaz). Ekranda zaten bir `panel`
  // değişkeni var, bu yüzden `panelTheme`.
  const panelTheme = usePanelTheme();

  // Footer "PLANLAMA BEKLİYOR" pulse — bir kez enjekte
  useEffect(() => { injectFooterPulseKeyframes(); }, []);
  const segments = useSegments() as string[];
  const panelGroup = segments?.[0] ?? '';
  const panel = detectPanel(segments);

  const isTechnician = profile?.user_type === 'lab' && (profile as any)?.role === 'technician';
  const isManager    = (panel === 'lab' || panel === 'admin')
                    && ((profile?.user_type === 'lab' && (profile as any)?.role === 'manager')
                        || profile?.user_type === 'admin');
  const isAdmin      = profile?.user_type === 'admin';

  // Admin "Arşivi göster" toggle (state'i hook'tan önce — fetch param'ı için)
  const [showArchived, setShowArchived] = useState(false);

  // Admin actions state — düzenle/pasife/sil için modal'lar list seviyesinde tutulur
  const [adminEditTarget, setAdminEditTarget]     = useState<WorkOrder | null>(null);
  const [adminArchiveTarget, setAdminArchiveTarget] = useState<WorkOrder | null>(null);
  const [adminDeleteTarget, setAdminDeleteTarget] = useState<WorkOrder | null>(null);
  const [adminBusy, setAdminBusy]                 = useState(false);
  const [adminConfirmText, setAdminConfirmText]   = useState('');

  const handleArchiveConfirm = async () => {
    if (!adminArchiveTarget) return;
    setAdminBusy(true);
    const isArchived = !!(adminArchiveTarget as any).is_archived;
    const result = isArchived
      ? await restoreOrder(adminArchiveTarget.id)
      : await archiveOrder(adminArchiveTarget.id);
    setAdminBusy(false);
    if (!result.ok) { toast.error(result.error ?? 'İşlem başarısız'); return; }
    toast.success(isArchived ? 'Sipariş geri yüklendi' : 'Sipariş pasife alındı');
    setAdminArchiveTarget(null);
    await Promise.resolve(refetch?.());
  };

  const handleDeleteConfirm = async () => {
    if (!adminDeleteTarget) return;
    setAdminBusy(true);
    const result = await hardDeleteOrder(adminDeleteTarget.id);
    setAdminBusy(false);
    if (!result.ok) { toast.error(result.error ?? 'Silme başarısız'); return; }
    toast.success('Sipariş kalıcı olarak silindi');
    setAdminDeleteTarget(null);
    setAdminConfirmText('');
    await Promise.resolve(refetch?.());
  };

  // ── Data source: pick the right hook based on panel ──
  // Admin "Arşivi göster" toggle açıksa fetch'te de arşivli kayıtlar dahil edilir
  const labData    = useOrders(
    panel === 'doctor' ? 'doctor' : 'lab',
    panel === 'doctor' ? profile?.id : undefined,
    { includeArchived: showArchived },
  );
  const clinicData = useClinicOrders(panel === 'clinic');

  const rawOrders = panel === 'clinic' ? normaliseClinicOrders(clinicData.orders) : labData.orders;
  const loading   = panel === 'clinic' ? clinicData.loading : labData.loading;
  const refetch   = panel === 'clinic' ? clinicData.refetch : labData.refetch;
  const orders    = rawOrders as WorkOrder[];

  // Page title
  const { setTitle: setPageTitle, clear: clearPageTitle } = usePageTitleStore();
  useEffect(() => {
    setPageTitle('Siparişler', autoT('Tüm vakaların operasyonel görünümü'));
    return () => clearPageTitle();
  }, []);

  // ── State ──
  const [viewMode, setViewMode]         = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all' | 'manual'>('all');
  const [search, setSearch]             = useState('');
  const [searchOpen, setSearchOpen]     = useState(false);
  const [scanOpen, setScanOpen]         = useState(false);
  const [paperInboxCount, setPaperInboxCount] = useState(0);
  const [urgentOnly, setUrgentOnly]     = useState(false);
  const [overdueOnly, setOverdueOnly]   = useState(false);
  const [sortBy, setSortBy]             = useState<SortBy>('created_at');  // en yeni sipariş her zaman üstte
  const [sortDir, setSortDir]           = useState<SortDir>('desc');
  const [sortOpen, setSortOpen]         = useState(false);

  // Manuel/kağıt sipariş inbox — bekleyen sayısı (lab panelindeki Inbox butonu rozeti)
  useEffect(() => {
    if (panel !== 'lab') return;
    const labId = (profile as any)?.lab_id ?? profile?.id;
    if (!labId) return;
    let mounted = true;
    const load = async () => {
      try {
        const { count } = await supabase
          .from('pending_paper_orders')
          .select('id', { count: 'exact', head: true })
          .eq('lab_id', labId)
          .eq('status', 'pending');
        if (mounted) setPaperInboxCount(count ?? 0);
      } catch { /* sessiz */ }
    };
    load();
    const ch = supabase
      .channel(`orders-paper-inbox-${labId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_paper_orders', filter: `lab_id=eq.${labId}` }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [panel, (profile as any)?.lab_id, profile?.id]);

  // ── Modals ──
  const [selectedOrder, setSelectedOrder]           = useState<WorkOrder | null>(null);
  const [modalVisible, setModalVisible]             = useState(false);
  const [assignTarget, setAssignTarget]             = useState<WorkOrder | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const { technicians, loadingTechs, assigning, loadTechnicians, assign } = useAssignTechnician(refetch);

  // ── Derived ──
  const visibleOrders = useMemo(() => {
    if (isTechnician && profile?.id) return orders.filter(o => o.assigned_to === profile.id);
    return orders;
  }, [orders, isTechnician, profile?.id]);

  // MOUNT/UNMOUNT izleme: `render #1`in tekrar tekrar çıkması bileşenin yeniden
  // MONTE edildiğini gösteriyor (useRef sıfırlanıyor). Kim söküyor, onu bulmak için.
  useEffect(() => {
    bootMark('OrdersList MOUNT');
    return () => bootMark('OrdersList UNMOUNT');
  }, []);

  const today = new Date().toISOString().split('T')[0];

  // GEÇİCİ TEŞHİS: ekran saniyede ~60 kez render ediliyor. Hangi DEĞERİN
  // değiştiğini bulmak için önceki render ile karşılaştırıp yalnız FARKI yazar;
  // fark yoksa "referans değişimi" (yeni nesne kimliği) demektir.
  const _prevRef = useRef<Record<string, any> | null>(null);
  const _renderNo = useRef(0);
  {
    _renderNo.current += 1;
    const snap: Record<string, any> = {
      panel, isDesktop, viewMode, statusFilter, loading, isAdmin,
      showArchived, urgentOnly, overdueOnly, search,
      ordersLen: orders.length,
      ordersRef: orders,          // kimlik karşılaştırması
      profileRef: profile,
      windowW: typeof window !== 'undefined' ? window.innerWidth : 0,
      windowH: typeof window !== 'undefined' ? window.innerHeight : 0,
    };
    const prev = _prevRef.current;
    if (prev) {
      const changed = Object.keys(snap).filter(k => !Object.is(prev[k], snap[k]));
      if (_renderNo.current % 20 === 0 || changed.length) {
        bootMark(`OrdersList render #${_renderNo.current}`, {
          degisen: changed.length ? changed.join(', ') : '(HİÇBİRİ — üstten geliyor)',
          w: snap.windowW, h: snap.windowH,
        });
      }
    } else {
      bootMark('OrdersList render #1', { panel, isDesktop, orders: orders.length });
    }
    _prevRef.current = snap;
  }

  const filtered = useMemo(() => {
    const list = visibleOrders.filter(o => {
      // Admin "Arşivi göster" açıkken sadece arşivli, kapalıyken sadece aktif
      // (non-admin kullanıcılar zaten arşivli görmez — query seviyesinde filtrelenmiş)
      const isArch = !!(o as any).is_archived;
      const matchArchive = isAdmin ? (showArchived ? isArch : !isArch) : !isArch;
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const sl = search.toLowerCase();
      const matchSearch = !search
        || o.order_number.toLowerCase().includes(sl)
        || (o.doctor?.full_name ?? '').toLowerCase().includes(sl)
        || (o.patient_name ?? '').toLowerCase().includes(sl)
        || o.work_type.toLowerCase().includes(sl);
      const matchUrgent  = !urgentOnly  || o.is_urgent;
      const matchOverdue = !overdueOnly || (o.delivery_date < today && o.status !== 'teslim_edildi');
      return matchArchive && matchStatus && matchSearch && matchUrgent && matchOverdue;
    });
    return list.sort((a, b) => {
      let cmp = 0;
      if      (sortBy === 'delivery_date') cmp = a.delivery_date.localeCompare(b.delivery_date);
      else if (sortBy === 'created_at')    cmp = a.created_at.localeCompare(b.created_at);
      else if (sortBy === 'order_number')  cmp = a.order_number.localeCompare(b.order_number);
      else if (sortBy === 'is_urgent')     cmp = (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [visibleOrders, statusFilter, search, urgentOnly, overdueOnly, showArchived, isAdmin, today, sortBy, sortDir]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: visibleOrders.length };
    for (const o of visibleOrders) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return counts;
  }, [visibleOrders]);

  // Durum sekmeleri — lab VE admin panelinde sona "Manuel" (WhatsApp/kağıt
  // inbox) eklenir. Admin'de ayrı bir kenar çubuğu girdisi vardı; manuel gelen
  // sipariş de sipariştir, kendi sayfasını hak etmiyor.
  const statusFilters = useMemo<{ value: WorkOrderStatus | 'all' | 'manual'; label: string }[]>(
    () => (panel === 'lab' || panel === 'admin'
      ? [...STATUS_FILTERS, { value: 'manual', label: 'Manuel' }]
      : STATUS_FILTERS),
    [panel],
  );

  const urgentCount = useMemo(() => visibleOrders.filter(o => o.is_urgent).length, [visibleOrders]);
  const overdueCount = useMemo(
    () => visibleOrders.filter(o => o.delivery_date < today && o.status !== 'teslim_edildi').length,
    [visibleOrders, today],
  );

  // ── Handlers (memo'lu satırlar re-render etmesin diye stable callback) ──
  const onCardPress = useCallback((order: WorkOrder) => {
    const needsTriage = order.status === 'alindi' && !(order as any).triaged_at;
    // İSTASYON (teknisyen): onay bekleyen sipariş listede görünür ama detayı AÇILMAZ.
    if (panelGroup === '(station)' && needsTriage) {
      toast.warning('Sipariş henüz onaylanmadı — detay açılamaz.');
      return;
    }
    // LAB & ADMIN: planlama bekleyen iş → yeni tam-ekran Plan Önizleme & Onay ekranı.
    // Diğer paneller: mevcut davranış korunur (?triage=open → TriageModal).
    if (needsTriage && (panelGroup === '(lab)' || panelGroup === '(admin)')) {
      router.push(`/${panelGroup}/order/plan/${order.id}` as any);
      return;
    }
    const qs = needsTriage ? '?triage=open' : '';
    if (panelGroup && panelGroup.startsWith('(')) {
      router.push(`/${panelGroup}/order/${order.id}${qs}` as any);
    } else {
      router.push(`/(lab)/order/${order.id}${qs}` as any);
    }
  }, [panelGroup, router]);

  const onAssignPress = useCallback((order: WorkOrder) => {
    setAssignTarget(order);
    setAssignModalVisible(true);
    loadTechnicians();
  }, [loadTechnicians]);

  const onAssignConfirm = async (techId: string) => {
    if (!assignTarget) return;
    try {
      await assign(assignTarget.id, techId);
      setAssignModalVisible(false);
      setAssignTarget(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Atama hatası');
    }
  };

  const onStatusAdvance = (order: WorkOrder) => {
    setSelectedOrder(order);
    setModalVisible(true);
  };

  const onStatusConfirm = async (newStatus: WorkOrderStatus, note: string) => {
    if (!selectedOrder || !profile) return;
    const { error } = await advanceOrderStatus(selectedOrder.id, newStatus, profile.id, note || undefined);
    if (error) toast.error((error as any).message);
    else refetch();
    setModalVisible(false);
    setSelectedOrder(null);
  };

  // ═══════════════════════════════════════════════════════════════════
  // MOBILE — Aydın Lab handoff (hekim için ayrı list component)
  // Diğer paneller B2 Kanban kullanmaya devam ediyor (sıralı revizyon).
  // ═══════════════════════════════════════════════════════════════════
  if (!isDesktop) {
    if (panel === 'doctor') {
      return (
        <DoctorOrdersMobile
          orders={orders}
          loading={loading}
          refetch={refetch}
          onOpenOrder={onCardPress}
        />
      );
    }
    return (
      <OrdersKanbanB2Mobile
        orders={orders}
        loading={loading}
        refetch={refetch}
        onOpenOrder={onCardPress}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // DESKTOP RENDER (mevcut, dokunulmadı)
  // ═══════════════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>

      {/* ── Unified Filter Bar — DESKTOP ONLY (mobile uses block below) ─── */}
      {isDesktop && (
      <View className="px-4 pt-3 pb-2" style={{ gap: 14 }}>
        {/* Row 1 — İş-akışı sekmeleri: Onaylar/Kullanıcılar/Loglar ile AYNI kanonik SlideTabBar.
            "Manuel" şeridin DIŞINDA (durum değil, ayrı gelen kutusu → Row 2'de). */}
        <SlideTabBar
          items={statusFilters.filter(f => f.value !== 'manual').map(f => ({ key: String(f.value), label: f.label, count: statusCounts[f.value] ?? 0 }))}
          activeKey={String(statusFilter)}
          onChange={(k) => { setStatusFilter(k as any); setUrgentOnly(false); setOverdueOnly(false); }}
          accentColor={panelTheme.accent}
          style={{ marginStart: -4 }}
        />

        {/* Row 2 — Filtre · sıralama · görünüm (İKİNCİL kontroller) */}
        <View className="flex-row items-center gap-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-1"
            contentContainerStyle={{ gap: 6 }}
          >
            {statusFilters.some(f => f.value === 'manual') && (() => {
              // Şeritle tutarlı: durum seçimi Acil/Geciken açıkken de geçerli
              // kalıyor (liste filtresi ikisini birlikte uyguluyor), dolayısıyla
              // seçili sekmeyi söndürmek uygulanan bir filtreyi gizlemek olurdu.
              const active = statusFilter === 'manual';
              return (
                <Pressable
                  onPress={() => { setStatusFilter('manual'); setUrgentOnly(false); setOverdueOnly(false); }}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: active ? panelTheme.accent : (isDark ? T.card : '#FFFFFF'),
                    borderWidth: 1, borderColor: active ? 'transparent' : T.hairline,
                  }}
                >
                  <Inbox size={12} color={active ? '#FFFFFF' : T.ink2} strokeWidth={2} />
                  <Text className="text-[11.5px] font-semibold" style={{ color: active ? '#FFFFFF' : T.ink2 }}>
                    Manuel
                  </Text>
                  {paperInboxCount > 0 && (
                    <Text className="text-[10px] font-bold" style={{ color: active ? 'rgba(255,255,255,0.6)' : T.ink3 }}>
                      {paperInboxCount}
                    </Text>
                  )}
                </Pressable>
              );
            })()}

            {/* Acil / Geciken toggle pills */}
            <Pressable
              onPress={() => { setUrgentOnly(v => !v); if (!urgentOnly) setOverdueOnly(false); }}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={urgentOnly ? { backgroundColor: 'rgba(217,119,6,0.12)' } : { backgroundColor: isDark ? T.card : '#FFFFFF', borderWidth: 1, borderColor: T.hairline }}
            >
              <Flame size={12} color={urgentOnly ? '#D97706' : T.ink3} strokeWidth={1.8} />
              <Text className="text-[12px] font-semibold" style={urgentOnly ? { color: '#D97706' } : { color: T.ink2 }}>
                Acil
              </Text>
              {urgentCount > 0 && (
                <Text className="text-[10px] font-bold" style={urgentOnly ? { color: '#D97706', opacity: 0.7 } : { color: T.ink3 }}>
                  {urgentCount}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => { setOverdueOnly(v => !v); if (!overdueOnly) setUrgentOnly(false); }}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={overdueOnly ? { backgroundColor: 'rgba(220,38,38,0.12)' } : { backgroundColor: isDark ? T.card : '#FFFFFF', borderWidth: 1, borderColor: T.hairline }}
            >
              <Clock size={12} color={overdueOnly ? '#DC2626' : T.ink3} strokeWidth={1.8} />
              <Text className="text-[12px] font-semibold" style={overdueOnly ? { color: '#DC2626' } : { color: T.ink2 }}>
                Geciken
              </Text>
              {overdueCount > 0 && (
                <Text className="text-[10px] font-bold" style={overdueOnly ? { color: '#DC2626', opacity: 0.7 } : { color: T.ink3 }}>
                  {overdueCount}
                </Text>
              )}
            </Pressable>

            {/* Admin only: Arşivi göster toggle */}
            {isAdmin && (
              <Pressable
                onPress={() => setShowArchived(v => !v)}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={showArchived
                  ? { backgroundColor: 'rgba(217,119,6,0.14)', borderWidth: 1, borderColor: 'rgba(217,119,6,0.28)' }
                  : { backgroundColor: isDark ? T.card : '#FFFFFF', borderWidth: 1, borderColor: T.hairline }
                }
              >
                <Archive size={12} color={showArchived ? '#92400E' : T.ink3} strokeWidth={1.8} />
                <Text className="text-[12px] font-semibold" style={{ color: showArchived ? '#92400E' : T.ink2 }}>
                  {showArchived ? 'Arşivde' : 'Arşiv'}
                </Text>
              </Pressable>
            )}

            {/* Manuel inbox + "Kağıt Sipariş Tara" artık Manuel sekmesinin
                İÇİNDE (aşağıda). Üst şeritte her sekmede görünüyordu; oysa
                yalnız manuel sipariş akışına ait bir eylem. */}
          </ScrollView>

          {/* Search */}
          {searchOpen ? (
            <View
              className="flex-row items-center gap-2 rounded-full px-3 h-8"
              style={{
                minWidth: 200,
                backgroundColor: isDark ? T.card : '#FFFFFF',
                borderWidth: 1, borderColor: T.hairline,
                // @ts-ignore
                boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <Search size={14} color={T.ink2} strokeWidth={1.8} />
              <TextInput
                className="flex-1 text-[13px]"
                placeholder="Sipariş, hasta, hekim ara..."
                placeholderTextColor={T.ink3 as string}
                value={search}
                onChangeText={setSearch}
                autoFocus
                returnKeyType="search"
                onBlur={() => { if (!search) setSearchOpen(false); }}
                style={{ color: T.ink, outlineStyle: 'none' } as any}
              />
              {search.length > 0 && (
                <Pressable onPress={() => { setSearch(''); setSearchOpen(false); }}>
                  <X size={13} color={T.ink2} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          ) : (
            <Pressable
              onPress={() => setSearchOpen(true)}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{
                backgroundColor: isDark ? T.card : '#FFFFFF',
                borderWidth: 1, borderColor: T.hairline,
                // @ts-ignore
                boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <Search size={15} color={search ? T.ink : T.ink2} strokeWidth={1.8} />
            </Pressable>
          )}

          {/* Sort */}
          <Pressable
            onPress={() => setSortOpen(true)}
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{
              backgroundColor: isDark ? T.card : '#FFFFFF',
              borderWidth: 1, borderColor: T.hairline,
              // @ts-ignore
              boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <ArrowUpDown size={15} color={T.ink2} strokeWidth={1.8} />
          </Pressable>

          {/* View toggle */}
          <View className="flex-row p-0.5 rounded-full bg-cream-panel" style={isDark ? { backgroundColor: T.cardSoft } : undefined}>
            <Pressable
              onPress={() => setViewMode('list')}
              className="px-2 py-1 rounded-full"
              style={{ backgroundColor: viewMode === 'list' ? T.ink : 'transparent' }}
            >
              <LayoutList size={14} color={viewMode === 'list' ? '#FFF' : T.ink2} strokeWidth={1.8} />
            </Pressable>
            <Pressable
              onPress={() => setViewMode('kanban')}
              className="px-2 py-1 rounded-full"
              style={{ backgroundColor: viewMode === 'kanban' ? T.ink : 'transparent' }}
            >
              <Columns3 size={14} color={viewMode === 'kanban' ? '#FFF' : T.ink2} strokeWidth={1.8} />
            </Pressable>
          </View>
        </View>
      </View>
      )}

      {/* ── Mobile Filter Bar — sade, tek elle kullanım ───────────── */}
      {!isDesktop && (
        <View className="px-4 pb-3" style={{ paddingTop: insets.top + 8, gap: 10 }}>
          {/* Search + Sort row */}
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <View
              className="flex-1 flex-row items-center rounded-2xl px-3"
              style={{ height: 40, borderWidth: 1, borderColor: T.hairline, backgroundColor: isDark ? T.card : '#FFFFFF' }}
            >
              <Search size={16} color={T.ink2} strokeWidth={1.8} />
              <TextInput
                className="flex-1 ms-2 text-[14px]"
                placeholder="Sipariş, hasta, hekim ara"
                placeholderTextColor={T.ink3 as string}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                style={{ color: T.ink }}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <X size={15} color={T.ink2} strokeWidth={2} />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => setSortOpen(true)}
              className="items-center justify-center rounded-2xl"
              style={{ width: 40, height: 40, borderWidth: 1, borderColor: T.hairline, backgroundColor: isDark ? T.card : '#FFFFFF' }}
            >
              <ArrowUpDown size={16} color={T.ink} strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Status chips — yatay scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {statusFilters.map(f => {
              const active = statusFilter === f.value && !urgentOnly && !overdueOnly;
              const count = f.value === 'manual' ? paperInboxCount : (statusCounts[f.value] ?? 0);
              return (
                <Pressable
                  key={f.value}
                  onPress={() => { setStatusFilter(f.value); setUrgentOnly(false); setOverdueOnly(false); }}
                  className="flex-row items-center rounded-full px-3.5"
                  style={{ height: 32, borderWidth: 1, borderColor: active ? 'transparent' : T.hairline, gap: 6, backgroundColor: active ? T.ink : (isDark ? T.card : '#FFFFFF') }}
                >
                  <Text className="text-[13px] font-semibold" style={{ color: active ? '#FFFFFF' : T.ink2 }}>
                    {f.label}
                  </Text>
                  <Text className="text-[11px] font-bold" style={{ color: active ? 'rgba(255,255,255,0.6)' : T.ink3 }}>
                    {count}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Acil + Geciken — alt satır */}
          <View className="flex-row" style={{ gap: 8 }}>
            <Pressable
              onPress={() => { setUrgentOnly(v => !v); if (!urgentOnly) setOverdueOnly(false); }}
              className="flex-row items-center rounded-full px-3"
              style={{
                height: 30,
                gap: 5,
                backgroundColor: urgentOnly ? 'rgba(217,119,6,0.12)' : (isDark ? T.card : '#FFFFFF'),
                borderWidth: 1,
                borderColor: urgentOnly ? 'rgba(217,119,6,0.25)' : T.hairline,
              }}
            >
              <Flame size={13} color={urgentOnly ? '#D97706' : T.ink3} strokeWidth={1.8} />
              <Text className="text-[12px] font-semibold" style={urgentOnly ? { color: '#D97706' } : { color: T.ink2 }}>
                Acil
              </Text>
              {urgentCount > 0 && (
                <Text className="text-[10px] font-bold" style={urgentOnly ? { color: '#D97706', opacity: 0.7 } : { color: T.ink3 }}>
                  {urgentCount}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => { setOverdueOnly(v => !v); if (!overdueOnly) setUrgentOnly(false); }}
              className="flex-row items-center rounded-full px-3"
              style={{
                height: 30,
                gap: 5,
                backgroundColor: overdueOnly ? 'rgba(220,38,38,0.12)' : (isDark ? T.card : '#FFFFFF'),
                borderWidth: 1,
                borderColor: overdueOnly ? 'rgba(220,38,38,0.25)' : T.hairline,
              }}
            >
              <Clock size={13} color={overdueOnly ? '#DC2626' : T.ink3} strokeWidth={1.8} />
              <Text className="text-[12px] font-semibold" style={overdueOnly ? { color: '#DC2626' } : { color: T.ink2 }}>
                Geciken
              </Text>
              {overdueCount > 0 && (
                <Text className="text-[10px] font-bold" style={overdueOnly ? { color: '#DC2626', opacity: 0.7 } : { color: T.ink3 }}>
                  {overdueCount}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Content ────────────────────────────────────────────────── */}
      {statusFilter === 'manual' ? (
        // Manuel sekmesi — WhatsApp/kağıt (pending_paper_orders) inbox'u satır-içi.
        <View style={{ flex: 1 }}>
          {/* Kağıt sipariş tarama bu akışın giriş noktası: sekmenin başında,
              gelen kutusunun hemen üstünde durur. */}
          {Platform.OS === 'web' && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, flexDirection: 'row' }}>
              <Pressable
                onPress={() => setScanOpen(true)}
                style={({ pressed, hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                  backgroundColor: hovered ? '#DBEAFE' : '#EFF6FF',
                  borderWidth: 1, borderColor: 'rgba(37,99,235,0.25)',
                  opacity: pressed ? 0.75 : 1,
                  ...(Platform.OS === 'web'
                    ? { cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '120ms' } as any
                    : {}),
                })}
              >
                <Camera size={13} color="#2563EB" strokeWidth={1.9} />
                <Text className="text-[12.5px] font-semibold" style={{ color: '#2563EB' }}>
                  Kağıt Sipariş Tara
                </Text>
              </Pressable>
            </View>
          )}
          <PendingPaperOrdersScreen />
        </View>
      ) : isDesktop && viewMode === 'kanban' ? (
        <KanbanBoard orders={visibleOrders} userGroup={(panelGroup || '(lab)') as any} onStatusAdvance={onStatusAdvance} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: isDesktop ? 16 : 12,
            paddingTop: 4,
            paddingBottom: 120,
          }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={T.ink as string} />}
          showsVerticalScrollIndicator={false}
          {...navScrollProps}
        >
          {loading && filtered.length === 0 ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={T.ink as string} />
              <Text className="text-[13px] mt-3" style={{ color: T.ink3 }}>Yükleniyor…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <EmptyStateV2 search={search} hasFilters={urgentOnly || overdueOnly || statusFilter !== 'all'} />
          ) : (() => {
            // Planlama bekleyen siparişler ayrı bir bloğa alınır
            const isTriagePending = (o: any) => o.status === 'alindi' && !o.triaged_at;
            const pendingBase = filtered.filter(isTriagePending);

            // Revizyon vaka-grubu: planlama bekleyen bir revizyon varsa, ORİJİNALİ de
            // (teslim edilmiş olsa bile) bu bloğa taşınır ve revizyon onun ALTINA
            // girintili yerleşir. Böylece parça-bütün ilişkisi görünür kalır ve iş
            // planlama kuyruğundan düşmez.
            const byId = new Map(filtered.map(o => [o.id, o]));
            const pulledParentIds = new Set<string>();
            const triagePendingOrders: any[] = [];
            pendingBase.forEach(rev => {
              // Ebeveyn bağı: revizyon → revision_of_id, devam siparişi → continues_order_id
              const parentId = ((rev as any).revision_of_id ?? (rev as any).continues_order_id) as string | undefined;
              const parent = parentId ? byId.get(parentId) : undefined;
              const isCont = !(rev as any).revision_of_id && !!(rev as any).continues_order_id;
              if (parent && !isTriagePending(parent) && !pulledParentIds.has(parent.id)) {
                pulledParentIds.add(parent.id);
                triagePendingOrders.push({ ...(parent as any), __revParent: true });
              }
              triagePendingOrders.push(parentId && parent ? { ...(rev as any), __revChild: true, __continuation: isCont } : rev);
            });

            // Ana listede de revizyonlar orijinallerinin ALTINA yuvalanır.
            // (Orijinali listede olmayan revizyon yalnız kendi rozetiyle görünür.)
            const nestRevisions = (list: any[]) => {
              const ids = new Map(list.map(o => [o.id, o]));
              const kids = new Map<string, any[]>();
              const roots: any[] = [];
              list.forEach(o => {
                // Ebeveyn bağı: revizyon → revision_of_id, devam siparişi → continues_order_id
                const pid = (o.revision_of_id ?? o.continues_order_id) as string | undefined;
                if (pid && ids.has(pid)) {
                  if (!kids.has(pid)) kids.set(pid, []);
                  kids.get(pid)!.push(o);
                } else {
                  roots.push(o);
                }
              });
              const out: any[] = [];
              roots.forEach(r => {
                const cs = kids.get(r.id);
                out.push(cs?.length ? { ...r, __revParent: true } : r);
                cs?.forEach(c => out.push({ ...c, __revChild: true, __continuation: !c.revision_of_id && !!c.continues_order_id }));
              });
              return out;
            };

            // DÜZ liste (yığma yok): her sipariş kendi satırı. İlişki (devam/revizyon)
            // bir sonraki adımda HASTA alt-satırı + VAKA meta olarak gösterilir → __relType/__parentNo.
            const byIdMain = new Map(filtered.map((o: any) => [o.id, o]));
            const mainOrders = filtered
              .filter(o => !isTriagePending(o) && !pulledParentIds.has(o.id))
              .map((o: any) => {
                const pid = o.revision_of_id ?? o.continues_order_id;
                if (!pid) return o;
                const isCont = !o.revision_of_id && !!o.continues_order_id;
                const parent = byIdMain.get(pid);
                return { ...o, __relType: isCont ? 'devam' : 'revizyon', __parentNo: parent?.order_number ?? null };
              });

            return (
              <View style={{ gap: 18 }}>
                {/* ═══ PLANLAMA BEKLEYEN — Üst tablo (transparent wrapper) ═══ */}
                {triagePendingOrders.length > 0 && (
                  <View>{/* DesktopTable kendi köşe radius'unu ve zeminini yönetir */}
                    {/* Body — desktop tablo veya mobile kartlar */}
                    {isDesktop ? (
                      <DesktopTable
                        orders={triagePendingOrders}
                        isManager={isManager}
                        isAdmin={isAdmin}
                        onPress={onCardPress}
                        onAssign={onAssignPress}
                        onEdit={(o) => setAdminEditTarget(o)}
                        onArchive={(o) => setAdminArchiveTarget(o)}
                        onDelete={(o) => setAdminDeleteTarget(o)}
                        footerTitle="Planlama bekliyor"
                        footerColor="#9C5E0E"
                      />
                    ) : (
                      <View style={{ padding: 12, gap: 8 }}>
                        {triagePendingOrders.map(order => (
                          <MobileOrderCard
                            key={order.id}
                            order={order}
                            isManager={isManager}
                            isAdmin={isAdmin}
                            onPress={onCardPress}
                            onAssign={onAssignPress}
                            onEdit={setAdminEditTarget}
                            onArchive={setAdminArchiveTarget}
                            onDelete={setAdminDeleteTarget}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* ═══ ASIL TABLO — Diğer siparişler ═══ */}
                {mainOrders.length > 0 && (
                  isDesktop ? (
                    <DesktopTable
                      orders={mainOrders}
                      isManager={isManager}
                      isAdmin={isAdmin}
                      paginate
                      onPress={onCardPress}
                      onAssign={onAssignPress}
                      onEdit={setAdminEditTarget}
                      onArchive={setAdminArchiveTarget}
                      onDelete={setAdminDeleteTarget}
                    />
                  ) : (
                    <View className="gap-2">
                      {mainOrders.map(order => (
                        <MobileOrderCard
                          key={order.id}
                          order={order}
                          isManager={isManager}
                          isAdmin={isAdmin}
                          onPress={onCardPress}
                          onAssign={onAssignPress}
                          onEdit={setAdminEditTarget}
                          onArchive={setAdminArchiveTarget}
                          onDelete={setAdminDeleteTarget}
                        />
                      ))}
                    </View>
                  )
                )}
              </View>
            );
          })()}
        </ScrollView>
      )}

      {/* ── Sort Modal ─────────────────────────────────────────────── */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable
          onPress={() => setSortOpen(false)}
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(10,10,10,0.45)' }}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            className="rounded-3xl overflow-hidden w-full"
            style={{
              maxWidth: 380,
              backgroundColor: isDark ? T.card : '#FFFFFF',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? T.hairline : 'transparent',
              // @ts-ignore
              boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            }}
          >
            <View className="px-5 pt-5 pb-3">
              <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.1, color: T.ink3 }}>
                Sıralama
              </Text>
            </View>
            {SORT_OPTIONS.map((opt, i) => {
              const active = sortBy === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setSortBy(opt.value)}
                  className="flex-row items-center justify-between px-5 py-3.5"
                  style={i > 0 ? { borderTopWidth: 1, borderTopColor: T.hairline2 } : undefined}
                >
                  <Text className={`text-[14px] ${active ? 'font-semibold' : 'font-medium'}`} style={{ color: active ? T.ink : T.ink2 }}>
                    {opt.label}
                  </Text>
                  {active && (
                    <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: T.ink }}>
                      <Text className="text-[10px] text-white font-bold">✓</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}

            <View className="px-5 pt-4 pb-2">
              <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.1, color: T.ink3 }}>
                Yön
              </Text>
            </View>
            <View className="flex-row gap-2 px-5 pb-4">
              <Pressable
                onPress={() => setSortDir('asc')}
                className="flex-1 py-2.5 rounded-xl items-center"
                style={{ backgroundColor: sortDir === 'asc' ? T.ink : T.cardSoft }}
              >
                <Text className="text-[13px] font-semibold" style={{ color: sortDir === 'asc' ? '#FFFFFF' : T.ink2 }}>
                  Artan ↑
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSortDir('desc')}
                className="flex-1 py-2.5 rounded-xl items-center"
                style={{ backgroundColor: sortDir === 'desc' ? T.ink : T.cardSoft }}
              >
                <Text className="text-[13px] font-semibold" style={{ color: sortDir === 'desc' ? '#FFFFFF' : T.ink2 }}>
                  Azalan ↓
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setSortOpen(false)}
              className="mx-5 mb-5 py-3 rounded-xl items-center"
              style={{ backgroundColor: T.cardSoft }}
            >
              <Text className="text-[14px] font-semibold" style={{ color: T.ink }}>Tamam</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Assign Modal ───────────────────────────────────────────── */}
      <Modal visible={assignModalVisible} transparent animationType="fade" onRequestClose={() => setAssignModalVisible(false)}>
        <Pressable
          onPress={() => setAssignModalVisible(false)}
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(10,10,10,0.45)' }}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            className="rounded-3xl overflow-hidden w-full"
            style={{
              maxWidth: 380,
              backgroundColor: isDark ? T.card : '#FFFFFF',
              borderWidth: isDark ? 1 : 0,
              borderColor: isDark ? T.hairline : 'transparent',
              // @ts-ignore
              boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            }}
          >
            <View className="px-5 pt-5 pb-3 flex-row items-center gap-2">
              <UserCheck size={16} color={T.ink as string} strokeWidth={1.8} />
              <Text className="text-[14px] font-semibold" style={{ color: T.ink }}>
                {assignTarget ? `#${assignTarget.order_number} → Teknisyen` : 'Atama'}
              </Text>
            </View>
            {loadingTechs ? (
              <View className="py-8 items-center">
                <ActivityIndicator color={T.ink as string} />
              </View>
            ) : technicians.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-[13px]" style={{ color: T.ink3 }}>Teknisyen bulunamadı</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {(technicians as any[]).map((t, i) => (
                  <Pressable
                    key={t.id}
                    onPress={() => onAssignConfirm(t.id)}
                    disabled={assigning}
                    className={`flex-row items-center justify-between px-5 py-3.5 ${assigning ? 'opacity-50' : ''}`}
                    style={i > 0 ? { borderTopWidth: 1, borderTopColor: T.hairline2 } : undefined}
                  >
                    <View className="flex-row items-center gap-2.5">
                      <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: T.cardSoft }}>
                        <Text className="text-[12px] font-semibold" style={{ color: T.ink2 }}>
                          {(t.full_name as string).split(' ').map((p: string) => p[0]).join('').slice(0, 2)}
                        </Text>
                      </View>
                      <Text className="text-[14px] font-medium" style={{ color: T.ink }}>{t.full_name}</Text>
                    </View>
                    {t.role === 'manager' && (
                      <Text className="text-[11px]" style={{ color: T.ink3 }}>Müdür</Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable
              onPress={() => setAssignModalVisible(false)}
              className="mx-5 mb-5 mt-2 py-3 rounded-xl items-center"
              style={{ backgroundColor: T.cardSoft }}
            >
              <Text className="text-[14px] font-semibold" style={{ color: T.ink }}>Kapat</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Status update modal ────────────────────────────────────── */}
      {selectedOrder && (
        <StatusUpdateModal
          visible={modalVisible}
          currentStatus={selectedOrder.status}
          onConfirm={onStatusConfirm}
          onClose={() => { setModalVisible(false); setSelectedOrder(null); }}
        />
      )}

      {/* Admin: kapsamlı düzenleme — yeni-sipariş sihirbazı (aynı 4 adım), bilgi dolu, popup */}
      {adminEditTarget && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setAdminEditTarget(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: width >= 768 ? 24 : 0 }}>
            <View style={{ width: '100%', maxWidth: 1120, flex: 1, maxHeight: width >= 768 ? '94%' : '100%', borderRadius: width >= 768 ? 20 : 0, overflow: 'hidden', backgroundColor: isDark ? T.bg : '#F1F5F9', ...(Platform.OS === 'web' ? ({ boxShadow: '0 24px 60px rgba(15,23,42,0.28)' } as any) : {}) }}>
              <React.Suspense fallback={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={T.ink as string} /></View>}>
                <NewOrderEditWizard
                  panel={panel as any}
                  editOrderId={(adminEditTarget as any).id}
                  onClose={() => setAdminEditTarget(null)}
                  onSaved={() => { refetch?.(); setAdminEditTarget(null); }}
                />
              </React.Suspense>
            </View>
          </View>
        </Modal>
      )}

      {/* Admin: Archive/Restore Confirm */}
      {adminArchiveTarget && (
        <AdminConfirmDialog
          type={(adminArchiveTarget as any).is_archived ? 'restore' : 'archive'}
          orderNumber={adminArchiveTarget.order_number}
          patientName={adminArchiveTarget.patient_name ?? '—'}
          busy={adminBusy}
          onCancel={() => setAdminArchiveTarget(null)}
          onConfirm={handleArchiveConfirm}
          confirmText=""
          onChangeConfirmText={() => {}}
        />
      )}

      {/* Admin: Delete Confirm */}
      {adminDeleteTarget && (
        <AdminConfirmDialog
          type="delete"
          orderNumber={adminDeleteTarget.order_number}
          patientName={adminDeleteTarget.patient_name ?? '—'}
          busy={adminBusy}
          onCancel={() => { setAdminDeleteTarget(null); setAdminConfirmText(''); }}
          onConfirm={handleDeleteConfirm}
          confirmText={adminConfirmText}
          onChangeConfirmText={setAdminConfirmText}
        />
      )}

      {/* Kağıt iş emri OCR modalı */}
      <ScanWorkOrderModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onCreateOrder={(parsed) => {
          // OCR sonucunu sessionStorage'a yaz → NewOrderScreen ilk yüklendiğinde okuyup form'u doldurabilir
          try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
              window.sessionStorage.setItem('ocr_work_order', JSON.stringify(parsed));
            }
          } catch { /* ignore */ }
          router.push(`${panelGroup && panelGroup.startsWith('(') ? `/${panelGroup}` : '/(lab)'}/new-order` as any);
        }}
        accentColor="#2563EB"
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ADMIN CONFIRM DIALOG (archive/restore/delete) — Patterns §13
// ═══════════════════════════════════════════════════════════════════════
function AdminConfirmDialog({
  type, orderNumber, patientName, busy, confirmText, onChangeConfirmText, onCancel, onConfirm,
}: {
  type: 'archive' | 'restore' | 'delete';
  orderNumber: string | number;
  patientName: string;
  busy: boolean;
  confirmText: string;
  onChangeConfirmText: (t: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cfg = {
    archive: { title: 'Siparişi pasife al', desc: 'Sipariş arşive taşınır ve listelerde görünmez. İstediğin zaman geri yükleyebilirsin.', icon: Archive, c: '#D97706', bg: 'rgba(217,119,6,0.14)', cta: 'Pasife al', requireType: false },
    restore: { title: 'Siparişi geri yükle', desc: 'Sipariş aktif listeye geri döner.', icon: RotateCcw, c: '#1F6B47', bg: 'rgba(31,107,71,0.14)', cta: 'Geri yükle', requireType: false },
    delete:  { title: 'Siparişi silmek istediğine emin misin?', desc: 'Sipariş ve tüm bağlı kayıtları (aşamalar, fotoğraflar, ödemeler) kalıcı olarak silinir. Bu işlem geri alınamaz.', icon: Trash2, c: '#9C2E2E', bg: 'rgba(156,46,46,0.14)', cta: 'Evet, sil', requireType: false },
  }[type];

  const Icon = cfg.icon;
  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const canConfirm = !cfg.requireType || confirmText.trim().toUpperCase() === 'SIL';
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: isDark ? T.card : '#FFFFFF', borderRadius: 24, width: 460, maxWidth: '100%',
          overflow: 'hidden',
          borderWidth: isDark ? 1 : 0,
          borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'transparent',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18, gap: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.c + '33' }}>
                <Icon size={20} color={cfg.c} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: cfg.c, letterSpacing: 1.2, textTransform: 'uppercase' }}>Onay gerekli</Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 22, letterSpacing: -0.4, color: T.ink, lineHeight: 28, marginTop: 2 }}>{cfg.title}</Text>
              </View>
            </View>
            <Pressable onPress={onCancel} disabled={busy} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? T.cardSoft : '#FFFFFF', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }}>
              <X size={15} color={T.ink3} strokeWidth={1.8} />
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', marginHorizontal: 28 }} />

          <View style={{ paddingHorizontal: 28, paddingTop: 18, paddingBottom: 22 }}>
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: isDark ? T.cardSoft : '#FBF9F4', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', marginBottom: 14 }}>
              <Text style={{ fontSize: 11, color: T.ink3, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3 }}>Sipariş</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>#{orderNumber} · {patientName}</Text>
            </View>
            <Text style={{ fontSize: 13, color: T.ink2, lineHeight: 19 }}>{cfg.desc}</Text>
            {cfg.requireType && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7 }}>
                  Onaylamak için <Text style={{ color: cfg.c, fontWeight: '700' }}>SIL</Text> yazın
                </Text>
                <TextInput
                  value={confirmText}
                  onChangeText={onChangeConfirmText}
                  placeholder="SIL"
                  placeholderTextColor={T.ink3}
                  autoCapitalize="characters"
                  style={{
                    backgroundColor: isDark ? T.cardSoft : '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                    paddingHorizontal: 14, height: 44, fontSize: 14, color: T.ink, fontWeight: '600',
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                  }}
                />
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 18, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', backgroundColor: isDark ? T.cardSoft : '#FBF9F4' }}>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onCancel} disabled={busy} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999, backgroundColor: isDark ? T.card : '#FFFFFF', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: T.ink2 }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy || !canConfirm}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: cfg.c, opacity: (busy || !canConfirm) ? 0.5 : 1,
              }}
            >
              <Icon size={14} color="#FFF" strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{busy ? 'İşleniyor…' : cfg.cta}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════
function EmptyStateV2({ search, hasFilters }: { search: string; hasFilters: boolean }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View className="py-16 items-center gap-2">
      <View className="w-14 h-14 rounded-2xl items-center justify-center mb-2" style={{ backgroundColor: isDark ? T.cardSoft : '#FAFAFA' }}>
        <LayoutList size={24} color={T.ink3} strokeWidth={1.4} />
      </View>
      <Text className="text-[16px] font-semibold" style={{ color: T.ink }}>
        {search || hasFilters ? 'Eşleşen iş emri yok' : 'Henüz iş emri yok'}
      </Text>
      <Text className="text-[13px] text-center" style={{ maxWidth: 280, color: T.ink2 }}>
        {search || hasFilters
          ? 'Filtreyi temizleyin veya arama terimini değiştirin.'
          : 'Yeni iş emri oluşturulduğunda burada görünür.'}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MOBILE ORDER CARD
// ═══════════════════════════════════════════════════════════════════════
const MobileOrderCard = React.memo(function MobileOrderCard({ order, isManager, isAdmin, onPress, onAssign, onEdit, onArchive, onDelete }: {
  order: WorkOrder;
  isManager: boolean;
  isAdmin?: boolean;
  onPress: (o: WorkOrder) => void;
  onAssign: (o: WorkOrder) => void;
  onEdit?: (o: WorkOrder) => void;
  onArchive?: (o: WorkOrder) => void;
  onDelete?: (o: WorkOrder) => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(order.delivery_date + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const onHold  = (order as any).hold_status === 'on_hold';
  const isLate  = order.status !== 'teslim_edildi' && diff < 0 && !onHold;
  const stage   = stageOf(order);
  const stageColor = STAGE_COLOR[stage];
  const dText   = deliveryText(order.delivery_date, order.status, (order as any).hold_status);
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const dColor  = darkFg(isDark, isLate ? '#DC2626' : diff <= 1 && order.status !== 'teslim_edildi' ? '#D97706' : T.ink2 as string);
  const canAssign = isManager && order.status === 'alindi' && !order.assigned_to;
  const needsTriage = order.status === 'alindi' && !(order as any).triaged_at;

  // #8 operasyonel detay: diş sayısı (tooth_numbers dizisi)
  const toothCount = Array.isArray((order as any).tooth_numbers) ? (order as any).tooth_numbers.length : 0;
  // #9 üretim ilerlemesi (liste sorgusundan: skipped hariç toplam + tamamlanan)
  const stagesTotal = (order as any).stages_total ?? 0;
  const stagesDone  = (order as any).stages_done ?? 0;
  const isDone = order.status === 'teslim_edildi';
  const progressPct = isDone ? 100 : (stagesTotal > 0 ? Math.round((stagesDone / stagesTotal) * 100) : 0);
  // #3 durum-renkli sol accent: geciken=kırmızı · tamamlanan=yeşil(sakin) · duraklatılan=amber · diğer=aşama rengi
  const barColor = isLate ? '#DC2626' : isDone ? '#2D9A6B' : onHold ? '#E89B2A' : stageColor;

  const patientTitle = order.patient_name ? titleCaseTR(order.patient_name) : '—';

  return (
    <Pressable
      onPress={() => onPress(order)}
      className="rounded-2xl p-4 flex-row gap-3"
      style={{
        backgroundColor: needsTriage ? (isDark ? 'rgba(217,119,6,0.10)' : '#FFF7ED') : (isDark ? T.card : '#FFFFFF'),
        borderWidth: needsTriage ? 1 : (isDark ? 1 : 0),
        borderColor: needsTriage ? 'rgba(217,119,6,0.30)' : (isDark ? 'rgba(255,255,255,0.10)' : 'transparent'),
        // @ts-ignore — sabit shadow (animasyonsuz)
        boxShadow: needsTriage
          ? '0 0 0 1px rgba(217,119,6,0.15), 0 4px 12px rgba(217,119,6,0.10)'
          : (isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.04)'),
      }}
    >
      {/* #3 Durum-renkli sol accent bar (triage → planlama ikonu korunur) */}
      <View className="pt-0.5">
        {needsTriage ? (
          <View
            className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: '#D97706' }}
          >
            <ListChecks size={14} color="#FFF" strokeWidth={2} />
          </View>
        ) : (
          <View
            style={{ width: 4, alignSelf: 'stretch', minHeight: 40, borderRadius: 2, backgroundColor: barColor, opacity: isDone ? 0.5 : 1 }}
          />
        )}
      </View>

      {/* Body */}
      <View className="flex-1 gap-1 min-w-0">
        {/* #4 Hiyerarşi: HASTA birincil başlık */}
        <View className="flex-row items-center gap-2">
          <Text
            className="text-[15px] font-semibold flex-1"
            style={isLate ? { color: darkFg(isDark, '#DC2626') } : { color: T.ink }}
            numberOfLines={1}
          >
            {patientTitle}
          </Text>
          {order.is_urgent && (
            <Text style={{ fontSize: 8.5, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: darkFg(isDark, '#9C2E2E') }}>
              Acil
            </Text>
          )}
        </View>

        {/* Restorasyon tipi · hekim */}
        <Text className="text-[12.5px]" style={{ color: T.ink }} numberOfLines={1}>
          {order.work_type}
          <Text style={{ color: T.ink3 }}>{`   ·   ${order.doctor?.full_name ?? '—'}`}</Text>
        </Text>

        {/* Sipariş no · #8 diş sayısı · #9 üretim ilerlemesi */}
        <View className="flex-row items-center gap-2 mt-0.5">
          <Text className="text-[11px]" style={{ color: T.ink3, fontFamily: 'monospace' }} numberOfLines={1}>
            #{order.order_number}
          </Text>
          {toothCount > 0 && (
            <Text className="text-[11px]" style={{ color: T.ink3 }}>{`· ${toothCount} diş`}</Text>
          )}
          {!needsTriage && stagesTotal > 0 && (
            <View className="flex-row items-center gap-1.5" style={{ marginStart: 2 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#30302D' : 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                <View style={{ width: `${progressPct}%`, height: '100%', borderRadius: 2, backgroundColor: barColor }} />
              </View>
              <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3 }}>{isDone ? `${stagesTotal}/${stagesTotal}` : `${stagesDone}/${stagesTotal}`}</Text>
            </View>
          )}
        </View>

        {/* Durum rozeti + teslim */}
        <View className="flex-row items-center gap-2 mt-0.5">
          <OrderStatusInfo order={order as any} size={13} />
          {needsTriage ? (
            <View className="px-2 py-0.5 rounded flex-row items-center gap-1" style={{ backgroundColor: '#D97706' }}>
              <Text className="text-[10px] font-bold" style={{ color: '#FFF', letterSpacing: 0.3 }}>
                {autoT('Planlama Bekliyor').toUpperCase()}
              </Text>
            </View>
          ) : (
            <View className="px-2 py-0.5 rounded" style={{ backgroundColor: (onHold ? '#E89B2A' : stageColor) + '14' }}>
              <Text className="text-[10px] font-bold" style={{ color: onHold ? darkFg(isDark, '#9C5E0E') : stageColor, letterSpacing: 0.3 }}>
                {(onHold ? autoT('Duraklatıldı') : autoT(getOrderStageLabel(order as any))).toUpperCase()}
              </Text>
            </View>
          )}
          <Text className="text-[11px] font-medium" style={{ color: dColor }}>
            {dText}
          </Text>
        </View>
      </View>

      {/* Right */}
      <View className="items-end justify-center gap-1.5">
        {isAdmin ? (
          <RowActionsMenu actions={rowActions(order, onEdit, onArchive, onDelete)} size={28} />
        ) : canAssign ? (
          <Pressable
            onPress={e => { (e as any).stopPropagation?.(); onAssign(order); }}
            className="px-3 py-1 rounded-full"
            style={{ backgroundColor: T.ink }}
          >
            <Text className="text-[11px] font-semibold text-white">Ata</Text>
          </Pressable>
        ) : (
          isRTL() ? <ChevronLeft size={16} color="#CCC" strokeWidth={1.6} />
                  : <ChevronRight size={16} color="#CCC" strokeWidth={1.6} />
        )}
      </View>
    </Pressable>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// DESKTOP TABLE
// ═══════════════════════════════════════════════════════════════════════
function DesktopTable({ orders, isManager, isAdmin, onPress, onAssign, onEdit, onArchive, onDelete, footerTitle, footerColor, paginate }: {
  orders: WorkOrder[];
  isManager: boolean;
  isAdmin?: boolean;
  onPress: (o: WorkOrder) => void;
  onAssign: (o: WorkOrder) => void;
  onEdit?: (o: WorkOrder) => void;
  onArchive?: (o: WorkOrder) => void;
  onDelete?: (o: WorkOrder) => void;
  /** Footer'da count yerine ortalanmış başlık (örn. "PLANLAMA BEKLİYOR") */
  footerTitle?: string;
  /** Footer title rengi */
  footerColor?: string;
  /** Ana listede sayfalama (referans: sayfa başına birkaç kayıt, ferah görünüm) */
  paginate?: boolean;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Avatar: lab tarafı panellerde klinik logosu, klinik/hekimde hasta baş harfleri
  const tablePanel = detectPanel(useSegments() as string[]);
  const headColor = T.ink3;

  // ── Sayfalama (yalnız ana liste) ──
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const totalPages = paginate ? Math.max(1, Math.ceil(orders.length / PAGE_SIZE)) : 1;
  const safePage = Math.min(page, totalPages - 1);
  useEffect(() => { if (page > totalPages - 1) setPage(0); }, [totalPages, page]);
  const pageOrders = paginate ? orders.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE) : orders;
  const firstIdx = safePage * PAGE_SIZE;

  return (
    <View
      className="rounded-3xl overflow-hidden"
      style={{ borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)', backgroundColor: isDark ? T.card : '#FFFFFF' }}
    >
      {/* Column header */}
      <View className="flex-row px-5 py-3 border-b" style={{ backgroundColor: isDark ? T.cardSoft : '#FAFAFA', borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
        <Text className="uppercase" style={{ flex: 30, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Hasta
        </Text>
        <Text className="uppercase" style={{ flex: 27, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Vaka
        </Text>
        <Text className="uppercase" style={{ flex: 17, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Hekim
        </Text>
        <Text className="uppercase" style={{ flex: 12, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Oluşturma
        </Text>
        <Text className="uppercase" style={{ flex: 14, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Durum
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Table body */}
      {pageOrders.map((order, i) => (
        <DesktopRow
          useClinicLogoAvatar={tablePanel !== 'clinic' && tablePanel !== 'doctor'}
          key={order.id}
          order={order}
          isManager={isManager}
          isAdmin={isAdmin}
          isLast={i === pageOrders.length - 1}
          onPress={() => onPress(order)}
          onAssign={() => onAssign(order)}
          onEdit={onEdit ? () => onEdit(order) : undefined}
          onArchive={onArchive ? () => onArchive(order) : undefined}
          onDelete={onDelete ? () => onDelete(order) : undefined}
        />
      ))}

      {/* Footer — title varsa "YENİ" + ortalanmış başlık, yoksa sayaç */}
      <View
        className="flex-row items-center justify-center px-5 py-3 border-t"
        style={{
          backgroundColor: footerTitle ? (isDark ? 'rgba(217,119,6,0.10)' : '#FFF7ED') : (isDark ? T.cardSoft : '#FAFAFA'),
          borderTopColor: footerTitle ? 'rgba(217,119,6,0.20)' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
        }}
      >
        {footerTitle ? (
          <Text
            // @ts-ignore — pulse animation only on web
            className={Platform.OS === 'web' ? 'planlama-text-pulse' : ''}
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: darkFg(isDark, footerColor ?? '#9C5E0E'),
              textAlign: 'center',
            }}
          >
            {footerTitle}
          </Text>
        ) : paginate ? (
          <>
            <Text style={{ fontSize: 12, color: T.ink3, flex: 1 }}>
              {orders.length} {autoT('siparişten')} {orders.length === 0 ? 0 : firstIdx + 1}–{Math.min(firstIdx + PAGE_SIZE, orders.length)} {autoT('gösteriliyor')}
            </Text>
            <View className="flex-row items-center gap-1">
              <Pressable
                disabled={safePage <= 0}
                onPress={() => setPage(p => Math.max(0, p - 1))}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ opacity: safePage <= 0 ? 0.35 : 1, ...(Platform.OS === 'web' ? { cursor: safePage <= 0 ? 'default' : 'pointer' } as any : {}) }}
              >
                {isRTL() ? <ChevronRight size={16} color={T.ink2} strokeWidth={2} /> : <ChevronLeft size={16} color={T.ink2} strokeWidth={2} />}
              </Pressable>
              {Array.from({ length: totalPages }).map((_, i) => (
                <Pressable
                  key={i}
                  onPress={() => setPage(i)}
                  className="h-8 rounded-full items-center justify-center"
                  style={{ minWidth: 32, paddingHorizontal: 8, backgroundColor: i === safePage ? T.ink : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                >
                  <Text style={{ fontSize: 13, fontWeight: i === safePage ? '700' : '500', color: i === safePage ? '#FFFFFF' : T.ink2 }}>{i + 1}</Text>
                </Pressable>
              ))}
              <Pressable
                disabled={safePage >= totalPages - 1}
                onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ opacity: safePage >= totalPages - 1 ? 0.35 : 1, ...(Platform.OS === 'web' ? { cursor: safePage >= totalPages - 1 ? 'default' : 'pointer' } as any : {}) }}
              >
                {isRTL() ? <ChevronLeft size={16} color={T.ink2} strokeWidth={2} /> : <ChevronRight size={16} color={T.ink2} strokeWidth={2} />}
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 11, color: T.ink3, flex: 1 }}>
            {orders.length} sipariş gösteriliyor
          </Text>
        )}
      </View>
    </View>
  );
}

const DesktopRow = React.memo(function DesktopRow({ order, isManager, isAdmin, isLast, useClinicLogoAvatar, onPress, onAssign, onEdit, onArchive, onDelete }: {
  order: WorkOrder;
  /** Lab/admin/teknisyen: hasta baş harfleri yerine klinik logosu göster. */
  useClinicLogoAvatar?: boolean;
  isManager: boolean;
  isAdmin?: boolean;
  isLast: boolean;
  onPress: (o: WorkOrder) => void;
  onAssign: (o: WorkOrder) => void;
  onEdit?: (o: WorkOrder) => void;
  onArchive?: (o: WorkOrder) => void;
  onDelete?: (o: WorkOrder) => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(order.delivery_date + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const onHold  = (order as any).hold_status === 'on_hold';
  const isLate  = order.status !== 'teslim_edildi' && diff < 0 && !onHold;
  const stage   = stageOf(order);
  const stageColor = STAGE_COLOR[stage];
  const dText   = deliveryText(order.delivery_date, order.status, (order as any).hold_status);
  const canAssign = isManager && order.status === 'alindi' && !order.assigned_to;
  const needsTriage = order.status === 'alindi' && !(order as any).triaged_at;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  // Durum rozeti rengi = YALNIZ workflow durumu (semantik).
  // Gecikme/öncelik AYRI boyut → rozeti boyamaz (gecikme VAKA meta'da kırmızı "N gün gecikti",
  // ACİL Hasta'da etiket). Böylece kırmızı yalnız gerçek problem/iptal içindir.
  //   bekliyor → amber · işlemde/kontrolde → blue · tamam → green · iptal → red
  const chipTone: 'success' | 'warning' | 'danger' | 'info' =
    onHold                             ? 'warning'   // Duraklatıldı (bekliyor)
    : order.status === 'teslim_edildi' ? 'success'   // Teslim edildi
    : order.status === 'kalite_kontrol'? 'warning'   // KK bekliyor (kuyrukta)
    : order.status === 'iptal'         ? 'danger'    // İptal (gerçek problem)
    : 'info';                                        // Alındı · Üretimde · Teslimata hazır

  const CHIP_TONES = {
    success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
    warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
    danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
    info:    { bg: 'rgba(74,143,201,0.12)',  fg: '#1F5689' },
  };
  const toneRaw = CHIP_TONES[chipTone];
  // Zemin (bg) rgba tonu koyuda da geçerli kalır; yalnız ön-plan metni/nokta rengi açılır (koyu kartta okunmasın diye).
  const tone = { bg: toneRaw.bg, fg: darkFg(isDark, toneRaw.fg) };

  // Patient initials for avatar
  const patientName = order.patient_name ? titleCaseTR(order.patient_name) : '—';
  const initials = patientName.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  // Lab tarafı panellerde klinik logosu kullanılır; klinik/hekim panelinde hayır.
  const clinicLogo = useClinicLogoAvatar ? ((order as any)?.doctor?.clinic?.logo_url ?? null) : null;

  // VAKA alt satırı: normalde vaka bileşimi (gerçek tooth_numbers → diş sayısı),
  // dikkat gereken işlerde durum ipucuna döner ("ikisi birden"). Uydurma yok.
  const teethCount = Array.isArray((order as any).tooth_numbers) ? (order as any).tooth_numbers.length : 0;
  // İlişki (devam/revizyon): ana listede __relType/__parentNo, planlama bölümünde eski __revChild bayrakları.
  const relType: 'devam' | 'revizyon' | null =
    (order as any).__relType ?? ((order as any).__revChild ? ((order as any).__continuation ? 'devam' : 'revizyon') : null);
  const parentNo: string | null = (order as any).__parentNo ?? null;
  const relColor = darkFg(isDark, relType === 'devam' ? '#3563A8' : '#9C5E0E');
  const relLabel = relType === 'devam' ? autoT('Devam siparişi') : autoT('Revizyon');
  // VAKA meta satırı: yalnız vaka bileşimi + gerekiyorsa dikkat. İlişki (devam/revizyon)
  // YALNIZ HASTA alt-satırında gösterilir (tek yer) → burada tekrar edilmez.
  const attentionLabel = onHold ? autoT('Duraklatıldı') : isLate ? `${Math.abs(diff)} ${autoT('gün gecikti')}` : needsTriage ? autoT('planlama bekliyor') : null;
  const vakaMeta = [teethCount > 0 ? `${teethCount} ${autoT('diş')}` : null, attentionLabel].filter(Boolean).join('   ·   ');
  const vakaMetaColor = attentionLabel ? darkFg(isDark, (onHold || needsTriage) ? '#9C5E0E' : '#9C2E2E') : T.ink3;

  return (
    <Pressable
      onPress={() => onPress(order)}
      style={({ hovered }: any) => [
        // NOT: className + style-fonksiyonu birlikte olunca NativeWind style'ı düşürebiliyordu
        // → padding hiç uygulanmıyordu. Tüm düzen doğrudan style'da (garanti uygulanır).
        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 9, minHeight: 66 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)' },
        // Planlama bekleyen — sabit soft amber zemin + sol kenar şeridi (animasyon yok)
        needsTriage && { backgroundColor: 'rgba(217,119,6,0.05)', borderStartWidth: 3, borderStartColor: '#D97706' },
        // Revizyon alt-satırı — girintili (üstteki orijinale bağlı)
        (order as any).__revChild && { paddingStart: 18 },
        // @ts-ignore web hover
        Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s' } as any : undefined,
        // Hover — sade zemin (planlama amber'ını ezmeyecek kadar hafif)
        hovered && !needsTriage && Platform.OS === 'web' ? { backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.025)' } as any : undefined,
      ]}
    >
      {/* Hasta — klinik logosu (hangi klinikten geldiği) + isim + ACİL + #no + ilişki alt-satırı.
          ACİL = öncelik (durum değil); ilişki (devam/revizyon) = alt-satır. */}
      <View style={{ flex: 30, minWidth: 0, paddingEnd: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {clinicLogo ? (
          <View
            className="items-center justify-center overflow-hidden"
            style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}
          >
            <Image source={{ uri: clinicLogo }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
        ) : (
          <View
            className="items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0, backgroundColor: stageColor + '20' }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: stageColor }}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: isLate ? darkFg(isDark, '#DC2626') : T.ink, flexShrink: 1 }} numberOfLines={1}>
              {patientName}
            </Text>
            {order.is_urgent && (
              <View style={{ backgroundColor: 'rgba(217,75,75,0.12)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, flexShrink: 0 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.6, color: '#9C2E2E' }}>ACİL</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 11.5, fontFamily: 'monospace', color: T.ink3, marginTop: 2 }} numberOfLines={1}>
            #{order.order_number}
          </Text>
          {relType && (
            <View className="flex-row items-center" style={{ gap: 4, marginTop: 3 }}>
              {isRTL()
                ? <CornerDownLeft size={12} color={relColor} strokeWidth={2} style={{ flexShrink: 0 }} />
                : <CornerDownRight size={12} color={relColor} strokeWidth={2} style={{ flexShrink: 0 }} />}
              <Text style={{ fontSize: 11, fontWeight: '600', color: relColor }} numberOfLines={1}>
                {relLabel}{parentNo ? ` · ${autoT('asıl')} #${parentNo}` : ''}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Vaka — iş tipi (birincil, tek satır → uzun/çok türde "…" ile kesilir, HEKİM'e taşmaz)
          + meta satırı (diş sayısı · dikkat). */}
      <View style={{ flex: 27, minWidth: 0, paddingEnd: 20 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '500', color: T.ink }} numberOfLines={1}>
          {order.work_type}
        </Text>
        {vakaMeta ? (
          <Text style={{ fontSize: 12, color: vakaMetaColor, marginTop: 3 }} numberOfLines={1}>
            {vakaMeta}
          </Text>
        ) : null}
      </View>

      {/* Hekim */}
      <Text style={{ flex: 17, minWidth: 0, fontSize: 13, color: T.ink2, paddingEnd: 14 }} numberOfLines={1}>
        {order.doctor?.full_name ?? '—'}
      </Text>

      {/* Oluşturma tarihi + saati */}
      <View style={{ flex: 12 }}>
        <Text style={{ fontSize: 13, color: T.ink2 }} numberOfLines={1}>
          {order.created_at ? new Date(order.created_at).toLocaleDateString(localeTag()) : '—'}
        </Text>
        {order.created_at && (
          <Text style={{ fontSize: 11, color: T.ink3 }} numberOfLines={1}>
            {new Date(order.created_at).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      {/* Durum — YALNIZ workflow durumu (Acil=öncelik → Hasta'da; ilişki → Hasta alt-satırı). */}
      <View style={{ flex: 14, alignItems: 'flex-start', paddingEnd: 8 }}>
        <View className="flex-row items-center gap-1.5 self-start" style={{ maxWidth: '100%' }}>
          <OrderStatusInfo order={order as any} />
          {/* Durum — yumuşak dolgulu rozet (nokta + etiket) */}
          <View
            className="flex-row items-center gap-1.5 rounded-full"
            style={{ backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 }}
          >
            <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tone.fg, flexShrink: 0 }} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: tone.fg, flexShrink: 1 }} numberOfLines={1}>
              {onHold ? 'Duraklatıldı' : getOrderStageLabel(order as any)}
            </Text>
          </View>
        </View>
      </View>

      {/* Action */}
      <View style={{ width: 36 }} className="flex-row items-center justify-end gap-1">
        {/* Admin işlemleri tek «⋯» menüsünde — üç ayrı ikon satırın sağından
            ~90px yiyordu ve yıkıcı «Sil» her satırda tek tıkla erişilebilirdi. */}
        {isAdmin && <RowActionsMenu actions={rowActions(order, onEdit, onArchive, onDelete)} size={26} />}
        {!isAdmin && (canAssign ? (
          <Pressable
            onPress={e => { (e as any).stopPropagation?.(); onAssign(order); }}
            className="px-3 py-1 rounded-full"
            style={{ backgroundColor: T.ink }}
          >
            <Text className="text-[10px] font-semibold text-white">Ata</Text>
          </Pressable>
        ) : (
          isRTL() ? <ChevronLeft size={14} color="#CCC" strokeWidth={1.6} />
                  : <ChevronRight size={14} color="#CCC" strokeWidth={1.6} />
        ))}
      </View>
    </Pressable>
  );
});
