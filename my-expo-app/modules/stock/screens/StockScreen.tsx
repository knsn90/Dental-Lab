import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator, Modal, useWindowDimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { supabase } from '../../../core/api/supabase';
import { StockMovementsScreen } from './StockMovementsScreen';
import { WasteReportModal } from '../components/WasteReportModal';
import { useAuthStore } from '../../../core/store/authStore';
import { DS } from '../../../core/theme/dsTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import {
  Package, Plus, Search, X, Pencil, Trash2,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle, AlertCircle,
  CheckCircle, XCircle, Filter, ChevronDown, ChevronUp,
  ChevronRight, Tag, Grid3x3, ShoppingCart, Clock,
  TrendingDown, Flame, PlusCircle, Check, ArrowLeftRight,
  DatabaseZap, Inbox, BarChart3, TrendingUp, Users,
  Calendar, Zap, Layers, MapPin, QrCode, Copy, Warehouse,
} from 'lucide-react-native';

// ─── Patterns Design Language Tokens ─────────────────────────────────────────

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid: any = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  ...(Platform.OS === 'web' ? { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } : {}),
};

const tableCard: any = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden',
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
  neutral: { bg: 'rgba(0,0,0,0.05)',      fg: '#0A0A0A' },
};

const modalOverlay: any = {
  flex: 1,
  backgroundColor: 'rgba(15,23,42,0.4)',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 24,
};

const modalSheet: any = {
  backgroundColor: '#FFFFFF',
  borderRadius: 24,
  width: '100%',
  maxWidth: 540,
  maxHeight: '92%',
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  ...(Platform.OS === 'web' ? { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } : {}),
};

const modalHeader: any = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 24,
  paddingTop: 22,
  paddingBottom: 18,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(0,0,0,0.04)',
};

const modalFooter: any = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 10,
  paddingHorizontal: 24,
  paddingVertical: 16,
  borderTopWidth: 1,
  borderTopColor: 'rgba(0,0,0,0.04)',
};

const fieldInput: any = {
  height: 44,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.08)',
  paddingHorizontal: 14,
  fontSize: 14,
  color: DS.ink[900],
  backgroundColor: '#FFFFFF',
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
};

const ghostBtn: any = {
  paddingHorizontal: 14,
  paddingVertical: 6,
  borderRadius: 9999,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.08)',
  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
};

const darkPillBtn: any = {
  paddingHorizontal: 14,
  paddingVertical: 6,
  borderRadius: 9999,
  backgroundColor: DS.ink[900],
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  minWidth: 80,
  justifyContent: 'center',
  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
};

const colHeader: any = {
  textTransform: 'uppercase',
  fontSize: 10,
  fontWeight: '600',
  letterSpacing: 0.7,
  color: DS.ink[500],
};

const sectionCard: any = {
  backgroundColor: '#FFFFFF',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  padding: 16,
  marginBottom: 12,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockItem {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  unit?: string;
  category?: string;
  supplier?: string;
  brand?: string;
  type?: string | null;
  usage_category?: 'production' | 'office' | 'misc' | null;
  units_per_tooth?: number | null;
  consume_at_stage?: string | null;
  unit_cost?: number | null;
  location?: string | null;
  barcode?: string | null;
}

const USAGE_CATEGORY_OPTIONS: { key: 'all' | 'production' | 'office' | 'misc'; label: string }[] = [
  { key: 'all',        label: 'Tumu' },
  { key: 'production', label: 'Uretim' },
  { key: 'office',     label: 'Ofis' },
  { key: 'misc',       label: 'Diger' },
];

const STAGE_OPTIONS = ['TRIAGE', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC'];

type MovType = 'IN' | 'OUT' | 'WASTE';
type StatusFilter = 'all' | 'critical' | 'ok' | 'empty';
type TabKey = 'dashboard' | 'list' | 'movements' | 'suggestions' | 'analytics' | 'locations' | 'cost' | 'forecast' | 'settings';

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ quantity, min }: { quantity: number; min: number }) {
  const pct = min > 0 ? quantity / min : 1;
  if (quantity === 0) return (
    <View style={{ borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: CHIP_TONES.danger.bg }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: CHIP_TONES.danger.fg }}>Tukendi</Text>
    </View>
  );
  if (pct < 1) return (
    <View style={{ borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: CHIP_TONES.warning.bg }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: CHIP_TONES.warning.fg }}>Kritik</Text>
    </View>
  );
  return (
    <View style={{ borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: CHIP_TONES.success.bg }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: CHIP_TONES.success.fg }}>Normal</Text>
    </View>
  );
}

// ─── StockBar ─────────────────────────────────────────────────────────────────

function StockBar({ quantity, min }: { quantity: number; min: number }) {
  const pct = min > 0 ? Math.min(quantity / min, 1) : 1;
  const barColor = pct === 0 ? CHIP_TONES.danger.fg : pct < 1 ? CHIP_TONES.warning.fg : CHIP_TONES.success.fg;
  return (
    <View style={{ height: 4, backgroundColor: DS.ink[100], borderRadius: 3, overflow: 'hidden', flex: 1, minWidth: 48 }}>
      <View style={{ height: 4, borderRadius: 3, width: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor }} />
    </View>
  );
}

// ─── ProductModal ─────────────────────────────────────────────────────────────

interface ProductModalProps {
  visible: boolean;
  item: StockItem | null;
  accentColor: string;
  existingCategories: string[];
  existingBrands: string[];
  onClose: () => void;
  onSaved: () => void;
}

