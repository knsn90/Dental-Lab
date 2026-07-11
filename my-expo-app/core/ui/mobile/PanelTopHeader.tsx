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
        <BlurView
          pointerEvents="none"
          intensity={isDark ? 28 : 36}
          tint={isDark ? 'dark' : 'light'}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: topBlurH, zIndex: 8 }}
        />
      )}

      {/* Entity logosu — sol üstte, TopActionBar ikonlarıyla aynı satırda */}
      {!!logo && (
        <Image
          source={{ uri: logo }}
          resizeMode="contain"
          style={{ position: 'absolute', top: Math.max(insets.top, 8) + 7, left: 20, width: 130, height: 38, zIndex: 9, pointerEvents: 'none' } as any}
        />
      )}
    </>
  );
}

export default PanelTopHeader;
