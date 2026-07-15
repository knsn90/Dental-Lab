import { localeTag } from '../../../core/i18n';
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
import React, { useState, useMemo, useEffect, useCallback } from 'react';

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
  View, Text, ScrollView, RefreshControl, Pressable,
  TextInput, Modal, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { Search, X, SlidersHorizontal, ArrowUpDown, ChevronRight, Flame, Clock, LayoutList, Columns3, UserCheck, Pencil, Archive, Trash2, RotateCcw, AlertCircle, ShieldAlert, ListChecks, Camera } from 'lucide-react-native';
import { ScanWorkOrderModal } from '../components/ScanWorkOrderModal';
import { OrderEditSheet } from '../components/OrderEditSheet';
import { archiveOrder, restoreOrder, hardDeleteOrder } from '../api';
import { titleCaseTR } from '../../../core/utils/textCase';

import { useAuthStore } from '../../../core/store/authStore';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
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
import { getOrderStageLabel } from '../utils/currentStage';
import { OrdersKanbanB2Mobile } from './OrdersKanbanB2Mobile';
import { DoctorOrdersMobile } from './DoctorOrdersMobile';
import { mapStationToStage } from '../stationMapping';
import { STAGE_LABEL, STAGE_COLOR, legacyStatusToStage, type Stage } from '../stages';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

