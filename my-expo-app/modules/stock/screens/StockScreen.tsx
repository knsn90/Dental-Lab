import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, useWindowDimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { supabase } from '../../../lib/supabase';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { IconBtn } from '../../../core/ui/IconBtn';
import { StockMovementsScreen } from './StockMovementsScreen';
import { WasteReportModal } from '../components/WasteReportModal';
import { useAuthStore } from '../../../core/store/authStore';

import { AppIcon } from '../../../core/ui/AppIcon';

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
  // ── Production-aware fields (Migration 052) ────────────────────────────
  type?: string | null;                  // zirconia / metal / emax / pmma / glaze / ...
  usage_category?: 'production' | 'office' | 'misc' | null;
  units_per_tooth?: number | null;       // null/0 = no auto-consume
  consume_at_stage?: string | null;      // default 'MILLING'
  unit_cost?: number | null;             // future cost tracking
}

const USAGE_CATEGORY_OPTIONS: { key: 'all' | 'production' | 'office' | 'misc'; label: string }[] = [
  { key: 'all',        label: 'Tümü'     },
  { key: 'production', label: 'Üretim'   },
  { key: 'office',     label: 'Ofis'     },
  { key: 'misc',       label: 'Diğer'    },
];

const STAGE_OPTIONS = ['TRIAGE', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC'];

type MovType = 'IN' | 'OUT' | 'WASTE';
type StatusFilter = 'all' | 'critical' | 'ok' | 'empty';

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ quantity, min }: { quantity: number; min: number }) {
  const pct = min > 0 ? quantity / min : 1;
  if (quantity === 0) return (
    <View style={[sb.pill, { backgroundColor: '#FEE2E2' }]}>
      <Text style={[sb.text, { color: '#DC2626' }]}>Tükendi</Text>
    </View>
  );
  if (pct < 1) return (
    <View style={[sb.pill, { backgroundColor: '#FEF3C7' }]}>
      <Text style={[sb.text, { color: '#D97706' }]}>Kritik</Text>
    </View>
  );
  return (
    <View style={[sb.pill, { backgroundColor: '#D1FAE5' }]}>
      <Text style={[sb.text, { color: '#059669' }]}>Normal</Text>
    </View>
  );
}
const sb = StyleSheet.create({
  pill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
});

// ─── StockBar ─────────────────────────────────────────────────────────────────

