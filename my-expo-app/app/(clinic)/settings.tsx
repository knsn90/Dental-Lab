import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../core/store/authStore';
import { resolveClinicPerms } from '../../modules/clinic/permissions';
import { lazyRoute } from '../../core/_lazyRoute';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';

const SettingsHubScreen = lazyRoute(() => import('../../modules/settings/screens/SettingsHubScreen'), 'SettingsHubScreen');

export default function ClinicSettingsRoute() {
  const { t } = useTranslation();
  const T = useMobileTokens();
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  const perms = resolveClinicPerms(profile as any);
  if (!perms.settings_manage) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink, marginBottom: 6 }}>{t('clinic.noPermission.title')}</Text>
        <Text style={{ fontSize: 13, color: T.ink3, textAlign: 'center' }}>
          {t('clinic.noPermission.settingsManage')}
        </Text>
      </View>
    );
  }
  return <SettingsHubScreen />;
}
