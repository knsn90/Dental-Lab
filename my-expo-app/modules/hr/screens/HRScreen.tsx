import { localeTag, weekdayOffset } from '../../../core/i18n';
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
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DatePicker } from '../../../core/ui/DatePicker';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

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
  Palmtree, MapPinCheck, QrCode, Sparkles,
} from 'lucide-react-native';
import { getHolidaysForMonth, type TRHoliday } from '../helpers/turkeyHolidays';
import { confirmAsync } from '../../../core/util/confirm';
import { isRTL } from '../../../core/i18n';

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
  const isEmbedded = useContext(HubContext);
  const px = isDesktop ? 24 : (isEmbedded ? 0 : 16);
  const gap = isDesktop ? 10 : 8;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const theme = usePanelTheme();
  const safeEdges  = isEmbedded ? ([] as any) : (['top'] as any);
  const { profile } = useAuthStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'izinler' | 'devam' | 'ozet'>('devam');
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

  const handleCancel = async (id: string) => {
    const ok = await confirmAsync('İzni İptal Et', 'Bu izin talebi iptal edilecek. Onaylıyor musunuz?',
      { confirmText: 'İptal Et', destructive: true });
    if (!ok) return;
    try {
      const { error } = await cancelLeave(id);
      if (error) throw error;
      toast.success('İzin iptal edildi.');
      refetchSum(); refetchLeaves();
    } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
  };

  const handleDeleteLeave = async (id: string) => {
    const ok = await confirmAsync('İzni Sil', 'Bu izin kaydı kalıcı olarak silinecek. Devam edilsin mi?',
      { confirmText: 'Sil', destructive: true });
    if (!ok) return;
    try {
      const { error } = await deleteLeave(id);
      if (error) throw error;
      toast.success('İzin silindi.');
      refetchSum(); refetchLeaves();
    } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
  };

  const handleDeleteAtt = async (id: string) => {
    const ok = await confirmAsync('Devam Kaydını Sil', 'Bu devam kaydı silinecek. Emin misiniz?',
      { confirmText: 'Sil', destructive: true });
    if (!ok) return;
    try {
      const { error } = await deleteAttendance(id);
      if (error) throw error;
      toast.success('Kayıt silindi.');
      refetchAtt();
    } catch (e: any) { toast.error(e?.message ?? 'Hata oluştu.'); }
  };

  const handleSelectEmployee = (id: string) => {
    setSelectedId(id);
    setTab('devam');
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
      loading={loadingSum}
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
    <OverviewPanel
      summaries={summaries}
      pendingLeaves={pendingLeaves}
      canApprove={canApprove}
      onApprove={handleApprove}
      onReject={handleReject}
      onSelectEmployee={handleSelectEmployee}
      px={px}
    />
  );

  const Wrapper = isEmbedded ? View : SafeAreaView;
  const wrapperProps = isEmbedded ? { style: { flex: 1, backgroundColor: T.bg } } : { style: { flex: 1, backgroundColor: T.bg }, edges: safeEdges };

  return (
    <Wrapper {...wrapperProps}>
      {/* Header — only show when NOT embedded in HRHubScreen */}
      {!isEmbedded && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 10, paddingHorizontal: px }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, fontWeight: '700', color: T.ink, letterSpacing: -0.3 }}>İzin & Devam</Text>
            <Text style={{ fontSize: 13, color: T.ink3, marginTop: 2 }}>
              {summaries.length} personel · {onLeaveCount > 0 ? `${onLeaveCount} izinde` : 'izinde kimse yok'}
            </Text>
          </View>
        </View>
      )}

      {/* Action bar — always visible */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: px, paddingVertical: 8, gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 13, color: T.ink3 }}>
          {summaries.length} personel · {onLeaveCount > 0 ? `${onLeaveCount} izinde` : 'izinde kimse yok'}
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
            backgroundColor: T.ink,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          } as any}
          onPress={() => setLeaveOpen(true)}
        >
          <CalendarPlus size={15} color={T.bg} strokeWidth={1.8} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: T.bg }}>İzin Talebi</Text>
        </Pressable>
      </View>

      {/* Body */}
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Left panel — fixed 340px */}
          <View style={{ width: 340, borderEndWidth: 1, borderEndColor: T.hairline }}>
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
                paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.hairline,
                paddingHorizontal: px,
              }}>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 2, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) } as any} onPress={() => setSelectedId(null)}>
                  {isRTL() ? <ChevronRight size={20} color={T.ink3} strokeWidth={1.8} /> : <ChevronLeft size={20} color={T.ink3} strokeWidth={1.8} />}
                  <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink3 }}>Geri</Text>
                </Pressable>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: T.ink }} numberOfLines={1}>{selectedSummary.full_name}</Text>
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
function EmployeeListPanel({ summaries, selectedId, onSelect, px, gap, loading }: {
  summaries: LeaveSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  px: number;
  gap: number;
  loading?: boolean;
}) {
  // Skeleton: ilk yüklemede çoklu placeholder satır göster (visual feedback)
  if (loading && summaries.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: px, paddingBottom: 120, gap}}
        showsVerticalScrollIndicator={false}
      >
        {[0, 1, 2, 3, 4, 5].map(i => (
          <EmployeeRowSkeleton key={i} />
        ))}
      </ScrollView>
    );
  }
  const T = useMobileTokens();
  if (summaries.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 60 }}>
        <UserX size={40} color={T.ink3} strokeWidth={1.4} />
        <Text style={{ fontSize: 14, color: T.ink3, fontWeight: '600' }}>Personel bulunamadı</Text>
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: px, paddingBottom: 120, gap}}
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

// Skeleton row — yükleniyor görsel
function EmployeeRowSkeleton() {
  const T = useMobileTokens();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: T.card,
      borderRadius: 24, padding: 14,
      borderWidth: 1, borderColor: T.hairline,
      ...(Platform.OS === 'web' ? { boxShadow: '0 1px 4px rgba(0,0,0,0.04)' } as any : {}),
    }}>
      <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: T.cardSoft }} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 12, borderRadius: 6, backgroundColor: T.cardSoft, width: '60%' }} />
        <View style={{ height: 9, borderRadius: 5, backgroundColor: T.cardSoft, width: '40%' }} />
        <View style={{ height: 5, borderRadius: 3, backgroundColor: T.cardSoft, width: '85%', marginTop: 4 }} />
      </View>
    </View>
  );
}

