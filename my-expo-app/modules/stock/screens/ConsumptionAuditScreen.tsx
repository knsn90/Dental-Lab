/**
 * ConsumptionAuditScreen — Geçmiş Tüketim Denetimi (Envanter, Adım 1).
 *
 * SALT OKUNUR. Hiçbir hareketi, stoğu veya maliyeti değiştirmez. Görevi tek:
 * geçmişte girilmiş tüketim kayıtlarını standart tüketim profiliyle
 * karşılaştırıp "hangi kayıt şüpheli" sorusunu cevaplamak. Düzeltme kararı
 * insana ait — bu ekran karar vermez, kanıt gösterir.
 *
 * İKİ AYRI SORU, İKİ AYRI BÖLÜM:
 *   1. Girilmiş kayıtların miktarı doğru mu?  → denetim listesi
 *   2. Kayıt hiç girilmemiş aşamalar hangileri? → boşluk kartı (üstte, çünkü
 *      görülmeyen eksik, yanlış girilmiş kayıttan daha risklidir)
 *
 * TASARIM — DESIGN_LANGUAGE.md:
 *   • Tek yöntem: DS token + inline style (className karışımı yok — kural 11.8)
 *   • Display başlık: Inter Tight 300 + negatif tracking · kart radius 18
 *   • Sol renkli şerit YOK — şiddet, satır başındaki nokta ile verilir
 *   • Karşılaştırma her zaman ORTAK birimde gösterilir; paketli kalemde bu
 *     içerik birimidir (0.3 Adet ≠ 0.3 gr — 5 gr'lık pakette 1.5 gr eder)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';
import {
  ChevronLeft, Inbox, RefreshCw, Search, ShieldCheck, TriangleAlert, Wrench, X,
} from 'lucide-react-native';
import { ResponsiveCanvas } from '../../../core/layout/ResponsiveCanvas';
import { groupByCategory, CategoryHeaderRow } from '../categoryGroup';
import { DS } from '../../../core/theme/dsTokens';
import { toast } from '../../../core/ui/Toast';
import { ConsumptionFixModal } from '../components/ConsumptionFixModal';
import {
  fetchConsumptionAudit, fetchConsumptionGaps,
  type ConsumptionAuditRow, type ConsumptionGapRow,
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

const PAGE = 40;
const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

function tint(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return `rgba(10,10,10,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Defansif — ham toLocaleString çağrısı NaN/null'da çöküyor */
const fmt = (n: number | null | undefined, digits = 4) =>
  (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits });

const FLAG_LABEL: Record<string, string> = {
  kural_yok:         'kural yok',
  urun_baglanmamis:  'ürün bağlanmamış',
  lab_profili_yok:   'profil yok',
  asama_bulunamadi:  'aşama bulunamadı',
  asama_yok:         'aşamaya bağlı değil',
  birim_uyusmazligi: 'birim uyuşmazlığı',
  fazla:             'fazla düşülmüş',
  eksik:             'eksik düşülmüş',
  varsayim_kural:    'kural varsayım',
  istasyon_disi:     'istasyon dışı',
  ters_cevrildi:     'ters çevrilmiş',
};

/** Sapmanın okunabilir hâli: ×17.5 fazla · %65 eksik · uyumlu */
function deviationText(r: ConsumptionAuditRow): { text: string; color: string } {
  if (r.ratio == null) {
    if (r.flags.includes('birim_uyusmazligi')) return { text: 'birim farklı', color: DS.lab.danger };
    return { text: 'karşılaştırılamadı', color: DS.ink[400] };
  }
  const x = Number(r.ratio) || 0;
  if (x >= 1.25) {
    return { text: `×${x >= 10 ? x.toFixed(0) : x.toFixed(1)} fazla`, color: DS.lab.danger };
  }
  if (x <= 0.8) {
    return { text: `%${Math.round((1 - x) * 100)} eksik`, color: DS.lab.warning };
  }
  return { text: 'uyumlu', color: DS.lab.success };
}

function severityColor(s: number): string {
  if (s >= 3) return DS.lab.danger;
  if (s === 2) return DS.lab.warning;
  if (s === 1) return DS.ink[400];
  return DS.lab.success;
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
      backgroundColor: tint(color, 0.12),
    }}>
      <Text style={{ fontSize: 10, fontWeight: '500', color }}>{label}</Text>
    </View>
  );
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

type Filter = 'all' | 'deviation' | 'unit' | 'norule' | 'ok';

