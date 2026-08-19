/**
 * BonusPolicyEditorScreen — Prim Politikası Düzenleyici
 *
 * Tasarım dili: docs/DESIGN_LANGUAGE.md
 * Sol: kurallar bloklarına ayrılmış formlar.
 * Sağ: canlı önizleme paneli (dry-run).
 * Tüm etiketler Türkçe.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { safeBack } from '../../../../core/util/safeBack';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Save, Trash2, Plus, X, CheckCircle2, ArrowLeft,
  Users, ListChecks, Layers, Sparkles, ShieldCheck, Settings2,
  ChevronDown, ChevronRight, ChevronLeft, Play,
} from 'lucide-react-native';

import { DS } from '../../../../core/theme/dsTokens';
import { isRTL } from '../../../../core/i18n';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { CURRENCY_META, type Currency } from '../../../../core/money/currency';
import { baseSymbol } from '../../../../core/money/baseCurrency';
import {
  getPolicyFull, updatePolicy, deletePolicy,
  replaceWorkTypes, replaceThresholds, replaceDifficulty,
  replaceStageRates, replaceQuality, replaceAssignments,
  listAvailableWorkTypes, listEmployees,
  calculateBonusRun,
  type EmployeeLite,
} from '../api';
import {
  STAGE_KINDS, STAGE_KIND_LABELS, MODE_LABELS, DISTRIBUTION_LABELS, REMAKE_LABELS,
  STATUS_LABELS, QUALITY_WINDOW_LABELS,
  type PolicyFull, type BonusMode, type RemakePenaltyMode, type DistributionMethod,
  type QualityWindow, type PolicyStatus,
} from '../types';
import { useBonusSimulation } from '../hooks/useBonusSimulation';
import WorkTypeSelectorModal from '../components/WorkTypeSelectorModal';
import {
  DISPLAY, TH, TRY,
  PillButton, Chip, Loader, ErrorBar, usePagePadding,
  fmtUnit,
} from '../components/atoms';

const now = new Date();
const num = (v: string): number => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/* ====================================================================== */
/*  Local atoms                                                          */
/* ====================================================================== */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      fontSize: 10, fontWeight: '600', letterSpacing: 0.8,
      textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6,
    }}>
      {children}
    </Text>
  );
}

function TextField({ value, onChange, placeholder, keyboardType = 'default', width, multiline }:
  { value: string; onChange: (v: string) => void; placeholder?: string; keyboardType?: any; width?: number; multiline?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={DS.ink[400]}
      keyboardType={keyboardType}
      multiline={multiline}
      style={{
        borderWidth: 1, borderColor: DS.ink[200], borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 10,
        fontSize: 14, color: DS.ink[900],
        backgroundColor: '#FFF',
        ...(width ? { width } : {}),
        ...(multiline ? { minHeight: 60, textAlignVertical: 'top' as const } : {}),
      }}
    />
  );
}

function SectionCard({ icon: Icon, title, hint, children, defaultOpen = true }:
  { icon: any; title: string; hint?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{
      backgroundColor: '#FFF', borderRadius: 18,
      borderWidth: 1, borderColor: DS.ink[200], overflow: 'hidden',
    }}>
      <Pressable onPress={() => setOpen(o => !o)} style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 18, opacity: pressed ? 0.85 : 1,
      })}>
        <View style={{
          width: 40, height: 40, borderRadius: 12,
          backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} color={TH.primary} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900], letterSpacing: -0.2 }}>
            {title}
          </Text>
          {hint ? <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>{hint}</Text> : null}
        </View>
        {open ? <ChevronDown size={18} color={DS.ink[500]} /> : isRTL() ? <ChevronLeft size={18} color={DS.ink[500]} /> : <ChevronRight size={18} color={DS.ink[500]} />}
      </Pressable>
      {open ? (
        <View style={{ padding: 18, paddingTop: 4, borderTopWidth: 1, borderTopColor: DS.ink[100] }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

function RowRemoveBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: 'rgba(217,75,75,0.10)',
      alignItems: 'center', justifyContent: 'center',
      opacity: pressed ? 0.7 : 1,
    })}>
      <X size={14} color={TH.danger} strokeWidth={2.2} />
    </Pressable>
  );
}

function AddRowBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 6,
      alignSelf: 'flex-start', marginTop: 12,
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 999, backgroundColor: TH.bgSoft,
      opacity: pressed ? 0.8 : 1,
    })}>
      <Plus size={14} color={TH.primary} strokeWidth={2.2} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: TH.primary }}>{label}</Text>
    </Pressable>
  );
}

/* ====================================================================== */
/*  Quality Rules Card — Production Quality Engine                        */
/* ====================================================================== */

function describeEffect(mult: number): { text: string; color: string; bg: string } {
  if (mult >= 1.01) {
    const pct = Math.round((mult - 1) * 100);
    return { text: `+%${pct} ${autoT('ek prim')}`,   color: '#1F6B47', bg: 'rgba(45,154,107,0.12)' };
  }
  if (Math.abs(mult - 1) < 0.005) {
    return { text: 'Tam prim',            color: TH.info,   bg: 'rgba(74,143,201,0.12)' };
  }
  if (mult > 0) {
    const pct = Math.round((1 - mult) * 100);
    return { text: `−%${pct} kesinti`,    color: '#9C5E0E', bg: 'rgba(232,155,42,0.15)' };
  }
  return { text: 'Prim yok',              color: '#9C2E2E', bg: 'rgba(217,75,75,0.12)' };
}

function matchRule(rules: PolicyFull['quality'], pct: number) {
  const sorted = [...rules].sort((a, b) => a.max_remake_pct - b.max_remake_pct);
  for (const r of sorted) {
    if (pct <= r.max_remake_pct) return r;
  }
  return sorted[sorted.length - 1] ?? null;
}

const SHORT_WINDOW_LABELS: Record<QualityWindow, string> = {
  period:     'Bu ay',
  rolling_30: '30 gün',
  rolling_60: '60 gün',
  rolling_90: '90 gün',
  all_time:   'Tümü',
};

