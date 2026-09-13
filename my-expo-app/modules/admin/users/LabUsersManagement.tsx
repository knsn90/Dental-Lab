import React, { useEffect, useState, useMemo } from 'react';
import { isRTL, fmtDayMonthYear } from '../../../core/i18n';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import {
  Search,
  SlidersHorizontal,
  UserPlus,
  X,
  XCircle,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Save,
  UserX,
  UserCircle,
  Wrench,
  FlaskConical,
  TrendingUp,
  AlertTriangle,
  Clock,
  Stethoscope,
  Building2,
  Phone,
  ShieldCheck,
  Receipt,
  Truck,
  Sparkles,
  Headphones,
  GraduationCap,
  UserCog,
  Info,
} from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { Profile } from '../../../lib/types';
import { STAGE_LABEL, STAGE_COLOR, type Stage } from '../../orders/stages';
import { useAuthStore } from '../../../core/store/authStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { useAccentTones } from '../../../core/ui/HeroGlow';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { toast } from '../../../core/ui/Toast';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';

// ── Design tokens ───────────────────────────────────────────────────────────
const ERR = '#FF3B30';

const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' },
  default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
}) as any;

const THUMB_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
  default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
}) as any;

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ── Constants ───────────────────────────────────────────────────────────────
const SKILL_STAGES: Stage[] = ['TRIAGE', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC'];

type SkillLevel = 'junior' | 'mid' | 'senior';
const SKILL_LEVEL_OPTIONS: { key: SkillLevel; label: string; color: string }[] = [
  { key: 'junior', label: 'Junior', color: '#94A3B8' },
  { key: 'mid',    label: 'Mid',    color: '#2563EB' },
  { key: 'senior', label: 'Senior', color: '#059669' },
];
const CASE_TYPE_OPTIONS = ['zirconia', 'emax', 'pmma', 'metal', 'pfm'];

type LabRole = 'manager' | 'technician' | 'accounting' | 'courier' | 'service' | 'receptionist' | 'intern';
type FilterType = 'all' | LabRole | 'doctor' | 'clinic_admin';
type StatusFilter = 'all' | 'active' | 'inactive';
type NewUserRole = 'admin' | LabRole | 'doctor' | 'clinic_admin';

// Lab-içi pozisyon etiketleri
const LAB_ROLE_LABELS: Record<LabRole, string> = {
  manager:      'Mesul Müdür',
  technician:   'Teknisyen',
  accounting:   'Muhasebe',
  courier:      'Kurye',
  service:      'Hizmet',
  receptionist: 'Resepsiyon',
  intern:       'Stajyer',
};

const ROLE_OPTIONS: { key: NewUserRole; label: string; sub: string; icon: string }[] = [
  { key: 'admin',        label: 'Admin',        sub: 'Tam yönetim yetkisi',           icon: 'shield-outline' },
  { key: 'manager',      label: 'Mesul Müdür',  sub: 'Lab yöneticisi',                icon: 'account-circle-outline' },
  { key: 'technician',   label: 'Teknisyen',    sub: 'Üretim personeli',              icon: 'wrench-outline' },
  { key: 'accounting',   label: 'Muhasebe',     sub: 'Finans ve kayıt işlemleri',     icon: 'calculator' },
  { key: 'courier',      label: 'Kurye',        sub: 'Teslimat ve dağıtım',           icon: 'truck' },
  { key: 'service',      label: 'Hizmet',       sub: 'Temizlik ve destek personeli',  icon: 'broom' },
  { key: 'receptionist', label: 'Resepsiyon',   sub: 'Karşılama ve sekreterlik',      icon: 'user-circle' },
  { key: 'intern',       label: 'Stajyer',      sub: 'Staj personeli',                icon: 'graduation-cap' },
  { key: 'doctor',       label: 'Muayenehane',  sub: 'Tek hekim, kendi kliniği',      icon: 'stethoscope' },
  { key: 'clinic_admin', label: 'Klinik',       sub: 'Çok hekimli kurum',             icon: 'building' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function fmtDate(dateStr?: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  return fmtDayMonthYear(d);
}

interface UserStats {
  total: number;
  active: number;
  overdue: number;
  activeOrders: { id: string; order_number: string; item: string; overdue: boolean }[];
}

// ── PatternsToggle ──────────────────────────────────────────────────────────
// 44×24 → 36×20: kart minimal ama toggle en dikkat çeken öğeydi.
// Renk geçişi 140ms — açma/kapama anında sertçe zıplamasın.
// NOT: stil OBJE olmalı — fonksiyon-stilli Pressable native'de stili düşürüyor,
// iOS'ta ray hiç çizilmiyor, yalnız beyaz başparmak kalıyordu. Basılı hal state ile.
function PatternsToggle({ on, onPress, accentColor }: { on: boolean; onPress: () => void; accentColor: string }) {
  const U = useInkUI();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={{
        width: 36, height: 20, borderRadius: 999,
        backgroundColor: on ? accentColor : (U.isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.14)'),
        padding: 2, justifyContent: 'center',
        transform: [{ scale: pressed ? 0.94 : 1 }],
        ...(Platform.OS === 'web'
          ? { cursor: 'pointer', transitionProperty: 'background-color, transform', transitionDuration: '140ms' } as any
          : {}),
      }}
    >
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFF', alignSelf: on ? 'flex-end' : 'flex-start', ...THUMB_SHADOW }} />
    </Pressable>
  );
}

/**
 * Filtre açılır menüsü — rol sayısından bağımsız sabit genişlik.
 * Seçili değer düğmenin üstünde yazar; menüyü açmadan neyin süzüldüğü okunur.
 */
function FilterDropdown({ label, value, options, selectedKey, onSelect, accentColor }: {
  label: string;
  value: string | null;
  options: { key: string; label: string; count: number }[];
  selectedKey: string;
  onSelect: (k: string) => void;
  accentColor: string;
}) {
  const U = useInkUI();
  const { ink: aInk } = useAccentTones(accentColor);
  const [open, setOpen] = useState(false);
  const on = value != null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={Platform.OS === 'web'
          ? ((({ pressed, hovered }: any) => ({
              flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
              height: 36, paddingHorizontal: 12, borderRadius: 10,
              backgroundColor: on ? `${accentColor}${U.isDark ? '2E' : '14'}` : hovered ? U.chipNeutral : 'transparent',
              borderWidth: 1, borderColor: on ? `${accentColor}55` : U.fieldBorder,
              opacity: pressed ? 0.75 : 1,
              cursor: 'pointer', transitionProperty: 'background-color, border-color', transitionDuration: '130ms',
            })) as any)
          : {
              flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
              height: 40, paddingHorizontal: 12, borderRadius: 10,
              backgroundColor: on ? `${accentColor}${U.isDark ? '2E' : '14'}` : 'transparent',
              borderWidth: 1, borderColor: on ? `${accentColor}55` : U.fieldBorder,
            }}
      >
        <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', color: on ? aInk : U.plainBtn.fgMuted }}>
          {value ?? label}
        </Text>
        <ChevronDown size={13} color={on ? aInk : U.ink[500]} strokeWidth={2} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: U.scrim, alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <Pressable onPress={() => {}} style={{
            width: '100%', maxWidth: 320, maxHeight: '70%', backgroundColor: U.surface, borderRadius: 18, paddingVertical: 8,
            ...(U.isDark ? { borderWidth: 1, borderColor: U.hairline } : {}),
            ...(Platform.OS === 'web' ? { boxShadow: U.isDark ? '0 20px 48px rgba(0,0,0,0.6)' : '0 20px 48px rgba(15,23,42,0.22)' } as any : {}),
          }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: U.ink[500], paddingHorizontal: 16, paddingVertical: 8 }}>
              {label}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {options.map(opt => {
                const sel = selectedKey === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { onSelect(opt.key); setOpen(false); }}
                    style={Platform.OS === 'web'
                      ? ((({ pressed, hovered }: any) => ({
                          flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
                          paddingHorizontal: 16, paddingVertical: 10,
                          backgroundColor: sel ? `${accentColor}10` : hovered ? U.rowHover : 'transparent',
                          opacity: pressed ? 0.7 : 1, cursor: 'pointer',
                        })) as any)
                      : {
                          flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
                          paddingHorizontal: 16, paddingVertical: 12,
                          backgroundColor: sel ? `${accentColor}10` : 'transparent',
                        }}
                  >
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: sel ? '700' : '500', color: sel ? aInk : U.ink[900] }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: 12, color: U.ink[500] }}>{opt.count}</Text>
                    {sel && <Check size={14} color={aInk} strokeWidth={2.4} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Lucide icon helper for MetricCell ───────────────────────────────────────
function MetricIcon({ name, size, color, style }: { name: string; size: number; color: string; style?: any }) {
  const props = { size, color, strokeWidth: 1.6, style };
  switch (name) {
    case 'flask-outline':  return <FlaskConical {...props} />;
    case 'chart-line':     return <TrendingUp {...props} />;
    case 'alert-outline':  return <AlertTriangle {...props} />;
    case 'progress-clock': return <Clock {...props} />;
    default:               return <FlaskConical {...props} />;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// LabUsersManagement
// ═════════════════════════════════════════════════════════════════════════════

export function LabUsersManagement({ accentColor = '#2563EB', labOnly = false }: { accentColor?: string; labOnly?: boolean }) {
  const U = useInkUI();
  const P = accentColor;
  // Koyu temada accent'in dolgu/metin karşılıkları (mavi → lacivert #004B87 / #5AA9E6).
  const { fill: PFill, ink: PInk } = useAccentTones(P);
  const { width } = useWindowDimensions();
  const isWide = width >= 1100;
  const { profile } = useAuthStore();

  const [profiles,       setProfiles]       = useState<Profile[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [confirm,        setConfirm]        = useState<ConfirmState | null>(null);
  const [typeFilter,     setTypeFilter]     = useState<FilterType>('all');
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all');
  const [draftStatus,    setDraftStatus]    = useState<StatusFilter>('all');
  const [showFilter,     setShowFilter]     = useState(false);
  const [search,         setSearch]         = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchFocused,  setSearchFocused]  = useState(false);
  const [updatingId,     setUpdatingId]     = useState<string | null>(null);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [stats,          setStats]          = useState<UserStats | null>(null);
  const [statsLoading,   setStatsLoading]   = useState(false);
  const [skillsMap, setSkillsMap]   = useState<Map<string, Set<Stage>>>(new Map());
  const [skillBusy, setSkillBusy]   = useState<Set<string>>(new Set());
  const [rateEditId, setRateEditId] = useState<string | null>(null);
  const [rateInput, setRateInput]   = useState<string>('');

  useEffect(() => { loadProfiles(); }, []);

  // Lab user'larının skill'lerini yükle (profiles geldikten sonra)
  useEffect(() => {
    const labUsers = profiles.filter(p => p.user_type === 'lab').map(p => p.id);
    if (labUsers.length === 0) { setSkillsMap(new Map()); return; }
    supabase
      .from('user_stage_skills')
      .select('user_id, stage')
      .in('user_id', labUsers)
      .then(({ data }) => {
        const m = new Map<string, Set<Stage>>();
        for (const r of (data ?? []) as any[]) {
          if (!m.has(r.user_id)) m.set(r.user_id, new Set());
          m.get(r.user_id)!.add(r.stage as Stage);
        }
        setSkillsMap(m);
      });
  }, [profiles]);

  // ── Skill level / trust / allowed_types updaters (Migration 047) ──────
  async function setSalary(userId: string, rate: number) {
    setProfiles(prev => prev.map(p => p.id === userId ? ({ ...p, monthly_salary: rate } as any) : p));
    const { error } = await supabase.from('profiles').update({ monthly_salary: rate }).eq('id', userId);
    if (error) console.warn('monthly_salary update', error.message);
  }

  async function setSkillLevel(userId: string, level: SkillLevel) {
    setProfiles(prev => prev.map(p => p.id === userId ? ({ ...p, skill_level: level } as any) : p));
    const { error } = await supabase.from('profiles').update({ skill_level: level }).eq('id', userId);
    if (error) console.warn('skill_level update', error.message);
  }

  async function toggleAllowedType(userId: string, type: string) {
    const current = (profiles.find(p => p.id === userId) as any)?.allowed_types as string[] | null;
    let next: string[] | null;
    if (!current) {
      next = CASE_TYPE_OPTIONS.filter(t => t !== type);
    } else if (current.includes(type)) {
      next = current.filter(t => t !== type);
      if (next.length === 0) next = [];
    } else {
      next = [...current, type];
      if (CASE_TYPE_OPTIONS.every(t => next!.includes(t))) next = null;
    }
    setProfiles(prev => prev.map(p => p.id === userId ? ({ ...p, allowed_types: next } as any) : p));
    const { error } = await supabase.from('profiles').update({ allowed_types: next }).eq('id', userId);
    if (error) console.warn('allowed_types update', error.message);
  }

  async function toggleSkill(userId: string, stage: Stage) {
    const labId = (profile as any)?.lab_id ?? profile?.id;
    if (!labId) return;
    const currentSet = skillsMap.get(userId) ?? new Set();
    const has = currentSet.has(stage);
    const key = `${userId}:${stage}`;
    setSkillBusy(p => new Set(p).add(key));

    if (has) {
      const { error } = await supabase
        .from('user_stage_skills')
        .delete()
        .eq('user_id', userId)
        .eq('stage', stage);
      if (error) console.warn('skill delete', error.message);
    } else {
      const { error } = await supabase
        .from('user_stage_skills')
        .insert({ user_id: userId, stage, lab_id: labId });
      if (error) console.warn('skill insert', error.message);
    }

    setSkillsMap(prev => {
      const nx = new Map(prev);
      const set = new Set(nx.get(userId) ?? []);
      if (has) set.delete(stage); else set.add(stage);
      nx.set(userId, set);
      return nx;
    });
    setSkillBusy(p => {
      const nx = new Set(p);
      nx.delete(key);
      return nx;
    });
  }

  const loadProfiles = async () => {
    setLoading(true);
    try {
      // ── 1. Auth kullanıcıları (profiles tablosu) ──────────────────
      const { data, error } = await supabase.functions.invoke('admin-list-users');
      const authUsers: Profile[] = (!error && data?.users)
        ? (data.users as Profile[]).filter(p => !labOnly || p.user_type === 'lab')
        : [];

      // ── 2. employees tablosundan auth hesabı olmayanlar ──────────
      // employees → profiles eşleştirmesi: email veya full_name üzerinden
      const { data: empRows } = await supabase
        .from('employees')
        .select('id, full_name, role, phone, email, is_active, lab_id')
        .order('full_name');

      const authEmails  = new Set(authUsers.map(u => u.email?.toLowerCase()).filter(Boolean));
      const authNames   = new Set(authUsers.map(u => u.full_name?.toLowerCase()).filter(Boolean));

      // employees rolünü profiles.role formatına çevir
      const empRoleMap: Record<string, string> = {
        teknisyen:    'technician',
        sef_teknisyen:'technician',
        yonetici:     'manager',
        muhasebe:     'accounting',
        sekreter:     'receptionist',
        diger:        'service',
      };

      const syntheticProfiles: Profile[] = (empRows ?? [])
        .filter(e => {
          // Auth hesabı zaten varsa tekrar gösterme
          if (e.email && authEmails.has(e.email.toLowerCase())) return false;
          if (authNames.has(e.full_name?.toLowerCase())) return false;
          return true;
        })
        .map(e => ({
          id:              `emp-${e.id}`,
          full_name:       e.full_name,
          email:           e.email ?? null,
          phone:           e.phone ?? null,
          user_type:       'lab' as const,
          role:            empRoleMap[e.role] ?? 'technician',
          is_active:       e.is_active ?? true,
          approval_status: 'approved' as const,
          lab_id:          e.lab_id ?? null,
          // Sentetik satır işaretçisi — auth hesabı yok
          is_unregistered: true,
          avatar_url:      null,
          created_at:      null,
        } as any));

      setProfiles([...authUsers, ...syntheticProfiles]);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async (userId: string) => {
    setStatsLoading(true);
    try {
      const { data: orders } = await supabase
        .from('work_orders')
        .select('id, order_number, status, delivery_date, order_items(item_name)')
        .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
        .order('created_at', { ascending: false });

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const all = orders ?? [];
      const active = all.filter((o: any) => o.status !== 'teslim_edildi');
      const overdue = active.filter((o: any) => {
        if (!o.delivery_date) return false;
        return new Date(o.delivery_date) < today;
      });

      setStats({
        total: all.length,
        active: active.length,
        overdue: overdue.length,
        activeOrders: active.slice(0, 4).map((o: any) => ({
          id: o.id,
          order_number: o.order_number ?? '—',
          item: o.order_items?.[0]?.item_name ?? 'İş Emri',
          overdue: o.delivery_date ? new Date(o.delivery_date) < today : false,
        })),
      });
    } catch {
      setStats({ total: 0, active: 0, overdue: 0, activeOrders: [] });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleToggleActive = async (profile: Profile) => {
    const newVal = !profile.is_active;
    setUpdatingId(profile.id);
    try {
      const { error } = await supabase.from('profiles').update({ is_active: newVal }).eq('id', profile.id);
      if (!error) setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, is_active: newVal } : p));
    } finally { setUpdatingId(null); }
  };

  const handleDeleteUser = (profile: Profile) => {
    setConfirm({
      title: 'Kullanıcıyı sil',
      highlight: profile.full_name,
      message: 'adlı kullanıcı kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      label: 'Evet, sil',
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        setUpdatingId(profile.id);
        try {
          const { data, error: fnError } = await supabase.functions.invoke('admin-delete-user', { body: { userId: profile.id } });
          // Alert.alert web'de (RNW) çoğunlukla görünmez → toast ile göster (sessiz hata bug'ı).
          if (fnError || data?.error) toast.error(data?.error ?? fnError?.message ?? 'Silme işlemi başarısız');
          else {
            setProfiles(prev => prev.filter(p => p.id !== profile.id));
            if (selectedId === profile.id) { setSelectedId(null); setStats(null); }
            toast.success('Kullanıcı silindi.');
          }
        } catch (e: any) {
          toast.error(e.message ?? 'Bir hata oluştu');
        } finally { setUpdatingId(null); }
      },
    });
  };

  const q = search.trim().toLowerCase();
  const LAB_ROLES: FilterType[] = ['manager', 'technician', 'accounting', 'courier', 'service', 'receptionist', 'intern'];

  // Klinik tab'ı: yönetici + sekreter + hekim (hepsi clinic_id'li kullanıcılar)
  const CLINIC_USER_TYPES = ['clinic_admin', 'clinic_secretary', 'doctor'];

  const filtered = profiles.filter(p => {
    if (typeFilter === 'doctor'       && p.user_type !== 'doctor') return false;
    if (typeFilter === 'clinic_admin' && !CLINIC_USER_TYPES.includes(p.user_type ?? '')) return false;
    // Lab pozisyonları — typeFilter bir lab rolüyse user_type=lab && role eşleşmeli
    if (LAB_ROLES.includes(typeFilter) && !(p.user_type === 'lab' && p.role === typeFilter)) return false;
    if (statusFilter === 'active'   && !p.is_active) return false;
    if (statusFilter === 'inactive' &&  p.is_active) return false;
    if (!q) return true;
    return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
  });

  // Liste satırı render helper'ı — flat ve gruplu liste paylaşır
  const renderUserRow = (prof: Profile) => {
    const badge = typeBadge(prof);
    const selected = selectedId === prof.id;
    const isLabUser = prof.user_type === 'lab';
    const isSynthetic = !!(prof as any).is_unregistered;
    // Telefon: aksiyon grubu genişliği yiyordu, bilgi satırı flexWrap ile 4 satıra
    // kırılıp kartı ~120pt'ye çıkarıyordu. Dar ekranda 3 sabit satır + etiketsiz toggle.
    const compact = width < 720;
    const clinicName = !!(prof as any).clinic_name && ['clinic_admin', 'clinic_secretary', 'doctor'].includes(prof.user_type ?? '')
      ? String((prof as any).clinic_name) : null;
    return (
      <Pressable
        key={prof.id}
        onPress={() => handleSelect(prof)}
        style={{
          backgroundColor: U.surface,
          borderRadius: 16,
          // 14 → 10: kart ~90px'ten ~74px'e indi, aynı ekrana %20 daha çok kişi.
          padding: 10,
          paddingStart: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          overflow: 'hidden',
          opacity: prof.is_active ? 1 : 0.55,
          ...(selected ? {
            borderWidth: 1,
            borderColor: `${P}30`,
          } : {
            borderWidth: 1,
            borderColor: U.hairlineSoft,
          }),
          // @ts-ignore web
          cursor: 'pointer',
        } as any}
      >
        {/* Avatar */}
        {/* Avatar rengi ROLDEN gelir: 20 kayıtta hepsi aynı tondayken liste tek
            bir gri-mavi şeride dönüşüyordu; renk rolü bir bakışta ayırır. */}
        <View style={{ position: 'relative', flexShrink: 0 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: badge.avatarBg }}>
            {(prof as any).avatar_url
              ? <Image source={{ uri: (prof as any).avatar_url }} style={{ width: 38, height: 38, borderRadius: 12 }} />
              : <Text style={{ fontSize: 13.5, fontWeight: '700', color: badge.avatarText }}>{initials(prof.full_name)}</Text>}
          </View>
          {/* Durum noktası. NOT: bu "çevrim içi" DEĞİL — canlılık verisi (son
              görülme) henüz tutulmuyor. Gösterdiği şey hesabın aktif/pasif
              olması; davet bekleyen (hesabı olmayan) kayıtta amber. */}
          <View
            style={{
              position: 'absolute', end: -2, bottom: -2,
              width: 11, height: 11, borderRadius: 6,
              borderWidth: 2, borderColor: U.surface,
              backgroundColor: isSynthetic ? '#E89B2A' : (prof.is_active ?? true) ? '#2D9A6B' : U.ink[300],
            }}
          />
        </View>
        {/* Info */}
        <View className="flex-1" style={{ minWidth: 0, gap: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900], letterSpacing: -0.2 }} numberOfLines={1}>{prof.full_name}</Text>
          {/* Okuma sırası: KİM → NE → NEREDE → NASIL ULAŞILIR.
              Eskiden rol rozeti, klinik rozeti ve e-posta tek satırda ve neredeyse
              aynı ağırlıktaydı; 20 kayıtta hepsi tek bir gri şeride dönüşüyordu.
              Rol tek başına kalır (birincil sınıflandırma), klinik ve e-posta
              rozetsiz ve daha soluk bir alt satıra iner. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: compact ? 'nowrap' : 'wrap' }}>
            <View style={{ borderRadius: 100, paddingHorizontal: compact ? 8 : 9, paddingVertical: compact ? 2 : 3, backgroundColor: badge.bg }}>
              <Text style={{ fontSize: compact ? 10 : 10.5, fontWeight: '700', letterSpacing: 0.3, color: badge.text }}>{badge.label}</Text>
            </View>
            {compact && isLabUser && (() => {
              const lvlOpt = SKILL_LEVEL_OPTIONS.find(o => o.key === (((prof as any).skill_level ?? 'mid') as SkillLevel));
              return (
                <View style={{ borderRadius: 100, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${lvlOpt?.color ?? '#94A3B8'}${U.isDark ? '33' : '18'}` }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: lvlOpt?.color ?? U.ink[400] }}>{lvlOpt?.label}</Text>
                </View>
              );
            })()}
            {!!(prof as any).is_unregistered && (
              <View style={{ borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: U.isDark ? 'rgba(245,158,11,0.26)' : 'rgba(245,158,11,0.12)' }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: U.isDark ? '#F0C078' : '#92400E' }}>Hesap yok</Text>
              </View>
            )}
          </View>

          {compact ? (
            <Text style={{ fontSize: 12, color: U.ink[400] }} numberOfLines={1}>
              {clinicName ? <Text style={{ color: U.plainBtn.fgMuted }}>{clinicName}{'  ·  '}</Text> : null}
              {prof.email ?? '—'}
            </Text>
          ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {clinicName && (
              <>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#6BA888' }} />
                <Text style={{ fontSize: 12, color: U.plainBtn.fgMuted, flexShrink: 1, maxWidth: 320 }} numberOfLines={1}>
                  {(prof as any).clinic_name}
                </Text>
                <Text style={{ fontSize: 12, color: U.ink[300] }}>·</Text>
              </>
            )}
            <Text style={{ fontSize: 12, color: U.ink[400], flexShrink: 1 }} numberOfLines={1}>{prof.email ?? '—'}</Text>
          </View>
          )}
          {isLabUser && !compact && (() => {
            const lvl = ((prof as any).skill_level ?? 'mid') as SkillLevel;
            const lvlOpt = SKILL_LEVEL_OPTIONS.find(o => o.key === lvl);
            const stageCount = (skillsMap.get(prof.id) ?? new Set()).size;
            return (
              <View className="flex-row items-center gap-1.5 mt-0.5">
                <View style={{ borderRadius: 100, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${lvlOpt?.color ?? '#94A3B8'}${U.isDark ? '33' : '18'}` }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: lvlOpt?.color ?? U.ink[400] }}>{lvlOpt?.label}</Text>
                </View>
                {stageCount > 0 && (
                  <Text style={{ fontSize: 11, color: U.ink[500] }}>{stageCount} stage</Text>
                )}
              </View>
            );
          })()}
        </View>
        {/* Aksiyon grubu: durum | düzenle · sil.
            Eskiden üç kontrol serbest duruyordu ve toggle'ın neyi açıp
            kapattığı yazmıyordu. Etiket + ayraç ile gruplandı. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isSynthetic ? (
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: U.chipNeutral }}>
              <Text style={{ fontSize: 10, color: U.ink[500] }}>Ekip'ten yönet</Text>
            </View>
          ) : (
            <>
              {updatingId === prof.id ? (
                <ActivityIndicator size="small" color={P} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  {!compact && <Text style={{
                    fontSize: 11, fontWeight: '600', minWidth: 34, textAlign: 'end' as any,
                    color: (prof.is_active ?? true) ? '#2D9A6B' : U.ink[500],
                  }}>
                    {(prof.is_active ?? true) ? 'Aktif' : 'Pasif'}
                  </Text>}
                  <PatternsToggle
                    on={prof.is_active ?? true}
                    onPress={() => handleToggleActive(prof)}
                    accentColor={P}
                  />
                </View>
              )}
              {!compact && <View style={{ width: 1, height: 18, backgroundColor: U.fieldBorder, marginHorizontal: 4 }} />}
              {/* ✎ ve 🗑 tek kapta: iki ayrı yüzen düğme kopuk duruyordu. */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                borderRadius: 9, overflow: 'hidden',
                backgroundColor: U.chipNeutral,
              }}>
                <Pressable
                  onPress={() => setEditingProfile(prof)}
                  accessibilityLabel="Düzenle"
                  // Fonksiyon-stilli Pressable native'de stili düşürüyor → düğme
                  // ölçüsüz kalıp ✎ ile 🗑 üst üste biniyordu. Native'de object stil.
                  style={Platform.OS === 'web'
                    ? ((({ pressed, hovered }: any) => ({
                        width: 28, height: 28, alignItems: 'center' as const, justifyContent: 'center' as const,
                        backgroundColor: hovered ? U.plainBtn.hoverBg : 'transparent',
                        opacity: pressed ? 0.6 : 1,
                        cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '120ms',
                      })) as any)
                    : { width: 32, height: 32, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'transparent' }}
                >
                  <Pencil size={13} color={U.plainBtn.fgMuted} strokeWidth={1.7} />
                </Pressable>
                <View style={{ width: 1, height: 16, backgroundColor: U.hairline }} />
                <Pressable
                  onPress={() => handleDeleteUser(prof)}
                  accessibilityLabel="Sil"
                  style={Platform.OS === 'web'
                    ? ((({ pressed, hovered }: any) => ({
                        width: 28, height: 28, alignItems: 'center' as const, justifyContent: 'center' as const,
                        backgroundColor: hovered ? 'rgba(220,38,38,0.10)' : 'transparent',
                        opacity: pressed ? 0.6 : 1,
                        cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '120ms',
                      })) as any)
                    : { width: 32, height: 32, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'transparent' }}
                >
                  <Trash2 size={13} color="#DC2626" strokeWidth={1.7} />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Pressable>
    );
  };

  // Klinik tab'ı aktifken klinik adına göre grupla
  const isClinicView = typeFilter === 'clinic_admin';
  const groupedByClinic = (() => {
    if (!isClinicView) return [] as { clinicId: string; clinicName: string; members: Profile[] }[];
    const map = new Map<string, { clinicId: string; clinicName: string; members: Profile[] }>();
    filtered.forEach(p => {
      const key = (p as any).clinic_id ?? '__none__';
      const name = (p as any).clinic_name ?? 'Klinik (atanmamış)';
      if (!map.has(key)) map.set(key, { clinicId: key, clinicName: name, members: [] });
      map.get(key)!.members.push(p);
    });
    // Her grup içinde sıralama: yönetici → sekreter → hekim → diğer
    const roleOrder: Record<string, number> = { clinic_admin: 0, clinic_secretary: 1, doctor: 2 };
    return Array.from(map.values())
      .map(g => ({ ...g, members: g.members.sort((a, b) => (roleOrder[a.user_type ?? ''] ?? 9) - (roleOrder[b.user_type ?? ''] ?? 9)) }))
      .sort((a, b) => (a.clinicName ?? '').localeCompare(b.clinicName ?? '', 'tr'));
  })();

  const activeFilterCount = statusFilter !== 'all' ? 1 : 0;

  const labRoleCount = (role: LabRole) => profiles.filter(p => p.user_type === 'lab' && p.role === role).length;

  const ALL_TYPE_TABS: { key: FilterType; label: string; count: number }[] = [
    { key: 'all' as FilterType,          label: 'Tümü',        count: profiles.length },
    { key: 'manager' as FilterType,      label: 'Müdür',       count: labRoleCount('manager') },
    { key: 'technician' as FilterType,   label: 'Teknisyen',   count: labRoleCount('technician') },
    { key: 'accounting' as FilterType,   label: 'Muhasebe',    count: labRoleCount('accounting') },
    { key: 'courier' as FilterType,      label: 'Kurye',       count: labRoleCount('courier') },
    { key: 'service' as FilterType,      label: 'Hizmet',      count: labRoleCount('service') },
    { key: 'receptionist' as FilterType, label: 'Resepsiyon',  count: labRoleCount('receptionist') },
    { key: 'intern' as FilterType,       label: 'Stajyer',     count: labRoleCount('intern') },
    ...(!labOnly ? [{ key: 'doctor' as FilterType,       label: 'Hekim',  count: profiles.filter(p => p.user_type === 'doctor').length }] : []),
    // Klinik tab'ı artık yönetici + sekreter + hekim'i birlikte sayar
    ...(!labOnly ? [{
      key: 'clinic_admin' as FilterType,
      label: 'Klinik',
      count: profiles.filter(p => ['clinic_admin', 'clinic_secretary'].includes(p.user_type ?? '')).length,
    }] : []),
  ];
  // Boş sekmeler gizlenir; aktif filtre her zaman görünür
  const TYPE_TABS = ALL_TYPE_TABS.filter(t => t.key === 'all' || t.count > 0 || typeFilter === t.key);
  // ^ Boş sekmeler gizlenir (0 kişi olan pozisyonlar), aktif filtre her zaman görünür

  // Pozisyon renk/etiket haritası — lab rollerine göre.
  // AVATAR & ROZET KURALI: pastel zemin + koyu metin koyu ekranda beyaz leke gibi
  // patlar. Koyuda yarı saydam accent zemin (alfa .22-.30) + AÇIK accent metin.
  const LAB_ROLE_BADGE: Record<LabRole, { bg: string; text: string }> = U.isDark ? {
    manager:      { bg: `${PFill}3D`,            text: PInk },
    technician:   { bg: 'rgba(59,130,246,0.26)',  text: '#93C5FD' },
    accounting:   { bg: 'rgba(5,150,105,0.28)',   text: '#6EE7B7' },
    courier:      { bg: 'rgba(234,122,76,0.28)',  text: '#F5B78E' },
    service:      { bg: 'rgba(139,92,246,0.26)',  text: '#C9A9E8' },
    receptionist: { bg: 'rgba(14,165,233,0.26)',  text: '#7DD3FC' },
    intern:       { bg: 'rgba(245,158,11,0.26)',  text: '#F0C078' },
  } : {
    manager:      { bg: `${P}18`,               text: P },
    technician:   { bg: 'rgba(59,130,246,0.12)', text: '#1E4FA3' },
    accounting:   { bg: 'rgba(5,150,105,0.12)',  text: '#065F46' },
    courier:      { bg: 'rgba(234,122,76,0.12)', text: '#7A3A1F' },
    service:      { bg: 'rgba(139,92,246,0.12)', text: '#5B21B6' },
    receptionist: { bg: 'rgba(14,165,233,0.12)', text: '#0369A1' },
    intern:       { bg: 'rgba(245,158,11,0.12)', text: '#92400E' },
  };

  const typeBadge = (profile: Profile) => {
    const D = U.isDark;
    if (profile.user_type === 'admin')
      return { bg: D ? 'rgba(255,255,255,0.12)' : '#0F172A22', text: U.ink[900], label: 'Admin',
               avatarBg: D ? 'rgba(255,255,255,0.12)' : '#0F172A18', avatarText: U.ink[900], roleLabel: 'Admin' };
    if (profile.user_type === 'doctor') {
      const bg = D ? 'rgba(5,150,105,0.28)' : '#D1FAE5', tx = D ? '#6EE7B7' : '#065F46';
      return { bg, text: tx, label: 'Hekim', avatarBg: bg, avatarText: tx, roleLabel: 'Hekim' };
    }
    if (profile.user_type === 'clinic_admin') {
      const bg = D ? 'rgba(107,168,136,0.30)' : 'rgba(107,168,136,0.18)', tx = D ? '#9FD9BB' : '#3F7458';
      return { bg, text: tx, label: 'Yönetici', avatarBg: bg, avatarText: tx, roleLabel: 'Klinik Yöneticisi' };
    }
    if ((profile.user_type as string) === 'clinic_secretary') {
      const bg = D ? 'rgba(124,58,237,0.28)' : 'rgba(124,58,237,0.16)', tx = D ? '#C9A9E8' : '#5B21B6';
      return { bg, text: tx, label: 'Sekreter', avatarBg: bg, avatarText: tx, roleLabel: 'Klinik Sekreteri' };
    }
    if (profile.user_type === 'lab' && profile.role) {
      const r = profile.role as LabRole;
      const colors = LAB_ROLE_BADGE[r] ?? { bg: U.chipTones.neutral.bg, text: U.chipTones.neutral.fg };
      const label  = LAB_ROLE_LABELS[r] ?? r;
      return { ...colors, label, avatarBg: colors.bg, avatarText: colors.text, roleLabel: label };
    }
    const ubg = D ? 'rgba(245,158,11,0.26)' : '#FEF3C7', utx = D ? '#F0C078' : '#92400E';
    return { bg: ubg, text: utx, label: 'Bilinmiyor', avatarBg: D ? `${PFill}3D` : `${P}14`, avatarText: D ? PInk : P, roleLabel: 'Bilinmeyen' };
  };

  const selectedProfile = useMemo(
    () => profiles.find(p => p.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const handleSelect = (profile: Profile) => {
    if (selectedId === profile.id) return;
    setSelectedId(profile.id);
    setStats(null);
    loadStats(profile.id);
  };

  // Dar ekranda (telefon) üst kontrol satırı taşıyordu: iki açılır menü +
  // 230px sabit arama + "Yeni Kullanıcı" düğmesi ~375px'e sığmıyor, düğme
  // kesiliyordu. Arama dar ekranda alt satıra tam-genişlik iner. Geniş ekranda
  // (tablet/masaüstü) satır içinde 230px kalır — davranış değişmez.
  const narrowControls = width < 720;
  const renderSearchBox = (fullWidth: boolean) => (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 12, height: 36, borderRadius: 10,
        ...(fullWidth ? { alignSelf: 'stretch' } : { width: 230 }),
        backgroundColor: U.surface,
        borderWidth: 1, borderColor: searchFocused ? PInk : U.fieldBorder,
        ...(Platform.OS === 'web'
          ? { boxShadow: searchFocused ? `0 0 0 3px ${P}22` : 'none', transitionProperty: 'border-color, box-shadow', transitionDuration: '130ms' } as any
          : {}),
      }}
    >
      <Search size={15} color={searchFocused ? PInk : U.ink[400]} strokeWidth={1.7} />
      <TextInput
        style={{ flex: 1, fontSize: 13, color: U.ink[900], outlineStyle: 'none' } as any}
        value={search}
        onChangeText={setSearch}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        placeholder="Kullanıcı ara…"
        placeholderTextColor={U.ink[400]}
        returnKeyType="search"
      />
      {search.length > 0 && (
        <Pressable onPress={() => setSearch('')} hitSlop={8}>
          <XCircle size={15} color={U.ink[400]} strokeWidth={1.6} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, paddingTop: 8, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' as const }} showsVerticalScrollIndicator={false}>

        {/* Tabs + search + actions.
            Dar ekranda arama alt satıra tam-genişlik iner (düğme kesilmesin);
            geniş ekranda tek satır kalır. */}
        <View style={{ marginBottom: 20, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Rol + Durum açılır menü.
                Roller çip olarak dizilince satır zaten sıkışıktı; katalogda 10 rol
                var ve yenisi eklendikçe taşacaktı. Açılır menü rol sayısından
                bağımsız sabit genişlik verir; seçili filtre düğmenin üstünde
                görünür, menüyü açmadan ne süzüldüğü okunur. */}
            <FilterDropdown
              label="Rol"
              value={typeFilter === 'all' ? null : (TYPE_TABS.find(t => t.key === typeFilter)?.label ?? null)}
              accentColor={P}
              options={TYPE_TABS.map(t => ({ key: String(t.key), label: t.label, count: t.count }))}
              selectedKey={String(typeFilter)}
              onSelect={(k) => setTypeFilter(k as FilterType)}
            />
            <FilterDropdown
              label="Durum"
              value={statusFilter === 'all' ? null : statusFilter === 'active' ? 'Aktif' : 'Pasif'}
              accentColor={P}
              options={[
                { key: 'all',      label: 'Tümü',  count: profiles.length },
                { key: 'active',   label: 'Aktif', count: profiles.filter(pp => pp.is_active).length },
                { key: 'inactive', label: 'Pasif', count: profiles.filter(pp => !pp.is_active).length },
              ]}
              selectedKey={statusFilter}
              onSelect={(k) => setStatusFilter(k as StatusFilter)}
            />

            <View style={{ flex: 1 }} />

            {/* Arama — geniş ekranda burada (230px); dar ekranda aşağı iner. */}
            {!narrowControls && renderSearchBox(false)}

            {/* Add user button — dar ekranda kısa etiket, kesilmez. */}
            <Pressable
              onPress={() => setShowAddModal(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0,
                paddingHorizontal: 14, height: 36, borderRadius: 12, backgroundColor: P,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <UserPlus size={14} color="#FFFFFF" strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>
                {narrowControls ? 'Yeni' : 'Yeni Kullanıcı'}
              </Text>
            </Pressable>
          </View>

          {/* Dar ekran: arama kendi satırında, tam genişlik. */}
          {narrowControls && renderSearchBox(true)}
        </View>

        {/* Grid: list + detail */}
        <View style={[{ gap: 24 }, isWide && { flexDirection: 'row', alignItems: 'flex-start' }]}>
          {/* List column */}
          <View style={[{ flex: 1, gap: 12 }, isWide && { flex: 2, minWidth: 0 }]}>
            {loading ? (
              <ActivityIndicator size="large" color={P} style={{ marginTop: 60 }} />
            ) : filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 64, gap: 10 }}>
                <UserX size={40} color={U.ink[400]} strokeWidth={1.4} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: U.ink[900] }}>
                  {q ? 'Sonuç bulunamadı' : 'Kullanıcı bulunamadı'}
                </Text>
                {!!q && <Text style={{ fontSize: 13, color: U.ink[400] }}>&#34;{q}&#34; ile eşleşen kullanıcı yok</Text>}
              </View>
            ) : isClinicView ? (
              <View style={{ gap: 18 }}>
                {groupedByClinic.map(group => {
                  const adminCount = group.members.filter(m => m.user_type === 'clinic_admin').length;
                  const secCount   = group.members.filter(m => (m.user_type as string) === 'clinic_secretary').length;
                  const docCount   = group.members.filter(m => m.user_type === 'doctor').length;
                  return (
                    <View key={group.clinicId} style={{ gap: 10 }}>
                      {/* Klinik başlığı */}
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, gap: 12, flexWrap: 'wrap' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexShrink: 1 }}>
                          <Text style={{ fontSize: 18, fontWeight: '700', color: U.ink[900], letterSpacing: -0.3 }} numberOfLines={1}>
                            {group.clinicName}
                          </Text>
                          <Text style={{ fontSize: 12, color: U.ink[500] }}>{group.members.length} kişi</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          {adminCount > 0 && (
                            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: U.isDark ? 'rgba(107,168,136,0.28)' : 'rgba(107,168,136,0.14)' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: U.isDark ? '#9FD9BB' : '#3F7458' }}>{adminCount} YÖNETİCİ</Text>
                            </View>
                          )}
                          {secCount > 0 && (
                            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: U.isDark ? 'rgba(124,58,237,0.28)' : 'rgba(124,58,237,0.14)' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: U.isDark ? '#C9A9E8' : '#5B21B6' }}>{secCount} SEKRETER</Text>
                            </View>
                          )}
                          {docCount > 0 && (
                            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: U.isDark ? 'rgba(14,165,233,0.26)' : 'rgba(14,165,233,0.14)' }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: U.isDark ? '#7DD3FC' : '#0369A1' }}>{docCount} HEKİM</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {/* Grup üyeleri */}
                      <View style={{ gap: 8 }}>
                        {group.members.map(prof => renderUserRow(prof))}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {filtered.map((prof) => renderUserRow(prof))}
              </View>
            )}
          </View>

          {/* Detail panel */}
          {selectedProfile && (
            <View style={[{ width: '100%' }, isWide && { flex: 1, position: 'sticky', top: 24 }] as any}>
              <DetailPanel
                profile={selectedProfile}
                badge={typeBadge(selectedProfile)}
                stats={stats}
                loading={statsLoading}
                primary={P}
                onClose={() => { setSelectedId(null); setStats(null); }}
              />
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Filter modal */}
      <Modal visible={showFilter} transparent animationType="fade" onRequestClose={() => setShowFilter(false)}>
        <Pressable style={{ flex: 1, backgroundColor: U.scrim, alignItems: 'flex-end', paddingTop: 70, paddingEnd: 24 }} onPress={() => setShowFilter(false)}>
          <View
            onStartShouldSetResponder={() => true}
            style={{
              width: 300,
              backgroundColor: U.surface,
              borderRadius: 20,
              overflow: 'hidden',
              ...CARD_SHADOW,
            }}
          >
            <View className="flex-row items-center justify-between px-4 py-3.5">
              <View className="flex-row items-center gap-2">
                <SlidersHorizontal size={16} color={PInk} strokeWidth={1.8} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }}>Filtrele</Text>
                {activeFilterCount > 0 && (
                  <View style={{ backgroundColor: P, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{activeFilterCount}</Text>
                  </View>
                )}
              </View>
              <Pressable onPress={() => { setDraftStatus('all'); }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[400] }}>Temizle</Text>
              </Pressable>
            </View>
            <View style={{ height: 1, backgroundColor: U.ink[100] }} />
            <View className="px-4 py-3.5">
              <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[400], letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }}>DURUM</Text>
              <View className="flex-row gap-2 flex-wrap">
                {([['all','Tümü'],['active','Aktif'],['inactive','Pasif']] as [StatusFilter,string][]).map(([val,lbl]) => (
                  <Pressable
                    key={val}
                    onPress={() => setDraftStatus(val)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 12, paddingVertical: 7,
                      borderRadius: 8, borderWidth: 1.5,
                      borderColor: draftStatus === val ? PInk : U.ink[100],
                      backgroundColor: draftStatus === val ? (U.isDark ? `${PFill}33` : '#EFF6FF') : U.surfaceSoft,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: draftStatus === val ? '600' : '500', color: draftStatus === val ? PInk : U.ink[400] }}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: U.ink[100] }} />
            <View className="flex-row gap-2 px-4 py-3.5">
              <Pressable
                onPress={() => setShowFilter(false)}
                className="flex-1 py-2.5 rounded-[10px] items-center justify-center"
                style={{ borderWidth: 1.5, borderColor: U.ink[100] }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[500] }}>İptal</Text>
              </Pressable>
              <Pressable
                onPress={() => { setStatusFilter(draftStatus); setShowFilter(false); }}
                className="flex-[2] py-2.5 rounded-[10px] items-center justify-center"
                style={{ backgroundColor: P }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Uygula</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <AddUserModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => { setShowAddModal(false); loadProfiles(); }}
        accentColor={P}
        labOnly={labOnly}
      />

      <EditUserModal
        profile={editingProfile}
        onClose={() => setEditingProfile(null)}
        onSuccess={(updated) => {
          setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setEditingProfile(null);
        }}
        accentColor={P}
        onToggleType={toggleAllowedType}
      />

      {/* ── Confirmation Dialog (Patterns §08) ─────────────────── */}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DetailPanel
