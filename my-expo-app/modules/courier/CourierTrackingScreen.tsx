// modules/courier/CourierTrackingScreen.tsx
// Panel-bağımsız Kurye Takip ekranı. Her panel kendi accent + route prefix'iyle
// thin wrapper olarak çağırır.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Platform, useWindowDimensions, Modal, Alert, Linking, Image, Animated, PanResponder } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search, MapPin, ArrowRight, ArrowLeft, MessageSquare, Phone, ChevronRight, ChevronLeft, Clock,
  QrCode, Bell, User as UserIcon, X, Package, PackageCheck, Trash2,
  ChevronDown, Check,
} from '../../core/ui/icons';
import { isRTL } from '../../core/i18n';
import { autoT } from '../../core/i18n/autoTranslate';
import { supabase } from '../../core/api/supabase';
import { CourierTrackingMap } from './CourierTrackingMap';
import { ActivityIndicator } from '../../core/ui/teethCompat';
import { useScanStore } from '../../core/store/scanStore';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { formatAddress } from '../../core/util/formatAddress';
import { useExternalCourier } from './useExternalCourier';
import { toast } from '../../core/ui/Toast';
import { navBarMetrics, navGlass, navSurfaceStyle, useReduceTransparency } from '../../core/ui/mobile/navGlass';
import { GlassBlurLayer } from '../../core/ui/mobile/GlassBlurLayer';
import { prefersReducedMotion } from '../../core/ui/mobile/navScroll';

const INK_900 = '#0A0A0A';
const INK_500 = '#6B6B6B';
const INK_300 = '#CBD5E1';

/* Tek glass kutu içindeki bölüm ayracı (kurye · varış · rota · kargo takip)
   artık useCourierInk().hairline — açık/koyu tek yerden. */

/**
 * Kurye Takip ink/yüzey seti — açık & koyu tema TEK kaynaktan.
 *
 * NEDEN: bu ekran haritanın ÜSTÜNDE cam yüzeyler kullanıyor. Açık temaya göre
 * sabitlenmiş beyaz cam + koyu ink'ler koyu temada haritanın üstünde kalınca
 * (beyaz cam koyu haritada gri lekeye, koyu metin okunmaz hale dönüyordu)
 * bozuluyordu. Buradaki set hem masaüstü cam kutusu hem mobil sheet için ortak.
 */
function useCourierInk() {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return useMemo(() => (isDark ? {
    isDark:     true,
    ink:        '#F7F2E9',
    inkMuted:   'rgba(247,242,233,0.62)',
    inkFaint:   'rgba(247,242,233,0.38)',
    hairline:   { height: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
    softBg:     '#141312',
    softBorder: 'rgba(255,255,255,0.08)',
    sheetBg:    '#1B1916',
    mapBg:      '#141312',
    green:      '#34D399',
    greenBg:    'rgba(52,211,153,0.16)',
    grabber:    'rgba(255,255,255,0.22)',
    closeBg:    'rgba(255,255,255,0.10)',
    stepBorder: 'rgba(255,255,255,0.28)',
    stepLine:   'rgba(255,255,255,0.14)',
    cardBg:     'rgba(255,255,255,0.08)',
    cardBgSel:  'rgba(255,255,255,0.16)',
    btnBg:      '#F7F2E9',
    btnFg:      '#141312',
  } : {
    isDark:     false,
    ink:        INK_900,
    inkMuted:   INK_500,
    inkFaint:   INK_300,
    hairline:   { height: 1, backgroundColor: 'rgba(15,23,42,0.08)' },
    softBg:     '#FAFAF7',
    softBorder: 'rgba(15,23,42,0.06)',
    sheetBg:    '#FFFFFF',
    mapBg:      '#E2E8F0',
    green:      '#0F6E50',
    greenBg:    'rgba(16,185,129,0.14)',
    grabber:    'rgba(15,23,42,0.15)',
    closeBg:    'rgba(15,23,42,0.06)',
    stepBorder: 'rgba(15,23,42,0.20)',
    stepLine:   'rgba(15,23,42,0.10)',
    cardBg:     'rgba(255,255,255,0.45)',
    cardBgSel:  'rgba(255,255,255,0.7)',
    btnBg:      INK_900,
    btnFg:      '#FFFFFF',
  }), [isDark]);
}

function getInitials(name: string): string {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('');
  return initials || 'K';
}

/** Kurye avatarı: foto varsa fotoğraf, yoksa accent daire + baş harf. */
function CourierAvatar({ photo, name, size, accent, initialsColor }: {
  photo?: string | null; name: string; size: number; accent: string; initialsColor: string;
}) {
  const radius = size / 2;
  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: `${accent}22` }}
        accessibilityLabel={name}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: radius,
      backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.32, fontWeight: '700', color: initialsColor }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

/**
 * Gönderen/alıcı yöne göre değişir. `direction='clinic_to_lab'` (klinikten alım,
 * ör. eksik parça/model alma) durumunda gönderen klinik, alıcı laboratuvardır.
 * Eskiden gönderen sabit "Laboratuvar" yazıyordu ve geliş bacaklarında ters görünüyordu.
 */
function routeEndpoints(d: {
  direction?: string | null;
  destination_name?: string | null;
  destination_address?: string | null;
  clinic_name?: string | null;
  doctor_name?: string | null;
  origin_name?: string | null;
  origin_address?: string | null;
}) {
  const addr = formatAddress(d.destination_address) || '';
  if (d.direction === 'clinic_to_lab') {
    // Klinikten/tedarikçiden alım: gönderen = origin_* (varsa, sipariş kliniğinden
    // bağımsız gerçek alım noktası) ya da klinik/hekim; alıcı = laboratuvar (destination_*).
    const fromAddr = formatAddress(d.origin_address) || '';
    return {
      fromText: [d.origin_name || d.clinic_name || d.doctor_name || 'Klinik', fromAddr].filter(Boolean).join('\n'),
      toLabel:  'Alıcı Adres',
      toText:   [d.destination_name || 'Laboratuvar', addr].filter(Boolean).join('\n'),
    };
  }
  // Lab çıkışı (varsayılan): gönderen laboratuvar, alıcı klinik/hekim (= destination_*)
  return {
    fromText: 'Laboratuvar',
    toLabel:  'Alıcı Adres',
    toText:   [d.destination_name, addr].filter(Boolean).join('\n') || '—',
  };
}

/** OSRM sürüş süresi (sn) → "~12 dk" / "~1 sa 5 dk". Kurye trafikte motorla genelde
 *  daha hızlıdır; bu sürüş tahmini üst-sınır sayılabilir. */
function fmtDuration(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h} sa ${mm} dk` : `${h} sa`;
}
function fmtKm(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
/** Teslim zaman damgası → "28.07.2026 · 14:16" (tarih + saat). */
function fmtDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** BanaBiKurye telefonu "905355244859" biçiminde gelir → "0535 524 48 59". */
/** ISO → "09:42". Geçersiz/boş girdide null (defansif: kayıtlar eksik olabiliyor). */
function fmtTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatPhone(raw: string): string {
  const d = String(raw).replace(/\D/g, '');
  const local = d.startsWith('90') && d.length === 12 ? '0' + d.slice(2) : d;
  return local.length === 11
    ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 9)} ${local.slice(9)}`
    : raw;
}

type DeliveryRow = {
  id:                   string;
  status:               'beklemede' | 'atandi' | 'teslim_alindi' | 'yolda' | 'teslim_edildi' | 'iptal';
  mode:                 'internal' | 'external';
  courier_id:           string | null;
  external_provider:    string | null;
  external_tracking_no: string | null;
  destination_name:     string | null;
  destination_address:  string | null;
  destination_phone:    string | null;
  /** 'lab_to_clinic' (lab çıkışı) | 'clinic_to_lab' (klinikten alım) */
  direction:            string | null;
  purpose:              string | null;
  /** Dış gönderide gerçek alım/teslim koordinatı + gönderen etiketi (NULL ise geocode/labCoord fallback) */
  origin_name?:         string | null;
  origin_address?:      string | null;
  origin_lat?:          number | null;
  origin_lng?:          number | null;
  dest_lat?:            number | null;
  dest_lng?:            number | null;
  picked_up_at:         string | null;
  delivered_at:         string | null;
  assigned_at:          string;
  work_order_id:        string;
  order_number?:        string | null;
  clinic_name?:         string | null;
  clinic_address?:      string | null;
  doctor_name?:         string | null;
  patient_name?:        string | null;
  courier_name?:        string | null;
  /** Dış kurye kimliği — track çağrısından kalıcılaştırılır (geçmiş gönderilerde gösterim). */
  ext_courier_name?:    string | null;
  ext_courier_phone?:   string | null;
  ext_courier_photo?:   string | null;
};

