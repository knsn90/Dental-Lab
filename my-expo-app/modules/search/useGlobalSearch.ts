// modules/search/useGlobalSearch.ts — yazma durunca (250 ms) tek istek; eski yanıt yenisini ezmez.
// Arama metni hiçbir yere kaydedilmez (KVKK: hasta adları).
import { useEffect, useRef, useState } from 'react';
import { getActiveLabId } from '../../core/store/activeLabStore';
import { globalSearch } from './api';
import { DEBOUNCE_MS, latestOnly, shouldSearch, STALE } from './lib/searchModel';
import { EMPTY_RESULT, type GlobalSearchResult, type SearchKind, type SearchPanel } from './types';

/** forQ: sonucun ait olduğu sorgu — isFresh ile ekrandaki sorguyla karşılaştırılır. */
interface State { result: GlobalSearchResult; loading: boolean; error: string | null; forQ: string | null }
const IDLE: State = { result: EMPTY_RESULT, loading: false, error: null, forQ: null };

export function useGlobalSearch(q: string, panel: SearchPanel | undefined, kinds: SearchKind[]): State {
  const [state, setState] = useState<State>(IDLE);
  const guard = useRef(latestOnly<GlobalSearchResult>());
  const kindsKey = kinds.join(',');

  useEffect(() => {
    const term = (q ?? '').trim();
    // Yeni sorgu: uçuştaki eski isteği geçersiz kıl
    void guard.current(Promise.resolve(EMPTY_RESULT));
    if (!panel || !kinds.length || !shouldSearch(term)) { setState(IDLE); return; }
    setState((s) => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {
      const labId = panel === 'clinic' || panel === 'doctor' ? getActiveLabId() : null;
      guard.current(globalSearch(term, kinds, { labId, includeArchived: panel === 'admin' }))
        .then((r) => { if (r !== STALE) setState({ result: r, loading: false, error: null, forQ: term }); })
        .catch((e: any) => setState({ result: EMPTY_RESULT, loading: false, error: String(e?.message ?? e), forQ: term }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, panel, kindsKey]);

  return state;
}
