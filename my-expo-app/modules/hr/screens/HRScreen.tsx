import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useBreakpoint } from '../../../core/layout/Responsive';
import { toast } from '../../../core/ui/Toast';
import { C } from '../../../core/theme/colors';

import {
  EmployeeLeave, LeaveSummary, EmployeeAttendance, AttendanceMonthlySummary,
  LeaveType, LeaveStatus, AttendanceStatus,
  LEAVE_TYPE_LABELS, LEAVE_TYPE_ICONS, LEAVE_TYPE_COLORS,
  LEAVE_STATUS_CFG, ATTENDANCE_STATUS_CFG,
  createLeave, approveLeave, rejectLeave, cancelLeave, deleteLeave,
  upsertAttendance, deleteAttendance, manualAttendanceRPC,
  calcBusinessDays, fmtMinutes,
} from '../api';
import { useLeaveSummaries, useEmployeeLeaves, useAttendance, usePendingLeaves } from '../hooks/useHR';
import { useAuthStore } from '../../../core/store/authStore';
import { ROLE_LABELS, ROLE_COLORS } from '../../employees/api';

// ─── Turkish month helpers ────────────────────────────────────────────────────
const TR_MONTHS = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const TR_MONTHS_SHORT = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${TR_MONTHS_SHORT[m]} ${y}`;
}

function fmtDateRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (sm === em && sy === ey) return `${sd}–${ed} ${TR_MONTHS_SHORT[sm]} ${sy}`;
  return `${sd} ${TR_MONTHS_SHORT[sm]} — ${ed} ${TR_MONTHS_SHORT[em]} ${ey}`;
}

function fmtTime(t: string | null): string {
  return t ?? '—';
}

const LEAVE_TYPES: LeaveType[] = ['yillik', 'mazeret', 'hastalik', 'ucretsiz', 'dogum', 'olum', 'evlilik'];
const ATT_STATUSES: AttendanceStatus[] = ['normal', 'gec', 'erken_cikis', 'yarim_gun', 'devamsiz', 'izinli', 'hastalik', 'resmi_tatil'];
const ATT_WITH_TIME: AttendanceStatus[] = ['normal', 'gec', 'erken_cikis', 'yarim_gun'];

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function HRScreen() {
  const { isDesktop, px, gap } = useBreakpoint();
  const { profile } = useAuthStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'izinler' | 'devam' | 'ozet'>('izinler');
  const [leaveFilter, setLeaveFilter] = useState<LeaveStatus | 'tumu'>('tumu');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [attOpen, setAttOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [showOnlyPending, setShowOnlyPending] = useState(false);

  // ── Rol kontrolü: sadece mesul müdür ve admin onaylayabilir ──────────────
  const canApprove = profile?.user_type === 'admin' || profile?.role === 'manager';

  const { summaries, loading: loadingSum, refetch: refetchSum } = useLeaveSummaries();
  const { leaves: pendingLeaves } = usePendingLeaves();
  const selectedSummary = summaries.find(s => s.employee_id === selectedId) ?? null;
  const { leaves, loading: loadingLeaves, refetch: refetchLeaves } = useEmployeeLeaves(selectedId);
  const { records, summary: attSummary, loading: loadingAtt, refetch: refetchAtt } = useAttendance(selectedId, currentMonth);

  const pendingCount = pendingLeaves.length;
  const onLeaveCount = summaries.filter(s => s.currently_on_leave).length;

  const displayedSummaries = useMemo(() =>
    showOnlyPending ? summaries.filter(s => s.pending_count > 0) : summaries,
  [summaries, showOnlyPending]);

  const filteredLeaves = useMemo(() => {
    if (leaveFilter === 'tumu') return leaves;
    return leaves.filter(l => l.status === leaveFilter);
  }, [leaves, leaveFilter]);

  const handleApprove = async (id: string) => {
    try {
      const { error } = await approveLeave(id, profile?.id ?? '');
      if (error) throw error;
      toast.success('İzin onaylandı.');
      refetchSum(); refetchLeaves();
    } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
  };

  const handleReject = (id: string) => {
    setRejectTargetId(id);
    setRejectOpen(true);
  };

  const handleCancel = (id: string) => {
    Alert.alert('İzni İptal Et', 'Bu izin talebi iptal edilecek. Onaylıyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal Et', style: 'destructive', onPress: async () => {
        try {
          const { error } = await cancelLeave(id);
          if (error) throw error;
          toast.success('İzin iptal edildi.');
          refetchSum(); refetchLeaves();
        } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
      }},
    ]);
  };

  const handleDeleteLeave = (id: string) => {
    Alert.alert('İzni Sil', 'Bu izin kaydı kalıcı olarak silinecek. Devam edilsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        try {
          const { error } = await deleteLeave(id);
          if (error) throw error;
          toast.success('İzin silindi.');
          refetchSum(); refetchLeaves();
        } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
      }},
    ]);
  };

  const handleDeleteAtt = (id: string) => {
    Alert.alert('Devam Kaydını Sil', 'Bu devam kaydı silinecek. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        try {
          const { error } = await deleteAttendance(id);
          if (error) throw error;
          toast.success('Kayıt silindi.');
          refetchAtt();
        } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
      }},
    ]);
  };

  const handleSelectEmployee = (id: string) => {
    setSelectedId(id);
    setTab('izinler');
    setLeaveFilter('tumu');
  };

  const prevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const employeeList = (
    <EmployeeListPanel
      summaries={displayedSummaries}
      selectedId={selectedId}
      onSelect={handleSelectEmployee}
      px={px}
      gap={gap}
    />
  );

  const rightPanel = selectedSummary ? (
    <RightPanel
      summary={selectedSummary}
      tab={tab}
      setTab={setTab}
      leaveFilter={leaveFilter}
      setLeaveFilter={setLeaveFilter}
      filteredLeaves={filteredLeaves}
      loadingLeaves={loadingLeaves}
      canApprove={canApprove}
      onApprove={handleApprove}
      onReject={handleReject}
      onCancel={handleCancel}
      onDeleteLeave={handleDeleteLeave}
      onAddLeave={() => setLeaveOpen(true)}
      currentMonth={currentMonth}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      records={records}
      attSummary={attSummary}
      loadingAtt={loadingAtt}
      onDeleteAtt={handleDeleteAtt}
      onAddAtt={() => setAttOpen(true)}
      px={px}
      isDesktop={isDesktop}
    />
  ) : (
    <View style={s.emptyRight}>
      <MaterialCommunityIcons name={'account-arrow-left-outline' as any} size={40} color={C.textDisabled} />
      <Text style={s.emptyRightText}>Sol panelden çalışan seçin</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { paddingHorizontal: px }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>İzin & Devam</Text>
          <Text style={s.subtitle}>
            {summaries.length} çalışan · {onLeaveCount > 0 ? `${onLeaveCount} izinde` : 'izinde kimse yok'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {pendingCount > 0 && (
            <TouchableOpacity
              style={[s.pendingBtn, showOnlyPending && s.pendingBtnActive]}
              onPress={() => setShowOnlyPending(p => !p)}
              activeOpacity={0.85}
            >
              <View style={s.pendingBadge}>
                <Text style={s.pendingBadgeText}>{pendingCount}</Text>
              </View>
              <Text style={[s.pendingBtnText, showOnlyPending && { color: '#fff' }]}>Bekliyor</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.addBtn} onPress={() => setLeaveOpen(true)} activeOpacity={0.85}>
            <MaterialCommunityIcons name={'calendar-plus' as any} size={16} color="#fff" />
            <Text style={s.addBtnText}>İzin Talebi</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Body */}
      {isDesktop ? (
        <View style={s.body}>
          {/* Left panel — fixed 340px */}
          <View style={s.leftPanel}>
            {employeeList}
          </View>
          {/* Right panel */}
          <View style={s.rightPanel}>
            {rightPanel}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {selectedId && selectedSummary ? (
            <View style={{ flex: 1 }}>
              {/* Mobile back header */}
              <View style={[s.mobileBackBar, { paddingHorizontal: px }]}>
                <TouchableOpacity style={s.backBtn} onPress={() => setSelectedId(null)}>
                  <MaterialCommunityIcons name={'chevron-left' as any} size={20} color={C.primary} />
                  <Text style={s.backBtnText}>Geri</Text>
                </TouchableOpacity>
                <Text style={s.mobileEmpName} numberOfLines={1}>{selectedSummary.full_name}</Text>
              </View>
              {rightPanel}
            </View>
          ) : (
            employeeList
          )}
        </View>
      )}

      {/* Modals */}
      <LeaveFormModal
        visible={leaveOpen}
        summaries={summaries}
        preselectedId={selectedId}
        onClose={() => setLeaveOpen(false)}
        onSaved={() => { setLeaveOpen(false); refetchSum(); refetchLeaves(); }}
      />

      <AttendanceModal
        visible={attOpen}
        employeeId={selectedId}
        employeeName={selectedSummary?.full_name ?? ''}
        onClose={() => setAttOpen(false)}
        onSaved={() => { setAttOpen(false); refetchAtt(); }}
      />

      <RejectModal
        visible={rejectOpen}
        onClose={() => { setRejectOpen(false); setRejectTargetId(null); }}
        onConfirm={async (reason) => {
          if (!rejectTargetId) return;
          try {
            const { error } = await rejectLeave(rejectTargetId, reason);
            if (error) throw error;
            toast.success('İzin reddedildi.');
            setRejectOpen(false); setRejectTargetId(null);
            refetchSum(); refetchLeaves();
          } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
        }}
      />
    </SafeAreaView>
  );
}

// ─── Employee List Panel ──────────────────────────────────────────────────────
function EmployeeListPanel({ summaries, selectedId, onSelect, px, gap }: {
  summaries: LeaveSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  px: number;
  gap: number;
}) {
  if (summaries.length === 0) {
    return (
      <View style={s.emptyList}>
        <MaterialCommunityIcons name={'account-off-outline' as any} size={40} color={C.textDisabled} />
        <Text style={s.emptyListText}>Çalışan bulunamadı</Text>
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: px, paddingBottom: 60, gap }}
      showsVerticalScrollIndicator={false}
    >
      {summaries.map(s => (
        <EmployeeRow
          key={s.employee_id}
          summary={s}
          selected={s.employee_id === selectedId}
          onPress={() => onSelect(s.employee_id)}
        />
      ))}
    </ScrollView>
  );
}

// ─── Employee Row ─────────────────────────────────────────────────────────────
function EmployeeRow({ summary, selected, onPress }: {
  summary: LeaveSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const role = ROLE_COLORS[summary.role as keyof typeof ROLE_COLORS] ?? { fg: C.textSecondary, bg: C.border };
  const initials = summary.full_name
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const usedPct = summary.annual_entitlement > 0
    ? Math.min(summary.annual_used / summary.annual_entitlement, 1)
    : 0;

  return (
    <TouchableOpacity
      style={[er.card, selected && er.cardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {selected && <View style={er.selectedBorder} />}

      {/* Avatar */}
      <View style={[er.avatar, { backgroundColor: role.bg }]}>
        <Text style={[er.avatarText, { color: role.fg }]}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={er.name} numberOfLines={1}>{summary.full_name}</Text>
          {summary.currently_on_leave && (
            <View style={er.onLeavePill}>
              <View style={er.onLeaveDot} />
              <Text style={er.onLeavePillText}>İzinde</Text>
            </View>
          )}
          {summary.pending_count > 0 && (
            <View style={er.pendingBadge}>
              <Text style={er.pendingBadgeText}>{summary.pending_count}</Text>
            </View>
          )}
        </View>

        <View style={[er.roleBadge, { backgroundColor: role.bg, alignSelf: 'flex-start' }]}>
          <Text style={[er.roleText, { color: role.fg }]}>
            {ROLE_LABELS[summary.role as keyof typeof ROLE_LABELS] ?? summary.role}
          </Text>
        </View>

        {/* Annual leave progress */}
        <View style={{ gap: 3, marginTop: 2 }}>
          <Text style={er.annualLabel}>
            {summary.annual_used} / {summary.annual_entitlement} gün kullanıldı
          </Text>
          <View style={er.progressBg}>
            <View style={[er.progressFill, { width: `${usedPct * 100}%` as any }]} />
          </View>
        </View>
      </View>

      <MaterialCommunityIcons name={'chevron-right' as any} size={18} color={C.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
function RightPanel({
  summary, tab, setTab,
  leaveFilter, setLeaveFilter,
  filteredLeaves, loadingLeaves,
  canApprove,
  onApprove, onReject, onCancel, onDeleteLeave, onAddLeave,
  currentMonth, prevMonth, nextMonth,
  records, attSummary, loadingAtt, onDeleteAtt, onAddAtt,
  px, isDesktop,
}: {
  summary: LeaveSummary;
  tab: 'izinler' | 'devam' | 'ozet';
  setTab: (t: 'izinler' | 'devam' | 'ozet') => void;
  leaveFilter: LeaveStatus | 'tumu';
  setLeaveFilter: (f: LeaveStatus | 'tumu') => void;
  filteredLeaves: EmployeeLeave[];
  loadingLeaves: boolean;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCancel: (id: string) => void;
  onDeleteLeave: (id: string) => void;
  onAddLeave: () => void;
  currentMonth: string;
  prevMonth: () => void;
  nextMonth: () => void;
  records: EmployeeAttendance[];
  attSummary: AttendanceMonthlySummary | null;
  loadingAtt: boolean;
  onDeleteAtt: (id: string) => void;
  onAddAtt: () => void;
  px: number;
  isDesktop: boolean;
}) {
  const TABS: { key: 'izinler' | 'devam' | 'ozet'; label: string }[] = [
    { key: 'izinler', label: 'İzinler' },
    { key: 'devam',   label: 'Devam' },
    { key: 'ozet',    label: 'Özet' },
  ];

  const [mn, mm] = currentMonth.split('-').map(Number);

  return (
    <View style={{ flex: 1 }}>
      {/* Tab bar */}
      <View style={[rp.tabBarWrap, { paddingHorizontal: px }]}>
        <View style={rp.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[rp.tabBtn, tab === t.key && rp.tabBtnActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
            >
              <Text style={[rp.tabText, tab === t.key && rp.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: px, paddingBottom: 60, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'izinler' && (
          <LeavesTab
            summary={summary}
            leaves={filteredLeaves}
            leaveFilter={leaveFilter}
            setLeaveFilter={setLeaveFilter}
            loading={loadingLeaves}
            canApprove={canApprove}
            onApprove={onApprove}
            onReject={onReject}
            onCancel={onCancel}
            onDelete={onDeleteLeave}
            onAdd={onAddLeave}
          />
        )}
        {tab === 'devam' && (
          <DevamTab
            currentMonth={currentMonth}
            monthLabel={`${TR_MONTHS[mm]} ${mn}`}
            prevMonth={prevMonth}
            nextMonth={nextMonth}
            records={records}
            attSummary={attSummary}
            loading={loadingAtt}
            onDelete={onDeleteAtt}
            onAdd={onAddAtt}
          />
        )}
        {tab === 'ozet' && (
          <OzetTab summary={summary} attSummary={attSummary} />
        )}
      </ScrollView>
    </View>
  );
}

// ─── Leaves Tab ───────────────────────────────────────────────────────────────
function LeavesTab({ summary, leaves, leaveFilter, setLeaveFilter, loading, canApprove, onApprove, onReject, onCancel, onDelete, onAdd }: {
  summary: LeaveSummary;
  leaves: EmployeeLeave[];
  leaveFilter: LeaveStatus | 'tumu';
  setLeaveFilter: (f: LeaveStatus | 'tumu') => void;
  loading: boolean;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const FILTERS: { key: LeaveStatus | 'tumu'; label: string }[] = [
    { key: 'tumu',       label: 'Tümü' },
    { key: 'bekliyor',   label: 'Bekliyor' },
    { key: 'onaylandi',  label: 'Onaylı' },
    { key: 'reddedildi', label: 'Reddedildi' },
  ];

  return (
    <>
      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[lt.pill, leaveFilter === f.key && lt.pillActive]}
              onPress={() => setLeaveFilter(f.key)}
            >
              <Text style={[lt.pillText, leaveFilter === f.key && lt.pillTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : leaves.length === 0 ? (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name={'calendar-blank-outline' as any} size={36} color={C.textDisabled} />
          <Text style={s.emptyStateText}>İzin kaydı bulunamadı</Text>
        </View>
      ) : (
        leaves.map(l => (
          <LeaveCard
            key={l.id}
            leave={l}
            canApprove={canApprove}
            onApprove={onApprove}
            onReject={onReject}
            onCancel={onCancel}
            onDelete={onDelete}
          />
        ))
      )}

      <TouchableOpacity style={s.footerAddBtn} onPress={onAdd} activeOpacity={0.85}>
        <MaterialCommunityIcons name={'calendar-plus' as any} size={15} color={C.primary} />
        <Text style={s.footerAddBtnText}>İzin Talebi Ekle</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── Leave Card ───────────────────────────────────────────────────────────────
function LeaveCard({ leave, canApprove, onApprove, onReject, onCancel, onDelete }: {
  leave: EmployeeLeave;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const tc = LEAVE_TYPE_COLORS[leave.leave_type];
  const sc2 = LEAVE_STATUS_CFG[leave.status];
  const icon = LEAVE_TYPE_ICONS[leave.leave_type];

  return (
    <View style={lc.card}>
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        {/* Type icon */}
        <View style={[lc.typeIcon, { backgroundColor: tc.bg }]}>
          <MaterialCommunityIcons name={icon as any} size={18} color={tc.fg} />
        </View>

        {/* Info */}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={lc.typeName}>{LEAVE_TYPE_LABELS[leave.leave_type]}</Text>
          <Text style={lc.dates}>{fmtDateRange(leave.start_date, leave.end_date)}</Text>
          <Text style={lc.days}>{leave.days_count} iş günü</Text>
          {leave.reason ? <Text style={lc.reason} numberOfLines={2}>{leave.reason}</Text> : null}
        </View>

        {/* Status + delete */}
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <View style={[lc.statusPill, { backgroundColor: sc2.bg }]}>
            <MaterialCommunityIcons name={sc2.icon as any} size={11} color={sc2.fg} />
            <Text style={[lc.statusText, { color: sc2.fg }]}>{sc2.label}</Text>
          </View>
          <TouchableOpacity style={lc.delBtn} onPress={() => onDelete(leave.id)}>
            <MaterialCommunityIcons name={'trash-can-outline' as any} size={14} color={C.textDisabled} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Action buttons — sadece mesul müdür ve admin görebilir */}
      {leave.status === 'bekliyor' && canApprove && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            style={[lc.actionBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
            onPress={() => onApprove(leave.id)}
          >
            <MaterialCommunityIcons name={'check' as any} size={13} color={C.success} />
            <Text style={[lc.actionBtnText, { color: C.success }]}>Onayla</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[lc.actionBtn, { backgroundColor: C.dangerBg, borderColor: C.dangerBorder }]}
            onPress={() => onReject(leave.id)}
          >
            <MaterialCommunityIcons name={'close' as any} size={13} color={C.danger} />
            <Text style={[lc.actionBtnText, { color: C.danger }]}>Reddet</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Onay yetkisi olmayan kullanıcıya bilgi mesajı */}
      {leave.status === 'bekliyor' && !canApprove && (
        <View style={lc.pendingInfo}>
          <MaterialCommunityIcons name={'clock-outline' as any} size={13} color={C.warning} />
          <Text style={lc.pendingInfoText}>Mesul müdür / yönetici onayı bekleniyor</Text>
        </View>
      )}
      {leave.status === 'onaylandi' && canApprove && (
        <View style={{ marginTop: 10 }}>
          <TouchableOpacity
            style={[lc.actionBtn, { backgroundColor: C.border, borderColor: C.borderMid }]}
            onPress={() => onCancel(leave.id)}
          >
            <MaterialCommunityIcons name={'cancel' as any} size={13} color={C.textSecondary} />
            <Text style={[lc.actionBtnText, { color: C.textSecondary }]}>İptal</Text>
          </TouchableOpacity>
        </View>
      )}
      {leave.reject_reason && leave.status === 'reddedildi' && (
        <View style={lc.rejectReasonBox}>
          <Text style={lc.rejectReasonLabel}>Red sebebi:</Text>
          <Text style={lc.rejectReasonText}>{leave.reject_reason}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Devam Tab ────────────────────────────────────────────────────────────────
function DevamTab({ currentMonth, monthLabel, prevMonth, nextMonth, records, attSummary, loading, onDelete, onAdd }: {
  currentMonth: string;
  monthLabel: string;
  prevMonth: () => void;
  nextMonth: () => void;
  records: EmployeeAttendance[];
  attSummary: AttendanceMonthlySummary | null;
  loading: boolean;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const [y, m] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  // Day of week for first of month: 0=Sun..6=Sat, convert to Mon=0..Sun=6
  const rawFirst = new Date(y, m - 1, 1).getDay();
  const firstOffset = rawFirst === 0 ? 6 : rawFirst - 1;

  // Build map: date string -> record
  const recordMap = useMemo(() => {
    const map: Record<string, EmployeeAttendance> = {};
    records.forEach(r => { map[r.work_date] = r; });
    return map;
  }, [records]);

  // Calendar grid cells: firstOffset empty + days
  const cells: (number | null)[] = [
    ...Array(firstOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <>
      {/* Month selector */}
      <View style={dt.monthRow}>
        <TouchableOpacity style={dt.monthArrow} onPress={prevMonth}>
          <MaterialCommunityIcons name={'chevron-left' as any} size={20} color={C.textSecondary} />
        </TouchableOpacity>
        <Text style={dt.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity style={dt.monthArrow} onPress={nextMonth}>
          <MaterialCommunityIcons name={'chevron-right' as any} size={20} color={C.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Monthly summary chips */}
      {attSummary && (
        <View style={dt.summaryChips}>
          <MiniStat label="Normal" value={attSummary.normal_days} color={C.success} />
          <MiniStat label="Geç Giriş" value={attSummary.late_days} color={C.warning} />
          <MiniStat label="Devamsız" value={attSummary.absent_days} color={C.danger} />
          <MiniStat label="Toplam Süre" value={fmtMinutes(attSummary.total_work_minutes)} color={C.primary} isText />
        </View>
      )}

      {/* Calendar grid */}
      <View style={dt.calCard}>
        {/* Header row: Mon–Sun */}
        <View style={dt.calHeaderRow}>
          {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(d => (
            <Text key={d} style={dt.calHeaderCell}>{d}</Text>
          ))}
        </View>
        {/* Day cells */}
        <View style={dt.calGrid}>
          {cells.map((day, idx) => {
            if (day === null) return <View key={`e-${idx}`} style={dt.calCell} />;
            const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const rec = recordMap[dateStr];
            const colIdx = idx % 7;
            const isWeekend = colIdx === 5 || colIdx === 6;
            const cfg = rec ? ATTENDANCE_STATUS_CFG[rec.status] : null;
            return (
              <View key={dateStr} style={[dt.calCell, isWeekend && dt.calCellWeekend]}>
                <Text style={[dt.calDayNum, !rec && { color: C.textMuted }]}>{day}</Text>
                {cfg && (
                  <>
                    <View style={[dt.calDot, { backgroundColor: cfg.fg }]} />
                    <Text style={[dt.calDayStatus, { color: cfg.fg }]} numberOfLines={1}>
                      {cfg.label.split(' ')[0]}
                    </Text>
                  </>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Records list */}
      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : records.length === 0 ? (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name={'calendar-blank' as any} size={36} color={C.textDisabled} />
          <Text style={s.emptyStateText}>Bu ay için devam kaydı yok</Text>
        </View>
      ) : (
        records.map(r => (
          <AttendanceRow key={r.id} record={r} onDelete={onDelete} />
        ))
      )}

      <TouchableOpacity style={s.footerAddBtn} onPress={onAdd} activeOpacity={0.85}>
        <MaterialCommunityIcons name={'calendar-check' as any} size={15} color={C.primary} />
        <Text style={s.footerAddBtnText}>Devam Kaydı Ekle</Text>
      </TouchableOpacity>
    </>
  );
}

function MiniStat({ label, value, color, isText = false }: {
  label: string; value: number | string; color: string; isText?: boolean;
}) {
  return (
    <View style={[dt.miniStat, { borderColor: color + '30', backgroundColor: color + '10' }]}>
      <Text style={[dt.miniStatVal, { color }]}>{isText ? value : String(value)}</Text>
      <Text style={dt.miniStatLabel}>{label}</Text>
    </View>
  );
}

const METHOD_CFG: Record<string, { label: string; fg: string; bg: string; icon: string }> = {
  qr_gps:  { label: 'QR+GPS',  fg: '#059669', bg: '#D1FAE5', icon: 'map-marker-check' },
  qr_only: { label: 'QR',      fg: '#7C3AED', bg: '#EDE9FE', icon: 'qrcode' },
  manual:  { label: 'Manuel',  fg: '#2563EB', bg: '#DBEAFE', icon: 'account-edit' },
};

function AttendanceRow({ record: r, onDelete }: {
  record: EmployeeAttendance;
  onDelete: (id: string) => void;
}) {
  const cfg    = ATTENDANCE_STATUS_CFG[r.status];
  const method = r.check_in_method ? METHOD_CFG[r.check_in_method] : null;
  return (
    <View style={ac.row}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={ac.date}>{fmtDate(r.work_date)}</Text>
        <Text style={ac.time}>
          {r.check_in ? `${r.check_in} – ${r.check_out ?? '?'}` : '—'}
          {r.work_minutes ? `  ·  ${fmtMinutes(r.work_minutes)}` : ''}
          {r.overtime_minutes > 0 ? `  +${fmtMinutes(r.overtime_minutes)} OT` : ''}
        </Text>
        {method && (
          <View style={[ac.methodPill, { backgroundColor: method.bg }]}>
            <MaterialCommunityIcons name={method.icon as any} size={10} color={method.fg} />
            <Text style={[ac.methodText, { color: method.fg }]}>{method.label}</Text>
          </View>
        )}
        {r.notes ? <Text style={ac.notes} numberOfLines={1}>{r.notes}</Text> : null}
      </View>
      <View style={[ac.statusPill, { backgroundColor: cfg.bg }]}>
        <Text style={[ac.statusText, { color: cfg.fg }]}>{cfg.label}</Text>
      </View>
      <TouchableOpacity style={ac.delBtn} onPress={() => onDelete(r.id)}>
        <MaterialCommunityIcons name={'trash-can-outline' as any} size={14} color={C.textDisabled} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Özet Tab ─────────────────────────────────────────────────────────────────
function OzetTab({ summary, attSummary }: {
  summary: LeaveSummary;
  attSummary: AttendanceMonthlySummary | null;
}) {
  const usedPct = summary.annual_entitlement > 0
    ? Math.min(summary.annual_used / summary.annual_entitlement, 1)
    : 0;

  return (
    <>
      {/* Bu Yıl İzin */}
      <View style={oz.card}>
        <View style={oz.cardHeader}>
          <MaterialCommunityIcons name={'beach' as any} size={16} color={C.primary} />
          <Text style={oz.cardTitle}>Bu Yıl İzin</Text>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={oz.label}>Kullanılan</Text>
            <Text style={[oz.value, { color: C.textPrimary }]}>{summary.annual_used} gün</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={oz.label}>Kalan</Text>
            <Text style={[oz.value, { color: C.success }]}>{summary.annual_remaining} gün</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={oz.label}>Toplam hak</Text>
            <Text style={[oz.value, { color: C.textSecondary }]}>{summary.annual_entitlement} gün</Text>
          </View>
          <View style={oz.progressBg}>
            <View style={[oz.progressFill, { width: `${usedPct * 100}%` as any, backgroundColor: C.primary }]} />
          </View>
          <Text style={oz.progressHint}>{Math.round(usedPct * 100)}% kullanıldı</Text>
        </View>
      </View>

      {/* Bu Ay Devam */}
      {attSummary && (
        <View style={oz.card}>
          <View style={oz.cardHeader}>
            <MaterialCommunityIcons name={'calendar-check-outline' as any} size={16} color={C.primary} />
            <Text style={oz.cardTitle}>Bu Ay Devam</Text>
          </View>
          <View style={oz.statGrid}>
            <StatGridCell label="Normal" value={attSummary.normal_days} color={C.success} />
            <StatGridCell label="Geç" value={attSummary.late_days} color={C.warning} />
            <StatGridCell label="Devamsız" value={attSummary.absent_days} color={C.danger} />
            <StatGridCell label="İzinli" value={attSummary.leave_days} color={C.primary} />
          </View>
        </View>
      )}

      {/* Toplam Çalışma */}
      {attSummary && (
        <View style={oz.card}>
          <View style={oz.cardHeader}>
            <MaterialCommunityIcons name={'clock-outline' as any} size={16} color={C.primary} />
            <Text style={oz.cardTitle}>Toplam Çalışma (Bu Ay)</Text>
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={oz.label}>Çalışma süresi</Text>
              <Text style={[oz.value, { color: C.textPrimary }]}>{fmtMinutes(attSummary.total_work_minutes)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={oz.label}>Fazla mesai</Text>
              <Text style={[oz.value, { color: C.warning }]}>{fmtMinutes(attSummary.total_overtime_minutes)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* İzin Bakiyesi */}
      <View style={oz.card}>
        <View style={oz.cardHeader}>
          <MaterialCommunityIcons name={'calendar-star' as any} size={16} color={C.primary} />
          <Text style={oz.cardTitle}>İzin Bakiyesi</Text>
        </View>
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <View style={oz.balanceCircle}>
            <Text style={oz.balanceNum}>{summary.annual_remaining}</Text>
            <Text style={oz.balanceUnit}>gün kalan</Text>
          </View>
          <Text style={[oz.label, { marginTop: 10 }]}>
            Yıllık hak: {summary.annual_entitlement} gün
          </Text>
        </View>
      </View>
    </>
  );
}

function StatGridCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[oz.statCell, { borderTopColor: color, borderTopWidth: 3 }]}>
      <Text style={[oz.statCellVal, { color }]}>{value}</Text>
      <Text style={oz.statCellLabel}>{label}</Text>
    </View>
  );
}

// ─── Leave Form Modal ─────────────────────────────────────────────────────────
function LeaveFormModal({ visible, summaries, preselectedId, onClose, onSaved }: {
  visible: boolean;
  summaries: LeaveSummary[];
  preselectedId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [empId,     setEmpId]     = useState<string | null>(preselectedId);
  const [leaveType, setLeaveType] = useState<LeaveType>('yillik');
  const [startDate, setStartDate] = useState(today);
  const [endDate,   setEndDate]   = useState(today);
  const [reason,    setReason]    = useState('');
  const [saving,    setSaving]    = useState(false);

  const days = useMemo(() => {
    try {
      if (startDate.length === 10 && endDate.length === 10) {
        return calcBusinessDays(startDate, endDate);
      }
      return 0;
    } catch { return 0; }
  }, [startDate, endDate]);

  React.useEffect(() => {
    if (visible) {
      setEmpId(preselectedId);
      setLeaveType('yillik');
      setStartDate(today);
      setEndDate(today);
      setReason('');
    }
  }, [visible, preselectedId]);

  const handleSave = async () => {
    if (!empId) { toast.error('Çalışan seçin.'); return; }
    if (startDate.length !== 10) { toast.error('Geçerli başlangıç tarihi girin.'); return; }
    if (endDate.length !== 10) { toast.error('Geçerli bitiş tarihi girin.'); return; }
    if (endDate < startDate) { toast.error('Bitiş tarihi başlangıçtan önce olamaz.'); return; }
    if (days <= 0) { toast.error('En az 1 iş günü seçin.'); return; }
    setSaving(true);
    try {
      const { error } = await createLeave({
        employee_id: empId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        days_count: days,
        reason: reason.trim() || undefined,
      });
      if (error) throw error;
      toast.success('İzin talebi oluşturuldu.');
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
    finally { setSaving(false); }
  };

  const selectedEmp = summaries.find(s => s.employee_id === empId);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={fm.overlay}>
        <View style={fm.card}>
          <View style={fm.header}>
            <Text style={fm.title}>İzin Talebi</Text>
            <TouchableOpacity style={fm.closeBtn} onPress={onClose}>
              <MaterialCommunityIcons name={'close' as any} size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={fm.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Employee */}
            {preselectedId && selectedEmp ? (
              <View style={fm.readonlyEmp}>
                <MaterialCommunityIcons name={'account' as any} size={15} color={C.primary} />
                <Text style={fm.readonlyEmpText}>{selectedEmp.full_name}</Text>
              </View>
            ) : (
              <>
                <Text style={fm.label}>Çalışan *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {summaries.map(s => (
                      <TouchableOpacity
                        key={s.employee_id}
                        style={[fm.empChip, empId === s.employee_id && fm.empChipActive]}
                        onPress={() => setEmpId(s.employee_id)}
                      >
                        <Text style={[fm.empChipText, empId === s.employee_id && fm.empChipTextActive]}>
                          {s.full_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Leave type */}
            <Text style={fm.label}>İzin Türü *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {LEAVE_TYPES.map(lt => {
                  const tc = LEAVE_TYPE_COLORS[lt];
                  const isActive = leaveType === lt;
                  return (
                    <TouchableOpacity
                      key={lt}
                      style={[fm.typeChip, { borderColor: isActive ? tc.fg : C.borderMid, backgroundColor: isActive ? tc.bg : '#fff' }]}
                      onPress={() => setLeaveType(lt)}
                    >
                      <MaterialCommunityIcons name={LEAVE_TYPE_ICONS[lt] as any} size={14} color={isActive ? tc.fg : C.textMuted} />
                      <Text style={[fm.typeChipText, { color: isActive ? tc.fg : C.textMuted, fontWeight: isActive ? '700' : '500' }]}>
                        {LEAVE_TYPE_LABELS[lt]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Dates */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>Başlangıç *</Text>
                <TextInput
                  style={fm.input}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="2026-04-15"
                  placeholderTextColor={C.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>Bitiş *</Text>
                <TextInput
                  style={fm.input}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="2026-04-19"
                  placeholderTextColor={C.textMuted}
                />
              </View>
            </View>

            {days > 0 && (
              <View style={fm.daysHint}>
                <MaterialCommunityIcons name={'information-outline' as any} size={13} color={C.primary} />
                <Text style={fm.daysHintText}>{days} iş günü</Text>
              </View>
            )}

            {/* Reason */}
            <Text style={fm.label}>Sebep (opsiyonel)</Text>
            <TextInput
              style={[fm.input, { minHeight: 64, textAlignVertical: 'top' }]}
              value={reason}
              onChangeText={setReason}
              placeholder="İzin sebebi..."
              placeholderTextColor={C.textMuted}
              multiline
            />
          </ScrollView>

          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={fm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fm.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={fm.saveText}>Talep Oluştur</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Attendance Modal ─────────────────────────────────────────────────────────
function AttendanceModal({ visible, employeeId, employeeName, onClose, onSaved }: {
  visible: boolean;
  employeeId: string | null;
  employeeName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [workDate,  setWorkDate]  = useState(today);
  const [status,    setStatus]    = useState<AttendanceStatus>('normal');
  const [checkIn,   setCheckIn]   = useState('09:00');
  const [checkOut,  setCheckOut]  = useState('18:00');
  const [overtime,  setOvertime]  = useState('');
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);

  const showTime = ATT_WITH_TIME.includes(status);

  React.useEffect(() => {
    if (visible) {
      setWorkDate(today); setStatus('normal');
      setCheckIn('09:00'); setCheckOut('18:00');
      setOvertime(''); setNotes('');
    }
  }, [visible]);

  const handleSave = async () => {
    if (!employeeId) { toast.error('Çalışan seçilmedi.'); return; }
    if (workDate.length !== 10) { toast.error('Geçerli bir tarih girin (YYYY-AA-GG).'); return; }
    setSaving(true);
    try {
      if (showTime && checkIn) {
        // Giriş/çıkış saati varsa → manualAttendanceRPC (recorded_by izlenebilir)
        const { error } = await manualAttendanceRPC({
          employeeId,
          workDate,
          checkIn,
          checkOut: checkOut || undefined,
          notes: notes.trim() || undefined,
        });
        if (error) throw error;
        // Durumu ayrıca güncelle (status, overtime)
        await upsertAttendance({
          employee_id: employeeId,
          work_date: workDate,
          status,
          overtime_minutes: status === 'normal' ? (parseInt(overtime) || 0) : 0,
        });
      } else {
        // Saat yok (devamsız, izinli vb.) → direkt upsert
        const { error } = await upsertAttendance({
          employee_id: employeeId,
          work_date: workDate,
          status,
          notes: notes.trim() || undefined,
        });
        if (error) throw error;
      }
      toast.success('Devam kaydı eklendi.');
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={fm.overlay}>
        <View style={fm.card}>
          <View style={fm.header}>
            <View style={{ flex: 1 }}>
              <Text style={fm.title}>Devam Kaydı</Text>
              {employeeName ? <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>{employeeName}</Text> : null}
            </View>
            <TouchableOpacity style={fm.closeBtn} onPress={onClose}>
              <MaterialCommunityIcons name={'close' as any} size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={fm.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Work date */}
            <Text style={fm.label}>Tarih *</Text>
            <TextInput
              style={fm.input}
              value={workDate}
              onChangeText={setWorkDate}
              placeholder="2026-04-23"
              placeholderTextColor={C.textMuted}
            />

            {/* Status grid */}
            <Text style={fm.label}>Durum *</Text>
            <View style={fm.statusGrid}>
              {ATT_STATUSES.map(st => {
                const cfg = ATTENDANCE_STATUS_CFG[st];
                const isActive = status === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[
                      fm.statusChip,
                      { borderColor: isActive ? cfg.fg : C.borderMid, backgroundColor: isActive ? cfg.bg : '#fff' },
                    ]}
                    onPress={() => setStatus(st)}
                  >
                    <Text style={[fm.statusChipText, { color: isActive ? cfg.fg : C.textMuted, fontWeight: isActive ? '700' : '500' }]}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Times */}
            {showTime && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={fm.label}>Giriş Saati</Text>
                  <TextInput
                    style={fm.input}
                    value={checkIn}
                    onChangeText={setCheckIn}
                    placeholder="09:00"
                    placeholderTextColor={C.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={fm.label}>Çıkış Saati</Text>
                  <TextInput
                    style={fm.input}
                    value={checkOut}
                    onChangeText={setCheckOut}
                    placeholder="18:00"
                    placeholderTextColor={C.textMuted}
                  />
                </View>
              </View>
            )}

            {/* Overtime */}
            {status === 'normal' && (
              <>
                <Text style={fm.label}>Fazla Mesai (dk)</Text>
                <TextInput
                  style={fm.input}
                  value={overtime}
                  onChangeText={setOvertime}
                  placeholder="0"
                  placeholderTextColor={C.textMuted}
                  keyboardType="number-pad"
                />
              </>
            )}

            {/* Notes */}
            <Text style={fm.label}>Notlar (opsiyonel)</Text>
            <TextInput
              style={[fm.input, { minHeight: 52, textAlignVertical: 'top' }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ek not..."
              placeholderTextColor={C.textMuted}
              multiline
            />
          </ScrollView>

          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={fm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fm.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={fm.saveText}>Kaydet</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({ visible, onClose, onConfirm }: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason,  setReason]  = useState('');
  const [saving,  setSaving]  = useState(false);

  React.useEffect(() => { if (visible) setReason(''); }, [visible]);

  const handleConfirm = async () => {
    setSaving(true);
    await onConfirm(reason.trim());
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={fm.overlay}>
        <View style={[fm.card, { maxWidth: 400 }]}>
          <View style={fm.header}>
            <Text style={fm.title}>İzni Reddet</Text>
            <TouchableOpacity style={fm.closeBtn} onPress={onClose}>
              <MaterialCommunityIcons name={'close' as any} size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={fm.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={fm.label}>Red Sebebi</Text>
            <TextInput
              style={[fm.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={reason}
              onChangeText={setReason}
              placeholder="Reddetme sebebini yazın..."
              placeholderTextColor={C.textMuted}
              multiline
              autoFocus
            />
          </ScrollView>
          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={fm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fm.saveBtn, { backgroundColor: C.danger }, saving && { opacity: 0.5 }]}
              onPress={handleConfirm}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={fm.saveText}>Reddet</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#fff' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 10 },
  title:        { fontSize: 20, fontWeight: '800', color: C.textPrimary, letterSpacing: -0.3 },
  subtitle:     { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: C.primary },
  addBtnText:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  pendingBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  pendingBtnActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  pendingBtnText:   { fontSize: 12, fontWeight: '700', color: '#B45309' },
  pendingBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pendingBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  body:         { flex: 1, flexDirection: 'row' },
  leftPanel:    { width: 340, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: '#fff' },
  rightPanel:   { flex: 1, backgroundColor: '#FAFBFC' },
  emptyRight:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyRightText: { fontSize: 15, color: C.textMuted, fontWeight: '600' },
  emptyList:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 60 },
  emptyListText:{ fontSize: 14, color: C.textMuted, fontWeight: '600' },
  emptyState:   { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyStateText: { fontSize: 14, color: C.textMuted, fontWeight: '600' },
  footerAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.primary, backgroundColor: C.primaryBg, justifyContent: 'center', marginTop: 4 },
  footerAddBtnText: { fontSize: 13, fontWeight: '700', color: C.primary },
  mobileBackBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backBtnText:  { fontSize: 14, fontWeight: '600', color: C.primary },
  mobileEmpName: { flex: 1, fontSize: 15, fontWeight: '700', color: C.textPrimary },
});

const er = StyleSheet.create({
  card:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  cardSelected: { borderColor: C.primary, backgroundColor: '#F0F7FF' },
  selectedBorder: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.primary },
  avatar:       { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:   { fontSize: 15, fontWeight: '800' },
  name:         { fontSize: 13, fontWeight: '700', color: C.textPrimary, flexShrink: 1 },
  roleBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleText:     { fontSize: 10, fontWeight: '700' },
  onLeavePill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: '#DBEAFE' },
  onLeaveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
  onLeavePillText: { fontSize: 10, fontWeight: '700', color: C.primary },
  pendingBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pendingBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  annualLabel:  { fontSize: 10, color: C.textSecondary, fontWeight: '500' },
  progressBg:   { height: 4, borderRadius: 2, backgroundColor: C.border },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: C.primary },
});

const rp = StyleSheet.create({
  tabBarWrap: { paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: '#fff' },
  tabBar:     { flexDirection: 'row', backgroundColor: C.border, borderRadius: 12, padding: 3 },
  tabBtn:     { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#fff' },
  tabText:    { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  tabTextActive: { color: C.textPrimary, fontWeight: '700' },
});

const lt = StyleSheet.create({
  pill:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.borderMid, backgroundColor: '#fff' },
  pillActive:   { borderColor: C.primary, backgroundColor: C.primaryBg },
  pillText:     { fontSize: 12, fontWeight: '500', color: C.textSecondary },
  pillTextActive: { color: C.primary, fontWeight: '700' },
});

const lc = StyleSheet.create({
  card:       { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, gap: 0 },
  typeIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeName:   { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  dates:      { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  days:       { fontSize: 11, color: C.textMuted, marginTop: 1 },
  reason:     { fontSize: 11, color: C.textMuted, fontStyle: 'italic', marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '700' },
  delBtn:     { width: 28, height: 28, borderRadius: 8, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  rejectReasonBox: { marginTop: 10, backgroundColor: C.dangerBg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.dangerBorder },
  rejectReasonLabel: { fontSize: 10, fontWeight: '700', color: C.danger, marginBottom: 3 },
  rejectReasonText: { fontSize: 12, color: C.danger },
  pendingInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    backgroundColor: C.warningBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: C.warningBorder },
  pendingInfoText: { fontSize: 12, color: C.warning, fontWeight: '500', flex: 1 },
});

const dt = StyleSheet.create({
  monthRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 4 },
  monthArrow: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 15, fontWeight: '700', color: C.textPrimary, minWidth: 120, textAlign: 'center' },
  summaryChips: { flexDirection: 'row', gap: 8 },
  miniStat:   { flex: 1, borderRadius: 10, padding: 10, borderWidth: 1, alignItems: 'center', gap: 4 },
  miniStatVal: { fontSize: 15, fontWeight: '800' },
  miniStatLabel: { fontSize: 9, fontWeight: '600', color: C.textSecondary, textAlign: 'center' },
  calCard:    { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border },
  calHeaderRow: { flexDirection: 'row', marginBottom: 6 },
  calHeaderCell: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase' },
  calGrid:    { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:    { width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2, gap: 1 },
  calCellWeekend: { backgroundColor: '#F8FAFC' },
  calDayNum:  { fontSize: 11, fontWeight: '700', color: C.textPrimary },
  calDot:     { width: 5, height: 5, borderRadius: 3 },
  calDayStatus: { fontSize: 8, fontWeight: '600', textAlign: 'center' },
});

const ac = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border },
  date:       { fontSize: 13, fontWeight: '700', color: C.textPrimary },
  time:       { fontSize: 11, color: C.textSecondary, marginTop: 1 },
  notes:      { fontSize: 11, color: C.textMuted, fontStyle: 'italic', marginTop: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '700' },
  methodPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start', marginTop: 1 },
  methodText: { fontSize: 9, fontWeight: '700' },
  delBtn:     { width: 28, height: 28, borderRadius: 8, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
});

const oz = StyleSheet.create({
  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 12 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  label:        { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  value:        { fontSize: 14, fontWeight: '700' },
  progressBg:   { height: 6, borderRadius: 3, backgroundColor: C.border },
  progressFill: { height: 6, borderRadius: 3 },
  progressHint: { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
  statGrid:     { flexDirection: 'row', gap: 8 },
  statCell:     { flex: 1, backgroundColor: C.border, borderRadius: 10, padding: 10, alignItems: 'center', gap: 4 },
  statCellVal:  { fontSize: 20, fontWeight: '800' },
  statCellLabel:{ fontSize: 10, fontWeight: '600', color: C.textSecondary },
  balanceCircle:{ width: 100, height: 100, borderRadius: 50, borderWidth: 6, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', gap: 2 },
  balanceNum:   { fontSize: 28, fontWeight: '800', color: C.primary },
  balanceUnit:  { fontSize: 10, fontWeight: '600', color: C.textSecondary },
});

const fm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:       { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '92%', overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  title:      { flex: 1, fontSize: 16, fontWeight: '700', color: C.textPrimary },
  closeBtn:   { width: 28, height: 28, borderRadius: 8, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  body:       { padding: 20, gap: 4 },
  label:      { fontSize: 10, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  input:      { borderWidth: 1, borderColor: C.borderMid, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.textPrimary, backgroundColor: '#fff' },
  readonlyEmp:{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: C.primaryBg, borderWidth: 1, borderColor: C.primary + '40', marginBottom: 4 },
  readonlyEmpText: { fontSize: 14, fontWeight: '700', color: C.primary },
  empChip:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: C.borderMid, backgroundColor: '#fff' },
  empChipActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  empChipText:  { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  empChipTextActive: { color: C.primary, fontWeight: '700' },
  typeChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  typeChipText:{ fontSize: 12 },
  daysHint:    { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, backgroundColor: C.primaryBg, borderWidth: 1, borderColor: C.primary + '30', marginTop: 4 },
  daysHintText:{ fontSize: 13, fontWeight: '700', color: C.primary },
  statusGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip:  { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  statusChipText: { fontSize: 11 },
  footer:     { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.border },
  cancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.borderMid, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: C.textSecondary },
  saveBtn:    { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' },
  saveText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});
