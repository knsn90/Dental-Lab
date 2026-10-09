/**
 * Evrensel telefon talebi yönlendirmesi — /phone-leads/:id
 * Bildirim ve e-posta butonu bu URL'yi kullanır; role göre doğru panele gider.
 * Erişim kontrolü ekranın kendisinde (modül bayrağı + admin/müdür) ve sunucuda (RLS).
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { setPendingRoute } from '../../core/store/pendingRoute';

export default function PhoneLeadRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, session, loading } = useAuthStore();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setPendingRoute(`/phone-leads/${id}`);
      router.replace('/(auth)/login' as any);
      return;
    }
    if (!profile) return;
    const ut = String(profile.user_type);
    if (ut === 'admin') router.replace(`/(admin)/phone-leads?id=${id}` as any);
    else if (ut === 'lab') router.replace(`/(lab)/phone-leads?id=${id}` as any);
    else router.replace('/' as any);
  }, [loading, session, profile, id]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
