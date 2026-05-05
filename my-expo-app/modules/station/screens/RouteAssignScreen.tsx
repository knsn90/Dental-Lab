// modules/station/screens/RouteAssignScreen.tsx
// Mesul müdür — iş emri için istasyon rotası + teknisyen atama

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Alert, Switch, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import {
  fetchLabStations, fetchLabTechnicians, fetchStagesByOrder, saveOrderRoute,
} from '../api';
import { AppIcon } from '../../../core/ui/AppIcon';
import { toast } from '../../../core/ui/Toast';

const ACCENT = '#2563EB'; // Lab mavisi

// ── Tipler ────────────────────────────────────────────────────────────────────

interface Station {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sequence_hint: number;
  is_critical: boolean;
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
}

interface StageRow {
  key: string; // lokal uuid for React key
  station_id: string;
  station_name: string;
  station_color: string;
  technician_id: string | null;
  technician_name: string;
  is_critical: boolean;
}

interface WorkOrderInfo {
  id: string;
  order_number: string;
  work_type: string;
  tooth_numbers: number[];
  shade: string | null;
  delivery_date: string;
  is_rush: boolean;
  doctor_name: string | null;
  clinic_name: string | null;
  status: string;
}

interface ExistingStage {
  id: string;
  sequence_order: number;
  status: string;
  station: { name: string; color: string } | null;
  technician: { full_name: string } | null;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

const STATUS_LABELS: Record<string, string> = {
  bekliyor:   'Bekliyor',
  aktif:      'Devam Ediyor',
  tamamlandi: 'Tamamlandı',
  onaylandi:  'Onaylandı',
  reddedildi: 'Reddedildi',
};

const STATUS_COLORS: Record<string, string> = {
  bekliyor:   '#F59E0B',
  aktif:      '#2563EB',
  tamamlandi: '#16A34A',
  onaylandi:  '#7C3AED',
  reddedildi: '#DC2626',
};

// ── Picker Modal ──────────────────────────────────────────────────────────────

interface PickerModalProps<T> {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}

function PickerModal<T>({ visible, onClose, title, items, renderItem }: PickerModalProps<T>) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose} />
      <View style={pm.sheet}>
        <View style={pm.handle} />
        <Text style={pm.title}>{title}</Text>
        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
          {items.map((item, i) => (
            <View key={i}>{renderItem(item)}</View>
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17, fontWeight: '700', color: '#0F172A',
    marginBottom: 12,
  },
});

// ── Ana Ekran ─────────────────────────────────────────────────────────────────

