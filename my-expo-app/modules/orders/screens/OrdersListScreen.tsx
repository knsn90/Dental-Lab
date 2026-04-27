import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SkeletonCardList } from '../../../core/ui/Skeleton';
import { toast } from '../../../core/ui/Toast';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOrders } from '../hooks/useOrders';
import { KanbanBoard } from '../components/KanbanBoard';
import { StatusUpdateModal } from '../components/StatusUpdateModal';
import { STATUS_CONFIG } from '../constants';
import { advanceOrderStatus } from '../api';
import { WorkOrder, WorkOrderStatus } from '../types';
import { useAuthStore } from '../../../core/store/authStore';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';
import { useAssignTechnician } from '../../admin/orders/hooks';
import { AppIcon } from '../../../core/ui/AppIcon';
import { HubContext } from '../../../core/ui/HubContext';
import { ProductionKanbanScreen } from '../../station/screens/ProductionKanbanScreen';
import { DeliveryListScreen }     from '../../delivery/screens/DeliveryListScreen';
import { AnalyticsScreen }        from '../../station/screens/AnalyticsScreen';

// ─── Types & Constants ────────────────────────────────────────────────────────
type ViewMode = 'list' | 'kanban' | 'production' | 'delivery' | 'analytics';
type MachineFilter = 'all' | 'milling' | '3d_printing';
type SortBy = 'delivery_date' | 'created_at' | 'order_number' | 'is_urgent';
type SortDir = 'asc' | 'desc';

const STATUS_FILTERS: { value: WorkOrderStatus | 'all'; label: string }[] = [
  { value: 'all',             label: 'Tümü'      },
  { value: 'alindi',          label: 'Alındı'    },
  { value: 'uretimde',        label: 'Üretimde'  },
  { value: 'kalite_kontrol',  label: 'KK'        },
  { value: 'teslimata_hazir', label: 'Hazır'     },
  { value: 'teslim_edildi',   label: 'Teslim'    },
];

const VIEW_MODES: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'list',       label: 'Liste',    icon: 'list'             },
  { key: 'kanban',     label: 'Kanban',   icon: 'layout-grid'      },
  { key: 'production', label: 'Üretim',   icon: 'layout-dashboard' },
  { key: 'delivery',   label: 'Teslimat', icon: 'truck'            },
  { key: 'analytics',  label: 'Analitik', icon: 'bar-chart-2'      },
];

