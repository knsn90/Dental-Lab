/**
 * BudgetScreen — Bütçe vs. Gerçekleşen
 *
 *  • Kategori + total bütçesi tanımla
 *  • Aylık / yıllık dönem
 *  • İlerleme çubuğu + uyarı (>%100 kırmızı, >%80 sarı, ≤%80 yeşil)
 *  • Yeni bütçe ekleme modalı
 *
 *  Kullanım: FinanceHub'da yeni "Bütçe" sekmesi olarak bağlanır.
 */
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../../core/api/supabase';
import { AppIcon } from '../../../core/ui/AppIcon';
import { HubContext } from '../../../core/ui/HubContext';
import { Shadows, CardSpec } from '../../../core/theme/shadows';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';

type BudgetCategory = 'malzeme' | 'kira' | 'personel' | 'ekipman' | 'vergi' | 'diger' | 'total';
type BudgetPeriod   = 'monthly' | 'yearly';

const CATEGORY_LABEL: Record<BudgetCategory, string> = {
  total:     'Toplam',
  kira:      'Kira',
  personel:  'Personel',
  malzeme:   'Malzeme',
  ekipman:   'Ekipman',
  vergi:     'Vergi',
  diger:     'Diğer',
};

const CATEGORY_COLOR: Record<BudgetCategory, string> = {
  total:     '#0F172A',
  kira:      '#7C3AED',
  personel:  '#DC2626',
  malzeme:   '#2563EB',
  ekipman:   '#0EA5E9',
  vergi:     '#D97706',
  diger:     '#64748B',
};

interface BudgetActual {
  id: string;
  lab_id: string;
  category: BudgetCategory;
  period: BudgetPeriod;
  period_start: string;
  budget_amount: number;
  actual_amount: number;
  notes: string | null;
}

