/**
 * ColorOrb — Denty'nin canlı AI varlığı (yumuşak ışıltı bulutu + dental kimlik).
 *
 * Kenarsız, parlayan gradient ışık bulutu (cam kabuk YOK, sert rim YOK, beyaz
 * specular nokta YOK) + merkezde parlayan DİŞ silueti + ince dönen yörünge
 * halkaları + parıltılar. Yaşayan, akışkan dijital varlık.
 *
 *   • Web   : saf <svg> + SMIL + CSS (yüzme/nefes/glow)
 *   • Native: react-native-svg + Animated (aynı görsel, GPU-hızlandırmalı)
 *
 * Durumlar (orbState.ts): idle · listening · thinking · speaking
 * Durumlar arası geçiş yumuşak; prefers-reduced-motion saygılı.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, {
  Defs, RadialGradient, Stop, Circle, Ellipse, G, Path, Filter, FeGaussianBlur,
} from 'react-native-svg';
import { ORB_STATE, type AIState } from '../orbState';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Stilize diş silueti (viewBox 0 0 100 100, ~ x33–67 · y31–69)
const TOOTH =
  'M50 31 C42 31 35 34 33 42 C31 50 33 57 36 64 C38 69 43 69 44 64 C45 60 47 58 50 58 C53 58 55 60 56 64 C57 69 62 69 64 64 C67 57 69 50 67 42 C65 34 58 31 50 31 Z';
const SPARKS = [
  { x: 30, y: 40, r: 1.2, d: 0 }, { x: 70, y: 45, r: 1.0, d: 0.6 },
  { x: 38, y: 66, r: 0.9, d: 1.2 }, { x: 64, y: 63, r: 1.1, d: 0.3 },
  { x: 50, y: 33, r: 0.8, d: 0.9 }, { x: 58, y: 56, r: 0.9, d: 1.5 },
];

export interface ColorOrbProps {
  size?: number;
  state?: AIState;
  spinDuration?: number;
  tones?: unknown;
}

let _cssInjected = false;
function ensureOrbCss() {
  if (_cssInjected || typeof document === 'undefined') return;
  _cssInjected = true;
  const el = document.createElement('style');
  el.id = 'denty-orb-css';
  el.textContent = `
    @keyframes denty-orb-float { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(var(--orb-fy,-4px)) scale(1.03)} }
    @keyframes denty-orb-halo { 0%,100%{opacity:var(--orb-gmin,.45);transform:scale(.92)} 50%{opacity:var(--orb-gmax,.8);transform:scale(1.12)} }
    .denty-orb-scale{ transition: transform .6s cubic-bezier(.22,1,.36,1); }
    @media (prefers-reduced-motion: reduce){ .denty-orb-float,.denty-orb-halo{animation:none!important} }
  `;
  document.head.appendChild(el);
}

export function ColorOrb({ size = 24, state = 'idle', spinDuration }: ColorOrbProps) {
  const uid = React.useId().replace(/:/g, '');
  const p = ORB_STATE[state];
  const spin = state === 'idle' && spinDuration ? spinDuration : p.spin;
  const isWeb = Platform.OS === 'web';
  const blurBig = size < 44 ? 3.6 : 5;
  const tiny = size < 40; // çok küçük (FAB/başlık) → diş/parıltı gizle, sade bulut

  const rot = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const floatV = useRef(new Animated.Value(0)).current;
  const scaleV = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isWeb) return;
    const rotA = Animated.loop(Animated.timing(rot, { toValue: 1, duration: Math.max(spin, 1) * 1000, easing: Easing.linear, useNativeDriver: true }));
    const pulseA = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: p.pulseDur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: p.pulseDur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const floatA = Animated.loop(Animated.sequence([
      Animated.timing(floatV, { toValue: 1, duration: p.floatDur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(floatV, { toValue: 0, duration: p.floatDur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    Animated.timing(scaleV, { toValue: p.scale, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    rotA.start(); pulseA.start(); floatA.start();
    return () => { rotA.stop(); pulseA.stop(); floatA.stop(); };
  }, [isWeb, state, spin, p, rot, pulse, floatV, scaleV]);

  // ── Web ──
  if (isWeb) {
    ensureOrbCss();
    const reduce =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const i = (k: string) => `orb-${uid}-${k}`;
    const lobeGrad = (k: string, c: string) =>
      `<radialGradient id="${i(k)}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${c}" stop-opacity="1"/>
        <stop offset="58%" stop-color="${c}" stop-opacity="0.66"/>
        <stop offset="100%" stop-color="${c}" stop-opacity="0"/>
      </radialGradient>`;
    const spinT = (rev: boolean, dur: number) =>
      reduce ? '' :
      `<animateTransform attributeName="transform" attributeType="XML" type="rotate"
        from="${rev ? 360 : 0} 50 50" to="${rev ? 0 : 360} 50 50" dur="${dur}s" repeatCount="indefinite"/>`;
    const morph = (r0: number, dur: number) =>
      reduce ? '' :
      `<animate attributeName="r" values="${r0};${r0 + 6};${r0 - 4};${r0}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.35;0.7;1" keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"/>`;
    const corePulse = reduce ? '' :
      `<animate attributeName="opacity" values="${p.glowMin};${p.glowMax};${p.glowMin}" dur="${p.pulseDur / 1000}s" repeatCount="indefinite"/>`;

    const rings = tiny ? '' : `
      <g opacity="0.5">
        <g>${spinT(false, spin * 1.15)}
          <ellipse cx="50" cy="50" rx="46" ry="17" transform="rotate(18 50 50)" fill="none" stroke="#EAF8FF" stroke-opacity="0.55" stroke-width="0.8"/>
          <ellipse cx="50" cy="50" rx="43" ry="13" transform="rotate(-30 50 50)" fill="none" stroke="#7FE0FF" stroke-opacity="0.6" stroke-width="0.8"/>
        </g>
        <g>${spinT(true, spin * 1.5)}
          <ellipse cx="50" cy="50" rx="40" ry="22" transform="rotate(72 50 50)" fill="none" stroke="#EAF8FF" stroke-opacity="0.35" stroke-width="0.7"/>
        </g>
      </g>`;
    const tooth = `
      <path d="${TOOTH}" fill="#BFEFFF" filter="url(#${i('tg')})" opacity="0.85"/>
      <path d="${TOOTH}" fill="url(#${i('tooth')})"/>
      <path d="${TOOTH}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="0.6"/>`;
    const sparks = tiny || reduce ? '' : SPARKS.map((s) =>
      `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="#EAF8FF">
        <animate attributeName="opacity" values="0.15;1;0.15" dur="2.4s" begin="${s.d}s" repeatCount="indefinite"/>
      </circle>`).join('');

    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="${i('core')}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#9CEBFF" stop-opacity="1"/>
          <stop offset="34%" stop-color="#3F8BFF" stop-opacity="0.95"/>
          <stop offset="68%" stop-color="#6A52FF" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#6A52FF" stop-opacity="0"/>
        </radialGradient>
        ${lobeGrad('cyan', '#29D4F0')}${lobeGrad('blue', '#2E6BFF')}${lobeGrad('violet', '#9A5CFF')}${lobeGrad('cyan2', '#5EE0FF')}
        <radialGradient id="${i('tooth')}" cx="44%" cy="36%" r="70%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="55%" stop-color="#E6F7FF"/>
          <stop offset="100%" stop-color="#A8E0FF"/>
        </radialGradient>
        <filter id="${i('soft')}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blurBig}"/></filter>
        <filter id="${i('softCore')}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blurBig * 0.6}"/></filter>
        <filter id="${i('tg')}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>
      </defs>

      <!-- akışkan renk bulutu -->
      <g filter="url(#${i('soft')})">
        <g>${spinT(false, spin)}
          <circle cx="38" cy="40" r="26" fill="url(#${i('cyan')})">${morph(26, 6.5)}</circle>
          <circle cx="64" cy="58" r="25" fill="url(#${i('violet')})">${morph(25, 8)}</circle>
        </g>
        <g>${spinT(true, spin * 1.3)}
          <circle cx="58" cy="36" r="22" fill="url(#${i('cyan2')})">${morph(22, 7)}</circle>
          <circle cx="42" cy="64" r="24" fill="url(#${i('blue')})">${morph(24, 6)}</circle>
        </g>
      </g>

      <!-- parlayan çekirdek -->
      <circle cx="50" cy="50" r="30" fill="url(#${i('core')})" filter="url(#${i('softCore')})" opacity="${p.glowMax}">${corePulse}</circle>
      ${rings}
      ${tooth}
      ${sparks}
    </svg>`;

    const haloAnim = reduce ? '' : `denty-orb-halo ${p.pulseDur * 1.6}ms ease-in-out infinite`;
    const floatAnim = reduce ? '' : `denty-orb-float ${p.floatDur}ms ease-in-out infinite`;
    const cssVars: any = { '--orb-fy': `-${p.floatY * (size / 100) * 2.4}px`, '--orb-gmin': p.glowMin, '--orb-gmax': p.glowMax };

    return React.createElement('div', {
      style: { position: 'relative', width: size, height: size, lineHeight: 0, ...cssVars },
    } as any,
      React.createElement('div', {
        className: 'denty-orb-halo',
        style: {
          position: 'absolute', left: '-22%', top: '-22%', width: '144%', height: '144%', borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 50%, rgba(70,150,255,0.7) 0%, rgba(140,90,255,0.4) 40%, transparent 70%)',
          filter: `blur(${Math.max(size * 0.12, 9)}px)`, animation: haloAnim, pointerEvents: 'none',
        } as any,
      }),
      React.createElement('div', {
        className: 'denty-orb-scale',
        style: { position: 'relative', width: size, height: size, transform: `scale(${p.scale})` },
      } as any,
        React.createElement('div', {
          className: 'denty-orb-float',
          style: { width: size, height: size, animation: floatAnim },
          dangerouslySetInnerHTML: { __html: svg },
        } as any),
      ),
    );
  }

  // ── Native ──
  const id = (k: string) => `orb-${uid}-${k}`;
  const rotDeg = rot.interpolate({ inputRange: [0, 1], outputRange: [0, 360] });
  const rotRev = rot.interpolate({ inputRange: [0, 1], outputRange: [0, -360] });
  const coreOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [p.glowMin, p.glowMax] });
  const translateY = floatV.interpolate({ inputRange: [0, 1], outputRange: [0, -p.floatY * (size / 100) * 2.4] });

  const lobe = (k: string, c: string) => (
    <RadialGradient key={k} id={id(k)} cx="50%" cy="50%" r="50%">
      <Stop offset="0%" stopColor={c} stopOpacity="1" />
      <Stop offset="58%" stopColor={c} stopOpacity="0.66" />
      <Stop offset="100%" stopColor={c} stopOpacity="0" />
    </RadialGradient>
  );

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', width: size * 1.44, height: size * 1.44, borderRadius: size * 0.72,
          backgroundColor: 'rgba(80,150,255,0.5)', opacity: coreOpacity, transform: [{ scale: scaleV }],
        }}
      />
      <Animated.View style={{ width: size, height: size, transform: [{ translateY }, { scale: scaleV }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={id('core')} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#9CEBFF" stopOpacity="1" />
              <Stop offset="34%" stopColor="#3F8BFF" stopOpacity="0.95" />
              <Stop offset="68%" stopColor="#6A52FF" stopOpacity="0.5" />
              <Stop offset="100%" stopColor="#6A52FF" stopOpacity="0" />
            </RadialGradient>
            {lobe('cyan', '#29D4F0')}
            {lobe('blue', '#2E6BFF')}
            {lobe('violet', '#9A5CFF')}
            {lobe('cyan2', '#5EE0FF')}
            <RadialGradient id={id('tooth')} cx="44%" cy="36%" r="70%">
              <Stop offset="0%" stopColor="#FFFFFF" />
              <Stop offset="55%" stopColor="#E6F7FF" />
              <Stop offset="100%" stopColor="#A8E0FF" />
            </RadialGradient>
            <Filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%"><FeGaussianBlur stdDeviation={blurBig} /></Filter>
            <Filter id={id('softCore')} x="-50%" y="-50%" width="200%" height="200%"><FeGaussianBlur stdDeviation={blurBig * 0.6} /></Filter>
            <Filter id={id('tg')} x="-50%" y="-50%" width="200%" height="200%"><FeGaussianBlur stdDeviation="2.4" /></Filter>
          </Defs>

          <G filter={`url(#${id('soft')})`}>
            <AnimatedG rotation={rotDeg as any} originX={50} originY={50}>
              <Circle cx="38" cy="40" r="26" fill={`url(#${id('cyan')})`} />
              <Circle cx="64" cy="58" r="25" fill={`url(#${id('violet')})`} />
            </AnimatedG>
            <AnimatedG rotation={rotRev as any} originX={50} originY={50}>
              <Circle cx="58" cy="36" r="22" fill={`url(#${id('cyan2')})`} />
              <Circle cx="42" cy="64" r="24" fill={`url(#${id('blue')})`} />
            </AnimatedG>
          </G>

          <AnimatedCircle cx="50" cy="50" r="30" fill={`url(#${id('core')})`} filter={`url(#${id('softCore')})`} opacity={coreOpacity as any} />

          {!tiny && (
            <>
              <AnimatedG rotation={rotDeg as any} originX={50} originY={50} opacity={0.5}>
                <Ellipse cx="50" cy="50" rx="46" ry="17" transform="rotate(18 50 50)" fill="none" stroke="#EAF8FF" strokeOpacity="0.55" strokeWidth="0.8" />
                <Ellipse cx="50" cy="50" rx="43" ry="13" transform="rotate(-30 50 50)" fill="none" stroke="#7FE0FF" strokeOpacity="0.6" strokeWidth="0.8" />
              </AnimatedG>
              <AnimatedG rotation={rotRev as any} originX={50} originY={50} opacity={0.35}>
                <Ellipse cx="50" cy="50" rx="40" ry="22" transform="rotate(72 50 50)" fill="none" stroke="#EAF8FF" strokeOpacity="0.5" strokeWidth="0.7" />
              </AnimatedG>
            </>
          )}

          {/* Diş — her boyutta (kimlik) */}
          <Path d={TOOTH} fill="#BFEFFF" filter={`url(#${id('tg')})`} opacity={0.85} />
          <Path d={TOOTH} fill={`url(#${id('tooth')})`} />
          <Path d={TOOTH} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.6" />

          {!tiny && SPARKS.map((s, idx) => (
            <Circle key={idx} cx={s.x} cy={s.y} r={s.r} fill="#EAF8FF" opacity={0.7} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
