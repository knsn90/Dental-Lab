import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { DoctorOrdersScreen } from '../../modules/orders/screens/DoctorOrdersScreen';

export default function DoctorOrdersRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'doctor') return null;
  return <DoctorOrdersScreen />;
}
