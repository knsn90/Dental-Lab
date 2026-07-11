/**
 * BonusPolicyListScreen — Prim politikaları listesi.
 * Tasarım: docs/DESIGN_LANGUAGE.md
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import {
  Plus, Sparkles, ChevronRight, Wallet, Search, Archive, CheckCircle2, FileEdit,
} from 'lucide-react-native';

import { DS } from '../../../../core/theme/dsTokens';
import { CURRENCY_META, type Currency } from '../../../../core/money/currency';
import { baseSymbol } from '../../../../core/money/baseCurrency';
import { listPolicies, createPolicy, replaceThresholds, replaceQuality, replaceStageRates } from '../api';
import { DIFFICULTY_PRESETS, MODE_LABELS, STATUS_LABELS, type BonusPolicy, type PolicyStatus } from '../types';
import {
  DISPLAY, TH, PillButton, Loader, ErrorBar,
  usePagePadding,
} from '../components/atoms';

/* ---------- preset seed ---------- */
async function seedPreset(preset: string): Promise<string> {
  const base: any = {
    name: ({
      basic:    'Temel Prim Politikası',
      balanced: 'Dengeli Prim Politikası',
      premium:  'Premium Prim Politikası',
      custom:   'Yeni Politika',
    } as any)[preset] ?? 'Yeni Politika',
    description: DIFFICULTY_PRESETS[preset]?.description ?? null,
    mode: 'individual',
    period_type: 'monthly',
    currency: 'TRY',
    base_rate: preset === 'premium' ? 50 : preset === 'balanced' ? 35 : 30,
    distribution_method: 'by_contribution',
    quality_window: 'period',
    remake_penalty: preset === 'premium' ? 'penalty' : 'ignore',
    remake_penalty_points: preset === 'premium' ? 5 : 0,
    status: 'draft',
  };
  const p = await createPolicy(base);

  if (preset === 'basic') {
    await replaceThresholds(p.id, [{ policy_id: p.id, min_units: 20, rate: 30, label: 'Standart' }] as any);
  } else if (preset === 'balanced') {
    await replaceThresholds(p.id, [
      { policy_id: p.id, min_units: 30,  rate: 25, label: 'Başlangıç' },
      { policy_id: p.id, min_units: 60,  rate: 35, label: 'Orta' },
      { policy_id: p.id, min_units: 100, rate: 50, label: 'Üst' },
    ] as any);
    await replaceQuality(p.id, [
      { policy_id: p.id, max_remake_pct: 5,   multiplier: 1.0, label: 'Temiz' },
      { policy_id: p.id, max_remake_pct: 10,  multiplier: 0.8, label: 'Kabul' },
      { policy_id: p.id, max_remake_pct: 100, multiplier: 0.5, label: 'Düşük' },
    ] as any);
  } else if (preset === 'premium') {
    await replaceThresholds(p.id, [
      { policy_id: p.id, min_units: 50,  rate: 30,  label: 'Eşik' },
      { policy_id: p.id, min_units: 80,  rate: 45,  label: 'İyi' },
      { policy_id: p.id, min_units: 120, rate: 60,  label: 'Çok iyi' },
      { policy_id: p.id, min_units: 180, rate: 80,  label: 'Mükemmel' },
      { policy_id: p.id, min_units: 250, rate: 100, label: 'Lider' },
    ] as any);
    await replaceQuality(p.id, [
      { policy_id: p.id, max_remake_pct: 3,   multiplier: 1.10, label: 'Premium' },
      { policy_id: p.id, max_remake_pct: 6,   multiplier: 1.0,  label: 'Standart' },
      { policy_id: p.id, max_remake_pct: 10,  multiplier: 0.7,  label: 'Uyarı' },
      { policy_id: p.id, max_remake_pct: 100, multiplier: 0.3,  label: 'Kritik' },
    ] as any);
    await replaceStageRates(p.id, [
      { policy_id: p.id, stage_kind: 'DESIGN',  amount_per_unit: 3 },
      { policy_id: p.id, stage_kind: 'MILLING', amount_per_unit: 2 },
      { policy_id: p.id, stage_kind: 'CERAMIC', amount_per_unit: 4 },
      { policy_id: p.id, stage_kind: 'QC',      amount_per_unit: 2 },
    ] as any);
  }
  return p.id;
}

