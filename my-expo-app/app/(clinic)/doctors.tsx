import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { ClinicDoctorsScreen } from '../../modules/clinic/screens/ClinicDoctorsScreen';

export default function ClinicDoctorsRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'clinic_admin') return null;
  return <ClinicDoctorsScreen />;
}
