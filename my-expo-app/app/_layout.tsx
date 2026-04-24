import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { ToastContainer } from '../core/ui/Toast';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../core/store/authStore';
import {
  useFonts,
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

// Inject web-only global CSS for the phone-shell layout
function useWebStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Preconnect to Google Fonts
    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(preconnect1);

    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect2);

    // Load Plus Jakarta Sans
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href =
      'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(fontLink);

    const id = 'dental-lab-global-styles';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; }

      html, body {
        margin: 0; padding: 0;
        height: 100%;
        background-color: #FFFFFF;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 400;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Desktop (≥769px): full viewport */
      #root {
        min-height: 100vh;
        display: flex;
        background-color: #FFFFFF;
      }
      #root > div:first-of-type {
        width: 100%;
        height: 100vh;
        background-color: #FFFFFF;
        overflow: hidden;
        position: relative;
      }

      /* Tablet: phone shell centred */
      @media (max-width: 768px) and (min-width: 521px) {
        html, body { background-color: #FFFFFF; }
        #root {
          align-items: center;
          justify-content: center;
          background-color: #FFFFFF;
        }
        #root > div:first-of-type {
          width: 100%;
          max-width: 480px;
          height: 100vh;
          max-height: 900px;
          background-color: #FFFFFF;
          box-shadow: 0 8px 48px rgba(15,23,42,0.08);
          border-radius: 4px;
        }
      }

      /* Mobile */
      @media (max-width: 520px) {
        html, body, #root { background-color: #FFFFFF; }
        #root > div:first-of-type {
          max-width: 100%;
          height: 100vh;
          max-height: none;
          box-shadow: none;
          border-radius: 0;
          background-color: #FFFFFF;
        }
      }

      /* Thin scrollbar — mavi ton */
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #BFDBFE; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #93C5FD; }

      input, textarea, select {
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        outline: none;
      }

      /* Smooth transitions */
      button, [role="button"] { cursor: pointer; }
      * { -webkit-tap-highlight-color: transparent; }

      /* Card style helper (used via className in web wrappers) */
      .ds-card {
        background: #fff;
        border-radius: 12px;
        border: 1px solid #E8EDF4;
        box-shadow: 0 1px 4px rgba(15,23,42,0.06);
      }
    `;
    document.head.appendChild(style);
  }, []);
}

export default function RootLayout() {
  useWebStyles();

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_300Light,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    ...MaterialCommunityIcons.font,
  });

  const { session, profile, loading, setSession, setLoading, fetchProfile } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup  = segments[0] === '(auth)';
    const isAdminLogin = segments[1] === 'admin-login';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    const userType = profile?.user_type ?? (session.user.user_metadata?.user_type as string | undefined);
    if (!userType) return;

    // Kullanıcı tipine göre doğru panel grubu
    const expectedGroup = userType === 'doctor'       ? '(doctor)'
                        : userType === 'admin'        ? '(admin)'
                        : userType === 'clinic_admin' ? '(clinic)'
                        : '(lab)';
    const currentGroup  = segments[0];

    if (inAuthGroup) {
      // Auth sayfasındayken oturum açıldıysa doğru panele gönder
      if (!isAdminLogin) {
        if (userType === 'doctor')            router.replace('/(doctor)');
        else if (userType === 'admin')        router.replace('/(admin)');
        else if (userType === 'clinic_admin') router.replace('/(clinic)' as any);
        else                                  router.replace('/(lab)');
      }
    } else if (currentGroup !== expectedGroup) {
      // Admin kullanıcılar lab panelini de görüntüleyebilir (çoklu sekme desteği)
      if (userType === 'admin' && currentGroup === '(lab)') return;

      // Yanlış panel grubundaysa (ör. lab kullanıcısı (doctor)/new-order içinde)
      // Aynı alt sayfayı doğru grup içinde aç: ['(doctor)', 'new-order'] → '/(lab)/new-order'
      const subPath  = segments.slice(1).join('/');
      const base     = userType === 'doctor'       ? '/(doctor)'
                     : userType === 'admin'        ? '/(admin)'
                     : userType === 'clinic_admin' ? '/(clinic)'
                     : '/(lab)';
      const target   = subPath ? `${base}/${subPath}` : base;
      router.replace(target as any);
    }
  }, [session, profile, loading]);

  // On native, wait for fonts before rendering
  if (!fontsLoaded && Platform.OS !== 'web') {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
      <ToastContainer />
    </>
  );
}
