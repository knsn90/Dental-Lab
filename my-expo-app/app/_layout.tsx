// Polyfill WeakRef for Hermes (RN 0.76) — used by @react-navigation/core 7.x
if (typeof globalThis.WeakRef === 'undefined') {
  (globalThis as any).WeakRef = class WeakRef<T extends object> {
    private _value: T | undefined;
    constructor(value: T) { this._value = value; }
    deref(): T | undefined { return this._value; }
  };
}

import '../global.css'; // NativeWind global stylesheet
import { useEffect } from 'react';
import { Stack, useRouter, useSegments, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { ToastContainer } from '../core/ui/Toast';
import { supabase } from '../core/api/supabase';
import { useAuthStore } from '../core/store/authStore';
import { usePermissionStore } from '../core/store/permissionStore';
import { useFonts } from 'expo-font';
import {
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import {
  InterTight_200ExtraLight,
  InterTight_300Light,
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
} from '@expo-google-fonts/inter-tight';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
// NOTE: @expo/vector-icons removed — proje Lucide React Native kullanıyor
import { useFontStore, applyFontSizeWeb } from '../core/store/fontStore';
import { useThemeModeStore } from '../core/store/themeModeStore';

// Inject web-only global CSS for the phone-shell layout
// NOTE: Fonts (Outfit + Material Symbols) are loaded in web/index.html.
//       This hook only injects layout/zoom CSS that depends on runtime state.
function useWebStyles() {
  const { fontSize } = useFontStore();

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Apply saved font size (CSS zoom on <html>)
    applyFontSizeWeb(fontSize);

    // ── Global layout styles ───────────────────────────────────────────────
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

  // Web: Outfit Google Fonts CDN ile geliyor.
  // Native: 5 ağırlığı .ttf olarak yüklüyoruz + Material icons.
  const [fontsLoaded] = useFonts({
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    InterTight_200ExtraLight,
    InterTight_300Light,
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
  });

  const { session, profile, loading, setSession, setLoading, fetchProfile } = useAuthStore();
  const { fetchPermissions: fetchPerms, clear: clearPerms } = usePermissionStore();
  const segments = useSegments();
  const router = useRouter();
  const navRef = useNavigationContainerRef();

  // Hydrate persisted theme mode (light/dark/system)
  useEffect(() => { useThemeModeStore.getState().hydrate(); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) { fetchProfile(session.user.id); fetchPerms(); }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchPerms();
      } else {
        clearPerms();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!navRef.isReady()) return;
    const inAuthGroup  = segments[0] === '(auth)';

    // Public routes — auth gerekmez (token bazlı erişim + dev showcase)
    const isPublicRoute = segments[0] === 'pay' || segments[0] === 'doctor-approval' || segments[0] === 'dev';
    if (isPublicRoute) return;

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // ── Profil yüklenmesini bekle (auth grubundayken) ──
    // Session var ama profil henüz null → fetchProfile devam ediyor.
    // Auth grubundayken profil gelmeden routing yapma — metadata'daki eski
    // user_type yanlış panele yönlendirebilir. Panel grubunda ise devam et.
    if (!profile && inAuthGroup) {
      return;
    }

    const userType = profile?.user_type ?? (session.user.user_metadata?.user_type as string | undefined);
    const userRole = profile?.role;

    if (!userType) return;

    // Teknisyen → istasyon paneli, diğer lab kullanıcıları → lab paneli
    const isTechnician = userType === 'lab' && userRole === 'technician';

    // Kullanıcı tipine göre doğru panel grubu
    const expectedGroup = userType === 'doctor'       ? '(doctor)'
                        : userType === 'admin'        ? '(admin)'
                        : userType === 'clinic_admin' ? '(clinic)'
                        : isTechnician                ? '(station)'
                        : '(lab)';
    const currentGroup  = segments[0];

    // Onaylanmamış hekim — giriş engelle
    if (userType === 'doctor' && profile?.approval_status && profile.approval_status !== 'approved') {
      if (!inAuthGroup) {
        supabase.auth.signOut();
        router.replace('/(auth)/login');
      }
      return;
    }

    // ── Lab/admin kullanıcı — lab_id yoksa wizard'a yönlendir ──
    // Bu kontrol hem auth grubunda hem panel grubunda geçerli
    if ((userType === 'lab' || userType === 'admin') && profile && !profile.lab_id) {
      if (inAuthGroup && segments[1] === 'setup-wizard') return; // zaten wizard'da
      router.replace('/(auth)/setup-wizard' as any);
      return;
    }

    if (inAuthGroup) {
      // Kayıt sonrası doğrulama/onay bekleme ekranlarında kalmasına izin ver
      const isPostRegistration = segments[1] === 'verify-phone' || segments[1] === 'approval-waiting';
      if (isPostRegistration) return;

      // Onboarding wizard'da ise kalmasına izin ver
      if (segments[1] === 'setup-wizard') return;

      // Auth sayfasındayken oturum açıldıysa doğru panele gönder
      if (userType === 'doctor')            router.replace('/(doctor)');
      else if (userType === 'admin')        router.replace('/(admin)');
      else if (userType === 'clinic_admin') router.replace('/(clinic)' as any);
      else if (isTechnician)                router.replace('/(station)' as any);
      else                                  router.replace('/(lab)');
    } else {
      if (currentGroup !== expectedGroup) {
        // Admin kullanıcılar lab panelini de görüntüleyebilir (çoklu sekme desteği)
        if (userType === 'admin' && currentGroup === '(lab)') return;
        // Teknisyenler istasyon panelinde kalabilir
        if (isTechnician && currentGroup === '(station)') return;

        // Yanlış panel grubunda — doğru panelin index'ine gönder (subPath taşıma)
        // Subpath farklı paneller arasında route uyuşmazlığına neden olur (ör. /(lab)/clinics → /(clinic)/clinics yok).
        const base     = userType === 'doctor'       ? '/(doctor)'
                       : userType === 'admin'        ? '/(admin)'
                       : userType === 'clinic_admin' ? '/(clinic)'
                       : isTechnician                ? '/(station)'
                       : '/(lab)';
        router.replace(base as any);
      }
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
