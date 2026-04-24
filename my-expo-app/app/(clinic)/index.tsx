import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { ClinicDashboardScreen } from '../../modules/dashboard/screens/ClinicDashboardScreen';

export default function ClinicIndexRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'clinic_admin') return null;
  return <ClinicDashboardScreen />;
}
