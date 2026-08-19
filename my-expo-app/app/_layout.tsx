// Polyfill WeakRef for Hermes (RN 0.76) — used by @react-navigation/core 7.x
if (typeof globalThis.WeakRef === 'undefined') {
  (globalThis as any).WeakRef = class WeakRef<T extends object> {
    private _value: T | undefined;
    constructor(value: T) { this._value = value; }
    deref(): T | undefined { return this._value; }
  };
}

import '../global.css'; // NativeWind global stylesheet
import '../core/i18n'; // i18n çatısı — uygulama başında bir kez init
import { isRTL } from '../core/i18n';
import { useLabSettingsStore } from '../core/store/labSettingsStore';
import { amIPlatformAdmin, publicPlatformStatus } from '../modules/platform/api';
import { useActiveLabStore } from '../core/store/activeLabStore';
import { installAutoTranslate, isDictReady } from '../core/i18n/autoTranslate';
installAutoTranslate(); // global Text/TextInput runtime sözlük çevirisi (kaynak değişmeden)
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastContainer } from '../core/ui/Toast';
import { RootErrorBoundary, installGlobalErrorHandler } from '../core/ui/RootErrorBoundary';

// Hermes/RN global error handler — async errors için (ErrorBoundary'nin görmediği).
// Modül-yükleme sırasında bir kez kurulur.
installGlobalErrorHandler();
import { GlobalSupportTrigger } from '../modules/support/components/GlobalSupportTrigger';
import { DentyFAB } from '../modules/denty/components/DentyFAB';
import { ConsentGuard } from '../modules/auth/components/ConsentGuard';
import { supabase } from '../core/api/supabase';
import { bootMark } from '../core/debug/bootTrace';
import { signalAppReady } from '../core/debug/appReady';
import { BootTracePanel } from '../core/debug/BootTracePanel';
import { useLabSetupStore } from '../core/store/labSetupStore';
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
  const resolvedDark = useThemeModeStore(s => s.resolvedDark);

  // ── Dark mode: CSS değişkeniyle html/body/root rengini güncelle ──
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Light: beyaz canvas — splash/safe-zone kremi (eski #F2EDE3) kaldırıldı.
    // Dark:  ink.
    const bg = resolvedDark ? '#0E0E0E' : '#FFFFFF';
    document.documentElement.style.setProperty('--app-bg', bg);
    document.documentElement.style.setProperty('color-scheme', resolvedDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', resolvedDark ? 'dark' : 'light');
    document.body.style.backgroundColor = bg;

    // theme-color meta'larını dinamik güncelle — iOS standalone PWA status bar arkası
    // (statik media-query yerine, app'in dark toggle'ı sistemden bağımsız çalışır)
    const removeAll = () => {
      const all = document.querySelectorAll('meta[name="theme-color"]');
      all.forEach(el => el.remove());
    };
    removeAll();
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = bg;
    document.head.appendChild(meta);
  }, [resolvedDark]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Apply saved font size (CSS zoom on <html>)
    applyFontSizeWeb(fontSize);

    // ── Global layout styles ───────────────────────────────────────────────
    const id = 'dental-lab-global-styles';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    // Peyda (Farsça) — metin aileleri (Outfit + inline Inter Tight/Inter) için
    // unicode-range ile: yalnız Arapça/Farsça glifler Peyda'dan gelir, Latin metin
    // ve ağırlıklar (400/500/600/700) korunur. Dosyalar /fonts/ (public) altında.
    const peydaRange = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200D';
    const peydaFaces = ['Outfit', 'Inter Tight', 'Inter'].map((fam) => (
      [[400, 'regular'], [500, 'medium'], [600, 'semibold'], [700, 'bold']].map(([w, f]) =>
        `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;`
        + `src:url('/fonts/peyda-${f}.woff2') format('woff2');unicode-range:${peydaRange};}`
      ).join('\n      ')
    )).join('\n      ');
    style.textContent = `
      ${peydaFaces}

      /* RTL (Farsça/Arapça): inline fontFamily'si OLMAYAN metin düğümleri
         react-native-web'in "System" default'una düşüyor → Peyda'ya bağlı
         DEĞİL, bu yüzden sidebar menü vb. eski/sistem fontuyla çıkıyordu.
         Burada YALNIZ dir="rtl" iken, ikon dışı tüm metni Peyda'ya bağlı
         ailelere zorluyoruz. !important YOK → gerçek inline fontFamily
         (Inter Tight/Outfit — zaten Peyda-bağlı) kazanır; specificity
         (html[dir=rtl] + attr) RNW atomic class'ını geçer. */
      html[dir="rtl"] [dir="auto"]:not([aria-hidden="true"]):not([role="img"]) {
        font-family: 'Inter Tight', 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
      }

      :root { --app-bg: #FFFFFF; }
      *, *::before, *::after { box-sizing: border-box; }

      html, body {
        margin: 0; padding: 0;
        height: 100%;
        background-color: var(--app-bg);
        font-weight: 400;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Desktop (≥769px): full viewport */
      #root {
        min-height: 100vh;
        display: flex;
        background-color: var(--app-bg);
      }
      #root > div:first-of-type {
        width: 100%;
        height: 100vh;
        background-color: var(--app-bg);
        overflow: hidden;
        position: relative;
      }

      /* Tablet: phone shell centred */
      @media (max-width: 768px) and (min-width: 521px) {
        html, body { background-color: var(--app-bg); }
        #root {
          align-items: center;
          justify-content: center;
          background-color: var(--app-bg);
        }
        #root > div:first-of-type {
          width: 100%;
          max-width: 480px;
          height: 100vh;
          max-height: 900px;
          background-color: var(--app-bg);
          box-shadow: 0 8px 48px rgba(15,23,42,0.08);
          border-radius: 4px;
        }
      }

      /* Mobile */
      @media (max-width: 520px) {
        html, body, #root { background-color: var(--app-bg); }
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

// PWA service worker register — sadece web + production
function usePWA() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // Dev modda kafa karıştırmaması için yalnızca production
    if (typeof __DEV__ !== 'undefined' && __DEV__) return;
    const reg = () => navigator.serviceWorker.register('/sw.js').catch(() => null);
    if (document.readyState === 'complete') reg();
    else window.addEventListener('load', reg);
  }, []);
}

export default function RootLayout() {
  useWebStyles();
  usePWA();
  // Dil değişince tüm ağacı remount et → runtime sözlük çevirisi anında uygulanır
  const { i18n: _i18nLang } = useTranslation();

  // ── Tam RTL düzen (web): dil RTL ise kök <html dir="rtl"> ────────────────
  // Bu, CSS seviyesinde TÜM flex-row'ları, metin hizasını ve akışı aynalar
  // (yapısal ayna). Farsça/Arapça vb. için tasarım sağdan-sola olur.
  const _isRtlLang = isRTL(_i18nLang.language);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.documentElement;
    el.setAttribute('dir', _isRtlLang ? 'rtl' : 'ltr');
    el.setAttribute('lang', _i18nLang.language || 'tr');
  }, [_isRtlLang, _i18nLang.language]);

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

  const { session, profile, loading, setSession, setProfile, setLoading, fetchProfile } = useAuthStore();

  // Lab ayarlarını oturum açılır açılmaz yükle.
  //
  // Neden burada: `load()` şimdiye kadar YALNIZ para birimi gerektiren bir ekran
  // ya da Ayarlar açılınca tetikleniyordu. Bölgeye bağlı varsayılanlar (dil,
  // takvim) ise girişin hemen sonrasında lazım — aksi halde İran labının
  // kullanıcısı panoyu Türkçe görüyor, ancak Finans'a girince dil değişiyordu.
  useEffect(() => {
    if (!profile?.lab_id) return;
    void useLabSettingsStore.getState().load();
  }, [profile?.lab_id]);

  const { fetchPermissions: fetchPerms, clear: clearPerms } = usePermissionStore();
  // string[] olarak ele al: segments[0] literal route karşılaştırmaları expo-router'ın
  // tipli-route tuple union'ını daraltıp segments[1] erişimini bozuyordu.
  const segments = useSegments() as string[];
  const router = useRouter();
  const navRef = useNavigationContainerRef();

  // Platform (super-admin) durumu — yönlendirme kararında kullanılır.
  // null = henüz bilinmiyor (bu sırada setup-wizard'a erken atmayız).
  const [platformAdmin, setPlatformAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    if (!profile?.id) { setPlatformAdmin(null); return; }
    let alive = true;
    amIPlatformAdmin().then((v) => { if (alive) setPlatformAdmin(v); }).catch(() => { if (alive) setPlatformAdmin(false); });
    return () => { alive = false; };
  }, [profile?.id]);

  // Konsoldan açılan labın ilk kurulumu yapıldı mı (labs.setup_completed_at).
  // null = henüz bilinmiyor → bu sırada sihirbaza ATMAYIZ (fail-open: okuma
  // hata verirse de true sayılır, kullanıcı içeride kilitlenmesin).
  const labSetupDone = useLabSetupStore((st) => st.done);
  useEffect(() => {
    const labId = profile?.lab_id;
    if (!labId) { useLabSetupStore.getState().reset(); return; }
    void useLabSetupStore.getState().load(labId);
  }, [profile?.lab_id]);

  // Çoklu-lab klinik: aktif lab bağlamı (giriş sonrası lab seçimi + switcher).
  // Fail-open: RPC yoksa/hata verirse loaded=true & memberships boş → tek-lab davranışı.
  const alLoaded = useActiveLabStore((s) => s.loaded);
  const alActive = useActiveLabStore((s) => s.active);
  const alMemberships = useActiveLabStore((s) => s.memberships);
  const alLoad = useActiveLabStore((s) => s.load);
  useEffect(() => {
    const ut = profile?.user_type as string | undefined;
    if (profile?.id && (ut === 'doctor' || ut === 'clinic_admin' || ut === 'clinic_secretary')) {
      alLoad(profile.id);
    }
  }, [profile?.id, (profile as any)?.user_type]);

  // Bakım modu — fail-open (okuma başarısızsa engelleme yok)
  const [maintenance, setMaintenance] = useState<{ on: boolean; msg: string } | null>(null);
  useEffect(() => {
    (async () => { try { const st = await publicPlatformStatus(); setMaintenance({ on: !!st.maintenance_mode, msg: String(st.maintenance_message || '') }); } catch { /* fail-open */ } })();
  }, [session?.user?.id]);

  // Hydrate persisted theme mode (light/dark/system)
  useEffect(() => { useThemeModeStore.getState().hydrate(); }, []);
  // Hydrate son panel (optimistic ilk-açılış routing için)
  useEffect(() => { require('../core/store/lastPanelStore').useLastPanelStore.getState().hydrate(); }, []);
  useEffect(() => {
    try {
      const { useUserPrefsStore } = require('../core/store/userPrefsStore');
      useUserPrefsStore.getState().hydrate();
    } catch { /* */ }
  }, []);

  useEffect(() => {
    // Anti-flicker: aktif user değişince stale profile'ı hemen sil ki routing yanlış panele götürmesin
    const previousUserIdRef = { current: null as string | null };

    const applySession = (s: any) => {
      const nextUserId = s?.user?.id ?? null;
      if (nextUserId !== previousUserIdRef.current) {
        // Farklı kullanıcı / sign-out → eski profili kökten temizle
        setProfile(null);
        previousUserIdRef.current = nextUserId;
      }
      setSession(s);
      if (s?.user) {
        // loading'i true tut: yeni profile gelene kadar index/layout beklesin
        setLoading(true);
        fetchProfile(s.user.id);  // fetchProfile sonunda loading=false set eder
        fetchPerms();
        // Bildirim tercih + realtime subscription'ı navigation transition'dan
        // SONRA başlat. iOS 26 beta'da transition aktifken realtime channel açmak
        // veya ağır DB sorgusu yapmak TurboModule queue'da exception fırlatabiliyor.
        const userId = s.user.id;
        setTimeout(() => {
          try {
            require('../core/store/notificationPrefsStore')
              .useNotificationPrefs.getState().loadFromProfile(userId);
          } catch (e) { console.warn('[prefs] load failed:', (e as any)?.message); }
          try {
            require('../core/store/notificationsStore')
              .useNotificationsStore.getState().init(userId);
          } catch (e) { console.warn('[notifs] init failed:', (e as any)?.message); }
        }, 600);

        // SW push notification click → in-app navigate (web-only, native'de no-op)
        try {
          const { installServiceWorkerMessageListener } = require('../core/notifications/webPush');
          installServiceWorkerMessageListener((url: string) => {
            try {
              const { router } = require('expo-router');
              router.push(url as any);
            } catch { /* */ }
          }, s.user.id);
        } catch { /* */ }

        // Native push setup (iOS/Android) — token al + tıklayınca deep-link
        // Defer kritik: login sonrası navigation transition sırasında TurboModule
        // çağrısı yapmak iOS 26 beta'da Obj-C exception fırlatıyor. Transition
        // bitsin diye setTimeout ile bir sonraki tick'e at.
        setTimeout(() => {
          try {
            const np = require('../core/notifications/nativePush');
            try {
              np.setupNativePush((url: string) => {
                try {
                  const { router } = require('expo-router');
                  router.push(url as any);
                } catch { /* */ }
              });
            } catch (e) { console.warn('[nativePush] setup threw:', (e as any)?.message); }
            // Permission iste + token DB'ye yaz — her türlü exception'ı yut
            try {
              const p = np.registerForNativePush(s.user.id);
              if (p && typeof p.catch === 'function') p.catch(() => null);
            } catch (e) { console.warn('[nativePush] register threw:', (e as any)?.message); }
          } catch (e) { console.warn('[nativePush] require failed:', (e as any)?.message); }
        }, 1500);
      } else {
        clearPerms();
        // Notifications feed'i temizle (logout)
        try { require('../core/store/notificationsStore').useNotificationsStore.getState().reset(); } catch { /* */ }
        setLoading(false);
      }
    };

    // İlk session yükleme — bozuk/expire refresh token varsa temizle, login'e gönder
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.warn('[auth] getSession error:', error.message);
          // "Invalid Refresh Token: Refresh Token Not Found" gibi durumlar →
          // localStorage'daki bozuk token'ı temizleyip session'sız aç
          supabase.auth.signOut().catch(() => {});
          applySession(null);
          return;
        }
        applySession(session);
      })
      .catch((e) => {
        console.warn('[auth] getSession exception:', e?.message ?? e);
        supabase.auth.signOut().catch(() => {});
        applySession(null);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // TOKEN_REFRESHED başarısızsa Supabase event="SIGNED_OUT" gönderir
      if (event === 'SIGNED_OUT' || (event as string) === 'USER_DELETED') {
        applySession(null);
        return;
      }
      // Aktivite logu: yalnız GERÇEK yeni giriş (SIGNED_IN + kullanıcı değişti).
      // Token yenileme / sekme geri-odak (aynı user) veya app yeniden açılış
      // (INITIAL_SESSION) loglanmaz. Fire-and-forget, hata yutulur.
      // GEÇİCİ TEŞHİS: ölçümde giriş sonrası oturum 3,2 sn'de null'a düşüp
      // 9,9 sn'de geri geliyor; arada uygulama çıkış yapmış gibi davranıp
      // onlarca 401 üretiyor. Hangi OLAYIN bunu tetiklediğini görmek için.
      bootMark(`auth olayı: ${event}`, { user: s?.user?.id?.slice(0, 8) ?? null });
      if (event === 'SIGNED_IN') {
        const nid = s?.user?.id ?? null;
        if (nid && nid !== previousUserIdRef.current) {
          try { supabase.rpc('log_login').then(() => {}, () => {}); } catch { /* */ }
        }
      }
      // TOKEN_REFRESHED / USER_UPDATED / SIGNED_IN (re-fire) → aynı kullanıcı ise
      // sadece session güncelle, profile/perms tekrar çekme.
      // Aksi halde tarayıcı tabı geri açıldığında "loading=true → fetchProfile → fetchPerms"
      // zinciri tetiklenip tüm uygulama 1 saniye reload görüntüsü veriyor.
      // INITIAL_SESSION dahil — getSession() zaten applySession çağırdı.
      // Aynı user için ikinci kez fetchProfile başlatma (loading flicker).
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const nextUserId = s?.user?.id ?? null;
        if (nextUserId === previousUserIdRef.current) {
          // Aynı user (veya ikisi de null) — session güncelle, profile/perms re-fetch etme
          if (s !== undefined) setSession(s);
          return;
        }
      }
      applySession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!navRef.isReady()) return;
    const inAuthGroup  = segments[0] === '(auth)';

    // Public routes — auth gerekmez (token bazlı erişim + dev showcase)
    // 'checkin' ve 'c': QR check-in akışı token ile çalışır, oturum gerektirmez
    const isPublicRoute = segments[0] === 'pay' || segments[0] === 'doctor-approval' || segments[0] === 'dev'
      || segments[0] === 'checkin' || segments[0] === 'c' || segments[0] === 'legal';
    if (isPublicRoute) return;

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // ── Profil yüklenmesini bekle ──
    // Session var ama profil henüz null → fetchProfile devam ediyor.
    // Profil gelmeden routing yapma çünkü:
    //   • metadata.user_type ≠ profile.user_type olabilir
    //   • profile.role yok → isTechnician hesaplaması yanlış olur (lab/station ayrımı)
    // Bu yüzden refresh'te teknisyen önce lab paneline atılıp sonra station'a
    // çekiliyordu — flicker. Profil gelene kadar bekle.
    if (!profile) {
      return;
    }

    // Sadece profile'a güven — metadata.user_type fallback'i profile yüklenmeden
    // önce kullanılırsa yanlış panele yönlendirebilir (ör. admin'i 'lab' metadata
    // ile geçici station/lab paneline atar). Profile zaten yukarıda bekleniyor.
    const userType = profile?.user_type;
    const userRole = profile?.role;

    if (!userType) return;

    // Teknisyen → istasyon paneli, kurye → kurye paneli, diğer lab kullanıcıları → lab paneli
    const isTechnician = userType === 'lab' && userRole === 'technician';
    const isCourier    = userType === 'lab' && (userRole as string) === 'courier';

    // Kullanıcı tipine göre doğru panel grubu
    // clinic_secretary ve clinic_admin aynı klinik paneline düşer (rol bazlı yetki UI'da)
    const expectedGroup = userType === 'doctor'           ? '(doctor)'
                        : userType === 'admin'            ? '(admin)'
                        : userType === 'clinic_admin'     ? '(clinic)'
                        : (userType as string) === 'clinic_secretary' ? '(clinic)'
                        : isCourier                       ? '(courier)'
                        : isTechnician                    ? '(station)'
                        : '(lab)';
    const currentGroup  = segments[0];

    // ── Platform konsolu bağlamı (grup URL'de gizli) ──
    // Kullanıcı platform konsolundayken sekme yenilerse expo-router grubu koruyamayıp
    // '/'ya (kök index) düşebiliyor; oradan da user_type'a göre lab paneline atılıyordu.
    // localStorage bayrağı set'liyse ve kullanıcı platform admin ise platformda tut.
    const wantsPlatform = (typeof window !== 'undefined' && (() => { try { return window.localStorage?.getItem('nx_panel') === 'platform'; } catch { return false; } })());
    if (wantsPlatform) {
      if (platformAdmin === null) return;               // yetki netleşene kadar bekle
      if (platformAdmin) { if (currentGroup !== '(platform)') router.replace('/(platform)' as any); return; }
      try { window.localStorage?.removeItem('nx_panel'); } catch {} // bayat bayrak → temizle, normal akış
    }

    // Onaylanmamış hekim / klinik yöneticisi / sekreter — giriş engelle
    const needsApproval = ['doctor', 'clinic_admin', 'clinic_secretary'].includes(userType as string);
    if (needsApproval && profile?.approval_status && profile.approval_status !== 'approved') {
      if (!inAuthGroup) {
        supabase.auth.signOut();
        router.replace('/(auth)/login');
      }
      return;
    }

    // ── Çoklu-lab klinik: giriş sonrası lab seçimi (fail-open; tek-aktifte NO-OP) ──
    // Klinik hep yalnız kendi verisini görür; "aktif lab" UX bölmesidir. Birden çok
    // AKTİF lab bağlantısı olan ve henüz seçim yapmamış kullanıcıyı seçim ekranına al.
    const isClinicUser = userType === 'doctor' || userType === 'clinic_admin' || (userType as string) === 'clinic_secretary';
    if (isClinicUser) {
      const sub = segments[1];
      const onSelect  = inAuthGroup && sub === 'select-lab';
      const onConnect = inAuthGroup && sub === 'connect-lab';
      if (onConnect) return;                                   // 'kod ile bağlan' ekranında kal
      if (alLoaded) {
        // Defansif: memberships beklenmedik şekilde undefined olsa bile kök layout ÇÖKMESİN
        // (fail-open — tek-lab davranışı korunur).
        const activeCount = (alMemberships ?? []).filter((m) => m.status === 'active').length;
        const needsPick = activeCount > 1 && !alActive;        // >1 aktif + seçim yok
        if (needsPick && !onSelect) { router.replace('/(auth)/select-lab' as any); return; }
        if (onSelect && activeCount > 1) return;               // >1 lab varsa seçim/switcher ekranında kal
        // aksi halde aşağı düş → panele yönlendir
      } else if (onSelect) {
        return;                                                // yükleniyor + seçim ekranında → kal (flicker önle)
      }
    }

    // ── Lab/admin kullanıcı — lab_id yoksa ──
    // Mevcut bir lab varsa otomatik ona attach et (2. admin senaryosu).
    // Hiç lab yoksa setup-wizard'a yönlendir (ilk kurulum).
    // Multi-lab tenancy ileride başka bir yöntemle ayrılacak.
    if ((userType === 'lab' || userType === 'admin') && profile && !profile.lab_id) {
      // Platform admin durumu netleşene kadar bekle → erken setup-wizard'ı önle
      if (platformAdmin === null) return;
      // Saf platform operatörü (lab'ı yok, platform_admins'te) → doğrudan konsol
      if (platformAdmin) {
        if (currentGroup !== '(platform)') router.replace('/(platform)' as any);
        return;
      }
      (async () => {
        const { data: labs } = await supabase.from('labs').select('id').limit(1);
        if (labs && labs.length > 0) {
          await supabase.from('profiles').update({ lab_id: labs[0].id }).eq('id', profile.id);
          // Profile refresh — bir sonraki effect döngüsünde lab_id dolu olarak gelir
          fetchProfile(profile.id);
        } else {
          if (!(inAuthGroup && segments[1] === 'setup-wizard')) {
            router.replace('/(auth)/setup-wizard' as any);
          }
        }
      })();
      return;
    }

    // ── Labı var ama ilk kurulum sihirbazı hiç tamamlanmamış ──
    // Konsoldan açılan lablar lab_id ile doğar, o yüzden yukarıdaki "lab_id yok"
    // kapısına hiç düşmezler. Yalnız labın SAHİBİ/yöneticisi sihirbaza alınır —
    // teknisyen ya da sonradan eklenen personel yarım kurulum yüzünden takılmasın.
    // platformAdmin === null iken BEKLE: `!null` true'dur, saf platform
    // operatörünü yanlışlıkla sihirbaza atardı.
    if (profile?.lab_id && labSetupDone === false && platformAdmin === false) {
      const isOwner = userType === 'admin' || (profile as any)?.role === 'manager';
      if (isOwner && !(inAuthGroup && segments[1] === 'setup-wizard')) {
        router.replace('/(auth)/setup-wizard' as any);
        return;
      }
    }

    if (inAuthGroup) {
      // Kayıt sonrası doğrulama/onay bekleme ekranlarında kalmasına izin ver
      const isPostRegistration = segments[1] === 'verify-phone' || segments[1] === 'verify-email' || segments[1] === 'approval-waiting';
      if (isPostRegistration) return;

      // Onboarding wizard'da ise kalmasına izin ver
      if (segments[1] === 'setup-wizard') return;

      // Auth sayfasındayken oturum açıldıysa doğru panele gönder
      if (userType === 'doctor')                  router.replace('/(doctor)');
      else if (userType === 'admin')              router.replace('/(admin)');
      else if (userType === 'clinic_admin')       router.replace('/(clinic)' as any);
      else if ((userType as string) === 'clinic_secretary')   router.replace('/(clinic)' as any);
      else if (isTechnician)                      router.replace('/(station)' as any);
      else                                        router.replace('/(lab)');
    } else {
      // Kök index (segments boş) — app/index.tsx tarayıcı yolunu okuyup doğru panele
      // yönlendiriyor; buradan ikinci bir replace atmak onu ezer.
      if (!currentGroup) return;

      if (currentGroup !== expectedGroup) {
        // Platform (super-admin) paneli — grup içinde kalmasına izin ver;
        // asıl yetki kontrolü (platform)/_layout'ta is_platform_admin() ile yapılır.
        if (currentGroup === '(platform)') return;
        // Admin kullanıcılar lab panelini de görüntüleyebilir (çoklu sekme desteği)
        if (userType === 'admin' && currentGroup === '(lab)') return;
        // Teknisyenler istasyon panelinde kalabilir
        if (isTechnician && currentGroup === '(station)') return;

        // Yanlış panel grubunda — doğru panelin AYNI subpath'ine gönder
        // (sayfa refresh edildiğinde dashboard'a değil, bulunduğu sayfaya dönmeli)
        // Subpath kaynak panelde olup hedefte olmayan durumlar nadirdir; expo-router
        // bu tür durumda fallback yapar. Dashboard'a düşürmektense doğru subpath'i
        // denemek her zaman daha iyi UX.
        const subPath = segments[1];
        // Auth-only veya panel-spesifik subroute'lar (başka panellerde olmayan)
        // burada base'e düşmeli. Liste konservatif tutuldu — diğer her şey korunur.
        const PANEL_ONLY_ROUTES = new Set([
          'station-orders',  // sadece (station)
          'courier-tracking','courier', // sadece lab/admin
          'permissions',     // sadece admin
          'logs',            // sadece admin
        ]);

        const base     = userType === 'doctor'           ? '/(doctor)'
                       : userType === 'admin'            ? '/(admin)'
                       : userType === 'clinic_admin'     ? '/(clinic)'
                       : (userType as string) === 'clinic_secretary' ? '/(clinic)'
                       : isCourier                       ? '/(courier)'
                       : isTechnician                    ? '/(station)'
                       : '/(lab)';

        if (subPath && !PANEL_ONLY_ROUTES.has(subPath)) {
          // Subpath + nested segment'ler + query string korunsun
          // (örn. /settings?tab=general → /(lab)/settings?tab=general)
          const rest = segments.slice(2).filter(Boolean).join('/');
          const pathPart = rest ? `${base}/${subPath}/${rest}` : `${base}/${subPath}`;
          const query = (typeof window !== 'undefined' && window.location?.search) ? window.location.search : '';
          router.replace(`${pathPart}${query}` as any);
        } else {
          router.replace(base as any);
        }
      }
    }
  }, [session, profile, loading, platformAdmin, labSetupDone, alLoaded, alActive, alMemberships]);

  // Splash'ı kapat — HANGİ ROTADA olursak olalım. `app/index.tsx` yalnız '/'
  // adresinde mount olduğu için derin bağlantıda (ör. /orders) sinyal hiç
  // gelmiyor ve splash 12 sn boyunca ekranda kalıyordu.
  useEffect(() => {
    if (loading) return;               // auth bootstrap bitmeden kapatma
    bootMark('splash kapatılıyor (rotadan bağımsız)');
    signalAppReady();
  }, [loading]);

  // On native, wait for fonts before rendering
  if (!fontsLoaded && Platform.OS !== 'web') {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
  }

  // Bakım modu — giriş yapmış, platform-admin OLMAYAN kullanıcıları engelle.
  // Auth ekranları (session yok) etkilenmez → platform admin giriş yapıp kapatabilir.
  if (maintenance?.on && session && platformAdmin === false) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#0E0E0E', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🛠️</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>Bakım çalışması</Text>
          <Text style={{ color: '#9A9A9A', fontSize: 15, textAlign: 'center', maxWidth: 420, lineHeight: 22 }}>{maintenance.msg || 'Kısa süre sonra döneceğiz.'}</Text>
          <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 28, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
            <Text style={{ color: '#EAEAEA', fontSize: 14, fontWeight: '600' }}>Çıkış yap</Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
    <RootErrorBoundary key={`${_i18nLang.language}:${isDictReady(_i18nLang.language) ? 'r' : 'w'}`}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          // iOS 26.4 beta + react-native-screens 4.23 + UIKit keyboard subsystem
          // çakışması: stack transition sırasında login screen kaldırılırken
          // resignFirstResponder zinciri tetikleniyor ve
          // UISystemKeyboardDockControllerAccessibility globe-key hesaplaması
          // crash ediyor. 'none' = instant swap, transition yok, keyboard
          // subsystem update tetiklenmiyor.
          animation: Platform.OS === 'ios' ? 'none' : 'default',
          gestureEnabled: false,
        }}
      />
      <ToastContainer />
      <GlobalSupportTrigger />
      <DentyFAB />
      <ConsentGuard />
      <BootTracePanel />
    </RootErrorBoundary>
    </SafeAreaProvider>
  );
}