// ─── Employee Row ─────────────────────────────────────────────────────────────
function EmployeeRow({ summary, selected, onPress }: {
  summary: LeaveSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const T = useMobileTokens();
  const theme = usePanelTheme();
  const role = ROLE_COLORS[summary.role as keyof typeof ROLE_COLORS] ?? { fg: T.ink3, bg: T.cardSoft };
  const initials = summary.full_name
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const usedPct = summary.annual_entitlement > 0
    ? Math.min(summary.annual_used / summary.annual_entitlement, 1)
    : 0;

  // Progress bar rengi — kullanım oranına göre
  const pctNum = Math.round(usedPct * 100);
  const progColor = pctNum > 80 ? CHIP_TONES.danger.fg
                  : pctNum > 50 ? CHIP_TONES.warning.fg
                  : pctNum > 0  ? CHIP_TONES.success.fg
                  : DS.ink[200];

  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: selected ? '#FFFFFF' : (hovered ? '#FAFAF7' : '#FFFFFF'),
        borderRadius: 16, padding: 12, paddingStart: 14,
        borderWidth: 0,
        // @ts-ignore web — selected = saffron ring + heavier shadow, default = soft shadow
        boxShadow: selected
          ? `0 0 0 2px ${theme.primary}, 0 8px 20px rgba(15,23,42,0.08)`
          : (hovered ? '0 4px 12px rgba(15,23,42,0.06)' : '0 1px 3px rgba(15,23,42,0.04)'),
        // @ts-ignore
        transition: 'box-shadow 160ms ease, background-color 160ms ease',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      {/* Avatar */}
      <View style={{
        width: 42, height: 42, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        backgroundColor: role.bg,
      }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: role.fg, letterSpacing: -0.3 }}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
        {/* Üst satır: isim + iç chip'ler */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900], flexShrink: 1 }} numberOfLines={1}>
            {summary.full_name}
          </Text>
          {summary.currently_on_leave && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9999, backgroundColor: CHIP_TONES.info.bg }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: CHIP_TONES.info.fg }} />
              <Text style={{ fontSize: 9.5, fontWeight: '800', color: CHIP_TONES.info.fg, letterSpacing: 0.3 }}>İZİNDE</Text>
            </View>
          )}
          {summary.pending_count > 0 && (
            <View style={{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: CHIP_TONES.warning.fg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{summary.pending_count}</Text>
            </View>
          )}
        </View>

        {/* Rol + kullanım — tek satır */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: role.bg }}>
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: role.fg, letterSpacing: 0.2 }} numberOfLines={1}>
              {ROLE_LABELS[summary.role as keyof typeof ROLE_LABELS] ?? summary.role}
            </Text>
          </View>
          <Text style={{ fontSize: 10.5, color: DS.ink[500], fontWeight: '600', flex: 1 }} numberOfLines={1}>
            {summary.annual_used}/{summary.annual_entitlement} <Text style={{ color: DS.ink[400], fontWeight: '500' }}>gün</Text>
          </Text>
        </View>

        {/* Inçe progress bar — sadece kullanım varsa renkli */}
        <View style={{ height: 3, borderRadius: 9999, backgroundColor: T.cardSoft, overflow: 'hidden' }}>
          {pctNum > 0 && (
            <View style={{ height: '100%', borderRadius: 9999, backgroundColor: progColor, width: `${pctNum}%` as any }} />
          )}
        </View>
      </View>

      {isRTL() ? <ChevronLeft size={16} color={selected ? DS.ink[700] : DS.ink[300]} strokeWidth={1.7} /> : <ChevronRight size={16} color={selected ? DS.ink[700] : DS.ink[300]} strokeWidth={1.7} />}
    </Pressable>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
