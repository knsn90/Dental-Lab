import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { supabase } from '../core/api/supabase';

// Web: HTML splash'ı kapatmak için bir kere ready sinyali gönder.
// İlk açılışta HTML splash (logo + bar) görünür, React tarafı bu fonksiyon
// çağrılana kadar boş kalır → tek loader deneyimi.
function signalAppReady() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if ((window as any).__nxReady) return;
  (window as any).__nxReady = true;
  try { window.dispatchEvent(new Event('nx:ready')); } catch {}
}

export default function Index() {
  const { session, profile, loading, fetchProfile } = useAuthStore();
  const [stuck, setStuck] = useState<'retrying' | 'failed' | null>(null);
  const retried = useRef(false);

  // Profile fetch timeout'a düştüyse 1× retry, sonra hâlâ yoksa login'e at.
  // Aksi takdirde kullanıcı "Yükleniyor..." ekranında sonsuza kadar takılıyordu.
  useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (profile) return;
    if (retried.current) {
      // İkinci denemede de profil gelmediyse oturumu kapat, login'e gönder
      setStuck('failed');
      const t = setTimeout(() => {
        supabase.auth.signOut().catch(() => {});
      }, 200);
      return () => clearTimeout(t);
    }
    retried.current = true;
    setStuck('retrying');
    fetchProfile(session.user.id);
  }, [loading, session, profile, fetchProfile]);

  // Hâlâ auth bootstrap yapılıyor → splash görünür, React boş döner (tek loader)
  if (loading) return null;

  if (!session) {
    signalAppReady();
    return <Redirect href="/(auth)/login" />;
  }

  if (!profile) {
    if (stuck === 'failed') {
      signalAppReady();
      return <Redirect href="/(auth)/login" />;
    }
    // Profile fetch sürüyor — splash görünür, React boş
    return null;
  }

  // Profile geldi → splash'ı kapat, panel'e yönlendir
  signalAppReady();

  // Platform konsolu bağlamı korunsun. (platform) bir route grubu olduğundan
  // URL'de gizli (Genel Bakış = "/") → refresh'te bu index'e düşülüp kullanıcı
  // lab paneline atılıyordu. Bayrak set'liyse platforma geri dön (yetki kontrolü
  // (platform)/_layout'ta; yetkisizse orası bayrağı temizleyip '/'ya atar → döngü yok).
  const lastPanel = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem('nx_panel') : null;
  if (lastPanel === 'platform') {
    const wp = (typeof window !== 'undefined' && window.location?.pathname) ? window.location.pathname : '/';
    const wq = (typeof window !== 'undefined' && window.location?.search) ? window.location.search : '';
    const sub = wp && wp !== '/' && !wp.startsWith('/(') && !wp.startsWith('/index');
    return <Redirect href={(sub ? `/(platform)${wp}${wq}` : '/(platform)') as any} />;
  }

  const userType = profile.user_type;
  const userRole = profile.role;

  const base =
    userType === 'admin'        ? '/(admin)'
    : userType === 'clinic_admin' ? '/(clinic)'
    : (userType as string) === 'clinic_secretary' ? '/(clinic)'
    : userType === 'doctor'       ? '/(doctor)'
    : (userType === 'lab' && (userRole as string) === 'courier') ? '/(courier)'
    : (userType === 'lab' && userRole === 'technician')          ? '/(station)'
    : '/(lab)';

  // Deep-link refresh: birden çok grupta paylaşılan rotalar (/finance, /settings…)
  // refresh'te belirsiz çözülüp buraya (index) düşebiliyor. Tarayıcıdaki gerçek
  // yol + query'yi koru ki kullanıcı dashboard'a değil bulunduğu sayfaya dönsün.
  const webPath  = (typeof window !== 'undefined' && window.location?.pathname) ? window.location.pathname : '/';
  const webQuery = (typeof window !== 'undefined' && window.location?.search) ? window.location.search : '';
  const isRealSub = webPath && webPath !== '/' && !webPath.startsWith('/(') && !webPath.startsWith('/index');
  const target = isRealSub ? `${base}${webPath}${webQuery}` : base;

  return <Redirect href={target as any} />;
}
