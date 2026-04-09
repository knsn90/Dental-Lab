import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { DoctorNewOrderScreen } from '../../modules/orders/screens/DoctorNewOrderScreen';

export default function DoctorNewOrderRoute() {
  const router = useRouter();
  const { profile, loading } = useAuthStore();

  useEffect(() => {
    if (!loading && profile && profile.user_type !== 'doctor') {
      router.replace('/(lab)/new-order' as any);
    }
  }, [profile, loading]);

  // Profil yüklenene kadar hiçbir şey gösterme (flash önlemi)
  if (loading || !profile) return null;

  // Hekim değilse _layout.tsx redirect alana kadar boş ekran
  if (profile.user_type !== 'doctor') return null;

  return <DoctorNewOrderScreen />;
}
