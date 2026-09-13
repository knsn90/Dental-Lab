/**
 * Universal order redirect — /order/:id
 * QR code bu URL'yi encode eder.
 * Kullanıcı rolüne göre doğru panele yönlendirir.
 */
import { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { setPendingRoute } from '../../core/store/pendingRoute';
import { ActivityIndicator } from '../../core/ui/teethCompat';

export default function OrderRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const { profile, session, loading } = useAuthStore();

  useEffect(() => {
    if (loading) return;

    if (!session) {
      // Giriş yapılmamış → hedefi sakla (URL paramı yönlendirme zincirinde
      // siliniyor), login'e yönlendir. Giriş sonrası kök guard hedefe döner.
      setPendingRoute(`/order/${id}`);
      router.replace('/(auth)/login' as any);
      return;
    }

    if (!profile) return;

    // Role göre doğru panele yönlendir
    // Tüm roller aynı OrderDetailScreen'e gider, tema role'e göre değişir.
    // NOT: user_type string'e cast edildi — 'clinic_secretary' UserType union'ında
    // yok ama DB'de gerçek bir değer (klinik sekreteri de bildirim alır).
    const ut = String(profile.user_type);
    if (ut === 'lab')            router.replace(`/(lab)/order/${id}` as any);
    else if (ut === 'doctor')    router.replace(`/(doctor)/order/${id}` as any);
    else if (ut === 'admin')     router.replace(`/(admin)/order/${id}` as any);
    else if (ut === 'clinic_admin' || ut === 'clinic_secretary')
                                 router.replace(`/(clinic)/order/${id}` as any);
    else                         router.replace('/' as any);
  }, [loading, session, profile, id]);

  return (
    <View style={s.container}>
      <ActivityIndicator size="large" color="#2563EB" />
      <Text style={s.text}>Yönlendiriliyor…</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 12 },
  text:      { fontSize: 14, color: '#64748B', fontFamily: Platform.OS === 'web' ? "'Outfit', system-ui, sans-serif" : 'Outfit_400Regular' },
});
