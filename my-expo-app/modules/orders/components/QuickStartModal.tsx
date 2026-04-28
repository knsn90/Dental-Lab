// modules/orders/components/QuickStartModal.tsx
// "Başlat" butonuna basıldığında açılan hızlı atama modalı.
// Desktop-first merkezlenmiş dialog — mobil tarzı bottom-sheet yok.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable,
  TouchableOpacity, ActivityIndicator, TextInput,
  ScrollView, Platform, KeyboardAvoidingView,
} from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { AppIcon } from '../../../core/ui/AppIcon';
import { toast } from '../../../core/ui/Toast';
import { WorkOrder } from '../types';
import { Profile } from '../../../lib/types';

// ── Tipler ────────────────────────────────────────────────────────────────────

interface Station {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_critical: boolean;
}

interface Technician {
  id: string;
  full_name: string;
  role: string | null;
}

interface Props {
  visible: boolean;
  order: WorkOrder;
  profile: Profile | null;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Merkezlenmiş picker dialog (istasyon + teknisyen için ortak) ───────────

function PickerDialog<T>({
  visible,
  title,
  subtitle,
  items,
  renderItem,
  onClose,
  emptyIcon,
  emptyMessage,
  emptySubMessage,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  onClose: () => void;
  emptyIcon?: string;
  emptyMessage?: string;
  emptySubMessage?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pd.overlay} onPress={onClose}>
        <Pressable style={pd.dialog} onPress={() => {}}>
          {/* Header */}
          <View style={pd.header}>
            <View style={{ flex: 1 }}>
              <Text style={pd.title}>{title}</Text>
              {subtitle ? <Text style={pd.subtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity style={pd.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <AppIcon name="x" size={15} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Boş durum */}
          {items.length === 0 ? (
            <View style={pd.emptyWrap}>
              <View style={pd.emptyIconBubble}>
                <AppIcon name={(emptyIcon ?? 'alert-circle-outline') as any} size={28} color="#CBD5E1" />
              </View>
              <Text style={pd.emptyTitle}>{emptyMessage ?? 'Kayıt bulunamadı'}</Text>
              {emptySubMessage ? (
                <Text style={pd.emptySub}>{emptySubMessage}</Text>
              ) : null}
            </View>
          ) : (
            /* List */
            <ScrollView
              style={{ maxHeight: 360 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {items.map((item, i) => (
                <View key={i}>{renderItem(item, i)}</View>
              ))}
              <View style={{ height: 8 }} />
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const pd = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.18,
    shadowRadius: 48,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  title:    { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconBubble: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#64748B', textAlign: 'center' },
  emptySub:   { fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 18 },
});

// ── Ana modal ─────────────────────────────────────────────────────────────────

export function QuickStartModal({ visible, order, profile, onClose, onSuccess }: Props) {
  const [stations,    setStations]    = useState<Station[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [islem,      setIslem]      = useState('');
  const [station,    setStation]    = useState<Station | null>(null);
  const [technician, setTechnician] = useState<Technician | null>(null);
  const [notes,      setNotes]      = useState('');

  const [showStationPicker, setShowStationPicker] = useState(false);
  const [showTechPicker,    setShowTechPicker]    = useState(false);
  const [sending,           setSending]           = useState(false);

  // ── Veri yükle ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const labId = profile?.lab_id ?? profile?.id;
    if (!labId) return;
    setLoadingData(true);

    const [stRes, techRes] = await Promise.all([
      supabase
        .from('lab_stations')
        .select('id, name, color, icon, is_critical')
        .eq('lab_profile_id', labId)
        .eq('is_active', true)
        .order('sequence_hint'),
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('user_type', 'lab')
        .in('role', ['technician', 'manager'])
        .order('full_name'),
    ]);

    setStations((stRes.data ?? []) as Station[]);
    setTechnicians((techRes.data ?? []) as Technician[]);
    setLoadingData(false);
  }, [profile?.lab_id, profile?.id]);

  useEffect(() => {
    if (visible) {
      loadData();
      setIslem('');
      setStation(null);
      setTechnician(null);
      setNotes('');
    }
  }, [visible, loadData]);

  function selectStation(st: Station) {
    setStation(st);
    if (!islem) setIslem(st.name);
    setShowStationPicker(false);
  }

  // ── Gönder ────────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!station) { toast.error('Lütfen bir istasyon seçin.'); return; }
    if (!profile) return;
    setSending(true);

    try {
      await supabase
        .from('order_stages')
        .delete()
        .eq('work_order_id', order.id)
        .eq('status', 'bekliyor');

      const { data: stageData, error: stageErr } = await supabase
        .from('order_stages')
        .insert({
          work_order_id:  order.id,
          station_id:     station.id,
          technician_id:  technician?.id ?? null,
          sequence_order: 1,
          is_critical:    station.is_critical,
          status:         'aktif',
          assigned_at:    new Date().toISOString(),
          ...(notes ? { manager_note: notes } : {}),
        })
        .select('id')
        .single();

      if (stageErr) throw stageErr;

      const { error: orderErr } = await supabase
        .from('work_orders')
        .update({
          status:           'asamada',
          current_stage_id: stageData.id,
          ...(notes ? { manager_notes: notes } : {}),
        })
        .eq('id', order.id);

      if (orderErr) throw orderErr;

      await supabase.from('order_events').insert({
        work_order_id: order.id,
        stage_id:      stageData.id,
        event_type:    'teknisyen_atandi',
        actor_id:      profile.id,
        metadata: {
          station_name:    station.name,
          technician_name: technician?.full_name ?? null,
          islem:           islem || station.name,
        },
      });

      toast.success('İş gönderildi ✓');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Bir hata oluştu');
    } finally {
      setSending(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.overlay}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <View style={s.dialog}>

          {/* ── Başlık ── */}
          <View style={s.header}>
            <View style={s.headerIcon}>
              <AppIcon name="play" size={14} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>İşe Başlat</Text>
              <Text style={s.headerSub} numberOfLines={1}>
                #{order.order_number} · {order.work_type}
              </Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <AppIcon name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* ── Gövde ── */}
          {loadingData ? (
            <View style={s.loader}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={s.loaderText}>Yükleniyor…</Text>
            </View>
          ) : (
            <ScrollView
              style={s.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {/* 1 — İşlem */}
              <View style={s.section}>
                <View style={s.sectionLabelRow}>
                  <View style={[s.badge, { backgroundColor: '#EFF6FF' }]}>
                    <Text style={[s.badgeText, { color: '#2563EB' }]}>1</Text>
                  </View>
                  <Text style={s.sectionLabel}>İşlem</Text>
                  <Text style={s.sectionHint}>Yapılacak işin adı</Text>
                </View>

                <TextInput
                  style={s.input}
                  value={islem}
                  onChangeText={setIslem}
                  placeholder="ör. Tarama, Zirkonyum Frezeleme…"
                  placeholderTextColor="#94A3B8"
                  maxLength={80}
                  returnKeyType="next"
                />

                {/* Hızlı öneriler */}
                {stations.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {stations.map(st => (
                        <TouchableOpacity
                          key={st.id}
                          style={[
                            s.chip,
                            islem === st.name && { backgroundColor: st.color + '1A', borderColor: st.color },
                          ]}
                          onPress={() => setIslem(st.name)}
                          activeOpacity={0.75}
                        >
                          <View style={[s.chipDot, { backgroundColor: st.color }]} />
                          <Text style={[
                            s.chipText,
                            islem === st.name && { color: st.color, fontWeight: '700' },
                          ]}>
                            {st.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>

              {/* 2 — İstasyon */}
              <View style={s.section}>
                <View style={s.sectionLabelRow}>
                  <View style={[s.badge, { backgroundColor: '#F0FDF4' }]}>
                    <Text style={[s.badgeText, { color: '#16A34A' }]}>2</Text>
                  </View>
                  <Text style={s.sectionLabel}>İstasyon</Text>
                  <Text style={s.sectionHint}>Hangi istasyona gönderilecek</Text>
                </View>

                <TouchableOpacity
                  style={[s.picker, station && { borderColor: station.color + '80' }]}
                  onPress={() => setShowStationPicker(true)}
                  activeOpacity={0.8}
                >
                  {station ? (
                    <View style={s.pickerInner}>
                      <View style={[s.pickerDot, { backgroundColor: station.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.pickerVal}>{station.name}</Text>
                        {station.is_critical && (
                          <Text style={s.pickerSub}>⚠️ Kritik istasyon — müdür onayı gerekir</Text>
                        )}
                      </View>
                    </View>
                  ) : (
                    <Text style={s.pickerPlaceholder}>İstasyon seç…</Text>
                  )}
                  <AppIcon name="chevron-down" size={15} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* 3 — Teknisyen */}
              <View style={s.section}>
                <View style={s.sectionLabelRow}>
                  <View style={[s.badge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[s.badgeText, { color: '#D97706' }]}>3</Text>
                  </View>
                  <Text style={s.sectionLabel}>Teknisyen</Text>
                  <Text style={s.sectionHint}>İsteğe bağlı</Text>
                </View>

                <TouchableOpacity
                  style={s.picker}
                  onPress={() => setShowTechPicker(true)}
                  activeOpacity={0.8}
                >
                  {technician ? (
                    <View style={s.pickerInner}>
                      <View style={s.avatar}>
                        <Text style={s.avatarText}>
                          {technician.full_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={s.pickerVal}>{technician.full_name}</Text>
                    </View>
                  ) : (
                    <Text style={s.pickerPlaceholder}>Teknisyen seç…</Text>
                  )}
                  <AppIcon name="chevron-down" size={15} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Not */}
              <View style={s.section}>
                <Text style={[s.sectionLabel, { marginBottom: 8 }]}>
                  Not <Text style={s.sectionHint}>(isteğe bağlı)</Text>
                </Text>
                <TextInput
                  style={[s.input, { minHeight: 68, textAlignVertical: 'top' }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Teknisyene özel not…"
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                />
              </View>

              {/* Özet */}
              {(station || technician) && (
                <View style={s.summary}>
                  <Text style={s.summaryTitle}>Özet</Text>
                  <View style={s.summaryRow}>
                    <AppIcon name={'tools' as any} size={12} color="#64748B" />
                    <Text style={s.summaryText}>
                      <Text style={s.summaryBold}>İşlem: </Text>
                      {islem || station?.name || '—'}
                    </Text>
                  </View>
                  {station && (
                    <View style={s.summaryRow}>
                      <View style={[s.summaryDot, { backgroundColor: station.color }]} />
                      <Text style={s.summaryText}>
                        <Text style={s.summaryBold}>İstasyon: </Text>
                        {station.name}
                      </Text>
                    </View>
                  )}
                  {technician && (
                    <View style={s.summaryRow}>
                      <AppIcon name={'account-outline' as any} size={12} color="#64748B" />
                      <Text style={s.summaryText}>
                        <Text style={s.summaryBold}>Teknisyen: </Text>
                        {technician.full_name}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <View style={{ height: 16 }} />
            </ScrollView>
          )}

          {/* ── Footer ── */}
          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={s.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sendBtn, (!station || sending) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!station || sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <AppIcon name="send" size={15} color="#fff" />
                  <Text style={s.sendText}>İşe Gönder</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── İstasyon picker ── */}
      <PickerDialog
        visible={showStationPicker}
        onClose={() => setShowStationPicker(false)}
        title="İstasyon Seç"
        subtitle={stations.length > 0 ? `${stations.length} aktif istasyon` : undefined}
        emptyIcon="sitemap-outline"
        emptyMessage="İstasyon tanımlı değil"
        emptySubMessage={'Ayarlar → İstasyonlar bölümünden\nvarsayılan istasyonları ekleyin.'}
        items={stations}
        renderItem={(st) => (
          <TouchableOpacity
            style={[pi.row, station?.id === st.id && pi.rowActive]}
            onPress={() => selectStation(st)}
            activeOpacity={0.75}
          >
            <View style={[pi.iconWrap, { backgroundColor: st.color + '1A' }]}>
              <AppIcon name={st.icon as any} size={17} color={st.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={pi.name}>{st.name}</Text>
              {st.is_critical && (
                <Text style={pi.critical}>⚠️ Kritik — müdür onayı gerekir</Text>
              )}
            </View>
            {station?.id === st.id && (
              <AppIcon name="check" size={15} color={st.color} />
            )}
          </TouchableOpacity>
        )}
      />

      {/* ── Teknisyen picker ── */}
      <PickerDialog
        visible={showTechPicker}
        onClose={() => setShowTechPicker(false)}
        title="Teknisyen Seç"
        items={[
          { id: '', full_name: 'Atanmadan Gönder', role: null } as Technician,
          ...technicians,
        ]}
        renderItem={(tech) => (
          <TouchableOpacity
            style={[pi.row, technician?.id === tech.id && pi.rowActive]}
            onPress={() => {
              setTechnician(tech.id ? tech : null);
              setShowTechPicker(false);
            }}
            activeOpacity={0.75}
          >
            <View style={[pi.avatar, { backgroundColor: tech.id ? '#2563EB' : '#F1F5F9' }]}>
              <Text style={[pi.avatarText, { color: tech.id ? '#fff' : '#94A3B8' }]}>
                {tech.id ? tech.full_name.charAt(0).toUpperCase() : '—'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={pi.name}>{tech.full_name}</Text>
              {tech.role === 'manager' && (
                <Text style={pi.critical}>Mesul Müdür</Text>
              )}
            </View>
            {technician?.id === tech.id && tech.id && (
              <AppIcon name="check" size={15} color="#2563EB" />
            )}
          </TouchableOpacity>
        )}
      />
    </Modal>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Overlay — merkezlenmiş
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // Ana kart
  dialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 520,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 48,
    elevation: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  headerSub:   { fontSize: 12, color: '#64748B', marginTop: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },

  // Loader
  loader: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 40, gap: 10,
  },
  loaderText: { fontSize: 13, color: '#94A3B8' },

  // Gövde
  body: { paddingHorizontal: 22 },

  // Section
  section: { paddingTop: 18, gap: 8 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  badge: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  sectionHint:  { fontSize: 11, color: '#94A3B8' },

  // Input
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    // @ts-ignore
    outlineStyle: 'none',
  },

  // Chips
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F8FAFC', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  chipDot:  { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 11, fontWeight: '600', color: '#64748B' },

  // Picker
  picker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    paddingHorizontal: 13, paddingVertical: 11,
    gap: 8,
  },
  pickerInner: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  pickerDot:   { width: 10, height: 10, borderRadius: 5 },
  pickerVal:   { fontSize: 14, fontWeight: '600', color: '#0F172A', flex: 1 },
  pickerSub:   { fontSize: 10, color: '#DC2626', marginTop: 1 },
  pickerPlaceholder: { flex: 1, fontSize: 14, color: '#94A3B8' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  // Summary
  summary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    borderLeftWidth: 3, borderLeftColor: '#2563EB',
    padding: 12, gap: 6,
    marginTop: 18,
  },
  summaryTitle: {
    fontSize: 10, fontWeight: '700', color: '#2563EB',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  summaryDot:  { width: 8, height: 8, borderRadius: 4 },
  summaryText: { fontSize: 12, color: '#334155' },
  summaryBold: { fontWeight: '700' },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
  },
  cancelBtn: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#2563EB', borderRadius: 10,
    paddingHorizontal: 22, paddingVertical: 10,
  },
  sendBtnDisabled: { backgroundColor: '#94A3B8' },
  sendText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// Picker dialog içi item stiller
const pi = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  rowActive: { backgroundColor: '#F8FAFC' },
  iconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800' },
  name:     { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  critical: { fontSize: 11, color: '#DC2626', marginTop: 2 },
});
