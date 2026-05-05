import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, Pressable,
  RefreshControl, useWindowDimensions, Animated, Easing,
} from 'react-native';
import { Search, X, SlidersHorizontal, Plus, Building2, Users, UserPlus, List, ChevronRight, ChevronUp, ChevronDown, Edit2, Trash2, Phone, Mail, MapPin, RefreshCw, UserX, AlertCircle, Check, Percent, MinusCircle, Briefcase } from 'lucide-react-native';
import { useSegments } from 'expo-router';
import { toast } from '../../../core/ui/Toast';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { supabase } from '../../../core/api/supabase';
import { fetchClinics, createClinic, updateClinic, createDoctor, updateDoctor } from '../api';
import { ILLER, ILCELER } from '../data/turkey';
import { AppIcon } from '../../../core/ui/AppIcon';
import { DS } from '../../../core/theme/dsTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { useColorThemeStore } from '../../../core/store/colorThemeStore';

// ── Design tokens ───────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const R = { sm: 8, md: 14, lg: 20, xl: 24, pill: 999 };
const CARD = { backgroundColor: '#FFFFFF', borderRadius: R.xl, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' } as const;
const inputBase = {
  borderWidth: 1, borderColor: DS.ink[200], borderRadius: R.md,
  paddingHorizontal: 14, paddingVertical: 11,
  fontSize: 14, color: DS.ink[900], backgroundColor: '#FFFFFF',
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
} as any;

// ─── Category ────────────────────────────────────────────────────────
type ClinicCategory = 'klinik' | 'poliklinik' | 'hastane' | 'laboratuvar';
const CLINIC_CATEGORIES: { value: ClinicCategory; label: string; icon: string; color: string; bg: string }[] = [
  { value: 'klinik',      label: 'Klinik',      icon: 'tooth-outline',        color: '#0891B2', bg: '#ECFEFF' },
  { value: 'poliklinik',  label: 'Poliklinik',  icon: 'stethoscope',          color: '#7C3AED', bg: '#EDE9FE' },
  { value: 'hastane',     label: 'Hastane',     icon: 'hospital-box-outline', color: '#059669', bg: '#D1FAE5' },
  { value: 'laboratuvar', label: 'Laboratuvar', icon: 'flask-outline',        color: '#D97706', bg: '#FEF3C7' },
];

// ─── Types ───────────────────────────────────────────────────────────
type Clinic = {
  id: string; name: string;
  category?: ClinicCategory | null;
  phone?: string | null; email?: string | null;
  address?: string | null; contact_person?: string | null;
  notes?: string | null; is_active: boolean;
};
type Doctor = {
  id: string; full_name: string;
  phone?: string | null; specialty?: string | null;
  notes?: string | null; clinic_id?: string | null;
  is_active: boolean;
};
type ClinicForm = {
  name: string; category: ClinicCategory; phone: string; email: string;
  il: string; ilce: string; mahalle: string;
  contact_person: string; notes: string; is_active: boolean;
  vkn: string; tax_office: string;
};
type DoctorForm = {
  full_name: string; phone: string; specialty: string;
  notes: string; clinic_id: string; is_active: boolean;
  tckn: string;
};

const EMPTY_CLINIC: ClinicForm = { name: '', category: 'klinik', phone: '', email: '', il: '', ilce: '', mahalle: '', contact_person: '', notes: '', is_active: true, vkn: '', tax_office: '' };
const EMPTY_DOCTOR: DoctorForm = { full_name: '', phone: '', specialty: '', notes: '', clinic_id: '', is_active: true, tckn: '' };

function parseAddress(raw?: string | null): { il: string; ilce: string; mahalle: string } {
  if (!raw) return { il: '', ilce: '', mahalle: '' };
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') return { il: p.il ?? '', ilce: p.ilce ?? '', mahalle: p.mahalle ?? '' };
  } catch {}
  return { il: '', ilce: '', mahalle: raw };
}

const TAB_FILTERS = [
  { key: 'all',         label: 'Tümü' },
  { key: 'klinik',      label: 'Klinik' },
  { key: 'poliklinik',  label: 'Poliklinik' },
  { key: 'hastane',     label: 'Hastane' },
  { key: 'laboratuvar', label: 'Laboratuvar' },
  { key: 'doctors',     label: 'Hekimler' },
];

// ═════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════
interface Props { accentColor?: string; }

