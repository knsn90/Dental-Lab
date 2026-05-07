/**
 * PriceListScreen — Mali İşlemler > Fiyat Listesi
 *
 * 3 sekme:
 *   Standart     → Genel hizmet kataloğu ve fiyatları
 *   Özel Listeler → Klinik / hekim bazlı fiyat istisnası
 *   Promosyonlar  → Kampanya, iskonto ve promosyon yönetimi
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  TextInput, Modal, ActivityIndicator, Alert,
  Platform, useWindowDimensions,
} from 'react-native';
import {
  Search, X, Plus, Tag, Pencil, Info, Building2,
  ChevronRight, ArrowLeft, PlusCircle, Trash2, Calendar,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';
import { DatePicker } from '../../../core/ui/DatePicker';
import { AppSwitch } from '../../../core/ui/AppSwitch';

import { fetchAllLabServices, createLabService, updateLabService } from '../../services/api';
import { fetchClinics } from '../../clinics/api';
import type { LabService } from '../../services/types';
import type { Clinic } from '../../clinics/types';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
const PRIMARY = '#0891B2';

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
    backgroundColor: '#FFF',
    // @ts-ignore web
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  catPillText: {
    fontWeight: '500' as const,
    color: DS.ink[500],
    fontSize: 13,
  },
  catPillTextActive: {
    fontWeight: '600' as const,
    color: DS.ink[900],
  },

  list: { padding: 22, paddingBottom: 48 } as const,

  groupHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 2,
    marginTop: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  groupTitle: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: DS.ink[500],
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  groupCount: { fontSize: 11, color: DS.ink[400] },

  serviceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    gap: 12,
  },
  serviceName: { fontSize: 14, fontWeight: '600' as const, color: DS.ink[900] },
  servicePrice: { ...DISPLAY, fontSize: 14, color: PRIMARY, marginTop: 2 },
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
  const [tab, setTab] = useState('standard');

  return (
    <View style={s.root}>
      {/* ── Tab pills ── */}
      <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 10 }}>
        <View style={{
          flexDirection: 'row', gap: 2, padding: 3,
          borderRadius: 9999, backgroundColor: DS.ink[100],
          alignSelf: 'flex-start',
        }}>
          {([
            { key: 'standard',   label: 'Standart' },
            { key: 'custom',     label: 'Özel Listeler' },
            { key: 'promotions', label: 'Promosyonlar' },
          ] as const).map(t => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7,
                  borderRadius: 9999,
                  backgroundColor: active ? '#FFF' : 'transparent',
                  // @ts-ignore web
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
                  cursor: 'pointer',
                }}
              >
                <Text style={{
                  fontSize: 13,
                  fontWeight: active ? '600' : '500',
                  color: active ? DS.ink[900] : DS.ink[500],
                }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

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
  name: string; category: string; price: string; currency: string;
}
const EMPTY_SVC: ServiceForm = { name: '', category: '', price: '0', currency: 'TRY' };

