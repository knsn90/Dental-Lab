import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { DoctorClinicScreen } from '../../modules/clinics/screens/DoctorClinicScreen';

export default function DoctorClinicRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'doctor') return null;
  return <DoctorClinicScreen />;
}
