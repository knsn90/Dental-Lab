/**
 * StationsSection — Patterns Design Language (NativeWind)
 * ───────────────────────────────────────────────────────
 * Ayarlar > İstasyonlar sekmesi.
 * Üretim istasyonlarını CRUD + sıralama.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  TextInput, Modal, ActivityIndicator, Alert, Platform,
} from 'react-native';
import {
  Plus, X, ChevronUp, ChevronDown, Pencil, Trash2,
  AlertCircle, CheckCircle, Zap, ScanLine, PenTool,
  Printer, Cog, Thermometer, FlaskConical, Palette,
  Wrench, Paintbrush, Microscope, Package, Diamond,
  Crosshair, Hammer, ClipboardCheck, Check,
} from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';

// ── Constants ───────────────────────────────────────────────────────────
const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

const DISPLAY_FONT = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const INPUT_STYLE = {
  height: 44,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.08)',
  backgroundColor: '#FFFFFF',
  paddingHorizontal: 14,
  fontSize: 14,
  color: '#0A0A0A',
  outlineWidth: 0,
} as any;

// ── Lucide icon map ─────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  'line-scan': ScanLine,
  'vector-combine': PenTool,
  'printer-3d-nozzle-outline': Printer,
  'cog-outline': Cog,
  'thermometer-high': Thermometer,
  'flask-outline': FlaskConical,
  'palette-outline': Palette,
  'tools': Wrench,
  'brush-outline': Paintbrush,
  'wrench-outline': Wrench,
  'microscope': Microscope,
  'package-variant-closed': Package,
  'diamond-stone': Diamond,
  'laser-pointer': Crosshair,
  'hammer-wrench': Hammer,
  'clipboard-check-outline': ClipboardCheck,
};

function StationIcon({ name, size = 16, color = '#6B6B6B' }: { name: string; size?: number; color?: string }) {
  const Icon = ICON_MAP[name] ?? Wrench;
  return <Icon size={size} color={color} strokeWidth={1.8} />;
}

// ── Patterns FormToggle — DS.ink[900] ON, rgba(0,0,0,0.15) OFF ──────────
function PatternsToggle({ value, onValueChange }: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 999,
        backgroundColor: value ? DS.ink[900] : 'rgba(0,0,0,0.15)',
        padding: 2, justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 20, height: 20, borderRadius: 10,
          backgroundColor: '#FFF',
          alignSelf: value ? 'flex-end' : 'flex-start',
          ...(Platform.OS === 'web'
            ? { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } as any
            : { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 }),
        }}
      />
    </Pressable>
  );
}

// ── Default stations ────────────────────────────────────────────────────
interface DefaultStation {
  name: string;
  color: string;
  icon: string;
  is_critical: boolean;
  info: string;
}

const DIGITAL_DENTAL_LAB_STATIONS: DefaultStation[] = [
  { name: 'Tarama (3D Scan)',      color: '#2563EB', icon: 'line-scan',                   is_critical: false, info: 'Ölçü & modelin 3D olarak taranması' },
  { name: 'Tasarım (CAD)',         color: '#7C3AED', icon: 'vector-combine',              is_critical: false, info: 'Dijital CAD yazılımıyla protetik tasarım' },
  { name: '3D Baskı',              color: '#0891B2', icon: 'printer-3d-nozzle-outline',   is_critical: false, info: 'Reçine / metal tozu ile katmanlı üretim' },
  { name: 'Freze (Milling / CAM)', color: '#D97706', icon: 'cog-outline',                 is_critical: false, info: 'CNC freze; zirkonyum, PMMA, wax, metal' },
  { name: 'Sinterleme / Fırın',    color: '#EA580C', icon: 'thermometer-high',            is_critical: false, info: 'Zirkonyum sinterleme & porselen pişirme' },
  { name: 'Metal Döküm',           color: '#9333EA', icon: 'flask-outline',               is_critical: false, info: 'Geleneksel veya dijital metal döküm' },
  { name: 'Porselen / Makyaj',     color: '#BE185D', icon: 'palette-outline',             is_critical: false, info: 'Renk karakterizasyonu & estetik boyama' },
  { name: 'Tesviye / Bitim',       color: '#059669', icon: 'tools',                       is_critical: false, info: 'Kenar tesviye, uyum kontrolü, oklüzyon' },
  { name: 'Polisaj',               color: '#16A34A', icon: 'brush-outline',               is_critical: false, info: 'Yüzey parlatma & glaçaj işlemi' },
  { name: 'İmplant Montajı',       color: '#1D4ED8', icon: 'wrench-outline',              is_critical: false, info: 'İmplant üst yapısı & vidalama torku' },
  { name: 'Kalite Kontrol',        color: '#DC2626', icon: 'microscope',                  is_critical: true,  info: 'Son kalite denetimi — geçiş için onay zorunlu' },
  { name: 'Paketleme & Kargo',     color: '#475569', icon: 'package-variant-closed',      is_critical: false, info: 'Steril paketleme & klinik teslimat hazırlığı' },
];

const PRESET_COLORS = [
  '#2563EB', '#7C3AED', '#0891B2', '#D97706', '#EA580C', '#DC2626',
  '#9333EA', '#BE185D', '#059669', '#16A34A', '#1D4ED8', '#475569',
];

const PRESET_ICONS = [
  'line-scan', 'vector-combine', 'printer-3d-nozzle-outline', 'cog-outline',
  'thermometer-high', 'flask-outline', 'palette-outline', 'tools',
  'brush-outline', 'wrench-outline', 'microscope', 'package-variant-closed',
  'diamond-stone', 'laser-pointer', 'hammer-wrench', 'clipboard-check-outline',
];

// ── Types ───────────────────────────────────────────────────────────────
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
  name: '', color: '#2563EB', icon: 'wrench-outline',
  sequence_hint: 0, is_critical: false, is_active: true,
};

// ── Props ───────────────────────────────────────────────────────────────
interface Props {
  accentColor?: string;
}

// ── Station Form Modal ──────────────────────────────────────────────────
function StationFormModal({
  visible, initial, onClose, onSave, saving, accentColor,
}: {
  visible: boolean;
  initial: FormData | null;
  onClose: () => void;
  onSave: (data: FormData) => void;
  saving: boolean;
  accentColor: string;
}) {
  const [form, setForm] = useState<FormData>(initial ?? EMPTY_FORM);

  useEffect(() => { setForm(initial ?? EMPTY_FORM); }, [initial, visible]);

  function patch<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function selectPreset(ds: DefaultStation) {
    setForm(prev => ({ ...prev, name: ds.name, color: ds.color, icon: ds.icon }));
  }

  function handleSave() {
    if (!form.name.trim()) {
      Alert.alert('İsim gerekli', 'İstasyon adını girin.');
      return;
    }
    onSave({ ...form, name: form.name.trim() });
  }

  const matchedPreset = DIGITAL_DENTAL_LAB_STATIONS.find(ds => ds.name === form.name);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
        onPress={onClose}
      >
        <Pressable
          style={{ backgroundColor: '#FFF', width: '100%', maxWidth: 520, maxHeight: '88%', borderRadius: 24, overflow: 'hidden' }}
          onPress={() => {}}
        >
          {/* ── Header — sabit, scroll dışı ─────────────────── */}
          <View style={{ padding: 28, paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            {/* Title row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ ...DISPLAY_FONT, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
                {initial ? 'İstasyonu Düzenle' : 'Yeni İstasyon Ekle'}
              </Text>
              <Pressable onPress={onClose}>
                <X size={18} color={DS.ink[400]} strokeWidth={1.8} />
              </Pressable>
            </View>

            {/* Live preview */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 14,
              borderRadius: 14, padding: 14,
              backgroundColor: 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
              marginBottom: 16,
            }}>
              <View style={{ width: 3, height: 28, borderRadius: 2, backgroundColor: form.color }} />
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: `${form.color}14`, alignItems: 'center', justifyContent: 'center',
              }}>
                <StationIcon name={form.icon} size={18} color={form.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[900] }}>
                  {form.name || 'İstasyon Adı'}
                </Text>
                {matchedPreset && (
                  <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>{matchedPreset.info}</Text>
                )}
              </View>
              {form.is_critical && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                  backgroundColor: 'rgba(217,75,75,0.12)',
                }}>
                  <AlertCircle size={9} color="#9C2E2E" strokeWidth={2} />
                  <Text style={{ fontSize: 10, fontWeight: '500', color: '#9C2E2E' }}>Kritik</Text>
                </View>
              )}
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: form.color }} />
            </View>

            {/* Togglelar — scroll dışında, her zaman görünür */}
            <View style={{ flexDirection: 'row', gap: 20, paddingBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PatternsToggle value={form.is_critical} onValueChange={v => patch('is_critical', v)} />
                <Text style={{ fontSize: 13, color: DS.ink[900] }}>Kritik</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PatternsToggle value={form.is_active} onValueChange={v => patch('is_active', v)} />
                <Text style={{ fontSize: 13, color: DS.ink[900] }}>Aktif</Text>
              </View>
            </View>
          </View>

          {/* ── Body — scroll alanı ────────────────────────────── */}
          <ScrollView
            style={{ paddingHorizontal: 28 }}
            contentContainerStyle={{ paddingTop: 24, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {/* İsim */}
            <View style={{ gap: 6, marginBottom: 24 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800] }}>İstasyon Adı</Text>
              <TextInput
                style={INPUT_STYLE}
                value={form.name}
                onChangeText={t => patch('name', t)}
                placeholder="ör. Porselen Atölyesi"
                placeholderTextColor="#9A9A9A"
                maxLength={60}
                autoFocus={!initial}
              />

              {/* Preset chips */}
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 6, marginBottom: 4 }}>Hazır şablonlar</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {DIGITAL_DENTAL_LAB_STATIONS.map(ds => {
                    const sel = form.name === ds.name;
                    return (
                      <Pressable
                        key={ds.name}
                        onPress={() => selectPreset(ds)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 10, paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor: sel ? `${ds.color}14` : 'rgba(0,0,0,0.04)',
                          borderWidth: 1,
                          borderColor: sel ? `${ds.color}40` : 'transparent',
                        }}
                      >
                        <StationIcon name={ds.icon} size={11} color={sel ? ds.color : DS.ink[400]} />
                        <Text style={{ fontSize: 11, fontWeight: sel ? '500' : '400', color: sel ? ds.color : DS.ink[500] }}>
                          {ds.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginBottom: 24 }} />

            {/* Renk & İkon yan yana */}
            <View style={{ flexDirection: 'row', gap: 24, marginBottom: 12 }}>
              {/* Renk */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>Renk</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {PRESET_COLORS.map(c => {
                    const sel = form.color === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => patch('color', c)}
                        style={{
                          width: 28, height: 28, borderRadius: 14,
                          backgroundColor: c,
                          borderWidth: 2,
                          borderColor: sel ? DS.ink[900] : 'transparent',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {sel && <Check size={12} color="#FFF" strokeWidth={2.5} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* İkon */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>İkon</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {PRESET_ICONS.map(ic => {
                    const sel = form.icon === ic;
                    return (
                      <Pressable
                        key={ic}
                        onPress={() => patch('icon', ic)}
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          backgroundColor: sel ? `${form.color}14` : 'rgba(0,0,0,0.03)',
                          borderWidth: 1,
                          borderColor: sel ? `${form.color}40` : 'transparent',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <StationIcon name={ic} size={15} color={sel ? form.color : DS.ink[400]} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* ── Footer — Patterns pill buttons, right-aligned ──── */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 28, paddingVertical: 20,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <Pressable
              onPress={onClose}
              style={{
                paddingHorizontal: 20, paddingVertical: 10,
                borderRadius: 999, borderWidth: 1, borderColor: 'transparent',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900], letterSpacing: -0.13 }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                paddingHorizontal: 20, paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: DS.ink[900], borderWidth: 1, borderColor: DS.ink[900],
                opacity: saving ? 0.6 : 1,
                flexDirection: 'row', alignItems: 'center', gap: 6,
              }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFF', letterSpacing: -0.13 }}>
                    {initial ? 'Kaydet' : 'İstasyonu Ekle'}
                  </Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Default Stations Preview Modal ──────────────────────────────────────
function DefaultStationsPreviewModal({
  visible, existingNames, onClose, onConfirm, saving, accentColor,
}: {
  visible: boolean;
  existingNames: Set<string>;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  accentColor: string;
}) {
  const toAdd = DIGITAL_DENTAL_LAB_STATIONS.filter(ds => !existingNames.has(ds.name));
  const alreadyAdded = DIGITAL_DENTAL_LAB_STATIONS.filter(ds => existingNames.has(ds.name));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center p-6"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onPress={onClose}
      >
        <Pressable
          className="bg-white w-full overflow-hidden"
          style={{ maxWidth: 540, maxHeight: '90%', borderRadius: 24 }}
          onPress={() => {}}
        >
          {/* Header */}
          <View className="flex-row items-center gap-3 px-[22px] pt-[22px] pb-3.5" style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
            <View
              className="w-[42px] h-[42px] rounded-xl items-center justify-center"
              style={{ backgroundColor: `${accentColor}14` }}
            >
              <Zap size={18} color={accentColor} strokeWidth={1.8} />
            </View>
            <View className="flex-1">
              <Text style={{ ...DISPLAY_FONT, fontSize: 17, letterSpacing: -0.3, color: '#0A0A0A' }}>
                Varsayılan İstasyonlar
              </Text>
              <Text className="text-[12px] text-ink-400 mt-0.5">Dijital Diş Laboratuvarı Şablonu</Text>
            </View>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
            >
              <X size={16} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView
            style={{ paddingHorizontal: 22 }}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {/* To add */}
            {toAdd.length > 0 && (
              <View className="gap-1.5">
                <Text className="text-[11px] font-semibold text-ink-400 tracking-wider uppercase mb-1">
                  Eklenecek ({toAdd.length} istasyon)
                </Text>
                {toAdd.map((ds, i) => (
                  <View
                    key={ds.name}
                    className="flex-row items-center gap-2.5 rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: 'rgba(0,0,0,0.02)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}
                  >
                    <View
                      className="w-[22px] h-[22px] rounded-full items-center justify-center"
                      style={{ backgroundColor: `${ds.color}18` }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: ds.color }}>{i + 1}</Text>
                    </View>
                    <View
                      className="w-[34px] h-[34px] rounded-[10px] items-center justify-center"
                      style={{ backgroundColor: `${ds.color}14` }}
                    >
                      <StationIcon name={ds.icon} size={15} color={ds.color} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A' }}>{ds.name}</Text>
                        {ds.is_critical && (
                          <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: '#DC262612' }}>
                            <Text style={{ fontSize: 9, fontWeight: '600', color: '#DC2626' }}>Kritik</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-[11px] text-ink-400 mt-0.5">{ds.info}</Text>
                    </View>
                    <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: ds.color }} />
                  </View>
                ))}
              </View>
            )}

            {/* Already added */}
            {alreadyAdded.length > 0 && (
              <View className="gap-1.5 mt-4">
                <Text className="text-[11px] font-semibold text-ink-400 tracking-wider uppercase mb-1">
                  Zaten Mevcut ({alreadyAdded.length} istasyon)
                </Text>
                {alreadyAdded.map(ds => (
                  <View
                    key={ds.name}
                    className="flex-row items-center gap-2.5 rounded-xl px-3 py-2.5"
                    style={{ opacity: 0.5, backgroundColor: 'rgba(0,0,0,0.02)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}
                  >
                    <View
                      className="w-[34px] h-[34px] rounded-[10px] items-center justify-center"
                      style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
                    >
                      <StationIcon name={ds.icon} size={15} color="#9A9A9A" />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: '#9A9A9A', flex: 1 }}>{ds.name}</Text>
                    <CheckCircle size={14} color="#9A9A9A" strokeWidth={1.8} />
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Footer — Patterns pill buttons */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 22, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <Pressable
              onPress={onClose}
              style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900], letterSpacing: -0.13 }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={saving || toAdd.length === 0}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 20, paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: DS.ink[900], borderWidth: 1, borderColor: DS.ink[900],
                opacity: (saving || toAdd.length === 0) ? 0.6 : 1,
              }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <>
                    <Zap size={13} color="#FFF" strokeWidth={1.8} />
                    <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFF', letterSpacing: -0.13 }}>
                      {toAdd.length > 0 ? `${toAdd.length} İstasyonu Ekle` : 'Tümü Zaten Ekli'}
                    </Text>
                  </>
              }
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main Component ──────────────────────────────────────────────────────
export function StationsSection({ accentColor = '#F5C24B' }: Props) {
  const { profile } = useAuthStore();
  const labId = profile?.lab_id ?? profile?.id ?? '';

  const [stations, setStations]   = useState<Station[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [formVisible, setFormVisible]     = useState(false);
  const [editing, setEditing]             = useState<Station | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────
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

  // ── Save / Update ───────────────────────────────────────────────────
  async function handleSave(data: FormData) {
    if (!labId) return;
    setSaving(true);

    if (editing) {
      const { error } = await supabase
        .from('lab_stations')
        .update({
          name: data.name, color: data.color, icon: data.icon,
          is_critical: data.is_critical, is_active: data.is_active,
          sequence_hint: data.sequence_hint,
        })
        .eq('id', editing.id);

      setSaving(false);
      if (error) { toast.error('Güncelleme hatası: ' + error.message); }
      else { toast.success('İstasyon güncellendi.'); setFormVisible(false); loadStations(); }
    } else {
      const maxHint = stations.reduce((m, s) => Math.max(m, s.sequence_hint), 0);
      const { error } = await supabase.from('lab_stations').insert({
        lab_profile_id: labId, name: data.name, color: data.color,
        icon: data.icon, is_critical: data.is_critical,
        is_active: data.is_active, sequence_hint: maxHint + 10,
      });

      setSaving(false);
      if (error) {
        const isFK = error.message.includes('lab_profile_id_fkey');
        const detail = isFK
          ? `\n\nlab_profile_id "${labId}" profiles tablosunda yok.`
          : '';
        toast.error('Ekleme hatası: ' + error.message + detail);
      } else { toast.success('İstasyon eklendi.'); setFormVisible(false); loadStations(); }
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────
  function confirmDelete(station: Station) {
    Alert.alert(
      'İstasyonu Sil',
      `"${station.name}" istasyonunu silmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('lab_stations').delete().eq('id', station.id);
            if (error) {
              Alert.alert('Silinemedi',
                error.code === '23503'
                  ? 'Bu istasyona bağlı aktif aşamalar var. Önce aşamaları tamamlayın.'
                  : error.message,
              );
            } else { toast.success('İstasyon silindi.'); loadStations(); }
          },
        },
      ],
    );
  }

  // ── Reorder ─────────────────────────────────────────────────────────
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

  // ── Seed defaults ───────────────────────────────────────────────────
  async function seedDefaults() {
    if (!labId) return;
    const existing = new Set(stations.map(s => s.name));
    const toAdd = DIGITAL_DENTAL_LAB_STATIONS.filter(ds => !existing.has(ds.name));
    if (toAdd.length === 0) { setPreviewVisible(false); return; }

    setSaving(true);
    const startHint = stations.reduce((m, s) => Math.max(m, s.sequence_hint), 0);
    const rows = toAdd.map((ds, i) => ({
      lab_profile_id: labId, name: ds.name, color: ds.color,
      icon: ds.icon, sequence_hint: startHint + (i + 1) * 10,
      is_critical: ds.is_critical, is_active: true,
    }));

    const { error } = await supabase.from('lab_stations').insert(rows);
    setSaving(false);
    setPreviewVisible(false);

    if (error) { toast.error('Ekleme hatası: ' + error.message); }
    else { toast.success(`${toAdd.length} istasyon eklendi.`); loadStations(); }
  }

  // ── Loading state ───────────────────────────────────────────────────
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center gap-3 pt-20">
        <ActivityIndicator size="large" color={accentColor} />
        <Text className="text-[13px] text-ink-300">Yükleniyor…</Text>
      </View>
    );
  }

  const existingNames = new Set(stations.map(st => st.name));

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 0, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header row ─────────────────────────────────────── */}
      <View className="flex-row items-center justify-between mb-3">
        <View>
          <Text className="text-[13px] text-ink-400">
            {stations.length > 0
              ? `${stations.length} istasyon tanımlı · ${stations.filter(st => st.is_active).length} aktif`
              : 'Henüz istasyon eklenmemiş'
            }
          </Text>
        </View>
        <Pressable
          onPress={() => { setEditing(null); setFormVisible(true); }}
          className="flex-row items-center gap-2 py-2.5 px-4 rounded-xl"
          style={{ backgroundColor: accentColor }}
        >
          <Plus size={14} color="#FFF" strokeWidth={2} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Yeni İstasyon</Text>
        </Pressable>
      </View>

      {/* ── Empty state ────────────────────────────────────── */}
      {stations.length === 0 && (
        <View className="bg-white rounded-[24px] p-8 items-center" style={{ ...CARD_SHADOW, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderStyle: 'dashed' }}>
          {/* Illustration dots */}
          <View className="flex-row gap-1.5 mb-4">
            {DIGITAL_DENTAL_LAB_STATIONS.slice(0, 6).map((ds, i) => (
              <View
                key={ds.name}
                style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: ds.color, opacity: 0.15 + i * 0.12 }}
              />
            ))}
          </View>
          <Text style={{ ...DISPLAY_FONT, fontSize: 17, letterSpacing: -0.3, color: '#0A0A0A', marginBottom: 6 }}>
            İstasyon Tanımlı Değil
          </Text>
          <Text className="text-[13px] text-ink-400 text-center leading-5 mb-5">
            Üretim akışınızı belirlemek için istasyonlarınızı tanımlayın.{'\n'}
            Dijital diş laboratuvarı şablonuyla tek tıkla başlayın.
          </Text>

          <Pressable
            onPress={() => setPreviewVisible(true)}
            className="flex-row items-center gap-2 py-3 px-7 rounded-2xl mb-2"
            style={{ backgroundColor: accentColor }}
          >
            <Zap size={15} color="#FFF" strokeWidth={1.8} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Varsayılan İstasyonları Ekle</Text>
          </Pressable>

          <Pressable
            onPress={() => { setEditing(null); setFormVisible(true); }}
            className="flex-row items-center gap-1.5 py-2"
          >
            <Plus size={13} color={accentColor} strokeWidth={2} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>Manuel Ekle</Text>
          </Pressable>
        </View>
      )}

      {/* ── Station list ───────────────────────────────────── */}
      {stations.length > 0 && (
        <View className="bg-white rounded-[24px] p-[22px]" style={CARD_SHADOW}>
          <View className="gap-2">
            {stations.map((station, index) => (
              <View
                key={station.id}
                className="flex-row items-center gap-2.5 rounded-2xl px-3 py-2.5"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.02)',
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.04)',
                  opacity: station.is_active ? 1 : 0.5,
                }}
              >
                {/* Color bar */}
                <View style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: station.color }} />

                {/* Sequence */}
                <View
                  className="w-[24px] h-[24px] rounded-full items-center justify-center"
                  style={{ backgroundColor: `${station.color}14` }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: station.color }}>{index + 1}</Text>
                </View>

                {/* Icon */}
                <View
                  className="w-9 h-9 rounded-xl items-center justify-center"
                  style={{ backgroundColor: `${station.color}14` }}
                >
                  <StationIcon name={station.icon} size={16} color={station.color} />
                </View>

                {/* Info */}
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    <Text style={{ fontSize: 13, fontWeight: '600', color: station.is_active ? '#0A0A0A' : '#9A9A9A' }}>
                      {station.name}
                    </Text>
                    {station.is_critical && (
                      <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: '#DC262612' }}>
                        <AlertCircle size={8} color="#DC2626" strokeWidth={2} />
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#DC2626' }}>Kritik</Text>
                      </View>
                    )}
                    {!station.is_active && (
                      <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}>
                        <Text style={{ fontSize: 9, fontWeight: '500', color: '#9A9A9A' }}>Devre Dışı</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Actions */}
                <View className="flex-row items-center gap-1">
                  <Pressable
                    onPress={() => moveStation(index, -1)}
                    disabled={index === 0}
                    className="w-7 h-7 rounded-lg items-center justify-center"
                    style={{ backgroundColor: 'rgba(0,0,0,0.03)', opacity: index === 0 ? 0.3 : 1 }}
                  >
                    <ChevronUp size={13} color="#6B6B6B" strokeWidth={1.8} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveStation(index, 1)}
                    disabled={index === stations.length - 1}
                    className="w-7 h-7 rounded-lg items-center justify-center"
                    style={{ backgroundColor: 'rgba(0,0,0,0.03)', opacity: index === stations.length - 1 ? 0.3 : 1 }}
                  >
                    <ChevronDown size={13} color="#6B6B6B" strokeWidth={1.8} />
                  </Pressable>
                  <Pressable
                    onPress={() => { setEditing(station); setFormVisible(true); }}
                    className="w-8 h-8 rounded-[10px] items-center justify-center ml-1"
                    style={{ backgroundColor: `${accentColor}14` }}
                  >
                    <Pencil size={13} color={accentColor} strokeWidth={1.8} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(station)}
                    className="w-8 h-8 rounded-[10px] items-center justify-center"
                    style={{ backgroundColor: '#DC262610' }}
                  >
                    <Trash2 size={13} color="#DC2626" strokeWidth={1.8} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Seed secondary button ──────────────────────────── */}
      {stations.length > 0 && (
        <Pressable
          onPress={() => setPreviewVisible(true)}
          className="flex-row items-center justify-center gap-2 py-3 rounded-2xl mt-3"
          style={{ borderWidth: 1, borderColor: `${accentColor}40`, backgroundColor: `${accentColor}08` }}
        >
          <Zap size={13} color={accentColor} strokeWidth={1.8} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>
            Eksik Varsayılan İstasyonları Gözden Geçir
          </Text>
        </Pressable>
      )}

      {/* ── Modals ─────────────────────────────────────────── */}
      <StationFormModal
        visible={formVisible}
        initial={editing ? {
          name: editing.name, color: editing.color, icon: editing.icon,
          sequence_hint: editing.sequence_hint, is_critical: editing.is_critical,
          is_active: editing.is_active,
        } : null}
        onClose={() => setFormVisible(false)}
        onSave={handleSave}
        saving={saving}
        accentColor={accentColor}
      />

      <DefaultStationsPreviewModal
        visible={previewVisible}
        existingNames={existingNames}
        onClose={() => setPreviewVisible(false)}
        onConfirm={seedDefaults}
        saving={saving}
        accentColor={accentColor}
      />
    </ScrollView>
  );
}
