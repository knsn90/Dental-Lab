import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { useAuthStore } from '../../core/store/authStore';
import { resolveClinicPerms } from '../../modules/clinic/permissions';
// Statik import — lazy hâlde ekran "Yükleniyor…"da donup yalnız gezinme/yenileme
// ile açılıyordu (chunk 200, modül hazır, React yeniden denemiyor).
import { OrdersListScreenV2 } from '../../modules/orders/screens/OrdersListScreenV2';

export default function ClinicOrdersRoute() {
  const { t } = useTranslation();
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  const perms = resolveClinicPerms(profile as any);
  if (!perms.orders_view) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 6 }}>{t('clinic.noPermission.title')}</Text>
        <Text style={{ fontSize: 13, color: '#6B6B6B', textAlign: 'center' }}>
          {t('clinic.noPermission.ordersView')}
        </Text>
      </View>
    );
  }
  return <OrdersListScreenV2 />;
}
