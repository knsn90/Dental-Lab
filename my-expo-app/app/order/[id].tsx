/**
 * Universal order redirect — /order/:id
 * QR code bu URL'yi encode eder.
 * Kullanıcı rolüne göre doğru panele yönlendirir.
 */
import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';

export default function OrderRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const { profile, session, loading } = useAuthStore();

  useEffect(() => {
    if (loading) return;

    if (!session) {
      // Giriş yapılmamış → auth'a yönlendir, sonra geri gel
      router.replace(`/(auth)/login?redirect=/order/${id}` as any);
      return;
    }

    if (!profile) return;

    // Role göre doğru panele yönlendir
    // Tüm roller aynı OrderDetailScreen'e gider, tema role'e göre değişir.
    switch (profile.user_type) {
      case 'lab':
        router.replace(`/(lab)/order/${id}` as any);
        break;
      case 'doctor':
        router.replace(`/(doctor)/order/${id}` as any);
        break;
      case 'admin':
        router.replace(`/(admin)/order/${id}` as any);
        break;
      case 'clinic_admin':
        router.replace(`/(clinic)/order/${id}` as any);
        break;
      default:
        router.replace('/' as any);
    }
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
