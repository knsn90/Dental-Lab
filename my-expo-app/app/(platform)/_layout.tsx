import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { amIPlatformAdmin } from '../../modules/platform/api';
import { PlatformSidebar, PlatformTopBar, C } from '../../modules/platform/ui';
import { supabase } from '../../core/api/supabase';

// Platform (super-admin) paneli — yalnız is_platform_admin() true olan
// hesaplar girebilir. Ana _layout route guard'ı (platform) grubunu geçirir;
// asıl yetki kontrolü burada.
export default function PlatformLayout() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    // Hard refresh'te Supabase session storage'dan ASENKRON restore olur ve depolanmış
    // access token'ın süresi geçmiş olabilir → is_platform_admin RPC'si ilk çağrıda 401→
    // false dönebilir. supabase-js RPC'den ÖNCE token'ı otomatik yeniler; yine de yarışı
    // emmek için negatif sonucu birkaç kez retry ederiz. ÖNEMLİ: her dal ya setOk yapar ya
    // da yönlendirir — hiçbir dal `ok`'u null bırakıp dönmez (yoksa loader sonsuza takılır).
    const setFlag = (v: boolean) => { try { if (typeof window !== 'undefined') v ? window.localStorage?.setItem('nx_panel', 'platform') : window.localStorage?.removeItem('nx_panel'); } catch {} };
    const decide = async (tries: number) => {
      let session = null;
      try { session = (await supabase.auth.getSession()).data.session; } catch {}
      if (!alive) return;
      if (!session) {
        if (tries < 6) { setTimeout(() => alive && decide(tries + 1), 250); return; }
        setFlag(false); setOk(false); router.replace('/' as any); return; // oturum yok → root login'e atar
      }
      let allowed = false;
      try { allowed = await amIPlatformAdmin(); } catch { allowed = false; }
      if (!alive) return;
      if (allowed) { setFlag(true); setOk(true); return; }
      if (tries < 4) { setTimeout(() => alive && decide(tries + 1), 350); return; }
      setFlag(false); setOk(false); router.replace('/' as any); // kesin yetkisiz
    };
    decide(0);
    return () => { alive = false; };
  }, []);

  if (ok !== true) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <PlatformSidebar />
      <View style={{ flex: 1, minWidth: 0 }}>
        <PlatformTopBar />
        <View style={{ flex: 1, minWidth: 0, zIndex: 0 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
        </View>
      </View>
    </View>
  );
}
