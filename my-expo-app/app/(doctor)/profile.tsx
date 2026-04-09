import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { ProfileScreen } from '../../modules/profile/screens/ProfileScreen';

export default function DoctorProfileRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'doctor') return null;
  return <ProfileScreen />;
}
