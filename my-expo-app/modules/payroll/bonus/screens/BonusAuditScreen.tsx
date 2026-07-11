/**
 * BonusAuditScreen — design language reset.
 * Header + Chip filtreler + Card list + expandable diff (before/after).
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  History, User, ChevronDown, ChevronRight, Clock, Edit3, Filter,
} from 'lucide-react-native';

import { DS } from '../../../../core/theme/dsTokens';
import { supabase } from '../../../../core/api/supabase';
import { listPolicies } from '../api';
import type { BonusPolicy } from '../types';
import {
  DISPLAY, TH, PillButton, Chip, EmptyCard, Loader, ErrorBar,
  usePagePadding,
} from '../components/atoms';

interface HistoryEntry {
  id: string;
  policy_id: string;
  changed_by: string | null;
  changed_at: string;
  field_changed: string | null;
  old_snapshot: Record<string, any> | null;
  new_snapshot: Record<string, any> | null;
}

interface FieldDiff { field: string; before: any; after: any; }

const FIELD_LABELS: Record<string, string> = {
  name: 'Ad', description: 'Açıklama', mode: 'Mod', period_type: 'Periyot tipi',
  currency: 'Para birimi', base_rate: 'Taban oran', distribution_method: 'Dağıtım yöntemi',
  quality_window: 'Kalite penceresi', remake_penalty: 'Remake cezası',
  remake_penalty_points: 'Remake ceza puanı', status: 'Durum',
};

const IGNORE_FIELDS = new Set(['id', 'lab_id', 'created_at', 'updated_at', 'created_by']);

function buildDiff(oldS: any, newS: any): FieldDiff[] {
  if (!oldS || !newS) return [];
  const keys = new Set([...Object.keys(oldS), ...Object.keys(newS)]);
  const out: FieldDiff[] = [];
  keys.forEach(k => {
    if (IGNORE_FIELDS.has(k)) return;
    if (JSON.stringify(oldS[k]) !== JSON.stringify(newS[k])) {
      out.push({ field: k, before: oldS[k], after: newS[k] });
    }
  });
  return out;
}

const fmtValue = (v: any): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Açık' : 'Kapalı';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/* ====================================================================== */

