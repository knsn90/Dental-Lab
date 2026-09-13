import { localeTag, isRTL } from '../../../../core/i18n';
import { autoT } from '../../../../core/i18n/autoTranslate';
/**
 * BonusRunsScreen — design language reset.
 * Hero kicker + Chip filtreler + Liste + Detail modal.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import {
  CheckCircle2, RotateCcw, Send, Undo2, X, Filter, ChevronDown,
  AlertTriangle, Wallet, ChevronLeft, ChevronRight,
} from '../../../../core/ui/icons';

import { DS } from '../../../../core/theme/dsTokens';
import { useInkUI } from '../../../../core/theme/inkScale';
import { useMobileTokens } from '../../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../../core/store/themeModeStore';
import { supabase } from '../../../../core/api/supabase';
import {
  listPolicies, approveBonusRun, postBonusRun, unpostBonusRun, revertBonusRunToDraft,
} from '../api';
import type { BonusRun, BonusPolicy, RunStatus, BonusRunBreakdownRow } from '../types';
import {
  DISPLAY, TH, TRY, MONTH_LABELS,
  PillButton, SecHeader, StatusChip, Chip, EmptyCard, Loader, ErrorBar,
  usePagePadding,
} from '../components/atoms';

const STATUS_FILTERS: { key: RunStatus | 'all'; label: string }[] = [
  { key: 'all',      label: 'Tümü' },
  { key: 'draft',    label: 'Taslak' },
  { key: 'approved', label: 'Onaylı' },
  { key: 'posted',   label: 'Yansıtılan' },
  { key: 'voided',   label: 'İptal' },
];

/* ====================================================================== */

type Props = { onOpenTechnician?: (id: string, name?: string) => void };

