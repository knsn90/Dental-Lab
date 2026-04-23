import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAdminOrders, useAssignTechnician } from '../../../modules/admin/orders/hooks';
import { AdminOrder, Technician } from '../../../modules/admin/orders/service';
import { C as Colors } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';

const C = Colors;

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  alindi:           { label: 'Alındı',          color: '#0F172A', bgColor: '#F1F5F9' },
  uretimde:         { label: 'Üretimde',         color: '#D97706', bgColor: '#FFFBEB' },
  kalite_kontrol:   { label: 'Kalite Kontrol',   color: '#7C3AED', bgColor: '#F5F3FF' },
  teslimata_hazir:  { label: 'Teslimata Hazır',  color: '#059669', bgColor: '#ECFDF5' },
  teslim_edildi:    { label: 'Teslim Edildi',    color: '#374151', bgColor: '#F3F4F6' },
};

const STATUS_FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'alindi', label: 'Alındı' },
  { key: 'uretimde', label: 'Üretimde' },
  { key: 'kalite_kontrol', label: 'KK' },
  { key: 'teslimata_hazir', label: 'Hazır' },
  { key: 'teslim_edildi', label: 'Teslim' },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function isOverdue(delivery_date: string, status: string): boolean {
  if (status === 'teslim_edildi') return false;
  return new Date(delivery_date) < new Date();
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: C.textSecondary, bgColor: C.surfaceAlt };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: cfg.bgColor }}>
      <Text style={{ fontSize: 11, fontWeight: '700', fontFamily: F.bold, color: cfg.color }}>{cfg.label}</Text>
    </View>
  );
}

