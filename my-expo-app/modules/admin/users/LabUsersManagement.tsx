import React, { useEffect, useState, useMemo } from 'react';
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
  ChevronRight,
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
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { Profile } from '../../../lib/types';
import { STAGE_LABEL, STAGE_COLOR, type Stage } from '../../orders/stages';
import { useAuthStore } from '../../../core/store/authStore';

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

type FilterType = 'all' | 'manager' | 'technician' | 'doctor';
type StatusFilter = 'all' | 'active' | 'inactive';
type NewUserRole = 'manager' | 'technician' | 'doctor' | 'clinic_admin';

const ROLE_OPTIONS: { key: NewUserRole; label: string; sub: string; icon: string }[] = [
  { key: 'manager',      label: 'Mesul Müdür',  sub: 'Lab yöneticisi',       icon: 'account-circle-outline' },
  { key: 'technician',   label: 'Teknisyen',    sub: 'Üretim personeli',     icon: 'wrench-outline' },
  { key: 'doctor',       label: 'Muayenehane',  sub: 'Tek hekim, kendi kliniği',  icon: 'stethoscope' },
  { key: 'clinic_admin', label: 'Klinik',       sub: 'Çok hekimli kurum',         icon: 'building' },
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
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

interface UserStats {
  total: number;
  active: number;
  overdue: number;
  activeOrders: { id: string; order_number: string; item: string; overdue: boolean }[];
}

// ── PatternsToggle ──────────────────────────────────────────────────────────
function PatternsToggle({ on, onPress, accentColor }: { on: boolean; onPress: () => void; accentColor: string }) {
  return (
    <Pressable onPress={onPress} style={{ width: 44, height: 24, borderRadius: 999, backgroundColor: on ? accentColor : 'rgba(0,0,0,0.12)', padding: 2, justifyContent: 'center' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF', alignSelf: on ? 'flex-end' : 'flex-start', ...THUMB_SHADOW }} />
    </Pressable>
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
  const P = accentColor;
  const { width } = useWindowDimensions();
  const isWide = width >= 1100;
  const { profile } = useAuthStore();

  const [profiles,       setProfiles]       = useState<Profile[]>([]);
  const [loading,        setLoading]        = useState(true);
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
      const { data, error } = await supabase.functions.invoke('admin-list-users');
      if (!error && data?.users) {
        const scoped = (data.users as Profile[]).filter(p =>
          p.user_type !== 'admin' && (!labOnly || p.user_type === 'lab')
        );
        setProfiles(scoped);
      }
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
    Alert.alert('Kullanıcıyı Sil', `"${profile.full_name}" adlı kullanıcıyı silmek istediğinizden emin misiniz?\nBu işlem geri alınamaz.`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        setUpdatingId(profile.id);
        try {
          const { data, error: fnError } = await supabase.functions.invoke('admin-delete-user', { body: { userId: profile.id } });
          if (fnError || data?.error) Alert.alert('Hata', data?.error ?? fnError?.message ?? 'Silme işlemi başarısız');
          else {
            setProfiles(prev => prev.filter(p => p.id !== profile.id));
            if (selectedId === profile.id) { setSelectedId(null); setStats(null); }
          }
        } catch (e: any) {
          Alert.alert('Hata', e.message ?? 'Bir hata oluştu');
        } finally { setUpdatingId(null); }
      }},
    ]);
  };

  const q = search.trim().toLowerCase();
  const filtered = profiles.filter(p => {
    if (typeFilter === 'doctor'     && p.user_type !== 'doctor') return false;
    if (typeFilter === 'manager'    && !(p.user_type === 'lab' && p.role === 'manager')) return false;
    if (typeFilter === 'technician' && !(p.user_type === 'lab' && p.role === 'technician')) return false;
    if (statusFilter === 'active'   && !p.is_active) return false;
    if (statusFilter === 'inactive' &&  p.is_active) return false;
    if (!q) return true;
    return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
  });

  const activeFilterCount = statusFilter !== 'all' ? 1 : 0;

  const TYPE_TABS: { key: FilterType; label: string; count: number }[] = [
    { key: 'all',        label: 'Tümü',      count: profiles.length },
    { key: 'manager',    label: 'Müdür',     count: profiles.filter(p => p.user_type === 'lab' && p.role === 'manager').length },
    { key: 'technician', label: 'Teknisyen', count: profiles.filter(p => p.user_type === 'lab' && p.role === 'technician').length },
    ...(!labOnly ? [{ key: 'doctor' as FilterType, label: 'Hekim', count: profiles.filter(p => p.user_type === 'doctor').length }] : []),
  ];

  const typeBadge = (profile: Profile) =>
    profile.user_type === 'doctor'  ? { bg: '#D1FAE5', text: '#065F46', label: 'Hekim',     avatarBg: `${P}14`, avatarText: P, roleLabel: 'Hekim' } :
    profile.role      === 'manager' ? { bg: `${P}18`,  text: P,         label: 'Müdür',     avatarBg: `${P}14`, avatarText: P, roleLabel: 'Mesul Müdür' } :
                                      { bg: 'rgba(0,0,0,0.05)', text: '#6B6B6B', label: 'Teknisyen', avatarBg: `${P}14`, avatarText: P, roleLabel: 'Teknisyen' };

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

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' as const }} showsVerticalScrollIndicator={false}>

        {/* Tabs + search + actions — single row */}
        <View className="flex-row items-center gap-2 mb-5">
          {/* Inline tab pills */}
          <View className="flex-row items-center gap-1">
            {TYPE_TABS.map(tab => {
              const active = typeFilter === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setTypeFilter(tab.key as FilterType)}
                  className="px-3.5 py-1.5 rounded-lg"
                  style={{
                    backgroundColor: active ? `${P}18` : 'transparent',
                    // @ts-ignore web
                    cursor: 'pointer',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? P : '#9A9A9A' }}>
                    {tab.label} {tab.count > 0 ? tab.count : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-1" />

          {/* Search toggle */}
          <Pressable
            onPress={() => setSearchExpanded(!searchExpanded)}
            className="w-9 h-9 rounded-[10px] items-center justify-center"
            style={{ backgroundColor: (searchExpanded || search.length > 0) ? `${P}14` : 'transparent' }}
          >
            <Search size={18} color={(searchExpanded || search.length > 0) ? P : '#64748B'} strokeWidth={1.8} />
          </Pressable>

          {/* Filter button */}
          <Pressable
            onPress={() => { setDraftStatus(statusFilter); setShowFilter(true); }}
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: activeFilterCount > 0 ? `${P}14` : 'transparent' }}
          >
            <SlidersHorizontal size={15} color={activeFilterCount > 0 ? P : '#9A9A9A'} strokeWidth={1.8} />
          </Pressable>

          {/* Add user button */}
          <Pressable
            onPress={() => setShowAddModal(true)}
            className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl"
            style={{ backgroundColor: P }}
          >
            <UserPlus size={14} color="#FFFFFF" strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>Yeni Kullanıcı</Text>
          </Pressable>
        </View>

        {/* Search bar */}
        {(searchExpanded || search.length > 0) && (
          <View className="mb-3">
            <View
              className="flex-row items-center gap-2 px-3 rounded-[14px]"
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: searchFocused ? P : 'rgba(0,0,0,0.08)',
                height: 44,
                ...CARD_SHADOW,
              }}
            >
              <Search size={16} color={searchFocused ? P : '#AEAEB2'} strokeWidth={1.6} />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: '#0F172A', height: 44, outlineStyle: 'none' } as any}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Kullanıcı ara..."
                placeholderTextColor="#AEAEB2"
                returnKeyType="search"
                autoFocus={searchExpanded && search.length === 0}
              />
              {search.length > 0 && (
                <Pressable onPress={() => { setSearch(''); setSearchExpanded(false); }}>
                  <XCircle size={16} color="#AEAEB2" strokeWidth={1.6} />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Grid: list + detail */}
        <View style={[{ gap: 24 }, isWide && { flexDirection: 'row', alignItems: 'flex-start' }]}>
          {/* List column */}
          <View style={[{ flex: 1, gap: 12 }, isWide && { flex: 2, minWidth: 0 }]}>
            {loading ? (
              <ActivityIndicator size="large" color={P} style={{ marginTop: 60 }} />
            ) : filtered.length === 0 ? (
              <View className="items-center pt-16 gap-2.5">
                <UserX size={40} color="#AEAEB2" strokeWidth={1.4} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>
                  {q ? 'Sonuç bulunamadı' : 'Kullanıcı bulunamadı'}
                </Text>
                {q && <Text style={{ fontSize: 13, color: '#AEAEB2' }}>"{q}" ile eşleşen kullanıcı yok</Text>}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {filtered.map((prof) => {
                  const badge = typeBadge(prof);
                  const selected = selectedId === prof.id;
                  const isLabUser = prof.user_type === 'lab';
                  const userSkills = skillsMap.get(prof.id) ?? new Set();
                  return (
                    <Pressable
                      key={prof.id}
                      onPress={() => handleSelect(prof)}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 16,
                        padding: 14,
                        paddingLeft: 16,
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
                          borderColor: 'rgba(0,0,0,0.04)',
                        }),
                        // @ts-ignore web
                        cursor: 'pointer',
                      } as any}
                    >
                      {/* Avatar */}
                      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', backgroundColor: `${P}14` }}>
                        {(prof as any).avatar_url
                          ? <Image source={{ uri: (prof as any).avatar_url }} style={{ width: 40, height: 40, borderRadius: 12 }} />
                          : <Text style={{ fontSize: 14, fontWeight: '600', color: P }}>{initials(prof.full_name)}</Text>}
                      </View>
                      {/* Info */}
                      <View className="flex-1" style={{ minWidth: 0, gap: 4 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#0A0A0A', letterSpacing: -0.2 }} numberOfLines={1}>{prof.full_name}</Text>
                        <View className="flex-row items-center gap-2">
                          <View style={{ borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2.5, backgroundColor: badge.bg }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: badge.text }}>{badge.label}</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: '#9A9A9A', flexShrink: 1 }} numberOfLines={1}>{prof.email ?? '—'}</Text>
                        </View>
                        {/* Compact skill summary — details in side panel */}
                        {isLabUser && (() => {
                          const lvl = ((prof as any).skill_level ?? 'mid') as SkillLevel;
                          const lvlOpt = SKILL_LEVEL_OPTIONS.find(o => o.key === lvl);
                          const stageCount = (skillsMap.get(prof.id) ?? new Set()).size;
                          return (
                            <View className="flex-row items-center gap-1.5 mt-0.5">
                              <View style={{ borderRadius: 100, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${lvlOpt?.color ?? '#94A3B8'}18` }}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: lvlOpt?.color ?? '#94A3B8' }}>{lvlOpt?.label}</Text>
                              </View>
                              {stageCount > 0 && (
                                <Text style={{ fontSize: 11, color: '#9A9A9A' }}>{stageCount} stage</Text>
                              )}
                            </View>
                          );
                        })()}
                      </View>
                      {/* Right side: toggle + actions */}
                      <View className="flex-row items-center gap-3">
                        {updatingId === prof.id ? (
                          <ActivityIndicator size="small" color={P} />
                        ) : (
                          <PatternsToggle
                            on={prof.is_active ?? true}
                            onPress={() => handleToggleActive(prof)}
                            accentColor={P}
                          />
                        )}
                        <Pressable
                          onPress={() => setEditingProfile(prof)}
                          className="w-7 h-7 rounded-lg items-center justify-center"
                          style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
                        >
                          <Pencil size={13} color="#9A9A9A" strokeWidth={1.6} />
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteUser(prof)}
                          className="w-7 h-7 rounded-lg items-center justify-center"
                          style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
                        >
                          <Trash2 size={13} color="#DC2626" strokeWidth={1.6} />
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                })}
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
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'flex-end', paddingTop: 70, paddingRight: 24 }} onPress={() => setShowFilter(false)}>
          <View
            onStartShouldSetResponder={() => true}
            style={{
              width: 300,
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              overflow: 'hidden',
              ...CARD_SHADOW,
            }}
          >
            <View className="flex-row items-center justify-between px-4 py-3.5">
              <View className="flex-row items-center gap-2">
                <SlidersHorizontal size={16} color={P} strokeWidth={1.8} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A' }}>Filtrele</Text>
                {activeFilterCount > 0 && (
                  <View style={{ backgroundColor: P, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{activeFilterCount}</Text>
                  </View>
                )}
              </View>
              <Pressable onPress={() => { setDraftStatus('all'); }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#94A3B8' }}>Temizle</Text>
              </Pressable>
            </View>
            <View className="h-px bg-[#F1F5F9]" />
            <View className="px-4 py-3.5">
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }}>DURUM</Text>
              <View className="flex-row gap-2 flex-wrap">
                {([['all','Tümü'],['active','Aktif'],['inactive','Pasif']] as [StatusFilter,string][]).map(([val,lbl]) => (
                  <Pressable
                    key={val}
                    onPress={() => setDraftStatus(val)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 12, paddingVertical: 7,
                      borderRadius: 8, borderWidth: 1.5,
                      borderColor: draftStatus === val ? P : '#F1F5F9',
                      backgroundColor: draftStatus === val ? '#EFF6FF' : '#FAFAFA',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: draftStatus === val ? '600' : '500', color: draftStatus === val ? P : '#94A3B8' }}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="h-px bg-[#F1F5F9]" />
            <View className="flex-row gap-2 px-4 py-3.5">
              <Pressable
                onPress={() => setShowFilter(false)}
                className="flex-1 py-2.5 rounded-[10px] items-center justify-center"
                style={{ borderWidth: 1.5, borderColor: '#F1F5F9' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#6C6C70' }}>İptal</Text>
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
  const productivity = stats && stats.total > 0
    ? Math.round(((stats.total - stats.active) / stats.total) * 100)
    : null;

  return (
    <View
      className="bg-white rounded-[24px] overflow-hidden"
      style={{
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Platform.select({
          web: { boxShadow: '0 16px 40px rgba(0,0,0,0.06)' },
          default: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
        }),
      } as any}
    >
      {/* Close button */}
      <Pressable
        onPress={onClose}
        className="absolute top-3 right-3 z-10 w-7 h-7 rounded-lg items-center justify-center"
        style={{ backgroundColor: '#F1F5F9' }}
      >
        <X size={14} color="#64748B" strokeWidth={2} />
      </Pressable>

      {/* Hero */}
      <View className="items-center py-7 px-7 pb-5" style={{ borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
        <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 14, position: 'relative' }}>
          <View style={{ position: 'absolute', inset: 0, borderRadius: 48, opacity: 0.22, backgroundColor: primary, ...Platform.select({ web: { filter: 'blur(20px)' }, default: {} }) } as any} />
          <View
            style={{
              width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', borderWidth: 4, borderColor: '#FFFFFF', backgroundColor: badge.avatarBg,
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
        <Text style={{ ...DISPLAY, fontSize: 22, fontWeight: '800', color: '#0A0A0A', letterSpacing: -0.5, marginBottom: 2 }}>{profile.full_name}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1.0, marginBottom: 6, color: primary }}>{badge.roleLabel.toUpperCase()}</Text>
        <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '500' }}>Katılım: {fmtDate(profile.created_at)}</Text>
      </View>

      {/* Metric grid */}
      <View className="flex-row flex-wrap gap-2.5 p-5">
        <MetricCell label="Toplam İş" value={loading ? '…' : (stats?.total ?? 0).toString()} icon="flask-outline" tint={primary} />
        <MetricCell label="Tamamlanma" value={loading ? '…' : productivity !== null ? `${productivity}%` : '—'} icon="chart-line" tint={primary} accent />
        <MetricCell label="Geciken" value={loading ? '…' : (stats?.overdue ?? 0).toString()} icon="alert-outline" tint="#DC2626" />
        <MetricCell label="Aktif" value={loading ? '…' : (stats?.active ?? 0).toString()} icon="progress-clock" tint="#64748B" />
      </View>

      {/* Active orders list */}
      <View className="px-5 pb-5">
        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.8, marginBottom: 12 }}>AKTİF İŞLER</Text>
        {loading ? (
          <ActivityIndicator size="small" color={primary} style={{ marginTop: 8 }} />
        ) : !stats?.activeOrders?.length ? (
          <Text style={{ fontSize: 13, color: '#94A3B8', paddingVertical: 6 }}>Aktif iş yok</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {stats.activeOrders.map(o => (
              <View key={o.id} className="flex-row items-center gap-2.5 rounded-[10px] p-3" style={{ backgroundColor: '#F1F5F9' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: o.overdue ? '#DC2626' : primary }} />
                <View className="flex-1">
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{o.order_number}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }} numberOfLines={1}>{o.item}</Text>
                </View>
                <ChevronRight size={14} color="#CBD5E1" strokeWidth={1.8} />
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
  return (
    <View
      style={{
        flexGrow: 1, flexBasis: '45%', minWidth: 120,
        backgroundColor: '#F8FAFC', borderRadius: 14,
        padding: 14, paddingRight: 16, height: 92,
        justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', top: -10, right: -10 }}>
        <MetricIcon name={icon} size={64} color={tint} style={{ opacity: 0.1 }} />
      </View>
      <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: accent ? tint : '#0F172A', letterSpacing: -0.5 }}>{value}</Text>
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
  const P = accentColor;
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
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
    height: 44,
    outlineStyle: 'none',
  } as any;

  return (
    <Modal visible={!!profile} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View
          className="bg-white rounded-[20px] w-full overflow-hidden"
          style={{
            maxWidth: 520, maxHeight: '92%',
            ...Platform.select({
              web: { boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
              default: { shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 48, elevation: 10 },
            }),
          } as any}
        >
          {/* Header */}
          <View className="flex-row justify-between items-center px-6 pt-5 pb-4" style={{ borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>Kullanıcıyı Düzenle</Text>
              {profile && (
                <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                  {profile.user_type === 'doctor' ? 'Hekim' : 'Lab Personeli'}
                </Text>
              )}
            </View>
            <Pressable onPress={onClose} className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: `${P}14` }}>
              <X size={16} color={P} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Kişisel Bilgiler</Text>

            <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>Ad Soyad *</Text>
            <TextInput style={INPUT_STYLE} value={fullName} onChangeText={setFullName}
              placeholder="Örn: Ahmet Yılmaz" placeholderTextColor="#AEAEB2" />

            <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>Telefon</Text>
            <TextInput style={INPUT_STYLE} value={phone} onChangeText={setPhone}
              placeholder="0555 000 00 00" placeholderTextColor="#AEAEB2" keyboardType="phone-pad" />

            {isDoctorUser && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>Klinik Adı</Text>
                <TextInput style={INPUT_STYLE} value={clinicName} onChangeText={setClinicName}
                  placeholder="Örn: Sağlık Kliniği" placeholderTextColor="#AEAEB2" />
              </>
            )}

            {isLabUser && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Rol</Text>
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
                          borderColor: active ? P : '#E5E7EB',
                          backgroundColor: active ? P : '#FAFAFA',
                        }}
                      >
                        {r === 'manager'
                          ? <UserCircle size={20} color={active ? '#FFF' : '#374151'} strokeWidth={1.6} />
                          : <Wrench size={20} color={active ? '#FFF' : '#374151'} strokeWidth={1.6} />}
                        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : '#374151', textAlign: 'center' }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Seviye */}
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 }}>Seviye</Text>
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
                          borderColor: active ? opt.color : 'rgba(0,0,0,0.08)',
                          backgroundColor: active ? opt.color : '#FFFFFF',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFFFFF' : '#6B6B6B' }}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Stage Yetkileri */}
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 }}>Stage Yetkileri</Text>
                <Text style={{ fontSize: 11, color: '#9A9A9A', marginBottom: 8 }}>Hangi aşamayı yapabilir?</Text>
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
                          borderWidth: 1, borderColor: has ? color : 'rgba(0,0,0,0.08)',
                          backgroundColor: has ? color : '#FFFFFF',
                        }}
                      >
                        {has && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                        <Text style={{ fontSize: 11, fontWeight: '600', color: has ? '#FFFFFF' : '#6B6B6B' }}>
                          {STAGE_LABEL[st]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Vaka Türleri */}
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 }}>Vaka Türleri</Text>
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
                          borderWidth: 1, borderColor: has ? '#0A0A0A' : 'rgba(0,0,0,0.08)',
                          backgroundColor: has ? '#0A0A0A' : '#FFFFFF',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: has ? '#FFFFFF' : '#6B6B6B' }}>{t}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Saat Ücreti */}
                <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>Aylık Maaş (₺)</Text>
                <TextInput style={INPUT_STYLE} value={salary} onChangeText={setSalary}
                  placeholder="0" placeholderTextColor="#AEAEB2" keyboardType="numeric" />
              </>
            )}

            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Hesap & Güvenlik</Text>
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>E-posta *</Text>
            <TextInput style={INPUT_STYLE} value={email} onChangeText={setEmail}
              placeholder="kullanici@ornek.com" placeholderTextColor="#AEAEB2"
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>Yeni Şifre</Text>
            <View className="flex-row items-center gap-2 mb-1">
              <TextInput style={{ ...INPUT_STYLE, flex: 1, marginBottom: 0 }} value={newPassword} onChangeText={setNewPassword}
                placeholder="Boş bırakılırsa değişmez" placeholderTextColor="#AEAEB2" secureTextEntry={!showPass} />
              <Pressable onPress={() => setShowPass(v => !v)} style={{ padding: 11, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14, backgroundColor: '#FAFAFA' }}>
                {showPass ? <EyeOff size={18} color="#AEAEB2" strokeWidth={1.6} /> : <Eye size={18} color="#AEAEB2" strokeWidth={1.6} />}
              </Pressable>
            </View>
            <Text style={{ fontSize: 11, color: '#AEAEB2', marginBottom: 14, marginTop: 2 }}>En az 6 karakter. Boş bırakılırsa şifre değişmez.</Text>

            <View
              className="flex-row items-center gap-3 rounded-[14px] p-3.5 mb-4"
              style={{ backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginTop: 16 }}
            >
              <View className="flex-1">
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 2 }}>Hesap Aktif</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{isActive ? 'Kullanıcı giriş yapabilir' : 'Kullanıcı giriş yapamaz'}</Text>
              </View>
              <PatternsToggle on={isActive} onPress={() => setIsActive(v => !v)} accentColor={P} />
            </View>

            {error ? (
              <View className="flex-row items-center gap-1.5 rounded-lg p-2.5 mb-3" style={{ backgroundColor: '#FEF2F2' }}>
                <AlertCircle size={14} color={ERR} strokeWidth={1.8} />
                <Text style={{ fontSize: 13, color: ERR, flex: 1 }}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer */}
          <View className="flex-row gap-2.5 p-4" style={{ borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
            <Pressable onPress={onClose} className="flex-1 py-3 rounded-[14px] items-center" style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>İptal</Text>
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

function RoleIcon({ role, active }: { role: NewUserRole; active: boolean }) {
  const color = active ? '#FFFFFF' : '#374151';
  const sw = 1.6;
  switch (role) {
    case 'manager':      return <UserCircle size={20} color={color} strokeWidth={sw} />;
    case 'technician':   return <Wrench size={20} color={color} strokeWidth={sw} />;
    case 'doctor':       return <Stethoscope size={20} color={color} strokeWidth={sw} />;
    case 'clinic_admin': return <Building2 size={20} color={color} strokeWidth={sw} />;
    default:             return <UserCircle size={20} color={color} strokeWidth={sw} />;
  }
}

function AddUserModal({
  visible, onClose, onSuccess, accentColor,
}: {
  visible: boolean; onClose: () => void; onSuccess: () => void; accentColor: string;
}) {
  const P = accentColor;
  const [fullName,    setFullName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [clinicName,  setClinicName]  = useState('');
  const [phone,       setPhone]       = useState('');
  const [level,       setLevel]       = useState<'junior' | 'mid' | 'senior'>('mid');
  const [stagePerms,  setStagePerms]  = useState<string[]>([]);
  const [caseTypes,   setCaseTypes]   = useState<string[]>([]);
  const [salary,  setSalary]  = useState('');
  const [selectedRole, setSelectedRole] = useState<NewUserRole>('doctor');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const isDoctorType = selectedRole === 'doctor' || selectedRole === 'clinic_admin';
  const isTechnician = selectedRole === 'technician';

  const reset = () => {
    setFullName(''); setEmail(''); setPassword(''); setClinicName(''); setPhone('');
    setLevel('mid'); setStagePerms([]); setCaseTypes([]); setSalary('');
    setSelectedRole('doctor'); setError('');
  };
  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    setError('');
    if (!fullName.trim())    { setError('Ad Soyad zorunludur'); return; }
    if (!email.trim())       { setError('E-posta zorunludur'); return; }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalıdır'); return; }
    if (isDoctorType && !clinicName.trim()) { setError('Klinik adı zorunludur'); return; }

    const user_type = isDoctorType ? selectedRole : 'lab';
    const role = isDoctorType ? null : selectedRole;

    setSaving(true);
    try {
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
          ...(isTechnician ? {
            specialty: caseTypes.join(', ') || null,
            department: stagePerms.join(', ') || null,
            level,
            monthly_salary: salary ? Number(salary) : null,
          } : {}),
        },
      });
      if (fnError || data?.error) {
        setError(data?.error ?? fnError?.message ?? 'Bir hata oluştu');
      } else {
        reset();
        onSuccess();
      }
    } catch (e: any) {
      setError(e.message ?? 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const INPUT_STYLE = {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
    height: 44,
    outlineStyle: 'none',
  } as any;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View
          className="bg-white rounded-[20px] w-full overflow-hidden"
          style={{
            maxWidth: 520, maxHeight: '92%',
            ...Platform.select({
              web: { boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
              default: { shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 48, elevation: 10 },
            }),
          } as any}
        >
          {/* Header */}
          <View className="flex-row justify-between items-center px-6 pt-5 pb-4" style={{ borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>Yeni Kullanıcı</Text>
            <Pressable onPress={handleClose}>
              <X size={22} color="#6C6C70" strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Kullanıcı Türü</Text>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {ROLE_OPTIONS.map((opt) => {
                const active = selectedRole === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setSelectedRole(opt.key)}
                    style={{
                      flex: 1, minWidth: 100, borderRadius: 14, padding: 12,
                      alignItems: 'center', gap: 4,
                      borderWidth: 1.5,
                      borderColor: active ? P : '#E5E7EB',
                      backgroundColor: active ? P : '#FAFAFA',
                    }}
                  >
                    <RoleIcon role={opt.key} active={active} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : '#374151', textAlign: 'center' }}>{opt.label}</Text>
                    <Text style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.6)' : '#9CA3AF', textAlign: 'center' }}>{opt.sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Kişisel Bilgiler</Text>
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>Ad Soyad *</Text>
            <TextInput style={INPUT_STYLE} value={fullName} onChangeText={setFullName}
              placeholder={isDoctorType ? 'Dr. Ahmet Yılmaz' : 'Örn: Ahmet Yılmaz'} placeholderTextColor="#AEAEB2" />

            {isDoctorType && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>
                  {selectedRole === 'clinic_admin' ? 'Klinik Adı *' : 'Muayenehane Adı *'}
                </Text>
                <TextInput style={INPUT_STYLE} value={clinicName} onChangeText={setClinicName}
                  placeholder="Yılmaz Diş Kliniği" placeholderTextColor="#AEAEB2" />

                <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>Telefon</Text>
                <TextInput style={INPUT_STYLE} value={phone} onChangeText={setPhone}
                  placeholder="0532 000 00 00" placeholderTextColor="#AEAEB2" keyboardType="phone-pad" />
              </>
            )}

            {isTechnician && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Teknisyen Bilgileri</Text>

                {/* Seviye */}
                <Text style={{ fontSize: 11, fontWeight: '500', color: P, marginBottom: 7 }}>Seviye</Text>
                <View className="flex-row gap-2 mb-4">
                  {([['junior', 'Junior'], ['mid', 'Mid'], ['senior', 'Senior']] as const).map(([key, label]) => {
                    const active = level === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setLevel(key)}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: 'center',
                          borderWidth: 1.5,
                          borderColor: active ? P : '#E5E7EB',
                          backgroundColor: active ? P : '#FAFAFA',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#FFF' : '#374151' }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Stage Yetkileri */}
                <Text style={{ fontSize: 11, fontWeight: '500', color: P, marginBottom: 4 }}>Stage Yetkileri</Text>
                <Text style={{ fontSize: 10, color: '#94A3B8', marginBottom: 8 }}>Hangi aşamayı yapabilir?</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {['Triyaj', 'Tasarım', 'CAM', 'Frezeleme', 'Sinterleme', 'Bitiş', 'Kalite Kontrol'].map((stage) => {
                    const active = stagePerms.includes(stage);
                    return (
                      <Pressable
                        key={stage}
                        onPress={() => setStagePerms(active ? stagePerms.filter(s => s !== stage) : [...stagePerms, stage])}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                          borderWidth: 1.5,
                          borderColor: active ? '#0F172A' : '#E5E7EB',
                          backgroundColor: active ? '#F8FAFC' : '#FAFAFA',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '500', color: active ? '#0F172A' : '#6B7280' }}>{stage}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Vaka Türleri */}
                <Text style={{ fontSize: 11, fontWeight: '500', color: P, marginBottom: 8 }}>Vaka Türleri</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {['zirconia', 'emax', 'pmma', 'metal', 'pfm'].map((ct) => {
                    const active = caseTypes.includes(ct);
                    return (
                      <Pressable
                        key={ct}
                        onPress={() => setCaseTypes(active ? caseTypes.filter(c => c !== ct) : [...caseTypes, ct])}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: active ? '#0F172A' : '#FAFAFA',
                          borderWidth: 1.5,
                          borderColor: active ? '#0F172A' : '#E5E7EB',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFF' : '#374151' }}>{ct}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Saat Ücreti */}
                <Text style={{ fontSize: 11, fontWeight: '500', color: P, marginBottom: 7 }}>Aylık Maaş (₺)</Text>
                <TextInput style={INPUT_STYLE} value={salary} onChangeText={setSalary}
                  placeholder="0" placeholderTextColor="#AEAEB2" keyboardType="numeric" />
              </>
            )}

            <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Hesap Bilgileri</Text>
            <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>E-posta *</Text>
            <TextInput style={INPUT_STYLE} value={email} onChangeText={setEmail}
              placeholder="kullanici@ornek.com" placeholderTextColor="#AEAEB2"
              keyboardType="email-address" autoCapitalize="none" />

            <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 }}>Şifre *</Text>
            <TextInput style={INPUT_STYLE} value={password} onChangeText={setPassword}
              placeholder="En az 6 karakter" placeholderTextColor="#AEAEB2" secureTextEntry />

            {isDoctorType && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                padding: 10, borderRadius: 10, backgroundColor: '#F0FDF4', marginBottom: 14,
              }}>
                <Check size={13} color="#16A34A" strokeWidth={2} />
                <Text style={{ fontSize: 11, color: '#15803D', flex: 1, lineHeight: 16 }}>
                  Hekim/klinik otomatik onaylı olarak oluşturulur. OTP ve onay adımı atlanır.
                </Text>
              </View>
            )}

            {error ? (
              <View className="flex-row items-center gap-1.5 rounded-lg p-2.5 mb-3" style={{ backgroundColor: '#FEF2F2' }}>
                <AlertCircle size={14} color={ERR} strokeWidth={1.8} />
                <Text style={{ fontSize: 13, color: ERR, flex: 1 }}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer */}
          <View className="flex-row gap-2.5 p-4" style={{ borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
            <Pressable onPress={handleClose} className="flex-1 py-3 rounded-[14px] items-center" style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="flex-[2] py-3 rounded-[14px] items-center flex-row justify-center gap-1.5"
              style={{ backgroundColor: P, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <>
                  <Check size={16} color="#FFFFFF" strokeWidth={2} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Kullanıcı Ekle</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
