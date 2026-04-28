// modules/settings/sections/StationsSection.tsx
// Dijital diş laboratuvarı üretim istasyonlarını yönetme (CRUD + sıralama).
// Settings Hub'ın "İstasyonlar" sekmesinde gösterilir.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Pressable, ActivityIndicator, Alert,
  Switch, Platform,
} from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { AppIcon } from '../../../core/ui/AppIcon';
import { toast } from '../../../core/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// Dijital Diş Laboratuvarı — 12 Standart İstasyon
// ─────────────────────────────────────────────────────────────────────────────

interface DefaultStation {
  name: string;
  color: string;
  icon: string;
  is_critical: boolean;
  info: string; // Kullanıcıya gösterilen kısa açıklama
}

const DIGITAL_DENTAL_LAB_STATIONS: DefaultStation[] = [
  {
    name: 'Tarama (3D Scan)',
    color: '#2563EB',
    icon: 'line-scan',
    is_critical: false,
    info: 'Ölçü & modelin 3D olarak taranması',
  },
  {
    name: 'Tasarım (CAD)',
    color: '#7C3AED',
    icon: 'vector-combine',
    is_critical: false,
    info: 'Dijital CAD yazılımıyla protetik tasarım',
  },
  {
    name: '3D Baskı',
    color: '#0891B2',
    icon: 'printer-3d-nozzle-outline',
    is_critical: false,
    info: 'Reçine / metal tozu ile katmanlı üretim',
  },
  {
    name: 'Freze (Milling / CAM)',
    color: '#D97706',
    icon: 'cog-outline',
    is_critical: false,
    info: 'CNC freze; zirkonyum, PMMA, wax, metal',
  },
  {
    name: 'Sinterleme / Fırın',
    color: '#EA580C',
    icon: 'thermometer-high',
    is_critical: false,
    info: 'Zirkonyum sinterleme & porselen pişirme',
  },
  {
    name: 'Metal Döküm',
    color: '#9333EA',
    icon: 'flask-outline',
    is_critical: false,
    info: 'Geleneksel veya dijital metal döküm',
  },
  {
    name: 'Porselen / Makyaj',
    color: '#BE185D',
    icon: 'palette-outline',
    is_critical: false,
    info: 'Renk karakterizasyonu & estetik boyama',
  },
  {
    name: 'Tesviye / Bitim',
    color: '#059669',
    icon: 'tools',
    is_critical: false,
    info: 'Kenar tesviye, uyum kontrolü, oklüzyon',
  },
  {
    name: 'Polisaj',
    color: '#16A34A',
    icon: 'brush-outline',
    is_critical: false,
    info: 'Yüzey parlatma & glaçaj işlemi',
  },
  {
    name: 'İmplant Montajı',
    color: '#1D4ED8',
    icon: 'wrench-outline',
    is_critical: false,
    info: 'İmplant üst yapısı & vidalama torku',
  },
  {
    name: 'Kalite Kontrol',
    color: '#DC2626',
    icon: 'microscope',
    is_critical: true,
    info: 'Son kalite denetimi — geçiş için onay zorunlu',
  },
  {
    name: 'Paketleme & Kargo',
    color: '#475569',
    icon: 'package-variant-closed',
    is_critical: false,
    info: 'Steril paketleme & klinik teslimat hazırlığı',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Renk & İkon presetleri (form için)
// ─────────────────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#2563EB', '#7C3AED', '#0891B2', '#D97706', '#EA580C', '#DC2626',
  '#9333EA', '#BE185D', '#059669', '#16A34A', '#1D4ED8', '#475569',
];

const PRESET_ICONS = [
  'line-scan',
  'vector-combine',
  'printer-3d-nozzle-outline',
  'cog-outline',
  'thermometer-high',
  'flask-outline',
  'palette-outline',
  'tools',
  'brush-outline',
  'wrench-outline',
  'microscope',
  'package-variant-closed',
  'diamond-stone',
  'laser-pointer',
  'hammer-wrench',
  'clipboard-check-outline',
];

// ─────────────────────────────────────────────────────────────────────────────
// Tipler
// ─────────────────────────────────────────────────────────────────────────────

interface Station {
  id: string;
  name: string;
  color: string;
  icon: string;
  sequence_hint: number;
  is_critical: boolean;
  is_active: boolean;
}

type FormData = Omit<Station, 'id'>;

const EMPTY_FORM: FormData = {
  name: '',
  color: '#2563EB',
  icon: 'wrench-outline',
  sequence_hint: 0,
  is_critical: false,
  is_active: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// İstasyon Formu — Desktop-Centered Dialog
// ─────────────────────────────────────────────────────────────────────────────

function StationFormModal({
  visible,
  initial,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  initial: FormData | null;
  onClose: () => void;
  onSave: (data: FormData) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormData>(initial ?? EMPTY_FORM);

  useEffect(() => {
    setForm(initial ?? EMPTY_FORM);
  }, [initial, visible]);

  function patch<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    if (!form.name.trim()) {
      Alert.alert('İsim gerekli', 'İstasyon adını girin.');
      return;
    }
    onSave({ ...form, name: form.name.trim() });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={fm.overlay} onPress={onClose}>
        <Pressable style={fm.dialog} onPress={() => {}}>

          {/* ── Başlık ──────────────────────────────────────────────────── */}
          <View style={fm.dialogHeader}>
            <View style={[fm.dialogAccent, { backgroundColor: form.color }]} />
            <Text style={fm.dialogTitle}>
              {initial ? 'İstasyonu Düzenle' : 'Yeni İstasyon Ekle'}
            </Text>
            <TouchableOpacity style={fm.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <AppIcon name="x" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={fm.dialogBody}
            contentContainerStyle={{ gap: 18, paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >

            {/* İsim */}
            <View style={fm.field}>
              <Text style={fm.label}>İSTASYON ADI</Text>
              <TextInput
                style={fm.input}
                value={form.name}
                onChangeText={t => patch('name', t)}
                placeholder="ör. Porselen Atölyesi"
                placeholderTextColor="#94A3B8"
                maxLength={60}
                autoFocus={!initial}
              />
              {/* Preset öneriler — default istasyon adları */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {DIGITAL_DENTAL_LAB_STATIONS.map(ds => (
                    <TouchableOpacity
                      key={ds.name}
                      style={[fm.presetChip, form.name === ds.name && { backgroundColor: ds.color + '18', borderColor: ds.color }]}
                      onPress={() => patch('name', ds.name)}
                      activeOpacity={0.7}
                    >
                      <Text style={[fm.presetText, form.name === ds.name && { color: ds.color }]}>
                        {ds.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Renk */}
            <View style={fm.field}>
              <Text style={fm.label}>RENK</Text>
              <View style={fm.colorRow}>
                {PRESET_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      fm.colorDot,
                      { backgroundColor: c },
                      form.color === c && fm.colorDotActive,
                    ]}
                    onPress={() => patch('color', c)}
                    activeOpacity={0.8}
                  />
                ))}
              </View>
            </View>

            {/* İkon */}
            <View style={fm.field}>
              <Text style={fm.label}>İKON</Text>
              <View style={fm.iconRow}>
                {PRESET_ICONS.map(ic => (
                  <TouchableOpacity
                    key={ic}
                    style={[
                      fm.iconBtn,
                      form.icon === ic && {
                        backgroundColor: form.color + '22',
                        borderColor: form.color,
                      },
                    ]}
                    onPress={() => patch('icon', ic)}
                    activeOpacity={0.8}
                  >
                    <AppIcon
                      name={ic as any}
                      size={18}
                      color={form.icon === ic ? form.color : '#64748B'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Kritik Toggle */}
            <View style={fm.toggleRow}>
              <View style={[fm.toggleIcon, { backgroundColor: '#FEF2F2' }]}>
                <AppIcon name="alert-circle" size={16} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fm.toggleLabel}>Kritik İstasyon</Text>
                <Text style={fm.toggleSub}>Geçiş için mesul müdür onayı gerekir</Text>
              </View>
              <Switch
                value={form.is_critical}
                onValueChange={v => patch('is_critical', v)}
                trackColor={{ false: '#E2E8F0', true: '#FECACA' }}
                thumbColor={form.is_critical ? '#DC2626' : '#f4f4f5'}
              />
            </View>

            {/* Aktif Toggle */}
            <View style={fm.toggleRow}>
              <View style={[fm.toggleIcon, { backgroundColor: '#F0FDF4' }]}>
                <AppIcon name="check-circle" size={16} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fm.toggleLabel}>Aktif</Text>
                <Text style={fm.toggleSub}>Devre dışıysa rota seçiminde görünmez</Text>
              </View>
              <Switch
                value={form.is_active}
                onValueChange={v => patch('is_active', v)}
                trackColor={{ false: '#E2E8F0', true: '#BBFBD0' }}
                thumbColor={form.is_active ? '#059669' : '#f4f4f5'}
              />
            </View>

          </ScrollView>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={fm.cancelText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fm.saveBtn, { backgroundColor: form.color }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={fm.saveText}>{initial ? 'Kaydet' : 'İstasyonu Ekle'}</Text>
              }
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const fm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
    overflow: 'hidden',
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dialogAccent: {
    width: 4,
    height: 22,
    borderRadius: 2,
  },
  dialogTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },

  field: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0F172A',
  },
  presetChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetText: { fontSize: 11, fontWeight: '600', color: '#64748B' },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: '#0F172A',
    transform: [{ scale: 1.12 }],
  },

  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  toggleSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Varsayılan İstasyon Önizleme Modalı
// Kullanıcı "Varsayılan İstasyonları Ekle" butonuna basınca açılır,
// hangi istasyonların ekleneceğini gösterir.
// ─────────────────────────────────────────────────────────────────────────────

function DefaultStationsPreviewModal({
  visible,
  existingNames,
  onClose,
  onConfirm,
  saving,
}: {
  visible: boolean;
  existingNames: Set<string>;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const toAdd = DIGITAL_DENTAL_LAB_STATIONS.filter(ds => !existingNames.has(ds.name));
  const alreadyAdded = DIGITAL_DENTAL_LAB_STATIONS.filter(ds => existingNames.has(ds.name));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={pv.overlay} onPress={onClose}>
        <Pressable style={pv.dialog} onPress={() => {}}>

          {/* Header */}
          <View style={pv.header}>
            <View style={pv.headerIcon}>
              <AppIcon name={'lightning-bolt' as any} size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={pv.title}>Varsayılan İstasyonlar</Text>
              <Text style={pv.subtitle}>Dijital Diş Laboratuvarı Şablonu</Text>
            </View>
            <TouchableOpacity style={pv.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <AppIcon name="x" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={pv.body}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >

            {/* Eklenecekler */}
            {toAdd.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={pv.sectionLabel}>
                  Eklenecek ({toAdd.length} istasyon)
                </Text>
                {toAdd.map((ds, i) => (
                  <View key={ds.name} style={pv.stationRow}>
                    <View style={[pv.badge, { backgroundColor: ds.color + '20' }]}>
                      <Text style={[pv.badgeNum, { color: ds.color }]}>{i + 1}</Text>
                    </View>
                    <View style={[pv.iconBubble, { backgroundColor: ds.color + '18' }]}>
                      <AppIcon name={ds.icon as any} size={16} color={ds.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={pv.stationName}>{ds.name}</Text>
                        {ds.is_critical && (
                          <View style={pv.criticalBadge}>
                            <Text style={pv.criticalText}>Kritik</Text>
                          </View>
                        )}
                      </View>
                      <Text style={pv.stationInfo}>{ds.info}</Text>
                    </View>
                    <View style={[pv.colorDot, { backgroundColor: ds.color }]} />
                  </View>
                ))}
              </View>
            )}

            {/* Zaten mevcut olanlar */}
            {alreadyAdded.length > 0 && (
              <View style={{ gap: 6, marginTop: 16 }}>
                <Text style={pv.sectionLabel}>
                  Zaten Mevcut ({alreadyAdded.length} istasyon)
                </Text>
                {alreadyAdded.map(ds => (
                  <View key={ds.name} style={[pv.stationRow, { opacity: 0.5 }]}>
                    <View style={[pv.iconBubble, { backgroundColor: '#F1F5F9' }]}>
                      <AppIcon name={ds.icon as any} size={16} color="#94A3B8" />
                    </View>
                    <Text style={[pv.stationName, { color: '#94A3B8', flex: 1 }]}>{ds.name}</Text>
                    <AppIcon name="check-circle" size={16} color="#94A3B8" />
                  </View>
                ))}
              </View>
            )}

          </ScrollView>

          {/* Footer */}
          <View style={pv.footer}>
            <TouchableOpacity style={pv.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={pv.cancelText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pv.confirmBtn, (saving || toAdd.length === 0) && { opacity: 0.6 }]}
              onPress={onConfirm}
              disabled={saving || toAdd.length === 0}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <AppIcon name={'lightning-bolt' as any} size={15} color="#fff" />
                    <Text style={pv.confirmText}>
                      {toAdd.length > 0
                        ? `${toAdd.length} İstasyonu Ekle`
                        : 'Tümü Zaten Ekli'
                      }
                    </Text>
                  </>
              }
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const pv = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 540,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNum: { fontSize: 11, fontWeight: '800' },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  stationInfo: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  criticalBadge: {
    backgroundColor: '#FEF2F2',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  criticalText: { fontSize: 9, fontWeight: '700', color: '#DC2626' },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#D97706',
    borderRadius: 12,
    paddingVertical: 13,
  },
  confirmText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Ana Bileşen
// ─────────────────────────────────────────────────────────────────────────────

export function StationsSection() {
  const { profile } = useAuthStore();
  const labId = profile?.lab_id ?? profile?.id ?? '';

  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // Form modal
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing]         = useState<Station | null>(null);

  // Preview modal
  const [previewVisible, setPreviewVisible] = useState(false);

  // ── Yükleme ──────────────────────────────────────────────────────────────

  const loadStations = useCallback(async () => {
    if (!labId) return;
    setLoading(true);
    const { data } = await supabase
      .from('lab_stations')
      .select('id, name, color, icon, sequence_hint, is_critical, is_active')
      .eq('lab_profile_id', labId)
      .order('sequence_hint')
      .order('name');
    setStations((data ?? []) as Station[]);
    setLoading(false);
  }, [labId]);

  useEffect(() => { loadStations(); }, [loadStations]);

  // ── Kaydet / Güncelle ────────────────────────────────────────────────────

  async function handleSave(data: FormData) {
    if (!labId) return;
    setSaving(true);

    if (editing) {
      const { error } = await supabase
        .from('lab_stations')
        .update({
          name:          data.name,
          color:         data.color,
          icon:          data.icon,
          is_critical:   data.is_critical,
          is_active:     data.is_active,
          sequence_hint: data.sequence_hint,
        })
        .eq('id', editing.id);

      setSaving(false);
      if (error) {
        toast.error('Güncelleme hatası: ' + error.message);
      } else {
        toast.success('İstasyon güncellendi ✓');
        setFormVisible(false);
        loadStations();
      }
    } else {
      const maxHint = stations.reduce((m, s) => Math.max(m, s.sequence_hint), 0);
      const { error } = await supabase.from('lab_stations').insert({
        lab_profile_id: labId,
        name:           data.name,
        color:          data.color,
        icon:           data.icon,
        is_critical:    data.is_critical,
        is_active:      data.is_active,
        sequence_hint:  maxHint + 10,
      });

      setSaving(false);
      if (error) {
        toast.error('Ekleme hatası: ' + error.message);
      } else {
        toast.success('İstasyon eklendi ✓');
        setFormVisible(false);
        loadStations();
      }
    }
  }

  // ── Sil ──────────────────────────────────────────────────────────────────

  function confirmDelete(station: Station) {
    Alert.alert(
      'İstasyonu Sil',
      `"${station.name}" istasyonunu silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('lab_stations')
              .delete()
              .eq('id', station.id);
            if (error) {
              Alert.alert(
                'Silinemedi',
                error.code === '23503'
                  ? 'Bu istasyona bağlı aktif aşamalar var. Önce aşamaları tamamlayın.'
                  : error.message,
              );
            } else {
              toast.success('İstasyon silindi');
              loadStations();
            }
          },
        },
      ],
    );
  }

  // ── Sıralama ─────────────────────────────────────────────────────────────

  async function moveStation(index: number, dir: -1 | 1) {
    const next = [...stations];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;

    const aHint = next[index].sequence_hint;
    const bHint = next[target].sequence_hint;
    next[index]  = { ...next[index],  sequence_hint: bHint };
    next[target] = { ...next[target], sequence_hint: aHint };
    setStations(next);

    await Promise.all([
      supabase.from('lab_stations').update({ sequence_hint: bHint }).eq('id', stations[index].id),
      supabase.from('lab_stations').update({ sequence_hint: aHint }).eq('id', stations[target].id),
    ]);
  }

  // ── Varsayılan istasyonları ekle ─────────────────────────────────────────

  async function seedDefaults() {
    if (!labId) return;
    const existing = new Set(stations.map(s => s.name));
    const toAdd = DIGITAL_DENTAL_LAB_STATIONS.filter(ds => !existing.has(ds.name));
    if (toAdd.length === 0) {
      setPreviewVisible(false);
      return;
    }

    setSaving(true);
    const startHint = stations.reduce((m, s) => Math.max(m, s.sequence_hint), 0);
    const rows = toAdd.map((ds, i) => ({
      lab_profile_id: labId,
      name:           ds.name,
      color:          ds.color,
      icon:           ds.icon,
      sequence_hint:  startHint + (i + 1) * 10,
      is_critical:    ds.is_critical,
      is_active:      true,
    }));

    const { error } = await supabase.from('lab_stations').insert(rows);
    setSaving(false);
    setPreviewVisible(false);

    if (error) {
      toast.error('Ekleme hatası: ' + error.message);
    } else {
      toast.success(`${toAdd.length} istasyon eklendi ✓`);
      loadStations();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const existingNames = new Set(stations.map(st => st.name));

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* ── Başlık satırı ─────────────────────────────────────────────── */}
      <View style={s.topRow}>
        <View>
          <Text style={s.title}>Üretim İstasyonları</Text>
          <Text style={s.subtitle}>
            {stations.length > 0
              ? `${stations.length} istasyon tanımlı · ${stations.filter(st => st.is_active).length} aktif`
              : 'Henüz istasyon eklenmemiş'
            }
          </Text>
        </View>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => { setEditing(null); setFormVisible(true); }}
          activeOpacity={0.8}
        >
          <AppIcon name="plus" size={16} color="#fff" />
          <Text style={s.addBtnText}>Yeni İstasyon</Text>
        </TouchableOpacity>
      </View>

      {/* ── Boş durum ─────────────────────────────────────────────────── */}
      {stations.length === 0 && (
        <View style={s.emptyCard}>
          {/* İstasyon şeması illustration */}
          <View style={s.emptyIllustration}>
            {DIGITAL_DENTAL_LAB_STATIONS.slice(0, 6).map((ds, i) => (
              <View
                key={ds.name}
                style={[s.emptyDot, { backgroundColor: ds.color, opacity: 0.15 + i * 0.12 }]}
              />
            ))}
          </View>
          <Text style={s.emptyTitle}>İstasyon Tanımlı Değil</Text>
          <Text style={s.emptyText}>
            Üretim akışınızı belirlemek için istasyonlarınızı tanımlayın.{'\n'}
            Dijital diş laboratuvarı şablonuyla tek tıkla başlayın.
          </Text>

          <TouchableOpacity
            style={s.seedBtn}
            onPress={() => setPreviewVisible(true)}
            activeOpacity={0.85}
          >
            <AppIcon name={'lightning-bolt' as any} size={16} color="#fff" />
            <Text style={s.seedBtnText}>Varsayılan İstasyonları Ekle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.manualBtn}
            onPress={() => { setEditing(null); setFormVisible(true); }}
            activeOpacity={0.7}
          >
            <AppIcon name="plus" size={14} color="#2563EB" />
            <Text style={s.manualBtnText}>Manuel Ekle</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── İstasyon listesi ──────────────────────────────────────────── */}
      {stations.map((station, index) => (
        <View
          key={station.id}
          style={[s.stationCard, !station.is_active && s.stationCardInactive]}
        >
          {/* Sol renk bant */}
          <View style={[s.colorBar, { backgroundColor: station.color }]} />

          {/* Sıra numarası */}
          <View style={[s.seqBadge, { backgroundColor: station.color + '18' }]}>
            <Text style={[s.seqNum, { color: station.color }]}>{index + 1}</Text>
          </View>

          {/* İkon */}
          <View style={[s.iconWrap, { backgroundColor: station.color + '18' }]}>
            <AppIcon name={station.icon as any} size={20} color={station.color} />
          </View>

          {/* Bilgi */}
          <View style={s.stationInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={[s.stationName, !station.is_active && { color: '#94A3B8' }]}>
                {station.name}
              </Text>
              {station.is_critical && (
                <View style={s.criticalBadge}>
                  <AppIcon name="alert-circle" size={9} color="#DC2626" />
                  <Text style={s.criticalText}>Kritik</Text>
                </View>
              )}
              {!station.is_active && (
                <View style={s.inactiveBadge}>
                  <Text style={s.inactiveText}>Devre Dışı</Text>
                </View>
              )}
            </View>
          </View>

          {/* Aksiyonlar */}
          <View style={s.stationActions}>
            <TouchableOpacity
              style={[s.arrowBtn, index === 0 && s.arrowBtnDisabled]}
              onPress={() => moveStation(index, -1)}
              disabled={index === 0}
              activeOpacity={0.7}
            >
              <AppIcon name="chevron-up" size={14} color={index === 0 ? '#CBD5E1' : '#475569'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.arrowBtn, index === stations.length - 1 && s.arrowBtnDisabled]}
              onPress={() => moveStation(index, 1)}
              disabled={index === stations.length - 1}
              activeOpacity={0.7}
            >
              <AppIcon
                name="chevron-down"
                size={14}
                color={index === stations.length - 1 ? '#CBD5E1' : '#475569'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.editBtn}
              onPress={() => { setEditing(station); setFormVisible(true); }}
              activeOpacity={0.7}
            >
              <AppIcon name={'pencil-outline' as any} size={15} color="#2563EB" />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.deleteBtn}
              onPress={() => confirmDelete(station)}
              activeOpacity={0.7}
            >
              <AppIcon name="trash-2" size={15} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* ── Listenin altında "Eksik varsayılanları ekle" ────────────── */}
      {stations.length > 0 && (
        <TouchableOpacity
          style={s.seedBtnSecondary}
          onPress={() => setPreviewVisible(true)}
          activeOpacity={0.75}
        >
          <AppIcon name={'lightning-bolt-outline' as any} size={14} color="#D97706" />
          <Text style={s.seedBtnSecondaryText}>Eksik Varsayılan İstasyonları Gözden Geçir</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 60 }} />

      {/* ── Modaller ──────────────────────────────────────────────────── */}
      <StationFormModal
        visible={formVisible}
        initial={editing
          ? {
              name:          editing.name,
              color:         editing.color,
              icon:          editing.icon,
              sequence_hint: editing.sequence_hint,
              is_critical:   editing.is_critical,
              is_active:     editing.is_active,
            }
          : null
        }
        onClose={() => setFormVisible(false)}
        onSave={handleSave}
        saving={saving}
      />

      <DefaultStationsPreviewModal
        visible={previewVisible}
        existingNames={existingNames}
        onClose={() => setPreviewVisible(false)}
        onConfirm={seedDefaults}
        saving={saving}
      />

    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stiller
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F9FB' },
  content: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title:    { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyIllustration: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  emptyDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  seedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D97706',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  seedBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  manualBtnText: { fontSize: 13, fontWeight: '600', color: '#2563EB' },

  // Station card
  stationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  stationCardInactive: { opacity: 0.55 },
  colorBar: { width: 4, alignSelf: 'stretch' },
  seqBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  seqNum: { fontSize: 11, fontWeight: '800' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationInfo: { flex: 1, paddingVertical: 13 },
  stationName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },

  criticalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  criticalText: { fontSize: 9, fontWeight: '700', color: '#DC2626' },

  inactiveBadge: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inactiveText: { fontSize: 9, fontWeight: '600', color: '#94A3B8' },

  stationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 10,
  },
  arrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnDisabled: { opacity: 0.3 },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Secondary seed button
  seedBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 4,
  },
  seedBtnSecondaryText: { fontSize: 13, fontWeight: '600', color: '#92400E' },
});
