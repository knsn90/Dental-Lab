/**
 * useLabToday — lab'ın saat diliminde bugün (YYYY-MM-DD).
 *
 * Saat dilimi `lab_tz()` RPC'sinden bir kez okunur ve modül önbelleğinde tutulur
 * (labs.timezone; boşsa Europe/Istanbul). Okunamazsa varsayılan kullanılır,
 * ekran beklemez. Tanım: core/metrics/orderDefs.ts `labTodayOf`.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { labTodayOf } from './orderDefs';

let cachedTz: string | null = null;
let inFlight: Promise<string | null> | null = null;

/** Önbellekteki saat dilimi (henüz okunmadıysa null → varsayılan). Hook dışı
 *  yardımcılar (`isOrderOverdue` gibi) bunu kullanır. */
export function cachedLabTz(): string | null {
  return cachedTz;
}

export function loadLabTz(): Promise<string | null> {
  if (cachedTz) return Promise.resolve(cachedTz);
  if (!inFlight) {
    inFlight = (async () => {
      const { data, error } = await supabase.rpc('lab_tz');
      if (!error && typeof data === 'string' && data) cachedTz = data;
      inFlight = null;
      return cachedTz;
    })();
  }
  return inFlight;
}

export function useLabToday(): string {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const [tz, setTz] = useState<string | null>(cachedTz);
  useEffect(() => {
    if (!userId || cachedTz) return;
    let alive = true;
    loadLabTz().then((v) => { if (alive && v) setTz(v); });
    return () => { alive = false; };
  }, [userId]);
  return labTodayOf(tz);
}