function ProductModal({ visible, item, accentColor, existingCategories, existingBrands, onClose, onSaved }: ProductModalProps) {
  const isEdit = item !== null;
  const [name, setName]         = useState('');
  const [category, setCategory] = useState('');
  const [catSearch, setCatSearch]   = useState('');
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [brand, setBrand]       = useState('');
  const [brandSearch, setBrandSearch]   = useState('');
  const [brandDropOpen, setBrandDropOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [minQty, setMinQty]     = useState('');
  const [unit, setUnit]         = useState('');
  const [supplier, setSupplier] = useState('');
  const [matType, setMatType]             = useState('');
  const [usageCategory, setUsageCategory] = useState<'production' | 'office' | 'misc'>('misc');
  const [unitsPerTooth, setUnitsPerTooth] = useState('');
  const [consumeStage, setConsumeStage]   = useState<string>('MILLING');
  const [unitCost, setUnitCost]           = useState('');
  const [consumptionType, setConsumptionType] = useState<'fixed' | 'per_tooth' | 'manual'>('manual');
  const [location, setLocation] = useState('');
  const [barcode, setBarcode]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (visible) {
      setName(item?.name ?? '');
      setCategory(item?.category ?? '');
      setCatSearch(''); setCatDropOpen(false);
      setBrand(item?.brand ?? '');
      setBrandSearch(''); setBrandDropOpen(false);
      setQuantity(item ? String(item.quantity) : '');
      setMinQty(item ? String(item.min_quantity) : '');
      setUnit(item?.unit ?? '');
      setSupplier(item?.supplier ?? '');
      setMatType(item?.type ?? '');
      setUsageCategory((item?.usage_category as any) ?? 'misc');
      setUnitsPerTooth(item?.units_per_tooth != null ? String(item.units_per_tooth) : '');
      setConsumeStage(item?.consume_at_stage ?? 'MILLING');
      setUnitCost(item?.unit_cost != null ? String(item.unit_cost) : '');
      setConsumptionType(((item as any)?.consumption_type as any) ?? 'manual');
      setLocation(item?.location ?? '');
      setBarcode(item?.barcode ?? '');
      setError('');
    }
  }, [visible, item]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Urun adi zorunlu'); return; }
    const qty = parseFloat(quantity);
    const min = parseFloat(minQty);
    if (isNaN(qty) || qty < 0) { setError('Gecerli bir miktar girin'); return; }
    if (isNaN(min) || min < 0) { setError('Gecerli bir minimum girin'); return; }
    setSaving(true); setError('');
    try {
      const brandName = brand.trim() || null;
      const upt = parseFloat(unitsPerTooth);
      const cost = parseFloat(unitCost);
      const payload = {
        name: name.trim(),
        category: category.trim() || null,
        brand: brandName,
        quantity: qty,
        min_quantity: min,
        unit: unit.trim() || null,
        supplier: supplier.trim() || null,
        type: matType.trim() || null,
        usage_category: usageCategory,
        consumption_type: consumptionType,
        units_per_tooth: !isNaN(upt) && upt > 0 ? upt : null,
        consume_at_stage: usageCategory === 'production' ? consumeStage : 'MILLING',
        unit_cost: !isNaN(cost) && cost >= 0 ? cost : 0,
        location: location.trim() || null,
        barcode: barcode.trim() || null,
      };
      if (isEdit) {
        const { error: e } = await supabase.from('stock_items').update(payload).eq('id', item!.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('stock_items').insert(payload);
        if (e) throw e;
      }
      const categoryName = category.trim() || null;
      if (brandName) await supabase.from('brands').upsert({ name: brandName }, { onConflict: 'name', ignoreDuplicates: true });
      if (categoryName) await supabase.from('categories').upsert({ name: categoryName }, { onConflict: 'name', ignoreDuplicates: true });
      onSaved(); onClose();
    } catch (e: any) {
      setError(e.message ?? 'Kayit hatasi');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      await supabase.from('stock_items').delete().eq('id', item.id);
      onSaved(); onClose();
    } finally { setDeleting(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalOverlay}>
        <View style={modalSheet}>
          <View style={modalHeader}>
            <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: DS.ink[900] }}>
              {isEdit ? 'Urunu Duzenle' : 'Yeni Urun Ekle'}
            </Text>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 9999, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
            >
              <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            <View style={sectionCard}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginBottom: 14 }}>Urun Bilgileri</Text>

              {/* Urun Adi */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>
                  URUN ADI <Text style={{ color: CHIP_TONES.danger.fg }}>*</Text>
                </Text>
                <TextInput style={fieldInput} value={name} onChangeText={setName} placeholder="orn. Zirkonyum Blok" placeholderTextColor={DS.ink[400]} />
              </View>

              {/* Kategori dropdown */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>KATEGORI</Text>
                <Pressable
                  onPress={() => { setCatDropOpen(v => !v); setBrandDropOpen(false); }}
                  style={{ ...fieldInput, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                >
                  <Text style={category ? { fontSize: 14, color: DS.ink[900] } : { fontSize: 14, color: DS.ink[400] }}>
                    {category || 'Kategori secin veya yazin...'}
                  </Text>
                  {catDropOpen
                    ? <ChevronUp size={14} color={DS.ink[400]} strokeWidth={1.6} />
                    : <ChevronDown size={14} color={DS.ink[400]} strokeWidth={1.6} />
                  }
                </Pressable>
                {catDropOpen && (
                  <View style={{ marginTop: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
                    <TextInput
                      style={{ ...fieldInput, borderWidth: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)', borderRadius: 0 }}
                      value={catSearch}
                      onChangeText={setCatSearch}
                      placeholder="Ara veya yeni ekle..."
                      placeholderTextColor={DS.ink[400]}
                      autoFocus
                    />
                    <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                      {existingCategories
                        .filter(c => !catSearch || c.toLowerCase().includes(catSearch.toLowerCase()))
                        .map(c => (
                          <Pressable
                            key={c}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: category === c ? DS.ink[50] : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                            onPress={() => { setCategory(c); setCatSearch(''); setCatDropOpen(false); }}
                          >
                            <Text style={{ fontSize: 14, color: category === c ? accentColor : DS.ink[700], fontWeight: category === c ? '700' : '500' }}>{c}</Text>
                            {category === c && <Check size={13} color={accentColor} strokeWidth={2} />}
                          </Pressable>
                        ))}
                      {catSearch.trim() && !existingCategories.some(c => c.toLowerCase() === catSearch.trim().toLowerCase()) && (
                        <Pressable
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                          onPress={() => { setCategory(catSearch.trim()); setCatSearch(''); setCatDropOpen(false); }}
                        >
                          <PlusCircle size={14} color={accentColor} strokeWidth={1.6} />
                          <Text style={{ fontSize: 14, fontWeight: '600', color: accentColor }}>"{catSearch.trim()}" ekle</Text>
                        </Pressable>
                      )}
                      {existingCategories.filter(c => !catSearch || c.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && !catSearch.trim() && (
                        <Text style={{ paddingHorizontal: 14, paddingVertical: 14, fontSize: 13, color: DS.ink[400], textAlign: 'center' }}>Henuz kategori yok</Text>
                      )}
                    </ScrollView>
                    {category ? (
                      <Pressable
                        style={{ borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', paddingHorizontal: 14, paddingVertical: 10, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                        onPress={() => { setCategory(''); setCatDropOpen(false); }}
                      >
                        <Text style={{ fontSize: 13, color: DS.ink[400], fontWeight: '500' }}>Temizle</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>

              {/* Marka dropdown */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>MARKA</Text>
                <Pressable
                  onPress={() => { setBrandDropOpen(v => !v); setCatDropOpen(false); }}
                  style={{ ...fieldInput, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                >
                  <Text style={brand ? { fontSize: 14, color: DS.ink[900] } : { fontSize: 14, color: DS.ink[400] }}>
                    {brand || 'Marka secin veya yazin...'}
                  </Text>
                  {brandDropOpen
                    ? <ChevronUp size={14} color={DS.ink[400]} strokeWidth={1.6} />
                    : <ChevronDown size={14} color={DS.ink[400]} strokeWidth={1.6} />
                  }
                </Pressable>
                {brandDropOpen && (
                  <View style={{ marginTop: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
                    <TextInput
                      style={{ ...fieldInput, borderWidth: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)', borderRadius: 0 }}
                      value={brandSearch}
                      onChangeText={setBrandSearch}
                      placeholder="Ara veya yeni ekle..."
                      placeholderTextColor={DS.ink[400]}
                      autoFocus
                    />
                    <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                      {existingBrands
                        .filter(b => !brandSearch || b.toLowerCase().includes(brandSearch.toLowerCase()))
                        .map(b => (
                          <Pressable
                            key={b}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: brand === b ? DS.ink[50] : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                            onPress={() => { setBrand(b); setBrandSearch(''); setBrandDropOpen(false); }}
                          >
                            <Text style={{ fontSize: 14, color: brand === b ? accentColor : DS.ink[700], fontWeight: brand === b ? '700' : '500' }}>{b}</Text>
                            {brand === b && <Check size={13} color={accentColor} strokeWidth={2} />}
                          </Pressable>
                        ))}
                      {brandSearch.trim() && !existingBrands.some(b => b.toLowerCase() === brandSearch.trim().toLowerCase()) && (
                        <Pressable
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                          onPress={() => { setBrand(brandSearch.trim()); setBrandSearch(''); setBrandDropOpen(false); }}
                        >
                          <PlusCircle size={14} color={accentColor} strokeWidth={1.6} />
                          <Text style={{ fontSize: 14, fontWeight: '600', color: accentColor }}>"{brandSearch.trim()}" ekle</Text>
                        </Pressable>
                      )}
                      {existingBrands.filter(b => !brandSearch || b.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && !brandSearch.trim() && (
                        <Text style={{ paddingHorizontal: 14, paddingVertical: 14, fontSize: 13, color: DS.ink[400], textAlign: 'center' }}>Henuz marka yok</Text>
                      )}
                    </ScrollView>
                    {brand ? (
                      <Pressable
                        style={{ borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', paddingHorizontal: 14, paddingVertical: 10, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                        onPress={() => { setBrand(''); setBrandDropOpen(false); }}
                      >
                        <Text style={{ fontSize: 13, color: DS.ink[400], fontWeight: '500' }}>Temizle</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>BIRIM</Text>
                <TextInput style={fieldInput} value={unit} onChangeText={setUnit} placeholder="adet / ml / gr / kutu..." placeholderTextColor={DS.ink[400]} />
              </View>
              <View style={{ marginBottom: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>TEDARIKCI</Text>
                <TextInput style={fieldInput} value={supplier} onChangeText={setSupplier} placeholder="Tedarikci firma adi..." placeholderTextColor={DS.ink[400]} />
              </View>
            </View>

            {/* Konum & Barkod */}
            <View style={sectionCard}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginBottom: 14 }}>Konum & Barkod</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, marginBottom: 0 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>LOKASYON / RAF</Text>
                  <TextInput style={fieldInput} value={location} onChangeText={setLocation} placeholder="orn. A-1, Raf B-3" placeholderTextColor={DS.ink[400]} />
                </View>
                <View style={{ flex: 1, marginBottom: 0 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>BARKOD / QR</Text>
                  <TextInput style={fieldInput} value={barcode} onChangeText={setBarcode} placeholder="orn. STK-00123" placeholderTextColor={DS.ink[400]} />
                </View>
              </View>
            </View>

            {/* Stok Miktarlari */}
            <View style={sectionCard}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginBottom: 14 }}>Stok Miktarlari</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>
                    {isEdit ? 'MEVCUT MIKTAR' : 'BASLANGIC MIKTARI'} <Text style={{ color: CHIP_TONES.danger.fg }}>*</Text>
                  </Text>
                  <TextInput style={fieldInput} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" placeholderTextColor={DS.ink[400]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>
                    MINIMUM STOK <Text style={{ color: CHIP_TONES.danger.fg }}>*</Text>
                  </Text>
                  <TextInput style={fieldInput} value={minQty} onChangeText={setMinQty} keyboardType="numeric" placeholder="0" placeholderTextColor={DS.ink[400]} />
                </View>
              </View>
              {error ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(217,75,75,0.08)', borderRadius: 14, padding: 12, marginTop: 10 }}>
                  <AlertCircle size={14} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                  <Text style={{ fontSize: 13, color: CHIP_TONES.danger.fg, flex: 1 }}>{error}</Text>
                </View>
              ) : null}
            </View>

            {/* Uretim Entegrasyonu */}
            <View style={sectionCard}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginBottom: 14 }}>Uretim Entegrasyonu</Text>

              {/* Usage category */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>KULLANIM KATEGORISI</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['production', 'office', 'misc'] as const).map(cat => {
                    const active = usageCategory === cat;
                    const label = cat === 'production' ? 'Uretim' : cat === 'office' ? 'Ofis' : 'Diger';
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setUsageCategory(cat)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 6,
                          borderRadius: 9999,
                          borderWidth: 1,
                          borderColor: active ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                          backgroundColor: active ? DS.ink[900] : '#FFFFFF',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#FFFFFF' : DS.ink[700] }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Material type */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>MATERYAL TURU</Text>
                <TextInput
                  style={fieldInput}
                  value={matType}
                  onChangeText={setMatType}
                  placeholder="zirconia / metal / emax / pmma / glaze..."
                  placeholderTextColor={DS.ink[400]}
                />
                <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 4 }}>
                  {'Sipariş türüyle eşleşir (zirconia siparişi → zirconia disk).'}
                </Text>
              </View>

              {/* Consumption type */}
              {usageCategory === 'production' && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>TUKETIM MODELI</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {([
                      { key: 'per_tooth',     label: 'Dis Basi',  hint: 'tooth x units' },
                      { key: 'fixed',         label: 'Sabit',     hint: '1 birim/siparis' },
                      { key: 'manual',        label: 'Manuel',    hint: 'her seferde gir' },
                    ] as const).map(opt => {
                      const active = consumptionType === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => setConsumptionType(opt.key)}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 6,
                            borderRadius: 9999,
                            borderWidth: 1,
                            borderColor: active ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                            backgroundColor: active ? DS.ink[900] : '#FFFFFF',
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? '#FFFFFF' : DS.ink[700] }}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 4 }}>
                    {consumptionType === 'per_tooth' && 'Dis sayisi x dis basina tuketim formulu.'}
                    {consumptionType === 'fixed'     && 'Asama tamamlaninca 1 birim duser.'}
                    {consumptionType === 'manual'    && 'Her asamada manuel miktar girilir.'}
                  </Text>
                </View>
              )}

              {/* Production-only fields */}
              {usageCategory === 'production' && (
                <>
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>DIS BASINA TUKETIM</Text>
                      <TextInput
                        style={fieldInput}
                        value={unitsPerTooth}
                        onChangeText={setUnitsPerTooth}
                        keyboardType="numeric"
                        placeholder="0.5"
                        placeholderTextColor={DS.ink[400]}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>TUKETIM ASAMASI</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                        {STAGE_OPTIONS.map(st => {
                          const active = consumeStage === st;
                          return (
                            <Pressable
                              key={st}
                              onPress={() => setConsumeStage(st)}
                              style={{
                                paddingHorizontal: 8, paddingVertical: 4,
                                borderRadius: 9999,
                                borderWidth: 1,
                                borderColor: active ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                                backgroundColor: active ? DS.ink[900] : '#FFFFFF',
                                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#FFFFFF' : DS.ink[400] }}>
                                {st}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: DS.ink[400], marginBottom: 12 }}>
                    Siparis bu asamayi tamamlayinca: dis sayisi x tuketim = stoktan otomatik dusulur.
                  </Text>
                </>
              )}

              {/* Unit cost */}
              <View style={{ marginBottom: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>BIRIM MALIYET (TL)</Text>
                <TextInput
                  style={fieldInput}
                  value={unitCost}
                  onChangeText={setUnitCost}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={DS.ink[400]}
                />
              </View>
            </View>
          </ScrollView>

          <View style={modalFooter}>
            {isEdit && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(217,75,75,0.2)', backgroundColor: 'rgba(217,75,75,0.08)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator size="small" color={CHIP_TONES.danger.fg} /> : <Trash2 size={14} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />}
                <Text style={{ fontSize: 13, fontWeight: '600', color: CHIP_TONES.danger.fg }}>Sil</Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable style={ghostBtn} onPress={onClose}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[700] }}>Iptal</Text>
            </Pressable>
            <Pressable style={{ ...darkPillBtn, backgroundColor: accentColor }} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{isEdit ? 'Guncelle' : 'Ekle'}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── MovementModal ────────────────────────────────────────────────────────────

const MOV_TYPES: { key: MovType; label: string; color: string; bg: string }[] = [
  { key: 'IN',    label: 'Giris',  color: CHIP_TONES.success.fg, bg: CHIP_TONES.success.bg },
  { key: 'OUT',   label: 'Cikis',  color: CHIP_TONES.info.fg,    bg: CHIP_TONES.info.bg },
  { key: 'WASTE', label: 'Fire',   color: CHIP_TONES.danger.fg,  bg: CHIP_TONES.danger.bg },
];

interface MovementModalProps {
  visible: boolean;
  item: StockItem | null;
  items?: StockItem[];
  accentColor: string;
  defaultType?: MovType;
  onClose: () => void;
  onSaved: () => void;
}

function MovementModal({ visible, item, items = [], accentColor, defaultType = 'IN', onClose, onSaved }: MovementModalProps) {
  const standalone = item === null;
  const [selectedId, setSelectedId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [type, setType]   = useState<MovType>(defaultType);
  const [qty, setQty]     = useState('');
  const [note, setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resolvedItem = standalone ? (items.find(i => i.id === selectedId) ?? null) : item;

  useEffect(() => {
    if (visible) { setType(defaultType); setQty(''); setNote(''); setError(''); setSelectedId(''); setPickerSearch(''); setPickerOpen(false); }
  }, [visible, defaultType]);

  const pickerItems = pickerSearch.trim()
    ? items.filter(i => i.name.toLowerCase().includes(pickerSearch.toLowerCase()))
    : items;

  const handleSave = async () => {
    if (!resolvedItem) { setError('Urun secin'); return; }
    const amount = parseFloat(qty);
    if (!amount || amount <= 0) { setError('Gecerli bir miktar girin'); return; }
    setSaving(true); setError('');
    try {
      const next = type === 'IN' ? resolvedItem.quantity + amount : Math.max(0, resolvedItem.quantity - amount);
      await supabase.from('stock_items').update({ quantity: next }).eq('id', resolvedItem.id);
      await supabase.from('stock_movements').insert({
        item_name: resolvedItem.name, type, quantity: amount, unit: resolvedItem.unit ?? null, note: note.trim() || null,
      });
      onSaved(); onClose();
    } catch (e: any) {
      setError(e.message ?? 'Islem hatasi');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalOverlay}>
        <View style={{ ...modalSheet, maxWidth: 420 }}>
          <View style={modalHeader}>
            <View>
              <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: DS.ink[900] }}>Stok Hareketi</Text>
              {resolvedItem && <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>{resolvedItem.name}</Text>}
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 9999, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
            >
              <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
            </Pressable>
          </View>

          <View style={{ padding: 16, paddingBottom: 0 }}>
            {/* Item picker */}
            {standalone && (
              <View style={sectionCard}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginBottom: 14 }}>
                  Urun Sec <Text style={{ color: CHIP_TONES.danger.fg }}>*</Text>
                </Text>
                <Pressable
                  style={{ ...fieldInput, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                  onPress={() => setPickerOpen(v => !v)}
                >
                  <Text style={resolvedItem ? { fontSize: 14, color: DS.ink[900] } : { fontSize: 14, color: DS.ink[400] }}>
                    {resolvedItem ? resolvedItem.name : 'Urun secin...'}
                  </Text>
                  {pickerOpen
                    ? <ChevronUp size={15} color={DS.ink[400]} strokeWidth={1.6} />
                    : <ChevronDown size={15} color={DS.ink[400]} strokeWidth={1.6} />
                  }
                </Pressable>
                {pickerOpen && (
                  <View style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', borderRadius: 14, backgroundColor: DS.ink[50], marginTop: 4, overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
                      <Search size={13} color={DS.ink[400]} strokeWidth={1.6} />
                      <TextInput
                        style={{ flex: 1, fontSize: 13, color: DS.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) } as any}
                        value={pickerSearch}
                        onChangeText={setPickerSearch}
                        placeholder="Urun ara..."
                        placeholderTextColor={DS.ink[400]}
                        autoFocus
                      />
                    </View>
                    <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
                      {pickerItems.map((i, idx) => (
                        <Pressable
                          key={i.id}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: idx < pickerItems.length - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)', backgroundColor: selectedId === i.id ? DS.ink[50] : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                          onPress={() => { setSelectedId(i.id); setPickerOpen(false); setPickerSearch(''); }}
                        >
                          <Text style={{ fontSize: 14, color: DS.ink[900], fontWeight: selectedId === i.id ? '600' : '400' }}>{i.name}</Text>
                          {selectedId === i.id && <Check size={14} color={DS.ink[900]} strokeWidth={2} />}
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* Type selector */}
            <View style={sectionCard}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginBottom: 14 }}>Islem Tipi</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {MOV_TYPES.map(t => (
                  <Pressable
                    key={t.key}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                      paddingVertical: 10, borderRadius: 14, borderWidth: 1.5,
                      borderColor: type === t.key ? t.color : 'rgba(0,0,0,0.08)',
                      backgroundColor: type === t.key ? t.bg : DS.ink[50],
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    }}
                    onPress={() => setType(t.key)}
                  >
                    {t.key === 'IN' && <ArrowDownCircle size={15} color={type === t.key ? t.color : DS.ink[400]} strokeWidth={1.6} />}
                    {t.key === 'OUT' && <ArrowUpCircle size={15} color={type === t.key ? t.color : DS.ink[400]} strokeWidth={1.6} />}
                    {t.key === 'WASTE' && <AlertCircle size={15} color={type === t.key ? t.color : DS.ink[400]} strokeWidth={1.6} />}
                    <Text style={{ fontSize: 12, fontWeight: type === t.key ? '700' : '500', color: type === t.key ? t.color : DS.ink[400] }}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Quantity + Note */}
            <View style={sectionCard}>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>
                  MIKTAR <Text style={{ color: CHIP_TONES.danger.fg }}>*</Text>
                </Text>
                <TextInput style={fieldInput} value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="0" placeholderTextColor={DS.ink[400]} />
              </View>
              <View style={{ marginBottom: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>NOT</Text>
                <TextInput
                  style={{ ...fieldInput, height: undefined, minHeight: 56 }}
                  value={note} onChangeText={setNote}
                  placeholder="Istege bagli aciklama..." placeholderTextColor={DS.ink[400]} multiline
                />
              </View>
              {error ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(217,75,75,0.08)', borderRadius: 14, padding: 12, marginTop: 10 }}>
                  <AlertCircle size={14} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                  <Text style={{ fontSize: 13, color: CHIP_TONES.danger.fg, flex: 1 }}>{error}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={modalFooter}>
            <Pressable style={ghostBtn} onPress={onClose}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[700] }}>Iptal</Text>
            </Pressable>
            <Pressable style={{ ...darkPillBtn, backgroundColor: accentColor }} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Kaydet</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── DonutChart ──────────────────────────────────────────────────────────────

function DonutChart({ pct, color, size = 80, stroke = 9 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r    = (size - stroke) / 2;
  const cx   = size / 2;
  const circ = 2 * Math.PI * r;
  const off  = circ * (1 - Math.min(Math.max(pct, 0), 1));
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cx} r={r} fill="none" stroke={DS.ink[100]} strokeWidth={stroke} />
      <Circle
        cx={cx} cy={cx} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={off}
        strokeLinecap="round"
        rotation="-90"
        origin={`${cx}, ${cx}`}
      />
    </Svg>
  );
}

// ─── PetalChart ──────────────────────────────────────────────────────────────

const PIE_COLORS = [DS.ink[900], '#2563EB', CHIP_TONES.success.fg, CHIP_TONES.warning.fg, CHIP_TONES.danger.fg];

function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function PetalChart({ data, size = 216 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const cx     = size / 2;
  const maxR   = cx - 8;
  const innerR = maxR * 0.25;
  const gap    = 7;
  const n      = data.length;
  if (n === 0) return null;

  const sliceDeg = 360 / n;
  const maxVal   = Math.max(...data.map(d => d.value), 1);
  const bgMidR   = (innerR + maxR) / 2;
  const bgStroke = maxR - innerR;

  const arcPath = (midR: number, startDeg: number, endDeg: number) => {
    const span = endDeg - startDeg;
    if (span < 0.5) return '';
    const s = polarXY(cx, cx, midR, startDeg);
    const e = polarXY(cx, cx, midR, endDeg);
    const lg = span > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${midR} ${midR} 0 ${lg} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };

  const labelR = innerR + 0.72 * (maxR - innerR);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        {data.map((d, idx) => {
          const s0 = idx * sliceDeg - 90 + gap / 2;
          const e0 = s0 + sliceDeg - gap;
          const bgPath = arcPath(bgMidR, s0, e0);
          const pctVal = d.value / maxVal;
          const outerR = innerR + pctVal * (maxR - innerR);
          const midR   = (innerR + outerR) / 2;
          const sw     = Math.max(outerR - innerR, 6);
          const valPath = arcPath(midR, s0, e0);

          return (
            <React.Fragment key={idx}>
              <Path d={bgPath}  fill="none" stroke={DS.ink[200]} strokeWidth={bgStroke} strokeLinecap="round" />
              <Path d={valPath} fill="none" stroke={d.color} strokeWidth={sw}       strokeLinecap="round" />
            </React.Fragment>
          );
        })}
      </Svg>

      {data.map((d, idx) => {
        const midAngle = idx * sliceDeg - 90 + sliceDeg / 2;
        const pos = polarXY(cx, cx, labelR, midAngle);
        return (
          <View
            key={`lbl-${idx}`}
            pointerEvents="none"
            style={{ position: 'absolute', left: pos.x - 34, top: pos.y - 17, width: 68, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF',
              textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
              {d.value}
            </Text>
            <Text style={{ fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.9)', textAlign: 'center',
              textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}
              numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── StockDashboard ──────────────────────────────────────────────────────────

interface DashboardProps {
  items: StockItem[];
  accentColor: string;
  onMovement: (item: StockItem | null, defaultType?: MovType) => void;
  onAddProduct: () => void;
  onEditProduct: (item: StockItem) => void;
}

function StockDashboard({ items, accentColor, onMovement, onAddProduct, onEditProduct }: DashboardProps) {
  const [recentCount, setRecentCount] = useState<number | null>(null);

  useEffect(() => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('stock_movements').select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .then(({ count }) => setRecentCount(count ?? 0));
  }, []);

  const total    = items.length;
  const normal   = items.filter(i => i.quantity >= i.min_quantity);
  const critical = items.filter(i => i.quantity > 0 && i.quantity < i.min_quantity);
  const empty    = items.filter(i => i.quantity === 0);

  const catMap = new Map<string, number>();
  items.forEach(i => {
    const key = i.category || 'Kategorisiz';
    catMap.set(key, (catMap.get(key) ?? 0) + 1);
  });
  const catStats = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const urgentItems = [...empty, ...critical]
    .sort((a, b) => {
      const pA = a.min_quantity > 0 ? a.quantity / a.min_quantity : 0;
      const pB = b.min_quantity > 0 ? b.quantity / b.min_quantity : 0;
      return pA - pB;
    })
    .slice(0, 5);

  if (total === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 50, gap: 10 }}>
        <Package size={44} color={DS.ink[200]} strokeWidth={1.2} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>Henuz urun yok</Text>
        <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center' }}>Stok yonetimine baslamak icin ilk urununuzu ekleyin.</Text>
        <Pressable
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999, backgroundColor: accentColor, marginTop: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
          onPress={onAddProduct}
        >
          <Plus size={14} color="#FFFFFF" strokeWidth={2} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Ilk Urunu Ekle</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {/* 4 Stat cards */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {([
          { label: 'TOPLAM URUN',    value: total,           sub: `${catStats.length} kategori`,                                                    icon: Package,       tone: 'neutral' as const },
          { label: 'NORMAL STOK',    value: normal.length,   sub: total > 0 ? `%${Math.round(normal.length/total*100)} yeterli` : 'yeterli stok',   icon: CheckCircle,   tone: 'success' as const },
          { label: 'KRITIK SEVIYE',  value: critical.length, sub: critical.length > 0 ? 'minimum altinda' : 'tumu normal',                          icon: AlertTriangle, tone: 'warning' as const },
          { label: 'TUKENDI',        value: empty.length,    sub: empty.length > 0 ? 'acil siparis gerekli' : 'eksik urun yok',                     icon: XCircle,       tone: 'danger'  as const },
        ] as const).map((stat, i) => {
          const isAlert    = stat.tone === 'danger' && stat.value > 0;
          const iconBgMap  = { neutral: DS.ink[100], success: CHIP_TONES.success.bg, warning: CHIP_TONES.warning.bg, danger: isAlert ? CHIP_TONES.danger.bg : DS.ink[100] };
          const iconColMap = { neutral: DS.ink[500], success: CHIP_TONES.success.fg, warning: CHIP_TONES.warning.fg, danger: isAlert ? CHIP_TONES.danger.fg : DS.ink[400] };
          const Icon = stat.icon;
          return (
            <View key={i} style={{
              ...cardSolid,
              flex: 1,
              minWidth: 150,
              gap: 4,
              ...(isAlert ? { borderWidth: 1, borderColor: 'rgba(217,75,75,0.2)', backgroundColor: 'rgba(217,75,75,0.04)' } : {}),
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: isAlert ? CHIP_TONES.danger.fg : DS.ink[400], letterSpacing: 0.8, flex: 1, paddingRight: 8, paddingTop: 4 }}>
                  {stat.label}
                </Text>
                <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBgMap[stat.tone] }}>
                  <Icon size={18} color={iconColMap[stat.tone]} strokeWidth={1.6} />
                </View>
              </View>
              <Text style={{ fontSize: 32, fontWeight: '800', color: isAlert ? CHIP_TONES.danger.fg : DS.ink[900], letterSpacing: -1 }}>{stat.value}</Text>
              <Text style={{ fontSize: 11, color: DS.ink[400], fontWeight: '500' }}>{stat.sub}</Text>
            </View>
          );
        })}
      </View>

      {/* Category bar chart + status donut */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {catStats.length > 0 && (
          <View style={{ ...cardSolid, flex: 1.2, minWidth: 200 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>Kategori Dagilimi</Text>
              <Text style={{ fontSize: 12, color: DS.ink[400] }}>Ilk {catStats.length}</Text>
            </View>
            <View style={{ gap: 14 }}>
              {catStats.map(([cat, count], idx) => {
                const maxCount = catStats[0][1];
                const pctVal = maxCount > 0 ? count / maxCount : 0;
                const clr = PIE_COLORS[idx % PIE_COLORS.length];
                return (
                  <View key={cat} style={{ gap: 7 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[700], flex: 1 }} numberOfLines={1}>{cat}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: clr }}>{Math.round(pctVal * 100)}%</Text>
                    </View>
                    <View style={{ height: 8, backgroundColor: DS.ink[100], borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ height: 8, borderRadius: 4, width: `${Math.round(pctVal * 100)}%` as any, backgroundColor: clr }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ ...cardSolid, flex: 1, minWidth: 160 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>Stok Durumu</Text>
          </View>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ position: 'relative', width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
              <DonutChart pct={total > 0 ? normal.length / total : 0} color={CHIP_TONES.success.fg} size={150} stroke={20} />
              <View style={{ position: 'absolute', alignItems: 'center' }}>
                <Text style={{ fontSize: 34, fontWeight: '800', color: DS.ink[900], letterSpacing: -1 }}>
                  {total > 0 ? Math.round(normal.length / total * 100) : 0}
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>%</Text>
                </Text>
                <Text style={{ fontSize: 12, color: DS.ink[400], fontWeight: '600' }}>Normal</Text>
              </View>
            </View>
          </View>
          <View style={{ gap: 10 }}>
            {([
              { label: 'Normal',  count: normal.length,   color: CHIP_TONES.success.fg },
              { label: 'Kritik',  count: critical.length, color: CHIP_TONES.warning.fg },
              { label: 'Tukendi', count: empty.length,    color: CHIP_TONES.danger.fg },
            ] as const).map(l => (
              <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, backgroundColor: l.color }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[800], flex: 1 }}>{l.label}</Text>
                <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{l.count}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Urgent items */}
      {urgentItems.length > 0 && (
        <View style={cardSolid}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>Acil Dikkat</Text>
            <View style={{ backgroundColor: CHIP_TONES.danger.bg, borderRadius: 9999, paddingHorizontal: 9, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: CHIP_TONES.danger.fg }}>{urgentItems.length} urun</Text>
            </View>
          </View>
          {urgentItems.map((item, idx) => {
            const isEmpty = item.quantity === 0;
            const isLast  = idx === urgentItems.length - 1;
            const clr     = isEmpty ? CHIP_TONES.danger.fg : CHIP_TONES.warning.fg;
            const bg      = isEmpty ? CHIP_TONES.danger.bg : CHIP_TONES.warning.bg;
            return (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, ...(!isLast ? { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' } : {}) }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: bg }}>
                  {isEmpty
                    ? <AlertCircle size={22} color={clr} strokeWidth={1.6} />
                    : <AlertTriangle size={22} color={clr} strokeWidth={1.6} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }} numberOfLines={1}>{item.name}</Text>
                  <Text style={{ fontSize: 12, color: DS.ink[400], fontWeight: '500', marginTop: 2 }}>
                    {isEmpty ? 'Stok tukendi' : `${item.quantity}${item.unit ? ` ${item.unit}` : ''} kaldi - minimum: ${item.min_quantity}`}
                  </Text>
                </View>
                <Pressable
                  style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999, backgroundColor: accentColor, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                  onPress={() => onMovement(item, 'IN')}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Yeniden Siparis</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 24 }} />
    </View>
  );
}

// ─── StockSettings ───────────────────────────────────────────────────────────

interface BrandRecord {
  id: string;
  name: string;
  supplier?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  website?: string;
  notes?: string;
}

// ── BrandModal ────────────────────────────────────────────────────────────────

function BrandModal({ visible, brand, accentColor, onClose, onSaved }: {
  visible: boolean; brand: BrandRecord | null; accentColor: string;
  onClose: () => void; onSaved: (oldName?: string) => void;
}) {
  const isEdit = brand !== null;
  const [name, setName]                 = useState('');
  const [supplier, setSupplier]         = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone]               = useState('');
  const [email, setEmail]               = useState('');
  const [website, setWebsite]           = useState('');
  const [notes, setNotes]               = useState('');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    if (visible) {
      setName(brand?.name ?? '');
      setSupplier(brand?.supplier ?? '');
      setContactPerson(brand?.contact_person ?? '');
      setPhone(brand?.phone ?? '');
      setEmail(brand?.email ?? '');
      setWebsite(brand?.website ?? '');
      setNotes(brand?.notes ?? '');
      setError('');
    }
  }, [visible, brand]);

  const handleSave = async () => {
    const n = name.trim();
    if (!n) { setError('Marka adi zorunlu'); return; }
    setSaving(true); setError('');
    const payload: any = {
      name: n,
      supplier: supplier.trim() || null,
      contact_person: contactPerson.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      website: website.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit) {
        const { error: e } = await supabase.from('brands').update(payload).eq('id', brand!.id);
        if (e) throw e;
        if (n !== brand!.name) {
          await supabase.from('stock_items').update({ brand: n }).eq('brand', brand!.name);
        }
        onSaved(brand!.name);
      } else {
        const { error: e } = await supabase.from('brands').insert(payload);
        if (e) throw e;
        onSaved();
      }
      onClose();
    } catch (e: any) { setError(e.message ?? 'Kayit hatasi'); }
    finally { setSaving(false); }
  };

  const BrandField = ({ label, value, onChange, placeholder, keyboard, multiline }: {
    label: string; value: string; onChange: (t: string) => void;
    placeholder?: string; keyboard?: any; multiline?: boolean;
  }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>{label}</Text>
      <TextInput
        style={{ ...fieldInput, ...(multiline ? { height: undefined, minHeight: 80, textAlignVertical: 'top', paddingTop: 10 } : {}) }}
        value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor={DS.ink[400]}
        keyboardType={keyboard} multiline={multiline}
      />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalOverlay}>
        <View style={modalSheet}>
          <View style={modalHeader}>
            <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: DS.ink[900] }}>
              {isEdit ? 'Markayi Duzenle' : 'Yeni Marka Ekle'}
            </Text>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 9999, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
            >
              <X size={16} color={DS.ink[500]} strokeWidth={1.6} />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            <View style={sectionCard}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginBottom: 14 }}>Marka Bilgileri</Text>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>
                  MARKA ADI <Text style={{ color: CHIP_TONES.danger.fg }}>*</Text>
                </Text>
                <TextInput style={fieldInput} value={name} onChangeText={t => { setName(t); setError(''); }}
                  placeholder="orn. 3M, GC, Vita..." placeholderTextColor={DS.ink[400]} />
              </View>
              <BrandField label="SATICI / DISTRIBUTOR" value={supplier} onChange={setSupplier} placeholder="Turkiye distributoru..." />
            </View>

            <View style={sectionCard}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginBottom: 14 }}>Iletisim Bilgileri</Text>
              <BrandField label="ILETISIM KISISI" value={contactPerson} onChange={setContactPerson} placeholder="Ad Soyad..." />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>TELEFON</Text>
                  <TextInput style={fieldInput} value={phone} onChangeText={setPhone}
                    placeholder="+90 5XX..." placeholderTextColor={DS.ink[400]} keyboardType="phone-pad" />
                </View>
                <View style={{ flex: 1, marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>E-POSTA</Text>
                  <TextInput style={fieldInput} value={email} onChangeText={setEmail}
                    placeholder="info@..." placeholderTextColor={DS.ink[400]} keyboardType="email-address" />
                </View>
              </View>
              <BrandField label="WEB SITESI" value={website} onChange={setWebsite} placeholder="www.marka.com" />
            </View>

            <View style={{ ...sectionCard, marginBottom: 0 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginBottom: 14 }}>Ek Bilgiler</Text>
              <View style={{ marginBottom: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], marginBottom: 7, letterSpacing: 0.5 }}>NOTLAR</Text>
                <TextInput style={{ ...fieldInput, height: undefined, minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }}
                  value={notes} onChangeText={setNotes}
                  placeholder="Siparis kosullari, indirim orani, teslimat suresi..."
                  placeholderTextColor={DS.ink[400]} multiline />
              </View>
            </View>

            {error ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(217,75,75,0.08)', borderRadius: 14, padding: 12, marginTop: 12 }}>
                <AlertCircle size={14} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                <Text style={{ fontSize: 13, color: CHIP_TONES.danger.fg, flex: 1 }}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={modalFooter}>
            <View style={{ flex: 1 }} />
            <Pressable style={ghostBtn} onPress={onClose}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[700] }}>Iptal</Text>
            </Pressable>
            <Pressable style={{ ...darkPillBtn, backgroundColor: accentColor }} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{isEdit ? 'Guncelle' : 'Ekle'}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── BrandsList ────────────────────────────────────────────────────────────────

function BrandsList({ accentColor, onReload }: { accentColor: string; onReload: () => void }) {
  const [brands, setBrands]   = useState<BrandRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<{ visible: boolean; brand: BrandRecord | null }>({ visible: false, brand: null });

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('brands').select('*').order('name');
    setBrands((data ?? []) as BrandRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleDelete = async (id: string, name: string) => {
    await supabase.from('brands').delete().eq('id', id);
    await fetch(); onReload();
  };

  return (
    <>
      <View style={tableCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '12' }}>
              <Tag size={14} color={accentColor} strokeWidth={1.6} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: DS.ink[900] }}>Markalar</Text>
            <View style={{ backgroundColor: DS.ink[100], borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[500] }}>{brands.length}</Text>
            </View>
          </View>
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9999, backgroundColor: accentColor, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
            onPress={() => setModal({ visible: true, brand: null })}
          >
            <Plus size={13} color="#FFFFFF" strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Ekle</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 20 }} />
        ) : brands.length === 0 ? (
          <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center', paddingVertical: 24 }}>Henuz marka yok</Text>
        ) : (
          brands.map((b, idx) => {
            const isLast = idx === brands.length - 1;
            return (
              <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14, ...(!isLast ? { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' } : {}) }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Tag size={13} color={DS.ink[500]} strokeWidth={1.6} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[800] }} numberOfLines={1}>{b.name}</Text>
                  {(b.supplier || b.contact_person || b.phone) && (
                    <Text style={{ fontSize: 12, color: DS.ink[400], fontWeight: '500', marginTop: 1 }} numberOfLines={1}>
                      {[b.supplier, b.contact_person, b.phone].filter(Boolean).join(' - ')}
                    </Text>
                  )}
                </View>
                <Pressable
                  style={{ width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.ink[50], ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                  onPress={() => setModal({ visible: true, brand: b })}
                >
                  <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                </Pressable>
                <Pressable
                  style={{ width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: CHIP_TONES.danger.bg, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                  onPress={() => handleDelete(b.id, b.name)}
                >
                  <Trash2 size={13} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      <BrandModal
        visible={modal.visible}
        brand={modal.brand}
        accentColor={accentColor}
        onClose={() => setModal({ visible: false, brand: null })}
        onSaved={() => { fetch(); onReload(); }}
      />
    </>
  );
}

// ── CategoryList ──────────────────────────────────────────────────────────────

function CategoryList({ accentColor, onReload }: { accentColor: string; onReload: () => void }) {
  const [rows, setRows]         = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [addMode, setAddMode]   = useState(false);
  const [addText, setAddText]   = useState('');
  const [editName, setEditName] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('categories').select('name').order('name');
    setRows((data ?? []).map((r: any) => r.name));
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleAdd = async () => {
    const name = addText.trim();
    if (!name) return;
    if (rows.some(r => r.toLowerCase() === name.toLowerCase())) { setError('Bu isim zaten mevcut'); return; }
    setSaving(true); setError('');
    const { error: e } = await supabase.from('categories').insert({ name });
    setSaving(false);
    if (e) { setError(e.message); return; }
    setAddText(''); setAddMode(false);
    await fetchRows(); onReload();
  };

  const handleEdit = async () => {
    const name = editText.trim();
    if (!name || name === editName) { setEditName(null); return; }
    if (rows.some(r => r.toLowerCase() === name.toLowerCase() && r !== editName)) { setError('Bu isim zaten mevcut'); return; }
    setSaving(true); setError('');
    const { error: e } = await supabase.from('categories').update({ name }).eq('name', editName!);
    if (!e) await supabase.from('stock_items').update({ category: name }).eq('category', editName!);
    setSaving(false);
    if (e) { setError(e.message); return; }
    setEditName(null);
    await fetchRows(); onReload();
  };

  const handleDelete = async (name: string) => {
    await supabase.from('categories').delete().eq('name', name);
    await fetchRows(); onReload();
  };

  return (
    <View style={tableCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '12' }}>
            <Grid3x3 size={14} color={accentColor} strokeWidth={1.6} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: DS.ink[900] }}>Kategoriler</Text>
          <View style={{ backgroundColor: DS.ink[100], borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[500] }}>{rows.length}</Text>
          </View>
        </View>
        <Pressable
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9999, backgroundColor: accentColor, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
          onPress={() => { setAddMode(true); setAddText(''); setError(''); setEditName(null); }}
        >
          <Plus size={13} color="#FFFFFF" strokeWidth={2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Ekle</Text>
        </Pressable>
      </View>

      {addMode && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)', backgroundColor: DS.ink[50] }}>
          <TextInput
            style={{ ...fieldInput, flex: 1 }}
            value={addText} onChangeText={t => { setAddText(t); setError(''); }}
            placeholder="Kategori adi..." placeholderTextColor={DS.ink[400]} autoFocus onSubmitEditing={handleAdd}
          />
          <Pressable
            style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
            onPress={handleAdd} disabled={saving}
          >
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Check size={14} color="#FFFFFF" strokeWidth={2} />}
          </Pressable>
          <Pressable
            style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.ink[100], ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
            onPress={() => { setAddMode(false); setError(''); }}
          >
            <X size={14} color={DS.ink[400]} strokeWidth={1.6} />
          </Pressable>
        </View>
      )}

      {error ? <Text style={{ fontSize: 12, color: CHIP_TONES.danger.fg, paddingHorizontal: 20, paddingBottom: 8 }}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 20 }} />
      ) : rows.length === 0 && !addMode ? (
        <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center', paddingVertical: 24 }}>Henuz kategori yok</Text>
      ) : (
        rows.map((name, idx) => {
          const isEditing = editName === name;
          const isLast = idx === rows.length - 1;
          return (
            <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14, ...(!isLast ? { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' } : {}) }}>
              {isEditing ? (
                <>
                  <TextInput
                    style={{ ...fieldInput, flex: 1 }}
                    value={editText}
                    onChangeText={t => { setEditText(t); setError(''); }}
                    autoFocus onSubmitEditing={handleEdit}
                  />
                  <Pressable
                    style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                    onPress={handleEdit} disabled={saving}
                  >
                    {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Check size={14} color="#FFFFFF" strokeWidth={2} />}
                  </Pressable>
                  <Pressable
                    style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.ink[100], ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                    onPress={() => { setEditName(null); setError(''); }}
                  >
                    <X size={14} color={DS.ink[400]} strokeWidth={1.6} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[800], flex: 1 }} numberOfLines={1}>{name}</Text>
                  <Pressable
                    style={{ width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.ink[50], ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                    onPress={() => { setEditName(name); setEditText(name); setError(''); setAddMode(false); }}
                  >
                    <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                  </Pressable>
                  <Pressable
                    style={{ width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: CHIP_TONES.danger.bg, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                    onPress={() => handleDelete(name)}
                  >
                    <Trash2 size={13} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                  </Pressable>
                </>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

// ── StockSettings container ───────────────────────────────────────────────────

function StockSettings({ accentColor, onReload }: { accentColor: string; onReload: () => void }) {
  return (
    <View style={{ gap: 16 }}>
      <BrandsList accentColor={accentColor} onReload={onReload} />
      <CategoryList accentColor={accentColor} onReload={onReload} />
    </View>
  );
}

// ─── SuggestionTab ──────────────────────────────────────────────────────────

interface SuggestionItem {
  item: StockItem;
  missing: number;
  estimatedCost: number;
  dailyConsumption: number;
  daysRemaining: number | null; // null = infinity
}

function SuggestionsTab({
  items,
  accentColor,
  onMovement,
}: {
  items: StockItem[];
  accentColor: string;
  onMovement: (item: StockItem, defaultType: MovType) => void;
}) {
  const [consumptionMap, setConsumptionMap] = useState<Record<string, number>>({});
  const [loadingConsumption, setLoadingConsumption] = useState(true);

  // Fetch 30-day consumption data
  useEffect(() => {
    (async () => {
      setLoadingConsumption(true);
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('stock_movements')
        .select('item_name, quantity, type')
        .in('type', ['OUT', 'WASTE'])
        .gte('created_at', since.toISOString());

      const map: Record<string, number> = {};
      for (const m of (data ?? []) as any[]) {
        const key = m.item_name ?? '';
        if (!key) continue;
        map[key] = (map[key] ?? 0) + Number(m.quantity ?? 0);
      }
      setConsumptionMap(map);
      setLoadingConsumption(false);
    })();
  }, [items]);

  // Build suggestion list
  const suggestions: SuggestionItem[] = items
    .filter(i => i.quantity < i.min_quantity || i.quantity === 0)
    .map(item => {
      const missing = Math.max(0, item.min_quantity - item.quantity);
      const estimatedCost = missing * (item.unit_cost ?? 0);
      const totalOut30d = consumptionMap[item.name] ?? 0;
      const dailyConsumption = totalOut30d / 30;
      const daysRemaining = dailyConsumption > 0 ? item.quantity / dailyConsumption : null;
      return { item, missing, estimatedCost, dailyConsumption, daysRemaining };
    })
    .sort((a, b) => {
      // empty items first
      if (a.item.quantity === 0 && b.item.quantity !== 0) return -1;
      if (a.item.quantity !== 0 && b.item.quantity === 0) return 1;
      // then by quantity/min_quantity ascending
      const ratioA = a.item.min_quantity > 0 ? a.item.quantity / a.item.min_quantity : 0;
      const ratioB = b.item.min_quantity > 0 ? b.item.quantity / b.item.min_quantity : 0;
      return ratioA - ratioB;
    });

  const totalEstimatedCost = suggestions.reduce((sum, s) => sum + s.estimatedCost, 0);

  if (loadingConsumption) {
    return <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />;
  }

  if (suggestions.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 50, gap: 10 }}>
        <CheckCircle size={44} color={CHIP_TONES.success.fg} strokeWidth={1.2} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>Tum stoklar yeterli</Text>
        <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center' }}>Minimum seviyenin altinda urun bulunmuyor.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {/* Summary card */}
      <View style={{ ...cardSolid, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: CHIP_TONES.warning.bg }}>
          <ShoppingCart size={22} color={CHIP_TONES.warning.fg} strokeWidth={1.6} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: DS.ink[900] }}>
            {suggestions.length} urun siparis gerekli
          </Text>
          <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 2 }}>
            Tahmini toplam: {totalEstimatedCost.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 })}
          </Text>
        </View>
      </View>

      {/* Table */}
      <View style={tableCard}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
          <Text style={{ ...colHeader, flex: 2.5 }}>URUN</Text>
          <Text style={{ ...colHeader, flex: 0.8, textAlign: 'center' }}>MEVCUT</Text>
          <Text style={{ ...colHeader, flex: 0.8, textAlign: 'center' }}>MINIMUM</Text>
          <Text style={{ ...colHeader, flex: 0.8, textAlign: 'center' }}>EKSIK</Text>
          <Text style={{ ...colHeader, flex: 1, textAlign: 'center' }}>B. MALIYET</Text>
          <Text style={{ ...colHeader, flex: 1, textAlign: 'center' }}>T. MALIYET</Text>
          <Text style={{ ...colHeader, flex: 1, textAlign: 'center' }}>TAH. BITIS</Text>
          <Text style={{ ...colHeader, flex: 0.8, textAlign: 'center' }}>DURUM</Text>
          <View style={{ width: 90 }} />
        </View>

        {/* Data rows */}
        {suggestions.map((s, idx) => {
          const isLast = idx === suggestions.length - 1;
          const isEmpty = s.item.quantity === 0;
          return (
            <View
              key={s.item.id}
              style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 20, paddingVertical: 14,
                ...(!isLast ? { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' } : {}),
              }}
            >
              <View style={{ flex: 2.5 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900], letterSpacing: -0.1 }} numberOfLines={1}>
                  {s.item.name}
                </Text>
                {(s.item.brand || s.item.unit) && (
                  <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
                    {[s.item.brand, s.item.unit].filter(Boolean).join(' - ')}
                  </Text>
                )}
              </View>
              <Text style={{ flex: 0.8, textAlign: 'center', fontSize: 13, fontWeight: isEmpty ? '700' : '500', color: isEmpty ? CHIP_TONES.danger.fg : DS.ink[700] }}>
                {s.item.quantity}
              </Text>
              <Text style={{ flex: 0.8, textAlign: 'center', fontSize: 13, color: DS.ink[500] }}>
                {s.item.min_quantity}
              </Text>
              <Text style={{ flex: 0.8, textAlign: 'center', fontSize: 13, fontWeight: '700', color: CHIP_TONES.danger.fg }}>
                {s.missing}
              </Text>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 12, color: DS.ink[500] }}>
                {s.item.unit_cost != null ? `${s.item.unit_cost.toLocaleString('tr-TR')} TL` : '-'}
              </Text>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>
                {s.estimatedCost > 0 ? `${s.estimatedCost.toLocaleString('tr-TR')} TL` : '-'}
              </Text>
              <View style={{ flex: 1, alignItems: 'center' }}>
                {s.daysRemaining === null ? (
                  <Text style={{ fontSize: 16, color: DS.ink[400] }}>{'∞'}</Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Clock size={11} color={s.daysRemaining < 3 ? CHIP_TONES.danger.fg : s.daysRemaining < 7 ? CHIP_TONES.warning.fg : DS.ink[500]} strokeWidth={1.6} />
                    <Text style={{
                      fontSize: 12, fontWeight: '600',
                      color: s.daysRemaining < 3 ? CHIP_TONES.danger.fg : s.daysRemaining < 7 ? CHIP_TONES.warning.fg : DS.ink[700],
                    }}>
                      {Math.round(s.daysRemaining)} gun
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 0.8, alignItems: 'center' }}>
                <StatusBadge quantity={s.item.quantity} min={s.item.min_quantity} />
              </View>
              <View style={{ width: 90, alignItems: 'flex-end' }}>
                <Pressable
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 10, paddingVertical: 6,
                    borderRadius: 9999, backgroundColor: accentColor,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  }}
                  onPress={() => onMovement(s.item, 'IN')}
                >
                  <ShoppingCart size={11} color="#FFFFFF" strokeWidth={2} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>Siparis</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ height: 24 }} />
    </View>
  );
}

// ─── AnalyticsTab ────────────────────────────────────────────────────────────

type AnalyticsRange = 'thisWeek' | 'thisMonth' | 'thisYear';

const ANALYTICS_RANGES: { key: AnalyticsRange; label: string }[] = [
  { key: 'thisWeek',  label: 'Bu Hafta' },
  { key: 'thisMonth', label: 'Bu Ay' },
  { key: 'thisYear',  label: 'Bu Yıl' },
];

interface TechUsageRow {
  user_id: string; user_name: string;
  used_qty: number; used_cost: number;
  waste_qty: number; waste_cost: number;
  total_qty: number; efficiency_pct: number | null;
}

interface WasteByMat {
  item_id: string; item_name: string; type: string | null;
  waste_qty: number; waste_cost: number; unit: string | null;
}

interface DailyConsumption {
  day: string;
  out_qty: number;
  waste_qty: number;
  total_qty: number;
}

function getAnalyticsRange(r: AnalyticsRange): { from: string; to: string } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (r === 'thisWeek') {
    const day = now.getDay() || 7;
    const start = new Date(now); start.setDate(now.getDate() - day + 1);
    return { from: ymd(start), to: ymd(now) };
  }
  if (r === 'thisMonth') return { from: ymd(new Date(yyyy, mm, 1)), to: ymd(new Date(yyyy, mm + 1, 0)) };
  return { from: `${yyyy}-01-01`, to: `${yyyy}-12-31` };
}

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

function AnalyticsTab({ accentColor }: { accentColor: string }) {
  const { profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const labId = (profile as any)?.lab_id ?? profile?.id ?? null;

  const [range, setRange] = useState<AnalyticsRange>('thisMonth');
  const [techRows, setTechRows] = useState<TechUsageRow[]>([]);
  const [wasteRows, setWasteRows] = useState<WasteByMat[]>([]);
  const [dailyData, setDailyData] = useState<DailyConsumption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!labId) return;
    let cancelled = false;
    setLoading(true);
    const { from, to } = getAnalyticsRange(range);

    Promise.all([
      supabase.rpc('report_technician_usage', { p_lab_id: labId, p_from: from, p_to: to }),
      supabase.rpc('report_material_waste', { p_lab_id: labId, p_from: from, p_to: to }),
      supabase
        .from('stock_movements')
        .select('type, quantity, created_at')
        .in('type', ['OUT', 'WASTE'])
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
        .order('created_at'),
    ]).then(([techRes, wasteRes, movRes]) => {
      if (cancelled) return;
      setTechRows((techRes.data ?? []) as TechUsageRow[]);
      setWasteRows((wasteRes.data ?? []) as WasteByMat[]);

      // Aggregate movements by day
      const dayMap = new Map<string, { out: number; waste: number }>();
      for (const m of (movRes.data ?? []) as any[]) {
        const day = (m.created_at as string).slice(0, 10);
        if (!dayMap.has(day)) dayMap.set(day, { out: 0, waste: 0 });
        const entry = dayMap.get(day)!;
        if (m.type === 'OUT') entry.out += Number(m.quantity ?? 0);
        else entry.waste += Number(m.quantity ?? 0);
      }
      const daily = Array.from(dayMap.entries())
        .map(([day, v]) => ({ day, out_qty: v.out, waste_qty: v.waste, total_qty: v.out + v.waste }))
        .sort((a, b) => a.day.localeCompare(b.day));
      setDailyData(daily);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [labId, range]);

  // Aggregates
  const totals = useMemo(() => {
    const totalUsed = techRows.reduce((s, r) => s + r.used_qty, 0);
    const totalUsedCost = techRows.reduce((s, r) => s + r.used_cost, 0);
    const totalWaste = wasteRows.reduce((s, r) => s + r.waste_qty, 0);
    const totalWasteCost = wasteRows.reduce((s, r) => s + r.waste_cost, 0);
    const avgEff = techRows.filter(r => r.efficiency_pct !== null).length > 0
      ? techRows.filter(r => r.efficiency_pct !== null).reduce((s, r) => s + (r.efficiency_pct ?? 0), 0) /
        techRows.filter(r => r.efficiency_pct !== null).length
      : null;
    const avgDailyConsumption = dailyData.length > 0
      ? dailyData.reduce((s, d) => s + d.total_qty, 0) / dailyData.length
      : 0;
    return { totalUsed, totalUsedCost, totalWaste, totalWasteCost, avgEff, avgDailyConsumption };
  }, [techRows, wasteRows, dailyData]);

  // Bar chart max
  const maxDaily = useMemo(() => Math.max(...dailyData.map(d => d.total_qty), 1), [dailyData]);

  if (loading) {
    return (
      <View style={{ paddingVertical: 60, alignItems: 'center' }}>
        <ActivityIndicator color={DS.ink[900]} />
        <Text style={{ fontSize: 13, color: DS.ink[400], marginTop: 12 }}>Analiz yükleniyor…</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {/* ── Range pills ────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {ANALYTICS_RANGES.map(opt => {
          const active = range === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setRange(opt.key)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: active ? 14 : 12, paddingVertical: 6,
                borderRadius: 9999,
                backgroundColor: active ? DS.ink[900] : '#FFFFFF',
                borderWidth: active ? 0 : 1, borderColor: DS.ink[300],
                // @ts-ignore web
                cursor: 'pointer',
              }}
            >
              {active && <Calendar size={11} color="#FFFFFF" strokeWidth={2} />}
              <Text style={{ fontSize: 12, fontWeight: '500', color: active ? '#FFFFFF' : DS.ink[500] }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── KPI Summary ────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <View style={{ ...cardSolid, flex: 1, minWidth: 140, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Layers size={13} color={DS.ink[500]} strokeWidth={1.8} />
            <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[400] }}>Toplam Kullanım</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '600', color: DS.ink[900] }}>{fmt(totals.totalUsed)}</Text>
          <Text style={{ fontSize: 11, color: DS.ink[400] }}>{fmt(totals.totalUsedCost)} ₺</Text>
        </View>
        <View style={{ ...cardSolid, flex: 1, minWidth: 140, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Flame size={13} color={CHIP_TONES.danger.fg} strokeWidth={1.8} />
            <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[400] }}>Toplam Fire</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '600', color: CHIP_TONES.danger.fg }}>{fmt(totals.totalWaste)}</Text>
          <Text style={{ fontSize: 11, color: CHIP_TONES.danger.fg }}>−{fmt(totals.totalWasteCost)} ₺</Text>
        </View>
        <View style={{ ...cardSolid, flex: 1, minWidth: 140, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Zap size={13} color={CHIP_TONES.info.fg} strokeWidth={1.8} />
            <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[400] }}>Ort. Verim</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '600', color: totals.avgEff !== null ? (totals.avgEff >= 95 ? CHIP_TONES.success.fg : totals.avgEff >= 85 ? CHIP_TONES.warning.fg : CHIP_TONES.danger.fg) : DS.ink[400] }}>
            {totals.avgEff !== null ? `%${fmt1(totals.avgEff)}` : '—'}
          </Text>
        </View>
        <View style={{ ...cardSolid, flex: 1, minWidth: 140, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TrendingDown size={13} color={DS.ink[500]} strokeWidth={1.8} />
            <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[400] }}>Günlük Ort. Tüketim</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '600', color: DS.ink[900] }}>{fmt1(totals.avgDailyConsumption)}</Text>
        </View>
      </View>

      {/* ── Daily Consumption Bar Chart ────────────────────────── */}
      {dailyData.length > 0 && (
        <View style={{ ...cardSolid, padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={15} color={DS.ink[700]} strokeWidth={1.8} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>Günlük Tüketim</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CHIP_TONES.info.fg }} />
                <Text style={{ fontSize: 10, color: DS.ink[400] }}>Kullanım</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CHIP_TONES.danger.fg }} />
                <Text style={{ fontSize: 10, color: DS.ink[400] }}>Fire</Text>
              </View>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 120, paddingTop: 8 }}>
              {dailyData.map((d, i) => {
                const outH = (d.out_qty / maxDaily) * 100;
                const wasteH = (d.waste_qty / maxDaily) * 100;
                const dayLabel = d.day.slice(5); // MM-DD
                return (
                  <View key={d.day} style={{ alignItems: 'center', gap: 4, width: isWide ? 28 : 22 }}>
                    <View style={{ height: 100, justifyContent: 'flex-end', gap: 1 }}>
                      {d.waste_qty > 0 && (
                        <View style={{
                          width: isWide ? 18 : 14, height: Math.max(wasteH, 2),
                          backgroundColor: CHIP_TONES.danger.fg, borderRadius: 3,
                        }} />
                      )}
                      <View style={{
                        width: isWide ? 18 : 14, height: Math.max(outH, 2),
                        backgroundColor: CHIP_TONES.info.fg, borderRadius: 3,
                      }} />
                    </View>
                    <Text style={{ fontSize: 8, color: DS.ink[400], transform: [{ rotate: '-45deg' }] }}>
                      {dayLabel}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Two-column: Technician Usage + Material Waste ──────── */}
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12 }}>

        {/* Teknisyen Bazlı Kullanım */}
        <View style={{ ...tableCard, flex: 1 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
          }}>
            <Users size={14} color={DS.ink[700]} strokeWidth={1.8} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>Teknisyen Kullanımı</Text>
          </View>

          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 8,
            backgroundColor: '#FAFAFA',
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
          }}>
            <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>TEKNİSYEN</Text>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], textAlign: 'right' }}>KULLANIM</Text>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], textAlign: 'right' }}>FİRE</Text>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], textAlign: 'center' }}>VERİM</Text>
          </View>

          {techRows.length === 0 ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: DS.ink[400] }}>Bu dönemde veri yok</Text>
            </View>
          ) : (
            techRows
              .sort((a, b) => (a.efficiency_pct ?? 100) - (b.efficiency_pct ?? 100))
              .map((row, i) => {
                const eff = row.efficiency_pct;
                const effChip = eff === null ? CHIP_TONES.neutral
                  : eff < 85 ? CHIP_TONES.danger
                  : eff < 95 ? CHIP_TONES.warning
                  : CHIP_TONES.success;
                return (
                  <View key={row.user_id} style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 12,
                    borderBottomWidth: i < techRows.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(0,0,0,0.04)',
                  }}>
                    <View style={{ flex: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{row.user_name}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{fmt1(row.used_qty)}</Text>
                      <Text style={{ fontSize: 10, color: DS.ink[400] }}>{fmt(row.used_cost)} ₺</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: row.waste_qty > 0 ? CHIP_TONES.danger.fg : DS.ink[900] }}>
                        {fmt1(row.waste_qty)}
                      </Text>
                      {row.waste_cost > 0 && (
                        <Text style={{ fontSize: 10, color: CHIP_TONES.danger.fg }}>−{fmt(row.waste_cost)} ₺</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      {eff !== null ? (
                        <View style={{
                          paddingHorizontal: 10, paddingVertical: 4,
                          borderRadius: 9999, backgroundColor: effChip.bg,
                        }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: effChip.fg }}>%{fmt1(eff)}</Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, color: DS.ink[400] }}>—</Text>
                      )}
                    </View>
                  </View>
                );
              })
          )}
        </View>

        {/* Materyal Bazlı Fire */}
        <View style={{ ...tableCard, flex: 1 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
          }}>
            <Flame size={14} color={CHIP_TONES.danger.fg} strokeWidth={1.8} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>Materyal Bazlı Fire</Text>
          </View>

          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 8,
            backgroundColor: '#FAFAFA',
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
          }}>
            <Text style={{ flex: 2, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>MATERYAL</Text>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], textAlign: 'right' }}>MİKTAR</Text>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], textAlign: 'right' }}>MALİYET</Text>
          </View>

          {wasteRows.length === 0 ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: DS.ink[400] }}>Bu dönemde fire kaydı yok</Text>
            </View>
          ) : (
            wasteRows
              .sort((a, b) => b.waste_cost - a.waste_cost)
              .map((row, i) => (
                <View key={row.item_id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 20, paddingVertical: 12,
                  borderBottomWidth: i < wasteRows.length - 1 ? 1 : 0,
                  borderBottomColor: 'rgba(0,0,0,0.04)',
                }}>
                  <View style={{ flex: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{row.item_name}</Text>
                    {row.type && (
                      <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: 1 }}>{row.type}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: CHIP_TONES.danger.fg }}>
                      {fmt1(row.waste_qty)}{row.unit ? ` ${row.unit}` : ''}
                    </Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: CHIP_TONES.danger.fg }}>
                      −{fmt(row.waste_cost)} ₺
                    </Text>
                  </View>
                </View>
              ))
          )}

          {/* Total footer */}
          {wasteRows.length > 0 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 12,
              backgroundColor: '#FAFAFA',
              borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
            }}>
              <Text style={{ flex: 2, fontSize: 11, fontWeight: '700', color: DS.ink[700], letterSpacing: 0.5, textTransform: 'uppercase' }}>
                TOPLAM ({wasteRows.length} materyal)
              </Text>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: CHIP_TONES.danger.fg }}>
                  {fmt1(totals.totalWaste)}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: CHIP_TONES.danger.fg }}>
                  −{fmt(totals.totalWasteCost)} ₺
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={{ height: 24 }} />
    </View>
  );
}

// ─── ForecastTab ─────────────────────────────────────────────────────────────

interface ForecastRow {
  item: StockItem;
  dailyRate: number;       // avg daily consumption
  daysRemaining: number | null;
  depletionDate: Date | null;
  weeklyTrend: number[];   // last 4 weeks consumption
  trendDirection: 'up' | 'down' | 'stable';
  upcomingNeed: number;    // estimated need from upcoming orders
}

function ForecastTab({ items, accentColor }: { items: StockItem[]; accentColor: string }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [movements, setMovements] = useState<{ item_name: string; item_id: string; quantity: number; created_at: string }[]>([]);
  const [upcomingOrders, setUpcomingOrders] = useState<{ case_type: string; tooth_count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);
  const [filterRisk, setFilterRisk] = useState<'all' | 'critical' | 'warning' | 'safe'>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 90); // Always fetch 90 days for trend calc

      const [movRes, ordRes] = await Promise.all([
        supabase
          .from('stock_movements')
          .select('item_name, item_id, quantity, created_at')
          .in('type', ['OUT', 'WASTE'])
          .gte('created_at', since.toISOString()),
        supabase
          .from('work_orders')
          .select('case_type, tooth_numbers')
          .in('status', ['beklemede', 'aktif', 'uretimde'])
          .gte('delivery_date', new Date().toISOString()),
      ]);

      if (movRes.data) {
        setMovements((movRes.data as any[]).map(m => ({
          item_name: m.item_name ?? '',
          item_id: m.item_id ?? '',
          quantity: Number(m.quantity ?? 0),
          created_at: m.created_at,
        })));
      }

      if (ordRes.data) {
        setUpcomingOrders((ordRes.data as any[]).map(o => ({
          case_type: o.case_type ?? '',
          tooth_count: Array.isArray(o.tooth_numbers) ? o.tooth_numbers.length : 0,
        })));
      }
      setLoading(false);
    })();
  }, []);

  const forecasts = useMemo(() => {
    const now = Date.now();
    const msPerDay = 86400000;
    const cutoff = now - rangeDays * msPerDay;

    // Group movements by item
    const byItem = new Map<string, typeof movements>();
    for (const m of movements) {
      const key = m.item_id || m.item_name;
      if (!byItem.has(key)) byItem.set(key, []);
      byItem.get(key)!.push(m);
    }

    // Upcoming order material needs — match case_type to item.type
    const orderNeedByType = new Map<string, number>();
    for (const o of upcomingOrders) {
      if (!o.case_type) continue;
      const key = o.case_type.toLowerCase();
      orderNeedByType.set(key, (orderNeedByType.get(key) ?? 0) + o.tooth_count);
    }

    const rows: ForecastRow[] = items.map(item => {
      const itemMovs = byItem.get(item.id) ?? byItem.get(item.name) ?? [];

      // Daily rate for selected range
      const rangeMovs = itemMovs.filter(m => new Date(m.created_at).getTime() >= cutoff);
      const totalQty = rangeMovs.reduce((s, m) => s + m.quantity, 0);
      const dailyRate = rangeDays > 0 ? totalQty / rangeDays : 0;

      // Days remaining
      const daysRemaining = dailyRate > 0 ? item.quantity / dailyRate : null;
      const depletionDate = daysRemaining != null ? new Date(now + daysRemaining * msPerDay) : null;

      // Weekly trend (last 4 weeks)
      const weeklyTrend: number[] = [];
      for (let w = 3; w >= 0; w--) {
        const wStart = now - (w + 1) * 7 * msPerDay;
        const wEnd = now - w * 7 * msPerDay;
        const wQty = itemMovs
          .filter(m => { const t = new Date(m.created_at).getTime(); return t >= wStart && t < wEnd; })
          .reduce((s, m) => s + m.quantity, 0);
        weeklyTrend.push(wQty);
      }

      // Trend direction
      const recentAvg = (weeklyTrend[2] + weeklyTrend[3]) / 2;
      const olderAvg = (weeklyTrend[0] + weeklyTrend[1]) / 2;
      const trendDirection: 'up' | 'down' | 'stable' =
        olderAvg > 0 && recentAvg > olderAvg * 1.15 ? 'up' :
        olderAvg > 0 && recentAvg < olderAvg * 0.85 ? 'down' : 'stable';

      // Upcoming order need
      let upcomingNeed = 0;
      if (item.type && item.units_per_tooth) {
        const teeth = orderNeedByType.get(item.type.toLowerCase()) ?? 0;
        upcomingNeed = teeth * item.units_per_tooth;
      }

      return { item, dailyRate, daysRemaining, depletionDate, weeklyTrend, trendDirection, upcomingNeed };
    });

    // Sort by urgency
    rows.sort((a, b) => {
      if (a.daysRemaining === null && b.daysRemaining === null) return 0;
      if (a.daysRemaining === null) return 1;
      if (b.daysRemaining === null) return -1;
      return a.daysRemaining - b.daysRemaining;
    });

    return rows;
  }, [items, movements, upcomingOrders, rangeDays]);

  const filtered = useMemo(() => {
    if (filterRisk === 'all') return forecasts;
    return forecasts.filter(f => {
      if (filterRisk === 'critical') return f.daysRemaining !== null && f.daysRemaining <= 7;
      if (filterRisk === 'warning')  return f.daysRemaining !== null && f.daysRemaining > 7 && f.daysRemaining <= 30;
      return f.daysRemaining === null || f.daysRemaining > 30;
    });
  }, [forecasts, filterRisk]);

  // KPI
  const criticalCount = forecasts.filter(f => f.daysRemaining !== null && f.daysRemaining <= 7).length;
  const warningCount = forecasts.filter(f => f.daysRemaining !== null && f.daysRemaining > 7 && f.daysRemaining <= 30).length;
  const safeCount = forecasts.filter(f => f.daysRemaining === null || f.daysRemaining > 30).length;
  const avgDaysLeft = (() => {
    const vals = forecasts.filter(f => f.daysRemaining !== null).map(f => f.daysRemaining!);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  })();

  if (loading) return <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />;

  const getRiskColor = (days: number | null) => {
    if (days === null) return DS.ink[400];
    if (days <= 7) return CHIP_TONES.danger.fg;
    if (days <= 30) return CHIP_TONES.warning.fg;
    return CHIP_TONES.success.fg;
  };

  const getRiskBg = (days: number | null) => {
    if (days === null) return DS.ink[100];
    if (days <= 7) return CHIP_TONES.danger.bg;
    if (days <= 30) return CHIP_TONES.warning.bg;
    return CHIP_TONES.success.bg;
  };

  const getRiskLabel = (days: number | null) => {
    if (days === null) return 'Belirsiz';
    if (days <= 0) return 'Tukendi';
    if (days <= 7) return `${Math.ceil(days)} gun`;
    if (days <= 30) return `${Math.ceil(days)} gun`;
    return `${Math.ceil(days)} gun`;
  };

  return (
    <View style={{ gap: 16 }}>
      {/* KPI cards */}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: '7 Gun Icinde Bitecek', value: String(criticalCount), icon: AlertCircle, color: '#DC2626' },
          { label: '30 Gun Icinde Bitecek', value: String(warningCount), icon: AlertTriangle, color: '#D97706' },
          { label: 'Guvenli', value: String(safeCount), icon: CheckCircle, color: '#059669' },
          { label: 'Ort. Kalan Gun', value: avgDaysLeft != null ? `${avgDaysLeft} gun` : '—', icon: Clock, color: '#6366F1' },
        ].map(kpi => {
          const KIcon = kpi.icon;
          return (
            <View key={kpi.label} style={{ ...cardSolid, flex: 1, minWidth: isDesktop ? 160 : 140, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: kpi.color + '14', alignItems: 'center', justifyContent: 'center' }}>
                <KIcon size={18} color={kpi.color} strokeWidth={1.6} />
              </View>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.3 }}>{kpi.value}</Text>
                <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{kpi.label}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Controls */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Range pills */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {[
            { days: 7, label: '7 Gun' },
            { days: 30, label: '30 Gun' },
            { days: 60, label: '60 Gun' },
            { days: 90, label: '90 Gun' },
          ].map(r => (
            <Pressable
              key={r.days}
              onPress={() => setRangeDays(r.days)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999,
                backgroundColor: rangeDays === r.days ? DS.ink[900] : 'transparent',
                borderWidth: rangeDays === r.days ? 0 : 1, borderColor: DS.ink[300],
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: rangeDays === r.days ? '700' : '500', color: rangeDays === r.days ? '#FFF' : DS.ink[500] }}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* Risk filter */}
        <View style={{ flexDirection: 'row', gap: 4, marginLeft: isDesktop ? 12 : 0 }}>
          {([
            { key: 'all' as const, label: 'Tumu', count: forecasts.length },
            { key: 'critical' as const, label: 'Kritik', count: criticalCount },
            { key: 'warning' as const, label: 'Uyari', count: warningCount },
            { key: 'safe' as const, label: 'Guvenli', count: safeCount },
          ]).map(f => (
            <Pressable
              key={f.key}
              onPress={() => setFilterRisk(f.key)}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999,
                backgroundColor: filterRisk === f.key ? (f.key === 'critical' ? '#DC2626' : f.key === 'warning' ? '#D97706' : f.key === 'safe' ? '#059669' : DS.ink[900]) : 'transparent',
                borderWidth: filterRisk === f.key ? 0 : 1, borderColor: DS.ink[200],
                flexDirection: 'row', alignItems: 'center', gap: 4,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: filterRisk === f.key ? '700' : '500', color: filterRisk === f.key ? '#FFF' : DS.ink[500] }}>
                {f.label}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: '600', color: filterRisk === f.key ? 'rgba(255,255,255,0.7)' : DS.ink[400] }}>{f.count}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Forecast cards */}
      {filtered.length === 0 ? (
        <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 48, gap: 12 }}>
          <CheckCircle size={36} color={DS.ink[200]} strokeWidth={1.2} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[800] }}>Bu filtrede urun yok</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {filtered.map(f => {
            const riskColor = getRiskColor(f.daysRemaining);
            const riskBg = getRiskBg(f.daysRemaining);
            const maxWeekly = Math.max(...f.weeklyTrend, 1);

            return (
              <View key={f.item.id} style={{ ...cardSolid, padding: 16 }}>
                <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 20 : 12 }}>
                  {/* Left: Item info */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{f.item.name}</Text>
                      {f.trendDirection === 'up' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: CHIP_TONES.danger.bg, borderRadius: 9999, paddingHorizontal: 6, paddingVertical: 1 }}>
                          <TrendingUp size={9} color={CHIP_TONES.danger.fg} strokeWidth={2} />
                          <Text style={{ fontSize: 9, fontWeight: '700', color: CHIP_TONES.danger.fg }}>Artiyor</Text>
                        </View>
                      )}
                      {f.trendDirection === 'down' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: CHIP_TONES.success.bg, borderRadius: 9999, paddingHorizontal: 6, paddingVertical: 1 }}>
                          <TrendingDown size={9} color={CHIP_TONES.success.fg} strokeWidth={2} />
                          <Text style={{ fontSize: 9, fontWeight: '700', color: CHIP_TONES.success.fg }}>Azaliyor</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                        Stok: <Text style={{ fontWeight: '600', color: DS.ink[800] }}>{f.item.quantity} {f.item.unit || 'adet'}</Text>
                      </Text>
                      <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                        Gunluk tuketim: <Text style={{ fontWeight: '600', color: DS.ink[800] }}>{f.dailyRate.toFixed(1)}</Text>
                      </Text>
                    </View>
                    {f.upcomingNeed > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <ShoppingCart size={11} color={CHIP_TONES.info.fg} strokeWidth={1.6} />
                        <Text style={{ fontSize: 11, color: CHIP_TONES.info.fg }}>
                          Bekleyen siparisler icin tahmini ihtiyac: <Text style={{ fontWeight: '600' }}>{f.upcomingNeed.toFixed(1)}</Text>
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Middle: Mini sparkline (4 weeks) */}
                  <View style={{ width: isDesktop ? 100 : undefined, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, color: DS.ink[400], marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' }}>Haftalik Tuketim</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 32 }}>
                      {f.weeklyTrend.map((w, idx) => (
                        <View key={idx} style={{
                          width: 14,
                          height: Math.max((w / maxWeekly) * 28, 2),
                          borderRadius: 3,
                          backgroundColor: idx === 3 ? riskColor : DS.ink[200],
                        }} />
                      ))}
                    </View>
                  </View>

                  {/* Right: Depletion badge */}
                  <View style={{ alignItems: isDesktop ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
                    <View style={{
                      backgroundColor: riskBg,
                      borderRadius: 14,
                      paddingHorizontal: 14, paddingVertical: 8,
                      alignItems: 'center',
                      minWidth: 100,
                    }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: riskColor, letterSpacing: -0.3 }}>
                        {getRiskLabel(f.daysRemaining)}
                      </Text>
                      {f.depletionDate && (
                        <Text style={{ fontSize: 10, color: riskColor, opacity: 0.7, marginTop: 2 }}>
                          {f.depletionDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── CostTab ─────────────────────────────────────────────────────────────────

interface CostTabProps {
  items: StockItem[];
  accentColor: string;
}

function CostTab({ items, accentColor }: CostTabProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [priceHistory, setPriceHistory] = useState<{ item_id: string; item_name: string; unit_cost: number; created_at: string; quantity: number }[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'value' | 'cost' | 'name'>('value');

  // Load IN movements for price history
  useEffect(() => {
    (async () => {
      setHistLoading(true);
      const { data } = await supabase
        .from('stock_movements')
        .select('item_id, item_name, quantity, unit_cost_at_time, created_at')
        .eq('type', 'IN')
        .order('created_at', { ascending: true });
      if (data) {
        setPriceHistory(
          (data as any[]).filter(d => d.unit_cost_at_time != null && d.unit_cost_at_time > 0).map(d => ({
            item_id: d.item_id,
            item_name: d.item_name ?? '',
            unit_cost: Number(d.unit_cost_at_time),
            created_at: d.created_at,
            quantity: Number(d.quantity ?? 0),
          }))
        );
      }
      setHistLoading(false);
    })();
  }, []);

  // Compute cost metrics
  const costData = useMemo(() => {
    const rows = items.map(item => {
      const cost = Number(item.unit_cost ?? 0);
      const totalValue = cost * item.quantity;
      // Price history for this item
      const hist = priceHistory.filter(h => h.item_id === item.id);
      const prevCost = hist.length >= 2 ? hist[hist.length - 2].unit_cost : null;
      const costChange = prevCost != null && prevCost > 0 ? ((cost - prevCost) / prevCost) * 100 : null;
      return { ...item, totalValue, costChange, historyCount: hist.length };
    });

    // Sort
    if (sortBy === 'value')     rows.sort((a, b) => b.totalValue - a.totalValue);
    else if (sortBy === 'cost') rows.sort((a, b) => (b.unit_cost ?? 0) - (a.unit_cost ?? 0));
    else                        rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    const totalStockValue = rows.reduce((sum, r) => sum + r.totalValue, 0);
    const avgUnitCost = rows.length > 0 ? rows.reduce((s, r) => s + (r.unit_cost ?? 0), 0) / rows.length : 0;
    const highestValueItem = rows[0] ?? null;
    const costIncreased = rows.filter(r => r.costChange != null && r.costChange > 0).length;

    return { rows, totalStockValue, avgUnitCost, highestValueItem, costIncreased };
  }, [items, priceHistory, sortBy]);

  // Selected item price history for mini chart
  const selectedHistory = useMemo(() => {
    if (!selectedItem) return [];
    return priceHistory.filter(h => h.item_id === selectedItem);
  }, [selectedItem, priceHistory]);

  const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <View style={{ gap: 16 }}>
      {/* KPI Cards */}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Toplam Stok Degeri', value: `${fmt(costData.totalStockValue)} TL`, icon: Layers, color: '#059669' },
          { label: 'Ort. Birim Maliyet', value: `${fmt(costData.avgUnitCost)} TL`, icon: BarChart3, color: '#6366F1' },
          { label: 'Fiyat Artan Urun', value: String(costData.costIncreased), icon: TrendingUp, color: '#D97706' },
          { label: 'Fiyat Gecmisi', value: `${priceHistory.length} kayit`, icon: Clock, color: '#0EA5E9' },
        ].map(kpi => {
          const KIcon = kpi.icon;
          return (
            <View key={kpi.label} style={{ ...cardSolid, flex: 1, minWidth: isDesktop ? 160 : 140, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: kpi.color + '14', alignItems: 'center', justifyContent: 'center' }}>
                <KIcon size={18} color={kpi.color} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.3 }} numberOfLines={1}>{kpi.value}</Text>
                <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{kpi.label}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Sort pills */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 12, color: DS.ink[400], marginRight: 4 }}>Sirala:</Text>
        {([
          { key: 'value' as const, label: 'Deger' },
          { key: 'cost' as const, label: 'Birim Maliyet' },
          { key: 'name' as const, label: 'Ad' },
        ]).map(s => (
          <Pressable
            key={s.key}
            onPress={() => setSortBy(s.key)}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999,
              backgroundColor: sortBy === s.key ? DS.ink[900] : 'transparent',
              borderWidth: sortBy === s.key ? 0 : 1, borderColor: DS.ink[300],
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: sortBy === s.key ? '700' : '500', color: sortBy === s.key ? '#FFF' : DS.ink[500] }}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Cost Table */}
      <View style={tableCard}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 10,
          backgroundColor: '#FAFAFA',
          borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
        }}>
          <Text style={{ ...colHeader, flex: 1 }}>URUN</Text>
          {isDesktop && <Text style={{ ...colHeader, width: 100 }}>KATEGORI</Text>}
          <Text style={{ ...colHeader, width: 100, textAlign: 'right' }}>BIRIM MALIYET</Text>
          <Text style={{ ...colHeader, width: 80, textAlign: 'right' }}>MIKTAR</Text>
          <Text style={{ ...colHeader, width: 110, textAlign: 'right' }}>TOPLAM DEGER</Text>
          {isDesktop && <Text style={{ ...colHeader, width: 80, textAlign: 'center' }}>DEGISIM</Text>}
        </View>

        {/* Rows */}
        {costData.rows.map(item => (
          <Pressable
            key={item.id}
            onPress={() => setSelectedItem(selectedItem === item.id ? null : item.id)}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 16, paddingVertical: 10,
              borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
              backgroundColor: selectedItem === item.id ? 'rgba(99,102,241,0.04)' : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }} numberOfLines={1}>{item.name}</Text>
              {item.brand && <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: 1 }}>{item.brand}</Text>}
            </View>
            {isDesktop && (
              <Text style={{ width: 100, fontSize: 12, color: DS.ink[500] }} numberOfLines={1}>{item.category || '—'}</Text>
            )}
            <Text style={{ width: 100, textAlign: 'right', fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
              {item.unit_cost != null && item.unit_cost > 0 ? `${fmt(item.unit_cost)}` : '—'}
            </Text>
            <Text style={{ width: 80, textAlign: 'right', fontSize: 13, color: DS.ink[700] }}>
              {item.quantity} {item.unit || ''}
            </Text>
            <Text style={{ width: 110, textAlign: 'right', fontSize: 13, fontWeight: '700', color: item.totalValue > 0 ? '#059669' : DS.ink[400] }}>
              {item.totalValue > 0 ? `${fmt(item.totalValue)} TL` : '—'}
            </Text>
            {isDesktop && (
              <View style={{ width: 80, alignItems: 'center' }}>
                {item.costChange != null ? (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 3,
                    borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2,
                    backgroundColor: item.costChange > 0 ? CHIP_TONES.danger.bg : item.costChange < 0 ? CHIP_TONES.success.bg : DS.ink[100],
                  }}>
                    {item.costChange > 0
                      ? <TrendingUp size={10} color={CHIP_TONES.danger.fg} strokeWidth={2} />
                      : item.costChange < 0
                        ? <TrendingDown size={10} color={CHIP_TONES.success.fg} strokeWidth={2} />
                        : null
                    }
                    <Text style={{
                      fontSize: 10, fontWeight: '700',
                      color: item.costChange > 0 ? CHIP_TONES.danger.fg : item.costChange < 0 ? CHIP_TONES.success.fg : DS.ink[500],
                    }}>
                      {item.costChange > 0 ? '+' : ''}{item.costChange.toFixed(1)}%
                    </Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 10, color: DS.ink[300] }}>—</Text>
                )}
              </View>
            )}
          </Pressable>
        ))}

        {/* Totals Footer */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: '#FAFAFA',
          borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
        }}>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>TOPLAM</Text>
          {isDesktop && <View style={{ width: 100 }} />}
          <View style={{ width: 100 }} />
          <Text style={{ width: 80, textAlign: 'right', fontSize: 13, fontWeight: '600', color: DS.ink[700] }}>
            {items.length} urun
          </Text>
          <Text style={{ width: 110, textAlign: 'right', fontSize: 14, fontWeight: '800', color: '#059669' }}>
            {fmt(costData.totalStockValue)} TL
          </Text>
          {isDesktop && <View style={{ width: 80 }} />}
        </View>
      </View>

      {/* Price History Detail — when an item is selected */}
      {selectedItem && selectedHistory.length > 0 && (
        <View style={cardSolid}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Clock size={16} color="#6366F1" strokeWidth={1.6} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>
              Fiyat Gecmisi — {items.find(i => i.id === selectedItem)?.name ?? ''}
            </Text>
            <Pressable onPress={() => setSelectedItem(null)} style={{ marginLeft: 'auto', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}>
              <X size={14} color={DS.ink[400]} strokeWidth={1.6} />
            </Pressable>
          </View>

          {/* Mini price history bar chart */}
          <View style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginBottom: 14 }}>
            {(() => {
              const maxCost = Math.max(...selectedHistory.map(h => h.unit_cost), 1);
              return selectedHistory.slice(-20).map((h, idx) => {
                const barH = Math.max((h.unit_cost / maxCost) * 100, 4);
                return (
                  <View key={idx} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 120 }}>
                    <View style={{
                      width: '80%', height: barH, borderRadius: 4,
                      backgroundColor: '#6366F1',
                      minWidth: 6,
                    }} />
                    <Text style={{ fontSize: 8, color: DS.ink[400], marginTop: 3 }} numberOfLines={1}>
                      {new Date(h.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}
                    </Text>
                  </View>
                );
              });
            })()}
          </View>

          {/* History table */}
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FAFAFA' }}>
              <Text style={{ ...colHeader, flex: 1 }}>TARIH</Text>
              <Text style={{ ...colHeader, width: 80, textAlign: 'right' }}>MIKTAR</Text>
              <Text style={{ ...colHeader, width: 100, textAlign: 'right' }}>BIRIM FIYAT</Text>
              <Text style={{ ...colHeader, width: 100, textAlign: 'right' }}>TOPLAM</Text>
            </View>
            {selectedHistory.slice().reverse().slice(0, 20).map((h, idx) => (
              <View key={idx} style={{
                flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
                borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
              }}>
                <Text style={{ flex: 1, fontSize: 12, color: DS.ink[700] }}>
                  {new Date(h.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </Text>
                <Text style={{ width: 80, textAlign: 'right', fontSize: 12, color: DS.ink[700] }}>{h.quantity}</Text>
                <Text style={{ width: 100, textAlign: 'right', fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>{fmt(h.unit_cost)} TL</Text>
                <Text style={{ width: 100, textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#059669' }}>{fmt(h.unit_cost * h.quantity)} TL</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── LocationsTab ────────────────────────────────────────────────────────────

interface LocationsTabProps {
  items: StockItem[];
  accentColor: string;
  onEditProduct: (item: StockItem) => void;
}

function LocationsTab({ items, accentColor, onEditProduct }: LocationsTabProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [locSearch, setLocSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [expandedLoc, setExpandedLoc] = useState<Set<string>>(new Set());

  // Group items by location
  const locationGroups = useMemo(() => {
    const q = locSearch.trim().toLowerCase();
    const filtered = items.filter(i => {
      if (!q) return true;
      return (i.location ?? '').toLowerCase().includes(q)
        || i.name.toLowerCase().includes(q)
        || (i.barcode ?? '').toLowerCase().includes(q);
    });

    const map = new Map<string, StockItem[]>();
    for (const item of filtered) {
      const loc = item.location?.trim() || '__unassigned__';
      if (!map.has(loc)) map.set(loc, []);
      map.get(loc)!.push(item);
    }
    // Sort: assigned locations first alphabetically, unassigned last
    return Array.from(map).sort(([a], [b]) => {
      if (a === '__unassigned__') return 1;
      if (b === '__unassigned__') return -1;
      return a.localeCompare(b, 'tr');
    });
  }, [items, locSearch]);

  const assignedCount = items.filter(i => i.location?.trim()).length;
  const unassignedCount = items.filter(i => !i.location?.trim()).length;
  const uniqueLocations = new Set(items.map(i => i.location?.trim()).filter(Boolean)).size;
  const barcodeCount = items.filter(i => i.barcode?.trim()).length;

  const toggleLoc = (key: string) =>
    setExpandedLoc(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const copyBarcode = (code: string) => {
    if (Platform.OS === 'web') {
      try { navigator.clipboard.writeText(code); } catch {}
    }
  };

  return (
    <View style={{ gap: 16 }}>
      {/* KPI cards */}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Lokasyon', value: String(uniqueLocations), icon: MapPin, color: '#6366F1' },
          { label: 'Konumlu Urun', value: String(assignedCount), icon: Package, color: '#059669' },
          { label: 'Konumsuz Urun', value: String(unassignedCount), icon: AlertTriangle, color: unassignedCount > 0 ? '#D97706' : '#9CA3AF' },
          { label: 'Barkodlu', value: String(barcodeCount), icon: QrCode, color: '#0EA5E9' },
        ].map(kpi => {
          const KIcon = kpi.icon;
          return (
            <View key={kpi.label} style={{ ...cardSolid, flex: 1, minWidth: isDesktop ? 150 : 140, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: kpi.color + '14', alignItems: 'center', justifyContent: 'center' }}>
                <KIcon size={18} color={kpi.color} strokeWidth={1.6} />
              </View>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.3 }}>{kpi.value}</Text>
                <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{kpi.label}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Toolbar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 12, height: 44,
        }}>
          <Search size={15} color={DS.ink[400]} strokeWidth={1.6} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: DS.ink[900], height: 44, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) } as any}
            value={locSearch}
            onChangeText={setLocSearch}
            placeholder="Lokasyon, urun veya barkod ara..."
            placeholderTextColor={DS.ink[400]}
          />
          {locSearch.length > 0 && (
            <Pressable onPress={() => setLocSearch('')} hitSlop={8} style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}>
              <X size={14} color={DS.ink[400]} strokeWidth={1.6} />
            </Pressable>
          )}
        </View>
        {isDesktop && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['grid', 'table'] as const).map(m => (
              <Pressable
                key={m}
                onPress={() => setViewMode(m)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999,
                  backgroundColor: viewMode === m ? DS.ink[900] : 'transparent',
                  borderWidth: viewMode === m ? 0 : 1, borderColor: DS.ink[300],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: viewMode === m ? '700' : '500', color: viewMode === m ? '#FFF' : DS.ink[500] }}>
                  {m === 'grid' ? 'Grid' : 'Tablo'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <View style={{ gap: 12 }}>
          {locationGroups.length === 0 ? (
            <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 48, gap: 12 }}>
              <MapPin size={36} color={DS.ink[200]} strokeWidth={1.2} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[800] }}>Lokasyon bulunamadi</Text>
              <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center', maxWidth: 280 }}>
                {'Urunlere lokasyon atamak icin urun duzenle ekranindan "Lokasyon / Raf" alanini doldurun.'}
              </Text>
            </View>
          ) : locationGroups.map(([loc, locItems]) => {
            const isUnassigned = loc === '__unassigned__';
            const label = isUnassigned ? 'Konumu Belirsiz' : loc;
            const expanded = expandedLoc.has(loc) || locationGroups.length <= 3;
            const criticalInLoc = locItems.filter(i => i.quantity > 0 && i.quantity < i.min_quantity).length;
            const emptyInLoc = locItems.filter(i => i.quantity === 0).length;

            return (
              <View key={loc} style={cardSolid}>
                {/* Location header */}
                <Pressable
                  onPress={() => toggleLoc(loc)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: expanded ? 14 : 0, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                >
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: isUnassigned ? DS.ink[100] : '#6366F114',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isUnassigned
                      ? <AlertTriangle size={16} color={DS.ink[400]} strokeWidth={1.6} />
                      : <MapPin size={16} color="#6366F1" strokeWidth={1.6} />
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>{label}</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                      <Text style={{ fontSize: 11, color: DS.ink[400] }}>{locItems.length} urun</Text>
                      {criticalInLoc > 0 && (
                        <Text style={{ fontSize: 11, color: CHIP_TONES.warning.fg }}>{criticalInLoc} kritik</Text>
                      )}
                      {emptyInLoc > 0 && (
                        <Text style={{ fontSize: 11, color: CHIP_TONES.danger.fg }}>{emptyInLoc} tukendi</Text>
                      )}
                    </View>
                  </View>
                  {expanded
                    ? <ChevronUp size={16} color={DS.ink[400]} strokeWidth={1.6} />
                    : <ChevronDown size={16} color={DS.ink[400]} strokeWidth={1.6} />
                  }
                </Pressable>

                {/* Items in this location */}
                {expanded && (
                  <View style={{ gap: 0 }}>
                    {locItems.map((item, idx) => {
                      const pct = item.min_quantity > 0 ? item.quantity / item.min_quantity : 1;
                      const statusTone = item.quantity === 0 ? 'danger' : pct < 1 ? 'warning' : 'success';
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => onEditProduct(item)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 12,
                            paddingVertical: 10,
                            borderTopWidth: idx > 0 ? 1 : 0,
                            borderTopColor: 'rgba(0,0,0,0.04)',
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{item.name}</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                              {item.category && (
                                <Text style={{ fontSize: 10, color: DS.ink[400] }}>{item.category}</Text>
                              )}
                              {item.barcode && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                  <QrCode size={9} color={DS.ink[400]} strokeWidth={1.6} />
                                  <Text style={{ fontSize: 10, color: DS.ink[400], fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>{item.barcode}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>
                              {item.quantity} <Text style={{ fontSize: 11, fontWeight: '400', color: DS.ink[400] }}>{item.unit || 'adet'}</Text>
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <StockBar quantity={item.quantity} min={item.min_quantity} />
                              <StatusBadge quantity={item.quantity} min={item.min_quantity} />
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        /* Table View */
        <View style={tableCard}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 10,
            backgroundColor: '#FAFAFA',
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
          }}>
            <Text style={{ ...colHeader, width: 120 }}>LOKASYON</Text>
            <Text style={{ ...colHeader, flex: 1 }}>URUN</Text>
            <Text style={{ ...colHeader, width: 100 }}>KATEGORI</Text>
            <Text style={{ ...colHeader, width: 130 }}>BARKOD</Text>
            <Text style={{ ...colHeader, width: 90, textAlign: 'right' }}>MIKTAR</Text>
            <Text style={{ ...colHeader, width: 80, textAlign: 'center' }}>DURUM</Text>
          </View>

          {/* Rows */}
          {locationGroups.flatMap(([loc, locItems]) =>
            locItems.map((item, idx) => (
              <Pressable
                key={item.id}
                onPress={() => onEditProduct(item)}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 16, paddingVertical: 10,
                  borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }}
              >
                <View style={{ width: 120, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={12} color={loc === '__unassigned__' ? DS.ink[300] : '#6366F1'} strokeWidth={1.6} />
                  <Text style={{ fontSize: 12, color: loc === '__unassigned__' ? DS.ink[400] : DS.ink[800], fontWeight: '500' }} numberOfLines={1}>
                    {loc === '__unassigned__' ? '—' : loc}
                  </Text>
                </View>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: DS.ink[900] }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ width: 100, fontSize: 12, color: DS.ink[500] }} numberOfLines={1}>{item.category || '—'}</Text>
                <View style={{ width: 130, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {item.barcode ? (
                    <>
                      <Text style={{ fontSize: 11, color: DS.ink[500], fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }} numberOfLines={1}>
                        {item.barcode}
                      </Text>
                      <Pressable
                        onPress={(e) => { e.stopPropagation?.(); copyBarcode(item.barcode!); }}
                        hitSlop={6}
                        style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}
                      >
                        <Copy size={11} color={DS.ink[400]} strokeWidth={1.6} />
                      </Pressable>
                    </>
                  ) : (
                    <Text style={{ fontSize: 11, color: DS.ink[300] }}>—</Text>
                  )}
                </View>
                <Text style={{ width: 90, textAlign: 'right', fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                  {item.quantity} {item.unit || ''}
                </Text>
                <View style={{ width: 80, alignItems: 'center' }}>
                  <StatusBadge quantity={item.quantity} min={item.min_quantity} />
                </View>
              </Pressable>
            ))
          )}
          {locationGroups.length === 0 && (
            <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
              <MapPin size={28} color={DS.ink[200]} strokeWidth={1.2} />
              <Text style={{ fontSize: 13, color: DS.ink[400] }}>Sonuc bulunamadi</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Tab Definitions (Patterns — icon + accent per panel) ───────────────────

import { HubContext } from '../../../core/ui/HubContext';
import { Settings } from 'lucide-react-native';

interface StockTabDef {
  key:    TabKey;
  label:  string;
  icon:   React.ComponentType<any>;
  accent: string;
  hint:   string;
}

const STOCK_TABS: StockTabDef[] = [
  { key: 'dashboard',   label: 'Dashboard',     icon: Grid3x3,       accent: '#0F172A', hint: 'Genel bakis, ozet ve kritik durumlar'        },
  { key: 'list',        label: 'Urunler',       icon: Package,       accent: '#2563EB', hint: 'Urun listesi, kategori ve stok seviyeleri'   },
  { key: 'movements',   label: 'Hareketler',    icon: ArrowLeftRight,accent: '#6366F1', hint: 'Giris, cikis ve fire hareketleri'            },
  { key: 'suggestions', label: 'Siparis Oner',  icon: ShoppingCart,  accent: '#D97706', hint: 'Kritik stoklar icin otomatik siparis onerisi' },
  { key: 'analytics',   label: 'Analiz',        icon: BarChart3,     accent: '#0EA5E9', hint: 'Tuketim ve fire analizi'                     },
  { key: 'locations',   label: 'Lokasyon',      icon: MapPin,        accent: '#8B5CF6', hint: 'Raf, bolum ve barkod yonetimi'               },
  { key: 'cost',        label: 'Maliyet',       icon: Layers,        accent: '#059669', hint: 'Stok degeri ve fiyat gecmisi'                },
  { key: 'forecast',    label: 'Tahmin',        icon: TrendingUp,    accent: '#DC2626', hint: 'Tuketim hizina gore bitis tahmini'           },
  { key: 'settings',    label: 'Ayarlar',       icon: Settings,      accent: '#6B7280', hint: 'Kategori, marka ve genel yapilandirma'       },
];

const SIDEBAR_ACCENT = '#F5C24B';

// ─── StockScreen (Patterns Hub — sidebar + per-tab accent) ──────────────────

export function StockScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { setTitle, clear } = usePageTitleStore();

  useEffect(() => {
    setTitle('Stok & Depo', '');
    return clear;
  }, []);

  const [tab, setTab] = useState<TabKey>('dashboard');
  const activeTab = STOCK_TABS.find(t => t.key === tab)!;
  const accentColor = activeTab.accent;

  const [items, setItems]               = useState<StockItem[]>([]);
  const [wasteMap, setWasteMap]         = useState<Record<string, { qty: number; cost: number }>>({});
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [tableExists, setTableExists]   = useState(true);
  const [brands, setBrands]               = useState<string[]>([]);
  const [dbCategories, setDbCategories]   = useState<string[]>([]);

  const [search, setSearch]             = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchFocused, setSearchFocused]   = useState(false);

  const [showFilter, setShowFilter]     = useState(false);
  const [wasteOpen, setWasteOpen]       = useState(false);
  const { profile: authProfile }        = useAuthStore();
  const labId = (authProfile as any)?.lab_id ?? authProfile?.id ?? null;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [catFilter, setCatFilter]       = useState('all');
  const [brandFilter, setBrandFilter]   = useState('all');
  const [usageFilter, setUsageFilter]   = useState<'all' | 'production' | 'office' | 'misc'>('all');
  const [draftStatus, setDraftStatus]   = useState<StatusFilter>('all');
  const [draftCat, setDraftCat]         = useState('all');
  const [draftBrand, setDraftBrand]     = useState('all');
  const [draftUsage, setDraftUsage]     = useState<'all' | 'production' | 'office' | 'misc'>('all');

  const [productModal, setProductModal] = useState<{ visible: boolean; item: StockItem | null }>({ visible: false, item: null });
  const [movModal, setMovModal]         = useState<{ visible: boolean; item: StockItem | null; defaultType?: MovType }>({ visible: false, item: null });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const sinceISO = since.toISOString();

      const [itemsRes, brandsRes, catsRes, wasteRes] = await Promise.all([
        supabase.from('stock_items').select('*').order('name'),
        supabase.from('brands').select('name').order('name'),
        supabase.from('categories').select('name').order('name'),
        supabase
          .from('stock_movements')
          .select('item_id, quantity, unit_cost_at_time')
          .eq('type', 'WASTE')
          .gte('created_at', sinceISO),
      ]);
      if (itemsRes.error) {
        if (itemsRes.error.code === '42P01' || itemsRes.error.message?.includes('does not exist')) setTableExists(false);
        setItems([]);
      } else {
        setTableExists(true);
        setItems((itemsRes.data ?? []) as StockItem[]);
      }
      try { if (!brandsRes.error && brandsRes.data) setBrands(brandsRes.data.map((b: any) => b.name)); } catch {}
      try { if (!catsRes.error && catsRes.data)   setDbCategories(catsRes.data.map((c: any) => c.name)); } catch {}

      const wm: Record<string, { qty: number; cost: number }> = {};
      for (const m of ((wasteRes.data ?? []) as any[])) {
        if (!m.item_id) continue;
        if (!wm[m.item_id]) wm[m.item_id] = { qty: 0, cost: 0 };
        wm[m.item_id].qty  += Number(m.quantity ?? 0);
        wm[m.item_id].cost += Number(m.quantity ?? 0) * Number(m.unit_cost_at_time ?? 0);
      }
      setWasteMap(wm);
    } catch { setItems([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel('stock_screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_items' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const categories = ['all', ...Array.from(new Set(items.map(i => i.category).filter(Boolean) as string[])).sort()];

  const q = search.trim().toLowerCase();
  const filtered = items.filter(item => {
    if (q && !item.name.toLowerCase().includes(q) && !item.category?.toLowerCase().includes(q) && !item.brand?.toLowerCase().includes(q) && !(item.type ?? '').toLowerCase().includes(q)) return false;
    if (catFilter !== 'all' && item.category !== catFilter) return false;
    if (brandFilter !== 'all' && item.brand !== brandFilter) return false;
    if (usageFilter !== 'all' && (item.usage_category ?? 'misc') !== usageFilter) return false;
    const pct = item.min_quantity > 0 ? item.quantity / item.min_quantity : 1;
    if (statusFilter === 'critical') return pct < 1 && item.quantity > 0;
    if (statusFilter === 'ok')       return pct >= 1;
    if (statusFilter === 'empty')    return item.quantity === 0;
    return true;
  });

  const normalCount   = items.filter(i => i.quantity >= i.min_quantity).length;
  const criticalCount = items.filter(i => i.quantity > 0 && i.quantity < i.min_quantity).length;
  const emptyCount    = items.filter(i => i.quantity === 0).length;
  const total         = items.length;
  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (catFilter !== 'all' ? 1 : 0) +
    (brandFilter !== 'all' ? 1 : 0) +
    (usageFilter !== 'all' ? 1 : 0);

  // Grouped view
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const groups: [string, StockItem[]][] = Array.from(
    filtered.reduce((map, item) => {
      const key = item.category || '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
      return map;
    }, new Map<string, StockItem[]>())
  ).sort(([a], [b]) => {
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return a.localeCompare(b, 'tr');
  });

  const openFilter = () => { setDraftStatus(statusFilter); setDraftCat(catFilter); setDraftBrand(brandFilter); setDraftUsage(usageFilter); setShowFilter(true); };
  const applyFilter = () => { setStatusFilter(draftStatus); setCatFilter(draftCat); setBrandFilter(draftBrand); setUsageFilter(draftUsage); setShowFilter(false); };

  // ── CTA button config ──
  const showCta = tab === 'dashboard' || tab === 'list' || tab === 'movements';
  const ctaLabel = tab === 'movements' ? 'Yeni Hareket' : 'Yeni Urun';
  const ctaAction = () => {
    if (tab === 'movements') setMovModal({ visible: true, item: null });
    else setProductModal({ visible: true, item: null });
  };

  // ── Tab content renderer ──
  const renderContent = () => {
    if (tab === 'settings') return <StockSettings accentColor={accentColor} onReload={load} />;
    if (tab === 'dashboard') return loading
      ? <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
      : <StockDashboard items={items} accentColor={accentColor} onMovement={(item, dt) => setMovModal({ visible: true, item, defaultType: dt })} onAddProduct={() => setProductModal({ visible: true, item: null })} onEditProduct={item => setProductModal({ visible: true, item })} />;
    if (tab === 'movements') return <StockMovementsScreen accentColor={accentColor} />;
    if (tab === 'suggestions') return loading
      ? <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
      : <SuggestionsTab items={items} accentColor={accentColor} onMovement={(item, dt) => setMovModal({ visible: true, item, defaultType: dt })} />;
    if (tab === 'analytics') return <AnalyticsTab accentColor={accentColor} />;
    if (tab === 'locations') return loading
      ? <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
      : <LocationsTab items={items} accentColor={accentColor} onEditProduct={item => setProductModal({ visible: true, item })} />;
    if (tab === 'cost') return loading
      ? <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
      : <CostTab items={items} accentColor={accentColor} />;
    if (tab === 'forecast') return loading
      ? <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
      : <ForecastTab items={items} accentColor={accentColor} />;

    // list tab (default)
    if (loading) return <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />;
    if (!tableExists) return (
      <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
        <DatabaseZap size={40} color={DS.ink[200]} strokeWidth={1.2} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>Stok modulu kurulmadi</Text>
        <Text style={{ fontSize: 13, color: DS.ink[400] }}>{'Supabase\'de "stock_items" tablosu olusturuldugunda veriler gorunur.'}</Text>
      </View>
    );

    return (
      <>
        {/* Toolbar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {searchExpanded || search.length > 0 ? (
            <View style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1,
              borderColor: searchFocused ? accentColor : 'rgba(0,0,0,0.05)',
              paddingHorizontal: 12, height: 44,
              ...(Platform.OS === 'web' ? { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } : {}),
            }}>
              <Search size={15} color={searchFocused ? accentColor : DS.ink[400]} strokeWidth={1.6} />
              <TextInput
                autoFocus
                style={{ flex: 1, fontSize: 14, color: DS.ink[900], height: 44, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) } as any}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => { setSearchFocused(false); if (!search) setSearchExpanded(false); }}
                placeholder="Urun ara..."
                placeholderTextColor={DS.ink[400]}
              />
              <Pressable onPress={() => { setSearch(''); setSearchExpanded(false); }} hitSlop={8} style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}>
                <X size={14} color={DS.ink[400]} strokeWidth={1.6} />
              </Pressable>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <Pressable
            onPress={() => setSearchExpanded(true)}
            style={{
              width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: searchExpanded || search.length > 0 ? accentColor + '14' : '#FFFFFF',
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            }}
          >
            <Search size={20} color={searchExpanded || search.length > 0 ? accentColor : DS.ink[500]} strokeWidth={1.6} />
          </Pressable>

          <Pressable
            onPress={openFilter}
            style={{
              width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              position: 'relative',
              backgroundColor: activeFilterCount > 0 ? accentColor + '14' : '#FFFFFF',
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            }}
          >
            <Filter size={20} color={activeFilterCount > 0 ? accentColor : DS.ink[500]} strokeWidth={1.6} />
            {activeFilterCount > 0 && (
              <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, backgroundColor: accentColor }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => setWasteOpen(true)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, height: 44,
              borderRadius: 14,
              backgroundColor: CHIP_TONES.danger.bg, borderWidth: 1, borderColor: 'rgba(217,75,75,0.2)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            }}
          >
            <Flame size={14} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: CHIP_TONES.danger.fg }}>Fire Bildir</Text>
          </Pressable>
        </View>

        {/* Table */}
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
            {total === 0
              ? <Package size={36} color={DS.ink[200]} strokeWidth={1.2} />
              : <Search size={36} color={DS.ink[200]} strokeWidth={1.2} />
            }
            <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>
              {total === 0 ? 'Henuz urun eklenmemis' : 'Sonuc bulunamadi'}
            </Text>
            <Text style={{ fontSize: 13, color: DS.ink[400] }}>
              {total === 0 ? '"Yeni Urun" butonuna tiklayin' : 'Arama veya filtre kriterlerini degistirin'}
            </Text>
          </View>
        ) : (
          <>
            <View style={{
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12,
              backgroundColor: '#FAFAFA', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', marginBottom: 8,
            }}>
              <Text style={{ ...colHeader, flex: 2.8 }}>URUN ADI</Text>
              {isDesktop && <Text style={{ ...colHeader, flex: 2.2 }}>STOK SEVIYESI</Text>}
              <Text style={{ ...colHeader, flex: 1, textAlign: 'center' }}>MIKTAR</Text>
              <Text style={{ ...colHeader, flex: 1.2, textAlign: 'center' }}>DURUM</Text>
              <View style={{ width: 76 }} />
            </View>

            {groups.map(([groupKey, groupItems]) => {
              const label      = groupKey === '__none__' ? 'Kategorisiz' : groupKey;
              const collapsed  = collapsedGroups.has(groupKey);
              const groupCrit  = groupItems.filter(i => i.quantity < i.min_quantity).length;

              return (
                <View key={groupKey} style={{ ...tableCard, marginBottom: 12 }}>
                  <Pressable
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 14, paddingVertical: 12,
                      backgroundColor: DS.ink[50],
                      borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    }}
                    onPress={() => toggleGroup(groupKey)}
                  >
                    {collapsed
                      ? <ChevronRight size={15} color={DS.ink[400]} strokeWidth={1.6} />
                      : <ChevronDown size={15} color={DS.ink[400]} strokeWidth={1.6} />
                    }
                    <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900], flex: 1 }}>{label}</Text>
                    <View style={{ backgroundColor: DS.ink[100], borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[500] }}>{groupItems.length}</Text>
                    </View>
                    {groupCrit > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: CHIP_TONES.warning.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <AlertTriangle size={11} color={CHIP_TONES.warning.fg} strokeWidth={1.6} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: CHIP_TONES.warning.fg }}>{groupCrit} kritik</Text>
                      </View>
                    )}
                  </Pressable>

                  {!collapsed && groupItems.map((item, idx) => {
                    const isCritical = item.quantity < item.min_quantity;
                    const isEmpty    = item.quantity === 0;
                    const isLast     = idx === groupItems.length - 1;
                    const dotColor   = isEmpty ? CHIP_TONES.danger.fg : isCritical ? CHIP_TONES.warning.fg : CHIP_TONES.success.fg;

                    return (
                      <View key={item.id} style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingLeft: 0, paddingRight: 16, paddingVertical: 9, minHeight: 42,
                        ...(!isLast ? { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' } : {}),
                      }}>
                        <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: 6, marginRight: 0, backgroundColor: dotColor }} />

                        <View style={{ flex: 2.8, flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900], letterSpacing: -0.1 }} numberOfLines={1}>{item.name}</Text>
                              {item.usage_category === 'production' && (
                                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999, backgroundColor: 'rgba(124,58,237,0.1)' }}>
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#7C3AED', letterSpacing: 0.4 }}>URETIM</Text>
                                </View>
                              )}
                              {item.type && (
                                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999, backgroundColor: DS.ink[100] }}>
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: DS.ink[700], letterSpacing: 0.4 }}>{item.type.toUpperCase()}</Text>
                                </View>
                              )}
                              {(wasteMap[item.id]?.cost ?? 0) > 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999, backgroundColor: CHIP_TONES.danger.bg, borderWidth: 1, borderColor: 'rgba(217,75,75,0.2)' }}>
                                  <Flame size={8} color={CHIP_TONES.danger.fg} strokeWidth={2} />
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: CHIP_TONES.danger.fg, letterSpacing: 0.3 }}>{Math.round(wasteMap[item.id].cost).toLocaleString('tr-TR')} TL</Text>
                                </View>
                              )}
                            </View>
                            {(item.brand || item.unit || item.supplier || item.units_per_tooth) && (
                              <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
                                {[item.brand, item.unit, item.supplier, item.units_per_tooth ? `${item.units_per_tooth}/dis -> ${item.consume_at_stage ?? 'MILLING'}` : null].filter(Boolean).join(' - ')}
                              </Text>
                            )}
                          </View>
                        </View>
                        {isDesktop && (
                          <View style={{ flex: 2.2, paddingRight: 16, gap: 3 }}>
                            <StockBar quantity={item.quantity} min={item.min_quantity} />
                            <Text style={{ fontSize: 10, color: DS.ink[400], fontWeight: '500' }}>{item.quantity} / {item.min_quantity}{item.unit ? ` ${item.unit}` : ''}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, color: (isCritical || isEmpty) ? dotColor : DS.ink[700], fontWeight: (isCritical || isEmpty) ? '700' : '500' }}>{item.quantity}</Text>
                        </View>
                        <View style={{ flex: 1.2, alignItems: 'center' }}>
                          <StatusBadge quantity={item.quantity} min={item.min_quantity} />
                        </View>
                        <View style={{ width: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                          <Pressable
                            style={{ width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '14', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                            onPress={() => setMovModal({ visible: true, item })}
                          >
                            <ArrowLeftRight size={14} color={accentColor} strokeWidth={1.6} />
                          </Pressable>
                          <Pressable
                            style={{ width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.ink[50], ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                            onPress={() => setProductModal({ visible: true, item })}
                          >
                            <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}
      </>
    );
  };

  return (
    <View style={{ flex: 1 }}>

      {/* ── Mobile: Horizontal pill bar ─────────────────────────── */}
      {!isDesktop && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: DS.ink[50], borderRadius: 9999 }}>
              {STOCK_TABS.map(t => {
                const active = t.key === tab;
                const TabIcon = t.icon;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                      backgroundColor: active ? t.accent : 'transparent',
                    }}
                  >
                    <TabIcon
                      size={12}
                      strokeWidth={active ? 2.2 : 1.8}
                      color={active ? '#FFFFFF' : t.accent}
                    />
                    <Text style={{ fontSize: 11, fontWeight: active ? '700' : '600', color: active ? '#FFFFFF' : DS.ink[500] }}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Layout ──────────────────────────────────────────────── */}
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>

          {/* ── Desktop Sidebar ─────────────────────────────────── */}
          <View style={{ width: 220, paddingTop: 24, paddingBottom: 16 }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 2, paddingHorizontal: 10 }}
            >
              {STOCK_TABS.map(t => {
                const isActive = t.key === tab;
                const TabIcon = t.icon;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                      // @ts-ignore web
                      cursor: 'pointer',
                    }}
                  >
                    {isActive && (
                      <View
                        style={{
                          width: 3,
                          height: 16,
                          borderRadius: 2,
                          backgroundColor: t.accent,
                          marginLeft: -6,
                          marginRight: 4,
                        }}
                      />
                    )}
                    <View style={{
                      width: 28, height: 28, borderRadius: 8,
                      backgroundColor: isActive ? t.accent + '14' : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <TabIcon
                        size={15}
                        strokeWidth={isActive ? 2 : 1.6}
                        color={isActive ? t.accent : '#9A9A9A'}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? '600' : '400',
                        color: isActive ? '#0A0A0A' : '#6B6B6B',
                        flex: 1,
                      }}
                    >
                      {t.label}
                    </Text>
                    {isActive && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Desktop Content ──────────────────────────────────── */}
          <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            {/* Title bar */}
            <View style={{ paddingHorizontal: 28, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View>
                <Text
                  style={{
                    ...DISPLAY,
                    fontSize: 24,
                    letterSpacing: -0.5,
                    color: '#0A0A0A',
                    marginBottom: 4,
                  }}
                >
                  {activeTab.label}
                </Text>
                <Text style={{ fontSize: 13, color: '#9A9A9A', lineHeight: 19 }}>
                  {activeTab.hint}
                </Text>
              </View>
              {showCta && (
                <Pressable
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 16, paddingVertical: 8,
                    borderRadius: 9999, backgroundColor: accentColor,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  }}
                  onPress={ctaAction}
                >
                  <Plus size={15} color="#FFFFFF" strokeWidth={2} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{ctaLabel}</Text>
                </Pressable>
              )}
            </View>

            <HubContext.Provider value={true}>
              <ScrollView
                contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 60 }}
                showsVerticalScrollIndicator={false}
              >
                {renderContent()}
                <View style={{ height: 40 }} />
              </ScrollView>
            </HubContext.Provider>
          </View>
        </View>
      ) : (
        /* ── Mobile: full-width content ─────────────────────────── */
        <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 4 }}>
          {/* Mobile CTA */}
          {showCta && (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
              <Pressable
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 6,
                  borderRadius: 9999, backgroundColor: accentColor,
                }}
                onPress={ctaAction}
              >
                <Plus size={15} color="#FFFFFF" strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{ctaLabel}</Text>
              </Pressable>
            </View>
          )}
          <HubContext.Provider value={true}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}
            >
              {renderContent()}
              <View style={{ height: 40 }} />
            </ScrollView>
          </HubContext.Provider>
        </View>
      )}

      {/* ── Modals ──────────────────────────────────────────────── */}
      <ProductModal
        visible={productModal.visible}
        item={productModal.item}
        accentColor={accentColor}
        existingCategories={dbCategories}
        existingBrands={brands}
        onClose={() => setProductModal({ visible: false, item: null })}
        onSaved={load}
      />
      <MovementModal
        visible={movModal.visible}
        item={movModal.item}
        items={items}
        accentColor={accentColor}
        defaultType={movModal.defaultType}
        onClose={() => setMovModal({ visible: false, item: null })}
        onSaved={load}
      />
      {labId && authProfile && (
        <WasteReportModal
          visible={wasteOpen}
          labId={labId}
          userId={authProfile.id}
          onClose={() => setWasteOpen(false)}
          onSaved={() => load(true)}
        />
      )}

      {/* ── Filter Modal ────────────────────────────────────────── */}
      <Modal visible={showFilter} transparent animationType="fade" onRequestClose={() => setShowFilter(false)}>
        <Pressable style={modalOverlay} onPress={() => setShowFilter(false)}>
          <View style={{ ...modalSheet, maxWidth: 420, maxHeight: undefined }} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Filter size={15} color={accentColor} strokeWidth={1.6} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: DS.ink[900] }}>Filtrele</Text>
                {activeFilterCount > 0 && (
                  <View style={{ backgroundColor: accentColor, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{activeFilterCount}</Text>
                  </View>
                )}
              </View>
              <Pressable
                onPress={() => { setDraftStatus('all'); setDraftCat('all'); setDraftBrand('all'); setDraftUsage('all'); }}
                style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>Temizle</Text>
              </Pressable>
            </View>
            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />

            <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.8, textTransform: 'uppercase' }}>Durum</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {([
                  { value: 'all', label: 'Tumu' },
                  { value: 'ok', label: 'Normal' },
                  { value: 'critical', label: 'Kritik' },
                  { value: 'empty', label: 'Tukendi' },
                ] as const).map(it => {
                  const active = draftStatus === it.value;
                  return (
                    <Pressable
                      key={it.value}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, backgroundColor: active ? accentColor : DS.ink[100], ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                      onPress={() => setDraftStatus(it.value)}
                    >
                      <Text style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: active ? '#FFFFFF' : DS.ink[500] }}>{it.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />
            <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.8, textTransform: 'uppercase' }}>Kullanim</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {([
                  { value: 'all',        label: 'Tumu'    },
                  { value: 'production', label: 'Uretim'  },
                  { value: 'office',     label: 'Ofis'    },
                  { value: 'misc',       label: 'Diger'   },
                ] as const).map(it => {
                  const active = draftUsage === it.value;
                  return (
                    <Pressable
                      key={it.value}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, backgroundColor: active ? accentColor : DS.ink[100], ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                      onPress={() => setDraftUsage(it.value)}
                    >
                      <Text style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: active ? '#FFFFFF' : DS.ink[500] }}>{it.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {categories.length > 1 && (
              <>
                <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />
                <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.8, textTransform: 'uppercase' }}>Kategori</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {categories.map(cat => {
                      const active = draftCat === cat;
                      return (
                        <Pressable
                          key={cat}
                          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, backgroundColor: active ? accentColor : DS.ink[100], ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                          onPress={() => setDraftCat(cat)}
                        >
                          <Text style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: active ? '#FFFFFF' : DS.ink[500] }}>{cat === 'all' ? 'Tumu' : cat}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </>
            )}

            {brands.length > 0 && (
              <>
                <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />
                <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.8, textTransform: 'uppercase' }}>Marka</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(['all', ...brands]).map(b => {
                      const active = draftBrand === b;
                      return (
                        <Pressable
                          key={b}
                          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, backgroundColor: active ? accentColor : DS.ink[100], ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}
                          onPress={() => setDraftBrand(b)}
                        >
                          <Text style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: active ? '#FFFFFF' : DS.ink[500] }}>{b === 'all' ? 'Tumu' : b}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </>
            )}

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 20, paddingVertical: 16 }}>
              <Pressable style={ghostBtn} onPress={() => setShowFilter(false)}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[700] }}>Iptal</Text>
              </Pressable>
              <Pressable style={{ ...darkPillBtn, backgroundColor: accentColor }} onPress={applyFilter}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Uygula</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
