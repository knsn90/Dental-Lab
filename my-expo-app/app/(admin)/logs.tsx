/**
 * (admin)/logs — Loglar. Gövde Ayarlar > Loglar ile ortak: modules/logs/LogsBrowser
 * (sunucu süzgeci + sayfalama, yalnız hesap sahibi; başkasına "yetki yok" boş durumu).
 */
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { LogsBrowser } from '../../modules/logs/LogsBrowser';

export default function AdminLogsScreen() {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? T.bg : '#FFFFFF' }} edges={['bottom']}>
      <View style={{ flex: 1, paddingTop: 16 }}>
        <LogsBrowser />
      </View>
    </SafeAreaView>
  );
}
