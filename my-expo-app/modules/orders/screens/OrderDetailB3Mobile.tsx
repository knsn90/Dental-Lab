/**
 * OrderDetailB3Mobile — Variant B B3 dark hero order detail.
 * Full-screen accent bg + 220×220 SVG progress ring + slide-to-advance.
 * Mobile-only.
 */
import React, { useRef, useState, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  Animated, PanResponder, ActivityIndicator,
} from 'react-native';
import { ChevronLeft, MessageCircle, ChevronRight, Send } from 'lucide-react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import { MFONT, useMobileTheme } from '../../../core/theme/mobileTheme';

// ─── Stage labels ────────────────────────────────────────────────────────────
const STAGE_LABELS = ['Sipariş', 'CAD', 'Üretim', 'QA', 'Teslim'];

interface Props {
  orderId: string;
  orderNumber: string;
  workType: string;
  patientName?: string;
  doctorName?: string;
  clinicName?: string;
  /** 0..1 progress */
  progress: number;
  stageIdx: number;            // 0..4 — current active stage
  statusLabel: string;
  spec?: {
    color?: string;
    material?: string;
    delivery?: string;
    cadVersion?: string;
  };
  canAdvance?: boolean;
  advancing?: boolean;
  nextStageLabel?: string | null;
  onBack: () => void;
  onChat: () => void;
  onAdvance?: () => void;
  onMessageClinic?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function OrderDetailB3Mobile(props: Props) {
  const theme = useMobileTheme();
  const accent = theme.accent;
  const primary = theme.primary;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: accent }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top row ────────────────────────────────────────────── */}
        <View style={styles.topRow}>
          <GhostCircle onPress={props.onBack}>
            <ChevronLeft size={20} color="#FFF" strokeWidth={2} />
          </GhostCircle>
          <Text style={styles.topId}>{props.orderNumber}</Text>
          <GhostCircle onPress={props.onChat}>
            <MessageCircle size={18} color="#FFF" strokeWidth={1.8} />
          </GhostCircle>
        </View>

        {/* ── Progress ring ──────────────────────────────────────── */}
        <View style={styles.ringWrap}>
          <ProgressRing progress={props.progress} stageIdx={props.stageIdx} primary={primary} />
        </View>

        {/* ── Status / type / patient ────────────────────────────── */}
        <View style={styles.midSection}>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{props.statusLabel}</Text>
          </View>
          <Text style={styles.workType}>{props.workType}</Text>
          {(props.patientName || props.doctorName) && (
            <Text style={styles.patientMeta}>
              {[props.patientName, props.doctorName].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>

        {/* ── Clinic card ────────────────────────────────────────── */}
        {props.clinicName && (
          <View style={[styles.clinicCard, styles.translucent]}>
            <View style={styles.clinicLeft}>
              <View style={[styles.clinicAvatar, { backgroundColor: 'rgba(255,255,255,0.10)' }]}>
                <Text style={styles.clinicAvatarText}>
                  {(props.clinicName ?? '?').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.clinicEyebrow}>HEKİM · KLİNİK</Text>
                <Text style={styles.clinicName} numberOfLines={1}>{props.clinicName}</Text>
              </View>
            </View>
            {props.onMessageClinic && (
              <Pressable
                onPress={props.onMessageClinic}
                style={[styles.messageBtn, { backgroundColor: primary }]}
              >
                <Send size={16} color={accent} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        )}

        {/* ── Spec grid 2×2 ──────────────────────────────────────── */}
        <View style={styles.specGrid}>
          <SpecTile label="Renk" value={props.spec?.color ?? '—'} />
          <SpecTile label="Materyal" value={props.spec?.material ?? '—'} />
          <SpecTile label="Teslim" value={props.spec?.delivery ?? '—'} />
          <SpecTile label="CAD" value={props.spec?.cadVersion ?? '—'} />
        </View>

        {/* ── Slide-to-advance ────────────────────────────────────── */}
        {props.canAdvance && props.nextStageLabel && (
          <View style={{ paddingHorizontal: 24, marginTop: 22 }}>
            <SlideToAdvance
              label={props.advancing ? 'İlerletiliyor…' : `Aşamayı ilerlet → ${props.nextStageLabel}`}
              accent={accent}
              primary={primary}
              disabled={!!props.advancing}
              onComplete={() => props.onAdvance?.()}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Ghost circle button ─────────────────────────────────────────────────────
function GhostCircle({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.ghostCircle} hitSlop={6}>
      {children}
    </Pressable>
  );
}

// ─── Progress ring ───────────────────────────────────────────────────────────
function ProgressRing({ progress, stageIdx, primary }: {
  progress: number; stageIdx: number; primary: string;
}) {
  const SIZE = 220;
  const R = 98;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const C = 2 * Math.PI * R; // 615.75
  const dashOffset = C * (1 - Math.max(0, Math.min(1, progress)));

  const stageName = STAGE_LABELS[Math.min(stageIdx, STAGE_LABELS.length - 1)] ?? '—';
  const pct = Math.round(progress * 100);

  // Stage marks at angles -90 + (i/(n-1)) * 360
  const n = STAGE_LABELS.length;
  const marks = STAGE_LABELS.map((_, i) => {
    const angle = (-90 + (i / (n - 1)) * 360) * (Math.PI / 180);
    const x = CX + R * Math.cos(angle);
    const y = CY + R * Math.sin(angle);
    const reached = i <= stageIdx;
    return { x, y, reached };
  });

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE}>
        <G rotation={-90} origin={`${CX}, ${CY}`}>
          <Circle cx={CX} cy={CY} r={R} stroke="rgba(255,255,255,0.08)" strokeWidth={3} fill="none" />
          <Circle
            cx={CX}
            cy={CY}
            r={R}
            stroke={primary}
            strokeWidth={6}
            fill="none"
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </G>
        {marks.map((m, i) => (
          <Circle
            key={i}
            cx={m.x}
            cy={m.y}
            r={m.reached ? 4 : 3}
            fill={m.reached ? primary : 'rgba(255,255,255,0.20)'}
          />
        ))}
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.ringEyebrow}>{stageName.toUpperCase()}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.ringPct}>{pct}</Text>
            <Text style={styles.ringPctSym}>%</Text>
          </View>
          <Text style={styles.ringDone}>tamamlandı</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Spec tile ───────────────────────────────────────────────────────────────
function SpecTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.specTile, styles.translucentSubtle]}>
      <Text style={styles.specLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.specValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Slide-to-advance ────────────────────────────────────────────────────────
function SlideToAdvance({ label, accent, primary, disabled, onComplete }: {
  label: string;
  accent: string;
  primary: string;
  disabled: boolean;
  onComplete: () => void;
}) {
  const TRACK_W = 1; // proportion-based; we'll measure
  const KNOB = 50;
  const HEIGHT = 60;
  const [trackWidth, setTrackWidth] = useState(0);
  const max = Math.max(0, trackWidth - KNOB - 8);
  const x = useRef(new Animated.Value(0)).current;
  const xRef = useRef(0);

  React.useEffect(() => {
    const id = x.addListener(({ value }) => { xRef.current = value; });
    return () => x.removeListener(id);
  }, [x]);

  const reset = () => Animated.spring(x, { toValue: 0, useNativeDriver: false, friction: 8 }).start();

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 && !disabled,
    onPanResponderMove: (_e, g) => {
      const v = Math.max(0, Math.min(max, g.dx));
      x.setValue(v);
    },
    onPanResponderRelease: () => {
      if (xRef.current > max * 0.85) {
        Animated.timing(x, { toValue: max, duration: 120, useNativeDriver: false }).start(() => {
          onComplete();
          // reset after a beat (parent will likely refetch + state change)
          setTimeout(reset, 400);
        });
      } else {
        reset();
      }
    },
  }), [max, x, disabled, onComplete]);

  // Fill width = progress * trackWidth + 12% baseline
  const fillW = x.interpolate({
    inputRange: [0, max || 1],
    outputRange: [trackWidth * 0.12, trackWidth],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[styles.slideTrack, { height: HEIGHT, opacity: disabled ? 0.55 : 1 }]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.slideFill, { width: fillW, backgroundColor: primary, borderRadius: 30 }]}
      />
      <Text style={[styles.slideLabel, { color: accent }]} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.slideKnob,
          { backgroundColor: accent, transform: [{ translateX: x }], width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
        ]}
      >
        {disabled ? (
          <ActivityIndicator color={primary} />
        ) : (
          <ChevronRight size={22} color={primary} strokeWidth={2.4} />
        )}
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 6,
  },
  ghostCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topId: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: MFONT.uiMedium,
    fontSize: 12,
    letterSpacing: 0.5,
  },

  ringWrap: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 10,
  },
  ringEyebrow: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    letterSpacing: 1.0,
  },
  ringPct: {
    color: '#FFF',
    fontFamily: MFONT.uiThin,
    fontWeight: '200',
    fontSize: 48,
    letterSpacing: -1.92,
    marginTop: 4,
  },
  ringPctSym: {
    color: '#FFF',
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 22,
    marginLeft: 2,
  },
  ringDone: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: MFONT.uiRegular,
    fontSize: 12,
    marginTop: 2,
  },

  midSection: {
    paddingHorizontal: 24,
    paddingTop: 4,
    alignItems: 'center',
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  statusChipText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  workType: {
    color: '#FFF',
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 30,
    letterSpacing: -1.05,
    lineHeight: 32,
    marginTop: 12,
    textAlign: 'center',
  },
  patientMeta: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    marginTop: 6,
  },

  // Clinic card
  clinicCard: {
    marginHorizontal: 24,
    marginTop: 22,
    padding: 14,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  translucent: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  translucentSubtle: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  clinicLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  clinicAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicAvatarText: {
    color: '#FFF',
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
  },
  clinicEyebrow: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: MFONT.uiMedium,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  clinicName: {
    color: '#FFF',
    fontFamily: MFONT.uiSemibold,
    fontSize: 15,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  messageBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Spec grid
  specGrid: {
    paddingHorizontal: 24,
    paddingTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  specTile: {
    width: '48%',
    padding: 14,
    borderRadius: 18,
  },
  specLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: MFONT.uiMedium,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  specValue: {
    color: '#FFF',
    fontFamily: MFONT.uiMedium,
    fontSize: 15,
    letterSpacing: -0.2,
    marginTop: 6,
  },

  // Slide-to-advance
  slideTrack: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 30,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  slideFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  slideLabel: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 13,
    letterSpacing: -0.1,
    paddingHorizontal: 30,
  },
  slideKnob: {
    position: 'absolute',
    left: 4,
    top: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
