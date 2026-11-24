// ClinicLogoAvatar — liste satırlarında klinik avatarı: logo varsa logo (beyaz zemin,
// kesilmeden sığdırılır), yoksa varsayılan diş ikonu. useClinicLogos tek sorguda
// listedeki kliniklerin logo_url'lerini çeker. Karlılık + Hesap Ekstreleri ortak.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { supabase } from '../../../core/api/supabase';
import { LogoImage, DefaultLogo } from '../../../core/ui/LogoImage';
import { useInkUI } from '../../../core/theme/inkScale';

export function useClinicLogos(clinicIds: (string | null | undefined)[]): Record<string, string> {
  const ids = Array.from(new Set(clinicIds.filter((x): x is string => !!x))).sort();
  const key = ids.join(',');
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    supabase.from('clinics').select('id, logo_url').in('id', ids).then(({ data }) => {
      if (!alive) return;
      const m: Record<string, string> = {};
      (data ?? []).forEach((c: any) => { if (c.logo_url) m[c.id] = c.logo_url; });
      setLogos(m);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return logos;
}

export function ClinicLogoAvatar({ uri, tone, size = 32, radius = 10 }: {
  uri?: string | null;
  /** Logo yokken zemin/ikon rengi; verilmezse nötr. */
  tone?: { bg: string; fg: string };
  size?: number;
  radius?: number;
}) {
  const U = useInkUI();
  const t = tone ?? { bg: U.chipNeutral, fg: U.ink[500] };
  const inner = Math.round(size * 0.8);
  return (
    <View style={{
      width: size, height: size, borderRadius: radius, overflow: 'hidden',
      backgroundColor: uri ? '#FFFFFF' : t.bg,
      borderWidth: uri ? 1 : 0, borderColor: U.ink[100],
      alignItems: 'center', justifyContent: 'center',
    }}>
      {uri ? (
        <LogoImage uri={uri} style={{ width: size, height: size }} fitStyle={{ width: inner, height: inner }} />
      ) : (
        <DefaultLogo size={Math.round(size / 2)} color={t.fg} />
      )}
    </View>
  );
}
