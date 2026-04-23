import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { DoctorInvoicesScreen } from '../../modules/invoices/screens/DoctorInvoicesScreen';

export default function DoctorInvoicesRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'doctor') return null;
  return <DoctorInvoicesScreen />;
}
