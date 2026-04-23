/**
 * Admin — Materyaller
 *
 * Supabase SQL (once, in dashboard):
 * ────────────────────────────────────
 * create table materials (
 *   id          uuid primary key default gen_random_uuid(),
 *   name        text not null unique,
 *   category    text not null default '',
 *   price       numeric(10,2) not null default 0,
 *   is_active   boolean not null default true,
 *   created_at  timestamptz not null default now()
 * );
 * alter table materials enable row level security;
 * create policy "auth read"  on materials for select using (auth.role() = 'authenticated');
 * create policy "auth write" on materials for all    using (auth.role() = 'authenticated');
 * ────────────────────────────────────
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { WORK_TYPE_TREE, CROWN_MATERIALS, REMOVABLE_MATS } from '../../../modules/orders/constants';

// ── Colours ──────────────────────────────────────────────────────────────────
const C = {
  accent: '#7C3AED', accentBg: '#F5F3FF',
  bg: '#FFFFFF', surface: '#FFFFFF',
  textPrimary: '#0F172A', textSecondary: '#64748B', textMuted: '#94A3B8',
  border: '#F1F5F9', borderFocus: '#7C3AED',
  success: '#059669', danger: '#DC2626', dangerBg: '#FEF2F2',
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Material {
  id: string;
  name: string;
  category: string;
  price: number;
  is_active: boolean;
  created_at: string;
}

// ── Default seed list (all known work-types + materials) ───────────────────
function buildDefaultSeeds(): { name: string; category: string }[] {
  const seeds: { name: string; category: string }[] = [];
  WORK_TYPE_TREE.forEach(node => {
    node.subtypes.forEach(sub => seeds.push({ name: sub.value, category: node.label }));
  });
  CROWN_MATERIALS.forEach(m => seeds.push({ name: m, category: 'Kron / Köprü Materyali' }));
  REMOVABLE_MATS.forEach(m => seeds.push({ name: m, category: 'Protez Materyali' }));
  return seeds;
}
const DEFAULT_SEEDS = buildDefaultSeeds();

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    return { ...acc, [k]: [...(acc[k] ?? []), item] };
  }, {} as Record<string, T[]>);
}

// ── Row component ─────────────────────────────────────────────────────────────
function MaterialRow({
  item,
  onPriceChange,
  onToggle,
  onDelete,
}: {
  item: Material;
  onPriceChange: (id: string, price: number) => void;
  onToggle: (id: string, val: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [localPrice, setLocalPrice] = useState(item.price > 0 ? String(item.price) : '');
  const [focused, setFocused] = useState(false);

  const commit = () => {
    const n = parseFloat(localPrice.replace(',', '.'));
    onPriceChange(item.id, isNaN(n) ? 0 : n);
  };

  return (
    <View style={[row.wrap, !item.is_active && row.wrapInactive]}>
      <View style={row.nameCol}>
        <Text style={[row.name, !item.is_active && row.nameInactive]}>{item.name}</Text>
      </View>

      {/* Price input */}
      <View style={[row.priceBox, focused && row.priceBoxFocused]}>
        <Text style={row.currency}>₺</Text>
        <TextInput
          style={row.priceInput}
          value={localPrice}
          onChangeText={setLocalPrice}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); commit(); }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={C.textMuted}
        />
      </View>

      {/* Active toggle */}
      <AppSwitch
        value={item.is_active}
        onValueChange={(v) => onToggle(item.id, v)}
        accentColor="#0F172A"
      />

      {/* Delete */}
      <TouchableOpacity onPress={() => onDelete(item.id)} style={row.deleteBtn} activeOpacity={0.7}>
        <Text style={row.deleteTxt}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  wrapInactive: { opacity: 0.45 },
  nameCol: { flex: 1 },
  name: { fontSize: 13, fontWeight: '500', color: C.textPrimary },
  nameInactive: { color: C.textMuted, textDecorationLine: 'line-through' },
  priceBox: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, minWidth: 90,
    backgroundColor: '#FAFBFC',
  },
  priceBoxFocused: { borderColor: C.borderFocus, backgroundColor: '#FEFEFE' },
  currency: { fontSize: 12, color: C.textMuted },
  priceInput: {
    fontSize: 13, fontWeight: '600', color: C.textPrimary,
    minWidth: 55,
    // @ts-ignore
    outlineStyle: 'none',
  },
  deleteBtn: {
    width: 28, height: 28, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.dangerBg,
  },
  deleteTxt: { fontSize: 11, color: C.danger, fontWeight: '700' },
});

// ── Add Row ───────────────────────────────────────────────────────────────────
function AddRow({ onAdd }: { onAdd: (name: string, category: string, price: number) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), category.trim(), parseFloat(price.replace(',', '.')) || 0);
    setName(''); setCategory(''); setPrice('');
  };

  return (
    <View style={add.wrap}>
      <TextInput
        style={add.input}
        value={name}
        onChangeText={setName}
        placeholder="Materyal adı"
        placeholderTextColor={C.textMuted}
      />
      <TextInput
        style={[add.input, { flex: 0.7 }]}
        value={category}
        onChangeText={setCategory}
        placeholder="Kategori"
        placeholderTextColor={C.textMuted}
      />
      <View style={[row.priceBox, { flex: 0.5 }]}>
        <Text style={row.currency}>₺</Text>
        <TextInput
          style={row.priceInput}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={C.textMuted}
        />
      </View>
      <TouchableOpacity onPress={submit} style={add.btn} activeOpacity={0.8}>
        <Text style={add.btnTxt}>+ Ekle</Text>
      </TouchableOpacity>
    </View>
  );
}