export default function ClinicsScreen({ accentColor: accentColorProp }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const segments = useSegments() as string[];
  const panelType = (segments?.[0] ?? '') === '(admin)' ? 'admin' : 'lab';
  const { getTheme } = useColorThemeStore();
  const accentColor = accentColorProp ?? getTheme(panelType).primary;

  const [clinics, setClinics]   = useState<Clinic[]>([]);
  const [doctors, setDoctors]   = useState<Doctor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search,   setSearch]   = useState('');

  const [showClinicModal,   setShowClinicModal]   = useState(false);
  const [editingClinic,     setEditingClinic]     = useState<Clinic | null>(null);
  const [discountClinic,    setDiscountClinic]    = useState<Clinic | null>(null);
  const [discountMap,       setDiscountMap]       = useState<Record<string, number>>({});

  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [editingDoctor,   setEditingDoctor]   = useState<Doctor | null>(null);
  const [defaultClinicId, setDefaultClinicId] = useState('');

  const [activeTab,       setActiveTab]       = useState<'all' | ClinicCategory | 'doctors'>('all');
  const [searchOpen,      setSearchOpen]      = useState(false);
  const [categoryFilter,  setCategoryFilter]  = useState<ClinicCategory | 'all'>('all');
  const [statusFilter,    setStatusFilter]    = useState<'all' | 'active' | 'inactive'>('all');
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // ── Page title ──
  const { setTitle: setPageTitle, clear: clearPageTitle } = usePageTitleStore();
  useEffect(() => {
    setPageTitle('Klinikler', '');
    return () => clearPageTitle();
  }, []);

  // ── Data ──
  const loadData = useCallback(async () => {
    setLoading(true);
    const [clinicsRes, doctorsRes, discountsRes] = await Promise.all([
      fetchClinics(),
      supabase.from('doctors').select('*').order('full_name'),
      supabase.from('clinic_discounts').select('clinic_id, discount_percent'),
    ]);
    if (!clinicsRes.error && clinicsRes.data) setClinics(clinicsRes.data as Clinic[]);
    if (!doctorsRes.error && doctorsRes.data) setDoctors(doctorsRes.data as Doctor[]);
    if (!discountsRes.error && discountsRes.data) {
      const map: Record<string, number> = {};
      (discountsRes.data as any[]).forEach(r => { map[r.clinic_id] = Number(r.discount_percent); });
      setDiscountMap(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Handlers ──
  const toggleExpand = (id: string) =>
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const handleToggleClinic = async (clinic: Clinic) => {
    const val = !clinic.is_active;
    await updateClinic(clinic.id, { is_active: val });
    setClinics(prev => prev.map(c => c.id === clinic.id ? { ...c, is_active: val } : c));
  };

  const handleDeleteClinic = (clinic: Clinic) => {
    Alert.alert('Klinik Sil', `"${clinic.name}" kliniğini silmek istiyor musunuz?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('clinics').delete().eq('id', clinic.id);
        if (!error) setClinics(prev => prev.filter(c => c.id !== clinic.id));
        else toast.error('Klinik silinemedi.');
      }},
    ]);
  };

  const handleToggleDoctor = async (doctor: Doctor) => {
    const val = !doctor.is_active;
    await updateDoctor(doctor.id, { is_active: val });
    setDoctors(prev => prev.map(d => d.id === doctor.id ? { ...d, is_active: val } : d));
  };

  const handleDeleteDoctor = (doctor: Doctor) => {
    Alert.alert('Hekim Sil', `"${doctor.full_name}" adlı hekimi silmek istiyor musunuz?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('doctors').delete().eq('id', doctor.id);
        if (!error) setDoctors(prev => prev.filter(d => d.id !== doctor.id));
        else toast.error('Hekim silinemedi.');
      }},
    ]);
  };

  const openAddDoctor = (clinicId = '') => { setEditingDoctor(null); setDefaultClinicId(clinicId); setShowDoctorModal(true); };
  const openEditDoctor = (doctor: Doctor) => { setEditingDoctor(doctor); setDefaultClinicId(doctor.clinic_id ?? ''); setShowDoctorModal(true); };

  const getDoctorsByClinic = (clinicId: string) => doctors.filter(d => d.clinic_id === clinicId);
  const unassigned = doctors.filter(d => !d.clinic_id);

  // ── Derived ──
  const q = search.trim().toLowerCase();
  const activeFilterCount = (categoryFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);
  const [draftCategory, setDraftCategory] = useState<ClinicCategory | 'all'>('all');
  const [draftStatus,   setDraftStatus]   = useState<'all' | 'active' | 'inactive'>('all');

  const openFilter = () => { setDraftCategory(categoryFilter); setDraftStatus(statusFilter); setShowFilterSheet(true); };
  const applyFilter = () => { setCategoryFilter(draftCategory); setStatusFilter(draftStatus); setShowFilterSheet(false); };

  const filteredClinics = useMemo(() => clinics.filter(c => {
    if (activeTab !== 'all' && activeTab !== 'doctors' && (c.category ?? 'klinik') !== activeTab) return false;
    if (categoryFilter !== 'all' && (c.category ?? 'klinik') !== categoryFilter) return false;
    if (statusFilter === 'active' && !c.is_active) return false;
    if (statusFilter === 'inactive' && c.is_active) return false;
    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.contact_person?.toLowerCase().includes(q)) return true;
    return getDoctorsByClinic(c.id).some(d => d.full_name.toLowerCase().includes(q));
  }), [clinics, activeTab, categoryFilter, statusFilter, q, doctors]);

  const categoryCounts = useMemo(() =>
    CLINIC_CATEGORIES.reduce((acc, cat) => {
      acc[cat.value] = clinics.filter(c => (c.category ?? 'klinik') === cat.value).length;
      return acc;
    }, {} as Record<string, number>),
  [clinics]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: clinics.length, doctors: doctors.length };
    for (const cat of CLINIC_CATEGORIES) counts[cat.value] = categoryCounts[cat.value] ?? 0;
    return counts;
  }, [clinics, doctors, categoryCounts]);


  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <View className="flex-1">

      {/* ── Filter Bar — Siparişler sayfasıyla aynı yapı ─────────── */}
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2">
          {/* Status tabs — pill strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-1"
            contentContainerStyle={{ gap: 6 }}
          >
            <View className="flex-row gap-0.5 p-0.5 bg-cream-panel rounded-full">
              {TAB_FILTERS.map(f => {
                const active = activeTab === f.key;
                const count = tabCounts[f.key] ?? 0;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setActiveTab(f.key as any)}
                    className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${active ? 'bg-ink-900' : ''}`}
                  >
                    <Text className={`text-[12px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}>
                      {f.label}
                    </Text>
                    <Text className={`text-[10px] font-bold ${active ? 'text-white/60' : 'text-ink-400'}`}>
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Search */}
          {searchOpen ? (
            <View
              className="flex-row items-center gap-2 rounded-full bg-white border border-black/[0.08] px-3 h-8"
              style={{ minWidth: 200 }}
            >
              <Search size={13} color="#9A9A9A" strokeWidth={1.8} />
              <TextInput
                autoFocus
                className="flex-1 text-[13px] text-ink-900"
                style={{ height: 32, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) } as any}
                value={search}
                onChangeText={setSearch}
                onBlur={() => { if (!search) setSearchOpen(false); }}
                placeholder={activeTab === 'doctors' ? 'Hekim ara...' : 'Klinik ara...'}
                placeholderTextColor="#9A9A9A"
                returnKeyType="search"
              />
              <Pressable onPress={() => { setSearch(''); setSearchOpen(false); }} hitSlop={8}>
                <X size={13} color="#9A9A9A" strokeWidth={1.8} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setSearchOpen(true)}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-black/[0.06]"
            >
              <Search size={12} color="#9A9A9A" strokeWidth={1.8} />
              <Text className="text-[12px] font-semibold text-ink-500">Ara</Text>
            </Pressable>
          )}

          {/* Filter */}
          {activeTab !== 'doctors' && (
            <Pressable
              onPress={openFilter}
              className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${activeFilterCount > 0 ? 'bg-ink-100 border-ink-900' : 'bg-white border-black/[0.06]'}`}
            >
              <SlidersHorizontal size={12} color={activeFilterCount > 0 ? '#0A0A0A' : '#9A9A9A'} strokeWidth={1.8} />
              <Text className={`text-[12px] font-semibold ${activeFilterCount > 0 ? 'text-ink-900' : 'text-ink-500'}`}>
                Filtrele{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Text>
            </Pressable>
          )}

          {/* Add clinic */}
          <Pressable
            onPress={() => { setEditingClinic(null); setShowClinicModal(true); }}
            className="flex-row items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-ink-900"
          >
            <Plus size={12} color="#FFFFFF" strokeWidth={2} />
            <Text className="text-[12px] font-semibold text-white">Kurum</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Content ──────────────────────────────────────────────── */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: isDesktop ? 16 : 12, paddingTop: 4, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor="#0A0A0A" />}
        showsVerticalScrollIndicator={false}
      >
        {loading && clinics.length === 0 ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="#0A0A0A" />
            <Text className="text-[13px] text-ink-400 mt-3">Yükleniyor…</Text>
          </View>
        ) : (
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 20 : 16, alignItems: 'flex-start' }}>

            {/* ── Main Column ── */}
            <View style={{ flex: 1, minWidth: 0, gap: 12 }}>

              {/* KPI strip */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {CLINIC_CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.value}
                    onPress={() => setActiveTab(cat.value)}
                    style={{
                      ...CARD, flex: 1, minWidth: isDesktop ? 170 : 130, padding: 16,
                      borderColor: activeTab === cat.value ? cat.color : 'rgba(0,0,0,0.05)',
                      borderWidth: activeTab === cat.value ? 1.5 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <View style={{ width: 26, height: 26, borderRadius: R.sm, backgroundColor: cat.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <AppIcon name={cat.icon as any} size={13} color={cat.color} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>{cat.label}</Text>
                    </View>
                    <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.6, color: DS.ink[900] }}>{categoryCounts[cat.value] ?? 0}</Text>
                    <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 3 }}>
                      {clinics.filter(c => (c.category ?? 'klinik') === cat.value && c.is_active).length} aktif
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Content card */}
              {activeTab === 'doctors' ? (
                <DoctorsTable
                  doctors={doctors}
                  clinics={clinics}
                  search={q}
                  accentColor={accentColor}
                  onAdd={() => openAddDoctor('')}
                  onEdit={openEditDoctor}
                  onToggle={handleToggleDoctor}
                  onDelete={handleDeleteDoctor}
                />
              ) : filteredClinics.length === 0 ? (
                <EmptyState
                  hasSearch={!!q}
                  search={search}
                  accentColor={accentColor}
                  onAdd={() => { setEditingClinic(null); setShowClinicModal(true); }}
                />
              ) : (
                <View style={{ gap: 12 }}>
                  {filteredClinics.map(clinic => (
                    <ClinicRow
                      key={clinic.id}
                      clinic={clinic}
                      doctors={getDoctorsByClinic(clinic.id)}
                      isExpanded={expanded.has(clinic.id)}
                      accentColor={accentColor}
                      discountPercent={discountMap[clinic.id] ?? null}
                      onToggleExpand={() => toggleExpand(clinic.id)}
                      onToggleClinic={() => handleToggleClinic(clinic)}
                      onEditClinic={() => { setEditingClinic(clinic); setShowClinicModal(true); }}
                      onDeleteClinic={() => handleDeleteClinic(clinic)}
                      onSetDiscount={() => setDiscountClinic(clinic)}
                      onAddDoctor={() => openAddDoctor(clinic.id)}
                      onToggleDoctor={handleToggleDoctor}
                      onEditDoctor={openEditDoctor}
                      onDeleteDoctor={handleDeleteDoctor}
                    />
                  ))}

                  {unassigned.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <UserX size={12} color={DS.ink[400]} strokeWidth={1.8} />
                        <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[500] }}>Kliniksiz Hekimler</Text>
                        <View style={{ backgroundColor: DS.ink[100], borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[700] }}>{unassigned.length}</Text>
                        </View>
                      </View>
                      <View style={{ ...CARD, overflow: 'hidden' }}>
                        {unassigned.map((d, i) => (
                          <DoctorRow key={d.id} doctor={d} isLast={i === unassigned.length - 1} accentColor={accentColor}
                            onToggle={() => handleToggleDoctor(d)} onEdit={() => openEditDoctor(d)} onDelete={() => handleDeleteDoctor(d)} />
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* ── Right Sidebar — desktop only ── */}
            {isDesktop && (
              <View style={{ width: 300, flexShrink: 0, gap: 12, position: 'sticky' as any, top: 12 }}>
                {/* Quick Actions — animated accent card */}
                <AnimatedQuickActions
                  accentColor={accentColor}
                  onAddClinic={() => { setEditingClinic(null); setShowClinicModal(true); }}
                  onAddDoctor={() => openAddDoctor('')}
                  onShowDoctors={() => setActiveTab('doctors')}
                />

                {/* Category Breakdown */}
                <View style={{ ...CARD, padding: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <SlidersHorizontal size={13} color={DS.ink[400]} strokeWidth={1.8} />
                    <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase', color: DS.ink[500] }}>Kategoriler</Text>
                  </View>
                  <View style={{ gap: 10 }}>
                    {CLINIC_CATEGORIES.map(cat => {
                      const count = categoryCounts[cat.value] ?? 0;
                      const pct = clinics.length > 0 ? Math.round((count / clinics.length) * 100) : 0;
                      return (
                        <View key={cat.value} style={{ gap: 5 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: cat.color }} />
                              <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800] }}>{cat.label}</Text>
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[900] }}>{count}</Text>
                          </View>
                          <View style={{ height: 4, borderRadius: R.pill, backgroundColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                            <View style={{ width: `${pct}%`, height: 4, borderRadius: R.pill, backgroundColor: cat.color } as any} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Modals ─────────────────────────────────────────────── */}
      <ClinicModal visible={showClinicModal} editingClinic={editingClinic} existingClinics={clinics} accentColor={accentColor}
        onClose={() => { setShowClinicModal(false); setEditingClinic(null); }}
        onSuccess={() => { setShowClinicModal(false); setEditingClinic(null); loadData(); }} />

      <DoctorModal visible={showDoctorModal} editingDoctor={editingDoctor} clinics={clinics} defaultClinicId={defaultClinicId} accentColor={accentColor}
        onClose={() => { setShowDoctorModal(false); setEditingDoctor(null); }}
        onSuccess={() => { setShowDoctorModal(false); setEditingDoctor(null); loadData(); }} />

      <DiscountModal clinic={discountClinic} currentDiscount={discountClinic ? (discountMap[discountClinic.id] ?? null) : null}
        onClose={() => setDiscountClinic(null)}
        onSaved={(clinicId, percent) => { setDiscountMap(prev => ({ ...prev, [clinicId]: percent })); setDiscountClinic(null); }} />

      {/* Filter Panel */}
      <FilterPanel
        visible={showFilterSheet}
        activeFilterCount={activeFilterCount}
        draftCategory={draftCategory}
        draftStatus={draftStatus}
        onDraftCategory={setDraftCategory}
        onDraftStatus={setDraftStatus}
        onApply={applyFilter}
        onClose={() => setShowFilterSheet(false)}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

// ─── Animated Quick Actions Card ─────────────────────────────────────
function AnimatedQuickActions({ accentColor, onAddClinic, onAddDoctor, onShowDoctors }: {
  accentColor: string; onAddClinic: () => void; onAddDoctor: () => void; onShowDoctors: () => void;
}) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [glowAnim]);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });

  const handleHoverIn = () => {
    Animated.spring(scaleAnim, { toValue: 1.02, friction: 8, tension: 200, useNativeDriver: true }).start();
  };
  const handleHoverOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 200, useNativeDriver: true }).start();
  };

  return (
    <Animated.View
      // @ts-ignore web events
      onMouseEnter={handleHoverIn}
      onMouseLeave={handleHoverOut}
      style={{
        borderRadius: R.xl,
        backgroundColor: accentColor,
        padding: 20,
        overflow: 'hidden',
        transform: [{ scale: scaleAnim }],
      }}
    >
      {/* Shimmer glow */}
      <Animated.View style={{
        position: 'absolute', top: -20, right: -20,
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#FFFFFF',
        opacity: glowOpacity,
      }} pointerEvents="none" />
      <Animated.View style={{
        position: 'absolute', bottom: -30, left: -10,
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#FFFFFF',
        opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.12] }),
      }} pointerEvents="none" />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Building2 size={14} color="rgba(255,255,255,0.6)" strokeWidth={1.8} />
        <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Hızlı İşlemler</Text>
      </View>
      <View style={{ gap: 4 }}>
        <Pressable onPress={onAddClinic}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: R.md, backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <View style={{ width: 28, height: 28, borderRadius: R.sm, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={14} color="#FFFFFF" strokeWidth={1.8} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFFFFF' }}>Yeni Kurum Ekle</Text>
        </Pressable>
        <Pressable onPress={onAddDoctor}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: R.md, backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <View style={{ width: 28, height: 28, borderRadius: R.sm, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <UserPlus size={14} color="#FFFFFF" strokeWidth={1.8} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFFFFF' }}>Hekim Ekle</Text>
        </Pressable>
        <Pressable onPress={onShowDoctors}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: R.md, backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <View style={{ width: 28, height: 28, borderRadius: R.sm, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <List size={14} color="#FFFFFF" strokeWidth={1.8} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFFFFF' }}>Tüm Hekimleri Gör</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function QuickAction({ icon, iconBg, label, onPress }: { icon: React.ReactNode; iconBg: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: R.md }}>
      <View style={{ width: 28, height: 28, borderRadius: R.sm, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ hasSearch, search, accentColor, onAdd }: { hasSearch: boolean; search: string; accentColor: string; onAdd: () => void }) {
  return (
    <View style={{ ...CARD, alignItems: 'center', paddingVertical: 60 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: hasSearch ? DS.ink[100] : accentColor + '14', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        {hasSearch
          ? <Search size={24} color={DS.ink[300]} strokeWidth={1.5} />
          : <Building2 size={24} color={accentColor} strokeWidth={1.5} />}
      </View>
      <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>{hasSearch ? 'Sonuç bulunamadı' : 'Henüz klinik eklenmemiş'}</Text>
      <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 6 }}>{hasSearch ? `"${search}" ile eşleşen kayıt yok` : 'İlk kliniği ekleyerek başlayın'}</Text>
      {!hasSearch && (
        <Pressable onPress={onAdd}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.pill, backgroundColor: DS.ink[900], marginTop: 16 }}>
          <Plus size={14} color="#FFFFFF" strokeWidth={2} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Kurum Ekle</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Doctors Table ───────────────────────────────────────────────────
function DoctorsTable({ doctors, clinics, search, accentColor, onAdd, onEdit, onToggle, onDelete }: {
  doctors: Doctor[]; clinics: Clinic[]; search: string; accentColor: string;
  onAdd: () => void; onEdit: (d: Doctor) => void; onToggle: (d: Doctor) => void; onDelete: (d: Doctor) => void;
}) {
  const filtered = doctors.filter(d => {
    if (!search) return true;
    return d.full_name.toLowerCase().includes(search) || d.specialty?.toLowerCase().includes(search) || d.phone?.includes(search);
  });

  if (filtered.length === 0) return (
    <View style={{ ...CARD, alignItems: 'center', paddingVertical: 60 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        {search ? <Search size={24} color={DS.ink[300]} strokeWidth={1.5} /> : <Users size={24} color={DS.ink[300]} strokeWidth={1.5} />}
      </View>
      <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>{search ? 'Sonuç bulunamadı' : 'Henüz hekim eklenmemiş'}</Text>
      <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 6 }}>{search ? `"${search}" ile eşleşen hekim yok` : 'İlk hekimi ekleyerek başlayın'}</Text>
      {!search && (
        <Pressable onPress={onAdd}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.pill, backgroundColor: DS.ink[900], marginTop: 16 }}>
          <Plus size={14} color="#FFFFFF" strokeWidth={2} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Hekim Ekle</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={{ ...CARD, overflow: 'hidden' }}>
      {/* Table header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: DS.ink[50], borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
        <Text style={{ flex: 2.8, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500] }}>HEKİM</Text>
        <Text style={{ flex: 1.5, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500] }}>UZMANLIK</Text>
        <Text style={{ flex: 1.8, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500] }}>KLİNİK</Text>
        <Text style={{ flex: 1.4, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500] }}>TELEFON</Text>
        <Text style={{ flex: 0.9, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: 'center' }}>DURUM</Text>
        <View style={{ width: 76 }} />
      </View>
      {filtered.map((d, i) => {
        const clinicName = clinics.find(c => c.id === d.clinic_id)?.name;
        return (
          <View key={d.id} style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 13, minHeight: 52,
            opacity: d.is_active ? 1 : 0.55,
            borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
            borderBottomColor: 'rgba(0,0,0,0.04)',
          }}>
            <View style={{ flex: 2.8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: accentColor + '14', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: accentColor }}>{d.full_name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }} numberOfLines={1}>{d.full_name}</Text>
                {!d.is_active && (
                  <View style={{ backgroundColor: 'rgba(217,75,75,0.12)', borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#9C2E2E', letterSpacing: 0.5 }}>PASİF</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={{ flex: 1.5, fontSize: 13, color: d.specialty ? DS.ink[700] : DS.ink[400] }} numberOfLines={1}>{d.specialty || '—'}</Text>
            <Text style={{ flex: 1.8, fontSize: 13, color: clinicName ? DS.ink[700] : DS.ink[400] }} numberOfLines={1}>{clinicName ?? '—'}</Text>
            <Text style={{ flex: 1.4, fontSize: 13, color: d.phone ? DS.ink[700] : DS.ink[400] }} numberOfLines={1}>{d.phone ?? '—'}</Text>
            <View style={{ flex: 0.9, alignItems: 'center' }}>
              <AppSwitch value={d.is_active} onValueChange={() => onToggle(d)} accentColor={accentColor} />
            </View>
            <View style={{ width: 76, flexDirection: 'row', justifyContent: 'flex-end', gap: 2 }}>
              <Pressable style={{ width: 28, height: 28, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' }} onPress={() => onEdit(d)}>
                <Edit2 size={14} color={DS.ink[500]} strokeWidth={1.8} />
              </Pressable>
              <Pressable style={{ width: 28, height: 28, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' }} onPress={() => onDelete(d)}>
                <Trash2 size={14} color="#9C2E2E" strokeWidth={1.8} />
              </Pressable>
            </View>
          </View>
        );
      })}
      {/* Footer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: DS.ink[50] }}>
        <Text style={{ fontSize: 11, color: DS.ink[500] }}>{filtered.length} hekim</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onAdd}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: R.pill, backgroundColor: DS.ink[900] }}>
          <Plus size={12} color="#FFFFFF" strokeWidth={2} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>Hekim Ekle</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Clinic Card ─────────────────────────────────────────────────────
function ClinicRow({
  clinic, doctors, isExpanded, accentColor, discountPercent,
  onToggleExpand, onToggleClinic, onEditClinic, onDeleteClinic,
  onSetDiscount, onAddDoctor, onToggleDoctor, onEditDoctor, onDeleteDoctor,
}: {
  clinic: Clinic; doctors: Doctor[]; isExpanded: boolean; accentColor: string;
  discountPercent: number | null;
  onToggleExpand: () => void; onToggleClinic: () => void;
  onEditClinic: () => void; onDeleteClinic: () => void;
  onSetDiscount: () => void; onAddDoctor: () => void;
  onToggleDoctor: (d: Doctor) => void; onEditDoctor: (d: Doctor) => void; onDeleteDoctor: (d: Doctor) => void;
}) {
  const cat = CLINIC_CATEGORIES.find(c => c.value === (clinic.category ?? 'klinik')) ?? CLINIC_CATEGORIES[0];
  const primaryDoctor = doctors[0];
  const extraDoctors  = Math.max(0, doctors.length - 1);

  return (
    <View style={{ ...CARD, padding: 18, opacity: clinic.is_active ? 1 : 0.7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {/* Icon */}
        <View style={{ width: 48, height: 48, borderRadius: R.md, backgroundColor: clinic.is_active ? cat.bg : DS.ink[100], alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AppIcon name={cat.icon as any} size={22} color={clinic.is_active ? cat.color : DS.ink[400]} />
        </View>

        {/* Content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <View style={{ borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: clinic.is_active ? cat.bg : DS.ink[100] }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: clinic.is_active ? cat.color : DS.ink[400] }}>{cat.label}</Text>
            </View>
            {!clinic.is_active && (
              <View style={{ backgroundColor: 'rgba(217,75,75,0.12)', borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#9C2E2E', letterSpacing: 0.5 }}>PASİF</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.2, lineHeight: 21 }} numberOfLines={1}>{clinic.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Users size={12} color={DS.ink[400]} strokeWidth={1.8} />
            <Text style={{ fontSize: 12, color: DS.ink[500], flex: 1 }} numberOfLines={1}>
              {primaryDoctor
                ? (extraDoctors > 0 ? `${primaryDoctor.full_name} · +${extraDoctors} hekim daha` : primaryDoctor.full_name)
                : (clinic.contact_person || 'Henüz hekim eklenmemiş')}
            </Text>
          </View>
        </View>

        {/* Actions */}
        {clinic.is_active ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Pressable style={{ width: 32, height: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' }} onPress={onEditClinic}>
              <Edit2 size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
            <Pressable style={{ width: 32, height: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' }} onPress={onDeleteClinic}>
              <Trash2 size={14} color="#9C2E2E" strokeWidth={1.8} />
            </Pressable>
            <Pressable style={{ width: 34, height: 34, borderRadius: 17, marginLeft: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: isExpanded ? accentColor + '14' : DS.ink[100] }} onPress={onToggleExpand}>
              {isExpanded
                ? <ChevronUp size={16} color={accentColor} strokeWidth={1.8} />
                : <ChevronRight size={16} color={DS.ink[500]} strokeWidth={1.8} />}
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={onToggleClinic} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1, borderColor: DS.ink[200] }}>
            <RefreshCw size={13} color={accentColor} strokeWidth={1.8} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>Aktif Et</Text>
          </Pressable>
        )}
      </View>

      {/* Expanded */}
      {isExpanded && clinic.is_active && (
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', gap: 10 }}>
          {(clinic.phone || clinic.email || clinic.address) && (
            <View style={{ gap: 5, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              {clinic.phone && <InfoRow icon={<Phone size={12} color={DS.ink[400]} strokeWidth={1.8} />} text={clinic.phone} />}
              {clinic.email && <InfoRow icon={<Mail size={12} color={DS.ink[400]} strokeWidth={1.8} />} text={clinic.email} />}
              {clinic.address && (() => {
                const a = parseAddress(clinic.address);
                const display = [a.mahalle, a.ilce, a.il].filter(Boolean).join(', ');
                return <InfoRow icon={<MapPin size={12} color={DS.ink[400]} strokeWidth={1.8} />} text={display || clinic.address} />;
              })()}
            </View>
          )}

          {doctors.length > 0 && (
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textTransform: 'uppercase', marginTop: 4, marginBottom: 8 }}>Hekimler</Text>
              <View style={{ backgroundColor: DS.ink[50], borderRadius: R.md, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
                {doctors.map((d, i) => (
                  <DoctorRow key={d.id} doctor={d} isLast={i === doctors.length - 1} accentColor={accentColor}
                    onToggle={() => onToggleDoctor(d)} onEdit={() => onEditDoctor(d)} onDelete={() => onDeleteDoctor(d)} />
                ))}
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Pressable onPress={onAddDoctor} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 }}>
              <UserPlus size={13} color={accentColor} strokeWidth={1.8} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>Bu kliniğe hekim ekle</Text>
            </Pressable>
            <Pressable onPress={onSetDiscount} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.sm, backgroundColor: '#EDE9FE', marginLeft: 4 }}>
              <Percent size={12} color="#7C3AED" strokeWidth={1.8} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#7C3AED' }}>{discountPercent != null && discountPercent > 0 ? `%${discountPercent} İndirim` : 'İndirim Ekle'}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <AppSwitch value={clinic.is_active} onValueChange={onToggleClinic} accentColor={accentColor} />
            <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>Aktif</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Doctor Row ──────────────────────────────────────────────────────
function DoctorRow({ doctor, isLast, accentColor, onToggle, onEdit, onDelete }: {
  doctor: Doctor; isLast?: boolean; accentColor: string;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 11,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: 'rgba(0,0,0,0.04)',
      opacity: doctor.is_active ? 1 : 0.55,
    }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: accentColor + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>{doctor.full_name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: doctor.is_active ? DS.ink[900] : DS.ink[400] }} numberOfLines={1}>{doctor.full_name}</Text>
        {(doctor.specialty || doctor.phone) && (
          <Text style={{ fontSize: 11, color: DS.ink[400] }} numberOfLines={1}>{[doctor.specialty, doctor.phone].filter(Boolean).join(' · ')}</Text>
        )}
      </View>
      <AppSwitch value={doctor.is_active} onValueChange={onToggle} accentColor={accentColor} />
      <Pressable style={{ width: 28, height: 28, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' }} onPress={onEdit}>
        <Edit2 size={13} color={DS.ink[500]} strokeWidth={1.8} />
      </Pressable>
      <Pressable style={{ width: 28, height: 28, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' }} onPress={onDelete}>
        <Trash2 size={13} color="#9C2E2E" strokeWidth={1.8} />
      </Pressable>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon}
      <Text style={{ fontSize: 12, color: DS.ink[500], flex: 1 }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// ─── Filter Panel ────────────────────────────────────────────────────
function FilterPanel({ visible, activeFilterCount, draftCategory, draftStatus, onDraftCategory, onDraftStatus, onApply, onClose }: {
  visible: boolean; activeFilterCount: number;
  draftCategory: ClinicCategory | 'all'; draftStatus: 'all' | 'active' | 'inactive';
  onDraftCategory: (v: ClinicCategory | 'all') => void; onDraftStatus: (v: 'all' | 'active' | 'inactive') => void;
  onApply: () => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.2)', alignItems: 'flex-end', paddingTop: 116, paddingRight: 16 }} activeOpacity={1} onPress={onClose}>
        <View style={{ width: 310, ...CARD, overflow: 'hidden' }} onStartShouldSetResponder={() => true}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SlidersHorizontal size={15} color={DS.ink[900]} strokeWidth={1.8} />
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: DS.ink[900] }}>Filtrele</Text>
              {activeFilterCount > 0 && (
                <View style={{ backgroundColor: DS.ink[900], borderRadius: R.pill, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>{activeFilterCount}</Text>
                </View>
              )}
            </View>
            <Pressable onPress={() => { onDraftCategory('all'); onDraftStatus('all'); }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[400] }}>Temizle</Text>
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)' }} />
          <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textTransform: 'uppercase', marginBottom: 10 }}>Kategori</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {([{ value: 'all', label: 'Tümü' }, ...CLINIC_CATEGORIES] as const).map(item => {
                const active = draftCategory === item.value;
                return (
                  <Pressable key={item.value} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1.5, borderColor: active ? DS.ink[900] : DS.ink[200], backgroundColor: active ? DS.ink[100] : 'transparent' }}
                    onPress={() => onDraftCategory(item.value as any)}>
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)' }} />
          <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textTransform: 'uppercase', marginBottom: 10 }}>Durum</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {([{ value: 'all', label: 'Tümü' }, { value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Pasif' }] as const).map(item => {
                const active = draftStatus === item.value;
                return (
                  <Pressable key={item.value} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1.5, borderColor: active ? DS.ink[900] : DS.ink[200], backgroundColor: active ? DS.ink[100] : 'transparent' }}
                    onPress={() => onDraftStatus(item.value)}>
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)' }} />
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 16 }}>
            <Pressable style={{ flex: 1, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center' }} onPress={onClose}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable style={{ flex: 2, paddingVertical: 10, borderRadius: R.pill, backgroundColor: DS.ink[900], alignItems: 'center' }} onPress={onApply}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Uygula</Text>
            </Pressable>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Modal Field ─────────────────────────────────────────────────────
function ModalField({ label, required, last, children }: { label: string; required?: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: last ? 0 : 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>
        {required && <Text style={{ color: '#9C2E2E' }}>* </Text>}{label}
      </Text>
      {children}
    </View>
  );
}

function DropdownList({ items, selected, searchValue, onSearch, searchPlaceholder, onSelect, accentColor }: {
  items: string[]; selected: string; searchValue: string; onSearch: (v: string) => void;
  searchPlaceholder: string; onSelect: (v: string) => void; accentColor: string;
}) {
  return (
    <View style={{ borderWidth: 1, borderColor: DS.ink[200], borderRadius: R.md, backgroundColor: DS.ink[50], marginTop: 4, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
        <Search size={14} color={DS.ink[400]} strokeWidth={1.8} />
        <TextInput style={{ flex: 1, fontSize: 13, color: DS.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) } as any}
          value={searchValue} onChangeText={onSearch} placeholder={searchPlaceholder} placeholderTextColor={DS.ink[400]} autoFocus />
      </View>
      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="always">
        {items.map((item, i) => (
          <Pressable key={item} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)', backgroundColor: selected === item ? DS.ink[100] : 'transparent' }}
            onPress={() => onSelect(item)}>
            <Text style={{ fontSize: 14, color: selected === item ? accentColor : DS.ink[900], fontWeight: selected === item ? '600' : '400' }}>{item}</Text>
            {selected === item && <Check size={14} color={accentColor} strokeWidth={2} />}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Section Card (modal içi) ────────────────────────────────────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: R.md, borderWidth: 1, borderColor: DS.ink[200], padding: 16, marginBottom: 12 }}>
      {title ? <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900], marginBottom: 14 }}>{title}</Text> : null}
      {children}
    </View>
  );
}

// ─── Clinic Modal ────────────────────────────────────────────────────
function ClinicModal({ visible, editingClinic, existingClinics, accentColor, onClose, onSuccess }: {
  visible: boolean; editingClinic: Clinic | null; existingClinics: Clinic[];
  accentColor: string; onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState<ClinicForm>(EMPTY_CLINIC);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [ilSearch, setIlSearch] = useState('');
  const [ilOpen, setIlOpen] = useState(false);
  const [ilceSearch, setIlceSearch] = useState('');
  const [ilceOpen, setIlceOpen] = useState(false);

  useEffect(() => {
    if (editingClinic) {
      const addr = parseAddress(editingClinic.address);
      setForm({ name: editingClinic.name, category: editingClinic.category ?? 'klinik', phone: editingClinic.phone ?? '', email: editingClinic.email ?? '',
        il: addr.il, ilce: addr.ilce, mahalle: addr.mahalle, contact_person: editingClinic.contact_person ?? '',
        notes: editingClinic.notes ?? '', is_active: editingClinic.is_active, vkn: (editingClinic as any).vkn ?? '', tax_office: (editingClinic as any).tax_office ?? '' });
    } else { setForm(EMPTY_CLINIC); }
    setError(''); setIlOpen(false); setIlceOpen(false); setIlSearch(''); setIlceSearch('');
  }, [editingClinic, visible]);

  const set = (k: keyof ClinicForm, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('Kurum adı zorunludur'); return; }
    if (isDuplicate) { setError('Bu isimde bir kurum zaten mevcut'); return; }
    if (!form.contact_person.trim()) { setError('İrtibat kişisi zorunludur'); return; }
    if (!form.phone.trim()) { setError('Telefon zorunludur'); return; }
    if (!form.il.trim()) { setError('İl zorunludur'); return; }
    if (!form.ilce.trim()) { setError('İlçe zorunludur'); return; }
    if (!form.mahalle.trim()) { setError('Adres zorunludur'); return; }
    setSaving(true);
    try {
      const vknTrim = form.vkn.trim();
      if (vknTrim && ![10, 11].includes(vknTrim.length)) { setError('VKN 10 hane, TCKN 11 hane olmalıdır'); return; }
      const payload = { name: form.name.trim(), category: form.category, phone: form.phone.trim(),
        email: form.email.trim() || null, address: JSON.stringify({ il: form.il.trim(), ilce: form.ilce.trim(), mahalle: form.mahalle.trim() }),
        contact_person: form.contact_person.trim(), notes: form.notes.trim() || null, is_active: form.is_active, vkn: vknTrim || null, tax_office: form.tax_office.trim() || null };
      const { error: err } = editingClinic ? await updateClinic(editingClinic.id, payload as any) : await createClinic(payload as any);
      if (err) { setError(err.message ?? 'Bir hata oluştu'); return; }
      onSuccess();
    } catch (e: any) { setError(e.message ?? 'Bir hata oluştu'); }
    finally { setSaving(false); }
  };

  const nameQ = form.name.trim().toLowerCase();
  const otherclinics = existingClinics.filter(c => c.id !== editingClinic?.id);
  const suggestions = nameQ.length >= 1 ? otherclinics.filter(c => c.name.toLowerCase().includes(nameQ)) : [];
  const isDuplicate = nameQ.length > 0 && otherclinics.some(c => c.name.toLowerCase() === nameQ);
  const ilResults = ILLER.filter(il => il.toLowerCase().includes(ilSearch.toLowerCase()));
  const ilceResults = (form.il ? (ILCELER[form.il] ?? []) : []).filter(d => d.toLowerCase().includes(ilceSearch.toLowerCase()));
  const selectIl = (il: string) => { set('il', il); set('ilce', ''); set('mahalle', ''); setIlOpen(false); setIlSearch(''); };
  const selectIlce = (ilce: string) => { set('ilce', ilce); setIlceOpen(false); setIlceSearch(''); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.3)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: R.xl, width: '100%', maxWidth: 520, maxHeight: '92%', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>{editingClinic ? 'Kurumu düzenle' : 'Yeni kurum ekle'}</Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: R.sm, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {/* Kategori */}
            <SectionCard title="Kategori">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CLINIC_CATEGORIES.map(cat => {
                  const active = form.category === cat.value;
                  return (
                    <Pressable key={cat.value} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.sm, borderWidth: 1.5, borderColor: active ? cat.color : DS.ink[200], backgroundColor: active ? cat.bg : 'transparent', flex: 1, minWidth: '44%' as any }}
                      onPress={() => set('category', cat.value)}>
                      <AppIcon name={cat.icon as any} size={16} color={active ? cat.color : DS.ink[400]} />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: active ? cat.color : DS.ink[400] }}>{cat.label}</Text>
                      {active && <Check size={12} color={cat.color} strokeWidth={2} />}
                    </Pressable>
                  );
                })}
              </View>
            </SectionCard>

            {/* Kurum Bilgileri */}
            <SectionCard title="Kurum Bilgileri">
              <ModalField label="Kurum Adı" required>
                <TextInput style={[inputBase, isDuplicate && { color: '#9C2E2E' }]} value={form.name} onChangeText={v => set('name', v)}
                  onFocus={() => setNameFocused(true)} onBlur={() => setTimeout(() => setNameFocused(false), 150)}
                  placeholder="Örn: Merkez Diş Kliniği" placeholderTextColor={DS.ink[400]} autoCorrect={false} />
                {(isDuplicate || (nameFocused && suggestions.length > 0 && !isDuplicate)) && (
                  <View style={{ borderWidth: 1, borderColor: DS.ink[200], borderRadius: R.sm, backgroundColor: DS.ink[50], marginTop: 4, overflow: 'hidden' }}>
                    {isDuplicate ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 }}>
                        <AlertCircle size={12} color="#9C2E2E" strokeWidth={1.8} />
                        <Text style={{ fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>Bu kurum zaten eklenmiş</Text>
                      </View>
                    ) : suggestions.slice(0, 5).map((c, i) => {
                      const catItem = CLINIC_CATEGORIES.find(x => x.value === c.category);
                      return (
                        <Pressable key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i < Math.min(suggestions.length, 5) - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)' }}
                          onPress={() => { set('name', c.name); setNameFocused(false); }}>
                          {catItem && <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: catItem.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                            <AppIcon name={catItem.icon as any} size={11} color={catItem.color} />
                          </View>}
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: DS.ink[900] }} numberOfLines={1}>{c.name}</Text>
                          <View style={{ backgroundColor: DS.lab.bgSoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#D97706' }}>Kayıtlı</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </ModalField>
              <ModalField label="İrtibat Kişisi" required><TextInput style={inputBase} value={form.contact_person} onChangeText={v => set('contact_person', v)} placeholder="Örn: Mehmet Bey" placeholderTextColor={DS.ink[400]} /></ModalField>
              <ModalField label="Telefon" required><TextInput style={inputBase} value={form.phone} onChangeText={v => set('phone', v)} placeholder="0555 000 00 00" placeholderTextColor={DS.ink[400]} keyboardType="phone-pad" /></ModalField>
              <ModalField label="E-posta" last><TextInput style={inputBase} value={form.email} onChangeText={v => set('email', v)} placeholder="info@klinik.com" placeholderTextColor={DS.ink[400]} keyboardType="email-address" autoCapitalize="none" /></ModalField>
            </SectionCard>

            {/* Adres */}
            <SectionCard title="Adres">
              <ModalField label="İl" required>
                <Pressable style={{ ...inputBase, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} onPress={() => { setIlOpen(v => !v); setIlceOpen(false); }}>
                  <Text style={{ fontSize: 14, color: form.il ? DS.ink[900] : DS.ink[400], flex: 1 }}>{form.il || 'Seçiniz'}</Text>
                  {ilOpen ? <ChevronUp size={14} color={DS.ink[400]} strokeWidth={1.8} /> : <ChevronDown size={14} color={DS.ink[400]} strokeWidth={1.8} />}
                </Pressable>
                {ilOpen && <DropdownList items={ilResults} selected={form.il} searchValue={ilSearch} onSearch={setIlSearch} searchPlaceholder="İl ara..." onSelect={selectIl} accentColor={accentColor} />}
              </ModalField>
              <ModalField label="İlçe" required>
                <Pressable style={{ ...inputBase, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: form.il ? 1 : 0.4 }} onPress={() => { if (!form.il) return; setIlceOpen(v => !v); setIlOpen(false); }}>
                  <Text style={{ fontSize: 14, color: form.ilce ? DS.ink[900] : DS.ink[400], flex: 1 }}>{form.ilce || (form.il ? 'Seçiniz' : 'Önce il seçin')}</Text>
                  {ilceOpen ? <ChevronUp size={14} color={DS.ink[400]} strokeWidth={1.8} /> : <ChevronDown size={14} color={DS.ink[400]} strokeWidth={1.8} />}
                </Pressable>
                {ilceOpen && <DropdownList items={ilceResults} selected={form.ilce} searchValue={ilceSearch} onSearch={setIlceSearch} searchPlaceholder="İlçe ara..." onSelect={selectIlce} accentColor={accentColor} />}
              </ModalField>
              <ModalField label="Adres" required last><TextInput style={inputBase} value={form.mahalle} onChangeText={v => set('mahalle', v)} placeholder="Örn: Moda Mahallesi" placeholderTextColor={DS.ink[400]} autoCapitalize="words" /></ModalField>
            </SectionCard>

            {/* e-Fatura */}
            <SectionCard title="e-Fatura Bilgileri">
              <ModalField label="VKN / TCKN"><TextInput style={inputBase} value={form.vkn} onChangeText={v => set('vkn', v.replace(/[^0-9]/g, ''))} placeholder="10 hane VKN veya 11 hane TCKN" placeholderTextColor={DS.ink[400]} keyboardType="number-pad" maxLength={11} /></ModalField>
              <ModalField label="Vergi Dairesi" last><TextInput style={inputBase} value={form.tax_office} onChangeText={v => set('tax_office', v)} placeholder="Örn: Kadıköy Vergi Dairesi" placeholderTextColor={DS.ink[400]} autoCapitalize="words" /></ModalField>
            </SectionCard>

            {/* Notlar */}
            <SectionCard title="Notlar">
              <TextInput style={{ ...inputBase, minHeight: 60, textAlignVertical: 'top' as any }} value={form.notes} onChangeText={v => set('notes', v)}
                placeholder="İsteğe bağlı notlar..." placeholderTextColor={DS.ink[400]} multiline numberOfLines={3} />
            </SectionCard>

            {/* Durum */}
            <SectionCard title="">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[700] }}>Aktif</Text>
                <AppSwitch value={form.is_active} onValueChange={v => set('is_active', v)} accentColor={accentColor} />
              </View>
            </SectionCard>

            {error ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(217,75,75,0.12)', borderRadius: R.sm, padding: 12 }}>
                <AlertCircle size={13} color="#9C2E2E" strokeWidth={1.8} />
                <Text style={{ fontSize: 13, color: '#9C2E2E', flex: 1 }}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable style={{ flex: 1, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center' }} onPress={onClose}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable style={{ flex: 2, paddingVertical: 10, borderRadius: R.pill, backgroundColor: DS.ink[900], alignItems: 'center', opacity: saving ? 0.6 : 1 }} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>{editingClinic ? 'Güncelle' : 'Ekle'}</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Doctor Modal ────────────────────────────────────────────────────
function DoctorModal({ visible, editingDoctor, clinics, defaultClinicId, accentColor, onClose, onSuccess }: {
  visible: boolean; editingDoctor: Doctor | null; clinics: Clinic[];
  defaultClinicId: string; accentColor: string; onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState<DoctorForm>(EMPTY_DOCTOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(editingDoctor ? { full_name: editingDoctor.full_name, phone: editingDoctor.phone ?? '', specialty: editingDoctor.specialty ?? '',
      notes: editingDoctor.notes ?? '', clinic_id: editingDoctor.clinic_id ?? '', is_active: editingDoctor.is_active, tckn: (editingDoctor as any).tckn ?? '' }
      : { ...EMPTY_DOCTOR, clinic_id: defaultClinicId });
    setError('');
  }, [editingDoctor, defaultClinicId, visible]);

  const set = (k: keyof DoctorForm, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.full_name.trim()) { setError('Ad Soyad zorunludur'); return; }
    const tcknTrim = form.tckn.trim();
    if (tcknTrim && tcknTrim.length !== 11) { setError('TCKN 11 hane olmalıdır'); return; }
    setSaving(true);
    try {
      const payload = { full_name: form.full_name.trim(), phone: form.phone.trim() || null, specialty: form.specialty.trim() || null,
        notes: form.notes.trim() || null, clinic_id: form.clinic_id || null, is_active: form.is_active, tckn: tcknTrim || null };
      const { error: err } = editingDoctor ? await updateDoctor(editingDoctor.id, payload) : await createDoctor(payload);
      if (err) { setError(err.message ?? 'Bir hata oluştu'); return; }
      onSuccess();
    } catch (e: any) { setError(e.message ?? 'Bir hata oluştu'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.3)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: R.xl, width: '100%', maxWidth: 460, maxHeight: '90%', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>{editingDoctor ? 'Hekim düzenle' : 'Yeni hekim'}</Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: R.sm, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <SectionCard title="Hekim Bilgileri">
              <ModalField label="Ad Soyad" required><TextInput style={inputBase} value={form.full_name} onChangeText={v => set('full_name', v)} placeholder="Örn: Dr. Ayşe Kaya" placeholderTextColor={DS.ink[400]} /></ModalField>
              <ModalField label="Uzmanlık"><TextInput style={inputBase} value={form.specialty} onChangeText={v => set('specialty', v)} placeholder="Örn: Ortodonti" placeholderTextColor={DS.ink[400]} /></ModalField>
              <ModalField label="Telefon"><TextInput style={inputBase} value={form.phone} onChangeText={v => set('phone', v)} placeholder="0555 000 00 00" placeholderTextColor={DS.ink[400]} keyboardType="phone-pad" /></ModalField>
              <ModalField label="TCKN (e-Arşiv için)"><TextInput style={inputBase} value={form.tckn} onChangeText={v => set('tckn', v.replace(/[^0-9]/g, ''))} placeholder="11 haneli TC Kimlik No" placeholderTextColor={DS.ink[400]} keyboardType="number-pad" maxLength={11} /></ModalField>
              <ModalField label="Klinik" last>
                <ClinicDropdown value={form.clinic_id} clinics={clinics} accentColor={accentColor} onChange={id => set('clinic_id', id)} />
              </ModalField>
            </SectionCard>
            <SectionCard title="Ek Bilgiler">
              <ModalField label="Notlar"><TextInput style={{ ...inputBase, minHeight: 60, textAlignVertical: 'top' as any }} value={form.notes} onChangeText={v => set('notes', v)} placeholder="İsteğe bağlı notlar..." placeholderTextColor={DS.ink[400]} multiline numberOfLines={3} /></ModalField>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[700] }}>Aktif</Text>
                <AppSwitch value={form.is_active} onValueChange={v => set('is_active', v)} accentColor={accentColor} />
              </View>
            </SectionCard>
            {error ? (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(217,75,75,0.12)', borderRadius: R.sm, padding: 12 }}><AlertCircle size={12} color="#9C2E2E" strokeWidth={1.8} /><Text style={{ fontSize: 12, color: '#9C2E2E', flex: 1 }}>{error}</Text></View>) : null}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable style={{ flex: 1, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center' }} onPress={onClose}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable style={{ flex: 2, paddingVertical: 10, borderRadius: R.pill, backgroundColor: DS.ink[900], alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 }} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : (<><Check size={14} color="#FFFFFF" strokeWidth={2} /><Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>{editingDoctor ? 'Güncelle' : 'Hekim Ekle'}</Text></>)}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Clinic Dropdown ─────────────────────────────────────────────────
function ClinicDropdown({ value, clinics, accentColor, onChange }: {
  value: string; clinics: Clinic[]; accentColor: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = clinics.find(c => c.id === value);
  return (
    <View>
      <Pressable style={{ ...inputBase, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: open ? DS.ink[900] : DS.ink[200] }} onPress={() => setOpen(v => !v)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Briefcase size={14} color={selected ? accentColor : DS.ink[400]} strokeWidth={1.8} />
          <Text style={{ fontSize: 14, color: selected ? DS.ink[900] : DS.ink[400], flex: 1 }} numberOfLines={1}>{selected ? selected.name : 'Klinik seçin...'}</Text>
        </View>
        {open ? <ChevronUp size={14} color={DS.ink[400]} strokeWidth={1.8} /> : <ChevronDown size={14} color={DS.ink[400]} strokeWidth={1.8} />}
      </Pressable>
      {open && (
        <View style={{ borderWidth: 1, borderColor: DS.ink[200], borderRadius: R.md, backgroundColor: '#FFFFFF', overflow: 'hidden', marginTop: 4 }}>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}
            onPress={() => { onChange(''); setOpen(false); }}>
            <MinusCircle size={13} color={DS.ink[400]} strokeWidth={1.8} />
            <Text style={{ flex: 1, fontSize: 14, color: !value ? accentColor : DS.ink[700], fontWeight: !value ? '600' : '400' }}>Seçilmedi</Text>
            {!value && <Check size={13} color={accentColor} strokeWidth={2} />}
          </Pressable>
          {clinics.map((c, i) => {
            const isSelected = value === c.id;
            return (
              <Pressable key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < clinics.length - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)', backgroundColor: isSelected ? accentColor + '08' : 'transparent' }}
                onPress={() => { onChange(c.id); setOpen(false); }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isSelected ? accentColor : DS.ink[300] }} />
                <Text style={{ flex: 1, fontSize: 14, color: isSelected ? accentColor : DS.ink[700], fontWeight: isSelected ? '600' : '400' }} numberOfLines={1}>{c.name}</Text>
                {isSelected && <Check size={13} color={accentColor} strokeWidth={2} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Discount Modal ──────────────────────────────────────────────────
function DiscountModal({ clinic, currentDiscount, onClose, onSaved }: {
  clinic: { id: string; name: string } | null; currentDiscount: number | null;
  onClose: () => void; onSaved: (clinicId: string, percent: number) => void;
}) {
  const [value, setValue] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (clinic) setValue(currentDiscount != null ? String(currentDiscount) : ''); }, [clinic, currentDiscount]);

  const handleSave = async () => {
    const pct = Number(value.replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast.error('İndirim oranı 0 ile 100 arasında olmalıdır.'); return; }
    if (!clinic) return;
    setSaving(true);
    const { error } = await supabase.from('clinic_discounts').upsert({ clinic_id: clinic.id, discount_percent: pct }, { onConflict: 'clinic_id' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onSaved(clinic.id, pct);
  };

  const handleRemove = async () => {
    if (!clinic) return;
    setSaving(true);
    await supabase.from('clinic_discounts').delete().eq('clinic_id', clinic.id);
    setSaving(false);
    onSaved(clinic.id, 0);
  };

  return (
    <Modal visible={!!clinic} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.3)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: R.xl, width: '100%', maxWidth: 380, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }}>
              <Percent size={16} color="#7C3AED" strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>Klinik İndirimi</Text>
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 1 }} numberOfLines={1}>{clinic?.name}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 28, height: 28, borderRadius: R.sm, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
              <X size={14} color={DS.ink[400]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <View style={{ padding: 20, gap: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 8 }}>İndirim Oranı (%)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: DS.ink[200], borderRadius: R.md, overflow: 'hidden' }}>
              <TextInput style={{ flex: 1, fontSize: 22, fontWeight: '800', color: DS.ink[900], paddingHorizontal: 16, paddingVertical: 12, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) } as any}
                value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="Örn: 10" placeholderTextColor={DS.ink[400]} maxLength={5} />
              <View style={{ paddingHorizontal: 16, borderLeftWidth: 1, borderLeftColor: DS.ink[200], backgroundColor: DS.ink[50] }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#7C3AED' }}>%</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: DS.ink[400], lineHeight: 17, marginTop: 6 }}>Bu oran yeni fatura oluştururken otomatik uygulanır.</Text>
            {currentDiscount != null && currentDiscount > 0 && (
              <Pressable onPress={handleRemove} disabled={saving} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: R.sm, backgroundColor: 'rgba(217,75,75,0.12)', alignSelf: 'flex-start' }}>
                <Trash2 size={12} color="#9C2E2E" strokeWidth={1.8} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#9C2E2E' }}>İndirimi Kaldır</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable style={{ flex: 1, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center' }} onPress={onClose} disabled={saving}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable style={{ flex: 2, paddingVertical: 10, borderRadius: R.pill, backgroundColor: '#7C3AED', alignItems: 'center', opacity: saving ? 0.5 : 1 }} onPress={handleSave} disabled={saving}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