interface Props {
  accent:     string;           // panel renk
  pageBg?:    string;           // panel page bg
  routePrefix: string;          // e.g. '/(admin)' veya '/(lab)'
  courierId?: string;           // verilirse YALNIZ bu kuryenin teslimatları (kurye paneli)
}

export function CourierTrackingScreen({ accent, pageBg = '#F5F1EB', routePrefix, courierId }: Props) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const C = useCourierInk();
  const insets = useSafeAreaInsets();
  const emptyBg   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.4)';
  const emptyText = isDark ? 'rgba(247,242,233,0.65)' : C.inkMuted;
  // Glass panel (search + tabs container) — dark'ta koyu translucent
  const glassBg     = isDark ? 'rgba(20,16,12,0.55)'     : 'rgba(255,255,255,0.08)';
  const pillBg      = isDark ? 'rgba(255,255,255,0.10)'  : 'rgba(255,255,255,0.55)';
  const pillBorder  = isDark ? 'rgba(255,255,255,0.12)'  : 'rgba(255,255,255,0.6)';
  const tabsBg      = isDark ? 'rgba(255,255,255,0.06)'  : 'rgba(255,255,255,0.45)';
  const inkPrimary  = isDark ? '#F7F2E9'                  : C.ink;
  const inkMutedDark = isDark ? 'rgba(247,242,233,0.45)' : C.inkMuted;
  const placeholder = isDark ? 'rgba(247,242,233,0.45)' : '#7A7A7A';
  const { width: _vw } = useWindowDimensions();
  const isNarrow = _vw < 768;
  const router = useRouter();

  // localStorage cache — 2. ziyarette anında render
  const LS_KEY = `courier_tracking_v1:${routePrefix}`;
  const loadCached = (): DeliveryRow[] | null => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveCached = (rows: DeliveryRow[]) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(rows)); } catch { /* quota */ }
  };
  const cached = loadCached();

  // Sipariş detayı → "Kurye Takip" derin bağlantısı: ?delivery=<teslimat id>
  const searchParams = useLocalSearchParams<{ delivery?: string }>();
  const deepLinkId = typeof searchParams?.delivery === 'string' ? searchParams.delivery : null;

  const [tab, setTab]       = useState<'active' | 'done'>('active');
  const [search, setSearch] = useState('');
  const [list, setList]     = useState<DeliveryRow[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false); // mobil teslimat detay sheet
  // Liste yalnız SON taşımayı gösterir (kart yer kaplamasın); "Daha fazla"
  // ile geri kalanı açılır. Sekme/arama değişince tekrar kapanır.
  const [showAllDeliveries, setShowAllDeliveries] = useState(false);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const STATUS_CFG: Record<DeliveryRow['status'], { label: string; bg: string; fg: string }> = useMemo(() => ({
    beklemede:     { label: 'Beklemede', bg: `${accent}22`, fg: accent },
    atandi:        { label: 'Atandı',    bg: `${accent}22`, fg: accent },
    teslim_alindi: { label: 'Aldı',      bg: isDark ? 'rgba(59,130,246,0.20)'  : 'rgba(37,99,235,0.14)',  fg: isDark ? '#93C5FD' : '#1E3A8A' },
    yolda:         { label: 'Yolda',     bg: isDark ? 'rgba(59,130,246,0.28)'  : 'rgba(37,99,235,0.22)',  fg: isDark ? '#BFDBFE' : '#1E3A8A' },
    teslim_edildi: { label: 'Teslim',    bg: isDark ? 'rgba(52,211,153,0.18)'  : 'rgba(16,185,129,0.14)', fg: isDark ? '#6EE7B7' : '#0F6E50' },
    iptal:         { label: 'İptal',     bg: isDark ? 'rgba(248,113,113,0.18)' : 'rgba(220,38,38,0.14)',  fg: isDark ? '#FCA5A5' : '#9C2E2E' },
  }), [accent, isDark]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    let dq = supabase
      .from('deliveries')
      .select(`
        id, status, mode, courier_id, external_provider, external_tracking_no,
        destination_name, destination_address, destination_phone, direction, purpose,
        origin_name, origin_address, origin_lat, origin_lng, dest_lat, dest_lng,
        ext_courier_name, ext_courier_phone, ext_courier_photo,
        picked_up_at, delivered_at, assigned_at, work_order_id,
        work_order:work_orders!work_order_id(order_number, patient_name, doctor_id),
        courier:profiles!deliveries_courier_profiles_fkey(id, full_name)
      `);
    // Kurye panelinde YALNIZ kendi teslimatları; lab/admin'de (courierId yok) hepsi.
    if (courierId) dq = dq.eq('courier_id', courierId);
    const { data } = await dq
      .order('assigned_at', { ascending: false })
      .limit(100);
    // Klinik adı: geliş bacağında (clinic_to_lab) gönderen taraf klinik ama teslimat
    // kaydında tutulmuyor. doctors.clinic_id üzerinde FOREIGN KEY OLMADIĞI için
    // PostgREST gömme (embed) çalışmıyor → hekim ve klinik ayrı sorgularla çözülür.
    const docIds = Array.from(new Set(
      (data ?? []).map((r: any) => r.work_order?.doctor_id).filter(Boolean),
    ));
    const docMap = new Map<string, { name: string | null; clinicId: string | null }>();
    const clinicMap = new Map<string, { name: string | null; address: string | null }>();
    if (docIds.length) {
      const { data: docs } = await supabase
        .from('doctors').select('id, full_name, clinic_id').in('id', docIds);
      (docs ?? []).forEach((d: any) => docMap.set(d.id, { name: d.full_name ?? null, clinicId: d.clinic_id ?? null }));
      const clinicIds = Array.from(new Set(
        (docs ?? []).map((d: any) => d.clinic_id).filter(Boolean),
      ));
      if (clinicIds.length) {
        const { data: cls } = await supabase.from('clinics').select('id, name, address').in('id', clinicIds);
        (cls ?? []).forEach((c: any) => clinicMap.set(c.id, { name: c.name, address: c.address ?? null }));
      }
    }

    const rows = (data ?? []).map((r: any) => {
      const doc = r.work_order?.doctor_id ? docMap.get(r.work_order.doctor_id) : null;
      return {
        ...r,
        order_number: r.work_order?.order_number ?? null,
        patient_name: r.work_order?.patient_name ?? null,
        courier_name: r.courier?.full_name ?? null,
        doctor_name:    doc?.name ?? null,
        clinic_name:    doc?.clinicId ? (clinicMap.get(doc.clinicId)?.name ?? null) : null,
        clinic_address: doc?.clinicId ? (clinicMap.get(doc.clinicId)?.address ?? null) : null,
      };
    }) as DeliveryRow[];
    setList(rows);
    saveCached(rows);
    if (!silent) setLoading(false);
    if (rows.length && !selectedId) {
      // Sipariş detayındaki lojistik satırından gelindiyse (?delivery=<id>) o teslimatı
      // seç; ayrıca kayıt teslim edilmişse listeyi doğru sekmeye çevir, yoksa
      // "Yolda" sekmesinde görünmediği için seçim boşa düşerdi.
      const wanted = deepLinkId ? rows.find(r => r.id === deepLinkId) : null;
      if (wanted) {
        setSelectedId(wanted.id);
        setTab(wanted.status === 'teslim_edildi' || wanted.status === 'iptal' ? 'done' : 'active');
      } else {
        const firstActive = rows.find(r => r.status !== 'teslim_edildi' && r.status !== 'iptal');
        setSelectedId((firstActive ?? rows[0]).id);
      }
    }
  }, [selectedId, courierId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime burst'lerini debounce et — birden fazla update tek refetch'e düşer
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => { load(true); }, 400);
  }, [load]);

  useEffect(() => {
    // Cache varsa silent yükle — spinner gösterme, eski veriyi anında render
    load(cached !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel(`tracking-${routePrefix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleRefetch())
      .subscribe();
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, [scheduleRefetch, routePrefix]);

  const filtered = useMemo(() => {
    const isActive = (s: DeliveryRow['status']) => s !== 'teslim_edildi' && s !== 'iptal';
    return list
      .filter(r => tab === 'active' ? isActive(r.status) : r.status === 'teslim_edildi')
      .filter(r => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return [r.order_number, r.patient_name, r.destination_name, formatAddress(r.destination_address), r.courier_name, r.external_tracking_no]
          .some(v => v?.toLowerCase().includes(q));
      });
  }, [list, tab, search]);
  useEffect(() => { setShowAllDeliveries(false); }, [tab, search]);
  const visibleDeliveries = showAllDeliveries ? filtered : filtered.slice(0, 1);
  // "Daha fazla" açıkken liste uzayabilir → o zaman kart %45'e kadar büyür ve
  // kaydırılır; aksi halde (tek taşıma ya da boş durum) içeriğe göre büzülür.
  const panelExpanded = showAllDeliveries && filtered.length > 1;
  // Panelin ÖLÇÜLEN yüksekliği — haritanın fitBounds payı buradan beslenir,
  // yoksa rotanın alt ucu panelin arkasında kalıyor (tahmin yerine ölçüm).
  const [panelH, setPanelH] = useState(0);

  // ══════════════════════════════════════════════════════════════════════
  //  MOBİL TESLİMAT SHEET'İ — sürüklenebilir, üç duraklı
  //
  //  Katman sırası bilinçli:  harita → sheet → floating navbar → "+"
  //  Sheet'in alt sınırı navbar'ın GERÇEK geometrisinden (navBarMetrics)
  //  hesaplanır; sabit 100/120px değil. Navbar'ın blur'u ~24px komşuluktan
  //  piksel çektiği için üstünde nefes payı ŞART: 4px'te sheet yazıları camın
  //  içinden okunuyor ve iki yüzey birbirine binmiş gibi duruyordu.
  //
  //  Sheet hareket eder, NAVBAR SABİT kalır (navbar layout'un kardeşi, bu
  //  ağacın içinde değil) — sürükleme sırasında zıplama olmaz.
  // ══════════════════════════════════════════════════════════════════════
  const { height: _vh } = useWindowDimensions();
  const nav = useMemo(() => navBarMetrics(insets.bottom), [insets.bottom]);
  const solidGlass = useReduceTransparency();
  // Sheet ANA yüzey → KALIN materyal (apple-design §12: "bigger surfaces
  // should read as thicker"). Eskiden %8 beyaz + 3px blur'du: haritanın
  // etiketleri ve kart yazıları yüzeyin içinden okunuyordu, sheet kendi başına
  // okunabilir bir yüzey değildi. Navbar İNCE kalır → hiyerarşi net.
  const glass = navGlass(isDark, 'thick', solidGlass);

  type Snap = 'collapsed' | 'half' | 'expanded';
  const SNAP = useMemo(() => {
    // COLLAPSED: arama + tek teslimat kartı sığacak kadar (boş listede daha az).
    const collapsed = Math.min(filtered.length === 0 ? 146 : 208, Math.round(_vh * 0.32));
    const half = Math.round(_vh * 0.5);
    // EXPANDED: durum çubuğunun altında durur, haritadan bir şerit hep görünür.
    const expanded = Math.max(half + 48, Math.round(_vh - insets.top - 22 - nav.clearance));
    return { collapsed, half, expanded };
  }, [_vh, insets.top, nav.clearance, filtered.length]);

  const [snap, setSnap] = useState<Snap>('collapsed');
  const [dragging, setDragging] = useState(false);
  // Haritanın fitBounds payı — YALNIZ durak oturduğunda güncellenir (sürükleme
  // sırasında setState fırtınası olmasın).
  const [sheetVisibleH, setSheetVisibleH] = useState(SNAP.collapsed);
  const sheetH = useRef(new Animated.Value(SNAP.collapsed)).current;
  const hRef = useRef(SNAP.collapsed);
  const startHRef = useRef(SNAP.collapsed);
  const scrollTopRef = useRef(0);

  const settle = useCallback((to: Snap) => {
    const target = SNAP[to];
    setSnap(to);
    setSheetVisibleH(target);
    hRef.current = target;
    if (prefersReducedMotion()) { sheetH.setValue(target); return; }
    Animated.spring(sheetH, {
      toValue: target, damping: 24, stiffness: 220, mass: 0.9,
      useNativeDriver: false,   // height animasyonu layout → JS driver şart
    }).start();
  }, [SNAP, sheetH]);

  // Ekran döndü / durak yükseklikleri değişti → mevcut durağa yeniden otur
  useEffect(() => {
    if (dragging) return;
    const target = SNAP[snap];
    hRef.current = target;
    sheetH.setValue(target);
    setSheetVisibleH(target);
  }, [SNAP, snap, dragging, sheetH]);

  /** Sürükleme bittiğinde en yakın durak — hıza (fling) göre bir sonrakine geç. */
  const releaseTo = useCallback((vyUp: number): Snap => {
    const order: Snap[] = ['collapsed', 'half', 'expanded'];
    const cur = hRef.current;
    if (vyUp > 0.55) {
      // hızlı yukarı → bir üst durak
      const next = order.find(k => SNAP[k] > cur + 8);
      return next ?? 'expanded';
    }
    if (vyUp < -0.55) {
      const below = order.filter(k => SNAP[k] < cur - 8);
      return below.length ? below[below.length - 1] : 'collapsed';
    }
    // yavaş bırakış → en yakın durak
    return order.reduce((best, k) =>
      Math.abs(SNAP[k] - cur) < Math.abs(SNAP[best] - cur) ? k : best, 'collapsed' as Snap);
  }, [SNAP]);

  const onDragStart = useCallback(() => {
    setDragging(true);
    startHRef.current = hRef.current;
  }, []);
  const onDragMove = useCallback((dy: number) => {
    // dy>0 aşağı → yükseklik azalır
    const h = Math.min(SNAP.expanded, Math.max(SNAP.collapsed, startHRef.current - dy));
    hRef.current = h;
    sheetH.setValue(h);
  }, [SNAP, sheetH]);
  const onDragEnd = useCallback((vy: number) => {
    setDragging(false);
    settle(releaseTo(-vy));
  }, [settle, releaseTo]);

  /**
   * Tutamaç jesti — tutamaç bir Pressable OLAMAZ: Pressable kendi responder'ını
   * kurup yayılan panHandlers proplarını eziyor (sürükleme hiç başlamıyordu,
   * yalnız dokunma çalışıyordu). Bu yüzden düz View + tek PanResponder:
   * küçük hareket = dokunma (durak değiştir), büyük hareket = sürükleme.
   */
  const handlePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: onDragStart,
    onPanResponderMove: (_e, g) => onDragMove(g.dy),
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6) {
        setDragging(false);
        settle(hRef.current <= SNAP.collapsed + 8 ? 'half' : 'collapsed');
        return;
      }
      onDragEnd(g.vy);
    },
    onPanResponderTerminate: (_e, g) => onDragEnd(g.vy),
  }), [onDragStart, onDragMove, onDragEnd, settle, SNAP.collapsed]);

  // Başlık (arama + sekmeler) üzerinden sürükleme — 6px eşiği: dokunuşlar
  // (arama alanına odaklanma, sekme seçimi) korunur.
  const headerPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: onDragStart,
    onPanResponderMove: (_e, g) => onDragMove(g.dy),
    onPanResponderRelease: (_e, g) => onDragEnd(g.vy),
    onPanResponderTerminate: (_e, g) => onDragEnd(g.vy),
  }), [onDragStart, onDragMove, onDragEnd]);

  // Liste üzerinden sürükleme — jest hiyerarşisi:
  //   • sheet tam açık DEĞİLSE → sürükleme sheet'i taşır
  //   • tam açıkken → içerik kaydırılır; YALNIZ liste en tepedeyken ve aşağı
  //     çekiliyorsa sheet kapanır
  const listPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_e, g) => {
      if (Math.abs(g.dy) < 6 || Math.abs(g.dy) < Math.abs(g.dx)) return false;
      if (hRef.current < SNAP.expanded - 8) return true;
      return scrollTopRef.current <= 0 && g.dy > 0;
    },
    onPanResponderGrant: onDragStart,
    onPanResponderMove: (_e, g) => onDragMove(g.dy),
    onPanResponderRelease: (_e, g) => onDragEnd(g.vy),
    onPanResponderTerminate: (_e, g) => onDragEnd(g.vy),
  }), [SNAP.expanded, onDragStart, onDragMove, onDragEnd]);

  const sheetCollapsed = snap === 'collapsed';

  const selected = useMemo(() => list.find(r => r.id === selectedId) ?? null, [list, selectedId]);
  // Dış kurye (BanaBiKurye) canlı konumu — kendi kuryemiz gps_pings'e yazar,
  // dış sağlayıcının kuryesi için konum sağlayıcı API'sinden çekilir.
  const { courier: extCourier } = useExternalCourier(selected);

  // Tahmini varış — CourierTrackingMap OSRM rota süresini buraya verir.
  // `live`: rota kuryenin anlık konumundan başlıyorsa true (gerçek varış tahmini);
  // false ise süre yalnızca çıkış→teslim güzergâhının süresidir.
  const [eta, setEta] = useState<{ durationSec: number | null; distanceM: number | null; live: boolean } | null>(null);
  useEffect(() => { setEta(null); }, [selected?.id]);

  // Laboratuvarın koordinatı — kurye entegrasyonundaki alış noktası (pickup_lat/lng).
  // Lab çıkışlı gönderilerde rotanın başlangıcı; teslim edilmişlerde de rota çizilsin diye.
  const [labCoord, setLabCoord] = useState<{ lat: number; lng: number } | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    // Not: PostgrestBuilder'da .catch() yok — try/catch ile sarmalanır.
    (async () => {
      try {
        // Kurye tipinde birden çok sağlayıcı aynı anda aktif olabilir; RPC
        // tipteki ilk satırı döndürdüğü için hepsini okuyup KOORDİNATI OLANı
        // seçiyoruz (Shipink gibi kargo entegrasyonlarında enlem/boylam yok).
        const { data } = await supabase
          .from('provider_credentials')
          .select('credentials')
          .eq('type', 'courier').eq('is_active', true);
        if (cancelled) return;
        for (const r of ((data ?? []) as any[])) {
          const lat = Number(r?.credentials?.pickup_lat);
          const lng = Number(r?.credentials?.pickup_lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) { setLabCoord({ lat, lng }); break; }
        }
      } catch { /* entegrasyon yoksa rota çıkış noktası olmadan çalışır */ }
    })();
    return () => { cancelled = true; };
  }, []);
  // Kurye panelinde order/[id] rotası YOK → delivery detayına git (aksi halde siyah sayfa).
  const goOrder = (workOrderId: string, deliveryId?: string) => {
    if (courierId && deliveryId) { router.push(`/(courier)/delivery/${deliveryId}` as any); return; }
    router.push(`${routePrefix}/order/${workOrderId}` as any);
  };

  const cancelDelivery = useCallback((d: DeliveryRow) => {
    // Doğrudan tablo update'i yerine RPC: cancelled_at/cancel_reason'ı da yazar.
    // Yetki kontrolü RLS ile birebir aynı (admin · lab manager/admin · kuryenin kendisi),
    // ama RPC yetkisizde hata döndürür — RLS sessizce 0 satır güncelliyordu.
    const confirm = () => {
      (async () => {
        try {
          const { error } = await supabase.rpc('update_delivery_status', {
            p_delivery_id: d.id,
            p_status: 'iptal',
            p_note: 'Panelden iptal edildi',
          });
          if (error) { toast.error('Teslimat iptal edilemedi: ' + error.message); return; }
          load(true);
        } catch (e: any) {
          toast.error(autoT('Teslimat iptal edilemedi:') + ' ' + (e?.message ?? autoT('bilinmeyen hata')));
        }
      })();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`"#${d.order_number ?? d.id.slice(0, 8)}" ${autoT('teslimatını iptal etmek istediğinizden emin misiniz?')}`)) confirm();
    } else {
      Alert.alert(
        autoT('Teslimatı İptal Et'),
        `"#${d.order_number ?? d.id.slice(0, 8)}" ${autoT('teslimatını iptal etmek istediğinizden emin misiniz?')}`,
        [{ text: autoT('Vazgeç'), style: 'cancel' }, { text: autoT('İptal Et'), style: 'destructive', onPress: confirm }],
      );
    }
  }, [load]);

  const glassStrong = Platform.OS === 'web' ? {
    backdropFilter: 'blur(3px) saturate(120%)',
    WebkitBackdropFilter: 'blur(3px) saturate(120%)',
    boxShadow: isDark
      ? '0 12px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)'
      : '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
  } as any : {};

  return (
    <View style={{ flex: 1, position: 'relative' as any, backgroundColor: isDark ? '#0E0E0E' : pageBg }}>
      {/* Map — desktop ve mobile'da tüm ekran (sayfa zemini) */}
      <View style={{
        position: 'absolute' as any,
        top: isNarrow ? 0 : 16,
        left: isNarrow ? 0 : 16,
        right: isNarrow ? 0 : 16,
        bottom: isNarrow ? 0 : 16,
      }}>
        <View style={{
          flex: 1,
          borderRadius: isNarrow ? 0 : 22,
          overflow: 'hidden',
          backgroundColor: C.mapBg,
        }}>
          <CourierTrackingMap
            deliveryId={selected?.id}
            externalPosition={extCourier?.lat != null && extCourier?.lng != null
              ? { lat: extCourier.lat, lng: extCourier.lng } : null}
            // Çıkış noktası: dış gönderide saklı gerçek koordinat (origin_lat/lng) —
            // panelden özel adresle açılan gönderide bu kesin. Yoksa: lab çıkışında
            // laboratuvarın koordinatı, klinikten alımda klinik adresi (geokod).
            origin={(selected?.origin_lat != null && selected?.origin_lng != null)
              ? { lat: Number(selected.origin_lat), lng: Number(selected.origin_lng) }
              : (selected?.direction !== 'clinic_to_lab' ? labCoord : undefined)}
            // Klinik/tedarikçi adresi de JSON olarak saklanıyor → geokodlamadan önce metne çevir.
            originLabel={selected?.direction === 'clinic_to_lab'
              ? (formatAddress(selected?.origin_address) || formatAddress(selected?.clinic_address) || undefined) : undefined}
            // Teslim: dış gönderide saklı gerçek koordinat; yoksa adresten geokod.
            destination={(selected?.dest_lat != null && selected?.dest_lng != null)
              ? { lat: Number(selected.dest_lat), lng: Number(selected.dest_lng) } : undefined}
            destinationLabel={formatAddress(selected?.destination_address) || selected?.destination_name || undefined}
            accent={accent}
            height="100%"
            onRouteInfo={setEta}
            // Dar ekranda panel haritanın altına biner; rota onun arkasında
            // kalmasın diye ölçülen yükseklik + alt boşluk pay olarak geçilir.
            // Rota/marker'lar sheet'in ve navbar'ın arkasında kalmasın.
            // Durak oturduğunda güncellenen GÖRÜNEN yükseklik + navbar payı.
            bottomInset={isNarrow ? sheetVisibleH + nav.clearance : 0}
          />
        </View>
      </View>


      {/* LEFT — teslimat yüzeyi
          Mobile: SÜRÜKLENEBİLİR sheet (collapsed / half / expanded) · Desktop:
          sol 300px yüzen cam panel (davranış değişmedi).

          Mobilde alt sınır navbar'ın GERÇEK geometrisinden (nav.clearance)
          gelir — eskiden `max(insets.bottom,12) + 56 + 16` yazılıydı ve o 56,
          artık kullanılmayan FabTabBar'ın yüksekliğiydi: yeni floating navbar
          60pt olduğu için sheet barın blur alanına giriyor, yazıları camın
          içinden okunuyordu.

          Sheet kendi başına okunabilir bir yüzey: navbar onun İÇERİĞİNİ
          kapatmaz, ikisi harita üzerinde yaşayan iki ayrı yüzey olarak
          okunur (aynı materyal dili, farklı bileşen). */}
      <View style={{
        position: 'absolute' as any,
        // RTL: yüzen panel BAŞLANGIÇ kenarında durmalı — `start` inline stili
        // güvenilir çalışmadığı için tarafı açıkça hesaplıyoruz.
        ...(isNarrow
          ? { left: 16, right: 16 }
          : (isRTL() ? { right: 16 } : { left: 16 })),
        ...(isNarrow ? null : { top: 16 }),
        // Desktop'ta alttan 46: haritanın sol-alt köşesindeki Google logosu +
        // atıf ToS gereği görünür kalmalı; kart onu örtmesin.
        bottom: isNarrow ? nav.clearance : 46,
        width: isNarrow ? undefined : 300,
        justifyContent: isNarrow ? 'flex-end' : undefined,
        // Katman: harita(0) → sheet(900) → navbar/+ (layout kardeşi, üstte)
        // @ts-ignore
        zIndex: isNarrow ? 900 : 1000,
      }}>
        <Animated.View
          onLayout={e => setPanelH(e.nativeEvent.layout.height)}
          {...(isNarrow ? listPan.panHandlers : {})}
          style={{
          // Mobilde yükseklik animasyonlu (durak → durak). İçerik flex ile
          // yerleştiği için arama çubuğu her zaman kartın tepesinde kalır ve
          // liste aşağıdan açığa çıkar.
          ...(isNarrow ? { height: sheetH as any } : { flex: 1 }),
          // Native'de backdrop-blur yok (glassStrong web-only) → %8 cam arka plan
          // haritayı sızdırıp yazıları okunmaz yapıyordu. Native'de OPAK yüzey +
          // hafif kenarlık; web'de buzlu cam korunur.
          borderRadius: isNarrow ? 26 : 22,
          overflow: 'hidden',
          // Mobil sheet: kalın cam (aynı aile, farklı ağırlık).
          // Desktop panel: mevcut ince cam formülü DEĞİŞMEDİ.
          ...(isNarrow
            ? {
                ...navSurfaceStyle(glass),
                ...(Platform.OS === 'web'
                  ? null
                  : { backgroundColor: isDark ? '#17130F' : '#FFFFFF', borderWidth: 1, borderColor: glass.border }),
              }
            : {
                backgroundColor: Platform.OS === 'web' ? glassBg : (isDark ? '#17130F' : '#FFFFFF'),
                ...(Platform.OS !== 'web' ? {
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                } : {}),
                ...glassStrong,
              }),
        }}>
          {/* Web camının blur katmanı (ayrı çocuk — bkz. GlassBlurLayer) */}
          {isNarrow && <GlassBlurLayer glass={glass} radius={26} />}
          {/* Sürükleme tutamacı — sheet'in çekilebilir olduğunu söyler.
              Dokunmak da durak değiştirir (yalnız tutamaç alanı; liste
              kartlarının kendi dokunuşları korunur). */}
          {isNarrow && (
            <View
              {...handlePan.panHandlers}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={autoT('Teslimat listesi')}
              accessibilityValue={{ text: autoT(sheetCollapsed ? 'küçük' : (snap === 'half' ? 'yarım' : 'tam açık')) }}
              accessibilityHint={autoT('Yukarı çekerek listeyi büyüt, aşağı çekerek küçült')}
              style={{ paddingTop: 9, paddingBottom: 5, alignItems: 'center' }}
            >
              <View style={{
                width: 40, height: 5, borderRadius: 3,
                backgroundColor: isDark
                  ? `rgba(255,255,255,${dragging ? 0.34 : 0.18})`
                  : `rgba(15,23,42,${dragging ? 0.28 : 0.14})`,
              }} />
            </View>
          )}
          <View {...(isNarrow ? headerPan.panHandlers : {})} style={{ padding: 12, paddingTop: isNarrow ? 6 : 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: pillBg, borderWidth: 1, borderColor: pillBorder }}>
              <Search size={14} color={inkMutedDark} strokeWidth={1.8} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Sipariş, hasta, kurye, tracking no..."
                placeholderTextColor={placeholder}
                style={{ flex: 1, fontSize: 13, color: inkPrimary, ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}) }}
              />
            </View>

            {/* Collapsed'da yalnız ARAMA + özet + tek kayıt görünür (spec):
                sekmeler ve geri kalan liste yukarı çekilince açılır. */}
            {(!isNarrow || !sheetCollapsed) && (
              <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: tabsBg, borderWidth: 1, borderColor: pillBorder }}>
                <TabButton active={tab === 'active'} onPress={() => setTab('active')} label="Yolda" accent={accent} />
                <TabButton active={tab === 'done'}   onPress={() => setTab('done')}   label="Teslim Edildi" accent={accent} />
              </View>
            )}
            {isNarrow && sheetCollapsed && filtered.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: inkPrimary }}>
                  {`${filtered.length} ${autoT('teslimat')}`}
                </Text>
                {filtered.length > 1 && (
                  <Text style={{ fontSize: 11, color: inkMutedDark }}>{autoT('tümü için yukarı çek')}</Text>
                )}
              </View>
            )}
          </View>

          <ScrollView
            // Mobilde animasyonlu yüksekliğin kalanını doldurur → her durakta
            // görünür alan = kaydırma penceresi (half'ta da liste kaydırılır).
            style={isNarrow ? { flex: 1 } : undefined}
            // Jest hiyerarşisi: collapsed'da kaydırma KAPALI (sürükleme sheet'i
            // taşır), half/expanded'da açık. Expanded + tepede + aşağı çekiş →
            // listPan devralır ve sheet kapanır.
            scrollEnabled={!isNarrow || !sheetCollapsed}
            onScroll={e => { scrollTopRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            // Bu yüzeyin kaydırması floating navbar'ı OYNATMAMALI (navigasyon
            // harita ekranında sabit kalır) — bkz. navScroll.ts opt-out.
            {...({ dataSet: { navscroll: 'off' } } as any)}
            contentContainerStyle={{
              padding: 14,
              paddingTop: isNarrow ? 4 : insets.top + 8,
              gap: 10,
              // Mobilde sheet zaten navbar'ın üstünde bitiyor → 120px ölü alan
              // gerekmez; desktop'ta panel alta kadar iniyor, pay kalsın.
              paddingBottom: isNarrow ? 18 : 120,
            }}
          >
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={accent} />
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center', backgroundColor: emptyBg, borderRadius: 14 }}>
                <Text style={{ fontSize: 12, color: emptyText }}>Bu durumda teslimat yok</Text>
              </View>
            ) : (
              <>
                {(isNarrow ? (sheetCollapsed ? filtered.slice(0, 1) : filtered) : visibleDeliveries).map(d => (
                  <DeliveryListCard
                    key={d.id}
                    d={d}
                    accent={accent}
                    isNarrow={isNarrow}
                    statusCfg={STATUS_CFG}
                    selected={selectedId === d.id}
                    onSelect={() => { setSelectedId(d.id); if (isNarrow) setDetailOpen(true); }}
                    onOpenOrder={() => goOrder(d.work_order_id, d.id)}
                    onCancel={d.status === 'beklemede' ? () => cancelDelivery(d) : undefined}
                  />
                ))}
                {!isNarrow && !showAllDeliveries && filtered.length > 1 && (
                  <Pressable
                    onPress={() => setShowAllDeliveries(true)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 10, borderRadius: 12,
                      backgroundColor: tabsBg, borderWidth: 1, borderColor: pillBorder,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: inkPrimary }}>
                      {`Daha fazla (${filtered.length - 1})`}
                    </Text>
                  </Pressable>
                )}
                {!isNarrow && showAllDeliveries && filtered.length > 1 && (
                  <Pressable
                    onPress={() => setShowAllDeliveries(false)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 10, borderRadius: 12,
                      backgroundColor: tabsBg, borderWidth: 1, borderColor: pillBorder,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: inkPrimary }}>Daha az göster</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {/* RIGHT — selected delivery cards (mobile: gizli, desktop: glass overlay) */}
      <View style={{ flex: 1, position: 'relative' as any, ...(Platform.OS === 'web' ? { pointerEvents: 'none' } as any : {}) }}>
        {selected && !isNarrow && (
          <View style={{
            // top: harita üst sınırı sayfa top:16'da; kart bundan 16px aşağıda dursun → 32.
            // Kabuğun arama/profil pill'i haritanın ÜSTÜNDE kaldığı için bu değerde çakışmaz.
            // bottom vermiyoruz: kutu içeriği kadar yer kaplasın, altında kalan harita
            // sürüklenebilir kalsın (tam boy kapsayıcı tıklamaları yutuyordu).
            position: 'absolute', end: 24, top: 32,
            width: 320,
            // @ts-ignore
            zIndex: 1000,
            ...(Platform.OS === 'web' ? { pointerEvents: 'auto' } as any : {}),
          }}>
            {/* ─── TEK GLASS KUTU ───
                Kurye · tahmini varış · rota · kargo takip tek kart içinde, aralarında
                hairline ayraç. (Önceden 4 ayrı yüzen kart vardı; haritayı parçalıyordu.) */}
            <View style={{
              backgroundColor: isDark ? 'rgba(20,16,12,0.62)' : 'rgba(255,255,255,0.08)',
              borderRadius: 22, overflow: 'hidden',
              borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)',
              ...(Platform.OS === 'web' ? {
                backdropFilter: 'blur(3px) saturate(120%)',
                WebkitBackdropFilter: 'blur(3px) saturate(120%)',
                boxShadow: isDark
                  ? '0 12px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)'
                  : '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
              } as any : {}),
            }}>
              {/* ─── Kurye ─── */}
              <View style={{
                padding: 14,
                flexDirection: 'row', alignItems: 'center', gap: 12,
              }}>
                {/* Canlı takipten (extCourier) → kalıcı kolonlar → iç kurye → sağlayıcı.
                    Geçmiş dış gönderilerde ext_courier_* dolu geldiği için ad/foto burada çıkar. */}
                <CourierAvatar
                  size={44}
                  accent={accent}
                  initialsColor={accent}
                  photo={extCourier?.photoUrl ?? selected.ext_courier_photo}
                  name={extCourier?.name ?? selected.ext_courier_name ?? selected.courier_name ?? selected.external_provider ?? 'K'}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Dış kuryede API gerçek kurye adını veriyor → onu başlığa al,
                      sağlayıcı adı alt satıra düşsün. Yoksa eski davranış. */}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }} numberOfLines={1}>
                    {extCourier?.name ?? selected.ext_courier_name ?? selected.courier_name ?? selected.external_provider ?? 'Kurye'}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.inkMuted }} numberOfLines={1}>
                    {selected.mode === 'internal'
                      ? 'Bizim kurye'
                      : [selected.external_provider ?? 'Dış kargo',
                         (() => { const p = extCourier?.phone ?? selected.ext_courier_phone; return p ? formatPhone(p) : null; })()]
                          .filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    onPress={() => {
                      // Kuryeye WhatsApp'tan yaz (hem web hem mobil). Numara yoksa uyar.
                      const raw = (extCourier?.phone ?? selected.ext_courier_phone ?? selected.destination_phone ?? '');
                      let d = raw.replace(/\D/g, '');
                      if (!d) { Alert.alert('Telefon yok', 'Mesaj gönderilecek numara bulunamadı.'); return; }
                      if (d.startsWith('0')) d = '90' + d.slice(1); else if (d.length === 10) d = '90' + d;
                      const tno = (selected as any).external_tracking_no ? ` (#${(selected as any).external_tracking_no})` : '';
                      const text = encodeURIComponent(`Merhaba, BanaBiKurye gönderisi${tno} hakkında bilgi almak istiyorum.`);
                      Linking.openURL(`https://wa.me/${d}?text=${text}`)
                        .catch(() => { Linking.openURL(`sms:${raw.replace(/[^\d+]/g, '')}`).catch(() => {}); });
                    }}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: (extCourier?.phone ?? selected.ext_courier_phone ?? selected.destination_phone) ? C.btnBg : `${C.btnBg}66`,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <MessageSquare size={14} color={C.btnFg} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      // Dış kuryede API'den / kayıtlı kurye telefonu; yoksa alıcı telefonu.
                      const tel = (extCourier?.phone ?? selected.ext_courier_phone ?? selected.destination_phone ?? '').replace(/[^\d+]/g, '');
                      if (!tel) { Alert.alert('Telefon yok', 'Bu teslimat için aranacak bir numara bulunamadı.'); return; }
                      Linking.openURL(`tel:${tel}`).catch(() => {});
                    }}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: (extCourier?.phone ?? selected.ext_courier_phone ?? selected.destination_phone) ? accent : `${accent}66`,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Phone size={14} color="#FFF" strokeWidth={2} />
                  </Pressable>
                </View>
              </View>

              {/* ─── Zaman Çizelgesi (katlanabilir) ─── */}
              <View style={C.hairline} />
              <DeliveryTimeline delivery={selected} etaSec={eta?.durationSec} accent={accent} flush />

              {/* ─── Tahmini Varış ───
                  Kurye canlı konum verirken rota kuryeden başlar → gerçek varış tahmini.
                  Konum yoksa süre çıkış→teslim güzergâhınındır, etiket ona göre değişir.
                  Biten/iptal gönderide anlamsız olduğu için gizlenir. */}
              {eta?.durationSec != null && selected.status !== 'teslim_edildi' && selected.status !== 'iptal' && (
                <>
                  <View style={C.hairline} />
                  <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 38, height: 38, borderRadius: 19, backgroundColor: `${accent}1F`,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Clock size={19} color={accent} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                        {eta.live ? 'Tahmini Varış' : 'Güzergâh Süresi'}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>
                        ~{fmtDuration(eta.durationSec)}
                        {eta.distanceM != null ? <Text style={{ fontSize: 12, fontWeight: '600', color: C.inkMuted }}>{`  ·  ${fmtKm(eta.distanceM)}`}</Text> : null}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {/* ─── Teslim Edildi (tarih + saat) ─── */}
              {selected.delivered_at && fmtDateTime(selected.delivered_at) && (
                <>
                  <View style={C.hairline} />
                  <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 38, height: 38, borderRadius: 19, backgroundColor: C.greenBg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <PackageCheck size={19} color={C.green} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: C.green, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                        Teslim Edildi
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>
                        {fmtDateTime(selected.delivered_at)}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {/* ─── Rota (Gönderen → Alıcı) ─── */}
              <View style={C.hairline} />
              <View style={{ padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ width: 14, alignItems: 'center', paddingTop: 4, gap: 3 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: accent }} />
                    <View style={{ width: 1, height: 26, backgroundColor: `${accent}66` }} />
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
                  </View>
                  <View style={{ flex: 1, gap: 14 }}>
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>Gönderen</Text>
                      <Text style={{ fontSize: 12, color: C.ink, fontWeight: '500' }} numberOfLines={2}>{routeEndpoints(selected).fromText}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>{routeEndpoints(selected).toLabel}</Text>
                      <Text style={{ fontSize: 12, color: C.ink, fontWeight: '500', lineHeight: 16 }} numberOfLines={3}>{routeEndpoints(selected).toText}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* ─── External tracking varsa göster ─── */}
              {selected.mode === 'external' && selected.external_tracking_no && (
                <>
                  <View style={C.hairline} />
                  <View style={{ padding: 14, gap: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: C.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>Kargo Takip</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>
                      {selected.external_provider} · #{selected.external_tracking_no}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}
      </View>

      {/* MOBİL — teslimat detay bottom sheet (karta tıklayınca açılır) */}
      <Modal visible={isNarrow && detailOpen && !!selected} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <Pressable onPress={() => setDetailOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'flex-end', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: C.sheetBg, borderTopStartRadius: 24, borderTopEndRadius: 24, paddingTop: 8, paddingBottom: insets.bottom + 20, paddingHorizontal: 16, gap: 14 }}>
            {/* Grabber + başlık */}
            <View style={{ alignItems: 'center', marginBottom: 2 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.grabber }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>
                  Teslimat · #{selected?.order_number ?? '—'}
                </Text>
                {selected?.patient_name ? (
                  <Text style={{ fontSize: 12, color: C.inkMuted, marginTop: 1 }} numberOfLines={1}>{selected.patient_name}</Text>
                ) : null}
              </View>
              {selected ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: STATUS_CFG[selected.status]?.bg }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: STATUS_CFG[selected.status]?.fg }}>{STATUS_CFG[selected.status]?.label}</Text>
                </View>
              ) : null}
              <Pressable onPress={() => setDetailOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.closeBg }}>
                <X size={16} color={C.inkMuted} strokeWidth={2} />
              </Pressable>
            </View>

            {selected ? (
              <>
                {/* Kurye */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.softBg, borderWidth: 1, borderColor: C.softBorder }}>
                  <CourierAvatar
                    size={44}
                    accent={accent}
                    initialsColor={accent}
                    photo={extCourier?.photoUrl ?? selected.ext_courier_photo}
                    name={extCourier?.name ?? selected.ext_courier_name ?? selected.courier_name ?? selected.external_provider ?? 'K'}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }} numberOfLines={1}>{extCourier?.name ?? selected.ext_courier_name ?? selected.courier_name ?? selected.external_provider ?? 'Kurye'}</Text>
                    <Text style={{ fontSize: 11, color: C.inkMuted }} numberOfLines={1}>
                      {selected.mode === 'internal'
                        ? 'Bizim kurye'
                        : [selected.external_provider ?? 'Dış kargo',
                           (() => { const p = extCourier?.phone ?? selected.ext_courier_phone; return p ? formatPhone(p) : null; })()]
                            .filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>

                {/* Zaman çizelgesi (katlanabilir) */}
                <DeliveryTimeline delivery={selected} etaSec={eta?.durationSec} accent={accent} />

                {/* Tahmini varış — OSRM rota süresinden hesaplanır (BanaBiKurye ETA
                    vermiyor). Kurye canlı değilse süre güzergâhın kendisine aittir. */}
                {eta?.durationSec != null && selected.status !== 'teslim_edildi' && selected.status !== 'iptal' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: `${accent}12`, borderWidth: 1, borderColor: `${accent}33` }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `${accent}1F`, alignItems: 'center', justifyContent: 'center' }}>
                      <Clock size={19} color={accent} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                        {eta.live ? 'Tahmini Varış' : 'Güzergâh Süresi'}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>
                        ~{fmtDuration(eta.durationSec)}
                        {eta.distanceM != null ? <Text style={{ fontSize: 12, fontWeight: '600', color: C.inkMuted }}>{`  ·  ${fmtKm(eta.distanceM)}`}</Text> : null}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Teslim edildi (tarih + saat) */}
                {selected.delivered_at && fmtDateTime(selected.delivered_at) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: 'rgba(16,185,129,0.10)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.28)' }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(16,185,129,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                      <PackageCheck size={19} color={C.green} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: C.green, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                        Teslim Edildi
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }} numberOfLines={1}>
                        {fmtDateTime(selected.delivered_at)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Rota */}
                <View style={{ padding: 14, borderRadius: 16, backgroundColor: C.softBg, borderWidth: 1, borderColor: C.softBorder }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ width: 14, alignItems: 'center', paddingTop: 4, gap: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: accent }} />
                      <View style={{ width: 1, height: 26, backgroundColor: `${accent}66` }} />
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
                    </View>
                    <View style={{ flex: 1, gap: 14 }}>
                      <View>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>Gönderen</Text>
                        <Text style={{ fontSize: 13, color: C.ink, fontWeight: '500' }}>{routeEndpoints(selected).fromText}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>{routeEndpoints(selected).toLabel}</Text>
                        <Text style={{ fontSize: 13, color: C.ink, fontWeight: '500', lineHeight: 18 }}>{routeEndpoints(selected).toText}</Text>
                        {selected.destination_phone ? (
                          <Text style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{selected.destination_phone}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>

                {/* Kargo takip (external) */}
                {selected.mode === 'external' && selected.external_tracking_no ? (
                  <View style={{ padding: 14, borderRadius: 16, backgroundColor: C.softBg, borderWidth: 1, borderColor: C.softBorder, gap: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: C.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>Kargo Takip</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{selected.external_provider} · #{selected.external_tracking_no}</Text>
                  </View>
                ) : null}

                {/* Aksiyonlar */}
                <View style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => { setDetailOpen(false); goOrder(selected.work_order_id, selected.id); }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: accent }}
                  >
                    <Package size={15} color="#FFF" strokeWidth={2} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>İş Emrini Aç</Text>
                  </Pressable>
                  {selected.status === 'beklemede' && (
                    <Pressable
                      onPress={() => { setDetailOpen(false); cancelDelivery(selected); }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(220,38,38,0.08)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.20)' }}
                    >
                      <Trash2 size={15} color="#DC2626" strokeWidth={2} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#DC2626' }}>Teslimatı İptal Et</Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function TabButton({ active, onPress, label, accent }: { active: boolean; onPress: () => void; label: string; accent: string }) {
  const C = useCourierInk();
  const inactiveColor = C.inkMuted;
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center', backgroundColor: active ? accent : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFF' : inactiveColor }}>{label}</Text>
    </Pressable>
  );
}

