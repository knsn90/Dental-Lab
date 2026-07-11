/**
 * PurchaseFormModal — Malzeme alımı / inventory intake.
 *
 * Patterns §13 form, ama invoice-first yaklaşımı:
 *   • SECTION A — Fatura bilgisi (supplier, no, tarih, currency, KDV, ödeme, dosya)
 *   • SECTION B — Satır kalemleri (table-like dynamic rows)
 *   • Footer: subtotal + KDV + toplam preview
 *
 * Save → create_purchase_invoice RPC atomic transaction.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput, ScrollView} from 'react-native';
import {
  X, Check, Receipt, Plus, Trash2, ChevronDown, ChevronUp, Search,
  Package, Building2, AlertCircle, FileUp, Sparkles,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { MoneyInput } from '../../../core/money/MoneyInput';
import { DatePicker } from '../../../core/ui/DatePicker';
import { Currency, SUPPORTED_CURRENCIES, formatMoney } from '../../../core/money/currency';
import { supabase } from '../../../core/api/supabase';
import { listSuppliers, createSupplier, type Supplier } from '../../suppliers/api';
import { createPurchaseInvoice, type PurchasePaymentMethod, type PurchaseLineInput } from '../api';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface Line {
  id: string;                  // local row id (uuid)
  item_id: string | null;      // mevcut stock_items.id
  item_name: string;
  quantity: string;
  unit: string;
  unit_price: string;          // string for input
  vat_rate: string;            // satır KDV % (string for input). '' → header default kullanılır
  brand?: string;              // opsiyonel: yeni ürün için marka
  category?: string;           // opsiyonel: yeni ürün için kategori
  item_kind?: 'consumable' | 'equipment';  // 'equipment' → demirbaş, sarf değil
  model?: string;              // sadece equipment için
  equipment_category?: string; // cihaz kategorisi
  needs_review?: boolean;      // OCR şüpheli → kullanıcıya sor
}

interface StockItemLite {
  id: string;
  name: string;
  unit: string | null;
  brand?: string | null;
  category?: string | null;
}

interface Props {
  visible: boolean;
  accentColor?: string;
  onClose: () => void;
  onSaved: () => void;
}

const PAYMENT_METHODS: { v: PurchasePaymentMethod; l: string }[] = [
  { v: 'cash',         l: 'Nakit' },
  { v: 'transfer',     l: 'Havale' },
  { v: 'check',        l: 'Çek' },
  { v: 'card',         l: 'Kart' },
  { v: 'open_account', l: 'Açık hesap' },
];

const newLine = (defaultVat = ''): Line => ({
  id: Math.random().toString(36).slice(2),
  item_id: null,
  item_name: '',
  quantity: '',
  unit: 'adet',
  unit_price: '',
  vat_rate: defaultVat,
});

export function PurchaseFormModal({ visible, accentColor = '#0A0A0A', onClose, onSaved }: Props) {
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;

  // ── Header state ──
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<StockItemLite[]>([]);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [vatRate, setVatRate] = useState('20');
  const [exchangeRate, setExchangeRate] = useState('');   // fatura kuru (boş → DB'den oku)
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>('open_account');
  const [notes, setNotes] = useState('');

  // ── Lines ──
  const [lines, setLines] = useState<Line[]>([newLine()]);

  // ── Misc ──
  const [saving, setSaving] = useState(false);
  // Senkron re-entrancy guard — disabled={saving} async olduğundan çok hızlı
  // çift tıkta ikinci çağrı RPC'yi tekrar tetikleyebiliyordu (çift fatura/2× stok).
  const savingRef = useRef(false);
  const stopSaving = () => { savingRef.current = false; setSaving(false); };
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  // PDF arşivleme — parse sonrası kullanıcı isterse Storage'a yükle (varsayılan kapalı)
  const [parsedPdfFile, setParsedPdfFile] = useState<File | null>(null);
  const [archivePdf, setArchivePdf]       = useState(false);

  // ── PDF Yükle + OCR ──
  const handleParseInvoice = async (file: File) => {
    setError(''); setParseInfo(null); setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      // base64'e çevir
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const pdf_base64 = btoa(binary);

      const { data, error: fnErr } = await supabase.functions.invoke('parse-invoice', {
        body: { pdf_base64 },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.ok) throw new Error(data?.error ?? 'Parse başarısız');

      const d = data.data;
      // Form'u doldur
      if (d.supplier_name) setSupplierName(d.supplier_name);
      if (d.invoice_number) setInvoiceNumber(d.invoice_number);
      if (d.invoice_date)   setInvoiceDate(d.invoice_date);
      if (d.currency && ['TRY','USD','EUR'].includes(d.currency)) setCurrency(d.currency as Currency);
      if (d.vat_rate != null) setVatRate(String(d.vat_rate));
      if (d.exchange_rate != null) setExchangeRate(String(d.exchange_rate));
      if (Array.isArray(d.lines) && d.lines.length > 0) {
        setLines(d.lines.map((l: any) => {
          const rawKind = String(l.item_kind ?? 'consumable').toLowerCase();
          const isUnknown = rawKind === 'unknown';
          const kind: 'consumable' | 'equipment' = rawKind === 'equipment' ? 'equipment' : 'consumable';
          return {
            id: Math.random().toString(36).slice(2),
            item_id: null,
            item_name: String(l.item_name ?? ''),
            quantity: String(l.quantity ?? ''),
            unit: l.unit ?? 'adet',
            unit_price: String(l.unit_price ?? ''),
            vat_rate: l.vat_rate != null ? String(l.vat_rate) : '',
            brand: l.brand ? String(l.brand) : undefined,
            category: l.category ? String(l.category) : undefined,
            item_kind: kind,
            model: l.model ? String(l.model) : undefined,
            equipment_category: l.equipment_category ? String(l.equipment_category) : undefined,
            needs_review: isUnknown,
          };
        }));
      }
      setParseInfo(data.source === 'efatura'
        ? 'e-Fatura XML parse edildi'
        : `OCR ile çıkarıldı (${d.lines?.length ?? 0} satır)`);
      // Parse başarılı → dosyayı bellekte tut, kullanıcı arşivle isterse save'de yüklenecek
      setParsedPdfFile(file);
      setArchivePdf(false);
    } catch (e: any) {
      setError('PDF işlenemedi: ' + (e?.message ?? 'bilinmeyen hata'));
    } finally {
      setParsing(false);
    }
  };

  const handlePickPdf = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) handleParseInvoice(f);
    };
    input.click();
  };

  useEffect(() => {
    if (!visible) return;
    // Reset
    setSupplierId(null);
    setSupplierName('');
    setSupplierSearch(''); setSupplierPickerOpen(false);
    setInvoiceNumber('');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setCurrency('TRY');
    setVatRate('20');
    setExchangeRate('');
    setPaymentMethod('open_account');
    setNotes('');
    setLines([newLine()]);
    setError('');
    setParseInfo(null); setParsing(false);
    setParsedPdfFile(null); setArchivePdf(false);

    // Fetch suppliers + items
    (async () => {
      const [s, i] = await Promise.all([
        listSuppliers({ activeOnly: true }),
        supabase.from('stock_items').select('id, name, unit, brand, category').order('name'),
      ]);
      if (s.data) setSuppliers(s.data);
      if (i.data) setItems(i.data as StockItemLite[]);
    })();
  }, [visible]);

  // ── Derived totals (per-line VAT) ──
  const totals = useMemo(() => {
    const defaultVat = parseFloat(vatRate.replace(',', '.')) || 0;
    let subtotal = 0;
    let vatAmount = 0;
    const ratesUsed = new Set<number>();
    for (const l of lines) {
      const q = parseFloat(l.quantity.replace(',', '.'));
      const p = parseFloat(l.unit_price.replace(',', '.'));
      if (isNaN(q) || isNaN(p)) continue;
      const lineTotal = q * p;
      const lvParsed = parseFloat(l.vat_rate.replace(',', '.'));
      const lineVat = !isNaN(lvParsed) ? lvParsed : defaultVat;
      subtotal += lineTotal;
      vatAmount += lineTotal * lineVat / 100;
      if (lineTotal > 0) ratesUsed.add(lineVat);
    }
    const total = subtotal + vatAmount;
    const mixedVat = ratesUsed.size > 1;
    return { subtotal, vatAmount, total, mixedVat, ratesUsed: Array.from(ratesUsed).sort((a, b) => a - b) };
  }, [lines, vatRate]);

  // ── Handlers ──
  const updateLine = (id: string, patch: Partial<Line>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };
  const removeLine = (id: string) => {
    setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  };
  const addLine = () => {
    setLines(prev => [...prev, newLine(vatRate)]);
  };

  const handleSave = async () => {
    if (savingRef.current) return;          // senkron çift-gönderim koruması
    setError('');
    if (!supplierName.trim()) { setError('Tedarikçi seçin veya yeni firma adı girin'); return; }
    if (!lines.length || !lines.some(l => l.item_name.trim() && parseFloat(l.quantity.replace(',', '.')) > 0)) {
      setError('En az 1 satır gerekli (ürün adı + miktar)'); return;
    }
    savingRef.current = true;
    setSaving(true);

    // Eğer supplierId yoksa: önce isimle eşleşen mevcut tedarikçi var mı (case-insensitive)?
    // Yoksa yeni oluştur. Bu, OCR ile dolan formlarda her seferinde duplicate
    // tedarikçi oluşmasını engeller.
    let resolvedSupplierId = supplierId;
    const normalizedName = supplierName.trim().toLowerCase();
    if (!resolvedSupplierId && normalizedName) {
      const match = suppliers.find(s => (s.name ?? '').trim().toLowerCase() === normalizedName);
      if (match) {
        resolvedSupplierId = match.id;
      } else {
        // Yarış koşulu: paralel kayıttan sonra DB'de varsa onu kullan
        const { data: existing } = await supabase
          .from('suppliers')
          .select('id, name')
          .ilike('name', supplierName.trim())
          .limit(1)
          .maybeSingle();
        if (existing) {
          resolvedSupplierId = (existing as any).id;
        } else {
          const res = await createSupplier({ name: supplierName.trim(), category: 'material', default_currency: currency } as any);
          if (res.error) { setError('Tedarikçi oluşturulamadı: ' + (res.error as any).message); stopSaving(); return; }
          resolvedSupplierId = res.data?.id ?? null;
        }
      }
    }

    // Şüpheli kalem var mı? — kullanıcı sarf/demirbaş seçmedi
    const reviewNeeded = lines.filter(l => l.needs_review);
    if (reviewNeeded.length > 0) {
      setError(`${reviewNeeded.length} kalem için sarf/demirbaş seçimi gerekli (turuncu uyarılı satırlar).`);
      stopSaving();
      return;
    }

    const lineInputs: PurchaseLineInput[] = lines
      .filter(l => l.item_name.trim() && parseFloat(l.quantity.replace(',', '.')) > 0)
      .map(l => ({
        item_id: l.item_id || null,
        item_name: l.item_name.trim(),
        quantity: parseFloat(l.quantity.replace(',', '.')),
        unit: l.unit || null,
        unit_price: parseFloat(l.unit_price.replace(',', '.')) || 0,
        vat_rate: (() => {
          const lv = parseFloat(l.vat_rate.replace(',', '.'));
          return !isNaN(lv) ? lv : null;
        })(),
        brand: l.brand?.trim() || null,
        category: l.category?.trim() || null,
        item_kind: l.item_kind ?? 'consumable',
        model: l.model?.trim() || null,
        equipment_category: (l.equipment_category as any) || null,
      }));

    // Opsiyonel PDF arşivleme — kullanıcı checkbox'ı işaretlediyse Storage'a yükle
    let invoiceFileUrl: string | null = null;
    if (archivePdf && parsedPdfFile && labId) {
      try {
        const ext = (parsedPdfFile.name.split('.').pop() || 'pdf').toLowerCase();
        const stamp = new Date().toISOString().slice(0, 10);
        const rand  = Math.random().toString(36).slice(2, 8);
        const path  = `${labId}/${stamp}-${rand}.${ext}`;
        const buf   = await parsedPdfFile.arrayBuffer();
        const { error: upErr } = await supabase.storage
          .from('purchase-invoices')
          .upload(path, new Uint8Array(buf), {
            contentType: parsedPdfFile.type || 'application/pdf',
            upsert: false,
          });
        if (upErr) {
          // Kaydetmeye devam et, ama kullanıcıyı uyar
          console.warn('[purchase-pdf] upload failed:', upErr.message);
          setError('PDF arşivlenemedi: ' + upErr.message);
          stopSaving();
          return;
        }
        const { data: urlData } = supabase.storage.from('purchase-invoices').getPublicUrl(path);
        invoiceFileUrl = urlData?.publicUrl ?? null;
      } catch (e: any) {
        setError('PDF arşivlenirken hata: ' + (e?.message ?? 'bilinmeyen hata'));
        stopSaving();
        return;
      }
    }

    const result = await createPurchaseInvoice({
      labId,
      supplierId: resolvedSupplierId,
      supplierName: supplierName.trim(),
      invoiceNumber: invoiceNumber.trim() || null,
      invoiceDate,
      dueDate: dueDate || null,
      currency,
      vatRate: parseFloat(vatRate.replace(',', '.')) || 0,
      exchangeRate: (() => {
        const r = parseFloat(exchangeRate.replace(',', '.'));
        return !isNaN(r) && r > 0 ? r : null;
      })(),
      paymentMethod,
      invoiceFileUrl,
      notes: notes.trim() || null,
      lines: lineInputs,
    });

    stopSaving();
    if (!result.ok) { setError(result.error ?? 'Kayıt hatası'); return; }
    onSaved();
  };

  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const sectionEyebrow: any = { fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 };
  const sectionSubtitle: any = { fontSize: 11, color: '#9A9A9A', fontWeight: '400', marginBottom: 14 };
  const fieldLabel: any = { fontSize: 10, fontWeight: '600', color: '#9A9A9A', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };
  const cleanInput: any = { backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 12, height: 36, fontSize: 13, color: '#0A0A0A', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) };
  const cellInput: any = { backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 10, height: 38, fontSize: 13, color: '#0A0A0A', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) };

  const filteredSuppliers = suppliers.filter(s =>
    !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 20, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 24, width: 880, maxWidth: '100%', maxHeight: '94%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18, gap: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: accentColor + '14',
                borderWidth: 1, borderColor: accentColor + '22',
              }}>
                <Receipt size={20} color={accentColor} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Malzeme alımı · Fatura
                </Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 26, letterSpacing: -0.6, color: '#0A0A0A', lineHeight: 32, marginTop: 2 }}>
                  Yeni satın alma
                </Text>
                <Text style={{ fontSize: 12, color: '#9A9A9A', marginTop: 2 }}>
                  Stok girişi + cari hesap + maliyet tek seferde, audit-safe.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 18,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={15} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginHorizontal: 28 }} />

          <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 22, paddingBottom: 22 }} showsVerticalScrollIndicator={false}>

            {/* ── A. FATURA BİLGİSİ ── */}
            <Text style={sectionEyebrow}>A · Fatura bilgisi</Text>
            <Text style={sectionSubtitle}>Tedarikçi, fatura numarası, tarih, ödeme</Text>

            {/* PDF Yükle + OCR */}
            {Platform.OS === 'web' && (
              <View style={{ marginBottom: 14 }}>
                <Pressable
                  onPress={handlePickPdf}
                  disabled={parsing}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, paddingVertical: 12, paddingHorizontal: 14,
                    borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
                    borderColor: accentColor + '55',
                    backgroundColor: accentColor + '08',
                    opacity: parsing ? 0.6 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <FileUp size={16} color={accentColor} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>
                    {parsing ? 'Fatura işleniyor…' : 'PDF Faturayı Yükle (otomatik doldur)'}
                  </Text>
                  {!parsing && <Sparkles size={13} color={accentColor} strokeWidth={1.8} />}
                </Pressable>
                {parseInfo && (
                  <View style={{
                    marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                  }}>
                    <Check size={12} color="#0F6E50" strokeWidth={2} />
                    <Text style={{ fontSize: 11, color: '#0F6E50', fontWeight: '600' }}>{parseInfo}</Text>
                  </View>
                )}

                {/* Arşivleme tercihi — sadece PDF başarıyla parse edilmişse görünür */}
                {parsedPdfFile && (
                  <Pressable
                    onPress={() => setArchivePdf(v => !v)}
                    style={({ hovered }: any) => ({
                      marginTop: 8,
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingVertical: 8, paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: hovered ? 'rgba(0,0,0,0.03)' : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    {/* Checkbox */}
                    <View style={{
                      width: 18, height: 18, borderRadius: 4,
                      borderWidth: 1.5,
                      borderColor: archivePdf ? accentColor : 'rgba(0,0,0,0.25)',
                      backgroundColor: archivePdf ? accentColor : '#FFFFFF',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {archivePdf ? <Check size={11} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#0A0A0A' }}>
                        PDF dosyasını arşive yükle
                      </Text>
                      <Text style={{ fontSize: 10.5, color: '#6B6B6B', marginTop: 1 }}>
                        Fatura kaydedilirken orijinal PDF sakla (sonradan "Orijinal" butonuyla açılır)
                      </Text>
                    </View>
                  </Pressable>
                )}
              </View>
            )}

            {/* Supplier picker */}
            <View style={{ marginBottom: 14 }}>
              <Text style={fieldLabel}>Tedarikçi *</Text>
              <Pressable
                onPress={() => setSupplierPickerOpen(v => !v)}
                style={{ ...cleanInput, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Building2 size={14} color="#9A9A9A" strokeWidth={1.6} />
                  <Text style={supplierName ? { fontSize: 14, color: '#0A0A0A', fontWeight: '500' } : { fontSize: 14, color: '#9A9A9A' }}>
                    {supplierName || 'Tedarikçi seçin veya yeni ekleyin…'}
                  </Text>
                </View>
                {supplierPickerOpen
                  ? <ChevronUp size={14} color="#9A9A9A" strokeWidth={1.6} />
                  : <ChevronDown size={14} color="#9A9A9A" strokeWidth={1.6} />
                }
              </Pressable>
              {supplierPickerOpen && (
                <View style={{ marginTop: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 14, backgroundColor: '#FFFFFF', overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.08)' } as any : {}) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
                    <Search size={13} color="#9A9A9A" strokeWidth={1.6} />
                    <TextInput
                      style={{ flex: 1, fontSize: 13, color: '#0A0A0A', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                      value={supplierSearch}
                      onChangeText={setSupplierSearch}
                      placeholder="Ara veya yeni isim yaz…"
                      placeholderTextColor="#9A9A9A"
                      autoFocus
                    />
                  </View>
                  <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                    {filteredSuppliers.map(s => {
                      const active = supplierId === s.id;
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => { setSupplierId(s.id); setSupplierName(s.name); setCurrency(s.default_currency); setSupplierPickerOpen(false); setSupplierSearch(''); }}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: active ? accentColor + '14' : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '500', color: active ? accentColor : '#0A0A0A' }}>{s.name}</Text>
                            {s.default_currency !== 'TRY' && (
                              <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 1 }}>varsayılan {s.default_currency}</Text>
                            )}
                          </View>
                          {active && <Check size={14} color={accentColor} strokeWidth={2} />}
                        </Pressable>
                      );
                    })}
                    {!!supplierSearch.trim() && !filteredSuppliers.some(s => s.name.toLowerCase() === supplierSearch.trim().toLowerCase()) && (
                      <Pressable
                        onPress={() => { setSupplierId(null); setSupplierName(supplierSearch.trim()); setSupplierPickerOpen(false); setSupplierSearch(''); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                      >
                        <Plus size={14} color={accentColor} strokeWidth={1.8} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>"{supplierSearch.trim()}" → kayıt sırasında oluşturulacak</Text>
                      </Pressable>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Invoice no + Date + Due */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text style={fieldLabel}>Fatura no</Text>
                <TextInput style={cleanInput} value={invoiceNumber} onChangeText={setInvoiceNumber} placeholder="örn. ABC-2026/00123" placeholderTextColor="#9A9A9A" />
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text style={fieldLabel}>Fatura tarihi *</Text>
                <DatePicker value={invoiceDate} onChange={setInvoiceDate} placeholder="Tarih seç" compact />
              </View>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text style={fieldLabel}>Vade tarihi</Text>
                <DatePicker value={dueDate} onChange={setDueDate} placeholder="Opsiyonel" compact />
              </View>
            </View>

            {/* Currency + KDV + Payment — tek satır kompakt */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <View style={{ minWidth: 160 }}>
                <Text style={fieldLabel}>Para birimi</Text>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {SUPPORTED_CURRENCIES.map(c => {
                    const active = currency === c;
                    return (
                      <Pressable key={c} onPress={() => setCurrency(c)} style={{
                        paddingHorizontal: 10, height: 30, justifyContent: 'center', borderRadius: 9999,
                        backgroundColor: active ? accentColor : '#FFFFFF',
                        borderWidth: 1, borderColor: active ? accentColor : 'rgba(0,0,0,0.08)',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? '#FFF' : '#6B6B6B' }}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {currency !== 'TRY' && (
                <View style={{ width: 130 }}>
                  <Text style={fieldLabel}>Kur (1 {currency})</Text>
                  <TextInput
                    style={cleanInput}
                    value={exchangeRate}
                    onChangeText={setExchangeRate}
                    keyboardType="decimal-pad"
                    placeholder="Otomatik"
                    placeholderTextColor="#9A9A9A"
                  />
                </View>
              )}
              <View style={{ width: 100 }}>
                <Text style={fieldLabel}>KDV %</Text>
                <TextInput style={cleanInput} value={vatRate} onChangeText={setVatRate} keyboardType="decimal-pad" placeholder="20" placeholderTextColor="#9A9A9A" />
              </View>
              <View style={{ flex: 1, minWidth: 220 }}>
                <Text style={fieldLabel}>Ödeme yöntemi</Text>
                <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' }}>
                  {PAYMENT_METHODS.map(m => {
                    const active = paymentMethod === m.v;
                    return (
                      <Pressable key={m.v} onPress={() => setPaymentMethod(m.v)} style={{
                        paddingHorizontal: 10, height: 30, justifyContent: 'center', borderRadius: 9999,
                        backgroundColor: active ? accentColor : '#FFFFFF',
                        borderWidth: 1, borderColor: active ? accentColor : 'rgba(0,0,0,0.08)',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: active ? '600' : '500', color: active ? '#FFF' : '#6B6B6B' }}>{m.l}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginVertical: 6 }} />

            {/* ── B. SATIRLAR ── */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14, marginBottom: 4 }}>
              <View>
                <Text style={sectionEyebrow}>B · Ürünler</Text>
                <Text style={sectionSubtitle}>{lines.length} satır · stok ve maliyet otomatik güncellenir</Text>
              </View>
              <Pressable
                onPress={addLine}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                  backgroundColor: accentColor + '14',
                  borderWidth: 1, borderColor: accentColor + '33',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }}
              >
                <Plus size={12} color={accentColor} strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: accentColor }}>Satır ekle</Text>
              </Pressable>
            </View>

            {/* Header row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FBF9F4', borderRadius: 12, gap: 8, marginBottom: 6 }}>
              <Text style={{ flex: 2.2, ...fieldLabel, marginBottom: 0 }}>Ürün</Text>
              <Text style={{ width: 70, ...fieldLabel, marginBottom: 0 }}>Miktar</Text>
              <Text style={{ width: 64, ...fieldLabel, marginBottom: 0 }}>Birim</Text>
              <Text style={{ width: 110, ...fieldLabel, marginBottom: 0 }}>Birim fiyat</Text>
              <Text style={{ width: 64, ...fieldLabel, marginBottom: 0 }}>KDV %</Text>
              <Text style={{ width: 110, ...fieldLabel, marginBottom: 0, textAlign: 'right' }}>Toplam</Text>
              <View style={{ width: 32 }} />
            </View>

            {/* Lines — zIndex: ürün arama dropdown'ı (satır içinde absolute) alttaki
                Not/uyarı bölümlerinin ÜSTÜNDE çizilsin diye blok yükseltilir. */}
            <View style={{ gap: 6, position: 'relative' as any, zIndex: 20 }}>
              {lines.map((l, idx) => {
                const q = parseFloat(l.quantity.replace(',', '.'));
                const p = parseFloat(l.unit_price.replace(',', '.'));
                const lineTotal = (!isNaN(q) && !isNaN(p)) ? q * p : 0;
                return (
                  <LineRow
                    key={l.id}
                    line={l}
                    idx={idx + 1}
                    items={items}
                    currency={currency}
                    accentColor={accentColor}
                    cellInput={cellInput}
                    defaultVat={vatRate}
                    onChange={(patch) => updateLine(l.id, patch)}
                    onRemove={lines.length > 1 ? () => removeLine(l.id) : undefined}
                    lineTotal={lineTotal}
                  />
                );
              })}
            </View>

            {/* Notes */}
            <View style={{ marginTop: 18 }}>
              <Text style={fieldLabel}>Not</Text>
              <TextInput
                style={[cleanInput, { height: 64, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Hatırlatma, anlaşma vb. (opsiyonel)"
                placeholderTextColor="#9A9A9A"
                multiline
              />
            </View>

            {error ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                padding: 12, marginTop: 14, backgroundColor: '#9C2E2E0F', borderRadius: 12,
                borderWidth: 1, borderColor: '#9C2E2E22',
              }}>
                <AlertCircle size={14} color="#9C2E2E" strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer with totals */}
          <View style={{ paddingHorizontal: 28, paddingTop: 14, paddingBottom: 18, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', backgroundColor: '#FBF9F4' }}>
            {/* Totals row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
              <View>
                <Text style={{ fontSize: 10, color: '#9A9A9A', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Ara toplam</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2C', marginTop: 2 }}>{formatMoney(totals.subtotal, currency)}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 10, color: '#9A9A9A', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
                  {totals.mixedVat
                    ? `KDV (Karışık: %${totals.ratesUsed.join(' / %')})`
                    : `KDV (%${totals.ratesUsed[0] ?? (parseFloat(vatRate.replace(',', '.')) || 0)})`}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2C', marginTop: 2 }}>{formatMoney(totals.vatAmount, currency)}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: accentColor, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>Genel toplam</Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 28, letterSpacing: -0.6, color: '#0A0A0A', marginTop: 2, lineHeight: 32 }}>
                  {formatMoney(totals.total, currency)}
                </Text>
              </View>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 11, color: '#9A9A9A', fontStyle: 'italic' }}>
                Kaydedince stok girişi, cari hesap borcu ve operasyonel maliyet otomatik güncellenir.
              </Text>
              <Pressable
                onPress={onClose}
                style={{
                  paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B6B' }}>Vazgeç</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                  backgroundColor: accentColor, opacity: saving ? 0.5 : 1,
                  ...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer', boxShadow: `0 6px 20px ${accentColor}44` } as any : {}),
                }}
              >
                <Check size={14} color="#FFF" strokeWidth={2.2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>Faturayı kaydet</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Line row ────────────────────────────────────────────────────────────────

function LineRow({
  line, idx, items, currency, accentColor, cellInput, defaultVat, onChange, onRemove, lineTotal,
}: {
  line: Line;
  idx: number;
  items: StockItemLite[];
  currency: Currency;
  accentColor: string;
  cellInput: any;
  defaultVat: string;
  onChange: (patch: Partial<Line>) => void;
  onRemove?: () => void;
  lineTotal: number;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState(line.item_name);

  useEffect(() => { setSearch(line.item_name); }, [line.item_name]);

  const filtered = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={{ position: 'relative' as any, zIndex: pickerOpen ? 10 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
        {/* Item name + picker */}
        <View style={{ flex: 2.2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 10, color: '#9A9A9A', fontWeight: '600', minWidth: 14 }}>#{idx}</Text>
            <View style={{ flex: 1, position: 'relative' as any }}>
              <TextInput
                style={cellInput}
                value={search}
                onChangeText={(t) => { setSearch(t); onChange({ item_name: t, item_id: null }); setPickerOpen(true); }}
                onFocus={() => setPickerOpen(true)}
                placeholder="Ürün adı (ara veya yaz)"
                placeholderTextColor="#9A9A9A"
              />
              {pickerOpen && filtered.length > 0 && (
                <View style={{ position: 'absolute' as any, top: 42, left: 0, right: 0, zIndex: 100, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', overflow: 'hidden', ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.10)' } as any : {}) }}>
                  <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                    {filtered.slice(0, 20).map(i => (
                      <Pressable
                        key={i.id}
                        onPress={() => {
                          onChange({ item_id: i.id, item_name: i.name, unit: i.unit ?? line.unit });
                          setSearch(i.name);
                          setPickerOpen(false);
                        }}
                        style={{ paddingHorizontal: 12, paddingVertical: 9, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '500', color: '#0A0A0A' }}>{i.name}</Text>
                        {(i.brand || i.category) && (
                          <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 1 }}>{[i.brand, i.category].filter(Boolean).join(' · ')}</Text>
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
          {line.item_id ? (
            <Text style={{ fontSize: 10, color: '#1F6B47', fontWeight: '600', marginTop: 3, marginLeft: 20 }}>✓ Mevcut ürüne bağlandı</Text>
          ) : line.item_name.trim() ? (
            <Text style={{ fontSize: 10, color: accentColor, fontWeight: '600', marginTop: 3, marginLeft: 20 }}>+ Yeni ürün olarak kaydedilecek</Text>
          ) : null}
        </View>

        {/* Quantity */}
        <View style={{ width: 70 }}>
          <TextInput
            style={cellInput}
            value={line.quantity}
            onChangeText={(t) => onChange({ quantity: t })}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9A9A9A"
          />
        </View>

        {/* Unit */}
        <View style={{ width: 64 }}>
          <TextInput
            style={cellInput}
            value={line.unit}
            onChangeText={(t) => onChange({ unit: t })}
            placeholder="adet"
            placeholderTextColor="#9A9A9A"
          />
        </View>

        {/* Unit price */}
        <View style={{ width: 110 }}>
          <TextInput
            style={cellInput}
            value={line.unit_price}
            onChangeText={(t) => onChange({ unit_price: t })}
            keyboardType="decimal-pad"
            placeholder="0,00"
            placeholderTextColor="#9A9A9A"
          />
        </View>

        {/* Line VAT % */}
        <View style={{ width: 64 }}>
          <TextInput
            style={cellInput}
            value={line.vat_rate}
            onChangeText={(t) => onChange({ vat_rate: t })}
            keyboardType="decimal-pad"
            placeholder={defaultVat || '20'}
            placeholderTextColor="#9A9A9A"
          />
        </View>

        {/* Line total */}
        <View style={{ width: 110, height: 38, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A' }}>
            {lineTotal > 0 ? formatMoney(lineTotal, currency, { fractionDigits: 2 }) : '—'}
          </Text>
        </View>

        {/* Remove */}
        <View style={{ width: 32, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          {onRemove ? (
            <Pressable
              onPress={onRemove}
              style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(156,46,46,0.08)', borderWidth: 1, borderColor: 'rgba(156,46,46,0.22)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <Trash2 size={11} color="#9C2E2E" strokeWidth={1.8} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Sarf / Demirbaş seçimi — needs_review veya item_kind=equipment ise göster */}
      {(line.needs_review || line.item_kind === 'equipment') && (
        <View style={{
          marginTop: 4, padding: 10, borderRadius: 10,
          backgroundColor: line.needs_review ? 'rgba(217,119,6,0.08)' : 'rgba(15,118,110,0.06)',
          borderWidth: 1,
          borderColor: line.needs_review ? 'rgba(217,119,6,0.25)' : 'rgba(15,118,110,0.20)',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          {line.needs_review && (
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#9C5E0E' }}>⚠ Tipi belirsiz —</Text>
          )}
          <Text style={{ fontSize: 11, color: '#475569', flex: line.needs_review ? 0 : 1 }}>Bu kalem:</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {([
              { v: 'consumable', l: 'Sarf', c: '#0F766E' },
              { v: 'equipment',  l: 'Demirbaş', c: '#7C3AED' },
            ] as const).map(opt => {
              const active = (line.item_kind ?? 'consumable') === opt.v;
              return (
                <Pressable
                  key={opt.v}
                  onPress={() => onChange({ item_kind: opt.v, needs_review: false } as any)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
                    backgroundColor: active ? opt.c : 'rgba(0,0,0,0.04)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#FFF' : '#475569' }}>{opt.l}</Text>
                </Pressable>
              );
            })}
          </View>
          {line.item_kind === 'equipment' && (
            <View style={{ flexDirection: 'row', gap: 8, flex: 1, marginLeft: 8 }}>
              <TextInput
                style={{ ...cellInput, flex: 1 }}
                value={line.model ?? ''}
                onChangeText={(t) => onChange({ model: t })}
                placeholder="Model (ops.)"
                placeholderTextColor="#9A9A9A"
              />
              <TextInput
                style={{ ...cellInput, flex: 1 }}
                value={line.equipment_category ?? ''}
                onChangeText={(t) => onChange({ equipment_category: t.toLowerCase() })}
                placeholder="Cihaz kategori"
                placeholderTextColor="#9A9A9A"
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
