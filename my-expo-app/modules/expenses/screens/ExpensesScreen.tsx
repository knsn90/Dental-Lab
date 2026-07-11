import { localeTag } from '../../../core/i18n';
/**
 * ExpensesScreen — Giderler (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 form, §08 dialog, §03 pill buttons,
 * Lucide icons.
 */
import React, { useState, useMemo, useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, RefreshControl, Platform,
  useWindowDimensions,
} from 'react-native';

import { useExpenses } from '../hooks/useExpenses';
import {
  createExpense, updateExpense, deleteExpense, deletePurchaseInvoice,
  EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_COLORS,
  type Expense, type ExpenseCategory, type ExpensePaymentMethod, type CreateExpenseParams,
} from '../api';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DatePicker } from '../../../core/ui/DatePicker';
// Phase 3: Multi-currency
import { MoneyInput } from '../../../core/money/MoneyInput';
import { MoneyDisplay } from '../../../core/money/MoneyDisplay';
// Katı per-currency (groupByCurrency + MoneyMultiX)
import { groupByCurrency, type CurrencyTotal } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { formatMoney, useBaseCurrency, type Currency } from '../../../core/money/currency';
// Form: yabancı para gider girişinde kur yakalama (snapshot) için
import { baseSymbol } from '../../../core/money/baseCurrency';
// Material purchase / inventory intake
import { PurchaseFormModal } from '../../purchases/components/PurchaseFormModal';
import { PurchaseInvoicePreviewModal } from '../../purchases/components/PurchaseInvoicePreviewModal';
import { RecurringExpensesPanel } from '../components/RecurringExpensesPanel';
import { downloadCsv, csvMoney, csvDate } from '../../../core/util/csvExport';
import { buildExpensesReportHtml, downloadExpensesReport } from '../../../core/util/buildExpensesReportHtml';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import {
  Plus, Search, X, Inbox, Pencil, Trash2,
  Package, Building, Users, Wrench, Receipt, MoreHorizontal,
  Repeat, FileSpreadsheet, Banknote, CreditCard, Landmark,
  FileText, CircleDot, FileUp, Sparkles, Check, SlidersHorizontal,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';

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

const modalShadow = '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)';

// ── Category → Lucide icon mapping ──────────────────────────────────
const CAT_ICON: Record<ExpenseCategory, React.ComponentType<any>> = {
  malzeme:  Package,
  kira:     Building,
  personel: Users,
  ekipman:  Wrench,
  vergi:    Receipt,
  diger:    MoreHorizontal,
};

// Malzeme alımları artık Stok > Satın Alma akışından otomatik gider kaydı
// olarak buraya yansır. Yine de manuel ekleme için kategori görünür kalır.
const CATEGORIES: ExpenseCategory[] = ['malzeme', 'kira', 'personel', 'ekipman', 'vergi', 'diger'];
// Genel gider formunda görünen kategoriler — sarf/demirbaş Stok › Satın Alma'dan girilir
const FORM_CATEGORIES: ExpenseCategory[] = ['kira', 'personel', 'vergi', 'diger'];
const PAY_METHODS: { v: ExpensePaymentMethod; l: string; icon: React.ComponentType<any> }[] = [
  { v: 'nakit',  l: 'Nakit',  icon: Banknote },
  { v: 'kart',   l: 'Kart',   icon: CreditCard },
  { v: 'havale', l: 'Havale', icon: Landmark },
  { v: 'cek',    l: 'Çek',    icon: FileText },
  { v: 'diger',  l: 'Diğer',  icon: CircleDot },
];

// ── Helpers ──────────────────────────────────────────────────────────
// Katı per-currency: tutar KENDİ para biriminde.
function fmtMoney(n: number | string | null | undefined, currency: string = 'TRY'): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  return formatMoney(Number(v) || 0, (currency as Currency), { fractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ExpensesScreen() {
  const theme = usePanelTheme();
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const topPad = isEmbedded || isDesktop ? 0 : Math.max(insets.top, 8) + 72;
  const [catFilter, setCatFilter] = useState<ExpenseCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  type ExpSortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
  const [sortKey, setSortKey] = useState<ExpSortKey>('date_desc');
  const SORT_OPTIONS: { key: ExpSortKey; label: string }[] = [
    { key: 'date_desc',   label: 'En Yeni' },
    { key: 'date_asc',    label: 'En Eski' },
    { key: 'amount_desc', label: 'Tutar ↓' },
    { key: 'amount_asc',  label: 'Tutar ↑' },
  ];
  const [modalOpen, setModalOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  // Satın alma faturası önizleme — gider satırı bir purchase_invoice'a bağlıysa tıklanır
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

  const { expenses, loading, refetch } = useExpenses(
    catFilter !== 'all' ? { category: catFilter } : undefined,
  );

  const filtered = useMemo(() => {
    const sl = search.toLowerCase();
    const list = search
      ? expenses.filter(e =>
          e.description.toLowerCase().includes(sl) ||
          EXPENSE_CATEGORY_LABELS[e.category].toLowerCase().includes(sl),
        )
      : expenses;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'date_desc':   return (b.expense_date ?? '').localeCompare(a.expense_date ?? '');
        case 'date_asc':    return (a.expense_date ?? '').localeCompare(b.expense_date ?? '');
        case 'amount_desc': return Number(b.amount ?? 0) - Number(a.amount ?? 0);
        case 'amount_asc':  return Number(a.amount ?? 0) - Number(b.amount ?? 0);
        default:            return 0;
      }
    });
  }, [expenses, search, sortKey]);

  const baseCurrency = useBaseCurrency();   // lab baz para birimi (Excel export / form kur yakalama)
  // Katı per-currency: gider toplamları para birimine göre BAĞIMSIZ (asla toplanmaz).
  const ccyOf = (e: any) => ((e.currency ?? 'TRY') as Currency);
  const expByCcy = useMemo(
    () => groupByCurrency(filtered, e => ({ amount: Number((e as any).amount) || 0, currency: ccyOf(e) })),
    [filtered],
  );

  // Kategori başına per-currency kırılım
  const catByCcy = useMemo(() => {
    const buckets: Record<string, Expense[]> = {};
    for (const e of expenses) (buckets[e.category] ??= []).push(e);
    const map: Record<string, CurrencyTotal[]> = {};
    for (const cat of Object.keys(buckets)) {
      map[cat] = groupByCurrency(buckets[cat], e => ({ amount: Number((e as any).amount) || 0, currency: ccyOf(e) }));
    }
    return map;
  }, [expenses]);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (e: Expense) => { setEditing(e); setModalOpen(true); };

  const handleDelete = async (e: Expense) => {
    const linkedInvoiceId = e.purchase_invoice_id ?? null;
    const isWeb = Platform.OS === 'web';

    const confirm1 = (msg: string): boolean | Promise<boolean> => {
      if (isWeb && typeof window !== 'undefined') return window.confirm(msg);
      return new Promise<boolean>(resolve => {
        Alert.alert('Gider Sil', msg, [
          { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Sil', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
    };

    if (linkedInvoiceId) {
      // Bu gider satın alma faturasından otomatik gelmiş — fatura + stok'u soracağız
      const ok = await confirm1(
        `"${e.description}" satın alma faturasından oluşmuş bir giderdir.\n\n` +
        `DEVAM EDERSEN: fatura kaydı + cari hesap işlemi + bu gider silinecek.`
      );
      if (!ok) return;

      // İkinci soru: stoğu da geri al?
      let revertStock = false;
      if (isWeb && typeof window !== 'undefined') {
        revertStock = window.confirm(
          'Bu faturayla eklenen STOK ürünleri de stokta düşülsün mü?\n\n' +
          'TAMAM = Evet, stoktan düş (faturadaki tüm hareketler geri alınır)\n' +
          'İPTAL = Hayır, sadece faturayı sil (stok olduğu gibi kalsın)'
        );
      } else {
        revertStock = await new Promise<boolean>(resolve => {
          Alert.alert(
            'Stok düşülsün mü?',
            'Bu faturayla eklenen ürünler stoktan da düşülsün mü?',
            [
              { text: 'Hayır, sadece fatura', onPress: () => resolve(false) },
              { text: 'Evet, stoğu da geri al', style: 'destructive', onPress: () => resolve(true) },
            ],
          );
        });
      }

      const { error } = await deletePurchaseInvoice(linkedInvoiceId, revertStock);
      if (error) { toast.error('Silinemedi: ' + (error as any).message); return; }
      toast.success(revertStock ? 'Fatura silindi + stoğa düşüldü' : 'Fatura silindi (stok korundu)');
      refetch();
      return;
    }

    // Manuel gider — standart sil
    const ok = await confirm1(`"${e.description}" kaydını silmek istediğine emin misin?`);
    if (!ok) return;
    const { error } = await deleteExpense(e.id);
    if (error) { toast.error('Silinemedi: ' + (error as any).message); return; }
    toast.success('Gider silindi');
    refetch();
  };

  // Lab bilgisini header için tek seferlik çek (rapora yansıyacak)
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;
  const [labMeta, setLabMeta] = useState<{ name: string; address?: string | null; phone?: string | null; taxNo?: string | null } | null>(null);
  React.useEffect(() => {
    if (!labId) return;
    (async () => {
      const { data } = await supabase.from('labs').select('name, address, phone, tax_no').eq('id', labId).maybeSingle();
      if (data) setLabMeta({ name: (data as any).name ?? 'Laboratuvar', address: (data as any).address, phone: (data as any).phone, taxNo: (data as any).tax_no });
      else setLabMeta({ name: 'Laboratuvar' });
    })();
  }, [labId]);

  const handleExcel = async () => {
    if (Platform.OS !== 'web') {
      // Native: eski CSV akışı (paylaş)
      const res = await downloadCsv(
        `Giderler-${new Date().toISOString().slice(0, 10)}`,
        filtered,
        [
          { header: 'Tarih',    value: e => csvDate(e.expense_date) },
          { header: 'Kategori', value: e => EXPENSE_CATEGORY_LABELS[e.category] ?? e.category },
          { header: 'Açıklama', value: e => e.description },
          { header: 'Tutar',    value: e => csvMoney(e.amount) },
          { header: 'Ödeme',    value: e => e.payment_method },
          { header: 'Notlar',   value: e => e.notes ?? '' },
        ],
      );
      if (!res.ok && res.error) toast.error(res.error);
      else toast.success('CSV indirildi');
      return;
    }

    // Web: stillenmiş Excel uyumlu rapor (HTML→.xls)
    const html = buildExpensesReportHtml({
      labName:    labMeta?.name    ?? 'Laboratuvar',
      labAddress: labMeta?.address ?? null,
      labPhone:   labMeta?.phone   ?? null,
      labTaxNo:   labMeta?.taxNo   ?? null,
      periodFrom: filtered.length > 0 ? filtered.reduce((min, e) => e.expense_date < min ? e.expense_date : min, filtered[0].expense_date) : null,
      periodTo:   filtered.length > 0 ? filtered.reduce((max, e) => e.expense_date > max ? e.expense_date : max, filtered[0].expense_date) : null,
      expenses: filtered,
      primaryCurrency: baseCurrency,
    });
    const fn = `GiderRaporu-${new Date().toISOString().slice(0, 10)}.xls`;
    const res = downloadExpensesReport(html, fn);
    if (!res.ok && res.error) toast.error(res.error);
    else toast.success('Excel raporu indirildi');
  };

  return (
    <View style={{ flex: 1, backgroundColor: isEmbedded ? 'transparent' : '#F5F1EB', paddingTop: topPad }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 48, gap: 14 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DS.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — §10 glassmorphism ────────────────────────── */}
        <View style={{
          borderRadius: 28, overflow: 'hidden',
          backgroundColor: theme.primary, padding: 16,
          position: 'relative',
        }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 12 }}>
                Toplam Gider
              </Text>
              {/* Katı per-currency: her para birimi ayrı kart, asla toplanmaz */}
              <MoneyMultiX slices={expByCcy} variant="cards" size="lg" accentColor={theme.primary} emptyText="—" />
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 8 }}>
                {filtered.length} kayıt
                {expByCcy.length > 1 ? ` · ${expByCcy.length} para birimi` : ''}
              </Text>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <PillBtn icon={Repeat} label="Otomatik" onPress={() => setRecurringOpen(true)} variant="ghost" onHero heroAccent={theme.primary} />
              <PillBtn icon={FileSpreadsheet} label="Excel" onPress={handleExcel} variant="ghost" onHero heroAccent={theme.primary} />
              <PillBtn icon={Receipt} label="Satın Alma" onPress={() => setPurchaseOpen(true)} variant="ghost" onHero heroAccent={theme.primary} />
              <PillBtn icon={Plus} label="Gider Ekle" onPress={openAdd} onHero heroAccent={theme.primary} />
            </View>
          </View>

          {/* Category breakdown */}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => {
              const slices = catByCcy[cat] ?? [];
              if (slices.length === 0) return null;
              const Icon = CAT_ICON[cat];
              return (
                <View key={cat}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon size={11} color="rgba(255,255,255,0.78)" strokeWidth={1.8} />
                    <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)' }}>
                      {EXPENSE_CATEGORY_LABELS[cat]}
                    </Text>
                  </View>
                  <View style={{ marginTop: 2, gap: 1 }}>
                    {slices.map(s => (
                      <Text key={s.currency} style={{ ...DISPLAY, fontSize: 16, letterSpacing: -0.3, color: '#FFFFFF' }}>
                        {formatMoney(s.total, s.currency, { fractionDigits: 0 })}
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Search + Filtre butonu ─────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{
            flex: 1,
            flexDirection: 'row', alignItems: 'center', gap: 10,
            height: 44, paddingHorizontal: 14, borderRadius: 14,
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
          }}>
            <Search size={15} color={DS.ink[400]} strokeWidth={1.8} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: DS.ink[900], outline: 'none' as any }}
              placeholder="Açıklama ara..."
              placeholderTextColor={DS.ink[400]}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} style={{ cursor: 'pointer' as any }}>
                <X size={14} color={DS.ink[400]} strokeWidth={2} />
              </Pressable>
            )}
          </View>
          {(() => {
            const activeCount = (catFilter !== 'all' ? 1 : 0) + (sortKey !== 'date_desc' ? 1 : 0);
            const hasFilter = activeCount > 0;
            return (
              <Pressable
                onPress={() => setFilterOpen(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  height: 44, paddingHorizontal: 14, borderRadius: 14,
                  backgroundColor: hasFilter ? DS.ink[900] : '#FFF',
                  borderWidth: hasFilter ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                  cursor: 'pointer' as any,
                }}
              >
                <SlidersHorizontal size={14} strokeWidth={1.8} color={hasFilter ? '#FFFFFF' : DS.ink[700]} />
                <Text style={{ fontSize: 12, fontWeight: hasFilter ? '700' : '600', color: hasFilter ? '#FFFFFF' : DS.ink[700] }}>
                  Filtre{hasFilter ? ` (${activeCount})` : ''}
                </Text>
              </Pressable>
            );
          })()}
        </View>

        {/* ── Filtre Sheet ─────────────────────────────────────── */}
        <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
          <Pressable
            onPress={() => setFilterOpen(false)}
            style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#FFFFFF',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 12,
                maxHeight: '85%',
              }}
            >
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: DS.ink[200], marginBottom: 14 }} />
              <View style={{ paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: DS.ink[900], flex: 1 }}>Filtrele</Text>
                <Pressable onPress={() => { setCatFilter('all'); setSortKey('date_desc'); }} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Temizle</Text>
                </Pressable>
                <Pressable onPress={() => setFilterOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                  <X size={16} color={DS.ink[700]} strokeWidth={2} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 18 }}>
                {/* Sıralama */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], paddingHorizontal: 4 }}>Sıralama</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
                    {SORT_OPTIONS.map(opt => {
                      const active = sortKey === opt.key;
                      return (
                        <Pressable key={opt.key} onPress={() => setSortKey(opt.key)} style={{
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                          borderWidth: active ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                          backgroundColor: active ? DS.ink[900] : '#FFF',
                          cursor: 'pointer' as any,
                        }}>
                          <Text style={{ fontSize: 11.5, fontWeight: active ? '700' : '500', color: active ? '#FFFFFF' : DS.ink[700] }} numberOfLines={1}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                {/* Kategori */}
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], paddingHorizontal: 4 }}>Kategori</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Pressable onPress={() => setCatFilter('all')} style={{
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                      borderWidth: catFilter === 'all' ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                      backgroundColor: catFilter === 'all' ? DS.ink[900] : '#FFF',
                      cursor: 'pointer' as any,
                    }}>
                      <Text style={{ fontSize: 12.5, fontWeight: catFilter === 'all' ? '700' : '500', color: catFilter === 'all' ? '#FFFFFF' : DS.ink[700] }}>Tümü</Text>
                    </Pressable>
                    {CATEGORIES.map(cat => {
                      const active = catFilter === cat;
                      const Icon = CAT_ICON[cat];
                      return (
                        <Pressable key={cat} onPress={() => setCatFilter(cat)} style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                          borderWidth: active ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                          backgroundColor: active ? DS.ink[900] : '#FFF',
                          cursor: 'pointer' as any,
                        }}>
                          <Icon size={13} color={active ? '#FFFFFF' : DS.ink[400]} strokeWidth={1.8} />
                          <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? '#FFFFFF' : DS.ink[700] }}>
                            {EXPENSE_CATEGORY_LABELS[cat]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>

              <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                <Pressable onPress={() => setFilterOpen(false)} style={{
                  height: 48, borderRadius: 14, backgroundColor: DS.ink[900],
                  alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer' as any,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Uygula</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Expense list ────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Inbox size={32} color={DS.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>Gider kaydı bulunamadı</Text>
          </View>
        ) : isDesktop ? (
          /* ── Desktop: tableCard §09 ──────────────────────── */
          <View style={tableCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Gider Listesi</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: DS.ink[400] }}>{filtered.length} kayıt</Text>
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              {[
                { label: 'KATEGORİ', flex: 1.2 },
                { label: 'AÇIKLAMA', flex: 3 },
                { label: 'TARİH',   flex: 1.2 },
                { label: 'ÖDEME',   flex: 1 },
                { label: 'TUTAR',   flex: 1.2, align: 'right' as const },
                { label: 'İŞLEM',   flex: 0.8 },
              ].map((h, i) => (
                <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: h.align }}>
                  {h.label}
                </Text>
              ))}
            </View>

            {/* Rows */}
            {filtered.map((e, i) => {
              const Icon = CAT_ICON[e.category];
              const hasInvoice = !!e.purchase_invoice_id;
              return (
                <Pressable
                  key={e.id}
                  onPress={hasInvoice ? () => setPreviewInvoiceId(e.purchase_invoice_id) : undefined}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 14,
                    borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(0,0,0,0.04)',
                    backgroundColor: hasInvoice && hovered ? 'rgba(0,0,0,0.025)' : 'transparent',
                    ...(hasInvoice ? { cursor: 'pointer' as any } : {}),
                  })}
                >
                  {/* Category */}
                  <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={13} color={DS.ink[500]} strokeWidth={1.8} />
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700] }}>{EXPENSE_CATEGORY_LABELS[e.category]}</Text>
                  </View>

                  {/* Description */}
                  <Text style={{ flex: 3, fontSize: 13, color: DS.ink[800] }} numberOfLines={1}>
                    {e.description}
                  </Text>

                  {/* Date */}
                  <Text style={{ flex: 1.2, fontSize: 12, color: DS.ink[500] }}>
                    {fmtDate(e.expense_date)}
                  </Text>

                  {/* Payment method */}
                  <Text style={{ flex: 1, fontSize: 11, color: DS.ink[400] }}>
                    {PAY_METHODS.find(m => m.v === e.payment_method)?.l ?? e.payment_method}
                  </Text>

                  {/* Amount + currency (Phase 3 — orijinal + base preview) */}
                  <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                    <MoneyDisplay
                      amount={Number(e.amount)}
                      currency={(((e as any).currency as any) ?? 'TRY')}
                      baseAmount={null}
                      mode="original"
                      style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}
                    />
                  </View>

                  {/* Actions */}
                  <View style={{ flex: 0.8, flexDirection: 'row', gap: 4, justifyContent: 'flex-end' }}>
                    <Pressable
                      onPress={(ev: any) => { ev?.stopPropagation?.(); openEdit(e); }}
                      style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                    >
                      <Pencil size={12} color={DS.ink[500]} strokeWidth={1.8} />
                    </Pressable>
                    <Pressable
                      onPress={(ev: any) => { ev?.stopPropagation?.(); handleDelete(e); }}
                      style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                    >
                      <Trash2 size={12} color={CHIP_TONES.danger.fg} strokeWidth={1.8} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}

            {/* Footer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FAFAFA', gap: 10 }}>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>{filtered.length} kayıt</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>Toplam:</Text>
              <MoneyMultiX slices={expByCcy} variant="inline" />
            </View>
          </View>
        ) : (
          /* ── Mobile: cardSolid §05 ──────────────────────────── */
          <View style={{ gap: 10 }}>
            {filtered.map(e => {
              const Icon = CAT_ICON[e.category];
              const hasInvoice = !!e.purchase_invoice_id;
              return (
                <Pressable
                  key={e.id}
                  onPress={hasInvoice ? () => setPreviewInvoiceId(e.purchase_invoice_id) : undefined}
                  style={({ hovered }: any) => ({
                    ...cardSolid,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: hasInvoice && hovered ? 'rgba(0,0,0,0.02)' : (cardSolid as any).backgroundColor ?? '#FFF',
                    ...(hasInvoice ? { cursor: 'pointer' as any } : {}),
                  })}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: DS.ink[100],
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={18} color={DS.ink[500]} strokeWidth={1.6} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                      {e.description}
                    </Text>
                    <Text style={{ fontSize: 11, color: DS.ink[400] }}>
                      {EXPENSE_CATEGORY_LABELS[e.category]} · {fmtDate(e.expense_date)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={{ ...DISPLAY, fontSize: 16, letterSpacing: -0.3, color: DS.ink[900] }}>
                      {fmtMoney(e.amount, (e as any).currency ?? 'TRY')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <Pressable
                        onPress={(ev: any) => { ev?.stopPropagation?.(); openEdit(e); }}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Pencil size={12} color={DS.ink[500]} strokeWidth={1.8} />
                      </Pressable>
                      <Pressable
                        onPress={(ev: any) => { ev?.stopPropagation?.(); handleDelete(e); }}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Trash2 size={12} color={CHIP_TONES.danger.fg} strokeWidth={1.8} />
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Recurring panel */}
      <RecurringExpensesPanel
        visible={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        onAfterGenerate={() => refetch()}
      />

      {/* Material purchase / inventory intake — Stok > Satın Alma akışıyla aynı */}
      <PurchaseFormModal
        visible={purchaseOpen}
        accentColor="#DC2626"
        onClose={() => setPurchaseOpen(false)}
        onSaved={() => { setPurchaseOpen(false); refetch(); }}
      />

      {/* E-Fatura tarzı satın alma faturası önizleme — purchase_invoice_id'li giderlere */}
      <PurchaseInvoicePreviewModal
        visible={!!previewInvoiceId}
        onClose={() => setPreviewInvoiceId(null)}
        purchaseInvoiceId={previewInvoiceId}
      />

      {/* ── Add/Edit modal — §08 dialog ───────────────────── */}
      <ExpenseFormModal
        visible={modalOpen}
        expense={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); refetch(); }}
      />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// FORM MODAL — §08 dialog + §05.5 form
// ═════════════════════════════════════════════════════════════════════
function ExpenseFormModal({
  visible, expense, onClose, onSaved, accentColor = '#DC2626',
}: { visible: boolean; expense: Expense | null; onClose: () => void; onSaved: () => void; accentColor?: string }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [category, setCategory] = useState<ExpenseCategory>('kira');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'TRY' | 'EUR' | 'USD' | 'GBP'>('TRY');
  const [rate, setRate] = useState('');   // manuel kur (boş = o günün TCMB'si)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<ExpensePaymentMethod>('nakit');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // PDF Fatura okuma — kullanıcı dilerse PDF yükleyip form'u otomatik doldurabilir
  const [parsing, setParsing] = useState(false);
  const [parseInfo, setParseInfo] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setCategory(expense?.category ?? 'kira');
      setDescription(expense?.description ?? '');
      setAmount(expense ? String(expense.amount) : '');
      setCurrency(((expense as any)?.currency as any) ?? 'TRY');
      setRate(expense && (expense as any).rate_at_time && (expense as any).currency !== 'TRY' ? String((expense as any).rate_at_time) : '');
      setDate(expense?.expense_date ?? new Date().toISOString().slice(0, 10));
      setMethod(expense?.payment_method ?? 'nakit');
      setNotes(expense?.notes ?? '');
      setError('');
      setParseInfo(null);
      setParsing(false);
    }
  }, [visible, expense]);

  const handleParsePdf = async (file: File) => {
    setError(''); setParseInfo(null); setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const pdf_base64 = btoa(binary);
      const { data, error: fnErr } = await supabase.functions.invoke('parse-invoice', { body: { pdf_base64 } });
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.ok) throw new Error(data?.error ?? 'Parse başarısız');
      const d = data.data;

      // ─── Sarf / demirbaş faturası tespiti ───
      // Eğer parse edilen veride birden fazla ürün kalemi (quantity + unit_price'lı) varsa
      // veya herhangi bir kalem 'equipment' olarak işaretlenmişse → bu fatura buraya değil.
      const hasQuantifiedLines = Array.isArray(d.lines) && d.lines.filter((l: any) => {
        const q = Number(l.quantity ?? 0);
        const p = Number(l.unit_price ?? 0);
        return q > 0 && p > 0;
      }).length >= 1;
      const hasEquipmentLine = Array.isArray(d.lines) && d.lines.some(
        (l: any) => String(l.item_kind ?? '').toLowerCase() === 'equipment',
      );
      if (hasEquipmentLine || (hasQuantifiedLines && Array.isArray(d.lines) && d.lines.length >= 1)) {
        const kindLabel = hasEquipmentLine ? 'Demirbaş' : 'Sarf malzeme';
        setError(
          `Bu PDF ${kindLabel.toLowerCase()} faturasına benziyor (${d.lines.length} kalem tespit edildi). ` +
          `Bu form genel giderler içindir — sarf/demirbaş için "Stok › Satın Alma" akışını kullanın.`,
        );
        setParsing(false);
        return;
      }

      // Form alanlarını doldur — genel gider yaklaşımı
      // Açıklama: supplier + invoice no birleştir
      const desc = [d.supplier_name, d.invoice_number ? `#${d.invoice_number}` : null]
        .filter(Boolean).join(' ').trim();
      if (desc) setDescription(desc);
      // Tarih
      if (d.invoice_date) setDate(d.invoice_date);
      // Para birimi
      if (d.currency && ['TRY', 'EUR', 'USD', 'GBP'].includes(d.currency)) {
        setCurrency(d.currency);
      }
      // Toplam tutar — KDV dahil tercih
      const total = d.total ?? (
        d.subtotal != null && d.vat_amount != null
          ? Number(d.subtotal) + Number(d.vat_amount)
          : d.subtotal
      );
      if (total != null) setAmount(String(total));
      // Notlar — kalemleri özetle
      if (Array.isArray(d.lines) && d.lines.length > 0) {
        const summary = d.lines
          .map((l: any) => `${l.item_name ?? '—'}${l.quantity ? ` × ${l.quantity}` : ''}`)
          .slice(0, 10)
          .join('\n');
        setNotes(prev => prev ? prev : summary);
      }

      setParseInfo(data.source === 'efatura'
        ? 'e-Fatura XML parse edildi'
        : `OCR ile çıkarıldı${d.lines?.length ? ` (${d.lines.length} kalem)` : ''}`);
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
      if (f) handleParsePdf(f);
    };
    input.click();
  };

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!description.trim()) { setError('Açıklama zorunlu'); return; }
    if (!amt || amt <= 0)    { setError('Geçerli bir tutar girin'); return; }

    // Sarf malzeme veya demirbaş faturası kontrolü — sadece YENİ kayıtta sor
    // (mevcut linked kayıtların düzenlenmesinde tekrar sormaya gerek yok)
    if (!expense && (category === 'malzeme' || category === 'ekipman')) {
      const label = category === 'malzeme' ? 'Sarf malzeme' : 'Demirbaş';
      const ok = Platform.OS === 'web'
        ? (typeof window !== 'undefined' && window.confirm(
            `${label} faturalarının doğru yeri "Stok › Satın Alma" akışıdır.\n\n` +
            `Oradan girersen stok hareketi, tedarikçi cari hesabı ve gider kaydı otomatik birlikte oluşur.\n\n` +
            `Yine de bu formdan kaydetmek istediğinden emin misin?`,
          ))
        : await new Promise<boolean>((resolve) => {
            Alert.alert(
              `${label} faturası mı?`,
              'Doğru yer "Stok › Satın Alma" akışıdır. Yine de buradan kaydetmek istediğine emin misin?',
              [
                { text: 'Vazgeç',  style: 'cancel',      onPress: () => resolve(false) },
                { text: 'Yine de kaydet', style: 'destructive', onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            );
          });
      if (!ok) return;
    }

    setSaving(true); setError('');
    const manualRate = currency !== 'TRY' && rate.trim() ? Number(rate.replace(',', '.')) : undefined;
    const params: CreateExpenseParams = {
      category, description: description.trim(), amount: amt,
      currency,
      rate: manualRate && manualRate > 0 ? manualRate : undefined,
      expense_date: date, payment_method: method, notes: notes.trim() || undefined,
    };
    const { error: apiErr } = expense
      ? await updateExpense(expense.id, params)
      : await createExpense(params);
    setSaving(false);
    if (apiErr) { setError((apiErr as any).message ?? 'Hata oluştu'); return; }
    onSaved();
  };

  // Patterns §13 form tokens
  const DisplayFontFamily = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const sectionEyebrow: any = { fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 };
  const sectionSubtitle: any = { fontSize: 11, color: T.ink3, fontWeight: '400', marginBottom: 14 };
  const fieldLabel: any = { fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7 };
  const cleanInput: any = { backgroundColor: T.cardSoft, borderRadius: 12, borderWidth: 1, borderColor: T.hairline, paddingHorizontal: 14, height: 44, fontSize: 14, color: T.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: T.card, borderRadius: 24, width: 560, maxWidth: '100%', maxHeight: '92%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          {/* Header — Patterns §13 */}
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
                  {expense ? 'Gider düzenle' : 'Yeni gider'}
                </Text>
                <Text style={{ fontFamily: DisplayFontFamily, fontWeight: '300', fontSize: 26, letterSpacing: -0.6, color: T.ink, lineHeight: 32, marginTop: 2 }} numberOfLines={1}>
                  {expense ? (description || 'Gider') : 'Genel gider kaydı'}
                </Text>
                <Text style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>
                  Kira, personel, ekipman, vergi vb. operasyonel giderler için.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 18,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={15} color={T.ink2} strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: T.hairline2, marginHorizontal: 28 }} />

          <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 22, paddingBottom: 22 }} showsVerticalScrollIndicator={false}>

            {/* ── Üst uyarı / hata banner — form en üstünde görünür ── */}
            {error ? (
              <View style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                padding: 14, marginBottom: 18, borderRadius: 12,
                backgroundColor: '#FEE2E2',
                borderWidth: 1, borderColor: '#FCA5A5',
              }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 11, marginTop: 1,
                  alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626',
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>!</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Uyarı
                  </Text>
                  <Text style={{ fontSize: 12.5, color: '#7F1D1D', lineHeight: 18, fontWeight: '500' }}>
                    {error}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setError('')}
                  hitSlop={6}
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    alignItems: 'center', justifyContent: 'center',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <X size={13} color="#7F1D1D" strokeWidth={2} />
                </Pressable>
              </View>
            ) : null}

            {/* ── PDF Fatura → Otomatik doldur (sadece web) ── */}
            {Platform.OS === 'web' && (
              <View style={{ marginBottom: 18 }}>
                <Pressable
                  onPress={handlePickPdf}
                  disabled={parsing}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, paddingVertical: 11, paddingHorizontal: 14,
                    borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
                    borderColor: accentColor + '55',
                    backgroundColor: accentColor + '08',
                    opacity: parsing ? 0.6 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <FileUp size={15} color={accentColor} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>
                    {parsing ? 'Fatura işleniyor…' : 'PDF Faturayı Yükle (otomatik doldur)'}
                  </Text>
                  {!parsing && <Sparkles size={13} color={accentColor} strokeWidth={1.8} />}
                </Pressable>
                {parseInfo ? (
                  <View style={{
                    marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                  }}>
                    <Check size={12} color="#0F6E50" strokeWidth={2} />
                    <Text style={{ fontSize: 11, color: '#0F6E50', fontWeight: '600' }}>{parseInfo}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* ── KATEGORİ ── */}
            <Text style={sectionEyebrow}>Kategori</Text>
            <Text style={sectionSubtitle}>
              Sarf malzeme & demirbaş faturaları için "Stok › Satın Alma" akışını kullan; bu form sadece operasyonel giderler içindir.
            </Text>
            <View style={{ marginBottom: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {/* Mevcut kategori malzeme/ekipman ise (eski kayıt düzenleme) listede tut */}
              {(FORM_CATEGORIES.includes(category) ? FORM_CATEGORIES : [category, ...FORM_CATEGORIES]).map(cat => {
                const active = category === cat;
                const Icon = CAT_ICON[cat];
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                      borderWidth: 1,
                      borderColor: active ? accentColor : T.hairline,
                      backgroundColor: active ? accentColor : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Icon size={12} color={active ? '#FFF' : T.ink2} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : T.ink2 }}>
                      {EXPENSE_CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 1, backgroundColor: T.hairline2, marginBottom: 22 }} />

            {/* ── AÇIKLAMA & TUTAR ── */}
            <Text style={sectionEyebrow}>Detay</Text>
            <Text style={sectionSubtitle}>Açıklama, tutar ve tarih</Text>
            <View style={{ marginBottom: 22, gap: 12 }}>
              <View>
                <Text style={fieldLabel}>Açıklama *</Text>
                <TextInput
                  style={cleanInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="örn. Mart kira, internet faturası…"
                  placeholderTextColor={T.ink3}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                <View style={{ flex: 1.4, minWidth: 220 }}>
                  <Text style={fieldLabel}>Tutar *</Text>
                  <MoneyInput
                    value={amount}
                    onChangeValue={setAmount}
                    currency={currency}
                    onChangeCurrency={setCurrency}
                    accentColor={accentColor}
                    placeholder="0,00"
                    showBasePreview
                  />
                </View>
                <View style={{ flex: 1, minWidth: 180 }}>
                  <Text style={fieldLabel}>Tarih</Text>
                  <DatePicker value={date} onChange={setDate} placeholder="Tarih seç" />
                </View>
              </View>
              {currency !== 'TRY' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={fieldLabel}>Kur — 1 {currency} = {baseSymbol()}?</Text>
                  <TextInput
                    value={rate}
                    onChangeText={setRate}
                    keyboardType="decimal-pad"
                    placeholder="Boş bırak = o günün TCMB kuru"
                    placeholderTextColor={T.ink3}
                    style={{ borderWidth: 1, borderColor: T.hairline, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: T.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                  />
                  {rate.trim() ? (
                    <Text style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>
                      ≈ {baseSymbol()}{((parseFloat(amount.replace(',', '.')) || 0) * (Number(rate.replace(',', '.')) || 0)).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>

            <View style={{ height: 1, backgroundColor: T.hairline2, marginBottom: 22 }} />

            {/* ── ÖDEME ── */}
            <Text style={sectionEyebrow}>Ödeme</Text>
            <Text style={sectionSubtitle}>Hangi yöntemle ödendi</Text>
            <View style={{ marginBottom: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {PAY_METHODS.map(m => {
                const active = method === m.v;
                return (
                  <Pressable
                    key={m.v}
                    onPress={() => setMethod(m.v)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                      borderWidth: 1,
                      borderColor: active ? accentColor : T.hairline,
                      backgroundColor: active ? accentColor : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : T.ink2 }}>
                      {m.l}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: 1, backgroundColor: T.hairline2, marginBottom: 22 }} />

            {/* ── NOT ── */}
            <Text style={sectionEyebrow}>Not</Text>
            <Text style={sectionSubtitle}>Hatırlatma, fatura no, referans (opsiyonel)</Text>
            <View>
              <TextInput
                style={[cleanInput, { height: 72, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Açıklama / not"
                placeholderTextColor={T.ink3}
                multiline
              />
            </View>

            {/* (Hata banner'ı artık form üstünde görünüyor) */}
          </ScrollView>

          {/* Footer — Patterns §13 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 18, borderTopWidth: 1, borderTopColor: T.hairline2, backgroundColor: isDark ? T.cardSoft : '#FBF9F4' }}>
            <Text style={{ flex: 1, fontSize: 11, color: T.ink3, fontStyle: 'italic' }}>
              Yabancı para birimi seçilirse o günün kuru ile snapshot alınır.
            </Text>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: T.card,
                borderWidth: 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: T.ink2 }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 20, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: accentColor, opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer', boxShadow: `0 6px 20px ${accentColor}44` } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>
                {saving ? 'Kaydediliyor…' : expense ? 'Güncelle' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Pill button ─────────────────────────────────────────────────────
function PillBtn({ icon: Icon, label, onPress, variant = 'dark', onHero, heroAccent }: {
  icon: React.ComponentType<any>; label: string; onPress: () => void;
  variant?: 'dark' | 'ghost';
  onHero?: boolean;
  heroAccent?: string;
}) {
  const dark = variant === 'dark';
  let bg: string; let fg: string;
  let borderColor: string = DS.ink[200];
  let borderWidth = dark ? 0 : 1;
  if (onHero) {
    if (dark) { bg = '#FFFFFF'; fg = heroAccent ?? DS.ink[900]; borderWidth = 0; }
    else { bg = 'transparent'; fg = '#FFFFFF'; borderColor = 'rgba(255,255,255,0.55)'; borderWidth = 1; }
  } else {
    bg = dark ? DS.ink[900] : 'transparent';
    fg = dark ? '#FFF' : DS.ink[700];
  }
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
        backgroundColor: bg, borderWidth, borderColor,
        cursor: 'pointer' as any,
      }}
    >
      <Icon size={14} color={fg} strokeWidth={onHero && dark ? 2.2 : 1.8} />
      <Text style={{ fontSize: 12, fontWeight: onHero && dark ? '700' : '600', color: fg }}>{label}</Text>
    </Pressable>
  );
}

// ─── Form helpers ────────────────────────────────────────────────────
function FL({ children }: { children: string }) {
  const T = useMobileTokens();
  return (
    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: T.ink3 }}>
      {children}
    </Text>
  );
}

function FI(props: any) {
  const T = useMobileTokens();
  const { style: extra, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={T.ink3}
      {...rest}
      style={[{
        height: 44, paddingHorizontal: 14, borderRadius: 14,
        borderWidth: 1, borderColor: T.hairline, backgroundColor: T.cardSoft,
        fontSize: 14, color: T.ink, outline: 'none' as any,
      }, extra]}
    />
  );
}

export default ExpensesScreen;