export function RouteAssignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const { profile } = useAuthStore();

  // Veriler
  const [order,      setOrder]      = useState<WorkOrderInfo | null>(null);
  const [stations,   setStations]   = useState<Station[]>([]);
  const [technicians,setTechnicians]= useState<Technician[]>([]);
  const [existing,   setExisting]   = useState<ExistingStage[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  // Rota inşaatçısı
  const [rows, setRows] = useState<StageRow[]>([]);

  // Picker modalleri
  const [stationPickIdx, setStationPickIdx] = useState<number | null>(null);
  const [techPickIdx,    setTechPickIdx]    = useState<number | null>(null);

  // ── Yükleme ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const labProfileId = profile?.lab_id ?? '';

    const [orderRes, stationsRes, techRes, stagesRes] = await Promise.all([
      supabase
        .from('work_orders')
        .select(`
          id, order_number, work_type, tooth_numbers,
          shade, delivery_date, is_rush, status,
          doctor:doctor_id ( full_name, clinic_name )
        `)
        .eq('id', id)
        .single(),
      fetchLabStations(labProfileId),
      fetchLabTechnicians(labProfileId),
      fetchStagesByOrder(id),
    ]);

    if (orderRes.data) {
      const o = orderRes.data as any;
      setOrder({
        id:            o.id,
        order_number:  o.order_number,
        work_type:     o.work_type,
        tooth_numbers: o.tooth_numbers ?? [],
        shade:         o.shade,
        delivery_date: o.delivery_date,
        is_rush:       o.is_rush ?? false,
        status:        o.status,
        doctor_name:   o.doctor?.full_name ?? null,
        clinic_name:   o.doctor?.clinic_name ?? null,
      });
    }

    if (stationsRes.data)   setStations(stationsRes.data as Station[]);
    if (techRes.data)       setTechnicians(techRes.data as Technician[]);
    if (stagesRes.data)     setExisting(stagesRes.data as unknown as ExistingStage[]);

    // Mevcut bekleyen aşamaları rota editörüne prefill et
    const pending = ((stagesRes.data ?? []) as unknown as ExistingStage[])
      .filter(s => s.status === 'bekliyor')
      .sort((a, b) => a.sequence_order - b.sequence_order);

    if (pending.length > 0) {
      const stationList = (stationsRes.data ?? []) as Station[];
      const techList    = (techRes.data ?? []) as Technician[];
      setRows(pending.map((s) => {
        const st  = stationList.find(x => x.name === s.station?.name);
        const tch = techList.find(x => x.full_name === s.technician?.full_name);
        return {
          key:            makeKey(),
          station_id:     st?.id ?? '',
          station_name:   s.station?.name ?? '',
          station_color:  s.station?.color ?? ACCENT,
          technician_id:  tch?.id ?? null,
          technician_name:s.technician?.full_name ?? '',
          is_critical:    false,
        };
      }));
    }

    setLoading(false);
  }, [id, profile?.lab_id]);

  useEffect(() => { load(); }, [load]);

  // ── Satır İşlemleri ─────────────────────────────────────────────────────────

  function addRow() {
    setRows(prev => [...prev, {
      key:            makeKey(),
      station_id:     '',
      station_name:   '',
      station_color:  '#6B7280',
      technician_id:  null,
      technician_name:'',
      is_critical:    false,
    }]);
  }

  function removeRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index));
  }

  function moveRow(index: number, dir: -1 | 1) {
    setRows(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function setRowStation(index: number, st: Station) {
    setRows(prev => prev.map((r, i) => i === index ? {
      ...r,
      station_id:    st.id,
      station_name:  st.name,
      station_color: st.color,
      is_critical:   st.is_critical,
    } : r));
    setStationPickIdx(null);
  }

  function setRowTech(index: number, tech: Technician | null) {
    setRows(prev => prev.map((r, i) => i === index ? {
      ...r,
      technician_id:   tech?.id ?? null,
      technician_name: tech?.full_name ?? '',
    } : r));
    setTechPickIdx(null);
  }

  function toggleCritical(index: number, val: boolean) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, is_critical: val } : r));
  }

  // ── Kaydet ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!id) return;

    // Doğrulama
    const invalid = rows.some(r => !r.station_id);
    if (invalid) {
      Alert.alert('Eksik bilgi', 'Her aşama için bir istasyon seçmelisiniz.');
      return;
    }
    if (rows.length === 0) {
      Alert.alert('Boş rota', 'En az bir aşama eklemelisiniz.');
      return;
    }

    setSaving(true);
    const { error } = await saveOrderRoute(id, rows.map((r, i) => ({
      station_id:    r.station_id,
      technician_id: r.technician_id,
      sequence_order: i + 1,
      is_critical:   r.is_critical,
    })));

    setSaving(false);

    if (error) {
      Alert.alert('Hata', error.message);
    } else {
      toast.success('Rota başarıyla kaydedildi ✓');
      router.back();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={ACCENT} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={{ textAlign: 'center', marginTop: 60, color: '#94A3B8' }}>
          İş emri bulunamadı.
        </Text>
      </SafeAreaView>
    );
  }

  const activeStages  = existing.filter(e => e.status !== 'bekliyor' && e.status !== 'reddedildi');
  const hasActiveWork = activeStages.length > 0;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Başlık ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <AppIcon name="arrow-left" size={20} color={ACCENT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>İstasyon Rotası</Text>
          <Text style={s.headerSub}>#{order.order_number}</Text>
        </View>
        {order.is_rush && (
          <View style={s.rushBadge}>
            <Text style={s.rushText}>ACİL</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── İş Emri Bilgi Kartı ── */}
        <View style={s.infoCard}>
          <View style={s.infoRow}>
            <AppIcon name="tooth-outline" set="mci" size={15} color="#64748B" />
            <Text style={s.infoLabel}>İş Türü</Text>
            <Text style={s.infoVal}>{order.work_type}</Text>
          </View>
          {order.tooth_numbers.length > 0 && (
            <View style={s.infoRow}>
              <AppIcon name="numeric" set="mci" size={15} color="#64748B" />
              <Text style={s.infoLabel}>Dişler</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {order.tooth_numbers.map(n => (
                  <View key={n} style={s.toothChip}>
                    <Text style={s.toothChipText}>{n}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {order.shade && (
            <View style={s.infoRow}>
              <AppIcon name="palette-outline" set="mci" size={15} color="#64748B" />
              <Text style={s.infoLabel}>Renk</Text>
              <Text style={s.infoVal}>{order.shade}</Text>
            </View>
          )}
          <View style={s.infoRow}>
            <AppIcon name="calendar-outline" set="mci" size={15} color="#64748B" />
            <Text style={s.infoLabel}>Teslim</Text>
            <Text style={[s.infoVal, { color: '#DC2626' }]}>
              {formatDate(order.delivery_date)}
            </Text>
          </View>
          {order.doctor_name && (
            <View style={s.infoRow}>
              <AppIcon name="stethoscope" set="mci" size={15} color="#64748B" />
              <Text style={s.infoLabel}>Hekim</Text>
              <Text style={s.infoVal}>{order.doctor_name}</Text>
            </View>
          )}
        </View>

        {/* ── Mevcut Aktif Aşamalar (salt okunur) ── */}
        {hasActiveWork && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Devam Eden Aşamalar</Text>
            {activeStages.map((stage, i) => (
              <View key={stage.id} style={s.existingRow}>
                <View style={[s.existingDot, { backgroundColor: stage.station?.color ?? '#6B7280' }]} />
                <Text style={s.existingStation}>{stage.station?.name ?? '—'}</Text>
                <Text style={s.existingTech}>{stage.technician?.full_name ?? 'Atanmadı'}</Text>
                <View style={[s.statusPill, { backgroundColor: (STATUS_COLORS[stage.status] ?? '#6B7280') + '20' }]}>
                  <Text style={[s.statusPillText, { color: STATUS_COLORS[stage.status] ?? '#6B7280' }]}>
                    {STATUS_LABELS[stage.status] ?? stage.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Rota Editörü ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>
              {hasActiveWork ? 'Sonraki Bekleyen Aşamalar' : 'Üretim Rotası'}
            </Text>
            <Text style={s.sectionSub}>{rows.length} aşama</Text>
          </View>

          {rows.length === 0 && (
            <View style={s.emptyHint}>
              <AppIcon name="plus-circle-outline" set="mci" size={32} color="#CBD5E1" />
              <Text style={s.emptyHintText}>Aşağıdan istasyon ekleyin</Text>
            </View>
          )}

          {rows.map((row, index) => (
            <View key={row.key} style={s.stageRow}>
              {/* Sıra numarası */}
              <View style={[s.seqBadge, { backgroundColor: row.station_color || '#E2E8F0' }]}>
                <Text style={s.seqText}>{index + 1}</Text>
              </View>

              <View style={{ flex: 1, gap: 8 }}>
                {/* İstasyon seçici */}
                <TouchableOpacity
                  style={[s.picker, row.station_id ? { borderColor: row.station_color } : null]}
                  onPress={() => setStationPickIdx(index)}
                >
                  {row.station_id ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[s.colorDot, { backgroundColor: row.station_color }]} />
                      <Text style={s.pickerValue}>{row.station_name}</Text>
                    </View>
                  ) : (
                    <Text style={s.pickerPlaceholder}>İstasyon seç…</Text>
                  )}
                  <AppIcon name="chevron-down" size={16} color="#94A3B8" />
                </TouchableOpacity>

                {/* Teknisyen seçici */}
                <TouchableOpacity
                  style={s.picker}
                  onPress={() => setTechPickIdx(index)}
                >
                  {row.technician_id ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppIcon name="account-outline" set="mci" size={15} color="#64748B" />
                      <Text style={s.pickerValue}>{row.technician_name}</Text>
                    </View>
                  ) : (
                    <Text style={s.pickerPlaceholder}>Teknisyen ata (isteğe bağlı)</Text>
                  )}
                  <AppIcon name="chevron-down" size={16} color="#94A3B8" />
                </TouchableOpacity>

                {/* Kritik geçiş toggle */}
                <View style={s.criticalRow}>
                  <AppIcon name="alert-circle-outline" set="mci" size={14} color={row.is_critical ? '#DC2626' : '#94A3B8'} />
                  <Text style={[s.criticalLabel, row.is_critical && { color: '#DC2626' }]}>
                    Kritik geçiş (müdür onayı gerekli)
                  </Text>
                  <Switch
                    value={row.is_critical}
                    onValueChange={(v) => toggleCritical(index, v)}
                    trackColor={{ false: '#E2E8F0', true: '#FECACA' }}
                    thumbColor={row.is_critical ? '#DC2626' : '#fff'}
                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                  />
                </View>
              </View>

              {/* Sıra + sil butonları */}
              <View style={s.rowActions}>
                <TouchableOpacity
                  style={[s.arrowBtn, index === 0 && s.arrowBtnDisabled]}
                  onPress={() => moveRow(index, -1)}
                  disabled={index === 0}
                >
                  <AppIcon name="chevron-up" size={16} color={index === 0 ? '#CBD5E1' : '#475569'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.arrowBtn, index === rows.length - 1 && s.arrowBtnDisabled]}
                  onPress={() => moveRow(index, 1)}
                  disabled={index === rows.length - 1}
                >
                  <AppIcon name="chevron-down" size={16} color={index === rows.length - 1 ? '#CBD5E1' : '#475569'} />
                </TouchableOpacity>
                <TouchableOpacity style={s.deleteBtn} onPress={() => removeRow(index)}>
                  <AppIcon name="trash-2" size={15} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* + Aşama Ekle */}
          <TouchableOpacity style={s.addBtn} onPress={addRow}>
            <AppIcon name="plus" size={18} color={ACCENT} />
            <Text style={s.addBtnText}>Aşama Ekle</Text>
          </TouchableOpacity>
        </View>

        {/* ── Kaydet ── */}
        <TouchableOpacity
          style={[s.saveBtn, (saving || rows.length === 0) && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || rows.length === 0}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <AppIcon name="check" size={20} color="#fff" />
              <Text style={s.saveBtnText}>Rotayı Kaydet ve Başlat</Text>
            </>
          )}
        </TouchableOpacity>

        {rows.length > 0 && (
          <Text style={s.saveHint}>
            İlk aşama ({rows[0]?.station_name || 'seçilmedi'}) otomatik olarak aktifleştirilecektir.
          </Text>
        )}
      </ScrollView>

      {/* ── İstasyon Picker Modal ── */}
      <PickerModal
        visible={stationPickIdx !== null}
        onClose={() => setStationPickIdx(null)}
        title="İstasyon Seç"
        items={stations}
        renderItem={(st) => (
          <TouchableOpacity
            style={spm.item}
            onPress={() => stationPickIdx !== null && setRowStation(stationPickIdx, st)}
          >
            <View style={[spm.dot, { backgroundColor: st.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={spm.name}>{st.name}</Text>
              {st.is_critical && (
                <Text style={spm.critical}>Kritik istasyon</Text>
              )}
            </View>
            {stationPickIdx !== null && rows[stationPickIdx]?.station_id === st.id && (
              <AppIcon name="check" size={16} color={ACCENT} />
            )}
          </TouchableOpacity>
        )}
      />

      {/* ── Teknisyen Picker Modal ── */}
      <PickerModal
        visible={techPickIdx !== null}
        onClose={() => setTechPickIdx(null)}
        title="Teknisyen Ata"
        items={[{ id: '', full_name: 'Atanmadan bırak', role: '' } as Technician, ...technicians]}
        renderItem={(tech) => (
          <TouchableOpacity
            style={spm.item}
            onPress={() => techPickIdx !== null && setRowTech(techPickIdx, tech.id ? tech : null)}
          >
            <View style={[spm.avatar, { backgroundColor: tech.id ? ACCENT : '#E2E8F0' }]}>
              <Text style={[spm.avatarText, { color: tech.id ? '#fff' : '#94A3B8' }]}>
                {tech.id ? tech.full_name.charAt(0).toUpperCase() : '—'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={spm.name}>{tech.full_name}</Text>
              {tech.role === 'manager' && (
                <Text style={spm.critical}>Mesul Müdür</Text>
              )}
            </View>
            {techPickIdx !== null &&
             rows[techPickIdx]?.technician_id === (tech.id || null) && (
              <AppIcon name="check" size={16} color={ACCENT} />
            )}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  headerSub:   { fontSize: 13, color: '#64748B' },
  rushBadge: {
    backgroundColor: '#FEF2F2', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#FECACA',
  },
  rushText: { fontSize: 11, fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },

  // Info card
  infoCard: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    padding: 14, marginBottom: 16, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  infoLabel: { fontSize: 12, color: '#94A3B8', width: 52 },
  infoVal:   { fontSize: 14, fontWeight: '600', color: '#1E293B', flex: 1 },
  toothChip: {
    backgroundColor: '#EFF6FF', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  toothChipText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },

  // Section
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  sectionSub:   { fontSize: 12, color: '#94A3B8' },

  // Existing stages
  existingRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    padding: 10, marginBottom: 6, gap: 8,
  },
  existingDot: { width: 10, height: 10, borderRadius: 5 },
  existingStation: { fontSize: 14, fontWeight: '600', color: '#1E293B', flex: 1 },
  existingTech:    { fontSize: 12, color: '#64748B' },
  statusPill: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  // Empty hint
  emptyHint: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 28, gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed',
    marginBottom: 12,
  },
  emptyHintText: { fontSize: 14, color: '#94A3B8' },

  // Stage row
  stageRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.03,
    shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  seqBadge: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 6,
  },
  seqText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Picker
  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  pickerValue:       { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  pickerPlaceholder: { fontSize: 14, color: '#94A3B8' },
  colorDot: { width: 10, height: 10, borderRadius: 5 },

  // Critical toggle
  criticalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  criticalLabel: { fontSize: 12, color: '#94A3B8', flex: 1 },

  // Row actions
  rowActions: { gap: 4, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  arrowBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  arrowBtnDisabled: { opacity: 0.35 },
  deleteBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },

  // Add button
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EFF6FF', borderRadius: 12,
    borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed',
    paddingVertical: 14, gap: 8,
  },
  addBtnText: { fontSize: 15, fontWeight: '700', color: ACCENT },

  // Save button
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT, borderRadius: 14,
    paddingVertical: 16, gap: 8,
    marginTop: 8,
    shadowColor: ACCENT, shadowOpacity: 0.3,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  saveHint: {
    textAlign: 'center', fontSize: 12, color: '#94A3B8',
    marginTop: 10, lineHeight: 18,
  },
});

// Station picker modal styles
const spm = StyleSheet.create({
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  critical: { fontSize: 11, color: '#DC2626', marginTop: 2 },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700' },
});
