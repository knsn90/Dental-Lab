/**
 * MaterialConfirmModal — Aşama tamamlama akışında malzeme onayı.
 * Patterns §13 design: 44×44 avatar + eyebrow + Display 300 + cream footer.
 *
 * Akış:
 *   1. useStageMaterialEstimate ile auto-estimated lines yüklenir
 *   2. Modal açılır → operatör miktarları düzeltir, fire ekler, satır ekler
 *   3. "Onayla & İlerlet" → confirm_stage_materials RPC
 *   4. Stage tamamlanır + sıradaki aktif olur
 *
 * Eğer station.consumes_materials = false ise modal hiç açılmaz —
 * caller direkt stage advance eder.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, Platform, Modal, TextInput, ScrollView, } from 'react-native';
import {
  X, Box, Plus, Minus, Trash2, AlertCircle, AlertTriangle,
  Check, Flame, Package, Search, ChevronDown, PlusCircle, Layers, SkipForward,
} from 'lucide-react-native';
import { useStageMaterialEstimate } from '../hooks/useStageMaterialEstimate';
import type { EstimatedMaterialLine } from '../../../core/materials/estimation';
import { createStockItem } from '../api';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';

/** Para birimi sembolü (₺/€/$/£) — bilinmeyende kod döner */
function sym(ccy: string | null | undefined): string {
  const c = (ccy || 'TRY') as Currency;
  return CURRENCY_META[c]?.symbol ?? (ccy || '₺');
}

/** Picker'da gösterilen stok kalemi (labın tüm aktif kalemleri) */
type StockPick = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  quantity: number;
  unit_cost: number | null;
  pack_size: number | null;
  content_unit: string | null;
  currency: string | null;
  usable_stages: string[] | null;
};

// ── Tokens ───────────────────────────────────────────────────────────
const DisplayFont =
  Platform.OS === 'web'
    ? 'Inter Tight, Inter, system-ui, sans-serif'
    : 'InterTight_300Light';

const INK = {
  900: '#0A0A0A', 700: '#3C3C3C', 500: '#6B6B6B',
  400: '#9A9A9A', 300: '#C8C8C8', 100: '#EFECE5',
} as const;
const CREAM = '#FBF9F4';

