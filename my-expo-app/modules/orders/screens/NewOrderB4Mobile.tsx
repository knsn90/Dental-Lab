/**
 * NewOrderB4Mobile — Variant B B4 conversational 5-step order creation.
 * Mobile-only. One question per screen, large typography, auto-advancing pills.
 */
import React, { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import { MFONT, useMobileTheme } from '../../../core/theme/mobileTheme';
import { ToothDiagram } from '../../../core/ui/ToothDiagram';

// ─── Step data ───────────────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { key: 'tek_kron',    label: 'Tek kron' },
  { key: 'kopru',       label: 'Köprü' },
  { key: 'lamine',      label: 'Lamine' },
  { key: 'implant_kron',label: 'İmplant kron' },
  { key: 'tam_protez',  label: 'Tam protez' },
];

const COLOR_SWATCHES = ['A1', 'A2', 'A3', 'A3.5', 'B1', 'B2', 'B3', 'C2'];

const URGENCY_OPTIONS = [
  { key: 'urgent',  title: 'Acil',         days: 1, sub: '+%30 ücret', adder: 0.30 },
  { key: '3day',    title: '3 gün içinde', days: 3, sub: 'Hızlı teslimat',  adder: 0.10 },
  { key: '5day',    title: '5 gün içinde', days: 5, sub: 'Standart',        adder: 0.00 },
  { key: '7day',    title: '7 gün',        days: 7, sub: 'Avantajlı',       adder: -0.05 },
];

interface Picks {
  type: string | null;
  color: string | null;
  teeth: number[];
  urgency: typeof URGENCY_OPTIONS[number] | null;
}

interface Props {
  onClose: () => void;
  onSubmit: (picks: {
    type: string;
    typeLabel: string;
    color: string;
    teeth: number[];
    urgency: { key: string; days: number; adder: number };
    deliveryDate: string; // YYYY-MM-DD
  }) => Promise<void> | void;
  submitting?: boolean;
}

