// Oturum önbellekli klinik özeti: tüm ekranlar (liste şeridi, popup, widget)
// tek isteği paylaşır. 5 dk taze; aynı anda çağıranlar aynı promise'i bekler.
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { fetchClinicSummaryData } from './api';
import type { ClinicSummary } from './summary';

type Status = 'loading' | 'ready' | 'error';
const FRESH_MS = 5 * 60 * 1000;
const EMPTY = new Map<string, ClinicSummary>();

let cache: { labId: string; at: number; map: Map<string, ClinicSummary> } | null = null;
let inflight: { labId: string; promise: Promise<Map<string, ClinicSummary>> } | null = null;
const listeners = new Set<() => void>();

function load(labId: string, force = false): Promise<Map<string, ClinicSummary>> {
  if (!force && cache && cache.labId === labId && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.map);
  if (!force && inflight && inflight.labId === labId) return inflight.promise;
  const promise = fetchClinicSummaryData(labId)
    .then((map) => {
      cache = { labId, at: Date.now(), map };
      listeners.forEach((l) => l());
      return map;
    })
    .finally(() => { if (inflight?.promise === promise) inflight = null; });
  inflight = { labId, promise };
  return promise;
}

export function useClinicSummaries(): { status: Status; map: Map<string, ClinicSummary>; reload(): void } {
  const labId = useAuthStore((s) => (s.profile as any)?.lab_id) as string | undefined;
  const initial = cache && labId && cache.labId === labId ? cache.map : null;
  const [map, setMap] = useState<Map<string, ClinicSummary> | null>(initial);
  const [status, setStatus] = useState<Status>(initial ? 'ready' : 'loading');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = () => { if (cache && cache.labId === labId) { setMap(cache.map); setStatus('ready'); } };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [labId]);

  useEffect(() => {
    if (!labId) return;
    let alive = true;
    load(labId, tick > 0)
      .then((m) => { if (alive) { setMap(m); setStatus('ready'); } })
      .catch(() => { if (alive && !map) setStatus('error'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { status, map: map ?? EMPTY, reload };
}

export function useClinicSummary(clinicId: string | null | undefined): { status: Status; summary: ClinicSummary | null } {
  const { status, map } = useClinicSummaries();
  return { status, summary: clinicId ? map.get(clinicId) ?? null : null };
}
