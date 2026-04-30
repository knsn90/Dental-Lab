// modules/orders/screens/OrdersListScreen.tsx
// Apple Reminders tarzı sade liste + opsiyonel Kanban modu.
//
// Tasarım:
//   • Page bg #F2F2F7 (iOS systemGroupedBackground)
//   • Tek beyaz container içinde hairline ile ayrılmış task row'lar
//   • Her row: stage-renkli filled circle + bold title + tek-satır meta + stage badge
//   • Late ise title kırmızı, sol daire kırmızı (subtle, no border/glow)
//   • Bucket chip'leri tek satır + sort menu (▾)
//   • View modes: Liste | Kanban (Üretim/Teslimat/Analitik sidebar'dan)

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Platform, Pressable, Animated, LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SkeletonCardList } from '../../../core/ui/Skeleton';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';
import { AppIcon } from '../../../core/ui/AppIcon';
import { HubContext } from '../../../core/ui/HubContext';

import { useOrders } from '../hooks/useOrders';
import { useAssignTechnician } from '../../admin/orders/hooks';
import { advanceOrderStatus, deleteOrder } from '../api';
import { deleteOrder as adminDeleteOrder } from '../../admin/orders/service';
import { StatusUpdateModal } from '../components/StatusUpdateModal';
import { KanbanBoard } from '../components/KanbanBoard';
import { WorkOrder, WorkOrderStatus } from '../types';
import { mapStationToStage } from '../stationMapping';
import { STAGE_LABEL, STAGE_COLOR, legacyStatusToStage, type Stage } from '../stages';

// ─── iOS palette (Reminders) ─────────────────────────────────────────────────
const iOS = {
  bg:       '#F2F2F7',
  card:     '#FFFFFF',
  hairline: '#E5E5EA',
  text:     '#1C1C1E',
  text2:    '#3C3C43',
  text3:    '#8E8E93',
  text4:    '#C7C7CC',
  blue:     '#007AFF',
  red:      '#FF3B30',
  orange:   '#FF9500',
  green:    '#34C759',
  yellow:   '#FFCC00',
};

// ─── Types ───────────────────────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

function stageOf(o: WorkOrder): Stage {
  const fromStation = (o as any).current_stage_name as string | null | undefined;
  return fromStation
    ? mapStationToStage(fromStation, legacyStatusToStage(o.status))
    : legacyStatusToStage(o.status);
}

// ─── Item Row (Reminders task) ───────────────────────────────────────────────
interface RowProps {
  order:    WorkOrder;
  isLast:   boolean;
  onPress:  () => void;
  onAssign?: () => void;
}

function ItemRow({ order, isLast, onPress, onAssign }: RowProps) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(order.delivery_date + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const isLate    = order.status !== 'teslim_edildi' && diff < 0;
  const isUrgent  = order.is_urgent;
  const stage     = stageOf(order);
  const stageColor= STAGE_COLOR[stage];
  const dotColor  = isLate ? iOS.red : stageColor;

  const doctorName = order.doctor?.full_name ?? '—';
  const patient    = order.patient_name ?? '—';
  const dText      = deliveryText(order.delivery_date, order.status);
  const dColor     = isLate ? iOS.red : (diff <= 1 && order.status !== 'teslim_edildi') ? iOS.orange : iOS.text3;

  // Profit gauge — sadece sale_price + material_cost varsa göster
  const salePrice    = (order as any).sale_price as number | null | undefined;
  const materialCost = (order as any).material_cost as number | null | undefined;
  const hasFinancials = typeof salePrice === 'number' && salePrice > 0;
  const profit       = hasFinancials ? salePrice - (materialCost ?? 0) : null;
  const margin       = hasFinancials && salePrice > 0 ? Math.round((profit! / salePrice) * 100) : null;
  const profitTone   = margin === null ? null
                     : profit! < 0     ? 'red'
                     : margin < 20     ? 'yellow'
                     : 'green';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        r.row,
        !isLast && r.rowDivider,
        pressed && { backgroundColor: '#F8F8FA' },
      ]}
    >
      {/* Indicator */}
      <View style={r.dotWrap}>
        <View style={[r.dot, { backgroundColor: dotColor }]} />
      </View>

      {/* Body */}
      <View style={r.body}>
        <View style={r.titleRow}>
          <Text style={[r.title, isLate && { color: iOS.red }]} numberOfLines={1}>
            {order.work_type}
          </Text>
          {isUrgent && (
            <View style={r.urgentDot}><Text style={r.urgentDotText}>!</Text></View>
          )}
        </View>
        <Text style={r.meta} numberOfLines={1}>
          <Text style={r.metaStrong}>#{order.order_number}</Text>
          {`  ·  ${patient}`}
          {`  ·  ${doctorName}`}
          {`  ·  `}<Text style={{ color: dColor }}>{dText}</Text>
        </Text>
      </View>

      {/* Right cluster: profit gauge + stage badge + (assign button | chevron) */}
      <View style={r.right}>
        {profitTone && margin !== null && (
          <View style={[
            r.profitChip,
            profitTone === 'green'  && { backgroundColor: '#ECFDF5' },
            profitTone === 'yellow' && { backgroundColor: '#FEF3C7' },
            profitTone === 'red'    && { backgroundColor: '#FEE2E2' },
          ]}>
            <Text style={[
              r.profitText,
              profitTone === 'green'  && { color: '#059669' },
              profitTone === 'yellow' && { color: '#B45309' },
              profitTone === 'red'    && { color: '#DC2626' },
            ]}>
              {profit! >= 0 ? '+' : '−'}%{Math.abs(margin)}
            </Text>
          </View>
        )}
        <View style={[r.stagePill, { backgroundColor: stageColor + '14' }]}>
          <Text style={[r.stagePillText, { color: stageColor }]} numberOfLines={1}>
            {STAGE_LABEL[stage]}
          </Text>
        </View>
        {onAssign ? (
          <TouchableOpacity
            onPress={(e) => { (e as any).stopPropagation?.(); onAssign(); }}
            style={r.assignBtn}
          >
            <Text style={r.assignBtnText}>Ata</Text>
          </TouchableOpacity>
        ) : (
          <AppIcon name="chevron-right" size={18} color={iOS.text4} />
        )}
      </View>
    </Pressable>
  );
}

