import React, { useState, useMemo, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, Pressable,
  Modal, TextInput, ActivityIndicator, Alert,
  Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toast } from '../../../core/ui/Toast';
import { DS } from '../../../core/theme/dsTokens';
import { DatePicker } from '../../../core/ui/DatePicker';

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

import {
  ChevronLeft, ChevronRight, X, Check, Ban, Trash2,
  CalendarPlus, CalendarCheck, Calendar, CalendarHeart,
  Clock, Info, User, UserRoundSearch, UserX, UserPen,
  Palmtree, MapPinCheck, QrCode,
} from 'lucide-react-native';

// ─── Lucide icon map for leave type icons (from api) ─────────────────────────
const LUCIDE_ICON_MAP: Record<string, React.FC<any>> = {
  'beach': Palmtree,
  'calendar-blank': Calendar,
  'calendar-blank-outline': Calendar,
  'calendar-check': CalendarCheck,
  'calendar-check-outline': CalendarCheck,
  'calendar-plus': CalendarPlus,
  'calendar-star': CalendarHeart,
  'clock-outline': Clock,
  'information-outline': Info,
  'account': User,
  'account-arrow-left-outline': UserRoundSearch,
  'account-off-outline': UserX,
  'account-edit': UserPen,
  'map-marker-check': MapPinCheck,
  'qrcode': QrCode,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'close': X,
  'check': Check,
  'cancel': Ban,
  'trash-can-outline': Trash2,
};

function LucideIcon({ name, size = 16, color = DS.ink[500], strokeWidth = 1.6 }: {
  name: string; size?: number; color?: string; strokeWidth?: number;
}) {
  const Icon = LUCIDE_ICON_MAP[name];
  if (!Icon) return null;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}

// ─── Status icon map for leave status cfg ────────────────────────────────────
const STATUS_ICON_MAP: Record<string, React.FC<any>> = {
  'clock-outline': Clock,
  'check': Check,
  'close': X,
  'cancel': Ban,
};

function StatusIcon({ name, size = 11, color }: { name: string; size?: number; color: string }) {
  const Icon = STATUS_ICON_MAP[name] || LUCIDE_ICON_MAP[name];
  if (!Icon) return null;
  return <Icon size={size} color={color} strokeWidth={1.8} />;
}

// ─── Patterns tokens ────────────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  // @ts-ignore web
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