export function NewOrderB4Mobile({ onClose, onSubmit, submitting }: Props) {
  const theme = useMobileTheme();
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState<Picks>({ type: null, color: null, teeth: [], urgency: null });

  const next = () => setStep(s => Math.min(s + 1, 4));
  const prev = () => setStep(s => Math.max(s - 1, 0));

  const canNext = (() => {
    if (step === 0) return !!picks.type;
    if (step === 1) return !!picks.color;
    if (step === 2) return picks.teeth.length > 0;
    if (step === 3) return !!picks.urgency;
    return true;
  })();

  const handleSubmit = async () => {
    if (!picks.type || !picks.color || picks.teeth.length === 0 || !picks.urgency) return;
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + picks.urgency.days);
    const dd = deliveryDate.toISOString().split('T')[0];
    const typeLabel = TYPE_OPTIONS.find(o => o.key === picks.type)?.label ?? picks.type;
    await onSubmit({
      type: picks.type,
      typeLabel,
      color: picks.color,
      teeth: picks.teeth,
      urgency: { key: picks.urgency.key, days: picks.urgency.days, adder: picks.urgency.adder },
      deliveryDate: dd,
    });
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.bg }]}>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Pressable onPress={step === 0 ? onClose : prev} hitSlop={8} style={styles.topBtn}>
          {step === 0
            ? <X size={20} color={DS.ink[900]} strokeWidth={2} />
            : <ChevronLeft size={20} color={DS.ink[900]} strokeWidth={2} />}
        </Pressable>
        <Text style={styles.topEyebrow}>Soru {step + 1} / 5</Text>
        <View style={styles.topBtn} />
      </View>

      {/* ── Progress bar (5 segments) ───────────────────────────── */}
      <View style={styles.progressRow}>
        {[0, 1, 2, 3, 4].map(i => (
          <View
            key={i}
            style={[
              styles.progressSeg,
              { backgroundColor: i <= step ? theme.accent : 'rgba(0,0,0,0.08)' },
            ]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Step 0: Type ─────────────────────────────────────── */}
        {step === 0 && (
          <View>
            <Question
              before="Hangi tip "
              accent="vaka"
              after=" oluşturuyorsun?"
              theme={theme}
            />
            <View style={{ marginTop: 28, gap: 10 }}>
              {TYPE_OPTIONS.map(opt => {
                const active = picks.type === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setPicks(p => ({ ...p, type: opt.key })); setTimeout(next, 120); }}
                    style={[
                      styles.optRow,
                      { backgroundColor: active ? theme.accent : '#FFF', borderColor: active ? theme.accent : 'rgba(0,0,0,0.06)' },
                    ]}
                  >
                    <Text style={[styles.optLabel, { color: active ? '#FFF' : DS.ink[900] }]}>{opt.label}</Text>
                    <ChevronRight size={18} color={active ? '#FFF' : DS.ink[400]} strokeWidth={2} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Step 1: Color ────────────────────────────────────── */}
        {step === 1 && (
          <View>
            <Question
              before="Hangi "
              accent="renk"
              after=" kullanılacak?"
              theme={theme}
            />
            <View style={styles.swatchGrid}>
              {COLOR_SWATCHES.map(c => {
                const active = picks.color === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setPicks(p => ({ ...p, color: c }))}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: active ? theme.accent : '#FFF',
                        borderColor: active ? theme.accent : 'rgba(0,0,0,0.06)',
                      },
                    ]}
                  >
                    <Text style={[styles.swatchText, { color: active ? '#FFF' : DS.ink[900] }]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
            <PrimaryCTA label="Devam et" disabled={!canNext} theme={theme} onPress={next} />
          </View>
        )}

        {/* ── Step 2: Teeth ────────────────────────────────────── */}
        {step === 2 && (
          <View>
            <Question
              before="Hangi "
              accent="dişler"
              after="?"
              theme={theme}
            />
            <View style={styles.toothCard}>
              <ToothDiagram
                selected={picks.teeth}
                onToggle={(n) => setPicks(p => ({
                  ...p,
                  teeth: p.teeth.includes(n) ? p.teeth.filter(t => t !== n) : [...p.teeth, n],
                }))}
              />
            </View>
            <View style={styles.summaryChip}>
              <Text style={styles.summaryChipText}>
                {picks.teeth.length === 0
                  ? 'Diş seçilmedi'
                  : `${picks.teeth.length} diş · ${picks.teeth.sort((a, b) => a - b).join(', ')}`}
              </Text>
            </View>
            <PrimaryCTA label="Devam et" disabled={!canNext} theme={theme} onPress={next} />
          </View>
        )}

        {/* ── Step 3: Urgency ──────────────────────────────────── */}
        {step === 3 && (
          <View>
            <Question
              before="Ne kadar "
              accent="aceleyle"
              after="?"
              theme={theme}
            />
            <View style={{ marginTop: 28, gap: 10 }}>
              {URGENCY_OPTIONS.map(opt => {
                const active = picks.urgency?.key === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setPicks(p => ({ ...p, urgency: opt })); setTimeout(next, 120); }}
                    style={[
                      styles.urgRow,
                      { backgroundColor: active ? theme.accent : '#FFF', borderColor: active ? theme.accent : 'rgba(0,0,0,0.06)' },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.urgTitle, { color: active ? '#FFF' : DS.ink[900] }]}>{opt.title}</Text>
                      <Text style={[styles.urgSub, { color: active ? 'rgba(255,255,255,0.7)' : DS.ink[500] }]}>{opt.sub}</Text>
                    </View>
                    <ChevronRight size={18} color={active ? '#FFF' : DS.ink[400]} strokeWidth={2} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Step 4: Summary ──────────────────────────────────── */}
        {step === 4 && picks.type && picks.color && picks.urgency && (
          <View>
            <Text style={[styles.summaryEyebrow, { color: DS.ink[500] }]}>VAKA ÖZETİ</Text>
            <View style={[styles.summaryCard, { backgroundColor: theme.accent }]}>
              <Text style={styles.summaryHeadline}>
                {TYPE_OPTIONS.find(o => o.key === picks.type)?.label}
              </Text>
              <Text style={styles.summarySpec}>
                Renk {picks.color} · {picks.urgency.title}
              </Text>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryPair}>
                <View>
                  <Text style={styles.summaryPairLabel}>DİŞ</Text>
                  <Text style={styles.summaryPairValue}>{picks.teeth.length}</Text>
                </View>
                <View>
                  <Text style={styles.summaryPairLabel}>TESLİM</Text>
                  <Text style={styles.summaryPairValue}>{picks.urgency.days} gün</Text>
                </View>
              </View>
            </View>

            <Pressable
              disabled={submitting}
              onPress={handleSubmit}
              style={[styles.submitBtn, { borderColor: theme.accent, opacity: submitting ? 0.7 : 1 }]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.accent} />
              ) : (
                <>
                  <Text style={[styles.submitBtnText, { color: theme.accent }]}>Vakayı gönder</Text>
                  <ChevronRight size={18} color={theme.accent} strokeWidth={2} />
                </>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Question with highlighted noun ──────────────────────────────────────────
function Question({ before, accent, after, theme }: {
  before: string; accent: string; after: string; theme: { primary: string; accent: string };
}) {
  return (
    <Text style={styles.question}>
      {before}
      <Text style={[styles.questionAccent, { backgroundColor: theme.primary, color: theme.accent }]}>
        {' '}{accent}{' '}
      </Text>
      {after}
    </Text>
  );
}

// ─── Primary CTA ─────────────────────────────────────────────────────────────
function PrimaryCTA({ label, disabled, theme, onPress }: {
  label: string; disabled?: boolean; theme: { accent: string }; onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.cta,
        { backgroundColor: theme.accent, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <Text style={styles.ctaText}>{label}</Text>
      <ChevronRight size={18} color="#FFF" strokeWidth={2} />
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
  },
  topBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topEyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: DS.ink[500],
    letterSpacing: 0.66,
  },

  progressRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 4,
    marginBottom: 4,
  },
  progressSeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },

  question: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 32,
    color: DS.ink[900],
    letterSpacing: -1.28,
    lineHeight: 38,
    paddingTop: 16,
  },
  questionAccent: {
    borderRadius: 8,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },

  // Type rows
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  optLabel: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 17,
    letterSpacing: -0.2,
  },

  // Color swatches
  swatchGrid: {
    marginTop: 28,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatch: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 18,
  },

  // Tooth card
  toothCard: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  summaryChip: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  summaryChipText: {
    fontFamily: MFONT.uiMedium,
    fontSize: 12,
    color: DS.ink[700],
  },

  // Urgency rows
  urgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
  },
  urgTitle: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  urgSub: {
    fontFamily: MFONT.uiRegular,
    fontSize: 12,
    marginTop: 2,
  },

  // Summary
  summaryEyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    letterSpacing: 0.66,
    paddingTop: 16,
  },
  summaryCard: {
    marginTop: 12,
    padding: 24,
    borderRadius: 22,
  },
  summaryHeadline: {
    color: '#FFF',
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 30,
    letterSpacing: -1.05,
    lineHeight: 32,
  },
  summarySpec: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: MFONT.uiRegular,
    fontSize: 14,
    marginTop: 8,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginVertical: 18,
  },
  summaryPair: {
    flexDirection: 'row',
    gap: 36,
  },
  summaryPairLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: MFONT.uiMedium,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  summaryPairValue: {
    color: '#FFF',
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 28,
    letterSpacing: -0.84,
    marginTop: 4,
  },

  submitBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  submitBtnText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 16,
    letterSpacing: -0.2,
  },

  cta: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  ctaText: {
    color: '#FFF',
    fontFamily: MFONT.uiSemibold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
