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
import { View, Image, Platform, Animated } from 'react-native';
import { navEdge, useNavScrollBridge } from './navScroll';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { SvgCss } from 'react-native-svg/css';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRTL } from '../../i18n';
import { supabase } from '../../api/supabase';
import { useAuthStore } from '../../store/authStore';
import { useThemeModeStore } from '../../store/themeModeStore';
import { useMobileTokens } from '../../theme/mobileDesignTokens';


/** #RRGGBB → rgba(…, a). Başka biçim gelirse olduğu gibi döner. */
function fadeRgba(hex: string, a: number): string {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function PanelTopHeader() {
  const insets = useSafeAreaInsets();
  // Üst kenar şeridi kaydırmayı izlesin (navbar olmayan panelde de).
  useNavScrollBridge();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const MT = useMobileTokens();
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
      // Hekim kendi klinik satırını RLS yüzünden OKUYAMIYOR (0 satır) → lab
      // bulunamıyor, logo hiç çizilmiyordu (2026-10-20, hekim paneli tarayıcı/PWA).
      // Bağlı lab'ları SECURITY DEFINER RPC'den al (klinik lab'ı + onaylı üyelikler).
      if (!labLogoId) {
        const { data: ids } = await supabase.rpc('my_connected_lab_ids');
        const list = Array.isArray(ids) ? ids : [];
        const first = list[0];
        labLogoId = (typeof first === 'string' ? first : (first as any)?.my_connected_lab_ids) ?? null;
      }
      if (!labLogoId) { if (alive) setLogo(null); return; }
      // NOT: klinik/hekim kullanıcısı labs'ı RLS ile okuyamaz (policy: id = get_my_lab_id()).
      // Bağlı lab logosunu SECURITY DEFINER RPC ile al (yalnız marka alanları, bağlılık doğrulanır).
      const { data: l } = await supabase
        .rpc('get_lab_brand', { p_lab_id: labLogoId }).maybeSingle();
      if (alive) setLogo((l as any)?.logo_url ?? null);
    })();
    return () => { alive = false; };
  }, [labId, clinicId]);

  const rtl = isRTL();
  // Native (BlurView): +96 — iOS'ta sorunsuz; kısaltınca (+56) kaydırılan başlık
  // logonun ARKASINDAN okunur kalıp üst üste biniyordu (2026-10-17).
  // Web (filtresiz gradyan): +76 — logo/butonlar (~+42) bitene dek neredeyse opak,
  // sonra hızla söner; sayfa en üstteyken tarih satırını (~+72) örtmez.
  const topBlurH = Math.max(insets.top, 8) + (Platform.OS === 'web' ? 84 : 96);
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
      {/* Üst blur şeridi — aşağı kaydırınca altından geçen içerik bulanıklaşır.
          zIndex 8: sayfa içeriğinin ÜSTÜNDE, logo (1210) ve TopActionBar (1200)
          butonlarının ALTINDA. Web'de backdrop-filter + mask kendi yığın bağlamını
          kurduğu için logo eskiden 9'daydı ve Safari'de şeridin altında kalıp
          soluyordu (2026-09-24). */}
      {Platform.OS === 'web' ? (
        /* Web: BLUR YOK — sayfa renginden şeffafa yumuşak geçiş.
           iOS Safari (PWA) backdrop-filter'lı katmanı z-index'e bakmadan logo
           ve üst butonların ÜSTÜNE çiziyordu: ikisi de soluk/bulanık görünüyordu
           (translateZ denemesi yetmedi, 2026-10-17). Filtresiz katmanda yığın
           sırası her tarayıcıda güvenilir. Native BlurView aşağıda, değişmedi. */
        <Animated.View pointerEvents="none" style={{
          // Yalnız içerik altından geçerken görünür (sayfa en üstteyken tarih
          // satırını soldurmasın — 2026-11-13).
          opacity: navEdge,
          position: 'fixed', top: 0, left: 0, right: 0, height: topBlurH, zIndex: 8,
          // Yumuşak (ease-out) söniş: logo/butonların altına dek ~opak, sonra çok
          // kademeli iner. Eski 3 kademeli iniş renkli kartların üstünde sert bant
          // gibi görünüyordu (2026-10-20).
          backgroundImage: `linear-gradient(to bottom, ${[
            [0.97, 0], [0.95, 52], [0.9, 60], [0.8, 67], [0.66, 74],
            [0.5, 80], [0.34, 86], [0.2, 91], [0.09, 95], [0.025, 98], [0, 100],
          ].map(([a, p]) => `${fadeRgba(MT.bg, a)} ${p}%`).join(', ')})`,
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
            style={{ position: 'absolute', top: Math.max(insets.top, 8) + 7, ...(rtl ? { right: 20 } : { left: 20 }), width: 130, height: 38, zIndex: 1210 }}
          >
            {!!logoXml && <SvgCss xml={logoXml} width={130} height={38} />}
          </View>
        ) : (
          <Image
            source={{ uri: logo }}
            resizeMode="contain"
            style={{ position: Platform.OS === 'web' ? 'fixed' : 'absolute', top: Math.max(insets.top, 8) + 7, ...(rtl ? { right: 20 } : { left: 20 }), width: 130, height: 38, zIndex: 1210, pointerEvents: 'none', isolation: 'isolate',
              // iOS WebKit: kendi GPU katmanı olmadan blur şeridi (z 8) logoyu örtüyordu (PWA)
              ...(Platform.OS === 'web' ? { transform: [{ translateZ: 0 }], willChange: 'transform' } : {}) } as any}
          />
        )
      )}
    </>
  );
}

export default PanelTopHeader;
