/**
 * useStageMaterialEstimate
 *
 * Bir order_stages.id verildiğinde:
 *   1. Stage + station + order + candidate stock items'ı çeker
 *   2. estimateStageMaterials() ile tahmini satırları üretir
 *   3. Modal'ın editable state'i olarak return eder
 *
 * Hook tüketicisi (genelde MaterialConfirmModal):
 *   - lines: satırlar
 *   - setLine(idx, patch): tek satır günceller
 *   - addLine(): manuel boş satır ekler
 *   - removeLine(idx): satır siler
 *   - confirm({ advanceStage }): RPC çağırır
 *   - reset(): yeniden tahmin üret
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchStageMaterialContext, confirmStageMaterials, newIdempotencyKey, type StageMaterialContext } from '../api';
import {
  estimateStageMaterials,
  createManualLine,
  isLineValid,
  totalEstimateCost,
  type EstimatedMaterialLine,
} from '../../../core/materials/estimation';

export type StageEstimateState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'no-materials'; context: StageMaterialContext }   // station.consumes_materials = false
  | { phase: 'ready'; context: StageMaterialContext; lines: EstimatedMaterialLine[] }
  | { phase: 'error'; error: string }
  | { phase: 'saving' }
  | { phase: 'done' };

interface UseStageMaterialEstimateResult {
  state: StageEstimateState;
  lines: EstimatedMaterialLine[];
  context: StageMaterialContext | null;
  totalCost: number;
  invalidCount: number;
  setLine: (index: number, patch: Partial<EstimatedMaterialLine>) => void;
  addLine: () => void;
  addLines: (incoming: EstimatedMaterialLine[]) => void;
  removeLine: (index: number) => void;
  reset: () => Promise<void>;
  confirm: (opts?: { advanceStage?: boolean }) => Promise<{ ok: boolean; error?: string }>;
}

export function useStageMaterialEstimate(stageId: string | null): UseStageMaterialEstimateResult {
  const [state, setState] = useState<StageEstimateState>({ phase: 'idle' });
  const [lines, setLines] = useState<EstimatedMaterialLine[]>([]);
  const [context, setContext] = useState<StageMaterialContext | null>(null);

  // Onay oturumu anahtarı — her yeniden yükleme (yeni kullanım olayı) yeni
  // anahtar alır; aynı oturumdaki tekrar denemeler AYNI anahtarı kullanır,
  // böylece stok iki kez düşmez.
  const idemKeyRef = useRef<string>(newIdempotencyKey());

  const load = useCallback(async () => {
    if (!stageId) { setState({ phase: 'idle' }); return; }
    setState({ phase: 'loading' });
    idemKeyRef.current = newIdempotencyKey();

    const { data, error } = await fetchStageMaterialContext(stageId);
    if (error || !data) {
      setState({ phase: 'error', error: error ?? 'Stage context alınamadı' });
      return;
    }

    setContext(data);

    // Bu istasyon malzeme tüketmiyorsa modal'a gerek yok — hook tüketicisi
    // direkt advance edebilir
    if (!data.station.consumes_materials) {
      setLines([]);
      setState({ phase: 'no-materials', context: data });
      return;
    }

    const toothCount = data.order.tooth_numbers?.length ?? 0;
    const estimated = estimateStageMaterials(
      data.station,
      { id: data.order.id, tooth_count: toothCount, work_type: data.order.work_type },
      data.candidateItems as any,
    );

    setLines(estimated);
    setState({ phase: 'ready', context: data, lines: estimated });
  }, [stageId]);

  useEffect(() => { void load(); }, [load]);

  // ── Editing ──
  const setLine = useCallback((index: number, patch: Partial<EstimatedMaterialLine>) => {
    setLines(prev => prev.map((ln, i) => i === index ? { ...ln, ...patch } : ln));
  }, []);

  const addLine = useCallback(() => {
    setLines(prev => [...prev, createManualLine()]);
  }, []);

  // AI önerisi vb. için toplu ekleme — aynı stok kalemine bağlı satırları atlar
  const addLines = useCallback((incoming: EstimatedMaterialLine[]) => {
    setLines(prev => {
      const seen = new Set(prev.map(l => l.item_id).filter(Boolean) as string[]);
      const fresh = incoming.filter(l => !l.item_id || !seen.has(l.item_id));
      return [...prev, ...fresh];
    });
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ── Derived ──
  const totalCost = useMemo(() => totalEstimateCost(lines), [lines]);

  const invalidCount = useMemo(
    () => lines.filter(l => !isLineValid(l) && (l.actual_qty > 0 || l.waste_qty > 0 || l.item_name.trim())).length,
    [lines],
  );

  // ── Confirm ──
  const confirm = useCallback(async (opts?: { advanceStage?: boolean }) => {
    if (!stageId) return { ok: false, error: 'Stage id yok' };

    // Sadece geçerli satırları gönder (tamamen boş manuel satırlar atlanır)
    const payload = lines
      .filter(l => l.item_name.trim() && (l.actual_qty > 0 || l.waste_qty > 0))
      .map(l => ({
        item_id: l.item_id,
        item_name: l.item_name,
        category: l.category,
        unit: l.unit,
        estimated_qty: l.estimated_qty,
        actual_qty: l.actual_qty,
        waste_qty: l.waste_qty,
        waste_reason: l.waste_reason,
        unit_cost: l.unit_cost,
        note: l.note,
      }));

    setState({ phase: 'saving' });
    const idemKey = idemKeyRef.current;
    let res = await confirmStageMaterials(stageId, payload, opts?.advanceStage ?? true, idemKey);
    // Sunucudaki confirm_stage_materials 'done' enum hatası verirse →
    // önce p_advance_stage=false ile materyalleri kaydet, sonra
    // transition_stage_state ile 'tamamlandi'ye geçir.
    const errMsg1 = (res.error ?? '').toLowerCase();
    const isEnumDoneBug = !res.ok && (errMsg1.includes('stage_status') || errMsg1.includes('"done"') || errMsg1.includes("'done'"));
    if (isEnumDoneBug) {
      console.warn('[material-confirm] buggy RPC; using two-step fallback');
      // Adım 1: materyalleri kaydet, advance bypass
      // AYNI idempotency anahtarı → ilk çağrı zaten yazdıysa tekrar düşmez
      const save = await confirmStageMaterials(stageId, payload, false, idemKey);
      const errMsg2 = (save.error ?? '').toLowerCase();
      const saveIsBug = !save.ok && (errMsg2.includes('stage_status') || errMsg2.includes('"done"') || errMsg2.includes("'done'"));
      if (!save.ok && !saveIsBug) {
        setState({ phase: 'error', error: save.error ?? 'Materyal kaydı başarısız' });
        return save;
      }
      // Adım 2: stage'i tamamlandı'ya çevir (trigger advance'i yönetir)
      const { transitionStageState } = await import('../api/timing');
      const t = await transitionStageState(stageId, 'tamamlandi', 'auto-fallback (legacy RPC)');
      if (t.ok) {
        res = { ok: true };
      } else if (/Could not find the function|does not exist/i.test(t.error ?? '')) {
        // Faz B migration uygulanmamış → direct UPDATE'e düş
        const { supabase } = await import('../../../core/api/supabase');
        const { error: upErr } = await supabase
          .from('order_stages')
          .update({ status: 'tamamlandi', completed_at: new Date().toISOString() })
          .eq('id', stageId);
        if (upErr) {
          setState({ phase: 'error', error: upErr.message });
          return { ok: false, error: upErr.message };
        }
        res = { ok: true };
      } else {
        setState({ phase: 'error', error: t.error ?? 'Geçiş başarısız' });
        return { ok: false, error: t.error };
      }
    }
    if (!res.ok) {
      setState({ phase: 'error', error: res.error ?? 'Onay başarısız' });
      return res;
    }
    setState({ phase: 'done' });
    return res;
  }, [stageId, lines]);

  return {
    state,
    lines,
    context,
    totalCost,
    invalidCount,
    setLine,
    addLine,
    addLines,
    removeLine,
    reset: load,
    confirm,
  };
}
