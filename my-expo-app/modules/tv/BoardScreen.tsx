// modules/tv/BoardScreen.tsx — Lab CANLI ÜRETİM DUVARI (TV)
// UI/UX refinement (kontrollü iyileştirme — yeniden tasarım DEĞİL):
//   • Koyu lacivert zemin · beyaz/gri tipografi · mavi vurgu · kırmızı yalnız sorun
//   • Minimal: kart/gradient/gölge/dekoratif YOK; hairline ayraç + cömert boşluk
//   • KPI = metric rail (sayı büyük / etiket küçük uppercase)
//   • Üretim hattı = tek yatay konveyör, güçlü ve ekran genişliğini kullanır
//   • "Şu an çalışılıyor" = premium Live Job kompozisyonu (büyük timer)
//   • "Dikkat" = operasyonel uyarı listesi (WHO→WHAT→WHY→HOW)
//   • Tipografi çözünürlüğe göre ölçeklenir (1920×1080 hedef)
// Veri modeli / state / polling DEĞİŞMEDİ. Yalnız görsel sunum.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Platform, Image, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { autoT } from '../../core/i18n/autoTranslate';
import { localeTag } from '../../core/i18n';
import { useAuthStore } from '../../core/store/authStore';
import { supabase } from '../../core/api/supabase';
import { TV } from '../../core/tv/tvTheme';
import { fetchBoard, FLOW, type BoardData, type ActiveJob, type AttentionItem, type AttentionKind } from './api';

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const, fontWeight: '300' as const };
const REFRESH_MS = 20_000;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function BoardScreen() {
  const { i18n } = useTranslation();
  const { width, height } = useWindowDimensions();
  const S = clamp(Math.min(width / 1920, height / 1080), 0.72, 1.25);
  const fs = (n: number) => Math.round(n * S);

  const [data, setData] = useState<BoardData | null>(null);
  const [now, setNow]   = useState<string>('');

  const clock = useCallback(() => {
    setNow(new Date().toLocaleTimeString(localeTag(i18n.language), { hour: '2-digit', minute: '2-digit' }));
  }, [i18n.language]);
  const load = useCallback(async () => { try { setData(await fetchBoard()); } catch { /* pano çökmesin */ } }, []);

  useEffect(() => {
    clock(); load();
    const t1 = setInterval(load, REFRESH_MS);
    const t2 = setInterval(clock, 15_000);
    // Tek "CANLI" nabız keyframe'i — bir KEZ enjekte (saatlerce çalışsa da dup yok).
    if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('tv-anim-kf')) {
      const el = document.createElement('style');
      el.id = 'tv-anim-kf';
      el.textContent = '@keyframes tvpulse{0%{transform:scale(1);opacity:.45}70%{transform:scale(2.6);opacity:0}100%{opacity:0}}';
      document.head.appendChild(el);
    }
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [load, clock]);

  const kpi = data?.kpi ?? { active: 0, waiting: 0, delayed: 0, deliveredToday: 0 };
  const flow = data?.flow ?? FLOW.map(f => ({ ...f, count: 0, active: 0 }));
  const activeJobs = data?.activeJobs ?? [];
  const attention = data?.attention ?? [];
  const todayLabel = new Date().toLocaleDateString(localeTag(i18n.language), { weekday: 'long', day: '2-digit', month: 'long' });

  const HAIR = TV.hair;
  const maxActive = clamp(Math.floor((height * 0.88 - 450 * S) / (140 * S)), 1, 5);

  return (
    <View style={{ flex: 1 }}>
      {/* ═══ HEADER ═══ */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: fs(16) }}>
        <BoardLabLogo h={fs(22)} />
        <PulseDot />
        <Text style={{ fontSize: fs(13), fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase', color: TV.ink2 }}>
          {autoT('Canlı Üretim')}
        </Text>
        <Text style={{ fontSize: fs(15), color: TV.ink3, textTransform: 'capitalize' }}>· {todayLabel}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ ...DISPLAY, fontSize: fs(60), color: TV.ink, letterSpacing: -2, lineHeight: fs(60), ...(Platform.OS === 'web' ? { fontVariant: ['tabular-nums'] } as any : {}) }}>
          {now}
        </Text>
      </View>

      {/* ═══ KPI RAIL — sayı büyük, etiket küçük; kart yok ═══ */}
      <View style={{ flexDirection: 'row', alignItems: 'stretch', marginTop: fs(24), paddingBottom: fs(22), borderBottomWidth: 1, borderBottomColor: HAIR }}>
        <Metric fs={fs} value={kpi.active}         label={autoT('Çalışıyor')} tone={TV.accent} />
        <VDiv />
        <Metric fs={fs} value={kpi.waiting}        label={autoT('Bekliyor')} tone={TV.ink} />
        <VDiv />
        <Metric fs={fs} value={kpi.delayed}        label={autoT('Gecikmiş')} tone={TV.danger} />
        <VDiv />
        <Metric fs={fs} value={kpi.deliveredToday} label={autoT('Teslim')}   tone={TV.success} />
      </View>

      {/* ═══ ÜRETİM HATTI — tek sürekli konveyör ═══ */}
      <Text style={{ fontSize: fs(13), fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', color: TV.ink3, marginTop: fs(26), marginBottom: fs(10) }}>
        {autoT('Üretim Hattı')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {flow.map((n, i) => (
          <FlowCell key={n.key} node={n} fs={fs} first={i === 0} last={i === flow.length - 1} />
        ))}
      </View>

      {/* ═══ ALT — 2/3 ŞU AN ÇALIŞILIYOR · 1/3 DİKKAT ═══ */}
      <View style={{ flex: 1, flexDirection: 'row', marginTop: fs(30), gap: fs(30) }}>
        {/* SOL (2/3) — ANA SAHNE */}
        <View style={{ flex: 2 }}>
          <SectionLabel fs={fs}>{autoT('Şu an çalışılıyor')}</SectionLabel>
          {activeJobs.length === 0 ? (
            <EmptyStage fs={fs} />
          ) : activeJobs.length === 1 ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <HeroJob job={activeJobs[0]} fs={fs} />
            </View>
          ) : (
            <View style={{ marginTop: fs(14) }}>
              {activeJobs.slice(0, maxActive).map((j, idx) => (
                <ActiveJobRow key={j.id} job={j} fs={fs} hair={HAIR} first={idx === 0} />
              ))}
              {activeJobs.length > maxActive && (
                <Text style={{ fontSize: fs(15), color: TV.ink3, paddingTop: fs(16) }}>
                  +{activeJobs.length - maxActive} {autoT('iş daha çalışılıyor')}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ince dikey ayraç */}
        <View style={{ width: 1, backgroundColor: HAIR }} />

        {/* SAĞ (1/3) */}
        <View style={{ flex: 1 }}>
          <SectionLabel fs={fs} tone={attention.length > 0 ? TV.warning : undefined}>{autoT('Dikkat')}</SectionLabel>
          {attention.length === 0 ? (
            <Text style={{ fontSize: fs(17), color: TV.ink3, marginTop: fs(14) }}>{autoT('Her şey yolunda')}</Text>
          ) : (
            <View style={{ marginTop: fs(14) }}>
              {attention.slice(0, 4).map((a, idx) => <AttentionItemRow key={a.id} item={a} fs={fs} hair={HAIR} first={idx === 0} />)}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/* ── HEADER parçaları ── */

function BoardLabLogo({ h }: { h: number }) {
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? null;
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!labId) { if (alive) setLogo(null); return; }
      const { data } = await supabase.rpc('get_lab_brand', { p_lab_id: labId }).maybeSingle();
      if (alive) setLogo((data as any)?.logo_url ?? null);
    })();
    return () => { alive = false; };
  }, [labId]);
  if (!logo) return null;
  const W = Math.round(h * 4.4);
  if (Platform.OS === 'web') {
    // @ts-ignore RN-Web img passthrough — aynı logo düz beyaz (plaka yok)
    return <img src={logo} width={W} height={h} style={{ filter: 'brightness(0) invert(1)', objectFit: 'contain', display: 'block' }} />;
  }
  return <Image source={{ uri: logo }} style={{ width: W, height: h }} resizeMode="contain" tintColor="#FFFFFF" />;
}

function PulseDot() {
  return (
    <View style={{ width: 11, height: 11, alignItems: 'center', justifyContent: 'center' }}>
      {Platform.OS === 'web' && <View style={{ position: 'absolute', width: 11, height: 11, borderRadius: 6, backgroundColor: TV.success, opacity: 0.4, ...( { animationName: 'tvpulse', animationDuration: '2s', animationIterationCount: 'infinite' } as any) }} />}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TV.success }} />
    </View>
  );
}

function SectionLabel({ children, tone, fs }: { children: React.ReactNode; tone?: string; fs: (n: number) => number }) {
  return (
    <Text style={{ fontSize: fs(13), fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', color: tone ?? TV.ink3 }}>{children}</Text>
  );
}

function VDiv() {
  return <View style={{ width: 1, alignSelf: 'center', height: '62%', backgroundColor: TV.hair }} />;
}

/* ── KPI RAIL — dikey: büyük sayı / küçük etiket ── */
function Metric({ value, label, tone, fs }: { value: number; label: string; tone: string; fs: (n: number) => number }) {
  const numColor = value === 0 ? TV.ink3 : tone;
  return (
    <View style={{ flex: 1, alignItems: 'flex-start', paddingHorizontal: fs(22) }}>
      <Text style={{ ...DISPLAY, fontSize: fs(66), color: numColor, letterSpacing: -2.5, lineHeight: fs(66), ...(Platform.OS === 'web' ? { fontVariant: ['tabular-nums'] } as any : {}) }}>{value}</Text>
      <Text style={{ fontSize: fs(15), fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', color: TV.ink3, marginTop: fs(6) }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ── ÜRETİM HATTI hücresi (konveyör) — güçlü, statik ── */
function FlowCell({ node, fs, first, last }: { node: { label: string; count: number; active: number }; fs: (n: number) => number; first: boolean; last: boolean }) {
  const busy = node.active > 0;
  const has = node.count > 0;
  const countColor = busy ? TV.accent : (has ? TV.ink : TV.ink3);
  const nodeSize = busy ? fs(20) : (has ? fs(13) : fs(9));
  const nameColor = busy ? TV.accent : (has ? TV.ink2 : TV.ink3);
  const band = fs(30);
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      {/* sayı — hiyerarşi: aktif(48 mavi) ≫ dolu(40 beyaz) > boş(28 soluk); ortak taban hizası */}
      <View style={{ height: fs(54), justifyContent: 'flex-end', alignItems: 'center' }}>
        <Text style={{ ...DISPLAY, fontSize: busy ? fs(48) : (has ? fs(40) : fs(28)), color: countColor, letterSpacing: -1.4, lineHeight: busy ? fs(48) : (has ? fs(40) : fs(28)) }}>{node.count}</Text>
      </View>
      {/* konveyör bandı: ray + düğüm (aktif = dolu mavi + statik halka) */}
      <View style={{ height: band, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
        {/* konveyör rayı — boş segment de uzaktan görünür (0.08 → 0.20) */}
        <View style={{ position: 'absolute', top: '50%', height: busy ? 3 : 2, backgroundColor: busy ? TV.accent : 'rgba(255,255,255,0.20)', left: first ? '50%' : 0, right: last ? '50%' : 0 }} />
        {busy && <View pointerEvents="none" style={{ position: 'absolute', width: nodeSize * 2.1, height: nodeSize * 2.1, borderRadius: nodeSize, borderWidth: 1.5, borderColor: TV.accent + '55' }} />}
        <View style={{
          width: nodeSize, height: nodeSize, borderRadius: nodeSize / 2,
          backgroundColor: busy ? TV.accent : TV.bg,
          borderWidth: busy ? 0 : 2, borderColor: has ? TV.ink2 : TV.hair,
        }} />
      </View>
      {/* aşama adı */}
      <Text style={{ fontSize: fs(14.5), fontWeight: busy ? '800' : '600', color: nameColor, letterSpacing: -0.2, marginTop: fs(9), textAlign: 'center', paddingHorizontal: fs(4) }} numberOfLines={2}>
        {autoT(node.label)}
      </Text>
    </View>
  );
}

/* ── ANA SAHNE: tek aktif iş HERO — dikey poster kompozisyonu (kart YOK, ince sol aksan) ── */
function HeroJob({ job, fs }: { job: ActiveJob; fs: (n: number) => number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: fs(26) }}>
      {/* ince sol accent line — tüm kompozisyon boyu */}
      <View style={{ width: fs(4), backgroundColor: TV.accent, borderRadius: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* aktif aşama — en güçlü 2'den biri (mavi) */}
        <Text style={{ fontSize: fs(36), fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', color: TV.accent }} numberOfLines={1}>{job.stage}</Text>
        {/* hasta — EN güçlü */}
        <Text style={{ ...DISPLAY, fontWeight: '500', fontSize: fs(70), color: TV.ink, letterSpacing: -2.8, lineHeight: fs(74), marginTop: fs(12) }} numberOfLines={1}>{job.patient ?? job.orderNumber}</Text>
        {job.caseType && <Text style={{ fontSize: fs(26), color: TV.ink2, marginTop: fs(6) }} numberOfLines={1}>{autoT(job.caseType)}</Text>}
        <Text style={{ fontSize: fs(18), color: TV.ink3, marginTop: fs(6), fontVariant: ['tabular-nums'] as any }}>#{job.orderNumber}</Text>
        {/* timer — büyük ama hasta/aşamayı domine etmez */}
        <View style={{ marginTop: fs(28) }}>
          <LiveTimer startedAt={job.startedAt} fs={fs} />
        </View>
      </View>
    </View>
  );
}

/* ── Canlı timer — kendi 1sn tick'i (yalnız kendini render eder), HH:MM:SS ── */
function LiveTimer({ startedAt, fs }: { startedAt: string | null; fs: (n: number) => number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <>
      <Text style={{ ...DISPLAY, fontWeight: '300', fontSize: fs(58), color: TV.ink2, letterSpacing: -2, lineHeight: fs(60), fontVariant: ['tabular-nums'] as any }}>{elapsedHMS(startedAt)}</Text>
      <Text style={{ fontSize: fs(13), fontWeight: '700', letterSpacing: 2.5, textTransform: 'uppercase', color: TV.ink3, marginTop: fs(5) }}>{autoT('Geçen süre')}</Text>
    </>
  );
}

/* ── Boş state — minimal, ikon/dekorasyon YOK; hero ile aynı sol-anchor (soluk) ── */
function EmptyStage({ fs }: { fs: (n: number) => number }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: fs(26) }}>
        <View style={{ width: fs(4), backgroundColor: TV.hair, borderRadius: 2 }} />
        <View>
          <Text style={{ ...DISPLAY, fontWeight: '500', fontSize: fs(40), letterSpacing: -0.5, textTransform: 'uppercase', color: TV.ink3 }}>{autoT('Aktif iş yok')}</Text>
          <Text style={{ fontSize: fs(17), color: TV.ink3, opacity: 0.6, marginTop: fs(8) }}>{autoT('Üretim hattı beklemede')}</Text>
        </View>
      </View>
    </View>
  );
}

/* ── Çoklu aktif iş (≥2) — orta boy satır ── */
function ActiveJobRow({ job, fs, hair, first }: { job: ActiveJob; fs: (n: number) => number; hair: string; first: boolean }) {
  const total = FLOW.length;
  const pct = clamp((job.stageIndex + 1) / total, 0, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: fs(24), paddingVertical: fs(22), borderTopWidth: first ? 0 : 1, borderTopColor: hair }}>
      {/* ince dikey aksan */}
      <View style={{ width: fs(3), alignSelf: 'stretch', minHeight: fs(88), backgroundColor: TV.accent }} />
      {/* sol: hasta ≫ vaka ≫ aşama · #sipariş */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ ...DISPLAY, fontWeight: '500', fontSize: fs(42), color: TV.ink, letterSpacing: -1.2, lineHeight: fs(46) }} numberOfLines={1}>
          {job.patient ?? job.orderNumber}
        </Text>
        {job.caseType && <Text style={{ fontSize: fs(21), color: TV.ink2, marginTop: fs(3) }} numberOfLines={1}>{autoT(job.caseType)}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: fs(12), marginTop: fs(10) }}>
          <Text style={{ fontSize: fs(18), fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: TV.accent }} numberOfLines={1}>{job.stage}</Text>
          <View style={{ width: fs(150), height: fs(4), borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <View style={{ width: `${pct * 100}%` as any, height: '100%', backgroundColor: TV.accent }} />
          </View>
          <Text style={{ fontSize: fs(14), color: TV.ink3, fontVariant: ['tabular-nums'] as any }}>#{job.orderNumber}</Text>
        </View>
      </View>
      {/* sağ: BÜYÜK timer */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ ...DISPLAY, fontWeight: '300', fontSize: fs(50), color: TV.ink, letterSpacing: -1.5, lineHeight: fs(52), fontVariant: ['tabular-nums'] as any }}>{elapsedHM(job.startedAt)}</Text>
        <Text style={{ fontSize: fs(12), fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', color: TV.ink3, marginTop: fs(3) }}>{autoT('Geçen süre')}</Text>
      </View>
    </View>
  );
}

const KIND_CFG: Record<AttentionKind, { tone: string; badge: string; why: string }> = {
  overdue:  { tone: TV.danger,  badge: 'GECİKTİ',  why: 'Teslim tarihi geçti' },
  blocked:  { tone: TV.danger,  badge: 'BLOKLU',   why: 'İş bloklandı' },
  approval: { tone: TV.warning, badge: 'ONAY',     why: 'Hekim onayı bekleniyor' },
  paused:   { tone: TV.warning, badge: 'DURDU',    why: 'İş duraklatıldı' },
  urgent:   { tone: TV.warning, badge: 'ACİL',     why: 'Acil öncelikli' },
};

/* ── DİKKAT — operasyonel uyarı: WHO(uppercase) → WHAT → WHY · HOW belirgin ── */
function AttentionItemRow({ item, fs, hair, first }: { item: AttentionItem; fs: (n: number) => number; hair: string; first: boolean }) {
  const cfg = KIND_CFG[item.kind];
  const badge = item.kind === 'overdue' ? `${item.daysLate} ${autoT('GÜN GEÇ')}` : autoT(cfg.badge);
  const why = item.reason ?? autoT(cfg.why);
  return (
    <View style={{ flexDirection: 'row', gap: fs(15), paddingVertical: fs(18), borderTopWidth: first ? 0 : 1, borderTopColor: hair }}>
      <View style={{ width: fs(3), alignSelf: 'stretch', minHeight: fs(60), backgroundColor: cfg.tone }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: fs(20), fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', color: TV.ink }} numberOfLines={1}>
          {item.patient ?? item.orderNumber}
        </Text>
        {item.caseType && <Text style={{ fontSize: fs(15), color: TV.ink2, marginTop: fs(3) }} numberOfLines={1}>{autoT(item.caseType)}</Text>}
        <Text style={{ fontSize: fs(15), color: TV.ink3, marginTop: fs(2) }} numberOfLines={1}>{why}</Text>
        <Text style={{ fontSize: fs(18), fontWeight: '800', letterSpacing: 0.5, color: cfg.tone, marginTop: fs(9) }} numberOfLines={1}>{badge}</Text>
      </View>
    </View>
  );
}

/* ── yardımcılar ── */
function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function elapsedHM(startedAt: string | null): string {
  if (!startedAt) return '—';
  const min = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
function elapsedHMS(startedAt: string | null): string {
  if (!startedAt) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
}