export default function BonusRunsScreen({ onOpenTechnician }: Props = {}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [runs, setRuns] = useState<BonusRun[]>([]);
  const [policies, setPolicies] = useState<BonusPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all');
  const [policyFilter, setPolicyFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const [selectedRun, setSelectedRun] = useState<BonusRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [{ data: r, error: rE }, p] = await Promise.all([
        supabase.from('bonus_runs').select('*').order('calculated_at', { ascending: false }).limit(200),
        listPolicies(),
      ]);
      if (rE) throw rE;
      setRuns((r ?? []) as BonusRun[]);
      setPolicies(p);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const policyMap = useMemo(() => {
    const m = new Map<string, BonusPolicy>();
    policies.forEach(p => m.set(p.id, p));
    return m;
  }, [policies]);

  const filtered = useMemo(() => runs.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (policyFilter !== 'all' && r.policy_id !== policyFilter) return false;
    return true;
  }), [runs, statusFilter, policyFilter]);

  const pad = usePagePadding();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: pad, paddingBottom: 80 }}>
      {/* HEADER */}
      <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 280 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase', color: U.ink[500], marginBottom: 10 }}>
            Hesaplamalar
          </Text>
          <Text style={{ ...DISPLAY, fontSize: 36, letterSpacing: -1, lineHeight: 38, color: U.ink[900] }}>
            {filtered.length} run
          </Text>
          <Text style={{ fontSize: 14, color: U.ink[500], marginTop: 8 }}>
            Hesaplanan tüm prim run'ları. Tıklayarak detayları gör, onayla, yansıt.
          </Text>
        </View>
        <PillButton
          variant="light"
          onPress={() => setShowFilters(s => !s)}
          leftIcon={<Filter size={14} color={U.ink[900]} />}
          rightIcon={<ChevronDown size={12} color={U.ink[400]} />}
        >
          Filtre
        </PillButton>
      </View>

      {/* FILTERS */}
      {showFilters ? (
        <View style={{
          backgroundColor: U.surface, borderRadius: 18,
          borderWidth: 1, borderColor: U.ink[200],
          padding: 18, marginBottom: 16, gap: 16,
        }}>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[500], marginBottom: 8 }}>
              Durum
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_FILTERS.map(s => (
                <Chip key={s.key} active={statusFilter === s.key} onPress={() => setStatusFilter(s.key as any)}>
                  {s.label}
                </Chip>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[500], marginBottom: 8 }}>
              Policy
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Chip active={policyFilter === 'all'} onPress={() => setPolicyFilter('all')}>Tümü</Chip>
              {policies.map(p => (
                <Chip key={p.id} active={policyFilter === p.id} onPress={() => setPolicyFilter(p.id)}>
                  {p.name}
                </Chip>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {error ? <ErrorBar message={error} /> : null}

      {/* LIST */}
      {loading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <EmptyCard
          icon={Wallet}
          title="Run bulunamadı"
          description="Politikalar sekmesinden bir hesaplama oluştur."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map(r => {
            const policy = policyMap.get(r.policy_id);
            const rows: any[] = Array.isArray(r.breakdown) ? r.breakdown : (r.breakdown?.rows ?? []);
            return (
              <Pressable
                key={r.id}
                onPress={() => setSelectedRun(r)}
                style={({ pressed }) => ({
                  backgroundColor: U.surface, borderRadius: 18,
                  borderWidth: 1, borderColor: U.ink[200],
                  padding: 18,
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                {/* Big month/year */}
                <View style={{ width: 56, alignItems: 'center' }}>
                  <Text style={{ ...DISPLAY, fontSize: 28, color: U.ink[900], letterSpacing: -0.8, lineHeight: 30 }}>
                    {String(r.period_month).padStart(2, '0')}
                  </Text>
                  <Text style={{ fontSize: 10, color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 2 }}>
                    {r.period_year}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
                      {policy?.name ?? '?'}
                    </Text>
                    <StatusChip status={r.status} />
                  </View>
                  <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 4 }}>
                    {r.total_units === 1 ? `1 ${autoT('işlem')}` : `${r.total_units} ${autoT('üye')}`} · {rows.length} kişi ·{' '}
                    {new Date(r.calculated_at).toLocaleDateString(localeTag())}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ ...DISPLAY, fontSize: 22, color: U.ink[900], letterSpacing: -0.7 }}>
                    {TRY(r.total_payout)}
                  </Text>
                  {r.posted_at ? (
                    <Text style={{ fontSize: 10, color: '#1F6B47', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Yansıtıldı
                    </Text>
                  ) : r.approved_at ? (
                    <Text style={{ fontSize: 10, color: '#9C5E0E', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Onaylı
                    </Text>
                  ) : null}
                </View>
                {isRTL() ? <ChevronLeft size={16} color={U.ink[400]} />
                         : <ChevronRight size={16} color={U.ink[400]} />}
              </Pressable>
            );
          })}
        </View>
      )}

      <BonusRunDetailModal
        run={selectedRun}
        policy={selectedRun ? policyMap.get(selectedRun.policy_id) ?? null : null}
        onClose={() => setSelectedRun(null)}
        onChanged={(updated) => {
          setRuns(prev => prev.map(r => r.id === updated.id ? updated : r));
          setSelectedRun(updated);
        }}
        onOpenTechnician={(id, name) => { setSelectedRun(null); onOpenTechnician?.(id, name); }}
      />
    </ScrollView>
  );
}

/* ====================================================================== */
/*  Detail modal — yeniden tasarım                                       */
/* ====================================================================== */

function BonusRunDetailModal({ run, policy, onClose, onChanged, onOpenTechnician }:
  { run: BonusRun | null; policy: BonusPolicy | null; onClose: () => void; onChanged: (r: BonusRun) => void; onOpenTechnician?: (id: string, name?: string) => void }) {
  const U = useInkUI();

  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!run) return null;
  const rows: BonusRunBreakdownRow[] = Array.isArray(run.breakdown) ? run.breakdown : (run.breakdown?.rows ?? []);

  const guard = async (label: string, action: () => Promise<BonusRun>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(label); setErr(null);
    try { onChanged(await action()); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(null); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: U.scrim, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: U.surface, borderRadius: 22, width: '100%', maxWidth: 960, maxHeight: '92%', overflow: 'hidden', ...(U.isDark ? { borderWidth: 1, borderColor: U.hairline } : {}) }}>
          {/* Header */}
          <View style={{ padding: 22, borderBottomWidth: 1, borderBottomColor: U.ink[100], flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: U.ink[500], marginBottom: 6 }}>
                {policy?.name ?? 'Bonus Run'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ ...DISPLAY, fontSize: 28, color: U.ink[900], letterSpacing: -0.9, lineHeight: 32 }}>
                  {MONTH_LABELS[run.period_month - 1]} {run.period_year}
                </Text>
                <StatusChip status={run.status} />
              </View>
              <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 4 }}>
                Hesaplandı: {new Date(run.calculated_at).toLocaleString('tr-TR')}
                {run.approved_at ? ` · ${autoT('Onaylandı:')} ${new Date(run.approved_at).toLocaleDateString(localeTag())}` : ''}
                {run.posted_at ? ` · ${autoT('Yansıtıldı:')} ${new Date(run.posted_at).toLocaleDateString(localeTag())}` : ''}
              </Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: U.ink[100], alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}>
              <X size={18} color={U.ink[700]} />
            </Pressable>
          </View>

          {/* Totals */}
          <View style={{ padding: 22, flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <Mini label="Toplam Prim"  value={TRY(run.total_payout)} accent={TH.success} />
            <Mini label="Toplam Üye" value={String(run.total_units)} accent={TH.info} />
            <Mini label="Havuz"        value={TRY(run.total_pool)} accent={TH.warning} />
            <Mini label="Kişi"         value={String(rows.length)} accent={TH.primary} />
          </View>

          {err ? <View style={{ paddingHorizontal: 22 }}><ErrorBar message={err} /></View> : null}

          {/* Breakdown */}
          <ScrollView style={{ paddingHorizontal: 22, maxHeight: 380 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: U.ink[200] }}>
              <Text style={{ width: 28, fontSize: 9, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>#</Text>
              <Text style={{ flex: 1, fontSize: 9, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Teknisyen</Text>
              <Text style={{ width: 50, textAlign: 'end' as any, fontSize: 9, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Üye</Text>
              <Text style={{ width: 50, textAlign: 'end' as any, fontSize: 9, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Puan</Text>
              <Text style={{ width: 70, textAlign: 'end' as any, fontSize: 9, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Bireysel</Text>
              <Text style={{ width: 70, textAlign: 'end' as any, fontSize: 9, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Havuz</Text>
              <Text style={{ width: 50, textAlign: 'end' as any, fontSize: 9, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Kalite</Text>
              <Text style={{ width: 80, textAlign: 'end' as any, fontSize: 9, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Toplam</Text>
            </View>
            {rows.length === 0 ? (
              <Text style={{ padding: 24, textAlign: 'center', fontSize: 12, color: U.ink[400], fontStyle: 'italic' }}>Breakdown verisi yok.</Text>
            ) : rows.map((r: any, i: number) => (
              <Pressable
                key={r.employee_id || i}
                onPress={() => onOpenTechnician?.(r.employee_id, r.employee_name)}
                disabled={!onOpenTechnician}
                style={({ pressed }) => ({
                  flexDirection: 'row', gap: 8, paddingVertical: 10,
                  borderBottomWidth: 1, borderBottomColor: U.ink[100],
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ width: 28, fontSize: 12, color: U.ink[500] }}>{i + 1}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
                    {r.employee_name || '?'}
                  </Text>
                  {r.error ? <Text style={{ fontSize: 10, color: TH.danger }}>{r.error}</Text>
                  : r.station_code ? <Text style={{ fontSize: 10, color: U.ink[400] }}>{r.station_code}</Text> : null}
                </View>
                <Text style={{ width: 50, textAlign: 'end' as any, fontSize: 12, color: U.ink[700] }}>{r.units}</Text>
                <Text style={{ width: 50, textAlign: 'end' as any, fontSize: 12, color: U.ink[700] }}>{(r.points ?? 0).toFixed?.(1) ?? r.points}</Text>
                <Text style={{ width: 70, textAlign: 'end' as any, fontSize: 12, color: U.ink[700] }}>{TRY(r.individual_bonus)}</Text>
                <Text style={{ width: 70, textAlign: 'end' as any, fontSize: 12, color: U.ink[700] }}>{TRY(r.pool_share)}</Text>
                <Text style={{ width: 50, textAlign: 'end' as any, fontSize: 12, color: U.ink[700] }}>
                  {(r.quality_multiplier ?? 1).toFixed?.(2) ?? r.quality_multiplier}×
                </Text>
                <Text style={{ width: 80, textAlign: 'end' as any, ...DISPLAY, fontSize: 14, color: '#1F6B47' }}>{TRY(r.total_bonus)}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Actions */}
          <View style={{ padding: 18, borderTopWidth: 1, borderTopColor: U.ink[100], backgroundColor: U.ink[50], flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {run.status === 'draft' && (
              <PillButton
                variant="success"
                disabled={busy === 'approve'}
                onPress={() => guard('approve', () => approveBonusRun(run.id),
                  'Bu run onaylansın mı? Onay sonrası ayarlar kilitlenir.')}
                leftIcon={<CheckCircle2 size={14} color="#FFF" />}
              >
                {busy === 'approve' ? 'Onaylanıyor…' : 'Onayla'}
              </PillButton>
            )}
            {run.status === 'approved' && (
              <>
                <PillButton
                  variant="light"
                  disabled={busy === 'revert'}
                  onPress={() => guard('revert', () => revertBonusRunToDraft(run.id))}
                  leftIcon={<RotateCcw size={14} color={U.ink[900]} />}
                >
                  Taslağa Dön
                </PillButton>
                <PillButton
                  variant="success"
                  disabled={busy === 'post'}
                  onPress={() => guard('post', () => postBonusRun(run.id),
                    'Bu run maaş ödemelerine yansıtılsın mı? salary_adjustments tablosuna otomatik kayıt eklenecek.')}
                  leftIcon={<Send size={14} color="#FFF" />}
                >
                  {busy === 'post' ? 'Yansıtılıyor…' : 'Maaşlara Yansıt'}
                </PillButton>
              </>
            )}
            {run.status === 'posted' && (
              <PillButton
                variant="danger"
                disabled={busy === 'unpost'}
                onPress={() => guard('unpost', () => unpostBonusRun(run.id),
                  'YANSITILMIŞ run geri alınsın mı? Bağlı salary_adjustments silinecek.')}
                leftIcon={<Undo2 size={14} color="#FFF" />}
              >
                {busy === 'unpost' ? 'Geri alınıyor…' : 'Geri Al'}
              </PillButton>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent: string }) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{
      flex: 1, minWidth: 140,
      backgroundColor: accent + '10', borderRadius: 14,
      padding: 14,
    }}>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: accent, marginBottom: 6 }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 22, color: U.ink[900], letterSpacing: -0.6 }}>{value}</Text>
    </View>
  );
}
