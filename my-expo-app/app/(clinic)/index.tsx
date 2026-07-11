import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { ClinicDashboardScreen } from '../../modules/dashboard/screens/ClinicDashboardScreen';

export default function ClinicIndexRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (!['clinic_admin', 'clinic_secretary'].includes(profile.user_type)) return null;
  return <ClinicDashboardScreen />;
}