const tableCard = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden' as const,
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

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
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const px = isDesktop ? 24 : 16;
  const gap = isDesktop ? 10 : 8;
  const isEmbedded = useContext(HubContext);
  const safeEdges  = isEmbedded ? ([] as any) : (['top'] as any);
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
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <UserRoundSearch size={40} color={DS.ink[300]} strokeWidth={1.4} />
      <Text style={{ fontSize: 15, color: DS.ink[400], fontWeight: '600' }}>Sol panelden çalışan seçin</Text>
    </View>
  );

  const Wrapper = isEmbedded ? View : SafeAreaView;
  const wrapperProps = isEmbedded ? { style: { flex: 1 } } : { style: { flex: 1 }, edges: safeEdges };

  return (
    <Wrapper {...wrapperProps}>
      {/* Header — only show when NOT embedded in HRHubScreen */}
      {!isEmbedded && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 10, paddingHorizontal: px }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.3 }}>İzin & Devam</Text>
            <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 2 }}>
              {summaries.length} çalışan · {onLeaveCount > 0 ? `${onLeaveCount} izinde` : 'izinde kimse yok'}
            </Text>
          </View>
        </View>
      )}

      {/* Action bar — always visible */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: px, paddingVertical: 8, gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, color: DS.ink[500] }}>
          {summaries.length} çalışan · {onLeaveCount > 0 ? `${onLeaveCount} izinde` : 'izinde kimse yok'}
        </Text>
        {pendingCount > 0 && (
          <Pressable
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
              borderWidth: 1.5, borderColor: CHIP_TONES.warning.fg,
              backgroundColor: showOnlyPending ? CHIP_TONES.warning.fg : CHIP_TONES.warning.bg,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            } as any}
            onPress={() => setShowOnlyPending(p => !p)}
          >
            <View style={{
              minWidth: 18, height: 18, borderRadius: 9,
              backgroundColor: showOnlyPending ? '#fff' : CHIP_TONES.warning.fg,
              alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
            }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: showOnlyPending ? CHIP_TONES.warning.fg : '#fff' }}>{pendingCount}</Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: showOnlyPending ? '#fff' : CHIP_TONES.warning.fg }}>Bekliyor</Text>
          </Pressable>
        )}
        <Pressable
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
            backgroundColor: DS.ink[900],
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          } as any}
          onPress={() => setLeaveOpen(true)}
        >
          <CalendarPlus size={15} color="#fff" strokeWidth={1.8} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>İzin Talebi</Text>
        </Pressable>
      </View>

      {/* Body */}
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Left panel — fixed 340px */}
          <View style={{ width: 340, borderRightWidth: 1, borderRightColor: 'rgba(0,0,0,0.06)' }}>
            {employeeList}
          </View>
          {/* Right panel */}
          <View style={{ flex: 1 }}>
            {rightPanel}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {selectedId && selectedSummary ? (
            <View style={{ flex: 1 }}>
              {/* Mobile back header */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
                paddingHorizontal: px,
              }}>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 2, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) } as any} onPress={() => setSelectedId(null)}>
                  <ChevronLeft size={20} color={DS.ink[500]} strokeWidth={1.8} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[500] }}>Geri</Text>
                </Pressable>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: DS.ink[900] }} numberOfLines={1}>{selectedSummary.full_name}</Text>
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
    </Wrapper>
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 60 }}>
        <UserX size={40} color={DS.ink[300]} strokeWidth={1.4} />
        <Text style={{ fontSize: 14, color: DS.ink[400], fontWeight: '600' }}>Çalışan bulunamadı</Text>
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: px, paddingBottom: 60, gap }}
      showsVerticalScrollIndicator={false}
    >
      {summaries.map(item => (
        <EmployeeRow
          key={item.employee_id}
          summary={item}
          selected={item.employee_id === selectedId}
          onPress={() => onSelect(item.employee_id)}
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
  const role = ROLE_COLORS[summary.role as keyof typeof ROLE_COLORS] ?? { fg: DS.ink[500], bg: DS.ink[100] };
  const initials = summary.full_name
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const usedPct = summary.annual_entitlement > 0
    ? Math.min(summary.annual_used / summary.annual_entitlement, 1)
    : 0;

  return (
    <Pressable
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: selected ? DS.ink[50] : '#FFFFFF',
        borderRadius: 24, padding: 14,
        borderWidth: 1, borderColor: selected ? DS.ink[900] : 'rgba(0,0,0,0.06)',
        overflow: 'hidden',
        // @ts-ignore web
        boxShadow: selected ? '0 2px 8px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
      } as any}
      onPress={onPress}
    >
      {selected && (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: DS.ink[900] }} />
      )}

      {/* Avatar */}
      <View style={{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: role.bg }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: role.fg }}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900], flexShrink: 1 }} numberOfLines={1}>{summary.full_name}</Text>
          {summary.currently_on_leave && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9999, backgroundColor: CHIP_TONES.info.bg }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CHIP_TONES.info.fg }} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.info.fg }}>İzinde</Text>
            </View>
          )}
          {summary.pending_count > 0 && (
            <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{summary.pending_count}</Text>
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: role.bg, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: role.fg }}>
            {ROLE_LABELS[summary.role as keyof typeof ROLE_LABELS] ?? summary.role}
          </Text>
        </View>

        {/* Annual leave progress */}
        <View style={{ gap: 3, marginTop: 2 }}>
          <Text style={{ fontSize: 10, color: DS.ink[500], fontWeight: '500' }}>
            {summary.annual_used} / {summary.annual_entitlement} gün kullanıldı
          </Text>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: DS.ink[100] }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: DS.ink[400], width: `${usedPct * 100}%` as any }} />
          </View>
        </View>
      </View>

      <ChevronRight size={18} color={DS.ink[400]} strokeWidth={1.6} />
    </Pressable>
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
      {/* Tab bar — pill-group */}
      <View style={{ paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)', paddingHorizontal: px }}>
        <View style={{ flexDirection: 'row', backgroundColor: DS.ink[100], borderRadius: 9999, padding: 4 }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={[
                  {
                    flex: 1, paddingVertical: 7, borderRadius: 9999, alignItems: 'center',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  } as any,
                  active && {
                    backgroundColor: '#FFF',
                    // @ts-ignore web
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  },
                ]}
                onPress={() => setTab(t.key)}
              >
                <Text style={{
                  fontSize: 13,
                  fontWeight: active ? '700' : '600',
                  color: active ? DS.ink[900] : DS.ink[500],
                }}>{t.label}</Text>
              </Pressable>
            );
          })}
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
      {/* Filter pills — pill-group */}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', backgroundColor: DS.ink[100], borderRadius: 9999, padding: 4, marginBottom: 4 }}>
        {FILTERS.map(f => {
          const active = leaveFilter === f.key;
          return (
            <Pressable
              key={f.key}
              style={[
                {
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                } as any,
                active && {
                  backgroundColor: '#FFF',
                  // @ts-ignore web
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                },
              ]}
              onPress={() => setLeaveFilter(f.key)}
            >
              <Text style={{
                fontSize: 12,
                fontWeight: active ? '700' : '600',
                color: active ? DS.ink[900] : DS.ink[400],
              }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color={DS.ink[400]} />
        </View>
      ) : leaves.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Calendar size={36} color={DS.ink[300]} strokeWidth={1.4} />
          <Text style={{ fontSize: 14, color: DS.ink[400], fontWeight: '600' }}>İzin kaydı bulunamadı</Text>
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

      <Pressable
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingVertical: 14, borderRadius: 9999,
          borderWidth: 1.5, borderColor: DS.ink[900],
          justifyContent: 'center', marginTop: 4,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        } as any}
        onPress={onAdd}
      >
        <CalendarPlus size={15} color={DS.ink[900]} strokeWidth={1.8} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>İzin Talebi Ekle</Text>
      </Pressable>
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
    <View style={{
      ...cardSolid,
      padding: 16,
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 0,
    }}>
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        {/* Type icon */}
        <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: tc.bg }}>
          <LucideIcon name={icon} size={18} color={tc.fg} />
        </View>

        {/* Info */}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>{LEAVE_TYPE_LABELS[leave.leave_type]}</Text>
          <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>{fmtDateRange(leave.start_date, leave.end_date)}</Text>
          <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{leave.days_count} iş günü</Text>
          {leave.reason ? <Text style={{ fontSize: 11, color: DS.ink[400], fontStyle: 'italic', marginTop: 2 }} numberOfLines={2}>{leave.reason}</Text> : null}
        </View>

        {/* Status + delete */}
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, backgroundColor: sc2.bg }}>
            <StatusIcon name={sc2.icon} size={11} color={sc2.fg} />
            <Text style={{ fontSize: 10, fontWeight: '700', color: sc2.fg }}>{sc2.label}</Text>
          </View>
          <Pressable
            style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}
            onPress={() => onDelete(leave.id)}
          >
            <Trash2 size={14} color={DS.ink[300]} strokeWidth={1.6} />
          </Pressable>
        </View>
      </View>

      {/* Action buttons — sadece mesul müdür ve admin görebilir */}
      {leave.status === 'bekliyor' && canApprove && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Pressable
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
              backgroundColor: CHIP_TONES.success.bg,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any}
            onPress={() => onApprove(leave.id)}
          >
            <Check size={13} color={CHIP_TONES.success.fg} strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: CHIP_TONES.success.fg }}>Onayla</Text>
          </Pressable>
          <Pressable
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
              backgroundColor: CHIP_TONES.danger.bg,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any}
            onPress={() => onReject(leave.id)}
          >
            <X size={13} color={CHIP_TONES.danger.fg} strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: CHIP_TONES.danger.fg }}>Reddet</Text>
          </Pressable>
        </View>
      )}
      {/* Onay yetkisi olmayan kullanıcıya bilgi mesajı */}
      {leave.status === 'bekliyor' && !canApprove && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
          backgroundColor: CHIP_TONES.warning.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7,
        }}>
          <Clock size={13} color={CHIP_TONES.warning.fg} strokeWidth={1.8} />
          <Text style={{ fontSize: 12, color: CHIP_TONES.warning.fg, fontWeight: '500', flex: 1 }}>Mesul müdür / yönetici onayı bekleniyor</Text>
        </View>
      )}
      {leave.status === 'onaylandi' && canApprove && (
        <View style={{ marginTop: 10 }}>
          <Pressable
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
              backgroundColor: DS.ink[100],
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any}
            onPress={() => onCancel(leave.id)}
          >
            <Ban size={13} color={DS.ink[500]} strokeWidth={1.8} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[500] }}>İptal</Text>
          </Pressable>
        </View>
      )}
      {leave.reject_reason && leave.status === 'reddedildi' && (
        <View style={{
          marginTop: 10, backgroundColor: CHIP_TONES.danger.bg, borderRadius: 12, padding: 10,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.danger.fg, marginBottom: 3 }}>Red sebebi:</Text>
          <Text style={{ fontSize: 12, color: CHIP_TONES.danger.fg }}>{leave.reject_reason}</Text>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 4 }}>
        <Pressable
          style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) } as any}
          onPress={prevMonth}
        >
          <ChevronLeft size={20} color={DS.ink[500]} strokeWidth={1.6} />
        </Pressable>
        <Text style={{ ...DISPLAY, fontSize: 15, fontWeight: '700', color: DS.ink[900], minWidth: 120, textAlign: 'center' }}>{monthLabel}</Text>
        <Pressable
          style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) } as any}
          onPress={nextMonth}
        >
          <ChevronRight size={20} color={DS.ink[500]} strokeWidth={1.6} />
        </Pressable>
      </View>

      {/* Monthly summary chips */}
      {attSummary && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MiniStat label="Normal" value={attSummary.normal_days} color={CHIP_TONES.success.fg} />
          <MiniStat label="Geç Giriş" value={attSummary.late_days} color={CHIP_TONES.warning.fg} />
          <MiniStat label="Devamsız" value={attSummary.absent_days} color={CHIP_TONES.danger.fg} />
          <MiniStat label="Toplam Süre" value={fmtMinutes(attSummary.total_work_minutes)} color={DS.ink[500]} isText />
        </View>
      )}

      {/* Calendar grid */}
      <View style={{
        ...cardSolid,
        padding: 12,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
      }}>
        {/* Header row: Mon–Sun */}
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(d => (
            <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: DS.ink[400], textTransform: 'uppercase' }}>{d}</Text>
          ))}
        </View>
        {/* Day cells */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((day, idx) => {
            if (day === null) return <View key={`e-${idx}`} style={{ width: `${100 / 7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2, gap: 1 }} />;
            const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const rec = recordMap[dateStr];
            const colIdx = idx % 7;
            const isWeekend = colIdx === 5 || colIdx === 6;
            const cfg = rec ? ATTENDANCE_STATUS_CFG[rec.status] : null;
            return (
              <View key={dateStr} style={{
                width: `${100 / 7}%` as any, aspectRatio: 1,
                alignItems: 'center', justifyContent: 'center', padding: 2, gap: 1,
                backgroundColor: isWeekend ? '#F8FAFC' : undefined,
                borderRadius: 8,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: rec ? DS.ink[900] : DS.ink[400] }}>{day}</Text>
                {cfg && (
                  <>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: cfg.fg }} />
                    <Text style={{ fontSize: 8, fontWeight: '600', textAlign: 'center', color: cfg.fg }} numberOfLines={1}>
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
          <ActivityIndicator color={DS.ink[400]} />
        </View>
      ) : records.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Calendar size={36} color={DS.ink[300]} strokeWidth={1.4} />
          <Text style={{ fontSize: 14, color: DS.ink[400], fontWeight: '600' }}>Bu ay için devam kaydı yok</Text>
        </View>
      ) : (
        records.map(r => (
          <AttendanceRow key={r.id} record={r} onDelete={onDelete} />
        ))
      )}

      <Pressable
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingVertical: 14, borderRadius: 9999,
          borderWidth: 1.5, borderColor: DS.ink[900],
          justifyContent: 'center', marginTop: 4,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        } as any}
        onPress={onAdd}
      >
        <CalendarCheck size={15} color={DS.ink[900]} strokeWidth={1.8} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>Devam Kaydı Ekle</Text>
      </Pressable>
    </>
  );
}

function MiniStat({ label, value, color, isText = false }: {
  label: string; value: number | string; color: string; isText?: boolean;
}) {
  return (
    <View style={{
      flex: 1, borderRadius: 12, padding: 10, borderWidth: 1,
      alignItems: 'center', gap: 4,
      borderColor: color + '30', backgroundColor: color + '10',
    }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color }}>{isText ? value : String(value)}</Text>
      <Text style={{ fontSize: 9, fontWeight: '600', color: DS.ink[500], textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const METHOD_CFG: Record<string, { label: string; fg: string; bg: string; icon: string }> = {
  qr_gps:  { label: 'QR+GPS',  fg: '#059669', bg: '#D1FAE5', icon: 'map-marker-check' },
  qr_only: { label: 'QR',      fg: '#7C3AED', bg: '#EDE9FE', icon: 'qrcode' },
  manual:  { label: 'Manuel',  fg: DS.ink[500], bg: DS.ink[100], icon: 'account-edit' },
};

function AttendanceRow({ record: r, onDelete }: {
  record: EmployeeAttendance;
  onDelete: (id: string) => void;
}) {
  const cfg    = ATTENDANCE_STATUS_CFG[r.status];
  const method = r.check_in_method ? METHOD_CFG[r.check_in_method] : null;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      ...cardSolid,
      padding: 14,
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>{fmtDate(r.work_date)}</Text>
        <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 1 }}>
          {r.check_in ? `${r.check_in} – ${r.check_out ?? '?'}` : '—'}
          {r.work_minutes ? `  ·  ${fmtMinutes(r.work_minutes)}` : ''}
          {r.overtime_minutes > 0 ? `  +${fmtMinutes(r.overtime_minutes)} OT` : ''}
        </Text>
        {method && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 3,
            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
            alignSelf: 'flex-start', marginTop: 1,
            backgroundColor: method.bg,
          }}>
            <LucideIcon name={method.icon} size={10} color={method.fg} />
            <Text style={{ fontSize: 9, fontWeight: '700', color: method.fg }}>{method.label}</Text>
          </View>
        )}
        {r.notes ? <Text style={{ fontSize: 11, color: DS.ink[400], fontStyle: 'italic', marginTop: 1 }} numberOfLines={1}>{r.notes}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, backgroundColor: cfg.bg }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.fg }}>{cfg.label}</Text>
      </View>
      <Pressable
        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) } as any}
        onPress={() => onDelete(r.id)}
      >
        <Trash2 size={14} color={DS.ink[300]} strokeWidth={1.6} />
      </Pressable>
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
      <View style={{ ...cardSolid, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Palmtree size={16} color={DS.ink[500]} strokeWidth={1.6} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>Bu Yıl İzin</Text>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>Kullanılan</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>{summary.annual_used} gün</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>Kalan</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: CHIP_TONES.success.fg }}>{summary.annual_remaining} gün</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>Toplam hak</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[500] }}>{summary.annual_entitlement} gün</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: DS.ink[100] }}>
            <View style={{ height: 6, borderRadius: 3, width: `${usedPct * 100}%` as any, backgroundColor: DS.ink[400] }} />
          </View>
          <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500' }}>{Math.round(usedPct * 100)}% kullanıldı</Text>
        </View>
      </View>

      {/* Bu Ay Devam */}
      {attSummary && (
        <View style={{ ...cardSolid, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CalendarCheck size={16} color={DS.ink[500]} strokeWidth={1.6} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>Bu Ay Devam</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatGridCell label="Normal" value={attSummary.normal_days} color={CHIP_TONES.success.fg} />
            <StatGridCell label="Geç" value={attSummary.late_days} color={CHIP_TONES.warning.fg} />
            <StatGridCell label="Devamsız" value={attSummary.absent_days} color={CHIP_TONES.danger.fg} />
            <StatGridCell label="İzinli" value={attSummary.leave_days} color={CHIP_TONES.info.fg} />
          </View>
        </View>
      )}

      {/* Toplam Çalışma */}
      {attSummary && (
        <View style={{ ...cardSolid, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color={DS.ink[500]} strokeWidth={1.6} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>Toplam Çalışma (Bu Ay)</Text>
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>Çalışma süresi</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>{fmtMinutes(attSummary.total_work_minutes)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>Fazla mesai</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: CHIP_TONES.warning.fg }}>{fmtMinutes(attSummary.total_overtime_minutes)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* İzin Bakiyesi */}
      <View style={{ ...cardSolid, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CalendarHeart size={16} color={DS.ink[500]} strokeWidth={1.6} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>İzin Bakiyesi</Text>
        </View>
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            borderWidth: 6, borderColor: DS.ink[300],
            alignItems: 'center', justifyContent: 'center', gap: 2,
          }}>
            <Text style={{ ...DISPLAY, fontSize: 28, fontWeight: '800', color: DS.ink[900] }}>{summary.annual_remaining}</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: DS.ink[500] }}>gün kalan</Text>
          </View>
          <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500', marginTop: 10 }}>
            Yıllık hak: {summary.annual_entitlement} gün
          </Text>
        </View>
      </View>
    </>
  );
}

function StatGridCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{
      flex: 1, backgroundColor: DS.ink[100], borderRadius: 12, padding: 10,
      alignItems: 'center', gap: 4,
      borderTopColor: color, borderTopWidth: 3,
    }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', color: DS.ink[500] }}>{label}</Text>
    </View>
  );
}

// ─── Modal shared styles ─────────────────────────────────────────────────────
const modalOverlay = {
  flex: 1, backgroundColor: 'rgba(15,23,42,0.45)',
  justifyContent: 'center' as const, alignItems: 'center' as const, padding: 24,
};
const modalCard = {
  backgroundColor: '#FFFFFF', borderRadius: 24, width: '100%' as any,
  maxWidth: 520, maxHeight: '92%' as any, overflow: 'hidden' as const,
  // @ts-ignore web
  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
};
const modalHeader = {
  flexDirection: 'row' as const, alignItems: 'center' as const,
  paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
  borderBottomWidth: 1, borderBottomColor: DS.ink[100],
};
const modalTitle = { flex: 1, fontSize: 16, fontWeight: '700' as const, color: DS.ink[900] };
const modalCloseBtn = {
  width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[100],
  alignItems: 'center' as const, justifyContent: 'center' as const,
};
const modalBody = { padding: 20, gap: 4 };
const modalLabel = {
  fontSize: 10, fontWeight: '700' as const, color: DS.ink[500],
  textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 12, marginBottom: 6,
};
const modalInput = {
  borderWidth: 1, borderColor: DS.ink[200], borderRadius: 12,
  paddingHorizontal: 12, paddingVertical: 10,
  fontSize: 14, color: DS.ink[900], backgroundColor: '#FFFFFF',
};
const modalFooter = {
  flexDirection: 'row' as const, gap: 10,
  paddingHorizontal: 20, paddingVertical: 14,
  borderTopWidth: 1, borderTopColor: DS.ink[100],
};
const modalCancelBtn = {
  flex: 1, paddingVertical: 12, borderRadius: 9999,
  borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center' as const,
};
const modalCancelText = { fontSize: 14, fontWeight: '600' as const, color: DS.ink[500] };
const modalSaveBtn = {
  flex: 2, paddingVertical: 12, borderRadius: 9999,
  backgroundColor: DS.ink[900], alignItems: 'center' as const,
};
const modalSaveText = { fontSize: 14, fontWeight: '700' as const, color: '#fff' };

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
      <View style={modalOverlay}>
        <View style={modalCard}>
          <View style={modalHeader}>
            <Text style={modalTitle}>İzin Talebi</Text>
            <Pressable style={modalCloseBtn} onPress={onClose}>
              <X size={18} color={DS.ink[400]} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Employee */}
            {preselectedId && selectedEmp ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                padding: 10, borderRadius: 12, backgroundColor: DS.ink[100],
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginBottom: 4,
              }}>
                <User size={15} color={DS.ink[500]} strokeWidth={1.8} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>{selectedEmp.full_name}</Text>
              </View>
            ) : (
              <>
                <Text style={modalLabel}>Çalışan *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {summaries.map(item => (
                      <Pressable
                        key={item.employee_id}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                          borderWidth: 1.5,
                          borderColor: empId === item.employee_id ? DS.ink[900] : DS.ink[200],
                          backgroundColor: empId === item.employee_id ? DS.ink[50] : '#FFFFFF',
                        }}
                        onPress={() => setEmpId(item.employee_id)}
                      >
                        <Text style={{
                          fontSize: 12,
                          color: empId === item.employee_id ? DS.ink[900] : DS.ink[500],
                          fontWeight: empId === item.employee_id ? '700' : '500',
                        }}>
                          {item.full_name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Leave type */}
            <Text style={modalLabel}>İzin Türü *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {LEAVE_TYPES.map(lt => {
                  const tc = LEAVE_TYPE_COLORS[lt];
                  const isActive = leaveType === lt;
                  return (
                    <Pressable
                      key={lt}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                        borderWidth: 1.5,
                        borderColor: isActive ? tc.fg : DS.ink[200],
                        backgroundColor: isActive ? tc.bg : '#FFFFFF',
                      }}
                      onPress={() => setLeaveType(lt)}
                    >
                      <LucideIcon name={LEAVE_TYPE_ICONS[lt]} size={14} color={isActive ? tc.fg : DS.ink[400]} />
                      <Text style={{ fontSize: 12, color: isActive ? tc.fg : DS.ink[400], fontWeight: isActive ? '700' : '500' }}>
                        {LEAVE_TYPE_LABELS[lt]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Dates */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={modalLabel}>Başlangıç *</Text>
                <DatePicker value={startDate} onChange={setStartDate} placeholder="Tarih seç" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={modalLabel}>Bitiş *</Text>
                <DatePicker value={endDate} onChange={setEndDate} placeholder="Tarih seç" />
              </View>
            </View>

            {days > 0 && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                padding: 10, borderRadius: 12,
                backgroundColor: DS.ink[100], borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginTop: 4,
              }}>
                <Info size={13} color={DS.ink[500]} strokeWidth={1.8} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>{days} iş günü</Text>
              </View>
            )}

            {/* Reason */}
            <Text style={modalLabel}>Sebep (opsiyonel)</Text>
            <TextInput
              style={{ ...modalInput, minHeight: 64, textAlignVertical: 'top' }}
              value={reason}
              onChangeText={setReason}
              placeholder="İzin sebebi..."
              placeholderTextColor={DS.ink[400]}
              multiline
            />
          </ScrollView>

          <View style={modalFooter}>
            <Pressable style={modalCancelBtn} onPress={onClose} disabled={saving}>
              <Text style={modalCancelText}>İptal</Text>
            </Pressable>
            <Pressable
              style={{ ...modalSaveBtn, ...(saving ? { opacity: 0.5 } : {}) }}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={modalSaveText}>Talep Oluştur</Text>}
            </Pressable>
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
      <View style={modalOverlay}>
        <View style={modalCard}>
          <View style={modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={modalTitle}>Devam Kaydı</Text>
              {employeeName ? <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>{employeeName}</Text> : null}
            </View>
            <Pressable style={modalCloseBtn} onPress={onClose}>
              <X size={18} color={DS.ink[400]} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Work date */}
            <Text style={modalLabel}>Tarih *</Text>
            <DatePicker value={workDate} onChange={setWorkDate} placeholder="Tarih seç" />

            {/* Status grid */}
            <Text style={modalLabel}>Durum *</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ATT_STATUSES.map(st => {
                const cfg = ATTENDANCE_STATUS_CFG[st];
                const isActive = status === st;
                return (
                  <Pressable
                    key={st}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9999,
                      borderWidth: 1.5,
                      borderColor: isActive ? cfg.fg : DS.ink[200],
                      backgroundColor: isActive ? cfg.bg : '#FFFFFF',
                    }}
                    onPress={() => setStatus(st)}
                  >
                    <Text style={{
                      fontSize: 11,
                      color: isActive ? cfg.fg : DS.ink[400],
                      fontWeight: isActive ? '700' : '500',
                    }}>
                      {cfg.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Times */}
            {showTime && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={modalLabel}>Giriş Saati</Text>
                  <TextInput
                    style={modalInput}
                    value={checkIn}
                    onChangeText={setCheckIn}
                    placeholder="09:00"
                    placeholderTextColor={DS.ink[400]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={modalLabel}>Çıkış Saati</Text>
                  <TextInput
                    style={modalInput}
                    value={checkOut}
                    onChangeText={setCheckOut}
                    placeholder="18:00"
                    placeholderTextColor={DS.ink[400]}
                  />
                </View>
              </View>
            )}

            {/* Overtime */}
            {status === 'normal' && (
              <>
                <Text style={modalLabel}>Fazla Mesai (dk)</Text>
                <TextInput
                  style={modalInput}
                  value={overtime}
                  onChangeText={setOvertime}
                  placeholder="0"
                  placeholderTextColor={DS.ink[400]}
                  keyboardType="number-pad"
                />
              </>
            )}

            {/* Notes */}
            <Text style={modalLabel}>Notlar (opsiyonel)</Text>
            <TextInput
              style={{ ...modalInput, minHeight: 52, textAlignVertical: 'top' }}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ek not..."
              placeholderTextColor={DS.ink[400]}
              multiline
            />
          </ScrollView>

          <View style={modalFooter}>
            <Pressable style={modalCancelBtn} onPress={onClose} disabled={saving}>
              <Text style={modalCancelText}>İptal</Text>
            </Pressable>
            <Pressable
              style={{ ...modalSaveBtn, ...(saving ? { opacity: 0.5 } : {}) }}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={modalSaveText}>Kaydet</Text>}
            </Pressable>
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
      <View style={modalOverlay}>
        <View style={{ ...modalCard, maxWidth: 400 }}>
          <View style={modalHeader}>
            <Text style={modalTitle}>İzni Reddet</Text>
            <Pressable style={modalCloseBtn} onPress={onClose}>
              <X size={18} color={DS.ink[400]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={modalLabel}>Red Sebebi</Text>
            <TextInput
              style={{ ...modalInput, minHeight: 80, textAlignVertical: 'top' }}
              value={reason}
              onChangeText={setReason}
              placeholder="Reddetme sebebini yazın..."
              placeholderTextColor={DS.ink[400]}
              multiline
              autoFocus
            />
          </ScrollView>
          <View style={modalFooter}>
            <Pressable style={modalCancelBtn} onPress={onClose} disabled={saving}>
              <Text style={modalCancelText}>İptal</Text>
            </Pressable>
            <Pressable
              style={{ ...modalSaveBtn, backgroundColor: CHIP_TONES.danger.fg, ...(saving ? { opacity: 0.5 } : {}) }}
              onPress={handleConfirm}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={modalSaveText}>Reddet</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
