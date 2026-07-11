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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

      {/* Lab logosu — sol üstte, TopActionBar ikonlarıyla aynı satırda */}
      {!!labLogo && (
        <Image
          source={{ uri: labLogo }}
          resizeMode="contain"
          style={{ position: 'absolute', top: Math.max(insets.top, 8) + 7, left: 20, width: 130, height: 38, zIndex: 9, pointerEvents: 'none' } as any}
        />
      )}
    </>
  );
}

export default LabTopHeader;
