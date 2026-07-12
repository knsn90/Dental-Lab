import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { amIPlatformAdmin } from '../../modules/platform/api';

// Platform (super-admin) paneli — yalnız is_platform_admin() true olan
// hesaplar girebilir. Ana _layout route guard'ı (platform) grubunu geçirir;
// asıl yetki kontrolü burada.
export default function PlatformLayout() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    amIPlatformAdmin().then((allowed) => {
      if (!alive) return;
      setOk(allowed);
      if (!allowed) router.replace('/' as any); // yetkisiz → kök yönlendirme
    });
    return () => { alive = false; };
  }, []);

  if (ok !== true) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1220' }}>
        <ActivityIndicator color="#9AB4E8" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0B1220' } }} />;
}