// ─── SlideTabs (animated sliding cursor — Aceternity-style) ──────────────────
interface SlideTabsProps<K extends string> {
  options:  { key: K; label: string; count?: number }[];
  selected: K;
  onChange: (key: K) => void;
}
function SlideTabs<K extends string>({ options, selected, onChange }: SlideTabsProps<K>) {
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({}).current;
  // Active cursor (slides to selected)
  const cursorX = useRef(new Animated.Value(0)).current;
  const cursorW = useRef(new Animated.Value(0)).current;
  // Hover cursor (slides to hovered)
  const hoverX = useRef(new Animated.Value(0)).current;
  const hoverW = useRef(new Animated.Value(0)).current;
  const hoverO = useRef(new Animated.Value(0)).current;   // opacity
  const [ready, setReady] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<K | null>(null);

  function onTabLayout(key: K, e: LayoutChangeEvent) {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts[key] = { x, width };
    if (key === selected) {
      cursorX.setValue(x);
      cursorW.setValue(width);
      setReady(true);
    }
  }

  // Slide active cursor on selection change
  useEffect(() => {
    const layout = tabLayouts[selected];
    if (!layout) return;
    Animated.parallel([
      Animated.timing(cursorX, { toValue: layout.x, duration: 260, useNativeDriver: false }),
      Animated.timing(cursorW, { toValue: layout.width, duration: 260, useNativeDriver: false }),
    ]).start();
  }, [selected]);

  // Slide hover cursor when hover changes
  useEffect(() => {
    if (!hoveredKey) {
      Animated.timing(hoverO, { toValue: 0, duration: 200, useNativeDriver: false }).start();
      return;
    }
    const layout = tabLayouts[hoveredKey];
    if (!layout) return;
    Animated.parallel([
      Animated.timing(hoverX, { toValue: layout.x, duration: 200, useNativeDriver: false }),
      Animated.timing(hoverW, { toValue: layout.width, duration: 200, useNativeDriver: false }),
      Animated.timing(hoverO, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [hoveredKey]);

  return (
    <View style={st.wrap}>
      {/* Hover cursor — soft blue pill (admin accent) */}
      <Animated.View
        pointerEvents="none"
        style={[st.hoverCursor, { left: hoverX, width: hoverW, opacity: hoverO }]}
      />
      {/* Active cursor — solid blue accent pill */}
      <Animated.View
        pointerEvents="none"
        style={[st.cursor, { left: cursorX, width: cursorW, opacity: ready ? 1 : 0 }]}
      />
      {/* Tabs */}
      {options.map(opt => {
        const active = opt.key === selected;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            onLayout={(e) => onTabLayout(opt.key, e)}
            // RN-Web hover events
            // @ts-ignore
            onHoverIn={() => setHoveredKey(opt.key)}
            // @ts-ignore
            onHoverOut={() => setHoveredKey(null)}
            // @ts-ignore (web fallback)
            onMouseEnter={() => setHoveredKey(opt.key)}
            // @ts-ignore
            onMouseLeave={() => setHoveredKey(null)}
            style={st.tab}
          >
            <Text style={[st.tabText, active && st.tabTextActive]}>
              {opt.label}
            </Text>
            {typeof opt.count === 'number' && (
              <Text style={[st.tabCount, active && st.tabCountActive]}>
                {opt.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ search, hasFilters }: { search: string; hasFilters: boolean }) {
  return (
    <View style={empty.wrap}>
      <Text style={empty.title}>
        {search || hasFilters ? 'Eşleşen iş emri yok' : 'Henüz iş emri yok'}
      </Text>
      <Text style={empty.sub}>
        {search || hasFilters
          ? 'Filtreyi temizleyin veya arama terimini değiştirin.'
          : 'Yeni iş emri oluşturulduğunda burada görünür.'}
      </Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export function OrdersListScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const isTechnician = profile?.user_type === 'lab' && (profile as any)?.role === 'technician';
  const isManager    = (profile?.user_type === 'lab' && (profile as any)?.role === 'manager')
                    || profile?.user_type === 'admin';

  const { orders, loading, refetch } = useOrders('lab');

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

  const activeCount = useMemo(
    () => visibleOrders.filter(o => o.status !== 'teslim_edildi').length,
    [visibleOrders]
  );

  // ── Handlers ──
  const onCardPress = (order: WorkOrder) => {
    router.push(`/(lab)/order/${order.id}` as any);
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

  const filterPillsActive = urgentOnly || overdueOnly;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* ── Tek satır: filtre chip'leri + arama + view segment ────────────── */}
      <View style={s.toolbar}>
        {/* SlideTabs — sliding cursor, no border */}
        {viewMode === 'list' ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SlideTabs
              options={STATUS_FILTERS.map(f => ({
                key:   f.value as string,
                label: f.label,
                count: statusCounts[f.value as string] ?? 0,
              }))}
              selected={statusFilter as string}
              onChange={(k) => setStatusFilter(k as any)}
            />
            {/* Quick toggle pills — slide-tabs'ın dışında */}
            <TouchableOpacity
              style={[s.toggle, urgentOnly && { backgroundColor: '#FFF4E6' }]}
              onPress={() => setUrgentOnly(v => !v)}
              activeOpacity={0.75}
            >
              <Text style={[s.toggleText, urgentOnly && { color: iOS.orange, fontWeight: '700' }]}>⚡ Acil</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggle, overdueOnly && { backgroundColor: '#FFE5E5' }]}
              onPress={() => setOverdueOnly(v => !v)}
              activeOpacity={0.75}
            >
              <Text style={[s.toggleText, overdueOnly && { color: iOS.red, fontWeight: '700' }]}>Geciken</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {/* Sağ: arama (expandable inline) + sort + segment */}
        <View style={s.toolbarRight}>
          {searchOpen ? (
            <View style={s.searchPillInline}>
              <AppIcon name="search" size={14} color={iOS.text3} />
              <TextInput
                style={s.searchInputInline as any}
                placeholder="Ara..."
                placeholderTextColor={iOS.text3}
                value={search}
                onChangeText={setSearch}
                autoFocus
                returnKeyType="search"
                onBlur={() => { if (!search) setSearchOpen(false); }}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setSearchOpen(false); }}>
                  <AppIcon name="x" size={13} color={iOS.text3} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={[s.iconBtn, search.length > 0 && s.iconBtnActive]}
              onPress={() => setSearchOpen(true)}
              activeOpacity={0.7}
            >
              <AppIcon name="search" size={16} color={search.length > 0 ? iOS.blue : iOS.text2} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => setSortOpen(true)}
            activeOpacity={0.7}
          >
            <AppIcon name="filter" size={16} color={iOS.text2} />
          </TouchableOpacity>
          {/* Liste/Kanban segment */}
          <View style={s.segment}>
            <TouchableOpacity
              style={[s.segBtn, viewMode === 'list' && s.segBtnActive]}
              onPress={() => setViewMode('list')}
              activeOpacity={0.7}
            >
              <Text style={[s.segText, viewMode === 'list' && s.segTextActive]}>Liste</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.segBtn, viewMode === 'kanban' && s.segBtnActive]}
              onPress={() => setViewMode('kanban')}
              activeOpacity={0.7}
            >
              <Text style={[s.segText, viewMode === 'kanban' && s.segTextActive]}>Kanban</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {viewMode === 'kanban' ? (
        <KanbanBoard orders={visibleOrders} userGroup="(lab)" onStatusAdvance={onStatusAdvance} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.listScroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={iOS.blue} />}
          showsVerticalScrollIndicator={false}
        >
          {loading && filtered.length === 0 ? (
            <SkeletonCardList count={5} />
          ) : filtered.length === 0 ? (
            <EmptyState search={search} hasFilters={filterPillsActive || statusFilter !== 'all'} />
          ) : (
            <View style={s.listCard}>
              {filtered.map((order, i) => {
                const canAssign = isManager && order.status === 'alindi' && !order.assigned_to;
                return (
                  <ItemRow
                    key={order.id}
                    order={order}
                    isLast={i === filtered.length - 1}
                    onPress={() => onCardPress(order)}
                    onAssign={canAssign ? () => onAssignPress(order) : undefined}
                  />
                );
              })}
            </View>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ── Sort sheet ────────────────────────────────────────────────────── */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={sheet.backdrop} onPress={() => setSortOpen(false)}>
          <View style={sheet.panel} onStartShouldSetResponder={() => true}>
            <View style={sheet.handle} />
            <Text style={sheet.title}>Sıralama</Text>
            {SORT_OPTIONS.map((opt, i) => {
              const active = sortBy === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setSortBy(opt.value)}
                  style={[sheet.row, i < SORT_OPTIONS.length - 1 && sheet.rowDivider]}
                  activeOpacity={0.6}
                >
                  <Text style={sheet.rowText}>{opt.label}</Text>
                  {active && <AppIcon name="check" size={18} color={iOS.blue} />}
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 12 }} />
            <Text style={sheet.title}>Yön</Text>
            <View style={sheet.dirRow}>
              <TouchableOpacity
                onPress={() => setSortDir('asc')}
                style={[sheet.dirBtn, sortDir === 'asc' && sheet.dirBtnActive]}
                activeOpacity={0.7}
              >
                <Text style={[sheet.dirText, sortDir === 'asc' && sheet.dirTextActive]}>Artan ↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSortDir('desc')}
                style={[sheet.dirBtn, sortDir === 'desc' && sheet.dirBtnActive]}
                activeOpacity={0.7}
              >
                <Text style={[sheet.dirText, sortDir === 'desc' && sheet.dirTextActive]}>Azalan ↓</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setSortOpen(false)} style={sheet.close}>
              <Text style={sheet.closeText}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Assign modal (light) ─────────────────────────────────────────── */}
      <Modal visible={assignModalVisible} transparent animationType="fade" onRequestClose={() => setAssignModalVisible(false)}>
        <Pressable style={sheet.backdrop} onPress={() => setAssignModalVisible(false)}>
          <View style={sheet.panel} onStartShouldSetResponder={() => true}>
            <View style={sheet.handle} />
            <Text style={sheet.title}>
              {assignTarget ? `#${assignTarget.order_number} → Teknisyen` : 'Atama'}
            </Text>
            {loadingTechs ? (
              <ActivityIndicator color={iOS.blue} style={{ marginVertical: 30 }} />
            ) : technicians.length === 0 ? (
              <Text style={sheet.empty}>Teknisyen bulunamadı</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {technicians.map((t: any, i: number) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => onAssignConfirm(t.id)}
                    disabled={assigning}
                    style={[sheet.row, i < technicians.length - 1 && sheet.rowDivider, assigning && { opacity: 0.5 }]}
                    activeOpacity={0.6}
                  >
                    <Text style={sheet.rowText}>{t.full_name}</Text>
                    {t.role === 'manager' && <Text style={sheet.rowMeta}>Müdür</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity onPress={() => setAssignModalVisible(false)} style={sheet.close}>
              <Text style={sheet.closeText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Status update modal (legacy advance) ──────────────────────────── */}
      {selectedOrder && (
        <StatusUpdateModal
          visible={modalVisible}
          currentStatus={selectedOrder.status}
          onConfirm={onStatusConfirm}
          onClose={() => { setModalVisible(false); setSelectedOrder(null); }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F1F5F9' },   // Cards page bg

  // Tek satır toolbar — filter chips + search + sort + view segment
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
    gap: 10,
  },
  subtitle: { fontSize: 13, color: iOS.text3, fontWeight: '600', flexShrink: 0 },
  toolbarRight: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },

  // Cards-style buton: beyaz + transparent border + soft shadow
  iconBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
    }),
  },
  iconBtnActive: {
    backgroundColor: 'rgba(0,122,255,0.10)',
    borderColor: 'rgba(0,122,255,0.25)',
  },

  // Inline search pill — Cards
  searchPillInline: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingHorizontal: 12, height: 32,
    minWidth: 180,
    ...Platform.select({
      web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
    }),
  },
  searchInputInline: {
    flex: 1, fontSize: 13, color: iOS.text,
    outlineStyle: 'none',
  },

  // Segment — full pill (yarım daire kenarlar)
  segment: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    padding: 3,
    ...Platform.select({
      web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
    }),
  },
  segBtn: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 999,
  },
  segBtnActive: {
    backgroundColor: '#2563EB',                   // admin blue
  },
  segText:        { fontSize: 12, fontWeight: '600', color: iOS.text2 },
  segTextActive:  { color: '#FFFFFF', fontWeight: '700' },

  // Quick toggle pills (border yok, sadece soft fill aktifken)
  toggle: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  toggleText: { fontSize: 12, fontWeight: '600', color: iOS.text2 },
  // List — Cards Design System
  listScroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16 },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    ...Platform.select({
      web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
    }),
  },
});

const r = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: iOS.hairline,
  },
  dotWrap: { paddingVertical: 4, flexShrink: 0 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  body: { flex: 1, gap: 2, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: iOS.text,
    letterSpacing: -0.2,
  },
  urgentDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: iOS.orange,
    alignItems: 'center', justifyContent: 'center',
  },
  urgentDotText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },
  meta: { fontSize: 12, color: iOS.text3, fontWeight: '500' },
  metaStrong: { color: iOS.text2, fontWeight: '700' },

  right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  stagePill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  stagePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  profitChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
    minWidth: 48, alignItems: 'center',
  },
  profitText: { fontSize: 11, fontWeight: '800', letterSpacing: -0.1 },

  assignBtn: {
    paddingHorizontal: 12, height: 28,
    borderRadius: 999,
    backgroundColor: iOS.blue,
    alignItems: 'center', justifyContent: 'center',
  },
  assignBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.1 },
});

