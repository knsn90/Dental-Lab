/**
 * Universal kurye takip yönlendirmesi — /courier-tracking
 *
 * WhatsApp şablonlarındaki "Kurye Takip" butonu ve teslimat e-postalarındaki
 * link bu SABİT adrese gider (Meta şablonundaki URL değiştirilemez), ama takip
 * ekranı her panelde ayrı bir route'tur. Burada kullanıcının rolüne göre kendi
 * panelinin takip sayfasına yönlendiriyoruz. (Aynı desen: app/order/[id].tsx.)
 */
import { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../core/store/authStore';
import { setPendingRoute } from '../core/store/pendingRoute';
import { ActivityIndicator } from '../core/ui/teethCompat';
import { autoT } from '../core/i18n/autoTranslate';

export default function CourierTrackingRedirect() {
  const router = useRouter();
  const { profile, session, loading } = useAuthStore();

  useEffect(() => {
    if (loading) return;

    if (!session) {
      // Giriş yapılmamış → hedefi sakla, login sonrası kök guard buraya döner.
      setPendingRoute('/courier-tracking');
      router.replace('/(auth)/login' as any);
      return;
    }

    if (!profile) return;

    // NOT: user_type string'e cast edildi — 'clinic_secretary' UserType
    // union'ında yok ama DB'de gerçek bir değer.
    const ut = String(profile.user_type);
    if (ut === 'lab')            router.replace('/(lab)/courier-tracking' as any);
    else if (ut === 'admin')     router.replace('/(admin)/courier-tracking' as any);
    else if (ut === 'doctor')    router.replace('/(doctor)/courier-tracking' as any);
    else if (ut === 'clinic_admin' || ut === 'clinic_secretary')
                                 router.replace('/(clinic)/courier-tracking' as any);
    else if (ut === 'courier')   router.replace('/(courier)/map' as any);
    else                         router.replace('/' as any);
  }, [loading, session, profile]);

  return (
    <View style={s.container}>
      <ActivityIndicator size="large" color="#2563EB" />
      <Text style={s.text}>{autoT('Yönlendiriliyor…')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 12 },
  text:      { fontSize: 14, color: '#64748B', fontFamily: Platform.OS === 'web' ? "'Outfit', system-ui, sans-serif" : 'Outfit_400Regular' },
});
