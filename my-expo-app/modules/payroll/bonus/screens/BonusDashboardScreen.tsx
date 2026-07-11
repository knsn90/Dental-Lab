/**
 * BonusDashboardScreen — F1 hero + KPI shelf + iki sütun (politikalar/runs + ranking).
 * Tasarım dili: docs/DESIGN_LANGUAGE.md
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Wallet, TrendingUp, Users, Trophy, ChevronRight, Activity,
  RefreshCw, ChevronLeft, Sparkles, Layers, Plus, Check,
} from 'lucide-react-native';

import { DS } from '../../../../core/theme/dsTokens';
import { listPolicies, calculateBonusRun, type CalcResult } from '../api';
import { supabase } from '../../../../core/api/supabase';
import {
  MODE_LABELS, isPolicyActive,
  type BonusPolicy, type BonusRun, type BonusRunBreakdownRow,
} from '../types';
import {
  DISPLAY, TH, TRY, MONTH_LABELS,
  PillButton, StatusChip, HeroF1, Loader, ErrorBar,
  usePagePadding,
} from '../components/atoms';

interface PolicySummary {
  policy: BonusPolicy;
  result: CalcResult | null;
  error?: string | null;
}

type Props = {
  onOpenPolicies?: () => void;
  onOpenEditor?: (policyId: string) => void;
  onOpenRuns?: () => void;
  onOpenTechnician?: (employeeId: string, name?: string) => void;
};

export default function BonusDashboardScreen({
  onOpenPolicies, onOpenEditor, onOpenRuns, onOpenTechnician,
}: Props) {
  const router = useRouter();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [summaries, setSummaries] = useState<PolicySummary[]>([]);
  const [runs, setRuns] = useState<BonusRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const policies = (await listPolicies()).filter(isPolicyActive);
      const results = await Promise.all(policies.map(async p => {
        try {
          const res = await calculateBonusRun(p.id, year, month, true);
          return { policy: p, result: res } as PolicySummary;
        } catch (e: any) {
          return { policy: p, result: null, error: String(e?.message ?? e) } as PolicySummary;
        }
      }));
      setSummaries(results);

      const { data: runRows, error: runErr } = await supabase
        .from('bonus_runs').select('*')
        .order('calculated_at', { ascending: false }).limit(5);
      if (runErr) throw runErr;
      setRuns((runRows ?? []) as BonusRun[]);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    let payout = 0, pool = 0;
    const techs = new Set<string>();
    const earners = new Set<string>();   // total_bonus > 0 olanlar
    summaries.forEach(s => {
      const r = s.result;
      if (!r) return;
      payout += Number(r.total_payout ?? 0);
      pool   += Number(r.total_pool   ?? 0);
      (r.breakdown ?? []).forEach((row: BonusRunBreakdownRow) => {
        techs.add(row.employee_id);
        if (Number(row.total_bonus ?? 0) > 0) earners.add(row.employee_id);
      });
    });
    const avg = earners.size > 0 ? payout / earners.size : 0;
    return {
      payout,
      pool,
      techs: techs.size,         // bonus hesaplanan tüm kişiler
      earners: earners.size,     // gerçekten prim hak edenler
      avg,
    };
  }, [summaries]);

  const ranking = useMemo<BonusRunBreakdownRow[]>(() => {
    const map = new Map<string, BonusRunBreakdownRow>();
    summaries.forEach(s => (s.result?.breakdown ?? []).forEach((r: BonusRunBreakdownRow) => {
      const prev = map.get(r.employee_id);
      if (!prev) { map.set(r.employee_id, { ...r }); return; }
      map.set(r.employee_id, {
        ...prev,
        units: (prev.units ?? 0) + (r.units ?? 0),
        points: (prev.points ?? 0) + (r.points ?? 0),
        total_bonus: (prev.total_bonus ?? 0) + (r.total_bonus ?? 0),
        rejects: (prev.rejects ?? 0) + (r.rejects ?? 0),
      });
    }));
    return Array.from(map.values()).sort((a, b) => (b.total_bonus ?? 0) - (a.total_bonus ?? 0));
  }, [summaries]);

  const stepMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear()); setMonth(next.getMonth() + 1);
  };

  const pad = usePagePadding();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: pad, paddingBottom: 80 }}>
      {/* ═════ F1 HERO ═════ */}
      <HeroF1
        kicker={`Prim Motoru · ${MONTH_LABELS[month - 1]} ${year}`}
        title={<>Bu ay <Text style={{ color: TH.primary }}>{TRY(totals.payout)}</Text></>}
        description={
          `${summaries.length} aktif politika · ${totals.earners}/${totals.techs} teknisyen prim hak etti · ortalama ${TRY(totals.avg)}.` +
          (totals.pool > 0 ? ` Havuz dağıtımı: ${TRY(totals.pool)}.` : '')
        }
        stats={[
          { value: String(totals.earners), label: 'Hak Eden' },
          { value: String(totals.techs),   label: 'Kapsanan' },
          { value: TRY(totals.avg),        label: 'Ort. Prim' },
        ]}
        actions={
          <>
            <PillButton variant="light" onPress={() => stepMonth(-1)} leftIcon={<ChevronLeft size={14} color={DS.ink[900]} />}>
              Önceki ay
            </PillButton>
            <PillButton variant="light" onPress={() => stepMonth(1)} rightIcon={<ChevronRight size={14} color={DS.ink[900]} />}>
              Sonraki ay
            </PillButton>
            <PillButton variant="ghost" onPress={load} leftIcon={<RefreshCw size={14} color={DS.ink[900]} />}>
              Yenile
            </PillButton>
            <View style={{ flex: 1 }} />
            <PillButton
              variant="dark"
              onPress={() => onOpenPolicies?.()}
              leftIcon={<Sparkles size={14} color="#FFF" />}
            >
              Politikaları Yönet
            </PillButton>
          </>
        }
      />

      {error ? <ErrorBar message={error} /> : null}

      {/* ═════ KPI SHELF — F1c Full-bleed Stat Hero ═════ */}
      <View style={{
        borderRadius: 20, backgroundColor: TH.primary, padding: 22,
        position: 'relative', overflow: 'hidden', marginBottom: 16,
      }}>
        {/* Dekoratif daireler */}
        <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
        <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(0,0,0,0.05)' }} />

        {/* 4 mini-stat tile — mobile'da 2x2, tablet+ 1x4 */}
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <HeroTile icon={Wallet}     label="Toplam Prim"   value={TRY(totals.payout)} sub={totals.pool > 0 ? `Havuz ${TRY(totals.pool)}` : 'Bireysel'} />
          <HeroTile icon={Users}      label="Hak Eden"      value={String(totals.earners)} sub="Prim alan kişi" />
          <HeroTile icon={TrendingUp} label="Ort. Prim"     value={TRY(totals.avg)} sub="Kişi başı" />
          <HeroTile icon={Layers}     label="Aktif Policy"  value={String(summaries.length)} sub="Bu dönem" />
        </View>
      </View>

      {/* ═════ BODY — alt kısım ═════ */}
      {loading ? (
        <Loader />
      ) : (
        <View className="flex-col xl:flex-row gap-4">

          {/* ─── LEFT COLUMN (2/3) ─── */}
          <View className="gap-4" style={{ flexGrow: 2, flexBasis: 320, minWidth: 280 }}>

            {/* AKTİF POLİTİKALAR */}
            <View className="gap-3">
              {summaries.length > 0 ? (
                <View className="flex-row items-end justify-between">
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
                      Aktif Politikalar
                    </Text>
                    <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.4, color: DS.ink[900], marginTop: 2 }}>
                      {summaries.length} politika simüle edildi
                    </Text>
                  </View>
                  {onOpenPolicies ? (
                    <Pressable
                      onPress={onOpenPolicies}
                      className="active:opacity-60 web:hover:opacity-70"
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: TH.primary }}>Tümü →</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {summaries.length === 0 ? (
                <View
                  className="flex-col sm:flex-row items-start gap-4 p-5 sm:p-6 rounded-2xl border"
                  style={{ backgroundColor: '#FFF', borderColor: DS.ink[200] }}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={22} color={TH.primary} strokeWidth={1.8} />
                  </View>
                  <View className="flex-1 gap-3">
                    <View>
                      <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: DS.ink[900], lineHeight: 26 }}>
                        Prim Motoru'na hoş geldin
                      </Text>
                      <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 6, lineHeight: 18 }}>
                        Bir prim politikası tanımla; aylık prim simülasyonu ve sıralama burada görünsün.
                      </Text>
                    </View>
                    {/* Quick steps */}
                    <View className="gap-2 mt-1">
                      <OnboardingStep n={1} title="Politika oluştur" hint="Mod, taban oran, kalite kuralları" />
                      <OnboardingStep n={2} title="Çalışanları ata" hint="Politikadan kimler yararlanır" />
                      <OnboardingStep n={3} title="Aylık çalıştır" hint="Hesaplamayı onayla, maaşlara yansıt" />
                    </View>
                    {onOpenPolicies ? (
                      <View className="flex-row gap-2 mt-2">
                        <PillButton variant="dark" onPress={onOpenPolicies} leftIcon={<Plus size={13} color="#FFF" strokeWidth={2.5} />}>
                          İlk politikayı oluştur
                        </PillButton>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View className="gap-2">
                  {summaries.map(s => {
                    const r = s.result;
                    const breakdown = r?.breakdown ?? [];
                    const techCount = breakdown.length;
                    const earnerCount = breakdown.filter((row: BonusRunBreakdownRow) => Number(row.total_bonus ?? 0) > 0).length;
                    const ratio = techCount > 0 ? earnerCount / techCount : 0;
                    return (
                      <Pressable
                        key={s.policy.id}
                        onPress={() => onOpenEditor?.(s.policy.id)}
                        className="
                          rounded-2xl border p-4 active:opacity-90
                          web:cursor-pointer web:hover:opacity-95
                          web:focus-visible:ring-2 web:focus-visible:ring-success/40
                        "
                        style={{ backgroundColor: '#FFF', borderColor: DS.ink[200] }}
                      >
                        {/* Top row: name + mode chip + payout */}
                        <View className="flex-row items-start gap-3">
                          <View
                            className="items-center justify-center"
                            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: TH.bgSoft }}
                          >
                            <Wallet size={16} color={TH.primary} strokeWidth={1.8} />
                          </View>
                          <View className="flex-1 min-w-0">
                            <View className="flex-row items-center gap-2 flex-wrap">
                              <Text
                                style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900], letterSpacing: -0.2 }}
                                numberOfLines={1}
                              >
                                {s.policy.name}
                              </Text>
                              <View
                                className="px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: DS.ink[100] }}
                              >
                                <Text style={{ fontSize: 9, fontWeight: '700', color: DS.ink[700], letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                  {MODE_LABELS[s.policy.mode]}
                                </Text>
                              </View>
                            </View>
                            <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 4 }} numberOfLines={1}>
                              {earnerCount}/{techCount} kişi prim aldı
                              {s.policy.mode !== 'individual' && (r?.total_pool ?? 0) > 0
                                ? ` · havuz ${TRY(r?.total_pool)}`
                                : ''}
                            </Text>
                            {s.error ? (
                              <Text style={{ fontSize: 10, color: TH.danger, marginTop: 4 }}>{s.error}</Text>
                            ) : null}
                          </View>
                          <View className="items-end">
                            <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.7, lineHeight: 24 }}>
                              {TRY(r?.total_payout)}
                            </Text>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 }}>
                              Bu Ay
                            </Text>
                          </View>
                          <ChevronRight size={14} color={DS.ink[400]} />
                        </View>

                        {/* Progress bar — hak eden oranı */}
                        {techCount > 0 ? (
                          <View className="mt-3">
                            <View
                              className="rounded-full overflow-hidden"
                              style={{ height: 4, backgroundColor: DS.ink[100] }}
                            >
                              <View
                                style={{
                                  width: `${Math.round(ratio * 100)}%`,
                                  height: '100%',
                                  backgroundColor: TH.success,
                                }}
                              />
                            </View>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* SON HESAPLAMALAR — sadece run varsa göster */}
            {runs.length > 0 ? (
              <View className="gap-3">
                <View className="flex-row items-end justify-between">
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
                      Son Hesaplamalar
                    </Text>
                    <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.4, color: DS.ink[900], marginTop: 2 }}>
                      {runs.length === 1 ? 'Son hesaplama' : `Son ${runs.length} hesaplama`}
                    </Text>
                  </View>
                  {onOpenRuns ? (
                    <Pressable
                      onPress={onOpenRuns}
                      className="active:opacity-60 web:hover:opacity-70"
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: TH.primary }}>Tümü →</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View
                  className="rounded-2xl border overflow-hidden"
                  style={{ backgroundColor: '#FFF', borderColor: DS.ink[200] }}
                >
                  {runs.map((r, i) => {
                    const breakdownLen = (Array.isArray(r.breakdown) ? r.breakdown : (r.breakdown?.rows ?? [])).length;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={onOpenRuns}
                        className="
                          flex-row items-center gap-3 px-4 py-3
                          active:opacity-80 web:hover:opacity-90
                        "
                        style={{
                          borderBottomWidth: i < runs.length - 1 ? 1 : 0,
                          borderBottomColor: DS.ink[100],
                        }}
                      >
                        {/* Timeline indicator */}
                        <View className="items-center" style={{ width: 32 }}>
                          <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], letterSpacing: -0.5, lineHeight: 20 }}>
                            {String(r.period_month).padStart(2, '0')}
                          </Text>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.6 }}>
                            {String(r.period_year).slice(-2)}
                          </Text>
                        </View>

                        <View className="flex-1 min-w-0">
                          <View className="flex-row items-center gap-2">
                            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                              {MONTH_LABELS[r.period_month - 1]} {r.period_year}
                            </Text>
                            <StatusChip status={r.status} />
                          </View>
                          <Text style={{ fontSize: 10, color: DS.ink[500], marginTop: 2 }}>
                            {new Date(r.calculated_at).toLocaleDateString('tr-TR')} · {breakdownLen} kişi
                          </Text>
                        </View>

                        <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], letterSpacing: -0.5 }}>
                          {TRY(r.total_payout)}
                        </Text>
                        <ChevronRight size={14} color={DS.ink[400]} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          {/* ─── RIGHT COLUMN — Ranking podium (sadece veri varsa) ─── */}
          {ranking.length > 0 ? (
          <View style={{ flexGrow: 1, flexBasis: 280, minWidth: 280, maxWidth: 400 }}>
            <View className="flex-row items-end justify-between mb-3">
              <View>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
                  Sıralama · {MONTH_LABELS[month - 1]}
                </Text>
                <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.4, color: DS.ink[900], marginTop: 2 }}>
                  Liderler
                </Text>
              </View>
              <View
                className="px-2 py-0.5 rounded-full"
                style={{ backgroundColor: TH.bgSoft }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: TH.primary }}>
                  {ranking.length} kişi
                </Text>
              </View>
            </View>

            <View
              className="rounded-2xl border overflow-hidden"
              style={{ backgroundColor: '#FFF', borderColor: DS.ink[200] }}
            >
                {/* ─── PODIUM — top 3 ─── */}
                {ranking.length >= 1 ? (
                  <View
                    className="px-4 pt-4 pb-3"
                    style={{ backgroundColor: TH.bg }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[700], marginBottom: 12, textAlign: 'center' }}>
                      Bu Ayın Lideri
                    </Text>
                    <View className="flex-row items-end justify-center gap-3">
                      {/* 2nd place */}
                      {ranking[1] ? (
                        <PodiumSlot
                          rank={2}
                          row={ranking[1]}
                          onPress={() => onOpenTechnician?.(ranking[1].employee_id, ranking[1].employee_name)}
                          height={56}
                          medalColor={DS.ink[400]}
                        />
                      ) : <View style={{ flex: 1 }} />}
                      {/* 1st place (taller) */}
                      <PodiumSlot
                        rank={1}
                        row={ranking[0]}
                        onPress={() => onOpenTechnician?.(ranking[0].employee_id, ranking[0].employee_name)}
                        height={76}
                        medalColor={TH.primary}
                        big
                      />
                      {/* 3rd place */}
                      {ranking[2] ? (
                        <PodiumSlot
                          rank={3}
                          row={ranking[2]}
                          onPress={() => onOpenTechnician?.(ranking[2].employee_id, ranking[2].employee_name)}
                          height={42}
                          medalColor={TH.primaryDeep}
                        />
                      ) : <View style={{ flex: 1 }} />}
                    </View>
                  </View>
                ) : null}

                {/* ─── 4th+ list ─── */}
                {ranking.length > 3 ? (
                  <View>
                    {ranking.slice(3, 15).map((r, i) => {
                      const rank = i + 4;
                      return (
                        <Pressable
                          key={r.employee_id || rank}
                          onPress={() => onOpenTechnician?.(r.employee_id, r.employee_name)}
                          disabled={!onOpenTechnician}
                          className="
                            flex-row items-center gap-3 px-4 py-2.5
                            active:opacity-80 web:hover:opacity-90
                          "
                          style={{
                            borderTopWidth: i === 0 ? 1 : 0,
                            borderBottomWidth: i < Math.min(12, ranking.length - 3) - 1 ? 1 : 0,
                            borderColor: DS.ink[100],
                          }}
                        >
                          <Text style={{ width: 22, fontSize: 11, fontWeight: '700', color: DS.ink[400], textAlign: 'center' }}>
                            {rank}
                          </Text>
                          <View
                            className="items-center justify-center"
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: DS.ink[100] }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[700] }}>
                              {initials(r.employee_name)}
                            </Text>
                          </View>
                          <View className="flex-1 min-w-0">
                            <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                              {r.employee_name || '—'}
                            </Text>
                            <Text style={{ fontSize: 10, color: DS.ink[500] }}>
                              {(r.points ?? 0).toFixed?.(1) ?? r.points} puan
                              {r.rejects ? ` · ${r.rejects} yenileme` : ''}
                            </Text>
                          </View>
                          <Text style={{ ...DISPLAY, fontSize: 14, color: DS.ink[900], letterSpacing: -0.3 }}>
                            {TRY(r.total_bonus)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {ranking.length > 15 ? (
                  <View
                    className="px-4 py-2.5"
                    style={{ borderTopWidth: 1, borderColor: DS.ink[100], backgroundColor: DS.ink[50] }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '600', color: DS.ink[500], textAlign: 'center', letterSpacing: 0.3 }}>
                      +{ranking.length - 15} kişi daha
                    </Text>
                  </View>
                ) : null}
            </View>
          </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

/* ─── OnboardingStep — empty state quick-start row ──────────────────── */
function OnboardingStep({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View
        className="items-center justify-center"
        style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: DS.ink[100] }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[700] }}>{n}</Text>
      </View>
      <View className="flex-1">
        <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{title}</Text>
        <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 1 }}>{hint}</Text>
      </View>
    </View>
  );
}

