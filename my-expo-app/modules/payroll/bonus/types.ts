/**
 * Bonus Engine — Domain types
 * (mirrors supabase tables from 20260529010000_bonus_engine_phase1.sql)
 */

export type BonusMode = 'individual' | 'pool' | 'hybrid';
export type RemakePenaltyMode = 'ignore' | 'exclude' | 'penalty';
export type RunStatus = 'draft' | 'approved' | 'posted' | 'voided';
export type DistributionMethod = 'equal' | 'by_salary' | 'by_points' | 'by_contribution' | 'flat_per_member';
export type PolicyStatus = 'draft' | 'active' | 'archived';
export type QualityWindow = 'period' | 'rolling_30' | 'rolling_60' | 'rolling_90' | 'all_time';

export interface BonusPolicy {
  id: string;
  lab_id: string;
  name: string;
  description: string | null;
  mode: BonusMode;
  period_type: 'monthly';
  currency: 'TRY' | 'USD' | 'EUR' | 'GBP';
  base_rate: number;
  distribution_method: DistributionMethod | null;
  quality_window: QualityWindow;
  remake_penalty: RemakePenaltyMode;
  remake_penalty_points: number;
  flat_amount_per_member: number;
  status: PolicyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** convenience: policy is "active" if status === 'active' */
export const isPolicyActive = (p: { status: PolicyStatus }) => p.status === 'active';

/**
 * Backwards-compat alias — eski Faz 3 editör'ünü çalıştıran legacy alanlar.
 * (Editor yeniden yazılana kadar derleme bozulmasın.)
 */
export type BonusPolicyLegacy = BonusPolicy & Partial<{
  count_only_completed: boolean;
  count_only_delivered: boolean;
  delivery_grace_days: number;
  first_paid_unit: number;
  cooldown_days: number;
  remake_penalty_mode: RemakePenaltyMode;
  quality_window_days: number;
  pool_distribution: DistributionMethod;
  pool_min_units_for_share: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  preset_key: string | null;
}>;

export interface BonusEligibleWorkType {
  policy_id: string;
  work_type: string;
}

export interface BonusThreshold {
  id?: string;
  policy_id: string;
  min_units: number;
  rate?: number;
  label?: string | null;
  // legacy editor compat
  max_units?: number | null;
  rate_per_unit?: number;
}

export interface BonusDifficultyRule {
  id?: string;
  policy_id: string;
  work_type: string;
  multiplier?: number;
  // legacy editor compat
  difficulty_multiplier?: number;
}

export interface BonusStageRate {
  id?: string;
  policy_id: string;
  stage_kind: string;
  amount_per_unit?: number;
  // legacy editor compat
  bonus_per_unit?: number;
}

export interface BonusQualityRule {
  id?: string;
  policy_id: string;
  max_remake_pct: number;
  multiplier: number;
  label?: string | null;
}

export interface BonusPolicyAssignment {
  id?: string;
  policy_id: string;
  employee_id: string;
  valid_from?: string;
  valid_to?: string | null;
  // legacy editor compat
  start_date?: string;
  end_date?: string | null;
}

export interface BonusRunBreakdownRow {
  employee_id: string;
  employee_name: string;
  auth_user_id?: string | null;
  email?: string | null;
  station_code?: string | null;
  units: number;
  points: number;
  stage_bonus: number;
  individual_bonus: number;
  pool_share: number;
  quality_multiplier: number;
  remake_pct: number;
  rejects: number;
  total_bonus: number;
  base_salary?: number;
  error?: string | null;
}

export interface BonusRun {
  id: string;
  lab_id: string;
  policy_id: string;
  period_year: number;
  period_month: number;
  status: RunStatus;
  total_units: number;
  total_pool: number;
  total_payout: number;
  breakdown: any;    // JSONB array (direct); old editor reads breakdown.rows
  policy_snapshot: any;
  calculated_by: string | null;
  calculated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  posted_by: string | null;
  posted_at: string | null;
  notes: string | null;
  // legacy editor compat aliases — populated when reading runs
  created_at?: string;
  total_bonus?: number;
  total_points?: number;
  pool_amount?: number;
}

/** Full policy with related children — used by the editor */
export interface PolicyFull {
  policy: BonusPolicyLegacy;
  work_types: BonusEligibleWorkType[];
  thresholds: BonusThreshold[];
  difficulty: BonusDifficultyRule[];
  stage_rates: BonusStageRate[];
  quality: BonusQualityRule[];
  assignments: BonusPolicyAssignment[];
}

/** Preset key → human label */
export const DIFFICULTY_PRESETS: Record<string, { label: string; description: string }> = {
  basic:    { label: 'Temel',     description: 'Tek eşik · sabit oran · zorluk çarpanı yok' },
  balanced: { label: 'Dengeli',   description: '3 eşik · 3 zorluk kategorisi · kalite kuralları' },
  premium:  { label: 'Premium',   description: '5 eşik · ince zorluk matrisi · sıkı kalite' },
  custom:   { label: 'Özel',      description: 'Hiçbir şey doldurulmadan başla' },
};

export const STAGE_KINDS = [
  'TRIAGE','DESIGN','CAM','MILLING','SINTER','CERAMIC','FINISH','QC',
  'MANAGER_REVIEW','DOCTOR_APPROVAL','SHIPPED','OTHER',
] as const;

export const STAGE_KIND_LABELS: Record<string, string> = {
  TRIAGE: 'Triaj', DESIGN: 'Tasarım', CAM: 'CAM', MILLING: 'Frezeleme',
  SINTER: 'Sinter', CERAMIC: 'Seramik', FINISH: 'Bitirme', QC: 'Kalite Kontrol',
  MANAGER_REVIEW: 'Yönetici Onay', DOCTOR_APPROVAL: 'Hekim Onay',
  SHIPPED: 'Sevkiyat', OTHER: 'Diğer',
};

export const MODE_LABELS: Record<BonusMode, string> = {
  individual: 'Bireysel',
  pool:       'Havuz',
  hybrid:     'Karma (Bireysel + Havuz)',
};

export const DISTRIBUTION_LABELS: Record<DistributionMethod, string> = {
  equal:            'Eşit pay',
  by_salary:        'Maaşa orantılı',
  by_points:        'Toplam puana göre',
  by_contribution:  'Katkıya göre',
  flat_per_member:  'Kişi başı sabit tutar',
};

export const REMAKE_LABELS: Record<RemakePenaltyMode, string> = {
  ignore:  'Yoksay',
  exclude: 'Hesap dışı',
  penalty: 'Puan düşür',
};

export const STATUS_LABELS: Record<PolicyStatus, string> = {
  draft:    'Taslak',
  active:   'Aktif',
  archived: 'Arşiv',
};

export const QUALITY_WINDOW_LABELS: Record<QualityWindow, string> = {
  period:     'Sadece bu ay',
  rolling_30: 'Son 30 gün',
  rolling_60: 'Son 60 gün',
  rolling_90: 'Son 90 gün',
  all_time:   'Tüm zamanlar',
};
