// modules/orders/slaConfig.ts
// Per-stage SLA + color status helper.
// Decisions:
//   • Yellow = 80% of SLA reached
//   • Red    = SLA exceeded
//   • Green  = below 80%

import type { Stage } from './stages';

/** SLA in minutes per stage. */
export const STAGE_SLA_MINUTES: Record<Stage, number> = {
  TRIAGE:           15,
  MANAGER_REVIEW:   30,
  DESIGN:           120,    // 2h
  DOCTOR_APPROVAL:  1440,   // 24h
  CAM:              30,
  MILLING:          240,    // 4h
  SINTER:           480,    // 8h
  FINISH:           60,
  QC:               30,
  SHIPPED:          0,
};

export type SlaStatus = 'green' | 'yellow' | 'red' | 'none';

/** Determine SLA status given idle ms in current stage. */
export function slaStatus(stage: Stage | null | undefined, idleMs: number): SlaStatus {
  if (!stage) return 'none';
  const sla = STAGE_SLA_MINUTES[stage];
  if (!sla || sla <= 0) return 'none';
  const slaMs    = sla * 60_000;
  const yellowMs = slaMs * 0.8;
  if (idleMs >= slaMs)    return 'red';
  if (idleMs >= yellowMs) return 'yellow';
  return 'green';
}

export const SLA_COLOR: Record<SlaStatus, string> = {
  green:  '#059669',
  yellow: '#D97706',
  red:    '#DC2626',
  none:   '#94A3B8',
};

export const SLA_BG: Record<SlaStatus, string> = {
  green:  '#ECFDF5',
  yellow: '#FFFBEB',
  red:    '#FEE2E2',
  none:   '#F1F5F9',
};

export const SLA_LABEL: Record<SlaStatus, string> = {
  green:  'Zamanında',
  yellow: 'SLA Yaklaşıyor',
  red:    'SLA Aşıldı',
  none:   '—',
};

/** Human-readable idle string. */
export function humanIdle(ms: number): string {
  if (ms < 0)            return '—';
  if (ms < 60_000)       return Math.floor(ms / 1000) + 's';
  if (ms < 3_600_000)    return Math.floor(ms / 60_000) + 'd';
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}s ${m}d`;
  }
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return `${d}g ${h}s`;
}

/** Real progress = completed stages / total stages. */
export function computeProgress(
  completedStages: Stage[],
  doctorApprovalRequired: boolean,
  managerReviewRequired: boolean,
): { completed: number; total: number; pct: number } {
  // Base prod stages (no SHIPPED in denominator)
  const base: Stage[] = ['TRIAGE', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC'];
  const optional: Stage[] = [];
  if (managerReviewRequired)  optional.push('MANAGER_REVIEW');
  if (doctorApprovalRequired) optional.push('DOCTOR_APPROVAL');
  const total = base.length + optional.length;
  const set   = new Set(completedStages);
  const completed = [...base, ...optional].filter(s => set.has(s)).length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, pct };
}

// ─── Delay reason taxonomy ──────────────────────────────────────────────────
export type DelayReason = 'waiting_doctor' | 'workload' | 'technician_issue' | 'material_issue';

export const DELAY_REASON_LABEL: Record<DelayReason, string> = {
  waiting_doctor:    'Doktor Bekleniyor',
  workload:          'Yoğunluk',
  technician_issue:  'Teknisyen Sorunu',
  material_issue:    'Malzeme Sorunu',
};

export const DELAY_REASON_OPTIONS: { key: DelayReason; label: string; icon: string }[] = [
  { key: 'waiting_doctor',   label: 'Doktor Bekleniyor', icon: 'user' },
  { key: 'workload',         label: 'Yoğunluk',          icon: 'layers' },
  { key: 'technician_issue', label: 'Teknisyen Sorunu',  icon: 'alert-triangle' },
  { key: 'material_issue',   label: 'Malzeme Sorunu',    icon: 'package' },
];
