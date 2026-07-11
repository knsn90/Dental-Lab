// core/ui/PanelLoader.tsx
// Panel-aware loading — diş SVG'si: önce stroke ile çizilir,
// sonra panel rengi içeri dolar. CSS animation (web) + Animated.View pulse (native).

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, Platform } from 'react-native';
import { useSegments } from 'expo-router';
import { MOBILE_PANEL_THEMES, useMobileTokens, type MobilePanel } from '../theme/mobileDesignTokens';
import { useAuthStore } from '../store/authStore';
import { LabFlowLogo } from './LabFlowLogo';

// SVG path data — image (1).svg
const TEETH_PATH_D = 'M7319 7610 c-260 -24 -508 -103 -662 -214 -151 -107 -266 -277 -332 -489 l-27 -87 -35 102 c-145 434 -433 633 -975 677 -189 16 -366 -4 -523 -59 -193 -67 -350 -227 -444 -450 l-38 -91 -33 58 c-90 159 -214 270 -393 353 -295 135 -593 166 -774 81 -181 -86 -304 -353 -344 -746 -14 -146 -7 -445 16 -595 21 -136 67 -315 100 -384 70 -148 259 -239 650 -313 47 -9 167 -17 293 -20 232 -6 296 1 390 43 30 13 56 23 57 22 1 -2 11 -21 21 -43 66 -141 288 -229 739 -294 201 -29 371 -41 587 -41 378 0 589 45 673 143 l34 39 32 -37 c96 -109 336 -152 787 -142 452 10 872 82 1075 184 65 33 128 92 156 147 l22 46 37 -19 c95 -48 146 -56 362 -55 278 1 517 41 700 117 99 40 136 64 189 121 160 175 240 738 175 1234 -43 324 -142 526 -298 602 -147 72 -361 66 -620 -17 -267 -86 -454 -225 -554 -411 -26 -48 -32 -54 -38 -37 -59 169 -118 269 -216 367 -63 63 -95 86 -170 122 -173 82 -361 109 -619 86z m306 -130 c288 -33 459 -167 565 -441 67 -174 87 -346 96 -814 7 -366 -4 -585 -32 -670 -42 -122 -174 -185 -524 -249 -238 -44 -424 -60 -700 -60 -442 -1 -599 41 -638 172 -28 94 -34 220 -29 661 5 468 9 521 58 714 42 165 116 310 211 413 183 199 613 317 993 274z m-2149 -35 c451 -91 644 -311 730 -830 13 -80 18 -197 21 -582 3 -306 1 -506 -6 -548 -27 -174 -100 -213 -453 -237 -271 -18 -602 6 -922 68 -338 65 -454 125 -494 253 -15 50 -17 109 -17 521 0 392 3 487 18 604 55 417 209 647 497 741 157 52 402 55 626 10z m3894 -26 c163 -26 242 -122 304 -369 39 -156 56 -304 56 -500 0 -341 -56 -635 -149 -782 -24 -38 -44 -53 -113 -87 -173 -86 -463 -136 -745 -128 -187 4 -232 14 -279 61 l-31 31 -6 480 c-3 264 -11 522 -16 572 -11 92 -11 93 23 187 61 170 160 290 315 382 118 69 313 132 475 154 88 11 94 11 166 -1z m-5787 -44 c53 -14 138 -43 188 -65 231 -102 357 -239 429 -464 l31 -100 -10 -180 c-6 -100 -14 -341 -17 -536 -5 -281 -10 -362 -21 -387 -32 -70 -159 -99 -393 -89 -169 6 -290 24 -450 64 -211 54 -327 117 -370 202 -75 146 -128 551 -110 829 15 228 62 436 127 564 48 95 128 163 220 187 68 17 268 4 376 -25z';

const PATH_LENGTH = 30000;

const SEGMENT_TO_PANEL: Record<string, MobilePanel> = {
  '(lab)':     'lab',
  '(station)': 'teknisyen',
  '(admin)':   'exec',
  '(doctor)':  'doctor',
  '(clinic)':  'klinik',
  '(courier)': 'teknisyen',  // mavi tema — yeni "kurye" eklenene kadar teknisyen ile aynı
};

const LAST_PANEL_KEY = 'lastPanel';

function readLastPanel(): MobilePanel | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(LAST_PANEL_KEY) as MobilePanel | null;
    return v && ['lab', 'klinik', 'exec', 'teknisyen', 'doctor'].includes(v) ? v : null;
  } catch { return null; }
}

