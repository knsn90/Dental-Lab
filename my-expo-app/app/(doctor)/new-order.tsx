import React, { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
const NewOrderScreen = lazyRoute(() => import('../../modules/orders/screens/NewOrderScreen'), 'NewOrderScreen');
import { lazyRoute } from '../../core/_lazyRoute';

/**
 * Doktor paneli — yeni iş emri oluşturma.
 * Admin/lab ile aynı ekran kullanılır; sadece klinik + hekim sabit (doctorMode).
 *
 *  ⚠ Önceden `if (loading || !profile) return null` vardı; tarayıcı sekme
 *  değiştirip dönünce auth listener `loading:true` set ettiğinde ekran
 *  unmount oluyor, NewOrderScreen state'i (dosyalar, form alanları) sıfırlanıyordu.
 *  Bu rotada profil bir kez yüklendiyse artık unmount yapmıyoruz — sadece ilk
 *  yüklemede null dönüyoruz.
 */
export default function DoctorNewOrderRoute() {
  const router = useRouter();
  const { profile, loading } = useAuthStore();
  // Profil bir kez yüklendi mi? Yüklendiyse refocus loading'inde ekranı sökme.
  const wasReadyRef = useRef(false);
  if (profile && profile.user_type === 'doctor') {
    wasReadyRef.current = true;
  }

  useEffect(() => {
    if (!loading && profile && profile.user_type !== 'doctor') {
      router.replace('/(lab)/new-order' as any);
    }
  }, [profile, loading]);

  // İlk yüklemede flash önlemi — profil henüz hazır değilse ve daha önce de
  // hazır olmadıysa boş dön
  if (!wasReadyRef.current && (loading || !profile)) return null;

  // Doktor olmadığı kesinleştiyse boş — redirect ediliyor
  if (profile && profile.user_type !== 'doctor') return null;

  return <NewOrderScreen panel="doctor" doctorMode />;
}
