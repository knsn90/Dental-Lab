import { useEffect, useRef } from 'react';
import { supabase } from '../api/supabase';
import { useAppResume } from './useAppResume';

/**
 * Verilen tablolardaki her postgres_changes olayında `onChange`'i debounce'lu çağırır.
 *
 * Dashboard/özet gibi kendi RPC yükleyicilerini kullanan (realtime'lı bir liste hook'una
 * bağlı OLMAYAN) ekranları canlı tutmak için: değişiklik olayında mevcut reload'ları tetikle.
 *
 * NOT: İlgili tabloların realtime publication'da açık olması gerekir
 * (bkz. supabase/migrations/20260730120000_realtime_publication_full.sql).
 *
 * @param channelName Benzersiz kanal adı (ekran başına sabit)
 * @param tables      Dinlenecek public tablolar
 * @param onChange    Değişiklikte çağrılacak reload (son referansı kullanılır)
 */
export function useRealtimeRefresh(
  channelName: string,
  tables: string[],
  onChange: () => void,
  opts?: { debounceMs?: number; enabled?: boolean },
) {
  const debounceMs = opts?.debounceMs ?? 500;
  const enabled = opts?.enabled ?? true;
  const cbRef = useRef(onChange);
  cbRef.current = onChange; // her render'da en güncel reload'u tut — effect yeniden kurulmaz
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // tables referansı her render'da yeni olabilir; içerikten stabil anahtar üret
  const tablesKey = tables.join(',');

  // Ön plana dönünce de tazele — askıdayken kaçan realtime olaylarını telafi eder.
  useAppResume(() => { if (enabled) cbRef.current(); }, { enabled });

  useEffect(() => {
    if (!enabled) return;

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { cbRef.current(); }, debounceMs);
    };

    let ch = supabase.channel(channelName);
    tablesKey.split(',').filter(Boolean).forEach((tbl) => {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: tbl }, schedule);
    });
    ch.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
    };
  }, [channelName, tablesKey, debounceMs, enabled]);
}
