/**
 * InventoryVerificationScreen — Stok Sayımı (Envanter D3).
 *
 * Adı bilinçli olarak "stok sayımı" değil: amaç yalnız saymak değil, sistemin
 * tahmini ile fiziksel gerçeği karşılaştırıp dönemi güvenle kapatmaktır.
 *
 * Kullanıcıya "bu ay ne kadar kullandın?" SORULMAZ — yalnız elindeki gerçek
 * miktarı girer. Farkı, parasal etkisini ve düzeltme hareketini sistem üretir.
 *
 * Akış: taslak → sayım → onay (ADJUST hareketleri) → dönem kilidi.
 * Kapanan dönemin hareketleri DB trigger'ı ile değiştirilemez hale gelir.
 *
 * TASARIM — DESIGN_LANGUAGE.md:
 *   • Tek yöntem: DS token + inline style (className karışımı yok — kural 11.8)
 *   • Display başlık: Inter Tight 300 + negatif tracking · kart radius 18
 *   • Özet şeridi scroll'da yapışık kalır; sayım sırasında ilerleme görünür
 *   • Sayılmamış satırlar önce gelir — "sırada ne var" sorusunu ekran cevaplar
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';
import {
  ChevronLeft, ChevronRight, ClipboardList, Inbox, Lock, RefreshCw, Search, TrendingDown, TrendingUp, X,
} from 'lucide-react-native';
import { ResponsiveCanvas } from '../../../core/layout/ResponsiveCanvas';
import { groupByCategory, CategoryHeaderRow } from '../categoryGroup';
import { DS } from '../../../core/theme/dsTokens';
import { toast } from '../../../core/ui/Toast';
import { isRTL } from '../../../core/i18n';
import {
  listVerifications, fetchVerificationLines, openVerification, saveCount,
  approveVerification, closePeriod,
  type VerificationSummary, type VerificationLine,
} from '../api';

/** DESIGN_LANGUAGE §2 — display başlıklar daima light (300) */
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

interface Props {
  accentColor?: string;
  /** Hub içinde sekme olarak render ediliyor — kendi başlığını/geri butonunu gizler */
  embedded?: boolean;
}

const PAGE = 80;
const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

