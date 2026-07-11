// modules/orders/api/timing.ts
// Phase B RPC sarmalayıcıları — workflow timing & activity tracking.

import { supabase } from '../../../core/api/supabase';
import type { StageStatus } from '../stations/stageStates';

export type ActivityEventSource = 'manual' | 'system' | 'machine_api';

/** Aşamada bir aktivite eventi kaydet (STL upload, file open, vs). */
export async function recordStageActivity(
  stageId: string,
  eventType: string,
  source: ActivityEventSource = 'system',
  payload?: Record<string, any>,
): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('record_stage_activity', {
    p_stage_id:   stageId,
    p_event_type: eventType,
    p_source:     source,
    p_payload:    payload ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, eventId: data as string };
}

/** Teknisyen "İşe Başla" der → started_at set, queue_waiting_seconds birikir.
 *  estimatedMinutes verilirse aşamaya kaydedilir (progress ring temeli). */
export async function startStage(
  stageId: string,
  estimatedMinutes?: number,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('start_stage_simple', {
    p_stage_id: stageId,
    p_estimated_minutes: estimatedMinutes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Aktif aşamayı durdur. */
export async function pauseStage(
  stageId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('pause_stage', {
    p_stage_id: stageId,
    p_reason:   reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Durdurulmuş/bekleyen aşamayı tekrar aktif et. */
export async function resumeStage(
  stageId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('resume_stage', {
    p_stage_id: stageId,
    p_reason:   reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Generic state geçişi — pause/resume dışı durumlar için (makine_bekliyor, bloklu vs). */
export async function transitionStageState(
  stageId: string,
  newStatus: StageStatus,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('transition_stage_state', {
    p_stage_id:   stageId,
    p_new_status: newStatus,
    p_reason:     reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Manuel timing düzeltmesi — sadece *_seconds alanları, audit'li. */
export async function overrideStageTiming(
  stageId: string,
  fieldName: 'active_work_seconds' | 'machine_runtime_seconds' | 'operator_setup_seconds' | 'queue_waiting_seconds',
  newValue: number,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('override_stage_timing', {
    p_stage_id:   stageId,
    p_field_name: fieldName,
    p_new_value:  newValue,
    p_reason:     reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Acil unblock RPC — eski confirm_stage_materials 'done' bug'ı + teknisyen RLS'i
 * için minimal SECURITY DEFINER tamamlama. Faz B varsa transition_stage_state
 * tercih edilir; bu fallback son çare.
 */
export async function completeStageSimple(
  stageId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('complete_stage_simple', {
    p_stage_id: stageId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Stage tamamlama — çok katmanlı dayanıklı yol.
 * Bug'lı confirm_stage_materials atlanır; önce clean RPC'ler denenir.
 *
 * 1) complete_stage_simple (clean mini RPC, advance dahil) — yoksa fallback'e
 * 2) transition_stage_state (Faz B) — yoksa fallback'e
 * 3) confirm_stage_materials (legacy, 'done' bug'lı) — başarılırsa OK
 * 4) Direct UPDATE (RLS izin verirse) — son çare
 *
 * Her step'te 'done' enum bug'ı veya "function not found" durumunda bir
 * sonraki adıma düşer.
 */
export async function completeStageResilient(
  stageId: string,
  materialLines: any[] = [],
): Promise<{ ok: boolean; error?: string }> {
  console.log('[completeStageResilient v4] starting for stage:', stageId);

  const isSkippable = (msg: string) => {
    const m = (msg ?? '').toLowerCase();
    return m.includes('could not find the function')
        || m.includes('does not exist')
        || m.includes('stage_status')
        || m.includes('"done"')
        || m.includes("'done'");
  };

  // ── Adım 1: complete_stage_simple (önce dene — clean RPC) ──
  const cs = await completeStageSimple(stageId);
  if (cs.ok) { console.log('[completeStageResilient] step1 (complete_stage_simple) ok'); return { ok: true }; }
  console.log('[completeStageResilient] step1 failed:', cs.error, 'skippable=', isSkippable(cs.error ?? ''));
  if (!isSkippable(cs.error ?? '')) return { ok: false, error: cs.error };

  // ── Adım 2: transition_stage_state (Faz B) ──
  const t = await transitionStageState(stageId, 'tamamlandi', 'auto-fallback (legacy RPC bug)');
  if (t.ok) { console.log('[completeStageResilient] step2 (transition_stage_state) ok'); return { ok: true }; }
  console.log('[completeStageResilient] step2 failed:', t.error, 'skippable=', isSkippable(t.error ?? ''));
  if (!isSkippable(t.error ?? '')) return { ok: false, error: t.error };

  // ── Adım 3: confirm_stage_materials (legacy — 'done' bug'lı olabilir) ──
  const r1 = await supabase.rpc('confirm_stage_materials', {
    p_stage_id: stageId,
    p_lines: materialLines,
    p_advance_stage: true,
  });
  if (!r1.error) { console.log('[completeStageResilient] step3 (confirm_stage_materials) ok'); return { ok: true }; }
  console.log('[completeStageResilient] step3 failed:', r1.error.message, 'skippable=', isSkippable(r1.error.message));
  if (!isSkippable(r1.error.message)) return { ok: false, error: r1.error.message };

  // ── Adım 4: Direct UPDATE (RLS muhtemelen reddeder) ──
  console.log('[completeStageResilient] step4 — direct UPDATE');
  const { error: upErr } = await supabase
    .from('order_stages')
    .update({ status: 'tamamlandi', completed_at: new Date().toISOString() })
    .eq('id', stageId);
  if (upErr) {
    return { ok: false, error: `${upErr.message} — Lütfen 20260509060000_complete_stage_simple_rpc.sql migration'ını uygula` };
  }
  return { ok: true };
}

export interface StageTimingConfidence {
  stage_id:           string;
  event_count:        number;
  auto_event_count:   number;
  manual_event_count: number;
  first_event_at:     string | null;
  last_event_at:      string | null;
  score:              number;            // 0-100
  confidence_level:   'unknown' | 'low' | 'medium' | 'high';
}

export async function fetchStageTimingConfidence(
  stageId: string,
): Promise<{ data?: StageTimingConfidence; error?: string }> {
  const { data, error } = await supabase
    .from('stage_timing_confidence')
    .select('*')
    .eq('stage_id', stageId)
    .single();
  if (error) return { error: error.message };
  return { data: data as StageTimingConfidence };
}
