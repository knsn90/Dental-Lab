import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';

export default function AdminNewOrderRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'admin') return null;
  return <NewOrderScreen accentColor="#0F172A" />;
}