function fmtMoney(n: number): string {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function periodLabel(period: BudgetPeriod, start: string): string {
  const d = new Date(start + 'T00:00:00');
  if (period === 'yearly') return d.getFullYear().toString();
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

function currentPeriodStart(period: BudgetPeriod): string {
  const d = new Date();
  if (period === 'yearly') return `${d.getFullYear()}-01-01`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function BudgetScreen() {
  const isEmbedded = useContext(HubContext);
  const safeEdges  = isEmbedded ? ([] as any) : (['top'] as any);
  const labId      = useAuthStore(st => st.profile?.lab_id);

  const [items, setItems]       = useState<BudgetActual[]>([]);
  const [period, setPeriod]     = useState<BudgetPeriod>('monthly');
  const [loading, setLoading]   = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing]   = useState<BudgetActual | null>(null);

  const load = async () => {
    if (!labId) return;
    setLoading(true);
    const start = currentPeriodStart(period);
    const { data } = await supabase
      .from('v_budget_actuals')
      .select('*')
      .eq('period', period)
      .eq('period_start', start);
    setItems((data ?? []) as BudgetActual[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [period, labId]);

  const totals = useMemo(() => {
    return items.reduce((acc, b) => ({
      budget: acc.budget + Number(b.budget_amount),
      actual: acc.actual + Number(b.actual_amount),
    }), { budget: 0, actual: 0 });
  }, [items]);

  const overall = totals.budget > 0 ? (totals.actual / totals.budget) * 100 : 0;

  return (
    <SafeAreaView style={s.safe} edges={safeEdges}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {/* Period switcher + Add button */}
        <View style={s.toolbar}>
          <View style={s.periodRow}>
            {(['monthly','yearly'] as BudgetPeriod[]).map(p => (
              <TouchableOpacity key={p}
                style={[s.periodChip, period === p && s.periodChipActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[s.periodChipText, period === p && { color: '#FFFFFF' }]}>
                  {p === 'monthly' ? 'Aylık' : 'Yıllık'}
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={s.periodMeta}>{periodLabel(period, currentPeriodStart(period))}</Text>
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => { setEditing(null); setEditorOpen(true); }}
          >
            <AppIcon name="plus" size={15} color="#FFFFFF" />
            <Text style={s.addText}>Bütçe Ekle</Text>
          </TouchableOpacity>
        </View>

        {/* Overall summary */}
        {items.length > 0 && (
          <View style={s.summary}>
            <Text style={s.summaryLabel}>{period === 'monthly' ? 'Bu Ayın' : 'Bu Yılın'} Bütçesi</Text>
            <View style={s.summaryAmounts}>
              <View>
                <Text style={s.summaryHint}>Gerçekleşen</Text>
                <Text style={[s.summaryActual, overall > 100 && { color: '#DC2626' }]}>{fmtMoney(totals.actual)}</Text>
              </View>
              <Text style={s.summarySep}>/</Text>
              <View>
                <Text style={s.summaryHint}>Bütçe</Text>
                <Text style={s.summaryBudget}>{fmtMoney(totals.budget)}</Text>
              </View>
            </View>
            <ProgressBar pct={overall} />
            <Text style={s.summaryPct}>%{overall.toFixed(0)} kullanıldı</Text>
          </View>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <View style={s.empty}>
            <AppIcon name="chart-pie" size={48} color="#CBD5E1" />
            <Text style={s.emptyTitle}>Bu dönem için bütçe yok</Text>
            <Text style={s.emptySub}>"Bütçe Ekle" ile kategorilere limit tanımlayın.</Text>
          </View>
        )}

        {/* Per-category bars */}
        {items.map(b => (
          <BudgetCard
            key={b.id} item={b}
            onEdit={() => { setEditing(b); setEditorOpen(true); }}
          />
        ))}
      </ScrollView>

      <BudgetEditor
        visible={editorOpen}
        record={editing}
        defaultPeriod={period}
        labId={labId ?? null}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load(); }}
      />
    </SafeAreaView>
  );
}

// ─── Budget Card ──────────────────────────────────────────────────────────
function BudgetCard({ item, onEdit }: { item: BudgetActual; onEdit: () => void }) {
  const pct      = item.budget_amount > 0 ? (item.actual_amount / item.budget_amount) * 100 : 0;
  const remaining = item.budget_amount - item.actual_amount;
  const color    = CATEGORY_COLOR[item.category];

  return (
    <TouchableOpacity style={c.card} onPress={onEdit} activeOpacity={0.85}>
      <View style={c.row}>
        <View style={[c.iconBox, { backgroundColor: color + '15' }]}>
          <AppIcon name={item.category === 'total' ? 'wallet' : 'tag'} size={16} color={color} />
        </View>
        <Text style={c.cat}>{CATEGORY_LABEL[item.category]}</Text>
        <Text style={[c.pct, pct > 100 && { color: '#DC2626' }, pct > 80 && pct <= 100 && { color: '#D97706' }]}>
          %{pct.toFixed(0)}
        </Text>
      </View>
      <ProgressBar pct={pct} accent={color} />
      <View style={c.footer}>
        <Text style={c.actualText}>
          {fmtMoney(Number(item.actual_amount))} / {fmtMoney(Number(item.budget_amount))}
        </Text>
        <Text style={[c.remainText, remaining < 0 && { color: '#DC2626' }]}>
          {remaining >= 0 ? `Kalan: ${fmtMoney(remaining)}` : `Aşım: ${fmtMoney(-remaining)}`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────
function ProgressBar({ pct, accent }: { pct: number; accent?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color   =
    pct > 100 ? '#DC2626' :
    pct > 80  ? '#F59E0B' :
                (accent ?? '#10B981');
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${clamped}%`, backgroundColor: color }]} />
      {pct > 100 && (
        <View style={[pb.overflow, { backgroundColor: '#DC2626' }]} />
      )}
    </View>
  );
}

// ─── Budget Editor ────────────────────────────────────────────────────────
function BudgetEditor({
  visible, record, defaultPeriod, labId, onClose, onSaved,
}: {
  visible: boolean;
  record: BudgetActual | null;
  defaultPeriod: BudgetPeriod;
  labId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<BudgetCategory>('total');
  const [period, setPeriod]     = useState<BudgetPeriod>('monthly');
  const [amount, setAmount]     = useState('0');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (record) {
      setCategory(record.category);
      setPeriod(record.period);
      setAmount(String(record.budget_amount));
      setNotes(record.notes ?? '');
    } else {
      setCategory('total');
      setPeriod(defaultPeriod);
      setAmount('0');
      setNotes('');
    }
  }, [record, defaultPeriod, visible]);

  const handleSave = async () => {
    if (!labId) { toast.error('Lab ID bulunamadı'); return; }
    const num = Number(amount.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) { toast.error('Geçerli tutar girin'); return; }
    setSaving(true);
    const payload = {
      lab_id:       labId,
      category,
      period,
      period_start: currentPeriodStart(period),
      amount:       num,
      notes:        notes.trim() || null,
      updated_at:   new Date().toISOString(),
    };
    let error: any = null;
    if (record) {
      const r = await supabase.from('budgets').update(payload).eq('id', record.id);
      error = r.error;
    } else {
      const r = await supabase.from('budgets').upsert(payload, {
        onConflict: 'lab_id,category,period,period_start',
      });
      error = r.error;
    }
    setSaving(false);
    if (error) { toast.error(error.message ?? 'Kayıt başarısız'); return; }
    toast.success(record ? 'Bütçe güncellendi' : 'Bütçe eklendi');
    onSaved();
  };

  const handleDelete = () => {
    if (!record) return;
    Alert.alert('Bütçeyi Sil', `${CATEGORY_LABEL[record.category]} bütçesi silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await supabase.from('budgets').delete().eq('id', record.id);
        toast.success('Silindi');
        onSaved();
      }},
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={ed.overlay}>
        <View style={ed.sheet}>
          <View style={ed.header}>
            <Text style={ed.title}>{record ? 'Bütçeyi Düzenle' : 'Yeni Bütçe'}</Text>
            <TouchableOpacity onPress={onClose} style={ed.closeBtn}>
              <AppIcon name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View>
              <Text style={ed.label}>Kategori</Text>
              <View style={ed.chipRow}>
                {(['total','kira','personel','malzeme','ekipman','vergi','diger'] as BudgetCategory[]).map(c => (
                  <TouchableOpacity key={c}
                    style={[ed.chip, category === c && { borderColor: CATEGORY_COLOR[c], backgroundColor: CATEGORY_COLOR[c] + '15' }]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={[ed.chipText, category === c && { color: CATEGORY_COLOR[c], fontWeight: '700' }]}>
                      {CATEGORY_LABEL[c]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={ed.label}>Periyot</Text>
              <View style={ed.chipRow}>
                {(['monthly','yearly'] as BudgetPeriod[]).map(p => (
                  <TouchableOpacity key={p}
                    style={[ed.chip, period === p && ed.chipActive]}
                    onPress={() => setPeriod(p)}
                  >
                    <Text style={[ed.chipText, period === p && { color: '#2563EB', fontWeight: '700' }]}>
                      {p === 'monthly' ? 'Aylık' : 'Yıllık'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={ed.label}>Tutar (₺)</Text>
              <TextInput style={ed.input}
                value={amount} onChangeText={setAmount}
                keyboardType="decimal-pad" placeholder="0" />
            </View>

            <View>
              <Text style={ed.label}>Notlar</Text>
              <TextInput style={[ed.input, { minHeight: 64 }]}
                multiline value={notes} onChangeText={setNotes} />
            </View>
          </ScrollView>

          <View style={ed.footer}>
            {record ? (
              <TouchableOpacity style={ed.delBtn} onPress={handleDelete}>
                <AppIcon name="trash-can-outline" size={14} color="#DC2626" />
                <Text style={ed.delText}>Sil</Text>
              </TouchableOpacity>
            ) : <View style={{ flex: 1 }} />}
            <TouchableOpacity style={ed.cancelBtn} onPress={onClose}>
              <Text style={ed.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ed.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              <Text style={ed.saveText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CardSpec.pageBg },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  periodRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  periodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  periodChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  periodChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  periodMeta: { fontSize: 13, fontWeight: '600', color: '#64748B', marginLeft: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#2563EB' },
  addText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  summary: { backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, padding: 18, gap: 8, ...Shadows.card },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryAmounts: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  summaryHint: { fontSize: 10, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryActual: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.6 },
  summaryBudget: { fontSize: 18, fontWeight: '700', color: '#64748B' },
  summarySep: { fontSize: 24, color: '#CBD5E1', fontWeight: '300' },
  summaryPct: { fontSize: 12, fontWeight: '600', color: '#64748B' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#475569' },
  emptySub: { fontSize: 13, color: '#94A3B8', textAlign: 'center', maxWidth: 260 },
});

const c = StyleSheet.create({
  card: { backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, padding: 14, gap: 8, ...Shadows.card } as any,
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cat:  { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  pct:  { fontSize: 14, fontWeight: '800', color: '#10B981' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actualText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  remainText: { fontSize: 12, color: '#10B981', fontWeight: '700' },
});

const pb = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#F1F5F9' },
  fill:  { height: 8, borderRadius: 4 },
  overflow: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 4 },
});

const ed = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet:   { width: '100%', maxWidth: 480, maxHeight: '92%', backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, overflow: 'hidden', ...Shadows.card } as any,
  header:  { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:   { flex: 1, fontSize: 16, fontWeight: '800', color: '#0F172A' },
  closeBtn:{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

  label:   { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  chipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipText:{ fontSize: 12, color: '#64748B', fontWeight: '600' },
  input:   { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF' },

  footer:  { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  delBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', flex: 1 },
  delText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563EB' },
  saveText:{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
