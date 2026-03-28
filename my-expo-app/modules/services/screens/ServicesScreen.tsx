import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchAllLabServices, createLabService, updateLabService } from '../api';
import { LabService } from '../types';
import { C } from '../../../core/theme/colors';

const CATEGORIES = ['Sabit Protez', 'Hareketli Protez', 'İmplant', 'Ortodonti', 'CAD/CAM', 'Seramik', 'Diğer'];

interface Form {
  name: string; category: string; price: string; currency: string;
}
const EMPTY: Form = { name: '', category: '', price: '0', currency: 'TRY' };

export function ServicesScreen() {
  const [services, setServices] = useState<LabService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('Tümü');
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<LabService | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await fetchAllLabServices();
    setServices((data as LabService[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEdit(null); setForm(EMPTY); setError(''); setModal(true); };
  const openEdit = (s: LabService) => {
    setEdit(s);
    setForm({ name: s.name, category: s.category ?? '', price: String(s.price), currency: s.currency });
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

  const handleToggle = async (s: LabService) => {
    await updateLabService(s.id, { is_active: !s.is_active }); load();
  };

  const categories = ['Tümü', ...CATEGORIES];
  const filtered = services.filter((s) => {
    const matchCat = catFilter === 'Tümü' || s.category === catFilter;
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const grouped = categories.slice(1).reduce<Record<string, LabService[]>>((acc, cat) => {
    const items = filtered.filter((s) => s.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  const totalActive = services.filter((s) => s.is_active).length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Hizmet Kataloğu</Text>
          <Text style={styles.sub}>{totalActive} aktif hizmet</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Hizmet Ekle</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search} onChangeText={setSearch}
          placeholder="🔍  Hizmet ara..." placeholderTextColor={C.textMuted}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
        <View style={styles.catRow}>
          {categories.map((c) => (
            <TouchableOpacity key={c} onPress={() => setCatFilter(c)}
              style={[styles.catChip, catFilter === c && styles.catChipActive]}>
              <Text style={[styles.catChipText, catFilter === c && styles.catChipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {Object.entries(grouped).map(([cat, items]) => (
            <View key={cat}>
              <View style={styles.catHeader}>
                <Text style={styles.catTitle}>{cat}</Text>
                <Text style={styles.catCount}>{items.length} hizmet</Text>
              </View>
              {items.map((s) => <ServiceRow key={s.id} service={s} onEdit={openEdit} onToggle={handleToggle} />)}
            </View>
          ))}
          {filtered.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>{search ? 'Sonuç bulunamadı' : 'Henüz hizmet eklenmemiş'}</Text>
              {!search && <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
                <Text style={styles.emptyBtnText}>İlk hizmeti ekle</Text>
              </TouchableOpacity>}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={modal} animationType="fade" transparent onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{edit ? 'Hizmeti Düzenle' : 'Yeni Hizmet'}</Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Field label="Hizmet Adı *" value={form.name}
                onChangeText={(v: string) => { setForm((f) => ({ ...f, name: v })); setError(''); }}
                placeholder="Örn: Zirkonyum Kron" />

              <Text style={styles.fieldLabel}>Kategori</Text>
              <View style={styles.catGrid}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c} onPress={() => setForm((f) => ({ ...f, category: c }))}
                    style={[styles.catOption, form.category === c && styles.catOptionActive]}>
                    <Text style={[styles.catOptionText, form.category === c && styles.catOptionTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.priceRow}>
                <View style={{ flex: 1 }}>
                  <Field label="Fiyat" value={form.price}
                    onChangeText={(v: string) => setForm((f) => ({ ...f, price: v }))}
                    placeholder="0.00" keyboardType="decimal-pad" />
                </View>
                <View style={{ width: 80 }}>
                  <Field label="Para Birimi" value={form.currency}
                    onChangeText={(v: string) => setForm((f) => ({ ...f, currency: v }))}
                    placeholder="TRY" />
                </View>
              </View>

              {error ? <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {error}</Text></View> : null}

              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Kaydediliyor...' : edit ? 'Güncelle' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ServiceRow({ service: s, onEdit, onToggle }: { service: LabService; onEdit: (s: LabService) => void; onToggle: (s: LabService) => void }) {
  return (
    <View style={[styles.serviceRow, !s.is_active && styles.serviceRowInactive]}>
      <View style={styles.serviceMain}>
        <Text style={styles.serviceName}>{s.name}</Text>
        <Text style={styles.servicePrice}>
          {s.price > 0 ? `${s.price.toFixed(2)} ${s.currency}` : '—'}
        </Text>
      </View>
      <View style={styles.serviceActions}>
        <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(s)}>
          <Text style={styles.editBtnText}>Düzenle</Text>
        </TouchableOpacity>
        <Switch value={s.is_active} onValueChange={() => onToggle(s)}
          trackColor={{ false: C.border, true: C.primaryBg }}
          thumbColor={s.is_active ? C.primary : C.textMuted} />
      </View>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }: any) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={C.textMuted} keyboardType={keyboardType}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'auto'} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 22, fontWeight: '800', color: C.textPrimary },
  sub: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  searchRow: { padding: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  searchInput: { backgroundColor: C.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.textPrimary },
  catScroll: { maxHeight: 48, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  catRow: { flexDirection: 'row', padding: 8, gap: 6 },
  catChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  catChipActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  catChipText: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  catChipTextActive: { color: C.primary },
  list: { padding: 16, paddingBottom: 40 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4 },
  catTitle: { fontSize: 13, fontWeight: '800', color: C.textPrimary, letterSpacing: 0.3 },
  catCount: { fontSize: 12, color: C.textMuted },
  serviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  serviceRowInactive: { opacity: 0.5 },
  serviceMain: { flex: 1 },
  serviceName: { fontSize: 14, fontWeight: '600', color: C.textPrimary },
  servicePrice: { fontSize: 13, color: C.primary, fontWeight: '700', marginTop: 2 },
  serviceActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1.5, borderColor: C.border },
  editBtnText: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 15, color: C.textSecondary },
  emptyBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { backgroundColor: C.surface, borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.textPrimary },
  closeBtn: { fontSize: 18, color: C.textSecondary, paddingLeft: 20 },
  modalBody: { padding: 20 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.textPrimary, marginBottom: 6 },
  fieldInput: { borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.textPrimary, backgroundColor: C.background },
  fieldInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  catOptionActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  catOptionText: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  catOptionTextActive: { color: C.primary, fontWeight: '700' },
  priceRow: { flexDirection: 'row', gap: 12 },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#DC2626', fontWeight: '600', fontSize: 13 },
  saveBtn: { backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 32 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
