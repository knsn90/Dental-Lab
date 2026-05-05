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
import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, RefreshControl, Pressable,
  TextInput, Modal, ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Search, X, SlidersHorizontal, ArrowUpDown, ChevronRight, Flame, Clock, LayoutList, Columns3, UserCheck } from 'lucide-react-native';

import { useAuthStore } from '../../../core/store/authStore';
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
import { mapStationToStage } from '../stationMapping';
import { STAGE_LABEL, STAGE_COLOR, legacyStatusToStage, type Stage } from '../stages';

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
  { value: 'alindi',          label: 'Triyaj' },
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
function deliveryText(d: string, status: WorkOrderStatus): string {
  if (status === 'teslim_edildi') return 'Teslim edildi';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(d + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0)   return `${Math.abs(diff)}g gecikti`;
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff <= 6)  return `${diff} gün`;
  return due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
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
  const segments = useSegments() as string[];
  const panelGroup = segments?.[0] ?? '';
  const panel = detectPanel(segments);

  const isTechnician = profile?.user_type === 'lab' && (profile as any)?.role === 'technician';
  const isManager    = (panel === 'lab' || panel === 'admin')
                    && ((profile?.user_type === 'lab' && (profile as any)?.role === 'manager')
                        || profile?.user_type === 'admin');

  // ── Data source: pick the right hook based on panel ──
  const labData    = useOrders(panel === 'doctor' ? 'doctor' : 'lab', panel === 'doctor' ? profile?.id : undefined);
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
  const [urgentOnly, setUrgentOnly]     = useState(false);
  const [overdueOnly, setOverdueOnly]   = useState(false);
  const [sortBy, setSortBy]             = useState<SortBy>('delivery_date');
  const [sortDir, setSortDir]           = useState<SortDir>('asc');
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
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const sl = search.toLowerCase();
      const matchSearch = !search
        || o.order_number.toLowerCase().includes(sl)
        || (o.doctor?.full_name ?? '').toLowerCase().includes(sl)
        || (o.patient_name ?? '').toLowerCase().includes(sl)
        || o.work_type.toLowerCase().includes(sl);
      const matchUrgent  = !urgentOnly  || o.is_urgent;
      const matchOverdue = !overdueOnly || (o.delivery_date < today && o.status !== 'teslim_edildi');
      return matchStatus && matchSearch && matchUrgent && matchOverdue;
    });
    return list.sort((a, b) => {
      let cmp = 0;
      if      (sortBy === 'delivery_date') cmp = a.delivery_date.localeCompare(b.delivery_date);
      else if (sortBy === 'created_at')    cmp = a.created_at.localeCompare(b.created_at);
      else if (sortBy === 'order_number')  cmp = a.order_number.localeCompare(b.order_number);
      else if (sortBy === 'is_urgent')     cmp = (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [visibleOrders, statusFilter, search, urgentOnly, overdueOnly, today, sortBy, sortDir]);

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

  // ── Handlers ──
  const onCardPress = (order: WorkOrder) => {
    if (panelGroup && panelGroup.startsWith('(')) {
      router.push(`/${panelGroup}/order/${order.id}` as any);
    } else {
      router.push(`/(lab)/order/${order.id}` as any);
    }
  };

  const onAssignPress = (order: WorkOrder) => {
    setAssignTarget(order);
    setAssignModalVisible(true);
    loadTechnicians();
  };

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
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <View className="flex-1 bg-cream-page">

      {/* ── Unified Filter Bar — tek satır ────────────────────────── */}
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
              <Search size={15} color={search ? '#0A0A0A' : '#6B6B6B'} strokeWidth={1.8} />
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

      {/* ── Content ────────────────────────────────────────────────── */}
      {viewMode === 'kanban' ? (
        <KanbanBoard orders={visibleOrders} userGroup={(panelGroup || '(lab)') as any} onStatusAdvance={onStatusAdvance} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: isDesktop ? 16 : 12, paddingTop: 4, paddingBottom: 24 }}
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
          ) : isDesktop ? (
            /* ═══ DESKTOP TABLE ═══ */
            <DesktopTable
              orders={filtered}
              isManager={isManager}
              onPress={onCardPress}
              onAssign={onAssignPress}
            />
          ) : (
            /* ═══ MOBILE CARDS ═══ */
            <View className="gap-2">
              {filtered.map(order => (
                <MobileOrderCard
                  key={order.id}
                  order={order}
                  isManager={isManager}
                  onPress={() => onCardPress(order)}
                  onAssign={() => onAssignPress(order)}
                />
              ))}
            </View>
          )}
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
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════
function EmptyStateV2({ search, hasFilters }: { search: string; hasFilters: boolean }) {
  return (
    <View className="py-16 items-center gap-2">
      <View className="w-14 h-14 rounded-2xl bg-ink-50 items-center justify-center mb-2">
        <LayoutList size={24} color="#9A9A9A" strokeWidth={1.4} />
      </View>
      <Text className="text-[16px] font-semibold text-ink-900">
        {search || hasFilters ? 'Eşleşen iş emri yok' : 'Henüz iş emri yok'}
      </Text>
      <Text className="text-[13px] text-ink-500 text-center" style={{ maxWidth: 280 }}>
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
function MobileOrderCard({ order, isManager, onPress, onAssign }: {
  order: WorkOrder;
  isManager: boolean;
  onPress: () => void;
  onAssign: () => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(order.delivery_date + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const isLate  = order.status !== 'teslim_edildi' && diff < 0;
  const stage   = stageOf(order);
  const stageColor = STAGE_COLOR[stage];
  const dText   = deliveryText(order.delivery_date, order.status);
  const dColor  = isLate ? '#DC2626' : diff <= 1 && order.status !== 'teslim_edildi' ? '#D97706' : '#6B6B6B';
  const canAssign = isManager && order.status === 'alindi' && !order.assigned_to;

  return (
    <Pressable
      onPress={onPress}
      className="bg-white rounded-2xl p-4 flex-row gap-3"
      style={{
        // @ts-ignore
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      {/* Stage dot */}
      <View className="pt-1">
        <View
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: isLate ? '#DC2626' : stageColor }}
        />
      </View>

      {/* Body */}
      <View className="flex-1 gap-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text
            className={`text-[15px] font-semibold flex-1 ${isLate ? '' : 'text-ink-900'}`}
            style={isLate ? { color: '#DC2626' } : undefined}
            numberOfLines={1}
          >
            {order.work_type}
          </Text>
          {order.is_urgent && (
            <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: '#FFF4E6' }}>
              <Flame size={11} color="#D97706" strokeWidth={2} />
            </View>
          )}
        </View>
        <Text className="text-[12px] text-ink-500" numberOfLines={1}>
          <Text className="font-semibold text-ink-700">#{order.order_number}</Text>
          {`  ·  ${order.patient_name ?? '—'}  ·  ${order.doctor?.full_name ?? '—'}`}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          <View className="px-2 py-0.5 rounded" style={{ backgroundColor: stageColor + '14' }}>
            <Text className="text-[10px] font-bold" style={{ color: stageColor, letterSpacing: 0.3 }}>
              {STAGE_LABEL[stage]}
            </Text>
          </View>
          <Text className="text-[11px] font-medium" style={{ color: dColor }}>
            {dText}
          </Text>
        </View>
      </View>

      {/* Right */}
      <View className="items-end justify-center gap-1">
        {canAssign ? (
          <Pressable
            onPress={e => { (e as any).stopPropagation?.(); onAssign(); }}
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
}

// ═══════════════════════════════════════════════════════════════════════
// DESKTOP TABLE
// ═══════════════════════════════════════════════════════════════════════
function DesktopTable({ orders, isManager, onPress, onAssign }: {
  orders: WorkOrder[];
  isManager: boolean;
  onPress: (o: WorkOrder) => void;
  onAssign: (o: WorkOrder) => void;
}) {
  return (
    <View
      className="bg-white rounded-3xl overflow-hidden"
      style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}
    >
      {/* Column header */}
      <View className="flex-row px-5 py-3 border-b" style={{ backgroundColor: '#FAFAFA', borderBottomColor: 'rgba(0,0,0,0.06)' }}>
        <Text className="uppercase" style={{ width: 90, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: '#6B6B6B' }}>
          No
        </Text>
        <Text className="uppercase" style={{ flex: 2, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: '#6B6B6B' }}>
          Hasta
        </Text>
        <Text className="uppercase" style={{ flex: 1.8, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: '#6B6B6B' }}>
          Vaka
        </Text>
        <Text className="uppercase" style={{ flex: 1.6, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: '#6B6B6B' }}>
          Hekim
        </Text>
        <Text className="uppercase" style={{ flex: 1.2, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: '#6B6B6B' }}>
          Teslim
        </Text>
        <Text className="uppercase" style={{ flex: 1.2, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: '#6B6B6B' }}>
          Durum
        </Text>
        <Text className="uppercase text-right" style={{ width: 60, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: '#6B6B6B' }}>
          {' '}
        </Text>
      </View>

      {/* Table body */}
      {orders.map((order, i) => (
        <DesktopRow
          key={order.id}
          order={order}
          isManager={isManager}
          isLast={i === orders.length - 1}
          onPress={() => onPress(order)}
          onAssign={() => onAssign(order)}
        />
      ))}

      {/* Footer */}
      <View className="flex-row items-center px-5 py-3 border-t" style={{ backgroundColor: '#FAFAFA', borderTopColor: 'rgba(0,0,0,0.06)' }}>
        <Text style={{ fontSize: 11, color: '#6B6B6B' }}>
          {orders.length} sipariş gösteriliyor
        </Text>
      </View>
    </View>
  );
}

function DesktopRow({ order, isManager, isLast, onPress, onAssign }: {
  order: WorkOrder;
  isManager: boolean;
  isLast: boolean;
  onPress: () => void;
  onAssign: () => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(order.delivery_date + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const isLate  = order.status !== 'teslim_edildi' && diff < 0;
  const stage   = stageOf(order);
  const stageColor = STAGE_COLOR[stage];
  const dText   = deliveryText(order.delivery_date, order.status);
  const canAssign = isManager && order.status === 'alindi' && !order.assigned_to;

  // Status chip tone
  const chipTone: 'success' | 'warning' | 'danger' | 'info' =
    isLate ? 'danger'
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
  const patientName = order.patient_name ?? '—';
  const initials = patientName.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-5"
      style={[
        { paddingVertical: 14 },
        !isLast && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
        // @ts-ignore web hover
        Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s' } as any : undefined,
      ]}
    >
      {/* No */}
      <View style={{ width: 90 }} className="flex-row items-center gap-1.5">
        <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#6B6B6B' }}>
          #{order.order_number}
        </Text>
        {order.is_urgent && (
          <Flame size={11} color="#D97706" strokeWidth={2.2} />
        )}
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
          style={{ fontSize: 13, fontWeight: '500', color: isLate ? '#DC2626' : '#0A0A0A' }}
          numberOfLines={1}
        >
          {patientName}
        </Text>
      </View>

      {/* Vaka */}
      <Text style={{ flex: 1.8, fontSize: 13, color: '#1A1A1A' }} numberOfLines={1}>
        {order.work_type}
      </Text>

      {/* Hekim */}
      <Text style={{ flex: 1.6, fontSize: 13, color: '#6B6B6B' }} numberOfLines={1}>
        {order.doctor?.full_name ?? '—'}
      </Text>

      {/* Teslim */}
      <Text
        style={{
          flex: 1.2,
          fontSize: 13,
          color: isLate ? '#DC2626' : diff <= 1 && order.status !== 'teslim_edildi' ? '#D97706' : '#1A1A1A',
        }}
      >
        {dText}
      </Text>

      {/* Durum — Patterns Chip */}
      <View style={{ flex: 1.2 }}>
        <View
          className="flex-row items-center gap-1.5 self-start px-3 py-1 rounded-full"
          style={{ backgroundColor: tone.bg }}
        >
          <View className="w-1.5 h-1.5 rounded-full opacity-80" style={{ backgroundColor: tone.fg }} />
          <Text style={{ fontSize: 12, fontWeight: '500', color: tone.fg }}>
            {STAGE_LABEL[stage]}
          </Text>
        </View>
      </View>

      {/* Action */}
      <View style={{ width: 60 }} className="items-end">
        {canAssign ? (
          <Pressable
            onPress={e => { (e as any).stopPropagation?.(); onAssign(); }}
            className="px-3 py-1 rounded-full bg-ink-900"
          >
            <Text className="text-[10px] font-semibold text-white">Ata</Text>
          </Pressable>
        ) : (
          <ChevronRight size={14} color="#CCC" strokeWidth={1.6} />
        )}
      </View>
    </Pressable>
  );
}
