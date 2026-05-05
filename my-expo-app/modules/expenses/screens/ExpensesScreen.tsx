/**
 * ExpensesScreen — Giderler (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 form, §08 dialog, §03 pill buttons,
 * Lucide icons.
 */
import React, { useState, useMemo, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, RefreshControl, Platform,
  useWindowDimensions,
} from 'react-native';

import { useExpenses } from '../hooks/useExpenses';
import {
  createExpense, updateExpense, deleteExpense,
  EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_COLORS,
  type Expense, type ExpenseCategory, type ExpensePaymentMethod, type CreateExpenseParams,
} from '../api';
import { DS } from '../../../core/theme/dsTokens';
import { RecurringExpensesPanel } from '../components/RecurringExpensesPanel';
import { downloadCsv, csvMoney, csvDate } from '../../../core/util/csvExport';
import { toast } from '../../../core/ui/Toast';
import {
  Plus, Search, X, Inbox, Pencil, Trash2,
  Package, Building, Users, Wrench, Receipt, MoreHorizontal,
  Repeat, FileSpreadsheet, Banknote, CreditCard, Landmark,
  FileText, CircleDot,
} from 'lucide-react-native';

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

const CATEGORIES: ExpenseCategory[] = ['malzeme', 'kira', 'personel', 'ekipman', 'vergi', 'diger'];
const PAY_METHODS: { v: ExpensePaymentMethod; l: string; icon: React.ComponentType<any> }[] = [
  { v: 'nakit',  l: 'Nakit',  icon: Banknote },
  { v: 'kart',   l: 'Kart',   icon: CreditCard },
  { v: 'havale', l: 'Havale', icon: Landmark },
  { v: 'cek',    l: 'Çek',    icon: FileText },
  { v: 'diger',  l: 'Diğer',  icon: CircleDot },
];

