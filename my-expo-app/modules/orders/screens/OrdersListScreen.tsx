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
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useOrders } from '../hooks/useOrders';
import { WorkOrderCard } from '../components/WorkOrderCard';
import { KanbanBoard } from '../components/KanbanBoard';
import { StatusUpdateModal } from '../components/StatusUpdateModal';
import { STATUS_CONFIG } from '../constants';
import { advanceOrderStatus } from '../api';
import { WorkOrder, WorkOrderStatus } from '../types';
import { useAuthStore } from '../../../core/store/authStore';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';
import { useAssignTechnician } from '../../admin/orders/hooks';

const STATUS_FILTERS: { value: WorkOrderStatus | 'all'; label: string }[] = [
  { value: 'all',              label: 'Tümü' },
  { value: 'alindi',           label: 'Alındı' },
  { value: 'uretimde',         label: 'Üretimde' },
  { value: 'kalite_kontrol',   label: 'KK' },
  { value: 'teslimata_hazir',  label: 'Hazır' },
  { value: 'teslim_edildi',    label: 'Teslim' },
];

type ViewMode = 'kanban' | 'list';
type MachineFilter = 'all' | 'milling' | '3d_printing';
type SortBy = 'delivery_date' | 'created_at' | 'order_number' | 'is_urgent';
type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { value: SortBy; label: string; icon: string }[] = [
  { value: 'delivery_date', label: 'Teslimat Tarihi', icon: 'calendar-clock' },
  { value: 'created_at',    label: 'Oluşturma Tarihi', icon: 'calendar-plus' },
  { value: 'order_number',  label: 'Sipariş No',       icon: 'pound' },
  { value: 'is_urgent',     label: 'Aciliyet',         icon: 'lightning-bolt' },
];