function InfoCol({ label, value, flex }: { label: string; value: string; flex?: number }) {
  const C = useCourierInk();
  return (
    <View style={{ flex: flex ?? 1, gap: 2, minWidth: 0 }}>
      <Text style={{ fontSize: 9, fontWeight: '700', color: C.inkFaint, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 12, color: C.ink, fontWeight: '500' }} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Teslimat Zaman Çizelgesi (katlanabilir) ──────────────────────────
//
// NEDEN: kurye kartı yalnız "şu an neredeyiz"i gösteriyordu; "ne zaman ne oldu"
// bilgisi tarih alanlarına dağılmıştı (assigned_at / picked_up_at / delivered_at
// ayrı ayrı kutulardaydı). Tek bir dikey çizelgede toplandı.
//
// KAPALI GELİR: kart zaten yoğun; kapalıyken tek satır özet (son gerçekleşen
// adım + saati) verir, açılınca tüm adımlar görünür.
//
// UYDURULMUŞ SAAT YOK: yalnız kayıtta var olan zaman damgaları yazılır. Süresi
// olmayan adım (ör. "Yolda") saat göstermez; tahmini teslim, ETA varsa ve iş
// henüz teslim edilmediyse "~" ile işaretlenir.
type TimelineStep = {
  key: string;
  label: string;
  time: string | null;
  state: 'done' | 'active' | 'pending';
  estimate?: boolean;
};

function buildTimeline(
  d: DeliveryRow,
  etaSec: number | null | undefined,
): TimelineStep[] {
  const incoming = d.direction === 'clinic_to_lab';
  const cancelled = d.status === 'iptal';
  const delivered = d.status === 'teslim_edildi';
  // ÖNEMLİ: status='yolda' TEK BAŞINA "alındı" kanıtı DEĞİL. Kendi kuryemiz alımda
  // picked_up_at yazar (delivery/api.ts), ama harici sağlayıcı (BanaBiKurye) kurye
  // alım noktasına giderken de 'active→yolda' raporlar ve picked_up_at NULL kalır.
  // Bu yüzden gerçek alım kanıtı = picked_up_at (veya teslim edilmiş olması).
  const picked    = !!d.picked_up_at || delivered;
  const inProgress = !cancelled && !delivered;

  const steps: TimelineStep[] = [
    {
      key: 'assigned',
      label: 'Kurye atandı',
      time: fmtTime(d.assigned_at),
      state: d.assigned_at ? 'done' : (d.status === 'beklemede' ? 'active' : 'pending'),
    },
    {
      key: 'picked',
      label: incoming ? 'Klinikten alındı' : 'Laboratuvardan çıktı',
      time: fmtTime(d.picked_up_at),
      // Alım gerçekleşene kadar (picked_up_at) bu adım "devam ediyor"dur — kurye
      // atanmış/alıma gidiyor (atandi/teslim_alindi/yolda hepsi alım-öncesi olabilir).
      state: picked ? 'done'
        : (inProgress && (d.status === 'atandi' || d.status === 'teslim_alindi' || d.status === 'yolda')) ? 'active'
        : 'pending',
    },
    {
      key: 'enroute',
      // Yolda'nın kendi zaman damgası yok — teslim alma saatinden sonrası.
      // Yalnız GERÇEK alımdan (picked_up_at) sonra aktifleşir.
      label: 'Yolda',
      time: null,
      state: delivered ? 'done' : (picked ? 'active' : 'pending'),
    },
  ];

  if (delivered) {
    steps.push({
      key: 'delivered',
      label: incoming ? 'Laboratuvara teslim edildi' : 'Teslim edildi',
      time: fmtTime(d.delivered_at),
      state: 'done',
    });
  } else if (!cancelled) {
    // ETA yalnız kurye canlıyken/rota bilinirken gelir; yoksa saatsiz beklemede kalır.
    const etaTime = etaSec != null ? fmtTime(new Date(Date.now() + etaSec * 1000).toISOString()) : null;
    steps.push({
      key: 'eta',
      label: 'Tahmini teslim',
      time: etaTime,
      state: 'pending',
      estimate: true,
    });
  }

  if (cancelled) steps.push({ key: 'cancelled', label: 'İptal edildi', time: null, state: 'done' });
  return steps;
}

function DeliveryTimeline({ delivery, etaSec, accent, flush = false }: {
  delivery: DeliveryRow; etaSec?: number | null; accent: string;
  /** true → masaüstü cam kutusunun içinde: kendi kenarlığı/zemini olmasın. */
  flush?: boolean;
}) {
  const C = useCourierInk();
  const [open, setOpen] = useState(false);
  const steps = buildTimeline(delivery, etaSec);
  // Özet: son gerçekleşen ya da şu an aktif olan adım.
  const current = [...steps].reverse().find(st => st.state === 'active')
    ?? [...steps].reverse().find(st => st.state === 'done')
    ?? steps[0];

  return (
    <View style={flush
      ? { overflow: 'hidden' }
      : { borderRadius: 16, backgroundColor: C.softBg, borderWidth: 1, borderColor: C.softBorder, overflow: 'hidden' }}>
      <Pressable
        onPress={() => setOpen(v => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        /* object style ZORUNLU — fonksiyon-stili native'de düşüp satırı column'a
           çeviriyor, "Zaman Çizelgesi" etiket bloğu kaybolup kart boş görünüyordu. */
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
        }}
      >
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: `${accent}1F`, alignItems: 'center', justifyContent: 'center' }}>
          <Clock size={15} color={accent} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: C.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>Zaman Çizelgesi</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }} numberOfLines={1}>
            {current?.label ?? '—'}
            {current?.time ? <Text style={{ fontWeight: '600', color: C.inkMuted }}>{`  ·  ${current.time}`}</Text> : null}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={16} color={C.inkMuted} strokeWidth={2} />
        </View>
      </Pressable>

      {open && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 0 }}>
          {steps.map((st, i) => {
            const last = i === steps.length - 1;
            const dotColor = st.state === 'done' ? accent : st.state === 'active' ? accent : 'transparent';
            return (
              <View key={st.key} style={{ flexDirection: 'row', gap: 10 }}>
                {/* Ray: nokta + alta inen çizgi */}
                <View style={{ width: 16, alignItems: 'center' }}>
                  <View style={{
                    width: 14, height: 14, borderRadius: 7,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: dotColor,
                    borderWidth: st.state === 'pending' ? 1.5 : 0,
                    borderColor: C.stepBorder,
                    ...(st.state === 'active' && Platform.OS === 'web'
                      ? { boxShadow: `0 0 0 4px ${accent}26` } as any : null),
                  }}>
                    {st.state === 'done' && <Check size={9} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                  {!last && (
                    <View style={{ width: 1.5, flex: 1, minHeight: 18, backgroundColor: st.state === 'done' ? `${accent}55` : C.stepLine }} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 12 }}>
                  <Text style={{
                    fontSize: 12.5,
                    fontWeight: st.state === 'pending' ? '500' : '700',
                    color: st.state === 'pending' ? C.inkMuted : C.ink,
                  }} numberOfLines={1}>{st.label}</Text>
                  {st.time ? (
                    <Text style={{ fontSize: 11, color: C.inkMuted, marginTop: 1 }}>
                      {st.estimate ? '~' : ''}{st.time}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function DeliveryListCard({ d, selected, onSelect, onOpenOrder, onCancel, accent, statusCfg, isNarrow }: {
  d: DeliveryRow; selected: boolean; onSelect: () => void; onOpenOrder: () => void;
  onCancel?: () => void; isNarrow?: boolean;
  accent: string; statusCfg: Record<DeliveryRow['status'], { label: string; bg: string; fg: string }>;
}) {
  const C = useCourierInk();
  const cfg = statusCfg[d.status];
  // Yön duyarlı: klinikten alımda (clinic_to_lab) gönderen klinik, alıcı laboratuvardır.
  // Eskiden gönderen sabit "Lab" yazıyordu ve geliş bacakları ters görünüyordu.
  const incoming = d.direction === 'clinic_to_lab';
  const origin = incoming ? (d.clinic_name || d.doctor_name || 'Klinik') : 'Lab';
  const dest   = incoming
    ? (d.destination_name || 'Laboratuvar')
    : (d.destination_name ?? d.patient_name ?? 'Alıcı');
  // Kurye kimliği: kayıtlı dış kurye adı (geçmiş gönderiler dahil) → iç kurye.
  const courierName  = d.ext_courier_name ?? d.courier_name ?? null;
  const courierPhoto = d.ext_courier_photo ?? null;

  return (
    <Pressable
      // Kart tıklanabilir: önce teslimat detay sheet'i açılır (mobil) / haritada
      // seçilir (desktop). Sipariş detayına gitmek isteyen sheet içindeki
      // "Siparişi Gör" butonuna basar — kart artık doğrudan sipariş açmıyor.
      onPress={onSelect}
      style={{
        backgroundColor: selected ? C.cardBgSel : C.cardBg,
        borderRadius: 14,
        padding: 11,
        flexDirection: 'row', alignItems: 'center', gap: 8,
        ...(Platform.OS === 'web' ? {
          cursor: 'pointer',
          backdropFilter: 'blur(8px) saturate(140%)',
          WebkitBackdropFilter: 'blur(8px) saturate(140%)',
        } as any : {}),
      }}
    >
      <View style={{ flex: 1, gap: 7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: C.ink, flexShrink: 1 }}
              numberOfLines={1}
            >{origin}</Text>
            {isRTL() ? <ArrowLeft size={11} color={C.inkFaint} strokeWidth={1.8} /> : <ArrowRight size={11} color={C.inkFaint} strokeWidth={1.8} />}
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink }} numberOfLines={1}>{dest}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: cfg.bg }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: cfg.fg, textTransform: 'uppercase' }}>{cfg.label}</Text>
            </View>
            {onCancel && (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); onCancel(); }}
                hitSlop={8}
                style={{
                  width: 26, height: 26, borderRadius: 13,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'rgba(220,38,38,0.10)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <Trash2 size={12} color="#DC2626" strokeWidth={2} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {courierName && (
            <>
              <CourierAvatar size={18} accent={accent} initialsColor={accent} photo={courierPhoto} name={courierName} />
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: C.ink }} numberOfLines={1}>{courierName}</Text>
              <Text style={{ fontSize: 10.5, color: C.inkFaint }}>·</Text>
            </>
          )}
          <Text style={{ fontSize: 10.5, color: C.inkMuted }} numberOfLines={1}>Sipariş #{d.order_number ?? '—'}</Text>
        </View>

        {/* Hasta adı — kendi satırında: dar ekranda kurye+sipariş+hasta tek satıra
            sığmayıp hepsi kesiliyordu. Kişi ikonuyla ayrı satır tam okunur. */}
        {d.patient_name ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <UserIcon size={11} color={C.inkFaint} strokeWidth={1.8} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: C.inkMuted, flex: 1 }} numberOfLines={1}>{d.patient_name}</Text>
          </View>
        ) : null}
      </View>

      {/* Tıklanabilirlik göstergesi — karta basınca sipariş detayına gidilir */}
      {isRTL() ? <ChevronLeft size={17} color={C.inkFaint} strokeWidth={2} /> : <ChevronRight size={17} color={C.inkFaint} strokeWidth={2} />}
    </Pressable>
  );
}

// ─── Floating top-action button (mobile) ──────────────────────────────
function TopIconBtn({ icon: Icon, onPress }: { icon: any; onPress?: () => void }) {
  const C = useCourierInk();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      {({ pressed }: any) => (
        <View style={{
          width: 38, height: 38, borderRadius: 14,
          backgroundColor: C.sheetBg,
          borderWidth: 1, borderColor: C.isDark ? "rgba(255,255,255,0.10)" : "rgba(20,16,12,0.08)",
          alignItems: "center", justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
          ...(Platform.OS === "web" ? {
            cursor: "pointer",
            boxShadow: C.isDark ? "0 4px 12px rgba(0,0,0,0.5)" : "0 4px 12px rgba(15,23,42,0.12)",
          } as any : {}),
        }}>
          <Icon size={16} color={C.ink} strokeWidth={1.8} />
        </View>
      )}
    </Pressable>
  );
}
