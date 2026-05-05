import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';

const CLINIC_ACCENT = '#6BA888';

export default function ClinicNewOrderRoute() {
  const router = useRouter();
  const { profile, loading } = useAuthStore();

  useEffect(() => {
    if (!loading && profile && profile.user_type !== 'clinic_admin') {
      router.replace('/(lab)/new-order' as any);
    }
  }, [profile, loading]);

  if (loading || !profile) return null;
  if (profile.user_type !== 'clinic_admin') return null;

  return <NewOrderScreen clinicMode accentColor={CLINIC_ACCENT} />;
}
