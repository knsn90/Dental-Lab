// app/(tv)/index.tsx — TV girişi: panele/role'e göre yönlendir
//   • Teknisyen (lab + technician) → istasyon kiosk
//   • Diğer lab-tarafı (admin / lab yönetici) → izle-only pano
// (Faz 1: pano tam; station kiosk Faz 2.)

import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../../store/authStore';

export default function TVIndex() {
  const { profile } = useAuthStore();
  const userType = profile?.user_type;
  const userRole = (profile as any)?.role;

  const isTechnician = userType === 'lab' && userRole === 'technician';
  return <Redirect href={(isTechnician ? '/tv/station' : '/tv/board') as any} />;
}
