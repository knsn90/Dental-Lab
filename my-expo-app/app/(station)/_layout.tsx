// app/(station)/_layout.tsx
// Teknisyen istasyon paneli — Stack navigator (tablet odaklı)

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const STATION_ACCENT = '#16A34A'; // İstasyon yeşili

export default function StationLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F0FDF4' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'İstasyon' }} />
        <Stack.Screen name="job-detail" options={{ title: 'İş Detayı' }} />
        <Stack.Screen name="settings" options={{ title: 'Ayarlar' }} />
      </Stack>
    </>
  );
}
