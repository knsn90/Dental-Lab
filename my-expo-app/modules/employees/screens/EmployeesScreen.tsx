import { localeTag } from '../../../core/i18n';
/**
 * EmployeesScreen — Ekip (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 form, §08 dialog, §03 pill buttons,
 * Lucide icons.
 */
import React, { useState, useMemo, useContext, useRef } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, ActivityIndicator, Alert, RefreshControl,
  useWindowDimensions, Platform,
} from 'react-native';
import { toast } from '../../../core/ui/Toast';
import { supabase } from '../../../core/api/supabase';

import { useEmployees, useEmployeeDetail } from '../hooks/useEmployees';
import {
  createEmployee, updateEmployee, deleteEmployee,
  createSalaryPayment, deleteSalaryPayment,
  createAdvance, markAdvanceDeducted, deleteAdvance,
  ROLE_LABELS, ROLE_COLORS, MONTH_NAMES,
  type Employee, type EmployeeRole, type SalaryPaymentMethod,
} from '../api';
import { AddUserModal } from '../../admin/users/LabUsersManagement';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { DatePicker } from '../../../core/ui/DatePicker';
import { usePermissionStore } from '../../../core/store/permissionStore';
import { STAGE_LABEL, type Stage } from '../../orders/stages';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useRouter, useSegments } from 'expo-router';
import {
  Plus, Search, X, Inbox, Pencil, Trash2,
  UserPlus, UserX, UserCheck, Users, Phone, Mail, Clock,
  CircleCheck, Banknote, Landmark, CreditCard,
  ChevronRight, CircleDollarSign, CheckCircle, Check,
} from 'lucide-react-native';