export function OrdersListScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const isTechnician = profile?.user_type === 'lab' && (profile as any)?.role === 'technician';
  const isManager = profile?.user_type === 'lab' && (profile as any)?.role === 'manager';
  const { orders, loading, refetch } = useOrders('lab');

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Applied filters
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [machineFilter, setMachineFilter] = useState<MachineFilter>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('delivery_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Draft filters (popup)
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [draftUrgent,  setDraftUrgent]  = useState(false);
  const [draftMachine, setDraftMachine] = useState<MachineFilter>('all');
  const [draftOverdue, setDraftOverdue] = useState(false);
  const [draftSortBy,  setDraftSortBy]  = useState<SortBy>('delivery_date');
  const [draftSortDir, setDraftSortDir] = useState<SortDir>('asc');

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

  const activeFilterCount = [urgentOnly, machineFilter !== 'all', overdueOnly, sortBy !== 'delivery_date' || sortDir !== 'asc'].filter(Boolean).length;

  // Assignment (mesul müdür only)
  const [assignTarget, setAssignTarget] = useState<WorkOrder | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const { technicians, loadingTechs, assigning, loadTechnicians, assign } =
    useAssignTechnician(refetch);

  // Teknisyenler sadece kendilerine atanan iş emirlerini görür
  const visibleOrders = useMemo(() => {
    if (isTechnician && profile?.id) {
      return orders.filter((o) => o.assigned_to === profile.id);
    }
    return orders;
  }, [orders, isTechnician, profile?.id]);

  const today = new Date().toISOString().split('T')[0];

  const filtered = useMemo(() => {
    const list = visibleOrders.filter((o) => {
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const searchLower = search.toLowerCase();
      const matchSearch =
        !search ||
        o.order_number.toLowerCase().includes(searchLower) ||
        (o.doctor?.full_name ?? '').toLowerCase().includes(searchLower) ||
        (o.doctor?.clinic?.name ?? '').toLowerCase().includes(searchLower) ||
        o.work_type.toLowerCase().includes(searchLower);
      const matchUrgent = !urgentOnly || o.is_urgent;
      const matchMachine = machineFilter === 'all' || o.machine_type === machineFilter;
      const matchOverdue = !overdueOnly || (o.delivery_date < today && o.status !== 'teslim_edildi');
      return matchStatus && matchSearch && matchUrgent && matchMachine && matchOverdue;
    });
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'delivery_date') cmp = a.delivery_date.localeCompare(b.delivery_date);
      else if (sortBy === 'created_at') cmp = a.created_at.localeCompare(b.created_at);
      else if (sortBy === 'order_number') cmp = a.order_number.localeCompare(b.order_number);
      else if (sortBy === 'is_urgent') cmp = (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [visibleOrders, statusFilter, search, urgentOnly, machineFilter, overdueOnly, today, sortBy, sortDir]);

  const unassignedAlindi = useMemo(
    () => orders.filter((o) => o.status === 'alindi' && !o.assigned_to),
    [orders]
  );

  const handleStatusAdvance = (order: WorkOrder) => {
    setSelectedOrder(order);
    setModalVisible(true);
  };

  const handleStatusConfirm = async (newStatus: WorkOrderStatus, note: string) => {
    if (!selectedOrder || !profile) return;
    const { error } = await advanceOrderStatus(
      selectedOrder.id, newStatus, profile.id, note || undefined
    );
    if (error) Alert.alert('Hata', (error as any).message);
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
      Alert.alert('Hata', e.message);
    }
  };

  const clearFilters = () => {
    setUrgentOnly(false);
    setMachineFilter('all');
    setOverdueOnly(false);
    setSortBy('delivery_date');
    setSortDir('asc');
  };

  const pendingCount = visibleOrders.filter(o => o.status === 'alindi').length;

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Unassigned Banner (manager only) ── */}
      {isManager && unassignedAlindi.length > 0 && (
        <TouchableOpacity
          style={s.unassignedBanner}
          onPress={() => { setStatusFilter('alindi'); setViewMode('list'); }}
          activeOpacity={0.7}
        >
          <View style={s.bannerLeft}>
            <View style={s.bannerCount}>
              <Text style={s.bannerCountText}>{unassignedAlindi.length}</Text>
            </View>
            <Text style={s.bannerText} numberOfLines={1}>
              iş emri teknisyen bekliyor
            </Text>
          </View>
          <View style={s.bannerArrow}>
            <MaterialCommunityIcons name={'chevron-right' as any} size={16} color="#2563EB" />
          </View>
        </TouchableOpacity>
      )}

      {/* ── Active filter chips ── */}
      {activeFilterCount > 0 && (
        <View style={s.activeFiltersRow}>
          {urgentOnly && (
            <View style={s.activeChip}>
              <MaterialCommunityIcons name={'lightning-bolt' as any} size={12} color="#B45309" />
              <Text style={s.activeChipText}>Acil</Text>
              <TouchableOpacity onPress={() => setUrgentOnly(false)}>
                <MaterialCommunityIcons name={'close' as any} size={12} color="#B45309" />
              </TouchableOpacity>
            </View>
          )}
          {machineFilter !== 'all' && (
            <View style={s.activeChip}>
              <MaterialCommunityIcons
                name={machineFilter === 'milling' ? 'cog-outline' as any : 'printer-3d' as any}
                size={12}
                color="#0F172A"
              />
              <Text style={[s.activeChipText, { color: '#0F172A' }]}>
                {machineFilter === 'milling' ? 'Frezeleme' : '3D Baskı'}
              </Text>
              <TouchableOpacity onPress={() => setMachineFilter('all')}>
                <MaterialCommunityIcons name={'close' as any} size={12} color="#0F172A" />
              </TouchableOpacity>
            </View>
          )}
          {overdueOnly && (
            <View style={[s.activeChip, s.activeChipDanger]}>
              <MaterialCommunityIcons name={'clock-alert-outline' as any} size={12} color="#DC2626" />
              <Text style={[s.activeChipText, { color: '#DC2626' }]}>Geciken</Text>
              <TouchableOpacity onPress={() => setOverdueOnly(false)}>
                <MaterialCommunityIcons name={'close' as any} size={12} color="#DC2626" />
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity onPress={clearFilters} style={s.clearFiltersBtn}>
            <Text style={s.clearFiltersText}>Temizle</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Toolbar: status tabs + fixed right actions ── */}
      <View style={s.toolbarRow}>
        {/* Status tab bar — only in list mode */}
        {viewMode === 'list' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.statusTabsScroll}
            contentContainerStyle={s.statusTabsContent}
          >
            <View style={s.statusTabBar}>
              {STATUS_FILTERS.map((item) => {
                const active = statusFilter === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    onPress={() => setStatusFilter(item.value)}
                    style={[s.statusTab, active && s.statusTabActive]}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.statusTabText, active && s.statusTabTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {/* Fixed right group — never shifts between modes */}
        <View style={s.rightGroup}>
          {/* iOS Segmented Control — view mode */}
          <View style={s.segControl}>
            <TouchableOpacity
              onPress={() => setViewMode('list')}
              style={[s.segBtn, viewMode === 'list' && s.segBtnActive]}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={'format-list-text' as any}
                size={16}
                color={viewMode === 'list' ? '#0F172A' : '#94A3B8'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('kanban')}
              style={[s.segBtn, viewMode === 'kanban' && s.segBtnActive]}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={'view-column' as any}
                size={16}
                color={viewMode === 'kanban' ? '#0F172A' : '#94A3B8'}
              />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <TouchableOpacity
            style={[s.iconBtn, (searchExpanded || search.length > 0) && s.iconBtnActive]}
            onPress={() => setSearchExpanded(!searchExpanded)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons
              name={'magnify' as any}
              size={18}
              color={(searchExpanded || search.length > 0) ? '#0F172A' : '#94A3B8'}
            />
          </TouchableOpacity>

          {/* Filter — hidden in kanban mode */}
          {viewMode !== 'kanban' && (
            <TouchableOpacity
              style={[s.iconBtn, activeFilterCount > 0 && s.iconBtnActive]}
              onPress={openFilterSheet}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={'tune-variant' as any}
                size={18}
                color={activeFilterCount > 0 ? '#0F172A' : '#94A3B8'}
              />
              {activeFilterCount > 0 && (
                <View style={s.filterBadge}>
                  <Text style={s.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {viewMode !== 'kanban' && (searchExpanded || search.length > 0) && (
        <View style={s.searchRow}>
          <View style={[s.searchWrap, searchFocused && s.inputWrapFocused]}>
            <MaterialCommunityIcons
              name={'magnify' as any}
              size={17}
              color={searchFocused ? '#0F172A' : C.textMuted}
            />
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
                <MaterialCommunityIcons name={'close-circle' as any} size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Content ── */}
      {viewMode === 'kanban' ? (
        <KanbanBoard
          orders={visibleOrders}
          userGroup="(lab)"
          onStatusAdvance={handleStatusAdvance}
        />
      ) : (
        <ScrollView
          style={tbl.page}
          contentContainerStyle={tbl.pageContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#AEAEB2" />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0
            ? <EmptyState search={search} hasFilters={activeFilterCount > 0} />
            : (
              <View style={tbl.card}>
                {/* Table header */}
                <View style={tbl.headerRow}>
                  <Text style={[tbl.hCell, { flex: 2.2 }]}>İŞ EMRİ</Text>
                  <Text style={[tbl.hCell, { flex: 1.6 }]}>İLERLEME</Text>
                  <Text style={[tbl.hCell, { flex: 2 }]}>HEKİM / HASTA</Text>
                  <Text style={[tbl.hCell, { flex: 1, textAlign: 'center' }]}>TESLİMAT</Text>
                  <Text style={[tbl.hCell, { flex: 1.2, textAlign: 'right' }]}>DURUM</Text>
                </View>

                {filtered.map((item, idx) => (
                  <OrderTableRow
                    key={item.id}
                    order={item}
                    isLast={idx === filtered.length - 1}
                    onPress={() => router.push(`/(lab)/order/${item.id}`)}
                    onAssign={isManager && item.status === 'alindi' && !item.assigned_to
                      ? () => openAssignModal(item)
                      : undefined}
                  />
                ))}
              </View>
            )
          }
        </ScrollView>
      )}

      {/* ── Status Modal ── */}
      {selectedOrder && (
        <StatusUpdateModal
          visible={modalVisible}
          currentStatus={selectedOrder.status}
          onConfirm={handleStatusConfirm}
          onClose={() => { setModalVisible(false); setSelectedOrder(null); }}
        />
      )}

      {/* ── Filter Popup ── */}
      <Modal
        visible={filterSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterSheetVisible(false)}
      >
        <TouchableOpacity style={fp.backdrop} activeOpacity={1} onPress={() => setFilterSheetVisible(false)}>
          <View style={fp.panel} onStartShouldSetResponder={() => true}>

            {/* Header */}
            <View style={fp.header}>
              <View style={fp.headerLeft}>
                <MaterialCommunityIcons name={'tune-variant' as any} size={16} color="#0F172A" />
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

              {/* Sıralama */}
              <View style={fp.section}>
                <Text style={fp.sectionLabel}>Sıralama</Text>
                <View style={fp.chipRow}>
                  {SORT_OPTIONS.map(opt => {
                    const active = draftSortBy === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[fp.chip, active && fp.chipActive]}
                        onPress={() => setDraftSortBy(opt.value)}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name={opt.icon as any} size={12} color={active ? '#0F172A' : '#94A3B8'} />
                        <Text style={[fp.chipText, active && fp.chipTextActive]}>{opt.label}</Text>
                        {active && (
                          <TouchableOpacity onPress={() => setDraftSortDir(d => d === 'asc' ? 'desc' : 'asc')} style={fp.dirBtn}>
                            <MaterialCommunityIcons
                              name={(draftSortDir === 'asc' ? 'arrow-up' : 'arrow-down') as any}
                              size={12} color="#0F172A"
                            />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={fp.divider} />

              {/* Öncelik */}
              <View style={fp.section}>
                <Text style={fp.sectionLabel}>Öncelik</Text>
                <View style={fp.chipRow}>
                  <TouchableOpacity style={[fp.chip, !draftUrgent && fp.chipActive]} onPress={() => setDraftUrgent(false)} activeOpacity={0.7}>
                    <Text style={[fp.chipText, !draftUrgent && fp.chipTextActive]}>Tümü</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[fp.chip, draftUrgent && fp.chipUrgent]} onPress={() => setDraftUrgent(true)} activeOpacity={0.7}>
                    <MaterialCommunityIcons name={'lightning-bolt' as any} size={12} color={draftUrgent ? '#92400E' : '#94A3B8'} />
                    <Text style={[fp.chipText, draftUrgent && fp.chipTextUrgent]}>Sadece Acil</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={fp.divider} />

              {/* Makine Tipi */}
              <View style={fp.section}>
                <Text style={fp.sectionLabel}>Makine Tipi</Text>
                <View style={fp.chipRow}>
                  {([
                    { value: 'all',         label: 'Tümü',      icon: null },
                    { value: 'milling',     label: 'Frezeleme', icon: 'cog-outline' },
                    { value: '3d_printing', label: '3D Baskı',  icon: 'printer-3d' },
                  ] as const).map(opt => {
                    const active = draftMachine === opt.value;
                    return (
                      <TouchableOpacity key={opt.value} style={[fp.chip, active && fp.chipActive]} onPress={() => setDraftMachine(opt.value)} activeOpacity={0.7}>
                        {opt.icon && <MaterialCommunityIcons name={opt.icon as any} size={12} color={active ? '#0F172A' : '#94A3B8'} />}
                        <Text style={[fp.chipText, active && fp.chipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={fp.divider} />

              {/* Teslimat */}
              <View style={fp.section}>
                <Text style={fp.sectionLabel}>Teslimat</Text>
                <View style={fp.chipRow}>
                  <TouchableOpacity style={[fp.chip, !draftOverdue && fp.chipActive]} onPress={() => setDraftOverdue(false)} activeOpacity={0.7}>
                    <Text style={[fp.chipText, !draftOverdue && fp.chipTextActive]}>Tümü</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[fp.chip, draftOverdue && fp.chipDanger]} onPress={() => setDraftOverdue(true)} activeOpacity={0.7}>
                    <MaterialCommunityIcons name={'clock-alert-outline' as any} size={12} color={draftOverdue ? '#DC2626' : '#94A3B8'} />
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

      {/* ── Assign Modal (manager only) ── */}
      <Modal
        visible={assignModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Teknisyen Seç</Text>
              <TouchableOpacity onPress={() => { setAssignModalVisible(false); setAssignTarget(null); }}>
                <MaterialCommunityIcons name={'close' as any} size={22} color={C.textMuted} />
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
                keyExtractor={(t) => t.id}
                contentContainerStyle={{ paddingBottom: 16 }}
                renderItem={({ item: tech }) => (
                  <TouchableOpacity
                    style={s.techRow}
                    onPress={() => handleAssign(tech.id)}
                    disabled={assigning}
                  >
                    <View style={s.techAvatar}>
                      <Text style={s.techAvatarText}>
                        {tech.full_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.techInfo}>
                      <Text style={s.techName}>{tech.full_name}</Text>
                      {tech.role && <Text style={s.techRole}>{tech.role}</Text>}
                    </View>
                    <MaterialCommunityIcons name={'chevron-right' as any} size={20} color={C.textMuted} />
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

// ─── Progress per status ──────────────────────────────────────────────────────
const STATUS_PROGRESS: Record<string, number> = {
  alindi: 10, uretimde: 40, kalite_kontrol: 70, teslimata_hazir: 90, teslim_edildi: 100,
};

// ─── Circular Progress ────────────────────────────────────────────────────────
function CircularProgress({ progress, size = 46, stroke = 4.5 }: {
  progress: number; size?: number; stroke?: number;
}) {
  const r   = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(progress, 100) / 100);

  const color =
    progress >= 100 ? '#10B981' :
    progress >= 90  ? '#6D28D9' :
    progress >= 70  ? '#7C3AED' :
    progress >= 40  ? '#4F46E5' :
                      '#2563EB';

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' as any }}>
        <Circle cx={size / 2} cy={size / 2} r={r}
          stroke="#F1F5F9" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${circ}`}
          strokeDashoffset={`${offset}`}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2},${size / 2}`}
        />
      </Svg>
      <Text style={{ fontSize: 9, fontWeight: '700', color: '#6C6C70' }}>{progress}%</Text>
    </View>
  );
}

// ─── Order Table Row ──────────────────────────────────────────────────────────
function OrderTableRow({
  order, isLast, onPress, onAssign,
}: {
  order: WorkOrder; isLast: boolean;
  onPress: () => void; onAssign?: () => void;
}) {
  const cfg      = STATUS_CONFIG[order.status];
  const progress = STATUS_PROGRESS[order.status] ?? 0;
  const doctorName = order.doctor?.full_name ?? '';
  const clinicName = order.doctor?.clinic?.name ?? '';

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(order.delivery_date + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const isOverdue = order.status !== 'teslim_edildi' && diff < 0;

  const dateText  = order.status === 'teslim_edildi' ? 'Teslim edildi'
    : diff === 0  ? 'Bugün'
    : diff === 1  ? 'Yarın'
    : diff < 0    ? `${Math.abs(diff)}g gecikti`
    : due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const dateColor = order.status === 'teslim_edildi' ? '#94A3B8'
    : diff < 0    ? '#EF4444'
    : diff <= 1   ? '#F59E0B'
    : '#6C6C70';

  // Initials avatar
  const parts = doctorName.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : doctorName.substring(0, 2).toUpperCase();
  const PALETTE = ['#6C63FF', '#FF6B9D', '#00C9A7', '#F59E0B', '#3B82F6', '#EF4444'];
  let h = 0;
  for (let i = 0; i < doctorName.length; i++) h = (h * 31 + doctorName.charCodeAt(i)) & 0xff;
  const avatarBg = doctorName ? PALETTE[h % PALETTE.length] : '#94A3B8';

  return (
    <TouchableOpacity
      style={[tbl.row, !isLast && tbl.rowBorder, isOverdue && tbl.rowOverdue]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* İş Emri */}
      <View style={{ flex: 2.2, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {order.is_urgent && (
            <MaterialCommunityIcons name={'lightning-bolt' as any} size={12} color="#F59E0B" />
          )}
          <Text style={tbl.orderNo} numberOfLines={1}>{order.order_number}</Text>
        </View>
        <Text style={tbl.workType} numberOfLines={1}>{order.work_type}</Text>
      </View>

      {/* İlerleme */}
      <View style={{ flex: 1.8, alignItems: 'flex-start', paddingLeft: 4 }}>
        <CircularProgress progress={isOverdue && order.status !== 'teslim_edildi'
          ? progress : progress} size={46} stroke={4.5} />
      </View>

      {/* Hekim / Hasta */}
      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[tbl.avatar, { backgroundColor: avatarBg }]}>
          <Text style={tbl.avatarText}>{initials || '?'}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={tbl.doctorName} numberOfLines={1}>{doctorName || '—'}</Text>
          <Text style={tbl.clinicName} numberOfLines={1}>{clinicName || (order.patient_name ?? '—')}</Text>
        </View>
      </View>

      {/* Teslimat */}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={[tbl.dateText, { color: dateColor }]}>{dateText}</Text>
        {onAssign && (
          <TouchableOpacity style={tbl.assignBtn} onPress={(e) => { (e as any).stopPropagation?.(); onAssign(); }} activeOpacity={0.7}>
            <Text style={tbl.assignBtnText}>Ata</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Durum */}
      <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
        <View style={[tbl.statusBadge, { backgroundColor: cfg?.bgColor ?? '#F1F5F9' }]}>
          <Text style={[tbl.statusText, { color: cfg?.color ?? '#6C6C70' }]} numberOfLines={1}>
            {cfg?.label ?? order.status}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState({ search, hasFilters }: { search: string; hasFilters: boolean }) {
  const noResults = search || hasFilters;
  return (
    <View style={s.empty}>
      <View style={s.emptyIconWrap}>
        <MaterialCommunityIcons
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

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
  },
  headerLeft: { flex: 1 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: F.bold,
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: F.regular,
    color: C.textSecondary,
    marginTop: 2,
  },
  subtitleWarn: {
    color: C.warning,
    fontFamily: F.medium,
    fontWeight: '600',
  },

  // ── View mode tabs — expandable pill ──
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 100,
    padding: 3,
    gap: 2,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 100,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 6px rgba(15,23,42,0.12)',
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: F.semibold,
    fontWeight: '600',
    color: '#0F172A',
  },

  // ── Active filter chips row ──
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: '#FFFFFF',
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
  activeChipDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  activeChipText: {
    fontSize: 12,
    fontFamily: F.medium,
    fontWeight: '500',
    color: '#B45309',
  },
  clearFiltersBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearFiltersText: {
    fontSize: 12,
    fontFamily: F.medium,
    color: C.textMuted,
    textDecorationLine: 'underline',
  },

  // ── Toolbar row — fixed height so buttons never shift between modes ──
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: '#FFFFFF',
  },

  // Fixed right actions — always same position
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 12,
    paddingLeft: 4,
  },

  // iOS Segmented Control — view mode toggle
  segControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
    gap: 1,
    marginRight: 4,
  },
  segBtn: {
    width: 32,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(15,23,42,0.14)',
  },

  // Icon buttons (search, filter)
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: '#F1F5F9',
  },

  // ── Search (expandable below toolbar) ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: F.regular,
    color: C.textPrimary,
  },
  inputWrapFocused: {
    // @ts-ignore
    boxShadow: '0 0 0 2px rgba(15,23,42,0.15)',
  },

  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 8,
    fontFamily: F.bold,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Status tab bar — expandable pill ──
  statusTabsScroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  statusTabsContent: {
    paddingLeft: 16,
    paddingRight: 4,
    alignItems: 'center',
  },
  statusTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 100,
    padding: 3,
    gap: 2,
  },
  statusTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
  },
  statusTabActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 6px rgba(15,23,42,0.12)',
  },
  statusTabText: {
    fontSize: 13,
    fontFamily: F.medium,
    fontWeight: '500',
    color: '#94A3B8',
  },
  statusTabTextActive: {
    fontSize: 13,
    fontFamily: F.semibold,
    fontWeight: '600',
    color: '#0F172A',
  },

  // ── Content ──
  listContent: {
    padding: 16,
    paddingTop: 14,
    gap: 10,
  },

  // ── Unassigned banner ──
  unassignedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(37,99,235,0.06)',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  bannerCount: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bannerCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1C1E',
    flex: 1,
  },
  bannerArrow: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Assign button ──
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D97706',
    marginTop: -4,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  assignBtnText: {
    fontSize: 12,
    fontFamily: F.bold,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Empty state ──
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

  // ── Filter sheet ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },

  // ── Assign modal ──
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

// ─── Table Styles ─────────────────────────────────────────────────────────────
const tbl = StyleSheet.create({
  // Page background
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  pageContent: { padding: 16, paddingBottom: 40 },

  // Rounded card wrapping header + rows
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },

  // Header row — sits inside the card, gets top-rounded corners from card
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: '#F9F9FB',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F5',
  },
  hCell: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C7C7CC',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },

  // Data row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    minHeight: 64,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  rowOverdue: {
    backgroundColor: '#FFFCFC',
  },

  // Cells
  orderNo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.1,
  },
  workType: {
    fontSize: 11,
    color: '#AEAEB2',
    fontWeight: '400',
    marginTop: 2,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  doctorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  clinicName: {
    fontSize: 11,
    color: '#AEAEB2',
    marginTop: 2,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  assignBtn: {
    marginTop: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'center',
  },
  assignBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});

// ─── Filter Popup Styles ──────────────────────────────────────────────────────
const fp = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.25)',
    alignItems: 'flex-end',
    paddingTop: 116,
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
