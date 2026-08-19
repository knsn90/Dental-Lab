import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { isRTL } from '../../../core/i18n';
import { confirmAsync } from '../../../core/util/confirm';
/**
 * PriceListScreen — Mali İşlemler > Fiyat Listesi
 *
 * 3 sekme:
 *   Standart     → Genel hizmet kataloğu ve fiyatları
 *   Özel Listeler → Klinik / hekim bazlı fiyat istisnası
 *   Promosyonlar  → Kampanya, iskonto ve promosyon yönetimi
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  TextInput, Modal, Alert,
  Platform, useWindowDimensions,
} from 'react-native';
import {
  Search, X, Plus, Tag, Pencil, Info, Building2,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ArrowLeft, ArrowRight, PlusCircle, Trash2, Calendar, FileDown,
  GitMerge, Scissors, Check, Zap, GripVertical, Sparkles,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';
import { buildCatalogPdfHtml, CATALOG_PALETTES, type CatalogTech } from '../../../lib/catalogPdf';

/** Bir servisin para birimine göre sembol (€/$/£/₺). */
const priceSym = (cur?: string | null) => CURRENCY_META[(cur || 'TRY') as Currency]?.symbol ?? '₺';
import { useAuthStore } from '../../../core/store/authStore';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { DatePicker } from '../../../core/ui/DatePicker';
import { AppSwitch } from '../../../core/ui/AppSwitch';

import { fetchAllLabServices, createLabService, updateLabService, deleteLabService, aiCatalogCopy } from '../../services/api';
import { fetchCategories, createCategory, renameCategoryRow, deleteCategoryRow, type ServiceCategory } from '../../../lib/serviceCategories';
import { fetchClinics } from '../../clinics/api';
import type { LabService, PriceType } from '../../services/types';
import type { Clinic } from '../../clinics/types';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
const PRIMARY = '#0891B2';
function tint(hex: string, a: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch { return hex; }
}

const SERVICE_CATEGORIES = [
  'Sabit Protez', 'Hareketli Protez', 'İmplant',
  'Ortodonti', 'CAD/CAM', 'Seramik', 'Diğer',
];

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface PriceOverride {
  id: string;
  clinic_id: string;
  service_id: string;
  custom_price: number | null;
  discount_percent: number | null;
  currency: string;
  notes: string | null;
}

interface Promotion {
  id: string;
  name: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  scope: 'all' | 'category' | 'services';
  category: string | null;
  clinic_ids: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

const web = (style: any) => (Platform.OS === 'web' ? style : {});

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

// ────────────────────────────────────────────────────────────────────────────
// Inline style objects
// ────────────────────────────────────────────────────────────────────────────
const s = {
  root: { flex: 1 } as const,

  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 12,
  } as const,
  tabContent: { flex: 1 } as const,

  // Toolbar
  toolbar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  toolbarTitle: { flex: 1, fontSize: 13, color: DS.ink[500], fontWeight: '500' as const },

  searchWrap: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: DS.ink[50],
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 16,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: DS.ink[900],
    // @ts-ignore
    outlineStyle: 'none',
  } as const,

  addBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    backgroundColor: DS.ink[900],
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    // @ts-ignore web
    cursor: 'pointer',
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '700' as const, fontSize: 13 },

  catBarWrap: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  } as const,

  // Category filter pill container
  catPillContainer: {
    flexDirection: 'row' as const,
    gap: 2,
    padding: 3,
    borderRadius: 9999,
    backgroundColor: DS.ink[100],
  },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  catPillActive: {
    backgroundColor: PRIMARY,
  },
  catPillText: {
    fontWeight: '600' as const,
    color: DS.ink[500],
    fontSize: 13,
  },
  catPillTextActive: {
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },

  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 } as const,

  // Kategori bölümü — beyaz kart içinde satırlar (modern)
  catCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden' as const,
    marginBottom: 14,
    // @ts-ignore web
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.04)',
  },
  groupHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: DS.ink[500],
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  groupCount: { fontSize: 11, color: DS.ink[400], fontWeight: '600' as const },

  serviceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    gap: 12,
  },
  serviceName: { fontSize: 14, fontWeight: '600' as const, color: DS.ink[900] },
  servicePrice: { ...DISPLAY, fontSize: 15, color: PRIMARY, marginTop: 2 },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: DS.ink[50],
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    // @ts-ignore web
    cursor: 'pointer',
  },

  // Empty
  empty: { alignItems: 'center' as const, paddingVertical: 80, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '600' as const, color: DS.ink[500] },
  emptySubtitle: { fontSize: 13, color: DS.ink[400] },
  emptyBtn: {
    backgroundColor: DS.ink[900],
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 9999,
    marginTop: 4,
    // @ts-ignore web
    cursor: 'pointer',
  },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '700' as const, fontSize: 14 },

  // Info card
  infoCard: {
    flexDirection: 'row' as const,
    gap: 10,
    alignItems: 'flex-start' as const,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 14,
    marginBottom: 14,
  },
  infoText: { flex: 1, fontSize: 13, color: '#1D4ED8', lineHeight: 20 },

  // Clinic list
  clinicCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    ...cardSolid,
    padding: 16,
    marginBottom: 12,
    // @ts-ignore web
    cursor: 'pointer',
  },
  clinicIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  clinicName: { fontSize: 14, fontWeight: '600' as const, color: DS.ink[900] },
  clinicSub: { fontSize: 12, color: DS.ink[500], marginTop: 2 },

  // Clinic override header
  clinicHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: DS.ink[50],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    // @ts-ignore web
    cursor: 'pointer',
  },
  clinicHeaderTitle: { fontSize: 15, fontWeight: '700' as const, color: DS.ink[900] },
  clinicHeaderSub: { fontSize: 12, color: DS.ink[500] },
  overrideBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  overrideBadgeText: { fontSize: 12, color: '#2563EB', fontWeight: '700' as const },

  // Override row
  overrideRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    // @ts-ignore web
    cursor: 'pointer',
  },
  overridePrice: { fontSize: 13, fontWeight: '700' as const, color: '#2D9A6B' },
  standardPrice: { fontSize: 12, color: DS.ink[400], textDecorationLine: 'line-through' as const },
  discountBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountText: { fontSize: 11, color: '#2D9A6B', fontWeight: '700' as const },
  stdPriceLabel: { fontSize: 13, color: DS.ink[400] },

  // Toggle chips
  toggleRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  toggleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#FFF',
    // @ts-ignore web
    cursor: 'pointer',
  },
  toggleChipActive: { borderColor: PRIMARY, backgroundColor: PRIMARY + '12' },
  toggleChipText: { fontSize: 13, fontWeight: '600' as const, color: DS.ink[400] },
  toggleChipTextActive: { color: PRIMARY, fontWeight: '700' as const },

  // Promo card
  promoCard: {
    ...cardSolid,
    padding: 20,
    marginBottom: 14,
  },
  promoTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, marginBottom: 12 },
  discountCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  discountCircleText: { fontSize: 16, fontWeight: '900' as const },
  promoName: { fontSize: 15, fontWeight: '700' as const, color: DS.ink[900], marginBottom: 4 },
  promoMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  promoStatus: { fontSize: 12, fontWeight: '700' as const },
  promoScope: { fontSize: 12, color: DS.ink[500] },

  promoDates: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  dateChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5 },
  dateChipText: { fontSize: 12, color: DS.ink[500] },
  editSmallBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    // @ts-ignore web
    cursor: 'pointer',
  },
  editSmallText: { fontSize: 12, color: DS.ink[500], fontWeight: '600' as const },
};

const m = {
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%' as const,
    maxWidth: 560,
    maxHeight: '90%' as const,
    overflow: 'hidden' as const,
    // @ts-ignore web
    boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)',
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  title: { fontSize: 18, fontWeight: '700' as const, color: DS.ink[900] },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: DS.ink[100],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    // @ts-ignore web
    cursor: 'pointer',
  },
  body: { padding: 16 } as const,
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700' as const, color: DS.ink[800], marginBottom: 12 },
  hint: { fontSize: 12, color: DS.ink[500], lineHeight: 18, marginBottom: 14 },
  fieldWrap: { marginBottom: 0 } as const,
  fieldLabel: { fontSize: 11, fontWeight: '500' as const, color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 },
  fieldInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: DS.ink[900],
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    outlineStyle: 'none',
  } as const,
  twoCol: { flexDirection: 'row' as const, gap: 12 },
  divider: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.06)' } as const,
  dividerText: { fontSize: 11, color: DS.ink[400], fontWeight: '600' as const },
  svcInfoCard: {
    backgroundColor: DS.ink[50],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 14,
    marginBottom: 12,
  },
  svcInfoLabel: { fontSize: 11, color: DS.ink[400], fontWeight: '600' as const, marginBottom: 4 },
  svcInfoName: { fontSize: 15, fontWeight: '700' as const, color: DS.ink[900], marginBottom: 2 },
  svcInfoPrice: { fontSize: 13, color: DS.ink[500] },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    // @ts-ignore web
    cursor: 'pointer',
  },
  cancelText: { fontSize: 14, fontWeight: '600' as const, color: DS.ink[500] },
  saveBtn: {
    backgroundColor: DS.ink[900],
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 14,
    // @ts-ignore web
    cursor: 'pointer',
  },
  saveText: { fontSize: 14, fontWeight: '700' as const, color: '#FFFFFF' },
  deleteBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    // @ts-ignore web
    cursor: 'pointer',
  },
  deleteText: { fontSize: 13, color: '#D94B4B', fontWeight: '600' as const },
};

// ────────────────────────────────────────────────────────────────────────────
// Root
// ────────────────────────────────────────────────────────────────────────────
export function PriceListScreen() {
  useBaseCurrency();   // baz para birimi sembolü için (label'lar)
  const [tab, setTab] = useState('standard');
  const rootTheme = usePanelTheme();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? null;

  // Acil ek ücret oranı — F2 hero içine gömülü editör
  const [rate, setRate] = useState('');
  const [savedRate, setSavedRate] = useState(0);
  const [surDirty, setSurDirty] = useState(false);
  const [surSaving, setSurSaving] = useState(false);
  useEffect(() => {
    if (!labId) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase.from('lab_settings').select('urgent_surcharge_rate').eq('lab_id', labId).maybeSingle();
      if (cancel) return;
      const v = Number(data?.urgent_surcharge_rate ?? 0);
      setSavedRate(v); setRate(v ? String(v) : '');
    })();
    return () => { cancel = true; };
  }, [labId]);
  const saveSurcharge = async () => {
    if (!labId) return;
    const num = Math.max(0, Math.min(100, parseFloat(rate.replace(',', '.')) || 0));
    setSurSaving(true);
    await supabase.from('lab_settings').upsert({ lab_id: labId, urgent_surcharge_rate: num }, { onConflict: 'lab_id' });
    setSavedRate(num); setRate(num ? String(num) : ''); setSurDirty(false); setSurSaving(false);
  };

  const saveActive = surDirty && !surSaving;
  // Acil ek ücret artık hero'da değil, sekme şeridinin sağındaki bir düğmenin
  // arkasında. Yılda birkaç kez değişen tek bir lab yüzdesiydi ve sayfanın en
  // değerli kalıcı köşesini işgal ediyordu; oysa sayfanın işi katalog gezmek.
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <View style={[s.root, { backgroundColor: T.bg }]}>
      {/* ── Sayfa başlığı ───────────────────────────────────────────────
          Gradyanlı hero (~200px) kaldırıldı ama başlık gerekli: Finans Hub
          kabuk başlığını yalnız "Finans" olarak set ediyor, aktif alt bölümün
          adını hiçbir yer söylemiyordu. Bu sürüm ~50px. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 2 }}>
        <Text style={{ ...DISPLAY, fontSize: 22, color: T.ink, letterSpacing: -0.5, lineHeight: 26 }}>
          Fiyat Listesi
        </Text>
        <Text style={{ fontSize: 12.5, color: T.ink3, marginTop: 2 }}>
          Hizmet kataloğu, kategoriler ve fiyatlandırma.
        </Text>
      </View>

      {/* ── Sekme şeridi + ayarlar ── */}
      <View style={{
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
        flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <SlideTabBar
          items={[
            { key: 'standard',   label: 'Standart' },
            { key: 'custom',     label: 'Özel Listeler' },
            { key: 'promotions', label: 'Promosyonlar' },
          ]}
          activeKey={tab}
          onChange={setTab}
          /* `primary` DEĞİL `accent`: cursor beyaz metin basıyor, lab panelinde
             primary safran (#F5C24B) olduğu için aktif sekme okunmuyordu. */
          accentColor={rootTheme.accent}
          style={{ marginStart: -4 }}
        />

        <View style={{ flex: 1, minWidth: 0 }} />

        {/* Tetikleyici mevcut değeri gösterir — açmadan durumu bilmek için */}
        <Pressable
          onPress={() => setSettingsOpen(true)}
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
            backgroundColor: hovered ? T.cardSoft : 'transparent',
            borderWidth: 1, borderColor: T.hairline,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <Zap size={13} color={T.ink3} strokeWidth={2} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2 }}>
            Acil ek ücret{savedRate ? ` · %${savedRate}` : ''}
          </Text>
        </Pressable>
      </View>

      {/* ── Acil ek ücret ayarı ── */}
      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable onPress={() => setSettingsOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Pressable onPress={() => {}} style={{ width: 380, maxWidth: '100%', backgroundColor: T.card, borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Zap size={15} color={T.ink} strokeWidth={2.2} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink }}>Acil vaka ek ücreti</Text>
              </View>
              <Text style={{ fontSize: 12, color: T.ink3, marginTop: 6, lineHeight: 17 }}>
                &quot;Acil&quot; işaretli siparişlere faturada bu oran eklenir.
              </Text>
            </View>
            <View style={{ padding: 20, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4,
                  backgroundColor: T.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
                  borderWidth: 1, borderColor: T.hairline,
                }}>
                  <TextInput
                    value={rate}
                    onChangeText={(v) => { setRate(v); setSurDirty(true); }}
                    placeholder="0" keyboardType="numeric" placeholderTextColor={T.ink3}
                    style={{ flex: 1, fontSize: 18, fontWeight: '700', color: T.ink, textAlign: 'end' as any, outlineStyle: 'none' } as any}
                  />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink3 }}>%</Text>
                </View>
                <Pressable
                  onPress={saveSurcharge}
                  disabled={!saveActive}
                  style={{
                    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
                    backgroundColor: saveActive ? rootTheme.accent : T.hairline,
                    ...(Platform.OS === 'web' ? { cursor: saveActive ? 'pointer' : 'default' } as any : {}),
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: saveActive ? '#FFFFFF' : T.ink3 }}>
                    {surSaving ? '…' : 'Kaydet'}
                  </Text>
                </Pressable>
              </View>
              <Pressable onPress={() => setSettingsOpen(false)} style={{ alignItems: 'center', paddingVertical: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink3 }}>Kapat</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {tab === 'standard'   && <StandardTab />}
      {tab === 'custom'     && <CustomTab />}
      {tab === 'promotions' && <PromotionsTab />}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 1 — Standart Fiyat Listesi
// ────────────────────────────────────────────────────────────────────────────
interface ServiceForm {
  name: string; category: string; price: string; currency: string; production_days: string;
  priceType: PriceType; unit: string;
}
const EMPTY_SVC: ServiceForm = { name: '', category: '', price: '0', currency: 'TRY', production_days: '', priceType: 'fixed', unit: 'Üye' };

// Fiyat birimleri — bu fiyat neyin başına? (üye/diş, çene, vaka...)
const UNIT_OPTIONS = ['Üye', 'Çene', 'Vaka', 'Adet', 'Seans'];

// Fiyatı tipe göre biçimlendir — tutar / yüzde / ücretsiz (+ birim)
function fmtServicePrice(sv: { price: number; currency: string; price_type?: PriceType | null; unit?: string | null }): string {
  if (sv.price_type === 'free') return 'Ücretsiz';
  // Birim ('Üye', 'Çene'…) fiyat dizesinin İÇİNDE olduğu için tam-eşleşme
  // sözlüğü onu göremez — ayrıca çevir.
  const u = sv.unit ? ` / ${autoT(sv.unit)}` : '';
  if (sv.price_type === 'percent') return `%${(sv.price ?? 0).toLocaleString('tr-TR')}${u}`;
  return sv.price > 0 ? `${sv.price.toLocaleString('tr-TR')} ${sv.currency}${u}` : '—';
}