// ── Helpers ──────────────────────────────────────────────────────────
function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ExpensesScreen() {
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const [catFilter, setCatFilter] = useState<ExpenseCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const { expenses, loading, refetch } = useExpenses(
    catFilter !== 'all' ? { category: catFilter } : undefined,
  );

  const filtered = useMemo(() => {
    if (!search) return expenses;
    const sl = search.toLowerCase();
    return expenses.filter(e =>
      e.description.toLowerCase().includes(sl) ||
      EXPENSE_CATEGORY_LABELS[e.category].toLowerCase().includes(sl),
    );
  }, [expenses, search]);

  const totalAmount = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount), 0), [filtered]);

  const catTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) map[e.category] = (map[e.category] ?? 0) + Number(e.amount);
    return map;
  }, [expenses]);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (e: Expense) => { setEditing(e); setModalOpen(true); };

  const handleDelete = (e: Expense) => {
    Alert.alert('Gider Sil', `"${e.description}" kaydını silmek istediğinize emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => { await deleteExpense(e.id); refetch(); } },
    ]);
  };

  const handleExcel = async () => {
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
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isDesktop ? 0 : 16, paddingBottom: 48, gap: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DS.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — §10 glassmorphism ────────────────────────── */}
        <View style={{
          borderRadius: 28, overflow: 'hidden',
          backgroundColor: DS.lab.bg, padding: isDesktop ? 36 : 24,
          position: 'relative',
        }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: DS.lab.bgDeep, opacity: 0.6 }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: DS.lab.bgDeep, opacity: 0.4 }} />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 12 }}>
                Toplam Gider
              </Text>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 48 : 36, letterSpacing: -1.4, color: DS.ink[900] }}>
                {fmtMoney(totalAmount)}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 6 }}>
                {filtered.length} kayıt
              </Text>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <PillBtn icon={Repeat} label="Otomatik" onPress={() => setRecurringOpen(true)} variant="ghost" />
              <PillBtn icon={FileSpreadsheet} label="Excel" onPress={handleExcel} variant="ghost" />
              <PillBtn icon={Plus} label="Gider Ekle" onPress={openAdd} />
            </View>
          </View>

          {/* Category breakdown */}
          <View style={{ flexDirection: 'row', gap: isDesktop ? 24 : 16, marginTop: 20, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => {
              const val = catTotals[cat] ?? 0;
              if (val <= 0) return null;
              const Icon = CAT_ICON[cat];
              return (
                <View key={cat}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon size={11} color={EXPENSE_CATEGORY_COLORS[cat]} strokeWidth={1.8} />
                    <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                      {EXPENSE_CATEGORY_LABELS[cat]}
                    </Text>
                  </View>
                  <Text style={{ ...DISPLAY, fontSize: 16, letterSpacing: -0.3, color: DS.ink[700], marginTop: 2 }}>
                    {fmtMoney(val)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Category filter pills ───────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Pressable
            onPress={() => setCatFilter('all')}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
              borderWidth: 1,
              borderColor: catFilter === 'all' ? DS.ink[900] : 'rgba(0,0,0,0.08)',
              backgroundColor: catFilter === 'all' ? DS.ink[50] : '#FFF',
              cursor: 'pointer' as any,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: catFilter === 'all' ? '600' : '500', color: catFilter === 'all' ? DS.ink[900] : DS.ink[500] }}>
              Tümü
            </Text>
          </Pressable>
          {CATEGORIES.map(cat => {
            const active = catFilter === cat;
            const color = EXPENSE_CATEGORY_COLORS[cat];
            const Icon = CAT_ICON[cat];
            return (
              <Pressable
                key={cat}
                onPress={() => setCatFilter(cat)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? color : 'rgba(0,0,0,0.08)',
                  backgroundColor: active ? `${color}15` : '#FFF',
                  cursor: 'pointer' as any,
                }}
              >
                <Icon size={12} color={color} strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? color : DS.ink[500] }}>
                  {EXPENSE_CATEGORY_LABELS[cat]}
                </Text>
                {(catTotals[cat] ?? 0) > 0 && (
                  <Text style={{ fontSize: 10, fontWeight: '700', color }}>
                    {fmtMoney(catTotals[cat])}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Search — §05.5 ──────────────────────────────────── */}
        <View style={{
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
              const color = EXPENSE_CATEGORY_COLORS[e.category];
              const Icon = CAT_ICON[e.category];
              return (
                <View key={e.id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 20, paddingVertical: 14,
                  borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                  borderBottomColor: 'rgba(0,0,0,0.04)',
                }}>
                  {/* Category */}
                  <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: `${color}15`, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={13} color={color} strokeWidth={1.8} />
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '600', color }}>{EXPENSE_CATEGORY_LABELS[e.category]}</Text>
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

                  {/* Amount */}
                  <Text style={{ flex: 1.2, fontSize: 13, fontWeight: '600', color: DS.ink[900], textAlign: 'right' }}>
                    {fmtMoney(e.amount)}
                  </Text>

                  {/* Actions */}
                  <View style={{ flex: 0.8, flexDirection: 'row', gap: 4, justifyContent: 'flex-end' }}>
                    <Pressable
                      onPress={() => openEdit(e)}
                      style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                    >
                      <Pencil size={12} color={DS.ink[500]} strokeWidth={1.8} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(e)}
                      style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                    >
                      <Trash2 size={12} color={CHIP_TONES.danger.fg} strokeWidth={1.8} />
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {/* Footer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FAFAFA' }}>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>{filtered.length} kayıt</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>
                Toplam: {fmtMoney(totalAmount)}
              </Text>
            </View>
          </View>
        ) : (
          /* ── Mobile: cardSolid §05 ──────────────────────────── */
          <View style={{ gap: 10 }}>
            {filtered.map(e => {
              const color = EXPENSE_CATEGORY_COLORS[e.category];
              const Icon = CAT_ICON[e.category];
              return (
                <View key={e.id} style={{ ...cardSolid, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: `${color}15`,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={18} color={color} strokeWidth={1.6} />
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
                      {fmtMoney(e.amount)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <Pressable
                        onPress={() => openEdit(e)}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Pencil size={12} color={DS.ink[500]} strokeWidth={1.8} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(e)}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Trash2 size={12} color={CHIP_TONES.danger.fg} strokeWidth={1.8} />
                      </Pressable>
                    </View>
                  </View>
                </View>
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
  visible, expense, onClose, onSaved,
}: { visible: boolean; expense: Expense | null; onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<ExpenseCategory>('malzeme');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<ExpensePaymentMethod>('nakit');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (visible) {
      setCategory(expense?.category ?? 'malzeme');
      setDescription(expense?.description ?? '');
      setAmount(expense ? String(expense.amount) : '');
      setDate(expense?.expense_date ?? new Date().toISOString().slice(0, 10));
      setMethod(expense?.payment_method ?? 'nakit');
      setNotes(expense?.notes ?? '');
      setError('');
    }
  }, [visible, expense]);

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!description.trim()) { setError('Açıklama zorunludur.'); return; }
    if (!amt || amt <= 0)    { setError('Geçerli bir tutar girin.'); return; }

    setSaving(true); setError('');
    const params: CreateExpenseParams = {
      category, description: description.trim(), amount: amt,
      expense_date: date, payment_method: method, notes: notes.trim() || undefined,
    };
    const { error: apiErr } = expense
      ? await updateExpense(expense.id, params)
      : await createExpense(params);
    setSaving(false);
    if (apiErr) { setError((apiErr as any).message ?? 'Hata oluştu.'); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 540, maxHeight: '90%', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', boxShadow: modalShadow } as any}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
              {expense ? 'Gider Düzenle' : 'Gider Ekle'}
            </Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={DS.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingBottom: 8 }}>
            {/* Category */}
            <View style={{ gap: 6 }}>
              <FL>Kategori</FL>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {CATEGORIES.map(cat => {
                  const active = category === cat;
                  const color = EXPENSE_CATEGORY_COLORS[cat];
                  const Icon = CAT_ICON[cat];
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setCategory(cat)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: active ? color : 'rgba(0,0,0,0.08)',
                        backgroundColor: active ? `${color}15` : '#FFF',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Icon size={12} color={color} strokeWidth={1.8} />
                      <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? color : DS.ink[500] }}>
                        {EXPENSE_CATEGORY_LABELS[cat]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Description */}
            <View style={{ gap: 6 }}>
              <FL>Açıklama</FL>
              <FI value={description} onChangeText={setDescription} placeholder="Gider açıklaması..." />
            </View>

            {/* Amount + Date */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>Tutar</FL>
                <FI value={amount} onChangeText={setAmount} placeholder="0,00"
                  keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>Tarih</FL>
                <FI value={date} onChangeText={setDate} placeholder="YYYY-AA-GG" />
              </View>
            </View>

            {/* Payment method */}
            <View style={{ gap: 6 }}>
              <FL>Ödeme Yöntemi</FL>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {PAY_METHODS.map(m => {
                  const active = method === m.v;
                  return (
                    <Pressable
                      key={m.v}
                      onPress={() => setMethod(m.v)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: active ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                        backgroundColor: active ? DS.ink[50] : '#FFF',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>
                        {m.l}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Notes */}
            <View style={{ gap: 6 }}>
              <FL>Not (opsiyonel)</FL>
              <FI value={notes} onChangeText={setNotes} placeholder="..." multiline
                style={{ minHeight: 52, textAlignVertical: 'top' as any }} />
            </View>

            {error ? <Text style={{ fontSize: 12, color: CHIP_TONES.danger.fg }}>{error}</Text> : null}
          </ScrollView>

          {/* Footer — §08 */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable onPress={onClose} disabled={saving} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: DS.ink[900], opacity: saving ? 0.5 : 1, cursor: 'pointer' as any }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
                {saving ? 'Kaydediliyor...' : expense ? 'Güncelle' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Pill button ─────────────────────────────────────────────────────
function PillBtn({ icon: Icon, label, onPress, variant = 'dark' }: {
  icon: React.ComponentType<any>; label: string; onPress: () => void;
  variant?: 'dark' | 'ghost';
}) {
  const dark = variant === 'dark';
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
        backgroundColor: dark ? DS.ink[900] : 'transparent',
        borderWidth: dark ? 0 : 1, borderColor: DS.ink[200],
        cursor: 'pointer' as any,
      }}
    >
      <Icon size={14} color={dark ? '#FFF' : DS.ink[700]} strokeWidth={1.8} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: dark ? '#FFF' : DS.ink[700] }}>{label}</Text>
    </Pressable>
  );
}

// ─── Form helpers ────────────────────────────────────────────────────
function FL({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[400] }}>
      {children}
    </Text>
  );
}

function FI(props: any) {
  const { style: extra, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={DS.ink[300]}
      {...rest}
      style={[{
        height: 44, paddingHorizontal: 14, borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
        fontSize: 14, color: DS.ink[900], outline: 'none' as any,
      }, extra]}
    />
  );
}

export default ExpensesScreen;