/* ---------- status meta ---------- */
const STATUS_TONE: Record<PolicyStatus, { bg: string; fg: string; dot: string; icon: any }> = {
  draft:    { bg: 'rgba(107,107,107,0.12)', fg: DS.ink[700], dot: DS.ink[500], icon: FileEdit },
  active:   { bg: 'rgba(45,154,107,0.14)',  fg: '#1F6B47',   dot: '#2D9A6B',   icon: CheckCircle2 },
  archived: { bg: 'rgba(217,75,75,0.10)',   fg: '#9C2E2E',   dot: '#D94B4B',   icon: Archive },
};

const STATUS_ORDER: PolicyStatus[] = ['active', 'draft', 'archived'];

/* ====================================================================== */

type Props = { onOpenEditor?: (policyId: string) => void };
type FilterKey = 'all' | PolicyStatus;

export default function BonusPolicyListScreen({ onOpenEditor }: Props = {}) {
  const openEditor = (id: string) => { onOpenEditor?.(id); };

  const [items, setItems] = useState<BonusPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listPolicies()); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async (preset: string) => {
    setCreating(true); setError(null);
    try { const id = await seedPreset(preset); setShowPicker(false); openEditor(id); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setCreating(false); }
  };

  /* ---------- counts + filter ---------- */
  const counts = useMemo(() => ({
    all:      items.length,
    active:   items.filter(p => p.status === 'active').length,
    draft:    items.filter(p => p.status === 'draft').length,
    archived: items.filter(p => p.status === 'archived').length,
  }), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return items
      .filter(p => filter === 'all' || p.status === filter)
      .filter(p => !q || p.name.toLocaleLowerCase('tr').includes(q) || (p.description ?? '').toLocaleLowerCase('tr').includes(q))
      .sort((a, b) => {
        const ai = STATUS_ORDER.indexOf(a.status);
        const bi = STATUS_ORDER.indexOf(b.status);
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name, 'tr');
      });
  }, [items, filter, query]);

  const pad = usePagePadding();
  const showSearch = items.length >= 4;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: pad, paddingBottom: 80 }}>

      {/* ─── HEADER ─── compact: title + count chips + actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.8, lineHeight: 32, color: DS.ink[900] }}>
            Prim Politikaları
          </Text>
          <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>
            {counts.all === 0
              ? 'Henüz politika yok — aşağıdan birini seçerek başla'
              : `${counts.active} aktif · ${counts.draft} taslak${counts.archived > 0 ? ` · ${counts.archived} arşiv` : ''}`
            }
          </Text>
        </View>
        <PillButton
          variant="dark"
          onPress={() => setShowPicker(s => !s)}
          leftIcon={<Plus size={14} color="#FFF" strokeWidth={2.4} />}
        >
          Yeni Politika
        </PillButton>
      </View>

      {error ? <ErrorBar message={error} /> : null}

      {/* ─── PRESET PICKER ─── (auto-open if empty) */}
      {(showPicker || (counts.all === 0 && !loading)) ? (
        <View style={{
          backgroundColor: '#FFF', borderRadius: 18,
          borderWidth: 1, borderColor: DS.ink[200],
          padding: 18, marginBottom: 16,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
            Hızlı Başlangıç
          </Text>
          <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.4, color: DS.ink[900], marginBottom: 14 }}>
            Şablon seç ve düzenleyiciye geç
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(DIFFICULTY_PRESETS).map(([key, def]) => (
              <Pressable
                key={key}
                onPress={() => handleCreate(key)}
                disabled={creating}
                style={({ pressed }) => ({
                  flex: 1, minWidth: 220,
                  backgroundColor: pressed ? TH.bgSoft : DS.ink[50],
                  borderRadius: 14,
                  borderWidth: 1, borderColor: pressed ? TH.primary : DS.ink[200],
                  padding: 14, gap: 10,
                  opacity: creating ? 0.5 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={14} color={TH.primary} strokeWidth={2.2} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>{def.label}</Text>
                  <View style={{ flex: 1 }} />
                  <ChevronRight size={14} color={DS.ink[400]} />
                </View>
                <Text style={{ fontSize: 11, color: DS.ink[500], lineHeight: 15 }} numberOfLines={2}>
                  {def.description}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* ─── TOOLBAR ─── filter chips + search */}
      {counts.all > 0 ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          marginBottom: 16, flexWrap: 'wrap',
        }}>
          <View style={{
            flexDirection: 'row', gap: 4, padding: 4,
            backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 999,
          }}>
            <FilterPill label={`Tümü ${counts.all}`}        active={filter === 'all'}      onPress={() => setFilter('all')} />
            <FilterPill label={`Aktif ${counts.active}`}    active={filter === 'active'}   onPress={() => setFilter('active')} dot="#2D9A6B" />
            <FilterPill label={`Taslak ${counts.draft}`}    active={filter === 'draft'}    onPress={() => setFilter('draft')}  dot={DS.ink[500]} />
            {counts.archived > 0 ? (
              <FilterPill label={`Arşiv ${counts.archived}`} active={filter === 'archived'} onPress={() => setFilter('archived')} dot="#D94B4B" />
            ) : null}
          </View>

          {showSearch ? (
            <View style={{
              flex: 1, minWidth: 200,
              flexDirection: 'row', alignItems: 'center', gap: 8,
              borderWidth: 1, borderColor: DS.ink[200], borderRadius: 999,
              paddingHorizontal: 12, paddingVertical: 6,
              backgroundColor: '#FFF',
            }}>
              <Search size={14} color={DS.ink[400]} strokeWidth={2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Politika ara…"
                placeholderTextColor={DS.ink[400]}
                style={{ flex: 1, fontSize: 13, color: DS.ink[900], outlineStyle: 'none' as any, paddingVertical: 2 }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ─── LIST ─── */}
      {loading ? (
        <Loader />
      ) : counts.all === 0 ? null : filtered.length === 0 ? (
        <View style={{
          backgroundColor: '#FFF', borderRadius: 18,
          borderWidth: 1, borderColor: DS.ink[200],
          padding: 36, alignItems: 'center',
        }}>
          <Search size={20} color={DS.ink[400]} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900], marginTop: 10 }}>
            Eşleşen politika yok
          </Text>
          <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>
            Filtre veya arama terimini değiştir.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {filtered.map(p => <PolicyRow key={p.id} policy={p} onPress={() => openEditor(p.id)} />)}
        </View>
      )}
    </ScrollView>
  );
}

/* ─────────────────────────────  FilterPill  ─────────────────────────── */
function FilterPill({ label, active, onPress, dot }:
  { label: string; active: boolean; onPress: () => void; dot?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
        backgroundColor: active ? DS.ink[900] : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {dot ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      ) : null}
      <Text style={{
        fontSize: 12, fontWeight: active ? '600' : '500',
        color: active ? '#FFF' : DS.ink[700],
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ─────────────────────────────  PolicyRow  ──────────────────────────── */
function PolicyRow({ policy: p, onPress }: { policy: BonusPolicy; onPress: () => void }) {
  const sym = CURRENCY_META[p.currency as Currency]?.symbol ?? baseSymbol();
  const t = STATUS_TONE[p.status];
  const StatusIcon = t.icon;
  const isActive = p.status === 'active';
  const isMuted  = p.status === 'archived';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: '#FFF', borderRadius: 16,
        borderWidth: 1, borderColor: DS.ink[200],
        padding: 14,
        flexDirection: 'row', alignItems: 'center', gap: 14,
        opacity: pressed ? 0.85 : (isMuted ? 0.75 : 1),
      })}
    >
      <View style={{
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: isActive ? TH.bgSoft : DS.ink[100],
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Wallet size={18} color={isActive ? TH.primary : DS.ink[400]} strokeWidth={1.8} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900], letterSpacing: -0.2 }}
            numberOfLines={1}
          >
            {p.name}
          </Text>
          {/* Status chip */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
            backgroundColor: t.bg,
          }}>
            <StatusIcon size={9} color={t.fg} strokeWidth={2.5} />
            <Text style={{ fontSize: 10, fontWeight: '700', color: t.fg, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {STATUS_LABELS[p.status]}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 4 }} numberOfLines={1}>
          {MODE_LABELS[p.mode]} · taban {sym}{p.base_rate}
          {p.description ? `  ·  ${p.description}` : ''}
        </Text>
      </View>

      {/* Right metric column: base rate big */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.6, color: DS.ink[900] }}>
          {sym}{p.base_rate}
        </Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: DS.ink[400], textTransform: 'uppercase', letterSpacing: 0.6 }}>
          / ÜYE
        </Text>
      </View>

      <ChevronRight size={16} color={DS.ink[400]} />
    </Pressable>
  );
}
