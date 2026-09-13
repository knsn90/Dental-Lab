/**
 * MaterialMappingScreen — Ürün → Üretim Malzemesi eşleştirmesi (Envanter D2).
 *
 * Neden gerekli: reçeteler ve tüketim profilleri "Aidite HT A2" gibi bir stok
 * kartını değil, "Zirkon Blok" gibi marka bağımsız Üretim Malzemesini kullanır.
 * Laboratuvar marka değiştirdiğinde profilleri değil, yalnız bu bağı günceller.
 *
 * Akış: sistem önerir → yönetici onaylar. Öneri motoru hiçbir şey yazmaz.
 *
 * TASARIM — DESIGN_LANGUAGE.md:
 *   • Tek yöntem: DS token + inline style (className karışımı yok — kural 11.8)
 *   • Display başlık: Inter Tight 300 + negatif tracking
 *   • Kart: #FFF · radius 18 · 1px ink[200] · gölge yok
 *   • Pill: radius 999 · aktif chip = solid ink[900]
 *   • Blok arası ritim: 16
 *   • Hero yok: bu ekran yüzlerce satır tarama ekranı; yoğunluk > gösteri.
 *     (F1c dekoratif daireleri bilinçli olarak kullanılmadı.)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';
import { Check, ChevronDown, Inbox, Link2, RefreshCw, Sparkles, X } from '../../../core/ui/icons';
import { ResponsiveCanvas } from '../../../core/layout/ResponsiveCanvas';
import { groupByCategory, CategoryHeaderRow } from '../categoryGroup';
import { DS } from '../../../core/theme/dsTokens';
import { useStockUI } from '../stockTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { toast } from '../../../core/ui/Toast';
import {
  SecHeader, MiniStat, TabPill, SearchField, ProgressRail, ListHeader,
  EmptyCard, LoadMore, Loader, cardStyle, tint, webCursor,
} from '../../../core/ui/ds';
import {
  fetchMappingSuggestions, fetchProductionMaterials, applyMaterialMapping,
  type MappingSuggestion, type ProductionMaterial,
} from '../api';

interface Props {
  accentColor?: string;
  /** Hub içinde sekme olarak render ediliyor — kendi başlığını/geri butonunu gizler */
  embedded?: boolean;
}

/** Satırın kullanıcı tarafından seçilmiş hâli (öneriden sapabilir) */
type RowState = { materialId: string | null };
/** Kaydetme geri bildirimi — satır bazında, kısa ömürlü */
type SaveState = 'saved' | 'error';

/** İlk render'da tüm listeyi basmayız — 500+ satırda ilk boyama maliyetli */
const PAGE = 80;

