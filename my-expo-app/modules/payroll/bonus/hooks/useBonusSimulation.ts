/**
 * useBonusSimulation — debounced dry-run calculation hook.
 *
 * Triggers `calculate_bonus_run(... p_dry_run=true)` whenever (policyId, year, month)
 * change, or `bump()` is called. Used in the editor side panel so any saved edit
 * to thresholds/difficulty/quality re-runs the simulation.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { calculateBonusRun, type CalcResult } from '../api';

const DEBOUNCE_MS = 400;

export function useBonusSimulation(
  policyId: string | null,
  year: number,
  month: number,
) {
  const [result, setResult] = useState<CalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumpCounter, setBumpCounter] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    if (!policyId) return;
    setLoading(true);
    setError(null);
    calculateBonusRun(policyId, year, month, true)
      .then(res => { setResult(res); })
      .catch(e => { setError(String(e?.message ?? e)); setResult(null); })
      .finally(() => setLoading(false));
  }, [policyId, year, month]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [run, bumpCounter]);

  const bump = useCallback(() => setBumpCounter(c => c + 1), []);

  return { result, loading, error, bump, rerun: run };
}