const SORT_OPTIONS: { value: SortBy; label: string; icon: string }[] = [
  { value: 'delivery_date', label: 'Teslimat Tarihi',  icon: 'calendar-clock' },
  { value: 'created_at',   label: 'Oluşturma Tarihi', icon: 'calendar-plus'  },
  { value: 'order_number', label: 'Sipariş No',        icon: 'pound'          },
  { value: 'is_urgent',    label: 'Aciliyet',          icon: 'lightning-bolt' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────
export function OrdersListScreen() {
  const router     = useRouter();
  const { profile } = useAuthStore();
  const isTechnician = profile?.user_type === 'lab' && (profile as any)?.role === 'technician';
  const isManager    = profile?.user_type === 'lab' && (profile as any)?.role === 'manager';
  const { orders, loading, refetch } = useOrders('lab');

  // ── View & filter state ──
  const [viewMode, setViewMode]         = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all'>('all');
  const [search, setSearch]             = useState('');
  const [searchFocused, setSearchFocused]   = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Applied filters
  const [urgentOnly, setUrgentOnly]       = useState(false);
  const [machineFilter, setMachineFilter] = useState<MachineFilter>('all');
  const [overdueOnly, setOverdueOnly]     = useState(false);
  const [sortBy, setSortBy]               = useState<SortBy>('delivery_date');
  const [sortDir, setSortDir]             = useState<SortDir>('asc');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;

  // Modals
  const [selectedOrder, setSelectedOrder]       = useState<WorkOrder | null>(null);
  const [modalVisible, setModalVisible]         = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  // Draft filters (popup)
  const [draftUrgent,  setDraftUrgent]  = useState(false);
  const [draftMachine, setDraftMachine] = useState<MachineFilter>('all');
  const [draftOverdue, setDraftOverdue] = useState(false);
  const [draftSortBy,  setDraftSortBy]  = useState<SortBy>('delivery_date');
  const [draftSortDir, setDraftSortDir] = useState<SortDir>('asc');

  // Assign modal
  const [assignTarget, setAssignTarget]         = useState<WorkOrder | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const { technicians, loadingTechs, assigning, loadTechnicians, assign } =
    useAssignTechnician(refetch);

  // ── Helpers ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelect = () => setSelectedIds(new Set());

  const openFilterSheet = () => {
    setDraftUrgent(urgentOnly);
    setDraftMachine(machineFilter);
    setDraftOverdue(overdueOnly);
    setDraftSortBy(sortBy);
    setDraftSortDir(sortDir);
    setFilterSheetVisible(true);
  };
  const applyFilters = () => {
    setUrgentOnly(draftUrgent);
    setMachineFilter(draftMachine);
    setOverdueOnly(draftOverdue);
    setSortBy(draftSortBy);
    setSortDir(draftSortDir);
    setFilterSheetVisible(false);
  };
  const clearFilters = () => {
    setUrgentOnly(false);
    setMachineFilter('all');
    setOverdueOnly(false);
    setSortBy('delivery_date');
    setSortDir('asc');
  };

  const activeFilterCount = [
    urgentOnly,
    machineFilter !== 'all',
    overdueOnly,
    sortBy !== 'delivery_date' || sortDir !== 'asc',
  ].filter(Boolean).length;

  // ── Derived data ──
  const visibleOrders = useMemo(() => {
    if (isTechnician && profile?.id) {
      return orders.filter(o => o.assigned_to === profile.id);
    }
    return orders;
  }, [orders, isTechnician, profile?.id]);

  const today = new Date().toISOString().split('T')[0];

  const filtered = useMemo(() => {
    const list = visibleOrders.filter(o => {
      const matchStatus  = statusFilter === 'all' || o.status === statusFilter;
      const sl           = search.toLowerCase();
      const matchSearch  = !search
        || o.order_number.toLowerCase().includes(sl)
        || (o.doctor?.full_name ?? '').toLowerCase().includes(sl)
        || (o.doctor?.clinic?.name ?? '').toLowerCase().includes(sl)
        || o.work_type.toLowerCase().includes(sl);
      const matchUrgent  = !urgentOnly || o.is_urgent;
      const matchMachine = machineFilter === 'all' || o.machine_type === machineFilter;
      const matchOverdue = !overdueOnly || (o.delivery_date < today && o.status !== 'teslim_edildi');
      return matchStatus && matchSearch && matchUrgent && matchMachine && matchOverdue;
    });
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'delivery_date') cmp = a.delivery_date.localeCompare(b.delivery_date);
      else if (sortBy === 'created_at')   cmp = a.created_at.localeCompare(b.created_at);
      else if (sortBy === 'order_number') cmp = a.order_number.localeCompare(b.order_number);
      else if (sortBy === 'is_urgent')    cmp = (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [visibleOrders, statusFilter, search, urgentOnly, machineFilter, overdueOnly, today, sortBy, sortDir]);

  // Count per status (for tab badges)
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: visibleOrders.length };
    for (const o of visibleOrders) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return counts;
  }, [visibleOrders]);

  const selectAll = () => setSelectedIds(new Set(filtered.map(o => o.id)));

  const unassignedAlindi = useMemo(
    () => orders.filter(o => o.status === 'alindi' && !o.assigned_to),
    [orders]
  );

  // ── Event handlers ──
  const handleStatusAdvance = (order: WorkOrder) => {
    setSelectedOrder(order);
    setModalVisible(true);
  };
  const handleStatusConfirm = async (newStatus: WorkOrderStatus, note: string) => {
    if (!selectedOrder || !profile) return;
    const { error } = await advanceOrderStatus(selectedOrder.id, newStatus, profile.id, note || undefined);
    if (error) toast.error((error as any).message);
    else refetch();
    setModalVisible(false);
    setSelectedOrder(null);
  };
  const openAssignModal = (order: WorkOrder) => {
    setAssignTarget(order);
    setAssignModalVisible(true);
    loadTechnicians();
  };
  const handleAssign = async (techId: string) => {
    if (!assignTarget) return;
    try {
      await assign(assignTarget.id, techId);
      setAssignModalVisible(false);
      setAssignTarget(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Render ──
  return (
    <SafeAreaView style={s.safe}>

      {/* ── Screen header ─────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.title}>İş Emirleri</Text>
          {!loading && (
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>{filtered.length}</Text>
            </View>
          )}
        </View>

        {viewMode === 'list' && (
          <View style={s.headerRight}>
            <TouchableOpacity
              style={[s.hBtn, (searchExpanded || search.length > 0) && s.hBtnActive]}
              onPress={() => setSearchExpanded(v => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppIcon
                name={'magnify' as any}
                size={19}
                color={(searchExpanded || search.length > 0) ? '#2563EB' : '#64748B'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.hBtn, activeFilterCount > 0 && s.hBtnActive]}
              onPress={openFilterSheet}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppIcon
                name={'tune-variant' as any}
                size={19}
                color={activeFilterCount > 0 ? '#2563EB' : '#64748B'}
              />
              {activeFilterCount > 0 && (
                <View style={s.hBtnBadge}>
                  <Text style={s.hBtnBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── View mode switcher (labeled pills) ────────────────────────────── */}
      <View style={s.viewModeBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.viewModeContent}
        >
          {VIEW_MODES.map(mode => {
            const active = viewMode === mode.key;
            return (
              <TouchableOpacity
                key={mode.key}
                style={[s.viewModeBtn, active && s.viewModeBtnActive]}
                onPress={() => { clearSelect(); setViewMode(mode.key); }}
                activeOpacity={0.75}
              >
                <AppIcon
                  name={mode.icon as any}
                  size={13}
                  color={active ? '#FFFFFF' : '#64748B'}
                />
                <Text style={[s.viewModeLabel, active && s.viewModeLabelActive]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Status filter tabs with counts (list mode only) ────────────────── */}
      {viewMode === 'list' && (
        <View style={s.statusBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.statusContent}
          >
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.value;
              const cnt    = statusCounts[f.value as string] ?? 0;
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[s.statusTab, active && s.statusTabActive]}
                  onPress={() => setStatusFilter(f.value as any)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.statusTabText, active && s.statusTabTextActive]}>
                    {f.label}
                  </Text>
                  {(f.value === 'all' || cnt > 0) && (
                    <View style={[s.statusTabCount, active && s.statusTabCountActive]}>
                      <Text style={[s.statusTabCountText, active && s.statusTabCountTextActive]}>
                        {cnt}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Expandable search bar (list mode only) ────────────────────────── */}
      {viewMode === 'list' && (searchExpanded || search.length > 0) && (
        <View style={s.searchRow}>
          <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
            <AppIcon name={'magnify' as any} size={16} color={searchFocused ? '#0F172A' : C.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Sipariş no, hekim, hasta, iş türü..."
              placeholderTextColor={C.textMuted}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              autoFocus={searchExpanded && search.length === 0}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); setSearchExpanded(false); }}>
                <AppIcon name={'close-circle' as any} size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Active filter chips ────────────────────────────────────────────── */}
      {activeFilterCount > 0 && viewMode === 'list' && (
        <View style={s.activeFiltersRow}>
          {urgentOnly && (
            <View style={s.activeChip}>
              <AppIcon name={'lightning-bolt' as any} size={11} color="#B45309" />
              <Text style={s.activeChipText}>Acil</Text>
              <TouchableOpacity onPress={() => setUrgentOnly(false)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                <AppIcon name={'close' as any} size={11} color="#B45309" />
              </TouchableOpacity>
            </View>
          )}
          {machineFilter !== 'all' && (
            <View style={[s.activeChip, s.activeChipGray]}>
              <Text style={[s.activeChipText, { color: '#0F172A' }]}>
                {machineFilter === 'milling' ? 'Frezeleme' : '3D Baskı'}
              </Text>
              <TouchableOpacity onPress={() => setMachineFilter('all')} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                <AppIcon name={'close' as any} size={11} color="#0F172A" />
              </TouchableOpacity>
            </View>
          )}
          {overdueOnly && (
            <View style={[s.activeChip, s.activeChipDanger]}>
              <AppIcon name={'clock-alert-outline' as any} size={11} color="#DC2626" />
              <Text style={[s.activeChipText, { color: '#DC2626' }]}>Geciken</Text>
              <TouchableOpacity onPress={() => setOverdueOnly(false)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                <AppIcon name={'close' as any} size={11} color="#DC2626" />
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity onPress={clearFilters} style={s.clearChip}>
            <Text style={s.clearChipText}>Tümünü Sil</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Content area ──────────────────────────────────────────────────── */}
      {viewMode === 'production' ? (
        <HubContext.Provider value={true}>
          <View style={{ flex: 1 }}><ProductionKanbanScreen /></View>
        </HubContext.Provider>
      ) : viewMode === 'delivery' ? (
        <HubContext.Provider value={true}>
          <View style={{ flex: 1 }}><DeliveryListScreen /></View>
        </HubContext.Provider>
      ) : viewMode === 'analytics' ? (
        <HubContext.Provider value={true}>
          <View style={{ flex: 1 }}><AnalyticsScreen /></View>
        </HubContext.Provider>
      ) : viewMode === 'kanban' ? (
        <KanbanBoard
          orders={visibleOrders}
          userGroup="(lab)"
          onStatusAdvance={handleStatusAdvance}
        />
      ) : (
        /* List mode */
        <ScrollView
          style={ls.page}
          contentContainerStyle={ls.pageContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#AEAEB2" />}
          showsVerticalScrollIndicator={false}
        >
          {/* Unassigned banner — inside list, top position */}
          {isManager && unassignedAlindi.length > 0 && (
            <TouchableOpacity
              style={s.unassignedBanner}
              onPress={() => setStatusFilter('alindi')}
              activeOpacity={0.75}
            >
              <View style={s.bannerIconWrap}>
                <AppIcon name={'account-alert-outline' as any} size={18} color="#FFFFFF" />
              </View>
              <View style={s.bannerBody}>
                <Text style={s.bannerTitle}>
                  {unassignedAlindi.length} iş emri atanmayı bekliyor
                </Text>
                <Text style={s.bannerSub}>Teknisyen ataması yapılmamış siparişler</Text>
              </View>
              <AppIcon name={'chevron-right' as any} size={16} color="#93C5FD" />
            </TouchableOpacity>
          )}

          {loading && filtered.length === 0
            ? <SkeletonCardList count={5} />
            : filtered.length === 0
            ? <EmptyState search={search} hasFilters={activeFilterCount > 0} />
            : (
              <View style={ls.list}>
                {filtered.map(item => (
                  <OrderCard
                    key={item.id}
                    order={item}
                    accent="#2563EB"
                    selected={selectedIds.has(item.id)}
                    selectionMode={selectionMode}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onLongPress={() => toggleSelect(item.id)}
                    onPress={selectionMode
                      ? () => toggleSelect(item.id)
                      : () => router.push(`/(lab)/order/${item.id}`)}
                    onAssign={
                      !selectionMode && isManager && item.status === 'alindi' && !item.assigned_to
                        ? () => openAssignModal(item)
                        : undefined
                    }
                  />
                ))}
              </View>
            )
          }
        </ScrollView>
      )}

      {/* ── Bulk Action Bar ────────────────────────────────────────────────── */}
      {selectionMode && (
        <BulkActionBar
          count={selectedIds.size}
          totalCount={filtered.length}
          isManager={isManager}
          onSelectAll={selectAll}
          onClear={clearSelect}
          onAssign={() => {
            const first = filtered.find(o => selectedIds.has(o.id));
            if (first) openAssignModal(first);
          }}
          onAdvanceStatus={() => {
            const first = filtered.find(o => selectedIds.has(o.id));
            if (first) { setSelectedOrder(first); setModalVisible(true); }
          }}
        />
      )}

      {/* ── Status modal ──────────────────────────────────────────────────── */}
      {selectedOrder && (
        <StatusUpdateModal
          visible={modalVisible}
          currentStatus={selectedOrder.status}
          onConfirm={handleStatusConfirm}
          onClose={() => { setModalVisible(false); setSelectedOrder(null); }}
        />
      )}

      {/* ── Filter popup ──────────────────────────────────────────────────── */}
      <Modal visible={filterSheetVisible} transparent animationType="fade" onRequestClose={() => setFilterSheetVisible(false)}>
        <TouchableOpacity style={fp.backdrop} activeOpacity={1} onPress={() => setFilterSheetVisible(false)}>
          <View style={fp.panel} onStartShouldSetResponder={() => true}>

            <View style={fp.header}>
              <View style={fp.headerLeft}>
                <AppIcon name={'tune-variant' as any} size={16} color="#0F172A" />
                <Text style={fp.headerTitle}>Filtrele & Sırala</Text>
                {(draftUrgent || draftMachine !== 'all' || draftOverdue || draftSortBy !== 'delivery_date' || draftSortDir !== 'asc') && (
                  <View style={fp.countBadge}>
                    <Text style={fp.countBadgeText}>
                      {[draftUrgent, draftMachine !== 'all', draftOverdue, draftSortBy !== 'delivery_date' || draftSortDir !== 'asc'].filter(Boolean).length}
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => {
                setDraftUrgent(false); setDraftMachine('all'); setDraftOverdue(false);
                setDraftSortBy('delivery_date'); setDraftSortDir('asc');
              }}>
                <Text style={fp.clearText}>Temizle</Text>
              </TouchableOpacity>
            </View>

            <View style={fp.divider} />

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={fp.section}>
                <Text style={fp.sectionLabel}>Sıralama</Text>
                <View style={fp.chipRow}>
                  {SORT_OPTIONS.map(opt => {
                    const active = draftSortBy === opt.value;
                    return (
                      <TouchableOpacity key={opt.value} style={[fp.chip, active && fp.chipActive]} onPress={() => setDraftSortBy(opt.value)} activeOpacity={0.7}>
                        <AppIcon name={opt.icon as any} size={12} color={active ? '#0F172A' : '#94A3B8'} />
                        <Text style={[fp.chipText, active && fp.chipTextActive]}>{opt.label}</Text>
                        {active && (
                          <TouchableOpacity onPress={() => setDraftSortDir(d => d === 'asc' ? 'desc' : 'asc')} style={fp.dirBtn}>
                            <AppIcon name={(draftSortDir === 'asc' ? 'arrow-up' : 'arrow-down') as any} size={12} color="#0F172A" />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={fp.divider} />

              <View style={fp.section}>
                <Text style={fp.sectionLabel}>Öncelik</Text>
                <View style={fp.chipRow}>
                  <TouchableOpacity style={[fp.chip, !draftUrgent && fp.chipActive]} onPress={() => setDraftUrgent(false)} activeOpacity={0.7}>
                    <Text style={[fp.chipText, !draftUrgent && fp.chipTextActive]}>Tümü</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[fp.chip, draftUrgent && fp.chipUrgent]} onPress={() => setDraftUrgent(true)} activeOpacity={0.7}>
                    <AppIcon name={'lightning-bolt' as any} size={12} color={draftUrgent ? '#92400E' : '#94A3B8'} />
                    <Text style={[fp.chipText, draftUrgent && fp.chipTextUrgent]}>Sadece Acil</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={fp.divider} />

              <View style={fp.section}>
                <Text style={fp.sectionLabel}>Makine Tipi</Text>
                <View style={fp.chipRow}>
                  {([
                    { value: 'all',         label: 'Tümü',      icon: null           },
                    { value: 'milling',     label: 'Frezeleme', icon: 'cog-outline'  },
                    { value: '3d_printing', label: '3D Baskı',  icon: 'printer-3d'   },
                  ] as const).map(opt => {
                    const active = draftMachine === opt.value;
                    return (
                      <TouchableOpacity key={opt.value} style={[fp.chip, active && fp.chipActive]} onPress={() => setDraftMachine(opt.value)} activeOpacity={0.7}>
                        {opt.icon && <AppIcon name={opt.icon as any} size={12} color={active ? '#0F172A' : '#94A3B8'} />}
                        <Text style={[fp.chipText, active && fp.chipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={fp.divider} />

              <View style={fp.section}>
                <Text style={fp.sectionLabel}>Teslimat</Text>
                <View style={fp.chipRow}>
                  <TouchableOpacity style={[fp.chip, !draftOverdue && fp.chipActive]} onPress={() => setDraftOverdue(false)} activeOpacity={0.7}>
                    <Text style={[fp.chipText, !draftOverdue && fp.chipTextActive]}>Tümü</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[fp.chip, draftOverdue && fp.chipDanger]} onPress={() => setDraftOverdue(true)} activeOpacity={0.7}>
                    <AppIcon name={'clock-alert-outline' as any} size={12} color={draftOverdue ? '#DC2626' : '#94A3B8'} />
                    <Text style={[fp.chipText, draftOverdue && fp.chipTextDanger]}>Sadece Geciken</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={fp.divider} />
            <View style={fp.footer}>
              <TouchableOpacity style={fp.cancelBtn} onPress={() => setFilterSheetVisible(false)} activeOpacity={0.7}>
                <Text style={fp.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={fp.applyBtn} onPress={applyFilters} activeOpacity={0.7}>
                <Text style={fp.applyText}>Uygula</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Assign modal ──────────────────────────────────────────────────── */}
      <Modal visible={assignModalVisible} transparent animationType="slide" onRequestClose={() => setAssignModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Teknisyen Seç</Text>
              <TouchableOpacity onPress={() => { setAssignModalVisible(false); setAssignTarget(null); }}>
                <AppIcon name={'close' as any} size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {assignTarget && (
              <Text style={s.modalSubtitle}>
                #{assignTarget.order_number} · {assignTarget.work_type}
              </Text>
            )}
            {loadingTechs ? (
              <ActivityIndicator style={{ padding: 32 }} color={C.primary} />
            ) : technicians.length === 0 ? (
              <Text style={s.noTechs}>Aktif teknisyen bulunamadı</Text>
            ) : (
              <FlatList
                data={technicians}
                keyExtractor={t => t.id}
                contentContainerStyle={{ paddingBottom: 16 }}
                renderItem={({ item: tech }) => (
                  <TouchableOpacity style={s.techRow} onPress={() => handleAssign(tech.id)} disabled={assigning}>
                    <View style={s.techAvatar}>
                      <Text style={s.techAvatarText}>{tech.full_name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={s.techInfo}>
                      <Text style={s.techName}>{tech.full_name}</Text>
                      {tech.role && <Text style={s.techRole}>{tech.role}</Text>}
                    </View>
                    <AppIcon name={'chevron-right' as any} size={20} color={C.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Status border color ──────────────────────────────────────────────────────
function getStatusBorderColor(status: WorkOrderStatus, isOverdue: boolean, accent: string): string {
  if (isOverdue) return '#EF4444';
  switch (status) {
    case 'alindi':          return '#94A3B8';
    case 'uretimde':        return accent;
    case 'kalite_kontrol':  return '#7C3AED';
    case 'teslimata_hazir': return '#059669';
    case 'teslim_edildi':   return '#10B981';
    default:                return '#E2E8F0';
  }
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({
  order, onPress, onLongPress, onAssign, accent, selected, selectionMode, onToggleSelect,
}: {
  order: WorkOrder;
  onPress: () => void;
  onLongPress?: () => void;
  onAssign?: () => void;
  accent: string;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: () => void;
}) {
  const cfg        = STATUS_CONFIG[order.status];
  const doctorName = order.doctor?.full_name ?? '';
  const clinicName = order.doctor?.clinic?.name ?? '';

  const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  const due       = new Date(order.delivery_date + 'T00:00:00');
  const diff      = Math.ceil((due.getTime() - todayDate.getTime()) / 86_400_000);
  const isOverdue = order.status !== 'teslim_edildi' && diff < 0;
  const isToday   = diff === 0 && order.status !== 'teslim_edildi';
  const isTomorrow= diff === 1 && order.status !== 'teslim_edildi';

  const dateText = order.status === 'teslim_edildi' ? 'Teslim edildi'
    : diff === 0  ? 'Bugün'
    : diff === 1  ? 'Yarın'
    : diff < 0    ? `${Math.abs(diff)}g gecikti`
    : due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

  const dateBg    = order.status === 'teslim_edildi' ? 'transparent'
    : isOverdue             ? '#FEF2F2'
    : isToday || isTomorrow ? '#FFFBEB'
    : 'transparent';
  const dateColor = order.status === 'teslim_edildi' ? '#94A3B8'
    : isOverdue             ? '#EF4444'
    : isToday || isTomorrow ? '#D97706'
    : '#64748B';

  const borderColor = selected  ? '#2563EB'
    : getStatusBorderColor(order.status, isOverdue, accent);

  return (
    <TouchableOpacity
      style={[
        oc.wrap,
        { borderLeftColor: borderColor },
        selected   && oc.wrapSelected,
        isOverdue  && !selected && oc.wrapOverdue,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.85}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <TouchableOpacity
          style={oc.checkbox}
          onPress={onToggleSelect}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={[oc.checkboxInner, selected && oc.checkboxSelected]}>
            {selected && <AppIcon name="check" size={12} color="#FFFFFF" strokeWidth={3} />}
          </View>
        </TouchableOpacity>
      )}

      {/* Main body */}
      <View style={oc.body}>

        {/* Urgent tag (if needed) */}
        {order.is_urgent && (
          <View style={oc.urgentTag}>
            <AppIcon name={'lightning-bolt' as any} size={10} color="#D97706" />
            <Text style={oc.urgentText}>ACİL</Text>
          </View>
        )}

        {/* Title row: work type + status pill */}
        <View style={oc.titleRow}>
          <Text style={oc.workType} numberOfLines={2}>{order.work_type}</Text>
          {cfg && (
            <View style={[oc.statusPill, { backgroundColor: cfg.bgColor }]}>
              <View style={[oc.statusDot, { backgroundColor: cfg.color }]} />
              <Text style={[oc.statusText, { color: cfg.color }]} numberOfLines={1}>
                {cfg.label}
              </Text>
            </View>
          )}
        </View>

        {/* Doctor + clinic */}
        {(doctorName || clinicName) && (
          <View style={oc.clinicRow}>
            <AppIcon name={'domain' as any} size={13} color="#94A3B8" />
            <Text style={oc.clinicText} numberOfLines={1}>
              {[doctorName, clinicName].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}
      </View>

      {/* Footer strip */}
      <View style={oc.footer}>
        <Text style={oc.orderNo}>#{order.order_number}</Text>
        <View style={oc.footerRight}>
          <View style={[oc.datePill, { backgroundColor: dateBg }]}>
            {isOverdue
              ? <AppIcon name={'alert-circle-outline' as any} size={12} color={dateColor} />
              : <AppIcon name={'clock-outline' as any} size={12} color={dateColor} />
            }
            <Text style={[oc.dateText, { color: dateColor }]}>{dateText}</Text>
          </View>

          {onAssign ? (
            <TouchableOpacity
              style={oc.assignBtn}
              onPress={e => { (e as any).stopPropagation?.(); onAssign(); }}
              activeOpacity={0.8}
            >
              <AppIcon name={'account-plus-outline' as any} size={12} color="#FFFFFF" />
              <Text style={oc.assignBtnText}>Teknisyen Ata</Text>
            </TouchableOpacity>
          ) : (
            <View style={oc.navArrow}>
              <AppIcon name={'chevron-right' as any} size={15} color="#CBD5E1" />
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────
function BulkActionBar({
  count, totalCount, isManager,
  onSelectAll, onClear, onAssign, onAdvanceStatus,
}: {
  count: number;
  totalCount: number;
  isManager: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onAssign: () => void;
  onAdvanceStatus: () => void;
}) {
  return (
    <View style={bulk.bar}>
      <View style={bulk.left}>
        <View style={bulk.countBadge}>
          <Text style={bulk.countText}>{count}</Text>
        </View>
        <Text style={bulk.countLabel}>sipariş seçildi</Text>
        {count < totalCount && (
          <TouchableOpacity onPress={onSelectAll} style={bulk.textBtn}>
            <Text style={bulk.textBtnText}>Tümünü Seç</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={bulk.right}>
        {isManager && (
          <TouchableOpacity style={[bulk.actionBtn, bulk.actionBtnPrimary]} onPress={onAssign} activeOpacity={0.82}>
            <AppIcon name="user-plus" size={14} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={bulk.actionBtnPrimaryText}>Teknisyen Ata</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={bulk.actionBtn} onPress={onAdvanceStatus} activeOpacity={0.82}>
          <AppIcon name="arrow-right" size={14} color="#0F172A" strokeWidth={2.5} />
          <Text style={bulk.actionBtnText}>Durumu İlerlet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={bulk.closeBtn} onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <AppIcon name="x" size={16} color="#64748B" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ search, hasFilters }: { search: string; hasFilters: boolean }) {
  const noResults = search || hasFilters;
  return (
    <View style={s.empty}>
      <View style={s.emptyIconWrap}>
        <AppIcon
          name={noResults ? 'magnify-close' as any : 'clipboard-text-off-outline' as any}
          size={36}
          color={C.textMuted}
        />
      </View>
      <Text style={s.emptyTitle}>
        {noResults ? 'Sonuç bulunamadı' : 'Henüz iş emri yok'}
      </Text>
      <Text style={s.emptySub}>
        {noResults
          ? 'Arama veya filtre kriterlerini değiştirmeyi deneyin.'
          : 'Yeni bir iş emri oluşturulduğunda burada görünecek.'}
      </Text>
    </View>
  );
}

// ─── Screen Styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: F.bold,
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  countBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 30,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    fontFamily: F.bold,
  },
  hBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  hBtnActive: {
    backgroundColor: '#EFF6FF',
  },
  hBtnBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hBtnBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // View mode switcher
  viewModeBar: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  viewModeContent: {
    paddingHorizontal: 16,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  viewModeBtnActive: {
    backgroundColor: '#2563EB',
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(37,99,235,0.28)',
  },
  viewModeLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: F.semibold,
    color: '#64748B',
  },
  viewModeLabelActive: {
    color: '#FFFFFF',
  },

  // Status filter bar
  statusBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  statusContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#E8EEF4',
    backgroundColor: '#FFFFFF',
  },
  statusTabActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  statusTabText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: F.medium,
    color: '#64748B',
  },
  statusTabTextActive: {
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#2563EB',
  },
  statusTabCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  statusTabCountActive: {
    backgroundColor: '#2563EB',
  },
  statusTabCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  statusTabCountTextActive: {
    color: '#FFFFFF',
  },

  // Search
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E8EEF4',
  },
  searchWrapFocused: {
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: F.regular,
    color: C.textPrimary,
  },

  // Active filter chips
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeChipGray: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  activeChipDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  activeChipText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: F.medium,
    color: '#B45309',
  },
  clearChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearChipText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: F.medium,
    color: C.textMuted,
    textDecorationLine: 'underline',
  },

  // Unassigned banner
  unassignedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  bannerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bannerBody: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#1E40AF',
  },
  bannerSub: {
    fontSize: 12,
    fontFamily: F.regular,
    color: '#3B82F6',
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    // @ts-ignore
    boxShadow: '0 2px 8px rgba(15,23,42,0.07)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    fontFamily: F.regular,
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },

  // Assign modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: F.regular,
    color: C.textSecondary,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  noTechs: {
    fontSize: 14,
    fontFamily: F.regular,
    color: C.textMuted,
    textAlign: 'center',
    padding: 32,
  },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  techAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  techAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.primary,
  },
  techInfo: { flex: 1 },
  techName: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: F.semibold,
    color: C.textPrimary,
  },
  techRole: {
    fontSize: 12,
    fontFamily: F.regular,
    color: C.textSecondary,
    marginTop: 2,
  },
});

// ─── List layout ──────────────────────────────────────────────────────────────
const ls = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F9FB',
  },
  pageContent: {
    padding: 16,
    paddingBottom: 48,
  },
  list: {
    gap: 10,
  },
});

// ─── Order Card Styles ────────────────────────────────────────────────────────
const oc = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEF2F6',
    borderLeftWidth: 4,
    borderLeftColor: '#E2E8F0',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
  },
  wrapSelected: {
    borderColor: '#BFDBFE',
    borderLeftColor: '#2563EB',
    backgroundColor: '#F8FAFF',
  },
  wrapOverdue: {
    borderColor: '#FECACA',
    borderLeftColor: '#EF4444',
    backgroundColor: '#FFFAFA',
  },

  checkbox: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
  },
  checkboxInner: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },

  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 13,
    gap: 8,
  },

  urgentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  urgentText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  workType: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#0F172A',
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clinicText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: F.medium,
    color: '#64748B',
    flex: 1,
  },

  // Footer strip (tinted background)
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  orderNo: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.4,
    fontFamily: F.regular,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '700',
  },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  assignBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  navArrow: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Bulk Action Bar Styles ───────────────────────────────────────────────────
const bulk = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    // @ts-ignore
    boxShadow: '0 -4px 20px rgba(15,23,42,0.10)',
    gap: 10,
    flexWrap: 'wrap',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  countBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  countLabel: { fontSize: 13, fontWeight: '500', color: '#0F172A' },
  textBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  textBtnText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionBtnPrimary: { backgroundColor: '#2563EB' },
  actionBtnText:    { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  actionBtnPrimaryText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Filter Popup Styles ──────────────────────────────────────────────────────
const fp = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.25)',
    alignItems: 'flex-end',
    paddingTop: 110,
    paddingRight: 16,
  },
  panel: {
    width: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  countBadge: {
    backgroundColor: '#0F172A', borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  countBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  clearText: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  divider: { height: 1, backgroundColor: '#F1F5F9' },
  section: { paddingHorizontal: 16, paddingVertical: 14 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#94A3B8',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#F1F5F9', backgroundColor: '#FAFAFA',
  },
  chipActive:  { borderColor: '#0F172A', backgroundColor: '#F1F5F9' },
  chipUrgent:  { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  chipDanger:  { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  chipText:    { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  chipTextActive: { color: '#0F172A', fontWeight: '600' },
  chipTextUrgent: { color: '#92400E', fontWeight: '600' },
  chipTextDanger: { color: '#DC2626', fontWeight: '600' },
  dirBtn: {
    width: 18, height: 18, borderRadius: 4,
    backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginLeft: 2,
  },
  footer: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#6C6C70' },
  applyBtn: {
    flex: 2, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  applyText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
