/**
 * OrderEditSheet — Hekim/Klinik için kapsamlı sipariş DÜZENLEME sayfası (tam ekran modal).
 *
 * Planlama ÖNCESİ (triaged_at IS NULL): kaydet → doğrudan uygulanır (client_update_order RPC).
 * Planlama SONRASI: bu sheet değişiklik-talebi moduna geçer (Faz B) — şimdilik pre-planning.
 *
 * Yeni-sipariş formundaki alanların tamamını düzenler: hasta, iş kalemleri (diş+iş tipi),
 * renk, vaka detayları (teslim tarihi/yöntemi, acil, model), not.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, ScrollView, Pressable, TextInput, Platform, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { X, Save, Trash2, Plus, Send, Info } from 'lucide-react-native';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { ModalCard, MODAL_BACKDROP_COLOR, MODAL_OVERLAY_WEB } from '../../../core/ui/ModalBackdrop';
import { DatePicker } from '../../../core/ui/DatePicker';
import { toast } from '../../../core/ui/Toast';
import { updateOrderClient, updateOrderAdmin, isOrderPrePlanning, fetchOrderItems, type ClientOrderEditItem, type ClientOrderEditFields } from '../api';
import { createChangeRequest } from '../changeRequests';
import type { WorkOrder } from '../types';

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

const GENDERS = [{ v: 'erkek', l: 'Erkek' }, { v: 'kadın', l: 'Kadın' }];
const DELIVERY = [{ v: 'kurye', l: 'Kurye' }, { v: 'kargo', l: 'Kargo' }, { v: 'elden', l: 'Elden' }];

interface ItemRow { name: string; teeth: string; shade: string; price: string; quantity: string; notes: string }

function parseTeeth(s: string): number[] {
  return (s.match(/\d+/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
}

function toItemRows(list: any[]): ItemRow[] {
  return (list ?? []).map((it) => ({
    name: it.name ?? '',
    teeth: (it.tooth_numbers ?? []).join(', '),
    shade: it.shade ?? '',
    price: it.price != null ? String(it.price) : '',
    quantity: it.quantity != null ? String(it.quantity) : '',
    notes: it.notes ?? '',
  }));
}

// ⚠️ Modül seviyesinde tanımlı — bileşen içine gömülmemeli (her tuşta remount → focus kaybı).
function EditField({
  label, value, onChangeText, placeholder, keyboardType, multiline,
}: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'numeric'; multiline?: boolean;
}) {
  const theme = usePanelTheme();
  const ink = theme.accent;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: hexA(ink, 0.6) }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={hexA(ink, 0.35)}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[
          {
            borderWidth: 1, borderColor: hexA(ink, 0.1), borderRadius: 12,
            paddingHorizontal: 13, paddingVertical: 11, fontSize: 13.5, color: ink,
            backgroundColor: '#F6F7F9', minHeight: multiline ? 68 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
        ]}
      />
    </View>
  );
}

function EditSeg({
  label, options, value, onChange,
}: {
  label: string; options: { v: string; l: string }[]; value: string; onChange: (v: string) => void;
}) {
  const theme = usePanelTheme();
  const A = theme.primary;
  const ink = theme.accent;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: hexA(ink, 0.6) }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => {
          const active = value === o.v;
          return (
            <Pressable
              key={o.v}
              onPress={() => onChange(active ? '' : o.v)}
              style={{
                paddingVertical: 8, paddingHorizontal: 15, borderRadius: 999, borderWidth: 1,
                borderColor: active ? A : hexA(ink, 0.14), backgroundColor: active ? hexA(A, 0.1) : 'transparent',
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? A : hexA(ink, 0.6) }}>{o.l}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function OrderEditSheet({
  visible, onClose, order, onSaved, mode = 'auto',
}: {
  visible: boolean;
  onClose: () => void;
  order: WorkOrder | null;
  onSaved?: () => void;
  /** 'admin' → gate/talep yok, her aşamada doğrudan uygular (admin/lab). */
  mode?: 'auto' | 'admin';
}) {
  const theme = usePanelTheme();
  const A = theme.primary;
  const ink = theme.accent;
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 768; // masaüstü → ortalı popup · mobil → bottom-sheet
  const todayIso = new Date().toISOString().slice(0, 10); // doğum tarihi max = bugün
  // Piksel maxHeight — ModalBackdrop kapsülü '%' yüksekliği çözmediği için kartı px ile sınırla.
  const cardMaxH = Math.round(height * (isDesktop ? 0.88 : 0.92));

  // ── Prefill ──
  const seed = useMemo(() => {
    const o: any = order ?? {};
    const items: ItemRow[] = (o.order_items ?? []).map((it: any) => ({
      name: it.name ?? '',
      teeth: (it.tooth_numbers ?? []).join(', '),
      shade: it.shade ?? '',
      price: it.price != null ? String(it.price) : '',
      quantity: it.quantity != null ? String(it.quantity) : '',
      notes: it.notes ?? '',
    }));
    if (items.length === 0) {
      items.push({
        name: o.work_type ?? '',
        teeth: (o.tooth_numbers ?? []).join(', '),
        shade: o.shade ?? '',
        price: '',
        quantity: String((o.tooth_numbers ?? []).length || 1),
        notes: '',
      });
    }
    return {
      patient_name: o.patient_name ?? '',
      patient_id: o.patient_id ?? '',
      patient_gender: o.patient_gender && o.patient_gender !== 'belirtilmedi' ? o.patient_gender : '',
      patient_dob: o.patient_dob ?? '',
      patient_nationality: o.patient_nationality ?? '',
      patient_city: o.patient_city ?? '',
      shade: o.shade ?? '',
      delivery_date: o.delivery_date ?? '',
      delivery_method: o.delivery_method ?? '',
      is_urgent: !!o.is_urgent,
      notes: o.notes ?? '',
      items,
    };
  }, [order]);

  const [f, setF] = useState(seed);
  const [items, setItems] = useState<ItemRow[]>(seed.items);
  const [saving, setSaving] = useState(false);

  const isAdmin = mode === 'admin';
  // Planlama başladıysa (ve admin değilse) → doğrudan uygulama yok; değişiklik TALEBİ (lab onayı) modu.
  const requestMode = !isAdmin && !isOrderPrePlanning(order);

  // Modal her açıldığında prefill'i tazele. order_items yüklü değilse (ör. liste
  // ekranından açıldı) DB'den çek — aksi halde kaydetme mevcut kalemleri ezerdi.
  React.useEffect(() => {
    if (!visible) return;
    setF(seed);
    setItems(seed.items);
    if (order?.id && !Array.isArray((order as any).order_items)) {
      let alive = true;
      fetchOrderItems(order.id)
        .then(({ data }: any) => {
          if (!alive) return;
          const rows = toItemRows(data ?? []);
          if (rows.length) setItems(rows);
        })
        .catch(() => {});
      return () => { alive = false; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, order?.id]);

  const set = (k: keyof typeof seed) => (v: any) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (i: number, k: keyof ItemRow) => (v: string) =>
    setItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addItem = () => setItems((p) => [...p, { name: '', teeth: '', shade: '', price: '', quantity: '', notes: '' }]);
  const removeItem = (i: number) => setItems((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  const save = async () => {
    if (!order?.id || saving) return;
    if (f.delivery_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.delivery_date)) {
      toast.error('Teslim tarihi YYYY-AA-GG formatında olmalı.');
      return;
    }
    if (f.patient_dob && !/^\d{4}-\d{2}-\d{2}$/.test(f.patient_dob)) {
      toast.error('Doğum tarihi YYYY-AA-GG formatında olmalı.');
      return;
    }
    const cleanItems: ClientOrderEditItem[] = items
      .filter((r) => r.name.trim())
      .map((r) => {
        const teeth = parseTeeth(r.teeth);
        const noteBits = [r.shade.trim() ? `Renk: ${r.shade.trim()}` : '', r.notes.trim()].filter(Boolean);
        return {
          name: r.name.trim(),
          price: Number(r.price) || 0,
          quantity: Number(r.quantity) || teeth.length || 1,
          tooth_numbers: teeth,
          notes: noteBits.join(' · ') || null,
        };
      });
    if (cleanItems.length === 0) {
      toast.error('En az bir iş kalemi (iş tipi) gerekli.');
      return;
    }
    const allTeeth = Array.from(new Set(cleanItems.flatMap((it) => it.tooth_numbers ?? []))).sort((a, b) => a - b);
    const workType = Array.from(new Set(cleanItems.map((it) => it.name))).join(', ');

    const fields: ClientOrderEditFields = {
      patient_name: f.patient_name.trim() || null,
      patient_id: f.patient_id.trim() || null,
      patient_gender: f.patient_gender || null,
      patient_dob: f.patient_dob.trim() || null,
      patient_nationality: f.patient_nationality.trim() || null,
      patient_city: f.patient_city.trim() || null,
      shade: f.shade.trim() || null,
      delivery_date: f.delivery_date || null,
      delivery_method: f.delivery_method || null,
      is_urgent: f.is_urgent,
      notes: f.notes.trim() || null,
      work_type: workType,
      tooth_numbers: allTeeth,
    };

    setSaving(true);
    const { error } = isAdmin
      ? await updateOrderAdmin(order.id, fields, cleanItems)
      : requestMode
        ? await createChangeRequest(order.id, fields, cleanItems)
        : await updateOrderClient(order.id, fields, cleanItems);
    setSaving(false);
    if (error) {
      toast.error(`${requestMode ? 'Talep gönderilemedi' : 'Kaydedilemedi'}: ${(error as any).message ?? 'hata'}`);
      return;
    }
    toast.success(requestMode ? 'Değişiklik talebin gönderildi — lab onayına düştü.' : 'Sipariş güncellendi ✓');
    onSaved?.();
    onClose();
  };

  return (
    <Modal visible={visible} animationType={isDesktop ? 'fade' : 'slide'} transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: MODAL_BACKDROP_COLOR, alignItems: 'center', justifyContent: isDesktop ? 'center' : 'flex-end', padding: isDesktop ? 24 : 0, ...MODAL_OVERLAY_WEB }}
      >
        <ModalCard
          maxWidth={isDesktop ? 940 : 560}
          maxHeight={cardMaxH}
          style={{ backgroundColor: '#FFFFFF', ...(isDesktop ? {} : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }) }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: hexA(ink, 0.08), backgroundColor: theme.surface }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: ink }}>{requestMode ? 'Değişiklik talebi' : isAdmin ? 'Siparişi düzenle · Yönetici' : 'Siparişi düzenle'}</Text>
              <Text style={{ fontSize: 11.5, color: hexA(ink, 0.5) }}>#{String((order as any)?.order_number ?? '')} · tüm bilgileri güncelleyebilirsin</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
              <X size={20} color={hexA(ink, 0.6)} strokeWidth={1.9} />
            </Pressable>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 18, gap: 18 }} keyboardShouldPersistTaps="handled">
            {/* Planlama sonrası bilgilendirme */}
            {requestMode && (
              <View style={{ flexDirection: 'row', gap: 10, padding: 13, borderRadius: 14, backgroundColor: hexA('#B7791F', 0.1), borderWidth: 1, borderColor: hexA('#B7791F', 0.25) }}>
                <Info size={17} color="#B7791F" strokeWidth={2} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#8A5A0F' }}>Siparişte değişiklik yapmak istiyorsunuz.</Text>
                  <Text style={{ fontSize: 12.5, color: '#8A5A0F', lineHeight: 17 }}>Bu sipariş planlamaya girdiği için değişiklik laboratuvar onayından sonra uygulanacaktır.</Text>
                </View>
              </View>
            )}

            {/* İki sütun (masaüstü): sol Hasta · sağ İş+Vaka */}
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
              {/* SOL — Hasta */}
              <View style={isDesktop ? { flex: 1, gap: 18 } : { width: '100%', gap: 18 }}>
            {/* Hasta */}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: hexA(ink, 0.45) }}>Hasta</Text>
              <EditField label="Ad Soyad" value={f.patient_name} onChangeText={set('patient_name')} placeholder="Hasta adı soyadı" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><EditField label="TC / Pasaport" value={f.patient_id} onChangeText={set('patient_id')} placeholder="—" /></View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: hexA(ink, 0.6) }}>Doğum tarihi</Text>
                  <DatePicker value={f.patient_dob || null} onChange={set('patient_dob')} accent={A} placeholder="Tarih seç" maxDate={todayIso} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><EditField label="Uyruk" value={f.patient_nationality} onChangeText={set('patient_nationality')} placeholder="—" /></View>
                <View style={{ flex: 1 }}><EditSeg label="Cinsiyet" options={GENDERS} value={f.patient_gender} onChange={set('patient_gender')} /></View>
              </View>
            </View>
              {/* SOL sütun kapanış */}
              </View>

              {/* SAĞ — İş kalemleri + Vaka detayları */}
              <View style={isDesktop ? { flex: 1.15, gap: 18 } : { width: '100%', gap: 18 }}>
            {/* İş kalemleri */}
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: hexA(ink, 0.45) }}>İş kalemleri</Text>
                <Pressable onPress={addItem} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: hexA(A, 0.1), ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
                  <Plus size={13} color={A} strokeWidth={2.4} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: A }}>Kalem ekle</Text>
                </Pressable>
              </View>
              {items.map((r, i) => (
                <View key={i} style={{ gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: hexA(ink, 0.1), backgroundColor: theme.surface }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: hexA(ink, 0.55) }}>Kalem {i + 1}</Text>
                    {items.length > 1 && (
                      <Pressable onPress={() => removeItem(i)} hitSlop={6} style={{ padding: 3, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
                        <Trash2 size={15} color="#D94B4B" strokeWidth={1.9} />
                      </Pressable>
                    )}
                  </View>
                  <EditField label="İş tipi" value={r.name} onChangeText={setItem(i, 'name')} placeholder="ör. Zirkonyum Kron" />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1.4 }}><EditField label="Dişler (FDI)" value={r.teeth} onChangeText={setItem(i, 'teeth')} placeholder="11, 21" keyboardType="numeric" /></View>
                    <View style={{ flex: 1 }}><EditField label="Renk" value={r.shade} onChangeText={setItem(i, 'shade')} placeholder="A2" /></View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}><EditField label="Adet" value={r.quantity} onChangeText={setItem(i, 'quantity')} placeholder="1" keyboardType="numeric" /></View>
                    <View style={{ flex: 1 }}><EditField label="Fiyat" value={r.price} onChangeText={setItem(i, 'price')} placeholder="0" keyboardType="numeric" /></View>
                  </View>
                  <EditField label="Kalem notu" value={r.notes} onChangeText={setItem(i, 'notes')} placeholder="İmplant marka/abutment vb." />
                </View>
              ))}
            </View>

            {/* Vaka detayları */}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: hexA(ink, 0.45) }}>Vaka detayları</Text>
              <EditField label="Teslim tarihi (YYYY-AA-GG)" value={f.delivery_date} onChangeText={set('delivery_date')} placeholder="2026-07-20" />
              <EditSeg label="Teslim yöntemi" options={DELIVERY} value={f.delivery_method} onChange={set('delivery_method')} />
              <Pressable onPress={() => set('is_urgent')(!f.is_urgent)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: ink }}>Acil vaka</Text>
                <View style={{ width: 42, height: 25, borderRadius: 999, backgroundColor: f.is_urgent ? A : hexA(ink, 0.2), justifyContent: 'center' }}>
                  <View style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: '#fff', position: 'absolute', top: 3, left: f.is_urgent ? 20 : 3 }} />
                </View>
              </Pressable>
              <EditField label="Not (hekim/lab)" value={f.notes} onChangeText={set('notes')} placeholder="Serbest not…" multiline />
            </View>
              {/* SAĞ sütun kapanış */}
              </View>
            {/* Satır kapanış */}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: hexA(ink, 0.08), backgroundColor: theme.surface }}>
            <Pressable onPress={onClose} disabled={saving} style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: hexA(ink, 0.12), ...(Platform.OS === 'web' && !saving ? ({ cursor: 'pointer' } as any) : {}) }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: hexA(ink, 0.65) }}>Vazgeç</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={{ flex: 1.6, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: saving ? hexA(A, 0.5) : A, ...(Platform.OS === 'web' && !saving ? ({ cursor: 'pointer' } as any) : {}) }}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : requestMode ? <Send size={16} color="#fff" strokeWidth={2.2} /> : <Save size={16} color="#fff" strokeWidth={2.2} />}
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{saving ? (requestMode ? 'Gönderiliyor…' : 'Kaydediliyor…') : (requestMode ? 'Değişiklik Gönder' : 'Kaydet')}</Text>
            </Pressable>
          </View>
        </ModalCard>
      </Pressable>
    </Modal>
  );
}
