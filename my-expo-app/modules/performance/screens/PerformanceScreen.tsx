import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Switch, Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';
import { useIsDesktop } from '../../../core/layout/DesktopShell';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { useEmployees } from '../../employees/hooks/useEmployees';
import {
  fetchPerformanceList, fetchPerformance, calculatePerformance,
  calculateBonuses, fetchBonuses, lockPerformance, fetchRules,
  saveRule, toggleRule, deleteRule,
  METRIC_LABELS, THRESHOLD_TYPE_LABELS, BONUS_TYPE_LABELS,
  getScoreLevel, fmtPeriod, currentPeriod, shiftPeriod,
  type EmployeePerformance, type PerformanceBonus, type PerformanceRule,
  type PerfMetric, type ThresholdType, type BonusType,
} from '../api';

const fmtMoney = (n: number) =>
  '₺' + Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function PerformanceScreen({ accentColor = C.primary }: { accentColor?: string }) {
  const { profile } = useAuthStore();
  const isDesktop   = useIsDesktop();
  const canManage   = profile?.user_type === 'admin' || profile?.role === 'manager';

  const [period, setPeriod]         = useState(currentPeriod);
  const [selectedEmpId, setSelected] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen]   = useState(false);
  const [list, setList]             = useState<EmployeePerformance[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const { employees } = useEmployees();

  const loadList = useCallback(async () => {
    setListLoading(true);
    const { data } = await fetchPerformanceList(period);
    setList((data as EmployeePerformance[]) ?? []);
    setListLoading(false);
  }, [period]);

  useEffect(() => { loadList(); }, [loadList]);

  const empRows = useMemo(() => {
    const active = employees.filter(e => e.is_active);
    return active.map(emp => ({
      emp,
      perf: list.find(p => p.employee_id === emp.id) ?? null,
    }));
  }, [employees, list]);

  const selectedRow = empRows.find(r => r.emp.id === selectedEmpId);

  // Period-level stats
  const avgScore = list.length > 0
    ? Math.round(list.reduce((s, p) => s + p.score, 0) / list.length) : 0;
  const totalBonus = list.reduce((s, p) => s + Number(p.total_bonus ?? 0), 0);

  return (
    <View style={s.root}>
      {/* LEFT: employee list */}
      <View style={s.left}>
        {/* Period selector */}
        <View style={s.periodBar}>
          <TouchableOpacity onPress={() => { setPeriod(p => shiftPeriod(p, -1)); setSelected(null); }} style={s.arrow}>
            <Feather name="chevron-left" size={20} color={C.textSecondary} />
          </TouchableOpacity>
          <Text style={[s.periodLabel, { color: accentColor }]}>{fmtPeriod(period)}</Text>
          <TouchableOpacity onPress={() => { setPeriod(p => shiftPeriod(p, 1)); setSelected(null); }} style={s.arrow}>
            <Feather name="chevron-right" size={20} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Period summary */}
        <View style={s.summaryRow}>
          <SummaryChip label="Ort. Skor" value={`${avgScore}`} color={getScoreLevel(avgScore).color} />
          <SummaryChip label="Top. Prim" value={fmtMoney(totalBonus)} color={C.success} />
          <SummaryChip label="Çalışan" value={`${list.length}`} color={accentColor} />
        </View>

        {/* Rules button */}
        {canManage && (
          <TouchableOpacity style={[s.rulesBtn, { borderColor: accentColor }]} onPress={() => setRulesOpen(true)}>
            <Feather name="sliders" size={14} color={accentColor} />
            <Text style={[s.rulesBtnTxt, { color: accentColor }]}>Prim Kuralları</Text>
          </TouchableOpacity>
        )}

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {listLoading && empRows.filter(r => r.perf).length === 0
            ? <View style={s.loadingBox}><ActivityIndicator color={accentColor} /></View>
            : empRows.map(({ emp, perf }) => (
                <EmpRow
                  key={emp.id}
                  name={emp.full_name}
                  role={emp.role}
                  perf={perf}
                  selected={selectedEmpId === emp.id}
                  onPress={() => setSelected(emp.id)}
                  accentColor={accentColor}
                />
              ))
          }
        </ScrollView>
      </View>

      {/* RIGHT: detail */}
      <View style={s.right}>
        {selectedRow ? (
          <DetailPanel
            employeeId={selectedRow.emp.id}
            employeeName={selectedRow.emp.full_name}
            employeeRole={selectedRow.emp.role}
            period={period}
            accentColor={accentColor}
            canManage={canManage}
            onRefresh={loadList}
          />
        ) : (
          <EmptyState accentColor={accentColor} />
        )}
      </View>

      {/* Rules modal */}
      {rulesOpen && (
        <RulesModal accentColor={accentColor} onClose={() => setRulesOpen(false)} />
      )}
    </View>
  );
}

