// modules/orders/machines/MockMachineAdapter.ts
// Geliştirme adapter'ı — gerçek makine yokken simulator olarak çalışır.
// startJob → record_machine_event('job_started') yazar
// Belirtilen estimateSeconds sonra job_completed event'i (manuel "complete"
// fonksiyonu var; auto-timer yok — kontrol kullanıcıda).

import { supabase } from '../../../core/api/supabase';
import type { MachineAdapter, MachineStatus, JobConfig, AdapterConstructorArgs } from './types';

export class MockMachineAdapter implements MachineAdapter {
  kind = 'mock' as const;
  private equipmentId: string;
  private currentJobStageId: string | null = null;
  private currentJobStartedAt: number | null = null;

  constructor(args: AdapterConstructorArgs) {
    this.equipmentId = args.equipmentId;
  }

  async getStatus(): Promise<MachineStatus> {
    // Server'dan canlı durumu çek
    const { data, error } = await supabase
      .from('machine_live_status')
      .select('live_status, last_heartbeat_at, current_stage_id, current_job_started_at, current_job_estimate_seconds, last_error_message')
      .eq('equipment_id', this.equipmentId)
      .maybeSingle();
    if (error || !data) {
      return { state: 'unknown' };
    }
    return {
      state:            (data.live_status ?? 'unknown') as MachineStatus['state'],
      lastHeartbeatAt:  data.last_heartbeat_at ?? undefined,
      currentJobId:     data.current_stage_id ?? undefined,
      startedAt:        data.current_job_started_at ?? undefined,
      estimateSeconds:  data.current_job_estimate_seconds ?? undefined,
      message:          data.last_error_message ?? undefined,
    };
  }

  async startJob(cfg: JobConfig): Promise<{ ok: boolean; jobId?: string; error?: string }> {
    this.currentJobStageId   = cfg.stageId;
    this.currentJobStartedAt = Date.now();

    const { error } = await supabase.rpc('record_machine_event', {
      p_equipment_id:     this.equipmentId,
      p_event_type:       'job_started',
      p_stage_id:         cfg.stageId,
      p_payload:          { ...cfg.options, estimate_seconds: cfg.estimateSeconds },
      p_runtime_seconds:  null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, jobId: cfg.stageId };
  }

  /** Mock-only — gerçek adapter'da makine kendi event'ini yollar.  */
  async completeJob(actualRuntimeSeconds?: number): Promise<{ ok: boolean; error?: string }> {
    if (!this.currentJobStageId) return { ok: false, error: 'no active job' };
    const runtime = actualRuntimeSeconds ?? Math.floor(((Date.now() - (this.currentJobStartedAt ?? Date.now())) / 1000));

    const { error } = await supabase.rpc('record_machine_event', {
      p_equipment_id:     this.equipmentId,
      p_event_type:       'job_completed',
      p_stage_id:         this.currentJobStageId,
      p_payload:          { simulated: true },
      p_runtime_seconds:  runtime,
    });
    this.currentJobStageId = null;
    this.currentJobStartedAt = null;
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async cancelJob(): Promise<{ ok: boolean; error?: string }> {
    if (!this.currentJobStageId) return { ok: true };
    await supabase.rpc('record_machine_event', {
      p_equipment_id:     this.equipmentId,
      p_event_type:       'status_changed',
      p_stage_id:         this.currentJobStageId,
      p_payload:          { status: 'idle', cancelled: true },
      p_runtime_seconds:  null,
    });
    this.currentJobStageId = null;
    this.currentJobStartedAt = null;
    return { ok: true };
  }
}