function writeLastPanel(p: MobilePanel) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.localStorage.setItem(LAST_PANEL_KEY, p); } catch { /* noop */ }
}

interface PanelLoaderProps {
  message?: string | null;
  panel?: MobilePanel;
  size?: number;
  fullScreen?: boolean;
}

// ── Web-only: tek seferlik CSS keyframe injection (collapsable warning'ini bypass eder) ──
let webStylesInjected = false;
function ensureWebStyles() {
  if (Platform.OS !== 'web' || webStylesInjected) return;
  if (typeof document === 'undefined') return;
  const id = 'panel-loader-css';
  if (document.getElementById(id)) { webStylesInjected = true; return; }
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    @keyframes panelLoaderDraw {
      0%   { stroke-dashoffset: ${PATH_LENGTH}; stroke-opacity: 0;    fill-opacity: 0; }
      5%   { stroke-opacity: 0.85; }
      45%  { stroke-dashoffset: 0;             stroke-opacity: 0.85; fill-opacity: 0; }
      75%  { stroke-dashoffset: 0;             stroke-opacity: 0.85; fill-opacity: 1; }
      95%  { stroke-dashoffset: 0;             stroke-opacity: 0;    fill-opacity: 1; }
      100% { stroke-dashoffset: 0;             stroke-opacity: 0;    fill-opacity: 0; }
    }
    .panel-loader-path {
      stroke-dasharray: ${PATH_LENGTH};
      animation: panelLoaderDraw 2.6s linear infinite;
    }
  `;
  document.head.appendChild(style);
  webStylesInjected = true;
}

// Map auth profile.user_type (+ role) to MobilePanel for accurate fallback
// when segments aren't a panel route yet (auth, splash, etc.)
function profileToPanel(userType?: string | null, role?: string | null): MobilePanel | null {
  if (!userType) return null;
  if (userType === 'admin') return 'exec';
  if (userType === 'doctor') return 'doctor';
  if (userType === 'clinic_admin') return 'klinik';
  if (userType === 'lab') return (role === 'technician' || role === 'courier') ? 'teknisyen' : 'lab';
  return null;
}

export function PanelLoader({ message, panel, size = 220, fullScreen = false }: PanelLoaderProps) {
  const segments = (useSegments() as string[]) ?? [];
  const T = useMobileTokens();
  const profile = useAuthStore(s => s.profile);
  const segmentPanel = SEGMENT_TO_PANEL[segments?.[0] ?? ''];
  // Priority: explicit prop → segment → profile.user_type → last-known panel → lab
  const activePanel: MobilePanel =
    panel
    ?? segmentPanel
    ?? profileToPanel(profile?.user_type, (profile as any)?.role)
    ?? readLastPanel()
    ?? 'lab';
  const theme = MOBILE_PANEL_THEMES[activePanel];

  // Persist whenever we have a real (non-fallback) panel signal
  useEffect(() => {
    const real = panel ?? segmentPanel ?? profileToPanel(profile?.user_type, (profile as any)?.role);
    if (real) writeLastPanel(real);
  }, [panel, segmentPanel, profile?.user_type]);

  // Web: CSS keyframe → AnimatedPath gerek yok → collapsable warning yok
  // Native: opacity pulse (basit fallback — SVG attribute animation react-native-svg'nin Reanimated entegrasyonu gerektirir)
  useEffect(() => {
    ensureWebStyles();
  }, []);

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
  const nativeOpacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View style={{
      flex: fullScreen ? 1 : undefined,
      alignItems: 'center', justifyContent: 'center',
      // Panel-tinted bg in fullScreen mode; transparent for inline use
      backgroundColor: fullScreen ? theme.bgPage : 'transparent',
      gap: 18,
      padding: 24,
    }}>
      <Animated.View
        style={{
          width: size, height: size,
          alignItems: 'center', justifyContent: 'center',
          ...(Platform.OS === 'web' ? {} : { opacity: nativeOpacity }),
        }}
      >
        <LabFlowLogo size={size} animated />
      </Animated.View>

      {!!message && (
        <Text style={{
          fontSize: 13, color: T.ink3, fontWeight: '500',
          letterSpacing: 0.4, textAlign: 'center',
          ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
        }}>
          {message}
        </Text>
      )}
    </View>
  );
}
