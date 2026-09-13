/**
 * ConsumptionProfileScreen — Standart Tüketim Profili (Envanter D2).
 *
 * Teknisyen miktar girmediği için tüketimi bu profil hesaplar. Ekran üç soruyu
 * birlikte cevaplar:
 *   1. Labın profili var mı? (yoksa global şablondan kopyalanır)
 *   2. Hangi malzeme × istasyon kombinasyonunda kural var, hangisinde yok?
 *   3. Hangi değerler hâlâ SIMAN varsayımı, hangileri lab tarafından onaylandı?
 *
 * KRİTİK: kuralı olmayan bir malzeme seçildiğinde stok DÜŞMEZ (K4) — seçim
 * "profil eksik" olarak kaydedilir. Bu yüzden kapsama oranı yayın eşiğidir.
 *
 * TASARIM — DESIGN_LANGUAGE.md:
 *   • Tek yöntem: DS token + inline style (className karışımı yok — kural 11.8)
 *   • Display başlık: Inter Tight 300 + negatif tracking
 *   • Kart: #FFF · radius 18 · 1px ink[200] · gölge yok · blok ritmi 16
 *   • Sorunlu satırlar önce gelir; tamamlananlar görsel olarak geri çekilir
 *   • Her uyarının bir sonraki adımı vardır — çıkmaz uyarı yok
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';
import {
  AlertTriangle, ArrowRight, ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Link2, RefreshCw, Sparkles,
} from '../../../core/ui/icons';
import { ResponsiveCanvas } from '../../../core/layout/ResponsiveCanvas';
import { DS } from '../../../core/theme/dsTokens';
import { useStockUI } from '../stockTheme';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { toast } from '../../../core/ui/Toast';
import {
  fetchLabProfile, fetchProfileCoverage, cloneProfileFromTemplate, upsertConsumptionRule,
  CALC_MODEL_LABEL, type CalcModel, type CoverageRow, type LabProfile,
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

const MODELS: CalcModel[] = ['fixed', 'per_tooth', 'per_jaw', 'per_unit', 'disc_yield'];

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

function tint(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return `rgba(10,10,10,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Satırın aciliyeti — küçük sayı önce gelir (sorunlar üstte) */
function severity(r: CoverageRow): number {
  const noRule = !r.has_rule;
  const noMap  = r.mapped_items === 0;
  if (noRule && noMap) return 0;   // hem kural hem ürün yok — üretimi tamamen bloke eder
  if (noRule)          return 1;   // kural yok → stok düşmez
  if (noMap)           return 2;   // kural var ama seçilecek ürün yok
  if (r.is_assumption) return 3;   // çalışır ama SIMAN varsayımı
  return 4;                        // tamam
}

/** Küçültülmüş BigStat — özet şeridi için */
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

/** Durum rozeti — StatusChip spec (pill, küçük, sakin renk) */
function Badge({ label, tone }: { label: string; tone: 'danger' | 'warning' | 'info' | 'muted' }) {
  const U = useStockUI();
  const tones = {
    danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
    warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
    info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
    muted:   { bg: U.hairline,      fg: U.ink[500] },
  } as const;
  const t = tones[tone];
  return (
    <View style={{
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.bg,
    }}>
      <Text style={{ fontSize: 11, fontWeight: '500', color: t.fg }}>{label}</Text>
    </View>
  );
}

