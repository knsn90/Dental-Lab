/**
 * EquipmentSection — Demirbaş Yönetimi (Patterns Design Language)
 *
 * Embedded in SettingsHub. Lists lab equipment (CAD/CAM, furnace, scanner, etc.)
 * with CRUD modal. Each device can be assigned to a technician.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Switch,
  ActivityIndicator, Platform, Modal, useWindowDimensions,
} from 'react-native';
import {
  Plus, Search, X, Save, Trash2, Edit3, User, Wrench,
  Monitor, Printer, Cpu, Cog, AlertTriangle, CheckCircle,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';

// ─── Patterns tokens ─────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid: any = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 20,
  ...(Platform.OS === 'web'
    ? { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' }
    : {}),
};

// ─── Category config ─────────────────────────────────────────
const CATEGORIES: { key: string; label: string; icon: React.ComponentType<any> }[] = [
  { key: 'cad_cam',      label: 'CAD/CAM',     icon: Monitor },
  { key: 'scanner',      label: 'Tarayıcı',    icon: Cpu },
  { key: 'furnace',      label: 'Fırın',        icon: Cog },
  { key: 'milling',      label: 'Freze',        icon: Wrench },
  { key: 'printer',      label: '3D Yazıcı',    icon: Printer },
  { key: 'sintering',    label: 'Sinterleme',   icon: Cog },
  { key: 'polishing',    label: 'Polisaj',      icon: Wrench },
  { key: 'articulator',  label: 'Artikülatör',  icon: Wrench },
  { key: 'compressor',   label: 'Kompresör',    icon: Cog },
  { key: 'other',        label: 'Diğer',        icon: Wrench },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:      { label: 'Aktif',     color: '#059669', bg: 'rgba(5,150,105,0.10)' },
  maintenance: { label: 'Bakımda',   color: '#D97706', bg: 'rgba(217,119,6,0.10)' },
  retired:     { label: 'Kullanım Dışı', color: '#DC2626', bg: 'rgba(220,38,38,0.10)' },
};

// ─── Types ───────────────────────────────────────────────────
interface Equipment {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  category: string;
  status: string;
  assigned_to: string | null;
  purchase_date: string | null;
  warranty_end: string | null;
  notes: string | null;
  created_at: string;
  assignee?: { id: string; full_name: string } | null;
}

interface Technician {
  id: string;
  full_name: string;
}

// ─── Props ───────────────────────────────────────────────────
interface Props {
  accentColor?: string;
}

// ─── Component ───────────────────────────────────────────────
export function EquipmentSection({ accentColor = '#0F172A' }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [items, setItems] = useState<Equipment[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Equipment | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '', brand: '', model: '', serial_number: '',
    category: 'other', status: 'active',
    assigned_to: '' as string, purchase_date: '', warranty_end: '', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('equipment')
      .select('*, assignee:profiles!equipment_assigned_to_fkey(id, full_name)')
      .order('name');
    if (!error) setItems((data ?? []) as Equipment[]);
    setLoading(false);
  }, []);

  const loadTechs = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('user_type', 'lab')
      .order('full_name');
    if (data) setTechs(data as Technician[]);
  }, []);

  useEffect(() => { load(); loadTechs(); }, []);

  const openNew = () => {
    setEditItem(null);
    setForm({
      name: '', brand: '', model: '', serial_number: '',
      category: 'other', status: 'active',
      assigned_to: '', purchase_date: '', warranty_end: '', notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (item: Equipment) => {
    setEditItem(item);
    setForm({
      name: item.name,
      brand: item.brand ?? '',
      model: item.model ?? '',
      serial_number: item.serial_number ?? '',
      category: item.category,
      status: item.status,
      assigned_to: item.assigned_to ?? '',
      purchase_date: item.purchase_date ?? '',
      warranty_end: item.warranty_end ?? '',
      notes: item.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      category: form.category,
      status: form.status,
      assigned_to: form.assigned_to || null,
      purchase_date: form.purchase_date || null,
      warranty_end: form.warranty_end || null,
      notes: form.notes.trim() || null,
    };

    if (editItem) {
      await supabase.from('equipment').update(payload).eq('id', editItem.id);
    } else {
      await supabase.from('equipment').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('equipment').delete().eq('id', id);
    load();
  };

  // Filter
  const filtered = items.filter(item => {
    if (filterCat && item.category !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.brand ?? '').toLowerCase().includes(q) ||
        (item.model ?? '').toLowerCase().includes(q) ||
        (item.serial_number ?? '').toLowerCase().includes(q) ||
        (item.assignee?.full_name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // KPIs
  const activeCount = items.filter(i => i.status === 'active').length;
  const maintenanceCount = items.filter(i => i.status === 'maintenance').length;
  const assignedCount = items.filter(i => i.assigned_to).length;

  // Input style helper
  const inputStyle: any = {
    height: 44, borderRadius: 14, paddingHorizontal: 14,
    backgroundColor: DS.ink[50], fontSize: 14, color: DS.ink[900],
    borderWidth: 1, borderColor: DS.ink[200],
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      {/* KPI strip */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Toplam', value: items.length, color: accentColor },
          { label: 'Aktif', value: activeCount, color: '#059669' },
          { label: 'Bakımda', value: maintenanceCount, color: '#D97706' },
          { label: 'Atanmış', value: assignedCount, color: '#2563EB' },
        ].map(kpi => (
          <View key={kpi.label} style={{
            flex: 1, minWidth: 100, paddingVertical: 12, paddingHorizontal: 14,
            borderRadius: 16, backgroundColor: '#FFF',
            ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as any : {}),
          }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: kpi.color }}>{kpi.value}</Text>
            <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>{kpi.label}</Text>
          </View>
        ))}
      </View>

      {/* Search + Add */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
          height: 40, borderRadius: 12, backgroundColor: '#FFF',
          paddingHorizontal: 12, borderWidth: 1, borderColor: DS.ink[200],
        }}>
          <Search size={15} color={DS.ink[400]} strokeWidth={1.8} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cihaz ara..."
            placeholderTextColor={DS.ink[400]}
            style={{
              flex: 1, fontSize: 13, color: DS.ink[900],
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
            } as any}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} style={{ padding: 2 }}>
              <X size={14} color={DS.ink[400]} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={openNew}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            height: 40, paddingHorizontal: 14, borderRadius: 9999,
            backgroundColor: accentColor,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          } as any}
        >
          <Plus size={15} color="#FFF" strokeWidth={2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>Ekle</Text>
        </Pressable>
      </View>

      {/* Category filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable
            onPress={() => setFilterCat(null)}
            style={{
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999,
              backgroundColor: !filterCat ? accentColor : DS.ink[100],
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: !filterCat ? '#FFF' : DS.ink[500] }}>
              Tümü
            </Text>
          </Pressable>
          {CATEGORIES.map(cat => {
            const active = filterCat === cat.key;
            const count = items.filter(i => i.category === cat.key).length;
            if (count === 0) return null;
            return (
              <Pressable
                key={cat.key}
                onPress={() => setFilterCat(active ? null : cat.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999,
                  backgroundColor: active ? accentColor : DS.ink[100],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                } as any}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#FFF' : DS.ink[500] }}>
                  {cat.label}
                </Text>
                <View style={{
                  minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? 'rgba(255,255,255,0.25)' : DS.ink[200],
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: active ? '#FFF' : DS.ink[500] }}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Equipment list */}
      {loading ? (
        <ActivityIndicator color={accentColor} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <Wrench size={32} color={DS.ink[300]} strokeWidth={1.2} />
          <Text style={{ fontSize: 14, color: DS.ink[400], marginTop: 12 }}>
            {items.length === 0 ? 'Henüz demirbaş eklenmemiş' : 'Sonuç bulunamadı'}
          </Text>
          {items.length === 0 && (
            <Pressable
              onPress={openNew}
              style={{
                marginTop: 12, paddingHorizontal: 16, paddingVertical: 8,
                borderRadius: 9999, backgroundColor: accentColor,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              } as any}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>İlk Cihazı Ekle</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {filtered.map(item => {
            const cat = CATEGORY_MAP[item.category] ?? CATEGORY_MAP.other;
            const CatIcon = cat.icon;
            const st = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.active;
            return (
              <Pressable
                key={item.id}
                onPress={() => openEdit(item)}
                style={{
                  ...cardSolid,
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  padding: 16,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                } as any}
              >
                {/* Category icon */}
                <View style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: `${accentColor}10`,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <CatIcon size={18} color={accentColor} strokeWidth={1.6} />
                </View>

                {/* Info */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999, backgroundColor: st.bg }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: st.color }}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }} numberOfLines={1}>
                    {[item.brand, item.model].filter(Boolean).join(' · ') || cat.label}
                    {item.serial_number ? ` — SN: ${item.serial_number}` : ''}
                  </Text>
                </View>

                {/* Assignee */}
                {item.assignee?.full_name ? (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999,
                    backgroundColor: 'rgba(37,99,235,0.08)',
                  }}>
                    <User size={11} color="#2563EB" strokeWidth={2} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#2563EB' }}>
                      {item.assignee.full_name}
                    </Text>
                  </View>
                ) : null}

                {/* Edit icon */}
                <Edit3 size={14} color={DS.ink[300]} strokeWidth={1.6} />
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ─── Add/Edit Modal ─────────────────────────────────────── */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={{
          flex: 1, justifyContent: 'center', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.4)',
        }}>
          <View style={{
            width: isDesktop ? 520 : '92%',
            maxHeight: '85%',
            backgroundColor: '#FFF',
            borderRadius: 24,
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.18)' } as any : {}),
          }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 24, paddingVertical: 16,
              borderBottomWidth: 1, borderBottomColor: DS.ink[100],
            }}>
              <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900] }}>
                {editItem ? 'Demirbaş Düzenle' : 'Yeni Demirbaş'}
              </Text>
              <Pressable
                onPress={() => setModalOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                } as any}
              >
                <X size={16} color={DS.ink[500]} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Form */}
            <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
              {/* Name */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>
                  Cihaz Adı *
                </Text>
                <TextInput
                  value={form.name}
                  onChangeText={v => setForm(f => ({ ...f, name: v }))}
                  placeholder="ör: Zirkonzahn M5"
                  placeholderTextColor={DS.ink[300]}
                  style={inputStyle}
                />
              </View>

              {/* Brand + Model row */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Marka</Text>
                  <TextInput
                    value={form.brand}
                    onChangeText={v => setForm(f => ({ ...f, brand: v }))}
                    placeholder="ör: Zirkonzahn"
                    placeholderTextColor={DS.ink[300]}
                    style={inputStyle}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Model</Text>
                  <TextInput
                    value={form.model}
                    onChangeText={v => setForm(f => ({ ...f, model: v }))}
                    placeholder="ör: M5 Heavy"
                    placeholderTextColor={DS.ink[300]}
                    style={inputStyle}
                  />
                </View>
              </View>

              {/* Serial Number */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Seri Numarası</Text>
                <TextInput
                  value={form.serial_number}
                  onChangeText={v => setForm(f => ({ ...f, serial_number: v }))}
                  placeholder="ör: ZR-2024-001"
                  placeholderTextColor={DS.ink[300]}
                  style={inputStyle}
                />
              </View>

              {/* Category pills */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Kategori</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {CATEGORIES.map(cat => {
                    const active = form.category === cat.key;
                    return (
                      <Pressable
                        key={cat.key}
                        onPress={() => setForm(f => ({ ...f, category: cat.key }))}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                          backgroundColor: active ? accentColor : DS.ink[50],
                          borderWidth: 1, borderColor: active ? accentColor : DS.ink[200],
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        } as any}
                      >
                        <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? '#FFF' : DS.ink[500] }}>
                          {cat.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Status pills */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Durum</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {Object.entries(STATUS_CONFIG).map(([key, st]) => {
                    const active = form.status === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setForm(f => ({ ...f, status: key }))}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999,
                          backgroundColor: active ? st.color : st.bg,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        } as any}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#FFF' : st.color }}>
                          {st.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Assign to technician */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>
                  Atanan Teknisyen
                </Text>
                <View style={{
                  borderRadius: 14, borderWidth: 1, borderColor: DS.ink[200],
                  backgroundColor: DS.ink[50], overflow: 'hidden',
                }}>
                  {/* None option */}
                  <Pressable
                    onPress={() => setForm(f => ({ ...f, assigned_to: '' }))}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 14, paddingVertical: 10,
                      backgroundColor: !form.assigned_to ? `${accentColor}10` : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    } as any}
                  >
                    <View style={{
                      width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                      borderColor: !form.assigned_to ? accentColor : DS.ink[300],
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {!form.assigned_to && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accentColor }} />
                      )}
                    </View>
                    <Text style={{ fontSize: 13, color: DS.ink[500] }}>Atanmamış</Text>
                  </Pressable>

                  {techs.map(t => {
                    const sel = form.assigned_to === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => setForm(f => ({ ...f, assigned_to: t.id }))}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                          paddingHorizontal: 14, paddingVertical: 10,
                          borderTopWidth: 1, borderTopColor: DS.ink[100],
                          backgroundColor: sel ? `${accentColor}10` : 'transparent',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                        } as any}
                      >
                        <View style={{
                          width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                          borderColor: sel ? accentColor : DS.ink[300],
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {sel && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accentColor }} />
                          )}
                        </View>
                        <User size={13} color={sel ? accentColor : DS.ink[400]} strokeWidth={1.8} />
                        <Text style={{ fontSize: 13, fontWeight: sel ? '600' : '400', color: sel ? DS.ink[900] : DS.ink[500] }}>
                          {t.full_name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Dates row */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Alım Tarihi</Text>
                  <TextInput
                    value={form.purchase_date}
                    onChangeText={v => setForm(f => ({ ...f, purchase_date: v }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={DS.ink[300]}
                    style={inputStyle}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Garanti Bitiş</Text>
                  <TextInput
                    value={form.warranty_end}
                    onChangeText={v => setForm(f => ({ ...f, warranty_end: v }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={DS.ink[300]}
                    style={inputStyle}
                  />
                </View>
              </View>

              {/* Notes */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Notlar</Text>
                <TextInput
                  value={form.notes}
                  onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                  placeholder="Ek bilgiler..."
                  placeholderTextColor={DS.ink[300]}
                  multiline
                  numberOfLines={3}
                  style={{
                    ...inputStyle,
                    height: undefined, minHeight: 70,
                    paddingVertical: 12, textAlignVertical: 'top',
                  }}
                />
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 24, paddingVertical: 14,
              borderTopWidth: 1, borderTopColor: DS.ink[100],
            }}>
              {editItem ? (
                <Pressable
                  onPress={() => { handleDelete(editItem.id); setModalOpen(false); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                    backgroundColor: 'rgba(220,38,38,0.08)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  } as any}
                >
                  <Trash2 size={13} color="#DC2626" strokeWidth={1.8} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#DC2626' }}>Sil</Text>
                </Pressable>
              ) : <View />}

              <Pressable
                onPress={handleSave}
                disabled={!form.name.trim() || saving}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999,
                  backgroundColor: form.name.trim() ? accentColor : DS.ink[200],
                  opacity: saving ? 0.6 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                } as any}
              >
                <Save size={13} color="#FFF" strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>
                  {saving ? 'Kaydediliyor...' : editItem ? 'Güncelle' : 'Kaydet'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
