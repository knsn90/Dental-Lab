import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, Pressable,
  RefreshControl, useWindowDimensions, Animated, Easing,
} from 'react-native';
import { ClinicLogoPicker } from '../components/ClinicLogoPicker';
import { Search, X, SlidersHorizontal, Plus, Building2, Users, UserPlus, List, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Edit2, Trash2, Phone, Mail, MapPin, RefreshCw, UserX, AlertCircle, Check, Percent, MinusCircle, Briefcase, Stethoscope, Printer, Eye, EyeOff, Link2, Copy } from 'lucide-react-native';
import { buildWorkOrderFormHtml } from '../../orders/buildWorkOrderFormHtml';
import { useSegments } from 'expo-router';
import { LabConnectionsScreen } from '../../lab-connections/screens/LabConnectionsScreen';
import { labCreateInvite } from '../../lab-connections/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from '../../../core/ui/Toast';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { supabase } from '../../../core/api/supabase';
import { fetchClinics, createClinic, updateClinic, createDoctor, updateDoctor, fetchAllDoctors } from '../api';
import { ILLER, ILCELER } from '../data/turkey';
import { AppIcon } from '../../../core/ui/AppIcon';
import { DS } from '../../../core/theme/dsTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useColorThemeStore } from '../../../core/store/colorThemeStore';
import { titleCaseTR as titleCaseTRShared, normalizeDoctorName } from '../../../core/utils/textCase';
import { searchPlaces, getPlaceDetails, startPlaceSession, endPlaceSession, type PlaceSuggestion } from '../../auth/api/places';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';

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
  billing_mode?: 'per_order' | 'monthly_bulk' | null;
  default_payment_terms_days?: number | null;
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
  sokak: string; bina_no: string; posta_kodu: string;  // geocoding doğruluğu için
  contact_person: string; notes: string; is_active: boolean;
  vkn: string; tax_office: string;
  admin_email: string; admin_password: string;
  billing_mode: 'per_order' | 'monthly_bulk';
  default_payment_terms_days: string;  // input için string
};
type DoctorForm = {
  full_name: string; phone: string; specialty: string;
  notes: string; clinic_id: string; is_active: boolean;
  tckn: string;
  // Opsiyonel: doldurulursa hekim sisteme login olabilir
  email: string; password: string;
};

const EMPTY_CLINIC: ClinicForm = {
  name: '', category: 'klinik', phone: '', email: '',
  il: '', ilce: '', mahalle: '', sokak: '', bina_no: '', posta_kodu: '',
  contact_person: '', notes: '', is_active: true,
  vkn: '', tax_office: '', admin_email: '', admin_password: '',
  billing_mode: 'monthly_bulk', default_payment_terms_days: '30',
};
const EMPTY_DOCTOR: DoctorForm = { full_name: '', phone: '', specialty: '', notes: '', clinic_id: '', is_active: true, tckn: '', email: '', password: '' };

interface ParsedAddress {
  il: string; ilce: string; mahalle: string;
  sokak: string; bina_no: string; posta_kodu: string;
}
function parseAddress(raw?: string | null): ParsedAddress {
  const empty: ParsedAddress = { il: '', ilce: '', mahalle: '', sokak: '', bina_no: '', posta_kodu: '' };
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') {
      return {
        il:         p.il ?? '',
        ilce:       p.ilce ?? '',
        mahalle:    p.mahalle ?? '',
        sokak:      p.sokak ?? '',
        bina_no:    p.bina_no ?? '',
        posta_kodu: p.posta_kodu ?? '',
      };
    }
  } catch {}
  return { ...empty, mahalle: raw };
}

function formatAddress(a: ParsedAddress): string {
  const street = [a.sokak, a.bina_no].filter(Boolean).join(' No: ').trim();
  const parts = [
    a.mahalle && `${a.mahalle}`,
    street,
    a.posta_kodu,
    a.ilce,
    a.il,
  ].filter(Boolean);
  return parts.join(', ');
}

const TAB_FILTERS = [
  { key: 'all',         label: 'Tümü' },
  { key: 'klinik',      label: 'Klinik' },
  { key: 'poliklinik',  label: 'Poliklinik' },
  { key: 'hastane',     label: 'Hastane' },
  { key: 'laboratuvar', label: 'Laboratuvar' },
  { key: 'doctors',     label: 'Hekimler' },
  { key: 'managers',    label: 'Yöneticiler' },
  { key: 'connections', label: 'Bağlantılar' },
];

// ═════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════
interface Props { accentColor?: string; }

