/**
 * GlobalSupportTrigger — root layout'ta tek instance.
 * useSupportStore'u dinler, modal açar, context'i NewTicketModal'a pre-fill eder.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Platform,
} from 'react-native';
import {
  X, Send, MessageCirclePlus,
  Bug, FileWarning, Cog, Truck, Receipt, Plug, GraduationCap, ShieldAlert,
  Layers, AlertCircle, Briefcase,
} from 'lucide-react-native';
import { useSupportStore } from '../../../core/store/supportStore';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { createTicket } from '../api';
import { SupportDropdown } from './SupportDropdown';
import {
  CATEGORY_LABELS, PRIORITY_LABELS,
  PRIORITY_COLORS,
  type SupportCategory, type SupportPriority,
} from '../types';

const W = {
  bg: '#F4F0EB', surface: '#FFFFFF',
  inkStrong: '#0F172A', ink: '#1F2937', inkMute: '#475569', inkSoft: '#94A3B8',
  border: 'rgba(15,23,42,0.08)', borderSoft: 'rgba(15,23,42,0.05)',
  orange: '#C2410C', orangeSoft: 'rgba(194,65,12,0.10)',
};

const CATEGORY_ICONS: Record<SupportCategory, any> = {
  teknik_sorun:    Bug,
  stl_dosya:       FileWarning,
  uretim_sureci:   Cog,
  kargo_teslimat:  Truck,
  faturalama:      Receipt,
  entegrasyon:     Plug,
  ozellik_egitim:  GraduationCap,
  yazilim_hatasi:  ShieldAlert,
};

export function GlobalSupportTrigger() {
  const isOpen = useSupportStore(s => s.isOpen);
  const payload = useSupportStore(s => s.payload);
  const close = useSupportStore(s => s.close);
  const { profile } = useAuthStore();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('teknik_sorun');
  const [priority, setPriority] = useState<SupportPriority>('normal');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  // Payload geldiğinde alanları pre-fill et
  useEffect(() => {
    if (!isOpen) return;
    if (payload?.subjectHint) setSubject(payload.subjectHint);
    else if (payload?.context?.order_number) {
      setSubject(`Vaka #${payload.context.order_number} — `);
    } else {
      setSubject('');
    }
    if (payload?.category) setCategory(payload.category);
    if (payload?.priority) setPriority(payload.priority);
    setBody('');
  }, [isOpen, payload]);

  if (!isOpen) return null;

  const ctx = payload?.context ?? {};
  const ctxRows: { label: string; value: string }[] = [];
  if (ctx.order_number)  ctxRows.push({ label: 'Vaka',     value: `#${ctx.order_number}` });
  if (ctx.patient_name)  ctxRows.push({ label: 'Hasta',    value: ctx.patient_name });
  if (ctx.doctor_name)   ctxRows.push({ label: 'Hekim',    value: ctx.doctor_name });
  if (ctx.stage_label || ctx.stage_key) ctxRows.push({ label: 'Aşama', value: ctx.stage_label ?? ctx.stage_key ?? '' });
  if (ctx.last_action)   ctxRows.push({ label: 'Eylem',    value: ctx.last_action });
  if (ctx.error_code)    ctxRows.push({ label: 'Hata',     value: ctx.error_code });

  const handleSubmit = async () => {
    if (!subject.trim()) { toast.error('Başlık zorunlu.'); return; }
    if (!body.trim())    { toast.error('Açıklama zorunlu.'); return; }
    setSaving(true);
    try {
      const { data, error } = await createTicket({
        subject, category, priority, body,
        context: ctx,
        work_order_id: payload?.workOrderId ?? (ctx.order_id as string | undefined) ?? null,
        stage_key:     payload?.stageKey ?? ctx.stage_key ?? null,
        error_code:    payload?.errorCode ?? ctx.error_code ?? null,
        lab_id:        (profile as any)?.lab_id ?? null,
      });
      if (error || !data) throw error;
      toast.success('Destek talebi açıldı — ekibe ulaştı.');
      close();
    } catch (e: any) {
      toast.error(e?.message ?? 'Talep oluşturulamadı');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: 600, maxWidth: '100%', maxHeight: '92%', backgroundColor: W.surface, borderRadius: 18, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: W.border, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                {ctx.source && ctx.source !== 'manual' && (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, backgroundColor: W.orangeSoft }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '800', color: W.orange, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      Otomatik Bağlam
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: W.inkStrong }}>Yeni Destek Talebi</Text>
              <Text style={{ fontSize: 12, color: W.inkMute, marginTop: 3 }}>
                Üretim ekibimiz vakayı seninle birlikte çözer.
              </Text>
            </View>
            <Pressable onPress={close} hitSlop={8} style={{ padding: 4 }}>
              <X size={18} color={W.inkMute} strokeWidth={1.6} />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 18 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            {/* Auto-context preview */}
            {ctxRows.length > 0 && (
              <View style={{
                marginBottom: 14,
                padding: 12, borderRadius: 12,
                borderWidth: 1, borderColor: W.orange,
                backgroundColor: W.orangeSoft,
                gap: 6,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Briefcase size={11} color={W.orange} strokeWidth={2} />
                  <Text style={{ fontSize: 9.5, fontWeight: '800', color: W.orange, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Talebe Otomatik Eklenecek
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                  {ctxRows.map((r, i) => (
                    <View key={i} style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, backgroundColor: W.surface, borderWidth: 1, borderColor: 'rgba(194,65,12,0.20)' }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '800', color: W.inkSoft, letterSpacing: 0.4, textTransform: 'uppercase' }}>{r.label}</Text>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: W.inkStrong, marginTop: 1 }}>{r.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Text style={fieldLabel}>Başlık</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Sorunu kısaca özetle"
              placeholderTextColor={W.inkSoft}
              style={fieldInput as any}
            />

            <View style={{ height: 14 }} />
            <Text style={fieldLabel}>Kategori</Text>
            <SupportDropdown
              value={category}
              onChange={(v) => setCategory(v as SupportCategory)}
              options={(Object.keys(CATEGORY_LABELS) as SupportCategory[]).map(k => ({
                value: k, label: CATEGORY_LABELS[k], icon: CATEGORY_ICONS[k],
              }))}
            />

            <View style={{ height: 14 }} />
            <Text style={fieldLabel}>Öncelik</Text>
            <SupportDropdown
              value={priority}
              onChange={(v) => setPriority(v as SupportPriority)}
              options={(['dusuk','normal','yuksek','kritik','acil_mudahale'] as SupportPriority[]).map(k => ({
                value: k, label: PRIORITY_LABELS[k], colorDot: PRIORITY_COLORS[k].fg,
              }))}
            />

            <View style={{ height: 14 }} />
            <Text style={fieldLabel}>Açıklama</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Adım adım anlat — ne yaptın, ne bekledin, ne oldu? Hata mesajı varsa kopyala."
              placeholderTextColor={W.inkSoft}
              multiline
              style={[fieldInput, { minHeight: 140, textAlignVertical: 'top' }] as any}
            />
            {ctx.error_message && (
              <View style={{ marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: W.orangeSoft, borderLeftWidth: 3, borderLeftColor: W.orange }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <AlertCircle size={10} color={W.orange} strokeWidth={2} />
                  <Text style={{ fontSize: 9.5, fontWeight: '800', color: W.orange, letterSpacing: 0.5, textTransform: 'uppercase' }}>Yakalanan Hata</Text>
                </View>
                <Text style={{ fontSize: 11, color: W.ink, lineHeight: 15, fontFamily: Platform.select({ web: 'SF Mono, Menlo, monospace', default: 'monospace' }) }}>
                  {ctx.error_message}
                </Text>
              </View>
            )}
            <View style={{ height: 4 }} />
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: W.border }}>
            <Pressable onPress={close} style={({ hovered }: any) => ({
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
              backgroundColor: hovered ? W.bg : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: W.inkMute }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: saving ? W.inkSoft : (hovered ? W.ink : W.inkStrong),
                ...(Platform.OS === 'web' && !saving ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <MessageCirclePlus size={14} color="#FFF" strokeWidth={1.8} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>
                {saving ? 'Gönderiliyor…' : 'Talep Aç'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const fieldLabel: any = {
  fontSize: 11, fontWeight: '800', color: W.inkSoft,
  letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
};
const fieldInput: any = {
  paddingHorizontal: 12, paddingVertical: 10,
  borderRadius: 10, borderWidth: 1, borderColor: W.border,
  backgroundColor: W.surface,
  fontSize: 13.5, color: W.ink,
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
};