// ─── Overview Panel — boş seçim yerine bugün özeti + bekleyen onaylar ────
function OverviewPanel({
  summaries, pendingLeaves, canApprove, onApprove, onReject, onSelectEmployee, px,
}: {
  summaries: LeaveSummary[];
  pendingLeaves: any[];
  canApprove: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSelectEmployee: (id: string) => void;
  px: number;
}) {
  const T = useMobileTokens();
  const theme = usePanelTheme();
  const onLeaveToday = summaries.filter(s => s.currently_on_leave);
  const pendingCount = pendingLeaves.length;
  const totalAnnualRemaining = summaries.reduce((acc, s) => acc + (s.annual_remaining ?? 0), 0);
  const totalAnnualEntitlement = summaries.reduce((acc, s) => acc + (s.annual_entitlement ?? 0), 0);
  const usagePct = totalAnnualEntitlement > 0
    ? Math.round(((totalAnnualEntitlement - totalAnnualRemaining) / totalAnnualEntitlement) * 100)
    : 0;
  const topRemaining = [...summaries]
    .filter(s => s.is_active)
    .sort((a, b) => b.annual_remaining - a.annual_remaining)
    .slice(0, 5);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: px, paddingBottom: 60, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── F1 HeroCard — İzin & Devam özeti (saffron bg + white blobs) ── */}
      <View style={{
        borderRadius: 20, overflow: 'hidden',
        backgroundColor: theme.primary, padding: 18,
        position: 'relative',
      }}>
        {/* Beyaz dekoratif blob'lar */}
        <View style={{ position: 'absolute', top: -50, end: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.20)' }} />
        <View style={{ position: 'absolute', bottom: -60, start: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)' }} />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
              Bugün İzinde
            </Text>
            <Text
              style={{ ...DISPLAY, fontWeight: '300', fontSize: 38, color: '#FFFFFF', letterSpacing: -1.2, lineHeight: 42 }}
              numberOfLines={1}
            >
              {onLeaveToday.length}
              <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.72)' }}> / {summaries.length}</Text>
            </Text>
            <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)', marginTop: 4 }}>
              {onLeaveToday.length === 0 ? 'Bugün herkes işbaşında' : `${onLeaveToday.length} personel izinli`}
              {pendingCount > 0 ? ` · ${pendingCount} talep onay bekliyor` : ''}
            </Text>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Palmtree size={20} color="#FFFFFF" strokeWidth={1.6} />
          </View>
        </View>

        {/* Stat pill row — beyaz transparan kapsüller */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {([
            { label: 'Bekleyen Onay',  value: String(pendingCount),                                       icon: Clock         },
            { label: 'Yıllık Kullanım', value: `%${usagePct}`,                                            icon: CalendarCheck },
            { label: 'Kalan Hak',       value: `${totalAnnualRemaining}/${totalAnnualEntitlement}`,       icon: Calendar      },
            { label: 'Aktif Personel',  value: String(summaries.filter(s => s.is_active).length),        icon: User          },
          ] as const).map(stat => {
            const Icon = stat.icon;
            return (
              <View key={stat.label} style={{
                flex: 1, minWidth: 110,
                paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.16)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <Icon size={11} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                    {stat.label}
                  </Text>
                </View>
                <Text
                  style={{ ...DISPLAY, fontWeight: '300', fontSize: 16, color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 20 }}
                  numberOfLines={1}
                >
                  {stat.value}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Bekleyen onaylar */}
      {pendingLeaves.length > 0 ? (
        <View style={{
          ...cardSolid,
          padding: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          <View style={{ padding: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: CHIP_TONES.warning.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={17} color={CHIP_TONES.warning.fg} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>Bekleyen Onaylar</Text>
              <Text style={{ fontSize: 11.5, color: DS.ink[500], marginTop: 1 }}>
                {pendingLeaves.length} izin talebi {canApprove ? 'onayını bekliyor' : 'mesul müdür onayı bekliyor'}
              </Text>
            </View>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' }}>
            {pendingLeaves.slice(0, 6).map((l: any, i: number) => {
              const tc = LEAVE_TYPE_COLORS[l.leave_type as LeaveType];
              const iconName = LEAVE_TYPE_ICONS[l.leave_type as LeaveType];
              return (
                <Pressable
                  key={l.id}
                  onPress={() => onSelectEmployee(l.employee_id)}
                  style={({ hovered }: any) => ({
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: 'rgba(0,0,0,0.04)',
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: hovered ? DS.ink[50] : '#FFFFFF',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: tc.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <LucideIcon name={iconName} size={15} color={tc.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }} numberOfLines={1}>{l.employee_name ?? '—'}</Text>
                    <Text style={{ fontSize: 11.5, color: DS.ink[500], marginTop: 1 }} numberOfLines={1}>
                      {LEAVE_TYPE_LABELS[l.leave_type as LeaveType]} · {fmtDateRange(l.start_date, l.end_date)} · {l.days_count} gün
                    </Text>
                  </View>
                  {canApprove && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable
                        onPress={(e: any) => { e?.stopPropagation?.(); onApprove(l.id); }}
                        style={({ hovered }: any) => ({
                          width: 32, height: 32, borderRadius: 8,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: hovered ? CHIP_TONES.success.fg : CHIP_TONES.success.bg,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        <Check size={15} color={CHIP_TONES.success.fg} strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        onPress={(e: any) => { e?.stopPropagation?.(); onReject(l.id); }}
                        style={({ hovered }: any) => ({
                          width: 32, height: 32, borderRadius: 8,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: hovered ? CHIP_TONES.danger.fg : CHIP_TONES.danger.bg,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        <X size={15} color={CHIP_TONES.danger.fg} strokeWidth={2} />
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );
            })}
            {pendingLeaves.length > 6 && (
              <View style={{ padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' }}>
                <Text style={{ fontSize: 11.5, color: DS.ink[500], fontWeight: '600' }}>+{pendingLeaves.length - 6} talep daha</Text>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {/* Bugün İzinde Olanlar */}
      {onLeaveToday.length > 0 ? (
        <View style={{
          ...cardSolid,
          padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 10,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: CHIP_TONES.info.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Palmtree size={17} color={CHIP_TONES.info.fg} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>Bugün İzinde</Text>
              <Text style={{ fontSize: 11.5, color: DS.ink[500], marginTop: 1 }}>
                {onLeaveToday.length} personel izinli — planlama yaparken dikkat
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {onLeaveToday.map(s => (
              <Pressable
                key={s.employee_id}
                onPress={() => onSelectEmployee(s.employee_id)}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                  backgroundColor: hovered ? CHIP_TONES.info.fg : CHIP_TONES.info.bg,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: CHIP_TONES.info.fg }}>
                    {(s.full_name ?? '?').slice(0, 1).toLocaleUpperCase('tr-TR')}
                  </Text>
                </View>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: CHIP_TONES.info.fg }}>{s.full_name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* Yıllık İzin Top 5 */}
      {topRemaining.length > 0 ? (
        <View style={{
          ...cardSolid,
          padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: T.cardSoft, alignItems: 'center', justifyContent: 'center' }}>
              <CalendarCheck size={17} color={DS.ink[700]} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>Yıllık İzin Durumu</Text>
              <Text style={{ fontSize: 11.5, color: DS.ink[500], marginTop: 1 }}>
                En çok izin hakkı kalan {Math.min(5, topRemaining.length)} personel
              </Text>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            {topRemaining.map(s => {
              const usedPct = s.annual_entitlement > 0
                ? Math.min(100, Math.round((s.annual_used / s.annual_entitlement) * 100))
                : 0;
              return (
                <Pressable
                  key={s.employee_id}
                  onPress={() => onSelectEmployee(s.employee_id)}
                  style={({ hovered }: any) => ({
                    gap: 6,
                    paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8,
                    backgroundColor: hovered ? DS.ink[50] : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{s.full_name}</Text>
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: DS.ink[700] }}>
                      {s.annual_remaining}
                      <Text style={{ color: DS.ink[400], fontWeight: '500' }}>/{s.annual_entitlement} gün</Text>
                    </Text>
                  </View>
                  <View style={{ height: 5, borderRadius: 9999, backgroundColor: T.cardSoft, overflow: 'hidden' }}>
                    <View style={{
                      width: `${usedPct}%` as any,
                      height: '100%',
                      backgroundColor: usedPct > 80 ? CHIP_TONES.danger.fg : usedPct > 50 ? CHIP_TONES.warning.fg : CHIP_TONES.success.fg,
                      borderRadius: 9999,
                    }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Bilgi notu — sol panelden detaya gitme */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 14, borderRadius: 12,
        backgroundColor: DS.ink[50],
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
      }}>
        <UserRoundSearch size={18} color={DS.ink[400]} strokeWidth={1.6} />
        <Text style={{ flex: 1, fontSize: 12, color: DS.ink[500], lineHeight: 17 }}>
          Detaylı izin geçmişi ve devam kayıtları için sol panelden bir personel seç.
        </Text>
      </View>
    </ScrollView>
  );
}

// KPI kart — overview için küçük kart
function KpiCard({ label, value, total, subtext, icon, tone = 'neutral' }: {
  label: string;
  value: number | string;
  total?: number;
  subtext?: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'warning' | 'info' | 'success';
}) {
  const bg = tone === 'warning' ? CHIP_TONES.warning.bg
    : tone === 'info' ? CHIP_TONES.info.bg
    : tone === 'success' ? CHIP_TONES.success.bg
    : DS.ink[50];
  return (
    <View style={{
      flex: 1, minWidth: 140,
      padding: 14, borderRadius: 14,
      backgroundColor: '#FFFFFF',
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
      gap: 8,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={{ ...DISPLAY, fontSize: 26, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.5 }}>{value}</Text>
        {total != null && (
          <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[400] }}>/{total}</Text>
        )}
      </View>
      {subtext && (
        <Text style={{ fontSize: 11, color: DS.ink[500] }}>{subtext}</Text>
      )}
    </View>
  );
}

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
  const TABS: { key: 'izinler' | 'devam' | 'ozet'; label: string; icon: React.FC<any>; count?: number }[] = [
    { key: 'devam',   label: 'Devam',       icon: CalendarCheck, count: records.length },
    { key: 'izinler', label: 'İzinler',     icon: Calendar,      count: filteredLeaves.length },
  ];
  // 'ozet' is now part of hero — keep but invisible (default tab redirect)
  const activeTab = tab === 'ozet' ? 'devam' : tab;

  const [mn, mm] = currentMonth.split('-').map(Number);

  const T = useMobileTokens();
  const theme = usePanelTheme();
  const roleColor = (ROLE_COLORS as any)[summary.role] ?? { bg: T.cardSoft, fg: T.ink2 };
  const roleLabel = (ROLE_LABELS as any)[summary.role] ?? summary.role;
  const annualUsedPct = summary.annual_entitlement > 0
    ? Math.min(100, Math.round((summary.annual_used / summary.annual_entitlement) * 100))
    : 0;
  const startYear = summary.employment_start ? new Date(summary.employment_start).getFullYear() : null;
  const startDate = summary.employment_start
    ? new Date(summary.employment_start).toLocaleDateString(localeTag(), { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const tenureYears = summary.employment_start
    ? Math.floor((Date.now() - new Date(summary.employment_start).getTime()) / (365.25 * 86400_000))
    : 0;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 60, gap: 12, paddingTop: 14, paddingHorizontal: px }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      {/* ─── EMPLOYEE HERO — F1 HeroCard (saffron bg + white blobs + white ring) ─── */}
      <View style={{
        borderRadius: 20, overflow: 'hidden',
        backgroundColor: theme.primary, padding: 20,
        position: 'relative',
      }}>
        {/* Beyaz dekoratif blob'lar */}
        <View style={{ position: 'absolute', top: -50, end: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.20)' }} />
        <View style={{ position: 'absolute', bottom: -60, start: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)' }} />

        {/* Üst row: sol ring + sağ identity */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <LeaveRing
            used={summary.annual_used}
            total={summary.annual_entitlement}
            usedPct={annualUsedPct}
            year={startYear}
            onDark
          />
          <View style={{ flex: 1, minWidth: 220, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 13,
                backgroundColor: 'rgba(255,255,255,0.20)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 }}>
                  {(summary.full_name ?? '?').slice(0, 1).toLocaleUpperCase('tr-TR')}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ ...DISPLAY, fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 }} numberOfLines={1}>
                  {summary.full_name}
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)' }} numberOfLines={1}>
                  {startDate}{tenureYears > 0 ? ` · ${tenureYears} yıllık` : ''}
                </Text>
              </View>
            </View>
            {/* Chip row — beyaz transparan pill'ler */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.20)' }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2 }}>{roleLabel}</Text>
              </View>
              {summary.currently_on_leave && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999, backgroundColor: '#FFFFFF' }}>
                  <Palmtree size={10} color={theme.primary} strokeWidth={2} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: theme.primary }}>BUGÜN İZİNDE</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.20)' }}>
                <Calendar size={10} color="#FFFFFF" strokeWidth={1.8} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>
                  {summary.annual_remaining}/{summary.annual_entitlement} gün kaldı
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 2×2 KPI grid — beyaz transparan pill'ler */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {([
            { label: 'Bu Ay İzin', value: summary.leave_days_this_month ?? 0, unit: 'gün',   icon: Calendar },
            { label: 'Bekleyen',   value: summary.pending_count ?? 0,         unit: 'talep', icon: Clock    },
            { label: 'Geç Giriş',  value: attSummary?.late_days ?? 0,         unit: 'gün',   icon: Clock    },
            { label: 'Devamsız',   value: attSummary?.absent_days ?? 0,       unit: 'gün',   icon: UserX    },
          ] as const).map(stat => {
            const Icon = stat.icon;
            return (
              <View key={stat.label} style={{
                flexBasis: '48%', flexGrow: 1, minWidth: 110,
                paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.16)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <Icon size={11} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }} numberOfLines={1}>
                    {stat.label}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ ...DISPLAY, fontSize: 22, fontWeight: '300', color: '#FFFFFF', letterSpacing: -0.6, lineHeight: 26 }}>{stat.value}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.72)' }}>{stat.unit}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* ─── TAB BAR (2 tab: İzinler / Devam) ─── */}
      <View style={{ flexDirection: 'row', backgroundColor: T.cardSoft, borderRadius: 9999, padding: 4 }}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          const Icon = t.icon;
          return (
            <Pressable
              key={t.key}
              style={[
                {
                  flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9999,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
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
              <Icon size={14} color={active ? DS.ink[900] : DS.ink[500]} strokeWidth={1.8} />
              <Text style={{
                fontSize: 13,
                fontWeight: active ? '700' : '600',
                color: active ? DS.ink[900] : DS.ink[500],
              }}>{t.label}</Text>
              {(t.count ?? 0) > 0 && (
                <View style={{
                  paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999,
                  backgroundColor: active ? DS.ink[900] : DS.ink[200],
                  minWidth: 18, alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: active ? '#FFFFFF' : DS.ink[500] }}>{t.count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ─── TAB CONTENT ─── */}
      <View style={{ gap: 12 }}>
        {activeTab === 'izinler' && (
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
        {activeTab === 'devam' && (
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
      </View>
    </ScrollView>
  );
}

// Hero KPI bileşeni — kompakt mini metric
// ─── LeaveRing — Patterns §11.7 PercentRingHero adaptasyonu ──────────────
// Yıllık izin kullanım oranını büyük ring olarak gösterir
function LeaveRing({ used, total, usedPct, year, onDark = false }: { used: number; total: number; usedPct: number; year: number | null; onDark?: boolean }) {
  const size = 116;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (usedPct / 100) * c;
  // Renk: onDark ise beyaz; aksi halde % bazlı yeşil/turuncu/kırmızı
  const ringColor = onDark
    ? '#FFFFFF'
    : (usedPct > 80 ? CHIP_TONES.danger.fg
      : usedPct > 50 ? CHIP_TONES.warning.fg
      : CHIP_TONES.success.fg);
  const trackColor = onDark ? 'rgba(255,255,255,0.25)' : DS.ink[100];
  const textColor      = onDark ? '#FFFFFF'                     : DS.ink[900];
  const labelColor     = onDark ? 'rgba(255,255,255,0.85)'      : DS.ink[500];
  const subLabelColor  = onDark ? 'rgba(255,255,255,0.65)'      : DS.ink[400];

  if (Platform.OS !== 'web') {
    // Native fallback — basit linear progress dikey kart
    return (
      <View style={{ width: size, alignItems: 'center', gap: 6 }}>
        <Text style={{ ...DISPLAY, fontSize: 34, fontWeight: '300', color: textColor, letterSpacing: -1 }}>
          {total > 0 ? total - used : 0}
        </Text>
        <Text style={{ fontSize: 10.5, color: labelColor }}>/{total} gün kaldı</Text>
        <View style={{ width: '100%', height: 6, borderRadius: 9999, backgroundColor: trackColor }}>
          <View style={{ width: `${usedPct}%` as any, height: '100%', borderRadius: 9999, backgroundColor: ringColor }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', position: 'relative' as any }}>
      {/* @ts-ignore — RN-Web SVG pass-through */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute' as any }}>
        <circle cx={size/2} cy={size/2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2}
          cy={size/2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${filled} ${c}`}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          // @ts-ignore web transition
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <View style={{ alignItems: 'center', gap: 0 }}>
        <Text style={{ ...DISPLAY, fontSize: 30, fontWeight: '300', color: textColor, letterSpacing: -1, lineHeight: 32 }}>
          {total > 0 ? total - used : 0}
        </Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: labelColor, letterSpacing: 0.6, textTransform: 'uppercase' }}>
          gün kaldı
        </Text>
        {year && (
          <Text style={{ fontSize: 9, color: subLabelColor, marginTop: 2 }}>
            {year} · %{usedPct}
          </Text>
        )}
      </View>
    </View>
  );
}

function HeroStat({ label, value, unit, tone = 'neutral', icon }: {
  label: string;
  value: number;
  unit?: string;
  tone?: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
  icon: React.ReactNode;
}) {
  const bg = tone === 'warning' ? CHIP_TONES.warning.bg
    : tone === 'info' ? CHIP_TONES.info.bg
    : tone === 'danger' ? CHIP_TONES.danger.bg
    : tone === 'success' ? CHIP_TONES.success.bg
    : DS.ink[50];
  const fg = tone === 'warning' ? CHIP_TONES.warning.fg
    : tone === 'info' ? CHIP_TONES.info.fg
    : tone === 'danger' ? CHIP_TONES.danger.fg
    : tone === 'success' ? CHIP_TONES.success.fg
    : DS.ink[900];
  return (
    <View style={{
      flexBasis: '48%', flexGrow: 1, minWidth: 110,
      padding: 12, borderRadius: 12,
      backgroundColor: bg,
      gap: 6,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={{ fontSize: 10, fontWeight: '700', color: fg, letterSpacing: 0.5, textTransform: 'uppercase', flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={{ ...DISPLAY, fontSize: 22, fontWeight: '300', color: fg, letterSpacing: -0.6 }}>{value}</Text>
        {unit && <Text style={{ fontSize: 10, fontWeight: '700', color: fg, opacity: 0.7 }}>{unit}</Text>}
      </View>
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
  const T = useMobileTokens();
  const FILTERS: { key: LeaveStatus | 'tumu'; label: string }[] = [
    { key: 'tumu',       label: 'Tümü' },
    { key: 'bekliyor',   label: 'Bekliyor' },
    { key: 'onaylandi',  label: 'Onaylı' },
    { key: 'reddedildi', label: 'Reddedildi' },
  ];

  return (
    <>
      {/* Filter pills — pill-group */}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', backgroundColor: T.cardSoft, borderRadius: 9999, padding: 4, marginBottom: 4 }}>
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
        <View style={{
          alignItems: 'center', paddingVertical: 32, paddingHorizontal: 18, gap: 10,
          borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' as any,
          borderColor: 'rgba(15,23,42,0.10)',
          backgroundColor: DS.ink[50],
        }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' }}>
            <Calendar size={22} color={DS.ink[400]} strokeWidth={1.5} />
          </View>
          <Text style={{ fontSize: 14, color: DS.ink[700], fontWeight: '700' }}>Henüz izin talebi yok</Text>
          <Text style={{ fontSize: 11.5, color: DS.ink[400], textAlign: 'center', lineHeight: 16, maxWidth: 320 }}>
            Bu personelin geçmiş veya bekleyen izni bulunmuyor. Yeni bir izin eklemek için aşağıdaki butonu kullan.
          </Text>
          <Pressable
            onPress={onAdd}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9999,
              backgroundColor: hovered ? DS.ink[700] : DS.ink[900], marginTop: 4,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <CalendarPlus size={13} color="#FFFFFF" strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>İzin Talebi Ekle</Text>
          </Pressable>
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

      {leaves.length > 0 && (
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
      )}
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

  // Tarih formatla — gün+ay (kısa)
  const startD = new Date(leave.start_date + 'T00:00:00');
  const endD   = new Date(leave.end_date + 'T00:00:00');
  const sameMonth = startD.getMonth() === endD.getMonth() && startD.getFullYear() === endD.getFullYear();

  return (
    <View style={{
      ...cardSolid,
      padding: 0, overflow: 'hidden',
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
      borderStartWidth: 3, borderStartColor: tc.fg,
    }}>
      {/* MAIN ROW */}
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 0 }}>
        {/* Date block */}
        <View style={{
          width: 80,
          paddingVertical: 14, paddingHorizontal: 10,
          backgroundColor: tc.bg,
          alignItems: 'center', justifyContent: 'center',
          gap: 2,
        }}>
          <Text style={{ ...DISPLAY, fontSize: 22, fontWeight: '700', color: tc.fg, lineHeight: 22, letterSpacing: -0.5 }}>
            {startD.getDate()}
            {!sameMonth || endD.getDate() !== startD.getDate() ? <Text style={{ fontSize: 12, fontWeight: '500', color: tc.fg, opacity: 0.6 }}>{` – ${endD.getDate()}`}</Text> : null}
          </Text>
          <Text style={{ fontSize: 9.5, fontWeight: '700', color: tc.fg, opacity: 0.75, letterSpacing: 0.6, textTransform: 'uppercase' }}>
            {TR_MONTHS[startD.getMonth() + 1].slice(0, 3)}
          </Text>
          <View style={{ marginTop: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999, backgroundColor: '#FFFFFF' }}>
            <Text style={{ fontSize: 9.5, fontWeight: '800', color: tc.fg }}>{leave.days_count} GÜN</Text>
          </View>
        </View>

        {/* Info column */}
        <View style={{ flex: 1, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: tc.bg }}>
                <LucideIcon name={icon} size={13} color={tc.fg} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>{LEAVE_TYPE_LABELS[leave.leave_type]}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, backgroundColor: sc2.bg }}>
              <StatusIcon name={sc2.icon} size={10} color={sc2.fg} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: sc2.fg, letterSpacing: 0.2 }}>{sc2.label}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 11.5, color: DS.ink[500] }}>{fmtDateRange(leave.start_date, leave.end_date)}</Text>
          {leave.reason ? (
            <Text style={{ fontSize: 11, color: DS.ink[500], lineHeight: 16, marginTop: 2 }} numberOfLines={3}>
              "{leave.reason}"
            </Text>
          ) : null}
        </View>

        {/* Delete button */}
        <Pressable
          style={({ hovered }: any) => ({
            width: 40, alignItems: 'center', justifyContent: 'center',
            backgroundColor: hovered ? CHIP_TONES.danger.bg : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
          onPress={() => onDelete(leave.id)}
        >
          <Trash2 size={14} color={DS.ink[300]} strokeWidth={1.6} />
        </Pressable>
      </View>

      {/* ACTION FOOTER */}
      {leave.status === 'bekliyor' && canApprove && (
        <View style={{ flexDirection: 'row', gap: 0, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
          <Pressable
            style={({ hovered }: any) => ({
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 11,
              backgroundColor: hovered ? CHIP_TONES.success.fg : '#FFFFFF',
              borderEndWidth: 1, borderEndColor: 'rgba(0,0,0,0.06)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
            onPress={() => onApprove(leave.id)}
          >
            <Check size={14} color={CHIP_TONES.success.fg} strokeWidth={2.2} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: CHIP_TONES.success.fg }}>Onayla</Text>
          </Pressable>
          <Pressable
            style={({ hovered }: any) => ({
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 11,
              backgroundColor: hovered ? CHIP_TONES.danger.fg : '#FFFFFF',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
            onPress={() => onReject(leave.id)}
          >
            <X size={14} color={CHIP_TONES.danger.fg} strokeWidth={2.2} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: CHIP_TONES.danger.fg }}>Reddet</Text>
          </Pressable>
        </View>
      )}
      {leave.status === 'bekliyor' && !canApprove && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 14, paddingVertical: 10,
          borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          backgroundColor: CHIP_TONES.warning.bg + '40',
        }}>
          <Clock size={13} color={CHIP_TONES.warning.fg} strokeWidth={1.8} />
          <Text style={{ fontSize: 11.5, color: CHIP_TONES.warning.fg, fontWeight: '600', flex: 1 }}>
            Mesul müdür / yönetici onayı bekleniyor
          </Text>
        </View>
      )}
      {leave.status === 'onaylandi' && canApprove && (
        <Pressable
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: 10,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
            backgroundColor: hovered ? DS.ink[100] : '#FFFFFF',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
          onPress={() => onCancel(leave.id)}
        >
          <Ban size={13} color={DS.ink[500]} strokeWidth={1.8} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>İzni İptal Et</Text>
        </Pressable>
      )}
      {leave.reject_reason && leave.status === 'reddedildi' && (
        <View style={{
          padding: 12, paddingHorizontal: 14,
          borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          backgroundColor: CHIP_TONES.danger.bg + '50',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <X size={11} color={CHIP_TONES.danger.fg} strokeWidth={2.5} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: CHIP_TONES.danger.fg, letterSpacing: 0.4, textTransform: 'uppercase' }}>Red sebebi</Text>
          </View>
          <Text style={{ fontSize: 12, color: CHIP_TONES.danger.fg, lineHeight: 17 }}>{leave.reject_reason}</Text>
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
  const rawFirst = new Date(y, m - 1, 1).getDay();
  // Hafta başlangıcı bölgeye bağlı: TR/AB Pazartesi, İran Cumartesi (weekdayOffset).
  const firstOffset = weekdayOffset(rawFirst);

  const recordMap = useMemo(() => {
    const map: Record<string, EmployeeAttendance> = {};
    records.forEach(r => { map[r.work_date] = r; });
    return map;
  }, [records]);

  // Türkiye resmi tatilleri — bu ay için
  const monthHolidays = useMemo(() => getHolidaysForMonth(y, m), [y, m]);
  const holidayMap = useMemo(() => {
    const map: Record<string, TRHoliday> = {};
    monthHolidays.forEach(h => { map[h.date] = h; });
    return map;
  }, [monthHolidays]);

  const cells: (number | null)[] = [
    ...Array(firstOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const [showCalendar, setShowCalendar] = useState(false);

  return (
    <>
      {/* Month selector + summary */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            style={({ hovered }: any) => ({
              width: 30, height: 30, borderRadius: 9, backgroundColor: hovered ? DS.ink[200] : DS.ink[100], alignItems: 'center', justifyContent: 'center',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any)}
            onPress={prevMonth}
          >
            {isRTL() ? <ChevronRight size={16} color={DS.ink[700]} strokeWidth={1.8} /> : <ChevronLeft size={16} color={DS.ink[700]} strokeWidth={1.8} />}
          </Pressable>
          <Text style={{ ...DISPLAY, fontSize: 15, fontWeight: '700', color: DS.ink[900], minWidth: 110, textAlign: 'center' }}>{monthLabel}</Text>
          <Pressable
            style={({ hovered }: any) => ({
              width: 30, height: 30, borderRadius: 9, backgroundColor: hovered ? DS.ink[200] : DS.ink[100], alignItems: 'center', justifyContent: 'center',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any)}
            onPress={nextMonth}
          >
            {isRTL() ? <ChevronLeft size={16} color={DS.ink[700]} strokeWidth={1.8} /> : <ChevronRight size={16} color={DS.ink[700]} strokeWidth={1.8} />}
          </Pressable>
        </View>
        <Pressable
          onPress={() => setShowCalendar(v => !v)}
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
            borderWidth: 1, borderColor: showCalendar ? DS.ink[900] : DS.ink[200],
            backgroundColor: showCalendar ? DS.ink[900] : (hovered ? DS.ink[50] : '#FFFFFF'),
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          } as any)}
        >
          <Calendar size={12} color={showCalendar ? '#FFFFFF' : DS.ink[700]} strokeWidth={1.8} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: showCalendar ? '#FFFFFF' : DS.ink[700] }}>
            {showCalendar ? 'Takvimi kapat' : 'Takvim görünümü'}
          </Text>
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

      {/* Bu ay Türkiye resmi tatilleri */}
      {monthHolidays.length > 0 && (
        <View style={{
          ...cardSolid, padding: 12,
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 6,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} color={DS.ink[700]} strokeWidth={1.8} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: DS.ink[700], letterSpacing: 1, textTransform: 'uppercase' }}>
              Bu Ayki Resmi Tatiller
            </Text>
          </View>
          <View style={{ gap: 4 }}>
            {monthHolidays.map(h => {
              const d = new Date(h.date + 'T00:00:00');
              const dayOfWeek = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'][d.getDay()];
              const tone = h.kind === 'arefe' ? CHIP_TONES.warning : h.kind === 'dini' ? CHIP_TONES.info : CHIP_TONES.success;
              return (
                <View key={h.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: tone.fg }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[900], minWidth: 40 }}>
                    {d.getDate()} {TR_MONTHS[m].slice(0,3)}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: DS.ink[500], minWidth: 70 }}>{dayOfWeek}</Text>
                  <Text style={{ fontSize: 11.5, color: DS.ink[700], flex: 1 }} numberOfLines={1}>{h.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Records list — artık önce gösteriliyor */}
      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator color={DS.ink[400]} />
        </View>
      ) : records.length === 0 ? (
        <View style={{
          alignItems: 'center', paddingVertical: 32, paddingHorizontal: 18, gap: 10,
          borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' as any,
          borderColor: 'rgba(15,23,42,0.10)', backgroundColor: DS.ink[50],
        }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' }}>
            <CalendarCheck size={22} color={DS.ink[400]} strokeWidth={1.5} />
          </View>
          <Text style={{ fontSize: 14, color: DS.ink[700], fontWeight: '700' }}>Bu ay için devam kaydı yok</Text>
          <Text style={{ fontSize: 11.5, color: DS.ink[400], textAlign: 'center', lineHeight: 16, maxWidth: 320 }}>
            Personel QR/GPS check-in yaptıkça kayıtlar buraya düşer. Manuel kayıt eklemek için aşağıdaki butonu kullan.
          </Text>
          <Pressable
            onPress={onAdd}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9999,
              backgroundColor: hovered ? DS.ink[700] : DS.ink[900], marginTop: 4,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <CalendarCheck size={13} color="#FFFFFF" strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Devam Kaydı Ekle</Text>
          </Pressable>
        </View>
      ) : (
        records.map(r => (
          <AttendanceRow key={r.id} record={r} onDelete={onDelete} />
        ))
      )}

      {/* Calendar grid — opsiyonel, toggle ile aşağıda açılır */}
      {showCalendar && (
        <View style={{
          ...cardSolid, padding: 12,
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', gap: 8,
        }}>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(d => (
              <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: DS.ink[400], textTransform: 'uppercase' }}>{d}</Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((day, idx) => {
              if (day === null) return <View key={`e-${idx}`} style={{ width: `${100 / 7}%` as any, aspectRatio: 1, padding: 2 }} />;
              const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const rec = recordMap[dateStr];
              const colIdx = idx % 7;
              const isWeekend = colIdx === 5 || colIdx === 6;
              const cfg = rec ? ATTENDANCE_STATUS_CFG[rec.status] : null;
              const hol = holidayMap[dateStr];
              const holTone = hol ? (hol.kind === 'arefe' ? CHIP_TONES.warning : hol.kind === 'dini' ? CHIP_TONES.info : CHIP_TONES.success) : null;
              return (
                <View key={dateStr} style={{
                  width: `${100 / 7}%` as any, aspectRatio: 1,
                  alignItems: 'center', justifyContent: 'center', padding: 2, gap: 1,
                  backgroundColor: hol ? (holTone!.bg + '60') : (isWeekend ? '#F8FAFC' : undefined),
                  borderRadius: 8,
                  borderWidth: hol ? 1 : 0,
                  borderColor: hol ? (holTone!.fg + '30') : 'transparent',
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: hol ? holTone!.fg : (rec ? DS.ink[900] : DS.ink[400]) }}>{day}</Text>
                  {cfg && (
                    <>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: cfg.fg }} />
                      <Text style={{ fontSize: 7.5, fontWeight: '600', textAlign: 'center', color: cfg.fg }} numberOfLines={1}>
                        {cfg.label.split(' ')[0]}
                      </Text>
                    </>
                  )}
                  {!cfg && hol && (
                    <Text style={{ fontSize: 7.5, fontWeight: '700', textAlign: 'center', color: holTone!.fg }} numberOfLines={1}>
                      {hol.kind === 'arefe' ? 'Arefe' : hol.kind === 'dini' ? 'Bayram' : 'Tatil'}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {records.length > 0 && (
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
      )}
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
  const cfg       = ATTENDANCE_STATUS_CFG[r.status];
  const methodIn  = r.check_in_method  ? METHOD_CFG[r.check_in_method]  : null;
  const methodOut = r.check_out_method ? METHOD_CFG[r.check_out_method] : null;
  const d         = new Date(r.work_date + 'T00:00:00');
  const dayOfWeek = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][d.getDay()];
  const dayNum    = d.getDate();
  const monthName = TR_MONTHS[d.getMonth() + 1];
  const hasGps    = (r.check_in_lat != null && r.check_in_lng != null) || (r.check_out_lat != null && r.check_out_lng != null);

  return (
    <View style={{
      ...cardSolid,
      padding: 0, overflow: 'hidden',
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    }}>
      {/* TOP STRIP: date + status */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
        backgroundColor: cfg.bg + '40',
      }}>
        {/* Date chip */}
        <View style={{
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: '#FFFFFF',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ ...DISPLAY, fontSize: 17, fontWeight: '700', color: DS.ink[900], lineHeight: 18 }}>{dayNum}</Text>
          <Text style={{ fontSize: 8, fontWeight: '700', color: DS.ink[500], letterSpacing: 0.4, textTransform: 'uppercase' }}>{monthName.slice(0, 3)}</Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>{dayOfWeek}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: cfg.bg }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.fg, letterSpacing: 0.2 }}>{cfg.label}</Text>
            </View>
            {hasGps && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, backgroundColor: CHIP_TONES.success.bg }}>
                <MapPinCheck size={10} color={CHIP_TONES.success.fg} strokeWidth={2} />
                <Text style={{ fontSize: 9, fontWeight: '700', color: CHIP_TONES.success.fg }}>GPS</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable
          style={({ hovered }: any) => ({
            width: 30, height: 30, borderRadius: 8,
            backgroundColor: hovered ? CHIP_TONES.danger.bg : 'transparent',
            alignItems: 'center', justifyContent: 'center',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
          onPress={() => onDelete(r.id)}
        >
          <Trash2 size={14} color={DS.ink[400]} strokeWidth={1.6} />
        </Pressable>
      </View>

      {/* BODY: check-in / check-out / total */}
      <View style={{ flexDirection: 'row' }}>
        {/* Giriş */}
        <View style={{ flex: 1, padding: 12, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: CHIP_TONES.success.fg }} />
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: DS.ink[500], letterSpacing: 1, textTransform: 'uppercase' }}>Giriş</Text>
          </View>
          <Text style={{ ...DISPLAY, fontSize: 20, fontWeight: '700', color: r.check_in ? DS.ink[900] : DS.ink[300], letterSpacing: -0.5 }}>
            {r.check_in ? r.check_in.slice(0, 5) : '—'}
          </Text>
          {methodIn && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
              alignSelf: 'flex-start',
              backgroundColor: methodIn.bg,
            }}>
              <LucideIcon name={methodIn.icon} size={10} color={methodIn.fg} />
              <Text style={{ fontSize: 9, fontWeight: '700', color: methodIn.fg }}>{methodIn.label}</Text>
            </View>
          )}
        </View>

        {/* Çıkış */}
        <View style={{ flex: 1, padding: 12, gap: 4, borderStartWidth: 1, borderStartColor: 'rgba(0,0,0,0.04)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: CHIP_TONES.danger.fg }} />
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: DS.ink[500], letterSpacing: 1, textTransform: 'uppercase' }}>Çıkış</Text>
          </View>
          <Text style={{ ...DISPLAY, fontSize: 20, fontWeight: '700', color: r.check_out ? DS.ink[900] : DS.ink[300], letterSpacing: -0.5 }}>
            {r.check_out ? r.check_out.slice(0, 5) : '—'}
          </Text>
          {methodOut && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
              alignSelf: 'flex-start',
              backgroundColor: methodOut.bg,
            }}>
              <LucideIcon name={methodOut.icon} size={10} color={methodOut.fg} />
              <Text style={{ fontSize: 9, fontWeight: '700', color: methodOut.fg }}>{methodOut.label}</Text>
            </View>
          )}
        </View>

        {/* Toplam */}
        <View style={{
          flex: 1, padding: 12, gap: 4,
          borderStartWidth: 1, borderStartColor: 'rgba(0,0,0,0.04)',
          backgroundColor: DS.ink[50],
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Clock size={9} color={DS.ink[500]} strokeWidth={2} />
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: DS.ink[500], letterSpacing: 1, textTransform: 'uppercase' }}>Toplam</Text>
          </View>
          <Text style={{ ...DISPLAY, fontSize: 20, fontWeight: '700', color: r.work_minutes ? DS.ink[900] : DS.ink[300], letterSpacing: -0.5 }}>
            {r.work_minutes ? fmtMinutes(r.work_minutes) : '—'}
          </Text>
          {r.overtime_minutes > 0 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
              alignSelf: 'flex-start',
              backgroundColor: CHIP_TONES.warning.bg,
            }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: CHIP_TONES.warning.fg }}>+{fmtMinutes(r.overtime_minutes)} OT</Text>
            </View>
          )}
        </View>
      </View>

      {/* NOTES (alt) */}
      {r.notes ? (
        <View style={{
          paddingHorizontal: 14, paddingVertical: 8,
          borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
          backgroundColor: DS.ink[50],
        }}>
          <Text style={{ fontSize: 11, color: DS.ink[500], fontStyle: 'italic' }} numberOfLines={2}>{r.notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Özet Tab ─────────────────────────────────────────────────────────────────
function OzetTab({ summary, attSummary }: {
  summary: LeaveSummary;
  attSummary: AttendanceMonthlySummary | null;
}) {
  const T = useMobileTokens();
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
          <View style={{ height: 6, borderRadius: 3, backgroundColor: T.cardSoft }}>
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
  const T = useMobileTokens();
  return (
    <View style={{
      flex: 1, backgroundColor: T.cardSoft, borderRadius: 12, padding: 10,
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
  width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' as string,
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
  const T = useMobileTokens();
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
    if (!empId) { toast.error('Personel seçin.'); return; }
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

          <ScrollView style={{ flex: 1 }} contentContainerStyle={modalBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} showsVerticalScrollIndicator={false}>

            {/* Employee */}
            {preselectedId && selectedEmp ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                padding: 10, borderRadius: 12, backgroundColor: T.cardSoft,
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginBottom: 4,
              }}>
                <User size={15} color={DS.ink[500]} strokeWidth={1.8} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>{selectedEmp.full_name}</Text>
              </View>
            ) : (
              <>
                <Text style={modalLabel}>Personel *</Text>
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
                backgroundColor: T.cardSoft, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginTop: 4,
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
  const T = useMobileTokens();
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
    if (!employeeId) { toast.error('Personel seçilmedi.'); return; }
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

          <ScrollView style={{ flex: 1 }} contentContainerStyle={modalBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} showsVerticalScrollIndicator={false}>

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
          <ScrollView style={{ flex: 1 }} contentContainerStyle={modalBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} showsVerticalScrollIndicator={false}>
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