export default function ClinicsScreen({ accentColor: accentColorProp }: Props) {
  const rtl = isRTL();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const isNarrow = width < 560;
  const segments = useSegments() as string[];
  const panelType = (segments?.[0] ?? '') === '(admin)' ? 'admin' : 'lab';
  const { getTheme } = useColorThemeStore();
  const accentColor = accentColorProp ?? getTheme(panelType).primary;
  const T = useMobileTokens();
  // SlideTabBar cursor'ı beyaz metin basar → koyu ink şart (panel `primary`si
  // lab'da safran sarısı, beyazla okunmaz).
  const panel = usePanelTheme();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  // localStorage cache — 2. ziyarette anında render, arka planda taze veri.
  const LS_CACHE_KEY = 'clinics_screen_cache_v1';
  const loadLs = () => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(LS_CACHE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveLs = (data: { clinics: Clinic[]; doctors: Doctor[]; discountMap: Record<string, number>; managers: any[] }) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(LS_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
  };
  const initial = loadLs();

  const [clinics, setClinics]   = useState<Clinic[]>(initial?.clinics ?? []);
  const [doctors, setDoctors]   = useState<Doctor[]>(initial?.doctors ?? []);
  const [loading, setLoading]   = useState(initial === null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search,   setSearch]   = useState('');

  const [showClinicModal,   setShowClinicModal]   = useState(false);
  const [editingClinic,     setEditingClinic]     = useState<Clinic | null>(null);
  const [discountClinic,    setDiscountClinic]    = useState<Clinic | null>(null);
  const [discountMap,       setDiscountMap]       = useState<Record<string, number>>(initial?.discountMap ?? {});

  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [editingDoctor,   setEditingDoctor]   = useState<Doctor | null>(null);
  const [defaultClinicId, setDefaultClinicId] = useState('');

  const [activeTab,       setActiveTab]       = useState<'all' | ClinicCategory | 'doctors' | 'managers' | 'connections'>('all');
  // "Bağlantı gönder" CTA — tek kullanımlık davet kodu üret + kopyala
  const [inviteOpen,   setInviteOpen]   = useState(false);
  const [inviteCode,   setInviteCode]   = useState<string | null>(null);
  const [inviteBusy,   setInviteBusy]   = useState(false);
  const [inviteErr,    setInviteErr]    = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const sendInvite = useCallback(async () => {
    setInviteOpen(true); setInviteBusy(true); setInviteErr(null); setInviteCode(null); setInviteCopied(false);
    try { setInviteCode(await labCreateInvite()); }
    catch (e: any) { setInviteErr(e?.message ?? autoT('Davet kodu üretilemedi')); }
    finally { setInviteBusy(false); }
  }, []);

  const copyInvite = useCallback(() => {
    if (!inviteCode) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      (navigator as any).clipboard.writeText(inviteCode).catch(() => {});
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1500);
    }
  }, [inviteCode]);
  const [managers,        setManagers]        = useState<any[]>(initial?.managers ?? []);
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
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [clinicsRes, doctorsRes, discountsRes, managersRes] = await Promise.all([
      fetchClinics(),
      fetchAllDoctors(), // doctors + profiles(user_type='doctor') birlesik
      supabase.from('clinic_discounts').select('clinic_id, discount_rate'),
      supabase
        .from('profiles')
        .select('id, full_name, phone, email, clinic_id, is_active, user_type, clinic:clinics(id, name)')
        .in('user_type', ['clinic_admin', 'clinic_secretary'])
        .order('full_name'),
    ]);
    const cs = (!clinicsRes.error && clinicsRes.data) ? (clinicsRes.data as Clinic[]) : clinics;
    const ds = (!doctorsRes.error && doctorsRes.data) ? (doctorsRes.data as Doctor[]) : doctors;
    const ms = (!managersRes.error && managersRes.data) ? (managersRes.data as any[]) : managers;
    let dm = discountMap;
    if (!discountsRes.error && discountsRes.data) {
      dm = {};
      (discountsRes.data as any[]).forEach(r => { dm[r.clinic_id] = Number(r.discount_rate); });
    }
    setClinics(cs);
    setDoctors(ds);
    setManagers(ms);
    setDiscountMap(dm);
    saveLs({ clinics: cs, doctors: ds, discountMap: dm, managers: ms });
    if (!silent) setLoading(false);
  }, [clinics, doctors, managers, discountMap]);

  useEffect(() => { loadData(initial !== null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──
  const toggleExpand = (id: string) =>
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const handleToggleClinic = async (clinic: Clinic) => {
    const val = !clinic.is_active;
    await updateClinic(clinic.id, { is_active: val });
    setClinics(prev => prev.map(c => c.id === clinic.id ? { ...c, is_active: val } : c));
  };

  const handlePrintClinicForm = async (clinic: Clinic) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Lab letterhead
    let lab: any = { name: 'Laboratuvar' };
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('lab_id').eq('id', user.id).single();
        const labId = (prof as any)?.lab_id;
        if (labId) {
          const { data } = await supabase
            .from('labs')
            .select('name, address, phone, logo_url')
            .eq('id', labId)
            .single();
          if (data) {
            lab = {
              name: data.name ?? 'Laboratuvar',
              logoUrl: (data as any).logo_url,
              address: data.address,
              phone: data.phone,
            };
          }
        }
      }
    } catch { /* fallback */ }

    // Hekimler + labın hizmet kataloğu — formdaki kutular bunlardan üretilir.
    // Katalog gelmezse şablon jenerik listeye düşer (form yine basılır).
    let formDoctors: Array<{ name: string }> = [];
    let formServices: Array<{ name: string; category?: string | null }> = [];
    try {
      const [docsRes, svcRes] = await Promise.all([
        supabase.from('doctors').select('full_name').eq('clinic_id', clinic.id).order('full_name'),
        supabase.from('lab_services').select('name, category, sort_order').eq('is_active', true).order('category').order('sort_order'),
      ]);
      formDoctors = ((docsRes.data ?? []) as any[])
        .map(d => ({ name: String(d.full_name ?? '').trim() }))
        .filter(d => d.name);
      formServices = ((svcRes.data ?? []) as any[])
        .map(s => ({ name: String(s.name ?? '').trim(), category: s.category ?? null }))
        .filter(s => s.name);
    } catch { /* katalog okunamazsa form yine basılsın */ }

    // Diş şeması path verisi ~30 KB — dinamik import, klinik ekranının
    // paketine girmesin. Gelmezse şablon kutu ızgarasına düşer.
    let toothPaths: Record<number, string[]> | undefined;
    let toothLabelPos: Record<number, [number, number]> | undefined;
    try {
      const mod = await import('../../orders/assets/toothPaths');
      toothPaths = mod.TOOTH_PATHS;
      toothLabelPos = mod.TOOTH_LABEL_POS;
    } catch { /* şema olmadan da form basılır */ }

    const html = buildWorkOrderFormHtml({
      clinic: { id: clinic.id, name: clinic.name, address: clinic.address, phone: clinic.phone },
      lab,
      doctors: formDoctors,
      services: formServices,
      toothPaths,
      toothLabelPos,
      copies: 2,
    });
    const w = window.open('', '_blank', 'width=900,height=1100');
    if (!w) { toast.error(autoT('Pop-up engellendi.')); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const handleDeleteClinic = async (clinic: Clinic) => {
    // Web'de Alert.alert "destructive" butonu güvenilir çalışmıyor → window.confirm
    const confirmed = Platform.OS === 'web'
      ? (typeof window !== 'undefined' && window.confirm(`"${clinic.name}" ${autoT('kliniğini silmek istiyor musunuz?')}`))
      : await new Promise<boolean>(resolve => {
          Alert.alert(autoT('Klinik Sil'), `"${clinic.name}" ${autoT('kliniğini silmek istiyor musunuz?')}`, [
            { text: autoT('İptal'), style: 'cancel', onPress: () => resolve(false) },
            { text: autoT('Sil'), style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirmed) return;

    const { error } = await supabase.from('clinics').delete().eq('id', clinic.id);
    if (!error) {
      setClinics(prev => prev.filter(c => c.id !== clinic.id));
      toast.success(autoT('Klinik silindi'));
      return;
    }
    // FK constraint hata mesajları — kullanıcıya net bilgi ver
    const msg = error.message || '';
    if (/foreign key|violates|referenced/i.test(msg)) {
      toast.error(autoT('Bu kliniğe bağlı sipariş/hekim var. Önce onları silin veya pasife alın.'));
    } else if (/permission|denied|rls|policy/i.test(msg)) {
      toast.error(autoT('Silme yetkiniz yok.'));
    } else {
      toast.error(autoT('Klinik silinemedi') + ': ' + msg);
    }
  };

  const handleToggleDoctor = async (doctor: Doctor) => {
    const val = !doctor.is_active;
    await updateDoctor(doctor.id, { is_active: val });
    setDoctors(prev => prev.map(d => d.id === doctor.id ? { ...d, is_active: val } : d));
  };

  const handleDeleteDoctor = async (doctor: Doctor) => {
    const confirmed = Platform.OS === 'web'
      ? (typeof window !== 'undefined' && window.confirm(`"${doctor.full_name}" ${autoT('adlı hekimi silmek istiyor musunuz?')}`))
      : await new Promise<boolean>(resolve => {
          Alert.alert(autoT('Hekim Sil'), `"${doctor.full_name}" ${autoT('adlı hekimi silmek istiyor musunuz?')}`, [
            { text: autoT('İptal'), style: 'cancel', onPress: () => resolve(false) },
            { text: autoT('Sil'), style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirmed) return;

    const { error } = await supabase.from('doctors').delete().eq('id', doctor.id);
    if (!error) {
      setDoctors(prev => prev.filter(d => d.id !== doctor.id));
      toast.success(autoT('Hekim silindi'));
      return;
    }
    const msg = error.message || '';
    if (/foreign key|violates|referenced/i.test(msg)) {
      toast.error(autoT('Bu hekime bağlı sipariş var. Önce siparişleri kontrol edin veya hekimi pasife alın.'));
    } else if (/permission|denied|rls|policy/i.test(msg)) {
      toast.error(autoT('Silme yetkiniz yok.'));
    } else {
      toast.error(autoT('Hekim silinemedi') + ': ' + msg);
    }
  };

  const openAddDoctor = (clinicId = '') => { setEditingDoctor(null); setDefaultClinicId(clinicId); setShowDoctorModal(true); };
  const openEditDoctor = (doctor: Doctor) => { setEditingDoctor(doctor); setDefaultClinicId(doctor.clinic_id ?? ''); setShowDoctorModal(true); };

  const getDoctorsByClinic = (clinicId: string) => doctors.filter(d => d.clinic_id === clinicId);
  const getMembersByClinic = (clinicId: string) => managers.filter(m => m.clinic_id === clinicId);
  const unassigned = doctors.filter(d => !d.clinic_id);

  // ── Derived ──
  const q = search.trim().toLowerCase();
  const activeFilterCount = (categoryFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);
  const [draftCategory, setDraftCategory] = useState<ClinicCategory | 'all'>('all');
  const [draftStatus,   setDraftStatus]   = useState<'all' | 'active' | 'inactive'>('all');

  const openFilter = () => { setDraftCategory(categoryFilter); setDraftStatus(statusFilter); setShowFilterSheet(true); };
  const applyFilter = () => { setCategoryFilter(draftCategory); setStatusFilter(draftStatus); setShowFilterSheet(false); };

  const filteredClinics = useMemo(() => clinics.filter(c => {
    if (activeTab !== 'all' && activeTab !== 'doctors' && activeTab !== 'managers' && (c.category ?? 'klinik') !== activeTab) return false;
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
    <View className="flex-1" style={{ backgroundColor: T.bg }}>

      <MobilePageTitle title="Sağlık Kurumları" subtitle="Klinikler ve hekimler" />

      {/* ── Filter Bar — 2 satır (tabs üstte, aksiyonlar altta) ─── */}
      <View className="px-4 pb-2" style={{ paddingTop: isDesktop ? 12 : 4, gap: 10 }}>
        {/* Row 1: Tabs — horizontal scroll; ScrollView dikey büyümesin */}
        {/* Onaylar / Kullanıcılar / Kayıtlar ile AYNI bileşen (SlideTabBar).
            Buradaki elle yazılmış gri raylı şerit görsel olarak yakındı ama
            kayan cursor'ı yoktu ve sayaç tipografisi ayrı yoldan geliyordu.
            8 sekme dar ekrana sığmadığı için yatay kaydırma korunuyor. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          <SlideTabBar
            items={TAB_FILTERS.map(f => ({ key: f.key, label: autoT(f.label), count: tabCounts[f.key] }))}
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as any)}
            accentColor={panel.accent}
            style={rtl ? { marginRight: -4 } : { marginLeft: -4 }}
          />
        </ScrollView>

        {/* Row 2: Actions — Ara / Filtrele / Kurum (her zaman 36px, kompakt).
            Bağlantılar sekmesi klinik listesi değil → arama/filtre/ekle gizlenir. */}
        {activeTab !== 'connections' && (
        <View className="flex-row items-center gap-2">
          {/* Search — daima açık, sol-hizalı, sabit yükseklik */}
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              height: 36,
              paddingHorizontal: 12,
              borderRadius: 9999,
              backgroundColor: T.card,
              borderWidth: 1,
              borderColor: T.hairline,
            }}
          >
            <Search size={13} color={T.ink3} strokeWidth={1.8} />
            <TextInput
              style={{
                flex: 1,
                fontSize: 13,
                color: T.ink,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              }}
              value={search}
              onChangeText={setSearch}
              placeholder={activeTab === 'doctors' ? 'Hekim ara...' : activeTab === 'managers' ? 'Yönetici ara...' : 'Klinik ara...'}
              placeholderTextColor={T.ink3}
              returnKeyType="search"
            />
            {!!search && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <X size={12} color={T.ink3} strokeWidth={1.8} />
              </Pressable>
            )}
          </View>

          {/* Filter — 36px height */}
          {activeTab !== 'doctors' && (
            <Pressable
              onPress={openFilter}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 36, paddingHorizontal: 12, borderRadius: 9999,
                borderWidth: 1,
                borderColor: activeFilterCount > 0 ? T.ink : T.hairline,
                backgroundColor: activeFilterCount > 0 ? T.cardSoft : T.card,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <SlidersHorizontal size={13} color={activeFilterCount > 0 ? T.ink : T.ink2} strokeWidth={1.8} />
              {!isNarrow && (
                <Text style={{ fontSize: 12, fontWeight: '600', color: activeFilterCount > 0 ? T.ink : T.ink2 }}>
                  Filtrele{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </Text>
              )}
              {isNarrow && activeFilterCount > 0 && (
                <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink }}>{activeFilterCount}</Text>
              )}
            </Pressable>
          )}

          {/* Bağlantı gönder — tek kullanımlık davet kodu üret, kliniğe ilet.
              Klinik kodu girince bu lab'a anında bağlanır (Bağlantılar sekmesi = tam yönetim). */}
          <Pressable
            onPress={sendInvite}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              height: 36, paddingHorizontal: 14, borderRadius: 9999,
              backgroundColor: hovered ? T.bgDeep : T.card,
              borderWidth: 1, borderColor: T.hairline,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Link2 size={13} color={T.ink} strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: T.ink }}>
              {isNarrow ? '' : 'Bağlantı gönder'}
            </Text>
          </Pressable>

          {/* Add clinic — 36px height */}
          <Pressable
            onPress={() => { setEditingClinic(null); setShowClinicModal(true); }}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              height: 36, paddingHorizontal: 14, borderRadius: 9999,
              backgroundColor: hovered ? '#1F2937' : '#0A0A0A',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Plus size={13} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
              {isNarrow ? '' : 'Kurum'}
            </Text>
          </Pressable>
        </View>
        )}
      </View>

      {/* ── Content ──────────────────────────────────────────────── */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: isDesktop ? 24 : 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor="#0A0A0A" />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'connections' ? (
          /* Klinik bağlantıları — davet kodu / public kod / bekleyen istekler.
             Eskiden ayrı sidebar sayfasıydı; artık Sağlık Kurumları sekmesi. */
          <LabConnectionsScreen embedded />
        ) : loading && clinics.length === 0 ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="#0A0A0A" />
            <Text className="text-[13px] text-ink-400 mt-3">Yükleniyor…</Text>
          </View>
        ) : (
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 20 : 16, alignItems: isDesktop ? 'flex-start' : 'stretch' }}>

            {/* ── Main Column ── */}
            <View style={{ flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: 0, gap: 12 }}>

              {/* KPI strip — mobilde 2x2 grid, masaüstünde row */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isDesktop ? 10 : 8 }}>
                {CLINIC_CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.value}
                    onPress={() => setActiveTab(cat.value)}
                    style={{
                      ...CARD,
                      backgroundColor: T.card,
                      flex: isDesktop ? 1 : undefined,
                      width: isDesktop ? undefined : '48%',
                      minWidth: isDesktop ? 170 : 0,
                      padding: isDesktop ? 16 : 10,
                      borderRadius: isDesktop ? 24 : 14,
                      borderColor: activeTab === cat.value ? cat.color : T.hairline,
                      borderWidth: activeTab === cat.value ? 1.5 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: isDesktop ? 10 : 4 }}>
                      <View style={{ width: isDesktop ? 26 : 20, height: isDesktop ? 26 : 20, borderRadius: R.sm, backgroundColor: cat.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <AppIcon name={cat.icon as any} size={isDesktop ? 13 : 11} color={cat.color} />
                      </View>
                      <Text style={{ fontSize: isDesktop ? 11 : 10, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase', color: T.ink3 }} numberOfLines={1}>{autoT(cat.label)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <Text style={{ ...DISPLAY, fontSize: isDesktop ? 28 : 20, letterSpacing: -0.4, color: T.ink }}>{categoryCounts[cat.value] ?? 0}</Text>
                      <Text style={{ fontSize: 10, color: T.ink3 }}>
                        / {clinics.filter(c => (c.category ?? 'klinik') === cat.value && c.is_active).length} aktif
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>

              {/* Content card */}
              {activeTab === 'managers' ? (
                <ManagersList
                  managers={(() => {
                    // 1) Gercek yoneticiler (clinic_admin)
                    const real = managers.map((m: any) => ({ ...m, isFallback: false }));
                    const clinicIdsWithAdmin = new Set(real.map((m: any) => m.clinic_id).filter(Boolean));

                    // 2) Yonetici olmayan kliniklerin ilk hekimini gecici yetkili olarak ekle
                    const fallbackManagers: any[] = [];
                    clinics.forEach((c: any) => {
                      if (clinicIdsWithAdmin.has(c.id)) return;
                      const firstDoctor = doctors
                        .filter((d: any) => d.clinic_id === c.id && d.is_active !== false)
                        .sort((a: any, b: any) => (a.full_name || '').localeCompare(b.full_name || '', 'tr'))[0];
                      if (firstDoctor) {
                        fallbackManagers.push({
                          id: `fallback:${firstDoctor.id}`,
                          full_name: firstDoctor.full_name,
                          phone: firstDoctor.phone,
                          clinic_id: c.id,
                          clinic: { id: c.id, name: c.name },
                          is_active: true,
                          isFallback: true,
                        });
                      }
                    });

                    const all = [...real, ...fallbackManagers];
                    if (!q) return all;
                    return all.filter((m: any) =>
                      (m.full_name || '').toLowerCase().includes(q) ||
                      (m.clinic?.name || '').toLowerCase().includes(q)
                    );
                  })()}
                  accentColor={accentColor}
                />
              ) : activeTab === 'doctors' ? (
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
                      members={getMembersByClinic(clinic.id)}
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
                      onPrintForm={() => handlePrintClinicForm(clinic)}
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
                              <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800] }}>{autoT(cat.label)}</Text>
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
      {/* Bağlantı gönder — üretilen davet kodunu kliniğe ilet */}
      <Modal visible={inviteOpen} transparent animationType="fade" onRequestClose={() => setInviteOpen(false)}>
        <Pressable onPress={() => setInviteOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 440, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Link2 size={18} color={DS.ink[900]} strokeWidth={2} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: DS.ink[900] }}>Bağlantı gönder</Text>
            </View>
            <Text style={{ fontSize: 12.5, color: DS.ink[500], lineHeight: 18 }}>
              Bu kodu kliniğe ilet. Klinik uygulamada kodu girince laboratuvarınıza anında bağlanır
              (onay gerekmez). Kod 7 gün geçerli ve tek kullanımlıktır.
            </Text>

            {inviteBusy ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color={DS.ink[900]} />
              </View>
            ) : inviteErr ? (
              <Text style={{ fontSize: 13, color: '#DC2626' }}>{inviteErr}</Text>
            ) : inviteCode ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Text selectable style={{ flex: 1, fontSize: 24, fontWeight: '800', letterSpacing: 3, color: DS.ink[900], textAlign: rtl ? 'right' : undefined, fontFamily: Platform.OS === 'web' ? 'JetBrains Mono, monospace' : undefined }}>
                  {inviteCode}
                </Text>
                <Pressable onPress={copyInvite}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  {inviteCopied ? <Check size={14} color="#059669" strokeWidth={2.2} /> : <Copy size={14} color={DS.ink[500]} strokeWidth={1.9} />}
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: inviteCopied ? '#059669' : DS.ink[500] }}>
                    {inviteCopied ? 'Kopyalandı' : 'Kopyala'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Pressable onPress={() => { setInviteOpen(false); setActiveTab('connections'); }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: accentColor }}>Tüm bağlantılar →</Text>
              </Pressable>
              <Pressable onPress={() => setInviteOpen(false)} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: DS.ink[900] }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Kapat</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
  const rtl = isRTL();
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
        position: 'absolute', top: -20, ...(rtl ? { left: -20 } : { right: -20 }),
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#FFFFFF',
        opacity: glowOpacity,
      }} pointerEvents="none" />
      <Animated.View style={{
        position: 'absolute', bottom: -30, ...(rtl ? { right: -10 } : { left: -10 }),
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
      <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 6 }}>{hasSearch ? `"${search}" ${autoT('ile eşleşen kayıt yok')}` : 'İlk kliniği ekleyerek başlayın'}</Text>
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
  const rtl = isRTL();
  const align = rtl ? ('right' as const) : undefined;
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
      <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 6 }}>{search ? `"${search}" ${autoT('ile eşleşen hekim yok')}` : 'İlk hekimi ekleyerek başlayın'}</Text>
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
        <Text style={{ flex: 2.8, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: align }}>HEKİM</Text>
        <Text style={{ flex: 1.5, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: align }}>UZMANLIK</Text>
        <Text style={{ flex: 1.8, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: align }}>KLİNİK</Text>
        <Text style={{ flex: 1.4, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: align }}>TELEFON</Text>
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
                <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900], textAlign: align }} numberOfLines={1}>{d.full_name}</Text>
                {!d.is_active && (
                  <View style={{ backgroundColor: 'rgba(217,75,75,0.12)', borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#9C2E2E', letterSpacing: 0.5 }}>PASİF</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={{ flex: 1.5, fontSize: 13, color: d.specialty ? DS.ink[700] : DS.ink[400], textAlign: align }} numberOfLines={1}>{d.specialty || '—'}</Text>
            <Text style={{ flex: 1.8, fontSize: 13, color: clinicName ? DS.ink[700] : DS.ink[400], textAlign: align }} numberOfLines={1}>{clinicName ?? '—'}</Text>
            <Text style={{ flex: 1.4, fontSize: 13, color: d.phone ? DS.ink[700] : DS.ink[400], textAlign: align }} numberOfLines={1}>{d.phone ?? '—'}</Text>
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
interface ClinicMember {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  clinic_id?: string | null;
  user_type: 'clinic_admin' | 'clinic_secretary';
  is_active?: boolean;
}

function ClinicRow({
  clinic, doctors, members = [], isExpanded, accentColor, discountPercent,
  onToggleExpand, onToggleClinic, onEditClinic, onDeleteClinic,
  onSetDiscount, onAddDoctor, onToggleDoctor, onEditDoctor, onDeleteDoctor,
  onPrintForm,
}: {
  clinic: Clinic; doctors: Doctor[]; members?: ClinicMember[]; isExpanded: boolean; accentColor: string;
  discountPercent: number | null;
  onToggleExpand: () => void; onToggleClinic: () => void;
  onEditClinic: () => void; onDeleteClinic: () => void;
  onSetDiscount: () => void; onAddDoctor: () => void;
  onToggleDoctor: (d: Doctor) => void; onEditDoctor: (d: Doctor) => void; onDeleteDoctor: (d: Doctor) => void;
  onPrintForm: () => void;
}) {
  const rtl = isRTL();
  const cat = CLINIC_CATEGORIES.find(c => c.value === (clinic.category ?? 'klinik')) ?? CLINIC_CATEGORIES[0];
  const primaryDoctor = doctors[0];
  const extraDoctors  = Math.max(0, doctors.length - 1);

  const { width: _vw } = useWindowDimensions();
  const isNarrow = _vw < 560;
  return (
    <View style={{ ...CARD, padding: isNarrow ? 12 : 18, borderRadius: isNarrow ? 14 : R.xl, opacity: clinic.is_active ? 1 : 0.7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: isNarrow ? 10 : 14 }}>
        {/* Icon — logo varsa logo, yoksa kategori ikonu */}
        <View style={{ width: isNarrow ? 36 : 48, height: isNarrow ? 36 : 48, borderRadius: R.md, overflow: 'hidden', backgroundColor: (clinic as any).logo_url ? '#FFFFFF' : (clinic.is_active ? cat.bg : DS.ink[100]), borderWidth: (clinic as any).logo_url ? 1 : 0, borderColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {(clinic as any).logo_url ? (
            <Image source={{ uri: (clinic as any).logo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <AppIcon name={cat.icon as any} size={isNarrow ? 16 : 22} color={clinic.is_active ? cat.color : DS.ink[400]} />
          )}
        </View>

        {/* Content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <View style={{ borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: clinic.is_active ? cat.bg : DS.ink[100] }}>
              <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: clinic.is_active ? cat.color : DS.ink[400] }}>{autoT(cat.label)}</Text>
            </View>
            {!clinic.is_active && (
              <View style={{ backgroundColor: 'rgba(217,75,75,0.12)', borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#9C2E2E', letterSpacing: 0.5 }}>PASİF</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: isNarrow ? 14 : 16, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.2, lineHeight: isNarrow ? 18 : 21, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{clinic.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <Users size={11} color={DS.ink[400]} strokeWidth={1.8} />
            <Text style={{ fontSize: 11, color: DS.ink[500], flex: 1 }} numberOfLines={1}>
              {primaryDoctor
                ? (extraDoctors > 0 ? `${primaryDoctor.full_name} · +${extraDoctors}` : primaryDoctor.full_name)
                : (clinic.contact_person || 'Henüz hekim eklenmemiş')}
            </Text>
          </View>
        </View>

        {/* Actions */}
        {clinic.is_active ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Pressable
              style={{ width: 32, height: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' }}
              onPress={onPrintForm}
              accessibilityLabel={autoT('Klinik için iş emri formu yazdır')}
            >
              <Printer size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
            <Pressable style={{ width: 32, height: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' }} onPress={onEditClinic}>
              <Edit2 size={14} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
            <Pressable style={{ width: 32, height: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' }} onPress={onDeleteClinic}>
              <Trash2 size={14} color="#9C2E2E" strokeWidth={1.8} />
            </Pressable>
            <Pressable style={{ width: 34, height: 34, borderRadius: 17, ...(rtl ? { marginRight: 4 } : { marginLeft: 4 }), alignItems: 'center', justifyContent: 'center', backgroundColor: isExpanded ? accentColor + '14' : DS.ink[100] }} onPress={onToggleExpand}>
              {isExpanded
                ? <ChevronUp size={16} color={accentColor} strokeWidth={1.8} />
                : rtl
                  ? <ChevronLeft size={16} color={DS.ink[500]} strokeWidth={1.8} />
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
                const display = formatAddress(a);
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

          {members.length > 0 && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textTransform: 'uppercase' }}>
                  Yönetici & Sekreter
                </Text>
                <Text style={{ fontSize: 10, color: DS.ink[400] }}>{members.length} kişi</Text>
              </View>
              <View style={{ backgroundColor: DS.ink[50], borderRadius: R.md, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
                {members.map((m, i) => (
                  <ClinicMemberRow key={m.id} member={m} isLast={i === members.length - 1} />
                ))}
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Pressable onPress={onAddDoctor} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 }}>
              <UserPlus size={13} color={accentColor} strokeWidth={1.8} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>Bu kliniğe hekim ekle</Text>
            </Pressable>
            <Pressable onPress={onSetDiscount} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.sm, backgroundColor: '#EDE9FE', ...(rtl ? { marginRight: 4 } : { marginLeft: 4 }) }}>
              <Percent size={12} color="#7C3AED" strokeWidth={1.8} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#7C3AED' }}>{discountPercent != null && discountPercent > 0 ? `%${discountPercent} ${autoT('İndirim')}` : 'İndirim Ekle'}</Text>
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
  const rtl = isRTL();
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
        <Text style={{ fontSize: 13, fontWeight: '600', color: doctor.is_active ? DS.ink[900] : DS.ink[400], textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{doctor.full_name}</Text>
        {(doctor.specialty || doctor.phone) && (
          <Text style={{ fontSize: 11, color: DS.ink[400], textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{[doctor.specialty, doctor.phone].filter(Boolean).join(' · ')}</Text>
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

// ─── Clinic Member Row (Yönetici / Sekreter) ─────────────────────────
function ClinicMemberRow({ member, isLast }: { member: ClinicMember; isLast?: boolean }) {
  const rtl = isRTL();
  const isAdmin = member.user_type === 'clinic_admin';
  const accent  = isAdmin ? '#6BA888' : '#7C3AED';
  const label   = autoT(isAdmin ? 'Yönetici' : 'Sekreter');
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 11,
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: 'rgba(0,0,0,0.04)',
      opacity: member.is_active === false ? 0.55 : 1,
    }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: `${accent}1A`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{(member.full_name || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900], textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{member.full_name}</Text>
        {(member.email || member.phone) && (
          <Text style={{ fontSize: 11, color: DS.ink[400], textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{[member.email, member.phone].filter(Boolean).join(' · ')}</Text>
        )}
      </View>
      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: `${accent}1A` }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: accent }}>{label.toUpperCase()}</Text>
      </View>
      {member.is_active === false && (
        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.06)' }}>
          <Text style={{ fontSize: 9, color: DS.ink[500], fontWeight: '600' }}>PASİF</Text>
        </View>
      )}
    </View>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  const rtl = isRTL();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon}
      <Text style={{ fontSize: 12, color: DS.ink[500], flex: 1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{text}</Text>
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
  const rtl = isRTL();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.2)', alignItems: 'flex-end', paddingTop: 116, ...(rtl ? { paddingLeft: 16 } : { paddingRight: 16 }) }} activeOpacity={1} onPress={onClose}>
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
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>{autoT(item.label)}</Text>
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
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>{autoT(item.label)}</Text>
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
function ModalField({ label, required, last, hint, children }: { label: string; required?: boolean; last?: boolean; hint?: string; children: React.ReactNode }) {
  const T = useMobileTokens();
  return (
    <View style={{ marginBottom: last ? 0 : 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '500', color: T.ink3, marginBottom: 7, letterSpacing: 0.5 }}>
        {required && <Text style={{ color: '#9C2E2E' }}>* </Text>}{label}
      </Text>
      {children}
      {hint && (
        <Text style={{ fontSize: 10.5, color: T.ink3, marginTop: 5, fontStyle: 'italic' }}>
          {hint}
        </Text>
      )}
    </View>
  );
}

// ─── PasswordField — şifre input'u + göz ikonu (gizle/göster) ─────────
function PasswordField({ value, onChange, placeholder, inputStyle }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputStyle: any;
}) {
  const [visible, setVisible] = useState(false);
  const rtl = isRTL();
  const T = useMobileTokens();
  return (
    <View style={{ position: 'relative' }}>
      <TextInput
        style={{ ...inputStyle, ...(rtl ? { paddingLeft: 42 } : { paddingRight: 42 }) }}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={DS.ink[400]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        onPress={() => setVisible(v => !v)}
        style={{
          position: 'absolute',
          ...(rtl ? { left: 6 } : { right: 6 }), top: 0, bottom: 0,
          width: 36,
          alignItems: 'center', justifyContent: 'center',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        }}
        accessibilityLabel={visible ? autoT('Şifreyi gizle') : autoT('Şifreyi göster')}
      >
        {visible
          ? <EyeOff size={16} color={T.ink3} strokeWidth={1.8} />
          : <Eye size={16} color={T.ink3} strokeWidth={1.8} />}
      </Pressable>
    </View>
  );
}

function DropdownList({ items, selected, searchValue, onSearch, searchPlaceholder, onSelect, accentColor }: {
  items: string[]; selected: string; searchValue: string; onSearch: (v: string) => void;
  searchPlaceholder: string; onSelect: (v: string) => void; accentColor: string;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{ borderWidth: 1, borderColor: T.hairline, borderRadius: R.md, backgroundColor: T.cardSoft, marginTop: 4, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
        <Search size={14} color={T.ink3} strokeWidth={1.8} />
        <TextInput style={{ flex: 1, fontSize: 13, color: T.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) } as any}
          value={searchValue} onChangeText={onSearch} placeholder={searchPlaceholder} placeholderTextColor={T.ink3} autoFocus />
      </View>
      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="always">
        {items.map((item, i) => (
          <Pressable key={item} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: T.hairline2, backgroundColor: selected === item ? (isDark ? 'rgba(255,255,255,0.06)' : DS.ink[100]) : 'transparent' }}
            onPress={() => onSelect(item)}>
            <Text style={{ fontSize: 14, color: selected === item ? accentColor : T.ink, fontWeight: selected === item ? '600' : '400' }}>{item}</Text>
            {selected === item && <Check size={14} color={accentColor} strokeWidth={2} />}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Section Card (modal içi) — transparent fill, ince stroke ile ayrılır ─
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{
      backgroundColor: 'transparent',
      borderRadius: R.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : T.hairline,
      padding: 16,
      marginBottom: 12,
    }}>
      {title ? <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink, marginBottom: 14 }}>{title}</Text> : null}
      {children}
    </View>
  );
}

// titleCaseTR core/utils/textCase'den yeniden export edildi (DRY)
const titleCaseTR = titleCaseTRShared;

// ── Diş hekimliği uzmanlık alanları (TR) ─────────────────────────────
const DENTAL_SPECIALTIES = [
  'Genel Diş Hekimliği',
  'Ortodonti',
  'Ağız, Diş, Çene Cerrahisi',
  'Endodonti',
  'Periodontoloji',
  'Pedodonti',
  'Protetik Diş Tedavisi',
  'Restoratif Diş Tedavisi',
  'Oral Diagnoz & Radyoloji',
  'İmplantoloji',
  'Estetik Diş Hekimliği',
  'Diğer',
] as const;

// ── Patterns §13 helpers ─────────────────────────────────────────────
// HEX (#RRGGBB) → rgba(...) panel-aware tinting
function tintHex(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return `rgba(10,10,10,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const PATTERNS_CREAM = '#FBF9F4';

// ─── Clinic Modal ────────────────────────────────────────────────────
export function ClinicModal({ visible, editingClinic, existingClinics, accentColor, onClose, onSuccess, onCreated }: {
  visible: boolean; editingClinic: Clinic | null; existingClinics: Clinic[];
  accentColor: string; onClose: () => void; onSuccess: () => void;
  /** Yeni klinik eklendiğinde tetiklenir — caller eklenen klinik objesini alır */
  onCreated?: (clinic: Clinic) => void;
}) {
  // Theme-aware tokens — override module-level static inputBase/CARD
  const T = useMobileTokens();
  const rtl = isRTL();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const inputBase = {
    borderWidth: 1, borderColor: T.hairline, borderRadius: R.md,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: T.ink, backgroundColor: isDark ? T.card : '#FFFFFF',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  } as any;

  const [form, setForm] = useState<ClinicForm>(EMPTY_CLINIC);
  // Logo ayrı tutulur: form alanlarıyla birlikte kaydedilmez, seçilir seçilmez
  // edge function/storage üzerinden clinics.logo_url'e yazılır.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [ilSearch, setIlSearch] = useState('');
  const [ilOpen, setIlOpen] = useState(false);
  const [ilceSearch, setIlceSearch] = useState('');
  const [ilceOpen, setIlceOpen] = useState(false);
  const [mahSearch, setMahSearch] = useState('');
  const [mahOpen, setMahOpen] = useState(false);
  // Sokak focused state — manuel düzenleme (otomatik öneri yok)
  const [sokakFocused, setSokakFocused] = useState(false);
  // Google Places autocomplete
  const [gplaceResults, setGplaceResults] = useState<PlaceSuggestion[]>([]);
  const [gplaceLoading, setGplaceLoading] = useState(false);
  // DB-driven listeler (PTT mahalle veritabanı)
  const [dbIller, setDbIller] = useState<string[]>([]);
  const [dbIlceler, setDbIlceler] = useState<string[]>([]);
  const [dbMahalleler, setDbMahalleler] = useState<Array<{ mahalle: string; posta_kodu: string | null }>>([]);
  const [hasAdminAccount, setHasAdminAccount] = useState(false);

  // İl listesini bir kez yükle
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const { data } = await supabase.rpc('get_iller');
      if (Array.isArray(data)) setDbIller(data.map((r: any) => r.il).filter(Boolean));
    })();
  }, [visible]);

  // İl değişince ilçeleri yükle
  useEffect(() => {
    if (!form.il) { setDbIlceler([]); return; }
    (async () => {
      const { data } = await supabase.rpc('get_ilceler', { p_il: form.il });
      if (Array.isArray(data)) setDbIlceler(data.map((r: any) => r.ilce).filter(Boolean));
    })();
  }, [form.il]);

  // İlçe değişince mahalleleri yükle
  useEffect(() => {
    if (!form.il || !form.ilce) { setDbMahalleler([]); return; }
    (async () => {
      const { data } = await supabase.rpc('get_mahalleler', { p_il: form.il, p_ilce: form.ilce });
      if (Array.isArray(data)) setDbMahalleler(data.map((r: any) => ({ mahalle: r.mahalle, posta_kodu: r.posta_kodu })));
    })();
  }, [form.il, form.ilce]);

  // ── Google Places autocomplete — kurum adı + adres ──
  useEffect(() => {
    const q = form.name.trim();
    if (q.length < 3 || editingClinic) { setGplaceResults([]); return; }
    let cancelled = false;
    setGplaceLoading(true);
    if (!cancelled) startPlaceSession();
    const t = setTimeout(async () => {
      try {
        const res = await searchPlaces(q);
        if (cancelled) return;
        setGplaceResults(res);
      } catch {
        if (!cancelled) setGplaceResults([]);
      } finally {
        if (!cancelled) setGplaceLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.name, editingClinic]);

  // Google Place seç → details çek → form'a uygula
  const applyGooglePlace = useCallback(async (suggestion: PlaceSuggestion) => {
    setGplaceLoading(true);
    try {
      const d = await getPlaceDetails(suggestion.placeId);
      if (!d) return;
      setForm(prev => ({
        ...prev,
        name:       d.name || prev.name,
        il:         d.il || prev.il,
        ilce:       d.ilce || prev.ilce,
        mahalle:    d.mahalle || prev.mahalle,
        sokak:      d.sokak || prev.sokak,
        posta_kodu: d.postaKodu || prev.posta_kodu,
        phone:      d.phone || prev.phone,
      }));
      setGplaceResults([]);
    } finally {
      setGplaceLoading(false);
      endPlaceSession();
    }
  }, []);

  // Bu klinige ait clinic_admin profili var mi?
  useEffect(() => {
    if (!editingClinic || !visible) { setHasAdminAccount(false); return; }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_type', 'clinic_admin')
        .eq('clinic_id', editingClinic.id)
        .limit(1);
      setHasAdminAccount((data?.length ?? 0) > 0);
    })();
  }, [editingClinic, visible]);

  useEffect(() => {
    if (editingClinic) {
      const addr = parseAddress(editingClinic.address);
      setForm({
        name: editingClinic.name, category: editingClinic.category ?? 'klinik',
        phone: editingClinic.phone ?? '', email: editingClinic.email ?? '',
        il: addr.il, ilce: addr.ilce, mahalle: addr.mahalle,
        sokak: addr.sokak, bina_no: addr.bina_no, posta_kodu: addr.posta_kodu,
        contact_person: editingClinic.contact_person ?? '',
        notes: editingClinic.notes ?? '', is_active: editingClinic.is_active,
        vkn: (editingClinic as any).vkn ?? '', tax_office: (editingClinic as any).tax_office ?? '',
        admin_email: '', admin_password: '',
        billing_mode: (editingClinic.billing_mode ?? 'monthly_bulk') as 'per_order' | 'monthly_bulk',
        default_payment_terms_days: String(editingClinic.default_payment_terms_days ?? 30),
      });
      setLogoUrl((editingClinic as any).logo_url ?? null);
    } else { setForm(EMPTY_CLINIC); setLogoUrl(null); }
    setError(''); setIlOpen(false); setIlceOpen(false); setMahOpen(false); setIlSearch(''); setIlceSearch(''); setMahSearch('');
  }, [editingClinic, visible]);

  const set = (k: keyof ClinicForm, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('Kurum adı zorunludur'); return; }
    if (isDuplicate) { setError('Bu isimde bir kurum zaten mevcut'); return; }
    if (!form.contact_person.trim()) { setError('İrtibat kişisi zorunludur'); return; }
    if (!form.phone.trim()) { setError('Telefon zorunludur'); return; }
    if (!form.email.trim()) { setError('E-posta zorunludur'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Geçerli bir e-posta girin'); return; }
    if (!form.il.trim()) { setError('İl zorunludur'); return; }
    if (!form.ilce.trim()) { setError('İlçe zorunludur'); return; }
    if (!form.mahalle.trim()) { setError('Mahalle zorunludur'); return; }
    if (!form.sokak.trim())   { setError('Cadde/Sokak zorunludur (geocoding doğruluğu için)'); return; }
    if (!form.bina_no.trim()) { setError('Bina no zorunludur'); return; }

    // Klinik yetkilisi (admin) auth dogrulamasi — hem yeni kayit hem duzenlemede opsiyonel
    const adminEmailTrim = form.admin_email.trim();
    const wantsAdminAuth = adminEmailTrim.length > 0 || form.admin_password.length > 0;
    if (wantsAdminAuth) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmailTrim)) { setError('Geçerli bir yetkili e-posta girin'); return; }
      if (form.admin_password.length < 6) { setError('Yetkili şifresi en az 6 karakter olmalı'); return; }
    }

    setSaving(true);
    try {
      const vknTrim = form.vkn.trim();
      if (vknTrim && ![10, 11].includes(vknTrim.length)) { setError('VKN 10 hane, TCKN 11 hane olmalıdır'); return; }
      // İrtibat kişisi adı: Title-case + boşluk temizliği (TR locale)
      const cleanedContact = titleCaseTR(form.contact_person);
      const payload = { name: form.name.trim().replace(/\s+/g, ' '), category: form.category, phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: JSON.stringify({
          il:         form.il.trim(),
          ilce:       form.ilce.trim(),
          mahalle:    form.mahalle.trim(),
          sokak:      form.sokak.trim(),
          bina_no:    form.bina_no.trim(),
          posta_kodu: form.posta_kodu.trim(),
        }),
        contact_person: cleanedContact, notes: form.notes.trim() || null, is_active: form.is_active, vkn: vknTrim || null, tax_office: form.tax_office.trim() || null,
        billing_mode: form.billing_mode,
        default_payment_terms_days: parseInt(form.default_payment_terms_days, 10) || 30,
      };

      // 1) Klinik kaydet
      const clinicRes = editingClinic
        ? await updateClinic(editingClinic.id, payload as any)
        : await createClinic(payload as any);
      if (clinicRes.error) { setError(clinicRes.error.message ?? 'Bir hata oluştu'); return; }
      // Yeni klinik oluşturulduğunda caller'a haber ver
      if (!editingClinic && clinicRes.data && onCreated) {
        onCreated(clinicRes.data as Clinic);
      }

      // 2) Yetkili auth user (opsiyonel — hem yeni hem duzenleme)
      //    Service-role edge function ile oluşturulur:
      //      • email_confirm=true → kullanıcı doğrulama maili beklemeden giriş yapabilir
      //      • Admin'in mevcut session'ı bozulmaz (supabase.auth.signUp aksine)
      //      • Profile clinic_id + role='clinic_admin' ile doğru kurulur
      if (wantsAdminAuth) {
        const clinicId = (clinicRes.data as any)?.id ?? editingClinic?.id ?? null;
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: adminEmailTrim,
            password: form.admin_password,
            full_name: payload.contact_person,
            user_type: 'clinic_admin',
            clinic_name: payload.name,
            clinic_id: clinicId,
            phone: payload.phone,
          },
        });
        if (fnErr || (fnData as any)?.error) {
          const rawMsg = (fnData as any)?.error ?? fnErr?.message ?? 'Bilinmeyen hata';
          // Bilinen hataları kullanıcı dostu mesaja çevir
          const friendly =
            /already (been )?registered|user already exists|email.*exists/i.test(rawMsg)
              ? 'Bu e-posta zaten kullanılıyor. Farklı bir e-posta deneyin.'
            : /password.*(short|weak)|en az 6/i.test(rawMsg)
              ? 'Şifre çok zayıf — en az 6 karakter olmalı.'
            : rawMsg;
          const fullMsg = `${autoT('Yetkili kaydı başarısız')}: ${friendly}`;
          setError(fullMsg);
          toast.error(fullMsg);
          console.warn('[ClinicModal] admin-create-user error:', { rawMsg, fnErr, fnData });
          return;
        }
        toast.success(autoT('Klinik yetkilisi oluşturuldu ✓'));
      }

      onSuccess();
    } catch (e: any) {
      const msg = e.message ?? 'Bir hata oluştu';
      setError(msg);
      toast.error(msg);
      console.warn('[ClinicModal] handleSave error:', e);
    }
    finally { setSaving(false); }
  };

  const nameQ = form.name.trim().toLowerCase();
  const otherclinics = existingClinics.filter(c => c.id !== editingClinic?.id);
  const suggestions = nameQ.length >= 1 ? otherclinics.filter(c => c.name.toLowerCase().includes(nameQ)) : [];
  const isDuplicate = nameQ.length > 0 && otherclinics.some(c => c.name.toLowerCase() === nameQ);
  // DB öncelikli, boşsa statik listeye fallback
  const ilSource = dbIller.length ? dbIller : ILLER;
  const ilResults = ilSource.filter(il => il.toLowerCase().includes(ilSearch.toLowerCase()));
  const ilceSource = dbIlceler.length ? dbIlceler : (form.il ? (ILCELER[form.il] ?? []) : []);
  const ilceResults = ilceSource.filter(d => d.toLowerCase().includes(ilceSearch.toLowerCase()));
  const mahResults = dbMahalleler.filter(m => m.mahalle.toLowerCase().includes(mahSearch.toLowerCase()));
  const selectIl = (il: string) => { set('il', il); set('ilce', ''); set('mahalle', ''); set('posta_kodu', ''); setIlOpen(false); setIlSearch(''); };
  const selectIlce = (ilce: string) => { set('ilce', ilce); set('mahalle', ''); set('posta_kodu', ''); setIlceOpen(false); setIlceSearch(''); };
  const selectMahalle = (mah: string) => {
    set('mahalle', mah);
    const hit = dbMahalleler.find(m => m.mahalle === mah);
    if (hit?.posta_kodu) set('posta_kodu', hit.posta_kodu);
    setMahOpen(false); setMahSearch('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: T.card, borderRadius: 24, width: '100%', maxWidth: 560, maxHeight: '94%', overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          {/* ═════ HEADER (Patterns §13) ═════ */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18, gap: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: tintHex(accentColor, 0.12),
                borderWidth: 1, borderColor: tintHex(accentColor, 0.20),
              }}>
                <Building2 size={20} color={accentColor} strokeWidth={1.7} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Sağlık Kurumu
                </Text>
                <Text style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.6, color: T.ink, lineHeight: 32, marginTop: 2 }}>
                  {editingClinic ? 'Kurumu düzenle' : 'Yeni kurum ekle'}
                </Text>
                <Text style={{ fontSize: 12, color: T.ink3, marginTop: 4, lineHeight: 17 }}>
                  Kurum bilgileri, adres ve yetkili girişi.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 12,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: T.cardSoft,
                borderWidth: 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={15} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginHorizontal: 28 }} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            {/* Kategori */}
            <SectionCard title="Kategori">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CLINIC_CATEGORIES.map(cat => {
                  const active = form.category === cat.value;
                  return (
                    <Pressable key={cat.value} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 7,
                      paddingHorizontal: 14, paddingVertical: 10,
                      borderRadius: R.sm, borderWidth: 1.5,
                      // Aktif state'i sadece stroke rengi gösterir; bg her zaman transparent (kart dark/açık kalır)
                      borderColor: active ? cat.color : (isDark ? 'rgba(255,255,255,0.10)' : T.hairline),
                      backgroundColor: 'transparent',
                      flex: 1, minWidth: '44%' as any,
                    }}
                      onPress={() => set('category', cat.value)}>
                      <AppIcon name={cat.icon as any} size={16} color={active ? cat.color : T.ink3} />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: active ? cat.color : T.ink2 }}>{autoT(cat.label)}</Text>
                      {active && <Check size={12} color={cat.color} strokeWidth={2} />}
                    </Pressable>
                  );
                })}
              </View>
            </SectionCard>

            {/* Logo — yalnız KAYITLI kurumda (yeni kurumda henüz id yok) */}
            {editingClinic?.id && (
              <SectionCard title="Logo">
                <ClinicLogoPicker
                  clinicId={editingClinic.id}
                  clinicName={form.name || editingClinic.name}
                  logoUrl={logoUrl}
                  accentColor={accentColor}
                  onChange={setLogoUrl}
                />
              </SectionCard>
            )}

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
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: DS.ink[900], textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{c.name}</Text>
                          <View style={{ backgroundColor: DS.lab.bgSoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#D97706' }}>Kayıtlı</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* ── Google Places autocomplete (öncelikli) — adres + telefon otomatik doldur ── */}
                {nameFocused && !isDuplicate && (gplaceResults.length > 0 || gplaceLoading) && (
                  <View style={{ borderWidth: 1, borderColor: DS.ink[200], borderRadius: R.sm, backgroundColor: '#FFFFFF', marginTop: 4, overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
                      <MapPin size={11} color="#1A73E8" strokeWidth={1.8} />
                      <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: '#1A73E8', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                        Google Sonuçları
                      </Text>
                      {gplaceLoading && (
                        <Text style={{ fontSize: 9, color: DS.ink[400], fontStyle: 'italic' }}>aranıyor…</Text>
                      )}
                    </View>
                    {gplaceResults.slice(0, 6).map((g, i) => (
                      <Pressable
                        key={g.placeId}
                        style={({ hovered }: any) => ({
                          paddingHorizontal: 12, paddingVertical: 10,
                          borderBottomWidth: i < Math.min(gplaceResults.length, 6) - 1 ? 1 : 0,
                          borderBottomColor: 'rgba(0,0,0,0.04)',
                          backgroundColor: hovered ? '#F1F5F9' : 'transparent',
                        })}
                        onPress={() => { applyGooglePlace(g); setNameFocused(false); }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center' }}>
                            <MapPin size={11} color="#1A73E8" strokeWidth={2} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 12.5, fontWeight: '600', color: DS.ink[900], textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
                              {g.mainText}
                            </Text>
                            {g.secondaryText ? (
                              <Text style={{ fontSize: 10.5, color: DS.ink[500], marginTop: 1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
                                {g.secondaryText}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#1A73E8', backgroundColor: '#E8F0FE', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            GOOGLE
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}

              </ModalField>
              <ModalField label="İrtibat Kişisi" required><TextInput style={inputBase} value={form.contact_person} onChangeText={v => set('contact_person', v)} placeholder="Örn: Mehmet Bey" placeholderTextColor={DS.ink[400]} /></ModalField>
              <ModalField label="Telefon" required><TextInput style={inputBase} value={form.phone} onChangeText={v => set('phone', v)} placeholder="0555 000 00 00" placeholderTextColor={DS.ink[400]} keyboardType="phone-pad" /></ModalField>
              <ModalField label="E-posta" required last><TextInput style={inputBase} value={form.email} onChangeText={v => set('email', v)} placeholder="info@klinik.com" placeholderTextColor={DS.ink[400]} keyboardType="email-address" autoCapitalize="none" /></ModalField>
            </SectionCard>

            {/* Adres */}
            <SectionCard title="Adres">
              <ModalField label="İl" required>
                <Pressable style={{ ...inputBase, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} onPress={() => { setIlOpen(v => !v); setIlceOpen(false); }}>
                  <Text style={{ fontSize: 14, color: form.il ? T.ink : T.ink3, flex: 1, textAlign: rtl ? 'right' : undefined }}>{form.il || 'Seçiniz'}</Text>
                  {ilOpen ? <ChevronUp size={14} color={T.ink3} strokeWidth={1.8} /> : <ChevronDown size={14} color={T.ink3} strokeWidth={1.8} />}
                </Pressable>
                {ilOpen && <DropdownList items={ilResults} selected={form.il} searchValue={ilSearch} onSearch={setIlSearch} searchPlaceholder="İl ara..." onSelect={selectIl} accentColor={accentColor} />}
              </ModalField>
              <ModalField label="İlçe" required>
                <Pressable style={{ ...inputBase, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: form.il ? 1 : 0.4 }} onPress={() => { if (!form.il) return; setIlceOpen(v => !v); setIlOpen(false); }}>
                  <Text style={{ fontSize: 14, color: form.ilce ? T.ink : T.ink3, flex: 1, textAlign: rtl ? 'right' : undefined }}>{form.ilce || (form.il ? 'Seçiniz' : 'Önce il seçin')}</Text>
                  {ilceOpen ? <ChevronUp size={14} color={T.ink3} strokeWidth={1.8} /> : <ChevronDown size={14} color={T.ink3} strokeWidth={1.8} />}
                </Pressable>
                {ilceOpen && <DropdownList items={ilceResults} selected={form.ilce} searchValue={ilceSearch} onSearch={setIlceSearch} searchPlaceholder="İlçe ara..." onSelect={selectIlce} accentColor={accentColor} />}
              </ModalField>
              <ModalField label="Mahalle" required hint={dbMahalleler.length ? `${dbMahalleler.length} ${autoT('mahalle bulundu — listeden seç')}` : 'Önce il ve ilçe seçin'}>
                <Pressable style={{ ...inputBase, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: form.ilce ? 1 : 0.4 }} onPress={() => { if (!form.ilce) return; setMahOpen(v => !v); setIlOpen(false); setIlceOpen(false); }}>
                  <Text style={{ fontSize: 14, color: form.mahalle ? T.ink : T.ink3, flex: 1, textAlign: rtl ? 'right' : undefined }}>{form.mahalle || (form.ilce ? 'Mahalle seçiniz' : 'Önce ilçe seçin')}</Text>
                  {mahOpen ? <ChevronUp size={14} color={T.ink3} strokeWidth={1.8} /> : <ChevronDown size={14} color={T.ink3} strokeWidth={1.8} />}
                </Pressable>
                {mahOpen && <DropdownList items={mahResults.map(m => m.mahalle)} selected={form.mahalle} searchValue={mahSearch} onSearch={setMahSearch} searchPlaceholder="Mahalle ara..." onSelect={selectMahalle} accentColor={accentColor} />}
              </ModalField>
              <ModalField label="Cadde / Sokak" required hint="Kurum adından otomatik dolar — manuel düzenleyebilirsin">
                <TextInput
                  style={inputBase}
                  value={form.sokak}
                  onChangeText={v => set('sokak', v)}
                  onFocus={() => setSokakFocused(true)}
                  onBlur={() => setTimeout(() => setSokakFocused(false), 200)}
                  placeholder="Örn: Vatan Caddesi"
                  placeholderTextColor={DS.ink[400]}
                  autoCapitalize="words"
                />
              </ModalField>
              <ModalField label="Bina No" required>
                <TextInput style={inputBase} value={form.bina_no} onChangeText={v => set('bina_no', v)} placeholder="Örn: 21 veya 21/3" placeholderTextColor={DS.ink[400]} />
              </ModalField>
              <ModalField label="Posta Kodu" last hint="Mahalle seçildiğinde otomatik dolar — değiştirebilirsin">
                <TextInput style={inputBase} value={form.posta_kodu} onChangeText={v => set('posta_kodu', v.replace(/[^0-9]/g, ''))} placeholder="Örn: 34758" placeholderTextColor={DS.ink[400]} keyboardType="number-pad" maxLength={5} />
              </ModalField>
            </SectionCard>

            {/* e-Fatura */}
            <SectionCard title="e-Fatura Bilgileri">
              <ModalField label="VKN / TCKN"><TextInput style={inputBase} value={form.vkn} onChangeText={v => set('vkn', v.replace(/[^0-9]/g, ''))} placeholder="10 hane VKN veya 11 hane TCKN" placeholderTextColor={DS.ink[400]} keyboardType="number-pad" maxLength={11} /></ModalField>
              <ModalField label="Vergi Dairesi" last><TextInput style={inputBase} value={form.tax_office} onChangeText={v => set('tax_office', v)} placeholder="Örn: Kadıköy Vergi Dairesi" placeholderTextColor={DS.ink[400]} autoCapitalize="words" /></ModalField>
            </SectionCard>

            {/* Yetkili Sisteme Giriş */}
            <SectionCard title="Yetkili Girişi (Opsiyonel)">
              {editingClinic && hasAdminAccount ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#ECFDF5', borderRadius: R.sm }}>
                  <Check size={14} color="#047857" strokeWidth={2} />
                  <Text style={{ fontSize: 12, color: '#047857', flex: 1 }}>
                    Klinik yetkilisi sisteme kayıtlı. Şifre değişikliği için kullanıcı kendi profilinden veya admin panelinden yapmalı.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 12, color: DS.ink[500], marginBottom: 12 }}>
                    {editingClinic
                      ? 'Klinik yetkilisi henüz sisteme kayıtlı değil. E-posta ve şifre vererek hesap oluşturabilirsiniz.'
                      : 'E-posta ve şifre verirseniz klinik yetkilisi sisteme giriş yapabilir. Boş bırakılırsa sadece kurum kaydı oluşur.'}
                  </Text>
                  <ModalField label="Yetkili E-posta">
                    <TextInput style={inputBase} value={form.admin_email} onChangeText={v => set('admin_email', v)} placeholder="ornek@email.com" placeholderTextColor={DS.ink[400]} keyboardType="email-address" autoCapitalize="none" />
                  </ModalField>
                  <ModalField label="Şifre" last>
                    <PasswordField
                      value={form.admin_password}
                      onChange={v => set('admin_password', v)}
                      placeholder="En az 6 karakter"
                      inputStyle={inputBase}
                    />
                  </ModalField>
                </>
              )}
            </SectionCard>

            {/* Faturalama */}
            <SectionCard title="Faturalama">
              <ModalField label="Fatura Modu">
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([
                    { v: 'monthly_bulk', l: 'Aylık Toplu', d: 'Ay sonu tüm teslimler tek fatura' },
                    { v: 'per_order',    l: 'Her Teslimat', d: 'Her sipariş için ayrı fatura' },
                  ] as const).map(opt => {
                    const active = form.billing_mode === opt.v;
                    return (
                      <Pressable
                        key={opt.v}
                        onPress={() => set('billing_mode', opt.v as any)}
                        style={{
                          flex: 1, padding: 10, borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: active ? accentColor : 'rgba(0,0,0,0.10)',
                          backgroundColor: active ? `${accentColor}10` : '#FFFFFF',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? accentColor : DS.ink[800] }}>{autoT(opt.l)}</Text>
                        <Text style={{ fontSize: 10, color: DS.ink[500], marginTop: 2 }}>{autoT(opt.d)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ModalField>
              <ModalField label="Vade (gün)" last>
                <TextInput
                  style={inputBase}
                  value={form.default_payment_terms_days}
                  onChangeText={v => set('default_payment_terms_days', v.replace(/[^0-9]/g, ''))}
                  placeholder="30"
                  placeholderTextColor={DS.ink[400]}
                  keyboardType="numeric"
                />
              </ModalField>
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

          </ScrollView>

          {/* Hata bandı — footer'ın hemen üstünde sticky, scroll dışında her zaman görünür */}
          {error ? (
            <View style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 8,
              marginHorizontal: 20, marginBottom: 8,
              backgroundColor: 'rgba(217,75,75,0.12)',
              borderWidth: 1, borderColor: 'rgba(217,75,75,0.25)',
              borderRadius: R.sm, padding: 12,
            }}>
              <AlertCircle size={14} color="#9C2E2E" strokeWidth={2} />
              <Text style={{ fontSize: 13, color: '#9C2E2E', flex: 1, lineHeight: 18 }}>{error}</Text>
              <Pressable onPress={() => setError('')} hitSlop={8} style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}}>
                <X size={14} color="#9C2E2E" strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}

          {/* ═════ FOOTER (cream Patterns §13) ═════ */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: T.hairline,
            backgroundColor: isDark ? T.cardSoft : PATTERNS_CREAM,
          }}>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[700] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: accentColor,
                opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? {
                  cursor: saving ? 'wait' : 'pointer',
                  boxShadow: !saving ? `0 8px 24px ${tintHex(accentColor, 0.45)}` : 'none',
                } as any : {}),
              }}
            >
              <Check size={14} color="#FFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>
                {saving ? 'Kaydediliyor…' : (editingClinic ? 'Güncelle' : 'Kurumu ekle')}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Doctor Modal ────────────────────────────────────────────────────
export function DoctorModal({ visible, editingDoctor, clinics, defaultClinicId, accentColor, onClose, onSuccess, onCreated }: {
  visible: boolean; editingDoctor: Doctor | null; clinics: Clinic[];
  defaultClinicId: string; accentColor: string; onClose: () => void; onSuccess: () => void;
  /** Yeni hekim oluşturulduğunda tetiklenir — caller eklenen doctor objesini alır */
  onCreated?: (doctor: Doctor) => void;
}) {
  // Theme-aware tokens — local inputBase shadows the module-level static one
  const T = useMobileTokens();
  const rtl = isRTL();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const inputBase = {
    borderWidth: 1, borderColor: T.hairline, borderRadius: R.md,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: T.ink, backgroundColor: isDark ? T.card : '#FFFFFF',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  } as any;

  const [form, setForm] = useState<DoctorForm>(EMPTY_DOCTOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Bu hekimin sisteme kayitli auth hesabi var mi?
  const [hasAuthAccount, setHasAuthAccount] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  // Uzmanlık dropdown state
  const [specialtyOpen, setSpecialtyOpen] = useState(false);
  const [specialtySearch, setSpecialtySearch] = useState('');

  // Edit modunda full_name eslesen profil var mi diye bak
  useEffect(() => {
    if (!editingDoctor || !visible) { setHasAuthAccount(false); setAuthEmail(null); return; }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_type', 'doctor')
        .ilike('full_name', editingDoctor.full_name)
        .limit(1);
      const exists = (data?.length ?? 0) > 0;
      setHasAuthAccount(exists);
      // E-postayi profilden alamiyoruz (auth.users'da). Bu yuzden sadece varlik bilgisini gosteriyoruz.
      setAuthEmail(exists ? '✓' : null);
    })();
  }, [editingDoctor, visible]);

  useEffect(() => {
    setForm(editingDoctor ? { full_name: editingDoctor.full_name, phone: editingDoctor.phone ?? '', specialty: editingDoctor.specialty ?? '',
      notes: editingDoctor.notes ?? '', clinic_id: editingDoctor.clinic_id ?? '', is_active: editingDoctor.is_active, tckn: (editingDoctor as any).tckn ?? '',
      email: '', password: '' }
      : { ...EMPTY_DOCTOR, clinic_id: defaultClinicId });
    setError('');
  }, [editingDoctor, defaultClinicId, visible]);

  const set = (k: keyof DoctorForm, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.full_name.trim()) { setError('Ad Soyad zorunludur'); return; }
    const tcknTrim = form.tckn.trim();
    if (tcknTrim && tcknTrim.length !== 11) { setError('TCKN 11 hane olmalıdır'); return; }

    // E-posta + sifre dogrulamasi (hem yeni kayit hem duzenleme)
    const emailTrim = form.email.trim();
    const wantsAuth = emailTrim.length > 0 || form.password.length > 0;
    if (wantsAuth) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { setError('Geçerli bir e-posta girin'); return; }
      if (form.password.length < 6) { setError('Şifre en az 6 karakter olmalı'); return; }
    }

    setSaving(true);
    try {
      // Title-case + ünvan öneki ("Dt.") — kopya mantık yerine kanonik yardımcı.
      // Eskiden buradaki kopya "Dr." ekliyordu ve textCase'deki asılla ayrı
      // yaşıyordu; varsayılan ünvan tek yerden gelmeli.
      const finalName = normalizeDoctorName(form.full_name);

      const payload = { full_name: finalName, phone: form.phone.trim() || null, specialty: form.specialty.trim() || null,
        notes: form.notes.trim() || null, clinic_id: form.clinic_id || null, is_active: form.is_active, tckn: tcknTrim || null };

      // ÇİFT KAYIT KORUMASI: aynı klinikte aynı isimde bir KULLANICI profili
      // varsa (hekim ya da klinik yetkilisi — yetkili de hekim olabiliyor),
      // ikinci bir `doctors` satırı açmak kişiyi listede iki kez gösteriyordu.
      if (!editingDoctor && payload.clinic_id) {
        const { data: dupe } = await supabase
          .from('profiles')
          .select('id, full_name, user_type')
          .eq('clinic_id', payload.clinic_id)
          .in('user_type', ['doctor', 'clinic_admin', 'clinic_secretary'])
          .ilike('full_name', finalName.replace(/^(Dr|Dt|Prof|Doç|Opr|Uzm)\.?\s+/i, '%'))
          .limit(1);
        if (dupe && dupe.length) {
          setError(`"${dupe[0].full_name}" ${autoT('bu klinikte zaten kullanıcı olarak kayıtlı — yeni hekim eklemek yerine listeden onu seçin.')}`);
          return;
        }
      }

      // 1) doctors tablosunu olustur/guncelle
      const docRes = editingDoctor ? await updateDoctor(editingDoctor.id, payload) : await createDoctor(payload);
      if (docRes.error) { setError(docRes.error.message ?? 'Bir hata oluştu'); return; }
      // Yeni hekim oluşturulduğunda caller'a haber ver
      if (!editingDoctor && docRes.data && onCreated) {
        onCreated(docRes.data as Doctor);
      }

      // 2) Auth user istendiyse: service-role edge fn ile oluştur.
      //    supabase.auth.signUp KULLANMA — onay e-postası tetikler ("Error sending
      //    confirmation email") ve yeni kullanıcıyla oturum açıp admin'in session'ını
      //    bozar. admin-create-user: email_confirm=true (mail atmaz) + admin session korunur.
      //    doctors satırı yukarıda createDoctor ile açıldı → skip_doctor_row:true (çift kayıt önle).
      if (wantsAuth) {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: emailTrim,
            password: form.password,
            full_name: payload.full_name,
            user_type: 'doctor',
            clinic_id: payload.clinic_id,
            specialty: payload.specialty,
            phone: payload.phone,
            skip_doctor_row: true,
          },
        });
        if (fnErr || (fnData as any)?.error) {
          const rawMsg = (fnData as any)?.error ?? fnErr?.message ?? 'Bilinmeyen hata';
          const friendly =
            /already (been )?registered|user already exists|email.*exists/i.test(rawMsg)
              ? 'Bu e-posta zaten kullanılıyor. Farklı bir e-posta deneyin.'
            : /password.*(short|weak)|en az 6/i.test(rawMsg)
              ? 'Şifre çok zayıf — en az 6 karakter olmalı.'
            : rawMsg;
          setError(`${autoT('Hekim kaydedildi, ancak giriş hesabı oluşturulamadı')}: ${friendly}`);
          return;
        }
      }

      onSuccess();
    } catch (e: any) { setError(e.message ?? 'Bir hata oluştu'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: T.card, borderRadius: 24, width: '100%', maxWidth: 500, maxHeight: '94%', overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          {/* ═════ HEADER (Patterns §13) ═════ */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18, gap: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: tintHex(accentColor, 0.12),
                borderWidth: 1, borderColor: tintHex(accentColor, 0.20),
              }}>
                <Stethoscope size={20} color={accentColor} strokeWidth={1.7} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Hekim
                </Text>
                <Text style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.6, color: DS.ink[900], lineHeight: 32, marginTop: 2 }}>
                  {editingDoctor ? 'Hekimi düzenle' : 'Yeni hekim ekle'}
                </Text>
                <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4, lineHeight: 17 }}>
                  Hekim bilgileri, klinik bağlantısı ve giriş hesabı.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 12,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={15} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginHorizontal: 28 }} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <SectionCard title="Hekim Bilgileri">
              <ModalField label="Ad Soyad" required hint="“Dt.” öneki + büyük harf düzeltmesi otomatik">
                <TextInput
                  style={inputBase}
                  value={form.full_name}
                  onChangeText={v => set('full_name', v)}
                  placeholder="Örn: ayşe kaya"
                  placeholderTextColor={DS.ink[400]}
                  autoCapitalize="words"
                />
              </ModalField>
              <ModalField label="Uzmanlık">
                <Pressable
                  style={{ ...inputBase, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  onPress={() => setSpecialtyOpen(v => !v)}
                >
                  <Text style={{ fontSize: 14, color: form.specialty ? DS.ink[900] : DS.ink[400], flex: 1, textAlign: rtl ? 'right' : undefined }}>
                    {form.specialty || 'Uzmanlık seç'}
                  </Text>
                  {specialtyOpen
                    ? <ChevronUp size={14} color={DS.ink[400]} strokeWidth={1.8} />
                    : <ChevronDown size={14} color={DS.ink[400]} strokeWidth={1.8} />
                  }
                </Pressable>
                {specialtyOpen && (
                  <DropdownList
                    items={DENTAL_SPECIALTIES.filter(sp => {
                      const q = specialtySearch.toLocaleLowerCase();
                      return !q || sp.toLocaleLowerCase().includes(q) || autoT(sp).toLocaleLowerCase().includes(q);
                    }) as unknown as string[]}
                    selected={form.specialty}
                    searchValue={specialtySearch}
                    onSearch={setSpecialtySearch}
                    searchPlaceholder="Uzmanlık ara..."
                    onSelect={(val) => { set('specialty', val); setSpecialtyOpen(false); setSpecialtySearch(''); }}
                    accentColor={accentColor}
                  />
                )}
              </ModalField>
              <ModalField label="Telefon"><TextInput style={inputBase} value={form.phone} onChangeText={v => set('phone', v)} placeholder="0555 000 00 00" placeholderTextColor={DS.ink[400]} keyboardType="phone-pad" /></ModalField>
              <ModalField label="TCKN (e-Arşiv için)"><TextInput style={inputBase} value={form.tckn} onChangeText={v => set('tckn', v.replace(/[^0-9]/g, ''))} placeholder="11 haneli TC Kimlik No" placeholderTextColor={DS.ink[400]} keyboardType="number-pad" maxLength={11} /></ModalField>
              <ModalField label="Klinik" last>
                <ClinicDropdown value={form.clinic_id} clinics={clinics} accentColor={accentColor} onChange={id => set('clinic_id', id)} />
              </ModalField>
            </SectionCard>
            <SectionCard title="Sisteme Giriş (Opsiyonel)">
              {editingDoctor && hasAuthAccount ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#ECFDF5', borderRadius: R.sm }}>
                  <Check size={14} color="#047857" strokeWidth={2} />
                  <Text style={{ fontSize: 12, color: '#047857', flex: 1 }}>
                    Hekim sisteme kayıtlı. Şifre değişikliği için kullanıcı kendi profilinden veya admin panelinden yapmalı.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 12, color: DS.ink[500], marginBottom: 12 }}>
                    {editingDoctor
                      ? 'Hekim henüz sisteme kayıtlı değil. E-posta ve şifre vererek hesap oluşturabilirsiniz.'
                      : 'E-posta ve şifre verirseniz hekim sisteme giriş yapabilir. Boş bırakılırsa sadece kayıt listesine eklenir.'}
                  </Text>
                  <ModalField label="E-posta">
                    <TextInput style={inputBase} value={form.email} onChangeText={v => set('email', v)} placeholder="ornek@email.com" placeholderTextColor={DS.ink[400]} keyboardType="email-address" autoCapitalize="none" />
                  </ModalField>
                  <ModalField label="Şifre" last>
                    <PasswordField
                      value={form.password}
                      onChange={v => set('password', v)}
                      placeholder="En az 6 karakter"
                      inputStyle={inputBase}
                    />
                  </ModalField>
                </>
              )}
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
          {/* ═════ FOOTER (cream Patterns §13) ═════ */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: T.hairline,
            backgroundColor: isDark ? T.cardSoft : PATTERNS_CREAM,
          }}>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[700] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: accentColor,
                opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? {
                  cursor: saving ? 'wait' : 'pointer',
                  boxShadow: !saving ? `0 8px 24px ${tintHex(accentColor, 0.45)}` : 'none',
                } as any : {}),
              }}
            >
              <Check size={14} color="#FFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>
                {saving ? 'Kaydediliyor…' : (editingDoctor ? 'Güncelle' : 'Hekimi ekle')}
              </Text>
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
  const rtl = isRTL();
  const [open, setOpen] = useState(false);
  const selected = clinics.find(c => c.id === value);
  return (
    <View>
      <Pressable style={{ ...inputBase, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: open ? DS.ink[900] : DS.ink[200] }} onPress={() => setOpen(v => !v)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Briefcase size={14} color={selected ? accentColor : DS.ink[400]} strokeWidth={1.8} />
          <Text style={{ fontSize: 14, color: selected ? DS.ink[900] : DS.ink[400], flex: 1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{selected ? selected.name : 'Klinik seçin...'}</Text>
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
                <Text style={{ flex: 1, fontSize: 14, color: isSelected ? accentColor : DS.ink[700], fontWeight: isSelected ? '600' : '400', textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{c.name}</Text>
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
  const rtl = isRTL();
  const [value, setValue] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (clinic) setValue(currentDiscount != null ? String(currentDiscount) : ''); }, [clinic, currentDiscount]);

  const handleSave = async () => {
    const pct = Number(value.replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast.error(autoT('İndirim oranı 0 ile 100 arasında olmalıdır.')); return; }
    if (!clinic) return;
    setSaving(true);
    const { error } = await supabase.from('clinic_discounts').upsert({ clinic_id: clinic.id, discount_rate: pct }, { onConflict: 'clinic_id' });
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
              <View style={{ paddingHorizontal: 16, ...(rtl ? { borderRightWidth: 1, borderRightColor: DS.ink[200] } : { borderLeftWidth: 1, borderLeftColor: DS.ink[200] }), backgroundColor: DS.ink[50] }}>
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

// ─── Managers List (Klinik Yöneticileri) ──────────────────────
function ManagersList({ managers, accentColor }: { managers: any[]; accentColor: string }) {
  const rtl = isRTL();
  if (managers.length === 0) {
    return (
      <View style={{ ...CARD, padding: 32, alignItems: "center", gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: DS.ink[50], alignItems: "center", justifyContent: "center" }}>
          <Briefcase size={24} color={DS.ink[400]} strokeWidth={1.6} />
        </View>
        <Text style={{ ...DISPLAY, fontSize: 20, color: DS.ink[900] }}>Henüz yönetici yok</Text>
        <Text style={{ fontSize: 13, color: DS.ink[500], textAlign: "center", maxWidth: 320 }}>
          Klinik yetkilileri yeni kurum eklerken e-posta + şifre alanı doldurularak oluşur.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ ...CARD, overflow: "hidden" }}>
      {managers.map((m: any, i: number) => (
        <View
          key={m.id}
          style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            paddingHorizontal: 16, paddingVertical: 14,
            borderBottomWidth: i < managers.length - 1 ? 1 : 0,
            borderBottomColor: "rgba(0,0,0,0.04)",
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentColor + "20", alignItems: "center", justifyContent: "center" }}>
            <Briefcase size={16} color={accentColor} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: DS.ink[900], textAlign: rtl ? "right" : undefined }} numberOfLines={1}>{m.full_name || "—"}</Text>
              {m.isFallback && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: "#FEF3C7" }}>
                  <Text style={{ fontSize: 9, fontWeight: "700", color: "#92400E" }}>GEÇİCİ</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2, textAlign: rtl ? "right" : undefined }} numberOfLines={1}>
              {m.clinic?.name ?? "Klinik atanmamış"}{m.phone ? "  ·  " + m.phone : ""}
              {m.isFallback ? "  ·  " + autoT('ilk hekim') : ""}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: m.is_active ? "#D1FAE5" : DS.ink[100] }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: m.is_active ? "#047857" : DS.ink[500] }}>
              {m.is_active ? "AKTİF" : "PASİF"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