// ── Panel detection helper ─────────────────────────────────────────
type PanelKind = 'lab' | 'clinic' | 'doctor' | 'admin';
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
  if (diff <= 6)  return `${diff} gün`;
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
    setPageTitle('Siparişler', '');
    return () => clearPageTitle();
  }, []);

  // ── State ──
  const [viewMode, setViewMode]         = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all'>('all');
  const [search, setSearch]             = useState('');
  const [searchOpen, setSearchOpen]     = useState(false);
  const [scanOpen, setScanOpen]         = useState(false);
  const [urgentOnly, setUrgentOnly]     = useState(false);
  const [overdueOnly, setOverdueOnly]   = useState(false);
  const [sortBy, setSortBy]             = useState<SortBy>('created_at');  // en yeni sipariş her zaman üstte
  const [sortDir, setSortDir]           = useState<SortDir>('desc');
  const [sortOpen, setSortOpen]         = useState(false);

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

  const today = new Date().toISOString().split('T')[0];

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
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2">
          {/* Status tabs + Acil/Geciken — tek pill strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-1"
            contentContainerStyle={{ gap: 6 }}
          >
            <View className="flex-row gap-0.5 p-0.5 bg-cream-panel rounded-full">
              {STATUS_FILTERS.map(f => {
                const active = statusFilter === f.value && !urgentOnly && !overdueOnly;
                const count = statusCounts[f.value] ?? 0;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => { setStatusFilter(f.value); setUrgentOnly(false); setOverdueOnly(false); }}
                    className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${active ? 'bg-ink-900' : ''}`}
                  >
                    <Text className={`text-[12px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}>
                      {f.label}
                    </Text>
                    <Text className={`text-[10px] font-bold ${active ? 'text-white/60' : 'text-ink-400'}`}>
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Acil / Geciken toggle pills */}
            <Pressable
              onPress={() => { setUrgentOnly(v => !v); if (!urgentOnly) setOverdueOnly(false); }}
              className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${urgentOnly ? '' : 'bg-white border border-black/[0.06]'}`}
              style={urgentOnly ? { backgroundColor: 'rgba(217,119,6,0.12)' } : undefined}
            >
              <Flame size={12} color={urgentOnly ? '#D97706' : '#9A9A9A'} strokeWidth={1.8} />
              <Text className={`text-[12px] font-semibold ${urgentOnly ? '' : 'text-ink-500'}`} style={urgentOnly ? { color: '#D97706' } : undefined}>
                Acil
              </Text>
              {urgentCount > 0 && (
                <Text className={`text-[10px] font-bold ${urgentOnly ? '' : 'text-ink-400'}`} style={urgentOnly ? { color: '#D97706', opacity: 0.7 } : undefined}>
                  {urgentCount}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => { setOverdueOnly(v => !v); if (!overdueOnly) setUrgentOnly(false); }}
              className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${overdueOnly ? '' : 'bg-white border border-black/[0.06]'}`}
              style={overdueOnly ? { backgroundColor: 'rgba(220,38,38,0.12)' } : undefined}
            >
              <Clock size={12} color={overdueOnly ? '#DC2626' : '#9A9A9A'} strokeWidth={1.8} />
              <Text className={`text-[12px] font-semibold ${overdueOnly ? '' : 'text-ink-500'}`} style={overdueOnly ? { color: '#DC2626' } : undefined}>
                Geciken
              </Text>
              {overdueCount > 0 && (
                <Text className={`text-[10px] font-bold ${overdueOnly ? '' : 'text-ink-400'}`} style={overdueOnly ? { color: '#DC2626', opacity: 0.7 } : undefined}>
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
                  : { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }
                }
              >
                <Archive size={12} color={showArchived ? '#92400E' : '#9A9A9A'} strokeWidth={1.8} />
                <Text className="text-[12px] font-semibold" style={{ color: showArchived ? '#92400E' : '#6B6B6B' }}>
                  {showArchived ? 'Arşivde' : 'Arşiv'}
                </Text>
              </Pressable>
            )}

            {/* Kağıt sipariş tara — klinikler kağıt formla sipariş veriyorsa OCR */}
            {Platform.OS === 'web' && (
              <Pressable
                onPress={() => setScanOpen(true)}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: 'rgba(37,99,235,0.25)' }}
              >
                <Camera size={12} color="#2563EB" strokeWidth={1.8} />
                <Text className="text-[12px] font-semibold" style={{ color: '#2563EB' }}>
                  Kağıt Sipariş Tara
                </Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Search */}
          {searchOpen ? (
            <View
              className="flex-row items-center gap-2 rounded-full bg-white border border-black/[0.08] px-3 h-8"
              style={{
                minWidth: 200,
                // @ts-ignore
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <Search size={14} color="#6B6B6B" strokeWidth={1.8} />
              <TextInput
                className="flex-1 text-[13px] text-ink-900"
                placeholder="Sipariş, hasta, hekim ara..."
                placeholderTextColor="#9A9A9A"
                value={search}
                onChangeText={setSearch}
                autoFocus
                returnKeyType="search"
                onBlur={() => { if (!search) setSearchOpen(false); }}
                // @ts-ignore web
                style={{ outlineStyle: 'none' }}
              />
              {search.length > 0 && (
                <Pressable onPress={() => { setSearch(''); setSearchOpen(false); }}>
                  <X size={13} color="#6B6B6B" strokeWidth={2} />
                </Pressable>
              )}
            </View>
          ) : (
            <Pressable
              onPress={() => setSearchOpen(true)}
              className="w-8 h-8 rounded-full bg-white border border-black/[0.06] items-center justify-center"
              style={{
                // @ts-ignore
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <Search size={15} color={search ? T.ink : T.ink2} strokeWidth={1.8} />
            </Pressable>
          )}

          {/* Sort */}
          <Pressable
            onPress={() => setSortOpen(true)}
            className="w-8 h-8 rounded-full bg-white border border-black/[0.06] items-center justify-center"
            style={{
              // @ts-ignore
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <ArrowUpDown size={15} color="#6B6B6B" strokeWidth={1.8} />
          </Pressable>

          {/* View toggle */}
          <View className="flex-row p-0.5 rounded-full bg-cream-panel">
            <Pressable
              onPress={() => setViewMode('list')}
              className={`px-2 py-1 rounded-full ${viewMode === 'list' ? 'bg-ink-900' : ''}`}
            >
              <LayoutList size={14} color={viewMode === 'list' ? '#FFF' : '#6B6B6B'} strokeWidth={1.8} />
            </Pressable>
            <Pressable
              onPress={() => setViewMode('kanban')}
              className={`px-2 py-1 rounded-full ${viewMode === 'kanban' ? 'bg-ink-900' : ''}`}
            >
              <Columns3 size={14} color={viewMode === 'kanban' ? '#FFF' : '#6B6B6B'} strokeWidth={1.8} />
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
              className="flex-1 flex-row items-center bg-white rounded-2xl px-3"
              style={{ height: 40, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}
            >
              <Search size={16} color="#6B6B6B" strokeWidth={1.8} />
              <TextInput
                className="flex-1 ml-2 text-[14px] text-ink-900"
                placeholder="Sipariş, hasta, hekim ara"
                placeholderTextColor="#9A9A9A"
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <X size={15} color="#6B6B6B" strokeWidth={2} />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => setSortOpen(true)}
              className="bg-white items-center justify-center rounded-2xl"
              style={{ width: 40, height: 40, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}
            >
              <ArrowUpDown size={16} color="#0A0A0A" strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Status chips — yatay scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.value && !urgentOnly && !overdueOnly;
              const count = statusCounts[f.value] ?? 0;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => { setStatusFilter(f.value); setUrgentOnly(false); setOverdueOnly(false); }}
                  className={`flex-row items-center rounded-full px-3.5 ${active ? 'bg-ink-900' : 'bg-white'}`}
                  style={{ height: 32, borderWidth: 1, borderColor: active ? 'transparent' : 'rgba(0,0,0,0.06)', gap: 6 }}
                >
                  <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink-700'}`}>
                    {f.label}
                  </Text>
                  <Text className={`text-[11px] font-bold ${active ? 'text-white/60' : 'text-ink-400'}`}>
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
                backgroundColor: urgentOnly ? 'rgba(217,119,6,0.12)' : '#FFFFFF',
                borderWidth: 1,
                borderColor: urgentOnly ? 'rgba(217,119,6,0.25)' : 'rgba(0,0,0,0.06)',
              }}
            >
              <Flame size={13} color={urgentOnly ? '#D97706' : '#9A9A9A'} strokeWidth={1.8} />
              <Text className={`text-[12px] font-semibold ${urgentOnly ? '' : 'text-ink-500'}`} style={urgentOnly ? { color: '#D97706' } : undefined}>
                Acil
              </Text>
              {urgentCount > 0 && (
                <Text className={`text-[10px] font-bold ${urgentOnly ? '' : 'text-ink-400'}`} style={urgentOnly ? { color: '#D97706', opacity: 0.7 } : undefined}>
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
                backgroundColor: overdueOnly ? 'rgba(220,38,38,0.12)' : '#FFFFFF',
                borderWidth: 1,
                borderColor: overdueOnly ? 'rgba(220,38,38,0.25)' : 'rgba(0,0,0,0.06)',
              }}
            >
              <Clock size={13} color={overdueOnly ? '#DC2626' : '#9A9A9A'} strokeWidth={1.8} />
              <Text className={`text-[12px] font-semibold ${overdueOnly ? '' : 'text-ink-500'}`} style={overdueOnly ? { color: '#DC2626' } : undefined}>
                Geciken
              </Text>
              {overdueCount > 0 && (
                <Text className={`text-[10px] font-bold ${overdueOnly ? '' : 'text-ink-400'}`} style={overdueOnly ? { color: '#DC2626', opacity: 0.7 } : undefined}>
                  {overdueCount}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Content ────────────────────────────────────────────────── */}
      {isDesktop && viewMode === 'kanban' ? (
        <KanbanBoard orders={visibleOrders} userGroup={(panelGroup || '(lab)') as any} onStatusAdvance={onStatusAdvance} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: isDesktop ? 16 : 12,
            paddingTop: 4,
            paddingBottom: 120,
          }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#0A0A0A" />}
          showsVerticalScrollIndicator={false}
        >
          {loading && filtered.length === 0 ? (
            <View className="py-16 items-center">
              <ActivityIndicator color="#0A0A0A" />
              <Text className="text-[13px] text-ink-400 mt-3">Yükleniyor…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <EmptyStateV2 search={search} hasFilters={urgentOnly || overdueOnly || statusFilter !== 'all'} />
          ) : (() => {
            // Planlama bekleyen siparişler ayrı bir bloğa alınır
            const triagePendingOrders = filtered.filter(
              o => o.status === 'alindi' && !(o as any).triaged_at
            );
            const mainOrders = filtered.filter(
              o => !(o.status === 'alindi' && !(o as any).triaged_at)
            );

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
            className="bg-white rounded-3xl overflow-hidden w-full"
            style={{
              maxWidth: 380,
              // @ts-ignore
              boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            }}
          >
            <View className="px-5 pt-5 pb-3">
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                Sıralama
              </Text>
            </View>
            {SORT_OPTIONS.map((opt, i) => {
              const active = sortBy === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setSortBy(opt.value)}
                  className={`flex-row items-center justify-between px-5 py-3.5 ${i > 0 ? 'border-t border-black/[0.04]' : ''}`}
                >
                  <Text className={`text-[14px] ${active ? 'font-semibold text-ink-900' : 'font-medium text-ink-600'}`}>
                    {opt.label}
                  </Text>
                  {active && (
                    <View className="w-5 h-5 rounded-full bg-ink-900 items-center justify-center">
                      <Text className="text-[10px] text-white font-bold">✓</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}

            <View className="px-5 pt-4 pb-2">
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                Yön
              </Text>
            </View>
            <View className="flex-row gap-2 px-5 pb-4">
              <Pressable
                onPress={() => setSortDir('asc')}
                className={`flex-1 py-2.5 rounded-xl items-center ${sortDir === 'asc' ? 'bg-ink-900' : 'bg-cream-panel'}`}
              >
                <Text className={`text-[13px] font-semibold ${sortDir === 'asc' ? 'text-white' : 'text-ink-700'}`}>
                  Artan ↑
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSortDir('desc')}
                className={`flex-1 py-2.5 rounded-xl items-center ${sortDir === 'desc' ? 'bg-ink-900' : 'bg-cream-panel'}`}
              >
                <Text className={`text-[13px] font-semibold ${sortDir === 'desc' ? 'text-white' : 'text-ink-700'}`}>
                  Azalan ↓
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setSortOpen(false)}
              className="mx-5 mb-5 py-3 rounded-xl bg-cream-panel items-center"
            >
              <Text className="text-[14px] font-semibold text-ink-900">Tamam</Text>
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
            className="bg-white rounded-3xl overflow-hidden w-full"
            style={{
              maxWidth: 380,
              // @ts-ignore
              boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            }}
          >
            <View className="px-5 pt-5 pb-3 flex-row items-center gap-2">
              <UserCheck size={16} color="#0A0A0A" strokeWidth={1.8} />
              <Text className="text-[14px] font-semibold text-ink-900">
                {assignTarget ? `#${assignTarget.order_number} → Teknisyen` : 'Atama'}
              </Text>
            </View>
            {loadingTechs ? (
              <View className="py-8 items-center">
                <ActivityIndicator color="#0A0A0A" />
              </View>
            ) : technicians.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-[13px] text-ink-400">Teknisyen bulunamadı</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {(technicians as any[]).map((t, i) => (
                  <Pressable
                    key={t.id}
                    onPress={() => onAssignConfirm(t.id)}
                    disabled={assigning}
                    className={`flex-row items-center justify-between px-5 py-3.5 ${i > 0 ? 'border-t border-black/[0.04]' : ''} ${assigning ? 'opacity-50' : ''}`}
                  >
                    <View className="flex-row items-center gap-2.5">
                      <View className="w-8 h-8 rounded-full bg-ink-100 items-center justify-center">
                        <Text className="text-[12px] font-semibold text-ink-700">
                          {(t.full_name as string).split(' ').map((p: string) => p[0]).join('').slice(0, 2)}
                        </Text>
                      </View>
                      <Text className="text-[14px] font-medium text-ink-900">{t.full_name}</Text>
                    </View>
                    {t.role === 'manager' && (
                      <Text className="text-[11px] text-ink-400">Müdür</Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Pressable
              onPress={() => setAssignModalVisible(false)}
              className="mx-5 mb-5 mt-2 py-3 rounded-xl bg-cream-panel items-center"
            >
              <Text className="text-[14px] font-semibold text-ink-900">Kapat</Text>
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

      {/* Admin: kapsamlı düzenleme (tüm alanlar, gate yok) */}
      <OrderEditSheet
        visible={!!adminEditTarget}
        order={adminEditTarget as any}
        mode="admin"
        onClose={() => setAdminEditTarget(null)}
        onSaved={() => { refetch?.(); }}
      />

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
          router.push('/(lab)/new-order' as any);
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
  const dColor  = isLate ? '#DC2626' : diff <= 1 && order.status !== 'teslim_edildi' ? '#D97706' : T.ink2;
  const canAssign = isManager && order.status === 'alindi' && !order.assigned_to;
  const needsTriage = order.status === 'alindi' && !(order as any).triaged_at;

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
      {/* Stage dot or Planlama indicator */}
      <View className="pt-1">
        {needsTriage ? (
          <View
            className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: '#D97706' }}
          >
            <ListChecks size={14} color="#FFF" strokeWidth={2} />
          </View>
        ) : (
          <View
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: isLate ? '#DC2626' : stageColor }}
          />
        )}
      </View>

      {/* Body */}
      <View className="flex-1 gap-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text
            className="text-[15px] font-semibold flex-1"
            style={isLate ? { color: '#DC2626' } : { color: T.ink }}
            numberOfLines={1}
          >
            {order.work_type}
          </Text>
        </View>
        <Text className="text-[12px]" style={{ color: T.ink2 }} numberOfLines={1}>
          <Text className="font-semibold" style={{ color: T.ink }}>#{order.order_number}</Text>
          {`  ·  ${order.patient_name ? titleCaseTR(order.patient_name) : '—'}  ·  ${order.doctor?.full_name ?? '—'}`}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          {/* ACİL / YENİ küçük etiketler */}
          {order.is_urgent && (
            <Text style={{ fontSize: 8.5, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#9C2E2E' }}>
              Acil
            </Text>
          )}
          {needsTriage ? (
            <View className="px-2 py-0.5 rounded flex-row items-center gap-1" style={{ backgroundColor: '#D97706' }}>
              <Text className="text-[10px] font-bold" style={{ color: '#FFF', letterSpacing: 0.3 }}>
                PLANLAMA BEKLİYOR
              </Text>
            </View>
          ) : (
            <View className="px-2 py-0.5 rounded" style={{ backgroundColor: (onHold ? '#E89B2A' : stageColor) + '14' }}>
              <Text className="text-[10px] font-bold" style={{ color: onHold ? '#9C5E0E' : stageColor, letterSpacing: 0.3 }}>
                {onHold ? 'DURAKLATILDI' : getOrderStageLabel(order as any).toUpperCase()}
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
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {onEdit && (
              <Pressable
                onPress={(e: any) => { e?.stopPropagation?.(); onEdit(order); }}
                style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(31,86,137,0.12)' }}
              >
                <Pencil size={12} color="#1F5689" strokeWidth={1.8} />
              </Pressable>
            )}
            {onArchive && (
              <Pressable
                onPress={(e: any) => { e?.stopPropagation?.(); onArchive(order); }}
                style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(217,119,6,0.14)' }}
              >
                {(order as any).is_archived
                  ? <RotateCcw size={12} color="#92400E" strokeWidth={1.8} />
                  : <Archive size={12} color="#92400E" strokeWidth={1.8} />
                }
              </Pressable>
            )}
            {onDelete && (
              <Pressable
                onPress={(e: any) => { e?.stopPropagation?.(); onDelete(order); }}
                style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(156,46,46,0.12)' }}
              >
                <Trash2 size={12} color="#9C2E2E" strokeWidth={1.8} />
              </Pressable>
            )}
          </View>
        ) : canAssign ? (
          <Pressable
            onPress={e => { (e as any).stopPropagation?.(); onAssign(order); }}
            className="px-3 py-1 rounded-full bg-ink-900"
          >
            <Text className="text-[11px] font-semibold text-white">Ata</Text>
          </Pressable>
        ) : (
          <ChevronRight size={16} color="#CCC" strokeWidth={1.6} />
        )}
      </View>
    </Pressable>
  );
});

// ═══════════════════════════════════════════════════════════════════════
// DESKTOP TABLE
// ═══════════════════════════════════════════════════════════════════════
function DesktopTable({ orders, isManager, isAdmin, onPress, onAssign, onEdit, onArchive, onDelete, footerTitle, footerColor }: {
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
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const headColor = T.ink3;
  return (
    <View
      className="rounded-3xl overflow-hidden"
      style={{ borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)', backgroundColor: isDark ? T.card : '#FFFFFF' }}
    >
      {/* Column header */}
      <View className="flex-row px-5 py-3 border-b" style={{ backgroundColor: isDark ? T.cardSoft : '#FAFAFA', borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
        <Text className="uppercase" style={{ width: 90, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          No
        </Text>
        <Text className="uppercase" style={{ flex: 2, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Hasta
        </Text>
        <Text className="uppercase" style={{ flex: 1.8, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Vaka
        </Text>
        <Text className="uppercase" style={{ flex: 1.6, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Hekim
        </Text>
        <Text className="uppercase" style={{ flex: 1.2, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Oluşturma
        </Text>
        <Text className="uppercase" style={{ flex: 1.2, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Teslim
        </Text>
        <Text className="uppercase" style={{ flex: 1.6, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          Durum
        </Text>
        <Text className="uppercase text-right" style={{ width: 92, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: headColor }}>
          {' '}
        </Text>
      </View>

      {/* Table body */}
      {orders.map((order, i) => (
        <DesktopRow
          key={order.id}
          order={order}
          isManager={isManager}
          isAdmin={isAdmin}
          isLast={i === orders.length - 1}
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
              color: footerColor ?? '#9C5E0E',
              textAlign: 'center',
            }}
          >
            {footerTitle}
          </Text>
        ) : (
          <Text style={{ fontSize: 11, color: T.ink3, flex: 1 }}>
            {orders.length} sipariş gösteriliyor
          </Text>
        )}
      </View>
    </View>
  );
}

const DesktopRow = React.memo(function DesktopRow({ order, isManager, isAdmin, isLast, onPress, onAssign, onEdit, onArchive, onDelete }: {
  order: WorkOrder;
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

  // Status chip tone — beklemedeki iş her yerde "Duraklatıldı" görünür (gecikme değil)
  const chipTone: 'success' | 'warning' | 'danger' | 'info' =
    onHold ? 'warning'
    : isLate ? 'danger'
    : (order.status === 'teslim_edildi') ? 'success'
    : (order.status === 'kalite_kontrol' || order.status === 'teslimata_hazir') ? 'warning'
    : 'info';

  const CHIP_TONES = {
    success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
    warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
    danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
    info:    { bg: 'rgba(74,143,201,0.12)',  fg: '#1F5689' },
  };
  const tone = CHIP_TONES[chipTone];

  // Patient initials for avatar
  const patientName = order.patient_name ? titleCaseTR(order.patient_name) : '—';
  const initials = patientName.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';

  return (
    <Pressable
      onPress={() => onPress(order)}
      className="flex-row items-center px-5"
      style={[
        { paddingVertical: 14 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
        // Planlama bekleyen — sabit soft amber zemin + sol kenar şeridi (animasyon yok)
        needsTriage && { backgroundColor: 'rgba(217,119,6,0.05)', borderLeftWidth: 3, borderLeftColor: '#D97706' },
        // @ts-ignore web hover
        Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s' } as any : undefined,
      ]}
    >
      {/* No */}
      <View style={{ width: 90 }} className="flex-row items-center gap-1.5">
        <Text style={{ fontSize: 11, fontFamily: 'monospace', color: T.ink3 }}>
          #{order.order_number}
        </Text>
      </View>

      {/* Hasta — avatar + isim */}
      <View style={{ flex: 2 }} className="flex-row items-center gap-2.5">
        <View
          className="w-7 h-7 rounded-full items-center justify-center shrink-0"
          style={{ backgroundColor: stageColor + '20' }}
        >
          <Text style={{ fontSize: 10, fontWeight: '600', color: stageColor }}>
            {initials}
          </Text>
        </View>
        <Text
          style={{ fontSize: 13, fontWeight: '500', color: isLate ? '#DC2626' : T.ink }}
          numberOfLines={1}
        >
          {patientName}
        </Text>
      </View>

      {/* Vaka */}
      <Text style={{ flex: 1.8, fontSize: 13, color: T.ink }} numberOfLines={1}>
        {order.work_type}
      </Text>

      {/* Hekim */}
      <Text style={{ flex: 1.6, fontSize: 13, color: T.ink2 }} numberOfLines={1}>
        {order.doctor?.full_name ?? '—'}
      </Text>

      {/* Oluşturma tarihi + saati */}
      <View style={{ flex: 1.2 }}>
        <Text style={{ fontSize: 13, color: T.ink2 }} numberOfLines={1}>
          {order.created_at ? new Date(order.created_at).toLocaleDateString(localeTag()) : '—'}
        </Text>
        {order.created_at && (
          <Text style={{ fontSize: 11, color: T.ink3 }} numberOfLines={1}>
            {new Date(order.created_at).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      {/* Teslim */}
      <Text
        style={{
          flex: 1.2,
          fontSize: 13,
          color: isLate ? '#DC2626' : diff <= 1 && order.status !== 'teslim_edildi' ? '#D97706' : T.ink,
        }}
      >
        {dText}
      </Text>

      {/* Durum — Patterns Chip + üstte küçük "ACİL" / "YENİ" işaretleri */}
      <View style={{ flex: 1.6, alignItems: 'flex-start', paddingRight: 8 }}>
        {/* Üst etiket satırı — birden fazla varsa yan yana */}
        {(order.is_urgent || needsTriage) && (
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 2, marginLeft: 6 }}>
            {order.is_urgent && (
              <Text
                style={{
                  fontSize: 8.5,
                  fontWeight: '700',
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: '#9C2E2E',
                }}
              >
                Acil
              </Text>
            )}
            {needsTriage && (
              <Text
                style={{
                  fontSize: 8.5,
                  fontWeight: '700',
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: '#9C5E0E',
                  opacity: 0.7,
                }}
              >
                Yeni
              </Text>
            )}
          </View>
        )}
        <View
          className="flex-row items-center gap-1.5 self-start px-3 py-1 rounded-full"
          style={{ backgroundColor: tone.bg, maxWidth: '100%' }}
        >
          <View className="w-1.5 h-1.5 rounded-full opacity-80" style={{ backgroundColor: tone.fg, flexShrink: 0 }} />
          <Text style={{ fontSize: 12, fontWeight: '500', color: tone.fg, flexShrink: 1 }} numberOfLines={1}>
            {onHold ? 'Duraklatıldı' : getOrderStageLabel(order as any)}
          </Text>
        </View>
      </View>

      {/* Action */}
      <View style={{ width: 92 }} className="flex-row items-center justify-end gap-1">
        {/* Admin inline action ikonları (Düzenle / Pasife / Sil) */}
        {isAdmin && (
          <>
            {onEdit && (
              <Pressable
                onPress={(e: any) => { e?.stopPropagation?.(); onEdit(order); }}
                style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(31,86,137,0.12)' }}
                {...(Platform.OS === 'web' ? { title: 'Düzenle' } : {})}
              >
                <Pencil size={11} color="#1F5689" strokeWidth={1.8} />
              </Pressable>
            )}
            {onArchive && (
              <Pressable
                onPress={(e: any) => { e?.stopPropagation?.(); onArchive(order); }}
                style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(217,119,6,0.14)' }}
                {...(Platform.OS === 'web' ? { title: (order as any).is_archived ? 'Geri yükle' : 'Pasife al' } : {})}
              >
                {(order as any).is_archived
                  ? <RotateCcw size={11} color="#92400E" strokeWidth={1.8} />
                  : <Archive size={11} color="#92400E" strokeWidth={1.8} />
                }
              </Pressable>
            )}
            {onDelete && (
              <Pressable
                onPress={(e: any) => { e?.stopPropagation?.(); onDelete(order); }}
                style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(156,46,46,0.12)' }}
                {...(Platform.OS === 'web' ? { title: 'Kalıcı sil' } : {})}
              >
                <Trash2 size={11} color="#9C2E2E" strokeWidth={1.8} />
              </Pressable>
            )}
          </>
        )}
        {!isAdmin && (canAssign ? (
          <Pressable
            onPress={e => { (e as any).stopPropagation?.(); onAssign(order); }}
            className="px-3 py-1 rounded-full bg-ink-900"
          >
            <Text className="text-[10px] font-semibold text-white">Ata</Text>
          </Pressable>
        ) : (
          <ChevronRight size={14} color="#CCC" strokeWidth={1.6} />
        ))}
      </View>
    </Pressable>
  );
});
