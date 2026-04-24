import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { ProfileScreen } from '../../modules/profile/screens/ProfileScreen';

export default function ClinicProfileRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'clinic_admin') return null;
  return <ProfileScreen />;
}
