/**
 * Stok modülü API — Üretim Malzemesi eşleştirmesi (Envanter D2).
 *
 * Reçeteler stok kartını (SKU) değil, marka bağımsız Üretim Malzemesini
 * referanslar. Bu dosya ikisi arasındaki eşleştirmeyi yönetir.
 *
 * Öneri motoru hiçbir şey yazmaz — yazma yalnız yönetici onayıyla
 * apply_stock_material_mapping RPC'si üzerinden olur.
 */

import { supabase } from '../../core/api/supabase';

export interface ProductionMaterial {
  id: string;
  code: string;
  name: string;
  default_unit: string | null;
  allowed_stations: string[] | null;
  is_active: boolean;
}

export interface MappingSuggestion {
  stock_item_id: string;
  stock_item_name: string;
  category: string | null;
  unit: string | null;
  /** Kalemin şu an bağlı olduğu üretim malzemesi kodu (null = henüz bağlanmamış) */
  current_code: string | null;
  suggested_code: string | null;
  suggested_id: string | null;
  /** 'yüksek' = ad eşleşmesi · 'orta' = kategori yedeği · 'yok' */
  confidence: 'yüksek' | 'orta' | 'yok';
  matched_on: string;
}

export async function fetchProductionMaterials(): Promise<{
  data: ProductionMaterial[]; error?: string;
}> {
  const { data, error } = await supabase
    .from('production_materials')
    .select('id, code, name, default_unit, allowed_stations, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ProductionMaterial[] };
}

export async function fetchMappingSuggestions(): Promise<{
  data: MappingSuggestion[]; error?: string;
}> {
  const { data, error } = await supabase.rpc('suggest_stock_material_mapping', {
    p_lab_id: null,
  });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as MappingSuggestion[] };
}

/**
 * Toplu eşleştirme onayı. production_material_id null gönderilirse bağ kaldırılır.
 * Yalnız yönetici/admin çağırabilir (RPC içinde kontrol edilir).
 */
export async function applyMaterialMapping(
  pairs: { stock_item_id: string; production_material_id: string | null }[],
): Promise<{ ok: boolean; count?: number; error?: string }> {
  if (!pairs.length) return { ok: true, count: 0 };
  const { data, error } = await supabase.rpc('apply_stock_material_mapping', {
    p_pairs: pairs,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: (data as number) ?? 0 };
}

// ── Tüketim profili ─────────────────────────────────────────────────────────

/** Kuralın miktarı nasıl hesaplayacağı */
export type CalcModel = 'fixed' | 'per_tooth' | 'per_jaw' | 'per_unit' | 'disc_yield';

export const CALC_MODEL_LABEL: Record<CalcModel, string> = {
  fixed:      'İş başına sabit',
  per_tooth:  'Diş başına',
  per_jaw:    'Çene başına',
  per_unit:   'Kalem adedi başına',
  disc_yield: 'Disk verimi (kalınlığa göre)',
};

export interface LabProfile {
  profile_id: string;
  profile_name: string;
  version_id: string;
  version_no: number;
  rule_count: number;
  assumption_count: number;
}

export interface CoverageRow {
  production_material_id: string;
  production_code: string;
  production_name: string;
  station_id: string | null;
  station_name: string;
  /** Bu üretim malzemesine bağlanmış aktif stok kalemi sayısı */
  mapped_items: number;
  has_rule: boolean;
  calc_model: CalcModel | null;
  qty: number | null;
  unit: string | null;
  is_assumption: boolean | null;
  note: string | null;
}

/** Labın aktif tüketim profili — yoksa null (henüz şablondan kopyalanmamış) */
export async function fetchLabProfile(): Promise<{ data: LabProfile | null; error?: string }> {
  const { data, error } = await supabase.rpc('get_lab_consumption_profile', { p_lab_id: null });
  if (error) return { data: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { data: (row as LabProfile) ?? null };
}

/** Global şablondan lab kopyası oluştur (idempotent) */
export async function cloneProfileFromTemplate(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('clone_consumption_profile', { p_template_id: null });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Hangi (malzeme × istasyon) kurallı, hangisi değil */
export async function fetchProfileCoverage(): Promise<{ data: CoverageRow[]; error?: string }> {
  const { data, error } = await supabase.rpc('report_profile_coverage', { p_lab_id: null });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as CoverageRow[] };
}

// ── FIFO ve sipariş önerisi (D4) ────────────────────────────────────────────

export interface FifoStockRow {
  stock_item_id: string;
  item_name: string;
  category: string | null;
  unit: string | null;
  qty_on_hand: number;
  open_layers: number;
  oldest_layer: string | null;
  /** Bir sonraki tüketimin maliyetleneceği katmanın birim fiyatı */
  next_unit_cost: number | null;
  fifo_value: number;
  currency: string | null;
}

export interface ReorderRow {
  stock_item_id: string;
  item_name: string;
  category: string | null;
  unit: string | null;
  qty_on_hand: number;
  min_quantity: number;
  consumed_in_window: number;
  daily_rate: number;
  days_to_empty: number | null;
  depletion_date: string | null;
  suggested_order_date: string | null;
  suggested_qty: number;
  confidence: 'yok' | 'düşük' | 'orta';
  reason: string;
}

export async function fetchFifoStock(): Promise<{ data: FifoStockRow[]; error?: string }> {
  const { data, error } = await supabase.rpc('report_fifo_stock', { p_lab_id: null });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as FifoStockRow[] };
}

export async function fetchReorderSuggestions(opts?: {
  windowDays?: number; leadDays?: number; safetyDays?: number;
}): Promise<{ data: ReorderRow[]; error?: string }> {
  const { data, error } = await supabase.rpc('report_reorder_suggestions', {
    p_lab_id: null,
    p_window_days: opts?.windowDays ?? 90,
    p_lead_days: opts?.leadDays ?? 14,
    p_safety_days: opts?.safetyDays ?? 7,
  });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ReorderRow[] };
}

