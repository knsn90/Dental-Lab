/**
 * TechnicianBonusScreen — design language reset.
 * F1 compact hero (mercan) + aylık bar chart + "neden bu kadar?" + ay bazında detay.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  ArrowLeft, ArrowRight, ChevronLeft, Wallet, TrendingUp, Activity, ShieldCheck, Sparkles,
  Trophy, ChevronDown, ChevronRight,
} from '../../../../core/ui/icons';

import { DS } from '../../../../core/theme/dsTokens';
import { useInkUI } from '../../../../core/theme/inkScale';
import { useMobileTokens } from '../../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../../core/store/themeModeStore';
import { isRTL } from '../../../../core/i18n';
import { supabase } from '../../../../core/api/supabase';
import { listPolicies } from '../api';
import type { BonusRun, BonusPolicy, BonusRunBreakdownRow, RunStatus } from '../types';
import {
  DISPLAY, TH, TRY, MONTH_LABELS,
  PillButton, SecHeader, HeroCompact, Loader, ErrorBar,
  usePagePadding,
} from '../components/atoms';

const STATUS_LABEL: Record<string, string> = {
  draft: 'taslak', approved: 'onaylı', posted: 'yansıtıldı', voided: 'iptal',
};

interface MonthlyAggregate {
  year: number; month: number; key: string;
  rows: Array<{ run: BonusRun; policy: BonusPolicy | undefined; row: BonusRunBreakdownRow }>;
  units: number; points: number; total_bonus: number;
  stage_bonus: number; individual_bonus: number; pool_share: number; rejects: number;
}

type Props = {
  employeeId: string;
  initialName?: string | null;
  onBack?: () => void;
};

export default function TechnicianBonusScreen({ employeeId, initialName, onBack }: Props) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [employeeName, setEmployeeName] = useState<string>(initialName ?? '');
  const [employeeMeta, setEmployeeMeta] = useState<{ role?: string; station?: string; email?: string } | null>(null);
  const [runs, setRuns] = useState<BonusRun[]>([]);
  const [policies, setPolicies] = useState<BonusPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();

      const [empRes, runsRes, polsRes] = await Promise.all([
        supabase.from('employees').select('id, full_name, role, email').eq('id', employeeId).maybeSingle(),
        supabase.from('bonus_runs').select('*').gte('calculated_at', cutoff).order('calculated_at', { ascending: false }),
        listPolicies(),
      ]);

      if (empRes.data) {
        setEmployeeName(empRes.data.full_name);
        setEmployeeMeta({
          role: empRes.data.role,
          station: undefined,
          email: empRes.data.email ?? undefined,
        });
      }
      if (runsRes.error) throw runsRes.error;
      setRuns((runsRes.data ?? []) as BonusRun[]);
      setPolicies(polsRes);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const policyMap = useMemo(() => {
    const m = new Map<string, BonusPolicy>();
    policies.forEach(p => m.set(p.id, p));
    return m;
  }, [policies]);

  const monthly = useMemo<MonthlyAggregate[]>(() => {
    const buckets = new Map<string, MonthlyAggregate>();
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, {
        year: d.getFullYear(), month: d.getMonth() + 1, key, rows: [],
        units: 0, points: 0, total_bonus: 0, stage_bonus: 0,
        individual_bonus: 0, pool_share: 0, rejects: 0,
      });
    }
    runs.forEach(run => {
      const key = `${run.period_year}-${String(run.period_month).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) return;
      const rows: any[] = Array.isArray(run.breakdown) ? run.breakdown : (run.breakdown?.rows ?? []);
      const row = rows.find((r: any) => r.employee_id === employeeId);
      if (!row) return;
      bucket.rows.push({ run, policy: policyMap.get(run.policy_id), row });
      bucket.units            += Number(row.units ?? 0);
      bucket.points           += Number(row.points ?? 0);
      bucket.total_bonus      += Number(row.total_bonus ?? 0);
      bucket.stage_bonus      += Number(row.stage_bonus ?? 0);
      bucket.individual_bonus += Number(row.individual_bonus ?? 0);
      bucket.pool_share       += Number(row.pool_share ?? 0);
      bucket.rejects          += Number(row.rejects ?? 0);
    });
    return Array.from(buckets.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [runs, employeeId, policyMap]);

  const grandTotal = monthly.reduce((s, m) => s + m.total_bonus, 0);
  const grandUnits = monthly.reduce((s, m) => s + m.units, 0);
  const maxBar = Math.max(1, ...monthly.map(m => m.total_bonus));
  const bestMonth = monthly.reduce((b, m) => (m.total_bonus > (b?.total_bonus ?? 0) ? m : b), null as MonthlyAggregate | null);
  const latestActive = monthly.find(m => m.rows.length > 0);

  const pad = usePagePadding();

  if (loading) return <Loader />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: pad, paddingBottom: 80 }}>
      {/* Back nav */}
      {onBack ? (
        <View style={{ marginBottom: 16 }}>
          <PillButton variant="light" onPress={onBack} leftIcon={isRTL() ? <ArrowRight size={14} color={U.ink[900]} /> : <ArrowLeft size={14} color={U.ink[900]} />}>
            Geri
          </PillButton>
        </View>
      ) : null}

      {/* F1 compact HERO — mercan accent */}
      <HeroCompact
        kicker={`${employeeMeta?.role ?? 'Teknisyen'}${employeeMeta?.station ? ' · ' + employeeMeta.station : ''}`}
        value={TRY(grandTotal)}
        label={employeeName || 'Teknisyen'}
        sub={`${autoT('Son 12 ay')} · ${grandUnits} ${autoT(grandUnits === 1 ? 'işlem' : 'üye')}${employeeMeta?.email ? ' · ' + employeeMeta.email : ''}`}
        icon={Trophy}
        miniStats={[
          { label: 'Üye', value: String(grandUnits) },
          { label: 'Ay', value: String(monthly.filter(m => m.rows.length > 0).length) },
          { label: 'Remake', value: String(monthly.reduce((s, m) => s + m.rejects, 0)) },
        ]}
      />

      {error ? <ErrorBar message={error} /> : null}

      {/* AYLIK BAR CHART */}
      <View style={{
        backgroundColor: U.surface, borderRadius: 18,
        borderWidth: 1, borderColor: U.ink[200],
        padding: 22, marginBottom: 16,
      }}>
        <SecHeader eyebrow="Trend" title="Aylık prim trendi" />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 160 }}>
          {[...monthly].reverse().map(m => {
            const h = Math.max(2, Math.round((m.total_bonus / maxBar) * 130));
            const isBest = bestMonth?.key === m.key && m.total_bonus > 0;
            return (
              <View key={m.key} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: U.ink[700], marginBottom: 4 }}>
                  {m.total_bonus > 0 ? Math.round(m.total_bonus / 1000) + 'K' : ''}
                </Text>
                <View style={{
                  width: '100%', borderTopStartRadius: 6, borderTopEndRadius: 6,
                  backgroundColor: isBest ? TH.primary : TH.success,
                  height: h, minHeight: 2,
                  opacity: m.total_bonus === 0 ? 0.2 : 1,
                }} />
                <Text style={{ fontSize: 9, color: U.ink[500], marginTop: 4 }}>
                  {String(m.month).padStart(2, '0')}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* NEDEN BU KADAR */}
      {latestActive && latestActive.rows.length > 0 ? (
        <View style={{
          backgroundColor: U.surface, borderRadius: 18,
          borderWidth: 1, borderColor: U.ink[200],
          padding: 22, marginBottom: 16,
        }}>
          <SecHeader
            eyebrow="Açıklama"
            title={`${autoT('Neden bu kadar?')} — ${autoT(MONTH_LABELS[latestActive.month - 1])} ${latestActive.year}`}
          />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <ExplainTile icon={TrendingUp}  label="Üye"       value={String(latestActive.units)}             accent={TH.info} />
            <ExplainTile icon={Activity}    label="Puan"        value={latestActive.points.toFixed(1)}         accent="#7C3AED" />
            <ExplainTile icon={Wallet}      label="Bireysel"    value={TRY(latestActive.individual_bonus)}     accent={TH.success} />
            <ExplainTile icon={Wallet}      label="Aşama"       value={TRY(latestActive.stage_bonus)}          accent="#0891B2" />
            <ExplainTile icon={Wallet}      label="Havuz Payı"  value={TRY(latestActive.pool_share)}           accent={TH.warning} />
            <ExplainTile icon={ShieldCheck} label="Remake"      value={String(latestActive.rejects)}           accent={TH.danger} />
          </View>
          <View style={{ backgroundColor: U.ink[50], borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 12, color: U.ink[700], lineHeight: 18 }}>
              <Text style={{ fontWeight: '700' }}>Toplam: </Text>
              Bireysel {TRY(latestActive.individual_bonus)} + Aşama {TRY(latestActive.stage_bonus)} +
              Havuz {TRY(latestActive.pool_share)} ={' '}
              <Text style={{ ...DISPLAY, color: '#1F6B47', fontSize: 14, letterSpacing: -0.3 }}>
                {TRY(latestActive.total_bonus)}
              </Text>
            </Text>
            {latestActive.rows[0]?.row.quality_multiplier !== undefined ? (
              <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 4 }}>
                Kalite çarpanı bireysel kalemde uygulandı:
                {' '}× {(latestActive.rows[0].row.quality_multiplier ?? 1).toFixed(2)}
                {latestActive.rows[0].row.remake_pct ? ` (${(latestActive.rows[0].row.remake_pct ?? 0).toFixed(1)}% remake)` : ''}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* AY BAZINDA DETAY */}
      <View style={{
        backgroundColor: U.surface, borderRadius: 18,
        borderWidth: 1, borderColor: U.ink[200],
        padding: 22,
      }}>
        <SecHeader eyebrow="Detay" title="Ay bazında dökümü" />
        {monthly.filter(m => m.rows.length > 0).length === 0 ? (
          <Text style={{ fontSize: 13, color: U.ink[400], fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 }}>
            Son 12 ayda bu teknisyene ait kayıt yok.
          </Text>
        ) : (
          monthly.filter(m => m.rows.length > 0).map(m => {
            const open = expanded === m.key;
            return (
              <View key={m.key} style={{ borderBottomWidth: 1, borderBottomColor: U.ink[100] }}>
                <Pressable
                  onPress={() => setExpanded(open ? null : m.key)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {open ? <ChevronDown size={16} color={U.ink[500]} /> : (isRTL() ? <ChevronLeft size={16} color={U.ink[500]} /> : <ChevronRight size={16} color={U.ink[500]} />)}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }}>
                      {MONTH_LABELS[m.month - 1]} {m.year}
                    </Text>
                    <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 2 }}>
                      {m.units === 1 ? `1 ${autoT('işlem')}` : `${m.units} ${autoT('üye')}`} · {m.points.toFixed(1)} puan · {m.rows.length} policy
                    </Text>
                  </View>
                  <Text style={{ ...DISPLAY, fontSize: 22, color: '#1F6B47', letterSpacing: -0.7 }}>
                    {TRY(m.total_bonus)}
                  </Text>
                </Pressable>
                {open ? (
                  <View style={{ paddingStart: 28, paddingBottom: 14, gap: 8 }}>
                    {m.rows.map(({ run, policy, row }, i) => (
                      <View key={i} style={{ backgroundColor: U.ink[50], borderRadius: 12, padding: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[800], flex: 1 }}>
                            {policy?.name ?? 'Policy'}
                          </Text>
                          <Text style={{ fontSize: 10, color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {STATUS_LABEL[run.status] ?? run.status}
                          </Text>
                          <Text style={{ ...DISPLAY, fontSize: 14, color: '#1F6B47', letterSpacing: -0.3 }}>
                            {TRY(row.total_bonus)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 10, color: U.ink[500], marginTop: 4 }}>
                          {row.units === 1 ? `1 ${autoT('işlem')}` : `${row.units} ${autoT('üye')}`} · {(row.points ?? 0).toFixed?.(1) ?? row.points} puan ·{' '}
                          Bireysel {TRY(row.individual_bonus)} · Aşama {TRY(row.stage_bonus)} ·{' '}
                          Havuz {TRY(row.pool_share)} · Kalite ×{(row.quality_multiplier ?? 1).toFixed?.(2) ?? row.quality_multiplier}
                          {row.rejects ? ` · ${row.rejects} remake` : ''}
                        </Text>
                        {row.error ? <Text style={{ fontSize: 10, color: TH.danger, marginTop: 4 }}>{row.error}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function ExplainTile({ icon: Icon, label, value, accent }:
  { icon: any; label: string; value: string; accent: string }) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{
      flex: 1, minWidth: 140,
      backgroundColor: accent + '10', borderRadius: 12, padding: 12,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={12} color={accent} strokeWidth={2} />
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: accent }}>
          {label}
        </Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 22, color: U.ink[900], letterSpacing: -0.6 }}>{value}</Text>
    </View>
  );
}