// ─── Summary chip ─────────────────────────────────────────────────────────────
function SummaryChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={sc.chip}>
      <Text style={[sc.val, { color }]}>{value}</Text>
      <Text style={sc.lbl}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  chip: { flex: 1, alignItems: 'center', backgroundColor: C.surfaceAlt, borderRadius: 10, paddingVertical: 8 },
  val:  { fontSize: 14, fontWeight: '700', fontFamily: F.bold },
  lbl:  { fontSize: 10, fontFamily: F.medium, color: C.textMuted, marginTop: 2 },
});

// ─── Employee row ─────────────────────────────────────────────────────────────
function EmpRow({ name, role, perf, selected, onPress, accentColor }: {
  name: string; role: string; perf: EmployeePerformance | null;
  selected: boolean; onPress: () => void; accentColor: string;
}) {
  const lvl = perf ? getScoreLevel(perf.score) : null;
  return (
    <TouchableOpacity
      style={[er.row, selected && { backgroundColor: `${accentColor}10`, borderRightWidth: 3, borderRightColor: accentColor }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[er.avatar, { backgroundColor: `${accentColor}15` }]}>
        <Text style={[er.avatarTxt, { color: accentColor }]}>{name[0]?.toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={er.name} numberOfLines={1}>{name}</Text>
        <Text style={er.role}>{role}</Text>
      </View>
      {perf ? (
        <View style={er.scoreArea}>
          <Text style={[er.score, { color: lvl!.color }]}>{perf.score.toFixed(0)}</Text>
          <View style={[er.scoreDot, { backgroundColor: lvl!.color }]} />
        </View>
      ) : (
        <Text style={er.noCalc}>—</Text>
      )}
    </TouchableOpacity>
  );
}
const er = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  avatar:    { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 14, fontWeight: '700', fontFamily: F.bold },
  name:      { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  role:      { fontSize: 11, fontFamily: F.regular, color: C.textSecondary, marginTop: 1 },
  scoreArea: { alignItems: 'center', gap: 3 },
  score:     { fontSize: 18, fontWeight: '800', fontFamily: F.bold },
  scoreDot:  { width: 6, height: 6, borderRadius: 3 },
  noCalc:    { fontSize: 14, color: C.textMuted },
});

// ─── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ employeeId, employeeName, employeeRole, period, accentColor, canManage, onRefresh }: {
  employeeId: string; employeeName: string; employeeRole: string;
  period: string; accentColor: string; canManage: boolean; onRefresh: () => void;
}) {
  const [perf, setPerf]       = useState<EmployeePerformance | null>(null);
  const [bonuses, setBonuses] = useState<PerformanceBonus[]>([]);
  const [loading, setLoading] = useState(false);
  const [calcLoading, setCalc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: p } = await fetchPerformance(employeeId, period);
    setPerf(p ?? null);
    if (p?.id) {
      const { data: b } = await fetchBonuses(p.id);
      setBonuses(b ?? []);
    } else {
      setBonuses([]);
    }
    setLoading(false);
  }, [employeeId, period]);

  useEffect(() => { load(); }, [load]);

  const handleCalc = async () => {
    setCalc(true);
    const { data: p } = await calculatePerformance(employeeId, period);
    if (p) {
      setPerf(p as EmployeePerformance);
      // Calculate bonuses
      const { data: b } = await calculateBonuses((p as EmployeePerformance).id);
      setBonuses((b as PerformanceBonus[]) ?? []);
    }
    await load();
    onRefresh();
    setCalc(false);
    toast.success('Performans hesaplandı');
  };

  const handleLock = async () => {
    if (!perf?.id) return;
    await lockPerformance(perf.id);
    setPerf(prev => prev ? { ...prev, is_locked: true } : prev);
    toast.success('Performans onaylandı ve kilitlendi');
  };

  const lvl = perf ? getScoreLevel(perf.score) : null;
  const totalBonus = bonuses.reduce((s, b) => s + Number(b.bonus_amount), 0);

  return (
    <ScrollView style={dp.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={dp.header}>
        <View style={[dp.avatarLg, { backgroundColor: `${accentColor}18` }]}>
          <Text style={[dp.avatarTxt, { color: accentColor }]}>{employeeName[0]?.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={dp.empName}>{employeeName}</Text>
          <Text style={dp.empRole}>{employeeRole} · {fmtPeriod(period)}</Text>
        </View>
        {perf?.is_locked && (
          <View style={dp.lockedBadge}>
            <Feather name="lock" size={12} color={C.success} />
            <Text style={dp.lockedTxt}>Onaylandı</Text>
          </View>
        )}
      </View>

      {loading || calcLoading ? (
        <View style={dp.loadingBox}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={dp.loadingTxt}>{calcLoading ? 'Hesaplanıyor…' : 'Yükleniyor…'}</Text>
        </View>
      ) : perf ? (
        <>
          {/* Score card */}
          <View style={dp.scoreCard}>
            <View style={dp.scoreLeft}>
              <Text style={[dp.scoreBig, { color: lvl!.color }]}>{perf.score.toFixed(1)}</Text>
              <Text style={dp.scoreMax}>/100</Text>
            </View>
            <View style={dp.scoreMid}>
              <View style={[dp.scoreLevelBadge, { backgroundColor: `${lvl!.color}18` }]}>
                <Feather name={lvl!.icon as any} size={14} color={lvl!.color} />
                <Text style={[dp.scoreLevelTxt, { color: lvl!.color }]}>{lvl!.label}</Text>
              </View>
              {/* Score bar */}
              <View style={dp.barBg}>
                <View style={[dp.barFill, { width: `${Math.min(perf.score, 100)}%` as any, backgroundColor: lvl!.color }]} />
              </View>
            </View>
          </View>

          {/* Metrics grid */}
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>Performans Metrikleri</Text>
            <View style={dp.metricsGrid}>
              <MetricCard
                label="Tamamlanan"
                value={`${perf.orders_completed}`}
                sub={`/ ${perf.orders_assigned} atanan`}
                icon="check-square" color={C.success}
                rate={perf.completion_rate}
              />
              <MetricCard
                label="Zamanında"
                value={`%${perf.on_time_rate.toFixed(1)}`}
                sub={`${perf.orders_on_time}/${perf.orders_completed} sipariş`}
                icon="clock" color={C.primary}
                rate={perf.on_time_rate}
              />
              <MetricCard
                label="Kalite"
                value={`%${perf.quality_pass_rate.toFixed(1)}`}
                sub={`${perf.orders_quality_ok} sipariş`}
                icon="star" color={C.warning}
                rate={perf.quality_pass_rate}
              />
              <MetricCard
                label="Geciken"
                value={`${perf.orders_late}`}
                sub="sipariş"
                icon="alert-circle" color={perf.orders_late > 0 ? C.danger : C.textMuted}
                rate={null}
              />
            </View>
          </View>

          {/* Bonuses */}
          {bonuses.length > 0 && (
            <View style={dp.section}>
              <Text style={dp.sectionTitle}>Prim Hesabı</Text>
              <View style={dp.bonusCard}>
                {bonuses.map((b, i) => (
                  <View key={b.id} style={[dp.bonusRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <View style={dp.bonusLeft}>
                      <Text style={dp.bonusDesc}>{b.description}</Text>
                      <Text style={dp.bonusMeta}>Gerçekleşen: {b.metric_value.toFixed(1)}</Text>
                    </View>
                    <Text style={dp.bonusAmt}>{fmtMoney(b.bonus_amount)}</Text>
                  </View>
                ))}
                <View style={dp.bonusTotal}>
                  <Text style={dp.bonusTotalLabel}>Toplam Prim</Text>
                  <Text style={[dp.bonusTotalAmt, { color: accentColor }]}>{fmtMoney(totalBonus)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Revenue */}
          {perf.revenue_generated > 0 && (
            <View style={dp.section}>
              <View style={dp.revenueCard}>
                <Feather name="trending-up" size={18} color={C.success} />
                <View style={{ flex: 1 }}>
                  <Text style={dp.revenueLabel}>Üretilen Ciro</Text>
                  <Text style={dp.revenueValue}>{fmtMoney(perf.revenue_generated)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Actions */}
          {canManage && (
            <View style={dp.actions}>
              {!perf.is_locked && (
                <>
                  <TouchableOpacity
                    style={[dp.btn, dp.btnOutline]}
                    onPress={handleCalc}
                    disabled={calcLoading}
                  >
                    <Feather name="refresh-cw" size={14} color={accentColor} />
                    <Text style={[dp.btnTxt, { color: accentColor }]}>Yeniden Hesapla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[dp.btn, { backgroundColor: accentColor }]} onPress={handleLock}>
                    <Feather name="lock" size={14} color="#FFF" />
                    <Text style={[dp.btnTxt, { color: '#FFF' }]}>Onayla & Kilitle</Text>
                  </TouchableOpacity>
                </>
              )}
              {perf.is_locked && (
                <View style={dp.lockedInfo}>
                  <Feather name="check-circle" size={16} color={C.success} />
                  <Text style={dp.lockedInfoTxt}>Bu dönem performansı onaylandı</Text>
                </View>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={dp.noData}>
          <Feather name="bar-chart-2" size={40} color={C.textMuted} />
          <Text style={dp.noDataTxt}>Bu dönem için performans hesaplanmamış</Text>
          {canManage && (
            <TouchableOpacity style={[dp.calcBtn, { backgroundColor: accentColor }]} onPress={handleCalc} disabled={calcLoading}>
              {calcLoading
                ? <ActivityIndicator size="small" color="#FFF" />
                : <><Feather name="zap" size={16} color="#FFF" /><Text style={dp.calcBtnTxt}>Hesapla</Text></>
              }
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const dp = StyleSheet.create({
  scroll: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 24, borderBottomWidth: 1, borderBottomColor: C.border },
  avatarLg: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 20, fontWeight: '800', fontFamily: F.bold },
  empName:  { fontSize: 18, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  empRole:  { fontSize: 12, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },
  lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.successBg, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  lockedTxt: { fontSize: 11, fontWeight: '600', fontFamily: F.semibold, color: C.success },

  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingTxt: { fontSize: 13, fontFamily: F.regular, color: C.textSecondary },

  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 20, margin: 20, backgroundColor: '#FAFBFC', borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 20 },
  scoreLeft: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  scoreBig:  { fontSize: 48, fontWeight: '800', fontFamily: F.bold, lineHeight: 52 },
  scoreMax:  { fontSize: 16, fontFamily: F.medium, color: C.textMuted, paddingBottom: 6 },
  scoreMid:  { flex: 1, gap: 10 },
  scoreLevelBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  scoreLevelTxt: { fontSize: 13, fontWeight: '700', fontFamily: F.bold },
  barBg:  { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4 },
  barFill:{ height: 8, borderRadius: 4 },

  section:      { paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '600', fontFamily: F.semibold, color: C.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  metricsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  bonusCard: { backgroundColor: '#FAFBFC', borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  bonusRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  bonusLeft: { flex: 1 },
  bonusDesc: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  bonusMeta: { fontSize: 11, fontFamily: F.regular, color: C.textMuted, marginTop: 2 },
  bonusAmt:  { fontSize: 14, fontWeight: '700', fontFamily: F.bold, color: C.success },
  bonusTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.borderMid, backgroundColor: '#FFFFFF' },
  bonusTotalLabel: { fontSize: 14, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  bonusTotalAmt:   { fontSize: 18, fontWeight: '800', fontFamily: F.bold },

  revenueCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.successBg, borderRadius: 14, borderWidth: 1, borderColor: C.successBorder, padding: 16 },
  revenueLabel: { fontSize: 12, fontFamily: F.medium, color: C.textSecondary },
  revenueValue: { fontSize: 20, fontWeight: '800', fontFamily: F.bold, color: C.success },

  actions:    { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  btn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 13 },
  btnOutline: { borderWidth: 1.5, borderColor: C.borderMid },
  btnTxt:     { fontSize: 13, fontWeight: '600', fontFamily: F.semibold },
  lockedInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.successBg, borderRadius: 10, padding: 13 },
  lockedInfoTxt: { fontSize: 13, fontFamily: F.medium, color: C.success },

  noData:   { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24, gap: 12 },
  noDataTxt:{ fontSize: 14, fontFamily: F.regular, color: C.textSecondary, textAlign: 'center' },
  calcBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13, marginTop: 8 },
  calcBtnTxt: { fontSize: 14, fontWeight: '700', fontFamily: F.bold, color: '#FFF' },
});

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, icon, color, rate }: {
  label: string; value: string; sub: string; icon: string; color: string; rate: number | null;
}) {
  return (
    <View style={mc.card}>
      <View style={[mc.iconBox, { backgroundColor: `${color}12` }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={[mc.value, { color }]}>{value}</Text>
      <Text style={mc.label}>{label}</Text>
      <Text style={mc.sub}>{sub}</Text>
      {rate !== null && (
        <View style={mc.barBg}>
          <View style={[mc.barFill, { width: `${Math.min(rate, 100)}%` as any, backgroundColor: color }]} />
        </View>
      )}
    </View>
  );
}
const mc = StyleSheet.create({
  card:   { width: '47%', backgroundColor: '#FAFBFC', borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, gap: 4 },
  iconBox:{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  value:  { fontSize: 20, fontWeight: '800', fontFamily: F.bold },
  label:  { fontSize: 11, fontWeight: '600', fontFamily: F.semibold, color: C.textSecondary },
  sub:    { fontSize: 10, fontFamily: F.regular, color: C.textMuted },
  barBg:  { height: 3, backgroundColor: '#E2E8F0', borderRadius: 2, marginTop: 6 },
  barFill:{ height: 3, borderRadius: 2 },
});

// ─── Rules modal ──────────────────────────────────────────────────────────────
function RulesModal({ accentColor, onClose }: { accentColor: string; onClose: () => void }) {
  const [rules, setRules]   = useState<PerformanceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEdit] = useState<PerformanceRule | null>(null);
  const [addOpen, setAdd]   = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await fetchRules();
    setRules((data as PerformanceRule[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (rule: PerformanceRule) => {
    await toggleRule(rule.id, !rule.is_active);
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  };

  const handleDelete = (rule: PerformanceRule) => {
    Alert.alert('Kuralı Sil', `"${rule.name}" kuralı silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await deleteRule(rule.id);
        setRules(prev => prev.filter(r => r.id !== rule.id));
        toast.success('Kural silindi');
      }},
    ]);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={rm.root}>
        <View style={rm.header}>
          <View style={{ flex: 1 }}>
            <Text style={rm.title}>Prim Kuralları</Text>
            <Text style={rm.sub}>Performans kriterlerini ve prim miktarlarını ayarlayın</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={rm.closeBtn}>
            <Feather name="x" size={20} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[rm.addBtn, { borderColor: accentColor }]} onPress={() => setAdd(true)}>
          <Feather name="plus" size={14} color={accentColor} />
          <Text style={[rm.addBtnTxt, { color: accentColor }]}>Yeni Kural Ekle</Text>
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {loading ? (
            <ActivityIndicator color={accentColor} style={{ marginTop: 40 }} />
          ) : rules.length === 0 ? (
            <View style={rm.empty}>
              <Feather name="sliders" size={32} color={C.textMuted} />
              <Text style={rm.emptyTxt}>Henüz prim kuralı tanımlanmamış</Text>
            </View>
          ) : rules.map(rule => {
            const metCfg = METRIC_LABELS[rule.metric];
            return (
              <View key={rule.id} style={[rm.ruleCard, !rule.is_active && { opacity: 0.5 }]}>
                <View style={rm.ruleTop}>
                  <View style={[rm.ruleIcon, { backgroundColor: `${accentColor}12` }]}>
                    <Feather name={metCfg.icon as any} size={14} color={accentColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={rm.ruleName}>{rule.name}</Text>
                    <Text style={rm.ruleMeta}>{metCfg.label} · {THRESHOLD_TYPE_LABELS[rule.threshold_type]}</Text>
                  </View>
                  <Switch
                    value={rule.is_active}
                    onValueChange={() => handleToggle(rule)}
                    trackColor={{ true: accentColor }}
                  />
                </View>
                <View style={rm.ruleDetails}>
                  <Text style={rm.ruleDetailTxt}>
                    Eşik: {rule.threshold_value} {metCfg.unit} → Prim: {rule.bonus_type === 'percent'
                      ? `%${rule.bonus_amount} maaş`
                      : `₺${rule.bonus_amount}`}
                  </Text>
                  <Text style={rm.ruleDetailTxt}>
                    Uygulanır: {rule.applies_to === 'all' ? 'Tüm çalışanlar' : rule.applies_to.replace('role_', '')}
                  </Text>
                </View>
                <View style={rm.ruleActions}>
                  <TouchableOpacity onPress={() => setEdit(rule)} style={rm.ruleActionBtn}>
                    <Feather name="edit-2" size={13} color={accentColor} />
                    <Text style={[rm.ruleActionTxt, { color: accentColor }]}>Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(rule)} style={rm.ruleActionBtn}>
                    <Feather name="trash-2" size={13} color={C.danger} />
                    <Text style={[rm.ruleActionTxt, { color: C.danger }]}>Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {(addOpen || editRule) && (
        <RuleFormModal
          rule={editRule}
          accentColor={accentColor}
          onClose={() => { setAdd(false); setEdit(null); }}
          onSaved={() => { setAdd(false); setEdit(null); load(); }}
        />
      )}
    </Modal>
  );
}

const rm = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#FAFBFC' },
  header: { flexDirection: 'row', alignItems: 'flex-start', padding: 20, paddingTop: 28, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  title:  { fontSize: 18, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  sub:    { fontSize: 12, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },
  closeBtn: { padding: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, borderWidth: 1.5, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16 },
  addBtnTxt: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold },
  empty:  { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTxt: { fontSize: 13, fontFamily: F.regular, color: C.textSecondary },
  ruleCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10 },
  ruleTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  ruleName: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  ruleMeta: { fontSize: 11, fontFamily: F.regular, color: C.textSecondary, marginTop: 1 },
  ruleDetails: { gap: 3 },
  ruleDetailTxt: { fontSize: 12, fontFamily: F.regular, color: C.textSecondary },
  ruleActions: { flexDirection: 'row', gap: 16, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border },
  ruleActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ruleActionTxt: { fontSize: 12, fontWeight: '600', fontFamily: F.semibold },
});

// ─── Rule form modal ──────────────────────────────────────────────────────────
function RuleFormModal({ rule, accentColor, onClose, onSaved }: {
  rule: PerformanceRule | null; accentColor: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]           = useState(rule?.name ?? '');
  const [metric, setMetric]       = useState<PerfMetric>(rule?.metric ?? 'orders_completed');
  const [threshType, setThreshType] = useState<ThresholdType>(rule?.threshold_type ?? 'min');
  const [threshVal, setThreshVal] = useState(String(rule?.threshold_value ?? ''));
  const [bonusType, setBonusType] = useState<BonusType>(rule?.bonus_type ?? 'fixed');
  const [bonusAmt, setBonusAmt]   = useState(String(rule?.bonus_amount ?? ''));
  const [saving, setSaving]       = useState(false);

  const metrics: PerfMetric[] = ['orders_completed', 'on_time_rate', 'quality_pass_rate', 'revenue_generated'];
  const threshTypes: ThresholdType[] = ['min', 'target', 'per_unit'];
  const bonusTypes: BonusType[] = ['fixed', 'percent', 'per_unit'];

  const handleSave = async () => {
    if (!name.trim() || !threshVal || !bonusAmt) return;
    setSaving(true);
    await saveRule({
      id: rule?.id,
      name: name.trim(),
      description: null,
      metric,
      threshold_type: threshType,
      threshold_value: parseFloat(threshVal),
      bonus_type: bonusType,
      bonus_amount: parseFloat(bonusAmt),
      applies_to: 'all',
      is_active: rule?.is_active ?? true,
    } as any);
    onSaved();
    toast.success(rule ? 'Kural güncellendi' : 'Kural eklendi');
  };

  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={rf.root}>
        <View style={rf.header}>
          <Text style={rf.title}>{rule ? 'Kuralı Düzenle' : 'Yeni Prim Kuralı'}</Text>
          <TouchableOpacity onPress={onClose}><Feather name="x" size={20} color={C.textSecondary} /></TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18 }}>
          <FieldGroup label="Kural Adı">
            <TextInput style={rf.input} value={name} onChangeText={setName} placeholder="örn. Teslim Primi" placeholderTextColor={C.textMuted} />
          </FieldGroup>
          <FieldGroup label="Metrik">
            <View style={rf.optionGrid}>
              {metrics.map(m => (
                <TouchableOpacity key={m} style={[rf.option, metric === m && { backgroundColor: accentColor, borderColor: accentColor }]} onPress={() => setMetric(m)}>
                  <Feather name={METRIC_LABELS[m].icon as any} size={12} color={metric === m ? '#FFF' : C.textSecondary} />
                  <Text style={[rf.optionTxt, metric === m && { color: '#FFF' }]}>{METRIC_LABELS[m].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FieldGroup>
          <FieldGroup label="Eşik Türü">
            {threshTypes.map(t => (
              <TouchableOpacity key={t} style={[rf.radio, threshType === t && { borderColor: accentColor }]} onPress={() => setThreshType(t)}>
                <View style={[rf.radioDot, threshType === t && { backgroundColor: accentColor }]} />
                <Text style={rf.radioTxt}>{THRESHOLD_TYPE_LABELS[t]}</Text>
              </TouchableOpacity>
            ))}
          </FieldGroup>
          <FieldGroup label={`Eşik Değeri (${METRIC_LABELS[metric].unit})`}>
            <TextInput style={rf.input} value={threshVal} onChangeText={setThreshVal} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.textMuted} />
          </FieldGroup>
          <FieldGroup label="Prim Türü">
            <View style={rf.optionGrid}>
              {bonusTypes.map(b => (
                <TouchableOpacity key={b} style={[rf.option, bonusType === b && { backgroundColor: accentColor, borderColor: accentColor }]} onPress={() => setBonusType(b)}>
                  <Text style={[rf.optionTxt, bonusType === b && { color: '#FFF' }]}>{BONUS_TYPE_LABELS[b]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FieldGroup>
          <FieldGroup label="Prim Miktarı">
            <TextInput style={rf.input} value={bonusAmt} onChangeText={setBonusAmt} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.textMuted} />
          </FieldGroup>
        </ScrollView>
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: C.border }}>
          <TouchableOpacity
            style={[rf.saveBtn, { backgroundColor: accentColor, opacity: saving || !name.trim() || !threshVal || !bonusAmt ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving || !name.trim() || !threshVal || !bonusAmt}
          >
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={rf.saveTxt}>Kaydet</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={rf.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const rf = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#FAFBFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 28, borderBottomWidth: 1, borderBottomColor: C.border },
  title:  { fontSize: 17, fontWeight: '700', fontFamily: F.bold, color: C.textPrimary },
  fieldLabel: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  input:  { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: C.borderMid, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: F.regular, color: C.textPrimary },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: C.borderMid, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 10 },
  optionTxt: { fontSize: 11, fontWeight: '600', fontFamily: F.semibold, color: C.textSecondary },
  radio:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  radioDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.borderMid },
  radioTxt: { fontSize: 13, fontFamily: F.regular, color: C.textPrimary, flex: 1 },
  saveBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveTxt: { fontSize: 15, fontWeight: '700', fontFamily: F.bold, color: '#FFF' },
});

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ accentColor }: { accentColor: string }) {
  return (
    <View style={es.root}>
      <Feather name="bar-chart-2" size={48} color={C.textMuted} />
      <Text style={es.title}>Çalışan Seçin</Text>
      <Text style={es.sub}>Sol panelden bir çalışan seçerek performansını görüntüleyin</Text>
    </View>
  );
}
const es = StyleSheet.create({
  root:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  title: { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary },
  sub:   { fontSize: 13, fontFamily: F.regular, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
});

// ─── Layout styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:      { flex: 1, flexDirection: 'row', backgroundColor: '#FAFBFC' },
  left:      { width: 280, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: '#FFFFFF', flexDirection: 'column' },
  right:     { flex: 1 },
  periodBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  periodLabel: { fontSize: 16, fontWeight: '700', fontFamily: F.bold, minWidth: 120, textAlign: 'center' },
  arrow:     { padding: 6 },
  summaryRow:{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  rulesBtn:  { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 12, marginTop: 10, borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  rulesBtnTxt: { fontSize: 12, fontWeight: '600', fontFamily: F.semibold },
  loadingBox:{ paddingVertical: 40, alignItems: 'center' },
});
