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
    // Hard refresh'te Supabase session storage'dan ASENKRON restore olur ve
    // depolanmış access token'ın süresi geçmiş olabilir. is_platform_admin RPC'sini
    // token yenilenmeden çağırırsak 401 → false döner ve kullanıcı yanlışlıkla lab
    // paneline atılır. Bu yüzden: session'ı bekle → getUser() ile token'ı doğrula/yenile
    // → sonra RPC. Negatif sonucu da birkaç kez retry ederek yarış durumunu emeriz;
    // yalnız GERÇEKTEN yetkisizsek kök'e yönlendiririz.
    const decide = async (tries: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session) {
        if (tries < 4) { setTimeout(() => alive && decide(tries + 1), 300); return; }
        return; // oturum yok → root _layout /(auth)/login'e yönlendirir
      }
      const { data: { user } } = await supabase.auth.getUser(); // token doğrula/yenile
      if (!alive) return;
      if (!user) {
        if (tries < 4) { setTimeout(() => alive && decide(tries + 1), 300); return; }
        return;
      }
      const allowed = await amIPlatformAdmin();
      if (!alive) return;
      if (allowed) { setOk(true); return; }
      if (tries < 3) { setTimeout(() => alive && decide(tries + 1), 400); return; }
      setOk(false); router.replace('/' as any); // kesin yetkisiz
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