// ── PDF export — Nexadent fiyat listesi tasarımı ────────────────────────
function buildPriceListPdfHtml(opts: {
  labName: string;
  labLogoUrl?: string | null;
  services: LabService[];
  showPrices: boolean;
  currency: string;
  /** Klinik bazlı özel fiyat listesi başlığı (varsa) */
  clinicName?: string;
  /** Override map: service_id → effective price (varsa fiyat olarak göster) */
  overrides?: Record<string, { customPrice: number | null; discountPercent: number | null; currency?: string | null }>;
  /** ── Tasarım/İçerik özelleştirme (opsiyonel — verilmezse mevcut varsayılan) ── */
  accent?: string;
  accentSoft?: string;
  /** Ana başlık (H1). \n → satır sonu. Verilmezse varsayılan iki satırlık başlık. */
  title?: string;
  /** Başlık altı açıklama satırı. */
  subtitle?: string;
  /** Sağ üst eyebrow etiketi. */
  eyebrow?: string;
  /** Alt bilgi (footer) metni. */
  footerText?: string;
  /** Fiyat gizliyken gösterilen not (boş string → not gösterilmez). */
  blankNote?: string;
  /** Yalnızca bu kategoriler dahil edilsin (verilmezse tümü). */
  includeCategories?: string[];
  /** Birim ekini ("/ Üye" vb.) gizle. */
  hideUnit?: boolean;
}): string {
  const {
    labName, labLogoUrl, services, showPrices, currency, clinicName, overrides,
    accent = '#1E3A8A',
    title: customTitle,
    subtitle: customSubtitle,
    eyebrow: customEyebrow,
    footerText: customFooter,
    blankNote,
    includeCategories,
    hideUnit,
  } = opts;
  // accentSoft yoksa accent'ten yumuşak ton türet
  const hexToRgba = (hex: string, a: number) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return `rgba(30,58,138,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const accentSoft = opts.accentSoft ?? hexToRgba(accent, 0.08);
  const escape = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ccySymbol = (c?: string | null) =>
    c === 'EUR' ? '€' : c === 'USD' ? '$' : c === 'GBP' ? '£' : '₺';
  const fmtPrice = (sv: LabService) => {
    const placeholder = '<span style="color:#94A3B8;letter-spacing:2px">_____________</span>';
    if (!showPrices) return placeholder;
    // Birim eki — "/ Üye" gibi (ücretsiz hariç)
    const u = (!hideUnit && sv.unit) ? ` <span style="font-size:9px;color:#94A3B8">/ ${escape(sv.unit)}</span>` : '';
    // Tipe göre özel gösterim — ücretsiz / yüzde (override hesabı uygulanmaz)
    if (sv.price_type === 'free') return 'Ücretsiz';
    if (sv.price_type === 'percent') return `%${(Number(sv.price) || 0).toLocaleString('tr-TR')}${u}`;
    // Override varsa effective price hesapla
    const ov = overrides?.[sv.id];
    const base = Number(sv.price) || 0;
    let effective = base;
    let isCustom = false;
    if (ov) {
      if (ov.customPrice != null) { effective = Number(ov.customPrice) || 0; isCustom = true; }
      else if (ov.discountPercent != null) { effective = base * (1 - ov.discountPercent / 100); isCustom = true; }
    }
    if (effective === 0) return placeholder;
    // Para birimi override'ın kendi para biriminden gelir — klinik özel fiyatı
    // USD kaydedilip standart hizmet EUR olduğunda PDF € basıyordu (yanlış tutar).
    const sym = ccySymbol(isCustom ? (ov?.currency || sv.currency) : sv.currency);
    const baseSym = ccySymbol(sv.currency);
    const priceStr = `${sym}${(Number(effective) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
    if (isCustom && ov?.discountPercent != null) {
      const baseStr = `${baseSym}${base.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
      return `${priceStr}${u} <span style="font-size:9px;color:#94A3B8;text-decoration:line-through;margin-left:6px">${baseStr}</span> <span style="font-size:9px;color:${accent};font-weight:700;margin-left:4px">-%${ov.discountPercent}</span>`;
    }
    // Özel fiyat standarttan farklıysa (tutar ya da para birimi) bunu göster —
    // aksi halde klinik listesi standart listeyle birebir aynı görünüyordu.
    if (isCustom && (effective !== base || sym !== baseSym)) {
      const baseStr = `${baseSym}${base.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
      return `${priceStr}${u} <span style="font-size:9px;color:#94A3B8;text-decoration:line-through;margin-left:6px">${baseStr}</span>`;
    }
    return priceStr + u;
  };

  // Kategori bazlı grupla (sadece aktif) — istenirse kategori filtresi uygula
  const catSet = includeCategories && includeCategories.length ? new Set(includeCategories) : null;
  const active = services.filter(s => s.is_active && (!catSet || catSet.has(s.category || 'Diğer')));
  const grouped: Record<string, LabService[]> = {};
  active.forEach(sv => {
    const cat = sv.category || 'Diğer';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(sv);
  });
  // Her kategori içindeki hizmetleri sort_order'a göre sırala (ekrandaki düzenle aynı)
  Object.keys(grouped).forEach(cat => {
    grouped[cat].sort((a, b) => {
      const sa = a.sort_order ?? 0, sb = b.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name, 'tr');
    });
  });
  // Kategori sırası — services'taki min(sort_order)'a göre (ekrandaki düzenle aynı)
  const minOrderFor = (cat: string) => {
    const inCat = grouped[cat] ?? [];
    if (inCat.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...inCat.map(sv => sv.sort_order ?? 0));
  };
  const ordered = Object.keys(grouped).sort((a, b) => {
    const ma = minOrderFor(a), mb = minOrderFor(b);
    if (ma !== mb) return ma - mb;
    // sort_order eşit veya tanımsızsa varsayılan SERVICE_CATEGORIES sırasına düş
    const ia = SERVICE_CATEGORIES.indexOf(a);
    const ib = SERVICE_CATEGORIES.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'tr');
  });

  // Sütun başlığındaki para birimi — satırlar kendi sembolünü bastığı için tek
  // bir para birimi varsaymak yanılttıcı olabilir (klinik özel fiyatı USD,
  // standart hizmet EUR iken başlık "FİYAT (EUR)" diyordu). Gerçekten basılan
  // para birimleri sayılır; birden fazlaysa başlık nötr kalır.
  const usedCcy = new Set<string>();
  active.forEach(sv => {
    if (sv.price_type === 'free' || sv.price_type === 'percent') return;
    const ov = overrides?.[sv.id];
    const isCustom = !!ov && (ov.customPrice != null || ov.discountPercent != null);
    const eff = ov?.customPrice != null
      ? Number(ov.customPrice) || 0
      : ov?.discountPercent != null
        ? (Number(sv.price) || 0) * (1 - ov.discountPercent / 100)
        : Number(sv.price) || 0;
    if (eff === 0) return;                       // "____" basılan satır sayılmaz
    usedCcy.add((isCustom ? (ov?.currency || sv.currency) : sv.currency) || 'TRY');
  });
  const priceHeader = !showPrices || usedCcy.size === 0
    ? `FİYAT (${escape(currency)})`
    : usedCcy.size === 1
      ? `FİYAT (${escape(Array.from(usedCcy)[0])})`
      : 'FİYAT';

  const sectionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const sections = ordered.map((cat, idx) => {
    const letter = sectionLetters[idx] ?? '';
    const items = grouped[cat] ?? [];
    return `
      <div class="section">
        <h2 class="secTitle">${letter ? `${letter}. ` : ''}${escape(cat.toLocaleUpperCase('tr-TR'))}</h2>
        <table class="priceTable">
          <thead>
            <tr>
              <th class="thName">HİZMET</th>
              <th class="thPrice">${priceHeader}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(sv => `
              <tr>
                <td>${escape(sv.name)}</td>
                <td class="tdPrice">${fmtPrice(sv)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }).join('');

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8" />
<title>${escape(labName)} · Fiyat Listesi</title>
<style>
@page { size: A4 portrait; margin: 16mm 14mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { font-family: 'Inter','Helvetica Neue',Arial,sans-serif; color: #0F172A; background: #FFFFFF; font-size: 11px; line-height: 1.45; -webkit-font-smoothing: antialiased; }
.doc { max-width: 182mm; margin: 0 auto; }

/* ── HEADER ── */
.headerBar { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 4px 18px 4px; border-bottom: 2px solid #0F172A; margin-bottom: 18px; }
.headerLeft { display: flex; align-items: center; gap: 18px; }
.brandLogo { display: block; height: 110px; max-height: 110px; width: auto; max-width: 240px; object-fit: contain; flex-shrink: 0; }
.brandLogoFallback { width: 88px; height: 88px; border-radius: 14px; background: #0F172A; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 800; color: #FFFFFF; letter-spacing: 0.5px; flex-shrink: 0; }
.brandMeta { display: flex; flex-direction: column; gap: 3px; }
.brandName { font-size: 17px; font-weight: 800; letter-spacing: 0.8px; color: #0F172A; line-height: 1.1; }
.brandTag { font-size: 8.5px; font-weight: 700; color: #64748B; letter-spacing: 3.2px; }
.headerRight { text-align: right; }
.docEyebrow { font-size: 8.5px; font-weight: 700; color: #64748B; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
.docTitle { font-size: 13px; font-weight: 700; color: #0F172A; letter-spacing: 0.4px; }
.docMeta { font-size: 9.5px; color: #94A3B8; margin-top: 3px; letter-spacing: 0.3px; }

.titleBlock { padding: 4px 0 14px; }
.title { font-size: 22px; font-weight: 300; letter-spacing: -0.5px; color: #0F172A; line-height: 1.15; }
.titleAccent { color: ${accent}; font-weight: 600; }
.subtitle { font-size: 11px; color: #475569; margin-top: 8px; line-height: 1.55; }
.clinicTag { display: inline-block; padding: 3px 10px; border-radius: 9999px; background: ${accentSoft}; color: ${accent}; font-size: 10.5px; font-weight: 700; letter-spacing: 0.4px; margin-top: 6px; }
.subNote { font-size: 10px; color: #475569; margin-top: 8px; padding: 8px 12px; background: #F8FAFC; border-radius: 8px; border-left: 3px solid #CBD5E1; }
.divider { display: none; }

/* ── SECTIONS ── */
.section { margin-bottom: 22px; break-inside: avoid; page-break-inside: avoid; }
.secTitle { font-size: 14px; font-weight: 600; color: ${accent}; letter-spacing: 0.3px; margin-bottom: 10px; }

/* ── PRICE TABLE ── */
.priceTable { width: 100%; border-collapse: collapse; border: 1px solid #CBD5E1; }
.priceTable thead { background: ${accent}; }
.priceTable th { padding: 9px 14px; font-size: 10px; font-weight: 700; color: #FFFFFF; letter-spacing: 1.3px; text-transform: uppercase; text-align: left; border-right: 1px solid rgba(255,255,255,0.18); }
.priceTable th:last-child { border-right: none; }
.priceTable th.thName { width: 70%; }
.priceTable th.thPrice { width: 30%; }
.priceTable tbody tr { border-bottom: 1px solid #E2E8F0; }
.priceTable tbody tr:last-child { border-bottom: none; }
.priceTable td { padding: 10px 14px; font-size: 11px; color: #0F172A; vertical-align: middle; }
.priceTable td.tdPrice { font-weight: 600; color: #0F172A; }

/* ── FOOTER ── */
.footer { margin-top: 26px; padding-top: 12px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 10px; color: #94A3B8; letter-spacing: 0.4px; }

@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
</style></head><body>
<div class="doc">

  <div class="headerBar">
    <div class="headerLeft">
      ${labLogoUrl
        ? `<img class="brandLogo" src="${escape(labLogoUrl)}" alt="${escape(labName)}" />`
        : `<div class="brandLogoFallback">${escape((labName[0] ?? 'L').toLocaleUpperCase('tr-TR'))}</div>`}
      ${(() => {
        const upper = labName.toLocaleUpperCase('tr-TR');
        const probe = labName.toLocaleLowerCase('tr-TR');
        const alreadyHasTag = /lab(oratuvar|oratory)?|dijital|di̇jital/.test(probe);
        return `<div class="brandMeta">
          <span class="brandName">${escape(upper)}</span>
          ${alreadyHasTag ? '' : '<span class="brandTag">DİJİTAL DİŞ LABORATUVARI</span>'}
        </div>`;
      })()}
    </div>
    <div class="headerRight">
      <div class="docEyebrow">${escape(customEyebrow ?? (clinicName ? 'KLİNİK ÖZEL LİSTE' : 'GÜNCEL FİYAT LİSTESİ'))}</div>
      <div class="docTitle">${escape(currency)} · ${new Date().toLocaleDateString(localeTag(), { year: 'numeric', month: 'long' })}</div>
      <div class="docMeta">Ref: FL-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}</div>
    </div>
  </div>

  <div class="titleBlock">
    <h1 class="title">
      ${customTitle != null
        ? escape(customTitle).replace(/\n/g, '<br/>')
        : (clinicName
            ? `${autoT('Klinik özel')}<br/><span class="titleAccent">${autoT('fiyat teklifi')}</span>`
            : `${autoT('Güncel hizmet')}<br/><span class="titleAccent">${autoT('fiyat listesi')}</span>`)}
    </h1>
    ${clinicName ? `<div class="clinicTag">${escape(clinicName)}</div>` : ''}
    <p class="subtitle">${escape(customSubtitle ?? 'Gelişmiş CAD/CAM · Dijital Sabit Protez · 3D Baskı Çözümleri')}</p>
    ${(() => {
      if (showPrices) return '';
      const note = blankNote ?? 'Tüm fiyat alanları klinik bazlı özel fiyatlandırma için boş bırakılmıştır.';
      return note.trim() ? `<p class="subNote">${escape(note)}</p>` : '';
    })()}
  </div>

  <div class="divider"></div>

  ${sections}

  <div class="footer">
    ${customFooter != null
      ? escape(customFooter)
      : `${escape(labName.toLocaleUpperCase('tr-TR'))} · Gelişmiş CAD/CAM İş Akışı · ${new Date().toLocaleDateString(localeTag())}`}
  </div>

</div>
</body></html>`;
}


function StandardTab() {
  const catTheme = usePanelTheme();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const { profile } = useAuthStore();
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  // Fiyat listesi oluşturucu — boş / fiyatlı mod ile açılır
  const [priceBuilderOpen, setPriceBuilderOpen] = useState(false);
  const [priceBuilderPriced, setPriceBuilderPriced] = useState(true);
  const catScrollRef = useRef<ScrollView>(null);
  // Bir kerelik scroll-hint — sayfa açıldıktan ~800ms sonra ufak bir
  // ileri-geri kayma ile "kaydırılabilir" olduğunu göster
  useEffect(() => {
    const tShow = setTimeout(() => {
      catScrollRef.current?.scrollTo({ x: 48, animated: true });
      const tBack = setTimeout(() => {
        catScrollRef.current?.scrollTo({ x: 0, animated: true });
      }, 650);
      return () => clearTimeout(tBack);
    }, 800);
    return () => clearTimeout(tShow);
  }, []);
  const [services, setServices]       = useState<LabService[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState('Tümü');
  const [modal, setModal]             = useState(false);
  const [edit, setEdit]               = useState<LabService | null>(null);
  const [form, setForm]               = useState<ServiceForm>(EMPTY_SVC);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const labId = (profile as any)?.lab_id ?? null;
  const [dbCats, setDbCats] = useState<ServiceCategory[]>([]);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [svc, cats] = await Promise.all([
      fetchAllLabServices(),
      labId ? fetchCategories(labId) : Promise.resolve({ data: [] } as any),
    ]);
    setServices((svc.data as LabService[]) ?? []);
    setDbCats((cats.data as ServiceCategory[]) ?? []);
    setLoading(false);
  }, [labId]);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEdit(null); setForm(EMPTY_SVC); setError(''); setModal(true); };
  const openEdit = (sv: LabService) => {
    setEdit(sv);
    setForm({
      name: sv.name,
      category: sv.category ?? '',
      price: String(sv.price),
      currency: sv.currency,
      production_days: sv.production_days != null ? String(sv.production_days) : '',
      priceType: sv.price_type ?? 'fixed',
      unit: sv.unit ?? '',
    });
    setError(''); setModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Hizmet adı zorunludur.'); return; }
    // Ücretsiz → fiyat 0; yüzde/tutar → girilen sayı
    const price = form.priceType === 'free' ? 0 : (parseFloat(form.price) || 0);
    setSaving(true);
    const days = form.production_days.trim() === '' ? null : Math.max(0, parseInt(form.production_days, 10) || 0);
    const payload = {
      name: form.name.trim(),
      category: form.category || undefined,
      price,
      currency: form.currency,
      production_days: days,
      price_type: form.priceType,
      unit: form.priceType === 'free' ? null : (form.unit.trim() || null),
    };
    const res = edit ? await updateLabService(edit.id, payload) : await createLabService(payload);
    setSaving(false);
    if ((res as any)?.error) {
      setError((res as any).error.message ?? 'Kayıt başarısız.');
      return;
    }
    setModal(false); load();
  };

  const handleToggle = async (sv: LabService) => {
    await updateLabService(sv.id, { is_active: !sv.is_active }); load();
  };

  // Kategorinin tamamını üste/alta taşı — kategorideki tüm hizmetlerin sort_order'larını blok olarak kaydır
  const handleMoveCategory = async (cat: string, dir: -1 | 1) => {
    const orderedCats = visibleFilterCats; // sıralanmış, hizmeti olan kategoriler
    const idx = orderedCats.indexOf(cat);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= orderedCats.length) return;
    // Yeni sıra: swap
    const newOrder = [...orderedCats];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    // Global renumber — her kategori 1000 aralıkla, kendi içinde mevcut sırayı koru
    const sortInCat = (arr: LabService[]) => [...arr].sort((a, b) => {
      const sa = a.sort_order ?? 0, sb = b.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name, 'tr');
    });
    const updates: Promise<any>[] = [];
    const next: LabService[] = [...services];
    newOrder.forEach((c, ci) => {
      const inCat = sortInCat(next.filter(sv => (sv.category ?? '') === c));
      inCat.forEach((sv, i) => {
        const newSort = ci * 1000 + i;
        if ((sv.sort_order ?? -1) !== newSort) {
          updates.push(updateLabService(sv.id, { sort_order: newSort }));
          const j = next.findIndex(s => s.id === sv.id);
          if (j >= 0) next[j] = { ...next[j], sort_order: newSort };
        }
      });
    });
    const snapshot = services;
    setServices(next);
    if (updates.length) {
      try { await Promise.all(updates); } catch { setServices(snapshot); }
    }
  };

  // Kullanılmayan varsayılan kategorileri gizle
  const handleCleanupEmpty = async () => {
    if (emptyDefaultCats.length === 0) {
      const msg = 'Temizlenecek boş kategori yok.';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Bilgi', msg);
      return;
    }
    const msg = `Şu boş kategoriler önerilenden kaldırılsın mı?\n\n• ${emptyDefaultCats.join('\n• ')}\n\nYeni bir hizmet eklerken bu kategoriler artık önerilmez. Geri getirmek için bir hizmete adını yazıp atayabilirsin.`;
    const ok = await confirmAsync('Boş Kategorileri Kaldır', msg, { confirmText: 'Kaldır' });
    if (!ok) return;
    persistHidden(new Set([...hiddenCats, ...emptyDefaultCats]));
  };

  // Kategori birleştirme & bölme modali state'i
  const [catMgmt, setCatMgmt] = useState<
    | { mode: 'merge';  source: string }
    | { mode: 'split';  source: string }
    | null
  >(null);

  // Bir kategoriyi sil — o kategorideki tüm hizmetler "kategorisiz" olur
  const handleDeleteCategory = async (name: string) => {
    const count = services.filter(sv => (sv.category ?? '') === name).length;
    const msg = count > 0
      ? `"${name}" kategorisini silmek istediğine emin misin?\n\nBu kategorideki ${count} hizmet "Diğer" altına taşınacak (silinmez).`
      : `"${name}" kategorisini silmek istediğine emin misin?`;
    const ok = Platform.OS === 'web'
      ? (typeof window !== 'undefined' && window.confirm(msg))
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Kategoriyi sil', msg, [
            { text: 'İptal', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Sil', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!ok) return;
    const targets = services.filter(sv => (sv.category ?? '') === name);
    setServices(prev => prev.map(sv => sv.category === name ? { ...sv, category: undefined } : sv) as LabService[]);
    if (catFilter === name) setCatFilter('Tümü');
    await Promise.all(targets.map(sv => updateLabService(sv.id, { category: '' })));
    load();
  };

  // İki kategoriyi birleştir — source'taki hizmetler target'a taşınır
  const handleMergeCategory = async (source: string, target: string) => {
    if (!target || target === source) return;
    const targets = services.filter(sv => (sv.category ?? '') === source);
    setServices(prev => prev.map(sv => sv.category === source ? { ...sv, category: target } : sv));
    if (catFilter === source) setCatFilter(target);
    await Promise.all(targets.map(sv => updateLabService(sv.id, { category: target })));
    load();
  };

  // Kategoriyi böl — seçili hizmetler yeni kategoriye taşınır
  const handleSplitCategory = async (source: string, newCatName: string, serviceIds: string[]) => {
    const trimmed = newCatName.trim();
    if (!trimmed || serviceIds.length === 0) return;
    const existing = Array.from(new Set([
      ...SERVICE_CATEGORIES,
      ...services.map(sv => sv.category).filter((c): c is string => !!c && c.trim().length > 0),
    ]));
    if (existing.includes(trimmed) && trimmed !== source) {
      // Mevcut kategoriye taşımaya izin ver; sadece uyar
      const ok = await confirmAsync('Kategoriye Taşı', `"${trimmed}" ${autoT('zaten mevcut. Seçili')} ${serviceIds.length} ${autoT('hizmet bu kategoriye taşınsın mı?')}`, { confirmText: 'Taşı' });
      if (!ok) return;
    }
    setServices(prev => prev.map(sv => serviceIds.includes(sv.id) ? { ...sv, category: trimmed } : sv));
    await Promise.all(serviceIds.map(id => updateLabService(id, { category: trimmed })));
    load();
  };

  // Kategori adını topluca değiştir — bu kategoriyi kullanan tüm hizmetlerin category alanını güncelle
  const handleRenameCategory = async (oldName: string, rawNew: string) => {
    const newName = rawNew.trim();
    if (!newName || newName === oldName) return;
    const dynamicCats = Array.from(new Set([
      ...SERVICE_CATEGORIES,
      ...services.map(sv => sv.category).filter((c): c is string => !!c && c.trim().length > 0),
    ]));
    if (dynamicCats.includes(newName)) {
      const msg = `"${newName}" zaten mevcut bir kategori. Birleştirmek için bu kategorideki hizmetleri tek tek düzenleyebilirsin.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Kategori adı kullanılıyor', msg);
      return;
    }
    const targets = services.filter(sv => (sv.category ?? '') === oldName);
    // Optimistik
    setServices(prev => prev.map(sv => sv.category === oldName ? { ...sv, category: newName } : sv));
    if (catFilter === oldName) setCatFilter(newName);
    await Promise.all(targets.map(sv => updateLabService(sv.id, { category: newName })));
    load();
  };

  // ── Merkezî kategori yönetimi (categories tablosu + hizmet metni) ──────────
  // Yeni (boş dahil) kategori oluştur
  const catCreate = async (rawName: string) => {
    const name = rawName.trim();
    if (!name || !labId) return;
    const exists = [...dbCatNames, ...usedCats].some(c => c.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
    if (exists) return;
    const res = await createCategory(labId, name);
    if (!(res as any)?.error) load();
  };
  // Kategori adını değiştir — categories satırı (varsa) + bu kategorideki hizmetler
  const catRename = async (oldName: string, rawNew: string, catId: string | null) => {
    const newName = rawNew.trim();
    if (!newName || newName === oldName) return;
    if (catId) await renameCategoryRow(catId, newName);
    const targets = services.filter(sv => (sv.category ?? '') === oldName);
    setServices(prev => prev.map(sv => sv.category === oldName ? { ...sv, category: newName } : sv));
    if (catFilter === oldName) setCatFilter(newName);
    await Promise.all(targets.map(sv => updateLabService(sv.id, { category: newName })));
    load();
  };
  // Kategoriyi sil — categories satırı (varsa) + hizmetleri gruptan çıkar
  const catDelete = async (name: string, catId: string | null) => {
    if (catId) await deleteCategoryRow(catId);
    const targets = services.filter(sv => (sv.category ?? '') === name);
    setServices(prev => prev.map(sv => sv.category === name ? { ...sv, category: undefined } : sv) as LabService[]);
    if (catFilter === name) setCatFilter('Tümü');
    await Promise.all(targets.map(sv => updateLabService(sv.id, { category: '' })));
    load();
  };

  // Sıralama: aynı kategori içinde sort_order'a göre sırala, komşuyla swap et
  const handleMove = async (sv: LabService, dir: -1 | 1) => {
    const sameCat = services.filter(s => (s.category ?? '') === (sv.category ?? ''));
    sameCat.sort((a, b) => {
      const sa = a.sort_order ?? 0, sb = b.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name, 'tr');
    });
    const idx = sameCat.findIndex(s => s.id === sv.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sameCat.length) return;
    const a = sameCat[idx], b = sameCat[swapIdx];
    // Sort_order'ları normalize et (null/duplikeler için)
    const aOrder = (a.sort_order ?? idx) === (b.sort_order ?? swapIdx)
      ? { aNew: swapIdx, bNew: idx }
      : { aNew: b.sort_order ?? swapIdx, bNew: a.sort_order ?? idx };
    // Optimistik UI
    const snapshot = services;
    setServices(prev => prev.map(s => {
      if (s.id === a.id) return { ...s, sort_order: aOrder.aNew };
      if (s.id === b.id) return { ...s, sort_order: aOrder.bNew };
      return s;
    }));
    try {
      await Promise.all([
        updateLabService(a.id, { sort_order: aOrder.aNew }),
        updateLabService(b.id, { sort_order: aOrder.bNew }),
      ]);
    } catch {
      setServices(snapshot);
    }
  };

  // ── Sürükle-bırak sıralama (kategori içinde) ───────────────────────────────
  const [dragInfo, setDragInfo] = useState<{ id: string; key: string } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const reorderServices = async (group: LabService[], fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = group.map(g => g.id);
    const from = ids.indexOf(fromId), to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...group];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    // Grubun mevcut sort_order tabanını koru → kategori sırası değişmez
    const base = Math.min(...group.map(g => g.sort_order ?? 0));
    const updates = next.map((sv, i) => ({ id: sv.id, sort_order: base + i }));
    const snapshot = services;
    setServices(prev => prev.map(sv => {
      const u = updates.find(x => x.id === sv.id);
      return u ? { ...sv, sort_order: u.sort_order } : sv;
    }));
    try { await Promise.all(updates.map(u => updateLabService(u.id, { sort_order: u.sort_order }))); }
    catch { setServices(snapshot); }
  };

  const handleDelete = async (sv: LabService) => {
    const message = `"${sv.name}" hizmetini silmek istediğine emin misin?\n\nBu işlem geri alınamaz.`;
    const confirmed = Platform.OS === 'web'
      ? (typeof window !== 'undefined' && window.confirm(message))
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Hizmeti sil', message, [
            { text: 'İptal', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Sil', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
    if (!confirmed) return;
    const { error } = await deleteLabService(sv.id);
    if (error) {
      const msg = (error as any).code === '23503' || /foreign key|reference/i.test(error.message ?? '')
        ? 'Bu hizmet mevcut siparişlerde veya özel fiyat listelerinde kullanılıyor. Silmek yerine pasifleştirebilirsin.'
        : `Silme başarısız: ${error.message}`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Hata', msg);
      return;
    }
    load();
  };

  // Kullanıcının manuel olarak kaldırdığı (kullanılmayan) kategoriler — localStorage'da
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const stored = window.localStorage.getItem('priceList:hiddenCats');
      return new Set<string>(stored ? JSON.parse(stored) : []);
    } catch { return new Set<string>(); }
  });
  const persistHidden = (next: Set<string>) => {
    setHiddenCats(next);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('priceList:hiddenCats', JSON.stringify([...next])); } catch {}
    }
  };

  // Tüm kategoriler — varsayılan + DB'de fiilen kullanılan kategoriler
  const usedCats = Array.from(new Set(
    services.map(sv => sv.category).filter((c): c is string => !!c && c.trim().length > 0)
  ));
  const dbCatNames = dbCats.map(c => c.name).filter((c): c is string => !!c && c.trim().length > 0);
  const dynamicCategoriesRaw = Array.from(new Set([...SERVICE_CATEGORIES, ...dbCatNames, ...usedCats]));
  // Hidden filtre: kullanılmayan + kullanıcı tarafından gizlenmiş kategorileri at
  const dynamicCategoriesUnsorted = dynamicCategoriesRaw.filter(c => usedCats.includes(c) || !hiddenCats.has(c));
  // Kategori sırası — services içindeki min(sort_order)'a göre
  const minOrderFor = (cat: string) => {
    const inCat = services.filter(sv => (sv.category ?? '') === cat);
    if (inCat.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...inCat.map(sv => sv.sort_order ?? 0));
  };
  const dynamicCategories = [...dynamicCategoriesUnsorted].sort((a, b) => {
    const ma = minOrderFor(a), mb = minOrderFor(b);
    if (ma !== mb) return ma - mb;
    return dynamicCategoriesRaw.indexOf(a) - dynamicCategoriesRaw.indexOf(b);
  });
  // Filtre pill bar — sadece en az 1 hizmeti olan kategoriler (boş kategoriler gizli)
  const visibleFilterCats = dynamicCategories.filter(c => usedCats.includes(c));
  const allCats   = ['Tümü', ...visibleFilterCats];
  // Boş varsayılan kategoriler (henüz gizlenmemiş) — toolbar temizleme butonu için
  const emptyDefaultCats = SERVICE_CATEGORIES.filter(c => !usedCats.includes(c) && !hiddenCats.has(c));
  const filtered  = services.filter((sv) => {
    const matchCat    = catFilter === 'Tümü' || sv.category === catFilter;
    const matchSearch = !search || sv.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });
  const sortByOrder = (arr: LabService[]) =>
    [...arr].sort((a, b) => {
      const sa = a.sort_order ?? 0, sb = b.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name, 'tr');
    });
  const grouped = dynamicCategories.reduce<Record<string, LabService[]>>((acc, cat) => {
    const items = filtered.filter((sv) => sv.category === cat);
    if (items.length) acc[cat] = sortByOrder(items);
    return acc;
  }, {});
  const ungrouped = sortByOrder(filtered.filter((sv) => !sv.category || !dynamicCategories.includes(sv.category)));

  return (
    <View style={[s.tabContent, { backgroundColor: T.bg }]}>
      {/* Toolbar — arama + aksiyonlar (başlık hub tarafından gösterilir) */}
      <View style={[s.toolbar, { borderBottomColor: T.hairline }]}>
        <View style={[s.searchWrap, { backgroundColor: T.card, borderColor: T.hairline }]}>
          <Search size={15} color={T.ink3} strokeWidth={1.6} />
          <TextInput
            style={[s.searchInput as any, { color: T.ink }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Hizmet ara..."
            placeholderTextColor={T.ink3}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <X size={14} color={T.ink3} strokeWidth={1.6} />
            </Pressable>
          )}
        </View>
        {/* Kategoriler · PDF · Boşları Temizle → tek taşma menüsü.
            Dördü de aynı ağırlıkta dolu-kenarlıklı buton olarak yan yana
            duruyordu; oysa "Hizmet Ekle" günlük, "Boşları Temizle" yılda bir
            kullanılıyor. Ortak yol açıkta, gerisi bir tık altında. */}
        <View style={{ position: 'relative' }}>
          <Pressable
            onPress={() => setMoreOpen(v => !v)}
            accessibilityLabel="Diğer işlemler"
            style={({ hovered }: any) => ({
              width: 36, height: 36, borderRadius: 9999,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: moreOpen || hovered ? DS.ink[100] : '#FFFFFF',
              borderWidth: 1, borderColor: DS.ink[200],
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: DS.ink[700], marginTop: -4 }}>···</Text>
          </Pressable>

          {moreOpen && (
            <>
              {/* Dışarı tıklayınca kapansın */}
              <Pressable
                onPress={() => setMoreOpen(false)}
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 } as any}
              />
              <View style={{
                position: 'absolute', top: '100%', ...(isRTL() ? { left: 0 } : { right: 0 }), marginTop: 6, zIndex: 50,
                minWidth: 210, borderRadius: 14, padding: 6,
                backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: DS.ink[200],
                ...(Platform.OS === 'web' ? { boxShadow: '0 16px 40px rgba(15,23,42,0.14)' } as any : {}),
              }}>
                {([
                  { icon: Tag,      label: 'Kategoriler', onPress: () => setCatManagerOpen(true) },
                  { icon: FileDown, label: 'PDF olarak dışa aktar', onPress: () => setPdfModalOpen(true) },
                  ...(emptyDefaultCats.length > 0
                    ? [{ icon: Trash2, label: `Boş kategorileri temizle (${emptyDefaultCats.length})`, onPress: handleCleanupEmpty }]
                    : []),
                ] as const).map(it => {
                  const Icon = it.icon;
                  return (
                    <Pressable
                      key={it.label}
                      onPress={() => { setMoreOpen(false); it.onPress(); }}
                      style={({ hovered }: any) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 9,
                        paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10,
                        backgroundColor: hovered ? DS.ink[50] : 'transparent',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      <Icon size={14} color={DS.ink[500]} strokeWidth={1.8} />
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: DS.ink[900] }}>{it.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <Pressable style={[s.addBtn, { backgroundColor: catTheme.accent }] as any} onPress={openAdd}>
          <Plus size={15} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={s.addBtnText}>Hizmet Ekle</Text>
        </Pressable>
      </View>

      {/* PDF export modal */}
      <Modal visible={pdfModalOpen} transparent animationType="fade" onRequestClose={() => setPdfModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: 440, maxWidth: '100%', backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 22, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>Fiyat Listesi PDF</Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>
                Yeni sekmede açılır, yazdır veya PDF olarak kaydet (Ctrl/Cmd+P).
              </Text>
            </View>
            <View style={{ padding: 18, gap: 12 }}>
              <Pressable
                onPress={() => { setPdfModalOpen(false); setPriceBuilderPriced(false); setPriceBuilderOpen(true); }}
                style={({ hovered }: any) => ({
                  padding: 14, borderRadius: 12,
                  backgroundColor: hovered ? '#F8FAFC' : '#FFFFFF',
                  borderWidth: 1, borderColor: DS.ink[200],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900], marginBottom: 3 }}>Boş Fiyat Listesi</Text>
                <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                  Klinik için boş — fiyat alanları el ile yazılır. Renk, başlık ve içerik düzenlenebilir.
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setPdfModalOpen(false); setPriceBuilderPriced(true); setPriceBuilderOpen(true); }}
                style={({ hovered }: any) => ({
                  padding: 14, borderRadius: 12,
                  backgroundColor: hovered ? '#F8FAFC' : '#FFFFFF',
                  borderWidth: 1, borderColor: DS.ink[200],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900], marginBottom: 3 }}>Fiyatlı Liste</Text>
                <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                  Mevcut fiyatlar ile — renk, başlık, kategori ve içerik düzenlenebilir.
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setPdfModalOpen(false); setCatalogOpen(true); }}
                style={({ hovered }: any) => ({
                  padding: 14, borderRadius: 12,
                  backgroundColor: hovered ? catTheme.primary + '12' : catTheme.primary + '0A',
                  borderWidth: 1, borderColor: catTheme.primary + '50',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: catTheme.primary }}>Katalog (Pazarlama)</Text>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999, backgroundColor: catTheme.primary }}>
                    <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 }}>YENİ</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                  Kapak + hakkımızda + teknolojiler + hizmetler + iletişim — çok sayfalı, modern brosur tarzı.
                </Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 18, paddingBottom: 16, alignItems: 'flex-end' }}>
              <Pressable onPress={() => setPdfModalOpen(false)} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Category filter pills — panel theme tab bar paterni */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <ScrollView
          ref={catScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            flexDirection: 'row', gap: 3, padding: 3,
            borderRadius: 9999, backgroundColor: DS.ink[50],
            alignItems: 'center',
          }}
        >
          {allCats.map((c) => {
            const active = catFilter === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCatFilter(c)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7,
                  borderRadius: 9999,
                  backgroundColor: active ? catTheme.primary : 'transparent',
                  cursor: 'pointer' as any,
                  outlineStyle: 'none' as any,
                }}
              >
                <Text style={{
                  fontSize: 11.5,
                  fontWeight: active ? '700' : '600',
                  letterSpacing: 0.2,
                  textTransform: 'none',
                  color: active ? '#FFFFFF' : DS.ink[500],
                }} numberOfLines={1}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <CenteredLoader color={PRIMARY} inline />
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {Object.entries(grouped).map(([cat, items]) => (
            <View key={cat}>
              <CategoryHeader
                name={cat}
                count={items.length}
                onRename={(nv) => handleRenameCategory(cat, nv)}
                onDelete={() => handleDeleteCategory(cat)}
                onMerge={() => setCatMgmt({ mode: 'merge', source: cat })}
                onSplit={() => setCatMgmt({ mode: 'split', source: cat })}
                onMove={(dir) => handleMoveCategory(cat, dir)}
                isFirst={visibleFilterCats.indexOf(cat) === 0}
                isLast={visibleFilterCats.indexOf(cat) === visibleFilterCats.length - 1}
              />
              <View style={s.catCard}>
              {items.map((sv, idx) => (
                <ServiceRow
                  key={sv.id}
                  service={sv}
                  onEdit={openEdit}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onMove={handleMove}
                  isFirst={idx === 0}
                  isLast={idx === items.length - 1}
                  dragging={dragInfo?.id === sv.id}
                  isOver={overId === sv.id && dragInfo?.key === cat && dragInfo?.id !== sv.id}
                  onDragStart={() => setDragInfo({ id: sv.id, key: cat })}
                  onDragEnter={() => setOverId(sv.id)}
                  onDrop={() => { if (dragInfo?.key === cat) reorderServices(items, dragInfo.id, sv.id); setDragInfo(null); setOverId(null); }}
                  onDragEnd={() => { setDragInfo(null); setOverId(null); }}
                />
              ))}
              </View>
            </View>
          ))}
          {ungrouped.length > 0 && (
            <View>
              <View style={s.groupHeader}>
                <Text style={s.groupTitle}>Diğer</Text>
                <Text style={s.groupCount}>{ungrouped.length} hizmet</Text>
              </View>
              <View style={s.catCard}>
              {ungrouped.map((sv, idx) => (
                <ServiceRow
                  key={sv.id}
                  service={sv}
                  onEdit={openEdit}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onMove={handleMove}
                  isFirst={idx === 0}
                  isLast={idx === ungrouped.length - 1}
                  dragging={dragInfo?.id === sv.id}
                  isOver={overId === sv.id && dragInfo?.key === '__ungrouped' && dragInfo?.id !== sv.id}
                  onDragStart={() => setDragInfo({ id: sv.id, key: '__ungrouped' })}
                  onDragEnter={() => setOverId(sv.id)}
                  onDrop={() => { if (dragInfo?.key === '__ungrouped') reorderServices(ungrouped, dragInfo.id, sv.id); setDragInfo(null); setOverId(null); }}
                  onDragEnd={() => { setDragInfo(null); setOverId(null); }}
                />
              ))}
              </View>
            </View>
          )}
          {filtered.length === 0 && (
            <View style={s.empty}>
              <Tag size={36} color={DS.ink[300]} strokeWidth={1.4} />
              <Text style={s.emptyTitle}>{search ? 'Sonuç bulunamadı' : 'Henüz hizmet eklenmemiş'}</Text>
              {!search && (
                <Pressable style={s.emptyBtn as any} onPress={openAdd}>
                  <Text style={s.emptyBtnText}>Ilk hizmeti ekle</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <ServiceModal
        visible={modal}
        edit={edit}
        form={form}
        setForm={setForm}
        error={error}
        setError={setError}
        saving={saving}
        onClose={() => setModal(false)}
        onSave={handleSave}
        categories={Array.from(new Set([
          ...SERVICE_CATEGORIES,
          ...services.map(sv => sv.category).filter((c): c is string => !!c && c.trim().length > 0),
        ])).filter(c => usedCats.includes(c) || !hiddenCats.has(c))}
      />

      {catMgmt && (
        <CategoryManageModal
          mode={catMgmt.mode}
          source={catMgmt.source}
          services={services}
          allCategories={dynamicCategories}
          onClose={() => setCatMgmt(null)}
          onMerge={handleMergeCategory}
          onSplit={handleSplitCategory}
        />
      )}

      <CategoriesManagerModal
        visible={catManagerOpen}
        onClose={() => setCatManagerOpen(false)}
        dbCats={dbCats}
        usedCounts={usedCats.reduce((acc, c) => { acc[c] = services.filter(sv => (sv.category ?? '') === c).length; return acc; }, {} as Record<string, number>)}
        onCreate={catCreate}
        onRename={catRename}
        onDelete={catDelete}
      />

      <CatalogBuilderModal
        visible={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        services={services}
        dynamicCategories={dynamicCategories}
        currency="EUR"
        labId={(profile as any)?.lab_id ?? null}
      />

      <PriceListBuilderModal
        visible={priceBuilderOpen}
        pricedMode={priceBuilderPriced}
        onClose={() => setPriceBuilderOpen(false)}
        services={services}
        dynamicCategories={visibleFilterCats}
        labId={(profile as any)?.lab_id ?? null}
      />
    </View>
  );
}

function CategoryHeader({
  name, count, onRename, onDelete, onMerge, onSplit, onMove, isFirst, isLast,
}: {
  name: string;
  count: number;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onMerge: () => void;
  onSplit: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const T = useMobileTokens();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    setEditing(false);
  };
  const iconBtn = (color: string = DS.ink[500]) => ({ hovered }: any) => ({
    padding: 5, borderRadius: 6,
    backgroundColor: hovered ? DS.ink[100] : 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  });
  return (
    <View style={[s.groupHeader, { borderBottomColor: T.hairline }]}>
      {editing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            onSubmitEditing={commit}
            onBlur={commit}
            placeholderTextColor={DS.ink[300]}
            style={[
              s.groupTitle as any,
              {
                flex: 1,
                paddingVertical: 2, paddingHorizontal: 6,
                borderRadius: 6, borderWidth: 1, borderColor: DS.ink[300],
                backgroundColor: '#FFFFFF',
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              },
            ]}
          />
          <Pressable
            onPress={() => { setDraft(name); setEditing(false); }}
            hitSlop={6}
            style={iconBtn()}
          >
            <X size={12} color={DS.ink[500]} strokeWidth={1.8} />
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
            <View style={{ gap: 2, marginEnd: 6 }}>
              <Pressable
                onPress={() => !isFirst && onMove(-1)}
                disabled={isFirst}
                hitSlop={4}
                style={({ hovered }: any) => ({
                  width: 18, height: 14, borderRadius: 4,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isFirst ? 'transparent' : (hovered ? DS.ink[100] : DS.ink[50]),
                  opacity: isFirst ? 0.3 : 1,
                  ...(Platform.OS === 'web' && !isFirst ? { cursor: 'pointer' } as any : {}),
                })}
                accessibilityLabel={`${name} kategorisini yukarı taşı`}
              >
                <ChevronUp size={10} color={DS.ink[700]} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={() => !isLast && onMove(1)}
                disabled={isLast}
                hitSlop={4}
                style={({ hovered }: any) => ({
                  width: 18, height: 14, borderRadius: 4,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isLast ? 'transparent' : (hovered ? DS.ink[100] : DS.ink[50]),
                  opacity: isLast ? 0.3 : 1,
                  ...(Platform.OS === 'web' && !isLast ? { cursor: 'pointer' } as any : {}),
                })}
                accessibilityLabel={`${name} kategorisini aşağı taşı`}
              >
                <ChevronDown size={10} color={DS.ink[700]} strokeWidth={2} />
              </Pressable>
            </View>
            <Text style={s.groupTitle}>{name}</Text>
            <Pressable
              onPress={() => { setDraft(name); setEditing(true); }}
              hitSlop={6}
              style={iconBtn()}
              accessibilityLabel={`${name} kategorisini yeniden adlandır`}
            >
              <Pencil size={11} color={DS.ink[500]} strokeWidth={1.6} />
            </Pressable>
            <Pressable
              onPress={onMerge}
              hitSlop={6}
              style={iconBtn()}
              accessibilityLabel={`${name} kategorisini birleştir`}
            >
              <GitMerge size={11} color={DS.ink[500]} strokeWidth={1.6} />
            </Pressable>
            <Pressable
              onPress={onSplit}
              hitSlop={6}
              style={iconBtn()}
              accessibilityLabel={`${name} kategorisini böl`}
            >
              <Scissors size={11} color={DS.ink[500]} strokeWidth={1.6} />
            </Pressable>
            <Pressable
              onPress={onDelete}
              hitSlop={6}
              style={({ hovered }: any) => ({
                padding: 5, borderRadius: 6,
                backgroundColor: hovered ? 'rgba(217,75,75,0.10)' : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
              accessibilityLabel={`${name} kategorisini sil`}
            >
              <Trash2 size={11} color="#D94B4B" strokeWidth={1.6} />
            </Pressable>
          </View>
          <Text style={s.groupCount}>{count} hizmet</Text>
        </>
      )}
    </View>
  );
}

function ServiceRow({
  service: sv, onEdit, onToggle, onDelete, onMove, isFirst, isLast,
  dragging, isOver, onDragStart, onDragEnter, onDrop, onDragEnd,
}: {
  service: LabService;
  onEdit: (s: LabService) => void;
  onToggle: (s: LabService) => void;
  onDelete: (s: LabService) => void;
  onMove: (s: LabService, dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
  dragging?: boolean; isOver?: boolean;
  onDragStart?: () => void; onDragEnter?: () => void; onDrop?: () => void; onDragEnd?: () => void;
}) {
  const theme = usePanelTheme();
  const T = useMobileTokens();
  const isWeb = Platform.OS === 'web';
  const arrowBtnStyle = (disabled: boolean) => ({ hovered }: any) => ({
    width: 22, height: 18, borderRadius: 6,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: disabled ? 'transparent' : (hovered ? DS.ink[100] : DS.ink[50]),
    opacity: disabled ? 0.3 : 1,
    ...(Platform.OS === 'web' && !disabled ? { cursor: 'pointer' } as any : {}),
  });

  const row = (
    <View style={[
      s.serviceRow,
      isLast && { borderBottomWidth: 0 },
      !sv.is_active && { opacity: 0.5 },
      dragging && { opacity: 0.4 },
      isOver && { backgroundColor: 'rgba(8,145,178,0.06)' },
    ]}>
      {/* Sürükle tutamacı (web) — mobilde ↑↓ okları */}
      {isWeb ? (
        React.createElement('div', {
          draggable: true,
          onDragStart: (e: any) => { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sv.id); } catch {} onDragStart?.(); },
          onDragEnd: () => onDragEnd?.(),
          style: { cursor: 'grab', display: 'flex', alignItems: 'center', marginEnd: 8, touchAction: 'none' },
          title: 'Sürükleyerek sırala',
        }, <GripVertical size={16} color={DS.ink[400]} strokeWidth={1.9} />)
      ) : (
        <View style={{ gap: 2, marginEnd: 8 }}>
          <Pressable onPress={() => !isFirst && onMove(sv, -1)} disabled={isFirst} hitSlop={4} style={arrowBtnStyle(isFirst)}>
            <ChevronUp size={12} color={DS.ink[500]} strokeWidth={2} />
          </Pressable>
          <Pressable onPress={() => !isLast && onMove(sv, 1)} disabled={isLast} hitSlop={4} style={arrowBtnStyle(isLast)}>
            <ChevronDown size={12} color={DS.ink[500]} strokeWidth={2} />
          </Pressable>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.serviceName, { color: T.ink }]} numberOfLines={1}>{sv.name}</Text>
        {sv.production_days != null && (
          <Text style={{ fontSize: 11, color: DS.ink[400], fontWeight: '500', marginTop: 2 }}>
            {sv.production_days} gün
          </Text>
        )}
      </View>
      {/* Fiyat — sağda, satırın önünde (başlık altında değil) */}
      {/* Renk DEĞİL ağırlık vurgular: `theme.primary` lab panelinde safran
          (#F5C24B) — beyaz zeminde ~1.6:1 kontrast, yani sayfanın en önemli
          sayısı en okunmaz olanıydı. Ücretsiz hizmet yeşil kalır (anlam taşır). */}
      <Text style={[s.servicePrice, { color: sv.price_type === 'free' ? '#1F6B47' : T.ink, marginTop: 0, textAlign: 'end' as any }]}>
        {fmtServicePrice(sv)}
      </Text>
      <Pressable style={s.editBtn as any} onPress={() => onEdit(sv)}>
        <Pencil size={14} color={DS.ink[500]} strokeWidth={1.6} />
      </Pressable>
      <Pressable
        onPress={() => onDelete(sv)}
        hitSlop={6}
        style={({ hovered }: any) => ({
          width: 30, height: 30, borderRadius: 8,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: hovered ? 'rgba(217,75,75,0.10)' : 'transparent',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        })}
        accessibilityLabel={`${sv.name} hizmetini sil`}
      >
        <Trash2 size={14} color="#D94B4B" strokeWidth={1.6} />
      </Pressable>
      <AppSwitch value={sv.is_active} onValueChange={() => onToggle(sv)} accentColor={theme.primary} />
    </View>
  );

  if (isWeb) {
    return React.createElement('div', {
      onDragOver: (e: any) => { e.preventDefault(); onDragEnter?.(); },
      onDrop: (e: any) => { e.preventDefault(); onDrop?.(); },
    }, row);
  }
  return row;
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 2 — Ozel Listeler (clinic / doctor-specific prices)
// ────────────────────────────────────────────────────────────────────────────
function CustomTab() {
  const T = useMobileTokens();
  const { profile } = useAuthStore();
  const [clinics, setClinics]         = useState<Clinic[]>([]);
  const [services, setServices]       = useState<LabService[]>([]);
  const [overrides, setOverrides]     = useState<PriceOverride[]>([]);
  const [overrideCounts, setOverrideCounts] = useState<Record<string, number>>({});
  const [selectedClinic, setSelected] = useState<Clinic | null>(null);
  const [loading, setLoading]         = useState(true);
  const [editModal, setEditModal]     = useState(false);
  const [editSvc, setEditSvc]         = useState<LabService | null>(null);
  const [oForm, setOForm]             = useState({ custom_price: '', discount_percent: '', notes: '', currency: 'TRY' });
  const [oErr, setOErr]               = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [pdfBusy, setPdfBusy]         = useState(false);
  const [importing, setImporting]     = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  // Klinik özel liste override map'i (builder'a geçilir)
  const overrideMap = React.useMemo(() => {
    const m: Record<string, { customPrice: number | null; discountPercent: number | null; currency?: string | null }> = {};
    // currency de taşınır: özel fiyat USD kaydedilip hizmet EUR iken PDF
    // hizmetin sembolünü basıyor, tutarı yanlış para biriminde gösteriyordu.
    overrides.forEach(o => {
      m[o.service_id] = { customPrice: o.custom_price, discountPercent: o.discount_percent, currency: o.currency };
    });
    return m;
  }, [overrides]);

  // Klinik listesinde görünen kategoriler (en az 1 hizmeti olan)
  const clinicCategories = React.useMemo(() => {
    const used = new Set<string>();
    services.filter(s => s.is_active).forEach(s => used.add(s.category || 'Diğer'));
    return Array.from(used);
  }, [services]);

  const exportClinicPdf = () => {
    if (!selectedClinic) return;
    setBuilderOpen(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cl }, { data: sv }, { data: oc }] = await Promise.all([
      fetchClinics(),
      fetchAllLabServices(),
      supabase.from('clinic_price_overrides').select('clinic_id'),
    ]);
    setClinics((cl as Clinic[]) ?? []);
    setServices((sv as LabService[]) ?? []);
    // Group overrides by clinic_id for badge counts
    const counts: Record<string, number> = {};
    (oc as { clinic_id: string }[] | null)?.forEach((row) => {
      counts[row.clinic_id] = (counts[row.clinic_id] ?? 0) + 1;
    });
    setOverrideCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadOverrides = useCallback(async (clinicId: string) => {
    const { data } = await supabase
      .from('clinic_price_overrides')
      .select('*')
      .eq('clinic_id', clinicId);
    setOverrides((data as PriceOverride[]) ?? []);
  }, []);

  const selectClinic = (c: Clinic) => {
    setSelected(c);
    loadOverrides(c.id);
  };

  const openEditOverride = (sv: LabService) => {
    const existing = overrides.find((o) => o.service_id === sv.id);
    setOErr(null);
    setEditSvc(sv);
    setOForm({
      custom_price:     existing?.custom_price != null ? String(existing.custom_price) : '',
      discount_percent: existing?.discount_percent != null ? String(existing.discount_percent) : '',
      notes:            existing?.notes ?? '',
      currency:         existing?.currency || sv.currency || 'TRY',
    });
    setEditModal(true);
  };

  const handleSaveOverride = async () => {
    if (!selectedClinic || !editSvc) return;
    setOErr(null);
    setSaving(true);
    const existing = overrides.find((o) => o.service_id === editSvc.id);
    const payload = {
      clinic_id:        selectedClinic.id,
      service_id:       editSvc.id,
      custom_price:     oForm.custom_price ? parseFloat(oForm.custom_price) : null,
      discount_percent: oForm.discount_percent ? parseFloat(oForm.discount_percent) : null,
      currency:         oForm.currency || 'TRY',
      notes:            oForm.notes || null,
    };
    const isNew = !existing;
    const { error } = existing
      ? await supabase.from('clinic_price_overrides').update(payload).eq('id', existing.id)
      : await supabase.from('clinic_price_overrides').insert(payload);
    setSaving(false);
    if (error) {
      // Hata artık yutulmuyor — popup açık kalır, kullanıcı görür
      setOErr(error.message || 'Kaydedilemedi. Lütfen tekrar deneyin.');
      return;
    }
    setEditModal(false);
    await loadOverrides(selectedClinic.id);
    if (isNew) {
      setOverrideCounts(prev => ({ ...prev, [selectedClinic.id]: (prev[selectedClinic.id] ?? 0) + 1 }));
    }
  };

  const handleDeleteOverride = async () => {
    if (!selectedClinic || !editSvc) return;
    const existing = overrides.find((o) => o.service_id === editSvc.id);
    if (!existing) { setEditModal(false); return; }
    const { error } = await supabase.from('clinic_price_overrides').delete().eq('id', existing.id);
    if (error) { setOErr(error.message || 'Silinemedi. Lütfen tekrar deneyin.'); return; }
    setEditModal(false);
    loadOverrides(selectedClinic.id);
    setOverrideCounts(prev => ({ ...prev, [selectedClinic.id]: Math.max(0, (prev[selectedClinic.id] ?? 1) - 1) }));
  };

  // F2: Standart listeyi bu kliniğe toplu aktar — override'ı olmayan tüm aktif
  // hizmetler için standart fiyatıyla bir özel-fiyat satırı oluştur (başlangıç noktası).
  const handleImportStandard = async () => {
    if (!selectedClinic) return;
    const existing = new Set(overrides.map((o) => o.service_id));
    const toAdd = services.filter((sv) => sv.is_active && !existing.has(sv.id));
    if (toAdd.length === 0) {
      if (typeof window !== 'undefined') window.alert('Tüm hizmetler zaten bu kliniğe aktarılmış.');
      return;
    }
    const ok = await confirmAsync('Kliniğe Kopyala', `${toAdd.length} ${autoT('hizmet standart fiyatıyla')} "${selectedClinic.name}" ${autoT('kliniğine kopyalanacak. Sonra tek tek düzenleyebilirsin.')}`, { confirmText: 'Kopyala' });
    if (!ok) return;
    setImporting(true);
    const rows = toAdd.map((sv) => ({
      clinic_id:        selectedClinic.id,
      service_id:       sv.id,
      custom_price:     sv.price,
      discount_percent: null,
      currency:         sv.currency ?? 'TRY',
      notes:            null,
    }));
    const { error } = await supabase.from('clinic_price_overrides').insert(rows);
    setImporting(false);
    if (error) { if (typeof window !== 'undefined') window.alert('Aktarım başarısız: ' + error.message); return; }
    loadOverrides(selectedClinic.id);
    setOverrideCounts((prev) => ({ ...prev, [selectedClinic.id]: (prev[selectedClinic.id] ?? 0) + toAdd.length }));
  };

  const getEffectivePrice = (sv: LabService, override?: PriceOverride) => {
    if (!override) return null;
    if (override.custom_price != null) return override.custom_price;
    if (override.discount_percent != null) {
      return sv.price * (1 - override.discount_percent / 100);
    }
    return null;
  };

  const activeSvcs = services.filter((sv) => sv.is_active);

  if (loading) return <CenteredLoader color={PRIMARY} inline />;

  return (
    <View style={s.tabContent}>
      {!selectedClinic ? (
        /* -- Clinic picker -- */
        <ScrollView contentContainerStyle={s.list}>
          <View style={s.infoCard}>
            <Info size={15} color="#2563EB" strokeWidth={1.6} />
            <Text style={s.infoText}>
              Klinik seçin ve o kliniğe özel fiyatları düzenleyin. Belirlenmemiş hizmetler standart fiyatla uygulanır.
            </Text>
          </View>

          {clinics.length === 0 ? (
            <View style={s.empty}>
              <Building2 size={36} color={DS.ink[300]} strokeWidth={1.4} />
              <Text style={s.emptyTitle}>Henüz klinik eklenmemiş</Text>
            </View>
          ) : (
            clinics.map((c) => {
              const overrideCount = overrideCounts[c.id] ?? 0;
              return (
                <Pressable key={c.id} style={s.clinicCard as any} onPress={() => selectClinic(c)}>
                  <View style={s.clinicIcon}>
                    <Building2 size={18} color="#2563EB" strokeWidth={1.6} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.clinicName}>{c.name}</Text>
                    {c.contact_person && (
                      <Text style={s.clinicSub}>{c.contact_person}</Text>
                    )}
                  </View>
                  {overrideCount > 0 && (
                    <View style={s.overrideBadge}>
                      <Text style={s.overrideBadgeText}>{overrideCount}</Text>
                    </View>
                  )}
                  {isRTL() ? <ChevronLeft size={16} color={DS.ink[400]} strokeWidth={1.6} /> : <ChevronRight size={16} color={DS.ink[400]} strokeWidth={1.6} />}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      ) : (
        /* -- Service override list for selected clinic -- */
        <View style={{ flex: 1 }}>
          {/* Back + clinic name header */}
          <View style={s.clinicHeader}>
            <Pressable style={s.backBtn as any} onPress={() => setSelected(null)}>
              {isRTL() ? <ArrowRight size={16} color="#2563EB" strokeWidth={1.6} /> : <ArrowLeft size={16} color="#2563EB" strokeWidth={1.6} />}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.clinicHeaderTitle}>{selectedClinic.name}</Text>
              <Text style={s.clinicHeaderSub}>Ozel fiyat listesi</Text>
            </View>
            {/* F2: Standart listeyi bu kliniğe toplu aktar (başlangıç noktası) */}
            <Pressable
              onPress={handleImportStandard}
              disabled={importing}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                backgroundColor: hovered ? '#1D4ED8' : '#2563EB',
                opacity: importing ? 0.6 : 1,
                ...(Platform.OS === 'web' ? { cursor: importing ? 'wait' as any : 'pointer' as any } as any : {}),
              })}
            >
              <PlusCircle size={14} color="#FFFFFF" strokeWidth={1.9} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{importing ? 'Aktarılıyor…' : 'Standart listeyi aktar'}</Text>
            </Pressable>
            <Pressable
              onPress={exportClinicPdf}
              disabled={pdfBusy}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                backgroundColor: hovered ? '#F1F5F9' : '#FFFFFF',
                borderWidth: 1, borderColor: DS.ink[200],
                opacity: pdfBusy ? 0.6 : 1,
                ...(Platform.OS === 'web' ? { cursor: pdfBusy ? 'wait' as any : 'pointer' as any } as any : {}),
              })}
            >
              <FileDown size={14} color={DS.ink[700]} strokeWidth={1.8} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>{pdfBusy ? 'Hazırlanıyor…' : 'PDF'}</Text>
            </Pressable>
            <View style={s.overrideBadge}>
              <Text style={s.overrideBadgeText}>{overrides.length} ozel fiyat</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={s.list}>
            {(() => {
              // Dinamik: hizmetlerin GERÇEK kategorileri (kategorisiz → 'Diğer').
              // Hardcoded SERVICE_CATEGORIES kullanılmıyordu → özel kategorili hizmetler
              // filtrelenip ekran boş kalıyordu. Artık tüm hizmetler listelenir.
              const cats = Array.from(new Set(activeSvcs.map((sv) => sv.category || 'Diğer')));
              cats.sort((a, b) => {
                const ia = SERVICE_CATEGORIES.indexOf(a), ib = SERVICE_CATEGORIES.indexOf(b);
                if (ia < 0 && ib < 0) return a.localeCompare(b, 'tr');
                if (ia < 0) return 1; if (ib < 0) return -1; return ia - ib;
              });
              return cats.map((cat) => {
              const catSvcs = activeSvcs.filter((sv) => (sv.category || 'Diğer') === cat);
              if (!catSvcs.length) return null;
              return (
                <View key={cat}>
                  <View style={s.groupHeader}>
                    <Text style={s.groupTitle}>{cat}</Text>
                  </View>
                  {catSvcs.map((sv) => {
                    const override = overrides.find((o) => o.service_id === sv.id);
                    const effPrice = getEffectivePrice(sv, override);
                    return (
                      <Pressable
                        key={sv.id}
                        style={s.overrideRow as any}
                        onPress={() => openEditOverride(sv)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[s.serviceName, { color: T.ink }]}>{sv.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 3, alignItems: 'center' }}>
                            {effPrice != null ? (
                              <>
                                <Text style={s.overridePrice}>{(Number(effPrice) || 0).toLocaleString('tr-TR')} {priceSym(override?.custom_price != null ? (override.currency || sv.currency) : sv.currency)}</Text>
                                <Text style={s.standardPrice}>{(Number(sv.price) || 0).toLocaleString('tr-TR')} {priceSym(sv.currency)}</Text>
                                {override?.discount_percent != null && (
                                  <View style={s.discountBadge}>
                                    <Text style={s.discountText}>-{override.discount_percent}%</Text>
                                  </View>
                                )}
                              </>
                            ) : (
                              <Text style={s.stdPriceLabel}>Standart: {(Number(sv.price) || 0).toLocaleString('tr-TR')} {priceSym(sv.currency)}</Text>
                            )}
                          </View>
                        </View>
                        {override
                          ? <Pencil size={16} color="#2563EB" strokeWidth={1.6} />
                          : <PlusCircle size={16} color={DS.ink[400]} strokeWidth={1.6} />
                        }
                      </Pressable>
                    );
                  })}
                </View>
              );
              });
            })()}
          </ScrollView>
        </View>
      )}

      {/* Override edit modal */}
      <Modal visible={editModal} transparent animationType="fade" onRequestClose={() => setEditModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.header}>
              <Text style={m.title}>Ozel Fiyat Belirle</Text>
              <Pressable style={m.closeBtn as any} onPress={() => setEditModal(false)}>
                <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
              </Pressable>
            </View>
            <ScrollView style={m.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
              {editSvc && (
                <View style={m.svcInfoCard}>
                  <Text style={m.svcInfoLabel}>Hizmet</Text>
                  <Text style={m.svcInfoName}>{editSvc.name}</Text>
                  <Text style={m.svcInfoPrice}>Standart: {(Number(editSvc.price) || 0).toLocaleString('tr-TR')} {editSvc.currency}</Text>
                </View>
              )}

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Fiyatlandırma Yontemi</Text>
                <Text style={m.hint}>Ozel fiyat VEYA iskonto orani belirleyebilirsiniz. Ikisi birden girilirse ozel fiyat onceliklidir.</Text>

                {/* Para birimi — kliniğe özel liste farklı dövizde olabilir */}
                <View style={m.fieldWrap}>
                  <Text style={m.fieldLabel}>Para Birimi</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['TRY', 'EUR', 'USD', 'GBP', 'IRT'] as const).map((c) => {
                      const active = oForm.currency === c;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setOForm((f) => ({ ...f, currency: c }))}
                          style={{
                            flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1,
                            borderColor: active ? '#2563EB' : DS.ink[200],
                            backgroundColor: active ? 'rgba(37,99,235,0.10)' : '#FFFFFF',
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          }}
                        >
                          <Text style={{ fontSize: 12.5, fontWeight: active ? '800' : '600', color: active ? '#2563EB' : DS.ink[700] }}>
                            {priceSym(c)} {c}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={m.fieldWrap}>
                  <Text style={m.fieldLabel}>{`Ozel Fiyat (${priceSym(oForm.currency)})`}</Text>
                  <TextInput
                    style={m.fieldInput as any}
                    value={oForm.custom_price}
                    onChangeText={(v) => setOForm((f) => ({ ...f, custom_price: v }))}
                    placeholder="Orn: 850.00"
                    placeholderTextColor={DS.ink[300]}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={m.divider}>
                  <View style={m.dividerLine} />
                  <Text style={m.dividerText}>VEYA</Text>
                  <View style={m.dividerLine} />
                </View>

                <View style={m.fieldWrap}>
                  <Text style={m.fieldLabel}>Iskonto Orani (%)</Text>
                  <TextInput
                    style={m.fieldInput as any}
                    value={oForm.discount_percent}
                    onChangeText={(v) => setOForm((f) => ({ ...f, discount_percent: v }))}
                    placeholder="Orn: 15"
                    placeholderTextColor={DS.ink[300]}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Not</Text>
                <TextInput
                  style={[m.fieldInput, { minHeight: 72, textAlignVertical: 'top' }] as any}
                  value={oForm.notes}
                  onChangeText={(v) => setOForm((f) => ({ ...f, notes: v }))}
                  placeholder="İsteğe bağlı açıklama..."
                  placeholderTextColor={DS.ink[300]}
                  multiline
                />
              </View>

              <View style={{ height: 8 }} />
            </ScrollView>

            {oErr && (
              <View style={{ paddingHorizontal: 20, paddingBottom: 4 }}>
                <Text style={{ color: '#D94B4B', fontSize: 12.5, fontWeight: '600' }}>{oErr}</Text>
              </View>
            )}
            <View style={m.footer}>
              {overrides.find((o) => o.service_id === editSvc?.id) && (
                <Pressable style={m.deleteBtn as any} onPress={handleDeleteOverride}>
                  <Trash2 size={15} color="#D94B4B" strokeWidth={1.6} />
                  <Text style={m.deleteText}>Sil</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              <Pressable style={m.cancelBtn as any} onPress={() => setEditModal(false)}>
                <Text style={m.cancelText}>İptal</Text>
              </Pressable>
              <Pressable
                style={[m.saveBtn, saving && { opacity: 0.6 }] as any}
                onPress={handleSaveOverride}
                disabled={saving}
              >
                <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <PriceListBuilderModal
        visible={builderOpen}
        pricedMode
        onClose={() => setBuilderOpen(false)}
        services={services}
        dynamicCategories={clinicCategories}
        labId={(profile as any)?.lab_id ?? null}
        clinicName={selectedClinic?.name}
        overrides={overrideMap}
        defaultCurrency="TRY"
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 3 — Promosyonlar
// ────────────────────────────────────────────────────────────────────────────
const DISCOUNT_COLORS: Record<string, string> = {
  active:  '#2D9A6B',
  expired: DS.ink[400],
  soon:    '#E89B2A',
};

function PromotionsTab() {
  const T = useMobileTokens();
  const [promos, setPromos]   = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [editPromo, setEdit]  = useState<Promotion | null>(null);
  const [form, setForm]       = useState({
    name: '', discount_type: 'percent' as 'percent' | 'fixed',
    discount_value: '', scope: 'all' as 'all' | 'category' | 'services',
    category: '', starts_at: '', ends_at: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });
    setPromos((data as Promotion[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEdit(null);
    setForm({ name: '', discount_type: 'percent', discount_value: '', scope: 'all', category: '', starts_at: '', ends_at: '' });
    setModal(true);
  };

  const openEdit = (p: Promotion) => {
    setEdit(p);
    setForm({
      name: p.name,
      discount_type: p.discount_type,
      discount_value: String(p.discount_value),
      scope: p.scope,
      category: p.category ?? '',
      starts_at: p.starts_at ? p.starts_at.split('T')[0] : '',
      ends_at: p.ends_at ? p.ends_at.split('T')[0] : '',
    });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value) || 0,
      scope: form.scope,
      category: form.category || null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      is_active: true,
    };
    if (editPromo) {
      await supabase.from('promotions').update(payload).eq('id', editPromo.id);
    } else {
      await supabase.from('promotions').insert(payload);
    }
    setSaving(false);
    setModal(false);
    load();
  };

  const toggleActive = async (p: Promotion) => {
    await supabase.from('promotions').update({ is_active: !p.is_active }).eq('id', p.id);
    load();
  };

  const getStatus = (p: Promotion): 'active' | 'expired' | 'soon' => {
    const now = new Date();
    if (p.ends_at && new Date(p.ends_at) < now) return 'expired';
    if (p.starts_at && new Date(p.starts_at) > now) return 'soon';
    return 'active';
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(localeTag());
  };

  if (loading) return <CenteredLoader color={PRIMARY} inline />;

  return (
    <View style={s.tabContent}>
      <View style={s.toolbar}>
        <Text style={s.toolbarTitle}>{promos.length} kampanya / promosyon</Text>
        <Pressable style={s.addBtn as any} onPress={openAdd}>
          <Plus size={15} color="#FFFFFF" strokeWidth={2} />
          <Text style={s.addBtnText}>Ekle</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.list}>
        {promos.length === 0 && (
          <View style={s.empty}>
            <Tag size={36} color={DS.ink[300]} strokeWidth={1.4} />
            <Text style={s.emptyTitle}>Henüz promosyon eklenmemiş</Text>
            <Text style={s.emptySubtitle}>Kampanya veya toplu iskonto olusturun</Text>
            <Pressable style={s.emptyBtn as any} onPress={openAdd}>
              <Text style={s.emptyBtnText}>Ilk kampanyayi ekle</Text>
            </Pressable>
          </View>
        )}

        {promos.map((p) => {
          const status  = getStatus(p);
          const color   = DISCOUNT_COLORS[status];
          const statusLabel = status === 'active' ? 'Aktif' : status === 'expired' ? 'Sona Erdi' : 'Yakinda';

          return (
            <View key={p.id} style={[s.promoCard, !p.is_active && { opacity: 0.55 }]}>
              <View style={s.promoTop}>
                {/* Discount badge */}
                <View style={[s.discountCircle, { backgroundColor: color + '18' }]}>
                  <Text style={[s.discountCircleText, { color }]}>
                    {p.discount_type === 'percent'
                      ? `%${p.discount_value}`
                      : `${p.discount_value} ${baseSymbol()}`}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.promoName}>{p.name}</Text>
                  <View style={s.promoMeta}>
                    <View style={[s.statusDot, { backgroundColor: color }]} />
                    <Text style={[s.promoStatus, { color }]}>{statusLabel}</Text>
                    <Text style={s.promoScope}>
                      · {p.scope === 'all' ? 'Tum hizmetler' : p.scope === 'category' ? p.category ?? 'Kategori' : 'Secili hizmetler'}
                    </Text>
                  </View>
                </View>
                <AppSwitch
                  value={p.is_active}
                  onValueChange={() => toggleActive(p)}
                  accentColor={color}
                />
              </View>

              <View style={s.promoDates}>
                <View style={s.dateChip}>
                  <Calendar size={12} color={DS.ink[400]} strokeWidth={1.6} />
                  <Text style={s.dateChipText}>{formatDate(p.starts_at)} → {formatDate(p.ends_at)}</Text>
                </View>
                <Pressable style={s.editSmallBtn as any} onPress={() => openEdit(p)}>
                  <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                  <Text style={s.editSmallText}>Düzenle</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Promo modal */}
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.header}>
              <Text style={m.title}>{editPromo ? 'Promosyon Düzenle' : 'Yeni Promosyon'}</Text>
              <Pressable style={m.closeBtn as any} onPress={() => setModal(false)}>
                <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
              </Pressable>
            </View>

            <ScrollView style={m.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Promosyon Adi</Text>
                <TextInput
                  style={m.fieldInput as any}
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  placeholder="Orn: Agustos Kampanyasi"
                  placeholderTextColor={DS.ink[300]}
                />
              </View>

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Iskonto Turu</Text>
                <View style={s.toggleRow}>
                  {(['percent', 'fixed'] as const).map((t) => (
                    <Pressable
                      key={t}
                      style={[s.toggleChip, form.discount_type === t && s.toggleChipActive]}
                      onPress={() => setForm((f) => ({ ...f, discount_type: t }))}
                    >
                      <Text style={[s.toggleChipText, form.discount_type === t && s.toggleChipTextActive]}>
                        {t === 'percent' ? 'Yüzde (%)' : `Sabit (${baseSymbol()})`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={[m.fieldWrap, { marginTop: 14 }]}>
                  <Text style={m.fieldLabel}>Iskonto Degeri</Text>
                  <TextInput
                    style={m.fieldInput as any}
                    value={form.discount_value}
                    onChangeText={(v) => setForm((f) => ({ ...f, discount_value: v }))}
                    placeholder={form.discount_type === 'percent' ? 'Orn: 15' : 'Orn: 200'}
                    placeholderTextColor={DS.ink[300]}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Kapsam</Text>
                <View style={s.toggleRow}>
                  {([
                    { key: 'all',      label: 'Tum Hizmetler' },
                    { key: 'category', label: 'Kategori' },
                  ] as const).map((sc) => (
                    <Pressable
                      key={sc.key}
                      style={[s.toggleChip, form.scope === sc.key && s.toggleChipActive]}
                      onPress={() => setForm((f) => ({ ...f, scope: sc.key }))}
                    >
                      <Text style={[s.toggleChipText, form.scope === sc.key && s.toggleChipTextActive]}>
                        {sc.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {form.scope === 'category' && (
                  <View style={[m.fieldWrap, { marginTop: 14 }]}>
                    <Text style={m.fieldLabel}>Kategori</Text>
                    <View style={s.toggleRow}>
                      {SERVICE_CATEGORIES.map((cat) => (
                        <Pressable
                          key={cat}
                          style={[s.toggleChip, form.category === cat && s.toggleChipActive]}
                          onPress={() => setForm((f) => ({ ...f, category: cat }))}
                        >
                          <Text style={[s.toggleChipText, form.category === cat && s.toggleChipTextActive]}>{cat}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Gecerlilik Tarihleri</Text>
                <View style={m.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={m.fieldLabel}>Başlangıç</Text>
                    <DatePicker
                      value={form.starts_at}
                      onChange={(v) => setForm((f) => ({ ...f, starts_at: v }))}
                      placeholder="Tarih seç"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.fieldLabel}>Bitiş</Text>
                    <DatePicker
                      value={form.ends_at}
                      onChange={(v) => setForm((f) => ({ ...f, ends_at: v }))}
                      placeholder="Tarih seç"
                    />
                  </View>
                </View>
              </View>

              <View style={{ height: 8 }} />
            </ScrollView>

            <View style={m.footer}>
              <Pressable style={m.cancelBtn as any} onPress={() => setModal(false)}>
                <Text style={m.cancelText}>İptal</Text>
              </Pressable>
              <Pressable
                style={[m.saveBtn, saving && { opacity: 0.6 }] as any}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : editPromo ? 'Güncelle' : 'Oluştur'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Category management modal — merge & split
// ────────────────────────────────────────────────────────────────────────────
// ── Merkezî Kategori Yönetimi modalı ─────────────────────────────────────────
function CategoriesManagerModal({
  visible, onClose, dbCats, usedCounts, onCreate, onRename, onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  dbCats: ServiceCategory[];
  usedCounts: Record<string, number>;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string, catId: string | null) => void;
  onDelete: (name: string, catId: string | null) => void;
}) {
  const [newName, setNewName] = useState('');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  // Birleşik liste: categories tablosu + hizmette kullanılan adlar
  const idByName = new Map(dbCats.map(c => [c.name, c.id]));
  const names = Array.from(new Set([...dbCats.map(c => c.name), ...Object.keys(usedCounts)]))
    .filter(n => !!n && n.trim().length > 0)
    .sort((a, b) => a.localeCompare(b, 'tr'));

  const startEdit = (name: string) => { setEditKey(name); setEditVal(name); };
  const commitEdit = (name: string) => {
    const v = editVal.trim();
    if (v && v !== name) onRename(name, v, idByName.get(name) ?? null);
    setEditKey(null); setEditVal('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 520, maxHeight: '88%', backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden' }}>
          {/* başlık */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(PRIMARY, 0.12) }}>
              <Tag size={17} color={PRIMARY} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: DS.ink[900] }}>Kategori Yönetimi</Text>
              <Text style={{ fontSize: 12, color: DS.ink[500] }}>{names.length} kategori</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)' }}>
              <X size={15} color={DS.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          {/* yeni kategori ekle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
            <TextInput
              value={newName} onChangeText={setNewName}
              onSubmitEditing={() => { onCreate(newName); setNewName(''); }}
              placeholder="Yeni kategori adı…" placeholderTextColor={DS.ink[400]}
              style={{ flex: 1, fontSize: 14, color: DS.ink[900], backgroundColor: '#F5F1EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any}
            />
            <Pressable
              onPress={() => { onCreate(newName); setNewName(''); }}
              disabled={!newName.trim()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: PRIMARY, opacity: newName.trim() ? 1 : 0.5, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <Plus size={15} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Ekle</Text>
            </Pressable>
          </View>

          {/* liste */}
          <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
            {names.length === 0 ? (
              <Text style={{ fontSize: 13, color: DS.ink[400], fontStyle: 'italic', padding: 16, textAlign: 'center' }}>Henüz kategori yok. Yukarıdan ekle.</Text>
            ) : names.map(name => {
              const count = usedCounts[name] ?? 0;
              const catId = idByName.get(name) ?? null;
              const editing = editKey === name;
              return (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FFFFFF' }}>
                  {editing ? (
                    <TextInput
                      value={editVal} onChangeText={setEditVal} autoFocus
                      onSubmitEditing={() => commitEdit(name)} onBlur={() => commitEdit(name)}
                      style={{ flex: 1, fontSize: 14, fontWeight: '600', color: DS.ink[900], backgroundColor: '#F5F1EB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: tint(PRIMARY, 0.4) } as any}
                    />
                  ) : (
                    <Pressable onPress={() => startEdit(name)} style={{ flex: 1, ...(Platform.OS === 'web' ? { cursor: 'text' } as any : {}) }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{name}</Text>
                      <Text style={{ fontSize: 11, color: count > 0 ? DS.ink[500] : DS.ink[400] }}>
                        {count > 0 ? `${count} hizmet` : 'boş'}
                      </Text>
                    </Pressable>
                  )}
                  {editing ? (
                    <Pressable onPress={() => commitEdit(name)} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(PRIMARY, 0.14) }}>
                      <Check size={15} color={PRIMARY} strokeWidth={2.5} />
                    </Pressable>
                  ) : (
                    <>
                      <Pressable onPress={() => startEdit(name)} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
                        <Pencil size={14} color={DS.ink[500]} strokeWidth={1.9} />
                      </Pressable>
                      <Pressable onPress={() => onDelete(name, catId)} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(217,75,75,0.10)' }}>
                        <Trash2 size={14} color="#9C2E2E" strokeWidth={1.9} />
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CategoryManageModal({
  mode, source, services, allCategories, onClose, onMerge, onSplit,
}: {
  mode: 'merge' | 'split';
  source: string;
  services: LabService[];
  allCategories: string[];
  onClose: () => void;
  onMerge: (source: string, target: string) => void;
  onSplit: (source: string, newCatName: string, serviceIds: string[]) => void;
}) {
  const inCat = services.filter(sv => (sv.category ?? '') === source);
  const [target, setTarget] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const otherCats = allCategories.filter(c => c !== source);
  const selectedIds = Object.keys(selected).filter(k => selected[k]);

  const handleSubmit = () => {
    if (mode === 'merge') {
      if (!target) return;
      onMerge(source, target);
    } else {
      if (!newCatName.trim() || selectedIds.length === 0) return;
      onSplit(source, newCatName.trim(), selectedIds);
    }
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ width: 480, maxWidth: '100%', maxHeight: '85%', backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 22, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>
                {mode === 'merge' ? 'Kategoriyi Birleştir' : 'Kategoriyi Böl'}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>
                {mode === 'merge'
                  ? `"${source}" kategorisindeki ${inCat.length} hizmet seçtiğin kategoriye taşınacak.`
                  : `"${source}" kategorisinden seçtiğin hizmetler yeni kategoriye taşınacak.`}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={DS.ink[500]} strokeWidth={1.6} />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 18 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            {mode === 'merge' ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[500], marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  Hedef Kategori
                </Text>
                {otherCats.length === 0 ? (
                  <Text style={{ fontSize: 13, color: DS.ink[500], paddingVertical: 12 }}>
                    Birleştirilebilecek başka kategori yok. Önce başka bir kategori oluştur.
                  </Text>
                ) : (
                  otherCats.map(c => {
                    const active = target === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setTarget(c)}
                        style={({ hovered }: any) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingHorizontal: 12, paddingVertical: 10,
                          borderRadius: 10, borderWidth: 1,
                          borderColor: active ? DS.ink[700] : DS.ink[200],
                          backgroundColor: active ? DS.ink[50] : (hovered ? DS.ink[50] : '#FFFFFF'),
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        <View style={{
                          width: 16, height: 16, borderRadius: 9999,
                          borderWidth: 1.5, borderColor: active ? DS.ink[900] : DS.ink[300],
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: DS.ink[900] }} />}
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{c}</Text>
                        <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                          {services.filter(sv => (sv.category ?? '') === c).length} hizmet
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[500], marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    Yeni Kategori Adı
                  </Text>
                  <TextInput
                    value={newCatName}
                    onChangeText={setNewCatName}
                    placeholder="Örn: Premium Zirkonyum"
                    placeholderTextColor={DS.ink[300]}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 10,
                      borderRadius: 10, borderWidth: 1, borderColor: DS.ink[200],
                      backgroundColor: '#FFFFFF', fontSize: 14, color: DS.ink[900],
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                    } as any}
                  />
                </View>

                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[500], letterSpacing: 0.4, textTransform: 'uppercase' }}>
                      Taşınacak Hizmetler ({selectedIds.length}/{inCat.length})
                    </Text>
                    {inCat.length > 0 && (
                      <Pressable
                        onPress={() => {
                          const allSelected = selectedIds.length === inCat.length;
                          setSelected(allSelected ? {} : Object.fromEntries(inCat.map(sv => [sv.id, true])));
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700] }}>
                          {selectedIds.length === inCat.length ? 'Tümünü Bırak' : 'Tümünü Seç'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={{ borderRadius: 10, borderWidth: 1, borderColor: DS.ink[200], overflow: 'hidden' }}>
                    {inCat.map((sv, i) => {
                      const checked = !!selected[sv.id];
                      return (
                        <Pressable
                          key={sv.id}
                          onPress={() => setSelected(prev => ({ ...prev, [sv.id]: !prev[sv.id] }))}
                          style={({ hovered }: any) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            paddingHorizontal: 12, paddingVertical: 10,
                            borderTopWidth: i === 0 ? 0 : 1, borderTopColor: DS.ink[100],
                            backgroundColor: checked ? DS.ink[50] : (hovered ? DS.ink[50] : '#FFFFFF'),
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          })}
                        >
                          <View style={{
                            width: 16, height: 16, borderRadius: 4,
                            borderWidth: 1.5, borderColor: checked ? DS.ink[900] : DS.ink[300],
                            backgroundColor: checked ? DS.ink[900] : '#FFFFFF',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {checked && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                          </View>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>{sv.name}</Text>
                          <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                            {fmtServicePrice(sv)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable
              onPress={onClose}
              style={({ hovered }: any) => ({
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: hovered ? DS.ink[100] : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={mode === 'merge' ? !target : (!newCatName.trim() || selectedIds.length === 0)}
              style={({ hovered }: any) => {
                const disabled = mode === 'merge' ? !target : (!newCatName.trim() || selectedIds.length === 0);
                return {
                  paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                  backgroundColor: disabled ? DS.ink[200] : (hovered ? DS.ink[800] : DS.ink[900]),
                  opacity: disabled ? 0.6 : 1,
                  ...(Platform.OS === 'web' && !disabled ? { cursor: 'pointer' } as any : {}),
                };
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                {mode === 'merge' ? 'Birleştir' : 'Böl'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Price List Builder Modal — basit fiyat listesi PDF'i için renk/başlık/içerik
// düzenleme. "Boş Fiyat Listesi" ve "Fiyatlı Liste" seçenekleri buradan geçer.
// ────────────────────────────────────────────────────────────────────────────
const PRICE_LIST_SUBTITLE_DEFAULT = 'Gelişmiş CAD/CAM · Dijital Sabit Protez · 3D Baskı Çözümleri';
const PRICE_LIST_BLANKNOTE_DEFAULT = 'Tüm fiyat alanları klinik bazlı özel fiyatlandırma için boş bırakılmıştır.';

function PriceListBuilderModal({
  visible, pricedMode, onClose, services, dynamicCategories, labId,
  clinicName, overrides, defaultCurrency,
}: {
  visible: boolean;
  pricedMode: boolean;
  onClose: () => void;
  services: LabService[];
  dynamicCategories: string[];
  labId: string | null;
  /** Klinik özel liste modu — verilirse başlık klinik teklifi olur. */
  clinicName?: string;
  /** service_id → effective price override (klinik özel fiyatlar). */
  overrides?: Record<string, { customPrice: number | null; discountPercent: number | null; currency?: string | null }>;
  /** Para birimi varsayılanı (klinik listeleri için TRY). */
  defaultCurrency?: string;
}) {
  // Klinik listeleri ayrı config anahtarında saklanır (genel listeyle karışmasın)
  const storageKey = `priceListConfig:${clinicName ? 'clinic:' : ''}${labId ?? 'default'}`;
  const loadStored = (): any => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const stored = loadStored();

  const [loading, setLoading] = useState(true);
  const [lab, setLab] = useState<{ name?: string | null; logo_url?: string | null }>({});

  const [accentId, setAccentId]     = useState<string>(stored?.accentId ?? 'lacivert');
  const [title, setTitle]           = useState<string>(stored?.title ?? '');
  const [subtitle, setSubtitle]     = useState<string>(stored?.subtitle ?? PRICE_LIST_SUBTITLE_DEFAULT);
  const [eyebrow, setEyebrow]       = useState<string>(stored?.eyebrow ?? '');
  const [footerText, setFooterText] = useState<string>(stored?.footerText ?? '');
  const [blankNote, setBlankNote]   = useState<string>(stored?.blankNote ?? PRICE_LIST_BLANKNOTE_DEFAULT);
  const [currency, setCurrency]     = useState<string>(stored?.currency ?? defaultCurrency ?? 'EUR');
  const [hideUnit, setHideUnit]     = useState<boolean>(stored?.hideUnit ?? false);
  const [excludedCats, setExcludedCats] = useState<Record<string, boolean>>(stored?.excludedCats ?? {});
  const [showPrices, setShowPrices] = useState<boolean>(pricedMode);
  const [generating, setGenerating] = useState(false);

  // Fiyat kaynağı — klinik özel listesi mi, standart liste mi.
  // Aynı klinik için iki belge de üretilebilsin diye (özel teklif ↔ standart
  // liste). Kalıcı kaydedilmez: buton "özel liste" diyerek açıldığında
  // varsayılan hep özel olsun.
  const hasOverrides = !!overrides && Object.keys(overrides).length > 0;
  const [useOverrides, setUseOverrides] = useState<boolean>(true);

  // Giriş seçeneğine göre fiyat modunu senkronla (her açılışta)
  useEffect(() => { if (visible) { setShowPrices(pricedMode); setUseOverrides(true); } }, [visible, pricedMode]);

  // Form değiştikçe localStorage'a yaz
  useEffect(() => {
    if (typeof window === 'undefined' || loading) return;
    const payload = { accentId, title, subtitle, eyebrow, footerText, blankNote, currency, hideUnit, excludedCats };
    try { window.localStorage.setItem(storageKey, JSON.stringify(payload)); } catch {}
  }, [loading, storageKey, accentId, title, subtitle, eyebrow, footerText, blankNote, currency, hideUnit, excludedCats]);

  // Lab bilgisini aç­ılışta yükle
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) { loadedFor.current = null; return; }
    if (loadedFor.current === labId) return;
    loadedFor.current = labId;
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (labId) {
        const { data } = await supabase.from('labs').select('name, logo_url').eq('id', labId).maybeSingle();
        if (!cancelled && data) setLab(data as any);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [visible, labId]);

  if (!visible) return null;

  const palette = CATALOG_PALETTES.find(p => p.id === accentId) ?? CATALOG_PALETTES[0];

  // Standart kaynağa geçilince klinik adı da düşer: belge artık o kliniğe özel
  // bir teklif değil, herkese verilen standart liste. Başlık/eyebrow buna göre
  // varsayılana döner.
  const activeOverrides = hasOverrides && useOverrides ? overrides : undefined;
  const activeClinicName = hasOverrides && !useOverrides ? undefined : clinicName;

  const buildHtml = () => {
    const includeCategories = dynamicCategories.filter(c => !excludedCats[c]);
    return buildPriceListPdfHtml({
      labName: lab.name || 'Nexadent Dijital Laboratuvar',
      labLogoUrl: lab.logo_url || null,
      services,
      showPrices,
      currency,
      clinicName: activeClinicName,
      overrides: activeOverrides,
      accent: palette.accent,
      accentSoft: palette.accentSoft,
      title: title.trim() || undefined,
      subtitle,
      eyebrow: eyebrow.trim() || undefined,
      footerText: footerText.trim() || undefined,
      blankNote,
      includeCategories: includeCategories.length ? includeCategories : undefined,
      hideUnit,
    });
  };

  const handlePreview = () => {
    if (typeof window === 'undefined') return;
    const html = buildHtml();
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleDownloadPdf = async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    setGenerating(true);
    try {
      const html = buildHtml();
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:auto;border:none;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open(); doc.write(html); doc.close();

      await new Promise<void>((resolve) => {
        const imgs = Array.from(doc.images);
        if (imgs.length === 0) return resolve();
        let loaded = 0;
        const tick = () => { if (++loaded >= imgs.length) resolve(); };
        imgs.forEach(img => { if (img.complete) tick(); else { img.onload = tick; img.onerror = tick; } });
        setTimeout(resolve, 5000);
      });
      await new Promise(r => setTimeout(r, 300));

      const target = (doc.querySelector('.doc') as HTMLElement | null) ?? doc.body;
      const html2pdfMod: any = await import('html2pdf.js');
      const html2pdf = html2pdfMod.default ?? html2pdfMod;
      // Aynı klinik için iki belge de indirilebildiğinden ad kaynağı belirtir —
      // yoksa "…_FiyatListesi_2026-08.pdf" ikisinde de aynı olup üzerine yazardı.
      const baseName = activeClinicName ? `${lab.name || 'Lab'}_${activeClinicName}` : (lab.name || 'Lab');
      const safeName = baseName.replace(/[^\wÀ-ſĞğŞşİıÇçÜüÖö -]/g, '').trim() || 'FiyatListesi';
      const kind = activeOverrides ? 'OzelFiyatListesi' : 'FiyatListesi';
      const fileName = `${safeName}_${kind}_${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}.pdf`;

      await html2pdf()
        .from(target)
        .set({
          margin: [12, 10, 12, 10],
          filename: fileName,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#FFFFFF', logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'avoid-all'] },
        })
        .save();

      document.body.removeChild(iframe);
    } catch (e: any) {
      console.error('PDF üretim hatası', e);
      if (Platform.OS === 'web') window.alert(`PDF oluşturulamadı: ${e?.message ?? 'bilinmeyen hata'}`);
    } finally {
      setGenerating(false);
    }
  };

  const sectionTitle: any = { fontSize: 11, fontWeight: '700', color: DS.ink[500], letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 };
  const fieldLabel: any = { fontSize: 11, fontWeight: '600', color: DS.ink[500], marginBottom: 6 };
  const fieldInput: any = {
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1, borderColor: DS.ink[200], backgroundColor: '#FFFFFF',
    fontSize: 13, color: DS.ink[900],
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  };
  const sectionBox: any = { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: DS.ink[200], backgroundColor: '#FFFFFF', marginBottom: 12 };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: 640, maxWidth: '100%', maxHeight: '92%', backgroundColor: '#F8FAFC', borderRadius: 18, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ paddingHorizontal: 22, paddingVertical: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: DS.ink[900] }}>
                  {clinicName ? `${clinicName} — ${useOverrides ? 'Özel Liste' : 'Standart Liste'}` : 'Fiyat Listesi Oluşturucu'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: 'rgba(16,185,129,0.10)' }}>
                  <Check size={9} color="#059669" strokeWidth={3} />
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#059669', letterSpacing: 0.4 }}>OTOMATİK KAYIT</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>
                Renk, başlık, kategori ve içeriği düzenle — sonra önizle veya PDF indir.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={({ hovered }: any) => ({ padding: 6, borderRadius: 8, backgroundColor: hovered ? DS.ink[100] : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
              <X size={18} color={DS.ink[500]} />
            </Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 16 }}>
            {/* Fiyat kaynağı — yalnız klinik özel fiyatı varken anlamlı */}
            {hasOverrides && (
              <View style={sectionBox}>
                <Text style={sectionTitle}>Fiyat Kaynağı</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([
                    { key: true,  label: 'Klinik özel fiyatları', desc: `${clinicName ?? 'Klinik'} için belirlenen fiyatlar` },
                    { key: false, label: 'Standart fiyatlar',     desc: 'Herkese verilen genel liste' },
                  ] as const).map(opt => {
                    const active = useOverrides === opt.key;
                    return (
                      <Pressable
                        key={String(opt.key)}
                        onPress={() => setUseOverrides(opt.key)}
                        style={({ hovered }: any) => ({
                          flex: 1, padding: 12, borderRadius: 12,
                          borderWidth: active ? 2 : 1,
                          borderColor: active ? palette.accent : DS.ink[200],
                          backgroundColor: active ? palette.accentSoft : (hovered ? DS.ink[50] : '#FFFFFF'),
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: active ? palette.accent : DS.ink[900] }}>{opt.label}</Text>
                        <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 3 }}>{opt.desc}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Fiyat modu */}
            <View style={sectionBox}>
              <Text style={sectionTitle}>Fiyat Gösterimi</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingEnd: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{showPrices ? 'Fiyatlı liste' : 'Boş liste'}</Text>
                  <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                    {showPrices ? 'Mevcut fiyatlar tabloda gösterilir.' : 'Fiyat alanları boş — el ile doldurulur (klinik pazarlığı için).'}
                  </Text>
                </View>
                <AppSwitch value={showPrices} onValueChange={setShowPrices} />
              </View>
            </View>

            {/* Tema rengi */}
            <View style={sectionBox}>
              <Text style={sectionTitle}>Tema Rengi</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATALOG_PALETTES.map(p => {
                  const active = p.id === accentId;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setAccentId(p.id)}
                      style={({ hovered }: any) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 7,
                        paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9999,
                        borderWidth: active ? 2 : 1, borderColor: active ? p.accent : DS.ink[200],
                        backgroundColor: active ? p.accentSoft : (hovered ? DS.ink[50] : '#FFFFFF'),
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: p.accent }} />
                      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? p.accent : DS.ink[700] }}>{p.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Metinler */}
            <View style={sectionBox}>
              <Text style={sectionTitle}>Başlık & Metinler</Text>

              <Text style={fieldLabel}>Ana Başlık <Text style={{ color: DS.ink[400], fontWeight: '400' }}>(boş = varsayılan)</Text></Text>
              <TextInput
                value={title} onChangeText={setTitle}
                placeholder={showPrices ? 'Güncel hizmet fiyat listesi' : 'Klinik özel fiyat teklifi'}
                placeholderTextColor={DS.ink[400]}
                style={[fieldInput, { marginBottom: 12 }]}
              />

              <Text style={fieldLabel}>Alt Başlık</Text>
              <TextInput
                value={subtitle} onChangeText={setSubtitle}
                placeholder={PRICE_LIST_SUBTITLE_DEFAULT}
                placeholderTextColor={DS.ink[400]}
                style={[fieldInput, { marginBottom: 12 }]}
              />

              <Text style={fieldLabel}>Sağ Üst Etiket <Text style={{ color: DS.ink[400], fontWeight: '400' }}>(boş = varsayılan)</Text></Text>
              <TextInput
                value={eyebrow} onChangeText={setEyebrow}
                placeholder="GÜNCEL FİYAT LİSTESİ"
                placeholderTextColor={DS.ink[400]}
                style={[fieldInput, { marginBottom: 12 }]}
              />

              {!showPrices && (
                <>
                  <Text style={fieldLabel}>Boş Liste Notu <Text style={{ color: DS.ink[400], fontWeight: '400' }}>(boş = gösterilmez)</Text></Text>
                  <TextInput
                    value={blankNote} onChangeText={setBlankNote}
                    placeholder={PRICE_LIST_BLANKNOTE_DEFAULT}
                    placeholderTextColor={DS.ink[400]}
                    multiline
                    style={[fieldInput, { marginBottom: 12, minHeight: 56, textAlignVertical: 'top' }]}
                  />
                </>
              )}

              <Text style={fieldLabel}>Alt Bilgi (Footer) <Text style={{ color: DS.ink[400], fontWeight: '400' }}>(boş = varsayılan)</Text></Text>
              <TextInput
                value={footerText} onChangeText={setFooterText}
                placeholder={`${(lab.name || 'Laboratuvar').toLocaleUpperCase('tr-TR')} · Gelişmiş CAD/CAM İş Akışı`}
                placeholderTextColor={DS.ink[400]}
                style={fieldInput}
              />
            </View>

            {/* Para birimi + birim eki */}
            <View style={sectionBox}>
              <Text style={sectionTitle}>Para Birimi & Görünüm</Text>
              <Text style={fieldLabel}>Para Birimi (başlık etiketi)</Text>
              <View style={{ marginBottom: 12 }}>
                <CurrencyDropdown value={currency} onChange={setCurrency} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingEnd: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>Birim ekini gizle</Text>
                  <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>"/ Üye", "/ Adet" gibi birim etiketlerini gizler.</Text>
                </View>
                <AppSwitch value={hideUnit} onValueChange={setHideUnit} />
              </View>
            </View>

            {/* Kategoriler */}
            {dynamicCategories.length > 0 && (
              <View style={sectionBox}>
                <Text style={sectionTitle}>Dahil Edilecek Kategoriler</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {dynamicCategories.map(c => {
                    const included = !excludedCats[c];
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setExcludedCats(prev => ({ ...prev, [c]: !prev[c] }))}
                        style={({ hovered }: any) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9999,
                          borderWidth: 1, borderColor: included ? palette.accent : DS.ink[200],
                          backgroundColor: included ? palette.accentSoft : (hovered ? DS.ink[50] : '#FFFFFF'),
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        {included
                          ? <Check size={12} color={palette.accent} strokeWidth={2.6} />
                          : <Plus size={12} color={DS.ink[400]} strokeWidth={2.2} />}
                        <Text style={{ fontSize: 12, fontWeight: included ? '600' : '500', color: included ? palette.accent : DS.ink[500] }}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer actions */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable
              onPress={handlePreview}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                flex: 1, paddingVertical: 12, borderRadius: 10,
                borderWidth: 1, borderColor: DS.ink[300], backgroundColor: hovered ? DS.ink[50] : '#FFFFFF',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Search size={15} color={DS.ink[700]} strokeWidth={1.8} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[700] }}>Önizle (yeni sekme)</Text>
            </Pressable>
            <Pressable
              onPress={handleDownloadPdf}
              disabled={generating}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                flex: 1, paddingVertical: 12, borderRadius: 10,
                backgroundColor: generating ? DS.ink[400] : (hovered ? palette.accent : DS.ink[900]),
                opacity: generating ? 0.8 : 1,
                ...(Platform.OS === 'web' ? { cursor: generating ? 'wait' : 'pointer' } as any : {}),
              })}
            >
              <FileDown size={15} color="#FFFFFF" strokeWidth={1.8} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{generating ? 'Oluşturuluyor…' : 'PDF İndir'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Catalog Builder Modal — kapak + hakkımızda + teknolojiler + hizmetler + iletişim
// ────────────────────────────────────────────────────────────────────────────
type LabRow = {
  name?: string | null; logo_url?: string | null;
  address?: string | null; phone?: string | null; email?: string | null;
  website?: string | null;
};
type EquipRow = { id: string; name: string; brand?: string | null; category?: string | null; status?: string | null };

function CatalogBuilderModal({
  visible, onClose, services, dynamicCategories, currency, labId,
}: {
  visible: boolean;
  onClose: () => void;
  services: LabService[];
  dynamicCategories: string[];
  currency: string;
  labId: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [lab, setLab] = useState<LabRow>({});
  const [equipment, setEquipment] = useState<EquipRow[]>([]);

  // Persisted form state — labId'e bağlı localStorage'da saklanır
  const storageKey = `catalogConfig:${labId ?? 'default'}`;
  const loadStored = (): any => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };
  const stored = loadStored();

  const [coverTitle, setCoverTitle] = useState<string>(stored?.coverTitle ?? 'Hizmet Kataloğu');
  const [coverSubtitle, setCoverSubtitle] = useState<string>(stored?.coverSubtitle ?? 'Dijital Diş Laboratuvarı');
  const [coverTagline, setCoverTagline] = useState<string>(stored?.coverTagline ?? 'Modern dijital iş akışı · Hassas üretim · Estetik sonuçlar');
  const [aboutTitle, setAboutTitle] = useState<string>(stored?.aboutTitle ?? 'Tanışalım');
  const [aboutText, setAboutText] = useState<string>(stored?.aboutText ?? '');
  const [whyUs, setWhyUs] = useState<string[]>(stored?.whyUs ?? [
    'Tamamen dijital CAD/CAM iş akışı',
    'Hızlı teslimat, ortalama 5 iş günü',
    'Estetik odaklı premium malzemeler',
  ]);
  const [techIntro, setTechIntro] = useState<string>(stored?.techIntro ?? 'Yatırım yaptığımız donanımlar:');
  const [techSelected, setTechSelected] = useState<Record<string, boolean>>(stored?.techSelected ?? {});
  const [techCustom, setTechCustom] = useState<CatalogTech[]>(stored?.techCustom ?? []);
  const [techDraftName, setTechDraftName] = useState('');
  const [techDraftBrand, setTechDraftBrand] = useState('');
  const [serviceSelected, setServiceSelected] = useState<Record<string, boolean>>(stored?.serviceSelected ?? {});
  const [showPrices, setShowPrices] = useState<boolean>(stored?.showPrices ?? false);
  const [pdfCurrency, setPdfCurrency] = useState<string>(stored?.pdfCurrency ?? currency);
  const [paletteId, setPaletteId] = useState<string>(stored?.paletteId ?? 'lacivert');
  const [contactAddress, setContactAddress] = useState<string>(stored?.contactAddress ?? '');
  const [contactPhone, setContactPhone] = useState<string>(stored?.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState<string>(stored?.contactEmail ?? '');
  const [contactWebsite, setContactWebsite] = useState<string>(stored?.contactWebsite ?? '');
  const [contactInstagram, setContactInstagram] = useState<string>(stored?.contactInstagram ?? '');
  const [footerNote, setFooterNote] = useState<string>(stored?.footerNote ?? 'Fiyatlar KDV hariçtir. Geçerlilik: 30 gün.');
  const [aiBusy, setAiBusy] = useState(false);

  // AI ile kapak/tanıtım metinlerini doldur
  const runAiFill = async () => {
    setAiBusy(true);
    const cats = dynamicCategories ?? [];
    const svcNames = services.filter(s => s.is_active).map(s => s.name).slice(0, 60);
    const res = await aiCatalogCopy(lab.name || 'Diş Laboratuvarı', cats, svcNames);
    setAiBusy(false);
    if (!res.ok || !res.data) {
      if (Platform.OS === 'web') window.alert(res.error ?? 'Üretilemedi. ANTHROPIC_API_KEY tanımlı mı?');
      return;
    }
    const d = res.data;
    if (d.coverTitle) setCoverTitle(d.coverTitle);
    if (d.coverSubtitle) setCoverSubtitle(d.coverSubtitle);
    if (d.coverTagline) setCoverTagline(d.coverTagline);
    if (d.aboutTitle) setAboutTitle(d.aboutTitle);
    if (d.aboutText) setAboutText(d.aboutText);
    if (Array.isArray(d.whyUs) && d.whyUs.length) setWhyUs(d.whyUs.filter(Boolean));
  };

  // Form değiştikçe localStorage'a yaz (debounced'a benzer — her render sonu)
  useEffect(() => {
    if (typeof window === 'undefined' || loading) return;
    const payload = {
      coverTitle, coverSubtitle, coverTagline,
      aboutTitle, aboutText, whyUs,
      techIntro, techSelected, techCustom,
      serviceSelected, showPrices, pdfCurrency, paletteId,
      contactAddress, contactPhone, contactEmail, contactWebsite, contactInstagram,
      footerNote,
    };
    try { window.localStorage.setItem(storageKey, JSON.stringify(payload)); } catch {}
  }, [
    loading, storageKey,
    coverTitle, coverSubtitle, coverTagline,
    aboutTitle, aboutText, whyUs,
    techIntro, techSelected, techCustom,
    serviceSelected, showPrices, pdfCurrency, paletteId,
    contactAddress, contactPhone, contactEmail, contactWebsite, contactInstagram,
    footerNote,
  ]);

  // Load lab + equipment when modal opens — sadece açılıştan bir kere
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !labId) return;
    // Aynı modal açılışında tekrar tetiklenmesin (services prop ref değişiyor olabilir)
    const sessionKey = `${labId}:${visible}`;
    if (loadedFor.current === sessionKey) return;
    loadedFor.current = sessionKey;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: labData }, { data: eqData }] = await Promise.all([
        supabase.from('labs').select('name, logo_url, address, phone, email, website').eq('id', labId).maybeSingle(),
        supabase.from('equipment').select('id, name, brand, category, status').eq('lab_id', labId).neq('status', 'retired').order('category').order('name'),
      ]);
      if (cancelled) return;
      const l = (labData ?? {}) as LabRow;
      setLab(l);
      const eq = (eqData ?? []) as EquipRow[];
      setEquipment(eq);
      // Teknolojiler kullanıcı tercihi — otomatik seçilmez
      // Sadece HİÇ kayıt yoksa servis varsayılanını set et
      const hasStoredService = stored?.serviceSelected && Object.keys(stored.serviceSelected).length > 0;
      if (!hasStoredService) {
        setServiceSelected(Object.fromEntries(services.map(sv => [sv.id, true])));
      }
      // Contact varsayılanları — sadece storage'da hiç değer yoksa lab'dan doldur
      if (!stored?.contactAddress && l.address)   setContactAddress(l.address);
      if (!stored?.contactPhone   && l.phone)     setContactPhone(l.phone);
      if (!stored?.contactEmail   && l.email)     setContactEmail(l.email);
      if (!stored?.contactWebsite && l.website)   setContactWebsite(l.website);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // services kasıtlı olarak deps'te yok — array ref her render değişiyor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, labId]);

  // Modal kapanınca session reset
  useEffect(() => {
    if (!visible) loadedFor.current = null;
  }, [visible]);

  const [generating, setGenerating] = useState(false);

  if (!visible) return null;

  const palette = CATALOG_PALETTES.find(p => p.id === paletteId) ?? CATALOG_PALETTES[0];

  const buildHtml = () => {
    const selectedTechs: CatalogTech[] = [
      ...equipment.filter(e => techSelected[e.id]).map(e => ({
        id: e.id, name: e.name, brand: e.brand ?? undefined, category: e.category ?? undefined,
      })),
      ...techCustom,
    ];
    const selectedServices = services
      .filter(sv => serviceSelected[sv.id])
      .map(sv => ({
        id: sv.id, name: sv.name, category: sv.category ?? null,
        price: sv.price, currency: sv.currency, sort_order: sv.sort_order,
        production_days: sv.production_days, unit: sv.unit ?? null,
      }));
    return buildCatalogPdfHtml({
      labName: lab.name || 'Lab',
      labLogoUrl: lab.logo_url || null,
      coverTitle, coverSubtitle, coverTagline,
      aboutTitle, aboutText,
      whyUs: whyUs.filter(w => w.trim()),
      techIntro, technologies: selectedTechs,
      services: selectedServices,
      categoryOrder: dynamicCategories,
      showPrices, currency: pdfCurrency,
      contact: {
        address: contactAddress || undefined,
        phone: contactPhone || undefined,
        email: contactEmail || undefined,
        website: contactWebsite || undefined,
        instagram: contactInstagram || undefined,
      },
      accent: palette.accent,
      accentSoft: palette.accentSoft,
      footerNote: footerNote || undefined,
    });
  };

  // PDF dosyası indir — html2pdf.js ile client-side
  const handleDownloadPdf = async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    setGenerating(true);
    try {
      const html = buildHtml();
      // Geçici iframe oluştur → HTML yükle → html2pdf ile yakala
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:auto;border:none;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open(); doc.write(html); doc.close();

      // Görseller + fontlar yüklensin
      await new Promise<void>((resolve) => {
        const imgs = Array.from(doc.images);
        if (imgs.length === 0) return resolve();
        let loaded = 0;
        const tick = () => { if (++loaded >= imgs.length) resolve(); };
        imgs.forEach(img => {
          if (img.complete) tick();
          else { img.onload = tick; img.onerror = tick; }
        });
        // Güvenlik için 5sn timeout
        setTimeout(resolve, 5000);
      });
      await new Promise(r => setTimeout(r, 400));

      const target = doc.querySelector('.catalog') as HTMLElement | null;
      if (!target) throw new Error('Katalog elementi bulunamadı');

      const html2pdfMod: any = await import('html2pdf.js');
      const html2pdf = html2pdfMod.default ?? html2pdfMod;

      const fileName = `${(lab.name || 'Lab').replace(/[^\wÀ-ſĞğŞşİıÇçÜüÖö -]/g, '').trim() || 'Katalog'}_Katalog_${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}.pdf`;

      await html2pdf()
        .from(target)
        .set({
          margin: [10, 8, 10, 8],
          filename: fileName,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#FFFFFF',
            logging: false,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'avoid-all'] },
        })
        .save();

      document.body.removeChild(iframe);
    } catch (e: any) {
      console.error('PDF üretim hatası', e);
      const msg = `PDF oluşturulamadı: ${e?.message ?? 'bilinmeyen hata'}`;
      if (Platform.OS === 'web') window.alert(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Yeni sekmede önizleme (eski davranış — opsiyonel)
  const handlePreview = () => {
    const html = buildHtml();
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ─── Renderers ───
  const sectionBox: any = {
    padding: 16, borderRadius: 12, borderWidth: 1, borderColor: DS.ink[200],
    backgroundColor: '#FFFFFF', marginBottom: 12,
  };
  const sectionTitle: any = {
    fontSize: 11, fontWeight: '700', color: DS.ink[500],
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10,
  };
  const fieldLabel: any = { fontSize: 11, fontWeight: '600', color: DS.ink[500], marginBottom: 6 };
  const fieldInput: any = {
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1, borderColor: DS.ink[200], backgroundColor: '#FFFFFF',
    fontSize: 13, color: DS.ink[900],
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: 720, maxWidth: '100%', maxHeight: '92%', backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ paddingHorizontal: 22, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: DS.ink[900] }}>Katalog Oluşturucu</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: 'rgba(16,185,129,0.10)' }}>
                  <Check size={9} color="#059669" strokeWidth={3} />
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#059669', letterSpacing: 0.4 }}>OTOMATİK KAYIT</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>
                Değişiklikler otomatik kaydedilir — sonraki açışta hazır olur
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pressable
                onPress={runAiFill}
                disabled={aiBusy}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, marginEnd: 4,
                  backgroundColor: hovered ? tint(PRIMARY, 0.18) : tint(PRIMARY, 0.12),
                  opacity: aiBusy ? 0.6 : 1,
                  ...(Platform.OS === 'web' ? { cursor: aiBusy ? 'default' : 'pointer' } as any : {}),
                })}
              >
                {aiBusy ? <ActivityIndicator size="small" color={PRIMARY} /> : <Sparkles size={13} color={PRIMARY} strokeWidth={2} />}
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: PRIMARY }}>{aiBusy ? 'Üretiliyor…' : 'AI ile Doldur'}</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const ok = await confirmAsync('Katalog Ayarları', 'Katalog ayarlarını sıfırla?', { confirmText: 'Sıfırla', destructive: true });
                  if (!ok) return;
                  if (typeof window !== 'undefined') {
                    try { window.localStorage.removeItem(storageKey); } catch {}
                  }
                  onClose();
                }}
                hitSlop={6}
                style={({ hovered }: any) => ({
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                  backgroundColor: hovered ? DS.ink[100] : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[500] }}>Sıfırla</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
                <X size={18} color={DS.ink[500]} strokeWidth={1.6} />
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <CenteredLoader color={DS.ink[400]} inline />
            </View>
          ) : (
            <ScrollView style={{ padding: 18 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
              {/* KAPAK */}
              <View style={sectionBox}>
                <Text style={sectionTitle}>Kapak</Text>
                <Text style={fieldLabel}>Başlık</Text>
                <TextInput value={coverTitle} onChangeText={setCoverTitle} style={fieldInput} placeholder="Hizmet Kataloğu" />
                <View style={{ height: 10 }} />
                <Text style={fieldLabel}>Alt başlık (eyebrow)</Text>
                <TextInput value={coverSubtitle} onChangeText={setCoverSubtitle} style={fieldInput} placeholder="Dijital Diş Laboratuvarı" />
                <View style={{ height: 10 }} />
                <Text style={fieldLabel}>Slogan</Text>
                <TextInput value={coverTagline} onChangeText={setCoverTagline} style={fieldInput} multiline />
              </View>

              {/* HAKKIMIZDA */}
              <View style={sectionBox}>
                <Text style={sectionTitle}>Hakkımızda</Text>
                <Text style={fieldLabel}>Bölüm başlığı</Text>
                <TextInput value={aboutTitle} onChangeText={setAboutTitle} style={fieldInput} placeholder="Tanışalım" />
                <View style={{ height: 10 }} />
                <Text style={fieldLabel}>Hakkımızda metni</Text>
                <TextInput
                  value={aboutText} onChangeText={setAboutText}
                  style={[fieldInput, { minHeight: 80, textAlignVertical: 'top' }]}
                  placeholder="Laboratuvarınızı kısaca tanıtın — kuruluş yılı, uzmanlık, vizyon..."
                  multiline
                />
                <View style={{ height: 14 }} />
                <Text style={fieldLabel}>Neden biz? (her satır bir madde)</Text>
                {whyUs.map((w, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <TextInput
                      value={w} onChangeText={(t) => setWhyUs(prev => prev.map((x, idx) => idx === i ? t : x))}
                      style={[fieldInput, { flex: 1 }]}
                      placeholder="Örn: 5 günlük hızlı teslimat"
                    />
                    <Pressable onPress={() => setWhyUs(prev => prev.filter((_, idx) => idx !== i))} hitSlop={6} style={{ padding: 6 }}>
                      <X size={14} color={DS.ink[500]} strokeWidth={1.8} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={() => setWhyUs(prev => [...prev, ''])}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
                    backgroundColor: hovered ? DS.ink[50] : 'transparent',
                    alignSelf: 'flex-start',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Plus size={13} color={DS.ink[700]} strokeWidth={1.8} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[700] }}>Madde ekle</Text>
                </Pressable>
              </View>

              {/* TEKNOLOJİLER */}
              <View style={sectionBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={sectionTitle}>Teknolojiler / Demirbaşlar ({equipment.filter(eq => techSelected[eq.id]).length}/{equipment.length})</Text>
                  {equipment.length > 0 && (
                    <Pressable onPress={() => {
                      const allChecked = equipment.every(eq => techSelected[eq.id]);
                      setTechSelected(allChecked ? {} : Object.fromEntries(equipment.map(eq => [eq.id, true])));
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700] }}>
                        {equipment.every(eq => techSelected[eq.id]) ? 'Tümünü Bırak' : 'Tümünü Seç'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Text style={fieldLabel}>Açıklama metni</Text>
                <TextInput value={techIntro} onChangeText={setTechIntro} style={fieldInput} placeholder="Yatırım yaptığımız donanımlar:" />
                <View style={{ height: 14 }} />
                {equipment.length === 0 ? (
                  <Text style={{ fontSize: 12, color: DS.ink[500], paddingVertical: 8 }}>
                    Lab demirbaş listesi boş. Ayarlar → Demirbaşlar bölümünden ekleyebilirsin. Aşağıdan manuel teknoloji de ekleyebilirsin.
                  </Text>
                ) : (
                  <View style={{ gap: 6 }}>
                    {equipment.map(eq => {
                      const checked = !!techSelected[eq.id];
                      return (
                        <Pressable
                          key={eq.id}
                          onPress={() => setTechSelected(prev => ({ ...prev, [eq.id]: !prev[eq.id] }))}
                          style={({ hovered }: any) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            padding: 9, borderRadius: 8,
                            borderWidth: 1, borderColor: checked ? DS.ink[700] : DS.ink[200],
                            backgroundColor: checked ? DS.ink[50] : (hovered ? DS.ink[50] : '#FFFFFF'),
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          })}
                        >
                          <View style={{
                            width: 16, height: 16, borderRadius: 4,
                            borderWidth: 1.5, borderColor: checked ? DS.ink[900] : DS.ink[300],
                            backgroundColor: checked ? DS.ink[900] : '#FFFFFF',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {checked && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12.5, fontWeight: '600', color: DS.ink[900] }}>{eq.name}</Text>
                            <Text style={{ fontSize: 10.5, color: DS.ink[500], marginTop: 1 }}>
                              {eq.brand ?? '—'} {eq.category ? `· ${eq.category}` : ''}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Manuel teknoloji eklemek için inline form */}
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: DS.ink[100] }}>
                  <Text style={fieldLabel}>Manuel teknoloji ekle</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput value={techDraftName} onChangeText={setTechDraftName} style={[fieldInput, { flex: 1 }]} placeholder="Cihaz adı" />
                    <TextInput value={techDraftBrand} onChangeText={setTechDraftBrand} style={[fieldInput, { flex: 1 }]} placeholder="Marka" />
                    <Pressable
                      onPress={() => {
                        if (!techDraftName.trim()) return;
                        setTechCustom(prev => [...prev, { id: `c-${Date.now()}`, name: techDraftName.trim(), brand: techDraftBrand.trim() || undefined }]);
                        setTechDraftName(''); setTechDraftBrand('');
                      }}
                      style={({ hovered }: any) => ({
                        paddingHorizontal: 14, justifyContent: 'center',
                        borderRadius: 8, backgroundColor: hovered ? DS.ink[800] : DS.ink[900],
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      <Plus size={14} color="#FFFFFF" strokeWidth={2} />
                    </Pressable>
                  </View>
                  {techCustom.length > 0 && (
                    <View style={{ gap: 4, marginTop: 8 }}>
                      {techCustom.map(t => (
                        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 6, backgroundColor: DS.ink[50] }}>
                          <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>{t.name}</Text>
                          {t.brand && <Text style={{ fontSize: 10.5, color: DS.ink[500] }}>{t.brand}</Text>}
                          <Pressable onPress={() => setTechCustom(prev => prev.filter(x => x.id !== t.id))} hitSlop={6}>
                            <X size={12} color={DS.ink[500]} strokeWidth={1.8} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* HİZMETLER */}
              <View style={sectionBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={sectionTitle}>Hizmetler ({services.filter(sv => serviceSelected[sv.id]).length}/{services.length})</Text>
                  <Pressable onPress={() => {
                    const allSelected = services.every(sv => serviceSelected[sv.id]);
                    setServiceSelected(allSelected ? {} : Object.fromEntries(services.map(sv => [sv.id, true])));
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700] }}>
                      {services.every(sv => serviceSelected[sv.id]) ? 'Tümünü Bırak' : 'Tümünü Seç'}
                    </Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Pressable
                    onPress={() => setShowPrices(p => !p)}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                      borderWidth: 1, borderColor: showPrices ? DS.ink[900] : DS.ink[200],
                      backgroundColor: showPrices ? DS.ink[900] : (hovered ? DS.ink[50] : '#FFFFFF'),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    <View style={{
                      width: 14, height: 14, borderRadius: 4,
                      borderWidth: 1.5, borderColor: showPrices ? '#FFFFFF' : DS.ink[400],
                      backgroundColor: showPrices ? '#FFFFFF' : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {showPrices && <Check size={9} color={DS.ink[900]} strokeWidth={3} />}
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: showPrices ? '#FFFFFF' : DS.ink[900] }}>
                      Fiyatları göster
                    </Text>
                  </Pressable>
                  <View style={{ width: 110 }}>
                    <CurrencyDropdown value={pdfCurrency} onChange={setPdfCurrency} />
                  </View>
                </View>

                <View style={{ maxHeight: 220, borderRadius: 10, borderWidth: 1, borderColor: DS.ink[200], overflow: 'hidden' }}>
                  <ScrollView nestedScrollEnabled>
                    {services.map((sv, i) => {
                      const checked = !!serviceSelected[sv.id];
                      return (
                        <Pressable
                          key={sv.id}
                          onPress={() => setServiceSelected(prev => ({ ...prev, [sv.id]: !prev[sv.id] }))}
                          style={({ hovered }: any) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            paddingHorizontal: 12, paddingVertical: 8,
                            borderTopWidth: i === 0 ? 0 : 1, borderTopColor: DS.ink[100],
                            backgroundColor: checked ? '#FFFFFF' : (hovered ? DS.ink[50] : '#FAFAFA'),
                            opacity: checked ? 1 : 0.55,
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          })}
                        >
                          <View style={{
                            width: 14, height: 14, borderRadius: 4,
                            borderWidth: 1.5, borderColor: checked ? DS.ink[900] : DS.ink[300],
                            backgroundColor: checked ? DS.ink[900] : '#FFFFFF',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {checked && <Check size={9} color="#FFFFFF" strokeWidth={3} />}
                          </View>
                          <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: DS.ink[900] }}>{sv.name}</Text>
                          <Text style={{ fontSize: 10.5, color: DS.ink[500] }}>{sv.category ?? '—'}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* TEMA */}
              <View style={sectionBox}>
                <Text style={sectionTitle}>Renk Teması</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {CATALOG_PALETTES.map(p => {
                    const active = p.id === paletteId;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setPaletteId(p.id)}
                        style={({ hovered }: any) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                          paddingHorizontal: 10, paddingVertical: 7,
                          borderRadius: 9999, borderWidth: 1,
                          borderColor: active ? DS.ink[900] : DS.ink[200],
                          backgroundColor: active ? DS.ink[50] : (hovered ? DS.ink[50] : '#FFFFFF'),
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        <View style={{ width: 14, height: 14, borderRadius: 9999, backgroundColor: p.accent }} />
                        <Text style={{ fontSize: 11.5, fontWeight: '600', color: DS.ink[900] }}>{p.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* İLETİŞİM */}
              <View style={sectionBox}>
                <Text style={sectionTitle}>İletişim</Text>
                <Text style={fieldLabel}>Adres</Text>
                <TextInput value={contactAddress} onChangeText={setContactAddress} style={fieldInput} placeholder="Lab adresi" multiline />
                <View style={{ height: 10 }} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Telefon</Text>
                    <TextInput value={contactPhone} onChangeText={setContactPhone} style={fieldInput} placeholder="+90 ..." />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>E-posta</Text>
                    <TextInput value={contactEmail} onChangeText={setContactEmail} style={fieldInput} placeholder="info@..." autoCapitalize="none" />
                  </View>
                </View>
                <View style={{ height: 10 }} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Web</Text>
                    <TextInput value={contactWebsite} onChangeText={setContactWebsite} style={fieldInput} placeholder="www..." autoCapitalize="none" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Instagram</Text>
                    <TextInput value={contactInstagram} onChangeText={setContactInstagram} style={fieldInput} placeholder="@..." autoCapitalize="none" />
                  </View>
                </View>
                <View style={{ height: 10 }} />
                <Text style={fieldLabel}>Alt not (footer)</Text>
                <TextInput value={footerNote} onChangeText={setFooterNote} style={fieldInput} placeholder="Fiyatlar KDV hariçtir." />
              </View>
              <View style={{ height: 8 }} />
            </ScrollView>
          )}

          {/* Footer */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable
              onPress={onClose}
              style={({ hovered }: any) => ({
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: hovered ? DS.ink[100] : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handlePreview}
              disabled={loading || generating}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999,
                borderWidth: 1, borderColor: DS.ink[300],
                backgroundColor: hovered ? DS.ink[50] : '#FFFFFF',
                opacity: (loading || generating) ? 0.5 : 1,
                ...(Platform.OS === 'web' && !loading && !generating ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>Önizle</Text>
            </Pressable>
            <Pressable
              onPress={handleDownloadPdf}
              disabled={loading || generating}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: (loading || generating) ? DS.ink[300] : (hovered ? DS.ink[800] : DS.ink[900]),
                ...(Platform.OS === 'web' && !loading && !generating ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <FileDown size={14} color="#FFFFFF" strokeWidth={1.8} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                {generating ? 'PDF Oluşturuluyor…' : 'PDF İndir'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Currency dropdown
// ────────────────────────────────────────────────────────────────────────────
const CURRENCY_OPTIONS: { code: string; label: string; symbol: string }[] = [
  { code: 'TRY', label: 'Türk Lirası',   symbol: '₺' },
  { code: 'EUR', label: 'Euro',          symbol: '€' },
  { code: 'USD', label: 'ABD Doları',    symbol: '$' },
  { code: 'GBP', label: 'İngiliz Sterlini', symbol: '£' },
];

function CurrencyDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const anchorRef = useRef<View>(null);
  const current = CURRENCY_OPTIONS.find(o => o.code === value) ?? CURRENCY_OPTIONS[0];

  const openDropdown = () => {
    anchorRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  return (
    <>
      <Pressable
        ref={anchorRef as any}
        onPress={openDropdown}
        style={({ hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 12, paddingVertical: 10,
          borderRadius: 10, borderWidth: 1,
          borderColor: open ? DS.ink[400] : DS.ink[200],
          backgroundColor: hovered ? DS.ink[50] : '#FFFFFF',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        })}
        accessibilityRole="button"
        accessibilityLabel={`Para birimi: ${current.code}`}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
          {current.symbol} {current.code}
        </Text>
        <ChevronDown size={14} color={DS.ink[500]} strokeWidth={1.8} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.001)' }}
        >
          {anchor && (
            <View
              style={{
                position: 'absolute',
                top: anchor.y + anchor.h + 4,
                left: anchor.x,
                width: Math.max(anchor.w, 180),
                backgroundColor: '#FFFFFF',
                borderRadius: 10, borderWidth: 1, borderColor: DS.ink[200],
                overflow: 'hidden',
                ...(Platform.OS === 'web'
                  ? { boxShadow: '0 8px 24px rgba(0,0,0,0.18)' } as any
                  : { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }),
              }}
            >
              {CURRENCY_OPTIONS.map(opt => {
                const active = opt.code === value;
                return (
                  <Pressable
                    key={opt.code}
                    onPress={() => { onChange(opt.code); setOpen(false); }}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 12, paddingVertical: 10,
                      backgroundColor: active ? DS.ink[50] : (hovered ? DS.ink[50] : 'transparent'),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    <Text style={{ width: 18, fontSize: 14, fontWeight: '700', color: DS.ink[700] }}>
                      {opt.symbol}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: active ? '700' : '500', color: DS.ink[900] }}>
                      {opt.code}
                    </Text>
                    <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared: Service add/edit modal
// ────────────────────────────────────────────────────────────────────────────
function ServiceModal({
  visible, edit, form, setForm, error, setError, saving, onClose, onSave, categories,
}: {
  visible: boolean;
  edit: LabService | null;
  form: ServiceForm;
  setForm: React.Dispatch<React.SetStateAction<ServiceForm>>;
  error: string;
  setError: (e: string) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  categories: string[];
}) {
  const theme = usePanelTheme();
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [extraCats, setExtraCats] = useState<string[]>([]);
  const allCats = Array.from(new Set([...categories, ...extraCats]));

  const handleAddCategory = () => {
    const trimmed = newCat.trim();
    if (!trimmed) { setAddingCat(false); setNewCat(''); return; }
    if (!allCats.includes(trimmed)) setExtraCats(prev => [...prev, trimmed]);
    setForm(f => ({ ...f, category: trimmed }));
    setNewCat('');
    setAddingCat(false);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>{edit ? 'Hizmeti Düzenle' : 'Hizmet Ekle'}</Text>
            <Pressable style={[m.closeBtn, Platform.OS === 'web' ? { outlineStyle: 'none' } as any : null]} onPress={onClose}>
              <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
            </Pressable>
          </View>

          <ScrollView style={m.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Hizmet Bilgileri</Text>
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>Hizmet Adı <Text style={{ color: '#D94B4B' }}>*</Text></Text>
                <TextInput
                  style={m.fieldInput as any}
                  value={form.name}
                  onChangeText={(v) => { setForm((f) => ({ ...f, name: v })); setError(''); }}
                  placeholder="Orn: Zirkonyum Kron"
                  placeholderTextColor={DS.ink[300]}
                />
              </View>
            </View>

            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Kategori</Text>
              <View style={s.toggleRow}>
                {allCats.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setForm((f) => ({ ...f, category: c }))}
                    style={[s.toggleChip, form.category === c && { borderColor: theme.primary, backgroundColor: tint(theme.primary, 0.12) }] as any}
                  >
                    <Text style={[s.toggleChipText, form.category === c && { color: theme.primary, fontWeight: '700' }]}>{c}</Text>
                  </Pressable>
                ))}
                {addingCat ? (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 10, paddingVertical: 4,
                    borderRadius: 9999, borderWidth: 1, borderColor: DS.ink[400],
                    backgroundColor: '#FFFFFF',
                  }}>
                    <TextInput
                      value={newCat}
                      onChangeText={setNewCat}
                      placeholder="Yeni kategori"
                      placeholderTextColor={DS.ink[300]}
                      autoFocus
                      onSubmitEditing={handleAddCategory}
                      onBlur={handleAddCategory}
                      style={{
                        minWidth: 120, fontSize: 12.5,
                        color: DS.ink[900], paddingVertical: 4,
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                      } as any}
                    />
                    <Pressable onPress={() => { setAddingCat(false); setNewCat(''); }} hitSlop={6}>
                      <X size={12} color={DS.ink[500]} strokeWidth={1.6} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setAddingCat(true)}
                    style={({ hovered }: any) => ([
                      s.toggleChip,
                      {
                        borderStyle: 'dashed', borderColor: DS.ink[400],
                        backgroundColor: hovered ? DS.ink[50] : '#FFFFFF',
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      },
                    ])}
                  >
                    <Plus size={12} color={DS.ink[500]} strokeWidth={1.8} />
                    <Text style={[s.toggleChipText, { color: DS.ink[500] }]}>Yeni</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Fiyatlandırma</Text>

              {/* Fiyat tipi — Tutar / Yüzde / Ücretsiz */}
              <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 10, backgroundColor: '#F5F1EB', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginBottom: 12 }}>
                {([['fixed', `Tutar (${baseSymbol()})`], ['percent', 'Yüzde (%)'], ['free', 'Ücretsiz']] as const).map(([k, label]) => {
                  const active = form.priceType === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setForm((f) => ({ ...f, priceType: k }))}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: active ? theme.primary : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: active ? '#FFFFFF' : DS.ink[500] }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {form.priceType === 'free' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 10, backgroundColor: tint('#2D9A6B', 0.08), borderWidth: 1, borderColor: tint('#2D9A6B', 0.2) }}>
                  <Check size={14} color="#1F6B47" strokeWidth={2.2} />
                  <Text style={{ fontSize: 12.5, color: '#1F6B47', fontWeight: '600' }}>Bu hizmet ücretsiz — listede "Ücretsiz" yazar.</Text>
                </View>
              ) : (
                <>
                <View style={m.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={m.fieldLabel}>{form.priceType === 'percent' ? 'Yüzde (%)' : 'Fiyat'}</Text>
                    <TextInput
                      style={m.fieldInput as any}
                      value={form.price}
                      onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
                      placeholder={form.priceType === 'percent' ? 'Örn: 50' : '0.00'}
                      placeholderTextColor={DS.ink[300]}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  {form.priceType !== 'percent' && (
                    <View style={{ width: 120 }}>
                      <Text style={m.fieldLabel}>Para Birimi</Text>
                      <CurrencyDropdown
                        value={form.currency}
                        onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                      />
                    </View>
                  )}
                </View>
                {/* Birim — bu fiyat neyin başına? */}
                <View style={{ marginTop: 10 }}>
                  <Text style={m.fieldLabel}>Birim (fiyat neyin başına?)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    {UNIT_OPTIONS.map((u) => {
                      const active = form.unit === u;
                      return (
                        <Pressable key={u} onPress={() => setForm((f) => ({ ...f, unit: active ? '' : u }))}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? tint(theme.primary, 0.14) : '#FFFFFF', borderWidth: 1, borderColor: active ? theme.primary : 'rgba(0,0,0,0.12)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          {active && <Check size={12} color={theme.primaryDeep} strokeWidth={3} />}
                          <Text style={{ fontSize: 12.5, fontWeight: '600', color: active ? theme.primaryDeep : DS.ink[500] }}>{u}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={{ fontSize: 10.5, color: DS.ink[400], marginTop: 4 }}>
                    Listede fiyatın yanında görünür (ör. "120 ₺ / Üye"). Boş bırakılırsa gösterilmez.
                  </Text>
                </View>
                </>
              )}
              <View style={{ height: 10 }} />
              <Text style={m.fieldLabel}>Üretim Süresi (gün)</Text>
              <TextInput
                style={m.fieldInput as any}
                value={form.production_days}
                onChangeText={(v) => setForm((f) => ({ ...f, production_days: v.replace(/[^0-9]/g, '') }))}
                placeholder="Örn: 5"
                placeholderTextColor={DS.ink[300]}
                keyboardType="number-pad"
              />
              <Text style={{ fontSize: 10.5, color: DS.ink[400], marginTop: 4 }}>
                Tahmini üretim süresi — boş bırakırsan belirsiz gösterilir.
              </Text>
            </View>

            {error ? (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 4 }}>
                <Text style={{ color: '#D94B4B', fontWeight: '600', fontSize: 13 }}>{error}</Text>
              </View>
            ) : null}

            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={m.footer}>
            <Pressable style={m.cancelBtn as any} onPress={onClose}>
              <Text style={m.cancelText}>İptal</Text>
            </Pressable>
            <Pressable
              style={[m.saveBtn, saving && { opacity: 0.6 }] as any}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : edit ? 'Güncelle' : 'Ekle'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
