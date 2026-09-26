/**
 * FifoReorderScreen — FIFO stok değeri + sipariş önerisi (Envanter D4).
 *
 * İki soruyu birlikte cevaplar:
 *   1. Depodaki stok GERÇEKTE kaça mal oldu? (FIFO katmanlarından — son alış
 *      fiyatıyla çarpmak değil. Farklı tarihlerde farklı fiyata alınan aynı
 *      ürün, en eski katmandan maliyetlenir.)
 *   2. Ne zaman bitecek ve ne zaman sipariş verilmeli?
 *
 * NOT: Stok sekmesindeki "Maliyet" görünümü stok değerini hâlâ son alış
 * fiyatıyla hesaplar. Buradaki FIFO değeri farklıysa doğru olan budur.
 *
 * TASARIM — DESIGN_LANGUAGE.md + /dev/patterns:
 *   • Tek yöntem: DS token + inline style (className karışımı yok — kural 11.8)
 *   • Display başlık Inter Tight 300 · kart radius 18 · 1px ink[200]
 *   • Pill sekme (patterns §11 "Pill — default") · aktif chip solid ink[900]
 *   • Acil kalemler önce; özet scroll'da yapışık kalır
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Inbox, Layers, RefreshCw, Search, SlidersHorizontal,
  ShoppingCart, TrendingDown, X,
} from '../../../core/ui/icons';
import { ResponsiveCanvas } from '../../../core/layout/ResponsiveCanvas';
import { groupByCategory, CategoryHeaderRow } from '../categoryGroup';
import { DS } from '../../../core/theme/dsTokens';
import { useStockUI, type StockUI } from '../stockTheme';
import { isRTL } from '../../../core/i18n';
import { toast } from '../../../core/ui/Toast';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { onAccentInk } from '../../../core/theme/usePanelTheme';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import {
  fetchFifoStock, fetchReorderSuggestions, fetchUncoveredCount,
  type FifoStockRow, type ReorderRow,
} from '../api';

/** DESIGN_LANGUAGE §2 — display başlıklar daima light (300) */
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

/** DESIGN_LANGUAGE §3 — radius.card 18 + 1px ink[200], gölge yok */
/** Tema-farkında kart — yüzey/kenarlık useStockUI()'den gelir. */
const card = (U: StockUI): any => ({
  backgroundColor: U.surface,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: U.ink[200],
  overflow: 'hidden',
});

interface Props {
  accentColor?: string;
  /** Hub içinde sekme olarak render ediliyor — kendi başlığını/geri butonunu gizler */
  embedded?: boolean;
  /** Alt sekme şeridi — hero'nun içinde durur. */
  tabsNode?: React.ReactNode;
  /**
   * Dışarıdan sabitlenen görünüm. Verilirse ekranın kendi sekme şeridi gizlenir —
   * hub bu iki görünümü ayrı üst sekmelere dağıttığı için ikinci bir şerit
   * kullanıcıyı "hangi sekmedeyim" sorusuna sokuyordu.
   */
  view?: 'reorder' | 'fifo';
}

const PAGE = 60;
const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

const fmt = (n: number | null | undefined, d = 2) =>
  (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: d });

