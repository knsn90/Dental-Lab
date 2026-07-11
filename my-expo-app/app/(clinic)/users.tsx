import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../core/store/authStore';
import { resolveClinicPerms } from '../../modules/clinic/permissions';
import { lazyRoute } from '../../core/_lazyRoute';

const ClinicUsersScreen = lazyRoute(() => import('../../modules/clinic/screens/ClinicUsersScreen'), 'ClinicUsersScreen');

export default function ClinicUsersRoute() {
  const { t } = useTranslation();
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (!['clinic_admin', 'clinic_secretary'].includes(profile.user_type)) return null;
  const perms = resolveClinicPerms(profile as any);
  if (!perms.users_manage) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 6 }}>{t('clinic.noPermission.title')}</Text>
        <Text style={{ fontSize: 13, color: '#6B6B6B', textAlign: 'center' }}>
          {t('clinic.noPermission.usersManage')}
        </Text>
      </View>
    );
  }
  return <ClinicUsersScreen />;
}