function StockBar({ quantity, min }: { quantity: number; min: number }) {
  const pct = min > 0 ? Math.min(quantity / min, 1) : 1;
  const barColor = pct === 0 ? '#EF4444' : pct < 1 ? '#F59E0B' : '#10B981';
  return (
    <View style={bar.track}>
      <View style={[bar.fill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { height: 4, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden', flex: 1, minWidth: 48 },
  fill:  { height: 4, borderRadius: 3 },
});

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
  // ── Production-aware fields (Migration 052/054) ───────────────────────
  const [matType, setMatType]             = useState('');             // zirconia/metal/...
  const [usageCategory, setUsageCategory] = useState<'production' | 'office' | 'misc'>('misc');
  const [unitsPerTooth, setUnitsPerTooth] = useState('');
  const [consumeStage, setConsumeStage]   = useState<string>('MILLING');
  const [unitCost, setUnitCost]           = useState('');
  const [consumptionType, setConsumptionType] = useState<'fixed' | 'per_tooth' | 'manual'>('manual');
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
      setError('');
    }
  }, [visible, item]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Ürün adı zorunlu'); return; }
    const qty = parseFloat(quantity);
    const min = parseFloat(minQty);
    if (isNaN(qty) || qty < 0) { setError('Geçerli bir miktar girin'); return; }
    if (isNaN(min) || min < 0) { setError('Geçerli bir minimum girin'); return; }
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
        // Production-aware
        type: matType.trim() || null,
        usage_category: usageCategory,
        consumption_type: consumptionType,
        units_per_tooth: !isNaN(upt) && upt > 0 ? upt : null,
        consume_at_stage: usageCategory === 'production' ? consumeStage : 'MILLING',
        unit_cost: !isNaN(cost) && cost >= 0 ? cost : 0,
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
      setError(e.message ?? 'Kayıt hatası');
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
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>{isEdit ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose}>
              <AppIcon name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} showsVerticalScrollIndicator={false}>
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Ürün Bilgileri</Text>
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>ÜRÜN ADI <Text style={m.req}>*</Text></Text>
                <TextInput style={m.fieldInput} value={name} onChangeText={setName} placeholder="örn. Zirkonyum Blok" placeholderTextColor="#C7C7CC" />
              </View>

              {/* Kategori — searchable dropdown */}
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>KATEGORİ</Text>
                <TouchableOpacity
                  style={[m.fieldInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => { setCatDropOpen(v => !v); setBrandDropOpen(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={category ? { fontSize: 14, color: '#0F172A' } : { fontSize: 14, color: '#C7C7CC' }}>
                    {category || 'Kategori seçin veya yazın…'}
                  </Text>
                  <AppIcon name={catDropOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#94A3B8" />
                </TouchableOpacity>
                {catDropOpen && (
                  <View style={m.dropPanel}>
                    <TextInput
                      style={m.dropSearch}
                      value={catSearch}
                      onChangeText={setCatSearch}
                      placeholder="Ara veya yeni ekle…"
                      placeholderTextColor="#C7C7CC"
                      autoFocus
                    />
                    <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                      {existingCategories
                        .filter(c => !catSearch || c.toLowerCase().includes(catSearch.toLowerCase()))
                        .map(c => (
                          <TouchableOpacity key={c} style={[m.dropItem, category === c && m.dropItemActive]} onPress={() => { setCategory(c); setCatSearch(''); setCatDropOpen(false); }} activeOpacity={0.7}>
                            <Text style={[m.dropItemText, category === c && { color: accentColor, fontWeight: '700' }]}>{c}</Text>
                            {category === c && <AppIcon name="check" size={13} color={accentColor} />}
                          </TouchableOpacity>
                        ))}
                      {catSearch.trim() && !existingCategories.some(c => c.toLowerCase() === catSearch.trim().toLowerCase()) && (
                        <TouchableOpacity style={m.dropAddItem} onPress={() => { setCategory(catSearch.trim()); setCatSearch(''); setCatDropOpen(false); }} activeOpacity={0.7}>
                          <AppIcon name="plus-circle" size={14} color={accentColor} />
                          <Text style={[m.dropAddText, { color: accentColor }]}>"{catSearch.trim()}" ekle</Text>
                        </TouchableOpacity>
                      )}
                      {existingCategories.filter(c => !catSearch || c.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && !catSearch.trim() && (
                        <Text style={m.dropEmpty}>Henüz kategori yok</Text>
                      )}
                    </ScrollView>
                    {category ? (
                      <TouchableOpacity style={m.dropClear} onPress={() => { setCategory(''); setCatDropOpen(false); }} activeOpacity={0.7}>
                        <Text style={m.dropClearText}>Temizle</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>

              {/* Marka — searchable dropdown */}
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>MARKA</Text>
                <TouchableOpacity
                  style={[m.fieldInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => { setBrandDropOpen(v => !v); setCatDropOpen(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={brand ? { fontSize: 14, color: '#0F172A' } : { fontSize: 14, color: '#C7C7CC' }}>
                    {brand || 'Marka seçin veya yazın…'}
                  </Text>
                  <AppIcon name={brandDropOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#94A3B8" />
                </TouchableOpacity>
                {brandDropOpen && (
                  <View style={m.dropPanel}>
                    <TextInput
                      style={m.dropSearch}
                      value={brandSearch}
                      onChangeText={setBrandSearch}
                      placeholder="Ara veya yeni ekle…"
                      placeholderTextColor="#C7C7CC"
                      autoFocus
                    />
                    <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                      {existingBrands
                        .filter(b => !brandSearch || b.toLowerCase().includes(brandSearch.toLowerCase()))
                        .map(b => (
                          <TouchableOpacity key={b} style={[m.dropItem, brand === b && m.dropItemActive]} onPress={() => { setBrand(b); setBrandSearch(''); setBrandDropOpen(false); }} activeOpacity={0.7}>
                            <Text style={[m.dropItemText, brand === b && { color: accentColor, fontWeight: '700' }]}>{b}</Text>
                            {brand === b && <AppIcon name="check" size={13} color={accentColor} />}
                          </TouchableOpacity>
                        ))}
                      {brandSearch.trim() && !existingBrands.some(b => b.toLowerCase() === brandSearch.trim().toLowerCase()) && (
                        <TouchableOpacity style={m.dropAddItem} onPress={() => { setBrand(brandSearch.trim()); setBrandSearch(''); setBrandDropOpen(false); }} activeOpacity={0.7}>
                          <AppIcon name="plus-circle" size={14} color={accentColor} />
                          <Text style={[m.dropAddText, { color: accentColor }]}>"{brandSearch.trim()}" ekle</Text>
                        </TouchableOpacity>
                      )}
                      {existingBrands.filter(b => !brandSearch || b.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && !brandSearch.trim() && (
                        <Text style={m.dropEmpty}>Henüz marka yok</Text>
                      )}
                    </ScrollView>
                    {brand ? (
                      <TouchableOpacity style={m.dropClear} onPress={() => { setBrand(''); setBrandDropOpen(false); }} activeOpacity={0.7}>
                        <Text style={m.dropClearText}>Temizle</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>

              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>BİRİM</Text>
                <TextInput style={m.fieldInput} value={unit} onChangeText={setUnit} placeholder="adet / ml / gr / kutu…" placeholderTextColor="#C7C7CC" />
              </View>
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>TEDARİKÇİ</Text>
                <TextInput style={m.fieldInput} value={supplier} onChangeText={setSupplier} placeholder="Tedarikçi firma adı…" placeholderTextColor="#C7C7CC" />
              </View>
            </View>

            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Stok Miktarları</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>{isEdit ? 'MEVCUT MİKTAR' : 'BAŞLANGIÇ MİKTARI'} <Text style={m.req}>*</Text></Text>
                  <TextInput style={m.fieldInput} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" placeholderTextColor="#C7C7CC" />
                </View>
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>MİNİMUM STOK <Text style={m.req}>*</Text></Text>
                  <TextInput style={m.fieldInput} value={minQty} onChangeText={setMinQty} keyboardType="numeric" placeholder="0" placeholderTextColor="#C7C7CC" />
                </View>
              </View>
              {error ? (
                <View style={m.errorBox}>
                  <AppIcon name="alert-circle" size={14} color="#DC2626" />
                  <Text style={m.errorText}>{error}</Text>
                </View>
              ) : null}
            </View>

            {/* ── Üretim Entegrasyonu ─────────────────────────────────── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Üretim Entegrasyonu</Text>

              {/* Usage category — segmented */}
              <View style={[m.fieldWrap, { marginBottom: 12 }]}>
                <Text style={m.fieldLabel}>KULLANIM KATEGORİSİ</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['production','office','misc'] as const).map(cat => {
                    const active = usageCategory === cat;
                    const label  = cat === 'production' ? 'Üretim' : cat === 'office' ? 'Ofis' : 'Diğer';
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => setUsageCategory(cat)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 8,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? '#2563EB' : '#E5E5EA',
                          backgroundColor: active ? '#EFF6FF' : '#FFFFFF',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#2563EB' : '#3C3C43' }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Type — only meaningful for production */}
              <View style={[m.fieldWrap, { marginBottom: 12 }]}>
                <Text style={m.fieldLabel}>MATERYAL TÜRÜ</Text>
                <TextInput
                  style={m.fieldInput}
                  value={matType}
                  onChangeText={setMatType}
                  placeholder="zirconia / metal / emax / pmma / glaze…"
                  placeholderTextColor="#C7C7CC"
                />
                <Text style={{ fontSize: 11, color: '#8E8E93', marginTop: 4 }}>
                  Sipariş türüyle eşleşir (zirconia siparişi → zirconia disk).
                </Text>
              </View>

              {/* Consumption type selector — production-only */}
              {usageCategory === 'production' && (
                <View style={[m.fieldWrap, { marginBottom: 12 }]}>
                  <Text style={m.fieldLabel}>TÜKETİM MODELİ</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {([
                      { key: 'per_tooth',     label: 'Diş Başı',  hint: 'tooth × units' },
                      { key: 'fixed',         label: 'Sabit',     hint: '1 birim/sipariş' },
                      { key: 'manual',        label: 'Manuel',    hint: 'her seferde gir' },
                    ] as const).map(opt => {
                      const active = consumptionType === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={() => setConsumptionType(opt.key)}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: active ? '#7C3AED' : '#E5E5EA',
                            backgroundColor: active ? '#F5F3FF' : '#FFFFFF',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? '#7C3AED' : '#3C3C43' }}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={{ fontSize: 11, color: '#8E8E93', marginTop: 4 }}>
                    {consumptionType === 'per_tooth' && 'Diş sayısı × diş başına tüketim formülü.'}
                    {consumptionType === 'fixed'     && 'Aşama tamamlanınca 1 birim düşer.'}
                    {consumptionType === 'manual'    && 'Her aşamada manuel miktar girilir.'}
                  </Text>
                </View>
              )}

              {/* Production-only fields */}
              {usageCategory === 'production' && (
                <>
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                    <View style={[m.fieldWrap, { flex: 1, marginBottom: 0 }]}>
                      <Text style={m.fieldLabel}>DİŞ BAŞINA TÜKETİM</Text>
                      <TextInput
                        style={m.fieldInput}
                        value={unitsPerTooth}
                        onChangeText={setUnitsPerTooth}
                        keyboardType="numeric"
                        placeholder="0.5"
                        placeholderTextColor="#C7C7CC"
                      />
                    </View>
                    <View style={[m.fieldWrap, { flex: 1, marginBottom: 0 }]}>
                      <Text style={m.fieldLabel}>TÜKETİM AŞAMASI</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                        {STAGE_OPTIONS.map(st => {
                          const active = consumeStage === st;
                          return (
                            <TouchableOpacity
                              key={st}
                              onPress={() => setConsumeStage(st)}
                              style={{
                                paddingHorizontal: 8, paddingVertical: 4,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: active ? '#2563EB' : '#E5E5EA',
                                backgroundColor: active ? '#EFF6FF' : '#FFFFFF',
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#2563EB' : '#8E8E93' }}>
                                {st}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: '#8E8E93', marginBottom: 12 }}>
                    Sipariş bu aşamayı tamamlayınca: diş sayısı × tüketim = stoktan otomatik düşülür.
                  </Text>
                </>
              )}

              {/* Unit cost — always visible (future cost tracking) */}
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>BİRİM MALİYET (₺)</Text>
                <TextInput
                  style={m.fieldInput}
                  value={unitCost}
                  onChangeText={setUnitCost}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>
          </ScrollView>

          <View style={m.footer}>
            {isEdit && (
              <TouchableOpacity style={m.deleteBtn} onPress={handleDelete} disabled={deleting}>
                {deleting ? <ActivityIndicator size="small" color="#DC2626" /> : <AppIcon name="trash-2" size={14} color="#DC2626" />}
                <Text style={m.deleteBtnText}>Sil</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, { backgroundColor: accentColor }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={m.saveText}>{isEdit ? 'Güncelle' : 'Ekle'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── MovementModal ────────────────────────────────────────────────────────────

const MOV_TYPES: { key: MovType; label: string; color: string; bg: string; icon: string }[] = [
  { key: 'IN',    label: 'Giriş',  color: '#059669', bg: '#D1FAE5', icon: 'arrow-down-circle-outline' },
  { key: 'OUT',   label: 'Çıkış',  color: '#2563EB', bg: '#DBEAFE', icon: 'arrow-up-circle-outline' },
  { key: 'WASTE', label: 'Fire',   color: '#DC2626', bg: '#FEE2E2', icon: 'alert-circle-outline' },
];

interface MovementModalProps {
  visible: boolean;
  item: StockItem | null;       // null = standalone mode (item picker shown)
  items?: StockItem[];          // required when item is null
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
    if (!resolvedItem) { setError('Ürün seçin'); return; }
    const amount = parseFloat(qty);
    if (!amount || amount <= 0) { setError('Geçerli bir miktar girin'); return; }
    setSaving(true); setError('');
    try {
      const next = type === 'IN' ? resolvedItem.quantity + amount : Math.max(0, resolvedItem.quantity - amount);
      await supabase.from('stock_items').update({ quantity: next }).eq('id', resolvedItem.id);
      await supabase.from('stock_movements').insert({
        item_name: resolvedItem.name, type, quantity: amount, unit: resolvedItem.unit ?? null, note: note.trim() || null,
      });
      onSaved(); onClose();
    } catch (e: any) {
      setError(e.message ?? 'İşlem hatası');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={[m.sheet, { maxWidth: 420 }]}>
          <View style={m.header}>
            <View>
              <Text style={m.title}>Stok Hareketi</Text>
              {resolvedItem && <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{resolvedItem.name}</Text>}
            </View>
            <TouchableOpacity style={m.closeBtn} onPress={onClose}>
              <AppIcon name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={[m.body, { paddingBottom: 0 }]}>
            {/* Item picker — only in standalone mode */}
            {standalone && (
              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Ürün Seç <Text style={m.req}>*</Text></Text>
                <TouchableOpacity
                  style={[m.fieldInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setPickerOpen(v => !v)}
                  activeOpacity={0.8}
                >
                  <Text style={resolvedItem ? { fontSize: 14, color: '#0F172A' } : { fontSize: 14, color: '#C7C7CC' }}>
                    {resolvedItem ? resolvedItem.name : 'Ürün seçin…'}
                  </Text>
                  <AppIcon name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#94A3B8" />
                </TouchableOpacity>
                {pickerOpen && (
                  <View style={{ borderWidth: 1, borderColor: '#E9EEF4', borderRadius: 10, backgroundColor: '#FAFAFA', marginTop: 4, overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                      <AppIcon name="search" size={13} color="#AEAEB2" />
                      <TextInput
                        style={{ flex: 1, fontSize: 13, color: '#0F172A', outlineStyle: 'none' } as any}
                        value={pickerSearch}
                        onChangeText={setPickerSearch}
                        placeholder="Ürün ara…"
                        placeholderTextColor="#AEAEB2"
                        autoFocus
                      />
                    </View>
                    <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
                      {pickerItems.map((i, idx) => (
                        <TouchableOpacity
                          key={i.id}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: idx < pickerItems.length - 1 ? 1 : 0, borderBottomColor: '#F8FAFC', backgroundColor: selectedId === i.id ? '#F8FAFC' : 'transparent' }}
                          onPress={() => { setSelectedId(i.id); setPickerOpen(false); setPickerSearch(''); }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: selectedId === i.id ? '600' : '400' }}>{i.name}</Text>
                          {selectedId === i.id && <AppIcon name="check" size={14} color="#0F172A" />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>İşlem Tipi</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {MOV_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[mv.typeBtn, type === t.key && { backgroundColor: t.bg, borderColor: t.color }]}
                    onPress={() => setType(t.key)}
                    activeOpacity={0.8}
                  >
                    <AppIcon name={t.icon as any} size={15} color={type === t.key ? t.color : '#94A3B8'} />
                    <Text style={[mv.typeBtnText, type === t.key && { color: t.color, fontWeight: '700' }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={m.sectionCard}>
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>MİKTAR <Text style={m.req}>*</Text></Text>
                <TextInput style={m.fieldInput} value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="0" placeholderTextColor="#C7C7CC" />
              </View>
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>NOT</Text>
                <TextInput
                  style={[m.fieldInput, { minHeight: 56 }]}
                  value={note} onChangeText={setNote}
                  placeholder="İsteğe bağlı açıklama…" placeholderTextColor="#C7C7CC" multiline
                />
              </View>
              {error ? (
                <View style={[m.errorBox, { marginTop: 10 }]}>
                  <AppIcon name="alert-circle" size={14} color="#DC2626" />
                  <Text style={m.errorText}>{error}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, { backgroundColor: accentColor }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={m.saveText}>Kaydet</Text>}
            </TouchableOpacity>
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
      <Circle cx={cx} cy={cx} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
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

const PIE_COLORS = ['#0F172A', '#2563EB', '#059669', '#F59E0B', '#DC2626'];

function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function PetalChart({ data, size = 216 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const cx     = size / 2;
  const maxR   = cx - 8;
  const innerR = maxR * 0.25;
  const gap    = 7; // degrees gap between petals
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

  // Fixed label radius at 72% of the way between inner and max
  const labelR = innerR + 0.72 * (maxR - innerR);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        {data.map((d, idx) => {
          const s0 = idx * sliceDeg - 90 + gap / 2;
          const e0 = s0 + sliceDeg - gap;

          // Background track
          const bgPath = arcPath(bgMidR, s0, e0);

          // Value petal
          const pct    = d.value / maxVal;
          const outerR = innerR + pct * (maxR - innerR);
          const midR   = (innerR + outerR) / 2;
          const sw     = Math.max(outerR - innerR, 6);
          const valPath = arcPath(midR, s0, e0);

          return (
            <React.Fragment key={idx}>
              <Path d={bgPath}  fill="none" stroke="#EAECF0" strokeWidth={bgStroke} strokeLinecap="round" />
              <Path d={valPath} fill="none" stroke={d.color} strokeWidth={sw}       strokeLinecap="round" />
            </React.Fragment>
          );
        })}
      </Svg>

      {/* Labels inside petals */}
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
      <View style={db.emptyWrap}>
        <AppIcon name="package-variant-closed" size={44} color="#E2E8F0" />
        <Text style={db.emptyTitle}>Henüz ürün yok</Text>
        <Text style={db.emptySub}>Stok yönetimine başlamak için ilk ürününüzü ekleyin.</Text>
        <TouchableOpacity style={[db.emptyBtn, { backgroundColor: accentColor }]} onPress={onAddProduct}>
          <AppIcon name="plus" size={14} color="#FFFFFF" />
          <Text style={db.emptyBtnText}>İlk Ürünü Ekle</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>

      {/* ── 4 Stat kartları (Stitch tarzı — temiz beyaz kart, yuvarlak ikon) ── */}
      <View style={db.statRow}>
        {([
          { label: 'TOPLAM ÜRÜN',   value: total,           sub: `${catStats.length} kategori`,                                                   icon: 'package'        as const, tone: 'neutral' as const },
          { label: 'NORMAL STOK',   value: normal.length,   sub: total > 0 ? `%${Math.round(normal.length/total*100)} yeterli` : 'yeterli stok',   icon: 'check-circle'   as const, tone: 'success' as const },
          { label: 'KRİTİK SEVİYE', value: critical.length, sub: critical.length > 0 ? 'minimum altında' : 'tümü normal',                          icon: 'alert-triangle' as const, tone: 'warning' as const },
          { label: 'TÜKENDİ',       value: empty.length,    sub: empty.length > 0 ? 'acil sipariş gerekli' : 'eksik ürün yok',                     icon: 'x-circle'       as const, tone: 'danger'  as const },
        ] as const).map((stat, i) => {
          const isAlert    = stat.tone === 'danger' && stat.value > 0;
          const iconBgMap  = { neutral: '#F1F5F9', success: '#ECFDF5', warning: '#FFFBEB', danger: isAlert ? '#FEE2E2' : '#F1F5F9' };
          const iconColMap = { neutral: '#64748B', success: '#059669', warning: '#D97706', danger: isAlert ? '#DC2626' : '#94A3B8' };
          return (
            <View key={i} style={[db.statCard, isAlert && db.statCardAlert]}>
              <View style={db.statCardTop}>
                <Text style={[db.statLabel, isAlert && { color: '#DC2626' }]}>{stat.label}</Text>
                <View style={[db.statIcon, { backgroundColor: iconBgMap[stat.tone] }]}>
                  <AppIcon name={stat.icon} size={18} color={iconColMap[stat.tone]} />
                </View>
              </View>
              <Text style={[db.statValue, isAlert && { color: '#DC2626' }]}>{stat.value}</Text>
              <Text style={db.statSub}>{stat.sub}</Text>
            </View>
          );
        })}
      </View>

      {/* ── Orta satır: Kategori bar grafik + Durum donuts ── */}
      <View style={db.splitRow}>

        {/* Kategori yatay bar grafik */}
        {catStats.length > 0 && (
          <View style={[db.card, db.splitLeft]}>
            <View style={db.cardHead}>
              <Text style={db.sectionTitle}>Kategori Dağılımı</Text>
              <Text style={db.mutedText}>İlk {catStats.length}</Text>
            </View>
            <View style={{ gap: 14 }}>
              {catStats.map(([cat, count], idx) => {
                const maxCount = catStats[0][1];
                const pct = maxCount > 0 ? count / maxCount : 0;
                const clr = PIE_COLORS[idx % PIE_COLORS.length];
                return (
                  <View key={cat} style={{ gap: 7 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={db.barCatLabel} numberOfLines={1}>{cat}</Text>
                      <Text style={[db.barCatCount, { color: clr }]}>{Math.round(pct * 100)}%</Text>
                    </View>
                    <View style={db.barTrack}>
                      <View style={[db.barFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: clr }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Stok durumu büyük donut */}
        <View style={[db.card, db.splitRight]}>
          <View style={db.cardHead}>
            <Text style={db.sectionTitle}>Stok Durumu</Text>
          </View>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ position: 'relative', width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
              <DonutChart pct={total > 0 ? normal.length / total : 0} color="#10B981" size={150} stroke={20} />
              <View style={{ position: 'absolute', alignItems: 'center' }}>
                <Text style={{ fontSize: 34, fontWeight: '800', color: '#0F172A', letterSpacing: -1 }}>
                  {total > 0 ? Math.round(normal.length / total * 100) : 0}
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>%</Text>
                </Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>Normal</Text>
              </View>
            </View>
          </View>
          <View style={{ gap: 10 }}>
            {([
              { label: 'Normal',  count: normal.length,   color: '#10B981' },
              { label: 'Kritik',  count: critical.length, color: '#F59E0B' },
              { label: 'Tükendi', count: empty.length,    color: '#EF4444' },
            ] as const).map(l => (
              <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[db.pieLegDot, { backgroundColor: l.color }]} />
                <Text style={[db.pieLegName, { flex: 1 }]}>{l.label}</Text>
                <Text style={db.pieLegMeta}>{l.count}</Text>
              </View>
            ))}
          </View>
        </View>

      </View>

      {/* ── Acil Dikkat listesi ── */}
      {urgentItems.length > 0 && (
        <View style={db.card}>
          <View style={db.cardHead}>
            <Text style={db.sectionTitle}>Acil Dikkat</Text>
            <View style={db.redBadge}><Text style={db.redBadgeText}>{urgentItems.length} ürün</Text></View>
          </View>
          {urgentItems.map((item, idx) => {
            const isEmpty = item.quantity === 0;
            const isLast  = idx === urgentItems.length - 1;
            const clr     = isEmpty ? '#EF4444' : '#F59E0B';
            const bg      = isEmpty ? '#FFF1F2' : '#FFFBEB';
            return (
              <View key={item.id} style={[db.urgRow, !isLast && db.urgDivider]}>
                <View style={[db.urgIconBox, { backgroundColor: bg }]}>
                  <AppIcon name={isEmpty ? 'alert-circle' : 'alert-triangle'} size={22} color={clr} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={db.urgName} numberOfLines={1}>{item.name}</Text>
                  <Text style={db.urgMeta}>
                    {isEmpty ? 'Stok tükendi' : `${item.quantity}${item.unit ? ` ${item.unit}` : ''} kaldı · minimum: ${item.min_quantity}`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[db.urgReorderBtn, { backgroundColor: accentColor }]}
                  onPress={() => onMovement(item, 'IN')}
                  activeOpacity={0.85}
                >
                  <Text style={db.urgReorderText}>Yeniden Sipariş</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 24 }} />
    </View>
  );
}

const db = StyleSheet.create({
  // Quick actions
  qaGrid:            { flexDirection: 'row', gap: 10 },
  qaCard:            { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any) : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 }) },
  qaCardPrimary:     { borderWidth: 0 },
  qaIconWrap:        { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  qaIconWrapWhite:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  qaCardLabel:       { fontSize: 12, fontWeight: '700', color: '#334155', textAlign: 'center', lineHeight: 17 },
  qaCardLabelWhite:  { fontSize: 12, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', lineHeight: 17 },

  // Stat cards (Stitch style — clean white cards with circular icon)
  statRow:        { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  statCard:       { flex: 1, minWidth: 150, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', padding: 18, gap: 4, ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any) : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 }) },
  statCardAlert:  { borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  statCardTop:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  statIcon:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 100 },
  statBadgeText:  { fontSize: 10, fontWeight: '700' },
  statValue:      { fontSize: 32, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },
  statLabel:      { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, flex: 1, paddingRight: 8, paddingTop: 4 },
  statSub:        { fontSize: 11, color: '#94A3B8', fontWeight: '500' },

  // Category bar chart
  barTrack:    { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  barFill:     { height: 8, borderRadius: 4 },
  barCatLabel: { fontSize: 13, fontWeight: '600', color: '#334155', flex: 1 },
  barCatCount: { fontSize: 12, fontWeight: '700' },

  // Generic card
  card:         { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', padding: 16, ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any) : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 }) },
  cardHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  mutedText:    { fontSize: 12, color: '#94A3B8' },

  // Red badge
  redBadge:     { backgroundColor: '#FEE2E2', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 3 },
  redBadgeText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  // Urgent list (Stitch — büyük ikon kutusu + "Yeniden Sipariş" butonu)
  urgRow:         { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  urgDivider:     { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  urgIconBox:     { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  urgName:        { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  urgMeta:        { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
  urgBadge:       { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  urgBadgeText:   { fontSize: 10, fontWeight: '700' },
  urgReorderBtn:  { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  urgReorderText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  // Pie chart
  pieWrap:     { flexDirection: 'row', alignItems: 'center', gap: 20 },
  pieLegend:   { flex: 1, gap: 10 },
  pieLegRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pieLegDot:   { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  pieLegName:  { fontSize: 12, fontWeight: '600', color: '#1E293B' },
  pieLegMeta:  { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  // Split layout
  splitRow:   { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  splitLeft:  { flex: 1.2, minWidth: 200 },
  splitRight: { flex: 1, minWidth: 160 },

  // Empty
  emptyWrap:    { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  emptySub:     { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
  emptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginTop: 6 },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});

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
    if (!n) { setError('Marka adı zorunlu'); return; }
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
        // rename references in stock_items if name changed
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
    } catch (e: any) { setError(e.message ?? 'Kayıt hatası'); }
    finally { setSaving(false); }
  };

  const Field = ({ label, value, onChange, placeholder, keyboard, multiline }: {
    label: string; value: string; onChange: (t: string) => void;
    placeholder?: string; keyboard?: any; multiline?: boolean;
  }) => (
    <View style={m.fieldWrap}>
      <Text style={m.fieldLabel}>{label}</Text>
      <TextInput
        style={[m.fieldInput, multiline && { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]}
        value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor="#C7C7CC"
        keyboardType={keyboard} multiline={multiline}
      />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>{isEdit ? 'Markayı Düzenle' : 'Yeni Marka Ekle'}</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose}>
              <AppIcon name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} showsVerticalScrollIndicator={false}>
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Marka Bilgileri</Text>
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>MARKA ADI <Text style={m.req}>*</Text></Text>
                <TextInput style={m.fieldInput} value={name} onChangeText={t => { setName(t); setError(''); }}
                  placeholder="örn. 3M, GC, Vita…" placeholderTextColor="#C7C7CC" />
              </View>
              <Field label="SATICI / DİSTRİBÜTÖR" value={supplier} onChange={setSupplier} placeholder="Türkiye distribütörü…" />
            </View>

            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>İletişim Bilgileri</Text>
              <Field label="İLETİŞİM KİŞİSİ" value={contactPerson} onChange={setContactPerson} placeholder="Ad Soyad…" />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>TELEFON</Text>
                  <TextInput style={m.fieldInput} value={phone} onChangeText={setPhone}
                    placeholder="+90 5XX…" placeholderTextColor="#C7C7CC" keyboardType="phone-pad" />
                </View>
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>E-POSTA</Text>
                  <TextInput style={m.fieldInput} value={email} onChangeText={setEmail}
                    placeholder="info@…" placeholderTextColor="#C7C7CC" keyboardType="email-address" />
                </View>
              </View>
              <Field label="WEB SİTESİ" value={website} onChange={setWebsite} placeholder="www.marka.com" />
            </View>

            <View style={[m.sectionCard, { marginBottom: 0 }]}>
              <Text style={m.sectionTitle}>Ek Bilgiler</Text>
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>NOTLAR</Text>
                <TextInput style={[m.fieldInput, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={notes} onChangeText={setNotes}
                  placeholder="Sipariş koşulları, indirim oranı, teslimat süresi…"
                  placeholderTextColor="#C7C7CC" multiline />
              </View>
            </View>

            {error ? (
              <View style={[m.errorBox, { marginTop: 12 }]}>
                <AppIcon name="alert-circle" size={14} color="#DC2626" />
                <Text style={m.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={m.footer}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, { backgroundColor: accentColor }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={m.saveText}>{isEdit ? 'Güncelle' : 'Ekle'}</Text>}
            </TouchableOpacity>
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
      <View style={ss.card}>
        <View style={ss.cardHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[ss.headIcon, { backgroundColor: accentColor + '12' }]}>
              <AppIcon name="tag" size={14} color={accentColor} />
            </View>
            <Text style={ss.cardTitle}>Markalar</Text>
            <View style={ss.countBadge}><Text style={ss.countText}>{brands.length}</Text></View>
          </View>
          <TouchableOpacity style={[ss.addBtn, { backgroundColor: accentColor }]}
            onPress={() => setModal({ visible: true, brand: null })} activeOpacity={0.85}>
            <AppIcon name="plus" size={13} color="#FFFFFF" />
            <Text style={ss.addBtnText}>Ekle</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 20 }} />
        ) : brands.length === 0 ? (
          <Text style={ss.emptyText}>Henüz marka yok</Text>
        ) : (
          brands.map((b, idx) => {
            const isLast = idx === brands.length - 1;
            return (
              <View key={b.id} style={[ss.row, !isLast && ss.rowBorder]}>
                <View style={ss.brandIconBox}>
                  <AppIcon name="tag" size={13} color="#64748B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ss.rowName} numberOfLines={1}>{b.name}</Text>
                  {(b.supplier || b.contact_person || b.phone) && (
                    <Text style={ss.rowMeta} numberOfLines={1}>
                      {[b.supplier, b.contact_person, b.phone].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
                <TouchableOpacity style={ss.iconBtn} onPress={() => setModal({ visible: true, brand: b })} activeOpacity={0.7}>
                  <AppIcon name="edit-2" size={13} color="#64748B" />
                </TouchableOpacity>
                <TouchableOpacity style={[ss.iconBtn, { backgroundColor: '#FFF1F2' }]} onPress={() => handleDelete(b.id, b.name)} activeOpacity={0.7}>
                  <AppIcon name="trash-2" size={13} color="#DC2626" />
                </TouchableOpacity>
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
    <View style={ss.card}>
      <View style={ss.cardHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[ss.headIcon, { backgroundColor: accentColor + '12' }]}>
            <AppIcon name="grid" size={14} color={accentColor} />
          </View>
          <Text style={ss.cardTitle}>Kategoriler</Text>
          <View style={ss.countBadge}><Text style={ss.countText}>{rows.length}</Text></View>
        </View>
        <TouchableOpacity style={[ss.addBtn, { backgroundColor: accentColor }]}
          onPress={() => { setAddMode(true); setAddText(''); setError(''); setEditName(null); }} activeOpacity={0.85}>
          <AppIcon name="plus" size={13} color="#FFFFFF" />
          <Text style={ss.addBtnText}>Ekle</Text>
        </TouchableOpacity>
      </View>

      {addMode && (
        <View style={ss.inputRow}>
          <TextInput style={ss.rowInput} value={addText} onChangeText={t => { setAddText(t); setError(''); }}
            placeholder="Kategori adı…" placeholderTextColor="#C7C7CC" autoFocus onSubmitEditing={handleAdd} />
          <TouchableOpacity style={[ss.rowActionBtn, { backgroundColor: accentColor }]} onPress={handleAdd} disabled={saving} activeOpacity={0.8}>
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <AppIcon name="check" size={14} color="#FFFFFF" />}
          </TouchableOpacity>
          <TouchableOpacity style={ss.rowCancelBtn} onPress={() => { setAddMode(false); setError(''); }} activeOpacity={0.8}>
            <AppIcon name="x" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      )}

      {error ? <Text style={ss.errorText}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 20 }} />
      ) : rows.length === 0 && !addMode ? (
        <Text style={ss.emptyText}>Henüz kategori yok</Text>
      ) : (
        rows.map((name, idx) => {
          const isEditing = editName === name;
          const isLast = idx === rows.length - 1;
          return (
            <View key={name} style={[ss.row, !isLast && ss.rowBorder]}>
              {isEditing ? (
                <>
                  <TextInput style={[ss.rowInput, { flex: 1 }]} value={editText}
                    onChangeText={t => { setEditText(t); setError(''); }} autoFocus onSubmitEditing={handleEdit} />
                  <TouchableOpacity style={[ss.rowActionBtn, { backgroundColor: accentColor }]} onPress={handleEdit} disabled={saving} activeOpacity={0.8}>
                    {saving ? <ActivityIndicator size="small" color="#FFF" /> : <AppIcon name="check" size={14} color="#FFFFFF" />}
                  </TouchableOpacity>
                  <TouchableOpacity style={ss.rowCancelBtn} onPress={() => { setEditName(null); setError(''); }} activeOpacity={0.8}>
                    <AppIcon name="x" size={14} color="#94A3B8" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={ss.rowName} numberOfLines={1}>{name}</Text>
                  <TouchableOpacity style={ss.iconBtn} onPress={() => { setEditName(name); setEditText(name); setError(''); setAddMode(false); }} activeOpacity={0.7}>
                    <AppIcon name="edit-2" size={13} color="#64748B" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[ss.iconBtn, { backgroundColor: '#FFF1F2' }]} onPress={() => handleDelete(name)} activeOpacity={0.7}>
                    <AppIcon name="trash-2" size={13} color="#DC2626" />
                  </TouchableOpacity>
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

const ss = StyleSheet.create({
  card:         { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', overflow: 'hidden', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any) : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 }) },
  cardHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  headIcon:     { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle:    { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  countBadge:   { backgroundColor: '#F1F5F9', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  countText:    { fontSize: 11, fontWeight: '700', color: '#64748B' },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  addBtnText:   { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  inputRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#F8FAFC' },
  rowInput:     { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, backgroundColor: '#FFFFFF', outlineStyle: 'none' } as any,
  rowActionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowCancelBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  errorText:    { fontSize: 12, color: '#DC2626', paddingHorizontal: 16, paddingBottom: 8 },
  emptyText:    { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 24 },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  rowBorder:    { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  brandIconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowName:      { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  rowMeta:      { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginTop: 1 },
  iconBtn:      { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
});

// ─── StockScreen ──────────────────────────────────────────────────────────────

interface Props { accentColor?: string; }

export function StockScreen({ accentColor = '#0F172A' }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [tab, setTab] = useState<'dashboard' | 'list' | 'movements' | 'settings'>('dashboard');

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
      // 30 gün önce — fire badge için
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

      // Aggregate waste by item_id
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

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

        {/* ── Slide tab bar + CTA ── */}
        <View style={s.tabBarRow}>
          <SlideTabBar
            items={[
              { key: 'dashboard', label: 'Genel Bakış' },
              { key: 'list',      label: 'Stok Listesi' },
              { key: 'movements', label: 'Hareketler' },
              { key: 'settings',  label: 'Ayarlar' },
            ] as const}
            activeKey={tab as any}
            onChange={(k) => setTab(k as any)}
            accentColor={accentColor}
          />
          {tab !== 'settings' && (
            <TouchableOpacity
              style={[s.pageCta, { backgroundColor: accentColor }]}
              onPress={() => {
                if (tab === 'movements') setMovModal({ visible: true, item: null });
                else setProductModal({ visible: true, item: null });
              }}
              activeOpacity={0.85}
            >
              <AppIcon name="plus" size={15} color="#FFFFFF" />
              <Text style={s.pageCtaText}>{tab === 'movements' ? 'Yeni Hareket' : 'Yeni Ürün'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {tab === 'settings' ? (
          <StockSettings accentColor={accentColor} onReload={load} />
        ) : tab === 'dashboard' ? (
          loading ? (
            <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
          ) : (
            <StockDashboard
              items={items}
              accentColor={accentColor}
              onMovement={(item, defaultType) => setMovModal({ visible: true, item, defaultType })}
              onAddProduct={() => setProductModal({ visible: true, item: null })}
              onEditProduct={item => setProductModal({ visible: true, item })}
            />
          )
        ) : tab === 'movements' ? (
          <StockMovementsScreen />
        ) : loading ? (
          <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
        ) : !tableExists ? (
          <View style={s.empty}>
            <AppIcon name="database-off-outline" size={40} color="#E5E7EB" />
            <Text style={s.emptyTitle}>Stok modülü kurulmadı</Text>
            <Text style={s.emptySub}>Supabase'de "stock_items" tablosu oluştuğunda veriler görünür.</Text>
          </View>
        ) : (
          <>
            {/* ── Toolbar ── */}
            <View style={s.toolbar}>
              {searchExpanded || search.length > 0 ? (
                <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
                  <AppIcon name="search" size={15} color={searchFocused ? accentColor : '#94A3B8'} />
                  <TextInput
                    autoFocus
                    style={s.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => { setSearchFocused(false); if (!search) setSearchExpanded(false); }}
                    placeholder="Ürün ara…"
                    placeholderTextColor="#AEAEB2"
                  />
                  <TouchableOpacity onPress={() => { setSearch(''); setSearchExpanded(false); }} hitSlop={8}>
                    <AppIcon name="x" size={14} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              <IconBtn active={searchExpanded || search.length > 0} onPress={() => setSearchExpanded(true)}>
                <AppIcon name="search" size={20} color={searchExpanded || search.length > 0 ? accentColor : '#64748B'} />
              </IconBtn>

              <IconBtn active={activeFilterCount > 0} onPress={openFilter} style={{ position: 'relative' }}>
                <AppIcon name={'tune-variant' as any} size={20} color={activeFilterCount > 0 ? accentColor : '#64748B'} />
                {activeFilterCount > 0 && (
                  <View style={[s.filterCount, { backgroundColor: accentColor, position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }]}>
                    <Text style={s.filterCountText}>{activeFilterCount}</Text>
                  </View>
                )}
              </IconBtn>

              {/* Fire bildir butonu */}
              <TouchableOpacity
                onPress={() => setWasteOpen(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, height: 36,
                  borderRadius: 10,
                  backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5',
                }}
                activeOpacity={0.8}
              >
                <AppIcon name="alert-triangle" size={14} color="#DC2626" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>Fire Bildir</Text>
              </TouchableOpacity>
            </View>

            {/* ── Table ── */}
            {filtered.length === 0 ? (
              <View style={s.empty}>
                <AppIcon name={total === 0 ? 'package' : 'search'} size={36} color="#E5E7EB" />
                <Text style={s.emptyTitle}>{total === 0 ? 'Henüz ürün eklenmemiş' : 'Sonuç bulunamadı'}</Text>
                <Text style={s.emptySub}>{total === 0 ? '"Yeni Ürün" butonuna tıklayın' : 'Arama veya filtre kriterlerini değiştirin'}</Text>
              </View>
            ) : (
              <>
                {/* Shared table header */}
                <View style={tbl.headerRow}>
                  <Text style={[tbl.hCell, { flex: 2.8 }]}>ÜRÜN ADI</Text>
                  {isDesktop && <Text style={[tbl.hCell, { flex: 2.2 }]}>STOK SEVİYESİ</Text>}
                  <Text style={[tbl.hCell, { flex: 1, textAlign: 'center' }]}>MİKTAR</Text>
                  <Text style={[tbl.hCell, { flex: 1.2, textAlign: 'center' }]}>DURUM</Text>
                  <View style={{ width: 76 }} />
                </View>

                {groups.map(([groupKey, groupItems]) => {
                  const label      = groupKey === '__none__' ? 'Kategorisiz' : groupKey;
                  const collapsed  = collapsedGroups.has(groupKey);
                  const groupCrit  = groupItems.filter(i => i.quantity < i.min_quantity).length;

                  return (
                    <View key={groupKey} style={tbl.group}>
                      {/* Group header */}
                      <TouchableOpacity
                        style={tbl.groupHeader}
                        onPress={() => toggleGroup(groupKey)}
                        activeOpacity={0.75}
                      >
                        <AppIcon
                          name={collapsed ? 'chevron-right' : 'chevron-down'}
                          size={15}
                          color="#94A3B8"
                        />
                        <Text style={tbl.groupLabel}>{label}</Text>
                        <View style={tbl.groupCount}>
                          <Text style={tbl.groupCountText}>{groupItems.length}</Text>
                        </View>
                        {groupCrit > 0 && (
                          <View style={tbl.groupAlert}>
                            <AppIcon name="alert-outline" size={11} color="#D97706" />
                            <Text style={tbl.groupAlertText}>{groupCrit} kritik</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* Group rows */}
                      {!collapsed && groupItems.map((item, idx) => {
                        const isCritical = item.quantity < item.min_quantity;
                        const isEmpty    = item.quantity === 0;
                        const isLast     = idx === groupItems.length - 1;
                        const dotColor   = isEmpty ? '#EF4444' : isCritical ? '#F59E0B' : '#10B981';

                        return (
                          <View key={item.id} style={[tbl.row, !isLast && tbl.rowBorder]}>
                            {/* Left accent line */}
                            <View style={[tbl.accentLine, { backgroundColor: dotColor }]} />

                            <View style={[tbl.col, { flex: 2.8, paddingLeft: 10 }]}>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={tbl.name} numberOfLines={1}>{item.name}</Text>
                                  {item.usage_category === 'production' && (
                                    <View style={{
                                      paddingHorizontal: 6, paddingVertical: 1,
                                      borderRadius: 999,
                                      backgroundColor: '#EDE9FE',
                                    }}>
                                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#7C3AED', letterSpacing: 0.4 }}>
                                        ÜRETİM
                                      </Text>
                                    </View>
                                  )}
                                  {item.type && (
                                    <View style={{
                                      paddingHorizontal: 6, paddingVertical: 1,
                                      borderRadius: 999,
                                      backgroundColor: '#F1F5F9',
                                    }}>
                                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#475569', letterSpacing: 0.4 }}>
                                        {item.type.toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                  {/* 30 gün fire badge — sadece > 0 ise */}
                                  {(wasteMap[item.id]?.cost ?? 0) > 0 && (
                                    <View style={{
                                      flexDirection: 'row', alignItems: 'center', gap: 3,
                                      paddingHorizontal: 6, paddingVertical: 1,
                                      borderRadius: 999,
                                      backgroundColor: '#FEE2E2',
                                      borderWidth: 1, borderColor: '#FCA5A5',
                                    }}>
                                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626', letterSpacing: 0.3 }}>
                                        ⚠ {Math.round(wasteMap[item.id].cost).toLocaleString('tr-TR')} ₺
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                {(item.brand || item.unit || item.supplier || item.units_per_tooth) && (
                                  <Text style={tbl.meta} numberOfLines={1}>
                                    {[
                                      item.brand,
                                      item.unit,
                                      item.supplier,
                                      item.units_per_tooth ? `${item.units_per_tooth}/diş → ${item.consume_at_stage ?? 'MILLING'}` : null,
                                    ].filter(Boolean).join(' · ')}
                                  </Text>
                                )}
                              </View>
                            </View>
                            {isDesktop && (
                              <View style={{ flex: 2.2, paddingRight: 16, gap: 3 }}>
                                <StockBar quantity={item.quantity} min={item.min_quantity} />
                                <Text style={tbl.barLabel}>{item.quantity} / {item.min_quantity}{item.unit ? ` ${item.unit}` : ''}</Text>
                              </View>
                            )}
                            <View style={{ flex: 1, alignItems: 'center' }}>
                              <Text style={[tbl.cell, (isCritical || isEmpty) && { color: dotColor, fontWeight: '700' }]}>
                                {item.quantity}
                              </Text>
                            </View>
                            <View style={{ flex: 1.2, alignItems: 'center' }}>
                              <StatusBadge quantity={item.quantity} min={item.min_quantity} />
                            </View>
                            <View style={tbl.actions}>
                              <TouchableOpacity style={tbl.iconBtn} onPress={() => setMovModal({ visible: true, item })} activeOpacity={0.7}>
                                <AppIcon name="swap-horizontal" size={14} color={accentColor} />
                              </TouchableOpacity>
                              <TouchableOpacity style={tbl.iconBtn} onPress={() => setProductModal({ visible: true, item })} activeOpacity={0.7}>
                                <AppIcon name="edit-2" size={13} color="#6C6C70" />
                              </TouchableOpacity>
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
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
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

      {/* Filter Sheet */}
      {/* Fire bildirim modalı */}
      {labId && authProfile && (
        <WasteReportModal
          visible={wasteOpen}
          labId={labId}
          userId={authProfile.id}
          onClose={() => setWasteOpen(false)}
          onSaved={() => load(true)}
        />
      )}

      <Modal visible={showFilter} transparent animationType="fade" onRequestClose={() => setShowFilter(false)}>
        <TouchableOpacity style={fp.backdrop} activeOpacity={1} onPress={() => setShowFilter(false)}>
          <View style={fp.panel} onStartShouldSetResponder={() => true}>
            <View style={fp.header}>
              <View style={fp.headerLeft}>
                <AppIcon name={'tune-variant' as any} size={15} color="#0F172A" />
                <Text style={fp.headerTitle}>Filtrele</Text>
                {activeFilterCount > 0 && (
                  <View style={fp.countBadge}><Text style={fp.countBadgeText}>{activeFilterCount}</Text></View>
                )}
              </View>
              <TouchableOpacity onPress={() => { setDraftStatus('all'); setDraftCat('all'); setDraftBrand('all'); setDraftUsage('all'); }} activeOpacity={0.7}>
                <Text style={fp.clearText}>Temizle</Text>
              </TouchableOpacity>
            </View>
            <View style={fp.divider} />

            <View style={fp.section}>
              <Text style={fp.sectionLabel}>Durum</Text>
              <View style={fp.chipRow}>
                {([
                  { value: 'all', label: 'Tümü' },
                  { value: 'ok', label: 'Normal' },
                  { value: 'critical', label: 'Kritik' },
                  { value: 'empty', label: 'Tükendi' },
                ] as const).map(it => {
                  const active = draftStatus === it.value;
                  return (
                    <TouchableOpacity key={it.value} style={[fp.chip, active && fp.chipActive]} onPress={() => setDraftStatus(it.value)} activeOpacity={0.7}>
                      <Text style={[fp.chipText, active && fp.chipTextActive]}>{it.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={fp.divider} />
            <View style={fp.section}>
              <Text style={fp.sectionLabel}>Kullanım</Text>
              <View style={fp.chipRow}>
                {([
                  { value: 'all',        label: 'Tümü'    },
                  { value: 'production', label: 'Üretim'  },
                  { value: 'office',     label: 'Ofis'    },
                  { value: 'misc',       label: 'Diğer'   },
                ] as const).map(it => {
                  const active = draftUsage === it.value;
                  return (
                    <TouchableOpacity key={it.value} style={[fp.chip, active && fp.chipActive]} onPress={() => setDraftUsage(it.value)} activeOpacity={0.7}>
                      <Text style={[fp.chipText, active && fp.chipTextActive]}>{it.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {categories.length > 1 && (
              <>
                <View style={fp.divider} />
                <View style={fp.section}>
                  <Text style={fp.sectionLabel}>Kategori</Text>
                  <View style={fp.chipRow}>
                    {categories.map(cat => {
                      const active = draftCat === cat;
                      return (
                        <TouchableOpacity key={cat} style={[fp.chip, active && fp.chipActive]} onPress={() => setDraftCat(cat)} activeOpacity={0.7}>
                          <Text style={[fp.chipText, active && fp.chipTextActive]}>{cat === 'all' ? 'Tümü' : cat}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            )}

            {brands.length > 0 && (
              <>
                <View style={fp.divider} />
                <View style={fp.section}>
                  <Text style={fp.sectionLabel}>Marka</Text>
                  <View style={fp.chipRow}>
                    {(['all', ...brands]).map(b => {
                      const active = draftBrand === b;
                      return (
                        <TouchableOpacity key={b} style={[fp.chip, active && fp.chipActive]} onPress={() => setDraftBrand(b)} activeOpacity={0.7}>
                          <Text style={[fp.chipText, active && fp.chipTextActive]}>{b === 'all' ? 'Tümü' : b}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            )}

            <View style={fp.divider} />
            <View style={fp.footer}>
              <TouchableOpacity style={fp.cancelBtn} onPress={() => setShowFilter(false)} activeOpacity={0.7}>
                <Text style={fp.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[fp.applyBtn, { backgroundColor: accentColor }]} onPress={applyFilter} activeOpacity={0.8}>
                <Text style={fp.applyText}>Uygula</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#F1F5F9' },
  container: { padding: 20, paddingBottom: 60 },

  /* Tab bar + CTA row (Stitch) */
  tabBarRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  pageCta:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  pageCtaText:  { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  /* Stats header */
  statsCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, gap: 16, ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any) : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 }) },
  statsLeft:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statsIconBox:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statsLabel:    { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase' },
  statsValue:    { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  statsUnit:     { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  statsRight:    { flex: 1, gap: 6 },
  statsBar:      { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#F1F5F9' },
  statsBarSeg:   { height: 6 },
  statsLegend:   { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:     { width: 6, height: 6, borderRadius: 3 },
  legendText:    { fontSize: 11, color: '#64748B', fontWeight: '500' },

  /* Pill tab bar */
  tabBarWrap:    { marginBottom: 18 },
  tabBar: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  /* Toolbar */
  toolbar:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  searchWrap:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 12, height: 40, ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } as any) : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }) },
  searchWrapFocused:{ borderColor: '#CBD5E1' },
  searchInput:      { flex: 1, fontSize: 14, color: '#1C1C1E', height: 40, outlineStyle: 'none' } as any,

  filterBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  filterBtnActive:  { borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  filterBtnText:    { fontSize: 13, fontWeight: '600', color: '#64748B' },
  filterCount:      { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  filterCountText:  { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },

  addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  addBtnText:       { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  emptySub:   { fontSize: 13, color: '#AEAEB2' },
});

const tbl = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', marginBottom: 8, ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } as any) : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }) },
  hCell:     { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase' },

  group:       { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', overflow: 'hidden', marginBottom: 12, ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any) : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 }) } as any,
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FAFBFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  groupLabel:  { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 },
  groupCount:  { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  groupCountText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  groupAlert:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  groupAlertText: { fontSize: 11, fontWeight: '700', color: '#D97706' },

  row:        { flexDirection: 'row', alignItems: 'center', paddingLeft: 0, paddingRight: 16, paddingVertical: 9, minHeight: 42 },
  rowBorder:  { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  col:        { flexDirection: 'row', alignItems: 'center' },
  accentLine: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: 6, marginRight: 0 },
  barLabel:   { fontSize: 10, color: '#94A3B8', fontWeight: '500' },

  name:     { fontSize: 13, fontWeight: '600', color: '#1C1C1E', letterSpacing: -0.1 },
  meta:     { fontSize: 11, color: '#AEAEB2', marginTop: 1 },
  cell:     { fontSize: 13, color: '#374151', fontWeight: '500' },
  cellMuted:{ fontSize: 12, color: '#94A3B8' },

  catBadge:     { backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  catBadgeText: { fontSize: 11, fontWeight: '600', color: '#475569' },

  actions: { width: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  iconBtn: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
});

// ─── Modal styles ─────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:      { backgroundColor: '#FFFFFF', borderRadius: 14, width: '100%', maxWidth: 540, maxHeight: '92%', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any) : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 4 }) },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:      { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  closeBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  body:       { padding: 16 },
  sectionCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E9EEF4', padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#1E293B', marginBottom: 14 },
  fieldWrap:  { marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 },
  req:        { color: '#EF4444' },
  fieldInput: { borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF', outlineStyle: 'none' } as any,
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12 },
  errorText:  { fontSize: 13, color: '#DC2626', flex: 1 },
  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  deleteBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#FEE2E2', backgroundColor: '#FFF5F5' },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },
  cancelBtn:  { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn:    { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 80, justifyContent: 'center' },
  saveText:   { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  chip:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  chipText:     { fontSize: 12, fontWeight: '600', color: '#475569' },
  dropPanel:    { marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  dropSearch:   { paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0F172A', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', outlineStyle: 'none' } as any,
  dropItem:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
  dropItemActive:{ backgroundColor: '#F8FAFC' },
  dropItemText: { fontSize: 14, color: '#334155', fontWeight: '500' },
  dropAddItem:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  dropAddText:  { fontSize: 14, fontWeight: '600' },
  dropEmpty:    { paddingHorizontal: 14, paddingVertical: 14, fontSize: 13, color: '#94A3B8', textAlign: 'center' },
  dropClear:    { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 10 },
  dropClearText:{ fontSize: 13, color: '#94A3B8', fontWeight: '500' },
});

// ─── Movement modal styles ─────────────────────────────────────────────────────

const mv = StyleSheet.create({
  typeBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  typeBtnText: { fontSize: 12, fontWeight: '500', color: '#94A3B8' },
});

// ─── Filter panel styles ───────────────────────────────────────────────────────

const fp = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(15,23,42,0.3)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  panel:      { backgroundColor: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' } as any,
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:{ fontSize: 15, fontWeight: '700', color: '#0F172A' },
  countBadge: { backgroundColor: '#0F172A', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  clearText:  { fontSize: 13, fontWeight: '600', color: '#64748B' },
  divider:    { height: 1, backgroundColor: '#F1F5F9' },
  section:    { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase' },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: '#0F172A' },
  chipText:   { fontSize: 13, fontWeight: '500', color: '#64748B' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 20, paddingVertical: 16 },
  cancelBtn:  { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  applyBtn:   { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  applyText:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