function tint(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return `rgba(10,10,10,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function MiniStat({ value, label, color }: { value: React.ReactNode; label: string; color: string }) {
  const U = useStockUI();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.6, lineHeight: 24, color }}>
        {value}
      </Text>
      <Text style={{
        fontSize: 10, fontWeight: '500', letterSpacing: 0.8,
        textTransform: 'uppercase', color: U.ink[400],
      }}>
        {label}
      </Text>
    </View>
  );
}

/** Güven rozeti — StatusChip spec, sakin tonlar */
function ConfidenceChip({ level }: { level: ReorderRow['confidence'] }) {
  const U = useStockUI();
  const map = {
    orta:  { bg: U.chipTones.success.bg, fg: U.chipTones.success.fg, label: 'Orta güven' },
    düşük: { bg: U.chipTones.warning.bg, fg: U.chipTones.warning.fg, label: 'Düşük güven' },
    yok:   { bg: U.hairline,      fg: U.ink[500], label: 'Veri yok' },
  } as const;
  const t = map[level] ?? map.yok;
  return (
    <View style={{
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.bg,
    }}>
      <Text style={{ fontSize: 11, fontWeight: '500', color: t.fg }}>{t.label}</Text>
    </View>
  );
}

export function FifoReorderScreen({ accentColor = DS.lab.primary, embedded = false, view, tabsNode }: Props) {
  const heroInk = useWhiteHeroInk(accentColor);
  // Tablo başlığı düz panel accent'i — metin luminance ile seçilir.
  const tblInk = onAccentInk(accentColor);
  const U = useStockUI();
  const router   = useRouter();
  const segments = useSegments();
  const panel    = (segments?.[0] as string) ?? '(lab)';

  const [loading, setLoading] = useState(true);
  const [tabRaw, setTab]      = useState<'reorder' | 'fifo'>(view ?? 'reorder');
  const tab = view ?? tabRaw;
  const [stock, setStock]     = useState<FifoStockRow[]>([]);
  const [rows, setRows]       = useState<ReorderRow[]>([]);
  const [uncovered, setUncovered] = useState(0);
  const [q, setQ]             = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [catFilter, setCatFilter]   = useState<string>('all');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [limit, setLimit]     = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    const [f, r, u] = await Promise.all([
      fetchFifoStock(), fetchReorderSuggestions(), fetchUncoveredCount(),
    ]);
    if (f.error) toast.error(f.error);
    if (r.error) toast.error(r.error);
    setStock(f.data); setRows(r.data); setUncovered(u);
    setLimit(PAGE);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Para birimi bazında FIFO değeri — kurlar KARIŞTIRILMAZ */
  const totals = useMemo(() => {
    const byCcy = new Map<string, number>();
    for (const s of stock) {
      const c = s.currency ?? 'TRY';
      byCcy.set(c, (byCcy.get(c) ?? 0) + (Number(s.fifo_value) || 0));
    }
    return [...byCcy.entries()].filter(([, v]) => v > 0);
  }, [stock]);

  const urgent = rows.filter(r => r.days_to_empty != null && r.days_to_empty <= 14).length;

  // Filtre çubuğundaki kategori listesi — görünen sekmenin verisinden.
  const categories = useMemo(() => {
    const src = tab === 'reorder' ? rows.map(r => r.category) : stock.map(x => x.category);
    return [...new Set(src.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [tab, rows, stock]);

  const visibleReorder = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      if (catFilter !== 'all' && (r.category ?? '') !== catFilter) return false;
      if (!s) return true;
      return r.item_name.toLowerCase().includes(s) || (r.category ?? '').toLowerCase().includes(s);
    });
  }, [rows, q, catFilter]);

  const visibleFifo = useMemo(() => {
    const s = q.trim().toLowerCase();
    return stock.filter(x => {
      if (x.open_layers <= 0) return false;
      if (catFilter !== 'all' && (x.category ?? '') !== catFilter) return false;
      if (!s) return true;
      return x.item_name.toLowerCase().includes(s) || (x.category ?? '').toLowerCase().includes(s);
    });
  }, [stock, q, catFilter]);

  const list  = tab === 'reorder' ? visibleReorder : visibleFifo;
  const shown = list.slice(0, limit);

  const goBack = () => safeBack(`/${panel}/stock?tab=orders&sub=fifo`);

  if (loading) {
    return (
      <ResponsiveCanvas size="lg" bgClassName="bg-transparent" padClassName={embedded ? 'pb-4' : undefined}>
        <View style={{ paddingVertical: 96, alignItems: 'center' }}>
          <ActivityIndicator color={accentColor} />
        </View>
      </ResponsiveCanvas>
    );
  }

  return (
    <ResponsiveCanvas size="lg" bgClassName="bg-transparent" padClassName={embedded ? 'pb-4' : undefined}>
      {!embedded ? (
        <>
      {/* ── Geri + eyebrow ─────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => ({
            width: 30, height: 30, borderRadius: 999, alignItems: 'center',
            justifyContent: 'center', backgroundColor: U.chipNeutral,
            opacity: pressed ? 0.6 : 1, ...webCursor,
          })}
        >
          {isRTL() ? <ChevronRight size={16} color={U.ink[700]} strokeWidth={1.8} /> : <ChevronLeft size={16} color={U.ink[700]} strokeWidth={1.8} />}
        </Pressable>
        <Text style={{
          fontSize: 11, fontWeight: '500', letterSpacing: 1.4,
          textTransform: 'uppercase', color: U.ink[500],
        }}>
          Envanter · FIFO
        </Text>
      </View>

      {/* ── Başlık ─────────────────────────────────────────────── */}
      <View style={{ gap: 6, marginBottom: 16 }}>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, lineHeight: 26, color: U.ink[900] }}>
          Stok Değeri ve Sipariş Önerisi
        </Text>
        <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 19, maxWidth: 640 }}>
          Maliyet ilk giren ilk çıkar yöntemiyle hesaplanır: aynı ürün farklı tarihlerde
          farklı fiyata alındıysa tüketim en eski katmandan maliyetlenir. Ortalama maliyet
          kullanılmaz.
        </Text>
      </View>
        </>
      ) : null}

      {/* ── Hero — "BEYAZ HERO" (core/ui/WhiteHero) ─────────────────
          Üç eşit MiniStat yan yana duruyordu ve hangisinin asıl cevap olduğu
          belli değildi. Prim Motoru hiyerarşisi: kicker → 44px FIFO stok
          değeri → bağlam cümlesi → sağda 40px stat'lar. Para birimleri
          TOPLANMAZ; başlık ilk dövizi gösterir, kalanlar kutucuk şeridinde. */}
      <WhiteHero
        kicker="Envanter · FIFO"
        accent={accentColor}
        title={
          totals.length > 0
            ? <Text style={{ color: heroInk.accentInk }}>{`${fmt(totals[0][1])} ${totals[0][0]}`}</Text>
            : '—'
        }
        description={
          `FIFO stok değeri` +
          (urgent > 0 ? ` · ${urgent} ürün 14 günde bitecek` : ' · 14 günde bitecek ürün yok') +
          (uncovered > 0 ? ` · ${uncovered} karşılıksız tüketim` : '')
        }
        stats={[
          { value: String(urgent),    label: '14 Günde' },
          { value: String(uncovered), label: 'Karşılıksız' },
        ]}
        cta={
          <Pressable
            onPress={load}
            style={({ pressed }) => ({
              width: 34, height: 34, borderRadius: 999, alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: heroInk.tileBg, borderWidth: 1, borderColor: heroInk.tileBorder,
              opacity: pressed ? 0.6 : 1, ...webCursor,
            })}
          >
            <RefreshCw size={14} color={heroInk.inkSoft} strokeWidth={1.8} />
          </Pressable>
        }
      >
        {/* Diğer para birimleri — toplanmaz, her biri kendi kutucuğunda. */}
        {totals.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {totals.slice(1).map(([ccy, v]) => (
              <View key={ccy} style={{
                flex: 1, minWidth: 110, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
                backgroundColor: heroInk.tileBg, borderWidth: 1, borderColor: heroInk.tileBorder,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: heroInk.inkSoft }}>
                  {ccy}
                </Text>
                <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.6, lineHeight: 24, color: heroInk.ink }}>
                  {fmt(v)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {uncovered > 0 ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14,
            paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
            backgroundColor: U.chipTones.warning.bg,
          }}>
            <Text style={{ fontSize: 12, color: U.chipTones.warning.fg, flex: 1, lineHeight: 18 }}>
              {`${uncovered} tüketim FIFO katmanıyla karşılanamadı — alış kaydı girilmemiş olabilir.`}
            </Text>
          </View>
        ) : null}
        {tabsNode}
      </WhiteHero>

      {/* ── Toolbar — uygulama genelindeki arama/filtre dili ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
          height: 38, paddingHorizontal: 12, borderRadius: 9999,
          backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline,
        }}>
          <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
          <TextInput
            style={{ flex: 1, fontSize: 13, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) } as any}
            value={q}
            onChangeText={setQ}
            placeholder="Ürün veya kategori ara..."
            placeholderTextColor={U.ink[400]}
          />
          {q.length > 0 && (
            <GlassTooltip title={autoT('Temizle')} text={autoT('Aramayı temizle')}>
              <Pressable onPress={() => setQ('')} hitSlop={8} style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}}>
                <X size={13} color={U.ink[400]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          )}
        </View>

        <GlassTooltip title={autoT('Filtrele')} text={autoT('Kategoriye göre süz')}>
          <Pressable
            onPress={() => setFilterOpen(v => !v)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              height: 38, paddingHorizontal: 14, borderRadius: 9999,
              backgroundColor: catFilter !== 'all' ? accentColor + '14' : U.surface,
              borderWidth: 1, borderColor: catFilter !== 'all' || filterOpen ? accentColor : U.hairline,
              ...webCursor,
            }}
          >
            <SlidersHorizontal size={14} color={catFilter !== 'all' ? accentColor : U.ink[500]} strokeWidth={1.8} />
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: catFilter !== 'all' ? accentColor : U.ink[500] }}>
              {autoT('Filtrele')}{catFilter !== 'all' ? ' (1)' : ''}
            </Text>
          </Pressable>
        </GlassTooltip>
      </View>

      {filterOpen && (
        <View style={{ marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12, color: U.ink[400], marginEnd: 4, fontWeight: '500' }}>Kategori:</Text>
          {['all', ...categories].map(c => {
            const active = catFilter === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCatFilter(c)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                  backgroundColor: active ? accentColor : U.plainBtn.bg,
                  borderWidth: 1, borderColor: active ? accentColor : U.hairline,
                  ...webCursor,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? onAccentInk(accentColor) : U.ink[700] }}>
                  {c === 'all' ? autoT('Tümü') : c}
                </Text>
              </Pressable>
            );
          })}
          {categories.length === 0 && (
            <Text style={{ fontSize: 12, color: U.ink[400] }}>Kategori bilgisi yok</Text>
          )}
        </View>
      )}

      {/* Araç çubuğu ile tablo arası nefes (kullanıcı isteği). */}
      <View style={{ height: 14 }} />

      {/* ── Liste ──────────────────────────────────────────────── */}
      {list.length === 0 ? (
        <View style={{ ...card(U), paddingVertical: 48, alignItems: 'center', gap: 10 }}>
          <View style={{
            width: 44, height: 44, borderRadius: 999, alignItems: 'center',
            justifyContent: 'center', backgroundColor: U.ink[100],
          }}>
            <Inbox size={19} color={U.ink[400]} strokeWidth={1.6} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }}>
            {q ? 'Aramayla eşleşen ürün yok'
               : tab === 'reorder' ? 'Öneri yok — tüketim verisi birikmemiş'
               : 'Açık FIFO katmanı yok'}
          </Text>
        </View>
      ) : (
        <View style={card(U)}>
          {/* Sütun başlıkları */}
          {/* Başlık şeridi düz panel accent'i — uygulama genelinde aynı dil. */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 10,
            backgroundColor: accentColor,
          }}>
            <Text style={{
              flex: 1, fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
              textTransform: 'uppercase', color: tblInk,
            }}>
              Ürün
            </Text>
            <Text style={{
              width: 200, textAlign: 'end' as any, fontSize: 10, fontWeight: '500',
              letterSpacing: 1.2, textTransform: 'uppercase', color: tblInk,
            }}>
              {tab === 'reorder' ? 'Tükeniş / Sipariş' : 'FIFO değeri'}
            </Text>
          </View>

          {tab === 'reorder'
            ? groupByCategory(shown as ReorderRow[], x => x.category, x => x.stock_item_id).map(entry => {
                if (entry.kind === 'header') {
                  return <CategoryHeaderRow key={entry.key} label={entry.label} count={entry.count} />;
                }
                const r = entry.item;
                const i = entry.indexInGroup;
                const soon    = r.days_to_empty != null && r.days_to_empty <= 14;
                const hovered = hoverId === r.stock_item_id;
                return (
                  <Pressable
                    key={r.stock_item_id}
                    onHoverIn={() => setHoverId(r.stock_item_id)}
                    onHoverOut={() => setHoverId(p => (p === r.stock_item_id ? null : p))}
                    style={{
                      backgroundColor: hovered ? U.rowHover : U.surface,
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: U.ink[100],
                      borderStartWidth: 2,
                      borderStartColor: soon ? tint(DS.lab.danger, 0.55) : 'transparent',
                      paddingStart: 18, paddingEnd: 20, paddingVertical: 13,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text numberOfLines={1} style={{
                            fontSize: 14, fontWeight: '600', letterSpacing: -0.2,
                            color: U.ink[900], flexShrink: 1,
                          }}>
                            {r.item_name}
                          </Text>
                          <ConfidenceChip level={r.confidence} />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 12, color: U.ink[500] }}>
                            Kalan{' '}
                            <Text style={{ fontWeight: '600', color: U.ink[800] }}>
                              {fmt(r.qty_on_hand, 3)} {r.unit ?? ''}
                            </Text>
                          </Text>
                          <Text style={{ fontSize: 12, color: U.ink[500] }}>
                            Hız{' '}
                            <Text style={{ fontWeight: '600', color: U.ink[800] }}>
                              {fmt(r.daily_rate, 3)}/gün
                            </Text>
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: U.ink[400] }}>{r.reason}</Text>
                      </View>

                      <View style={{ width: 200, alignItems: 'flex-end', gap: 3 }}>
                        {r.depletion_date ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <TrendingDown size={12} color={soon ? DS.lab.danger : U.ink[400]} strokeWidth={2} />
                            <Text style={{
                              fontSize: 13, fontWeight: '600',
                              color: soon ? DS.lab.danger : U.ink[800],
                            }}>
                              {r.depletion_date}
                            </Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 12, color: U.ink[300] }}>tahmin yok</Text>
                        )}
                        {r.days_to_empty != null ? (
                          <Text style={{ fontSize: 11, color: U.ink[400] }}>
                            {fmt(r.days_to_empty, 0)} gün kaldı
                          </Text>
                        ) : null}
                        {r.suggested_order_date ? (
                          <Text style={{ fontSize: 11, color: U.ink[500] }}>
                            Sipariş: {r.suggested_order_date}
                          </Text>
                        ) : null}
                        {r.suggested_qty > 0 ? (
                          <View style={{
                            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                            backgroundColor: tint(accentColor, 0.14), marginTop: 2,
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[800] }}>
                              Öneri: {fmt(r.suggested_qty, 2)} {r.unit ?? ''}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })
            : groupByCategory(shown as FifoStockRow[], x => x.category, x => x.stock_item_id).map(entry => {
                if (entry.kind === 'header') {
                  return <CategoryHeaderRow key={entry.key} label={entry.label} count={entry.count} />;
                }
                const s = entry.item;
                const i = entry.indexInGroup;
                const hovered = hoverId === s.stock_item_id;
                return (
                  <Pressable
                    key={s.stock_item_id}
                    onHoverIn={() => setHoverId(s.stock_item_id)}
                    onHoverOut={() => setHoverId(p => (p === s.stock_item_id ? null : p))}
                    style={{
                      backgroundColor: hovered ? U.rowHover : U.surface,
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: U.ink[100],
                      paddingHorizontal: 20, paddingVertical: 13,
                      flexDirection: 'row', alignItems: 'center', gap: 14,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text numberOfLines={1} style={{
                        fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: U.ink[900],
                      }}>
                        {s.item_name}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: U.ink[500] }}>
                        {s.open_layers} açık katman
                        {s.oldest_layer ? ` · en eski ${s.oldest_layer}` : ''}
                        {s.next_unit_cost != null
                          ? ` · sıradaki birim ${fmt(s.next_unit_cost)} ${s.currency ?? ''}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ width: 200, alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }}>
                        {fmt(s.fifo_value)}{' '}
                        <Text style={{ fontSize: 11, fontWeight: '400', color: U.ink[500] }}>
                          {s.currency ?? ''}
                        </Text>
                      </Text>
                      <Text style={{ fontSize: 11, color: U.ink[400] }}>
                        {fmt(s.qty_on_hand, 3)} {s.unit ?? ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}

          {list.length > shown.length ? (
            <Pressable
              onPress={() => setLimit(v => v + PAGE * 2)}
              style={({ pressed }) => ({
                paddingVertical: 14, alignItems: 'center',
                borderTopWidth: 1, borderTopColor: U.ink[100],
                opacity: pressed ? 0.6 : 1, ...webCursor,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>
                {list.length - shown.length} kalem daha göster
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ResponsiveCanvas>
  );
}


export default FifoReorderScreen;