const add = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: '#FAFBFC',
  },
  input: {
    flex: 1, fontSize: 13, color: C.textPrimary,
    borderWidth: 1, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    outlineStyle: 'none',
  },
  btn: {
    backgroundColor: C.accent, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  btnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MaterialsScreen() {
  const [materials, setMaterials]     = useState<Material[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState<string | null>(null);
  const [seeding, setSeeding]         = useState(false);
  const [search, setSearch]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('category')
      .order('name');
    setMaterials((data as Material[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Seed defaults — insert only rows that don't exist yet
  const handleSeed = async () => {
    setSeeding(true);
    const existing = new Set(materials.map(m => m.name));
    const toInsert = DEFAULT_SEEDS
      .filter(s => !existing.has(s.name))
      .map(s => ({ name: s.name, category: s.category, price: 0, is_active: true }));
    if (toInsert.length > 0) {
      await supabase.from('materials').insert(toInsert);
      await load();
    }
    setSeeding(false);
  };

  const handlePriceChange = async (id: string, price: number) => {
    setSaving(id);
    await supabase.from('materials').update({ price }).eq('id', id);
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, price } : m));
    setSaving(null);
  };

  const handleToggle = async (id: string, is_active: boolean) => {
    await supabase.from('materials').update({ is_active }).eq('id', id);
    setMaterials(prev => prev.map(m => m.id === id ? { ...m, is_active } : m));
  };

  const handleDelete = async (id: string) => {
    await supabase.from('materials').delete().eq('id', id);
    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  const handleAdd = async (name: string, category: string, price: number) => {
    const { data } = await supabase
      .from('materials')
      .insert({ name, category, price, is_active: true })
      .select()
      .single();
    if (data) setMaterials(prev => [...prev, data as Material]);
  };

  const filtered = search
    ? materials.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.category.toLowerCase().includes(search.toLowerCase())
      )
    : materials;

  const grouped = groupBy(filtered, m => m.category || 'Diğer');
  const categories = Object.keys(grouped).sort();

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Materyaller</Text>
          <Text style={s.subtitle}>{materials.length} kayıt · Fiyatları buradan ayarlayın</Text>
        </View>
        <TouchableOpacity
          onPress={handleSeed}
          style={[s.seedBtn, seeding && { opacity: 0.6 }]}
          disabled={seeding}
          activeOpacity={0.8}
        >
          {seeding
            ? <ActivityIndicator size="small" color={C.accent} />
            : <Text style={s.seedBtnTxt}>Varsayılanları yükle</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Materyal ara..."
          placeholderTextColor={C.textMuted}
        />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {categories.length === 0 ? (
            <View style={s.centered}>
              <Text style={s.emptyTxt}>Henüz materyal eklenmemiş.</Text>
              <Text style={s.emptyHint}>«Varsayılanları yükle» butonunu kullanın.</Text>
            </View>
          ) : (
            categories.map(cat => (
              <View key={cat} style={s.group}>
                {/* Category header */}
                <View style={s.catHeader}>
                  <Text style={s.catLabel}>{cat}</Text>
                  <Text style={s.catCount}>{grouped[cat].length} materyal</Text>
                </View>

                {/* Column headers */}
                <View style={s.colHeader}>
                  <Text style={[s.colTxt, { flex: 1 }]}>AD</Text>
                  <Text style={[s.colTxt, { width: 110 }]}>FİYAT (₺)</Text>
                  <Text style={[s.colTxt, { width: 54 }]}>AKTİF</Text>
                  <View style={{ width: 28 }} />
                </View>

                {/* Rows */}
                {grouped[cat].map(item => (
                  <MaterialRow
                    key={item.id}
                    item={item}
                    onPriceChange={handlePriceChange}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add row */}
      <AddRow onAdd={handleAdd} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: C.surface,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title:    { fontSize: 18, fontWeight: '800', color: C.textPrimary },
  subtitle: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  seedBtn: {
    borderWidth: 1, borderColor: C.accentBg,
    backgroundColor: C.accentBg, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    minWidth: 150, alignItems: 'center',
  },
  seedBtnTxt: { fontSize: 13, color: C.accent, fontWeight: '700' },
  searchWrap: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.surface,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  searchInput: {
    fontSize: 13, color: C.textPrimary,
    borderWidth: 1, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#FAFBFC',
    // @ts-ignore
    outlineStyle: 'none',
  },
  group: {
    backgroundColor: C.surface, marginHorizontal: 12,
    marginTop: 12, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  catLabel: { fontSize: 11, fontWeight: '700', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.8 },
  catCount: { fontSize: 11, color: C.textMuted },
  colHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: '#FAFBFC',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  colTxt: { fontSize: 10, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 6 },
  emptyTxt:  { fontSize: 14, fontWeight: '600', color: C.textSecondary },
  emptyHint: { fontSize: 12, color: C.textMuted },
});
