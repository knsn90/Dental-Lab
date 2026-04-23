import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { fetchAllLabServices, createLabService, updateLabService } from '../api';
import { LabService } from '../types';
import { C } from '../../../core/theme/colors';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { IconBtn } from '../../../core/ui/IconBtn';

const CATEGORIES = ['Sabit Protez', 'Hareketli Protez', 'İmplant', 'Ortodonti', 'CAD/CAM', 'Seramik', 'Diğer'];

interface Form {
  name: string; category: string; price: string; currency: string;
}
const EMPTY: Form = { name: '', category: '', price: '0', currency: 'TRY' };

export function ServicesScreen() {
  const [services, setServices] = useState<LabService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Tabs + search + action — single row */}
      <View style={styles.subToolbar}>
        <SlideTabBar
          items={categories.map((cat) => ({
            key: cat,
            label: cat,
            count: cat === 'Tümü'
              ? services.length
              : services.filter((s) => s.category === cat).length,
          }))}
          activeKey={catFilter}
          onChange={setCatFilter}
          accentColor={C.primary}
        />

        <View style={{ flex: 1 }} />

        <IconBtn
          active={searchExpanded || search.length > 0}
          onPress={() => setSearchExpanded(!searchExpanded)}
        >
          <Feather
            name="search"
            size={20}
            color={(searchExpanded || search.length > 0) ? C.primary : '#64748B'}
          />
        </IconBtn>

        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
          <Text style={styles.addBtnText}>+ Hizmet Ekle</Text>
        </TouchableOpacity>
      </View>

      {(searchExpanded || search.length > 0) && (
        <View style={styles.searchRow}>
          <View style={[styles.searchWrap, searchFocused && styles.searchWrapFocused]}>
            <Feather name="search" size={16} color={searchFocused ? C.primary : '#AEAEB2'} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Hizmet ara..."
              placeholderTextColor="#AEAEB2"
              returnKeyType="search"
              autoFocus={searchExpanded && search.length === 0}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); setSearchExpanded(false); }}>
                <Feather name="x-circle" size={15} color="#AEAEB2" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

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

      {/* ── Modal ── */}
      <Modal visible={modal} animationType="fade" transparent onRequestClose={() => setModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>

            {/* Header */}
            <View style={m.header}>
              <Text style={m.title}>{edit ? 'Hizmeti Düzenle' : 'Hizmet Ekle'}</Text>
              <TouchableOpacity style={m.closeBtn} onPress={() => setModal(false)}>
                <Feather name="x" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={m.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Hizmet Bilgileri */}
              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Hizmet Bilgileri</Text>
                <View style={m.fieldWrap}>
                  <Text style={m.fieldLabel}>Hizmet Adı <Text style={m.req}>*</Text></Text>
                  <TextInput
                    style={m.fieldInput}
                    value={form.name}
                    onChangeText={(v) => { setForm((f) => ({ ...f, name: v })); setError(''); }}
                    placeholder="Örn: Zirkonyum Kron"
                    placeholderTextColor="#C7C7CC"
                  />
                </View>
              </View>

              {/* Kategori */}
              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Kategori</Text>
                <View style={m.catGrid}>
                  {CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setForm((f) => ({ ...f, category: c }))}
                      style={[m.catChip, form.category === c && { borderColor: C.primary, backgroundColor: C.primaryBg }]}
                    >
                      <Text style={[m.catChipText, form.category === c && { color: C.primary, fontWeight: '700' as const }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Fiyatlandırma */}
              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Fiyatlandırma</Text>
                <View style={m.twoCol}>
                  <View style={{ flex: 1 }}>
                    <View style={m.fieldWrap}>
                      <Text style={m.fieldLabel}>Fiyat</Text>
                      <TextInput
                        style={m.fieldInput}
                        value={form.price}
                        onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
                        placeholder="0.00"
                        placeholderTextColor="#C7C7CC"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                  <View style={{ width: 100 }}>
                    <View style={m.fieldWrap}>
                      <Text style={m.fieldLabel}>Para Birimi</Text>
                      <TextInput
                        style={m.fieldInput}
                        value={form.currency}
                        onChangeText={(v) => setForm((f) => ({ ...f, currency: v }))}
                        placeholder="TRY"
                        placeholderTextColor="#C7C7CC"
                        autoCapitalize="characters"
                      />
                    </View>
                  </View>
                </View>
              </View>

              {error ? (
                <View style={m.errorBox}>
                  <Text style={m.errorText}>⚠️ {error}</Text>
                </View>
              ) : null}

              <View style={{ height: 8 }} />
            </ScrollView>

            {/* Footer */}
            <View style={m.footer}>
              <TouchableOpacity style={m.cancelBtn} onPress={() => setModal(false)}>
                <Text style={m.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.saveBtn, { backgroundColor: C.primary }, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : edit ? 'Güncelle' : 'Hizmet Ekle'}</Text>
              </TouchableOpacity>
            </View>

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
        <AppSwitch value={s.is_active} onValueChange={() => onToggle(s)}
          accentColor={C.primary} />
      </View>
    </View>
  );
}

// ── Page styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  addBtn: { backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  subToolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  searchRow: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
    paddingHorizontal: 12, height: 42,
  },
  searchWrapFocused: { borderColor: C.primary },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', height: 42, outlineStyle: 'none' } as any,
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
});

// ── Modal styles — New Order form design system ──────────────────────────────
const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    width: '100%', maxWidth: 540, maxHeight: '92%', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15, shadowRadius: 48,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 16 },
  sectionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E9EEF4',
    padding: 16, marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#1E293B',
    marginBottom: 14,
  },
  twoCol: { flexDirection: 'row', gap: 12 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 },
  req: { color: '#EF4444' },
  fieldInput: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF',
    // @ts-ignore
    outlineStyle: 'none',
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  catChipText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 4 },
  errorText: { color: '#DC2626', fontWeight: '600', fontSize: 13 },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 10, paddingHorizontal: 24, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  cancelBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
