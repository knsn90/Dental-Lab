// modules/courier/useExternalCourier.ts
//
// Dış sağlayıcı (BanaBiKurye) kuryesinin canlı konumu.
//
// Kendi kuryemiz konumunu mobil uygulamadan gps_pings'e yazar. Dış sağlayıcının
// kuryesi bizim uygulamayı kullanmadığı için konum yalnız sağlayıcı API'sinden gelir:
//   banabikurye-dispatch { action: 'track' } → { courier: { name, phone, photo_url, latitude, longitude } }
//
// Devam eden gönderide ekran açıkken periyodik çekilir. Teslim edilen/iptal
// gönderilerde koordinat null döner ama kurye KİMLİĞİ (ad/telefon/avatar) döner;
// o yüzden bitmiş işte de TEK SEFER çekilir. Konum DB'ye yazılmaz (bayat olur),
// ama kimliği dispatch(track) deliveries satırına kalıcılaştırır — böylece geçmiş
// gönderilerde liste + detay API'siz gösterebilir.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../core/api/supabase';

export interface ExternalCourier {
  /** Konum yalnız gönderi devam ederken gelir; tamamlanınca sağlayıcı null döner. */
  lat?: number | null;
  lng?: number | null;
  name?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
}

/** Konumun anlamlı olduğu teslimat durumları — bitmiş işte sorgu atma. */
const LIVE_STATUSES = ['atandi', 'teslim_alindi', 'yolda', 'beklemede'];

const POLL_MS = 25_000;

export function useExternalCourier(delivery: {
  id?: string | null;
  mode?: string | null;
  status?: string | null;
  external_provider?: string | null;
  external_tracking_no?: string | null;
} | null | undefined) {
  const [courier, setCourier] = useState<ExternalCourier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<any>(null);

  const isExternal = delivery?.mode === 'external'
    && /banabikurye/i.test(String(delivery?.external_provider ?? ''));
  const trackingNo = delivery?.external_tracking_no ?? null;
  const isLive = LIVE_STATUSES.includes(String(delivery?.status ?? ''));
  // Devam eden gönderide periyodik konum; teslim/iptal gönderide TEK SEFERLİK
  // çekim — kurye adı/avatarı gelsin (konum null döner ama kimlik döner) ve
  // dispatch bunu deliveries satırına kalıcılaştırsın (geriye dönük doldurma).
  const active = !!(isExternal && trackingNo);

  useEffect(() => {
    if (!active) { setCourier(null); setError(null); return; }

    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('banabikurye-dispatch', {
          body: { action: 'track', order_id: trackingNo },
        });
        if (cancelled) return;
        if (fnErr) { setError(fnErr.message); return; }
        if ((data as any)?.ok === false) { setError((data as any)?.message ?? 'takip başarısız'); return; }

        const c = (data as any)?.courier;
        if (!c) { setCourier(null); setError(null); return; }

        // Konum ve kimlik AYRI: gönderi tamamlanınca sağlayıcı lat/lng'i null
        // döndürür ama kurye adı/telefonu gelmeye devam eder — o bilgiyi atma.
        const lat = c.latitude  != null ? Number(c.latitude)  : NaN;
        const lng = c.longitude != null ? Number(c.longitude) : NaN;
        const hasPos = Number.isFinite(lat) && Number.isFinite(lng);

        setCourier({
          lat: hasPos ? lat : null,
          lng: hasPos ? lng : null,
          name: [c.name, c.surname].filter(Boolean).join(' ') || null,
          phone: c.phone ?? null,
          photoUrl: c.photo_url ?? null,
        });
        setError(null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'takip hatası');
      }
    };

    fetchOnce();
    // Yalnız devam eden gönderide periyodik çek; bitmiş işte tek çekim yeter.
    if (isLive) timerRef.current = setInterval(fetchOnce, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, trackingNo, isLive]);

  return { courier, error };
}