export function MaterialMappingScreen({ accentColor = DS.lab.primary, embedded = false }: Props) {
  const U = useStockUI();
  const router   = useRouter();
  const segments = useSegments();
  const panel    = (segments?.[0] as string) ?? '(lab)';

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [rows, setRows]           = useState<MappingSuggestion[]>([]);
  const [materials, setMaterials] = useState<ProductionMaterial[]>([]);
  const [state, setState]         = useState<Record<string, RowState>>({});
  /**
   * Satır 3 kolonlu bir masaüstü tablosuydu: durum 96px + malzeme 248px SABİT.
   * Dar ekranda ürün adı kolonu sıfıra çöküyor, malzeme pill'i kartın dışına
   * taşıyordu. Dar ekranda aynı bilgi dikey yığılır.
   */
  const { width: winW } = useWindowDimensions();
  const isNarrow = winW < 640;

  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [filter, setFilter]       = useState<'all' | 'unmapped' | 'changed'>('all');
  const [query, setQuery]         = useState('');
  const [hoverId, setHoverId]     = useState<string | null>(null);
  const [limit, setLimit]         = useState(PAGE);
  const [saveFlash, setSaveFlash] = useState<Record<string, SaveState>>({});
  const flashTimer = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, m] = await Promise.all([fetchMappingSuggestions(), fetchProductionMaterials()]);
    if (s.error) toast.error('Öneriler alınamadı: ' + s.error);
    if (m.error) toast.error('Malzemeler alınamadı: ' + m.error);
    setRows(s.data);
    setMaterials(m.data);
    // Başlangıç: bağlı olan varsa onu koru, yoksa öneriyi seç
    const init: Record<string, RowState> = {};
    for (const r of s.data) {
      const currentId = r.current_code
        ? (m.data.find(x => x.code === r.current_code)?.id ?? null)
        : null;
      init[r.stock_item_id] = { materialId: currentId ?? r.suggested_id };
    }
    setState(init);
    setLimit(PAGE);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const byId   = useMemo(() => Object.fromEntries(materials.map(m => [m.id, m])), [materials]);
  const byCode = useMemo(() => Object.fromEntries(materials.map(m => [m.code, m])), [materials]);

  /** Bir satırın kayıtlı hâli (DB'deki bağ) */
  const savedIdOf = useCallback(
    (r: MappingSuggestion) => (r.current_code ? (byCode[r.current_code]?.id ?? null) : null),
    [byCode],
  );

  const pending = useMemo(
    () => rows.filter(r => (state[r.stock_item_id]?.materialId ?? null) !== savedIdOf(r)),
    [rows, state, savedIdOf],
  );
  const pendingIds = useMemo(() => new Set(pending.map(r => r.stock_item_id)), [pending]);

  const mappedCount  = rows.filter(r => !!r.current_code).length;
  const missingCount = rows.length - mappedCount;
  const pct          = rows.length ? Math.round((mappedCount / rows.length) * 100) : 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (filter === 'unmapped') list = list.filter(r => !r.current_code);
    if (filter === 'changed')  list = list.filter(r => pendingIds.has(r.stock_item_id));
    if (q) {
      list = list.filter(r => {
        const mat = state[r.stock_item_id]?.materialId;
        const matName = mat ? (byId[mat]?.name ?? '') : '';
        return r.stock_item_name.toLowerCase().includes(q)
          || (r.category ?? '').toLowerCase().includes(q)
          || matName.toLowerCase().includes(q);
      });
    }
    return list;
  }, [rows, filter, query, pendingIds, state, byId]);

  const shown = visible.slice(0, limit);

  const setRow = (id: string, materialId: string | null) =>
    setState(prev => ({ ...prev, [id]: { materialId } }));

  const flash = (ids: string[], kind: SaveState) => {
    setSaveFlash(prev => ({ ...prev, ...Object.fromEntries(ids.map(i => [i, kind])) }));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaveFlash({}), 2600);
  };

  const save = async () => {
    if (!pending.length) return;
    const ids = pending.map(r => r.stock_item_id);
    setSaving(true);
    const res = await applyMaterialMapping(pending.map(r => ({
      stock_item_id: r.stock_item_id,
      production_material_id: state[r.stock_item_id]?.materialId ?? null,
    })));
    setSaving(false);
    if (!res.ok) { flash(ids, 'error'); toast.error(res.error ?? 'Kaydedilemedi'); return; }
    flash(ids, 'saved');
    toast.success(`${res.count} kalem eşleştirildi`);
    load();
  };

  const goBack = () => safeBack(`/${panel}/stock?tab=setup&sub=material_mapping`);

  if (loading) {
    return (
      <ResponsiveCanvas size="lg" bgClassName="bg-transparent">
        <Loader color={accentColor} />
      </ResponsiveCanvas>
    );
  }

  return (
    <ResponsiveCanvas size="lg" bgClassName="bg-transparent">
      {!embedded ? (
        <SecHeader
        eyebrow="Envanter · Eşleştirme"
        title="Ürün → Üretim Malzemesi"
        desc={'Tüketim profilleri marka bilmez. "Aidite", "Upcera" ve "Katana" farklı ' +
              'ürünlerdir ama hepsi Zirkon Blok olarak tüketilir. Burada her stok ' +
              'kaleminin hangi üretim malzemesi olduğunu onaylarsınız.'}
        onBack={goBack}
      />
      ) : null}

      {/* ── Özet şeridi ────────────────────────────────────────── */}
      <View style={[cardStyle, { paddingHorizontal: 18, paddingVertical: 14, marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isNarrow ? 18 : 28, flexWrap: 'wrap' }}>
          <MiniStat value={mappedCount} label="Bağlı"
                    color={mappedCount > 0 ? DS.lab.success : U.ink[400]} />
          <MiniStat value={missingCount} label="Eksik"
                    color={missingCount > 0 ? DS.lab.warning : U.ink[400]} />
          <MiniStat value={pending.length} label="Değişiklik"
                    color={pending.length > 0 ? accentColor : U.ink[400]} />

          {isNarrow ? null : <View style={{ flex: 1, minWidth: 0 }} />}

          <MiniStat value={`%${pct}`} label="Tamamlandı"
                    color={pct === 100 ? DS.lab.success : U.ink[900]} />

          <Pressable
            onPress={load}
            style={({ pressed }) => ({
              width: 30, height: 30, borderRadius: 999,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: U.chipNeutral,
              opacity: pressed ? 0.6 : 1, ...webCursor,
            })}
          >
            <RefreshCw size={13} color={U.ink[500]} strokeWidth={1.8} />
          </Pressable>
        </View>

        {/* İnce ilerleme rayı */}
        <View style={{ marginTop: 14 }}>
          <ProgressRail pct={pct} color={pct === 100 ? DS.lab.success : accentColor} />
        </View>
      </View>

      {/* ── Arama + filtre (paylaşılan atomlar) ─────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                     marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchField
          value={query}
          onChange={t => { setQuery(t); setLimit(PAGE); }}
          placeholder="Ürün ara..."
        />
        <TabPill
          value={filter}
          onChange={k => { setFilter(k); setLimit(PAGE); }}
          items={[
            { key: 'all',      label: 'Tümü',        count: rows.length },
            { key: 'unmapped', label: 'Bağlanmamış', count: missingCount },
            { key: 'changed',  label: 'Değişenler',  count: pending.length },
          ]}
        />
      </View>

      {/* ── Liste kartı ────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <EmptyCard icon={Inbox} title={query ? 'Aramayla eşleşen ürün yok' : 'Bu filtrede kalem yok'} />
      ) : (
        <View style={{
          backgroundColor: U.surface, borderRadius: 18,
          borderWidth: 1, borderColor: U.ink[200], overflow: 'hidden',
        }}>
          {/* Kolon başlığı yalnız gerçekten kolon varken anlamlı. */}
          {isNarrow ? null : (
            <ListHeader columns={[
              { label: 'Ürün', flex: 1 },
              { label: 'Üretim Malzemesi', width: 248, align: 'right' },
            ]} />
          )}

          {groupByCategory(shown, x => x.category, x => x.stock_item_id).map(entry => {
            if (entry.kind === 'header') {
              return <CategoryHeaderRow key={entry.key} label={entry.label} count={entry.count} />;
            }
            const r = entry.item;
            const i = entry.indexInGroup;
            const id      = r.stock_item_id;
            const sel     = state[id]?.materialId ?? null;
            const mat     = sel ? byId[sel] : null;
            const changed = pendingIds.has(id);
            const isSuggestion = !r.current_code && sel === r.suggested_id;
            const open    = pickerFor === id;
            const hovered = hoverId === id;
            const fl      = saveFlash[id];

            const bg = changed ? tint(accentColor, 0.06)
                     : hovered ? U.ink[50]
                     : U.surface;

            return (
              <View key={id}>
                <Pressable
                  onHoverIn={() => setHoverId(id)}
                  onHoverOut={() => setHoverId(prev => (prev === id ? null : prev))}
                  onPress={() => setPickerFor(open ? null : id)}
                  style={{
                    backgroundColor: bg,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: U.ink[100],
                    borderStartWidth: 2,
                    borderStartColor: changed ? accentColor : 'transparent',
                    paddingStart: 16, paddingEnd: 16,
                    paddingVertical: isNarrow ? 14 : 11,
                    ...webCursor,
                  }}
                >
                  <View style={isNarrow
                    ? { gap: 11 }
                    : { flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    {/* Birincil: ürün adı · İkincil: kategori · Üçüncül: birim */}
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text numberOfLines={isNarrow ? 2 : 1} style={{
                        fontSize: isNarrow ? 15 : 14, fontWeight: '600',
                        letterSpacing: -0.2, color: U.ink[900],
                        lineHeight: isNarrow ? 20 : undefined,
                      }}>
                        {r.stock_item_name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {r.category ? (
                          <Text numberOfLines={1} style={{ fontSize: 12, color: U.ink[500] }}>
                            {r.category}
                          </Text>
                        ) : null}
                        {r.unit ? (
                          <Text style={{
                            fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
                            color: U.ink[400],
                          }}>
                            {r.unit}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Durum — kaydedildi / hata / değişti / öneri */}
                    <View style={isNarrow
                      ? { alignItems: 'flex-start' }
                      : { width: 96, alignItems: 'flex-end' }}>
                      {fl === 'saved' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Check size={11} color="#1F6B47" strokeWidth={2.4} />
                          <Text style={{ fontSize: 11, fontWeight: '500', color: '#1F6B47' }}>
                            Kaydedildi
                          </Text>
                        </View>
                      ) : fl === 'error' ? (
                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#9C2E2E' }}>
                          Kaydedilemedi
                        </Text>
                      ) : changed ? (
                        <View style={{
                          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                          backgroundColor: tint(accentColor, 0.14),
                        }}>
                          <Text style={{ fontSize: 11, fontWeight: '500', color: U.ink[800] }}>
                            Değişti
                          </Text>
                        </View>
                      ) : isSuggestion ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Sparkles size={11} color={DS.lab.info} strokeWidth={1.9} />
                          <Text style={{ fontSize: 11, fontWeight: '500', color: '#1F5689' }}>
                            Öneri
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Seçili üretim malzemesi — pill, hafif */}
                    <View style={isNarrow
                      ? { alignSelf: 'stretch' }
                      : { width: 248, alignItems: 'flex-end' }}>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        ...(isNarrow ? { alignSelf: 'stretch' } : { maxWidth: 248 }),
                        paddingHorizontal: 14,
                        paddingVertical: isNarrow ? 11 : 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: mat ? tint(accentColor, 0.32) : U.ink[300],
                        backgroundColor: mat ? tint(accentColor, 0.10) : 'transparent',
                      }}>
                        <Link2 size={isNarrow ? 13 : 11} color={mat ? U.ink[800] : U.ink[400]} strokeWidth={1.8} />
                        <Text numberOfLines={1} style={{
                          fontSize: isNarrow ? 13.5 : 12, fontWeight: '500',
                          ...(isNarrow ? { flex: 1 } : { flexShrink: 1 }),
                          color: mat ? U.ink[800] : U.ink[400],
                        }}>
                          {mat ? mat.name : 'Bağlanmadı'}
                        </Text>
                        <ChevronDown size={isNarrow ? 14 : 11} color={U.ink[400]} strokeWidth={1.8} />
                      </View>
                    </View>
                  </View>
                </Pressable>

                {/* Malzeme seçici */}
                {open ? (
                  <View style={{
                    paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14,
                    backgroundColor: U.ink[50],
                    borderTopWidth: 1, borderTopColor: U.ink[100],
                  }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <Pressable
                        onPress={() => { setRow(id, null); setPickerFor(null); }}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 14,
                          paddingVertical: isNarrow ? 9 : 6,
                          borderRadius: 999,
                          borderWidth: 1, borderColor: U.ink[300],
                          opacity: pressed ? 0.7 : 1, ...webCursor,
                        })}
                      >
                        <X size={10} color={U.ink[500]} strokeWidth={2} />
                        <Text style={{ fontSize: 12, fontWeight: '500', color: U.ink[800] }}>
                          Bağı kaldır
                        </Text>
                      </Pressable>
                      {materials.map(m => {
                        const on = sel === m.id;
                        return (
                          <Pressable
                            key={m.id}
                            onPress={() => { setRow(id, m.id); setPickerFor(null); }}
                            style={({ pressed }) => ({
                              paddingHorizontal: 14,
                              paddingVertical: isNarrow ? 9 : 6,
                              borderRadius: 999,
                              backgroundColor: on ? U.ink[900] : U.hairline,
                              opacity: pressed ? 0.7 : 1, ...webCursor,
                            })}
                          >
                            <Text style={{
                              fontSize: 12, fontWeight: '500', color: on ? U.onDarkPill : U.ink[800],
                            }}>
                              {m.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          <LoadMore remaining={visible.length - shown.length} onPress={() => setLimit(l => l + PAGE * 2)} />
        </View>
      )}

      {/* ── Kaydet (PillButton spec) ───────────────────────────── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
        gap: 14, marginTop: 16, marginBottom: 32,
      }}>
        {pending.length > 0 ? (
          <Text style={{ fontSize: 12, color: U.ink[500] }}>
            {pending.length} kalem güncellenecek
          </Text>
        ) : null}
        <Pressable
          onPress={save}
          disabled={!pending.length || saving}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
            backgroundColor: U.ink[900],
            opacity: !pending.length || saving ? 0.35 : pressed ? 0.85 : 1,
            ...(Platform.OS === 'web'
              ? ({ cursor: !pending.length ? 'not-allowed' : 'pointer' } as any)
              : {}),
          })}
        >
          {saving
            ? <ActivityIndicator size="small" color={U.onDarkPill} />
            : <Check size={14} color="#FFF" strokeWidth={2.2} />}
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
            {saving ? 'Kaydediliyor…' : 'Eşleştirmeleri onayla'}
          </Text>
        </Pressable>
      </View>
    </ResponsiveCanvas>
  );
}


export default MaterialMappingScreen;