export function ConsumptionAuditScreen({ accentColor = DS.lab.primary, embedded = false }: Props) {
  const router   = useRouter();
  const segments = useSegments();
  const panel    = (segments?.[0] as string) ?? '(lab)';

  const [loading, setLoading] = useState(true);
  const [rows, setRows]       = useState<ConsumptionAuditRow[]>([]);
  const [gaps, setGaps]       = useState<ConsumptionGapRow[]>([]);
  const [q, setQ]             = useState('');
  const [filter, setFilter]   = useState<Filter>('all');
  const [limit, setLimit]     = useState(PAGE);
  const [fixRow, setFixRow]   = useState<ConsumptionAuditRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, g] = await Promise.all([fetchConsumptionAudit(), fetchConsumptionGaps()]);
    if (a.error) toast.error(a.error);
    if (g.error) toast.error(g.error);
    // flags her satırda dizi olmalı — tek bir null, tüm listeyi çökertir
    setRows(a.data.map(r => ({ ...r, flags: r.flags ?? [] })));
    setGaps(g.data);
    setLimit(PAGE);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total     = rows.length;
    const deviation = rows.filter(r => r.ratio != null && (r.ratio >= 1.25 || r.ratio <= 0.8)).length;
    const unit      = rows.filter(r => r.flags.includes('birim_uyusmazligi')).length;
    const norule    = rows.filter(r => r.expected_qty == null).length;
    const ok        = rows.filter(r => r.severity === 0).length;
    const orders    = new Set(rows.map(r => r.order_id).filter(Boolean)).size;
    const cost      = rows.reduce((a, r) => a + (Number(r.cost) || 0), 0);
    const currency  = rows.find(r => r.currency)?.currency ?? '';
    return { total, deviation, unit, norule, ok, orders, cost, currency };
  }, [rows]);

  const gapStats = useMemo(() => {
    const missing = gaps.reduce((a, g) => a + (Number(g.missing) || 0), 0);
    const done    = gaps.reduce((a, g) => a + (Number(g.done_stages) || 0), 0);
    return { missing, done };
  }, [gaps]);

  const visible = useMemo(() => {
    let list = rows;
    if (filter === 'deviation') list = list.filter(r => r.ratio != null && (r.ratio >= 1.25 || r.ratio <= 0.8));
    if (filter === 'unit')      list = list.filter(r => r.flags.includes('birim_uyusmazligi'));
    if (filter === 'norule')    list = list.filter(r => r.expected_qty == null);
    if (filter === 'ok')        list = list.filter(r => r.severity === 0);
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter(r =>
        r.item_name.toLowerCase().includes(s) ||
        (r.order_number ?? '').toLowerCase().includes(s) ||
        (r.stage_name ?? '').toLowerCase().includes(s));
    }
    return list;
  }, [rows, filter, q]);

  const shown = visible.slice(0, limit);

  const goBack = () => safeBack(`/${panel}/stock?tab=setup&sub=consumption_audit`);

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
          <ChevronLeft size={16} color={DS.ink[700]} strokeWidth={1.8} />
        </Pressable>
        <Text style={{
          fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
          textTransform: 'uppercase', color: DS.ink[500],
        }}>
          Envanter · Denetim
        </Text>
      </View>

      {/* ── Başlık ─────────────────────────────────────────────── */}
      <View style={{ gap: 6, marginBottom: 16 }}>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, lineHeight: 26, color: DS.ink[900] }}>
          Geçmiş Tüketim Denetimi
        </Text>
        <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19, maxWidth: 660 }}>
          Girilmiş tüketim kayıtları, standart tüketim profilinin beklediği miktarla
          karşılaştırılır. Bu ekran hiçbir kaydı değiştirmez — yalnız hangi kaydın
          şüpheli olduğunu gösterir.
        </Text>
      </View>
        </>
      ) : null}

      {/* ── Özet ───────────────────────────────────────────────── */}
      <View style={{
        backgroundColor: DS.lab.surface, borderRadius: 18, borderWidth: 1,
        borderColor: DS.ink[200], paddingHorizontal: 18, paddingVertical: 14,
        marginBottom: 16,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
            {stats.total} tüketim kaydı · {stats.orders} sipariş
          </Text>
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
          <MiniStat value={stats.deviation} label="Miktar sapması"
                    color={stats.deviation > 0 ? DS.lab.danger : DS.ink[400]} />
          <MiniStat value={stats.unit} label="Birim uyuşmazlığı"
                    color={stats.unit > 0 ? DS.lab.danger : DS.ink[400]} />
          <MiniStat value={stats.norule} label="Kuralsız"
                    color={stats.norule > 0 ? DS.lab.warning : DS.ink[400]} />
          <MiniStat value={stats.ok} label="Uyumlu"
                    color={stats.ok > 0 ? DS.lab.success : DS.ink[400]} />
          <MiniStat value={`${fmt(stats.cost, 2)} ${stats.currency}`} label="Kayıtlı maliyet"
                    color={DS.ink[900]} />
        </View>
      </View>

      {/* ── Boşluk kartı — hiç kayıt girilmemiş aşamalar ───────── */}
      {gapStats.missing > 0 ? (
        <View style={{
          backgroundColor: DS.lab.surface, borderRadius: 18, borderWidth: 1,
          borderColor: DS.ink[200], overflow: 'hidden', marginBottom: 16,
        }}>
          <View style={{
            paddingHorizontal: 18, paddingVertical: 14, gap: 6,
            borderBottomWidth: 1, borderBottomColor: DS.ink[100],
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TriangleAlert size={15} color={DS.lab.warning} strokeWidth={1.8} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
                Kaydı hiç girilmemiş aşamalar
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: DS.ink[500], lineHeight: 18, maxWidth: 620 }}>
              Tüketen istasyonlarda tamamlanan {gapStats.done} aşamanın {gapStats.missing} tanesinde
              hiç malzeme kaydı yok. Bu aşamalar için düzeltilecek bir miktar da yok —
              eksik stok ancak fiziksel sayımla kapanır.
            </Text>
          </View>

          {gaps.map((g, i) => {
            const pct = g.done_stages > 0
              ? Math.round((g.with_material / g.done_stages) * 100)
              : 0;
            return (
              <View
                key={g.station_id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 18, paddingVertical: 11,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: DS.ink[100],
                }}
              >
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: DS.ink[900] }}>
                  {g.station_name}
                </Text>
                <View style={{ width: 90, height: 3, borderRadius: 999, backgroundColor: DS.ink[100], overflow: 'hidden' }}>
                  <View style={{
                    height: '100%', width: `${pct}%`, borderRadius: 999,
                    backgroundColor: pct >= 80 ? DS.lab.success : pct > 0 ? accentColor : DS.ink[200],
                  }} />
                </View>
                <Text style={{ width: 108, textAlign: 'right', fontSize: 12, color: DS.ink[500] }}>
                  {g.missing} / {g.done_stages} kayıtsız
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* ── Arama + filtreler ──────────────────────────────────── */}
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
            placeholder="Ürün, sipariş no veya istasyon ara"
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
            { k: 'all',       l: 'Tümü',      n: stats.total },
            { k: 'deviation', l: 'Sapmalı',   n: stats.deviation },
            { k: 'unit',      l: 'Birim',     n: stats.unit },
            { k: 'norule',    l: 'Kuralsız',  n: stats.norule },
            { k: 'ok',        l: 'Uyumlu',    n: stats.ok },
          ] as const).map(f => {
            const on = filter === f.k;
            return (
              <Pressable
                key={f.k}
                onPress={() => { setFilter(f.k as Filter); setLimit(PAGE); }}
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

      {/* ── Denetim listesi ────────────────────────────────────── */}
      {visible.length === 0 ? (
        <View style={{
          backgroundColor: DS.lab.surface, borderRadius: 18, borderWidth: 1,
          borderColor: DS.ink[200], paddingVertical: 48, alignItems: 'center', gap: 10,
        }}>
          <View style={{
            width: 44, height: 44, borderRadius: 999, alignItems: 'center',
            justifyContent: 'center', backgroundColor: DS.ink[100],
          }}>
            {rows.length === 0
              ? <Inbox size={19} color={DS.ink[400]} strokeWidth={1.6} />
              : <ShieldCheck size={19} color={DS.ink[400]} strokeWidth={1.6} />}
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
            {rows.length === 0 ? 'Henüz tüketim kaydı yok' : 'Bu filtrede kayıt yok'}
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
              Kayıt
            </Text>
            <Text style={{
              width: 150, textAlign: 'right', fontSize: 10, fontWeight: '500',
              letterSpacing: 1.2, textTransform: 'uppercase', color: DS.ink[400],
            }}>
              Kayıtlı · Beklenen
            </Text>
            <Text style={{
              width: 110, textAlign: 'right', fontSize: 10, fontWeight: '500',
              letterSpacing: 1.2, textTransform: 'uppercase', color: DS.ink[400],
            }}>
              Sapma
            </Text>
            <View style={{ width: 84 }} />
          </View>

          {groupByCategory(shown, x => x.item_category, x => x.movement_id).map(entry => {
            if (entry.kind === 'header') {
              return <CategoryHeaderRow key={entry.key} label={entry.label} count={entry.count} />;
            }
            const r = entry.item;
            const i = entry.indexInGroup;
            const dev  = deviationText(r);
            const unit = r.norm_unit ?? r.item_unit ?? '';
            return (
              <View
                key={r.movement_id}
                style={{
                  paddingHorizontal: 18, paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: DS.ink[100],
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  {/* Şiddet noktası — sol renkli şerit yerine */}
                  <View style={{
                    width: 7, height: 7, borderRadius: 999, marginTop: 6,
                    backgroundColor: severityColor(r.severity),
                  }} />

                  {/* Birincil: ürün · İkincil: sipariş + istasyon */}
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text numberOfLines={1} style={{
                      fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: DS.ink[900],
                    }}>
                      {r.item_name}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: DS.ink[500] }}>
                      {r.order_number ?? '—'} · {r.stage_name ?? 'aşama yok'}
                      {r.tooth_count > 0 ? ` · ${r.tooth_count} diş` : ''}
                    </Text>
                    {r.basis ? (
                      <Text numberOfLines={1} style={{ fontSize: 11, color: DS.ink[400] }}>
                        Profil: {r.basis}
                      </Text>
                    ) : null}
                  </View>

                  {/* Kayıtlı vs beklenen — daima ortak birimde */}
                  <View style={{ width: 150, alignItems: 'flex-end', gap: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                      {fmt(r.recorded_norm)} {unit}
                    </Text>
                    <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                      {r.expected_norm != null ? `${fmt(r.expected_norm)} ${unit}` : 'beklenen yok'}
                    </Text>
                  </View>

                  {/* Sapma */}
                  <View style={{ width: 110, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: dev.color }}>
                      {dev.text}
                    </Text>
                    {r.cost != null && Number(r.cost) !== 0 ? (
                      <Text style={{ fontSize: 10, color: DS.ink[400] }}>
                        {fmt(r.cost, 2)} {r.currency ?? ''}
                      </Text>
                    ) : null}
                  </View>

                  {/* Düzeltme — kararı modal toplar, bu buton yalnız kapıyı açar */}
                  <Pressable
                    onPress={() => setFixRow(r)}
                    style={({ pressed }) => ({
                      width: 84, flexDirection: 'row', alignItems: 'center',
                      justifyContent: 'center', gap: 6,
                      paddingVertical: 7, borderRadius: 999,
                      backgroundColor: 'rgba(0,0,0,0.05)',
                      opacity: pressed ? 0.7 : 1, ...webCursor,
                    })}
                  >
                    <Wrench size={12} color={DS.ink[700]} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800] }}>
                      Düzelt
                    </Text>
                  </Pressable>
                </View>

                {r.flags.length > 0 ? (
                  <View style={{
                    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
                    marginTop: 8, marginLeft: 19,
                  }}>
                    {r.flags.map(f => (
                      <Chip
                        key={f}
                        label={FLAG_LABEL[f] ?? f}
                        color={
                          f === 'birim_uyusmazligi' || f === 'fazla' ? DS.lab.danger
                          : f === 'eksik' || f === 'kural_yok' || f === 'istasyon_disi' ? DS.lab.warning
                          : DS.ink[500]
                        }
                      />
                    ))}
                  </View>
                ) : null}
              </View>
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
                {visible.length - shown.length} kayıt daha göster
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {/* ── Sonraki adım — ekranın ne YAPMADIĞINI da söyler ────── */}
      <View style={{
        marginTop: 16, paddingHorizontal: 18, paddingVertical: 14,
        borderRadius: 18, borderWidth: 1, borderColor: DS.ink[200],
        backgroundColor: DS.lab.surface, gap: 4,
      }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>
          Bu liste bir öneri, hüküm değil
        </Text>
        <Text style={{ fontSize: 12, color: DS.ink[500], lineHeight: 18, maxWidth: 660 }}>
          "Beklenen" değer profil kurallarından gelir; kural varsayımsa ya da birim
          uyuşmuyorsa sapma gerçek olmayabilir — bu satırlarda profil değeri
          uygulanamaz, miktarı elle girmeniz gerekir. Düzeltme, orijinal kaydı ters
          çevirip yerine yeni kayıt yazar: stok, FIFO ve sipariş maliyeti
          kendiliğinden güncellenir, eski değerin izi kalır.
        </Text>
      </View>

      <View style={{ height: 32 }} />

      <ConsumptionFixModal
        visible={fixRow !== null}
        row={fixRow}
        accentColor={accentColor}
        onClose={() => setFixRow(null)}
        onDone={() => { setFixRow(null); load(); }}
      />
    </ResponsiveCanvas>
  );
}


export default ConsumptionAuditScreen;