// ═════════════════════════════════════════════════════════════════════════════

function DetailPanel({
  profile, badge, stats, loading, primary, onClose,
}: {
  profile: Profile;
  badge: { avatarBg: string; avatarText: string; roleLabel: string };
  stats: UserStats | null;
  loading: boolean;
  primary: string;
  onClose: () => void;
}) {
  const U = useInkUI();
  const { ink: pInk } = useAccentTones(primary);
  const productivity = stats && stats.total > 0
    ? Math.round(((stats.total - stats.active) / stats.total) * 100)
    : null;

  return (
    <View
      className="rounded-[24px] overflow-hidden"
      style={{
        backgroundColor: U.surface,
        borderWidth: 1,
        borderColor: U.ink[100],
        ...Platform.select({
          web: { boxShadow: U.isDark ? '0 16px 40px rgba(0,0,0,0.5)' : '0 16px 40px rgba(0,0,0,0.06)' },
          default: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
        }),
      } as any}
    >
      {/* Close button */}
      <Pressable
        onPress={onClose}
        className="absolute top-3 end-3 z-10 w-7 h-7 rounded-lg items-center justify-center"
        style={{ backgroundColor: U.ink[100] }}
      >
        <X size={14} color={U.ink[500]} strokeWidth={2} />
      </Pressable>

      {/* Hero */}
      <View className="items-center py-7 px-7 pb-5" style={{ borderBottomWidth: 1, borderBottomColor: U.ink[100] }}>
        <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 14, position: 'relative' }}>
          <View style={{ position: 'absolute', inset: 0, borderRadius: 48, opacity: 0.22, backgroundColor: primary, ...Platform.select({ web: { filter: 'blur(20px)' }, default: {} }) } as any} />
          <View
            style={{
              width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', borderWidth: 4, borderColor: U.surface, backgroundColor: badge.avatarBg,
              ...Platform.select({
                web: { boxShadow: `0 8px 24px ${primary}26` },
                default: { shadowColor: primary, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
              }),
            } as any}
          >
            {(profile as any).avatar_url
              ? <Image source={{ uri: (profile as any).avatar_url }} style={{ width: 88, height: 88, borderRadius: 44 }} />
              : <Text style={{ fontSize: 28, fontWeight: '800', color: badge.avatarText }}>{initials(profile.full_name)}</Text>}
          </View>
        </View>
        <Text style={{ ...DISPLAY, fontSize: 22, fontWeight: '800', color: U.ink[900], letterSpacing: -0.5, marginBottom: 2 }}>{profile.full_name}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1.0, marginBottom: 6, color: pInk }}>{badge.roleLabel.toUpperCase()}</Text>
        <Text style={{ fontSize: 12, color: U.ink[400], fontWeight: '500' }}>Katılım: {fmtDate(profile.created_at)}</Text>
      </View>

      {/* Metric grid */}
      <View className="flex-row flex-wrap gap-2.5 p-5">
        <MetricCell label="Toplam İş" value={loading ? '…' : (stats?.total ?? 0).toString()} icon="flask-outline" tint={pInk} />
        <MetricCell label="Tamamlanma" value={loading ? '…' : productivity !== null ? `${productivity}%` : '—'} icon="chart-line" tint={pInk} accent />
        <MetricCell label="Geciken" value={loading ? '…' : (stats?.overdue ?? 0).toString()} icon="alert-outline" tint="#DC2626" />
        <MetricCell label="Aktif" value={loading ? '…' : (stats?.active ?? 0).toString()} icon="progress-clock" tint={U.ink[500]} />
      </View>

      {/* Active orders list */}
      <View className="px-5 pb-5">
        <Text style={{ fontSize: 10, fontWeight: '800', color: U.ink[500], letterSpacing: 0.8, marginBottom: 12 }}>AKTİF İŞLER</Text>
        {loading ? (
          <ActivityIndicator size="small" color={primary} style={{ marginTop: 8 }} />
        ) : !stats?.activeOrders?.length ? (
          <Text style={{ fontSize: 13, color: U.ink[400], paddingVertical: 6 }}>Aktif iş yok</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {stats.activeOrders.map(o => (
              <View key={o.id} className="flex-row items-center gap-2.5 rounded-[10px] p-3" style={{ backgroundColor: U.surfaceSoft, borderWidth: U.isDark ? 1 : 0, borderColor: U.hairline }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: o.overdue ? '#DC2626' : pInk }} />
                <View className="flex-1">
                  <Text style={{ fontSize: 13, fontWeight: '800', color: U.ink[900], textAlign: isRTL() ? 'right' : undefined }}>{o.order_number}</Text>
                  <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 2 }} numberOfLines={1}>{o.item}</Text>
                </View>
                {isRTL()
                  ? <ChevronLeft size={14} color={U.ink[300]} strokeWidth={1.8} />
                  : <ChevronRight size={14} color={U.ink[300]} strokeWidth={1.8} />}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function MetricCell({ label, value, icon, tint, accent }: {
  label: string; value: string; icon: string; tint: string; accent?: boolean;
}) {
  const U = useInkUI();
  return (
    <View
      style={{
        flexGrow: 1, flexBasis: '45%', minWidth: 120,
        backgroundColor: U.surfaceSoft, borderRadius: 14,
        padding: 14, paddingEnd: 16, height: 92,
        justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', top: -10, end: -10 }}>
        <MetricIcon name={icon} size={64} color={tint} style={{ opacity: 0.1 }} />
      </View>
      <Text style={{ fontSize: 10, fontWeight: '800', color: U.ink[500], letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: accent ? tint : U.ink[900], letterSpacing: -0.5 }}>{value}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EditUserModal
// ═════════════════════════════════════════════════════════════════════════════

function EditUserModal({
  profile, onClose, onSuccess, accentColor, onToggleType,
}: {
  profile: Profile | null;
  onClose: () => void;
  onSuccess: (updated: Profile) => void;
  accentColor: string;
  onToggleType: (userId: string, type: string) => void;
}) {
  const U = useInkUI();
  const P = accentColor;
  const { ink: PInk } = useAccentTones(P);
  const [fullName,    setFullName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [clinicName,  setClinicName]  = useState('');
  const [role,        setRole]        = useState<'manager' | 'technician'>('technician');
  const [isActive,    setIsActive]    = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [skillLevel,  setSkillLevel2] = useState<SkillLevel>('mid');
  const [salary,  setSalary]  = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [skills,      setSkills]      = useState<Set<Stage>>(new Set());
  const [originalSkills, setOriginalSkills] = useState<Set<Stage>>(new Set());

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setEmail(profile.email ?? '');
      setPhone(profile.phone ?? '');
      setClinicName(profile.clinic_name ?? '');
      setRole(profile.role === 'manager' ? 'manager' : 'technician');
      setIsActive(profile.is_active ?? true);
      setNewPassword('');
      setError('');
      setSkillLevel2(((profile as any).skill_level ?? 'mid') as SkillLevel);
      setSalary(String((profile as any).monthly_salary ?? ''));

      if (profile.user_type === 'lab') {
        supabase
          .from('user_stage_skills')
          .select('stage')
          .eq('user_id', profile.id)
          .then(({ data }) => {
            const set = new Set<Stage>(((data ?? []) as any[]).map(r => r.stage as Stage));
            setSkills(set);
            setOriginalSkills(new Set(set));
          });
      } else {
        setSkills(new Set());
        setOriginalSkills(new Set());
      }
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;
    setError('');
    if (!fullName.trim()) { setError('Ad Soyad zorunludur'); return; }
    if (!email.trim())    { setError('E-posta zorunludur'); return; }
    if (newPassword && newPassword.length < 6) { setError('Şifre en az 6 karakter olmalıdır'); return; }

    setSaving(true);
    try {
      const profileUpdates: Partial<Profile> & Record<string, any> = {
        full_name:  fullName.trim(),
        phone:      phone.trim() || null,
        is_active:  isActive,
        ...(profile.user_type === 'doctor' ? { clinic_name: clinicName.trim() || null } : { clinic_name: null }),
        ...(profile.user_type === 'lab'    ? {
          role,
          skill_level: skillLevel,
          monthly_salary: salary ? parseFloat(salary.replace(',', '.')) : 0,
        } : {}),
      };

      const { error: dbError } = await supabase.from('profiles').update(profileUpdates).eq('id', profile.id);
      if (dbError) throw new Error(dbError.message);

      const emailChanged    = email.trim() !== (profile.email ?? '');
      const passwordChanged = newPassword.length >= 6;
      if (emailChanged || passwordChanged) {
        const body: Record<string, string> = { userId: profile.id };
        if (emailChanged)    body.email    = email.trim();
        if (passwordChanged) body.password = newPassword;
        const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-update-user', { body });
        if (fnError || fnData?.error) throw new Error(fnData?.error ?? fnError?.message ?? 'Auth güncellenemedi');
      }

      if (profile.user_type === 'lab') {
        const toAdd    = [...skills].filter(s => !originalSkills.has(s));
        const toRemove = [...originalSkills].filter(s => !skills.has(s));
        const labId    = (profile as any).lab_id ?? profile.id;

        if (toRemove.length > 0) {
          await supabase.from('user_stage_skills')
            .delete()
            .eq('user_id', profile.id)
            .in('stage', toRemove);
        }
        if (toAdd.length > 0) {
          await supabase.from('user_stage_skills')
            .insert(toAdd.map(s => ({ user_id: profile.id, stage: s, lab_id: labId })));
        }
      }

      onSuccess({ ...profile, ...profileUpdates, email: email.trim() });
    } catch (e: any) {
      setError(e.message ?? 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const isLabUser    = profile?.user_type === 'lab';
  const isDoctorUser = profile?.user_type === 'doctor';

  const INPUT_STYLE = {
    borderWidth: 1,
    borderColor: U.fieldBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: U.ink[900],
    backgroundColor: U.surface,
    marginBottom: 14,
    height: 44,
    outlineStyle: 'none',
  } as any;

  return (
    <Modal visible={!!profile} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: U.scrim, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View
          className="rounded-[20px] w-full overflow-hidden"
          style={{
            maxWidth: 520, maxHeight: '92%',
            backgroundColor: U.surface,
            ...(U.isDark ? { borderWidth: 1, borderColor: U.hairline } : {}),
            ...Platform.select({
              web: { boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
              default: { shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 48, elevation: 10 },
            }),
          } as any}
        >
          {/* Header */}
          <View className="flex-row justify-between items-center px-6 pt-5 pb-4" style={{ borderBottomWidth: 1, borderBottomColor: U.ink[100] }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: U.ink[900] }}>Kullanıcıyı Düzenle</Text>
              {profile && (
                <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2 }}>
                  {profile.user_type === 'doctor' ? 'Hekim' : 'Lab Personeli'}
                </Text>
              )}
            </View>
            <Pressable onPress={onClose} className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: `${P}14` }}>
              <X size={16} color={PInk} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500], letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Kişisel Bilgiler</Text>

            <Text style={{ fontSize: 11, fontWeight: '500', color: U.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>Ad Soyad *</Text>
            <TextInput style={INPUT_STYLE} value={fullName} onChangeText={setFullName}
              placeholder="Örn: Ahmet Yılmaz" placeholderTextColor={U.ink[400]} />

            <Text style={{ fontSize: 11, fontWeight: '500', color: U.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>Telefon</Text>
            <TextInput style={INPUT_STYLE} value={phone} onChangeText={setPhone}
              placeholder="0555 000 00 00" placeholderTextColor={U.ink[400]} keyboardType="phone-pad" />

            {isDoctorUser && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '500', color: U.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>Klinik Adı</Text>
                <TextInput style={INPUT_STYLE} value={clinicName} onChangeText={setClinicName}
                  placeholder="Örn: Sağlık Kliniği" placeholderTextColor={U.ink[400]} />
              </>
            )}

            {isLabUser && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500], letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Rol</Text>
                <View className="flex-row gap-2 mb-5">
                  {(['manager', 'technician'] as const).map((r) => {
                    const active = role === r;
                    const label  = r === 'manager' ? 'Mesul Müdür' : 'Teknisyen';
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setRole(r)}
                        className="flex-1 rounded-[14px] p-3 items-center gap-1"
                        style={{
                          borderWidth: 1.5,
                          borderColor: active ? P : U.plainBtn.border,
                          backgroundColor: active ? P : U.plainBtn.bg,
                        }}
                      >
                        {r === 'manager'
                          ? <UserCircle size={20} color={active ? '#FFF' : U.ink[700]} strokeWidth={1.6} />
                          : <Wrench size={20} color={active ? '#FFF' : U.ink[700]} strokeWidth={1.6} />}
                        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : U.ink[700], textAlign: 'center' }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Seviye */}
                <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500], letterSpacing: 0.5, marginBottom: 8, marginTop: 4 }}>Seviye</Text>
                <View className="flex-row gap-2 mb-4">
                  {SKILL_LEVEL_OPTIONS.map(opt => {
                    const active = skillLevel === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => setSkillLevel2(opt.key)}
                        className="flex-1 py-2 rounded-xl items-center"
                        style={{
                          borderWidth: 1,
                          borderColor: active ? opt.color : U.plainBtn.border,
                          backgroundColor: active ? opt.color : U.plainBtn.bg,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFFFFF' : U.plainBtn.fgMuted }}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Stage Yetkileri */}
                <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500], letterSpacing: 0.5, marginBottom: 6, marginTop: 4 }}>Stage Yetkileri</Text>
                <Text style={{ fontSize: 11, color: U.ink[500], marginBottom: 8 }}>Hangi aşamayı yapabilir?</Text>
                <View className="flex-row flex-wrap gap-1.5 mb-4">
                  {SKILL_STAGES.map(st => {
                    const has = skills.has(st);
                    const color = STAGE_COLOR[st];
                    return (
                      <Pressable
                        key={st}
                        onPress={() => {
                          setSkills(prev => {
                            const nx = new Set(prev);
                            if (nx.has(st)) nx.delete(st);
                            else            nx.add(st);
                            return nx;
                          });
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingHorizontal: 10, paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1, borderColor: has ? color : U.plainBtn.border,
                          backgroundColor: has ? color : U.plainBtn.bg,
                        }}
                      >
                        {has && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                        <Text style={{ fontSize: 11, fontWeight: '600', color: has ? '#FFFFFF' : U.plainBtn.fgMuted }}>
                          {STAGE_LABEL[st]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Vaka Türleri */}
                <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500], letterSpacing: 0.5, marginBottom: 6, marginTop: 4 }}>Vaka Türleri</Text>
                <View className="flex-row flex-wrap gap-1.5 mb-4">
                  {CASE_TYPE_OPTIONS.map(t => {
                    const currentAllowed = (profile as any)?.allowed_types as string[] | null;
                    const has = !currentAllowed ? true : Array.isArray(currentAllowed) ? currentAllowed.includes(t) : false;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => {
                          // Toggle via parent's toggleAllowedType
                          if (profile) onToggleType(profile.id, t);
                        }}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1, borderColor: has ? U.ink[900] : U.plainBtn.border,
                          backgroundColor: has ? U.ink[900] : U.plainBtn.bg,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: has ? U.onDarkPill : U.plainBtn.fgMuted }}>{t}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Saat Ücreti */}
                <Text style={{ fontSize: 11, fontWeight: '500', color: U.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>Aylık Maaş (₺)</Text>
                <TextInput style={INPUT_STYLE} value={salary} onChangeText={setSalary}
                  placeholder="0" placeholderTextColor={U.ink[400]} keyboardType="numeric" />
              </>
            )}

            <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500], letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Hesap & Güvenlik</Text>
            <Text style={{ fontSize: 11, fontWeight: '500', color: U.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>E-posta *</Text>
            <TextInput style={INPUT_STYLE} value={email} onChangeText={setEmail}
              placeholder="kullanici@ornek.com" placeholderTextColor={U.ink[400]}
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={{ fontSize: 11, fontWeight: '500', color: U.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>Yeni Şifre</Text>
            <View className="flex-row items-center gap-2 mb-1">
              <TextInput style={{ ...INPUT_STYLE, flex: 1, marginBottom: 0 }} value={newPassword} onChangeText={setNewPassword}
                placeholder="Boş bırakılırsa değişmez" placeholderTextColor={U.ink[400]} secureTextEntry={!showPass} />
              <Pressable onPress={() => setShowPass(v => !v)} style={{ padding: 11, borderWidth: 1, borderColor: U.fieldBorder, borderRadius: 14, backgroundColor: U.surfaceSoft }}>
                {showPass ? <EyeOff size={18} color={U.ink[400]} strokeWidth={1.6} /> : <Eye size={18} color={U.ink[400]} strokeWidth={1.6} />}
              </Pressable>
            </View>
            <Text style={{ fontSize: 11, color: U.ink[400], marginBottom: 14, marginTop: 2 }}>En az 6 karakter. Boş bırakılırsa şifre değişmez.</Text>

            <View
              className="flex-row items-center gap-3 rounded-[14px] p-3.5 mb-4"
              style={{ backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.fieldBorder, marginTop: 16 }}
            >
              <View className="flex-1">
                <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], marginBottom: 2 }}>Hesap Aktif</Text>
                <Text style={{ fontSize: 12, color: U.ink[400] }}>{isActive ? 'Kullanıcı giriş yapabilir' : 'Kullanıcı giriş yapamaz'}</Text>
              </View>
              <PatternsToggle on={isActive} onPress={() => setIsActive(v => !v)} accentColor={P} />
            </View>

            {error ? (
              <View className="flex-row items-center gap-1.5 rounded-lg p-2.5 mb-3" style={{ backgroundColor: U.chipTones.danger.bg }}>
                <AlertCircle size={14} color={ERR} strokeWidth={1.8} />
                <Text style={{ fontSize: 13, color: ERR, flex: 1 }}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer */}
          <View className="flex-row gap-2.5 p-4" style={{ borderTopWidth: 1, borderTopColor: U.ink[100] }}>
            <Pressable onPress={onClose} className="flex-1 py-3 rounded-[14px] items-center" style={{ borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[700] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="flex-[2] py-3 rounded-[14px] items-center flex-row justify-center gap-1.5"
              style={{ backgroundColor: P, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <>
                  <Save size={16} color="#FFFFFF" strokeWidth={1.8} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Kaydet</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AddUserModal
// ═════════════════════════════════════════════════════════════════════════════

function RoleIcon({ role, color = '#374151', size = 18, sw = 1.6 }: {
  role: NewUserRole; color?: string; size?: number; sw?: number;
}) {
  const p = { size, color, strokeWidth: sw };
  switch (role) {
    case 'admin':        return <ShieldCheck {...p} />;
    case 'manager':      return <UserCog {...p} />;
    case 'technician':   return <Wrench {...p} />;
    case 'accounting':   return <Receipt {...p} />;
    case 'courier':      return <Truck {...p} />;
    case 'service':      return <Sparkles {...p} />;
    case 'receptionist': return <Headphones {...p} />;
    case 'intern':       return <GraduationCap {...p} />;
    case 'doctor':       return <Stethoscope {...p} />;
    case 'clinic_admin': return <Building2 {...p} />;
    default:             return <UserCircle {...p} />;
  }
}

export function AddUserModal({
  visible, onClose, onSuccess, accentColor, panelBg, labOnly = false,
}: {
  visible: boolean; onClose: () => void; onSuccess: () => void;
  accentColor: string; panelBg?: string; labOnly?: boolean;
}) {
  const U = useInkUI();
  const P = accentColor;
  const { ink: PInk } = useAccentTones(P);
  // Panel arka plan rengi — verilmezse accent'in çok hafif tonu kullanılır
  const BG = panelBg ?? P + '0A';
  const [fullName,    setFullName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [clinicName,  setClinicName]  = useState('');
  const [phone,       setPhone]       = useState('');
  const [level,       setLevel]       = useState<'junior' | 'mid' | 'senior'>('mid');
  const [stagePerms,  setStagePerms]  = useState<string[]>([]);
  const [caseTypes,   setCaseTypes]   = useState<string[]>([]);
  const [salary,  setSalary]  = useState('');
  // labOnly modunda sadece lab rolleri göster; varsayılan seçim manager
  const [selectedRole, setSelectedRole] = useState<NewUserRole>(labOnly ? 'manager' : 'doctor');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const LAB_ROLE_KEYS: NewUserRole[] = ['manager', 'technician', 'accounting', 'courier', 'service', 'receptionist', 'intern'];
  const isDoctorType   = selectedRole === 'doctor' || selectedRole === 'clinic_admin';
  const isTechnician   = selectedRole === 'technician';
  const isLabRole      = LAB_ROLE_KEYS.includes(selectedRole);
  // Hizmet ve stajyer için hesap oluşturmak zorunlu değil
  const authOptional   = selectedRole === 'service' || selectedRole === 'intern';
  const needsAuth      = !authOptional || email.trim().length > 0;

  // labOnly modunda sadece lab pozisyonları sunulur (dış kullanıcılar ve admin gizlenir)
  const availableRoles = labOnly
    ? ROLE_OPTIONS.filter(r => LAB_ROLE_KEYS.includes(r.key))
    : ROLE_OPTIONS;

  const reset = () => {
    setFullName(''); setEmail(''); setPassword(''); setClinicName(''); setPhone('');
    setLevel('mid'); setStagePerms([]); setCaseTypes([]); setSalary('');
    setSelectedRole(labOnly ? 'manager' : 'doctor'); setError('');
  };
  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    setError('');
    if (!fullName.trim()) { setError('Ad Soyad zorunludur'); return; }
    // Email/şifre zorunluluğu: hizmet ve stajyer için opsiyonel
    if (!authOptional && !email.trim())       { setError('E-posta zorunludur'); return; }
    if (needsAuth && email.trim() && password.length < 6) { setError('Şifre en az 6 karakter olmalıdır'); return; }
    if (isDoctorType && !clinicName.trim()) { setError('Klinik adı zorunludur'); return; }

    setSaving(true);
    try {
      // ── A. Hesapsız kayıt (sadece hizmet/stajyer için email girilmediyse) ──
      if (authOptional && !email.trim()) {
        // Employees tablosuna yaz — auth hesabı oluşturma
        const empRoleMap: Record<string, string> = {
          service: 'diger', intern: 'diger',
        };
        const { error: empError } = await supabase.from('employees').insert({
          full_name:   fullName.trim(),
          role:        empRoleMap[selectedRole] ?? 'diger',
          phone:       phone.trim() || null,
          base_salary: salary ? Number(salary) : 0,
          start_date:  new Date().toISOString().slice(0, 10),
          is_active:   true,
        });
        if (empError) { setError(empError.message); setSaving(false); return; }
        reset(); onSuccess(); return;
      }

      // ── B. Normal auth hesabı oluştur ──
      const user_type = selectedRole === 'admin' ? 'admin' : (isDoctorType ? selectedRole : 'lab');
      const role = (selectedRole === 'admin' || isDoctorType) ? null : selectedRole;

      const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          user_type,
          role,
          ...(isDoctorType ? {
            clinic_name: clinicName.trim(),
            phone: phone.trim() || null,
          } : {}),
          // Teknisyene özel alanlar
          ...(isTechnician ? {
            specialty: caseTypes.join(', ') || null,
            department: stagePerms.join(', ') || null,
            level,
          } : {}),
          // Tüm lab personeli için maaş (opsiyonel)
          ...(isLabRole && salary ? { monthly_salary: Number(salary) } : {}),
        },
      });
      if (fnError || data?.error) {
        setError(data?.error ?? fnError?.message ?? 'Bir hata oluştu');
      } else {
        // Lab rolü için employees tablosuna da yaz — Ekip listesinde görünmesi için
        if (isLabRole) {
          // NewUserRole → EmployeeRole mapping
          const empRoleMap: Record<string, string> = {
            manager:      'yonetici',
            technician:   'teknisyen',
            accounting:   'muhasebe',
            receptionist: 'sekreter',
            courier:      'diger',
            service:      'diger',
            intern:       'diger',
          };
          const { error: empError } = await supabase.from('employees').insert({
            full_name:   fullName.trim(),
            role:        empRoleMap[selectedRole] ?? 'diger',
            phone:       phone.trim() || null,
            email:       email.trim() || null,
            base_salary: salary ? Number(salary) : 0,
            start_date:  new Date().toISOString().slice(0, 10),
            is_active:   true,
          });
          if (empError) {
            // Auth hesabı oluştu ama employees yazılamadı — kullanıcıya bildir
            console.warn('employees insert error:', empError.message);
          }
        }
        reset();
        onSuccess();
      }
    } catch (e: any) {
      setError(e.message ?? 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  // ── Patterns §05 form tokens ─────────────────────────────────────
  // Field label: fontSize 12, fontWeight 500, ink[800]
  // Input:       height 44, borderRadius 14, border 1px rgba(0,0,0,0.08), white bg
  // Section:     fontSize 11, fw 600, ls 0.7, uppercase, ink[500]
  const FL  = { fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.7, textTransform: 'uppercase' as const, color: U.ink[800], marginBottom: 6 };
  const SL  = { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.7,
                textTransform: 'uppercase' as const, color: U.ink[500], marginBottom: 12, marginTop: 20 };
  const INP = {
    height: 44, borderRadius: 14, borderWidth: 1,
    borderColor: U.fieldBorder, paddingHorizontal: 14,
    fontSize: 14, color: U.ink[900], backgroundColor: U.isDark ? U.surfaceSoft : '#FFFFFF',
    outlineStyle: 'none',
  } as any;

  const currentRole = availableRoles.find(r => r.key === selectedRole) ?? availableRoles[0];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
      >
        {/* ── Card — Patterns §08 dialog style ── */}
        <View
          style={{
            width: '100%', maxWidth: 480, maxHeight: '92%',
            backgroundColor: U.surface, borderRadius: 24, overflow: 'hidden',
            borderWidth: 1, borderColor: U.hairline,
            ...Platform.select({
              web: { boxShadow: U.isDark ? '0 24px 80px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4)' : '0 24px 80px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)' },
              default: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.14, shadowRadius: 48, elevation: 12 },
            }),
          } as any}
        >
          {/* ── Header ── */}
          <View style={{ paddingHorizontal: 28, paddingTop: 28, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: U.hairline, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.6, color: U.ink[900], lineHeight: 32, flex: 1 }}>
              Yeni Kullanıcı
            </Text>
            <Pressable
              onPress={handleClose}
              style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: P, cursor: 'pointer' as any, marginStart: 12, marginTop: 2 }}
            >
              <X size={14} color={PInk} strokeWidth={2} />
            </Pressable>
          </View>

          {/* ── Body ── */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 28 }}>

            {/* ── Pozisyon ── */}
            <Text style={SL}>Pozisyon</Text>

            {/* §07 Pill nav strip */}
            <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: U.surfaceSoft, borderRadius: 999, marginBottom: 14 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 2 }}>
                {availableRoles.map((opt) => {
                  const active = selectedRole === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setSelectedRole(opt.key)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
                        backgroundColor: 'transparent',
                        borderWidth: active ? 1.5 : 0,
                        borderColor: active ? P : 'transparent',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <RoleIcon role={opt.key} color={active ? P : U.ink[500]} size={12} sw={2} />
                      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? P : U.ink[500] }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Selected role row — §09 table row style */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairline, marginBottom: 4 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: P + '18', alignItems: 'center', justifyContent: 'center' }}>
                <RoleIcon role={selectedRole} color={PInk} size={16} sw={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{currentRole.label}</Text>
                <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 1 }}>{currentRole.sub}</Text>
              </View>
              {authOptional && (
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(217,119,6,0.10)' }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: U.isDark ? '#F0C078' : '#92400E' }}>opsiyonel</Text>
                </View>
              )}
            </View>

            {/* auth-optional note */}
            {authOptional && (
              <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: 12, backgroundColor: U.chipTones.warning.bg, marginTop: 8, marginBottom: 4 }}>
                <Info size={13} color={U.isDark ? '#F0C078' : '#D97706'} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 } as any} />
                <Text style={{ fontSize: 12, color: U.isDark ? '#F0C078' : '#92400E', lineHeight: 17 }}>
                  Bu pozisyon için e-posta zorunlu değil. Boş bırakılırsa sadece isim kaydedilir.
                </Text>
              </View>
            )}

            {/* ── Kişisel Bilgiler ── */}
            <Text style={SL}>Kişisel Bilgiler</Text>
            <View style={{ gap: 12 }}>
              {/* Ad Soyad — full width */}
              <View>
                <Text style={FL}>Ad Soyad *</Text>
                <TextInput style={INP} value={fullName} onChangeText={setFullName}
                  placeholder={isDoctorType ? 'Dt. Ahmet Yılmaz' : 'Örn: Ahmet Yılmaz'} placeholderTextColor={U.ink[400]} />
              </View>

              {/* Doctor: clinic name full width */}
              {isDoctorType && (
                <View>
                  <Text style={FL}>{selectedRole === 'clinic_admin' ? 'Klinik Adı *' : 'Muayenehane Adı *'}</Text>
                  <TextInput style={INP} value={clinicName} onChangeText={setClinicName}
                    placeholder="Yılmaz Diş Kliniği" placeholderTextColor={U.ink[400]} />
                </View>
              )}

              {/* 2-col row: Telefon | E-posta */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={FL}>Telefon</Text>
                  <TextInput style={INP} value={phone} onChangeText={setPhone}
                    placeholder="0532 000 00 00" placeholderTextColor={U.ink[400]} keyboardType="phone-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={FL}>
                    {authOptional ? 'E-posta (opsiyonel)' : 'E-posta *'}
                  </Text>
                  <TextInput style={INP} value={email} onChangeText={setEmail}
                    placeholder={authOptional ? 'opsiyonel' : 'kullanici@ornek.com'}
                    placeholderTextColor={U.ink[400]} keyboardType="email-address" autoCapitalize="none" />
                </View>
              </View>

              {/* Şifre — full width, shown when email entered or required */}
              {(!authOptional || email.trim().length > 0) && (
                <View>
                  <Text style={FL}>{authOptional ? 'Şifre (opsiyonel)' : 'Şifre *'}</Text>
                  <TextInput style={INP} value={password} onChangeText={setPassword}
                    placeholder="En az 6 karakter" placeholderTextColor={U.ink[400]} secureTextEntry />
                </View>
              )}
            </View>

            {isDoctorType && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: U.chipTones.success.bg, marginTop: 12 }}>
                <Check size={13} color={U.isDark ? '#6EE7B7' : '#16A34A'} strokeWidth={2.5} />
                <Text style={{ fontSize: 12, color: U.isDark ? '#6EE7B7' : '#15803D', flex: 1, lineHeight: 17 }}>
                  Hekim/klinik otomatik onaylı oluşturulur. OTP ve e-posta onayı atlanır.
                </Text>
              </View>
            )}

            {/* ── Teknisyen Yetkinlik ── */}
            {isTechnician && (
              <>
                <Text style={SL}>Yetkinlik</Text>
                <View style={{ gap: 14 }}>
                  {/* Seviye */}
                  <View>
                    <Text style={FL}>Seviye</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {([['junior', 'Junior'], ['mid', 'Mid'], ['senior', 'Senior']] as const).map(([key, label]) => {
                        const active = level === key;
                        return (
                          <Pressable
                            key={key}
                            onPress={() => setLevel(key)}
                            style={{
                              flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center',
                              borderWidth: 1, borderColor: active ? U.ink[900] : U.fieldBorder,
                              backgroundColor: active ? U.ink[900] : U.surfaceSoft,
                              cursor: 'pointer' as any,
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: active ? U.onDarkPill : U.ink[500] }}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Stage Yetkileri */}
                  <View>
                    <Text style={FL}>Stage Yetkileri</Text>
                    <Text style={{ fontSize: 11, color: U.ink[400], marginBottom: 8, marginTop: -2 }}>Hangi aşamayı yapabilir?</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {['Triyaj', 'Tasarım', 'CAM', 'Frezeleme', 'Sinterleme', 'Bitiş', 'KK'].map((stage) => {
                        const active = stagePerms.includes(stage);
                        return (
                          <Pressable
                            key={stage}
                            onPress={() => setStagePerms(active ? stagePerms.filter(s => s !== stage) : [...stagePerms, stage])}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 4,
                              paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
                              borderWidth: 1.5, borderColor: active ? P : U.fieldBorder,
                              backgroundColor: 'transparent',
                              cursor: 'pointer' as any,
                            }}
                          >
                            {active && <Check size={10} color={PInk} strokeWidth={2.5} />}
                            <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? P : U.ink[500] }}>{stage}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Vaka Türleri */}
                  <View>
                    <Text style={FL}>Vaka Türleri</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {['zirconia', 'emax', 'pmma', 'metal', 'pfm'].map((ct) => {
                        const active = caseTypes.includes(ct);
                        return (
                          <Pressable
                            key={ct}
                            onPress={() => setCaseTypes(active ? caseTypes.filter(c => c !== ct) : [...caseTypes, ct])}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 4,
                              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                              borderWidth: 1.5, borderColor: active ? U.ink[900] : U.fieldBorder,
                              backgroundColor: 'transparent',
                              cursor: 'pointer' as any,
                            }}
                          >
                            {active && <Check size={10} color={U.ink[900]} strokeWidth={2.5} />}
                            <Text style={{ fontSize: 12, fontWeight: '600', color: active ? U.ink[900] : U.ink[500] }}>{ct}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Maaş */}
                  <View>
                    <Text style={FL}>Aylık Maaş (₺)</Text>
                    <TextInput style={INP} value={salary} onChangeText={setSalary}
                      placeholder="0" placeholderTextColor={U.ink[400]} keyboardType="numeric" />
                  </View>
                </View>
              </>
            )}

            {!!error && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, backgroundColor: U.chipTones.danger.bg, marginTop: 14 }}>
                <AlertCircle size={14} color={ERR} strokeWidth={1.8} />
                <Text style={{ fontSize: 13, color: ERR, flex: 1 }}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* ── Footer — §05 form actions ── */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 10,
            paddingHorizontal: 28, paddingVertical: 20,
            borderTopWidth: 1, borderTopColor: U.hairline,
          }}>
            {/* Ghost cancel */}
            <Pressable
              onPress={handleClose}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: U.fieldBorder, cursor: 'pointer' as any }}
            >
              <X size={12} color={U.ink[500]} strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[500] }}>İptal</Text>
            </Pressable>
            {/* Primary action — dark pill (Patterns §03) with accent dot */}
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: U.ink[900], opacity: saving ? 0.6 : 1, cursor: 'pointer' as any }}
            >
              {saving ? (
                <ActivityIndicator size="small" color={U.onDarkPill} />
              ) : (
                <>
                  {/* Accent dot — panel rengi */}
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>Kullanıcı Ekle</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
