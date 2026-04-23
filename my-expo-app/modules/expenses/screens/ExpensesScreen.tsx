import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useExpenses } from '../hooks/useExpenses';
import {
  createExpense, updateExpense, deleteExpense,
  EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_ICONS, EXPENSE_CATEGORY_COLORS,
  type Expense, type ExpenseCategory, type ExpensePaymentMethod, type CreateExpenseParams,
} from '../api';
import { useBreakpoint } from '../../../core/layout/Responsive';

function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const CATEGORIES: ExpenseCategory[] = ['malzeme', 'kira', 'personel', 'ekipman', 'vergi', 'diger'];
const PAY_METHODS: { v: ExpensePaymentMethod; l: string }[] = [
  { v: 'nakit', l: 'Nakit' }, { v: 'kart', l: 'Kart' },
  { v: 'havale', l: 'Havale' }, { v: 'cek', l: 'Çek' }, { v: 'diger', l: 'Diğer' },
];

export function ExpensesScreen() {
  const { isDesktop, px } = useBreakpoint();
  const [catFilter, setCatFilter] = useState<ExpenseCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
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

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (e: Expense) => { setEditing(e); setModalOpen(true); };

  const handleDelete = (e: Expense) => {
    Alert.alert('Gider Sil', `"${e.description}" kaydını silmek istediğinize emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await deleteExpense(e.id); refetch();
      }},
    ]);
  };

  // Category summary cards
  const catTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) map[e.category] = (map[e.category] ?? 0) + Number(e.amount);
    return map;
  }, [expenses]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { paddingHorizontal: px }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Giderler</Text>
          <Text style={s.subtitle}>Toplam: {fmtMoney(totalAmount)}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.85}>
          <MaterialCommunityIcons name={'plus' as any} size={16} color="#fff" />
          <Text style={s.addBtnText}>Gider Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* Category summary — horizontal chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: px, paddingVertical: 10, gap: 8, flexDirection: 'row' }}>
        <TouchableOpacity
          style={[s.catChip, catFilter === 'all' && s.catChipActive]}
          onPress={() => setCatFilter('all')} activeOpacity={0.8}>
          <Text style={[s.catChipLabel, catFilter === 'all' && s.catChipLabelActive]}>Tümü</Text>
        </TouchableOpacity>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[s.catChip, catFilter === cat && { borderColor: EXPENSE_CATEGORY_COLORS[cat], backgroundColor: EXPENSE_CATEGORY_COLORS[cat] + '15' }]}
            onPress={() => setCatFilter(cat)} activeOpacity={0.8}>
            <MaterialCommunityIcons name={EXPENSE_CATEGORY_ICONS[cat] as any} size={13} color={EXPENSE_CATEGORY_COLORS[cat]} />
            <Text style={[s.catChipLabel, catFilter === cat && { color: EXPENSE_CATEGORY_COLORS[cat], fontWeight: '700' }]}>
              {EXPENSE_CATEGORY_LABELS[cat]}
            </Text>
            {catTotals[cat] ? (
              <Text style={[s.catChipAmt, { color: EXPENSE_CATEGORY_COLORS[cat] }]}>
                {fmtMoney(catTotals[cat])}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={[s.searchRow, { paddingHorizontal: px }]}>
        <View style={s.searchWrap}>
          <MaterialCommunityIcons name={'magnify' as any} size={16} color="#94A3B8" />
          <TextInput style={s.searchInput} placeholder="Açıklama ara..."
            placeholderTextColor="#94A3B8" value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialCommunityIcons name={'close-circle' as any} size={15} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1, backgroundColor: '#F8FAFC' }}
        contentContainerStyle={{ padding: px, paddingBottom: 48, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#AEAEB2" />}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <MaterialCommunityIcons name={'receipt-text-remove-outline' as any} size={40} color="#CBD5E1" />
            <Text style={s.emptyText}>Gider kaydı bulunamadı</Text>
          </View>
        ) : (
          <View style={isDesktop ? s.desktopGrid : undefined}>
            {filtered.map(exp => (
              <ExpenseCard key={exp.id} expense={exp}
                onEdit={() => openEdit(exp)} onDelete={() => handleDelete(exp)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <ExpenseFormModal
        visible={modalOpen}
        expense={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); refetch(); }}
      />
    </SafeAreaView>
  );
}

// ─── Expense Card ──────────────────────────────────────────────────────────────
function ExpenseCard({ expense: e, onEdit, onDelete }: { expense: Expense; onEdit: () => void; onDelete: () => void }) {
  const color = EXPENSE_CATEGORY_COLORS[e.category];
  return (
    <View style={ec.wrap}>
      <View style={[ec.accent, { backgroundColor: color }]} />
      <View style={ec.iconWrap}>
        <MaterialCommunityIcons name={EXPENSE_CATEGORY_ICONS[e.category] as any} size={20} color={color} />
      </View>
      <View style={ec.body}>
        <Text style={ec.desc} numberOfLines={1}>{e.description}</Text>
        <Text style={ec.meta}>
          {EXPENSE_CATEGORY_LABELS[e.category]} · {fmtDate(e.expense_date)}
        </Text>
      </View>
      <View style={ec.right}>
        <Text style={ec.amount}>{fmtMoney(e.amount)}</Text>
        <View style={ec.actions}>
          <TouchableOpacity style={ec.iconBtn} onPress={onEdit} activeOpacity={0.7}>
            <MaterialCommunityIcons name={'pencil-outline' as any} size={16} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity style={ec.iconBtn} onPress={onDelete} activeOpacity={0.7}>
            <MaterialCommunityIcons name={'delete-outline' as any} size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Form Modal ───────────────────────────────────────────────────────────────
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

    setSaving(true);
    setError('');
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
      <View style={fm.overlay}>
        <View style={fm.card}>
          {/* Header */}
          <View style={fm.header}>
            <Text style={fm.title}>{expense ? 'Gider Düzenle' : 'Gider Ekle'}</Text>
            <TouchableOpacity onPress={onClose} style={fm.closeBtn}>
              <MaterialCommunityIcons name={'close' as any} size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, padding: 20 }}>
            {/* Category */}
            <View>
              <Text style={fm.label}>KATEGORİ</Text>
              <View style={fm.chipRow}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat}
                    style={[fm.chip, category === cat && { borderColor: EXPENSE_CATEGORY_COLORS[cat], backgroundColor: EXPENSE_CATEGORY_COLORS[cat] + '15' }]}
                    onPress={() => setCategory(cat)} activeOpacity={0.8}>
                    <MaterialCommunityIcons name={EXPENSE_CATEGORY_ICONS[cat] as any} size={13} color={EXPENSE_CATEGORY_COLORS[cat]} />
                    <Text style={[fm.chipText, category === cat && { color: EXPENSE_CATEGORY_COLORS[cat], fontWeight: '700' }]}>
                      {EXPENSE_CATEGORY_LABELS[cat]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Description */}
            <View>
              <Text style={fm.label}>AÇIKLAMA</Text>
              <TextInput style={fm.input} value={description} onChangeText={setDescription}
                placeholder="Gider açıklaması..." placeholderTextColor="#CBD5E1" />
            </View>

            {/* Amount + Date */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>TUTAR (₺)</Text>
                <TextInput style={fm.input} value={amount} onChangeText={setAmount}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                  placeholder="0,00" placeholderTextColor="#CBD5E1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>TARİH</Text>
                <TextInput style={fm.input} value={date} onChangeText={setDate}
                  placeholder="YYYY-AA-GG" placeholderTextColor="#CBD5E1" />
              </View>
            </View>

            {/* Payment method */}
            <View>
              <Text style={fm.label}>ÖDEME YÖNTEMİ</Text>
              <View style={fm.chipRow}>
                {PAY_METHODS.map(m => (
                  <TouchableOpacity key={m.v}
                    style={[fm.chip, method === m.v && fm.chipActive]}
                    onPress={() => setMethod(m.v)} activeOpacity={0.8}>
                    <Text style={[fm.chipText, method === m.v && fm.chipTextActive]}>{m.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Notes */}
            <View>
              <Text style={fm.label}>NOT (ops.)</Text>
              <TextInput style={[fm.input, { minHeight: 52, textAlignVertical: 'top' }]}
                value={notes} onChangeText={setNotes} multiline
                placeholder="Opsiyonel not..." placeholderTextColor="#CBD5E1" />
            </View>

            {error ? <Text style={fm.error}>{error}</Text> : null}
          </ScrollView>

          {/* Footer */}
          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={fm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[fm.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              <Text style={fm.saveText}>{saving ? 'Kaydediliyor…' : expense ? 'Güncelle' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#FFFFFF' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 12 },
  title:        { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  subtitle:     { fontSize: 13, color: '#64748B', marginTop: 2 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#2563EB' },
  addBtnText:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  catChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  catChipActive:{ borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  catChipLabel: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  catChipLabelActive: { color: '#2563EB', fontWeight: '700' },
  catChipAmt:   { fontSize: 10, fontWeight: '700' },
  searchRow:    { paddingBottom: 8 },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#F1F5F9' },
  searchInput:  { flex: 1, fontSize: 14, color: '#0F172A' },
  empty:        { alignItems: 'center', paddingVertical: 64, gap: 12 },
  emptyText:    { fontSize: 15, color: '#94A3B8', fontWeight: '500' },
  desktopGrid:  { gap: 10 },
});

const ec = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden', gap: 0 },
  accent:  { width: 4, alignSelf: 'stretch' },
  iconWrap:{ width: 44, alignItems: 'center', justifyContent: 'center' },
  body:    { flex: 1, paddingVertical: 14, gap: 3 },
  desc:    { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  meta:    { fontSize: 11, color: '#94A3B8' },
  right:   { alignItems: 'flex-end', paddingHorizontal: 14, gap: 6 },
  amount:  { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  actions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
});

const fm = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:     { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 540, maxHeight: '90%', overflow: 'hidden' },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:    { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  label:    { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  input:    { fontSize: 14, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#0F172A', backgroundColor: '#0F172A' },
  chipText: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  error:    { fontSize: 12, color: '#EF4444', fontWeight: '500' },
  footer:   { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn:{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  saveBtn:  { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
