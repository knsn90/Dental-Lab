/**
 * EquipmentSection — Demirbaş Yönetimi (Patterns Design Language)
 *
 * Embedded in SettingsHub. Lists lab equipment (CAD/CAM, furnace, scanner, etc.)
 * with CRUD modal. Each device can be assigned to a technician.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Switch,
  Platform, Modal, useWindowDimensions,
} from 'react-native';
import {
  Plus, Search, X, Save, Trash2, Edit3, User, Wrench,
  Monitor, Cog, AlertTriangle, CheckCircle, MapPin,
  Flame, Hammer, Drill, Sparkles, Wind, Microwave, Crosshair,
  SlidersHorizontal, QrCode, Printer, Minus,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IntraoralScannerIcon, Printer3DIcon,
  MillingMachineIcon,
} from '../../../core/ui/EquipmentIcons';
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';
import { DatePicker } from '../../../core/ui/DatePicker';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { HubContext } from '../../../core/ui/HubContext';
import QRCode from 'react-native-qrcode-svg';
import { printEquipmentLabel } from './equipment/printEquipmentLabel';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

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

// ─── Category config — kategoriye uygun anlamlı ikonlar ──────
const CATEGORIES: { key: string; label: string; icon: React.ComponentType<any> }[] = [
  { key: 'cad_cam',      label: 'CAD/CAM',     icon: Monitor     },  // Bilgisayar/yazılım
  { key: 'scanner',      label: 'Tarayıcı',    icon: IntraoralScannerIcon }, // Özel illüstrasyon
  { key: 'furnace',      label: 'Fırın',        icon: Flame       },  // Alev
  { key: 'milling',      label: 'Freze',        icon: MillingMachineIcon }, // Özel illüstrasyon
  { key: 'printer',      label: '3D Yazıcı',    icon: Printer3DIcon }, // Özel illüstrasyon
  { key: 'sintering',    label: 'Sinterleme',   icon: Microwave   },  // Lucide — fırın/kutu görseli
  { key: 'polishing',    label: 'Polisaj',      icon: Sparkles    },  // Parlatma
  { key: 'articulator',  label: 'Artikülatör',  icon: Crosshair   },  // Mekanik artikülasyon
  { key: 'compressor',   label: 'Kompresör',    icon: Wind        },  // Hava
  { key: 'other',        label: 'Diğer',        icon: Wrench      },
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
  station_id: string | null;
  purchase_date: string | null;
  warranty_end: string | null;
  notes: string | null;
  created_at: string;
  assignee?: { id: string; full_name: string } | null;
  station?: { id: string; name: string; color: string | null } | null;
}

interface Technician {
  id: string;
  full_name: string;
}

interface Station {
  id: string;
  name: string;
  color: string | null;
}

// ─── Props ───────────────────────────────────────────────────
interface Props {
  accentColor?: string;
}

// ─── Component ───────────────────────────────────────────────
export function EquipmentSection({ accentColor = '#0F172A' }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  const [items, setItems] = useState<Equipment[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Equipment | null>(null);
  const [saving, setSaving] = useState(false);

  // QR etiket preview
  const [qrItem, setQrItem] = useState<Equipment | null>(null);
  const [qrCopies, setQrCopies] = useState(1);
  const [qrPrinting, setQrPrinting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '', brand: '', model: '', serial_number: '',
    category: 'other', status: 'active',
    assigned_to: '' as string, station_id: '' as string,
    purchase_date: '', warranty_end: '', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('equipment')
      .select('*, assignee:profiles!equipment_assigned_to_fkey(id, full_name), station:lab_stations(id, name, color)')
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

  const loadStations = useCallback(async () => {
    const { data } = await supabase
      .from('lab_stations')
      .select('id, name, color')
      .eq('is_active', true)
      .order('sequence_hint')
      .order('name');
    if (data) setStations(data as Station[]);
  }, []);

  useEffect(() => { load(); loadTechs(); loadStations(); }, []);

  const openNew = () => {
    setEditItem(null);
    setForm({
      name: '', brand: '', model: '', serial_number: '',
      category: 'other', status: 'active',
      assigned_to: '', station_id: '', purchase_date: '', warranty_end: '', notes: '',
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
      station_id: item.station_id ?? '',
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
      station_id: form.station_id || null,
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

  // Embedded modda (StockScreen/SettingsHub) parent paddingHorizontal verir;
  // standalone modda kendi 12px outer padding'imizi uygularız.
  const isEmbedded = React.useContext(HubContext) === true;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: isEmbedded ? 0 : 12, paddingTop: 4, paddingBottom: 48, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      {/* F1 HeroCard — Demirbaş özeti */}
      <View style={{
        borderRadius: 20, overflow: 'hidden',
        backgroundColor: accentColor, padding: 18,
        position: 'relative',
      }}>
        <View style={{ position: 'absolute', top: -40, end: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
        <View style={{ position: 'absolute', bottom: -50, start: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{
              fontSize: 10, fontWeight: '600', letterSpacing: 1,
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8,
            }}>
              Toplam Demirbaş
            </Text>
            <Text style={{ ...DISPLAY, fontSize: 36, color: '#FFFFFF', letterSpacing: -1, lineHeight: 40 }}>
              {items.length}
            </Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>
              {assignedCount} atanmış · {items.length - assignedCount} havuzda
            </Text>
          </View>

          <View style={{
            width: 44, height: 44, borderRadius: 14,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.18)',
          }}>
            <Wrench size={20} color="#FFFFFF" strokeWidth={1.6} />
          </View>
        </View>

        {/* Mini stats row */}
        <View style={{
          flexDirection: 'row', gap: 8, marginTop: 16,
        }}>
          {[
            { label: 'Aktif', value: activeCount, icon: CheckCircle },
            { label: 'Bakımda', value: maintenanceCount, icon: AlertTriangle },
            { label: 'Atanmış', value: assignedCount, icon: User },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <View key={stat.label} style={{
                flex: 1, paddingVertical: 10, paddingHorizontal: 10,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.16)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <Icon size={11} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                    {stat.label}
                  </Text>
                </View>
                <Text style={{ ...DISPLAY, fontSize: 20, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 22 }}>
                  {stat.value}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* F3 SearchFilterBar — Search + Filtre + Ekle (44px) */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <View style={{
          flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8,
          height: 44, borderRadius: 14, backgroundColor: T.card,
          paddingHorizontal: 12, borderWidth: 1, borderColor: T.hairline,
        }}>
          <Search size={15} color={T.ink3} strokeWidth={1.8} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cihaz ara..."
            placeholderTextColor={T.ink3}
            style={{
              flex: 1, fontSize: 13, color: T.ink,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
            } as any}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} style={{ padding: 2 }}>
              <X size={14} color={T.ink3} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {/* F3 Filtre butonu */}
        {(() => {
          const hasFilter = filterCat !== null;
          return (
            <Pressable
              onPress={() => setFilterOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 44, paddingHorizontal: 14, borderRadius: 14,
                backgroundColor: hasFilter ? (isDark ? T.ink : DS.ink[900]) : T.card,
                borderWidth: hasFilter ? 0 : 1, borderColor: T.hairline,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <SlidersHorizontal size={14} strokeWidth={1.8} color={hasFilter ? (isDark ? T.bg : '#FFFFFF') : T.ink2} />
              <Text style={{ fontSize: 12, fontWeight: hasFilter ? '700' : '600', color: hasFilter ? (isDark ? T.bg : '#FFFFFF') : T.ink2 }}>
                Filtre{hasFilter ? ' (1)' : ''}
              </Text>
            </Pressable>
          );
        })()}

        <Pressable
          onPress={openNew}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            height: 44, paddingHorizontal: 14, borderRadius: 14,
            backgroundColor: isDark ? T.ink : DS.ink[900],
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          } as any}
        >
          <Plus size={15} color={isDark ? T.bg : '#FFF'} strokeWidth={2.2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? T.bg : '#FFF' }}>Ekle</Text>
        </Pressable>
      </View>

      {/* F5 FilterSheet — Kategori */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable onPress={() => setFilterOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'flex-end', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{
            backgroundColor: T.card,
            borderTopStartRadius: 24, borderTopEndRadius: 24,
            paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 12,
            maxHeight: '85%',
          }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: DS.ink[200], marginBottom: 14 }} />
            <View style={{ paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: DS.ink[900], flex: 1 }}>Filtrele</Text>
              <Pressable onPress={() => setFilterCat(null)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Temizle</Text>
              </Pressable>
              <Pressable onPress={() => setFilterOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', marginStart: 4 }}>
                <X size={16} color={DS.ink[700]} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 18 }}>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], paddingHorizontal: 4 }}>Kategori</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Pressable onPress={() => setFilterCat(null)} style={{
                    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                    borderWidth: !filterCat ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                    backgroundColor: !filterCat ? DS.ink[900] : '#FFF',
                    cursor: 'pointer' as any,
                  }}>
                    <Text style={{ fontSize: 12.5, fontWeight: !filterCat ? '700' : '500', color: !filterCat ? '#FFFFFF' : DS.ink[700] }}>Tümü</Text>
                  </Pressable>
                  {CATEGORIES.map(cat => {
                    const active = filterCat === cat.key;
                    const count = items.filter(i => i.category === cat.key).length;
                    if (count === 0) return null;
                    return (
                      <Pressable key={cat.key} onPress={() => setFilterCat(active ? null : cat.key)} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                        borderWidth: active ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                        backgroundColor: active ? DS.ink[900] : '#FFF',
                        cursor: 'pointer' as any,
                      }}>
                        <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? '#FFFFFF' : DS.ink[700] }}>{cat.label}</Text>
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: active ? 'rgba(255,255,255,0.78)' : DS.ink[400] }}>{count}</Text>
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

      {/* Equipment list */}
      {loading ? (
        <CenteredLoader color={accentColor} inline />
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
                  backgroundColor: T.card,
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
                    <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999, backgroundColor: st.bg }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: st.color }}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
                    {[item.brand, item.model].filter(Boolean).join(' · ') || cat.label}
                    {item.serial_number ? ` — SN: ${item.serial_number}` : ''}
                  </Text>
                </View>

                {/* Station + Assignee badges */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {item.station?.name ? (() => {
                    const stColor = item.station.color ?? '#7C3AED';
                    return (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999,
                        backgroundColor: `${stColor}14`,
                      }}>
                        <MapPin size={11} color={stColor} strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: stColor }}>
                          {item.station.name}
                        </Text>
                      </View>
                    );
                  })() : null}

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
                </View>

                {/* Actions: QR + Edit */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Pressable
                    onPress={(e: any) => { e?.stopPropagation?.(); setQrCopies(1); setQrItem(item); }}
                    hitSlop={8}
                    style={({ pressed }: any) => ({
                      width: 32, height: 32, borderRadius: 10,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: pressed ? `${accentColor}18` : `${accentColor}0D`,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    })}
                  >
                    <QrCode size={15} color={accentColor} strokeWidth={1.8} />
                  </Pressable>
                  <Edit3 size={14} color={DS.ink[300]} strokeWidth={1.6} />
                </View>
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
          backgroundColor: 'rgba(10,14,26,0.42)',
          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
        }}>
          <View style={{
            width: isDesktop ? 520 : '92%',
            maxHeight: '85%',
            backgroundColor: T.card,
            borderRadius: 24,
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.18)' } as any : {}),
          }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 24, paddingVertical: 16,
              borderBottomWidth: 1, borderBottomColor: T.hairline,
            }}>
              <Text style={{ ...DISPLAY, fontSize: 18, color: T.ink }}>
                {editItem ? 'Demirbaş Düzenle' : 'Yeni Demirbaş'}
              </Text>
              <Pressable
                onPress={() => setModalOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: T.cardSoft, alignItems: 'center', justifyContent: 'center',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                } as any}
              >
                <X size={16} color={T.ink2} strokeWidth={2} />
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

              {/* Station — hangi istasyonda kullanılıyor */}
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>
                  İstasyon
                </Text>
                {stations.length === 0 ? (
                  <View style={{
                    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14,
                    backgroundColor: DS.ink[50], borderWidth: 1, borderColor: DS.ink[200],
                  }}>
                    <Text style={{ fontSize: 12, color: DS.ink[400], lineHeight: 17 }}>
                      Henüz istasyon tanımlanmamış. Ayarlar → İstasyonlar bölümünden ekleyebilirsiniz.
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {/* None */}
                    <Pressable
                      onPress={() => setForm(f => ({ ...f, station_id: '' }))}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9999,
                        borderWidth: 1.5,
                        borderColor: !form.station_id ? accentColor : DS.ink[200],
                        backgroundColor: !form.station_id ? `${accentColor}10` : '#FFF',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      } as any}
                    >
                      <Text style={{ fontSize: 12, fontWeight: !form.station_id ? '700' : '500', color: !form.station_id ? accentColor : DS.ink[500] }}>
                        Atanmamış
                      </Text>
                    </Pressable>
                    {stations.map(st => {
                      const sel = form.station_id === st.id;
                      const stColor = st.color ?? accentColor;
                      return (
                        <Pressable
                          key={st.id}
                          onPress={() => setForm(f => ({ ...f, station_id: st.id }))}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9999,
                            borderWidth: 1.5,
                            borderColor: sel ? stColor : DS.ink[200],
                            backgroundColor: sel ? `${stColor}14` : '#FFF',
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                          } as any}
                        >
                          <MapPin size={11} color={sel ? stColor : DS.ink[400]} strokeWidth={1.8} />
                          <Text style={{ fontSize: 12, fontWeight: sel ? '700' : '500', color: sel ? stColor : DS.ink[700] }}>
                            {st.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Dates row — DatePicker (modern popover takvim) */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Alım Tarihi</Text>
                  <DatePicker
                    value={form.purchase_date}
                    onChange={(iso) => setForm(f => ({ ...f, purchase_date: iso }))}
                    accent={accentColor}
                    placeholder="Tarih seç"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500], marginBottom: 6 }}>Garanti Bitiş</Text>
                  <DatePicker
                    value={form.warranty_end}
                    onChange={(iso) => setForm(f => ({ ...f, warranty_end: iso }))}
                    accent={accentColor}
                    placeholder="Tarih seç"
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                  <Pressable
                    onPress={() => { setQrCopies(1); setQrItem(editItem); setModalOpen(false); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
                      backgroundColor: `${accentColor}14`,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    } as any}
                  >
                    <QrCode size={13} color={accentColor} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: accentColor }}>Etiket</Text>
                  </Pressable>
                </View>
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

      {/* ─── QR Label Preview Modal ─────────────────────────────── */}
      <Modal
        visible={!!qrItem}
        transparent
        animationType="fade"
        onRequestClose={() => setQrItem(null)}
      >
        <View style={{
          flex: 1, justifyContent: 'center', alignItems: 'center',
          backgroundColor: 'rgba(10,14,26,0.42)',
          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
          paddingHorizontal: 16, paddingVertical: 24,
        }}>
          <Pressable
            onPress={() => setQrItem(null)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          <View style={{
            width: '100%',
            maxWidth: 380,
            maxHeight: '92%',
            flexShrink: 1,
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.18)' } as any : {}),
          }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingVertical: 14,
              borderBottomWidth: 1, borderBottomColor: DS.ink[100],
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <QrCode size={18} color={accentColor} strokeWidth={1.8} />
                <Text style={{ ...DISPLAY, fontSize: 17, color: DS.ink[900] }} numberOfLines={1}>
                  Demirbaş Etiketi
                </Text>
              </View>
              <Pressable
                onPress={() => setQrItem(null)}
                hitSlop={8}
                style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) } as any}
              >
                <X size={18} color={DS.ink[500]} strokeWidth={1.6} />
              </Pressable>
            </View>

            {qrItem ? (
              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ padding: 16, gap: 12, alignItems: 'stretch' }}
                showsVerticalScrollIndicator={false}
              >
                {/* Label Preview — QR + info ÜST/ALT */}
                <View style={{
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: DS.ink[100],
                  backgroundColor: '#FAFAFA',
                  gap: 10,
                }}>
                  <View style={{
                    padding: 10, borderRadius: 14, backgroundColor: '#FFFFFF',
                    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 2px rgba(0,0,0,0.04)' } as any : {}),
                  }}>
                    <QRCode
                      value={JSON.stringify({ type: 'equipment', id: qrItem.id, name: qrItem.name })}
                      size={130}
                      color={DS.ink[900]}
                      backgroundColor="#FFFFFF"
                      ecl="H"
                    />
                  </View>

                  <View style={{ width: '100%', alignItems: 'center', gap: 3 }}>
                    <Text style={{
                      fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
                      color: DS.ink[400],
                    }} numberOfLines={1}>
                      Siman
                    </Text>
                    <Text style={{
                      fontSize: 16, fontWeight: '700', color: DS.ink[900],
                      textAlign: 'center', marginTop: 2,
                    }} numberOfLines={2}>
                      {qrItem.name}
                    </Text>

                    {([qrItem.brand, qrItem.model].filter(Boolean).join(' ').trim()) ? (
                      <Text style={{ fontSize: 12, color: DS.ink[500], textAlign: 'center' }} numberOfLines={1}>
                        {[qrItem.brand, qrItem.model].filter(Boolean).join(' ')}
                      </Text>
                    ) : null}

                    {qrItem.serial_number ? (
                      <View style={{
                        marginTop: 4,
                        paddingHorizontal: 10, paddingVertical: 3,
                        borderRadius: 9999,
                        backgroundColor: DS.ink[100],
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: '700', color: DS.ink[900], letterSpacing: 0.4,
                          fontFamily: Platform.OS === 'web' ? 'ui-monospace, Menlo, monospace' : undefined,
                        }}>
                          SN: {qrItem.serial_number}
                        </Text>
                      </View>
                    ) : null}

                    {qrItem.station?.name || qrItem.assignee?.full_name ? (
                      <View style={{
                        flexDirection: 'row', flexWrap: 'wrap', gap: 6,
                        justifyContent: 'center', marginTop: 6,
                      }}>
                        {qrItem.station?.name ? (
                          <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999,
                            backgroundColor: 'rgba(124,58,237,0.10)',
                          }}>
                            <MapPin size={10} color="#7C3AED" strokeWidth={2} />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#7C3AED' }}>
                              {qrItem.station.name}
                            </Text>
                          </View>
                        ) : null}
                        {qrItem.assignee?.full_name ? (
                          <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 4,
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999,
                            backgroundColor: 'rgba(37,99,235,0.10)',
                          }}>
                            <User size={10} color="#2563EB" strokeWidth={2} />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#2563EB' }}>
                              {qrItem.assignee.full_name}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    <Text style={{
                      fontSize: 9, color: DS.ink[300], letterSpacing: 0.6, marginTop: 8,
                      fontFamily: Platform.OS === 'web' ? 'ui-monospace, Menlo, monospace' : undefined,
                    }}>
                      {qrItem.id.slice(0, 8).toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Copies stepper */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[700] }}>
                    Kopya sayısı
                  </Text>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    borderRadius: 9999, borderWidth: 1, borderColor: DS.ink[200],
                    overflow: 'hidden', backgroundColor: '#FFFFFF',
                  }}>
                    <Pressable
                      onPress={() => setQrCopies(c => Math.max(1, c - 1))}
                      hitSlop={6}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) } as any}
                    >
                      <Minus size={14} color={DS.ink[700]} strokeWidth={2} />
                    </Pressable>
                    <Text style={{
                      minWidth: 28, textAlign: 'center',
                      fontSize: 13, fontWeight: '700', color: DS.ink[900],
                    }}>
                      {qrCopies}
                    </Text>
                    <Pressable
                      onPress={() => setQrCopies(c => Math.min(6, c + 1))}
                      hitSlop={6}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) } as any}
                    >
                      <Plus size={14} color={DS.ink[700]} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>

                {/* Print CTA */}
                <Pressable
                  onPress={async () => {
                    if (!qrItem || qrPrinting) return;
                    setQrPrinting(true);
                    await printEquipmentLabel(qrItem, { copies: qrCopies });
                    setQrPrinting(false);
                  }}
                  disabled={qrPrinting}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 13, borderRadius: 14,
                    backgroundColor: accentColor,
                    opacity: qrPrinting ? 0.6 : 1,
                    ...(Platform.OS === 'web' ? { cursor: qrPrinting ? 'default' : 'pointer' } : {}),
                  } as any}
                >
                  <Printer size={15} color="#FFF" strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>
                    {qrPrinting ? 'Hazırlanıyor...' : Platform.OS === 'web' ? 'Yazdır / PDF' : 'PDF Olarak Paylaş'}
                  </Text>
                </Pressable>

                <Text style={{ fontSize: 11, color: DS.ink[400], textAlign: 'center' }}>
                  Etiket boyutu: 62 × 40 mm · QR tarandığında bu cihaza ulaşır.
                </Text>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