const PRESET_RULES: Record<string, { label: string; hint: string; rules: { max_remake_pct: number; multiplier: number; label: string }[] }> = {
  balanced: {
    label: 'Dengeli',
    hint:  '%5 temiz · %10 standart · ötesi kesintili',
    rules: [
      { max_remake_pct: 5,   multiplier: 1.00, label: 'Temiz' },
      { max_remake_pct: 10,  multiplier: 0.80, label: 'Standart' },
      { max_remake_pct: 100, multiplier: 0.50, label: 'Düşük' },
    ],
  },
  premium: {
    label: 'Premium',
    hint:  '%3 bonus · %6 tam · %10+ ciddi kesinti',
    rules: [
      { max_remake_pct: 3,   multiplier: 1.10, label: 'Premium' },
      { max_remake_pct: 6,   multiplier: 1.00, label: 'Standart' },
      { max_remake_pct: 10,  multiplier: 0.70, label: 'Uyarı' },
      { max_remake_pct: 100, multiplier: 0.30, label: 'Kritik' },
    ],
  },
  strict: {
    label: 'Sıkı',
    hint:  'Tek eşik · %2 üstü primi engeller',
    rules: [
      { max_remake_pct: 2,   multiplier: 1.00, label: 'Geçer' },
      { max_remake_pct: 100, multiplier: 0.00, label: 'Engelli' },
    ],
  },
};