export default function BonusAuditScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [policies, setPolicies] = useState<BonusPolicy[]>([]);
  const [actors, setActors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [policyFilter, setPolicyFilter] = useState<string>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [hRes, p] = await Promise.all([
        supabase.from('bonus_rule_history').select('*').order('changed_at', { ascending: false }).limit(300),
        listPolicies(),
      ]);
      if (hRes.error) throw hRes.error;
      const list = (hRes.data ?? []) as HistoryEntry[];
      setEntries(list); setPolicies(p);

      const userIds = Array.from(new Set(list.map(e => e.changed_by).filter(Boolean) as string[]));
      if (userIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        const map = new Map<string, string>();
        (profs ?? []).forEach((p: any) => map.set(p.id, p.full_name));
        setActors(map);
      }
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const policyMap = useMemo(() => {
    const m = new Map<string, BonusPolicy>();
    policies.forEach(p => m.set(p.id, p));
    return m;
  }, [policies]);

  const filtered = useMemo(() => entries.filter(e => {
    if (policyFilter !== 'all' && e.policy_id !== policyFilter) return false;
    if (actorFilter !== 'all' && e.changed_by !== actorFilter) return false;
    return true;
  }), [entries, policyFilter, actorFilter]);

  const distinctActors = useMemo(() => {
    const ids = Array.from(new Set(entries.map(e => e.changed_by).filter(Boolean) as string[]));
    return ids.map(id => ({ id, name: actors.get(id) ?? id.slice(0, 8) }));
  }, [entries, actors]);

  const pad = usePagePadding();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: pad, paddingBottom: 80 }}>
      {/* HEADER */}
      <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 280 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>
            Değişiklik Geçmişi
          </Text>
          <Text style={{ ...DISPLAY, fontSize: 36, letterSpacing: -1, lineHeight: 38, color: DS.ink[900] }}>
            {filtered.length} kayıt
          </Text>
          <Text style={{ fontSize: 14, color: DS.ink[500], marginTop: 8 }}>
            Tüm policy düzenlemelerinin tam audit log'u. Tıkla — alan bazında diff'i gör.
          </Text>
        </View>
        <PillButton
          variant="light"
          onPress={() => setShowFilters(s => !s)}
          leftIcon={<Filter size={14} color={DS.ink[900]} />}
          rightIcon={<ChevronDown size={12} color={DS.ink[400]} />}
        >
          Filtre
        </PillButton>
      </View>

      {/* FILTERS */}
      {showFilters ? (
        <View style={{
          backgroundColor: '#FFF', borderRadius: 18,
          borderWidth: 1, borderColor: DS.ink[200],
          padding: 18, marginBottom: 16, gap: 16,
        }}>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 8 }}>
              Policy
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Chip active={policyFilter === 'all'} onPress={() => setPolicyFilter('all')}>Tümü</Chip>
              {policies.map(p => (
                <Chip key={p.id} active={policyFilter === p.id} onPress={() => setPolicyFilter(p.id)}>{p.name}</Chip>
              ))}
            </View>
          </View>
          {distinctActors.length > 0 ? (
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 8 }}>
                Aktör
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <Chip active={actorFilter === 'all'} onPress={() => setActorFilter('all')}>Tümü</Chip>
                {distinctActors.map(a => (
                  <Chip key={a.id} active={actorFilter === a.id} onPress={() => setActorFilter(a.id)}>{a.name}</Chip>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? <ErrorBar message={error} /> : null}

      {/* LIST */}
      {loading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <EmptyCard icon={History} title="Kayıt yok" description="Henüz policy değişikliği yapılmamış veya filtre dışında." />
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map(e => {
            const diff = buildDiff(e.old_snapshot, e.new_snapshot);
            const open = expanded === e.id;
            const policy = policyMap.get(e.policy_id);
            const actorName = e.changed_by ? (actors.get(e.changed_by) ?? e.changed_by.slice(0, 8)) : 'Sistem';
            return (
              <View key={e.id} style={{
                backgroundColor: '#FFF', borderRadius: 18,
                borderWidth: 1, borderColor: DS.ink[200], overflow: 'hidden',
              }}>
                <Pressable
                  onPress={() => setExpanded(open ? null : e.id)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {open ? <ChevronDown size={16} color={DS.ink[500]} /> : <ChevronRight size={16} color={DS.ink[500]} />}
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Edit3 size={18} color={TH.primary} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                      {policy?.name ?? '?'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <User size={11} color={DS.ink[400]} />
                        <Text style={{ fontSize: 11, color: DS.ink[500] }}>{actorName}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} color={DS.ink[400]} />
                        <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                          {new Date(e.changed_at).toLocaleString('tr-TR')}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: TH.primary + '20' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: TH.primary, letterSpacing: 0.5 }}>
                      {diff.length} alan
                    </Text>
                  </View>
                </Pressable>

                {open ? (
                  <View style={{ padding: 18, borderTopWidth: 1, borderTopColor: DS.ink[100], backgroundColor: DS.ink[50] }}>
                    {diff.length === 0 ? (
                      <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic' }}>
                        Görünür değişiklik yok (sadece zaman damgası).
                      </Text>
                    ) : (
                      diff.map(d => (
                        <View key={d.field} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DS.ink[200] }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[700], marginBottom: 8 }}>
                            {FIELD_LABELS[d.field] ?? d.field}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ flex: 1, backgroundColor: 'rgba(217,75,75,0.08)', borderColor: 'rgba(217,75,75,0.25)', borderWidth: 1, borderRadius: 10, padding: 10 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#9C2E2E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                Önce
                              </Text>
                              <Text style={{ fontSize: 12, color: '#7C2222' }} numberOfLines={3}>{fmtValue(d.before)}</Text>
                            </View>
                            <Text style={{ fontSize: 14, color: DS.ink[400] }}>→</Text>
                            <View style={{ flex: 1, backgroundColor: 'rgba(45,154,107,0.10)', borderColor: 'rgba(45,154,107,0.25)', borderWidth: 1, borderRadius: 10, padding: 10 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#1F6B47', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                Sonra
                              </Text>
                              <Text style={{ fontSize: 12, color: '#0F4D2F' }} numberOfLines={3}>{fmtValue(d.after)}</Text>
                            </View>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
