import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
const NewOrderScreen = lazyRoute(() => import('../../modules/orders/screens/NewOrderScreen'), 'NewOrderScreen');
import { lazyRoute } from '../../core/_lazyRoute';

export default function AdminNewOrderRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'admin') return null;
  // Yönetim paneli teması: kobalt #4771AB · Başlık: "Yeni Sipariş"
  return <NewOrderScreen panel="admin" />;
}