const empty = StyleSheet.create({
  wrap: { paddingVertical: 60, alignItems: 'center', gap: 6 },
  title: { fontSize: 17, fontWeight: '700', color: iOS.text, letterSpacing: -0.3 },
  sub:   { fontSize: 14, color: iOS.text3, textAlign: 'center', maxWidth: 280, lineHeight: 19 },
});

const sheet = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.40)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  panel: {
    width: '100%', maxWidth: 460,
    backgroundColor: iOS.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 8, paddingBottom: 24, paddingHorizontal: 16,
    gap: 8,
  },
  handle: {
    width: 36, height: 5, borderRadius: 2.5,
    backgroundColor: iOS.text4, alignSelf: 'center', marginBottom: 8,
  },
  title: { fontSize: 13, fontWeight: '700', color: iOS.text3, letterSpacing: 0.4, textTransform: 'uppercase', paddingHorizontal: 4, marginTop: 4 },
  empty: { fontSize: 14, color: iOS.text3, textAlign: 'center', paddingVertical: 24 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 14,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: iOS.hairline },
  rowText:    { fontSize: 16, fontWeight: '500', color: iOS.text },
  rowMeta:    { fontSize: 12, color: iOS.text3 },

  dirRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  dirBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(118,118,128,0.12)',
    alignItems: 'center',
  },
  dirBtnActive: { backgroundColor: iOS.blue },
  dirText: { fontSize: 14, fontWeight: '600', color: iOS.text2 },
  dirTextActive: { color: '#FFFFFF', fontWeight: '700' },

  close: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginTop: 8,
    backgroundColor: iOS.bg, borderRadius: 14,
  },
  closeText: { fontSize: 16, fontWeight: '700', color: iOS.blue },
});

// ─── SlideTabs styles — shadcn pills, admin blue accent + hover indicator
const ADMIN_BLUE = '#2563EB';
const st = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 999,
    padding: 2,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    zIndex: 1,
    ...Platform.select({ web: { cursor: 'pointer' } as any, default: {} }),
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: iOS.text3,
    letterSpacing: -0.1,
  },
  tabTextActive: {
    color: ADMIN_BLUE,
    fontWeight: '700',
  },
  tabCount: {
    fontSize: 11,
    fontWeight: '700',
    color: iOS.text4,
  },
  tabCountActive: {
    color: ADMIN_BLUE,
  },
  // Active pill — soft blue tint
  cursor: {
    position: 'absolute',
    top: 2, bottom: 2,
    backgroundColor: 'rgba(37,99,235,0.12)',   // admin blue @ 12%
    borderRadius: 999,
    zIndex: 0,
  },
  // Hover pill — even lighter blue, sits below active
  hoverCursor: {
    position: 'absolute',
    top: 2, bottom: 2,
    backgroundColor: 'rgba(37,99,235,0.06)',   // admin blue @ 6%
    borderRadius: 999,
    zIndex: 0,
  },
});

