import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { DoctorDashboardScreen } from '../../modules/dashboard/screens/DoctorDashboardScreen';

export default function DoctorIndexRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'doctor') return null;
  return <DoctorDashboardScreen />;
}