function tint(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return `rgba(10,10,10,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Ay başı/sonu — varsayılan dönem */
function monthRange(): { start: string; end: string } {
  const now = new Date();
  const s = new Date(now.getFullYear(), now.getMonth(), 1);
  const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return { start: f(s), end: f(e) };
}

const fmt = (n: number | null | undefined, digits = 2) =>
  (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits });

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

export function InventoryVerificationScreen({ accentColor = DS.lab.primary, embedded = false }: Props) {
  const router   = useRouter();
  const segments = useSegments();
  const panel    = (segments?.[0] as string) ?? '(lab)';

  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [active, setActive]   = useState<VerificationSummary | null>(null);
  const [lines, setLines]     = useState<VerificationLine[]>([]);
  const [q, setQ]             = useState('');
  const [filter, setFilter]   = useState<'all' | 'todo' | 'variance'>('all');
  const [drafts, setDrafts]   = useState<Record<string, string>>({});
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [limit, setLimit]     = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listVerifications();
    if (res.error) toast.error(res.error);
    const open = res.data.find(v => v.status === 'draft') ?? res.data[0] ?? null;
    setActive(open);
    if (open) {
      const l = await fetchVerificationLines(open.id);
      if (l.error) toast.error(l.error);
      setLines(l.data);
    } else {
      setLines([]);
    }
    setDrafts({});
    setLimit(PAGE);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const isDraft = active?.status === 'draft';

  const stats = useMemo(() => {
    const total     = lines.length;
    const counted   = lines.filter(l => l.counted).length;
    const variances = lines.filter(l => l.counted && (l.diff ?? 0) !== 0);
    const impact    = variances.reduce((a, l) => a + (Number(l.cost_impact) || 0), 0);
    const pct       = total ? Math.round((counted / total) * 100) : 0;
    return { total, counted, variances: variances.length, impact, pct };
  }, [lines]);

  /** Sayılmamışlar önce — "sırada ne var" ekranda görünür. Sonra sapmalılar. */
  const ordered = useMemo(() => {
    const rank = (l: VerificationLine) =>
      !l.counted ? 0 : (l.diff ?? 0) !== 0 ? 1 : 2;
    return [...lines].sort((a, b) => {
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return a.item_name.localeCompare(b.item_name, 'tr');
    });
  }, [lines]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = ordered;
    if (filter === 'todo')     list = list.filter(l => !l.counted);
    if (filter === 'variance') list = list.filter(l => l.counted && (l.diff ?? 0) !== 0);
    if (s) {
      list = list.filter(l =>
        l.item_name.toLowerCase().includes(s) ||
        (l.barcode ?? '').toLowerCase().includes(s) ||
        (l.category ?? '').toLowerCase().includes(s));
    }
    return list;
  }, [ordered, q, filter]);

  const shown = visible.slice(0, limit);

  const start = async () => {
    const { start: s, end: e } = monthRange();
    setBusy(true);
    const res = await openVerification(s, e);
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? 'Açılamadı'); return; }
    toast.success('Doğrulama taslağı açıldı');
    load();
  };

  const commitCount = async (l: VerificationLine) => {
    const raw = drafts[l.line_id];
    if (raw === undefined) return;
    const n = raw.trim() === '' ? null : parseFloat(raw.replace(',', '.'));
    if (n !== null && (!isFinite(n) || n < 0)) { toast.error('Geçersiz miktar'); return; }
    const res = await saveCount(l.line_id, n);
    if (!res.ok) { toast.error(res.error ?? 'Kaydedilemedi'); return; }
    setLines(prev => prev.map(x => x.line_id === l.line_id
      ? { ...x, physical_qty: n, counted: n !== null,
          diff: n === null ? null : n - x.system_qty,
          cost_impact: n === null ? null : +((n - x.system_qty) * (x.unit_cost ?? 0)).toFixed(2) }
      : x));
    setDrafts(p => { const c = { ...p }; delete c[l.line_id]; return c; });
  };

  const approve = async () => {
    if (!active) return;
    setBusy(true);
    const res = await approveVerification(active.id);
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? 'Onaylanamadı'); return; }
    toast.success(`${res.adjusted} düzeltme hareketi yazıldı`);
    load();
  };

  const close = async () => {
    if (!active) return;
    setBusy(true);
    const res = await closePeriod(active.id);
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? 'Kapatılamadı'); return; }
    toast.success('Dönem kilitlendi');
    load();
  };

  const goBack = () => safeBack(`/${panel}/stock?tab=setup&sub=inventory_verification`);

  if (loading) {
    return (
      <ResponsiveCanvas size="lg" bgClassName="bg-transparent">
        <View style={{ paddingVertical: 96, alignItems: 'center' }}>
          <ActivityIndicator color={accentColor} />
        </View>
      </ResponsiveCanvas>
    );
  }

  const statusChip = active
    ? active.status === 'draft'
      ? { label: 'Taslak',     bg: 'rgba(0,0,0,0.05)',      fg: DS.ink[700] }
      : active.status === 'approved'
        ? { label: 'Onaylandı', bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' }
        : { label: 'Kilitli',   bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' }
    : null;

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
          fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
          textTransform: 'uppercase', color: DS.ink[500],
        }}>
          Stok · Sayım
        </Text>
      </View>

      {/* ── Başlık ─────────────────────────────────────────────── */}
      <View style={{ gap: 6, marginBottom: 16 }}>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, lineHeight: 26, color: DS.ink[900] }}>
          Stok Sayımı
        </Text>
        <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19, maxWidth: 640 }}>
          Yalnız elinizdeki gerçek miktarı girin. Farkı, parasal etkisini ve düzeltme
          hareketini sistem hesaplar. Dönem kapatıldığında o döneme ait hareketler
          değiştirilemez.
        </Text>
      </View>
        </>
      ) : null}

      {!active ? (
        /* ── Doğrulama yok: tek eylem ─────────────────────────── */
        <View style={{
          backgroundColor: DS.lab.surface, borderRadius: 18, borderWidth: 1,
          borderColor: DS.ink[200], padding: 24, gap: 12, alignItems: 'flex-start',
        }}>
          <View style={{
            width: 44, height: 44, borderRadius: 999, alignItems: 'center',
            justifyContent: 'center', backgroundColor: tint(accentColor, 0.14),
          }}>
            <ClipboardList size={19} color={DS.ink[800]} strokeWidth={1.6} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>
            Henüz doğrulama yok
          </Text>
          <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19, maxWidth: 520 }}>
            Bu ay için taslak açtığınızda sistem, o andaki teorik miktarları dondurur —
            sayım sürerken yapılan hareketler farkı bozmaz.
          </Text>
          <Pressable
            onPress={start}
            disabled={busy}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
              backgroundColor: DS.ink[900], marginTop: 4,
              opacity: busy ? 0.5 : pressed ? 0.85 : 1, ...webCursor,
            })}
          >
            {busy
              ? <ActivityIndicator size="small" color="#FFF" />
              : <ClipboardList size={14} color="#FFF" strokeWidth={1.9} />}
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
              Bu ay için doğrulama başlat
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
      {/* ── Özet — scroll'da yapışık (yalnız web) ──────────── */}
          <View style={{
            backgroundColor: DS.lab.surface, borderRadius: 18, borderWidth: 1,
            borderColor: DS.ink[200], paddingHorizontal: 18, paddingVertical: 14,
            marginBottom: 16,
            ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 8, zIndex: 5 } as any) : {}),
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                {active.period_start} → {active.period_end}
              </Text>
              {statusChip ? (
                <View style={{
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                  backgroundColor: statusChip.bg,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: statusChip.fg }}>
                    {statusChip.label}
                  </Text>
                </View>
              ) : null}
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

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
              <MiniStat value={`%${stats.pct}`} label="Sayıldı"
                        color={stats.pct === 100 ? DS.lab.success : DS.ink[900]} />
              <MiniStat value={`${stats.counted}/${stats.total}`} label="Kalem" color={DS.ink[900]} />
              <MiniStat value={stats.variances} label="Sapma"
                        color={stats.variances > 0 ? DS.lab.warning : DS.ink[400]} />
              <MiniStat
                value={`${stats.impact > 0 ? '+' : ''}${fmt(stats.impact)}`}
                label="Parasal etki"
                color={stats.impact < 0 ? DS.lab.danger : stats.impact > 0 ? DS.lab.success : DS.ink[400]}
              />
            </View>

            <View style={{
              height: 3, borderRadius: 999, marginTop: 14,
              backgroundColor: DS.ink[100], overflow: 'hidden',
            }}>
              <View style={{
                height: '100%', borderRadius: 999, width: `${stats.pct}%`,
                backgroundColor: stats.pct === 100 ? DS.lab.success : accentColor,
              }} />
            </View>

            {/* Aksiyon — duruma göre tek net adım */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              {isDraft ? (
                <>
                  <Pressable
                    onPress={approve}
                    disabled={busy || stats.counted === 0}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                      backgroundColor: DS.ink[900],
                      opacity: busy || stats.counted === 0 ? 0.35 : pressed ? 0.85 : 1,
                      ...(Platform.OS === 'web'
                        ? ({ cursor: stats.counted === 0 ? 'not-allowed' : 'pointer' } as any) : {}),
                    })}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
                      Onayla ve düzeltmeleri yaz
                    </Text>
                  </Pressable>
                  <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                    {stats.counted === 0
                      ? 'Önce en az bir kalem sayın'
                      : `${stats.variances} sapma için düzeltme hareketi yazılacak`}
                  </Text>
                </>
              ) : active.status === 'approved' ? (
                <>
                  <Pressable
                    onPress={close}
                    disabled={busy}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                      backgroundColor: DS.ink[900], opacity: busy ? 0.5 : pressed ? 0.85 : 1,
                      ...webCursor,
                    })}
                  >
                    <Lock size={13} color="#FFF" strokeWidth={1.9} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
                      Dönemi kilitle
                    </Text>
                  </Pressable>
                  <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                    Kilitledikten sonra bu döneme ait hareketler değiştirilemez
                  </Text>
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Lock size={13} color={DS.ink[500]} strokeWidth={1.9} />
                  <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                    Bu dönem kilitli — hareketleri değiştirilemez
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Arama + filtreler ──────────────────────────────── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 14, height: 36, borderRadius: 999,
              backgroundColor: DS.lab.surface, borderWidth: 1, borderColor: DS.ink[200],
              flexGrow: 1, flexBasis: 240, minWidth: 0,
            }}>
              <Search size={14} color={DS.ink[400]} strokeWidth={1.8} />
              <TextInput
                value={q}
                onChangeText={t => { setQ(t); setLimit(PAGE); }}
                placeholder="Ürün adı, kategori veya barkod ara"
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

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {([
                { k: 'all',      l: 'Tümü',      n: stats.total },
                { k: 'todo',     l: 'Sayılmadı', n: stats.total - stats.counted },
                { k: 'variance', l: 'Sapmalı',   n: stats.variances },
              ] as const).map(f => {
                const on = filter === f.k;
                return (
                  <Pressable
                    key={f.k}
                    onPress={() => { setFilter(f.k); setLimit(PAGE); }}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                      backgroundColor: on ? DS.ink[900] : 'rgba(0,0,0,0.05)',
                      opacity: pressed ? 0.7 : 1, ...webCursor,
                    })}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '500', color: on ? '#FFF' : DS.ink[800] }}>
                      {f.l}
                    </Text>
                    <Text style={{ fontSize: 11, color: on ? 'rgba(255,255,255,0.6)' : DS.ink[400] }}>
                      {f.n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Sayım listesi ──────────────────────────────────── */}
          {visible.length === 0 ? (
            <View style={{
              backgroundColor: DS.lab.surface, borderRadius: 18, borderWidth: 1,
              borderColor: DS.ink[200], paddingVertical: 48, alignItems: 'center', gap: 10,
            }}>
              <View style={{
                width: 44, height: 44, borderRadius: 999, alignItems: 'center',
                justifyContent: 'center', backgroundColor: DS.ink[100],
              }}>
                <Inbox size={19} color={DS.ink[400]} strokeWidth={1.6} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
                {q ? 'Aramayla eşleşen kalem yok' : 'Bu filtrede kalem yok'}
              </Text>
            </View>
          ) : (
            <View style={{
              backgroundColor: DS.lab.surface, borderRadius: 18, borderWidth: 1,
              borderColor: DS.ink[200], overflow: 'hidden',
            }}>
              {/* Sütun başlıkları */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 18, paddingVertical: 10,
                backgroundColor: DS.ink[50], borderBottomWidth: 1, borderBottomColor: DS.ink[100],
              }}>
                <Text style={{
                  flex: 1, fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
                  textTransform: 'uppercase', color: DS.ink[400],
                }}>
                  Ürün
                </Text>
                <Text style={{
                  width: 108, textAlign: 'end' as any, fontSize: 10, fontWeight: '500',
                  letterSpacing: 1.2, textTransform: 'uppercase', color: DS.ink[400],
                }}>
                  Sayım
                </Text>
                <Text style={{
                  width: 120, textAlign: 'end' as any, fontSize: 10, fontWeight: '500',
                  letterSpacing: 1.2, textTransform: 'uppercase', color: DS.ink[400],
                }}>
                  Fark
                </Text>
              </View>

              {groupByCategory(shown, x => x.category, x => x.line_id).map(entry => {
                if (entry.kind === 'header') {
                  return <CategoryHeaderRow key={entry.key} label={entry.label} count={entry.count} />;
                }
                const l = entry.item;
                const i = entry.indexInGroup;
                const draft = drafts[l.line_id];
                const shownVal = draft !== undefined ? draft
                               : l.physical_qty != null ? String(l.physical_qty) : '';
                const diff    = l.diff;
                const hovered = hoverId === l.line_id;
                const dirty   = draft !== undefined;
                const hasVar  = l.counted && (diff ?? 0) !== 0;

                const bg = dirty ? tint(accentColor, 0.06)
                         : hovered ? DS.ink[50]
                         : DS.lab.surface;

                return (
                  <Pressable
                    key={l.line_id}
                    onHoverIn={() => setHoverId(l.line_id)}
                    onHoverOut={() => setHoverId(prev => (prev === l.line_id ? null : prev))}
                    style={{
                      backgroundColor: bg,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: DS.ink[100],
                      borderStartWidth: 2,
                      borderStartColor: hasVar ? tint(DS.lab.warning, 0.55) : 'transparent',
                      paddingStart: 16, paddingEnd: 18, paddingVertical: 11,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {/* Birincil: ürün · İkincil: sistem miktarı · Üçüncül: kategori */}
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text numberOfLines={1} style={{
                          fontSize: 14, fontWeight: '600', letterSpacing: -0.2,
                          color: l.counted ? DS.ink[700] : DS.ink[900],
                        }}>
                          {l.item_name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                            Sistem: {fmt(l.system_qty, 4)} {l.unit ?? ''}
                          </Text>
                          {l.category ? (
                            <Text numberOfLines={1} style={{
                              fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
                              color: DS.ink[400],
                            }}>
                              {l.category}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {/* Fiziksel miktar — TEK giriş alanı */}
                      <TextInput
                        value={shownVal}
                        onChangeText={t => setDrafts(p => ({ ...p, [l.line_id]: t }))}
                        onBlur={() => commitCount(l)}
                        editable={isDraft}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={DS.ink[300]}
                        style={{
                          width: 108, paddingHorizontal: 12, paddingVertical: 8,
                          borderRadius: 12, borderWidth: 1,
                          borderColor: l.counted ? tint(accentColor, 0.40) : DS.ink[300],
                          backgroundColor: isDraft ? DS.lab.surface : DS.ink[50],
                          fontSize: 13, color: DS.ink[900], textAlign: 'end' as any,
                          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                        }}
                      />

                      {/* Fark + parasal etki */}
                      <View style={{ width: 120, alignItems: 'flex-end', gap: 2 }}>
                        {diff == null ? (
                          <Text style={{ fontSize: 12, color: DS.ink[300] }}>sayılmadı</Text>
                        ) : diff === 0 ? (
                          <Text style={{ fontSize: 12, color: '#1F6B47' }}>eşit</Text>
                        ) : (
                          <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              {diff < 0
                                ? <TrendingDown size={12} color={DS.lab.danger} strokeWidth={2} />
                                : <TrendingUp size={12} color={DS.lab.success} strokeWidth={2} />}
                              <Text style={{
                                fontSize: 13, fontWeight: '600',
                                color: diff < 0 ? DS.lab.danger : DS.lab.success,
                              }}>
                                {diff > 0 ? '+' : ''}{fmt(diff, 4)}
                              </Text>
                            </View>
                            {l.cost_impact != null && l.cost_impact !== 0 ? (
                              <Text style={{ fontSize: 10, color: DS.ink[400] }}>
                                {fmt(l.cost_impact)} {l.currency ?? ''}
                              </Text>
                            ) : null}
                          </>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              {visible.length > shown.length ? (
                <Pressable
                  onPress={() => setLimit(v => v + PAGE * 2)}
                  style={({ pressed }) => ({
                    paddingVertical: 14, alignItems: 'center',
                    borderTopWidth: 1, borderTopColor: DS.ink[100],
                    opacity: pressed ? 0.6 : 1, ...webCursor,
                  })}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[700] }}>
                    {visible.length - shown.length} kalem daha göster
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <View style={{ height: 32 }} />
        </>
      )}
    </ResponsiveCanvas>
  );
}


export default InventoryVerificationScreen;