/** Katman yetmediği için maliyeti tahmin edilen tüketimler (gizlenmez) */
export async function fetchUncoveredCount(): Promise<number> {
  const { count } = await supabase
    .from('fifo_allocations')
    .select('id', { count: 'exact', head: true })
    .eq('is_uncovered', true);
  return count ?? 0;
}

// ── Envanter Doğrulama (D3) ─────────────────────────────────────────────────

export interface VerificationSummary {
  id: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'approved' | 'closed';
  line_count: number;
  counted_count: number;
  variance_count: number;
  cost_impact: number;
  created_at: string;
  closure_id: string | null;
  reopened: boolean | null;
}

export interface VerificationLine {
  line_id: string;
  stock_item_id: string;
  item_name: string;
  category: string | null;
  barcode: string | null;
  unit: string | null;
  system_qty: number;
  physical_qty: number | null;
  diff: number | null;
  unit_cost: number | null;
  currency: string | null;
  cost_impact: number | null;
  counted: boolean;
  note: string | null;
}

export async function listVerifications(): Promise<{ data: VerificationSummary[]; error?: string }> {
  const { data, error } = await supabase.rpc('list_inventory_verifications', { p_limit: 12 });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as VerificationSummary[] };
}

export async function fetchVerificationLines(
  verificationId: string,
): Promise<{ data: VerificationLine[]; error?: string }> {
  const { data, error } = await supabase.rpc('get_verification_lines', {
    p_verification_id: verificationId,
  });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as VerificationLine[] };
}

