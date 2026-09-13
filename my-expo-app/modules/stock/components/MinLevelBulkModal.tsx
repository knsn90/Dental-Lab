/**
 * MinLevelBulkModal — minimum stok seviyelerini toplu tanımlama.
 *
 * NEDEN: 91 kalemin 2'sinde minimum tanımlıydı. Minimum yoksa kalem asla
 * "kritik" olmuyor; pano hep %100 sağlıklı görünüyor ve Sipariş Öner sekmesi
 * boş kalıyor. Kalem kalem düzenleme ekranından girmek 91 tıklama demek —
 * burada kategori bazlı tek değerle hepsini doldurabilirsiniz.
 *
 * Kategori başlığındaki alan o kategorinin TÜM satırlarını doldurur; tek tek
 * düzeltmek isterseniz satır alanı her zaman üstün.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { Check, Search, X } from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { toast } from '../../../core/ui/Toast';
import { formatQty } from '../../../core/util/formatQty';
import { saveMinLevels } from '../api';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

interface Row {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  quantity: number;
  min_quantity: number | null;
  min_auto: boolean | null;
}

interface Props {
  visible: boolean;
  accentColor: string;
  onClose: () => void;
  onSaved: () => void;
}

export function MinLevelBulkModal({ visible, accentColor, onClose, onSaved }: Props) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [draft, setDraft]     = useState<Record<string, string>>({});
  const [q, setQ]             = useState('');
  // Otomatik atanmış eşikler gözden geçirilmeyi bekleyenler — varsayılan filtre
  const [onlyAuto, setOnlyAuto] = useState(true);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('stock_items')
        .select('id, name, category, unit, quantity, min_quantity, min_auto')
        .eq('is_active', true)
        .order('name');
      if (!alive) return;
      setRows((data ?? []) as Row[]);
      setDraft({});
      setQ('');
      setOnlyAuto(true);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [visible]);

  const visibleRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      if (onlyAuto && !r.min_auto && draft[r.id] === undefined) return false;
      if (s && !r.name.toLowerCase().includes(s) && !(r.category ?? '').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, q, onlyAuto, draft]);

  /** Kategori → satırlar (başlıkta toplu doldurma alanı için gerekli) */
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of visibleRows) {
      const k = (r.category ?? '').trim() || 'Diğer';
      const a = m.get(k); if (a) a.push(r); else m.set(k, [r]);
    }
    return [...m.entries()].sort((a, b) =>
      a[0] === 'Diğer' ? 1 : b[0] === 'Diğer' ? -1 : a[0].localeCompare(b[0], 'tr'));
  }, [visibleRows]);

  const applyToCategory = useCallback((catRows: Row[], raw: string) => {
    const n = parseFloat(raw.replace(',', '.'));
    if (!isFinite(n) || n < 0) return;
    setDraft(prev => {
      const next = { ...prev };
      for (const r of catRows) next[r.id] = String(n);
      return next;
    });
  }, []);

  const dirtyCount = Object.keys(draft).length;

  const save = useCallback(async () => {
    const levels: Record<string, number> = {};
    for (const [id, raw] of Object.entries(draft)) {
      const n = parseFloat(String(raw).replace(',', '.'));
      if (!isFinite(n) || n < 0) { toast.error('Geçersiz değer var'); return; }
      levels[id] = n;
    }
    setSaving(true);
    const res = await saveMinLevels(levels);
    setSaving(false);
    if (!res.ok) { toast.error(res.error ?? 'Kaydedilemedi'); return; }
    toast.success(`${res.saved} kalemin minimumu güncellendi`);
    onSaved();
  }, [draft, onSaved]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
        <View style={{
          width: '100%', maxWidth: 720, maxHeight: '92%',
          backgroundColor: (isDark ? T.card : DS.lab.surface), borderRadius: 18,
          borderWidth: 1, borderColor: (isDark ? T.hairline : DS.ink[200]), overflow: 'hidden',
        }}>
          {/* Başlık */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 12,
            paddingHorizontal: 20, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: (isDark ? T.hairline : DS.ink[100]),
          }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.4, color: (isDark ? T.ink : DS.ink[900]) }}>
                Minimum stok seviyeleri
              </Text>
              <Text style={{ fontSize: 12, color: (isDark ? T.ink3 : DS.ink[500]), lineHeight: 18 }}>
                Minimum girilmemiş kalemlere referans miktarın %10'u otomatik
                atandı. Gerçek tüketim hızınıza göre düzeltin — kategori başlığına
                yazdığınız değer o kategorinin tamamına uygulanır.
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                width: 30, height: 30, borderRadius: 999, alignItems: 'center',
                justifyContent: 'center', backgroundColor: (isDark ? '#292825' : 'rgba(0,0,0,0.05)'),
                opacity: pressed ? 0.6 : 1, ...webCursor,
              })}
            >
              <X size={15} color={isDark ? T.ink2 : DS.ink[700]} strokeWidth={1.9} />
            </Pressable>
          </View>

          {/* Arama + filtre */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 20, paddingVertical: 12,
            borderBottomWidth: 1, borderBottomColor: (isDark ? T.hairline : DS.ink[100]), flexWrap: 'wrap',
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 12, height: 34, borderRadius: 999,
              borderWidth: 1, borderColor: (isDark ? T.hairline : DS.ink[200]), flexGrow: 1, flexBasis: 200, minWidth: 0,
            }}>
              <Search size={13} color={isDark ? T.ink3 : DS.ink[400]} strokeWidth={1.8} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Ürün veya kategori ara"
                placeholderTextColor={isDark ? (T.ink3 as string) : DS.ink[400]}
                style={{
                  flex: 1, fontSize: 13, color: (isDark ? T.ink : DS.ink[900]),
                  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                }}
              />
            </View>
            <Pressable
              onPress={() => setOnlyAuto(v => !v)}
              style={({ pressed }) => ({
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                backgroundColor: onlyAuto ? DS.ink[900] : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                opacity: pressed ? 0.7 : 1, ...webCursor,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: onlyAuto ? '#FFF' : (isDark ? T.ink : DS.ink[800]) }}>
                Yalnız otomatikler
              </Text>
            </Pressable>
          </View>

          {/* Liste */}
          {loading ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <ActivityIndicator color={accentColor} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
              {groups.length === 0 ? (
                <Text style={{ fontSize: 13, color: (isDark ? T.ink3 : DS.ink[500]), textAlign: 'center', paddingVertical: 40 }}>
                  {onlyAuto ? 'Otomatik eşikli kalem kalmadı' : 'Eşleşen kalem yok'}
                </Text>
              ) : groups.map(([cat, catRows]) => (
                <View key={cat}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
                    backgroundColor: (isDark ? T.cardSoft : DS.ink[50]),
                  }}>
                    <Text style={{
                      flex: 1, fontSize: 10, fontWeight: '600', letterSpacing: 1.2,
                      textTransform: 'uppercase', color: (isDark ? T.ink3 : DS.ink[500]),
                    }}>
                      {cat} <Text style={{ color: (isDark ? T.ink3 : DS.ink[400]) }}>{catRows.length}</Text>
                    </Text>
                    <Text style={{ fontSize: 11, color: (isDark ? T.ink3 : DS.ink[400]) }}>hepsine:</Text>
                    <TextInput
                      onChangeText={t => applyToCategory(catRows, t)}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={isDark ? (T.ink3 as string) : DS.ink[300]}
                      style={{
                        width: 70, paddingHorizontal: 10, paddingVertical: 5,
                        borderRadius: 10, borderWidth: 1, borderColor: (isDark ? T.hairline : DS.ink[300]),
                        fontSize: 12, color: (isDark ? T.ink : DS.ink[900]), textAlign: 'end' as any,
                        backgroundColor: (isDark ? T.cardSoft : DS.lab.surface),
                        ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                      }}
                    />
                  </View>

                  {catRows.map(r => {
                    const val = draft[r.id] ?? (r.min_quantity != null && r.min_quantity > 0
                      ? String(r.min_quantity) : '');
                    const dirty = draft[r.id] !== undefined;
                    return (
                      <View
                        key={r.id}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          paddingHorizontal: 20, paddingVertical: 9,
                          borderTopWidth: 1, borderTopColor: (isDark ? T.hairline : DS.ink[100]),
                          backgroundColor: dirty ? accentColor + '0F' : 'transparent',
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ fontSize: 13, color: (isDark ? T.ink : DS.ink[900]) }}>
                            {r.name}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 11, color: (isDark ? T.ink3 : DS.ink[400]) }}>
                              Mevcut: {formatQty(r.quantity)} {r.unit ?? ''}
                            </Text>
                            {r.min_auto && !dirty ? (
                              <View style={{
                                paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
                                backgroundColor: 'rgba(232,155,42,0.14)',
                              }}>
                                <Text style={{ fontSize: 9, fontWeight: '600', color: '#8A5A12' }}>
                                  otomatik %10
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        <TextInput
                          value={val}
                          onChangeText={t => setDraft(p => ({ ...p, [r.id]: t }))}
                          keyboardType="decimal-pad"
                          placeholder="—"
                          placeholderTextColor={isDark ? (T.ink3 as string) : DS.ink[300]}
                          style={{
                            width: 90, paddingHorizontal: 12, paddingVertical: 7,
                            borderRadius: 10, borderWidth: 1,
                            borderColor: dirty ? accentColor : (isDark ? T.hairline : DS.ink[300]),
                            fontSize: 13, color: (isDark ? T.ink : DS.ink[900]), textAlign: 'end' as any,
                            ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                          }}
                        />
                        <Text style={{ width: 44, fontSize: 11, color: (isDark ? T.ink3 : DS.ink[400]) }}>
                          {r.unit ?? ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}

          {/* Aksiyon */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 20, paddingVertical: 14,
            borderTopWidth: 1, borderTopColor: (isDark ? T.hairline : DS.ink[100]),
          }}>
            <Text style={{ flex: 1, fontSize: 12, color: (isDark ? T.ink3 : DS.ink[500]) }}>
              {dirtyCount > 0 ? `${dirtyCount} kalem güncellenecek` : 'Değişiklik yok'}
            </Text>
            <Pressable onPress={onClose} disabled={saving} style={{ ...webCursor }}>
              <Text style={{ fontSize: 13, color: (isDark ? T.ink3 : DS.ink[500]) }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving || dirtyCount === 0}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                backgroundColor: DS.ink[900],
                opacity: saving || dirtyCount === 0 ? 0.35 : pressed ? 0.85 : 1,
                ...webCursor,
              })}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Check size={14} color="#FFF" strokeWidth={2} />}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Kaydet</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default MinLevelBulkModal;