// ── Teknisyen Atama Modalı ────────────────────────────────────────────────────
function AssignModal({
  order,
  technicians,
  loading,
  assigning,
  onAssign,
  onClose,
}: {
  order: AdminOrder | null;
  technicians: Technician[];
  loading: boolean;
  assigning: boolean;
  onAssign: (techId: string) => void;
  onClose: () => void;
}) {
  if (!order) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={am.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={am.sheet}>
          {/* Header */}
          <View style={am.header}>
            <View style={am.headerLeft}>
              <View style={am.headerIcon}>
                <MaterialCommunityIcons name={'account-hard-hat-outline' as any} size={20} color={C.primary} />
              </View>
              <View>
                <Text style={am.title}>Teknisyen Ata</Text>
                <Text style={am.subtitle}>{order.order_number} · {order.work_type}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={am.closeBtn}>
              <MaterialCommunityIcons name={'close' as any} size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Technician list */}
          {loading ? (
            <View style={am.loadingWrap}>
              <ActivityIndicator color={C.primary} />
              <Text style={am.loadingText}>Teknisyenler yükleniyor...</Text>
            </View>
          ) : technicians.length === 0 ? (
            <View style={am.emptyWrap}>
              <MaterialCommunityIcons name={'account-off-outline' as any} size={32} color={C.textMuted} />
              <Text style={am.emptyText}>Aktif teknisyen bulunamadı</Text>
            </View>
          ) : (
            <ScrollView style={am.list} showsVerticalScrollIndicator={false}>
              {technicians.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[am.techRow, order.assigned_to === t.id && am.techRowActive]}
                  onPress={() => onAssign(t.id)}
                  disabled={assigning}
                  activeOpacity={0.75}
                >
                  <View style={[am.avatar, order.assigned_to === t.id && am.avatarActive]}>
                    <Text style={[am.avatarText, order.assigned_to === t.id && am.avatarTextActive]}>
                      {t.full_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[am.techName, order.assigned_to === t.id && am.techNameActive]}>
                      {t.full_name}
                    </Text>
                    <Text style={am.techRole}>
                      {t.role === 'manager' ? 'Mesul Müdür' : 'Teknisyen'}
                    </Text>
                  </View>
                  {order.assigned_to === t.id && (
                    <MaterialCommunityIcons name={'check-circle' as any} size={20} color={C.primary} />
                  )}
                  {assigning && (
                    <ActivityIndicator size="small" color={C.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Atama Bekleyen Banner ─────────────────────────────────────────────────────
function UnassignedBanner({
  orders,
  onAssignPress,
}: {
  orders: AdminOrder[];
  onAssignPress: (order: AdminOrder) => void;
}) {
  if (orders.length === 0) return null;
  return (
    <View style={ub.card}>
      <View style={ub.titleRow}>
        <View style={ub.titleLeft}>
          <MaterialCommunityIcons name={'account-clock-outline' as any} size={18} color="#D97706" />
          <Text style={ub.title}>Teknisyen Atanmayan İşler</Text>
        </View>
        <View style={ub.badge}>
          <Text style={ub.badgeText}>{orders.length}</Text>
        </View>
      </View>
      {orders.map((o) => (
        <View key={o.id} style={ub.row}>
          <View style={ub.rowLeft}>
            <Text style={ub.orderNum}>{o.order_number}</Text>
            <Text style={ub.doctorName} numberOfLines={1}>{o.doctor_name}</Text>
            <Text style={ub.workType} numberOfLines={1}>{o.work_type}</Text>
          </View>
          <TouchableOpacity
            style={ub.assignBtn}
            onPress={() => onAssignPress(o)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name={'account-plus-outline' as any} size={14} color="#FFFFFF" />
            <Text style={ub.assignBtnText}>Ata</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AdminOrdersScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;
  const router = useRouter();
  const { orders, loading, error, refresh, filter, unassignedAlindi } = useAdminOrders();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Assignment modal state
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

  const handleAssignSuccess = useCallback(() => {
    refresh();
    setSelectedOrder(null);
  }, [refresh]);

  const { technicians, loadingTechs, assigning, loadTechnicians, assign } =
    useAssignTechnician(handleAssignSuccess);

  const openAssignModal = useCallback((order: AdminOrder) => {
    setSelectedOrder(order);
    loadTechnicians();
  }, [loadTechnicians]);

  const handleAssign = useCallback(async (techId: string) => {
    if (!selectedOrder) return;
    try {
      await assign(selectedOrder.id, techId);
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Atama başarısız');
    }
  }, [selectedOrder, assign]);

  const filtered = useMemo(
    () => filter(statusFilter === 'all' ? null : statusFilter, search, overdueOnly),
    [orders, statusFilter, search, overdueOnly, filter]
  );

  const overdueCount = useMemo(
    () => orders.filter((o) => isOverdue(o.delivery_date, o.status)).length,
    [orders]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => { counts[o.status] = (counts[o.status] ?? 0) + 1; });
    return counts;
  }, [orders]);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.pageTitle}>Tüm Siparişler</Text>
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>{orders.length}</Text>
            </View>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={refresh}>
            <MaterialCommunityIcons name={'refresh' as any} size={16} color="#FFFFFF" />
            <Text style={s.refreshBtnText}>Yenile</Text>
          </TouchableOpacity>
        </View>

        {/* Unassigned banner */}
        <UnassignedBanner orders={unassignedAlindi} onAssignPress={openAssignModal} />

        {/* Search */}
        <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
          <MaterialCommunityIcons name={'magnify' as any} size={17} color={searchFocused ? C.primary : C.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Sipariş no, hekim, iş türü..."
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialCommunityIcons name={'close-circle' as any} size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Status filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}>
          <View style={s.chipRow}>
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.key;
              const count = f.key === 'all' ? orders.length : (statusCounts[f.key] ?? 0);
              const cfg = f.key !== 'all' ? STATUS_CONFIG[f.key] : null;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    s.chip,
                    active && s.chipActive,
                    active && cfg && { backgroundColor: cfg.bgColor, borderColor: cfg.color },
                  ]}
                  onPress={() => setStatusFilter(f.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    s.chipText,
                    active && s.chipTextActive,
                    active && cfg && { color: cfg.color },
                  ]}>
                    {f.label}
                  </Text>
                  <View style={[s.chipCount, active && { backgroundColor: cfg?.color ?? C.primary }]}>
                    <Text style={[s.chipCountText, active && { color: '#FFFFFF' }]}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Overdue chip */}
            <TouchableOpacity
              style={[s.chip, overdueOnly && { backgroundColor: C.dangerBg, borderColor: C.danger }]}
              onPress={() => setOverdueOnly((v) => !v)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={'clock-alert-outline' as any}
                size={13}
                color={overdueOnly ? C.danger : C.textMuted}
              />
              <Text style={[s.chipText, overdueOnly && { color: C.danger }]}>Geciken</Text>
              <View style={[s.chipCount, overdueOnly && { backgroundColor: C.danger }]}>
                <Text style={[s.chipCountText, overdueOnly && { color: '#FFFFFF' }]}>{overdueCount}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Text style={s.resultCount}>{filtered.length} sipariş</Text>

        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={s.loadingText}>Yükleniyor...</Text>
          </View>
        )}

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && (
          isDesktop ? (
            <View style={s.tableCard}>
              <View style={s.tableHeader}>
                {['Sipariş No', 'Hekim / Klinik', 'İş Türü', 'Teknisyen', 'Durum', 'Teslim', ''].map((h, i) => (
                  <Text key={i} style={[s.th, i === 6 && { textAlign: 'right' }, { flex: [1.2, 2, 1.5, 1.5, 1, 1, 0.8][i] }]}>{h}</Text>
                ))}
              </View>
              {filtered.length === 0 ? (
                <View style={s.emptyBox}><Text style={s.emptyText}>Sipariş bulunamadı</Text></View>
              ) : filtered.map((order) => {
                const overdue = isOverdue(order.delivery_date, order.status);
                const unassigned = !order.assigned_to && order.status === 'alindi';
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={[s.tableRow, overdue && { backgroundColor: C.dangerBg }]}
                    onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.td, { flex: 1.2, flexDirection: 'row', gap: 6 }]}>
                      <Text style={s.orderNum}>{order.order_number}</Text>
                      {order.is_urgent && <View style={s.urgentPill}><Text style={s.urgentPillText}>ACİL</Text></View>}
                    </View>
                    <View style={[s.td, { flex: 2 }]}>
                      <Text style={s.doctorName} numberOfLines={1}>{order.doctor_name}</Text>
                      <Text style={s.clinicName} numberOfLines={1}>{order.clinic_name}</Text>
                    </View>
                    <Text style={[s.tdText, { flex: 1.5 }]} numberOfLines={1}>{order.work_type}</Text>
                    <View style={[s.td, { flex: 1.5 }]}>
                      {order.assignee_name ? (
                        <View style={s.assigneeChip}>
                          <MaterialCommunityIcons name={'account-outline' as any} size={12} color={C.primary} />
                          <Text style={s.assigneeName} numberOfLines={1}>{order.assignee_name}</Text>
                        </View>
                      ) : unassigned ? (
                        <TouchableOpacity
                          style={s.assignNowBtn}
                          onPress={(e) => { e.stopPropagation?.(); openAssignModal(order); }}
                        >
                          <MaterialCommunityIcons name={'account-plus-outline' as any} size={13} color="#D97706" />
                          <Text style={s.assignNowText}>Ata</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={s.tdMuted}>—</Text>
                      )}
                    </View>
                    <View style={[s.td, { flex: 1 }]}>
                      <StatusBadge status={order.status} />
                    </View>
                    <Text style={[s.tdText, { flex: 1 }, overdue && { color: C.danger, fontWeight: '700' }]}>
                      {formatDate(order.delivery_date)}
                    </Text>
                    <View style={[s.td, { flex: 0.8, alignItems: 'flex-end' }]}>
                      <TouchableOpacity
                        style={s.detailBtn}
                        onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                      >
                        <Text style={s.detailBtnText}>Detay</Text>
                        <MaterialCommunityIcons name={'chevron-right' as any} size={14} color={C.primary} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={s.cardList}>
              {filtered.length === 0 ? (
                <View style={s.emptyBox}><Text style={s.emptyText}>Sipariş bulunamadı</Text></View>
              ) : filtered.map((order) => {
                const overdue = isOverdue(order.delivery_date, order.status);
                const unassigned = !order.assigned_to && order.status === 'alindi';
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={[s.card, overdue && s.cardOverdue]}
                    onPress={() => router.push(`/admin/orders/${order.id}` as any)}
                    activeOpacity={0.75}
                  >
                    <View style={s.cardTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.orderNum}>{order.order_number}</Text>
                        {order.is_urgent && <View style={s.urgentPill}><Text style={s.urgentPillText}>ACİL</Text></View>}
                      </View>
                      <StatusBadge status={order.status} />
                    </View>
                    <Text style={s.doctorName}>{order.doctor_name}</Text>
                    <Text style={s.clinicName}>{order.clinic_name}</Text>
                    <Text style={s.workType}>{order.work_type}</Text>

                    {/* Assignee / assign button */}
                    <View style={s.cardFooter}>
                      {order.assignee_name ? (
                        <View style={s.assigneeChip}>
                          <MaterialCommunityIcons name={'account-outline' as any} size={12} color={C.primary} />
                          <Text style={s.assigneeName}>{order.assignee_name}</Text>
                        </View>
                      ) : unassigned ? (
                        <TouchableOpacity
                          style={s.assignNowBtnCard}
                          onPress={(e) => { e.stopPropagation?.(); openAssignModal(order); }}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons name={'account-plus-outline' as any} size={14} color="#FFFFFF" />
                          <Text style={s.assignNowBtnCardText}>Teknisyen Ata</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={s.tdMuted}>Teknisyen yok</Text>
                      )}
                      <Text style={[s.deliveryDate, overdue && { color: C.danger, fontWeight: '700' }]}>
                        {formatDate(order.delivery_date)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        )}
      </ScrollView>

      {/* Assignment Modal */}
      <AssignModal
        order={selectedOrder}
        technicians={technicians}
        loading={loadingTechs}
        assigning={assigning}
        onAssign={handleAssign}
        onClose={() => setSelectedOrder(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.surface },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageTitle: { fontSize: 22, fontWeight: '800', fontFamily: F.bold, color: C.textPrimary },
  countBadge: { backgroundColor: C.primaryBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countBadgeText: { fontSize: 13, fontWeight: '700', fontFamily: F.bold, color: C.primary },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  refreshBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', fontFamily: F.semibold },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  searchWrapFocused: { borderColor: C.primary },
  searchInput: { flex: 1, fontSize: 14, fontFamily: F.regular, color: C.textPrimary, // @ts-ignore
    outlineStyle: 'none' },
  chipScroll: { marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  chipActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  chipText: { fontSize: 12, fontWeight: '600', fontFamily: F.semibold, color: C.textSecondary },
  chipTextActive: { color: C.primary },
  chipCount: { backgroundColor: C.border, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  chipCountText: { fontSize: 10, fontWeight: '700', fontFamily: F.bold, color: C.textSecondary },
  resultCount: { fontSize: 13, fontFamily: F.regular, color: C.textMuted, marginBottom: 12 },
  loadingBox: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { color: C.textSecondary, fontSize: 14, fontFamily: F.regular },
  errorBox: { backgroundColor: C.dangerBg, borderRadius: 12, padding: 16, marginBottom: 12 },
  errorText: { color: C.danger, fontSize: 14, fontFamily: F.regular },
  // Desktop table
  tableCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)' },
  tableHeader: { flexDirection: 'row', backgroundColor: C.surfaceAlt, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  th: { fontSize: 11, fontWeight: '700', fontFamily: F.bold, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
  td: { justifyContent: 'center' },
  tdText: { fontSize: 13, fontFamily: F.regular, color: C.textPrimary },
  tdMuted: { fontSize: 12, fontFamily: F.regular, color: C.textMuted },
  orderNum: { fontSize: 13, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  urgentPill: { backgroundColor: C.dangerBg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  urgentPillText: { fontSize: 9, fontWeight: '800', fontFamily: F.bold, color: C.danger },
  doctorName: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  clinicName: { fontSize: 11, fontFamily: F.regular, color: C.textSecondary, marginTop: 1 },
  assigneeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primaryBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  assigneeName: { fontSize: 12, fontFamily: F.medium, color: C.primary, flex: 1 },
  assignNowBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFBEB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#FCD34D' },
  assignNowText: { fontSize: 12, fontWeight: '700', fontFamily: F.bold, color: '#D97706' },
  detailBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: C.primaryBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  detailBtnText: { fontSize: 12, fontWeight: '700', fontFamily: F.bold, color: C.primary },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, fontFamily: F.regular, color: C.textMuted },
  // Mobile cards
  cardList: { gap: 10 },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, gap: 5, borderWidth: 1, borderColor: C.border,
    // @ts-ignore
    boxShadow: '0 1px 6px rgba(0,0,0,0.05)' },
  cardOverdue: { borderColor: '#FCA5A5', backgroundColor: C.dangerBg },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  workType: { fontSize: 12, fontFamily: F.regular, color: C.textMuted },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  assignNowBtnCard: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#D97706', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  assignNowBtnCardText: { fontSize: 12, fontWeight: '700', fontFamily: F.bold, color: '#FFFFFF' },
  deliveryDate: { fontSize: 12, fontFamily: F.regular, color: C.textSecondary },
});

// ── Unassigned Banner Styles ──────────────────────────────────────────────────
const ub = StyleSheet.create({
  card: { backgroundColor: '#FFFBEB', borderRadius: 16, borderWidth: 1.5, borderColor: '#FCD34D', padding: 16, marginBottom: 16, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700', fontFamily: F.bold, color: '#92400E' },
  badge: { backgroundColor: '#D97706', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '800', fontFamily: F.bold, color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FDE68A' },
  rowLeft: { flex: 1, gap: 2 },
  orderNum: { fontSize: 12, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  doctorName: { fontSize: 13, fontFamily: F.medium, color: C.textSecondary },
  workType: { fontSize: 12, fontFamily: F.regular, color: C.textMuted },
  assignBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#D97706', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  assignBtnText: { fontSize: 13, fontWeight: '700', fontFamily: F.bold, color: '#FFFFFF' },
});

// ── Assign Modal Styles ───────────────────────────────────────────────────────
const am = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  subtitle: { fontSize: 12, fontFamily: F.regular, color: C.textMuted, marginTop: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  list: { maxHeight: 400 },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  techRowActive: { backgroundColor: C.primaryBg },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  avatarActive: { backgroundColor: C.primary },
  avatarText: { fontSize: 16, fontWeight: '700', fontFamily: F.bold, color: C.textSecondary },
  avatarTextActive: { color: '#FFFFFF' },
  techName: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  techNameActive: { color: C.primary },
  techRole: { fontSize: 12, fontFamily: F.regular, color: C.textMuted, marginTop: 1 },
  loadingWrap: { padding: 32, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontFamily: F.regular, color: C.textSecondary },
  emptyWrap: { padding: 40, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 14, fontFamily: F.regular, color: C.textMuted },
});