/** Taslak açar — o anki teorik miktarları snapshot alır */
export async function openVerification(
  periodStart: string, periodEnd: string, note?: string | null,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('open_inventory_verification', {
    p_period_start: periodStart, p_period_end: periodEnd, p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data as string };
}

/** Yalnız fiziksel miktar girilir; farkı sistem hesaplar */
export async function saveCount(
  lineId: string, physicalQty: number | null, note?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('save_verification_count', {
    p_line_id: lineId, p_physical_qty: physicalQty, p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Onay → sapmalar için ADJUST hareketleri yazılır */
export async function approveVerification(
  id: string,
): Promise<{ ok: boolean; adjusted?: number; costImpact?: number; error?: string }> {
  const { data, error } = await supabase.rpc('approve_inventory_verification', { p_id: id });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { adjusted?: number; cost_impact_base?: number };
  return { ok: true, adjusted: r.adjusted ?? 0, costImpact: r.cost_impact_base ?? 0 };
}

/** Dönemi kilitle — sonrasında o döneme ait hareketler değiştirilemez */
export async function closePeriod(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('close_inventory_period', { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Kural ekle/güncelle. Elle düzenlenen kural artık "varsayım" sayılmaz. */
export async function upsertConsumptionRule(input: {
  productionMaterialId: string;
  stationId: string | null;
  calcModel: CalcModel;
  qty: number;
  unit?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('upsert_consumption_rule', {
    p_production_material_id: input.productionMaterialId,
    p_station_id: input.stationId,
    p_calc_model: input.calcModel,
    p_qty: input.qty,
    p_unit: input.unit ?? null,
    p_delete: false,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Geçmiş Tüketim Denetimi (Adım 1 — salt okunur) ──────────────────────────

/** report_consumption_audit satırı — kayıtlı miktar vs profilin beklediği. */
export interface ConsumptionAuditRow {
  movement_id: string;
  moved_at: string;
  reversed: boolean;
  order_id: string | null;
  order_number: string | null;
  work_type: string | null;
  tooth_count: number;
  stage_id: string | null;
  stage_name: string | null;
  item_id: string;
  item_name: string;
  item_category: string | null;
  item_unit: string | null;
  recorded_qty: number;
  recorded_unit: string | null;
  expected_qty: number | null;
  expected_unit: string | null;
  /** "2 diş ÷ 33 kron/disk (16 mm)" — beklenen miktarın gerekçesi */
  basis: string | null;
  /** Beklenen hesaplanamadıysa nedeni: kural_yok · urun_baglanmamis · lab_profili_yok */
  reason: string | null;
  /** Karşılaştırmanın yapıldığı ortak birim (paketli kalemde içerik birimi) */
  norm_unit: string | null;
  recorded_norm: number | null;
  expected_norm: number | null;
  /** kayıtlı ÷ beklenen. Birimler uyuşmuyorsa null. */
  ratio: number | null;
  flags: string[];
  /** 3 kritik · 2 incele · 1 not · 0 uyumlu */
  severity: number;
  cost: number | null;
  currency: string | null;
}

/** Tüketen istasyonlarda tamamlanmış ama malzeme kaydı hiç girilmemiş aşamalar. */
export interface ConsumptionGapRow {
  station_id: string;
  station_name: string;
  done_stages: number;
  with_material: number;
  missing: number;
  last_missing_at: string | null;
}

export async function fetchConsumptionAudit(
  includeReversed = false,
): Promise<{ data: ConsumptionAuditRow[]; error?: string }> {
  const { data, error } = await supabase.rpc('report_consumption_audit', {
    p_include_reversed: includeReversed,
  });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ConsumptionAuditRow[] };
}

export async function fetchConsumptionGaps(): Promise<{
  data: ConsumptionGapRow[]; error?: string;
}> {
  const { data, error } = await supabase.rpc('report_consumption_gaps');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ConsumptionGapRow[] };
}

// ── Geçmiş Tüketim Düzeltmesi (Adım 2) ──────────────────────────────────────

export interface CorrectionResult {
  ok: boolean;
  action: 'correct' | 'cancel';
  movement_id: string;
  new_movement_id?: string;
  old_qty?: number;
  old_unit?: string;
  new_qty?: number;
  new_unit?: string;
  basis?: string;
  released_allocations?: number;
}

/**
 * Hareketi ters çevirip düzeltilmiş kaydı yazar.
 * newQty verilmezse profilin hesapladığı miktar uygulanır.
 * cancel=true ise yalnız iptal edilir, yerine kayıt yazılmaz.
 */
export async function correctConsumption(input: {
  movementId: string;
  newQty?: number | null;
  newUnit?: string | null;
  newItemId?: string | null;
  newStageId?: string | null;
  cancel?: boolean;
  note?: string | null;
}): Promise<{ ok: boolean; result?: CorrectionResult; error?: string }> {
  const { data, error } = await supabase.rpc('correct_stage_consumption', {
    p_movement_id:  input.movementId,
    p_new_qty:      input.newQty ?? null,
    p_new_unit:     input.newUnit ?? null,
    p_new_item_id:  input.newItemId ?? null,
    p_new_stage_id: input.newStageId ?? null,
    p_cancel:       input.cancel ?? false,
    p_note:         input.note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data as CorrectionResult };
}

export interface StageOption { id: string; label: string; status: string | null }
export interface ItemOption  { id: string; name: string; unit: string | null; category: string | null }

/** Düzeltme sırasında "hangi aşamaya ait?" sorusunun seçenekleri */
export async function fetchOrderStageOptions(
  orderId: string,
): Promise<{ data: StageOption[]; error?: string }> {
  const { data, error } = await supabase
    .from('order_stages')
    .select('id, sequence_order, status, lab_stations(name)')
    .eq('work_order_id', orderId)
    .order('sequence_order');
  if (error) return { data: [], error: error.message };
  const rows = (data ?? []) as any[];
  return {
    data: rows.map(r => ({
      id: r.id,
      label: r.lab_stations?.name ?? `Aşama ${r.sequence_order ?? ''}`.trim(),
      status: r.status ?? null,
    })),
  };
}

/** Düzeltme sırasında "hangi kalem?" sorusunun seçenekleri */
export async function fetchItemOptions(): Promise<{ data: ItemOption[]; error?: string }> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, name, unit, category')
    .eq('is_active', true)
    .order('name');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ItemOption[] };
}

// ── Pano uyarı şeridi ───────────────────────────────────────────────────────

export interface StockDashboardAlerts {
  verification_id: string | null;
  verification_total: number;
  verification_counted: number;
  stages_missing: number;
  pending_no_profile: number;
  items_without_min: number;
  expiring_soon: number;
}

export async function fetchStockAlerts(): Promise<StockDashboardAlerts | null> {
  const { data, error } = await supabase.rpc('stock_dashboard_alerts');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as StockDashboardAlerts | null;
}

/** Minimum seviyeleri toplu güncelle — {id: min} eşlemesi */
export async function saveMinLevels(
  levels: Record<string, number>,
): Promise<{ ok: boolean; saved: number; error?: string }> {
  const entries = Object.entries(levels);
  if (entries.length === 0) return { ok: true, saved: 0 };
  // Tek tek update: toplu upsert kalemin diğer alanlarını da yazmak zorunda
  // kalırdı (isim, birim…) — yanlışlıkla üzerine yazma riski taşımayalım.
  for (const [id, min] of entries) {
    const { error } = await supabase
      .from('stock_items')
      .update({ min_quantity: min, min_auto: false })
      .eq('id', id);
    if (error) return { ok: false, saved: 0, error: error.message };
  }
  return { ok: true, saved: entries.length };
}
