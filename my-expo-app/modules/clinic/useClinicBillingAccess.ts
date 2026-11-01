// modules/clinic/useClinicBillingAccess.ts — klinik/hekim panelinde finans yüzeyleri (Finans menüsü,
// bakiye kartı) için erişim. Karar veritabanında: my_clinic_billing_access() — RLS kuralıyla aynı
// yardımcı (klinik yöneticisi; billing_view'li sekreter; kliniğinde faturayı görebilen kimse yoksa hekim).
// İstemcide yeniden hesaplanmaz (bkz. feedback_permission_alias_expansion). null = henüz bilinmiyor.
import { useEffect, useState } from 'react';
import { supabase } from '../../core/api/supabase';
import { useAuthStore } from '../../core/store/authStore';

let cache: { uid: string; value: boolean } | null = null;

export function useClinicBillingAccess(): boolean | null {
  const uid = useAuthStore((s) => s.session?.user?.id ?? null);
  const [value, setValue] = useState<boolean | null>(() => (cache && cache.uid === uid ? cache.value : null));

  useEffect(() => {
    if (!uid) { setValue(null); return; }
    let alive = true;
    supabase.rpc('my_clinic_billing_access').then(({ data, error }) => {
      const v = !error && data === true;
      cache = { uid, value: v };
      if (alive) setValue(v);
    });
    return () => { alive = false; };
  }, [uid]);

  return value;
}
