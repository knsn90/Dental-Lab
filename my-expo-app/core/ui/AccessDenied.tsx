// core/ui/AccessDenied.tsx
// PermissionGate fallback — kullanıcı bir ekrana yetkisiz eriştiğinde gösterilir.
// Panel-nötr, ortalanmış, line ikon + i18n mesaj.

import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Lock } from './icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS } from '../theme/dsTokens';
import { useMobileTokens } from '../theme/mobileDesignTokens';
import { useThemeModeStore } from '../store/themeModeStore';

export function AccessDenied() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: insets.top + 80, gap: 12 }}>
      <View style={{
        width: 64, height: 64, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      }}>
        <Lock size={26} color={isDark ? (T.ink3 as string) : DS.ink[400]} strokeWidth={1.6} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '600', color: isDark ? T.ink : DS.ink[800], textAlign: 'center' }}>
        {t('common.accessDenied')}
      </Text>
      <Text style={{ fontSize: 13, color: isDark ? (T.ink3 as string) : DS.ink[400], textAlign: 'center', maxWidth: 320, lineHeight: 19 }}>
        {t('common.accessDeniedDesc')}
      </Text>
    </View>
  );
}