function QualityRulesCard({
  policy, rules, onPolicyPatch, onRulesChange,
}: {
  policy: PolicyFull['policy'];
  rules: PolicyFull['quality'];
  onPolicyPatch: (p: Partial<PolicyFull['policy']>) => void;
  onRulesChange: (next: PolicyFull['quality']) => void;
}) {
  const [open, setOpen] = useState(true);
  const [testPct, setTestPct] = useState(5);
  const sym = CURRENCY_META[policy.currency as Currency]?.symbol ?? baseSymbol();

  const sortedRules = useMemo(() => [...rules].sort((a, b) => a.max_remake_pct - b.max_remake_pct), [rules]);
  const matched = useMemo(() => matchRule(rules, testPct), [rules, testPct]);
  const simulatedBase = 1000;
  const simulatedResult = matched ? Math.round(simulatedBase * matched.multiplier) : simulatedBase;
  const matchedEffect = matched ? describeEffect(matched.multiplier) : null;

  const updateRule = (i: number, patch: Partial<PolicyFull['quality'][number]>) =>
    onRulesChange(rules.map((x, ix) => ix === i ? { ...x, ...patch } : x));

  const removeRule = (i: number) =>
    onRulesChange(rules.filter((_, ix) => ix !== i));

  const addRule = () => {
    const lastPct = sortedRules.length ? sortedRules[sortedRules.length - 1].max_remake_pct : 0;
    onRulesChange([
      ...rules,
      { policy_id: policy.id, max_remake_pct: Math.min(lastPct + 5, 100), multiplier: 1, label: null },
    ]);
  };

  return (
    <View style={{
      backgroundColor: '#FFF', borderRadius: 18,
      borderWidth: 1, borderColor: DS.ink[200], overflow: 'hidden',
    }}>
      {/* HEADER */}
      <Pressable onPress={() => setOpen(o => !o)} style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 18, opacity: pressed ? 0.85 : 1,
      })}>
        <View style={{
          width: 40, height: 40, borderRadius: 12,
          backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center',
        }}>
          <ShieldCheck size={18} color={TH.primary} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900], letterSpacing: -0.2 }}>
            Kalite Kuralları
          </Text>
          <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>
            Üretim kalite motoru · {rules.length} kural · pencere: {QUALITY_WINDOW_LABELS[policy.quality_window]}
          </Text>
        </View>
        {open ? <ChevronDown size={18} color={DS.ink[500]} /> : isRTL() ? <ChevronLeft size={18} color={DS.ink[500]} /> : <ChevronRight size={18} color={DS.ink[500]} />}
      </Pressable>

      {!open ? null : (
        <View style={{ borderTopWidth: 1, borderTopColor: DS.ink[100] }}>

          {/* SETTINGS STRIP — compact, two-row stacked */}
          <View style={{
            paddingHorizontal: 18, paddingVertical: 12,
            backgroundColor: DS.ink[50],
            borderBottomWidth: 1, borderBottomColor: DS.ink[100],
            gap: 8,
          }}>
            {/* Row 1: Pencere */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ width: 64, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>
                Pencere
              </Text>
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {(['period', 'rolling_30', 'rolling_60', 'rolling_90', 'all_time'] as QualityWindow[]).map(w => {
                  const active = policy.quality_window === w;
                  return (
                    <Pressable key={w} onPress={() => onPolicyPatch({ quality_window: w })}
                      style={({ pressed }) => ({
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                        backgroundColor: active ? DS.ink[900] : '#FFF',
                        borderWidth: 1, borderColor: active ? DS.ink[900] : DS.ink[200],
                        opacity: pressed ? 0.8 : 1,
                      })}>
                      <Text style={{ fontSize: 11, fontWeight: active ? '600' : '500', color: active ? '#FFF' : DS.ink[700] }}>
                        {SHORT_WINDOW_LABELS[w]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Row 2: Ceza */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ width: 64, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>
                Ceza
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {(['ignore', 'exclude', 'penalty'] as RemakePenaltyMode[]).map(m => {
                  const active = policy.remake_penalty === m;
                  return (
                    <Pressable key={m} onPress={() => onPolicyPatch({ remake_penalty: m })}
                      style={({ pressed }) => ({
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                        backgroundColor: active ? DS.ink[900] : '#FFF',
                        borderWidth: 1, borderColor: active ? DS.ink[900] : DS.ink[200],
                        opacity: pressed ? 0.8 : 1,
                      })}>
                      <Text style={{ fontSize: 11, fontWeight: active ? '600' : '500', color: active ? '#FFF' : DS.ink[700] }}>
                        {REMAKE_LABELS[m]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {policy.remake_penalty === 'penalty' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginStart: 4, paddingStart: 8, borderStartWidth: 1, borderStartColor: DS.ink[200] }}>
                  <Text style={{ fontSize: 11, color: DS.ink[500] }}>−</Text>
                  <TextInput
                    value={String(policy.remake_penalty_points ?? 0)}
                    onChangeText={v => onPolicyPatch({ remake_penalty_points: num(v) })}
                    keyboardType="numeric"
                    style={{
                      width: 48,
                      borderWidth: 1, borderColor: DS.ink[200], borderRadius: 8,
                      paddingHorizontal: 8, paddingVertical: 4,
                      fontSize: 12, color: DS.ink[900], backgroundColor: '#FFF',
                      textAlign: 'end' as any,
                    }}
                  />
                  <Text style={{ fontSize: 11, color: DS.ink[500] }}>puan / yenileme</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* RULES TABLE */}
          <View style={{ padding: 18 }}>
            {/* Header — only when rules exist */}
            {rules.length > 0 ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 12, paddingBottom: 8,
                borderBottomWidth: 1, borderBottomColor: DS.ink[100],
                marginBottom: 4,
              }}>
                <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>
                  Kalite Eşikleri ({rules.length})
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '600', color: DS.ink[400] }}>
                  En düşük eşik öncelikli
                </Text>
              </View>
            ) : null}

            {/* Rows */}
            {rules.length === 0 ? (
              <View style={{ gap: 12 }}>
                {/* Preset templates */}
                <View style={{ gap: 8 }}>
                  <Text style={{
                    fontSize: 10, fontWeight: '700', color: DS.ink[500],
                    textTransform: 'uppercase', letterSpacing: 0.7,
                  }}>
                    Hızlı Başlangıç
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(PRESET_RULES).map(([key, preset]) => (
                      <Pressable
                        key={key}
                        onPress={() => onRulesChange(preset.rules.map(r => ({
                          policy_id: policy.id, ...r,
                        })))}
                        style={({ pressed }) => ({
                          flex: 1, minWidth: 180,
                          paddingHorizontal: 14, paddingVertical: 12,
                          borderRadius: 12, backgroundColor: '#FFF',
                          borderWidth: 1, borderColor: DS.ink[200],
                          opacity: pressed ? 0.85 : 1,
                        })}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Sparkles size={12} color={TH.primary} strokeWidth={2.2} />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                            {preset.label}
                          </Text>
                          <View style={{
                            paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
                            backgroundColor: DS.ink[100], marginStart: 'auto' as any,
                          }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[500] }}>
                              {preset.rules.length}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: DS.ink[500], lineHeight: 15 }}>
                          {preset.hint}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Or start blank */}
                <Pressable onPress={addRule} style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 12,
                  borderWidth: 1, borderStyle: 'dashed', borderColor: DS.ink[300], borderRadius: 12,
                  opacity: pressed ? 0.7 : 1,
                })}>
                  <Plus size={14} color={DS.ink[500]} strokeWidth={2.2} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>
                    Veya boş bir kuralla başla
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View>
                {rules.map((q, i) => {
                  const eff = describeEffect(q.multiplier);
                  return (
                    <View key={i} style={{
                      paddingHorizontal: 12, paddingVertical: 12,
                      borderBottomWidth: i < rules.length - 1 ? 1 : 0,
                      borderBottomColor: DS.ink[100],
                      gap: 10,
                    }}>
                      {/* Top: Etki badge + sil */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{
                          paddingHorizontal: 10, paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: eff.bg,
                        }}>
                          <Text
                            style={{ fontSize: 11, fontWeight: '700', color: eff.color, letterSpacing: 0.2 }}
                            numberOfLines={1}
                          >
                            {eff.text}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }} />
                        <RowRemoveBtn onPress={() => removeRule(i)} />
                      </View>

                      {/* Bottom: inputs row */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {/* Eşik (Yenileme %) */}
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingHorizontal: 10, paddingVertical: 4,
                          borderRadius: 8, backgroundColor: DS.ink[50],
                        }}>
                          <Text style={{ fontSize: 11, color: DS.ink[500] }}>≤</Text>
                          <TextInput
                            value={String(q.max_remake_pct)}
                            onChangeText={v => updateRule(i, { max_remake_pct: num(v) })}
                            keyboardType="numeric"
                            style={{
                              width: 44,
                              paddingVertical: 4,
                              fontSize: 14, fontWeight: '600', color: DS.ink[900],
                              textAlign: 'end' as any,
                            }}
                          />
                          <Text style={{ fontSize: 11, color: DS.ink[500] }}>%</Text>
                        </View>

                        {/* Çarpan */}
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingHorizontal: 10, paddingVertical: 4,
                          borderRadius: 8, backgroundColor: DS.ink[50],
                        }}>
                          <Text style={{ fontSize: 11, color: DS.ink[500] }}>çarpan</Text>
                          <Text style={{ fontSize: 11, color: DS.ink[400] }}>×</Text>
                          <TextInput
                            value={String(q.multiplier)}
                            onChangeText={v => updateRule(i, { multiplier: num(v) })}
                            keyboardType="numeric"
                            style={{
                              width: 52,
                              paddingVertical: 4,
                              fontSize: 14, fontWeight: '600', color: DS.ink[900],
                              textAlign: 'end' as any,
                            }}
                          />
                        </View>

                        {/* Etiket */}
                        <TextInput
                          value={q.label ?? ''}
                          onChangeText={v => updateRule(i, { label: v })}
                          placeholder="Etiket (isteğe bağlı)"
                          placeholderTextColor={DS.ink[400]}
                          style={{
                            flex: 1, minWidth: 120,
                            borderWidth: 1, borderColor: DS.ink[200], borderRadius: 8,
                            paddingHorizontal: 10, paddingVertical: 6,
                            fontSize: 13, color: DS.ink[900], backgroundColor: '#FFF',
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
                <AddRowBtn label="Yeni eşik ekle" onPress={addRule} />
              </View>
            )}
          </View>

          {/* LIVE SIMULATION */}
          {rules.length > 0 ? (
            <View style={{
              marginHorizontal: 16, marginBottom: 16,
              backgroundColor: TH.bgSoft, borderRadius: 14, padding: 16,
              borderWidth: 1, borderColor: 'rgba(71,113,171,0.18)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Play size={12} color={TH.primary} strokeWidth={2.5} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: TH.primary, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                  Canlı Simülasyon
                </Text>
              </View>

              {/* Test slider */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: DS.ink[700] }}>
                    Test remake oranı: <Text style={{ fontWeight: '700', color: DS.ink[900] }}>%{testPct}</Text>
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {[0, 3, 5, 10, 20, 50].map(v => (
                      <Pressable key={v} onPress={() => setTestPct(v)}
                        style={({ pressed }) => ({
                          paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                          backgroundColor: testPct === v ? DS.ink[900] : '#FFF',
                          borderWidth: 1, borderColor: testPct === v ? DS.ink[900] : DS.ink[200],
                          opacity: pressed ? 0.7 : 1,
                        })}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: testPct === v ? '#FFF' : DS.ink[700] }}>
                          %{v}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {/* Visual bar */}
                <View style={{
                  height: 6, borderRadius: 3,
                  backgroundColor: 'rgba(0,0,0,0.06)',
                  overflow: 'hidden',
                }}>
                  <View style={{
                    width: `${Math.min(100, testPct)}%`, height: '100%',
                    backgroundColor: matched ? describeEffect(matched.multiplier).color : DS.ink[400],
                  }} />
                </View>
              </View>

              {/* Result */}
              {matched && matchedEffect ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: '#FFF', borderRadius: 10, padding: 12,
                }}>
                  <View style={{
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                    backgroundColor: matchedEffect.bg,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: matchedEffect.color, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      Aktif Kural
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: DS.ink[700] }}>
                    ≤%{matched.max_remake_pct} → ×{matched.multiplier.toFixed(2)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontSize: 12, color: DS.ink[500] }}>{sym}1.000 →</Text>
                  <Text style={{ ...DISPLAY, fontSize: 22, color: matchedEffect.color, letterSpacing: -0.5 }}>
                    {sym}{(Number(simulatedResult) || 0).toLocaleString('tr-TR')}
                  </Text>
                </View>
              ) : (
                <View style={{ backgroundColor: '#FFF', borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                    Bu remake oranı için tanımlı kural yok — varsayılan: tam prim.
                  </Text>
                </View>
              )}

              <Text style={{ fontSize: 10, color: DS.ink[500], marginTop: 8, lineHeight: 14 }}>
                Örnek prim {sym}1.000 baz alınarak hesaplandı. Gerçek hesaplama, kişinin üye ve aşama primlerine bu çarpan uygulanarak yapılır.
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

/* ====================================================================== */
/*  Plan Builder Card — Genel Ayarlar redesign                            */
/* ====================================================================== */

const STATUS_TONE: Record<PolicyStatus, { bg: string; fg: string; dot: string }> = {
  draft:    { bg: 'rgba(107,107,107,0.12)', fg: DS.ink[700], dot: DS.ink[500] },
  active:   { bg: 'rgba(45,154,107,0.14)',  fg: '#1F6B47',   dot: '#2D9A6B' },
  archived: { bg: 'rgba(217,75,75,0.10)',   fg: '#9C2E2E',   dot: '#D94B4B' },
};

function PlanBuilderCard({
  policy, qualityCount, difficultyCount, thresholdCount, onPolicyPatch,
}: {
  policy: PolicyFull['policy'];
  qualityCount: number;
  difficultyCount: number;
  thresholdCount: number;
  onPolicyPatch: (p: Partial<PolicyFull['policy']>) => void;
}) {
  const [open, setOpen] = useState(true);
  const [statusOpen, setStatusOpen] = useState(false);
  const tone = STATUS_TONE[policy.status];

  // Auto summary
  const baseRate = policy.base_rate ?? 0;
  const currency = policy.currency ?? 'TRY';
  const summary = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${autoT(MODE_LABELS[policy.mode])} ${autoT('dağılım')}`);
    parts.push(`${autoT('üye başına')} ${currency} ${(Number(baseRate) || 0).toLocaleString('tr-TR')}`);
    if (thresholdCount > 0)  parts.push(`${thresholdCount} ${autoT('eşik')}`);
    if (qualityCount > 0)    parts.push(`${qualityCount} ${autoT('kalite kuralı')}`);
    if (difficultyCount > 0) parts.push(`${difficultyCount} ${autoT('zorluk çarpanı')}`);
    return parts.join(' · ');
  }, [policy.mode, currency, baseRate, thresholdCount, qualityCount, difficultyCount]);

  return (
    <View style={{
      backgroundColor: '#FFF', borderRadius: 18,
      borderWidth: 1, borderColor: DS.ink[200], overflow: 'hidden',
    }}>
      {/* HEADER — title + auto-summary + status badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 }}>
        <Pressable onPress={() => setOpen(o => !o)} style={({ pressed }) => ({
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.85 : 1,
        })}>
          <View style={{
            width: 40, height: 40, borderRadius: 12,
            backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center',
          }}>
            <Settings2 size={18} color={TH.primary} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900], letterSpacing: -0.2 }}>
              Plan Tasarımı
            </Text>
            <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }} numberOfLines={1}>
              {summary}
            </Text>
          </View>
        </Pressable>

        {/* Status badge — clickable */}
        <Pressable onPress={() => setStatusOpen(s => !s)} style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
          backgroundColor: tone.bg, opacity: pressed ? 0.75 : 1,
        })}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.dot }} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: tone.fg, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {STATUS_LABELS[policy.status]}
          </Text>
          <ChevronDown size={12} color={tone.fg} strokeWidth={2.2} />
        </Pressable>

        <Pressable onPress={() => setOpen(o => !o)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          {open ? <ChevronDown size={18} color={DS.ink[500]} /> : isRTL() ? <ChevronLeft size={18} color={DS.ink[500]} /> : <ChevronRight size={18} color={DS.ink[500]} />}
        </Pressable>
      </View>

      {/* Status dropdown — anchored under badge */}
      {statusOpen ? (
        <View style={{
          marginHorizontal: 16, marginBottom: 16,
          padding: 4, borderRadius: 12,
          backgroundColor: DS.ink[50], borderWidth: 1, borderColor: DS.ink[200],
          flexDirection: 'row', gap: 4, alignSelf: 'flex-end',
        }}>
          {(['draft', 'active', 'archived'] as PolicyStatus[]).map(s => {
            const t = STATUS_TONE[s];
            const active = policy.status === s;
            return (
              <Pressable key={s} onPress={() => { onPolicyPatch({ status: s }); setStatusOpen(false); }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                  backgroundColor: active ? t.bg : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: t.dot }} />
                <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? t.fg : DS.ink[700] }}>
                  {STATUS_LABELS[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!open ? null : (
        <View style={{ borderTopWidth: 1, borderTopColor: DS.ink[100] }}>

          {/* OVERVIEW STRIP — 4 KPI tiles */}
          <View style={{
            flexDirection: 'row', flexWrap: 'wrap',
            backgroundColor: DS.ink[50],
            borderBottomWidth: 1, borderBottomColor: DS.ink[100],
          }}>
            <OverviewTile label="Dağılım"     value={MODE_LABELS[policy.mode]} accent={TH.primary} />
            <OverviewTile label="Üye oranı"  value={`${currency} ${baseRate}`} accent={TH.success} />
            <OverviewTile
              label="Kalite kuralı"
              value={qualityCount > 0 ? `${qualityCount} ${autoT('eşik')}` : 'Henüz yok'}
              accent={qualityCount > 0 ? TH.info : DS.ink[400]}
              muted={qualityCount === 0}
            />
            <OverviewTile
              label="Zorluk çarpanı"
              value={difficultyCount > 0 ? `${difficultyCount} ${autoT('kayıt')}` : 'Henüz yok'}
              accent={difficultyCount > 0 ? '#7C3AED' : DS.ink[400]}
              muted={difficultyCount === 0}
              last
            />
          </View>

          {/* BUILDER ROWS */}
          <View style={{ padding: 18, gap: 14 }}>

            {/* DAĞILIM MODU — segmented control */}
            <View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 }}>
                Dağılım modu
              </Text>
              <View style={{ flexDirection: 'row', borderRadius: 12, backgroundColor: DS.ink[50], padding: 4, alignSelf: 'flex-start' }}>
                {(['individual', 'pool', 'hybrid'] as BonusMode[]).map(m => {
                  const active = policy.mode === m;
                  const shortLabel = m === 'hybrid' ? 'Karma' : MODE_LABELS[m];
                  return (
                    <Pressable key={m} onPress={() => onPolicyPatch({ mode: m })}
                      style={({ pressed }) => ({
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: active ? '#FFF' : 'transparent',
                        opacity: pressed ? 0.85 : 1,
                        ...(active ? {
                          shadowColor: '#000', shadowOpacity: 0.06,
                          shadowOffset: { width: 0, height: 1 }, shadowRadius: 3,
                        } : {}),
                      })}>
                      <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? DS.ink[900] : DS.ink[700] }}>
                        {shortLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 6 }}>
                {policy.mode === 'individual' && 'Her çalışan kendi ürettiği üye üzerinden prim alır.'}
                {policy.mode === 'pool'       && 'Toplam prim havuza eklenir, seçilen yönteme göre dağıtılır.'}
                {policy.mode === 'hybrid'     && 'Bireysel prim + havuz payı birlikte verilir.'}
              </Text>
            </View>

            {/* BİRİM ORANI — amount + currency inline */}
            <View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 }}>
                Üye başına oran
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'stretch',
                borderWidth: 1, borderColor: DS.ink[200], borderRadius: 12,
                backgroundColor: '#FFF',
                alignSelf: 'flex-start',
                overflow: 'hidden',
              }}>
                <TextInput
                  value={String(baseRate)}
                  onChangeText={v => onPolicyPatch({ base_rate: num(v) })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={DS.ink[400]}
                  style={{
                    width: 140,
                    paddingHorizontal: 14, paddingVertical: 10,
                    fontSize: 18, fontWeight: '600', color: DS.ink[900],
                    textAlign: 'end' as any,
                  }}
                />
                <View style={{ width: 1, backgroundColor: DS.ink[200] }} />
                <View style={{ flexDirection: 'row', backgroundColor: DS.ink[50] }}>
                  {(['TRY', 'USD', 'EUR', 'GBP'] as const).map(c => {
                    const active = currency === c;
                    return (
                      <Pressable key={c} onPress={() => onPolicyPatch({ currency: c })}
                        style={({ pressed }) => ({
                          paddingHorizontal: 12, justifyContent: 'center',
                          backgroundColor: active ? DS.ink[900] : 'transparent',
                          opacity: pressed ? 0.85 : 1,
                        })}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFF' : DS.ink[700], letterSpacing: 0.5 }}>
                          {c}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 8 }}>
                Eşik tanımlanmadığında her üye için bu tutar ödenir.
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function OverviewTile({ label, value, accent, muted, last }:
  { label: string; value: string; accent: string; muted?: boolean; last?: boolean }) {
  return (
    <View style={{
      flex: 1, minWidth: 120,
      paddingVertical: 12, paddingHorizontal: 16,
      borderEndWidth: last ? 0 : 1, borderEndColor: DS.ink[100],
      borderBottomWidth: 1, borderBottomColor: DS.ink[100],
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
        <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>
          {label}
        </Text>
      </View>
      <Text style={{
        fontSize: 14, fontWeight: '700',
        color: muted ? DS.ink[400] : DS.ink[900],
        fontStyle: muted ? 'italic' : 'normal',
      }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/* ====================================================================== */
/*  Screen                                                                */
/* ====================================================================== */

type Props = { embeddedId?: string; onBack?: () => void };

export default function BonusPolicyEditorScreen({ embeddedId, onBack }: Props = {}) {
  const params = useLocalSearchParams<{ id?: string }>();
  const policyId = embeddedId ?? String(params.id || '');
  const router = useRouter();
  const goBack = () => (onBack ? onBack() : safeBack('/'));
  const pad = usePagePadding();

  const [full, setFull] = useState<PolicyFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [availableWorkTypes, setAvailableWorkTypes] = useState<string[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);

  const [simYear, setSimYear]   = useState(now.getFullYear());
  const [simMonth, setSimMonth] = useState(now.getMonth() + 1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const sim = useBonusSimulation(policyId, simYear, simMonth);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [f, wt, emps] = await Promise.all([
        getPolicyFull(policyId),
        listAvailableWorkTypes(),
        listEmployees(),
      ]);
      setFull(f); setAvailableWorkTypes(wt); setEmployees(emps);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setLoading(false); }
  }, [policyId]);

  useEffect(() => { if (policyId) load(); }, [policyId, load]);

  const patchPolicy = (patch: Partial<PolicyFull['policy']>) =>
    setFull(prev => prev ? { ...prev, policy: { ...prev.policy, ...patch } } : prev);

  const handleSave = async () => {
    if (!full) return;
    setSaving(true); setError(null);
    try {
      const p = full.policy;
      await updatePolicy(p.id, {
        name: p.name,
        description: p.description,
        mode: p.mode,
        period_type: p.period_type ?? 'monthly',
        currency: p.currency ?? 'TRY',
        base_rate: p.base_rate ?? 0,
        distribution_method: p.distribution_method,
        quality_window: p.quality_window ?? 'period',
        remake_penalty: p.remake_penalty ?? 'ignore',
        remake_penalty_points: p.remake_penalty_points ?? 0,
        status: p.status ?? 'draft',
      });
      await replaceWorkTypes(p.id, full.work_types);
      await replaceThresholds(p.id, full.thresholds);
      await replaceDifficulty(p.id, full.difficulty);
      await replaceStageRates(p.id, full.stage_rates);
      await replaceQuality(p.id, full.quality);
      await replaceAssignments(p.id, full.assignments);
      sim.bump();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!full) return;
    if (typeof confirm === 'function' && !confirm(`"${full.policy.name}" ${autoT('silinsin mi? Geri alınamaz.')}`)) return;
    try {
      await deletePolicy(full.policy.id);
      goBack();
    } catch (e: any) { setError(String(e?.message ?? e)); }
  };

  if (loading) return <Loader />;
  if (!full) {
    return (
      <View style={{ padding: 16 }}>
        <ErrorBar message={error ?? 'Politika bulunamadı.'} />
      </View>
    );
  }

  const p = full.policy;
  const sym = CURRENCY_META[p.currency as Currency]?.symbol ?? baseSymbol();
  const isHavuz = p.mode === 'pool' || p.mode === 'hybrid';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: pad, paddingBottom: 80 }}>

      {/* F1c HERO — politika başlığı */}
      <View style={{
        borderRadius: 20, backgroundColor: TH.primary, padding: 22,
        position: 'relative', overflow: 'hidden', marginBottom: 16,
      }}>
        <View style={{ position: 'absolute', top: -40, end: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
        <View style={{ position: 'absolute', bottom: -50, start: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(0,0,0,0.05)' }} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
              Prim Politikası
            </Text>
            <TextInput
              value={p.name}
              onChangeText={t => patchPolicy({ name: t })}
              placeholder="Politika adı"
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={{
                ...DISPLAY, fontSize: 30, color: '#FFF',
                letterSpacing: -0.9, lineHeight: 36,
                ...(typeof document !== 'undefined' ? { outlineStyle: 'none' as any } : {}),
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{MODE_LABELS[p.mode]}</Text>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)' }} />
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.20)' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFF', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {STATUS_LABELS[p.status]}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pressable onPress={handleDelete} style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 14, paddingVertical: 9,
              borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)',
              opacity: pressed ? 0.7 : 1,
            })}>
              <Trash2 size={14} color="#FFF" strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Sil</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 16, paddingVertical: 9,
              borderRadius: 999, backgroundColor: '#FFF',
              opacity: saving ? 0.6 : (pressed ? 0.85 : 1),
            })}>
              <Save size={14} color={TH.primary} strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: TH.primary }}>
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {error ? <ErrorBar message={error} /> : null}

      {/* BODY: 2 kolon */}
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>

        {/* LEFT — KURALLAR */}
        <View style={{ flex: 2, flexBasis: 320, minWidth: 280, gap: 16 }}>

          <PlanBuilderCard
            policy={p}
            qualityCount={full.quality.length}
            difficultyCount={full.difficulty.length}
            thresholdCount={full.thresholds.length}
            onPolicyPatch={patchPolicy}
          />

          <SectionCard icon={ListChecks} title="Sayılan İş Türleri" hint="Prim hesaplamasına dahil edilecek iş türleri">
            {(() => {
              const selectedCount = full.work_types.length;
              if (selectedCount === 0) {
                return (
                  <View style={{ marginTop: 14, alignItems: 'flex-start', gap: 12 }}>
                    <Text style={{ fontSize: 13, color: DS.ink[500] }}>
                      Henüz iş türü dahil edilmedi. Hesaplama tüm iş türlerini sayar.
                    </Text>
                    <PillButton variant="dark" onPress={() => setPickerOpen(true)}
                                leftIcon={<Plus size={14} color="#FFF" strokeWidth={2.2} />}>
                      İş Türlerini Seç
                    </PillButton>
                  </View>
                );
              }
              const previewNames = full.work_types.slice(0, 5).map(w => w.work_type);
              const remaining = selectedCount - previewNames.length;
              return (
                <View style={{ marginTop: 14, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
                    <View>
                      <Text style={{ ...DISPLAY, fontSize: 36, color: DS.ink[900], letterSpacing: -1, lineHeight: 38 }}>
                        {selectedCount}
                      </Text>
                      <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 2 }}>
                        iş türü seçili
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 200 }}>
                      <Text style={{ fontSize: 12, color: DS.ink[500], lineHeight: 18 }}>
                        {previewNames.join(' · ')}{remaining > 0 ? ` · +${remaining} daha` : ''}
                      </Text>
                    </View>
                  </View>
                  <PillButton variant="light" onPress={() => setPickerOpen(true)}
                              leftIcon={<Settings2 size={14} color={DS.ink[900]} strokeWidth={2.2} />}>
                    Seçimi Düzenle
                  </PillButton>
                </View>
              );
            })()}
          </SectionCard>

          <WorkTypeSelectorModal
            visible={pickerOpen}
            selected={full.work_types.map(w => w.work_type)}
            onClose={() => setPickerOpen(false)}
            onApply={(next) => setFull(prev => prev ? {
              ...prev,
              work_types: next.map(wt => ({ policy_id: prev.policy.id, work_type: wt })),
            } : prev)}
          />

          <SectionCard icon={Layers} title="Eşik Tablosu" hint="Üye sayısına göre artan oranlar">
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 4, marginBottom: 6 }}>
                <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>En az üye</Text>
                <Text style={{ width: 120, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Üye başına oran</Text>
                <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Etiket</Text>
                <View style={{ width: 32 }} />
              </View>
              {full.thresholds.length === 0 ? (
                <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic', padding: 12 }}>
                  Eşik tanımlı değil — taban oran kullanılır.
                </Text>
              ) : full.thresholds.map((t, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <TextField value={String(t.min_units)} keyboardType="numeric" width={100}
                             onChange={v => setFull(prev => prev ? {
                               ...prev, thresholds: prev.thresholds.map((x, ix) => ix === i ? { ...x, min_units: num(v) } : x),
                             } : prev)} />
                  <TextField value={String(t.rate ?? 0)} keyboardType="numeric" width={120}
                             onChange={v => setFull(prev => prev ? {
                               ...prev, thresholds: prev.thresholds.map((x, ix) => ix === i ? { ...x, rate: num(v) } : x),
                             } : prev)} />
                  <View style={{ flex: 1 }}>
                    <TextField value={t.label ?? ''} placeholder="İsteğe bağlı"
                               onChange={v => setFull(prev => prev ? {
                                 ...prev, thresholds: prev.thresholds.map((x, ix) => ix === i ? { ...x, label: v } : x),
                               } : prev)} />
                  </View>
                  <RowRemoveBtn onPress={() => setFull(prev => prev ? {
                    ...prev, thresholds: prev.thresholds.filter((_, ix) => ix !== i),
                  } : prev)} />
                </View>
              ))}
              <AddRowBtn label="Yeni eşik ekle" onPress={() => setFull(prev => prev ? {
                ...prev, thresholds: [...prev.thresholds, {
                  policy_id: prev.policy.id,
                  min_units: prev.thresholds.length ? (prev.thresholds[prev.thresholds.length - 1].min_units + 20) : 0,
                  rate: 0, label: null,
                }],
              } : prev)} />
            </View>
          </SectionCard>

          <SectionCard icon={Sparkles} title="Zorluk Çarpanları" hint="İş türüne göre puan çarpanı (varsayılan 1.0)" defaultOpen={false}>
            <View style={{ marginTop: 14 }}>
              {full.difficulty.length === 0 ? (
                <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic', padding: 12 }}>
                  Tanımlı değil — tüm iş türleri 1.0 çarpanla sayılır.
                </Text>
              ) : full.difficulty.map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <TextField value={d.work_type} placeholder="İş türü"
                               onChange={v => setFull(prev => prev ? {
                                 ...prev, difficulty: prev.difficulty.map((x, ix) => ix === i ? { ...x, work_type: v } : x),
                               } : prev)} />
                  </View>
                  <TextField value={String(d.multiplier ?? 1)} keyboardType="numeric" width={100}
                             onChange={v => setFull(prev => prev ? {
                               ...prev, difficulty: prev.difficulty.map((x, ix) => ix === i ? { ...x, multiplier: num(v) } : x),
                             } : prev)} />
                  <RowRemoveBtn onPress={() => setFull(prev => prev ? {
                    ...prev, difficulty: prev.difficulty.filter((_, ix) => ix !== i),
                  } : prev)} />
                </View>
              ))}
              <AddRowBtn label="İş türü ekle" onPress={() => setFull(prev => prev ? {
                ...prev, difficulty: [...prev.difficulty, { policy_id: prev.policy.id, work_type: '', multiplier: 1 }],
              } : prev)} />
            </View>
          </SectionCard>

          <SectionCard icon={Layers} title="Aşama Primleri" hint="Aşama başına ek ödeme (üye başına)" defaultOpen={false}>
            <View style={{ marginTop: 14 }}>
              {full.stage_rates.length === 0 ? (
                <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic', padding: 12 }}>
                  Tanımlı değil — aşama bonusu yok.
                </Text>
              ) : full.stage_rates.map((s, i) => (
                <View key={i} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <TextField value={String(s.amount_per_unit ?? 0)} keyboardType="numeric" width={120}
                               onChange={v => setFull(prev => prev ? {
                                 ...prev, stage_rates: prev.stage_rates.map((x, ix) => ix === i ? { ...x, amount_per_unit: num(v) } : x),
                               } : prev)} />
                    <Text style={{ fontSize: 11, color: DS.ink[500] }}>{sym} / üye</Text>
                    <View style={{ flex: 1 }} />
                    <RowRemoveBtn onPress={() => setFull(prev => prev ? {
                      ...prev, stage_rates: prev.stage_rates.filter((_, ix) => ix !== i),
                    } : prev)} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {STAGE_KINDS.map(k => (
                      <Chip key={k} active={s.stage_kind === k}
                            onPress={() => setFull(prev => prev ? {
                              ...prev, stage_rates: prev.stage_rates.map((x, ix) => ix === i ? { ...x, stage_kind: k } : x),
                            } : prev)}>
                        {STAGE_KIND_LABELS[k] ?? k}
                      </Chip>
                    ))}
                  </View>
                </View>
              ))}
              <AddRowBtn label="Aşama ekle" onPress={() => setFull(prev => prev ? {
                ...prev, stage_rates: [...prev.stage_rates, { policy_id: prev.policy.id, stage_kind: 'DESIGN', amount_per_unit: 0 }],
              } : prev)} />
            </View>
          </SectionCard>

          <QualityRulesCard
            policy={p}
            rules={full.quality}
            onPolicyPatch={patchPolicy}
            onRulesChange={(next) => setFull(prev => prev ? { ...prev, quality: next } : prev)}
          />

          {isHavuz ? (
            <SectionCard icon={Users} title="Havuz Ayarları" hint="Havuz ve karma modunda dağıtım yöntemi">
              <View style={{ marginTop: 14, gap: 14 }}>
                <View>
                  <FieldLabel>Dağıtım yöntemi</FieldLabel>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {(['equal', 'by_salary', 'by_points', 'by_contribution', 'flat_per_member'] as DistributionMethod[]).map(d => (
                      <Chip key={d} active={p.distribution_method === d} onPress={() => patchPolicy({ distribution_method: d })}>
                        {DISTRIBUTION_LABELS[d]}
                      </Chip>
                    ))}
                  </View>
                </View>

                {p.distribution_method === 'flat_per_member' ? (
                  <View style={{
                    backgroundColor: TH.bgSoft, borderRadius: 14, padding: 14,
                  }}>
                    <FieldLabel>Kişi başı sabit tutar ({p.currency ?? 'TRY'})</FieldLabel>
                    <TextField
                      value={String(p.flat_amount_per_member ?? 0)}
                      onChange={v => patchPolicy({ flat_amount_per_member: num(v) })}
                      keyboardType="numeric"
                      width={180}
                      placeholder="0"
                    />
                    <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 8, lineHeight: 16 }}>
                      Her hak eden çalışana, havuzdan bu sabit tutar ödenir.
                      Toplam havuz = hak eden kişi sayısı × bu tutar.
                    </Text>
                  </View>
                ) : null}
              </View>
            </SectionCard>
          ) : null}

          <SectionCard icon={Users} title="Atanan Çalışanlar" hint="Bu politikadan kimler yararlanır?" defaultOpen={false}>
            <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {employees.length === 0 ? (
                <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic' }}>
                  Çalışan listesi boş.
                </Text>
              ) : (
                employees.map(emp => {
                  const active = full.assignments.some(a => a.employee_id === emp.id);
                  return (
                    <Pressable
                      key={emp.id}
                      onPress={() => setFull(prev => prev ? {
                        ...prev,
                        assignments: active
                          ? prev.assignments.filter(a => a.employee_id !== emp.id)
                          : [...prev.assignments, {
                              policy_id: prev.policy.id,
                              employee_id: emp.id,
                              valid_from: new Date().toISOString().slice(0, 10),
                              valid_to: null,
                            }],
                      } : prev)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 14, paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: active ? TH.success : '#FFF',
                        borderWidth: 1, borderColor: active ? TH.success : DS.ink[200],
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#FFF' : DS.ink[900] }}>
                        {emp.full_name}
                      </Text>
                      <Text style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.85)' : DS.ink[400], marginTop: 2 }}>
                        {emp.role ?? '—'}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
            <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 12 }}>
              {full.assignments.length} çalışan atandı
            </Text>
          </SectionCard>
        </View>

        {/* RIGHT — CANLI ÖNİZLEME */}
        <View style={{ flex: 1, minWidth: 280, maxWidth: 420, gap: 16 }}>
          <View style={{
            backgroundColor: '#FFF', borderRadius: 18,
            borderWidth: 1, borderColor: DS.ink[200],
            padding: 18,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Play size={16} color={TH.success} strokeWidth={2.5} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>Canlı Önizleme</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>Yıl</FieldLabel>
                <TextField value={String(simYear)} keyboardType="numeric"
                           onChange={v => setSimYear(num(v) || now.getFullYear())} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>Ay</FieldLabel>
                <TextField value={String(simMonth)} keyboardType="numeric"
                           onChange={v => setSimMonth(Math.min(12, Math.max(1, num(v) || 1)))} />
              </View>
            </View>

            {sim.loading ? (
              <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={TH.primary} /></View>
            ) : sim.error ? (
              <ErrorBar message={sim.error} />
            ) : sim.result ? (
              <>
                <View style={{ backgroundColor: TH.bgSoft, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: TH.primary, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 6 }}>
                    Toplam Prim
                  </Text>
                  <Text style={{ ...DISPLAY, fontSize: 32, color: DS.ink[900], letterSpacing: -1, lineHeight: 36 }}>
                    {TRY(sim.result.total_payout)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <Text style={{ fontSize: 11, color: DS.ink[500] }}>{fmtUnit(sim.result.total_units)}</Text>
                    {sim.result.total_pool > 0 ? (
                      <>
                        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: DS.ink[300], alignSelf: 'center' }} />
                        <Text style={{ fontSize: 11, color: DS.ink[500] }}>Havuz {TRY(sim.result.total_pool)}</Text>
                      </>
                    ) : null}
                  </View>
                </View>

                <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[500], letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 }}>
                  Çalışan Dağılımı
                </Text>
                {(sim.result.breakdown ?? []).slice(0, 10).map((r: any, i: number) => (
                  <View key={r.employee_id || i} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingVertical: 8,
                    borderBottomWidth: i < Math.min(10, (sim.result?.breakdown?.length ?? 0)) - 1 ? 1 : 0,
                    borderBottomColor: DS.ink[100],
                  }}>
                    <View style={{
                      width: 22, height: 22, borderRadius: 11,
                      backgroundColor: DS.ink[100],
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[700] }}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                        {r.employee_name || '—'}
                      </Text>
                      <Text style={{ fontSize: 10, color: DS.ink[500] }}>
                        {fmtUnit(r.units)} · {(r.points ?? 0).toFixed?.(1) ?? r.points} puan
                      </Text>
                      {r.error ? <Text style={{ fontSize: 9, color: TH.danger }}>{r.error}</Text> : null}
                    </View>
                    <Text style={{ ...DISPLAY, fontSize: 14, color: '#1F6B47', letterSpacing: -0.3 }}>
                      {TRY(r.total_bonus)}
                    </Text>
                  </View>
                ))}
                {(sim.result.breakdown?.length ?? 0) === 0 ? (
                  <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 }}>
                    Bu ay için veri yok.
                  </Text>
                ) : null}
                {(sim.result.breakdown?.length ?? 0) > 10 ? (
                  <Text style={{ fontSize: 11, color: DS.ink[400], textAlign: 'center', marginTop: 8 }}>
                    +{(sim.result.breakdown?.length ?? 0) - 10} kişi daha
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={{ fontSize: 12, color: DS.ink[400] }}>Önizleme yükleniyor…</Text>
            )}

            <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: DS.ink[100] }}>
              <PillButton
                variant="success"
                leftIcon={<CheckCircle2 size={14} color="#FFF" />}
                onPress={async () => {
                  try {
                    const r = await calculateBonusRun(p.id, simYear, simMonth, false);
                    if (r?.run_id && typeof alert === 'function') {
                      alert('Taslak hesaplama oluşturuldu. Hesaplamalar sekmesinden onaylayabilirsiniz.');
                    }
                  } catch (e: any) {
                    if (typeof alert === 'function') alert('Hata: ' + (e?.message ?? e));
                  }
                }}
              >
                Resmî Hesaplama Oluştur
              </PillButton>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
