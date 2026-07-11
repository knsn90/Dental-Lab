// app/c/[code].tsx
// QR short-link resolver — kullanıcı QR'ı taradığında bu sayfa açılır.
// resolve_qr_link RPC ile kısa kodu çözüp gerçek vaka sayfasına yönlendirir.

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../core/api/supabase';
import { useAuthStore } from '../../core/store/authStore';

export default function QrResolverScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { profile, session, loading } = useAuthStore();
  const [status, setStatus] = useState<'resolving' | 'expired' | 'revoked' | 'not_found' | 'error'>('resolving');

  useEffect(() => {
    if (!code || loading) return;

    (async () => {
      const { data, error } = await supabase.rpc('resolve_qr_link', { p_short_code: String(code).toUpperCase() });
      if (error) { setStatus('error'); return; }
      if (!data || data.length === 0) { setStatus('not_found'); return; }

      const link = data[0];
      if (link.revoked) { setStatus('revoked'); return; }
      if (link.expired) { setStatus('expired'); return; }

      // Auth gerekiyorsa login'e yönlendir; return path ile geri gelsin
      if (!session) {
        const returnPath = `/c/${code}`;
        try {
          if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('post_login_redirect', returnPath);
          }
        } catch {}
        router.replace('/(auth)/login' as any);
        return;
      }

      // Profile + target type'a göre panel rotasını seç
      const userType = profile?.user_type ?? 'lab';
      const panel = userType === 'doctor' ? 'doctor'
                  : userType === 'clinic_admin' ? 'clinic'
                  : userType === 'admin' ? 'admin'
                  : 'lab';

      if (link.target_type === 'work_order') {
        router.replace(`/(${panel})/order/${link.target_id}` as any);
      } else {
        // Bilinmeyen target type — anasayfa
        router.replace(`/(${panel})` as any);
      }
    })();
  }, [code, loading, session, profile?.user_type]);

  const message =
    status === 'resolving' ? 'Vaka açılıyor…'
    : status === 'expired' ? 'Bu QR kodun süresi dolmuş.'
    : status === 'revoked' ? 'Bu QR kod iptal edilmiş.'
    : status === 'not_found' ? 'QR kod bulunamadı.'
    : 'Bir hata oluştu.';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FAFAFA' }}>
      {status === 'resolving' && <ActivityIndicator size="large" color="#0F172A" />}
      <Text style={{ marginTop: 16, fontSize: 14, color: '#475569', fontWeight: '500' }}>
        {message}
      </Text>
      {status !== 'resolving' && code && (
        <Text style={{ marginTop: 6, fontSize: 11, color: '#94A3B8', letterSpacing: 0.6, fontWeight: '600' }}>
          KOD · {String(code).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
