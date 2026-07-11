/**
 * LabFlowLogo — Siman marka logosu (S + diş, mavi gradient #548dca → #28316f).
 *
 *   Kullanım: Intro/splash, Login/AuthShell, Sidebar branding, mobile header,
 *   PanelLoader (animated). Şeffaf zemin.
 *
 *   NOT: Bileşen/dosya adı geriye-uyum için "LabFlowLogo" kalır (import'lar
 *   bozulmasın); render edilen mark Siman logosudur.
 */
import React from 'react';
import { View, Platform } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';

// Yeni Siman logosu — viewBox 0 0 24 24, 3 gradient path (S gövdesi + diş sliver).
const PATH_BODY_1 = 'M8.45,14.69c.08.05.17.15.26.08.11-.08.03-.18,0-.27-.15-.5-.29-.99-.41-1.49-.09-.37-.18-.73-.26-1.08-.02-.03-.02-.08-.02-.11-.11-.5-.2-1.02-.21-1.54-.02-.79.15-1.52.72-2.13.47-.38.99-.47,1.59-.32.35.08,1.24.56,1.31.66.11.09.21.17.34.24.23.17.49.32.78.4.38.11.76.12,1.14-.02.18-.02,6.05-3.22,6.86-3.63.18-.09.18-.18,0-.29-1.11-.66-7.43-4.33-7.93-4.62-.21-.12-.45-.18-.7-.18-.15-.02-.3.03-.44.08-.08.02-7.44,4.24-7.65,4.41-.43.37-.59.87-.59,1.4-.02,1.57,0,3.16,0,4.73,0,.53.23.93.72,1.2.76.41,4.12,2.29,4.51,2.5ZM8.18,7.94s.02.02.02.03h-.02s-.02,0-.02-.02c0,0,.02,0,.02-.02Z';
const PATH_BODY_2 = 'M20.79,12.8v4.68c0,.69-.23,1.3-.78,1.74-.29.23-7.07,4.19-7.07,4.19-.44.26-.99.29-1.45.06-.44-.21-6.65-3.93-7.35-4.35-.15-.08-.14-.17.02-.26.81-.46,6.71-3.9,7.27-4.22.32-.18.67-.17,1.01-.05.3.12.49.37.58.67.09.27.15.56.23.84.09.26.15.52.29.75.06.12.14.23.26.3.15.08.35.03.5-.11.34-.32.52-.76.7-1.17.24-.55.43-1.11.59-1.68.17-.59.32-1.2.44-1.83.2-1.02.17-2.03-.2-3.02-.02-.05-.03-.09.02-.14s.11-.02.15.02c.82.47,4.18,2.41,4.18,2.41.34.23.53.52.58.91.03.09.03.17.03.24Z';
const PATH_SLIVER = 'M8.19,7.97h-.02s-.02,0-.02-.02c0,0,.02,0,.02-.02,0,.02.02.02.02.03Z';

export interface LabFlowLogoProps {
  /** Toplam piksel boyutu (kare) */
  size?: number;
  /** Override: tek renkli render et — gradient yerine bu rengi kullanır */
  color?: string;
  /** Web'de nazik nefes (opacity) animasyonu */
  animated?: boolean;
  /** Animasyon süresi (saniye, default 2.6s) */
  duration?: number;
}

let webStylesInjected = false;
function ensureWebStyles() {
  if (Platform.OS !== 'web' || webStylesInjected) return;
  if (typeof document === 'undefined') return;
  if (document.getElementById('siman-logo-css')) { webStylesInjected = true; return; }
  const style = document.createElement('style');
  style.id = 'siman-logo-css';
  style.textContent = `
    @keyframes simanLogoBreathe {
      0%, 100% { opacity: 0.55; transform: scale(0.985); }
      50%      { opacity: 1;    transform: scale(1); }
    }
    .siman-logo-breathe {
      animation: simanLogoBreathe var(--siman-logo-duration, 2.6s) ease-in-out infinite;
      transform-origin: center;
    }
  `;
  document.head.appendChild(style);
  webStylesInjected = true;
}

export function LabFlowLogo({ size = 200, color, animated = false, duration = 2.6 }: LabFlowLogoProps) {
  React.useEffect(() => {
    if (animated && Platform.OS === 'web') ensureWebStyles();
  }, [animated]);

  const uid = React.useId().replace(/:/g, '');
  const g1 = `${uid}-g1`, g2 = `${uid}-g2`, g3 = `${uid}-g3`;
  const fill1 = color ?? `url(#${g1})`;
  const fill2 = color ?? `url(#${g2})`;
  const fill3 = color ?? `url(#${g3})`;

  const webAnim = animated && Platform.OS === 'web';

  return (
    <View
      style={{ width: size, height: size }}
      {...(webAnim ? ({ className: 'siman-logo-breathe', style: { width: size, height: size, '--siman-logo-duration': `${duration}s` } } as any) : {})}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {!color && (
          <Defs>
            <LinearGradient id={g1} x1="3.21" y1="7.58" x2="20.68" y2="7.58" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#548dca" />
              <Stop offset="1" stopColor="#28316f" />
            </LinearGradient>
            <LinearGradient id={g2} x1="4.03" y1="16.41" x2="20.79" y2="16.41" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#548dca" />
              <Stop offset="1" stopColor="#28316f" />
            </LinearGradient>
            <LinearGradient id={g3} x1="8.16" y1="7.95" x2="8.19" y2="7.95" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#548dca" />
              <Stop offset="1" stopColor="#28316f" />
            </LinearGradient>
          </Defs>
        )}
        <Path d={PATH_BODY_1} fill={fill1 as any} />
        <Path d={PATH_BODY_2} fill={fill2 as any} />
        <Path d={PATH_SLIVER} fill={fill3 as any} />
      </Svg>
    </View>
  );
}

export default LabFlowLogo;