export function ConsumptionProfileScreen({ accentColor = DS.lab.primary, embedded = false }: Props) {
  const U = useStockUI();
  const router   = useRouter();
  const segments = useSegments();
  const panel    = (segments?.[0] as string) ?? '(lab)';

  const [loading, setLoading]   = useState(true);
  const [profile, setProfile]   = useState<LabProfile | null>(null);
  const [rows, setRows]         = useState<CoverageRow[]>([]);
  const [cloning, setCloning]   = useState(false);
  const [draft, setDraft]       = useState<Record<string, { qty: string; model: CalcModel }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey]   = useState<string | null>(null);
  const [hoverKey, setHoverKey]   = useState<string | null>(null);
  const savedTimer = useRef<any>(null);
  const inputs = useRef<Record<string, TextInput | null>>({});

  const rowKey = (r: CoverageRow) => `${r.production_material_id}:${r.station_id ?? '-'}`;

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c] = await Promise.all([fetchLabProfile(), fetchProfileCoverage()]);
    if (p.error) toast.error('Profil okunamadı: ' + p.error);
    if (c.error) toast.error('Kapsama okunamadı: ' + c.error);
    setProfile(p.data);
    setRows(c.data);
    setDraft({});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const stats = useMemo(() => {
    const total      = rows.length;
    const withRule   = rows.filter(r => r.has_rule).length;
    const noRule     = total - withRule;
    const noMapping  = rows.filter(r => r.mapped_items === 0).length;
    const assumed    = rows.filter(r => r.has_rule && r.is_assumption).length;
    // Kullanılabilir = hem kural hem eşleşmiş ürün var; ikisinden biri eksikse tüketim oluşmaz
    const usable     = rows.filter(r => r.has_rule && r.mapped_items > 0).length;
    const pct        = total ? Math.round((usable / total) * 100) : 0;
    return { total, withRule, noRule, noMapping, assumed, usable, pct };
  }, [rows]);

  /** Sorunlar üstte — aynı aciliyette alfabetik */
  const ordered = useMemo(
    () => [...rows].sort((a, b) => {
      const d = severity(a) - severity(b);
      if (d !== 0) return d;
      return a.production_name.localeCompare(b.production_name, 'tr');
    }),
    [rows],
  );

  const readiness = stats.pct >= 80
    ? { label: 'Üretime hazır',       tone: 'ok' as const }
    : stats.pct >= 40
      ? { label: 'Dikkat gerekiyor',  tone: 'warn' as const }
      : { label: 'Yapılandırma eksik', tone: 'bad' as const };
  const readinessColor = readiness.tone === 'ok' ? DS.lab.success
                       : readiness.tone === 'warn' ? DS.lab.warning : DS.lab.danger;

  const clone = async () => {
    setCloning(true);
    const res = await cloneProfileFromTemplate();
    setCloning(false);
    if (!res.ok) { toast.error(res.error ?? 'Kopyalanamadı'); return; }
    toast.success('Şablon labınıza kopyalandı');
    load();
  };

  const saveRow = async (r: CoverageRow) => {
    const key = rowKey(r);
    const d = draft[key];
    const qty = parseFloat((d?.qty ?? String(r.qty ?? '')).replace(',', '.'));
    if (!isFinite(qty) || qty <= 0) { toast.error('Miktar 0’dan büyük olmalı'); return; }
    setSavingKey(key);
    const res = await upsertConsumptionRule({
      productionMaterialId: r.production_material_id,
      stationId: r.station_id,
      calcModel: d?.model ?? (r.calc_model ?? 'per_tooth'),
      qty,
      unit: r.unit,
    });
    setSavingKey(null);
    if (!res.ok) { toast.error(res.error ?? 'Kaydedilemedi'); return; }
    setSavedKey(key);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedKey(null), 2600);
    load();
  };

  const goBack = () => safeBack(`/${panel}/stock?tab=setup&sub=consumption_profile`);

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
            width: 30, height: 30, borderRadius: 999,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: U.chipNeutral, opacity: pressed ? 0.6 : 1, ...webCursor,
          })}
        >
          {isRTL()
            ? <ChevronRight size={16} color={U.ink[700]} strokeWidth={1.8} />
            : <ChevronLeft size={16} color={U.ink[700]} strokeWidth={1.8} />}
        </Pressable>
        <Text style={{
          fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
          textTransform: 'uppercase', color: U.ink[500],
        }}>
          Envanter · Profil
        </Text>
      </View>

      {/* ── Başlık ─────────────────────────────────────────────── */}
      <View style={{ gap: 6, marginBottom: 16 }}>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, lineHeight: 26, color: U.ink[900] }}>
          Standart Tüketim Profili
        </Text>
        <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 19, maxWidth: 640 }}>
          Teknisyen miktar girmez; tüketimi bu kurallar hesaplar. Kuralı olmayan bir malzeme
          seçilirse stok düşmez — seçim "profil eksik" olarak kaydedilir ve buraya düşer.
        </Text>
      </View>
        </>
      ) : null}

      {profile === null ? (
        /* ── Profil yok: tek eylem ────────────────────────────── */
        <View style={{
          backgroundColor: U.surface, borderRadius: 18, borderWidth: 1,
          borderColor: U.ink[200], padding: 24, gap: 12, alignItems: 'flex-start',
        }}>
          <View style={{
            width: 44, height: 44, borderRadius: 999, alignItems: 'center',
            justifyContent: 'center', backgroundColor: tint(accentColor, 0.14),
          }}>
            <Copy size={19} color={U.ink[800]} strokeWidth={1.6} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>
            Henüz lab profiliniz yok
          </Text>
          <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 19, maxWidth: 520 }}>
            SIMAN standart şablonundan kendi kopyanızı oluşturun. Şablon salt okunurdur;
            düzenlemeleriniz yalnız sizin kopyanıza işlenir.
          </Text>
          <Pressable
            onPress={clone}
            disabled={cloning}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
              backgroundColor: U.ink[900], marginTop: 4,
              opacity: cloning ? 0.5 : pressed ? 0.85 : 1, ...webCursor,
            })}
          >
            {cloning
              ? <ActivityIndicator size="small" color={U.onDarkPill} />
              : <Copy size={14} color={U.onDarkPill} strokeWidth={1.9} />}
            <Text style={{ fontSize: 13, fontWeight: '600', color: U.onDarkPill }}>
              {cloning ? 'Kopyalanıyor…' : 'Şablondan profil oluştur'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
      {/* ── Özet — scroll'da yapışık kalır (yalnız web) ─────── */}
          <View style={{
            backgroundColor: U.surface, borderRadius: 18, borderWidth: 1,
            borderColor: U.ink[200], paddingHorizontal: 18, paddingVertical: 14,
            marginBottom: 16,
            ...(Platform.OS === 'web'
              ? ({ position: 'sticky', top: 8, zIndex: 5 } as any)
              : {}),
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
            }}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: U.ink[900] }}>
                {profile.profile_name} · v{profile.version_no}
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                backgroundColor: tint(readinessColor, 0.12),
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: readinessColor }} />
                <Text style={{ fontSize: 11, fontWeight: '500', color: readinessColor }}>
                  {readiness.label}
                </Text>
              </View>
              <Pressable
                onPress={load}
                style={({ pressed }) => ({
                  width: 30, height: 30, borderRadius: 999, alignItems: 'center',
                  justifyContent: 'center', backgroundColor: U.chipNeutral,
                  opacity: pressed ? 0.6 : 1, ...webCursor,
                })}
              >
                <RefreshCw size={13} color={U.ink[500]} strokeWidth={1.8} />
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
              <MiniStat value={`%${stats.pct}`} label="Tamamlandı"
                        color={stats.pct >= 80 ? DS.lab.success : U.ink[900]} />
              <MiniStat value={`${stats.withRule}/${stats.total}`} label="Kural tanımlı" color={U.ink[900]} />
              <MiniStat value={stats.noRule} label="Kural yok"
                        color={stats.noRule > 0 ? DS.lab.danger : U.ink[400]} />
              <MiniStat value={stats.noMapping} label="Ürün bağlanmamış"
                        color={stats.noMapping > 0 ? DS.lab.warning : U.ink[400]} />
              <MiniStat value={stats.assumed} label="Varsayım"
                        color={stats.assumed > 0 ? DS.lab.info : U.ink[400]} />
            </View>

            <View style={{
              height: 3, borderRadius: 999, marginTop: 14,
              backgroundColor: U.ink[100], overflow: 'hidden',
            }}>
              <View style={{
                height: '100%', borderRadius: 999, width: `${stats.pct}%`,
                backgroundColor: stats.pct >= 80 ? DS.lab.success : accentColor,
              }} />
            </View>

            {stats.pct < 80 ? (
              <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 10, lineHeight: 18 }}>
                {autoT('Miktarsız akış için önerilen eşik %80. Eksik kalan {a} kombinasyonun {b} tanesinde kural yok, {c} tanesine hiç stok kalemi bağlanmamış.')
                  .replace('{a}', String(stats.total - stats.usable))
                  .replace('{b}', String(stats.noRule))
                  .replace('{c}', String(stats.noMapping))}
              </Text>
            ) : null}
          </View>

          {/* ── Kural listesi ──────────────────────────────────── */}
          <View style={{
            backgroundColor: U.surface, borderRadius: 18, borderWidth: 1,
            borderColor: U.ink[200], overflow: 'hidden',
          }}>
            {ordered.map((r, i) => {
              const key     = rowKey(r);
              const d       = draft[key];
              const model   = d?.model ?? (r.calc_model ?? 'per_tooth');
              const qtyText = d?.qty ?? (r.qty != null ? String(r.qty) : '');
              const dirty   = !!d;
              const noRule  = !r.has_rule;
              const noMap   = r.mapped_items === 0;
              const done    = r.has_rule && r.mapped_items > 0;
              const saved   = savedKey === key;
              const hovered = hoverKey === key;

              // Tamamlanan satırlar görsel olarak geri çekilir
              const bg = dirty ? tint(accentColor, 0.06)
                       : hovered ? U.ink[50]
                       : U.surface;

              return (
                <Pressable
                  key={key}
                  onHoverIn={() => setHoverKey(key)}
                  onHoverOut={() => setHoverKey(prev => (prev === key ? null : prev))}
                  style={{
                    backgroundColor: bg,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: U.ink[100],
                    borderStartWidth: 2,
                    borderStartColor: dirty ? accentColor
                                   : noRule ? tint(DS.lab.danger, 0.55)
                                   : noMap ? tint(DS.lab.warning, 0.5)
                                   : 'transparent',
                    paddingStart: 16, paddingEnd: 18, paddingVertical: 14,
                  }}
                >
                  {/* Satır 1 — Birincil: malzeme · İkincil: istasyon · rozetler */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text numberOfLines={1} style={{
                        fontSize: 14, fontWeight: '600', letterSpacing: -0.2,
                        color: done ? U.ink[700] : U.ink[900],
                      }}>
                        {r.production_name}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: U.ink[500] }}>
                        {r.station_name}
                      </Text>
                    </View>

                    {/* Kritik rozet daima önce */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {noRule ? <Badge label="Kural yok" tone="danger" /> : null}
                      {noMap  ? <Badge label="Ürün bağlanmamış" tone="warning" /> : null}
                      {!noRule && !noMap && r.is_assumption ? (
                        <Badge label="Varsayım" tone="info" />
                      ) : null}
                      {done && !r.is_assumption ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Check size={12} color={DS.lab.success} strokeWidth={2.4} />
                          <Text style={{ fontSize: 11, fontWeight: '500', color: '#1F6B47' }}>
                            Hazır
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Satır 2 — Üçüncül: hesap yöntemi */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {MODELS.map(m => {
                      const on = model === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => setDraft(p => ({ ...p, [key]: { qty: qtyText, model: m } }))}
                          style={({ pressed }) => ({
                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                            backgroundColor: on ? U.ink[900] : U.hairlineSoft,
                            opacity: pressed ? 0.7 : 1, ...webCursor,
                          })}
                        >
                          <Text style={{
                            fontSize: 12, fontWeight: '500', color: on ? U.onDarkPill : U.ink[700],
                          }}>
                            {CALC_MODEL_LABEL[m]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Satır 3 — Dördüncül: girdi · sonraki adım · kaydet */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <TextInput
                      ref={el => { inputs.current[key] = el; }}
                      value={qtyText}
                      onChangeText={t => setDraft(p => ({ ...p, [key]: { qty: t, model } }))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={U.ink[300]}
                      style={{
                        width: 104, paddingHorizontal: 12, paddingVertical: 8,
                        borderRadius: 12, borderWidth: 1, borderColor: U.ink[300],
                        fontSize: 13, color: U.ink[900], backgroundColor: U.surface,
                        ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                      }}
                    />
                    <Text style={{ fontSize: 12, color: U.ink[500] }}>{r.unit ?? ''}</Text>

                    {/* Her sorunun bir sonraki adımı var — çıkmaz uyarı yok */}
                    {noMap ? (
                      <Pressable
                        onPress={() => router.push(`/${panel}/material-mapping` as any)}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                          borderWidth: 1, borderColor: U.ink[300],
                          opacity: pressed ? 0.7 : 1, ...webCursor,
                        })}
                      >
                        <Link2 size={11} color={U.ink[700]} strokeWidth={1.8} />
                        <Text style={{ fontSize: 12, fontWeight: '500', color: U.ink[800] }}>
                          Ürün eşleştir
                        </Text>
                        {isRTL()
                          ? <ArrowLeft size={11} color={U.ink[500]} strokeWidth={1.8} />
                          : <ArrowRight size={11} color={U.ink[500]} strokeWidth={1.8} />}
                      </Pressable>
                    ) : noRule ? (
                      <Pressable
                        onPress={() => inputs.current[key]?.focus?.()}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                          borderWidth: 1, borderColor: U.ink[300],
                          opacity: pressed ? 0.7 : 1, ...webCursor,
                        })}
                      >
                        <AlertTriangle size={11} color="#9C5E0E" strokeWidth={1.9} />
                        <Text style={{ fontSize: 12, fontWeight: '500', color: U.ink[800] }}>
                          Kuralı tanımla
                        </Text>
                      </Pressable>
                    ) : null}

                    {/* Not: ileride AI önerisi bu şeride eklenecek
                        ("Önerilen kural · %96 güven · Uygula") — düzen hazır. */}

                    {r.note ? (
                      <Text numberOfLines={1} style={{
                        flex: 1, minWidth: 120, fontSize: 11, color: U.ink[400],
                      }}>
                        {r.note}
                      </Text>
                    ) : <View style={{ flex: 1, minWidth: 0 }} />}

                    {/* Kaydet yalnız değişiklik varken görünür — tekrar azalır */}
                    {dirty ? (
                      <Pressable
                        onPress={() => saveRow(r)}
                        disabled={savingKey === key}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                          backgroundColor: U.ink[900],
                          opacity: savingKey === key ? 0.5 : pressed ? 0.85 : 1, ...webCursor,
                        })}
                      >
                        {savingKey === key
                          ? <ActivityIndicator size="small" color={U.onDarkPill} />
                          : <Check size={12} color={U.onDarkPill} strokeWidth={2.4} />}
                        <Text style={{ fontSize: 12, fontWeight: '600', color: U.onDarkPill }}>
                          Kaydet
                        </Text>
                      </Pressable>
                    ) : saved ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Check size={12} color="#1F6B47" strokeWidth={2.4} />
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#1F6B47' }}>
                          Kaydedildi
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={{ height: 32 }} />
        </>
      )}
    </ResponsiveCanvas>
  );
}


export default ConsumptionProfileScreen;