// Yetkinlik sabitleri
const SKILL_STAGES: Stage[] = ['TRIAGE', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC'];
type SkillLevel = 'junior' | 'mid' | 'senior';
const SKILL_LEVELS: { key: SkillLevel; label: string }[] = [
  { key: 'junior', label: 'Junior' },
  { key: 'mid',    label: 'Mid' },
  { key: 'senior', label: 'Senior' },
];
const CASE_TYPES = ['zirconia', 'emax', 'pmma', 'metal', 'pfm'];

// ── Patterns tokens ─────────────────────────────────────────────────
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

const modalShadow = '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)';

const inputStyle = {
  height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFF',
};

// ── Helpers ──────────────────────────────────────────────────────────
function fmtMoney(n: number | null | undefined) {
  return '₺' + Number(n ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string) {
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

const ROLES: EmployeeRole[] = ['teknisyen', 'sef_teknisyen', 'muhasebe', 'sekreter', 'yonetici', 'diger'];
const PAY_METHODS: { v: SalaryPaymentMethod; l: string; icon: React.ComponentType<any> }[] = [
  { v: 'nakit',  l: 'Nakit',  icon: Banknote },
  { v: 'havale', l: 'Havale', icon: Landmark },
  { v: 'kart',   l: 'Kart',   icon: CreditCard },
];
const NOW = new Date();
const CUR_YEAR  = NOW.getFullYear();
const CUR_MONTH = NOW.getMonth() + 1;

// ── §03 Pill Button ─────────────────────────────────────────────────
function PillBtn({ icon: Icon, label, onPress, variant = 'dark', size = 'md', disabled }: {
  icon: React.ComponentType<any>; label: string; onPress: () => void;
  variant?: 'dark' | 'ghost' | 'danger' | 'warning'; size?: 'sm' | 'md'; disabled?: boolean;
}) {
  const dark = variant === 'dark';
  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';
  const h = size === 'sm' ? 32 : 38;
  const bg = dark ? DS.ink[900] : isDanger ? CHIP_TONES.danger.bg : isWarning ? CHIP_TONES.warning.bg : 'transparent';
  const fg = dark ? '#FFF' : isDanger ? CHIP_TONES.danger.fg : isWarning ? CHIP_TONES.warning.fg : DS.ink[700];
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        height: h, paddingHorizontal: size === 'sm' ? 12 : 16, borderRadius: 999,
        backgroundColor: bg,
        borderWidth: dark || isDanger || isWarning ? 0 : 1, borderColor: 'rgba(0,0,0,0.10)',
        opacity: disabled ? 0.5 : 1, cursor: 'pointer' as any,
      }}
    >
      <Icon size={size === 'sm' ? 13 : 15} color={fg} strokeWidth={1.8} />
      <Text style={{ fontSize: size === 'sm' ? 11 : 13, fontWeight: '600', color: fg }}>{label}</Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
      {children}
    </Text>
  );
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function EmployeesScreen() {
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const theme = usePanelTheme();

  const { employees, loading, refetch } = useEmployees();

  // ── RBAC: personel yönetimi + maaş görüntüleme yetkileri ──
  const can = usePermissionStore(s => s.can);
  const canManage = can('manage_employees');
  const canViewSalaries = can('view_salaries');

  const [formOpen,      setFormOpen]      = useState(false);
  const [editEmp,       setEditEmp]       = useState<Employee | null>(null);
  const [addUserOpen,   setAddUserOpen]   = useState(false);   // LabUsersManagement formu
  const [filterActive, setFilterActive] = useState(true);
  const [search, setSearch] = useState('');

  // ── Confirmation dialog ─────────────────────────────────────
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // ── Undo banner ──────────────────────────────────────────────
  const [undoBanner, setUndoBanner] = useState<{ message: string; onUndo: () => void } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUndoBanner = (message: string, onUndo: () => void) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoBanner({ message, onUndo });
    undoTimerRef.current = setTimeout(() => setUndoBanner(null), 5500);
  };

  const dismissUndoBanner = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoBanner(null);
  };

  const activeCount   = employees.filter(e => e.is_active).length;
  const totalSalary   = employees.filter(e => e.is_active).reduce((s, e) => s + Number(e.base_salary), 0);
  const unpaidCount   = employees.filter(e => e.is_active && !e.current_month_paid).length;
  const totalAdvances = employees.reduce((s, e) => s + Number(e.pending_advances ?? 0), 0);

  const filtered = useMemo(() => {
    let list = filterActive ? employees.filter(e => e.is_active) : employees;
    if (search) {
      const sl = search.toLowerCase();
      list = list.filter(e =>
        e.full_name.toLowerCase().includes(sl) ||
        ROLE_LABELS[e.role].toLowerCase().includes(sl),
      );
    }
    return list;
  }, [employees, filterActive, search]);

  // Synthetic profile (auth-only) ekipı için profile id döndürür
  const syntheticProfileId = (emp: Employee): string | null => {
    const id = String(emp.id);
    return id.startsWith('profile-') ? id.slice('profile-'.length) : null;
  };

  const handleDelete = (emp: Employee) => {
    if (!canManage) { toast.error('Bu işlem için yetkiniz yok.'); return; }
    const profileId = syntheticProfileId(emp);
    setConfirm({
      title: 'Personelı sil',
      highlight: emp.full_name,
      message: profileId
        ? 'sistem hesabı pasife alınacak. (Auth hesabını tamamen silmek için Yönetici → Kullanıcılar bölümünü kullanın.)'
        : 'kaydı kalıcı olarak silinecek. Bu işlem geri alınabilir.',
      label: 'Evet, sil',
      variant: 'danger',
      onConfirm: () => {
        setConfirm(null);
        // Delayed delete — user can undo within 5 seconds
        let cancelled = false;
        const deleteTimer = setTimeout(async () => {
          if (cancelled) return;
          dismissUndoBanner();
          let error: any = null;
          if (profileId) {
            // .select() ile returning row al — RLS sessiz reddederse data=[] olur
            const r = await supabase.from('profiles')
              .update({ is_active: false })
              .eq('id', profileId)
              .select('id');
            error = r.error;
            if (!error && (!r.data || r.data.length === 0)) {
              error = new Error('İşlem reddedildi (RLS / yetki). Bu kullanıcı admin olduğunda kullanıcılar bölümünden silinebilir.');
            }
          } else {
            // Hard delete with returning select — 0 rows = silently blocked
            const r = await supabase.from('employees')
              .delete()
              .eq('id', emp.id)
              .select('id');
            error = r.error;
            const deletedRows = r.data?.length ?? 0;
            // FK constraint → soft-delete fallback
            if (error && /foreign key|violates|reference/i.test(error.message ?? '')) {
              const r2 = await supabase.from('employees')
                .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) })
                .eq('id', emp.id)
                .select('id');
              error = r2.error;
              if (!error && (!r2.data || r2.data.length === 0)) {
                error = new Error('Pasife alma yetkisi yok (RLS).');
              }
              if (!error) toast.info(`"${emp.full_name}" pasife alındı (geçmiş kayıtları korundu).`);
            } else if (!error && deletedRows === 0) {
              // Hard delete sessiz reddedildi — soft-delete dene
              const r2 = await supabase.from('employees')
                .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) })
                .eq('id', emp.id)
                .select('id');
              error = r2.error;
              if (!error && (!r2.data || r2.data.length === 0)) {
                error = new Error('Silme işlemi RLS politikası tarafından engellendi. Veritabanı yöneticisiyle iletişime geçin.');
              }
              if (!error) toast.info(`"${emp.full_name}" pasife alındı.`);
            }
          }
          if (error) {
            // eslint-disable-next-line no-console
            console.error('[employees] delete error:', error);
            Alert.alert('Silme başarısız', (error as any).message ?? 'Bilinmeyen hata');
          } else {
            refetch();
          }
        }, 5000);

        showUndoBanner(`"${emp.full_name}" siliniyor…`, () => {
          cancelled = true;
          clearTimeout(deleteTimer);
          toast.info('Silme işlemi iptal edildi.');
        });
      },
    });
  };

  const handleDeactivate = (emp: Employee) => {
    if (!canManage) { toast.error('Bu işlem için yetkiniz yok.'); return; }
    const profileId = syntheticProfileId(emp);
    setConfirm({
      title: 'Pasife al',
      highlight: emp.full_name,
      message: 'pasif olarak işaretlenecek. Maaş ve avans kayıtları korunur.',
      label: 'Pasife Al',
      variant: 'warning',
      onConfirm: async () => {
        setConfirm(null);
        if (profileId) {
          await supabase.from('profiles').update({ is_active: false }).eq('id', profileId);
        } else {
          await updateEmployee(emp.id, { is_active: false, end_date: new Date().toISOString().slice(0, 10) });
        }
        refetch();
        showUndoBanner(`${emp.full_name} pasife alındı`, async () => {
          dismissUndoBanner();
          if (profileId) {
            await supabase.from('profiles').update({ is_active: true }).eq('id', profileId);
          } else {
            await updateEmployee(emp.id, { is_active: true, end_date: null });
          }
          refetch();
          toast.success('Tekrar aktif edildi.');
        });
      },
    });
  };

  // Pasif personelı geri aktif et — onay sormadan, hızlı işlem
  const handleReactivate = async (emp: Employee) => {
    if (!canManage) { toast.error('Bu işlem için yetkiniz yok.'); return; }
    const profileId = syntheticProfileId(emp);
    const { error } = profileId
      ? await supabase.from('profiles').update({ is_active: true }).eq('id', profileId)
      : await updateEmployee(emp.id, { is_active: true, end_date: null });
    if (error) { toast.error((error as any).message); return; }
    refetch();
    toast.success(`${emp.full_name} tekrar aktif edildi`);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: isDesktop || isEmbedded ? 0 : 12,
          paddingTop: isDesktop || isEmbedded ? 0 : insets.top + 8,
          paddingBottom: 120,
          gap: 14,
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DS.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── F1 HeroCard — Ekip özeti (theme.primary bg + white blobs) ── */}
        <View style={{
          borderRadius: 20, overflow: 'hidden',
          backgroundColor: theme.primary, padding: isDesktop ? 22 : 18,
          position: 'relative',
        }}>
          {/* White decorative blobs */}
          <View style={{ position: 'absolute', top: -50, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.20)' }} />
          <View style={{ position: 'absolute', bottom: -60, left: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)' }} />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
                Aktif Personel
              </Text>
              <Text
                style={{ ...DISPLAY, fontWeight: '300', fontSize: isDesktop ? 44 : 36, color: '#FFFFFF', letterSpacing: -1.2, lineHeight: isDesktop ? 48 : 40 }}
                numberOfLines={1}
              >
                {activeCount}
              </Text>
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)', marginTop: 4 }}>
                {employees.length} toplam kayıt
              </Text>
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
              <UserPlus size={20} color="#FFFFFF" strokeWidth={1.6} />
            </View>
          </View>

          {/* KPI strip — F1 stat cards */}
          {canViewSalaries && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {([
                { label: 'Bu Ay Maaş',     value: fmtMoney(totalSalary)                      },
                { label: 'Ödenmemiş',      value: `${unpaidCount} kişi`                      },
                { label: 'Bekleyen Avans', value: fmtMoney(totalAdvances)                    },
              ] as const).map(stat => (
                <View key={stat.label} style={{
                  flex: 1, minWidth: 110,
                  paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14,
                  backgroundColor: 'rgba(255,255,255,0.16)',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                    {stat.label}
                  </Text>
                  <Text
                    style={{ ...DISPLAY, fontWeight: '300', fontSize: 16, color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 20, marginTop: 4 }}
                    numberOfLines={1}
                  >
                    {stat.value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* CTAs — beyaz pill butonlar */}
          {canManage && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Pressable
                onPress={() => { setEditEmp(null); setFormOpen(true); }}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                  backgroundColor: hovered ? '#F5F5F5' : '#FFFFFF',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <UserPlus size={13} color={DS.ink[900]} strokeWidth={2} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[900] }}>Personel Ekle</Text>
              </Pressable>
              <Pressable
                onPress={() => setAddUserOpen(true)}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                  backgroundColor: hovered ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.16)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <UserPlus size={13} color="#FFFFFF" strokeWidth={2} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Hesap ile Ekle</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Filter pills ────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { key: true,  label: `Aktif (${activeCount})` },
            { key: false, label: `Tümü (${employees.length})` },
          ].map(f => {
            const active = filterActive === f.key;
            return (
              <Pressable
                key={String(f.key)}
                onPress={() => setFilterActive(f.key)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                  backgroundColor: active ? DS.ink[50] : '#FFF',
                  cursor: 'pointer' as any,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Search — §05.5 ──────────────────────────────────── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          height: 44, paddingHorizontal: 14, borderRadius: 14,
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
        }}>
          <Search size={15} color={DS.ink[400]} strokeWidth={1.8} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: DS.ink[900], outline: 'none' as any }}
            placeholder="Ad veya pozisyon ara..."
            placeholderTextColor={DS.ink[400]}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} style={{ cursor: 'pointer' as any }}>
              <X size={14} color={DS.ink[400]} strokeWidth={2} />
            </Pressable>
          )}
        </View>

        {/* ── Employee list ───────────────────────────────────── */}
        {filtered.length === 0 ? (
          <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Inbox size={32} color={DS.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>
              {search ? 'Sonuç bulunamadı' : 'Personel bulunamadı'}
            </Text>
          </View>
        ) : isDesktop ? (
          /* ── Desktop: full-width table (no side detail panel) ── */
          <View>
            <View style={{ ...tableCard }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Personel</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 12, color: DS.ink[400] }}>{filtered.length} kişi</Text>
              </View>

              {/* Header — MAAŞ + DURUM kolonları sadece view_salaries yetkisinde */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                {[
                  { label: 'ÇALIŞAN',  flex: 2.5 },
                  { label: 'POZİSYON', flex: 1.2 },
                  ...(canViewSalaries
                    ? [{ label: 'MAAŞ', flex: 1, align: 'right' as const },
                       { label: 'DURUM', flex: 1 }]
                    : []),
                  { label: 'İŞLEM',    flex: 1 },
                ].map((h, i) => (
                  <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: h.align }}>
                    {h.label}
                  </Text>
                ))}
              </View>

              {/* Rows */}
              {filtered.map((emp, i) => {
                const role = ROLE_COLORS[emp.role];
                const initials = emp.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <View
                    key={emp.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 20, paddingVertical: 14,
                      borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                      borderBottomColor: 'rgba(0,0,0,0.04)',
                      backgroundColor: 'transparent',
                      opacity: emp.is_active ? 1 : 0.5,
                      cursor: 'pointer' as any,
                    }}
                  >
                    <View style={{ flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: role.fg }}>{initials}</Text>
                      </View>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{emp.full_name}</Text>
                          {String(emp.id).startsWith('profile-') && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(37,99,235,0.10)' }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#2563EB' }}>Hesap</Text>
                            </View>
                          )}
                          {!emp.is_active && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: DS.ink[100] }}>
                              <Text style={{ fontSize: 9, fontWeight: '600', color: DS.ink[500] }}>Ayrıldı</Text>
                            </View>
                          )}
                        </View>
                        {emp.phone && (
                          <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{emp.phone}</Text>
                        )}
                      </View>
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: role.bg }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: role.fg }}>{ROLE_LABELS[emp.role]}</Text>
                      </View>
                    </View>
                    {canViewSalaries && (
                      <>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[900], textAlign: 'right' }}>
                          {fmtMoney(emp.base_salary)}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <View style={{
                            alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                            backgroundColor: emp.current_month_paid ? CHIP_TONES.success.bg : CHIP_TONES.warning.bg,
                          }}>
                            {emp.current_month_paid
                              ? <CheckCircle size={10} color={CHIP_TONES.success.fg} strokeWidth={2} />
                              : <Clock size={10} color={CHIP_TONES.warning.fg} strokeWidth={2} />
                            }
                            <Text style={{ fontSize: 10, fontWeight: '600', color: emp.current_month_paid ? CHIP_TONES.success.fg : CHIP_TONES.warning.fg }}>
                              {emp.current_month_paid ? 'Ödendi' : 'Bekliyor'}
                            </Text>
                          </View>
                        </View>
                      </>
                    )}
                    {canManage ? (
                      <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                        <Pressable
                          onPress={() => { setEditEmp(emp); setFormOpen(true); }}
                          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                        >
                          <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                        </Pressable>
                        {emp.is_active ? (
                          <Pressable
                            onPress={() => handleDeactivate(emp)}
                            style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                          >
                            <UserX size={13} color={DS.ink[500]} strokeWidth={1.6} />
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => handleReactivate(emp)}
                            style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: CHIP_TONES.success.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                          >
                            <UserCheck size={13} color={CHIP_TONES.success.fg} strokeWidth={1.8} />
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => handleDelete(emp)}
                          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                        >
                          <Trash2 size={13} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                        </Pressable>
                      </View>
                    ) : (
                      // Yetki yok — sadece görüntüleme rozeti
                      <View style={{ flex: 1 }} />
                    )}
                  </View>
                );
              })}
            </View>

          </View>
        ) : (
          /* ── Mobile: cardSolid ──────────────────────────────── */
          filtered.map(emp => {
            const role = ROLE_COLORS[emp.role];
            const initials = emp.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const pendAdv = Number(emp.pending_advances ?? 0);
            return (
              <View
                key={emp.id}
                style={{ ...cardSolid, padding: 16, opacity: emp.is_active ? 1 : 0.5 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: role.fg }}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{emp.full_name}</Text>
                      {!emp.is_active && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: DS.ink[100] }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: DS.ink[500] }}>Ayrıldı</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: role.bg }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: role.fg }}>{ROLE_LABELS[emp.role]}</Text>
                      </View>
                      {emp.phone && <Text style={{ fontSize: 11, color: DS.ink[400] }}>{emp.phone}</Text>}
                    </View>
                  </View>
                  {canViewSalaries && (
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: DS.ink[900] }}>
                        {fmtMoney(emp.base_salary)}
                      </Text>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                        backgroundColor: emp.current_month_paid ? CHIP_TONES.success.bg : CHIP_TONES.warning.bg,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: emp.current_month_paid ? CHIP_TONES.success.fg : CHIP_TONES.warning.fg }}>
                          {emp.current_month_paid ? 'Ödendi' : 'Bekliyor'}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Action row — sadece manage_employees yetkisi varsa görünür */}
                {canManage && (
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 10, justifyContent: 'flex-end' }}>
                    <Pressable
                      onPress={() => { setEditEmp(emp); setFormOpen(true); }}
                      style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                    >
                      <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                    </Pressable>
                    {emp.is_active ? (
                      <Pressable
                        onPress={() => handleDeactivate(emp)}
                        style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <UserX size={13} color={DS.ink[500]} strokeWidth={1.6} />
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => handleReactivate(emp)}
                        style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: CHIP_TONES.success.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <UserCheck size={13} color={CHIP_TONES.success.fg} strokeWidth={1.8} />
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => handleDelete(emp)}
                      style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                    >
                      <Trash2 size={13} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Employee Form Modal — §08 ──────────────────────────── */}
      <EmployeeFormModal
        visible={formOpen}
        employee={editEmp}
        onClose={() => { setFormOpen(false); setEditEmp(null); }}
        onSaved={() => { setFormOpen(false); setEditEmp(null); refetch(); }}
      />

      {/* ── Hesap ile Ekle — LabUsersManagement formu ────────── */}
      <AddUserModal
        visible={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        onSuccess={() => { setAddUserOpen(false); refetch(); }}
        accentColor={DS.exec.primary}
        panelBg={DS.exec.bg}
        labOnly={true}
      />

      {/* Maaş ödemesi ve avans işlemleri Finans bölümünde — Ekip sekmesinde değil */}

      {/* ── Confirmation Dialog ──────────────────────────────────── */}
      {/* ── Confirmation Dialog (Patterns §08) ───────────────────── */}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      {/* ── Undo Banner ──────────────────────────────────────────── */}
      {undoBanner && (
        <View
          style={{
            position: 'absolute', bottom: 20, left: 16, right: 16,
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: DS.ink[900], borderRadius: 16,
            paddingLeft: 16, paddingRight: 8, paddingVertical: 12,
            zIndex: 999,
            // @ts-ignore web
            boxShadow: '0 4px 32px rgba(0,0,0,0.25)',
          }}
        >
          <Text style={{ flex: 1, fontSize: 13, color: '#FFF', fontWeight: '500', lineHeight: 18 }}>
            {undoBanner.message}
          </Text>
          <Pressable
            onPress={() => { dismissUndoBanner(); undoBanner.onUndo(); }}
            style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
              backgroundColor: DS.exec.primary, cursor: 'pointer' as any,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>Geri Al</Text>
          </Pressable>
          <Pressable
            onPress={dismissUndoBanner}
            style={{ padding: 6, cursor: 'pointer' as any }}
          >
            <X size={16} color="rgba(255,255,255,0.5)" strokeWidth={2} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Employee Detail Panel
// ═════════════════════════════════════════════════════════════════════
function EmployeeDetailPanel({ employee, onSalaryAdd, onAdvAdd, onRefresh }: {
  employee: Employee;
  onSalaryAdd: () => void; onAdvAdd: () => void; onRefresh: () => void;
}) {
  const { salaries, advances, loading, refetch } = useEmployeeDetail(employee.id);
  const role = ROLE_COLORS[employee.role];
  const initials = employee.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const handleDelSalary = (id: string) => {
    Alert.alert('Maaş Kaydını Sil', 'Bu ödeme kaydı silinecek.', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await deleteSalaryPayment(id); refetch(); onRefresh();
      }},
    ]);
  };

  const handleDelAdv = (id: string) => {
    Alert.alert('Avansı Sil', 'Bu avans kaydı silinecek?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await deleteAdvance(id); refetch(); onRefresh();
      }},
    ]);
  };

  const handleMarkDeducted = async (id: string) => {
    await markAdvanceDeducted(id); refetch(); onRefresh();
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: role.fg }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>{employee.full_name}</Text>
          <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>{ROLE_LABELS[employee.role]}</Text>
          {employee.phone && <Text style={{ fontSize: 11, color: CHIP_TONES.info.fg, marginTop: 1 }}>{employee.phone}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>Maaş</Text>
          <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: DS.ink[900] }}>{fmtMoney(employee.base_salary)}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={DS.exec.primary} />
        ) : (
          <>
            {/* ── Maaş Ödemeleri ── */}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>Maaş Ödemeleri</Text>
                <PillBtn icon={Plus} label="Ödeme Ekle" size="sm" onPress={onSalaryAdd} />
              </View>
              {salaries.length === 0 ? (
                <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic', paddingVertical: 8 }}>Henüz ödeme yok</Text>
              ) : salaries.map(sal => (
                <View key={sal.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: '#FFF', borderRadius: 14, padding: 12, marginBottom: 6,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
                }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: CHIP_TONES.success.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Banknote size={15} color={CHIP_TONES.success.fg} strokeWidth={1.6} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                      {MONTH_NAMES[sal.period_month]} {sal.period_year}
                    </Text>
                    <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>
                      {fmtDate(sal.payment_date)} · {sal.payment_method === 'nakit' ? 'Nakit' : sal.payment_method === 'havale' ? 'Havale' : 'Kart'}
                      {sal.deductions > 0 ? ` · Kesinti: ${fmtMoney(sal.deductions)}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: CHIP_TONES.success.fg }}>{fmtMoney(sal.net_amount)}</Text>
                  <Pressable onPress={() => handleDelSalary(sal.id)} style={{ padding: 4, cursor: 'pointer' as any }}>
                    <Trash2 size={13} color={DS.ink[300]} strokeWidth={1.6} />
                  </Pressable>
                </View>
              ))}
            </View>

            {/* ── Avanslar ── */}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>Avanslar</Text>
                <PillBtn icon={CircleDollarSign} label="Avans Ver" size="sm" variant="warning" onPress={onAdvAdd} />
              </View>
              {advances.length === 0 ? (
                <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic', paddingVertical: 8 }}>Avans kaydı yok</Text>
              ) : advances.map(adv => (
                <View key={adv.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: '#FFF', borderRadius: 14, padding: 12, marginBottom: 6,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
                  opacity: adv.is_deducted ? 0.5 : 1,
                }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: adv.is_deducted ? DS.ink[100] : CHIP_TONES.warning.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <CircleDollarSign size={15} color={adv.is_deducted ? DS.ink[400] : CHIP_TONES.warning.fg} strokeWidth={1.6} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: adv.is_deducted ? DS.ink[400] : DS.ink[900] }}>
                      {adv.description || 'Avans'}
                    </Text>
                    <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>
                      {fmtDate(adv.advance_date)} · {adv.is_deducted ? 'Kesildi' : 'Bekliyor'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: adv.is_deducted ? DS.ink[400] : CHIP_TONES.warning.fg }}>
                    {fmtMoney(adv.amount)}
                  </Text>
                  {!adv.is_deducted && (
                    <Pressable
                      onPress={() => handleMarkDeducted(adv.id)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: CHIP_TONES.warning.bg, cursor: 'pointer' as any }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.warning.fg }}>Kesildi</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => handleDelAdv(adv.id)} style={{ padding: 4, cursor: 'pointer' as any }}>
                    <Trash2 size={13} color={DS.ink[300]} strokeWidth={1.6} />
                  </Pressable>
                </View>
              ))}
            </View>

            {/* ── Özet ── */}
            <View style={{ ...cardSolid, padding: 16, gap: 6 }}>
              <SummaryRow label="Toplam Ödenen Maaş" value={fmtMoney(employee.total_salary_paid)} color={CHIP_TONES.success.fg} />
              <SummaryRow label="Toplam Verilen Avans" value={fmtMoney(employee.total_advances)} color={CHIP_TONES.warning.fg} />
              <SummaryRow label="Bekleyen Avans" value={fmtMoney(employee.pending_advances)} color={CHIP_TONES.danger.fg} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color }}>{value}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Employee Form Modal — §08
// ═════════════════════════════════════════════════════════════════════
function EmployeeFormModal({ visible, employee, onClose, onSaved }: {
  visible: boolean; employee: Employee | null;
  onClose: () => void; onSaved: () => void;
}) {
  const P = DS.exec.primary; // admin/exec panel accent (#4771AB kobalt) — Ekip HR Hub admin'de
  const router = useRouter();
  const navSegments = useSegments() as string[];
  const navGroup = navSegments?.[0] && navSegments[0].startsWith('(') ? navSegments[0] : '(lab)';
  // Maaş input'u sadece view_salaries yetkisi olanlara görünür
  const canViewSalaries = usePermissionStore(s => s.can('view_salaries'));
  const [name,   setName]   = useState('');
  const [role,   setRole]   = useState<EmployeeRole>('teknisyen');
  const [phone,  setPhone]  = useState('');
  const [email,  setEmail]  = useState('');
  const [password, setPassword] = useState('');
  const [salary, setSalary] = useState('');
  const [start,  setStart]  = useState(new Date().toISOString().slice(0, 10));
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);

  // Yetkinlik state'leri (sadece teknisyen rolünde gösterilir)
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('mid');
  const [stagePerms, setStagePerms] = useState<Set<Stage>>(new Set());
  const [origStagePerms, setOrigStagePerms] = useState<Set<Stage>>(new Set());
  const [caseTypes, setCaseTypes] = useState<string[] | null>(null); // null = "tümü"
  const [linkedProfileId, setLinkedProfileId] = useState<string | null>(null);

  const isTechnician = role === 'teknisyen' || role === 'sef_teknisyen';

  React.useEffect(() => {
    if (visible) {
      setName(employee?.full_name ?? '');
      setRole(employee?.role ?? 'teknisyen');
      setPhone(employee?.phone ?? '');
      setEmail(employee?.email ?? '');
      setPassword('');
      setSalary(employee ? String(employee.base_salary) : '');
      setStart(employee?.start_date ?? new Date().toISOString().slice(0, 10));
      setNotes(employee?.notes ?? '');
      setSkillLevel('mid');
      setStagePerms(new Set());
      setOrigStagePerms(new Set());
      setCaseTypes(null);
      setLinkedProfileId(null);

      // Yetkinlik bilgilerini yükle — bağlı profil varsa
      if (employee) {
        (async () => {
          // Synthetic profile (id "profile-xxx") veya email/isim eşleşmesi ile profil bul
          let profileId: string | null = null;
          if (String(employee.id).startsWith('profile-')) {
            profileId = String(employee.id).slice('profile-'.length);
          } else if (employee.email) {
            const { data } = await supabase.from('profiles').select('id').eq('email', employee.email).maybeSingle();
            if (data?.id) profileId = data.id;
          }
          if (!profileId && employee.full_name) {
            const { data } = await supabase.from('profiles').select('id').eq('full_name', employee.full_name).maybeSingle();
            if (data?.id) profileId = data.id;
          }
          if (!profileId) return;
          setLinkedProfileId(profileId);

          // skill_level + allowed_types
          const { data: prof } = await supabase
            .from('profiles')
            .select('skill_level, allowed_types')
            .eq('id', profileId)
            .maybeSingle();
          if (prof) {
            if (prof.skill_level) setSkillLevel(prof.skill_level as SkillLevel);
            setCaseTypes((prof as any).allowed_types ?? null);
          }

          // user_stage_skills
          const { data: skills } = await supabase
            .from('user_stage_skills')
            .select('stage')
            .eq('user_id', profileId);
          const set = new Set<Stage>(((skills ?? []) as any[]).map(r => r.stage as Stage));
          setStagePerms(set);
          setOrigStagePerms(new Set(set));
        })();
      }
    }
  }, [visible, employee]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Ad Soyad zorunlu.'); return; }
    // Maaş yalnızca yetkili kullanıcı görmüşse validate edilir; yoksa varsayılan 0 / mevcut değer korunur
    const sal = canViewSalaries
      ? Number(salary.replace(',', '.'))
      : (employee ? Number(employee.base_salary) : 0);
    if (canViewSalaries && (!Number.isFinite(sal) || sal < 0)) {
      toast.error('Geçerli maaş girin.'); return;
    }

    // Auth: email + sifre verildiyse sisteme giris hesabi olustur
    const wantsAuth = !employee && email.trim() && password.length > 0;
    if (wantsAuth) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error('Geçerli e-posta girin.'); return; }
      if (password.length < 6) { toast.error('Şifre en az 6 karakter olmalı.'); return; }
    }

    setSaving(true);
    const params = { full_name: name.trim(), role, phone: phone || undefined,
      email: email || undefined, base_salary: sal, start_date: start, notes: notes || undefined };

    // employees tablosunu güncelle — synthetic profile satırı ise atla (profile-xxx)
    const isSyntheticOnly = !!employee && String(employee.id).startsWith('profile-');
    let employeeError: any = null;
    if (!isSyntheticOnly) {
      const { error } = employee
        ? await updateEmployee(employee.id, params)
        : await createEmployee(params);
      employeeError = error;
    }
    if (employeeError) { setSaving(false); toast.error((employeeError as any).message); return; }

    // EmployeeRole → profiles.role mapping
    const empToProfileRole: Record<EmployeeRole, string> = {
      teknisyen:    'technician',
      sef_teknisyen:'technician',
      yonetici:     'manager',
      muhasebe:     'accounting',
      sekreter:     'receptionist',
      diger:        'service',
    };

    // Bağlı profil varsa profiles tablosuna tüm temel bilgileri sync et
    // NOT: maaş (base_salary) employees tablosunda; profiles'da değil
    if (linkedProfileId) {
      const profilePatch: Record<string, any> = {
        full_name: name.trim(),
        phone:     phone || null,
        role:      empToProfileRole[role] ?? null,
      };
      // Teknisyen ise yetkinlik alanlarını da ekle
      if (isTechnician) {
        profilePatch.skill_level   = skillLevel;
        profilePatch.allowed_types = caseTypes;
      }

      const { error: profErr } = await supabase
        .from('profiles')
        .update(profilePatch)
        .eq('id', linkedProfileId);
      if (profErr) {
        setSaving(false);
        toast.error(profErr.message ?? 'Profil güncellenemedi');
        return;
      }

      // Synthetic profile (auth-only) — employees tablosunda eşleşen satır
      // varsa güncelle; yoksa yeni satır oluştur. Böylece maaş, başlangıç
      // tarihi, notlar gibi bilgiler kalıcı olur.
      if (isSyntheticOnly) {
        // Email veya isim ile employees satırını ara
        let existingEmp: { id: string } | null = null;
        if (email.trim()) {
          const r = await supabase
            .from('employees')
            .select('id')
            .eq('email', email.trim())
            .maybeSingle();
          existingEmp = (r.data as any) ?? null;
        }
        if (!existingEmp && name.trim()) {
          const r = await supabase
            .from('employees')
            .select('id')
            .eq('full_name', name.trim())
            .maybeSingle();
          existingEmp = (r.data as any) ?? null;
        }

        if (existingEmp?.id) {
          // Mevcut employees satırını güncelle
          const { error: updErr } = await supabase.from('employees')
            .update({
              full_name:   name.trim(),
              role,
              phone:       phone || null,
              email:       email.trim() || null,
              base_salary: Number.isFinite(sal) ? sal : 0,
              start_date:  start,
              notes:       notes || null,
            })
            .eq('id', existingEmp.id);
          if (updErr) {
            setSaving(false);
            toast.error(updErr.message ?? 'Personel kaydı güncellenemedi');
            return;
          }
        } else {
          // Yeni employees satırı oluştur — auth profile ile eşleşen
          const { error: insErr } = await supabase.from('employees').insert({
            full_name:   name.trim(),
            role,
            phone:       phone || null,
            email:       email.trim() || null,
            base_salary: Number.isFinite(sal) ? sal : 0,
            start_date:  start,
            notes:       notes || null,
            is_active:   true,
          });
          if (insErr) {
            setSaving(false);
            toast.error(insErr.message ?? 'Personel kaydı oluşturulamadı');
            return;
          }
        }
      }
    }

    // Teknisyen ise stage skills diff/sync
    if (linkedProfileId && isTechnician) {
      const toAdd    = [...stagePerms].filter(s => !origStagePerms.has(s));
      const toRemove = [...origStagePerms].filter(s => !stagePerms.has(s));
      if (toRemove.length > 0) {
        await supabase.from('user_stage_skills')
          .delete()
          .eq('user_id', linkedProfileId)
          .in('stage', toRemove);
      }
      if (toAdd.length > 0) {
        // lab_id'yi profile'dan al
        const { data: prof } = await supabase.from('profiles').select('lab_id').eq('id', linkedProfileId).maybeSingle();
        const labId = prof?.lab_id;
        if (labId) {
          await supabase.from('user_stage_skills')
            .insert(toAdd.map(s => ({ user_id: linkedProfileId, stage: s, lab_id: labId })));
        }
      }
    }

    // Lab kullanicisi olarak auth hesabi olustur
    if (wantsAuth) {
      // role -> profiles.role: technician | manager (yonetici = mesul müdür)
      const profileRole = role === 'yonetici' ? 'manager' : 'technician';
      const signUpRes = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            user_type: 'lab',
            role: profileRole,
            full_name: name.trim(),
            phone: phone || undefined,
            approval_status: 'approved',
          },
        },
      });
      if (signUpRes.error) {
        setSaving(false);
        toast.error(`Personel eklendi, ancak giriş hesabı oluşturulamadı: ${signUpRes.error.message}`);
        return;
      }
      if (signUpRes.data.user?.id) {
        await supabase.from('profiles').update({
          full_name: name.trim(),
          phone: phone || null,
          approval_status: 'approved',
          is_active: true,
        }).eq('id', signUpRes.data.user.id);
      }
    }

    setSaving(false);
    toast.success(employee ? 'Personel güncellendi' : 'Personel eklendi');
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 520,
          maxHeight: '92%', overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          {/* Header — Patterns §13 */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
            paddingHorizontal: 28, paddingTop: 28, paddingBottom: 18,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <Text style={{ ...DISPLAY, flex: 1, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: DS.ink[900] }}>
              {employee ? 'Personelı Düzenle' : 'Yeni Personel'}
            </Text>
            {/* Outlined X — panel rengiyle */}
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, borderColor: P, alignItems: 'center', justifyContent: 'center', marginLeft: 12, marginTop: 2, cursor: 'pointer' as any }}
            >
              <X size={14} color={P} strokeWidth={2.2} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
            {/* Pozisyon — pill strip (outlined active) */}
            <View>
              <FieldLabel>Pozisyon</FieldLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 4, backgroundColor: '#F5F5F5', borderRadius: 999 }}>
                {ROLES.map(r => {
                  const active = role === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setRole(r)}
                      style={{
                        paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
                        backgroundColor: 'transparent',
                        borderWidth: active ? 1.5 : 0,
                        borderColor: active ? P : 'transparent',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? P : DS.ink[500] }}>
                        {ROLE_LABELS[r]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <FieldLabel>Ad Soyad *</FieldLabel>
              <TextInput style={inputStyle} value={name} onChangeText={setName}
                placeholder="Tam ad giriniz" placeholderTextColor={DS.ink[400]} />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>Telefon</FieldLabel>
                <TextInput style={inputStyle} value={phone} onChangeText={setPhone}
                  placeholder="0555 000 00 00" placeholderTextColor={DS.ink[400]} keyboardType="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>E-posta</FieldLabel>
                <TextInput style={inputStyle} value={email} onChangeText={setEmail}
                  placeholder="ad@mail.com" placeholderTextColor={DS.ink[400]} keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>

            {/* Sisteme giriş — opsiyonel, sadece yeni eklemede */}
            {!employee && (
              <View>
                <FieldLabel>Şifre (sisteme giriş için, opsiyonel)</FieldLabel>
                <TextInput style={inputStyle} value={password} onChangeText={setPassword}
                  placeholder="En az 6 karakter — boş bırakırsan login olmaz" placeholderTextColor={DS.ink[400]} secureTextEntry />
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              {canViewSalaries && (
                <View style={{ flex: 1 }}>
                  <FieldLabel>Maaş (₺/ay) *</FieldLabel>
                  <TextInput style={inputStyle} value={salary} onChangeText={setSalary}
                    placeholder="0,00" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <FieldLabel>İşe Başlama</FieldLabel>
                <DatePicker
                  value={start}
                  onChange={setStart}
                  accent={P}
                  placeholder="Tarih seç"
                />
              </View>
            </View>

            <View>
              <FieldLabel>Notlar</FieldLabel>
              <TextInput
                style={{ ...inputStyle, minHeight: 64, textAlignVertical: 'top' as any, paddingVertical: 12 }}
                value={notes} onChangeText={setNotes} placeholder="Ek bilgi…"
                placeholderTextColor={DS.ink[400]} multiline />
            </View>

            {/* ── Yetkinlik (sadece teknisyen + bağlı profil varsa) ─────── */}
            {isTechnician && linkedProfileId && (
              <View style={{ gap: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginTop: 8 }}>
                  Yetkinlik
                </Text>

                {/* Seviye — 3 eşit buton, dark fill aktif */}
                <View>
                  <FieldLabel>Seviye</FieldLabel>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {SKILL_LEVELS.map(({ key, label }) => {
                      const active = skillLevel === key;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => setSkillLevel(key)}
                          style={{
                            flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center',
                            borderWidth: 1, borderColor: active ? '#0A0A0A' : 'rgba(0,0,0,0.08)',
                            backgroundColor: active ? '#0A0A0A' : '#FAFAFA',
                            cursor: 'pointer' as any,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#FFF' : DS.ink[500] }}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Stage/İstasyon yetkileri → Ekip → Personel sekmesine yönlendir (yetki ver, geri dön) */}
                <View>
                  <FieldLabel>İstasyon Yetkileri</FieldLabel>
                  <Pressable
                    onPress={() => { onClose(); router.push(`/${navGroup}/ik-depo?tab=people` as any); }}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
                      backgroundColor: hovered ? P + '1E' : P + '12', borderWidth: 1, borderColor: P + '2E',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    <Check size={14} color={P} strokeWidth={2.4} />
                    <Text style={{ flex: 1, fontSize: 12, color: DS.ink[700], lineHeight: 17 }}>
                      Teknisyenin hangi istasyonlarda çalışabileceğini <Text style={{ fontWeight: '700', color: P }}>Personel</Text> sekmesinden yönet. Otomatik atama ve "Yeniden Ata" aynı kaynağı kullanır.
                    </Text>
                    <ChevronRight size={18} color={P} strokeWidth={2.2} />
                  </Pressable>
                </View>

                {/* Vaka Türleri — outlined active */}
                <View>
                  <FieldLabel>Vaka Türleri</FieldLabel>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {CASE_TYPES.map(ct => {
                      // null = "tümü" → hepsi aktif görünür
                      const has = !caseTypes ? true : caseTypes.includes(ct);
                      return (
                        <Pressable
                          key={ct}
                          onPress={() => {
                            setCaseTypes(prev => {
                              const current = prev ?? [...CASE_TYPES];
                              const next = current.includes(ct)
                                ? current.filter(c => c !== ct)
                                : [...current, ct];
                              // Hepsi seçiliyse null'a düş (tümü)
                              if (CASE_TYPES.every(t => next.includes(t))) return null;
                              return next;
                            });
                          }}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                            borderWidth: 1.5, borderColor: has ? '#0A0A0A' : 'rgba(0,0,0,0.08)',
                            backgroundColor: 'transparent',
                            cursor: 'pointer' as any,
                          }}
                        >
                          {has && <Check size={10} color="#0A0A0A" strokeWidth={2.5} />}
                          <Text style={{ fontSize: 12, fontWeight: '600', color: has ? '#0A0A0A' : DS.ink[500] }}>{ct}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

            {/* Yetkinlik için bağlı profil yok — bilgi mesajı */}
            {isTechnician && employee && !linkedProfileId && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: 'rgba(217,119,6,0.20)' }}>
                <Text style={{ fontSize: 12, color: '#92400E', flex: 1, lineHeight: 17 }}>
                  Yetkinlik (Seviye, Stage, Vaka türü) ayarlamak için bu personelın sistem hesabı (e-posta + şifre) olması gerekir.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer — Patterns §13 */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)', opacity: saving ? 0.5 : 1, cursor: 'pointer' as any }}
            >
              <X size={12} color={DS.ink[500]} strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                backgroundColor: DS.ink[900], opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: P }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>
                    {employee ? 'Güncelle' : 'Kaydet'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Salary Modal — §08
// ═════════════════════════════════════════════════════════════════════
function SalaryModal({ visible, employee, onClose, onSaved }: {
  visible: boolean; employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const P = DS.exec.primary; // panel accent — Patterns §13
  const [year,       setYear]       = useState(String(CUR_YEAR));
  const [month,      setMonth]      = useState(String(CUR_MONTH));
  const [gross,      setGross]      = useState('');
  const [deductions, setDeductions] = useState('');
  const [method,     setMethod]     = useState<SalaryPaymentMethod>('havale');
  const [payDate,    setPayDate]    = useState(new Date().toISOString().slice(0, 10));
  const [saving,     setSaving]     = useState(false);

  React.useEffect(() => {
    if (visible) {
      setYear(String(CUR_YEAR)); setMonth(String(CUR_MONTH));
      setGross(String(employee.base_salary)); setDeductions('');
      setMethod('havale'); setPayDate(new Date().toISOString().slice(0, 10));
    }
  }, [visible, employee]);

  const net = (Number(gross.replace(',', '.')) || 0) - (Number(deductions.replace(',', '.')) || 0);

  const handleSave = async () => {
    const g = Number(gross.replace(',', '.'));
    const d = Number(deductions.replace(',', '.')) || 0;
    if (!Number.isFinite(g) || g <= 0) { toast.error('Brüt maaş giriniz.'); return; }
    setSaving(true);
    const { error } = await createSalaryPayment({
      employee_id: employee.id, period_year: parseInt(year), period_month: parseInt(month),
      gross_amount: g, deductions: d, payment_method: method, payment_date: payDate,
    });
    setSaving(false);
    if (error) { toast.error((error as any)?.message ?? 'Bu dönem için zaten ödeme var.'); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 440,
          maxHeight: '90%', overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          {/* Header — Patterns §13 */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
            paddingHorizontal: 28, paddingTop: 28, paddingBottom: 18,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: DS.ink[900] }}>Maaş Ödemesi</Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>{employee.full_name}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, borderColor: P, alignItems: 'center', justifyContent: 'center', marginLeft: 12, marginTop: 2, cursor: 'pointer' as any }}
            >
              <X size={14} color={P} strokeWidth={2.2} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>Ay (1-12)</FieldLabel>
                <TextInput style={inputStyle} value={month} onChangeText={setMonth}
                  placeholder="Ay" placeholderTextColor={DS.ink[400]} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>Yıl</FieldLabel>
                <TextInput style={inputStyle} value={year} onChangeText={setYear}
                  placeholder="Yıl" placeholderTextColor={DS.ink[400]} keyboardType="number-pad" />
              </View>
            </View>
            {parseInt(month) >= 1 && parseInt(month) <= 12 && (
              <Text style={{ fontSize: 12, fontWeight: '600', color: CHIP_TONES.info.fg }}>
                {MONTH_NAMES[parseInt(month)]} {year}
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>Brüt Maaş (₺)</FieldLabel>
                <TextInput style={inputStyle} value={gross} onChangeText={setGross}
                  placeholder="0,00" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>Kesintiler (₺)</FieldLabel>
                <TextInput style={inputStyle} value={deductions} onChangeText={setDeductions}
                  placeholder="SGK, vergi…" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad" />
              </View>
            </View>

            {/* Net box */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CHIP_TONES.success.bg, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: CHIP_TONES.success.fg }}>Net Ödenecek</Text>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: CHIP_TONES.success.fg }}>{fmtMoney(net)}</Text>
            </View>

            {/* Payment method — outlined active = panel rengi */}
            <View>
              <FieldLabel>Ödeme Yöntemi</FieldLabel>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {PAY_METHODS.map(m => {
                  const active = method === m.v;
                  const MIcon = m.icon;
                  return (
                    <Pressable
                      key={m.v}
                      onPress={() => setMethod(m.v)}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 10, borderRadius: 12,
                        borderWidth: 1.5, borderColor: active ? P : 'rgba(0,0,0,0.08)',
                        backgroundColor: 'transparent',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <MIcon size={14} color={active ? P : DS.ink[400]} strokeWidth={active ? 2 : 1.6} />
                      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? P : DS.ink[500] }}>
                        {m.l}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <FieldLabel>Ödeme Tarihi</FieldLabel>
              <TextInput style={inputStyle} value={payDate} onChangeText={setPayDate}
                placeholder="YYYY-AA-GG" placeholderTextColor={DS.ink[400]} />
            </View>
          </ScrollView>

          {/* Footer — Patterns §13 */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)', opacity: saving ? 0.5 : 1, cursor: 'pointer' as any }}
            >
              <X size={12} color={DS.ink[500]} strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                backgroundColor: DS.ink[900], opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                <>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: P }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Ödemeyi Kaydet</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Advance Modal — §08
// ═════════════════════════════════════════════════════════════════════
function AdvanceModal({ visible, employee, onClose, onSaved }: {
  visible: boolean; employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const P = DS.exec.primary; // panel accent — Patterns §13
  const [amount, setAmount] = useState('');
  const [date,   setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [desc,   setDesc]   = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) { setAmount(''); setDate(new Date().toISOString().slice(0, 10)); setDesc(''); }
  }, [visible]);

  const handleSave = async () => {
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Geçerli tutar girin.'); return; }
    setSaving(true);
    const { error } = await createAdvance({
      employee_id: employee.id, amount: amt, advance_date: date,
      description: desc.trim() || undefined,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 400,
          maxHeight: '90%', overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          {/* Header — Patterns §13 */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
            paddingHorizontal: 28, paddingTop: 28, paddingBottom: 18,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: DS.ink[900] }}>Avans Ver</Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>{employee.full_name}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, borderColor: P, alignItems: 'center', justifyContent: 'center', marginLeft: 12, marginTop: 2, cursor: 'pointer' as any }}
            >
              <X size={14} color={P} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 28, paddingVertical: 20, gap: 14 }}>
            <View>
              <FieldLabel>Tutar (₺)</FieldLabel>
              <TextInput style={inputStyle} value={amount} onChangeText={setAmount}
                placeholder="0,00" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad" />
            </View>
            <View>
              <FieldLabel>Tarih</FieldLabel>
              <TextInput style={inputStyle} value={date} onChangeText={setDate}
                placeholder="YYYY-AA-GG" placeholderTextColor={DS.ink[400]} />
            </View>
            <View>
              <FieldLabel>Açıklama (opsiyonel)</FieldLabel>
              <TextInput style={inputStyle} value={desc} onChangeText={setDesc}
                placeholder="Kısa not…" placeholderTextColor={DS.ink[400]} />
            </View>
          </View>

          {/* Footer — Patterns §13 */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)', opacity: saving ? 0.5 : 1, cursor: 'pointer' as any }}
            >
              <X size={12} color={DS.ink[500]} strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                backgroundColor: DS.ink[900], opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                <>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: P }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Avansı Kaydet</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
