// core/ui/mobile/LabTopHeader.tsx
//
// Global sabit lab başlığı — her lab sayfasında üstte: sol lab logosu + üst blur
// şeridi (beyaz frosted bölge). Sağ üstteki butonlar ayrı (TopActionBar) tarafından
// çiziliyor. Layout seviyesinde absolute overlay olarak render edilir → tüm sayfalarda sabit.
//
// pointerEvents="none" → altındaki içerik/scroll etkileşimini engellemez.

import React, { useEffect, useState } from 'react';
import { View, Image, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { SvgCss } from 'react-native-svg/css';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRTL } from '../../i18n';
import { supabase } from '../../api/supabase';
import { useAuthStore } from '../../store/authStore';
import { useThemeModeStore } from '../../store/themeModeStore';

export function LabTopHeader() {
  const insets = useSafeAreaInsets();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { profile } = useAuthStore();

  const [labLogo, setLabLogo] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const labId = (profile as any)?.lab_id;
    if (!labId) return;
    supabase.from('labs').select('logo_url').eq('id', labId).maybeSingle()
      .then(({ data }) => { if (alive) setLabLogo((data as any)?.logo_url ?? null); });
    return () => { alive = false; };
  }, [(profile as any)?.lab_id]);

  const rtl = isRTL();
  const topBlurH = Math.max(insets.top, 8) + 96;
  // SVG logolar: RN <Image> SVG render etmez → native'de fetch + SvgCss (CSS <style> inline).
  const isSvgLogo = !!labLogo && /\.svg(\?|$)/i.test(labLogo);
  const [logoXml, setLogoXml] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web' || !labLogo || !isSvgLogo) { setLogoXml(null); return; }
    let alive = true;
    fetch(labLogo)
      .then(r => r.text())
      .then(txt => { if (alive) setLogoXml(txt); })
      .catch(() => {});
    return () => { alive = false; };
  }, [labLogo, isSvgLogo]);

  return (
    <>
      {/* Üst blur şeridi — aşağı kaydırınca altından geçen içerik bulanıklaşır */}
      {Platform.OS === 'web' ? (
        <View pointerEvents="none" style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: topBlurH, zIndex: 8,
          backgroundColor: isDark ? 'rgba(14,14,14,0.42)' : 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(16px) saturate(120%)',
          WebkitBackdropFilter: 'blur(16px) saturate(120%)',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0.85) 48%, rgba(0,0,0,0.55) 66%, rgba(0,0,0,0.28) 82%, rgba(0,0,0,0.1) 92%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0.85) 48%, rgba(0,0,0,0.55) 66%, rgba(0,0,0,0.28) 82%, rgba(0,0,0,0.1) 92%, rgba(0,0,0,0) 100%)',
          boxShadow: isDark ? '0 10px 24px -6px rgba(0,0,0,0.5)' : '0 12px 26px -6px rgba(255,255,255,0.9)',
        } as any} />
      ) : (
        // Native — BlurView'ı dikey gradient maskeyle solduruyoruz (web maskImage stop'larıyla birebir).
        <MaskedView
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: topBlurH, zIndex: 8 }}
          maskElement={
            <Svg width="100%" height="100%">
              <Defs>
                <SvgLinearGradient id="labTopFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0"    stopColor="#000" stopOpacity="1" />
                  <Stop offset="0.30" stopColor="#000" stopOpacity="1" />
                  <Stop offset="0.48" stopColor="#000" stopOpacity="0.85" />
                  <Stop offset="0.66" stopColor="#000" stopOpacity="0.55" />
                  <Stop offset="0.82" stopColor="#000" stopOpacity="0.28" />
                  <Stop offset="0.92" stopColor="#000" stopOpacity="0.1" />
                  <Stop offset="1"    stopColor="#000" stopOpacity="0" />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#labTopFade)" />
            </Svg>
          }
        >
          <BlurView
            intensity={isDark ? 28 : 36}
            tint={isDark ? 'dark' : 'light'}
            style={{ flex: 1 }}
          />
        </MaskedView>
      )}

      {/* Lab logosu — native SVG → SvgCss, web/raster → Image */}
      {!!labLogo && (
        Platform.OS !== 'web' && isSvgLogo ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: Math.max(insets.top, 8) + 7, ...(rtl ? { right: 20 } : { left: 20 }), width: 130, height: 38, zIndex: 9 }}
          >
            {!!logoXml && <SvgCss xml={logoXml} width={130} height={38} />}
          </View>
        ) : (
          <Image
            source={{ uri: labLogo }}
            resizeMode="contain"
            style={{ position: 'absolute', top: Math.max(insets.top, 8) + 7, ...(rtl ? { right: 20 } : { left: 20 }), width: 130, height: 38, zIndex: 9, pointerEvents: 'none' } as any}
          />
        )
      )}
    </>
  );
}

export default LabTopHeader;
