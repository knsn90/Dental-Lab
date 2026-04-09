import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, useWindowDimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Svg, { Circle, Path } from 'react-native-svg';
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import { StockMovementsScreen } from './StockMovementsScreen';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WarehouseRecord {
  id: string;
  name: string;
  location?: string;
  responsible?: string;
  phone?: string;
  notes?: string;
}

interface StockItem {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  unit?: string;
  category?: string;
  supplier?: string;
  brand?: string;
  warehouse_id?: string;
  warehouse?: string;
  barcode?: string;
  shelf_address?: string;
}

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
  existingWarehouses: WarehouseRecord[];
  onClose: () => void;
  onSaved: () => void;
}

function ProductModal({ visible, item, accentColor, existingCategories, existingBrands, existingWarehouses, onClose, onSaved }: ProductModalProps) {
  const isEdit = item !== null;
  const [name, setName]         = useState('');
  const [category, setCategory] = useState('');
  const [catSearch, setCatSearch]   = useState('');
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [brand, setBrand]       = useState('');
  const [brandSearch, setBrandSearch]   = useState('');
  const [brandDropOpen, setBrandDropOpen] = useState(false);
  const [warehouseId, setWarehouseId]   = useState<string>('');
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [warehouseDropOpen, setWarehouseDropOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [minQty, setMinQty]     = useState('');
  const [unit, setUnit]               = useState('');
  const [supplier, setSupplier]       = useState('');
  const [barcode, setBarcode]         = useState('');
  const [shelfAddress, setShelfAddress] = useState('');
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    if (visible) {
      setName(item?.name ?? '');
      setCategory(item?.category ?? '');
      setCatSearch(''); setCatDropOpen(false);
      setBrand(item?.brand ?? '');
      setBrandSearch(''); setBrandDropOpen(false);
      setWarehouseId(item?.warehouse_id ?? '');
      setWarehouseSearch(''); setWarehouseDropOpen(false);
      setQuantity(item ? String(item.quantity) : '');
      setMinQty(item ? String(item.min_quantity) : '');
      setUnit(item?.unit ?? '');
      setSupplier(item?.supplier ?? '');
      setBarcode(item?.barcode ?? '');
      setShelfAddress(item?.shelf_address ?? '');
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
      const payload = {
        name: name.trim(),
        category: category.trim() || null,
        brand: brandName,
        quantity: qty,
        min_quantity: min,
        unit: unit.trim() || null,
        supplier: supplier.trim() || null,
        warehouse_id: warehouseId || null,
        barcode: barcode.trim() || null,
        shelf_address: shelfAddress.trim() || null,
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
              <Feather name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>

            {/* ── Ürün Bilgileri ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Ürün Bilgileri</Text>

              {/* Satır 1 — Ürün Adı (tam genişlik) */}
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>ÜRÜN ADI <Text style={m.req}>*</Text></Text>
                <TextInput style={m.fieldInput} value={name} onChangeText={setName} placeholder="örn. Zirkonyum Blok" placeholderTextColor="#C7C7CC" />
              </View>

              {/* Satır 2 — Kategori | Marka */}
              <View style={m.row2}>
                {/* Kategori */}
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>KATEGORİ</Text>
                  <TouchableOpacity
                    style={[m.fieldInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                    onPress={() => { setCatDropOpen(v => !v); setBrandDropOpen(false); setWarehouseDropOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={category ? { fontSize: 14, color: '#0F172A' } : { fontSize: 14, color: '#C7C7CC' }} numberOfLines={1}>
                      {category || 'Seçin…'}
                    </Text>
                    <Feather name={catDropOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#94A3B8" />
                  </TouchableOpacity>
                  {catDropOpen && (
                    <View style={m.dropPanel}>
                      <TextInput style={m.dropSearch} value={catSearch} onChangeText={setCatSearch} placeholder="Ara veya yeni ekle…" placeholderTextColor="#C7C7CC" autoFocus />
                      <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                        {existingCategories.filter(c => !catSearch || c.toLowerCase().includes(catSearch.toLowerCase())).map(c => (
                          <TouchableOpacity key={c} style={[m.dropItem, category === c && m.dropItemActive]} onPress={() => { setCategory(c); setCatSearch(''); setCatDropOpen(false); }} activeOpacity={0.7}>
                            <Text style={[m.dropItemText, category === c && { color: accentColor, fontWeight: '700' }]}>{c}</Text>
                            {category === c && <Feather name="check" size={13} color={accentColor} />}
                          </TouchableOpacity>
                        ))}
                        {catSearch.trim() && !existingCategories.some(c => c.toLowerCase() === catSearch.trim().toLowerCase()) && (
                          <TouchableOpacity style={m.dropAddItem} onPress={() => { setCategory(catSearch.trim()); setCatSearch(''); setCatDropOpen(false); }} activeOpacity={0.7}>
                            <Feather name="plus-circle" size={14} color={accentColor} />
                            <Text style={[m.dropAddText, { color: accentColor }]}>"{catSearch.trim()}" ekle</Text>
                          </TouchableOpacity>
                        )}
                        {existingCategories.filter(c => !catSearch || c.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && !catSearch.trim() && (
                          <Text style={m.dropEmpty}>Henüz kategori yok</Text>
                        )}
                      </ScrollView>
                      {category && <TouchableOpacity style={m.dropClear} onPress={() => { setCategory(''); setCatDropOpen(false); }}><Text style={m.dropClearText}>Temizle</Text></TouchableOpacity>}
                    </View>
                  )}
                </View>

                {/* Marka */}
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>MARKA</Text>
                  <TouchableOpacity
                    style={[m.fieldInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                    onPress={() => { setBrandDropOpen(v => !v); setCatDropOpen(false); setWarehouseDropOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={brand ? { fontSize: 14, color: '#0F172A' } : { fontSize: 14, color: '#C7C7CC' }} numberOfLines={1}>
                      {brand || 'Seçin…'}
                    </Text>
                    <Feather name={brandDropOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#94A3B8" />
                  </TouchableOpacity>
                  {brandDropOpen && (
                    <View style={m.dropPanel}>
                      <TextInput style={m.dropSearch} value={brandSearch} onChangeText={setBrandSearch} placeholder="Ara veya yeni ekle…" placeholderTextColor="#C7C7CC" autoFocus />
                      <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                        {existingBrands.filter(b => !brandSearch || b.toLowerCase().includes(brandSearch.toLowerCase())).map(b => (
                          <TouchableOpacity key={b} style={[m.dropItem, brand === b && m.dropItemActive]} onPress={() => { setBrand(b); setBrandSearch(''); setBrandDropOpen(false); }} activeOpacity={0.7}>
                            <Text style={[m.dropItemText, brand === b && { color: accentColor, fontWeight: '700' }]}>{b}</Text>
                            {brand === b && <Feather name="check" size={13} color={accentColor} />}
                          </TouchableOpacity>
                        ))}
                        {brandSearch.trim() && !existingBrands.some(b => b.toLowerCase() === brandSearch.trim().toLowerCase()) && (
                          <TouchableOpacity style={m.dropAddItem} onPress={() => { setBrand(brandSearch.trim()); setBrandSearch(''); setBrandDropOpen(false); }} activeOpacity={0.7}>
                            <Feather name="plus-circle" size={14} color={accentColor} />
                            <Text style={[m.dropAddText, { color: accentColor }]}>"{brandSearch.trim()}" ekle</Text>
                          </TouchableOpacity>
                        )}
                        {existingBrands.filter(b => !brandSearch || b.toLowerCase().includes(brandSearch.toLowerCase())).length === 0 && !brandSearch.trim() && (
                          <Text style={m.dropEmpty}>Henüz marka yok</Text>
                        )}
                      </ScrollView>
                      {brand && <TouchableOpacity style={m.dropClear} onPress={() => { setBrand(''); setBrandDropOpen(false); }}><Text style={m.dropClearText}>Temizle</Text></TouchableOpacity>}
                    </View>
                  )}
                </View>
              </View>

              {/* Satır 3 — Depo | Raf Adresi */}
              <View style={m.row2}>
                {/* Depo */}
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>DEPO</Text>
                  <TouchableOpacity
                    style={[m.fieldInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                    onPress={() => { setWarehouseDropOpen(v => !v); setCatDropOpen(false); setBrandDropOpen(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={warehouseId ? { fontSize: 14, color: '#0F172A' } : { fontSize: 14, color: '#C7C7CC' }} numberOfLines={1}>
                      {warehouseId ? (existingWarehouses.find(w => w.id === warehouseId)?.name ?? 'Seçin…') : 'Seçin…'}
                    </Text>
                    <Feather name={warehouseDropOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#94A3B8" />
                  </TouchableOpacity>
                  {warehouseDropOpen && (
                    <View style={m.dropPanel}>
                      <TextInput style={m.dropSearch} value={warehouseSearch} onChangeText={setWarehouseSearch} placeholder="Depo ara…" placeholderTextColor="#C7C7CC" autoFocus />
                      <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                        {existingWarehouses.filter(w => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase())).map(w => (
                          <TouchableOpacity key={w.id} style={[m.dropItem, warehouseId === w.id && m.dropItemActive]} onPress={() => { setWarehouseId(w.id); setWarehouseSearch(''); setWarehouseDropOpen(false); }} activeOpacity={0.7}>
                            <Text style={[m.dropItemText, warehouseId === w.id && { color: accentColor, fontWeight: '700' }]}>{w.name}</Text>
                            {warehouseId === w.id && <Feather name="check" size={13} color={accentColor} />}
                          </TouchableOpacity>
                        ))}
                        {existingWarehouses.filter(w => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase())).length === 0 && (
                          <Text style={m.dropEmpty}>Henüz depo yok</Text>
                        )}
                      </ScrollView>
                      {warehouseId && <TouchableOpacity style={m.dropClear} onPress={() => { setWarehouseId(''); setWarehouseDropOpen(false); }}><Text style={m.dropClearText}>Temizle</Text></TouchableOpacity>}
                    </View>
                  )}
                </View>

                {/* Raf Adresi */}
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>RAF ADRESİ</Text>
                  <TextInput style={m.fieldInput} value={shelfAddress} onChangeText={setShelfAddress} placeholder="A-Raf 3, Bölme 2…" placeholderTextColor="#C7C7CC" />
                </View>
              </View>

              {/* Satır 4 — Birim | Tedarikçi */}
              <View style={m.row2}>
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>BİRİM</Text>
                  <TextInput style={m.fieldInput} value={unit} onChangeText={setUnit} placeholder="adet / ml / gr…" placeholderTextColor="#C7C7CC" />
                </View>
                <View style={[m.fieldWrap, { flex: 1 }]}>
                  <Text style={m.fieldLabel}>TEDARİKÇİ</Text>
                  <TextInput style={m.fieldInput} value={supplier} onChangeText={setSupplier} placeholder="Tedarikçi firma…" placeholderTextColor="#C7C7CC" />
                </View>
              </View>

              {/* Satır 5 — Barkod (tam genişlik) */}
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>BARKOD</Text>
                <View style={m.barcodeRow}>
                  <TextInput style={[m.fieldInput, { flex: 1, marginBottom: 0 }]} value={barcode} onChangeText={setBarcode} placeholder="Barkod numarası…" placeholderTextColor="#C7C7CC" />
                  <View style={m.barcodeIcon}>
                    <MaterialCommunityIcons name="barcode-scan" size={18} color="#94A3B8" />
                  </View>
                </View>
              </View>
            </View>

            {/* ── Stok Miktarları ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Stok Miktarları</Text>
              <View style={m.row2}>
                <View style={[m.fieldWrap, { flex: 1, marginBottom: 0 }]}>
                  <Text style={m.fieldLabel}>{isEdit ? 'MEVCUT MİKTAR' : 'BAŞLANGIÇ MİKTARI'} <Text style={m.req}>*</Text></Text>
                  <TextInput style={m.fieldInput} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" placeholderTextColor="#C7C7CC" />
                </View>
                <View style={[m.fieldWrap, { flex: 1, marginBottom: 0 }]}>
                  <Text style={m.fieldLabel}>MİNİMUM STOK <Text style={m.req}>*</Text></Text>
                  <TextInput style={m.fieldInput} value={minQty} onChangeText={setMinQty} keyboardType="numeric" placeholder="0" placeholderTextColor="#C7C7CC" />
                </View>
              </View>
              {error ? (
                <View style={[m.errorBox, { marginTop: 12 }]}>
                  <Feather name="alert-circle" size={14} color="#DC2626" />
                  <Text style={m.errorText}>{error}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={m.footer}>
            {isEdit && (
              <TouchableOpacity style={m.deleteBtn} onPress={handleDelete} disabled={deleting}>
                {deleting ? <ActivityIndicator size="small" color="#DC2626" /> : <Feather name="trash-2" size={14} color="#DC2626" />}
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
  const [selectedId, setSelectedId]       = useState('');
  const [pickerOpen, setPickerOpen]       = useState(false);
  const [pickerSearch, setPickerSearch]   = useState('');
  const [type, setType]                   = useState<MovType>(defaultType);
  const [qty, setQty]                     = useState('');
  const [unitOverride, setUnitOverride]   = useState('');
  const [lotNo, setLotNo]                 = useState('');
  const [referenceNo, setReferenceNo]     = useState('');
  const [unitPrice, setUnitPrice]         = useState('');
  const [note, setNote]                   = useState('');
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');

  // Technician picker
  const [labUsers, setLabUsers]             = useState<LabUser[]>([]);
  const [techPickerOpen, setTechPickerOpen] = useState(false);
  const [techSearch, setTechSearch]         = useState('');
  const [techId, setTechId]                 = useState('');

  const resolvedItem = standalone ? (items.find(i => i.id === selectedId) ?? null) : item;
  const effectiveUnit = unitOverride.trim() || resolvedItem?.unit || '';

  useEffect(() => {
    if (visible) {
      setType(defaultType); setQty(''); setNote(''); setError('');
      setUnitOverride(''); setLotNo(''); setReferenceNo(''); setUnitPrice('');
      setSelectedId(''); setPickerSearch(''); setPickerOpen(false);
      setTechId(''); setTechSearch(''); setTechPickerOpen(false);
      supabase.from('profiles').select('id, full_name, user_type').in('user_type', ['lab', 'admin']).order('full_name').then(({ data }) => {
        setLabUsers((data ?? []) as LabUser[]);
      });
    }
  }, [visible, defaultType]);

  const pickerItems = pickerSearch.trim()
    ? items.filter(i => i.name.toLowerCase().includes(pickerSearch.toLowerCase()))
    : items;

  const selectedTech = labUsers.find(t => t.id === techId) ?? null;

  // Live stock preview
  const amount = parseFloat(qty) || 0;
  const currentStock = resolvedItem?.quantity ?? 0;
  const nextStock = type === 'IN' ? currentStock + amount : Math.max(0, currentStock - amount);
  const stockDelta = nextStock - currentStock;

  const handleSave = async () => {
    if (!resolvedItem) { setError('Ürün seçin'); return; }
    if (!amount || amount <= 0) { setError('Geçerli bir miktar girin'); return; }
    setSaving(true); setError('');
    try {
      await supabase.from('stock_items').update({ quantity: nextStock }).eq('id', resolvedItem.id);
      await supabase.from('stock_movements').insert({
        item_name:       resolvedItem.name,
        type,
        quantity:        amount,
        unit:            effectiveUnit || null,
        note:            note.trim() || null,
        technician_name: selectedTech?.full_name ?? null,
        lot_no:          lotNo.trim() || null,
        reference_no:    referenceNo.trim() || null,
        unit_price:      unitPrice.trim() ? parseFloat(unitPrice) : null,
      });
      onSaved(); onClose();
    } catch (e: any) {
      setError(e.message ?? 'İşlem hatası');
    } finally { setSaving(false); }
  };

  const typeCfg = MOV_TYPES.find(t => t.key === type)!;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={[m.sheet, { maxWidth: 560 }]}>

          {/* ── Header ── */}
          <View style={mv.mvHeader}>
            <View style={[mv.mvHeaderIcon, { backgroundColor: typeCfg.bg }]}>
              <MaterialCommunityIcons name={typeCfg.icon as any} size={20} color={typeCfg.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={mv.mvTitle}>Stok Hareketi</Text>
              {resolvedItem && (
                <Text style={mv.mvSubtitle} numberOfLines={1}>{resolvedItem.name}</Text>
              )}
            </View>
            <TouchableOpacity style={m.closeBtn} onPress={onClose}>
              <Feather name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>

            {/* ── 1. Ürün Seç (standalone) ── */}
            {standalone && (
              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Ürün</Text>
                <TouchableOpacity
                  style={[m.fieldInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setPickerOpen(v => !v)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={resolvedItem ? { fontSize: 14, color: '#0F172A', fontWeight: '500' } : { fontSize: 14, color: '#C7C7CC' }} numberOfLines={1}>
                      {resolvedItem ? resolvedItem.name : 'Ürün seçin…'}
                    </Text>
                    {resolvedItem && (
                      <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                        Mevcut stok: {resolvedItem.quantity}{resolvedItem.unit ? ` ${resolvedItem.unit}` : ''}
                      </Text>
                    )}
                  </View>
                  <Feather name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#94A3B8" />
                </TouchableOpacity>
                {pickerOpen && (
                  <View style={m.dropPanel}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                      <Feather name="search" size={13} color="#AEAEB2" />
                      <TextInput
                        style={{ flex: 1, fontSize: 13, color: '#0F172A', outlineStyle: 'none' } as any}
                        value={pickerSearch} onChangeText={setPickerSearch}
                        placeholder="Ürün ara…" placeholderTextColor="#AEAEB2" autoFocus
                      />
                    </View>
                    <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                      {pickerItems.map((i, idx) => {
                        const pct = i.min_quantity > 0 ? i.quantity / i.min_quantity : 1;
                        const dot = i.quantity === 0 ? '#EF4444' : pct < 1 ? '#F59E0B' : '#10B981';
                        return (
                          <TouchableOpacity
                            key={i.id}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: idx < pickerItems.length - 1 ? 1 : 0, borderBottomColor: '#F8FAFC', backgroundColor: selectedId === i.id ? '#F8FAFC' : 'transparent' }}
                            onPress={() => { setSelectedId(i.id); setPickerOpen(false); setPickerSearch(''); setUnitOverride(''); }}
                            activeOpacity={0.7}
                          >
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot, flexShrink: 0 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: selectedId === i.id ? '600' : '400' }}>{i.name}</Text>
                              <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{i.quantity}{i.unit ? ` ${i.unit}` : ''} stok{i.category ? ` · ${i.category}` : ''}</Text>
                            </View>
                            {selectedId === i.id && <Feather name="check" size={14} color={accentColor} />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* ── 2. İşlem Tipi ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>İşlem Tipi</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {MOV_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[mv.typeCard, type === t.key && { backgroundColor: t.bg, borderColor: t.color, borderWidth: 2 }]}
                    onPress={() => setType(t.key)}
                    activeOpacity={0.8}
                  >
                    <View style={[mv.typeIconCircle, { backgroundColor: type === t.key ? t.color : '#F1F5F9' }]}>
                      <MaterialCommunityIcons name={t.icon as any} size={18} color={type === t.key ? '#FFFFFF' : '#94A3B8'} />
                    </View>
                    <Text style={[mv.typeLabel, type === t.key && { color: t.color, fontWeight: '700' }]}>{t.label}</Text>
                    {t.key === 'IN'    && <Text style={[mv.typeDesc, type === t.key && { color: t.color }]}>Depoya ekle</Text>}
                    {t.key === 'OUT'   && <Text style={[mv.typeDesc, type === t.key && { color: t.color }]}>Depodan çıkar</Text>}
                    {t.key === 'WASTE' && <Text style={[mv.typeDesc, type === t.key && { color: t.color }]}>Fire/zarar kaydet</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── 3. Miktar + Birim ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Miktar</Text>
              <View style={m.row2}>
                <View style={[m.fieldWrap, { flex: 2, marginBottom: 0 }]}>
                  <Text style={m.fieldLabel}>MİKTAR <Text style={m.req}>*</Text></Text>
                  <TextInput
                    style={[m.fieldInput, { fontSize: 18, fontWeight: '600' }]}
                    value={qty} onChangeText={setQty}
                    keyboardType="numeric" placeholder="0"
                    placeholderTextColor="#C7C7CC"
                  />
                </View>
                <View style={[m.fieldWrap, { flex: 1, marginBottom: 0 }]}>
                  <Text style={m.fieldLabel}>BİRİM</Text>
                  <TextInput
                    style={m.fieldInput}
                    value={unitOverride || resolvedItem?.unit || ''}
                    onChangeText={setUnitOverride}
                    placeholder="adet"
                    placeholderTextColor="#C7C7CC"
                  />
                </View>
              </View>

              {/* Stok önizlemesi */}
              {resolvedItem && amount > 0 && (
                <View style={mv.previewBox}>
                  <View style={mv.previewItem}>
                    <Text style={mv.previewLabel}>Mevcut</Text>
                    <Text style={mv.previewVal}>{currentStock}{effectiveUnit ? ` ${effectiveUnit}` : ''}</Text>
                  </View>
                  <View style={mv.previewArrow}>
                    <Feather name="arrow-right" size={14} color={typeCfg.color} />
                  </View>
                  <View style={mv.previewItem}>
                    <Text style={mv.previewLabel}>Sonrası</Text>
                    <Text style={[mv.previewVal, { color: typeCfg.color }]}>{nextStock}{effectiveUnit ? ` ${effectiveUnit}` : ''}</Text>
                  </View>
                  <View style={[mv.previewDelta, { backgroundColor: typeCfg.bg }]}>
                    <Text style={[mv.previewDeltaText, { color: typeCfg.color }]}>
                      {stockDelta >= 0 ? '+' : ''}{stockDelta}{effectiveUnit ? ` ${effectiveUnit}` : ''}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── 4. Teknisyen + Referans ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Atama & Referans</Text>

              {labUsers.length > 0 && (
                <View style={m.fieldWrap}>
                  <Text style={m.fieldLabel}>
                    {type === 'IN' ? 'TESLİM EDEN' : type === 'WASTE' ? 'FİRE OLUŞTURAN' : 'VERİLEN TEKNİSYEN'}
                  </Text>
                  <TouchableOpacity
                    style={[m.fieldInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                    onPress={() => setTechPickerOpen(v => !v)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      {selectedTech ? (
                        <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: '500' }} numberOfLines={1}>{selectedTech.full_name}</Text>
                      ) : (
                        <Text style={{ fontSize: 14, color: '#C7C7CC' }}>Seçin (isteğe bağlı)</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {selectedTech && (
                        <TouchableOpacity onPress={(e: any) => { e.stopPropagation?.(); setTechId(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="x" size={13} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                      <Feather name={techPickerOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#94A3B8" />
                    </View>
                  </TouchableOpacity>
                  {techPickerOpen && (
                    <View style={m.dropPanel}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                        <Feather name="search" size={13} color="#AEAEB2" />
                        <TextInput style={{ flex: 1, fontSize: 13, color: '#0F172A', outlineStyle: 'none' } as any}
                          value={techSearch} onChangeText={setTechSearch} placeholder="Teknisyen ara…" placeholderTextColor="#AEAEB2" autoFocus />
                      </View>
                      <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
                        {labUsers.filter(t => !techSearch.trim() || t.full_name.toLowerCase().includes(techSearch.toLowerCase()))
                          .map((t, idx, arr) => (
                            <TouchableOpacity key={t.id}
                              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: '#F8FAFC', backgroundColor: techId === t.id ? '#F8FAFC' : 'transparent' }}
                              onPress={() => { setTechId(t.id); setTechPickerOpen(false); setTechSearch(''); }} activeOpacity={0.7}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: accentColor + '18', alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>{t.full_name.charAt(0).toUpperCase()}</Text>
                                </View>
                                <View>
                                  <Text style={{ fontSize: 14, color: '#0F172A', fontWeight: techId === t.id ? '600' : '400' }}>{t.full_name}</Text>
                                  <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{t.user_type === 'admin' ? 'Yönetici' : 'Lab'}</Text>
                                </View>
                              </View>
                              {techId === t.id && <Feather name="check" size={14} color={accentColor} />}
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}

              <View style={m.row2}>
                <View style={[m.fieldWrap, { flex: 1, marginBottom: 0 }]}>
                  <Text style={m.fieldLabel}>REFERANS NO</Text>
                  <TextInput style={m.fieldInput} value={referenceNo} onChangeText={setReferenceNo}
                    placeholder="Fatura / İş emri…" placeholderTextColor="#C7C7CC" />
                </View>
                <View style={[m.fieldWrap, { flex: 1, marginBottom: 0 }]}>
                  <Text style={m.fieldLabel}>LOT / SERİ NO</Text>
                  <TextInput style={m.fieldInput} value={lotNo} onChangeText={setLotNo}
                    placeholder="Lot numarası…" placeholderTextColor="#C7C7CC" />
                </View>
              </View>
            </View>

            {/* ── 5. Maliyet + Not ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Ek Bilgiler</Text>
              {type === 'IN' && (
                <View style={m.fieldWrap}>
                  <Text style={m.fieldLabel}>BİRİM MALİYET (₺)</Text>
                  <TextInput style={m.fieldInput} value={unitPrice} onChangeText={setUnitPrice}
                    keyboardType="numeric" placeholder="0.00" placeholderTextColor="#C7C7CC" />
                </View>
              )}
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>NOT / AÇIKLAMA</Text>
                <TextInput
                  style={[m.fieldInput, { minHeight: 64, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={note} onChangeText={setNote}
                  placeholder="İsteğe bağlı açıklama…" placeholderTextColor="#C7C7CC" multiline
                />
              </View>
              {error ? (
                <View style={[m.errorBox, { marginTop: 10 }]}>
                  <Feather name="alert-circle" size={14} color="#DC2626" />
                  <Text style={m.errorText}>{error}</Text>
                </View>
              ) : null}
            </View>

          </ScrollView>

          {/* ── Footer ── */}
          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.saveBtn, { backgroundColor: typeCfg.color, minWidth: 130 }]}
              onPress={handleSave} disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name={typeCfg.icon as any} size={15} color="#FFFFFF" />
                  <Text style={m.saveText}>{typeCfg.label} Kaydet</Text>
                </>
              )}
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
        <MaterialCommunityIcons name="package-variant-closed" size={44} color="#E2E8F0" />
        <Text style={db.emptyTitle}>Henüz ürün yok</Text>
        <Text style={db.emptySub}>Stok yönetimine başlamak için ilk ürününüzü ekleyin.</Text>
        <TouchableOpacity style={[db.emptyBtn, { backgroundColor: accentColor }]} onPress={onAddProduct}>
          <Feather name="plus" size={14} color="#FFFFFF" />
          <Text style={db.emptyBtnText}>İlk Ürünü Ekle</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>

      {/* ── Hızlı İşlemler ── */}
      <View style={db.qaGrid}>
        <TouchableOpacity style={[db.qaCardNew, { backgroundColor: accentColor }]} onPress={onAddProduct} activeOpacity={0.85}>
          <View style={db.qaIconCircleWhite}>
            <Feather name="plus" size={20} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={db.qaCardTitleWhite}>Yeni Ürün</Text>
            <Text style={db.qaCardSubWhite}>Stoka ekle</Text>
          </View>
          <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <TouchableOpacity style={db.qaCardNewGray} onPress={() => onMovement(null, 'IN')} activeOpacity={0.85}>
          <View style={db.qaIconCircleGray}>
            <Feather name="refresh-cw" size={20} color="#475569" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={db.qaCardTitleGray}>Stok Hareketi</Text>
            <Text style={db.qaCardSubGray}>Giriş / çıkış / fire</Text>
          </View>
          <Feather name="chevron-right" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      </View>

      {/* ── 4 Stat kartları (Pixelfit tarzı — renkli arka plan) ── */}
      <View style={db.statRow}>
        {([
          { label: 'Toplam Ürün', value: total,           sub: `${catStats.length} kategori`,                              bg: '#EEF2FF', iconBg: '#6366F1', icon: 'package'        as const, trend: null,              trendPos: true  },
          { label: 'Normal',      value: normal.length,   sub: 'stok yeterli',                                             bg: '#ECFDF5', iconBg: '#059669', icon: 'check-circle'   as const, trend: total > 0 ? `%${Math.round(normal.length/total*100)}` : null, trendPos: true  },
          { label: 'Kritik',      value: critical.length, sub: 'minimum altında',                                          bg: '#FFFBEB', iconBg: '#F59E0B', icon: 'alert-triangle' as const, trend: critical.length > 0 ? `+${critical.length}` : null, trendPos: false },
          { label: 'Tükendi',     value: empty.length,    sub: 'stoksuz ürün',                                             bg: '#FFF1F2', iconBg: '#EF4444', icon: 'x-circle'       as const, trend: empty.length > 0     ? `+${empty.length}`     : null, trendPos: false },
        ] as const).map((s, i) => (
          <View key={i} style={[db.statCard, { backgroundColor: s.bg }]}>
            <View style={db.statCardTop}>
              <View style={[db.statIcon, { backgroundColor: s.iconBg }]}>
                <Feather name={s.icon} size={15} color="#FFFFFF" />
              </View>
              {s.trend && (
                <View style={[db.statBadge, { backgroundColor: s.trendPos ? '#D1FAE5' : '#FEE2E2' }]}>
                  <Feather name={s.trendPos ? 'trending-up' : 'trending-down'} size={9} color={s.trendPos ? '#059669' : '#DC2626'} />
                  <Text style={[db.statBadgeText, { color: s.trendPos ? '#059669' : '#DC2626' }]}>{s.trend}</Text>
                </View>
              )}
            </View>
            <Text style={db.statValue}>{s.value}</Text>
            <Text style={db.statLabel}>{s.label}</Text>
            <Text style={db.statSub}>{s.sub}</Text>
          </View>
        ))}
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
                  <Feather name={isEmpty ? 'x-circle' : 'alert-triangle'} size={14} color={clr} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={db.urgName} numberOfLines={1}>{item.name}</Text>
                  <Text style={db.urgMeta}>
                    {isEmpty ? 'Stok tükendi' : `${item.quantity}${item.unit ? ` ${item.unit}` : ''} kaldı · min: ${item.min_quantity}`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[db.urgActionBtn, { backgroundColor: clr + '15', borderColor: clr + '30' }]} onPress={() => onMovement(item, 'IN')} activeOpacity={0.8}>
                    <Feather name="plus" size={12} color={clr} />
                  </TouchableOpacity>
                  <TouchableOpacity style={db.urgEditBtn} onPress={() => onEditProduct(item)} activeOpacity={0.8}>
                    <Feather name="edit-2" size={12} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
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
  qaGrid:            { flexDirection: 'column', gap: 10 },
  qaCard:            { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 18, borderWidth: 1, borderColor: '#F1F5F9' },
  qaCardPrimary:     { borderWidth: 0 },
  qaIconWrap:        { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  qaIconWrapWhite:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  qaCardLabel:       { fontSize: 12, fontWeight: '700', color: '#334155', textAlign: 'center', lineHeight: 17 },
  qaCardLabelWhite:  { fontSize: 12, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', lineHeight: 17 },

  // New horizontal action cards
  qaCardNew:         { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16 },
  qaCardNewGray:     { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9' },
  qaIconCircleWhite: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)', flexShrink: 0 },
  qaIconCircleGray:  { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', flexShrink: 0 },
  qaCardTitleWhite:  { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  qaCardSubWhite:    { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  qaCardTitleGray:   { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  qaCardSubGray:     { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  // Stat cards (Pixelfit style)
  statRow:       { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  statCard:      { flex: 1, minWidth: 130, borderRadius: 16, padding: 16, gap: 3 },
  statCardTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  statIcon:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 100 },
  statBadgeText: { fontSize: 10, fontWeight: '700' },
  statValue:     { fontSize: 30, fontWeight: '800', color: '#0F172A', letterSpacing: -1 },
  statLabel:     { fontSize: 13, fontWeight: '700', color: '#334155' },
  statSub:       { fontSize: 11, color: '#94A3B8', fontWeight: '500' },

  // Category bar chart
  barTrack:    { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  barFill:     { height: 8, borderRadius: 4 },
  barCatLabel: { fontSize: 13, fontWeight: '600', color: '#334155', flex: 1 },
  barCatCount: { fontSize: 12, fontWeight: '700' },

  // Generic card
  card:         { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', padding: 16 },
  cardHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  mutedText:    { fontSize: 12, color: '#94A3B8' },

  // Red badge
  redBadge:     { backgroundColor: '#FEE2E2', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 3 },
  redBadgeText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  // Urgent list
  urgRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  urgDivider:    { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  urgIconBox:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  urgName:       { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  urgMeta:       { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginTop: 1 },
  urgBadge:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  urgBadgeText:  { fontSize: 10, fontWeight: '700' },
  urgActionBtn:  { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  urgEditBtn:    { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },

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

// ─── ImportModal ─────────────────────────────────────────────────────────────

type ImportRow = Record<string, string>;
type FieldKey = 'name' | 'category' | 'brand' | 'quantity' | 'min_quantity' | 'unit' | 'supplier' | 'skip';
const FIELD_OPTIONS: { key: FieldKey; label: string }[] = [
  { key: 'skip',         label: '— Atla —' },
  { key: 'name',         label: 'Ürün Adı *' },
  { key: 'category',     label: 'Kategori' },
  { key: 'brand',        label: 'Marka' },
  { key: 'quantity',     label: 'Miktar' },
  { key: 'min_quantity', label: 'Min Stok' },
  { key: 'unit',         label: 'Birim' },
  { key: 'supplier',     label: 'Tedarikçi' },
];

function ImportModal({ visible, accentColor, onClose, onImported }: {
  visible: boolean; accentColor: string; onClose: () => void; onImported: () => void;
}) {
  const [step, setStep]             = useState<'upload' | 'map' | 'preview'>('upload');
  const [headers, setHeaders]       = useState<string[]>([]);
  const [rows, setRows]             = useState<ImportRow[]>([]);
  const [mapping, setMapping]       = useState<Record<string, FieldKey>>({});
  const [importing, setImporting]   = useState(false);
  const [result, setResult]         = useState<{ ok: number; skip: number } | null>(null);
  const [error, setError]           = useState('');
  const fileInputRef                = useRef<any>(null);

  useEffect(() => {
    if (visible) { setStep('upload'); setHeaders([]); setRows([]); setMapping({}); setResult(null); setError(''); }
  }, [visible]);

  const applyAutoMap = (hdrs: string[]) => {
    const autoMap: Record<string, FieldKey> = {};
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '');
    hdrs.forEach(h => {
      const n = normalize(h);
      if      (n.includes('ad') || n.includes('ürün') || n.includes('name') || n.includes('urun'))                          autoMap[h] = 'name';
      else if (n.includes('kategori') || n.includes('category') || n.includes('grup'))                                      autoMap[h] = 'category';
      else if (n.includes('marka') || n.includes('brand'))                                                                   autoMap[h] = 'brand';
      else if ((n.includes('miktar') || n.includes('qty') || n.includes('quantity') || n.includes('adet')) && !n.includes('min')) autoMap[h] = 'quantity';
      else if (n.includes('min') || n.includes('minimum'))                                                                   autoMap[h] = 'min_quantity';
      else if (n.includes('birim') || n.includes('unit'))                                                                    autoMap[h] = 'unit';
      else if (n.includes('tedarik') || n.includes('supplier') || n.includes('firma'))                                      autoMap[h] = 'supplier';
      else                                                                                                                   autoMap[h] = 'skip';
    });
    return autoMap;
  };

  const processRows = (hdrs: string[], dataRows: ImportRow[]) => {
    setHeaders(hdrs);
    setRows(dataRows);
    setMapping(applyAutoMap(hdrs));
    setError('');
    setStep('map');
  };

  const parseExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!json.length) { setError('Dosya boş veya okunamadı'); return; }
        const hdrs = (json[0] as any[]).map((h: any) => String(h ?? '').trim()).filter(Boolean);
        if (!hdrs.length) { setError('Başlık satırı bulunamadı'); return; }
        const dataRows: ImportRow[] = json.slice(1)
          .filter(r => r.some((c: any) => String(c ?? '').trim()))
          .map(r => Object.fromEntries(hdrs.map((h, i) => [h, String(r[i] ?? '').trim()])));
        processRows(hdrs, dataRows);
      } catch (e: any) { setError('Dosya okunamadı: ' + (e.message ?? 'Bilinmeyen hata')); }
    };
    reader.readAsArrayBuffer(file);
  };

  const loadPdfJs = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) { resolve((window as any).pdfjsLib); return; }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        const lib = (window as any).pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(lib);
      };
      script.onerror = () => reject(new Error('PDF kütüphanesi yüklenemedi'));
      document.head.appendChild(script);
    });
  };

  const parsePdf = async (file: File) => {
    try {
      setError('');
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

      interface TextItem { x: number; y: number; text: string; page: number }
      const allItems: TextItem[] = [];

      for (let p = 1; p <= Math.min(pdf.numPages, 10); p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        content.items.forEach((item: any) => {
          if (!item.str?.trim()) return;
          const tx = pdfjs.Util.transform(viewport.transform, item.transform);
          allItems.push({ x: Math.round(tx[4]), y: Math.round(tx[5]), text: item.str.trim(), page: p });
        });
      }

      if (!allItems.length) { setError("PDF'den metin çıkarılamadı (taranmış görsel olabilir)"); return; }

      // Group items into rows by Y position (6px tolerance)
      const rowMap = new Map<number, TextItem[]>();
      allItems.forEach(item => {
        let foundY = -1;
        rowMap.forEach((_, y) => { if (Math.abs(y - item.y) <= 6) foundY = y; });
        const key = foundY >= 0 ? foundY : item.y;
        if (!rowMap.has(key)) rowMap.set(key, []);
        rowMap.get(key)!.push(item);
      });

      // Sort rows: by page then top-to-bottom (PDF Y is bottom-up)
      const sortedRows = Array.from(rowMap.entries())
        .sort(([, ia], [, ib]) => {
          if (ia[0].page !== ib[0].page) return ia[0].page - ib[0].page;
          return ib[0].y - ia[0].y;
        })
        .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.text));

      const colCounts = sortedRows.map(r => r.length);
      const maxCols = Math.max(...colCounts);
      const headerRowIdx = colCounts.findIndex(c => c === maxCols);
      if (maxCols < 1) { setError('Tablo yapısı bulunamadı'); return; }

      const hdrs = sortedRows[headerRowIdx].map((h, i) => h || `Sütun ${i + 1}`);
      const dataRows: ImportRow[] = sortedRows
        .slice(headerRowIdx + 1)
        .filter(r => r.some(c => c.trim()))
        .map(r => Object.fromEntries(hdrs.map((h, i) => [h, r[i] ?? ''])));

      if (!dataRows.length) { setError('Veri satırı bulunamadı'); return; }
      processRows(hdrs, dataRows);
    } catch (e: any) {
      setError('PDF okunamadı: ' + (e.message ?? 'Bilinmeyen hata'));
    }
  };

  const parseFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) parsePdf(file);
    else parseExcel(file);
  };

  const downloadTemplate = () => {
    const sampleData = [
      ['Ürün Adı', 'Kategori', 'Marka', 'Miktar', 'Min Stok', 'Birim', 'Tedarikçi'],
      ['Zirkonyum Blok A1 14mm', 'Malzeme', '3M', '50', '10', 'adet', 'Dental Türkiye A.Ş.'],
      ['IPS e.max Press', 'Seramik', 'Ivoclar', '30', '5', 'kutu', 'Ivoclar TR'],
      ['Wax Karving', 'Sarf', 'GC', '20', '5', 'adet', ''],
      ['Aljinat', 'Sarf', '', '15', '3', 'kg', 'Med Dental'],
      ['Aşındırma Diski', 'Ekipman', 'Shofu', '100', '20', 'adet', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stok Şablonu');
    XLSX.writeFile(wb, 'stok_sablonu.xlsx');
  };

  const handleFilePick = () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv,.pdf';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
    };
    input.click();
  };

  const handleImport = async () => {
    const nameCol = Object.entries(mapping).find(([, v]) => v === 'name')?.[0];
    if (!nameCol) { setError('"Ürün Adı" sütunu seçilmedi'); return; }

    setImporting(true); setError('');
    let ok = 0; let skip = 0;

    for (const row of rows) {
      const name = row[nameCol]?.trim();
      if (!name) { skip++; continue; }

      const payload: any = { name };
      Object.entries(mapping).forEach(([col, field]) => {
        if (field === 'skip' || field === 'name') return;
        const val = row[col]?.trim();
        if (!val) return;
        if (field === 'quantity' || field === 'min_quantity') {
          const n = parseFloat(val.replace(',', '.'));
          if (!isNaN(n)) payload[field] = n;
        } else {
          payload[field] = val;
        }
      });
      if (payload.quantity === undefined) payload.quantity = 0;
      if (payload.min_quantity === undefined) payload.min_quantity = 0;

      const { error: e } = await supabase.from('stock_items')
        .upsert(payload, { onConflict: 'name', ignoreDuplicates: false });
      if (e) skip++; else ok++;
    }

    setImporting(false);
    setResult({ ok, skip });
    setStep('preview');
    onImported();
  };

  const previewRows = rows.slice(0, 5);
  const nameCol = Object.entries(mapping).find(([, v]) => v === 'name')?.[0];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={[m.sheet, { maxWidth: 600 }]}>
          {/* Header */}
          <View style={m.header}>
            <View>
              <Text style={m.title}>Toplu İçe Aktar</Text>
              <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                {step === 'upload' ? 'Excel / CSV dosyası seç' : step === 'map' ? `${rows.length} satır bulundu — sütunları eşleştir` : 'İçe aktarma tamamlandı'}
              </Text>
            </View>
            <TouchableOpacity style={m.closeBtn} onPress={onClose}>
              <Feather name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Step 1: Upload */}
            {step === 'upload' && (
              <View style={imp.uploadZone}>
                <View style={[imp.uploadIcon, { backgroundColor: accentColor + '12' }]}>
                  <Feather name="upload" size={28} color={accentColor} />
                </View>
                <Text style={imp.uploadTitle}>Dosya Seç</Text>
                <Text style={imp.uploadSub}>Excel (.xlsx, .xls), CSV veya PDF formatı desteklenir</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity style={[imp.uploadBtn, { backgroundColor: accentColor, marginTop: 0 }]} onPress={handleFilePick} activeOpacity={0.85}>
                    <Feather name="upload" size={15} color="#FFFFFF" />
                    <Text style={imp.uploadBtnText}>Dosya Seç</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={imp.templateBtn} onPress={downloadTemplate} activeOpacity={0.85}>
                    <Feather name="download" size={15} color="#475569" />
                    <Text style={imp.templateBtnText}>Şablon İndir</Text>
                  </TouchableOpacity>
                </View>
                <View style={imp.tipsBox}>
                  <Text style={imp.tipsTitle}>💡 İpuçları</Text>
                  <Text style={imp.tipText}>• Excel/CSV: İlk satır sütun başlıkları olmalı</Text>
                  <Text style={imp.tipText}>• PDF: Tablo içeren fiyat listesi formatı desteklenir</Text>
                  <Text style={imp.tipText}>• Ürün adı zorunlu, diğer alanlar isteğe bağlı</Text>
                  <Text style={imp.tipText}>• Aynı isimde ürün varsa güncellenir</Text>
                </View>
                {error ? <Text style={[imp.errorText, { marginTop: 12 }]}>{error}</Text> : null}
              </View>
            )}

            {/* Step 2: Column mapping */}
            {step === 'map' && (
              <View style={{ gap: 12 }}>
                <View style={imp.infoRow}>
                  <Feather name="info" size={13} color="#6366F1" />
                  <Text style={imp.infoText}>Her sütunu hangi alana aktaracağını seç. "Ürün Adı" zorunlu.</Text>
                </View>
                <View style={m.sectionCard}>
                  <Text style={m.sectionTitle}>Sütun Eşleştirme</Text>
                  {headers.map(h => (
                    <View key={h} style={imp.mapRow}>
                      <View style={imp.mapColName}>
                        <Text style={imp.mapColText} numberOfLines={1}>{h}</Text>
                        <Text style={imp.mapColSample} numberOfLines={1}>
                          {previewRows[0]?.[h] ? `örn: ${previewRows[0][h]}` : '—'}
                        </Text>
                      </View>
                      <Feather name="arrow-right" size={13} color="#CBD5E1" />
                      <View style={imp.mapSelect}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {FIELD_OPTIONS.map(opt => (
                              <TouchableOpacity
                                key={opt.key}
                                style={[imp.mapChip, mapping[h] === opt.key && { backgroundColor: accentColor, borderColor: accentColor }]}
                                onPress={() => setMapping(prev => ({ ...prev, [h]: opt.key }))}
                                activeOpacity={0.7}
                              >
                                <Text style={[imp.mapChipText, mapping[h] === opt.key && { color: '#FFFFFF' }]}>{opt.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Preview */}
                <View style={m.sectionCard}>
                  <Text style={m.sectionTitle}>Önizleme (ilk 5 satır)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View>
                      <View style={[imp.previewRow, { backgroundColor: '#F8FAFC' }]}>
                        {headers.filter(h => mapping[h] !== 'skip').map(h => (
                          <Text key={h} style={imp.previewHdr}>{FIELD_OPTIONS.find(f => f.key === mapping[h])?.label ?? h}</Text>
                        ))}
                      </View>
                      {previewRows.map((row, i) => (
                        <View key={i} style={[imp.previewRow, i % 2 === 1 && { backgroundColor: '#FAFAFA' }]}>
                          {headers.filter(h => mapping[h] !== 'skip').map(h => (
                            <Text key={h} style={imp.previewCell} numberOfLines={1}>{row[h] || '—'}</Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                {error ? <Text style={imp.errorText}>{error}</Text> : null}
              </View>
            )}

            {/* Step 3: Result */}
            {step === 'preview' && result && (
              <View style={imp.resultWrap}>
                <View style={[imp.resultIcon, { backgroundColor: '#ECFDF5' }]}>
                  <Feather name="check-circle" size={32} color="#059669" />
                </View>
                <Text style={imp.resultTitle}>Aktarım Tamamlandı</Text>
                <View style={imp.resultStats}>
                  <View style={[imp.resultStat, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={[imp.resultStatNum, { color: '#059669' }]}>{result.ok}</Text>
                    <Text style={imp.resultStatLabel}>Başarılı</Text>
                  </View>
                  <View style={[imp.resultStat, { backgroundColor: '#FFF1F2' }]}>
                    <Text style={[imp.resultStatNum, { color: '#DC2626' }]}>{result.skip}</Text>
                    <Text style={imp.resultStatLabel}>Atlanan</Text>
                  </View>
                </View>
              </View>
            )}

          </ScrollView>

          <View style={m.footer}>
            {step === 'map' && (
              <TouchableOpacity style={m.cancelBtn} onPress={() => setStep('upload')} activeOpacity={0.8}>
                <Text style={m.cancelText}>Geri</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {step === 'preview' ? (
              <TouchableOpacity style={[m.saveBtn, { backgroundColor: accentColor }]} onPress={onClose}>
                <Text style={m.saveText}>Kapat</Text>
              </TouchableOpacity>
            ) : step === 'map' ? (
              <>
                <TouchableOpacity style={m.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                  <Text style={m.cancelText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[m.saveBtn, { backgroundColor: nameCol ? accentColor : '#CBD5E1' }]}
                  onPress={handleImport}
                  disabled={importing || !nameCol}
                  activeOpacity={0.85}
                >
                  {importing
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <><Feather name="download" size={14} color="#FFFFFF" /><Text style={m.saveText}>Aktar ({rows.length})</Text></>
                  }
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={m.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={m.cancelText}>İptal</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const imp = StyleSheet.create({
  uploadZone:      { alignItems: 'center', paddingVertical: 32, gap: 10 },
  uploadIcon:      { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  uploadTitle:     { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  uploadSub:       { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
  uploadBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  uploadBtnText:   { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  templateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  templateBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  tipsBox:         { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, gap: 6, width: '100%', marginTop: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  tipsTitle:       { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 2 },
  tipText:         { fontSize: 12, color: '#64748B' },
  errorText:       { fontSize: 12, color: '#DC2626', textAlign: 'center' },
  infoRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EEF2FF', borderRadius: 10, padding: 12 },
  infoText:        { fontSize: 13, color: '#4338CA', flex: 1 },
  mapRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  mapColName:      { width: 110, flexShrink: 0 },
  mapColText:      { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  mapColSample:    { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  mapSelect:       { flex: 1 },
  mapChip:         { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  mapChipText:     { fontSize: 11, fontWeight: '600', color: '#475569' },
  previewRow:      { flexDirection: 'row' },
  previewHdr:      { width: 120, paddingHorizontal: 8, paddingVertical: 7, fontSize: 11, fontWeight: '700', color: '#475569' },
  previewCell:     { width: 120, paddingHorizontal: 8, paddingVertical: 7, fontSize: 12, color: '#0F172A' },
  resultWrap:      { alignItems: 'center', paddingVertical: 32, gap: 12 },
  resultIcon:      { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  resultTitle:     { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  resultStats:     { flexDirection: 'row', gap: 16, marginTop: 8 },
  resultStat:      { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, gap: 4 },
  resultStatNum:   { fontSize: 28, fontWeight: '800' },
  resultStatLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
});

// ─── StockSettings ───────────────────────────────────────────────────────────

// ── WarehouseModal ────────────────────────────────────────────────────────────

function WarehouseModal({ visible, warehouse, accentColor, onClose, onSaved }: {
  visible: boolean; warehouse: WarehouseRecord | null; accentColor: string;
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = warehouse !== null;
  const [name, setName]               = useState('');
  const [location, setLocation]       = useState('');
  const [responsible, setResponsible] = useState('');
  const [phone, setPhone]             = useState('');
  const [notes, setNotes]             = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    if (visible) {
      setName(warehouse?.name ?? '');
      setLocation(warehouse?.location ?? '');
      setResponsible(warehouse?.responsible ?? '');
      setPhone(warehouse?.phone ?? '');
      setNotes(warehouse?.notes ?? '');
      setError('');
    }
  }, [visible, warehouse]);

  const handleSave = async () => {
    const n = name.trim();
    if (!n) { setError('Depo adı zorunlu'); return; }
    setSaving(true); setError('');
    const payload: any = {
      name: n,
      location: location.trim() || null,
      responsible: responsible.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit) {
        const { error: e } = await supabase.from('warehouses').update(payload).eq('id', warehouse!.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('warehouses').insert(payload);
        if (e) throw e;
      }
      onSaved(); onClose();
    } catch (e: any) { setError(e.message ?? 'Kayıt hatası'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>{isEdit ? 'Depoyu Düzenle' : 'Yeni Depo Ekle'}</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose}>
              <Feather name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} showsVerticalScrollIndicator={false}>
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Depo Bilgileri</Text>
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>DEPO ADI <Text style={m.req}>*</Text></Text>
                <TextInput style={m.fieldInput} value={name} onChangeText={t => { setName(t); setError(''); }}
                  placeholder="örn. Ana Depo, B Deposu…" placeholderTextColor="#C7C7CC" />
              </View>
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>KONUM</Text>
                <TextInput style={m.fieldInput} value={location} onChangeText={setLocation}
                  placeholder="Kat, oda veya adres…" placeholderTextColor="#C7C7CC" />
              </View>
            </View>

            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Sorumlu</Text>
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>SORUMLU KİŞİ</Text>
                <TextInput style={m.fieldInput} value={responsible} onChangeText={setResponsible}
                  placeholder="Ad Soyad…" placeholderTextColor="#C7C7CC" />
              </View>
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>TELEFON</Text>
                <TextInput style={m.fieldInput} value={phone} onChangeText={setPhone}
                  placeholder="+90 5XX…" placeholderTextColor="#C7C7CC" keyboardType="phone-pad" />
              </View>
            </View>

            <View style={[m.sectionCard, { marginBottom: 0 }]}>
              <Text style={m.sectionTitle}>Notlar</Text>
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>NOTLAR</Text>
                <TextInput style={[m.fieldInput, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={notes} onChangeText={setNotes}
                  placeholder="Depo hakkında ek bilgi…"
                  placeholderTextColor="#C7C7CC" multiline />
              </View>
            </View>

            {error ? (
              <View style={[m.errorBox, { marginTop: 12 }]}>
                <Feather name="alert-circle" size={14} color="#DC2626" />
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

// ── WarehouseList ─────────────────────────────────────────────────────────────

function WarehouseList({ accentColor, onReload }: { accentColor: string; onReload: () => void }) {
  const [rows, setRows]       = useState<WarehouseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<{ visible: boolean; warehouse: WarehouseRecord | null }>({ visible: false, warehouse: null });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('warehouses').select('*').order('name');
    setRows((data ?? []) as WarehouseRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleDelete = async (id: string) => {
    await supabase.from('warehouses').delete().eq('id', id);
    await fetchRows(); onReload();
  };

  return (
    <>
      <View style={ss.card}>
        <View style={ss.cardHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[ss.headIcon, { backgroundColor: accentColor + '12' }]}>
              <Feather name="home" size={14} color={accentColor} />
            </View>
            <Text style={ss.cardTitle}>Depolar</Text>
            <View style={ss.countBadge}><Text style={ss.countText}>{rows.length}</Text></View>
          </View>
          <TouchableOpacity style={[ss.addBtn, { backgroundColor: accentColor }]}
            onPress={() => setModal({ visible: true, warehouse: null })} activeOpacity={0.85}>
            <Feather name="plus" size={13} color="#FFFFFF" />
            <Text style={ss.addBtnText}>Ekle</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 20 }} />
        ) : rows.length === 0 ? (
          <Text style={ss.emptyText}>Henüz depo yok</Text>
        ) : (
          rows.map((w, idx) => {
            const isLast = idx === rows.length - 1;
            return (
              <View key={w.id} style={[ss.row, !isLast && ss.rowBorder]}>
                <View style={ss.brandIconBox}>
                  <Feather name="home" size={13} color="#64748B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ss.rowName} numberOfLines={1}>{w.name}</Text>
                  {(w.location || w.responsible) && (
                    <Text style={ss.rowMeta} numberOfLines={1}>
                      {[w.location, w.responsible].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
                <TouchableOpacity style={ss.iconBtn} onPress={() => setModal({ visible: true, warehouse: w })} activeOpacity={0.7}>
                  <Feather name="edit-2" size={13} color="#64748B" />
                </TouchableOpacity>
                <TouchableOpacity style={[ss.iconBtn, { backgroundColor: '#FFF1F2' }]} onPress={() => handleDelete(w.id)} activeOpacity={0.7}>
                  <Feather name="trash-2" size={13} color="#DC2626" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      <WarehouseModal
        visible={modal.visible}
        warehouse={modal.warehouse}
        accentColor={accentColor}
        onClose={() => setModal({ visible: false, warehouse: null })}
        onSaved={() => { fetchRows(); onReload(); }}
      />
    </>
  );
}

interface LabUser {
  id: string;
  full_name: string;
  user_type: string;
}

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
              <Feather name="x" size={16} color="#64748B" />
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
                <Feather name="alert-circle" size={14} color="#DC2626" />
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
              <Feather name="tag" size={14} color={accentColor} />
            </View>
            <Text style={ss.cardTitle}>Markalar</Text>
            <View style={ss.countBadge}><Text style={ss.countText}>{brands.length}</Text></View>
          </View>
          <TouchableOpacity style={[ss.addBtn, { backgroundColor: accentColor }]}
            onPress={() => setModal({ visible: true, brand: null })} activeOpacity={0.85}>
            <Feather name="plus" size={13} color="#FFFFFF" />
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
                  <Feather name="tag" size={13} color="#64748B" />
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
                  <Feather name="edit-2" size={13} color="#64748B" />
                </TouchableOpacity>
                <TouchableOpacity style={[ss.iconBtn, { backgroundColor: '#FFF1F2' }]} onPress={() => handleDelete(b.id, b.name)} activeOpacity={0.7}>
                  <Feather name="trash-2" size={13} color="#DC2626" />
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
            <Feather name="grid" size={14} color={accentColor} />
          </View>
          <Text style={ss.cardTitle}>Kategoriler</Text>
          <View style={ss.countBadge}><Text style={ss.countText}>{rows.length}</Text></View>
        </View>
        <TouchableOpacity style={[ss.addBtn, { backgroundColor: accentColor }]}
          onPress={() => { setAddMode(true); setAddText(''); setError(''); setEditName(null); }} activeOpacity={0.85}>
          <Feather name="plus" size={13} color="#FFFFFF" />
          <Text style={ss.addBtnText}>Ekle</Text>
        </TouchableOpacity>
      </View>

      {addMode && (
        <View style={ss.inputRow}>
          <TextInput style={ss.rowInput} value={addText} onChangeText={t => { setAddText(t); setError(''); }}
            placeholder="Kategori adı…" placeholderTextColor="#C7C7CC" autoFocus onSubmitEditing={handleAdd} />
          <TouchableOpacity style={[ss.rowActionBtn, { backgroundColor: accentColor }]} onPress={handleAdd} disabled={saving} activeOpacity={0.8}>
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Feather name="check" size={14} color="#FFFFFF" />}
          </TouchableOpacity>
          <TouchableOpacity style={ss.rowCancelBtn} onPress={() => { setAddMode(false); setError(''); }} activeOpacity={0.8}>
            <Feather name="x" size={14} color="#94A3B8" />
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
                    {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Feather name="check" size={14} color="#FFFFFF" />}
                  </TouchableOpacity>
                  <TouchableOpacity style={ss.rowCancelBtn} onPress={() => { setEditName(null); setError(''); }} activeOpacity={0.8}>
                    <Feather name="x" size={14} color="#94A3B8" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={ss.rowName} numberOfLines={1}>{name}</Text>
                  <TouchableOpacity style={ss.iconBtn} onPress={() => { setEditName(name); setEditText(name); setError(''); setAddMode(false); }} activeOpacity={0.7}>
                    <Feather name="edit-2" size={13} color="#64748B" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[ss.iconBtn, { backgroundColor: '#FFF1F2' }]} onPress={() => handleDelete(name)} activeOpacity={0.7}>
                    <Feather name="trash-2" size={13} color="#DC2626" />
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
      <WarehouseList accentColor={accentColor} onReload={onReload} />
      <BrandsList accentColor={accentColor} onReload={onReload} />
      <CategoryList accentColor={accentColor} onReload={onReload} />
    </View>
  );
}

const ss = StyleSheet.create({
  card:         { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden' },
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
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [tableExists, setTableExists]   = useState(true);
  const [brands, setBrands]               = useState<string[]>([]);
  const [dbCategories, setDbCategories]   = useState<string[]>([]);
  const [warehouses, setWarehouses]       = useState<WarehouseRecord[]>([]);

  const [search, setSearch]             = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchFocused, setSearchFocused]   = useState(false);

  const [showFilter, setShowFilter]         = useState(false);
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>('all');
  const [catFilter, setCatFilter]           = useState('all');
  const [brandFilter, setBrandFilter]       = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [draftStatus, setDraftStatus]       = useState<StatusFilter>('all');
  const [draftCat, setDraftCat]             = useState('all');
  const [draftBrand, setDraftBrand]         = useState('all');
  const [draftWarehouse, setDraftWarehouse] = useState('all');

  const [productModal, setProductModal] = useState<{ visible: boolean; item: StockItem | null }>({ visible: false, item: null });
  const [movModal, setMovModal]         = useState<{ visible: boolean; item: StockItem | null; defaultType?: MovType }>({ visible: false, item: null });
  const [importModal, setImportModal]   = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [itemsRes, brandsRes, catsRes, warehousesRes] = await Promise.all([
        supabase.from('stock_items').select('*').order('name'),
        supabase.from('brands').select('name').order('name'),
        supabase.from('categories').select('name').order('name'),
        supabase.from('warehouses').select('*').order('name'),
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
      try { if (!warehousesRes.error && warehousesRes.data) setWarehouses(warehousesRes.data as WarehouseRecord[]); } catch {}
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
    if (q && !item.name.toLowerCase().includes(q) && !item.category?.toLowerCase().includes(q) && !item.brand?.toLowerCase().includes(q)) return false;
    if (catFilter !== 'all' && item.category !== catFilter) return false;
    if (brandFilter !== 'all' && item.brand !== brandFilter) return false;
    if (warehouseFilter !== 'all' && item.warehouse_id !== warehouseFilter) return false;
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
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (catFilter !== 'all' ? 1 : 0) + (brandFilter !== 'all' ? 1 : 0) + (warehouseFilter !== 'all' ? 1 : 0);

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

  const openFilter = () => { setDraftStatus(statusFilter); setDraftCat(catFilter); setDraftBrand(brandFilter); setDraftWarehouse(warehouseFilter); setShowFilter(true); };
  const applyFilter = () => { setStatusFilter(draftStatus); setCatFilter(draftCat); setBrandFilter(draftBrand); setWarehouseFilter(draftWarehouse); setShowFilter(false); };

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

        {/* ── Pill tab bar ── */}
        <View style={s.tabBarWrap}>
          <View style={s.tabBar}>
            {([
              { value: 'dashboard', label: 'Genel Bakış' },
              { value: 'list',      label: 'Stok Listesi' },
              { value: 'movements', label: 'Hareketler' },
              { value: 'settings',  label: 'Ayarlar' },
            ] as const).map(t => {
              const active = tab === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[s.tabItem, active && s.tabItemActive]}
                  onPress={() => setTab(t.value)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.tabText, active && s.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
          <>
            <View style={[s.toolbar, { justifyContent: 'flex-end' }]}>
              <TouchableOpacity
                style={[s.addBtn, { backgroundColor: accentColor }]}
                onPress={() => setMovModal({ visible: true, item: null })}
                activeOpacity={0.8}
              >
                <Feather name="plus" size={15} color="#FFFFFF" />
                <Text style={s.addBtnText}>Kayıt Ekle</Text>
              </TouchableOpacity>
            </View>
            <StockMovementsScreen />
          </>
        ) : loading ? (
          <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
        ) : !tableExists ? (
          <View style={s.empty}>
            <MaterialCommunityIcons name="database-off-outline" size={40} color="#E5E7EB" />
            <Text style={s.emptyTitle}>Stok modülü kurulmadı</Text>
            <Text style={s.emptySub}>Supabase'de "stock_items" tablosu oluştuğunda veriler görünür.</Text>
          </View>
        ) : (
          <>
            {/* ── Toolbar ── */}
            <View style={s.toolbar}>
              <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
                <Feather name="search" size={15} color={searchFocused ? '#0F172A' : '#AEAEB2'} />
                <TextInput
                  style={s.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Ürün ara…"
                  placeholderTextColor="#AEAEB2"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Feather name="x-circle" size={14} color="#AEAEB2" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity style={[s.filterBtn, activeFilterCount > 0 && s.filterBtnActive]} onPress={openFilter} activeOpacity={0.8}>
                <MaterialCommunityIcons name={'tune-variant' as any} size={15} color={activeFilterCount > 0 ? accentColor : '#64748B'} />
                <Text style={[s.filterBtnText, activeFilterCount > 0 && { color: accentColor }]}>Filtrele</Text>
                {activeFilterCount > 0 && (
                  <View style={[s.filterCount, { backgroundColor: accentColor }]}>
                    <Text style={s.filterCountText}>{activeFilterCount}</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.importBtn}
                onPress={() => setImportModal(true)}
                activeOpacity={0.8}
              >
                <Feather name="upload" size={15} color="#475569" />
                <Text style={s.importBtnText}>İçe Aktar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.addBtn, { backgroundColor: accentColor }]}
                onPress={() => setProductModal({ visible: true, item: null })}
                activeOpacity={0.8}
              >
                <Feather name="plus" size={15} color="#FFFFFF" />
                <Text style={s.addBtnText}>Yeni Ürün</Text>
              </TouchableOpacity>
            </View>

            {/* ── Table ── */}
            {filtered.length === 0 ? (
              <View style={s.empty}>
                <Feather name={total === 0 ? 'package' : 'search'} size={36} color="#E5E7EB" />
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
                        <Feather
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
                            <MaterialCommunityIcons name="alert-outline" size={11} color="#D97706" />
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
                                <Text style={tbl.name} numberOfLines={1}>{item.name}</Text>
                                {(item.brand || item.unit || item.supplier) && (
                                  <Text style={tbl.meta} numberOfLines={1}>
                                    {[item.brand, item.unit, item.supplier].filter(Boolean).join(' · ')}
                                  </Text>
                                )}
                                {item.warehouse_id && (() => {
                                  const wh = warehouses.find(w => w.id === item.warehouse_id);
                                  const parts = [wh?.name, item.shelf_address].filter(Boolean);
                                  return parts.length > 0 ? (
                                    <Text style={tbl.meta} numberOfLines={1}>
                                      <MaterialCommunityIcons name="map-marker-outline" size={10} color="#94A3B8" />
                                      {' '}{parts.join(' › ')}
                                    </Text>
                                  ) : null;
                                })()}
                                {item.barcode ? (
                                  <Text style={tbl.meta} numberOfLines={1}>
                                    <MaterialCommunityIcons name="barcode" size={10} color="#94A3B8" />
                                    {' '}{item.barcode}
                                  </Text>
                                ) : null}
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
                                <MaterialCommunityIcons name="swap-horizontal" size={14} color={accentColor} />
                              </TouchableOpacity>
                              <TouchableOpacity style={tbl.iconBtn} onPress={() => setProductModal({ visible: true, item })} activeOpacity={0.7}>
                                <Feather name="edit-2" size={13} color="#6C6C70" />
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
        existingWarehouses={warehouses}
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
      <ImportModal
        visible={importModal}
        accentColor={accentColor}
        onClose={() => setImportModal(false)}
        onImported={load}
      />

      {/* Filter Sheet */}
      <Modal visible={showFilter} transparent animationType="fade" onRequestClose={() => setShowFilter(false)}>
        <TouchableOpacity style={fp.backdrop} activeOpacity={1} onPress={() => setShowFilter(false)}>
          <View style={fp.panel} onStartShouldSetResponder={() => true}>
            <View style={fp.header}>
              <View style={fp.headerLeft}>
                <MaterialCommunityIcons name={'tune-variant' as any} size={15} color="#0F172A" />
                <Text style={fp.headerTitle}>Filtrele</Text>
                {activeFilterCount > 0 && (
                  <View style={fp.countBadge}><Text style={fp.countBadgeText}>{activeFilterCount}</Text></View>
                )}
              </View>
              <TouchableOpacity onPress={() => { setDraftStatus('all'); setDraftCat('all'); setDraftBrand('all'); setDraftWarehouse('all'); }} activeOpacity={0.7}>
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

            {warehouses.length > 0 && (
              <>
                <View style={fp.divider} />
                <View style={fp.section}>
                  <Text style={fp.sectionLabel}>Depo</Text>
                  <View style={fp.chipRow}>
                    {([{ id: 'all', name: 'Tümü' }, ...warehouses]).map(w => {
                      const active = draftWarehouse === w.id;
                      return (
                        <TouchableOpacity key={w.id} style={[fp.chip, active && fp.chipActive]} onPress={() => setDraftWarehouse(w.id)} activeOpacity={0.7}>
                          <Text style={[fp.chipText, active && fp.chipTextActive]}>{w.name}</Text>
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
  safe:      { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 20, paddingBottom: 60 },

  /* Stats header */
  statsCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFBFC', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, gap: 16 },
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
  tabBar:        { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#F1F5F9', borderRadius: 100, padding: 3, gap: 2 },
  tabItem:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100 },
  tabItemActive: { backgroundColor: '#FFFFFF', boxShadow: '0 1px 6px rgba(15,23,42,0.10)' } as any,
  tabText:       { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  tabTextActive: { fontSize: 13, fontWeight: '700', color: '#0F172A' },

  /* Toolbar */
  toolbar:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  searchWrap:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 12, height: 40 },
  searchWrapFocused:{ borderColor: '#CBD5E1' },
  searchInput:      { flex: 1, fontSize: 14, color: '#1C1C1E', height: 40, outlineStyle: 'none' } as any,

  filterBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  filterBtnActive:  { borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  filterBtnText:    { fontSize: 13, fontWeight: '600', color: '#64748B' },
  filterCount:      { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  filterCountText:  { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },

  addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  addBtnText:       { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  importBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  importBtnText:    { fontSize: 13, fontWeight: '600', color: '#475569' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  emptySub:   { fontSize: 13, color: '#AEAEB2' },
});

const tbl = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 8 },
  hCell:     { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase' },

  group:       { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden', marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as any,
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
  sheet:      { backgroundColor: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 780, maxHeight: '92%', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 48 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:      { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  closeBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  body:       { padding: 16 },
  sectionCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E9EEF4', padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#1E293B', marginBottom: 14 },
  fieldWrap:  { marginBottom: 12 },
  row2:       { flexDirection: 'row', gap: 14 },
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
  barcodeRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barcodeIcon:  { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
});

// ─── Movement modal styles ─────────────────────────────────────────────────────

const mv = StyleSheet.create({
  // Header
  mvHeader:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  mvHeaderIcon:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mvTitle:        { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  mvSubtitle:     { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  // Type cards
  typeCard:       { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FAFAFA' },
  typeIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  typeLabel:      { fontSize: 13, fontWeight: '600', color: '#475569' },
  typeDesc:       { fontSize: 10, color: '#94A3B8', textAlign: 'center' },

  // Stock preview
  previewBox:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, padding: 14, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  previewItem:      { alignItems: 'center', gap: 3 },
  previewLabel:     { fontSize: 10, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  previewVal:       { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  previewArrow:     { flex: 1, alignItems: 'center' },
  previewDelta:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  previewDeltaText: { fontSize: 13, fontWeight: '700' },
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
