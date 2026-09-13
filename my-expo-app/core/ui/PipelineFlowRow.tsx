/**
 * PipelineFlowRow — "CANLI" kartındaki aşama şeridi (Alındı → Üretimde → KK → Hazır).
 *
 * Admin/klinik/hekim Özet ekranlarında BİREBİR kopyalanmıştı; tek kaynağa alındı.
 *
 * HAREKET = VERİ (dekor değil):
 *   • Akış rayı üzerinde soldan sağa bir ışık izi geçer ve işin BEKLEDİĞİ
 *     aşamada duraklayıp o daireyi ışıkla karşılar, sonra sona akar.
 *     Hiçbir aşamada iş yoksa hareket HİÇ çalışmaz — kart dürüstçe susar.
 *   • Bir aşamanın sayısı DEĞİŞİNCE (realtime) yalnız o daire yayla büyüyüp
 *     çevresinde bir kez neon halka açar. Boşta hiçbir şey kıpırdamaz.
 *
 * Daireler OPAK boyanır (`cardMid` + accent/beyaz karışımı): yarı saydam
 * olsalardı ışık izi dairelerin İÇİNDEN geçiyormuş gibi görünürdü.
 * `prefers-reduced-motion` açıkken tüm hareket durur, şerit statik kalır.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing, Platform } from 'react-native';
import { prefersReducedMotion } from './HeroGlow';

export type PipelineStage = { key: string; label: string };

/** Yarı saydam bir rengi opak zemine karıştırır. */
function mixOn(base: string, overlay: string, alpha: number): string {
  const px = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    const n = m ? parseInt(m[1], 16) : 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [br, bg, bb] = px(base), [or_, og, ob] = px(overlay);
  const mix = (b: number, o: number) => Math.round(b + (o - b) * alpha);
  return `#${[mix(br, or_), mix(bg, og), mix(bb, ob)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function alphaOf(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const CIRCLE = 40;
const GAP = 12;
const STEP = CIRCLE + GAP;

export function PipelineFlowRow({
  stages, counts, accent, flowColor, cardMid = '#1B1B1B', onPressStage, renderValue,
}: {
  stages: readonly PipelineStage[];
  counts: Record<string, number>;
  /** Daire dolgusu/kenarlığı — panel accent'i. */
  accent: string;
  /** Işık izi rengi (koyu temada neon mavi; verilmezse accent). */
  flowColor?: string;
  /** Kartın daire hizasındaki ZEMİN tonu — daireleri opak boyamak için. */
  cardMid?: string;
  onPressStage?: (key: string) => void;
  /** Sayıyı özel çizmek için (ör. NumberTickerX). Verilmezse düz metin. */
  renderValue?: (count: number, active: boolean) => React.ReactNode;
}) {
  const FLOW = flowColor ?? accent;
  const flowAnim = useRef(new Animated.Value(0)).current;
  const flashAnims = useRef(stages.map(() => new Animated.Value(0))).current;
  const prevCounts = useRef<number[]>(stages.map(st => counts[st.key] ?? 0));

  // Koordinatlar satırın SOL kenarından: daire i'nin merkezi = CIRCLE/2 + i*STEP.
  // Ray İLK dairenin SAĞ kenarında başlar, SON dairenin SOL kenarında biter —
  // yani çizgi de ışık da ilk dairenin ÖNÜNDEN değil, ARDINDAN başlar.
  const RAIL_X0 = CIRCLE;                        // ilk dairenin sağ kenarı
  const RAIL_X1 = STEP * (stages.length - 1);    // son dairenin sol kenarı
  const RAIL_W  = Math.max(0, RAIL_X1 - RAIL_X0);
  // Işık izi son dairenin SOL kenarında kesilmesin: SON DAİREYE kadar (merkezine)
  // ilerlesin — akış orada bitiyor, kullanıcı da onu görmeli.
  const FLOW_END = CIRCLE / 2 + (stages.length - 1) * STEP;
  // İşin BEKLEDİĞİ aşama: dolu olan son aşama (yoksa akış durur).
  const activeIdx = stages.reduce((acc, st, i) => ((counts[st.key] ?? 0) > 0 ? i : acc), -1);
  const hasFlow = activeIdx >= 0 && !prefersReducedMotion();
  // Aktif dairenin SOL kenarı (duraklama noktası) — merkeze durursa izin çoğu
  // dairenin arkasında kalıp kısa bir çubuk gibi görünüyor.
  const activeLeft   = Math.max(0, activeIdx) * STEP;
  const activeCenter = CIRCLE / 2 + Math.max(0, activeIdx) * STEP;
  const holdX = Math.min(Math.max(activeLeft - 2, RAIL_X0), RAIL_X1);

  useEffect(() => {
    flowAnim.stopAnimation();
    flowAnim.setValue(0);
    if (!hasFlow) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flowAnim, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(500),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [flowAnim, hasFlow, activeIdx]);

  useEffect(() => {
    stages.forEach((st, i) => {
      const v = counts[st.key] ?? 0;
      if (v === prevCounts.current[i]) return;
      prevCounts.current[i] = v;
      if (prefersReducedMotion()) return;
      flashAnims[i].setValue(0);
      Animated.sequence([
        Animated.spring(flashAnims[i], { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }),
        Animated.timing(flashAnims[i], { toValue: 0, duration: 420, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    });
  }, [counts, stages, flashAnims]);

  const flowX = flowAnim.interpolate({
    inputRange: [0, 0.34, 0.62, 1],
    outputRange: [RAIL_X0, holdX, holdX, FLOW_END],
  });
  const flowOpacity = flowAnim.interpolate({
    // Son daireye VARANA kadar tam parlak kalır, orada söner (yolda solmaz).
    inputRange: [0, 0.10, 0.34, 0.62, 0.94, 1],
    outputRange: [0, 0.55, 1, 1, 1, 0],
  });

  return (
    <View style={{ position: 'relative' }}>
      {/* Akış rayı — dairelerin ARKASINDA */}
      <View pointerEvents="none" style={{
        position: 'absolute', top: CIRCLE / 2 - 1, start: RAIL_X0,
        width: RAIL_W, height: 2, borderRadius: 1,
        backgroundColor: 'rgba(255,255,255,0.10)',
      }} />
      {/* Kat edilen yol */}
      {activeIdx > 0 && (
        <View pointerEvents="none" style={{
          position: 'absolute', top: CIRCLE / 2 - 1, start: RAIL_X0,
          width: Math.max(0, activeLeft - RAIL_X0), height: 2, borderRadius: 1,
          backgroundColor: alphaOf(FLOW, 0.55),
        }} />
      )}
      {/* Varış ışığı — blur'lu yumuşak leke (keskin halka daireyle çakışıyordu) */}
      {hasFlow && (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', top: CIRCLE / 2 - 30, start: activeCenter - 30,
          width: 60, height: 60, borderRadius: 30,
          backgroundColor: alphaOf(FLOW, Platform.OS === 'web' ? 0.42 : 0.16),
          opacity: flowAnim.interpolate({
            inputRange: [0, 0.28, 0.40, 0.58, 0.70, 1],
            outputRange: [0, 0, 1, 1, 0, 0],
          }),
          transform: [{
            scale: flowAnim.interpolate({
              inputRange: [0, 0.34, 0.62, 1],
              outputRange: [0.9, 0.98, 1.1, 1.15],
            }),
          }],
          ...(Platform.OS === 'web' ? { filter: 'blur(12px)' } as any : {}),
        }} />
      )}
      {/* Işık izi */}
      {hasFlow && (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', top: CIRCLE / 2 - 2, start: 0,
          width: 34, height: 4, borderRadius: 2, marginStart: -34,
          backgroundColor: FLOW,
          opacity: flowOpacity,
          transform: [{ translateX: flowX }],
          ...(Platform.OS === 'web' ? {
            backgroundImage: `linear-gradient(90deg, ${alphaOf(FLOW, 0)} 0%, ${alphaOf(FLOW, 0.55)} 55%, ${FLOW} 100%)`,
            boxShadow: `0 0 14px ${alphaOf(FLOW, 0.9)}`,
          } as any : {}),
        }} />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: GAP }}>
        {stages.map((stage, idx) => {
          const count = counts[stage.key] ?? 0;
          const active = count > 0;
          const flash = flashAnims[idx];
          return (
            <Pressable
              key={stage.key}
              onPress={onPressStage ? () => onPressStage(stage.key) : undefined}
              style={{ alignItems: 'center', gap: 4 }}
            >
              {/* Değişim halkası — yalnız sayı değiştiğinde bir kez parlar */}
              <Animated.View pointerEvents="none" style={{
                position: 'absolute', top: 0, width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
                borderWidth: 2, borderColor: FLOW,
                opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
                transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
              }} />
              <Animated.View style={{
                width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
                // OPAK: yarı saydam olsaydı ışık izi dairenin İÇİNDEN geçerdi.
                backgroundColor: active ? mixOn(cardMid, accent, 0.22) : mixOn(cardMid, '#FFFFFF', 0.07),
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? accent : 'rgba(255,255,255,0.1)',
                alignItems: 'center', justifyContent: 'center',
                transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
              }}>
                {renderValue
                  ? renderValue(count, active)
                  : (
                    <Text style={{ fontSize: 16, fontWeight: '600', letterSpacing: -0.5, color: active ? '#FFF' : 'rgba(255,255,255,0.3)' }}>
                      {count}
                    </Text>
                  )}
              </Animated.View>
              <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                {stage.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
