import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { DoctorBalanceScreen } from '../../modules/invoices/screens/DoctorBalanceScreen';

export default function DoctorBalanceRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'doctor') return null;
  return <DoctorBalanceScreen />;
}
