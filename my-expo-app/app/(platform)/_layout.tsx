import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { amIPlatformAdmin } from '../../modules/platform/api';
import { PlatformSidebar, C } from '../../modules/platform/ui';
import { supabase } from '../../core/api/supabase';

// Platform (super-admin) paneli — yalnız is_platform_admin() true olan
// hesaplar girebilir. Ana _layout route guard'ı (platform) grubunu geçirir;
// asıl yetki kontrolü burada.
export default function PlatformLayout() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Hard refresh'te Supabase session storage'dan ASENKRON restore olur.
      // is_platform_admin RPC'sini session hazır olmadan çağırırsak false döner
      // ve kullanıcı sepetsizce lab paneline atılır. Önce session'ı bekle.
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session) return; // oturum yok → root _layout /(auth)/login'e yönlendirir
      const allowed = await amIPlatformAdmin();
      if (!alive) return;
      setOk(allowed);
      if (!allowed) router.replace('/' as any); // gerçekten yetkisiz → kök yönlendirme
    })();
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
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
      </View>
    </View>
  );
}
