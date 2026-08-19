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
  AlertTriangle, ChevronLeft, ChevronRight, Inbox, Layers, RefreshCw, Search,
  ShoppingCart, TrendingDown, X,
} from 'lucide-react-native';
import { ResponsiveCanvas } from '../../../core/layout/ResponsiveCanvas';
import { groupByCategory, CategoryHeaderRow } from '../categoryGroup';
import { DS } from '../../../core/theme/dsTokens';
import { isRTL } from '../../../core/i18n';
import { toast } from '../../../core/ui/Toast';
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
const CARD: any = {
  backgroundColor: '#FFF',
  borderRadius: 18,
  borderWidth: 1,
  borderColor: DS.ink[200],
  overflow: 'hidden',
};

interface Props {
  accentColor?: string;
  /** Hub içinde sekme olarak render ediliyor — kendi başlığını/geri butonunu gizler */
  embedded?: boolean;
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
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.6, lineHeight: 24, color }}>
        {value}
      </Text>
      <Text style={{
        fontSize: 10, fontWeight: '500', letterSpacing: 0.8,
        textTransform: 'uppercase', color: DS.ink[400],
      }}>
        {label}
      </Text>
    </View>
  );
}

/** Güven rozeti — StatusChip spec, sakin tonlar */
function ConfidenceChip({ level }: { level: ReorderRow['confidence'] }) {
  const map = {
    orta:  { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47', label: 'Orta güven' },
    düşük: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E', label: 'Düşük güven' },
    yok:   { bg: 'rgba(0,0,0,0.05)',      fg: DS.ink[500], label: 'Veri yok' },
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

export function FifoReorderScreen({ accentColor = DS.lab.primary, embedded = false, view }: Props) {
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

  const visibleReorder = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      r.item_name.toLowerCase().includes(s) || (r.category ?? '').toLowerCase().includes(s));
  }, [rows, q]);

  const visibleFifo = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = stock.filter(x => x.open_layers > 0);
    if (!s) return base;
    return base.filter(x =>
      x.item_name.toLowerCase().includes(s) || (x.category ?? '').toLowerCase().includes(s));
  }, [stock, q]);

  const list  = tab === 'reorder' ? visibleReorder : visibleFifo;
  const shown = list.slice(0, limit);

  const goBack = () => safeBack(`/${panel}/stock?tab=orders&sub=fifo`);

  if (loading) {
    return (
      <ResponsiveCanvas size="lg" bgClassName="bg-transparent">
        <View style={{ paddingVertical: 96, alignItems: 'center' }}>
          <ActivityIndicator color={accentColor} />
        </View>
      </ResponsiveCanvas>
    );
  }

  return (
    <ResponsiveCanvas size="lg" bgClassName="bg-transparent">
      {!embedded ? (
        <>
      {/* ── Geri + eyebrow ─────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => ({
            width: 30, height: 30, borderRadius: 999, alignItems: 'center',
            justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)',
            opacity: pressed ? 0.6 : 1, ...webCursor,
          })}
        >
          {isRTL() ? <ChevronRight size={16} color={DS.ink[700]} strokeWidth={1.8} /> : <ChevronLeft size={16} color={DS.ink[700]} strokeWidth={1.8} />}
        </Pressable>
        <Text style={{
          fontSize: 11, fontWeight: '500', letterSpacing: 1.4,
          textTransform: 'uppercase', color: DS.ink[500],
        }}>
          Envanter · FIFO
        </Text>
      </View>

      {/* ── Başlık ─────────────────────────────────────────────── */}
      <View style={{ gap: 6, marginBottom: 16 }}>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, lineHeight: 26, color: DS.ink[900] }}>
          Stok Değeri ve Sipariş Önerisi
        </Text>
        <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19, maxWidth: 640 }}>
          Maliyet ilk giren ilk çıkar yöntemiyle hesaplanır: aynı ürün farklı tarihlerde
          farklı fiyata alındıysa tüketim en eski katmandan maliyetlenir. Ortalama maliyet
          kullanılmaz.
        </Text>
      </View>
        </>
      ) : null}

      {/* ── Özet — scroll'da yapışık (yalnız web) ──────────────── */}
      <View style={{
        ...CARD, paddingHorizontal: 20, paddingVertical: 16, marginBottom: 16,
        ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 8, zIndex: 5 } as any) : {}),
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
          {totals.length === 0 ? (
            <MiniStat value="—" label="FIFO stok değeri" color={DS.ink[400]} />
          ) : totals.map(([ccy, v]) => (
            <MiniStat
              key={ccy}
              value={`${fmt(v)} ${ccy}`}
              label="FIFO stok değeri"
              color={DS.ink[900]}
            />
          ))}
          <MiniStat
            value={urgent}
            label="14 günde bitecek"
            color={urgent > 0 ? DS.lab.danger : DS.ink[400]}
          />
          <MiniStat
            value={uncovered}
            label="Karşılıksız tüketim"
            color={uncovered > 0 ? DS.lab.warning : DS.ink[400]}
          />

          <View style={{ flex: 1, minWidth: 0 }} />

          <Pressable
            onPress={load}
            style={({ pressed }) => ({
              width: 30, height: 30, borderRadius: 999, alignItems: 'center',
              justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)',
              opacity: pressed ? 0.6 : 1, ...webCursor,
            })}
          >
            <RefreshCw size={13} color={DS.ink[500]} strokeWidth={1.8} />
          </Pressable>
        </View>

        {uncovered > 0 ? (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14,
            paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
            backgroundColor: 'rgba(232,155,42,0.10)',
          }}>
            <AlertTriangle size={13} color="#9C5E0E" strokeWidth={1.9} />
            <Text style={{ fontSize: 12, color: '#9C5E0E', flex: 1, lineHeight: 18 }}>
              {uncovered} tüketim için yeterli stok katmanı yoktu — maliyetleri son bilinen
              birim fiyattan tahmin edildi. Bu, satın alınandan fazla tüketim veya eksik alış
              kaydı anlamına gelir.
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Sekme + arama ──────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, display: view ? 'none' : 'flex' }}>
          {([
            { k: 'reorder', l: 'Sipariş Önerisi', icon: ShoppingCart, n: rows.length },
            { k: 'fifo',    l: 'FIFO Katmanları', icon: Layers,       n: visibleFifo.length },
          ] as const).map(t => {
            const on = tab === t.k;
            const Icon = t.icon;
            return (
              <Pressable
                key={t.k}
                onPress={() => { setTab(t.k); setLimit(PAGE); }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: on ? DS.ink[900] : 'rgba(0,0,0,0.05)',
                  opacity: pressed ? 0.7 : 1, ...webCursor,
                })}
              >
                <Icon size={13} color={on ? '#FFF' : DS.ink[700]} strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: '500', color: on ? '#FFF' : DS.ink[800] }}>
                  {t.l}
                </Text>
                <Text style={{ fontSize: 11, color: on ? 'rgba(255,255,255,0.6)' : DS.ink[400] }}>
                  {t.n}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 14, height: 36, borderRadius: 999,
          backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200],
          flexGrow: 1, flexBasis: 220, minWidth: 0,
        }}>
          <Search size={14} color={DS.ink[400]} strokeWidth={1.8} />
          <TextInput
            value={q}
            onChangeText={t => { setQ(t); setLimit(PAGE); }}
            placeholder="Ürün ara..."
            placeholderTextColor={DS.ink[400]}
            style={{
              flex: 1, fontSize: 13, color: DS.ink[900],
              ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
            }}
          />
          {q.length > 0 ? (
            <Pressable onPress={() => setQ('')} style={webCursor}>
              <X size={13} color={DS.ink[400]} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Liste ──────────────────────────────────────────────── */}
      {list.length === 0 ? (
        <View style={{ ...CARD, paddingVertical: 48, alignItems: 'center', gap: 10 }}>
          <View style={{
            width: 44, height: 44, borderRadius: 999, alignItems: 'center',
            justifyContent: 'center', backgroundColor: DS.ink[100],
          }}>
            <Inbox size={19} color={DS.ink[400]} strokeWidth={1.6} />
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
            {q ? 'Aramayla eşleşen ürün yok'
               : tab === 'reorder' ? 'Öneri yok — tüketim verisi birikmemiş'
               : 'Açık FIFO katmanı yok'}
          </Text>
        </View>
      ) : (
        <View style={CARD}>
          {/* Sütun başlıkları */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 10,
            backgroundColor: DS.ink[50], borderBottomWidth: 1, borderBottomColor: DS.ink[100],
          }}>
            <Text style={{
              flex: 1, fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
              textTransform: 'uppercase', color: DS.ink[400],
            }}>
              Ürün
            </Text>
            <Text style={{
              width: 200, textAlign: 'end' as any, fontSize: 10, fontWeight: '500',
              letterSpacing: 1.2, textTransform: 'uppercase', color: DS.ink[400],
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
                      backgroundColor: hovered ? DS.ink[50] : '#FFF',
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: DS.ink[100],
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
                            color: DS.ink[900], flexShrink: 1,
                          }}>
                            {r.item_name}
                          </Text>
                          <ConfidenceChip level={r.confidence} />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                            Kalan{' '}
                            <Text style={{ fontWeight: '600', color: DS.ink[800] }}>
                              {fmt(r.qty_on_hand, 3)} {r.unit ?? ''}
                            </Text>
                          </Text>
                          <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                            Hız{' '}
                            <Text style={{ fontWeight: '600', color: DS.ink[800] }}>
                              {fmt(r.daily_rate, 3)}/gün
                            </Text>
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: DS.ink[400] }}>{r.reason}</Text>
                      </View>

                      <View style={{ width: 200, alignItems: 'flex-end', gap: 3 }}>
                        {r.depletion_date ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <TrendingDown size={12} color={soon ? DS.lab.danger : DS.ink[400]} strokeWidth={2} />
                            <Text style={{
                              fontSize: 13, fontWeight: '600',
                              color: soon ? DS.lab.danger : DS.ink[800],
                            }}>
                              {r.depletion_date}
                            </Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 12, color: DS.ink[300] }}>tahmin yok</Text>
                        )}
                        {r.days_to_empty != null ? (
                          <Text style={{ fontSize: 11, color: DS.ink[400] }}>
                            {fmt(r.days_to_empty, 0)} gün kaldı
                          </Text>
                        ) : null}
                        {r.suggested_order_date ? (
                          <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                            Sipariş: {r.suggested_order_date}
                          </Text>
                        ) : null}
                        {r.suggested_qty > 0 ? (
                          <View style={{
                            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                            backgroundColor: tint(accentColor, 0.14), marginTop: 2,
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[800] }}>
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
                      backgroundColor: hovered ? DS.ink[50] : '#FFF',
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: DS.ink[100],
                      paddingHorizontal: 20, paddingVertical: 13,
                      flexDirection: 'row', alignItems: 'center', gap: 14,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text numberOfLines={1} style={{
                        fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: DS.ink[900],
                      }}>
                        {s.item_name}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: DS.ink[500] }}>
                        {s.open_layers} açık katman
                        {s.oldest_layer ? ` · en eski ${s.oldest_layer}` : ''}
                        {s.next_unit_cost != null
                          ? ` · sıradaki birim ${fmt(s.next_unit_cost)} ${s.currency ?? ''}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ width: 200, alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
                        {fmt(s.fifo_value)}{' '}
                        <Text style={{ fontSize: 11, fontWeight: '400', color: DS.ink[500] }}>
                          {s.currency ?? ''}
                        </Text>
                      </Text>
                      <Text style={{ fontSize: 11, color: DS.ink[400] }}>
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
                borderTopWidth: 1, borderTopColor: DS.ink[100],
                opacity: pressed ? 0.6 : 1, ...webCursor,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[700] }}>
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