function StandardTab() {
  const [services, setServices]       = useState<LabService[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState('Tümü');
  const [modal, setModal]             = useState(false);
  const [edit, setEdit]               = useState<LabService | null>(null);
  const [form, setForm]               = useState<ServiceForm>(EMPTY_SVC);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchAllLabServices();
    setServices((data as LabService[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEdit(null); setForm(EMPTY_SVC); setError(''); setModal(true); };
  const openEdit = (sv: LabService) => {
    setEdit(sv);
    setForm({ name: sv.name, category: sv.category ?? '', price: String(sv.price), currency: sv.currency });
    setError(''); setModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Hizmet adı zorunludur.'); return; }
    const price = parseFloat(form.price) || 0;
    setSaving(true);
    const payload = { name: form.name.trim(), category: form.category || undefined, price, currency: form.currency };
    if (edit) await updateLabService(edit.id, payload);
    else await createLabService(payload);
    setSaving(false); setModal(false); load();
  };

  const handleToggle = async (sv: LabService) => {
    await updateLabService(sv.id, { is_active: !sv.is_active }); load();
  };

  const allCats   = ['Tümü', ...SERVICE_CATEGORIES];
  const filtered  = services.filter((sv) => {
    const matchCat    = catFilter === 'Tümü' || sv.category === catFilter;
    const matchSearch = !search || sv.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });
  const grouped = SERVICE_CATEGORIES.reduce<Record<string, LabService[]>>((acc, cat) => {
    const items = filtered.filter((sv) => sv.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});
  const ungrouped = filtered.filter((sv) => !sv.category || !SERVICE_CATEGORIES.includes(sv.category));

  return (
    <View style={s.tabContent}>
      {/* Toolbar */}
      <View style={s.toolbar}>
        <View style={s.searchWrap}>
          <Search size={15} color={DS.ink[400]} strokeWidth={1.6} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Hizmet ara..."
            placeholderTextColor={DS.ink[300]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <X size={14} color={DS.ink[400]} strokeWidth={1.6} />
            </Pressable>
          )}
        </View>
        <Pressable style={s.addBtn} onPress={openAdd}>
          <Plus size={15} color="#FFFFFF" strokeWidth={2} />
          <Text style={s.addBtnText}>Ekle</Text>
        </Pressable>
      </View>

      {/* Category filter pills */}
      <View style={{ paddingHorizontal: 22, paddingVertical: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            flexDirection: 'row', gap: 2, padding: 3,
            borderRadius: 9999, backgroundColor: DS.ink[100],
          }}
        >
          {allCats.map((c) => {
            const active = catFilter === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCatFilter(c)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 9999,
                  backgroundColor: active ? '#FFF' : 'transparent',
                  // @ts-ignore web
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
                  cursor: 'pointer',
                }}
              >
                <Text style={{
                  fontSize: 12,
                  fontWeight: active ? '600' : '500',
                  color: active ? DS.ink[900] : DS.ink[500],
                }}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {Object.entries(grouped).map(([cat, items]) => (
            <View key={cat}>
              <View style={s.groupHeader}>
                <Text style={s.groupTitle}>{cat}</Text>
                <Text style={s.groupCount}>{items.length} hizmet</Text>
              </View>
              {items.map((sv) => (
                <ServiceRow key={sv.id} service={sv} onEdit={openEdit} onToggle={handleToggle} />
              ))}
            </View>
          ))}
          {ungrouped.length > 0 && (
            <View>
              <View style={s.groupHeader}>
                <Text style={s.groupTitle}>Diger</Text>
                <Text style={s.groupCount}>{ungrouped.length} hizmet</Text>
              </View>
              {ungrouped.map((sv) => (
                <ServiceRow key={sv.id} service={sv} onEdit={openEdit} onToggle={handleToggle} />
              ))}
            </View>
          )}
          {filtered.length === 0 && (
            <View style={s.empty}>
              <Tag size={36} color={DS.ink[300]} strokeWidth={1.4} />
              <Text style={s.emptyTitle}>{search ? 'Sonuc bulunamadi' : 'Henuz hizmet eklenmemis'}</Text>
              {!search && (
                <Pressable style={s.emptyBtn} onPress={openAdd}>
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
      />
    </View>
  );
}

function ServiceRow({
  service: sv, onEdit, onToggle,
}: { service: LabService; onEdit: (s: LabService) => void; onToggle: (s: LabService) => void }) {
  return (
    <View style={[s.serviceRow, !sv.is_active && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.serviceName}>{sv.name}</Text>
        <Text style={s.servicePrice}>
          {sv.price > 0 ? `${sv.price.toLocaleString('tr-TR')} ${sv.currency}` : '—'}
        </Text>
      </View>
      <Pressable style={s.editBtn} onPress={() => onEdit(sv)}>
        <Pencil size={14} color={DS.ink[500]} strokeWidth={1.6} />
      </Pressable>
      <AppSwitch value={sv.is_active} onValueChange={() => onToggle(sv)} accentColor={PRIMARY} />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 2 — Ozel Listeler (clinic / doctor-specific prices)
// ────────────────────────────────────────────────────────────────────────────
function CustomTab() {
  const [clinics, setClinics]         = useState<Clinic[]>([]);
  const [services, setServices]       = useState<LabService[]>([]);
  const [overrides, setOverrides]     = useState<PriceOverride[]>([]);
  const [overrideCounts, setOverrideCounts] = useState<Record<string, number>>({});
  const [selectedClinic, setSelected] = useState<Clinic | null>(null);
  const [loading, setLoading]         = useState(true);
  const [editModal, setEditModal]     = useState(false);
  const [editSvc, setEditSvc]         = useState<LabService | null>(null);
  const [oForm, setOForm]             = useState({ custom_price: '', discount_percent: '', notes: '' });
  const [saving, setSaving]           = useState(false);

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
    setEditSvc(sv);
    setOForm({
      custom_price:     existing?.custom_price != null ? String(existing.custom_price) : '',
      discount_percent: existing?.discount_percent != null ? String(existing.discount_percent) : '',
      notes:            existing?.notes ?? '',
    });
    setEditModal(true);
  };

  const handleSaveOverride = async () => {
    if (!selectedClinic || !editSvc) return;
    setSaving(true);
    const existing = overrides.find((o) => o.service_id === editSvc.id);
    const payload = {
      clinic_id:        selectedClinic.id,
      service_id:       editSvc.id,
      custom_price:     oForm.custom_price ? parseFloat(oForm.custom_price) : null,
      discount_percent: oForm.discount_percent ? parseFloat(oForm.discount_percent) : null,
      currency:         'TRY',
      notes:            oForm.notes || null,
    };
    let isNew = false;
    if (existing) {
      await supabase.from('clinic_price_overrides').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('clinic_price_overrides').insert(payload);
      isNew = true;
    }
    setSaving(false);
    setEditModal(false);
    loadOverrides(selectedClinic.id);
    if (isNew) {
      setOverrideCounts(prev => ({ ...prev, [selectedClinic.id]: (prev[selectedClinic.id] ?? 0) + 1 }));
    }
  };

  const handleDeleteOverride = async () => {
    if (!selectedClinic || !editSvc) return;
    const existing = overrides.find((o) => o.service_id === editSvc.id);
    if (!existing) { setEditModal(false); return; }
    await supabase.from('clinic_price_overrides').delete().eq('id', existing.id);
    setEditModal(false);
    loadOverrides(selectedClinic.id);
    setOverrideCounts(prev => ({ ...prev, [selectedClinic.id]: Math.max(0, (prev[selectedClinic.id] ?? 1) - 1) }));
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

  if (loading) return <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} />;

  return (
    <View style={s.tabContent}>
      {!selectedClinic ? (
        /* -- Clinic picker -- */
        <ScrollView contentContainerStyle={s.list}>
          <View style={s.infoCard}>
            <Info size={15} color="#2563EB" strokeWidth={1.6} />
            <Text style={s.infoText}>
              Klinik secin ve o klinige ozel fiyatlari duzenleyin. Belirlenmemis hizmetler standart fiyatla uygulanir.
            </Text>
          </View>

          {clinics.length === 0 ? (
            <View style={s.empty}>
              <Building2 size={36} color={DS.ink[300]} strokeWidth={1.4} />
              <Text style={s.emptyTitle}>Henuz klinik eklenmemis</Text>
            </View>
          ) : (
            clinics.map((c) => {
              const overrideCount = overrideCounts[c.id] ?? 0;
              return (
                <Pressable key={c.id} style={s.clinicCard} onPress={() => selectClinic(c)}>
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
                  <ChevronRight size={16} color={DS.ink[400]} strokeWidth={1.6} />
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
            <Pressable style={s.backBtn} onPress={() => setSelected(null)}>
              <ArrowLeft size={16} color="#2563EB" strokeWidth={1.6} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={s.clinicHeaderTitle}>{selectedClinic.name}</Text>
              <Text style={s.clinicHeaderSub}>Ozel fiyat listesi</Text>
            </View>
            <View style={s.overrideBadge}>
              <Text style={s.overrideBadgeText}>{overrides.length} ozel fiyat</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={s.list}>
            {SERVICE_CATEGORIES.map((cat) => {
              const catSvcs = activeSvcs.filter((sv) => sv.category === cat);
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
                        style={s.overrideRow}
                        onPress={() => openEditOverride(sv)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.serviceName}>{sv.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 3, alignItems: 'center' }}>
                            {effPrice != null ? (
                              <>
                                <Text style={s.overridePrice}>{effPrice.toLocaleString('tr-TR')} ₺</Text>
                                <Text style={s.standardPrice}>{sv.price.toLocaleString('tr-TR')} ₺</Text>
                                {override?.discount_percent != null && (
                                  <View style={s.discountBadge}>
                                    <Text style={s.discountText}>-{override.discount_percent}%</Text>
                                  </View>
                                )}
                              </>
                            ) : (
                              <Text style={s.stdPriceLabel}>Standart: {sv.price.toLocaleString('tr-TR')} ₺</Text>
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
            })}
          </ScrollView>
        </View>
      )}

      {/* Override edit modal */}
      <Modal visible={editModal} transparent animationType="fade" onRequestClose={() => setEditModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.header}>
              <Text style={m.title}>Ozel Fiyat Belirle</Text>
              <Pressable style={m.closeBtn} onPress={() => setEditModal(false)}>
                <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
              </Pressable>
            </View>
            <ScrollView style={m.body} keyboardShouldPersistTaps="handled">
              {editSvc && (
                <View style={m.svcInfoCard}>
                  <Text style={m.svcInfoLabel}>Hizmet</Text>
                  <Text style={m.svcInfoName}>{editSvc.name}</Text>
                  <Text style={m.svcInfoPrice}>Standart: {editSvc.price.toLocaleString('tr-TR')} {editSvc.currency}</Text>
                </View>
              )}

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Fiyatlandirma Yontemi</Text>
                <Text style={m.hint}>Ozel fiyat VEYA iskonto orani belirleyebilirsiniz. Ikisi birden girilirse ozel fiyat onceliklidir.</Text>

                <View style={m.fieldWrap}>
                  <Text style={m.fieldLabel}>Ozel Fiyat (₺)</Text>
                  <TextInput
                    style={m.fieldInput}
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
                    style={m.fieldInput}
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
                  style={[m.fieldInput, { minHeight: 72, textAlignVertical: 'top' }]}
                  value={oForm.notes}
                  onChangeText={(v) => setOForm((f) => ({ ...f, notes: v }))}
                  placeholder="Istege bagli aciklama..."
                  placeholderTextColor={DS.ink[300]}
                  multiline
                />
              </View>

              <View style={{ height: 8 }} />
            </ScrollView>

            <View style={m.footer}>
              {overrides.find((o) => o.service_id === editSvc?.id) && (
                <Pressable style={m.deleteBtn} onPress={handleDeleteOverride}>
                  <Trash2 size={15} color="#D94B4B" strokeWidth={1.6} />
                  <Text style={m.deleteText}>Sil</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              <Pressable style={m.cancelBtn} onPress={() => setEditModal(false)}>
                <Text style={m.cancelText}>Iptal</Text>
              </Pressable>
              <Pressable
                style={[m.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveOverride}
                disabled={saving}
              >
                <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    return new Date(iso).toLocaleDateString('tr-TR');
  };

  if (loading) return <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} />;

  return (
    <View style={s.tabContent}>
      <View style={s.toolbar}>
        <Text style={s.toolbarTitle}>{promos.length} kampanya / promosyon</Text>
        <Pressable style={s.addBtn} onPress={openAdd}>
          <Plus size={15} color="#FFFFFF" strokeWidth={2} />
          <Text style={s.addBtnText}>Ekle</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.list}>
        {promos.length === 0 && (
          <View style={s.empty}>
            <Tag size={36} color={DS.ink[300]} strokeWidth={1.4} />
            <Text style={s.emptyTitle}>Henuz promosyon eklenmemis</Text>
            <Text style={s.emptySubtitle}>Kampanya veya toplu iskonto olusturun</Text>
            <Pressable style={s.emptyBtn} onPress={openAdd}>
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
                      : `${p.discount_value} ₺`}
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
                <Pressable style={s.editSmallBtn} onPress={() => openEdit(p)}>
                  <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                  <Text style={s.editSmallText}>Duzenle</Text>
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
              <Text style={m.title}>{editPromo ? 'Promosyon Duzenle' : 'Yeni Promosyon'}</Text>
              <Pressable style={m.closeBtn} onPress={() => setModal(false)}>
                <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
              </Pressable>
            </View>

            <ScrollView style={m.body} keyboardShouldPersistTaps="handled">
              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Promosyon Adi</Text>
                <TextInput
                  style={m.fieldInput}
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
                        {t === 'percent' ? 'Yuzde (%)' : 'Sabit (₺)'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={[m.fieldWrap, { marginTop: 14 }]}>
                  <Text style={m.fieldLabel}>Iskonto Degeri</Text>
                  <TextInput
                    style={m.fieldInput}
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
                    <Text style={m.fieldLabel}>Baslangic</Text>
                    <DatePicker
                      value={form.starts_at}
                      onChange={(v) => setForm((f) => ({ ...f, starts_at: v }))}
                      placeholder="Tarih seç"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.fieldLabel}>Bitis</Text>
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
              <Pressable style={m.cancelBtn} onPress={() => setModal(false)}>
                <Text style={m.cancelText}>Iptal</Text>
              </Pressable>
              <Pressable
                style={[m.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : editPromo ? 'Guncelle' : 'Olustur'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared: Service add/edit modal
// ────────────────────────────────────────────────────────────────────────────
function ServiceModal({
  visible, edit, form, setForm, error, setError, saving, onClose, onSave,
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
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>{edit ? 'Hizmeti Duzenle' : 'Hizmet Ekle'}</Text>
            <Pressable style={m.closeBtn} onPress={onClose}>
              <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
            </Pressable>
          </View>

          <ScrollView style={m.body} keyboardShouldPersistTaps="handled">
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Hizmet Bilgileri</Text>
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>Hizmet Adi <Text style={{ color: '#D94B4B' }}>*</Text></Text>
                <TextInput
                  style={m.fieldInput}
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
                {SERVICE_CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setForm((f) => ({ ...f, category: c }))}
                    style={[s.toggleChip, form.category === c && s.toggleChipActive]}
                  >
                    <Text style={[s.toggleChipText, form.category === c && s.toggleChipTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Fiyatlandirma</Text>
              <View style={m.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={m.fieldLabel}>Fiyat</Text>
                  <TextInput
                    style={m.fieldInput}
                    value={form.price}
                    onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
                    placeholder="0.00"
                    placeholderTextColor={DS.ink[300]}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ width: 100 }}>
                  <Text style={m.fieldLabel}>Para Birimi</Text>
                  <TextInput
                    style={m.fieldInput}
                    value={form.currency}
                    onChangeText={(v) => setForm((f) => ({ ...f, currency: v }))}
                    placeholder="TRY"
                    placeholderTextColor={DS.ink[300]}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            </View>

            {error ? (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 4 }}>
                <Text style={{ color: '#D94B4B', fontWeight: '600', fontSize: 13 }}>{error}</Text>
              </View>
            ) : null}

            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={m.footer}>
            <Pressable style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>Iptal</Text>
            </Pressable>
            <Pressable
              style={[m.saveBtn, saving && { opacity: 0.6 }]}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : edit ? 'Guncelle' : 'Ekle'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
