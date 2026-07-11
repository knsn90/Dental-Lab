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
  Check, Flame, Package,
} from 'lucide-react-native';
import { useStageMaterialEstimate } from '../hooks/useStageMaterialEstimate';
import type { EstimatedMaterialLine } from '../../../core/materials/estimation';
import { useAuthStore } from '../../../core/store/authStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

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

  const canConfirm =
    !isSaving && !isLoading && state.phase !== 'error' &&
    lines.some(l => l.item_name.trim() && (l.actual_qty > 0 || l.waste_qty > 0));

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
                  {toothCount} diş{showFinance ? ` · Tahmini ~${totalCost.toFixed(2)} ₺` : ''}
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
                    {totalCost.toFixed(2)} ₺
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
              onPress={() => confirm({ advanceStage: true })}
              disabled={!canConfirm}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: accentColor,
                opacity: canConfirm ? 1 : 0.45,
                ...(Platform.OS === 'web' ? {
                  cursor: !canConfirm ? 'not-allowed' : isSaving ? 'wait' : 'pointer',
                  boxShadow: canConfirm ? `0 8px 24px ${tint(accentColor, 0.45)}` : 'none',
                } as any : {}),
              }}
            >
              <Check size={14} color="#FFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>
                {isSaving ? 'Onaylanıyor…' : 'Onayla & İlerlet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── LineCard subcomponent ────────────────────────────────────────────
function LineCard({
  line, accentColor, onChange, onRemove, showFinance = true,
}: {
  line: EstimatedMaterialLine;
  accentColor: string;
  onChange: (patch: Partial<EstimatedMaterialLine>) => void;
  onRemove: () => void;
  showFinance?: boolean;
}) {
  const [wasteOpen, setWasteOpen] = useState(line.waste_qty > 0);
  const stock = stockTone(line.current_stock, line.actual_qty);
  const totalQty = line.actual_qty + line.waste_qty;
  const totalLineCost = totalQty * line.unit_cost;

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
          {/* Name (editable for manual rows) */}
          <View style={{ flex: 1, gap: 3 }}>
            {line.source === 'manual' || !line.item_id ? (
              <TextInput
                value={line.item_name}
                onChangeText={(t) => onChange({ item_name: t })}
                placeholder="Malzeme adı"
                placeholderTextColor={INK[400]}
                style={{
                  fontSize: 14, fontWeight: '600', color: INK[900],
                  paddingVertical: 4,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
            ) : (
              <Text style={{ fontSize: 14, fontWeight: '600', color: INK[900] }} numberOfLines={1}>
                {line.item_name}
              </Text>
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

          {/* Stock pill */}
          <View style={{
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999,
            backgroundColor: stock.bg,
            flexDirection: 'row', alignItems: 'center', gap: 5,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stock.fg }} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: stock.fg }}>
              {line.current_stock != null ? `${line.current_stock} ${line.unit ?? ''}` : 'Stok yok'}
            </Text>
          </View>

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
              <TextInput
                value={String(line.actual_qty)}
                onChangeText={(t) => {
                  const v = parseFloat(t.replace(',', '.'));
                  onChange({ actual_qty: isFinite(v) && v >= 0 ? v : 0 });
                }}
                keyboardType="decimal-pad"
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

          {/* Unit cost — yalnız admin/manager */}
          {showFinance && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 11, color: INK[500] }}>×</Text>
              <TextInput
                value={String(line.unit_cost)}
                onChangeText={(t) => {
                  const v = parseFloat(t.replace(',', '.'));
                  onChange({ unit_cost: isFinite(v) && v >= 0 ? v : 0 });
                }}
                keyboardType="decimal-pad"
                style={{
                  minWidth: 60,
                  fontSize: 12, fontWeight: '500', color: INK[700],
                  paddingHorizontal: 8, paddingVertical: 4,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 8,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
              <Text style={{ fontSize: 11, color: INK[500] }}>₺/{line.unit ?? 'birim'}</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          {/* Total cost — yalnız admin/manager */}
          {showFinance && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9, fontWeight: '600', color: INK[400], letterSpacing: 0.7, textTransform: 'uppercase' }}>
                Toplam
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900] }}>
                {totalLineCost.toFixed(2)} ₺
              </Text>
            </View>
          )}
        </View>

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
                <TextInput
                  value={String(line.waste_qty)}
                  onChangeText={(t) => {
                    const v = parseFloat(t.replace(',', '.'));
                    onChange({ waste_qty: isFinite(v) && v >= 0 ? v : 0 });
                  }}
                  keyboardType="decimal-pad"
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
