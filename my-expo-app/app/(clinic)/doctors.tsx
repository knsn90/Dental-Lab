import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';

/**
 * Eski "/(clinic)/doctors" route'u — yeni "Kullanıcılar" ekranına yönlendirir.
 * Hekim/Sekreter/Yönetici hepsi tek bir ekrandan yönetilir.
 */
export default function ClinicDoctorsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(clinic)/users' as any);
  }, [router]);
  return null;
}
