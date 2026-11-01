// Kayıt formu bir lab'ın kendi alan adından (ör. www.nexadent.net) açıldıysa o
// lab'ın adını ve açık katılım kodunu getirir → form davet kodu sormaz. Kayıt
// yine lab onayına düşer (kod public_join türünde). Native'de ve siman.app'te
// sunucuya sorulmaz: durum doğrudan 'none'.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { signupHostFor } from '../lib/signupHost';

export type HostSignupLab =
  | { status: 'loading'; labName: null; code: null }
  | { status: 'none'; labName: null; code: null }
  | { status: 'found'; labName: string; code: string };

const NONE: HostSignupLab = { status: 'none', labName: null, code: null };
const LOADING: HostSignupLab = { status: 'loading', labName: null, code: null };

function currentHost(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return signupHostFor(window.location.hostname, window.location.search, __DEV__);
}

export function useHostSignupLab(): HostSignupLab {
  const [host] = useState(currentHost);
  const [state, setState] = useState<HostSignupLab>(host ? LOADING : NONE);

  useEffect(() => {
    if (!host) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc('public_signup_lab_for_host', { p_host: host });
      if (!alive) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row?.code) {
        if (error) console.warn('[signup-host]', error.message);
        setState(NONE);   // kod alanı görünür → kullanıcı yine elle girebilir
        return;
      }
      setState({ status: 'found', labName: String(row.lab_name ?? ''), code: String(row.code) });
    })();
    return () => { alive = false; };
  }, [host]);

  return state;
}
