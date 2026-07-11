import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { resolveClinicPerms } from '../../modules/clinic/permissions';
const NewOrderScreen = lazyRoute(() => import('../../modules/orders/screens/NewOrderScreen'), 'NewOrderScreen');
import { lazyRoute } from '../../core/_lazyRoute';

export default function ClinicNewOrderRoute() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile, loading } = useAuthStore();

  useEffect(() => {
    if (!loading && profile && !['clinic_admin', 'clinic_secretary'].includes(profile.user_type)) {
      router.replace('/(lab)/new-order' as any);
    }
  }, [profile, loading]);

  if (loading || !profile) return null;
  if (!['clinic_admin', 'clinic_secretary'].includes(profile.user_type)) return null;

  const perms = resolveClinicPerms(profile as any);
  if (!perms.orders_create) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 6 }}>{t('clinic.noPermission.title')}</Text>
        <Text style={{ fontSize: 13, color: '#6B6B6B', textAlign: 'center' }}>
          {t('clinic.noPermission.orderCreate')}
        </Text>
      </View>
    );
  }

  // Klinik paneli teması: deeper sky #0369A1 · "Hangi hekim için?" · "Laboratuvara gönder"
  return <NewOrderScreen panel="clinic" clinicMode />;
}
