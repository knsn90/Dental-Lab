import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { ClinicOrdersScreen } from '../../modules/orders/screens/ClinicOrdersScreen';

export default function ClinicOrdersRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'clinic_admin') return null;
  return <ClinicOrdersScreen />;
}
