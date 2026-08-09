import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { subscribeShared } from '../../../core/api/sharedChannel';
import { useAuthStore } from '../../../core/store/authStore';
import { useAppResume } from '../../../core/hooks/useAppResume';
import { WorkOrder } from '../types';
import { fetchWorkOrdersForDoctor, fetchAllWorkOrders } from '../api';
import { bootMark } from '../../../core/debug/bootTrace';

const LS_PREFIX = 'orders_cache_v1';
function cacheKey(userType: string, doctorId?: string, includeArchived?: boolean): string {
  return `${LS_PREFIX}:${userType}:${doctorId ?? 'all'}:${includeArchived ? 'arc' : 'live'}`;
}
function loadCached(key: string): WorkOrder[] | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveCached(key: string, rows: WorkOrder[]) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(rows)); } catch { /* quota */ }
}

/** Uçuşan istekler — aynı anahtar için ikinci çağrı yeni sorgu AÇMAZ, devam
 *  edeni bekler. Ölçümde tek açılışta 3 ms arayla iki ayrı sorgu gidiyor ve
 *  aynı 21 satır iki kez dönüyordu (StrictMode çift effect + ikinci mount). */
const inFlight = new Map<string, Promise<{ data: WorkOrder[] | null; error: any }>>();

function fetchOrders(
  ckey: string,
  userType: 'doctor' | 'lab',
  doctorId: string | undefined,
  includeArchived: boolean,
): Promise<{ data: WorkOrder[] | null; error: any }> {
  const running = inFlight.get(ckey);
  if (running) return running;
  const p = (async () => {
    const r = userType === 'doctor' && doctorId
      ? await fetchWorkOrdersForDoctor(doctorId)
      : await fetchAllWorkOrders({ includeArchived });
    return { data: (r.data as WorkOrder[]) ?? null, error: r.error };
  })().finally(() => { inFlight.delete(ckey); });
  inFlight.set(ckey, p);
  return p;
}

export function useOrders(userType: 'doctor' | 'lab', doctorId?: string, opts?: { includeArchived?: boolean }) {
  const includeArchived = !!opts?.includeArchived;
  const ckey = cacheKey(userType, doctorId, includeArchived);
  // OTURUMU BEKLE. Panel kabuğu optimistik yönlendirmeyle oturum hazır olmadan
  // monte oluyor; bu hook o anda sorgu atınca Supabase 401 döner ve liste boş
  // kalır (ölçüldü: tek açılışta 26 adet 401). Cache varsa kullanıcı yine anında
  // eski veriyi görür — yalnız AĞ isteği ertelenir.
  const userId = useAuthStore((st) => st.session?.user?.id ?? null);

  const [orders, setOrders] = useState<WorkOrder[]>(() => loadCached(ckey) ?? []);
  const [loading, setLoading] = useState(() => loadCached(ckey) === null);
  const [error, setError] = useState<string | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!userId) return;                       // oturum yok → istek yok
    bootMark(`useOrders.load(silent=${silent})`, { key: ckey });
    if (!silent) setLoading(true);
    setError(null);
    const result = await fetchOrders(ckey, userType, doctorId, includeArchived);

    if (result.error) {
      setError(result.error.message);
    } else {
      const rows = result.data ?? [];
      bootMark('useOrders → satır geldi', { adet: rows.length });
      setOrders(rows);
      saveCached(ckey, rows);
    }
    if (!silent) setLoading(false);
  }, [userType, doctorId, includeArchived, ckey, userId]);

  // Realtime burst'lerini debounce et — birden fazla stage update'i tek refetch'e düşer.
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => { load(true); }, 400);
  }, [load]);

  useEffect(() => {
    if (!userId) return;                       // oturum yok → abonelik de yok
    // Cache varsa silent yükle — spinner gösterme, eski veriyi gör ve arka planda
    // yenile. Cache yoksa normal loading akışı.
    load(loadCached(ckey) !== null);

    // Kanal PAYLAŞILIR. Eskiden her mount sabit adlı (`work_orders_realtime`)
    // yeni bir kanal açıyordu; aynı ekranın ikinci instance'ı veya StrictMode
    // çift abonelik üretiyordu — bu, daha önce yaşanan realtime sızıntısının
    // aynısı. subscribeShared ref sayar, son dinleyici gidince kapatır.
    const unsubscribe = subscribeShared(
      `work_orders_realtime:${userId}`,
      [
        { event: '*', schema: 'public', table: 'work_orders' },
        { event: '*', schema: 'public', table: 'order_stages' },
      ],
      (payload: any) => {
        if (payload?.table === 'work_orders' && payload?.eventType === 'DELETE') {
          setOrders((prev) => {
            const next = prev.filter((o) => o.id !== payload.old?.id);
            saveCached(ckey, next);
            return next;
          });
          return;
        }
        // INSERT/UPDATE → silent debounced refetch (join'leri yenile, spinner gösterme)
        scheduleRefetch();
      },
    );

    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      unsubscribe();
    };
  }, [load, scheduleRefetch, userId, ckey]);

  // Ön plana dönünce sessiz tazele — askıdayken kaçan realtime olaylarını telafi eder.
  useAppResume(() => { load(true); });

  return { orders, loading, error, refetch: load };
}