function tint(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return `rgba(10,10,10,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Ondalık miktar girişi. Kontrollü `value={String(num)}` + her tuşta parseFloat
 * yaklaşımı "3." ara metnini tutamıyordu (parseFloat("3.")=3 → nokta silinir →
 * "3.4" yazılamıyor). Burada yerel metin state'i tutulur: yazarken serbest,
 * odak dışında prop'tan (stepper) senkronlanır.
 */
function DecimalInput({
  value, onChangeNum, style, min = 0,
}: {
  value: number;
  onChangeNum: (n: number) => void;
  style?: any;
  min?: number;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  // Odak dışındayken dış değeri yansıt (± stepper, reset). Yazarken dokunma.
  useEffect(() => { if (!focused) setText(String(value)); }, [value, focused]);
  return (
    <TextInput
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const v = parseFloat(text.replace(',', '.'));
        const n = isFinite(v) && v >= min ? v : min;
        setText(String(n));
        onChangeNum(n);
      }}
      onChangeText={(t) => {
        // yalnız rakam + tek ondalık ayracı; ara "3." / "3," korunur
        const cleaned = t.replace(/[^0-9.,]/g, '');
        setText(cleaned);
        const v = parseFloat(cleaned.replace(',', '.'));
        if (isFinite(v) && v >= min) onChangeNum(v);
      }}
      keyboardType="decimal-pad"
      style={style}
    />
  );
}

// Stok seviyesi → renk (yeşil/sarı/kırmızı)
function stockTone(current: number | null, needed: number): { bg: string; fg: string; label: string } {
  if (current == null) return { bg: 'rgba(10,10,10,0.05)', fg: INK[500], label: 'Stok seç' };
  if (current <= 0) return { bg: 'rgba(220,38,38,0.10)', fg: '#9C2E2E', label: 'Tükenmiş' };
  if (current < needed) return { bg: 'rgba(220,38,38,0.10)', fg: '#9C2E2E', label: 'Yetersiz' };
  if (current < needed * 2) return { bg: 'rgba(217,119,6,0.10)', fg: '#9C5E0E', label: 'Az' };
  return { bg: 'rgba(45,154,107,0.10)', fg: '#1F6B47', label: 'Yeterli' };
}

// ── Props ────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  stageId: string | null;
  accentColor?: string;
  onClose: () => void;
  /** confirm sonrası — caller refetch yapar */
  onConfirmed: () => void;
}

// ── Component ────────────────────────────────────────────────────────
export function MaterialConfirmModal({
  visible, stageId, accentColor = '#0A0A0A', onClose, onConfirmed,
}: Props) {
  const {
    state, lines, context, totalCost, invalidCount,
    setLine, addLine, removeLine, confirm,
  } = useStageMaterialEstimate(visible ? stageId : null);

  // Maliyet/finans alanları yalnız admin/manager için
  const me = useAuthStore(s => s.profile);
  const showFinance =
    me?.user_type === 'admin'
    || (me?.user_type === 'lab' && (me as any)?.role && ['manager','admin'].includes((me as any).role));

  // ── Stok picker ──────────────────────────────────────────────────────
  const labId = context?.order.lab_id ?? null;
  // Labın tüm aktif stok kalemleri — picker kaynağı. Yeni oluşturulanlar
  // (createStockItem) buraya eklenir ki sonraki satırlarda da görünsün.
  const [stockItems, setStockItems] = useState<StockPick[]>([]);
  useEffect(() => {
    setStockItems((context?.allStockItems as StockPick[]) ?? []);
  }, [context?.allStockItems]);

  // Hangi satır için picker açık (index) — null = kapalı
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  // Picker'dan bir stok kalemi seçildi → satıra bağla (item_id dolar → onayda düşer)
  const applyPick = (idx: number, item: StockPick) => {
    const packaged = !!item.pack_size && item.pack_size > 0;
    setLine(idx, {
      item_id: item.id,
      item_name: item.name,
      category: item.category,
      // Paketli kalemde tüketim içerik biriminde (gr) girilir
      unit: packaged ? (item.content_unit ?? item.unit) : item.unit,
      unit_cost: item.unit_cost ?? 0,
      current_stock: item.quantity,
      pack_size: item.pack_size ?? null,
      content_unit: item.content_unit ?? null,
      stock_unit: item.unit ?? null,
      currency: item.currency ?? null,
    });
    setPickerFor(null);
  };

  // Yeni oluşturulan kalemi listeye ekle + satıra bağla
  const handleCreated = (idx: number, item: StockPick) => {
    setStockItems(prev => [...prev, item].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
    applyPick(idx, item);
  };

  // Toplam maliyet — para birimine göre gruplu (EUR kalem + TRY kalem karışık
  // olabilir; naif toplama yanlış olur). Paketli satırda birim maliyet = unit_cost/pack_size.
  const totalsLabel = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      const qty = (l.actual_qty || 0) + (l.waste_qty || 0);
      if (qty <= 0) continue;
      const per = (l.pack_size && l.pack_size > 0) ? (l.unit_cost / l.pack_size) : l.unit_cost;
      const ccy = l.currency || 'TRY';
      m.set(ccy, (m.get(ccy) || 0) + qty * per);
    }
    if (m.size === 0) return `0.00 ${sym('TRY')}`;
    return Array.from(m.entries()).map(([c, v]) => `${v.toFixed(2)} ${sym(c)}`).join(' · ');
  }, [lines]);

  // confirmed → onConfirmed
  useEffect(() => {
    if (state.phase === 'done') {
      onConfirmed();
    }
  }, [state.phase, onConfirmed]);

  const isLoading = state.phase === 'loading';
  const isSaving  = state.phase === 'saving';
  const errorMsg  = state.phase === 'error' ? state.error : null;

  const toothCount = context?.order.tooth_numbers?.length ?? 0;
  const stationName = context?.station.name ?? '—';

  // Stoğa bağlanmamış (item_id'siz) ama miktarı olan satırlar → onayda
  // RPC tarafından sessizce atlanır (stok düşmez). Bunları engelle: kullanıcı
  // ya "Stoktan seç" ile bağlar ya da satırı siler.
  const unlinkedWithQty = lines.filter(l => !l.item_id && (l.actual_qty > 0 || l.waste_qty > 0)).length;
  const hasLinkedQty    = lines.some(l => l.item_id && (l.actual_qty > 0 || l.waste_qty > 0));
  const nothingEntered  = !lines.some(l => l.actual_qty > 0 || l.waste_qty > 0);
  const canConfirm =
    !isSaving && !isLoading && state.phase !== 'error' &&
    unlinkedWithQty === 0 &&
    (hasLinkedQty || nothingEntered);

  // "Bu aşamada malzeme kullanılmadı" → aşamayı boş ilerlet + best-effort not düş.
  const confirmNoMaterial = () => {
    try {
      Promise.resolve(
        supabase.rpc('log_activity', {
          p_action: 'materials_none',
          p_entity_type: 'order_stage',
          p_entity_id: stageId,
          p_entity_label: `${stationName} · malzeme kullanılmadı`,
          p_metadata: { stage: stationName },
          p_lab_id: labId,
          p_actor_id: null,
        } as any),
      ).catch(() => {});
    } catch { /* noop — not düşme başarısız olsa da ilerlet */ }
    confirm({ advanceStage: true });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 24, width: 720, maxWidth: '100%', maxHeight: '94%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          {/* ═════ HEADER ═════ */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18, gap: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: tint(accentColor, 0.12),
                borderWidth: 1, borderColor: tint(accentColor, 0.20),
              }}>
                <Package size={20} color={accentColor} strokeWidth={1.7} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Malzeme Onayı · {stationName}
                </Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 26, letterSpacing: -0.6, color: INK[900], lineHeight: 32, marginTop: 2 }}>
                  Kullanılan Malzemeler
                </Text>
                <Text style={{ fontSize: 12, color: INK[500], marginTop: 4 }}>
                  {toothCount} diş{showFinance ? ` · Tahmini ~${totalsLabel}` : ''}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              disabled={isSaving}
              style={{
                width: 36, height: 36, borderRadius: 12,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                ...(Platform.OS === 'web' ? { cursor: isSaving ? 'not-allowed' : 'pointer' } as any : {}),
              }}
            >
              <X size={15} color={INK[500]} strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginHorizontal: 28 }} />

          {/* ═════ BODY ═════ */}
          {isLoading ? (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
              <ActivityIndicator color={accentColor} />
              <Text style={{ fontSize: 12, color: INK[400], marginTop: 12 }}>Tahmin yükleniyor…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: 22 }}>
              {/* Section eyebrow */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Box size={13} color={accentColor} strokeWidth={1.8} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Hammadde & Tüketim
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 11, color: INK[500] }}>
                  {lines.length} satır
                </Text>
              </View>

              {/* Lines */}
              {lines.length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: 'center', backgroundColor: CREAM, borderRadius: 14, gap: 8 }}>
                  <Package size={28} color={INK[400]} strokeWidth={1.5} />
                  <Text style={{ fontSize: 12, color: INK[500] }}>
                    Bu aşama için tahmini malzeme yok
                  </Text>
                  <Text style={{ fontSize: 11, color: INK[400] }}>
                    Manuel olarak satır ekleyin veya boş bırakıp ilerletin
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {lines.map((line, idx) => (
                    <LineCard
                      key={idx}
                      line={line}
                      accentColor={accentColor}
                      onChange={(patch) => setLine(idx, patch)}
                      onRemove={() => removeLine(idx)}
                      onOpenPicker={() => setPickerFor(idx)}
                      showFinance={showFinance}
                    />
                  ))}
                </View>
              )}

              {/* Add line button */}
              <Pressable
                onPress={addLine}
                style={{
                  marginTop: 12,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 12, borderRadius: 12,
                  borderWidth: 1, borderStyle: 'dashed',
                  borderColor: 'rgba(0,0,0,0.18)',
                  backgroundColor: '#FFFFFF',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <Plus size={14} color={INK[500]} strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: INK[700] }}>
                  Yeni satır ekle
                </Text>
              </Pressable>

              {/* Error */}
              {errorMsg && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  padding: 12, marginTop: 14,
                  backgroundColor: 'rgba(156,46,46,0.06)',
                  borderRadius: 12,
                  borderWidth: 1, borderColor: 'rgba(156,46,46,0.18)',
                }}>
                  <AlertCircle size={14} color="#9C2E2E" strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>{errorMsg}</Text>
                </View>
              )}

              {invalidCount > 0 && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  padding: 12, marginTop: 10,
                  backgroundColor: 'rgba(217,119,6,0.06)',
                  borderRadius: 12,
                  borderWidth: 1, borderColor: 'rgba(217,119,6,0.20)',
                }}>
                  <AlertTriangle size={14} color="#9C5E0E" strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#9C5E0E', fontWeight: '500' }}>
                    {invalidCount} satır eksik (isim veya miktar). Onaylamadan önce düzelt.
                  </Text>
                </View>
              )}

              {unlinkedWithQty > 0 && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  padding: 12, marginTop: 10,
                  backgroundColor: 'rgba(217,119,6,0.06)',
                  borderRadius: 12,
                  borderWidth: 1, borderColor: 'rgba(217,119,6,0.20)',
                }}>
                  <AlertTriangle size={14} color="#9C5E0E" strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#9C5E0E', fontWeight: '500' }}>
                    {unlinkedWithQty} satır stok kalemine bağlı değil — "Stoktan seç" ile bağla,
                    yoksa stoktan düşmez.
                  </Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* ═════ FOOTER (cream Patterns §13) ═════ */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
            backgroundColor: CREAM,
          }}>
            <View style={{ flex: 1 }}>
              {showFinance ? (
                <>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    Toplam
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: INK[900], fontFamily: DisplayFont }}>
                    {totalsLabel}
                  </Text>
                </>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              disabled={isSaving}
              style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                opacity: isSaving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: isSaving ? 'not-allowed' : 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: INK[700] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={() => (nothingEntered ? confirmNoMaterial() : confirm({ advanceStage: true }))}
              disabled={!canConfirm}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: nothingEntered ? '#FFFFFF' : accentColor,
                borderWidth: nothingEntered ? 1 : 0,
                borderColor: nothingEntered ? 'rgba(0,0,0,0.14)' : 'transparent',
                opacity: canConfirm ? 1 : 0.45,
                ...(Platform.OS === 'web' ? {
                  cursor: !canConfirm ? 'not-allowed' : isSaving ? 'wait' : 'pointer',
                  boxShadow: canConfirm && !nothingEntered ? `0 8px 24px ${tint(accentColor, 0.45)}` : 'none',
                } as any : {}),
              }}
            >
              {nothingEntered
                ? <SkipForward size={14} color={INK[700]} strokeWidth={2.2} />
                : <Check size={14} color="#FFF" strokeWidth={2.4} />}
              <Text style={{ fontSize: 13, fontWeight: '600', color: nothingEntered ? INK[700] : '#FFF', letterSpacing: 0.2 }}>
                {isSaving
                  ? 'Onaylanıyor…'
                  : nothingEntered ? 'Malzeme kullanılmadı · İlerlet' : 'Onayla & İlerlet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ═════ STOK SEÇİCİ (nested) ═════ */}
      <StockPickerModal
        visible={pickerFor !== null}
        items={stockItems}
        accentColor={accentColor}
        labId={labId}
        showFinance={showFinance}
        stationName={context?.station.name ?? ''}
        stationCategories={((context?.station as any)?.allowed_material_types as string[]) ?? []}
        initialCategory={pickerFor !== null ? (lines[pickerFor]?.category ?? null) : null}
        onClose={() => setPickerFor(null)}
        onPick={(item) => { if (pickerFor !== null) applyPick(pickerFor, item); }}
        onCreated={(item) => { if (pickerFor !== null) handleCreated(pickerFor, item); }}
      />
    </Modal>
  );
}

// ── LineCard subcomponent ────────────────────────────────────────────
function LineCard({
  line, accentColor, onChange, onRemove, onOpenPicker, showFinance = true,
}: {
  line: EstimatedMaterialLine;
  accentColor: string;
  onChange: (patch: Partial<EstimatedMaterialLine>) => void;
  onRemove: () => void;
  onOpenPicker: () => void;
  showFinance?: boolean;
}) {
  const [wasteOpen, setWasteOpen] = useState(line.waste_qty > 0);
  const stock = stockTone(line.current_stock, line.actual_qty);
  const totalQty = line.actual_qty + line.waste_qty;

  // Paketli kalem: birim maliyet içerik birimi başına (unit_cost ÷ pack_size);
  // stoktan kesirli adet (qty ÷ pack_size) düşer.
  const packaged = !!line.pack_size && line.pack_size > 0;
  const perUnit = packaged ? line.unit_cost / (line.pack_size as number) : line.unit_cost;
  const totalLineCost = totalQty * perUnit;
  const curSym = sym(line.currency);
  const deductStock = packaged ? totalQty / (line.pack_size as number) : totalQty;

  const stepActual = (delta: number) => {
    const next = Math.max(0, +(line.actual_qty + delta).toFixed(3));
    onChange({ actual_qty: next });
  };
  const stepWaste = (delta: number) => {
    const next = Math.max(0, +(line.waste_qty + delta).toFixed(3));
    onChange({ waste_qty: next });
  };

  const sourceBadge = {
    'item-formula': { label: 'Otomatik', bg: tint(accentColor, 0.10), fg: accentColor },
    'station-rule': { label: 'Önerilen', bg: 'rgba(217,119,6,0.10)', fg: '#9C5E0E' },
    'manual':       { label: 'Manuel',   bg: 'rgba(10,10,10,0.06)',  fg: INK[500] },
  }[line.source];

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: line.source === 'manual' ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)',
        backgroundColor: line.source === 'manual' ? '#FFFFFF' : CREAM,
        overflow: 'hidden',
      }}
    >
      {/* Top row — name + stock + remove */}
      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Name — stok kalemine bağlıysa ad + değiştir, değilse "Stoktan seç" */}
          <View style={{ flex: 1, gap: 5 }}>
            {line.item_id ? (
              <Pressable
                onPress={onOpenPicker}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: INK[900] }} numberOfLines={1}>
                  {line.item_name}
                </Text>
                <ChevronDown size={13} color={INK[400]} strokeWidth={2} />
              </Pressable>
            ) : (
              <Pressable
                onPress={onOpenPicker}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                  backgroundColor: tint(accentColor, 0.10),
                  borderWidth: 1, borderColor: tint(accentColor, 0.22),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <Package size={13} color={accentColor} strokeWidth={1.9} />
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: accentColor }}>
                  Stoktan seç
                </Text>
                {line.category ? (
                  <Text style={{ fontSize: 11, color: tint(accentColor, 0.7) }}>· {line.category}</Text>
                ) : null}
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* Source badge */}
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9999, backgroundColor: sourceBadge.bg }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: sourceBadge.fg, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  {sourceBadge.label}
                </Text>
              </View>
              {/* Note (if any) */}
              {line.note && (
                <Text style={{ fontSize: 11, color: INK[500], fontStyle: 'italic' }} numberOfLines={1}>
                  {line.note}
                </Text>
              )}
            </View>
          </View>

          {/* Stock pill — yalnız stok kalemine bağlıyken */}
          {line.item_id ? (
            <View style={{
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999,
              backgroundColor: stock.bg,
              flexDirection: 'row', alignItems: 'center', gap: 5,
            }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stock.fg }} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: stock.fg }}>
                {line.current_stock != null ? `${line.current_stock} ${line.unit ?? ''}` : '—'}
              </Text>
            </View>
          ) : null}

          {/* Remove */}
          <Pressable
            onPress={onRemove}
            style={{
              width: 28, height: 28, borderRadius: 8,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(220,38,38,0.06)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Trash2 size={12} color="#9C2E2E" strokeWidth={1.8} />
          </Pressable>
        </View>

        {/* Quantity row — actual + unit + cost */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Actual stepper */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: INK[500], textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Miktar
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: '#FFFFFF',
              borderRadius: 9999,
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
              paddingHorizontal: 4, paddingVertical: 3, gap: 4,
            }}>
              <Pressable
                onPress={() => stepActual(-0.5)}
                style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}
              >
                <Minus size={11} color={INK[700]} strokeWidth={2} />
              </Pressable>
              <DecimalInput
                value={line.actual_qty}
                onChangeNum={(n) => onChange({ actual_qty: n })}
                style={{
                  minWidth: 50, textAlign: 'center',
                  fontSize: 13, fontWeight: '700', color: INK[900],
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
              <Pressable
                onPress={() => stepActual(0.5)}
                style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(accentColor, 0.12) }}
              >
                <Plus size={11} color={accentColor} strokeWidth={2} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 11, color: INK[500] }}>{line.unit ?? '-'}</Text>
          </View>

          {/* Unit cost — kalemden otoriter (RPC bunu kullanır); yalnız admin/manager */}
          {showFinance && line.item_id ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 11, color: INK[500] }}>×</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: INK[700] }}>
                {perUnit.toFixed(2)} {curSym}/{line.unit ?? 'birim'}
              </Text>
            </View>
          ) : null}

          <View style={{ flex: 1 }} />

          {/* Total cost — yalnız admin/manager */}
          {showFinance && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9, fontWeight: '600', color: INK[400], letterSpacing: 0.7, textTransform: 'uppercase' }}>
                Toplam
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900] }}>
                {totalLineCost.toFixed(2)} {curSym}
              </Text>
            </View>
          )}
        </View>

        {/* Paketli kalem: stoktan ne kadar (kesirli adet) düşeceğini göster */}
        {packaged && totalQty > 0 && (
          <Text style={{ fontSize: 11, color: INK[500] }}>
            ≈ {deductStock.toFixed(3).replace(/\.?0+$/, '')} {line.stock_unit ?? 'adet'} stoktan düşecek
            {' '}(1 {line.stock_unit ?? 'adet'} = {line.pack_size} {line.content_unit ?? line.unit})
          </Text>
        )}

        {/* Waste toggle */}
        <Pressable
          onPress={() => {
            const next = !wasteOpen;
            setWasteOpen(next);
            if (!next) onChange({ waste_qty: 0, waste_reason: null });
          }}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999,
            backgroundColor: wasteOpen ? 'rgba(220,38,38,0.10)' : 'rgba(0,0,0,0.04)',
            borderWidth: 1, borderColor: wasteOpen ? 'rgba(220,38,38,0.25)' : 'rgba(0,0,0,0.08)',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          }}
        >
          <Flame size={11} color={wasteOpen ? '#9C2E2E' : INK[500]} strokeWidth={1.8} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: wasteOpen ? '#9C2E2E' : INK[500] }}>
            {wasteOpen ? 'Fire açık' : 'Fire ekle'}
          </Text>
        </Pressable>

        {/* Waste row — collapsible */}
        {wasteOpen && (
          <View style={{
            backgroundColor: 'rgba(220,38,38,0.04)',
            borderRadius: 10,
            borderWidth: 1, borderColor: 'rgba(220,38,38,0.15)',
            padding: 10, gap: 10,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#9C2E2E', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Fire miktarı
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#FFFFFF',
                borderRadius: 9999,
                borderWidth: 1, borderColor: 'rgba(220,38,38,0.20)',
                paddingHorizontal: 4, paddingVertical: 3, gap: 4,
              }}>
                <Pressable
                  onPress={() => stepWaste(-0.5)}
                  style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}
                >
                  <Minus size={10} color={INK[700]} strokeWidth={2} />
                </Pressable>
                <DecimalInput
                  value={line.waste_qty}
                  onChangeNum={(n) => onChange({ waste_qty: n })}
                  style={{
                    minWidth: 40, textAlign: 'center',
                    fontSize: 12, fontWeight: '700', color: '#9C2E2E',
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                  }}
                />
                <Pressable
                  onPress={() => stepWaste(0.5)}
                  style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(220,38,38,0.10)' }}
                >
                  <Plus size={10} color="#9C2E2E" strokeWidth={2} />
                </Pressable>
              </View>
              <Text style={{ fontSize: 11, color: '#9C2E2E' }}>{line.unit ?? '-'}</Text>
            </View>

            <TextInput
              value={line.waste_reason ?? ''}
              onChangeText={(t) => onChange({ waste_reason: t })}
              placeholder="Sebep — örn: Disc kırıldı, baskı başarısız, yanlış renk"
              placeholderTextColor={INK[400]}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 8,
                borderWidth: 1, borderColor: 'rgba(220,38,38,0.18)',
                paddingHorizontal: 10, paddingVertical: 8,
                fontSize: 12, color: INK[900],
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              }}
            />
          </View>
        )}
      </View>
    </View>
  );
}

// ── StockPickerModal ─────────────────────────────────────────────────
// Labın stok kalemlerini arayıp seçtiren nested modal. Kalem yoksa
// "Yeni stok kalemi oluştur" ile stock_items'a ekler ve satıra bağlar.
function StockPickerModal({
  visible, items, accentColor, labId, showFinance, stationName, stationCategories, initialCategory,
  onClose, onPick, onCreated,
}: {
  visible: boolean;
  items: StockPick[];
  accentColor: string;
  labId: string | null;
  showFinance: boolean;
  /** Aktif istasyon adı — bu aşamada kullanılabilecek malzemeleri filtrelemek için */
  stationName: string;
  /** Bu aşamada kullanılan malzeme kategorileri (lab_stations.allowed_material_types) */
  stationCategories: string[];
  initialCategory: string | null;
  onClose: () => void;
  onPick: (item: StockPick) => void;
  onCreated: (item: StockPick) => void;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Başka aşamalara etiketli kalemleri de göster (bu aşamaya uygun olmayanlar)
  const [showAll, setShowAll] = useState(false);

  // Create form
  const [nName, setNName] = useState('');
  const [nUnit, setNUnit] = useState('Adet');
  const [nCategory, setNCategory] = useState('');
  const [nQty, setNQty] = useState('0');
  const [nCost, setNCost] = useState('0');
  const [nCcy, setNCcy] = useState<string>('TRY');
  const [nPack, setNPack] = useState('');        // paket içeriği (örn 50) — boş = paketsiz
  const [nContentUnit, setNContentUnit] = useState('gr');

  // Modal her açıldığında sıfırla + kategori önerisini doldur
  useEffect(() => {
    if (visible) {
      setQuery('');
      setMode('list');
      setError(null);
      setShowAll(false);
      setNName('');
      setNUnit('Adet');
      setNCategory(initialCategory ?? '');
      setNQty('0');
      setNCost('0');
      setNCcy('TRY');
      setNPack('');
      setNContentUnit('gr');
    }
  }, [visible, initialCategory]);

  const q = query.trim().toLocaleLowerCase('tr');

  // Aşama-uygunluk: 0 = bu aşamada kullanılır, 1 = genel (etiketsiz), 2 = başka aşama.
  // İlişki iki kaynaktan gelir: kalemin usable_stages'i bu istasyonu içeriyorsa VEYA
  // kalemin kategorisi bu aşamanın izinli kategorilerinden biriyse → bu aşamaya uygun.
  const relevance = (it: StockPick): 0 | 1 | 2 => {
    const byStage = !!stationName && !!it.usable_stages && it.usable_stages.includes(stationName);
    const byCategory = !!it.category && stationCategories.includes(it.category);
    if (byStage || byCategory) return 0;
    const us = it.usable_stages;
    if (!us || us.length === 0) return 1;   // etiketsiz → genel
    return 2;                                // yalnız başka aşamaya etiketli
  };

  // "Başka aşama"ya etiketli kalemler kaç tane (Polisaj'da zirkonyum blok gibi) →
  // "Tümünü göster" ipucu için say.
  const hiddenCount = items.filter(it => relevance(it) === 2).length;

  const filtered = items
    .filter(it =>
      !q ||
      it.name.toLocaleLowerCase('tr').includes(q) ||
      (it.category ?? '').toLocaleLowerCase('tr').includes(q),
    )
    // Bu aşamaya uygun olmayanları (relevance 2) gizle — showAll veya arama varsa göster
    .filter(it => showAll || q.length > 0 || relevance(it) !== 2)
    .sort((a, b) => {
      const ra = relevance(a), rb = relevance(b);
      if (ra !== rb) return ra - rb;                          // bu aşamada → genel → diğer
      if (initialCategory) {                                  // kategori eşleşmesi
        const ac = a.category === initialCategory ? 0 : 1;
        const bc = b.category === initialCategory ? 0 : 1;
        if (ac !== bc) return ac - bc;
      }
      return a.name.localeCompare(b.name, 'tr');
    });

  const handleCreate = async () => {
    if (!labId) { setError('Lab bulunamadı — stok kalemi oluşturulamıyor'); return; }
    if (!nName.trim()) { setError('Malzeme adı gerekli'); return; }
    setSaving(true);
    setError(null);
    const qty = parseFloat(nQty.replace(',', '.'));
    const cost = parseFloat(nCost.replace(',', '.'));
    const pack = parseFloat(nPack.replace(',', '.'));
    const packVal = isFinite(pack) && pack > 0 ? pack : null;
    const res = await createStockItem({
      lab_id: labId,
      name: nName,
      unit: nUnit.trim() || null,
      category: nCategory.trim() || null,
      quantity: isFinite(qty) && qty >= 0 ? qty : 0,
      unit_cost: isFinite(cost) && cost >= 0 ? cost : 0,
      currency: nCcy,
      pack_size: packVal,
      content_unit: packVal ? (nContentUnit.trim() || null) : null,
      // Bu aşamada oluşturulan malzeme otomatik bu aşamaya etiketlenir → ilişki organik birikir
      usable_stages: stationName ? [stationName] : null,
    });
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? 'Stok kalemi oluşturulamadı');
      return;
    }
    onCreated(res.data as StockPick);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 22, width: 520, maxWidth: '100%', maxHeight: '86%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.24)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14, gap: 12 }}>
            <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 20, letterSpacing: -0.4, color: INK[900] }}>
              {mode === 'list' ? 'Stoktan seç' : 'Yeni stok kalemi'}
            </Text>
            <Pressable
              onPress={onClose}
              style={{
                width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={14} color={INK[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.05)' }} />

          {mode === 'list' ? (
            <>
              {/* Search */}
              <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: CREAM, borderRadius: 9999,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  paddingHorizontal: 14, paddingVertical: 9,
                }}>
                  <Search size={15} color={INK[400]} strokeWidth={1.8} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Malzeme ara…"
                    placeholderTextColor={INK[400]}
                    autoFocus={Platform.OS === 'web'}
                    style={{
                      flex: 1, fontSize: 13, color: INK[900],
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                    }}
                  />
                </View>

                {/* Aşama filtresi ipucu + "Tümünü göster" */}
                {stationName && !q && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <Layers size={12} color={INK[400]} strokeWidth={1.8} />
                    <Text style={{ flex: 1, fontSize: 11, color: INK[500] }}>
                      {showAll
                        ? `Tüm stok gösteriliyor`
                        : `${stationName} aşamasına uygun malzemeler`}
                    </Text>
                    {hiddenCount > 0 && (
                      <Pressable
                        onPress={() => setShowAll(v => !v)}
                        style={{ ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: accentColor }}>
                          {showAll ? 'Aşamaya göre süz' : `Tümünü göster (+${hiddenCount})`}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>

              {/* List */}
              <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>
                {filtered.length === 0 ? (
                  <View style={{ paddingVertical: 28, alignItems: 'center', gap: 6 }}>
                    <Package size={26} color={INK[300]} strokeWidth={1.5} />
                    <Text style={{ fontSize: 12, color: INK[500] }}>
                      {q ? 'Eşleşen stok kalemi yok' : 'Henüz stok kalemi yok'}
                    </Text>
                    <Text style={{ fontSize: 11, color: INK[400] }}>Aşağıdan yeni kalem oluşturabilirsin</Text>
                  </View>
                ) : (
                  <View style={{ gap: 6 }}>
                    {filtered.map((it) => {
                      const tone = stockTone(it.quantity, 0);
                      return (
                        <Pressable
                          key={it.id}
                          onPress={() => onPick(it)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12,
                            borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)',
                            backgroundColor: '#FFFFFF',
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          }}
                        >
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 13.5, fontWeight: '600', color: INK[900] }} numberOfLines={1}>
                              {it.name}
                            </Text>
                            {(it.category || (it.pack_size && it.pack_size > 0)) ? (
                              <Text style={{ fontSize: 11, color: INK[500] }} numberOfLines={1}>
                                {it.category ?? ''}
                                {it.pack_size && it.pack_size > 0
                                  ? `${it.category ? ' · ' : ''}${it.pack_size} ${it.content_unit ?? ''}/${it.unit ?? 'adet'}`
                                  : ''}
                              </Text>
                            ) : null}
                          </View>
                          {showFinance && it.unit_cost != null && it.unit_cost > 0 ? (
                            <Text style={{ fontSize: 11, color: INK[500] }}>
                              {it.unit_cost.toFixed(2)} {sym(it.currency)}
                            </Text>
                          ) : null}
                          <View style={{
                            paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9999,
                            backgroundColor: tone.bg, flexDirection: 'row', alignItems: 'center', gap: 5,
                          }}>
                            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tone.fg }} />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: tone.fg }}>
                              {it.quantity} {it.unit ?? ''}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Create CTA */}
              <View style={{ paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', backgroundColor: CREAM }}>
                <Pressable
                  onPress={() => setMode('create')}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                    paddingVertical: 11, borderRadius: 9999,
                    backgroundColor: accentColor,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <PlusCircle size={15} color="#FFF" strokeWidth={2} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Yeni stok kalemi oluştur</Text>
                </Pressable>
              </View>
            </>
          ) : (
            /* ── CREATE MODE ── */
            <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18, gap: 12 }}>
              {stationName ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10,
                  backgroundColor: tint(accentColor, 0.08),
                  borderWidth: 1, borderColor: tint(accentColor, 0.18),
                }}>
                  <Layers size={13} color={accentColor} strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 11.5, color: INK[700] }}>
                    Bu malzeme <Text style={{ fontWeight: '700', color: accentColor }}>{stationName}</Text> aşamasına eklenecek — sonra Stok ekranından başka aşamalara da açabilirsin.
                  </Text>
                </View>
              ) : null}
              <FieldLabel>Malzeme adı *</FieldLabel>
              <PickerInput value={nName} onChangeText={setNName} placeholder="örn. Zirkon Disc 98mm" autoFocus />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <FieldLabel>Birim</FieldLabel>
                  <PickerInput value={nUnit} onChangeText={setNUnit} placeholder="adet / disc / ml / g" />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <FieldLabel>Kategori</FieldLabel>
                  <PickerInput value={nCategory} onChangeText={setNCategory} placeholder="örn. zirconia" />
                </View>
              </View>

              {/* Paket içeriği (opsiyonel) — doluysa tüketim bu birimde girilir */}
              <View style={{ gap: 6 }}>
                <FieldLabel>Paket içeriği (opsiyonel)</FieldLabel>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: INK[500] }}>1 {nUnit.trim() || 'Adet'} =</Text>
                  <View style={{ width: 90 }}>
                    <PickerInput value={nPack} onChangeText={setNPack} placeholder="örn. 50" keyboardType="decimal-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PickerInput value={nContentUnit} onChangeText={setNContentUnit} placeholder="gr / ml" />
                  </View>
                </View>
                <Text style={{ fontSize: 11, color: INK[400] }}>
                  Kavanoz/kutu gibi paketlerde doldur — tüketim gram/ml girilir, stoktan kesirli adet düşer. Boş bırakırsan adet=adet.
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <FieldLabel>Başlangıç stoğu ({nUnit.trim() || 'Adet'})</FieldLabel>
                  <PickerInput value={nQty} onChangeText={setNQty} placeholder="0" keyboardType="decimal-pad" />
                </View>
                {showFinance && (
                  <View style={{ flex: 1, gap: 6 }}>
                    <FieldLabel>Birim maliyet ({sym(nCcy)}/{nUnit.trim() || 'Adet'})</FieldLabel>
                    <PickerInput value={nCost} onChangeText={setNCost} placeholder="0" keyboardType="decimal-pad" />
                  </View>
                )}
              </View>

              {/* Para birimi */}
              {showFinance && (
                <View style={{ gap: 6 }}>
                  <FieldLabel>Para birimi</FieldLabel>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['TRY', 'EUR', 'USD', 'GBP'] as const).map((c) => {
                      const on = nCcy === c;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setNCcy(c)}
                          style={{
                            flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
                            backgroundColor: on ? tint(accentColor, 0.12) : '#FFFFFF',
                            borderWidth: 1, borderColor: on ? tint(accentColor, 0.35) : 'rgba(0,0,0,0.12)',
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          }}
                        >
                          <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', color: on ? accentColor : INK[500] }}>
                            {sym(c)} {c}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {error && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11,
                  backgroundColor: 'rgba(156,46,46,0.06)', borderRadius: 10,
                  borderWidth: 1, borderColor: 'rgba(156,46,46,0.18)',
                }}>
                  <AlertCircle size={14} color="#9C2E2E" strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>{error}</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable
                  onPress={() => { setMode('list'); setError(null); }}
                  disabled={saving}
                  style={{
                    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 9999,
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)', backgroundColor: '#FFFFFF',
                    opacity: saving ? 0.5 : 1,
                    ...(Platform.OS === 'web' ? { cursor: saving ? 'not-allowed' : 'pointer' } as any : {}),
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '500', color: INK[700] }}>Geri</Text>
                </Pressable>
                <Pressable
                  onPress={handleCreate}
                  disabled={saving || !nName.trim()}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                    paddingVertical: 12, borderRadius: 9999,
                    backgroundColor: accentColor,
                    opacity: (saving || !nName.trim()) ? 0.45 : 1,
                    ...(Platform.OS === 'web' ? { cursor: (saving || !nName.trim()) ? 'not-allowed' : 'pointer' } as any : {}),
                  }}
                >
                  <Check size={14} color="#FFF" strokeWidth={2.4} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
                    {saving ? 'Ekleniyor…' : 'Ekle & seç'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Küçük form yardımcıları (picker create formu) ────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: INK[500], letterSpacing: 0.5, textTransform: 'uppercase' }}>
      {children}
    </Text>
  );
}

function PickerInput({
  value, onChangeText, placeholder, keyboardType, autoFocus,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'decimal-pad';
  autoFocus?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={INK[400]}
      keyboardType={keyboardType}
      autoFocus={autoFocus && Platform.OS === 'web'}
      style={{
        backgroundColor: '#FFFFFF', borderRadius: 12,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)',
        paddingHorizontal: 12, paddingVertical: 10,
        fontSize: 13, color: INK[900],
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
      }}
    />
  );
}
