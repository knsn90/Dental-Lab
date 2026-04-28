import React, { useState, useMemo, useCallback, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../../../core/theme/colors';
import { F, FS } from '../../../core/theme/typography';
import { useIsDesktop } from '../../../core/layout/DesktopShell';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { SkeletonList } from '../../../core/ui/Skeleton';
import { usePayrollList, usePayrollDetail, usePayrollSettings } from '../hooks/usePayroll';
import { useEmployees } from '../../employees/hooks/useEmployees';
import { AppIcon } from '../../../core/ui/AppIcon';

import {
  PAYROLL_STATUS_CFG, PAYROLL_ITEM_TYPE_CFG,
  fmtPeriod, currentPeriod, shiftPeriod,
  type Payroll, type PayrollItemType,
} from '../api';

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtMoney(n: number | null | undefined) {
  return '₺' + Number(n ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}s ${m}dk` : `${h}s`;
}

// ─── PayrollScreen ────────────────────────────────────────────────────────────
export function PayrollScreen({ accentColor = C.primary }: { accentColor?: string }) {
  const { profile } = useAuthStore();
  const isEmbedded = useContext(HubContext);
  const safeEdges  = isEmbedded ? ([] as any) : undefined;
  const isDesktop   = useIsDesktop();
  const canApprove  = profile?.user_type === 'admin' || profile?.role === 'manager';

  const [period, setPeriod]           = useState(currentPeriod);
  const [selectedEmpId, setSelected]  = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);

  const { employees } = useEmployees();
  const { list, loading: listLoading, refetch: refetchList } = usePayrollList(period);

  // Merge: her çalışan için payroll var mı yok mu
  const empRows = useMemo(() => {
    const activeEmps = employees.filter(e => e.is_active);
    return activeEmps.map(emp => {
      const pr = list.find(p => p.employee_id === emp.id);
      return { emp, payroll: pr ?? null };
    });
  }, [employees, list]);

  const selectedRow = empRows.find(r => r.emp.id === selectedEmpId);

  // Period stats
  const stats = useMemo(() => ({
    total:   list.reduce((s, p) => s + Number(p.net_salary), 0),
    paid:    list.filter(p => p.status === 'odendi').length,
    pending: list.filter(p => p.status !== 'odendi').length,
    count:   list.length,
  }), [list]);

  if (isDesktop) {
    return (
      <View style={s.root}>
        {/* LEFT: employee list */}
        <View style={s.leftPanel}>
          <PeriodBar period={period} onShift={n => { setPeriod(p => shiftPeriod(p, n)); setSelected(null); }} accentColor={accentColor} />
          <PeriodStats stats={stats} accentColor={accentColor} />
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {listLoading && empRows.length === 0
              ? <SkeletonList count={6} />
              : empRows.map(({ emp, payroll: pr }) => (
                  <EmpRow
                    key={emp.id}
                    name={emp.full_name}
                    role={emp.role}
                    payroll={pr}
                    selected={selectedEmpId === emp.id}
                    onPress={() => setSelected(emp.id)}
                    accentColor={accentColor}
                  />
                ))
            }
          </ScrollView>
        </View>

        {/* RIGHT: detail */}
        <View style={s.rightPanel}>
          {selectedRow ? (
            <PayrollDetail
              employeeId={selectedRow.emp.id}
              employeeName={selectedRow.emp.full_name}
              employeeRole={selectedRow.emp.role}
              baseSalary={selectedRow.emp.base_salary}
              period={period}
              accentColor={accentColor}
              canApprove={canApprove}
              onRefreshList={refetchList}
              onOpenSettings={() => setSettingsOpen(true)}
              onAddItem={() => setAddItemOpen(true)}
            />
          ) : (
            <EmptyState />
          )}
        </View>

        {/* Modals */}
        {selectedRow && settingsOpen && (
          <SettingsModal
            employeeId={selectedRow.emp.id}
            employeeName={selectedRow.emp.full_name}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {selectedRow && addItemOpen && (
          <AddItemModal
            employeeId={selectedRow.emp.id}
            period={period}
            onClose={() => setAddItemOpen(false)}
            onAdded={refetchList}
          />
        )}
      </View>
    );
  }

  // ── Mobile ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={safeEdges}>
      <View style={s.mobileHeader}>
        <Text style={s.mobileTitle}>Bordro</Text>
      </View>
      <PeriodBar period={period} onShift={n => setPeriod(p => shiftPeriod(p, n))} accentColor={accentColor} />
      <PeriodStats stats={stats} accentColor={accentColor} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {listLoading && empRows.length === 0
          ? <SkeletonList count={5} />
          : empRows.map(({ emp, payroll: pr }) => (
              <MobileEmpCard
                key={emp.id}
                emp={emp}
                payroll={pr}
                period={period}
                accentColor={accentColor}
                canApprove={canApprove}
                onRefreshList={refetchList}
              />
            ))
        }
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Period bar ───────────────────────────────────────────────────────────────
function PeriodBar({ period, onShift, accentColor }: {
  period: string; onShift: (n: number) => void; accentColor: string;
}) {
  return (
    <View style={pb.bar}>
      <TouchableOpacity style={pb.arrow} onPress={() => onShift(-1)}>
        <AppIcon name="chevron-left" size={20} color={C.textSecondary} />
      </TouchableOpacity>
      <Text style={[pb.label, { color: accentColor }]}>{fmtPeriod(period)}</Text>
      <TouchableOpacity style={pb.arrow} onPress={() => onShift(1)}>
        <AppIcon name="chevron-right" size={20} color={C.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}
const pb = StyleSheet.create({
  bar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  arrow: { padding: 6 },
  label: { fontSize: 16, fontWeight: '700', fontFamily: F.bold, minWidth: 120, textAlign: 'center' },
});

// ─── Period stats ─────────────────────────────────────────────────────────────
function PeriodStats({ stats, accentColor }: { stats: { total: number; paid: number; pending: number; count: number }; accentColor: string }) {
  return (
    <View style={ps.row}>
      <StatChip label="Toplam" value={fmtMoney(stats.total)} color={accentColor} />
      <StatChip label="Ödendi"  value={`${stats.paid}/${stats.count}`} color={C.success} />
      <StatChip label="Bekleyen" value={`${stats.pending}`} color={stats.pending > 0 ? C.warning : C.textMuted} />
    </View>
  );
}
function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={ps.chip}>
      <Text style={[ps.val, { color }]}>{value}</Text>
      <Text style={ps.lbl}>{label}</Text>
    </View>
  );
}
const ps = StyleSheet.create({
  row:  { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  chip: { flex: 1, alignItems: 'center', backgroundColor: C.surfaceAlt, borderRadius: 10, paddingVertical: 8 },
  val:  { fontSize: 14, fontWeight: '700', fontFamily: F.bold },
  lbl:  { fontSize: 10, fontFamily: F.medium, color: C.textMuted, marginTop: 2 },
});

// ─── Employee row (desktop left panel) ────────────────────────────────────────
function EmpRow({ name, role, payroll, selected, onPress, accentColor }: {
  name: string; role: string; payroll: Payroll | null;
  selected: boolean; onPress: () => void; accentColor: string;
}) {
  const cfg = payroll ? PAYROLL_STATUS_CFG[payroll.status] : null;
  return (
    <TouchableOpacity
      style={[er.row, selected && { backgroundColor: `${accentColor}10`, borderRightWidth: 3, borderRightColor: accentColor }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[er.avatar, { backgroundColor: `${accentColor}18` }]}>
        <Text style={[er.avatarTxt, { color: accentColor }]}>{name[0]?.toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={er.name} numberOfLines={1}>{name}</Text>
        <Text style={er.role}>{role}</Text>
      </View>
      {cfg ? (
        <View style={[er.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[er.badgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      ) : (
        <View style={[er.badge, { backgroundColor: '#F1F5F9' }]}>
          <Text style={[er.badgeTxt, { color: C.textMuted }]}>—</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
const er = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  avatar:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 15, fontWeight: '700', fontFamily: F.bold },
  name:      { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  role:      { fontSize: 11, fontFamily: F.regular, color: C.textSecondary, marginTop: 1 },
  badge:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTxt:  { fontSize: 10, fontWeight: '600', fontFamily: F.semibold },
});

// ─── PayrollDetail (desktop right panel) ─────────────────────────────────────
function PayrollDetail({
  employeeId, employeeName, employeeRole, baseSalary,
  period, accentColor, canApprove, onRefreshList, onOpenSettings, onAddItem,
}: {
  employeeId: string; employeeName: string; employeeRole: string;
  baseSalary: number; period: string; accentColor: string;
  canApprove: boolean; onRefreshList: () => void;
  onOpenSettings: () => void; onAddItem: () => void;
}) {
  const { profile } = useAuthStore();
  const {
    payroll, items, loading, calcLoading,
    calculate, approve, markPaid, revertDraft, removeItem, refetch,
  } = usePayrollDetail(employeeId, period);

  const cfg = payroll ? PAYROLL_STATUS_CFG[payroll.status] : null;

  const netWithItems = payroll
    ? payroll.net_salary + (items.reduce((s, it) => {
        const sign = PAYROLL_ITEM_TYPE_CFG[it.type].sign;
        return s + sign * Number(it.amount);
      }, 0))
    : 0;

  const handleCalculate = async () => {
    await calculate();
    onRefreshList();
    toast.success('Bordro hesaplandı', 'Devam verilerinden otomatik oluşturuldu');
  };

  const handleApprove = async () => {
    if (!profile?.id) return;
    await approve(profile.id);
    onRefreshList();
    toast.success('Bordro onaylandı');
  };

  const handleMarkPaid = async () => {
    await markPaid();
    onRefreshList();
    toast.success(`${employeeName} bordrosu ödendi olarak işaretlendi`);
  };

  const handleRevert = async () => {
    await revertDraft();
    onRefreshList();
  };

  const handleDeleteItem = async (itemId: string) => {
    Alert.alert('Kalemi Sil', 'Bu kalem silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => { await removeItem(itemId); onRefreshList(); } },
    ]);
  };

  return (
    <ScrollView style={pd.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Header */}
      <View style={pd.header}>
        <View style={{ flex: 1 }}>
          <Text style={pd.empName}>{employeeName}</Text>
          <Text style={pd.empRole}>{employeeRole}</Text>
        </View>
        <TouchableOpacity style={pd.settingsBtn} onPress={onOpenSettings}>
          <AppIcon name="tune-variant" size={18} color={C.textSecondary} />
        </TouchableOpacity>
        {cfg && (
          <View style={[pd.statusChip, { backgroundColor: cfg.bg }]}>
            <AppIcon name={cfg.icon as any} size={13} color={cfg.color} />
            <Text style={[pd.statusTxt, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        )}
      </View>

      {loading || calcLoading ? (
        <View style={pd.loadingBox}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={pd.loadingTxt}>{calcLoading ? 'Hesaplanıyor…' : 'Yükleniyor…'}</Text>
        </View>
      ) : payroll ? (
        <>
          {/* Attendance summary */}
          <View style={pd.section}>
            <Text style={pd.sectionTitle}>Devam Özeti</Text>
            <View style={pd.attGrid}>
              <AttCell label="Çalışılan" value={`${payroll.actual_work_days} gün`} icon="briefcase-check-outline" color={C.success} />
              <AttCell label="Devamsız"  value={`${payroll.absent_days} gün`}      icon="close-circle-outline"    color={payroll.absent_days > 0 ? C.danger : C.textMuted} />
              <AttCell label="İzinli"    value={`${payroll.leave_days} gün`}       icon="calendar-check-outline"  color={C.info} />
              <AttCell label="Geç Giriş" value={`${payroll.late_count} kez`}       icon="clock-alert-outline"     color={payroll.late_count > 0 ? C.warning : C.textMuted} />
              <AttCell label="Mesai"     value={payroll.overtime_minutes > 0 ? fmtHours(payroll.overtime_minutes) : '—'} icon="clock-plus-outline" color={C.primary} />
            </View>
          </View>

          {/* Salary breakdown */}
          <View style={pd.section}>
            <Text style={pd.sectionTitle}>Maaş Hesabı</Text>
            <View style={pd.breakdown}>
              <BreakRow label="Brüt Maaş" value={fmtMoney(payroll.base_salary)} bold />
              {payroll.absence_deduction > 0 && (
                <BreakRow label={`Devamsızlık Kesintisi (${payroll.absent_days} gün)`} value={`-${fmtMoney(payroll.absence_deduction)}`} color={C.danger} />
              )}
              {payroll.late_deduction > 0 && (
                <BreakRow label={`Gecikme Cezası (${payroll.late_count} kez)`} value={`-${fmtMoney(payroll.late_deduction)}`} color={C.danger} />
              )}
              {payroll.sgk_employee > 0 && (
                <BreakRow label="SGK İşçi Payı (%14)" value={`-${fmtMoney(payroll.sgk_employee)}`} color={C.danger} />
              )}
              {payroll.overtime_bonus > 0 && (
                <BreakRow label={`Mesai Ücreti (${fmtHours(payroll.overtime_minutes)})`} value={`+${fmtMoney(payroll.overtime_bonus)}`} color={C.success} />
              )}

              {/* Custom items */}
              {items.map(it => {
                const cfg2 = PAYROLL_ITEM_TYPE_CFG[it.type];
                const sign = cfg2.sign > 0 ? '+' : '-';
                return (
                  <View key={it.id} style={pd.customItemRow}>
                    <View style={[pd.itemTypeBadge, { backgroundColor: `${cfg2.color}15` }]}>
                      <Text style={[pd.itemTypeTxt, { color: cfg2.color }]}>{cfg2.label}</Text>
                    </View>
                    <Text style={pd.itemDesc} numberOfLines={1}>{it.description}</Text>
                    <Text style={[pd.itemAmt, { color: cfg2.color }]}>{sign}{fmtMoney(it.amount)}</Text>
                    {payroll.status === 'taslak' && (
                      <TouchableOpacity onPress={() => handleDeleteItem(it.id)} style={{ padding: 4, marginLeft: 4 }}>
                        <AppIcon name="close" size={14} color={C.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              <View style={pd.divider} />
              <View style={pd.netRow}>
                <Text style={pd.netLabel}>Net Maaş</Text>
                <Text style={[pd.netValue, { color: accentColor }]}>{fmtMoney(netWithItems)}</Text>
              </View>
              {payroll.sgk_employer > 0 && (
                <Text style={pd.sgkEmployer}>İşveren SGK: {fmtMoney(payroll.sgk_employer)} (ayrıca)</Text>
              )}
            </View>
          </View>

          {/* Action buttons */}
          {canApprove && (
            <View style={pd.actionsRow}>
              {payroll.status === 'taslak' && (
                <>
                  <TouchableOpacity style={[pd.btn, pd.btnOutline]} onPress={() => setAddItemOpen?.(true)} activeOpacity={0.8}>
                    <AppIcon name="plus" size={15} color={accentColor} />
                    <Text style={[pd.btnTxt, { color: accentColor }]}>Kalem Ekle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[pd.btn, { backgroundColor: accentColor }]} onPress={handleApprove} activeOpacity={0.85}>
                    <AppIcon name="check" size={15} color="#FFF" />
                    <Text style={[pd.btnTxt, { color: '#FFF' }]}>Onayla</Text>
                  </TouchableOpacity>
                </>
              )}
              {payroll.status === 'onaylandi' && (
                <>
                  <TouchableOpacity style={[pd.btn, pd.btnOutline]} onPress={handleRevert} activeOpacity={0.8}>
                    <Text style={[pd.btnTxt, { color: C.textSecondary }]}>Taslağa Al</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[pd.btn, { backgroundColor: C.success }]} onPress={handleMarkPaid} activeOpacity={0.85}>
                    <AppIcon name="cash-check" size={15} color="#FFF" />
                    <Text style={[pd.btnTxt, { color: '#FFF' }]}>Ödendi</Text>
                  </TouchableOpacity>
                </>
              )}
              {payroll.status === 'odendi' && payroll.paid_at && (
                <View style={pd.paidInfo}>
                  <AppIcon name="check-circle" size={16} color={C.success} />
                  <Text style={pd.paidInfoTxt}>
                    {new Date(payroll.paid_at + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })} tarihinde ödendi
                  </Text>
                </View>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={pd.noPayroll}>
          <AppIcon name="calculator-variant-outline" size={40} color={C.textMuted} />
          <Text style={pd.noPayrollTxt}>Bu dönem için bordro hesaplanmamış</Text>
          <Text style={pd.noPayrollSub}>Devam verilerinden otomatik hesaplamak için butona tıklayın</Text>
          <TouchableOpacity
            style={[pd.calcBtn, { backgroundColor: accentColor }]}
            onPress={handleCalculate}
            disabled={calcLoading}
            activeOpacity={0.85}
          >
            {calcLoading
              ? <ActivityIndicator size="small" color="#FFF" />
              : <>
                  <AppIcon name="calculator-variant-outline" size={17} color="#FFF" />
                  <Text style={pd.calcBtnTxt}>Bordroyu Hesapla</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Re-calculate button (when payroll exists and is draft) */}
      {payroll?.status === 'taslak' && !loading && (
        <TouchableOpacity style={pd.recalcRow} onPress={handleCalculate} disabled={calcLoading}>
          <AppIcon name="refresh" size={14} color={C.textMuted} />
          <Text style={pd.recalcTxt}>Devam verisinden yeniden hesapla</Text>
        </TouchableOpacity>
      )}

      {/* Add item handler hook */}
      {payroll && (
        <AddItemInlineHook payrollId={payroll.id} onRefresh={() => { refetch(); onRefreshList(); }} isOpen={false} />
      )}
    </ScrollView>
  );
}

// Helper to expose addItem to parent — dummy wrapper
function AddItemInlineHook({ payrollId, onRefresh, isOpen }: { payrollId: string; onRefresh: () => void; isOpen: boolean }) {
  return null;
}

function setAddItemOpen(_: boolean) {} // placeholder — actual is passed via props

const pd = StyleSheet.create({
  scroll:  { flex: 1 },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  empName: { fontSize: 17, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  empRole: { fontSize: 12, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },
  settingsBtn: { padding: 8, borderWidth: 1, borderColor: C.borderMid, borderRadius: 8 },
  statusChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusTxt:   { fontSize: 12, fontWeight: '600', fontFamily: F.semibold },

  loadingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingTxt:  { fontSize: 13, fontFamily: F.regular, color: C.textSecondary },

  section:      { paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '600', fontFamily: F.semibold, color: C.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },

  attGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  breakdown: { backgroundColor: '#FAFBFC', borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  customItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border },
  itemTypeBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  itemTypeTxt:   { fontSize: 10, fontWeight: '600', fontFamily: F.semibold },
  itemDesc:      { flex: 1, fontSize: 13, fontFamily: F.regular, color: C.textPrimary },
  itemAmt:       { fontSize: 13, fontWeight: '600', fontFamily: F.semibold },

  divider: { height: 1, backgroundColor: C.borderMid, marginVertical: 2 },
  netRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  netLabel:{ fontSize: 15, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  netValue:{ fontSize: 20, fontWeight: '800', fontFamily: F.bold, letterSpacing: -0.3 },
  sgkEmployer: { fontSize: 11, fontFamily: F.regular, color: C.textMuted, textAlign: 'right', paddingRight: 16, paddingBottom: 10 },

  actionsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  btn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 13 },
  btnOutline: { borderWidth: 1.5, borderColor: C.borderMid },
  btnTxt:     { fontSize: 14, fontWeight: '600', fontFamily: F.semibold },

  paidInfo:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: C.successBg, borderRadius: 10, flex: 1 },
  paidInfoTxt: { fontSize: 13, fontFamily: F.medium, color: C.success },

  noPayroll:    { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 },
  noPayrollTxt: { fontSize: 15, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary, textAlign: 'center' },
  noPayrollSub: { fontSize: 13, fontFamily: F.regular, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  calcBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 13, marginTop: 8 },
  calcBtnTxt: { fontSize: 14, fontWeight: '700', fontFamily: F.bold, color: '#FFF' },

  recalcRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 12, paddingBottom: 4 },
  recalcTxt: { fontSize: 12, fontFamily: F.regular, color: C.textMuted },
});

// ─── Attendance cell ──────────────────────────────────────────────────────────
function AttCell({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <View style={ac.cell}>
      <AppIcon name={icon as any} size={18} color={color} />
      <Text style={[ac.val, { color }]}>{value}</Text>
      <Text style={ac.lbl}>{label}</Text>
    </View>
  );
}
const ac = StyleSheet.create({
  cell: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 4, minWidth: 80 },
  val:  { fontSize: 13, fontWeight: '700', fontFamily: F.bold },
  lbl:  { fontSize: 10, fontFamily: F.medium, color: C.textMuted },
});

// ─── Break row ────────────────────────────────────────────────────────────────
function BreakRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={br.row}>
      <Text style={[br.label, bold && { fontFamily: F.semibold, color: C.textPrimary }]}>{label}</Text>
      <Text style={[br.value, bold && { fontFamily: F.bold, fontSize: 15, color: C.textPrimary }, color && { color }]}>{value}</Text>
    </View>
  );
}
const br = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  label: { fontSize: 13, fontFamily: F.regular, color: C.textSecondary, flex: 1 },
  value: { fontSize: 13, fontFamily: F.semibold, color: C.textPrimary },
});

// ─── Settings modal ───────────────────────────────────────────────────────────
function SettingsModal({ employeeId, employeeName, onClose }: {
  employeeId: string; employeeName: string; onClose: () => void;
}) {
  const { settings, saving, save } = usePayrollSettings(employeeId);
  const [wdm,      setWdm]      = useState(String(settings.working_days_per_month));
  const [latePen,  setLatePen]  = useState(String(settings.late_penalty_per_incident));
  const [otMult,   setOtMult]   = useState(String(settings.overtime_multiplier));
  const [inclSgk,  setInclSgk]  = useState(settings.include_sgk);

  const handleSave = async () => {
    await save({
      working_days_per_month: parseInt(wdm, 10) || 22,
      late_penalty_per_incident: parseFloat(latePen) || 0,
      overtime_multiplier: parseFloat(otMult) || 1.5,
      include_sgk: inclSgk,
    });
    toast.success('Ayarlar kaydedildi');
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={sm.root}>
        <View style={sm.header}>
          <Text style={sm.title}>Bordro Ayarları</Text>
          <Text style={sm.sub}>{employeeName}</Text>
          <TouchableOpacity style={sm.closeBtn} onPress={onClose}>
            <AppIcon name="close" size={20} color={C.textSecondary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
          <SettingRow label="Aylık Çalışma Günü" sub="Aylık kesinti hesabında baz alınır">
            <TextInput style={sm.input} value={wdm} onChangeText={setWdm} keyboardType="number-pad" />
          </SettingRow>
          <SettingRow label="Gecikme Cezası (₺/kez)" sub="Her geç giriş için uygulanacak TL miktarı">
            <TextInput style={sm.input} value={latePen} onChangeText={setLatePen} keyboardType="decimal-pad" />
          </SettingRow>
          <SettingRow label="Mesai Çarpanı" sub="Mesai saati ücretine uygulanır (1.5 = %50 zam)">
            <TextInput style={sm.input} value={otMult} onChangeText={setOtMult} keyboardType="decimal-pad" />
          </SettingRow>
          <SettingRow label="SGK Hesapla" sub="%14 işçi + %20.5 işveren payı ekle">
            <Switch value={inclSgk} onValueChange={setInclSgk} />
          </SettingRow>
        </ScrollView>
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: C.border }}>
          <TouchableOpacity
            style={[sm.saveBtn, { opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={sm.saveTxt}>Kaydet</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={sm.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={sm.settingLabel}>{label}</Text>
        <Text style={sm.settingSub}>{sub}</Text>
      </View>
      {children}
    </View>
  );
}
const sm = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#FAFBFC' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: C.border, paddingTop: 28 },
  title:  { fontSize: 18, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  sub:    { fontSize: 13, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },
  closeBtn: { position: 'absolute', top: 20, right: 20, padding: 8 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  settingLabel: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  settingSub:   { fontSize: 12, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },
  input:   { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: F.regular, color: C.textPrimary, width: 90, textAlign: 'center' },
  saveBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveTxt: { fontSize: 15, fontWeight: '700', fontFamily: F.bold, color: '#FFF' },
});

// ─── Add Item modal ───────────────────────────────────────────────────────────
function AddItemModal({ employeeId, period, onClose, onAdded }: {
  employeeId: string; period: string; onClose: () => void; onAdded: () => void;
}) {
  const { payroll, addItem } = usePayrollDetail(employeeId, period);
  const [type, setType]   = useState<PayrollItemType>('kesinti');
  const [desc, setDesc]   = useState('');
  const [amt,  setAmt]    = useState('');
  const [saving, setSaving] = useState(false);

  const types: PayrollItemType[] = ['kesinti', 'prim', 'avans', 'diger'];

  const handleSave = async () => {
    if (!desc.trim() || !amt || !payroll) return;
    setSaving(true);
    await addItem(type, desc.trim(), parseFloat(amt));
    onAdded();
    setSaving(false);
    onClose();
    toast.success('Kalem eklendi');
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={ai.root}>
        <View style={ai.header}>
          <Text style={ai.title}>Kalem Ekle</Text>
          <TouchableOpacity style={ai.closeBtn} onPress={onClose}>
            <AppIcon name="close" size={20} color={C.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={{ padding: 20, gap: 16 }}>
          <View style={ai.typeRow}>
            {types.map(t => {
              const cfg = PAYROLL_ITEM_TYPE_CFG[t];
              return (
                <TouchableOpacity
                  key={t}
                  style={[ai.typeBtn, type === t && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                  onPress={() => setType(t)}
                >
                  <Text style={[ai.typeTxt, type === t && { color: '#FFF' }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={ai.field}>
            <Text style={ai.fieldLabel}>Açıklama</Text>
            <TextInput
              style={ai.input}
              value={desc}
              onChangeText={setDesc}
              placeholder="örn. Kıdem ikramiyesi"
              placeholderTextColor={C.textMuted}
            />
          </View>
          <View style={ai.field}>
            <Text style={ai.fieldLabel}>Tutar (₺)</Text>
            <TextInput
              style={ai.input}
              value={amt}
              onChangeText={setAmt}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={C.textMuted}
            />
          </View>
          <TouchableOpacity
            style={[ai.saveBtn, { opacity: saving || !desc.trim() || !amt ? 0.5 : 1 }]}
            onPress={handleSave}
            disabled={saving || !desc.trim() || !amt}
          >
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={ai.saveTxt}>Ekle</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const ai = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#FAFBFC' },
  header:  { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 28, borderBottomWidth: 1, borderBottomColor: C.border },
  title:   { flex: 1, fontSize: 18, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  closeBtn:{ padding: 8 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: { flex: 1, borderWidth: 1.5, borderColor: C.borderMid, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  typeTxt: { fontSize: 12, fontWeight: '600', fontFamily: F.semibold, color: C.textSecondary },
  field:   { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  input:   { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: C.borderMid, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, fontFamily: F.regular, color: C.textPrimary },
  saveBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  saveTxt: { fontSize: 15, fontWeight: '700', fontFamily: F.bold, color: '#FFF' },
});

// ─── Mobile employee card ─────────────────────────────────────────────────────
function MobileEmpCard({ emp, payroll, period, accentColor, canApprove, onRefreshList }: {
  emp: any; payroll: Payroll | null; period: string;
  accentColor: string; canApprove: boolean; onRefreshList: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { profile } = useAuthStore();
  const {
    payroll: detail, calcLoading,
    calculate, approve, markPaid,
  } = usePayrollDetail(expanded ? emp.id : null, period);

  const cfg = payroll ? PAYROLL_STATUS_CFG[payroll.status] : null;

  return (
    <View style={mc.card}>
      <TouchableOpacity style={mc.header} onPress={() => setExpanded(v => !v)} activeOpacity={0.75}>
        <View style={[mc.avatar, { backgroundColor: `${accentColor}15` }]}>
          <Text style={[mc.avatarTxt, { color: accentColor }]}>{emp.full_name[0]?.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={mc.name}>{emp.full_name}</Text>
          {payroll
            ? <Text style={mc.net}>{fmtMoney(payroll.net_salary)}</Text>
            : <Text style={mc.noCalc}>Hesaplanmadı</Text>
          }
        </View>
        {cfg && (
          <View style={[mc.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[mc.badgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        )}
        <AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={mc.detail}>
          {!detail ? (
            <TouchableOpacity
              style={[mc.calcBtn, { backgroundColor: accentColor }]}
              onPress={async () => {
                await calculate();
                onRefreshList();
                toast.success('Bordro hesaplandı');
              }}
              disabled={calcLoading}
            >
              {calcLoading
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={mc.calcTxt}>Bordroyu Hesapla</Text>
              }
            </TouchableOpacity>
          ) : (
            <>
              <View style={mc.breakdownRow}>
                <Text style={mc.breakLabel}>Brüt Maaş</Text>
                <Text style={mc.breakVal}>{fmtMoney(detail.base_salary)}</Text>
              </View>
              {detail.total_deductions > 0 && (
                <View style={mc.breakdownRow}>
                  <Text style={mc.breakLabel}>Toplam Kesinti</Text>
                  <Text style={[mc.breakVal, { color: C.danger }]}>-{fmtMoney(detail.total_deductions)}</Text>
                </View>
              )}
              {detail.total_bonuses > 0 && (
                <View style={mc.breakdownRow}>
                  <Text style={mc.breakLabel}>Mesai / Prim</Text>
                  <Text style={[mc.breakVal, { color: C.success }]}>+{fmtMoney(detail.total_bonuses)}</Text>
                </View>
              )}
              <View style={[mc.breakdownRow, mc.netRow]}>
                <Text style={mc.netLabel}>Net Maaş</Text>
                <Text style={[mc.netVal, { color: accentColor }]}>{fmtMoney(detail.net_salary)}</Text>
              </View>
              {canApprove && detail.status === 'taslak' && (
                <TouchableOpacity
                  style={[mc.calcBtn, { backgroundColor: accentColor }]}
                  onPress={async () => {
                    if (!profile?.id) return;
                    await approve(profile.id);
                    onRefreshList();
                    toast.success('Bordro onaylandı');
                  }}
                >
                  <Text style={mc.calcTxt}>Onayla</Text>
                </TouchableOpacity>
              )}
              {canApprove && detail.status === 'onaylandi' && (
                <TouchableOpacity
                  style={[mc.calcBtn, { backgroundColor: C.success }]}
                  onPress={async () => {
                    await markPaid();
                    onRefreshList();
                    toast.success('Ödendi olarak işaretlendi');
                  }}
                >
                  <Text style={mc.calcTxt}>Ödendi Olarak İşaretle</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}
const mc = StyleSheet.create({
  card:   { marginHorizontal: 12, marginBottom: 8, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  avatar: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 15, fontWeight: '700', fontFamily: F.bold },
  name:   { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  net:    { fontSize: 12, fontFamily: F.medium, color: C.textSecondary, marginTop: 1 },
  noCalc: { fontSize: 11, fontFamily: F.regular, color: C.textMuted, marginTop: 1 },
  badge:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 10, fontWeight: '600', fontFamily: F.semibold },
  detail: { borderTopWidth: 1, borderTopColor: C.border, padding: 14, gap: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakLabel: { fontSize: 13, fontFamily: F.regular, color: C.textSecondary },
  breakVal:   { fontSize: 13, fontFamily: F.semibold, color: C.textPrimary },
  netRow:     { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  netLabel:   { fontSize: 14, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  netVal:     { fontSize: 16, fontWeight: '800', fontFamily: F.bold },
  calcBtn:    { borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  calcTxt:    { fontSize: 13, fontWeight: '700', fontFamily: F.bold, color: '#FFF' },
});

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={es.root}>
      <AppIcon name="cash-multiple" size={52} color={C.textMuted} style={{ opacity: 0.4 }} />
      <Text style={es.title}>Çalışan Seçin</Text>
      <Text style={es.sub}>Sol panelden bir çalışan seçerek bordrosunu görüntüleyin veya hesaplayın</Text>
    </View>
  );
}
const es = StyleSheet.create({
  root:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  title: { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  sub:   { fontSize: 13, fontFamily: F.regular, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
});

// ─── Main layout styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, flexDirection: 'row', backgroundColor: '#FAFBFC' },
  leftPanel:  { width: 280, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: '#FFFFFF' },
  rightPanel: { flex: 1 },
  safe:       { flex: 1, backgroundColor: '#FAFBFC' },
  mobileHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  mobileTitle:  { fontSize: 20, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
});