/* ─── Podium slot — top 3 ranking ────────────────────────────────────── */
function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0]?.toLocaleUpperCase('tr') ?? '')
    .join('') || '?';
}

function PodiumSlot({ rank, row, onPress, height, medalColor, big }: {
  rank: 1 | 2 | 3;
  row: BonusRunBreakdownRow;
  onPress: () => void;
  height: number;
  medalColor: string;
  big?: boolean;
}) {
  const avatarSize = big ? 44 : 36;
  const initialsSize = big ? 13 : 11;
  return (
    <Pressable
      onPress={onPress}
      className="
        flex-1 items-center gap-2 active:opacity-70
        web:cursor-pointer web:hover:opacity-80
      "
    >
      {/* Avatar with medal */}
      <View className="items-center" style={{ width: avatarSize, position: 'relative' }}>
        <View
          className="items-center justify-center"
          style={{
            width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
            backgroundColor: '#FFF',
            borderWidth: 2, borderColor: medalColor,
          }}
        >
          <Text style={{ fontSize: initialsSize, fontWeight: '700', color: DS.ink[900] }}>
            {initials(row.employee_name)}
          </Text>
        </View>
        <View
          className="items-center justify-center"
          style={{
            position: 'absolute', bottom: -4, right: -4,
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: medalColor,
            borderWidth: 2, borderColor: '#FFF',
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFF' }}>{rank}</Text>
        </View>
      </View>

      {/* Name + bonus */}
      <Text
        style={{ fontSize: 11, fontWeight: '600', color: DS.ink[900], textAlign: 'center' }}
        numberOfLines={1}
      >
        {row.employee_name || '—'}
      </Text>
      <Text
        style={{ ...DISPLAY, fontSize: big ? 16 : 13, color: DS.ink[900], letterSpacing: -0.3, lineHeight: big ? 18 : 15 }}
        numberOfLines={1}
      >
        {TRY(row.total_bonus)}
      </Text>

      {/* Podium base */}
      <View
        className="w-full rounded-t-lg items-center justify-center"
        style={{ height, backgroundColor: medalColor + '33' }}
      >
        <Text style={{ ...DISPLAY, fontSize: big ? 26 : 20, color: medalColor, letterSpacing: -0.5, fontWeight: '300' }}>
          {rank}
        </Text>
      </View>
    </Pressable>
  );
}

/* ─── Hero tile — F1c mini-stat (white-on-coral) ─────────────────────── */
function HeroTile({ icon: Icon, label, value, sub }:
  { icon: any; label: string; value: string; sub?: string }) {
  return (
    <View
      // flex-basis 140 → mobile'da 2 sütun (2×140 + gap 12 ≈ 292), tablet+ 1×4
      style={{
        flexGrow: 1, flexBasis: 140, minWidth: 140,
        paddingVertical: 14, paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.16)',
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 8,
          backgroundColor: 'rgba(255,255,255,0.20)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color="#FFF" strokeWidth={2} />
        </View>
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
          {label}
        </Text>
      </View>
      <Text
        style={{ ...DISPLAY, fontSize: 28, color: '#FFF', letterSpacing: -0.8, lineHeight: 30 }}
        numberOfLines={1}
      >
        {value}
      </Text>
      {sub ? (
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.72)' }} numberOfLines={1}>{sub}</Text>
      ) : null}
    </View>
  );
}
