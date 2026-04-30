/**
 * RecurringExpensesPanel — Tekrarlayan gider şablonları yönetim paneli
 *
 *  ExpensesScreen'de toolbar'a yerleştirilen "Otomatik Giderler" butonuyla açılır.
 *  Şablon listesi + tek bir editör modal.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';
import { toast } from '../../../core/ui/Toast';
import {
  fetchRecurring, upsertRecurring, deleteRecurring, toggleRecurring, generateRecurringNow,
  FREQUENCY_LABEL,
  type RecurringExpense, type RecurringFrequency,
} from '../recurring';
import { EXPENSE_CATEGORY_LABELS } from '../api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAfterGenerate?: () => void;
}

const CATEGORIES: { key: RecurringExpense['category']; label: string }[] = [
  { key: 'kira',     label: EXPENSE_CATEGORY_LABELS.kira     },
  { key: 'personel', label: EXPENSE_CATEGORY_LABELS.personel },
  { key: 'malzeme',  label: EXPENSE_CATEGORY_LABELS.malzeme  },
  { key: 'ekipman',  label: EXPENSE_CATEGORY_LABELS.ekipman  },
  { key: 'vergi',    label: EXPENSE_CATEGORY_LABELS.vergi    },
  { key: 'diger',    label: EXPENSE_CATEGORY_LABELS.diger    },
];

const FREQ_OPTS: RecurringFrequency[] = ['weekly','monthly','quarterly','yearly'];

function fmtMoney(n: number): string {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RecurringExpensesPanel({ visible, onClose, onAfterGenerate }: Props) {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<RecurringExpense | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await fetchRecurring();
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (visible) load(); }, [visible]);

  const handleGenerate = async () => {
    setGenerating(true);
    const { count, error } = await generateRecurringNow();
    setGenerating(false);
    if (error) { toast.error((error as any).message ?? 'Üretim başarısız'); return; }
    if (count === 0) toast.info('Vadesi gelmiş şablon yok');
    else             toast.success(`${count} gider üretildi`);
    load();
    onAfterGenerate?.();
  };

  const openNew = () => {
    setEditor({
      id: '', lab_id: '', name: '', category: 'kira', amount: 0,
      payment_method: 'havale', frequency: 'monthly', anchor_day: 1,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: null,
      next_due_date: new Date().toISOString().slice(0, 10),
      active: true, notes: null,
      created_at: '', updated_at: '',
    });
    setShowEditor(true);
  };

  const openEdit = (r: RecurringExpense) => { setEditor({ ...r }); setShowEditor(true); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Tekrarlayan Giderler</Text>
              <Text style={s.subtitle}>Kira, internet, personel maaşı vb. otomatik üretim şablonları</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <AppIcon name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* Toolbar */}
          <View style={s.toolbar}>
            <TouchableOpacity style={s.genBtn} onPress={handleGenerate} disabled={generating}>
              {generating
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <AppIcon name="play-circle-outline" size={15} color="#FFFFFF" />}
              <Text style={s.genText}>Şimdi Üret</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={s.addBtn} onPress={openNew}>
              <AppIcon name="plus" size={15} color="#FFFFFF" />
              <Text style={s.addText}>Yeni Şablon</Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            {loading ? (
              <ActivityIndicator color="#2563EB" />
            ) : items.length === 0 ? (
              <View style={s.empty}>
                <AppIcon name="repeat-variant" size={36} color="#CBD5E1" />
                <Text style={s.emptyTitle}>Henüz şablon yok</Text>
                <Text style={s.emptySub}>"Yeni Şablon" ile aylık tekrarlayan giderlerinizi tanımlayın.</Text>
              </View>
            ) : items.map(r => (
              <TouchableOpacity key={r.id} style={[s.row, !r.active && { opacity: 0.55 }]} onPress={() => openEdit(r)}>
                <View style={[s.rowIcon, { backgroundColor: r.active ? '#EFF6FF' : '#F1F5F9' }]}>
                  <AppIcon name="repeat" size={16} color={r.active ? '#2563EB' : '#94A3B8'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>{r.name}</Text>
                  <Text style={s.rowMeta}>
                    {EXPENSE_CATEGORY_LABELS[r.category]} · {FREQUENCY_LABEL[r.frequency]} · sonraki: {new Date(r.next_due_date + 'T00:00:00').toLocaleDateString('tr-TR')}
                  </Text>
                </View>
                <Text style={s.rowAmount}>{fmtMoney(Number(r.amount))}</Text>
                <TouchableOpacity
                  onPress={async (e) => {
                    e.stopPropagation();
                    await toggleRecurring(r.id, !r.active);
                    load();
                  }}
                  style={[s.toggle, r.active && s.toggleActive]}
                >
                  <View style={[s.toggleKnob, r.active && s.toggleKnobActive]} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Editor */}
      <RecurringEditor
        visible={showEditor}
        record={editor}
        onClose={() => setShowEditor(false)}
        onSaved={() => { setShowEditor(false); load(); }}
      />
    </Modal>
  );
}

// ─── Editor Modal ──────────────────────────────────────────────────────────
function RecurringEditor({
  visible, record, onClose, onSaved,
}: {
  visible: boolean; record: RecurringExpense | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<RecurringExpense | null>(record);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(record); }, [record]);

  if (!form) return null;

  const handleSave = async () => {
    if (!form.name.trim() || !(Number(form.amount) > 0)) {
      toast.error('İsim ve tutar zorunlu');
      return;
    }
    setSaving(true);
    const payload: any = {
      ...(form.id ? { id: form.id } : {}),
      name: form.name.trim(),
      category: form.category,
      amount: Number(form.amount),
      payment_method: form.payment_method,
      frequency: form.frequency,
      anchor_day: Math.max(1, Math.min(31, Number(form.anchor_day) || 1)),
      start_date: form.start_date,
      end_date: form.end_date,
      next_due_date: form.next_due_date,
      active: form.active,
      notes: form.notes,
    };
    const { error } = await upsertRecurring(payload);
    setSaving(false);
    if (error) { toast.error((error as any).message ?? 'Kayıt başarısız'); return; }
    toast.success(form.id ? 'Şablon güncellendi' : 'Şablon eklendi');
    onSaved();
  };

  const handleDelete = () => {
    if (!form.id) return;
    Alert.alert('Şablonu Sil', 'Bu şablon silinsin mi? Geçmiş giderler etkilenmez.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await deleteRecurring(form.id);
        toast.success('Silindi');
        onSaved();
      }},
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { maxWidth: 460 }]}>
          <View style={s.header}>
            <Text style={s.title}>{form.id ? 'Şablonu Düzenle' : 'Yeni Şablon'}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <AppIcon name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Field label="İsim *">
              <TextInput style={s.input} value={form.name}
                onChangeText={v => setForm({ ...form, name: v })}
                placeholder="örn. Ofis kirası" />
            </Field>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Tutar (₺) *" style={{ flex: 1 }}>
                <TextInput style={s.input} value={String(form.amount)}
                  keyboardType="decimal-pad"
                  onChangeText={v => setForm({ ...form, amount: Number(v.replace(',', '.')) || 0 })} />
              </Field>
              <Field label="Periyot" style={{ flex: 1 }}>
                <View style={s.chipRow}>
                  {FREQ_OPTS.map(f => (
                    <TouchableOpacity key={f}
                      style={[s.chip, form.frequency === f && s.chipActive]}
                      onPress={() => setForm({ ...form, frequency: f })}
                    >
                      <Text style={[s.chipText, form.frequency === f && s.chipTextActive]}>
                        {FREQUENCY_LABEL[f]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
            </View>

            <Field label="Kategori">
              <View style={s.chipRow}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity key={c.key}
                    style={[s.chip, form.category === c.key && s.chipActive]}
                    onPress={() => setForm({ ...form, category: c.key })}
                  >
                    <Text style={[s.chipText, form.category === c.key && s.chipTextActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="İlk Vade" style={{ flex: 1 }}>
                <TextInput style={s.input} value={form.next_due_date}
                  placeholder="YYYY-MM-DD"
                  onChangeText={v => setForm({ ...form, next_due_date: v, start_date: form.start_date || v })} />
              </Field>
              <Field label="Anchor (Gün)" style={{ flex: 1 }}>
                <TextInput style={s.input} value={String(form.anchor_day)}
                  keyboardType="number-pad"
                  onChangeText={v => setForm({ ...form, anchor_day: Math.max(1, Math.min(31, Number(v) || 1)) })} />
              </Field>
            </View>

            <Field label="Notlar">
              <TextInput style={[s.input, { minHeight: 64 }]}
                multiline value={form.notes ?? ''}
                onChangeText={v => setForm({ ...form, notes: v })} />
            </Field>
          </ScrollView>

          <View style={s.footer}>
            {form.id ? (
              <TouchableOpacity style={s.delBtn} onPress={handleDelete}>
                <AppIcon name="trash-can-outline" size={14} color="#DC2626" />
                <Text style={s.delText}>Sil</Text>
              </TouchableOpacity>
            ) : <View style={{ flex: 1 }} />}
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave} disabled={saving}>
              <Text style={s.saveText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={style}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet:   { width: '100%', maxWidth: 620, maxHeight: '92%', backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, overflow: 'hidden', ...Shadows.card } as any,

  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  genBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#059669' },
  genText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  addBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#2563EB' },
  addText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  empty:    { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#475569' },
  emptySub: { fontSize: 12, color: '#94A3B8', textAlign: 'center' },

  row:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF' },
  rowIcon:{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowName:{ fontSize: 13, fontWeight: '700', color: '#0F172A' },
  rowMeta:{ fontSize: 11, color: '#94A3B8', marginTop: 2 },
  rowAmount: { fontSize: 14, fontWeight: '800', color: '#0F172A' },

  toggle: { width: 36, height: 22, borderRadius: 999, backgroundColor: '#E2E8F0', padding: 2, justifyContent: 'center' },
  toggleActive: { backgroundColor: '#10B981' },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
  toggleKnobActive: { alignSelf: 'flex-end' },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  chipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  chipTextActive: { color: '#2563EB' },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  delBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', flex: 1 },
  delText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn:  { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563EB' },
  saveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
