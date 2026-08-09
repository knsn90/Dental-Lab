// core/ui/mobile/PanelTopHeader.tsx
//
// Global sabit panel başlığı — her panel sayfasında üstte: sol entity logosu + üst
// blur şeridi (beyaz frosted bölge). Sağ üstteki butonlar ayrı (TopActionBar).
// Layout seviyesinde absolute overlay olarak render edilir → tüm sayfalarda sabit.
//
// LabTopHeader'ın panel-bağımsız genel sürümü: HER PANELDE LABORATUVAR logosu
// gösterilir (white-label — klinik/hekim de çalıştığı lab'ın markasını görür):
//   • lab tarafı (lab/admin/station): profile.lab_id          → labs.logo_url
//   • klinik tarafı (clinic/doctor):  profile.clinic_id → clinics.lab_id → labs.logo_url
// Logo yoksa yalnız blur şeridi görünür (lab davranışıyla birebir).
//
// pointerEvents="none" → altındaki içerik/scroll etkileşimini engellemez.

import React, { useEffect, useState } from 'react';
import { View, Image, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { SvgCss } from 'react-native-svg/css';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../api/supabase';
import { useAuthStore } from '../../store/authStore';
import { useThemeModeStore } from '../../store/themeModeStore';

export function PanelTopHeader() {
  const insets = useSafeAreaInsets();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { profile } = useAuthStore();

  const labId    = (profile as any)?.lab_id ?? null;
  const clinicId = (profile as any)?.clinic_id ?? null;

  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      // Her panelde LAB logosu. Lab tarafında doğrudan lab_id;
      // klinik/hekim tarafında clinic → lab_id üzerinden çözülür.
      let labLogoId: string | null = labId;
      if (!labLogoId && clinicId) {
        const { data: c } = await supabase
          .from('clinics').select('lab_id').eq('id', clinicId).maybeSingle();
        labLogoId = (c as any)?.lab_id ?? null;
      }
      if (!labLogoId) { if (alive) setLogo(null); return; }
      const { data: l } = await supabase
        .from('labs').select('logo_url').eq('id', labLogoId).maybeSingle();
      if (alive) setLogo((l as any)?.logo_url ?? null);
    })();
    return () => { alive = false; };
  }, [labId, clinicId]);

  const topBlurH = Math.max(insets.top, 8) + 96;
  // SVG logolar: RN <Image> SVG render etmez → native'de SvgCss (CSS <style> inline) kullan.
  const isSvgLogo = !!logo && /\.svg(\?|$)/i.test(logo);

  // Native'de SVG'yi kendimiz fetch edip xml olarak çiziyoruz (SvgCssUri sessiz kalabiliyor).
  const [logoXml, setLogoXml] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web' || !logo || !isSvgLogo) { setLogoXml(null); return; }
    let alive = true;
    fetch(logo)
      .then(r => r.text())
      .then(txt => { if (alive) { console.log('[PanelTopHeader] logo svg fetched, len=', txt.length); setLogoXml(txt); } })
      .catch(e => console.warn('[PanelTopHeader] logo svg fetch FAIL:', e?.message));
    return () => { alive = false; };
  }, [logo, isSvgLogo]);

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
        // Native — BlurView'ı dikey gradient maskeyle solduruyoruz (web'deki maskImage
        // stop'larıyla birebir): üstte tam blur, aşağı doğru şeffafa çözülür → keskin çizgi yok.
        <MaskedView
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: topBlurH, zIndex: 8 }}
          maskElement={
            <Svg width="100%" height="100%">
              <Defs>
                <SvgLinearGradient id="panelTopFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0"    stopColor="#000" stopOpacity="1" />
                  <Stop offset="0.30" stopColor="#000" stopOpacity="1" />
                  <Stop offset="0.48" stopColor="#000" stopOpacity="0.85" />
                  <Stop offset="0.66" stopColor="#000" stopOpacity="0.55" />
                  <Stop offset="0.82" stopColor="#000" stopOpacity="0.28" />
                  <Stop offset="0.92" stopColor="#000" stopOpacity="0.1" />
                  <Stop offset="1"    stopColor="#000" stopOpacity="0" />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#panelTopFade)" />
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

      {/* Entity logosu — native SVG → SvgCss, web/raster → Image */}
      {!!logo && (
        Platform.OS !== 'web' && isSvgLogo ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: Math.max(insets.top, 8) + 7, left: 20, width: 130, height: 38, zIndex: 9 }}
          >
            {!!logoXml && <SvgCss xml={logoXml} width={130} height={38} />}
          </View>
        ) : (
          <Image
            source={{ uri: logo }}
            resizeMode="contain"
            style={{ position: 'absolute', top: Math.max(insets.top, 8) + 7, left: 20, width: 130, height: 38, zIndex: 9, pointerEvents: 'none' } as any}
          />
        )
      )}
    </>
  );
}

export default PanelTopHeader;
