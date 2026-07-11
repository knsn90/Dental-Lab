// core/ui/TeethLoader.tsx
// Tüm uygulamanın tek loading bileşeni — köprülü diş ikonu (PanelLoader'daki SVG).
//
// Modlar:
//   • inline=true             → küçük + opacity pulse (button/satır içi)
//   • inline=false (default)  → büyük + stroke→fill draw animasyonu (section/full)
//
// Boyutlar:
//   • size: 'sm' | 'md' | 'lg' | number
//   • fullScreen=true → flex:1 + center

import React, { useEffect, useRef } from 'react';
import { View, Text, Platform, Animated, Easing } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

// PanelLoader'dan alınan köprülü diş path'i
const TEETH_PATH_D = 'M7319 7610 c-260 -24 -508 -103 -662 -214 -151 -107 -266 -277 -332 -489 l-27 -87 -35 102 c-145 434 -433 633 -975 677 -189 16 -366 -4 -523 -59 -193 -67 -350 -227 -444 -450 l-38 -91 -33 58 c-90 159 -214 270 -393 353 -295 135 -593 166 -774 81 -181 -86 -304 -353 -344 -746 -14 -146 -7 -445 16 -595 21 -136 67 -315 100 -384 70 -148 259 -239 650 -313 47 -9 167 -17 293 -20 232 -6 296 1 390 43 30 13 56 23 57 22 1 -2 11 -21 21 -43 66 -141 288 -229 739 -294 201 -29 371 -41 587 -41 378 0 589 45 673 143 l34 39 32 -37 c96 -109 336 -152 787 -142 452 10 872 82 1075 184 65 33 128 92 156 147 l22 46 37 -19 c95 -48 146 -56 362 -55 278 1 517 41 700 117 99 40 136 64 189 121 160 175 240 738 175 1234 -43 324 -142 526 -298 602 -147 72 -361 66 -620 -17 -267 -86 -454 -225 -554 -411 -26 -48 -32 -54 -38 -37 -59 169 -118 269 -216 367 -63 63 -95 86 -170 122 -173 82 -361 109 -619 86z m306 -130 c288 -33 459 -167 565 -441 67 -174 87 -346 96 -814 7 -366 -4 -585 -32 -670 -42 -122 -174 -185 -524 -249 -238 -44 -424 -60 -700 -60 -442 -1 -599 41 -638 172 -28 94 -34 220 -29 661 5 468 9 521 58 714 42 165 116 310 211 413 183 199 613 317 993 274z m-2149 -35 c451 -91 644 -311 730 -830 13 -80 18 -197 21 -582 3 -306 1 -506 -6 -548 -27 -174 -100 -213 -453 -237 -271 -18 -602 6 -922 68 -338 65 -454 125 -494 253 -15 50 -17 109 -17 521 0 392 3 487 18 604 55 417 209 647 497 741 157 52 402 55 626 10z m3894 -26 c163 -26 242 -122 304 -369 39 -156 56 -304 56 -500 0 -341 -56 -635 -149 -782 -24 -38 -44 -53 -113 -87 -173 -86 -463 -136 -745 -128 -187 4 -232 14 -279 61 l-31 31 -6 480 c-3 264 -11 522 -16 572 -11 92 -11 93 23 187 61 170 160 290 315 382 118 69 313 132 475 154 88 11 94 11 166 -1z m-5787 -44 c53 -14 138 -43 188 -65 231 -102 357 -239 429 -464 l31 -100 -10 -180 c-6 -100 -14 -341 -17 -536 -5 -281 -10 -362 -21 -387 -32 -70 -159 -99 -393 -89 -169 6 -290 24 -450 64 -211 54 -327 117 -370 202 -75 146 -128 551 -110 829 15 228 62 436 127 564 48 95 128 163 220 187 68 17 268 4 376 -25z';
const PATH_LENGTH = 30000;

interface Props {
  message?: string | null;
  accentColor?: string;
  size?: 'sm' | 'md' | 'lg' | number;
  fullScreen?: boolean;
  inline?: boolean;
}

function sizePx(s: Props['size']): number {
  if (typeof s === 'number') return s;
  switch (s) {
    case 'sm': return 36;
    case 'lg': return 200;
    case 'md':
    default:   return 100;
  }
}

// Web CSS keyframe — tek seferlik enjekte
let webStylesInjected = false;
function ensureWebStyles() {
  if (Platform.OS !== 'web' || webStylesInjected) return;
  if (typeof document === 'undefined') return;
  const id = 'teeth-loader-css';
  if (document.getElementById(id)) { webStylesInjected = true; return; }
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    @keyframes teethLoaderDraw {
      0%   { stroke-dashoffset: ${PATH_LENGTH}; stroke-opacity: 0;    fill-opacity: 0; }
      5%   { stroke-opacity: 0.85; }
      45%  { stroke-dashoffset: 0;             stroke-opacity: 0.85; fill-opacity: 0; }
      75%  { stroke-dashoffset: 0;             stroke-opacity: 0.85; fill-opacity: 1; }
      95%  { stroke-dashoffset: 0;             stroke-opacity: 0;    fill-opacity: 1; }
      100% { stroke-dashoffset: 0;             stroke-opacity: 0;    fill-opacity: 0; }
    }
    .teeth-loader-path {
      stroke-dasharray: ${PATH_LENGTH};
      animation: teethLoaderDraw 2.6s linear infinite;
    }
    @keyframes teethLoaderInline {
      0%, 100% { opacity: 0.45; }
      50%      { opacity: 1; }
    }
    .teeth-loader-inline {
      animation: teethLoaderInline 1.1s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
  webStylesInjected = true;
}

export function TeethLoader({
  message,
  accentColor = '#3B82F6',
  size = 'md',
  fullScreen = false,
  inline = false,
}: Props) {
  useEffect(() => { ensureWebStyles(); }, []);

  const px = inline ? sizePx(size === 'md' ? 'sm' : size) : sizePx(size);

  // Native opacity pulse (web kullanırken CSS keyframe yeterli)
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    v.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const nativeOpacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  const svg = (
    <Svg width={px} height={px} viewBox="0 0 1254 1254">
      <G transform="translate(0,1254) scale(0.1,-0.1)">
        {Platform.OS === 'web' ? (
          <Path
            d={TEETH_PATH_D}
            fill={accentColor}
            stroke={accentColor}
            strokeWidth={inline ? 0 : 28}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...({ className: inline ? 'teeth-loader-inline' : 'teeth-loader-path' } as any)}
          />
        ) : (
          <Path d={TEETH_PATH_D} fill={accentColor} />
        )}
      </G>
    </Svg>
  );

  if (inline) {
    return Platform.OS === 'web'
      ? <View style={{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }}>{svg}</View>
      : <Animated.View style={{ width: px, height: px, opacity: nativeOpacity, alignItems: 'center', justifyContent: 'center' }}>{svg}</Animated.View>;
  }

  return (
    <View style={[
      { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
      fullScreen ? { flex: 1 } : null,
    ]}>
      {Platform.OS === 'web' ? svg : (
        <Animated.View style={{ width: px, height: px, opacity: nativeOpacity }}>{svg}</Animated.View>
      )}
      {!!message && (
        <Text style={{ fontSize: 13, color: '#6B6B6B', fontWeight: '500', letterSpacing: 0.2 }}>
          {message}
        </Text>
      )}
    </View>
  );
}

export default TeethLoader;
