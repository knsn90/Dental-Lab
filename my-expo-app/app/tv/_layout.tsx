// app/(tv)/_layout.tsx — TV (10-foot) kabuğu
// siman.app/tv → izole TV ağacı. Normal app'e (paneller) DOKUNMAZ.
//   • Mobil navbar / panel header YOK
//   • Koyu duvar-ekran zemini + overscan kenar boşluğu (TV kenar kırpması)
//   • D-pad odak sağlayıcısı (TVFocusProvider) tüm alt ekranları sarar
//
// Auth: oturum yoksa login'e gönderir. Girişte index panele göre board/station'a yollar.

import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Slot, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../../store/authStore';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { TVFocusProvider } from '../../core/tv/tvFocus';
import { TV } from '../../core/tv/tvTheme';

export default function TVLayout() {
  const { session, profile, loading } = useAuthStore();
  const { width, height } = useWindowDimensions();

  if (loading && !session) return <LoadingSpinner fullScreen message="…" />;
  if (!session) return <Redirect href="/(auth)/login" />;
  // profil beklenirken kabuk görünür (spinner) — index profil gelince yönlendirir
  if (!profile) return <LoadingSpinner fullScreen message="…" />;

  // Overscan — TV kenarları içeriği kırpar; güvenli iç boşluk (%3.5 yatay, %4.5 dikey)
  const padH = Math.round(width * 0.035);
  const padV = Math.round(height * 0.045);

  return (
    <TVFocusProvider>
      <StatusBar style="light" hidden />
      <View style={{ flex: 1, backgroundColor: TV.bg, paddingHorizontal: padH, paddingVertical: padV }}>
        <Slot />
      </View>
    </TVFocusProvider>
  );
}
