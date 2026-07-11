/**
 * Malzeme Talebi — Yeni Talep modal'ı.
 *
 * Adımlar (tek ekran):
 *  1) Başlık + Aciliyet + İhtiyaç tarihi
 *  2) Kalem listesi (katalog autocomplete + serbest metin + miktar + birim)
 *  3) Gerekçe (urgency>=high zorunlu)
 *  4) Submit → RPC create_material_request
 *
 * Manager kendi açtığında otomatik admin onayına gider; teknisyen
 * açtığında müdür onayına düşer. Form bunu bilmek zorunda değil — backend
 * requester role'ünden hesaplar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import {
  X, Wrench, Plus, Trash2, Send, AlertCircle, CheckCircle2, ChevronDown,
  Calendar as CalendarIcon,
} from 'lucide-react-native';

import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { DatePicker } from '../../../core/ui/DatePicker';
import {
  createRequest, fetchCatalog,
  type CatalogItem, type RequestUrgency, type NewRequestItemInput,
} from '../api';
import {
  DISPLAY, TRY, PillButton, makeUrgencyCfg, UNIT_OPTIONS, CATEGORY_LABEL,
} from './atoms';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmitted?: (requestId: string) => void;
};

type DraftItem = NewRequestItemInput & { tempId: string };

const newTempId = () => Math.random().toString(36).slice(2, 9);

const URGENCY_LIST: RequestUrgency[] = ['low', 'normal', 'high', 'critical'];

const todayISO = () => new Date().toISOString().slice(0, 10);

export function NewRequestModal({ visible, onClose, onSubmitted }: Props) {
  const TH = usePanelTheme();
  const T = useMobileTokens();
  const URGENCY_CFG = makeUrgencyCfg(T);

  // Form
  const [title, setTitle]       = useState('');
  const [reason, setReason]     = useState('');
  const [urgency, setUrgency]   = useState<RequestUrgency>('normal');
  const [neededBy, setNeededBy] = useState<string | null>(null);
  const [items, setItems]       = useState<DraftItem[]>([
    { tempId: newTempId(), name: '', unit: 'adet', quantity: 1 },
  ]);

  // Catalog
  const [catalog, setCatalog]   = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);   // request id

  // Reset on open
  useEffect(() => {
    if (!visible) return;
    setTitle(''); setReason(''); setUrgency('normal'); setNeededBy(null);
    setItems([{ tempId: newTempId(), name: '', unit: 'adet', quantity: 1 }]);
    setError(null); setSuccess(null);
    setCatalogLoading(true);
    fetchCatalog({ activeOnly: true })
      .then(setCatalog)
      .catch(() => setCatalog([]))
      .finally(() => setCatalogLoading(false));
  }, [visible]);

  // Hesaplamalar
  const estTotal = useMemo(
    () => items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.est_unit_cost || 0), 0),
    [items],
  );
  const itemCount = items.filter(i => (i.name ?? '').trim() && Number(i.quantity) > 0).length;

  const reasonRequired = urgency === 'high' || urgency === 'critical';
  const canSubmit =
    title.trim().length >= 3 &&
    itemCount > 0 &&
    (!reasonRequired || reason.trim().length >= 4) &&
    !submitting;

  // Item ops
  const updateItem = (tempId: string, patch: Partial<DraftItem>) => {
    setItems(prev => prev.map(i => (i.tempId === tempId ? { ...i, ...patch } : i)));
  };
  const removeItem = (tempId: string) => {
    setItems(prev => prev.length > 1 ? prev.filter(i => i.tempId !== tempId) : prev);
  };
  const addItem = () => {
    setItems(prev => [...prev, { tempId: newTempId(), name: '', unit: 'adet', quantity: 1 }]);
  };

  const applyCatalogItem = (tempId: string, c: CatalogItem) => {
    updateItem(tempId, {
      catalog_id: c.id,
      name: c.name,
      category: c.category,
      unit: c.unit,
      quantity: c.default_qty || 1,
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      const id = await createRequest({
        title: title.trim(),
        items,
        reason: reason.trim() || null,
        urgency,
        needed_by: neededBy,
      });
      setSuccess(id);
      setTimeout(() => {
        onSubmitted?.(id);
        onClose();
      }, 1300);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 640, maxHeight: '92%',
            backgroundColor: T.card, borderRadius: 22, overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(0,0,0,0.30)' } as any : { elevation: 24 }),
          }}
        >
          {/* Header */}
          <View style={{
            paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: T.hairline,
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Wrench size={11} color={T.ink3} />
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3 }}>
                  Malzeme Talebi
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 22, color: T.ink, letterSpacing: -0.5, marginTop: 4 }}>
                Yeni Talep Oluştur
              </Text>
              <Text style={{ fontSize: 12, color: T.ink3, marginTop: 4, lineHeight: 17 }}>
                Talebiniz mesul müdür onayına düşer. Onaylandıktan sonra admin'e iletilir.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <X size={20} color={T.ink3} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 18, gap: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {success ? (
              <View style={{
                padding: 24, alignItems: 'center', gap: 8,
                backgroundColor: 'rgba(45,154,107,0.08)', borderRadius: 16,
                borderWidth: 1, borderColor: 'rgba(45,154,107,0.25)',
              }}>
                <CheckCircle2 size={36} color="#1F6B47" />
                <Text style={{ ...DISPLAY, fontSize: 20, color: T.ink, letterSpacing: -0.3 }}>
                  Talebiniz oluşturuldu
                </Text>
                <Text style={{ fontSize: 12, color: T.ink3, textAlign: 'center', maxWidth: 380 }}>
                  Mesul müdür onayına gönderildi. Süreç takibini "Talepleirim" listesinden yapabilirsiniz.
                </Text>
              </View>
            ) : (
              <>
                {/* Title */}
                <FormSection label="Başlık *">
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    borderWidth: 1, borderColor: title.trim().length >= 3 ? TH.primary : T.hairline,
                    borderRadius: 10, paddingHorizontal: 12,
                    backgroundColor: T.card,
                  }}>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder="Örn: Zirkonyum bloğu + sinterleme krozesi"
                      placeholderTextColor={T.ink3}
                      maxLength={120}
                      style={{
                        flex: 1, fontSize: 14, fontWeight: '500',
                        color: T.ink, paddingVertical: 10,
                        outlineStyle: 'none' as any,
                      }}
                    />
                  </View>
                </FormSection>

                {/* Urgency + Needed by */}
                <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 240, gap: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3 }}>
                      Aciliyet
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4, padding: 3, backgroundColor: T.cardSoft, borderRadius: 10, borderWidth: 1, borderColor: T.hairline }}>
                      {URGENCY_LIST.map(u => {
                        const cfg = URGENCY_CFG[u];
                        const active = urgency === u;
                        const Icon = cfg.icon;
                        return (
                          <Pressable
                            key={u}
                            onPress={() => setUrgency(u)}
                            style={{
                              flex: 1, paddingHorizontal: 6, paddingVertical: 7, borderRadius: 7,
                              backgroundColor: active ? T.card : 'transparent',
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                              ...(active && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : null),
                            }}
                          >
                            <Icon size={10} color={active ? cfg.fg : T.ink3} strokeWidth={2.4} />
                            <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? cfg.fg : T.ink3 }}>
                              {cfg.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <View style={{ flex: 1, minWidth: 200, gap: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3 }}>
                      İhtiyaç Tarihi
                    </Text>
                    <DatePicker
                      value={neededBy}
                      onChange={(iso) => setNeededBy(iso || null)}
                      accent={TH.primary}
                      compact
                      minDate={todayISO()}
                      placeholder="—"
                    />
                  </View>
                </View>

                {/* Items */}
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3 }}>
                      Kalemler ({itemCount})
                    </Text>
                    {estTotal > 0 && (
                      <Text style={{ fontSize: 11, color: T.ink2, fontWeight: '600' }}>
                        Tahmini toplam: {TRY(estTotal)}
                      </Text>
                    )}
                  </View>

                  {items.map((it, idx) => (
                    <ItemRow
                      key={it.tempId}
                      item={it}
                      index={idx + 1}
                      catalog={catalog}
                      catalogLoading={catalogLoading}
                      onChange={(patch) => updateItem(it.tempId, patch)}
                      onPickCatalog={(c) => applyCatalogItem(it.tempId, c)}
                      onRemove={items.length > 1 ? () => removeItem(it.tempId) : undefined}
                    />
                  ))}

                  <Pressable
                    onPress={addItem}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 10, borderRadius: 10,
                      borderWidth: 1, borderColor: T.hairline, borderStyle: 'dashed' as any,
                      backgroundColor: T.cardSoft,
                    }}
                  >
                    <Plus size={13} color={T.ink2} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2 }}>Kalem ekle</Text>
                  </Pressable>
                </View>

                {/* Reason */}
                <FormSection label={reasonRequired ? 'Gerekçe *' : 'Gerekçe (opsiyonel)'}>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder={
                      reasonRequired
                        ? 'Aciliyet sebebi — neden bu kadar acil?'
                        : 'Eklemek istediğiniz açıklama'
                    }
                    placeholderTextColor={T.ink3}
                    multiline
                    maxLength={500}
                    style={{
                      borderWidth: 1,
                      borderColor: reasonRequired && reason.trim().length < 4 ? 'rgba(217,75,75,0.40)' : T.hairline,
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      fontSize: 13, color: T.ink, minHeight: 64,
                      textAlignVertical: 'top',
                      backgroundColor: T.card,
                      outlineStyle: 'none' as any,
                    }}
                  />
                </FormSection>

                {/* Error */}
                {error && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    padding: 10, borderRadius: 10,
                    backgroundColor: 'rgba(217,75,75,0.08)', borderWidth: 1, borderColor: 'rgba(217,75,75,0.25)',
                  }}>
                    <AlertCircle size={14} color="#9C2E2E" />
                    <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E' }}>{error}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Footer */}
          {!success && (
            <View style={{
              paddingHorizontal: 22, paddingVertical: 14,
              borderTopWidth: 1, borderTopColor: T.hairline,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            }}>
              <Text style={{ fontSize: 11, color: T.ink3 }}>
                {itemCount === 0
                  ? 'En az 1 kalem ekleyin'
                  : title.trim().length < 3
                  ? 'Başlık girin (min. 3)'
                  : reasonRequired && reason.trim().length < 4
                  ? 'Yüksek/Kritik talep için gerekçe gerekli'
                  : `${itemCount} kalem hazır`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PillButton variant="ghost" onPress={onClose}>Vazgeç</PillButton>
                <PillButton
                  variant="dark"
                  disabled={!canSubmit}
                  onPress={handleSubmit}
                  leftIcon={submitting
                    ? <ActivityIndicator size="small" color={T.card} />
                    : <Send size={13} color={T.card} />
                  }
                >
                  {submitting ? 'Gönderiliyor…' : 'Talebi Gönder'}
                </PillButton>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ───────── Sub: ItemRow ───────── */

function ItemRow({
  item, index, catalog, catalogLoading, onChange, onPickCatalog, onRemove,
}: {
  item: DraftItem;
  index: number;
  catalog: CatalogItem[];
  catalogLoading: boolean;
  onChange: (patch: Partial<DraftItem>) => void;
  onPickCatalog: (c: CatalogItem) => void;
  onRemove?: () => void;
}) {
  const TH = usePanelTheme();
  const T = useMobileTokens();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unitOpen, setUnitOpen]     = useState(false);

  const suggestions = useMemo(() => {
    const q = (item.name ?? '').trim().toLocaleLowerCase('tr');
    if (!q) return catalog.slice(0, 8);
    return catalog
      .filter(c => c.name.toLocaleLowerCase('tr').includes(q))
      .slice(0, 8);
  }, [catalog, item.name]);

  return (
    <View style={{
      padding: 10, borderRadius: 12,
      borderWidth: 1, borderColor: T.hairline, backgroundColor: T.card,
      gap: 8,
    }}>
      {/* Üst satır: index + remove */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3 }}>
          Kalem #{index}
          {item.catalog_id && <Text style={{ color: TH.primary }}>  · katalogdan</Text>}
        </Text>
        {onRemove && (
          <Pressable onPress={onRemove} hitSlop={6}>
            <Trash2 size={13} color="#9C2E2E" />
          </Pressable>
        )}
      </View>

      {/* Ad — autocomplete */}
      <View style={{ position: 'relative', zIndex: pickerOpen ? 100 : 1 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          borderWidth: 1, borderColor: T.hairline, borderRadius: 8, paddingHorizontal: 10,
          backgroundColor: T.card,
        }}>
          <TextInput
            value={item.name}
            onChangeText={(v) => { onChange({ name: v, catalog_id: null }); setPickerOpen(true); }}
            onFocus={() => setPickerOpen(true)}
            placeholder="Malzeme adı (yazın veya seçin)"
            placeholderTextColor={T.ink3}
            style={{
              flex: 1, fontSize: 13, color: T.ink, paddingVertical: 8,
              outlineStyle: 'none' as any,
            }}
          />
          <Pressable onPress={() => setPickerOpen(o => !o)} hitSlop={6}>
            <ChevronDown size={13} color={T.ink3} />
          </Pressable>
        </View>

        {pickerOpen && (
          <View style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 100,
            backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, borderRadius: 10,
            maxHeight: 200, overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.18)' } as any : { elevation: 12 }),
          }}>
            <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
              {catalogLoading ? (
                <View style={{ padding: 14 }}>
                  <Text style={{ fontSize: 11, color: T.ink3 }}>Katalog yükleniyor…</Text>
                </View>
              ) : suggestions.length === 0 ? (
                <View style={{ padding: 14 }}>
                  <Text style={{ fontSize: 11, color: T.ink3 }}>
                    Katalogta eşleşme yok — yukarıda yazdığınız metin gönderilecek.
                  </Text>
                </View>
              ) : suggestions.map((c, i) => (
                <Pressable
                  key={c.id}
                  onPress={() => { onPickCatalog(c); setPickerOpen(false); }}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 9,
                    borderBottomWidth: i < suggestions.length - 1 ? 1 : 0,
                    borderBottomColor: T.hairline,
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: T.ink, fontWeight: '500' }} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>
                      {CATEGORY_LABEL[c.category] ?? c.category} · {c.default_qty} {c.unit}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Miktar + Birim + Tahmini fiyat */}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {/* Quantity */}
        <View style={{ flex: 1, minWidth: 90 }}>
          <Text style={{ fontSize: 9, fontWeight: '600', color: T.ink3, marginBottom: 2 }}>MİKTAR</Text>
          <TextInput
            value={String(item.quantity ?? '')}
            onChangeText={(v) => onChange({ quantity: Number(v.replace(',', '.')) || 0 })}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={T.ink3}
            style={{
              borderWidth: 1, borderColor: T.hairline, borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 8,
              fontSize: 13, color: T.ink,
              outlineStyle: 'none' as any,
            }}
          />
        </View>

        {/* Unit */}
        <View style={{ flex: 1, minWidth: 100, position: 'relative', zIndex: unitOpen ? 50 : 1 }}>
          <Text style={{ fontSize: 9, fontWeight: '600', color: T.ink3, marginBottom: 2 }}>BİRİM</Text>
          <Pressable
            onPress={() => setUnitOpen(o => !o)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              borderWidth: 1, borderColor: T.hairline, borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 8,
              backgroundColor: T.card,
            }}
          >
            <Text style={{ flex: 1, fontSize: 13, color: T.ink }}>{item.unit || 'adet'}</Text>
            <ChevronDown size={11} color={T.ink3} />
          </Pressable>
          {unitOpen && (
            <View style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2,
              backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, borderRadius: 8,
              zIndex: 50, maxHeight: 200, overflow: 'hidden',
              ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any : { elevation: 8 }),
            }}>
              <ScrollView style={{ maxHeight: 200 }}>
                {UNIT_OPTIONS.map((u, i) => (
                  <Pressable
                    key={u}
                    onPress={() => { onChange({ unit: u }); setUnitOpen(false); }}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 7,
                      borderBottomWidth: i < UNIT_OPTIONS.length - 1 ? 1 : 0,
                      borderBottomColor: T.hairline,
                      backgroundColor: u === item.unit ? TH.bgSoft : T.card,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: u === item.unit ? TH.primary : T.ink2 }}>
                      {u}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Est cost */}
        <View style={{ flex: 1.4, minWidth: 130 }}>
          <Text style={{ fontSize: 9, fontWeight: '600', color: T.ink3, marginBottom: 2 }}>TAHMİNİ ₺/BR (OPS.)</Text>
          <TextInput
            value={item.est_unit_cost != null ? String(item.est_unit_cost) : ''}
            onChangeText={(v) => onChange({ est_unit_cost: v.trim() ? Number(v.replace(',', '.')) || null : null })}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor={T.ink3}
            style={{
              borderWidth: 1, borderColor: T.hairline, borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 8,
              fontSize: 13, color: T.ink,
              outlineStyle: 'none' as any,
            }}
          />
        </View>
      </View>
    </View>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  const T = useMobileTokens();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
