// modules/platform/api.ts — Super-admin (platform) RPC sarmalayıcıları.
// Tüm erişim SECURITY DEFINER admin_* RPC'leri üzerinden; lab RLS'ine dokunulmaz.
import { supabase } from '../../core/api/supabase';

export type PlatformLab = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  trial_ends_at: string;
  created_at: string;
  users: number;
  orders: number;
  last_order_at: string | null;
};

export type PlatformLabDetail = {
  lab: Record<string, any>;
  users: Array<{ id: string; name: string | null; email: string | null; user_type: string; role: string | null; created_at: string }>;
  counts: { users: number; orders: number; clinics: number; invoices: number };
};

export const PLANS = ['trial', 'active', 'pro', 'enterprise', 'suspended'] as const;
export type Plan = (typeof PLANS)[number];

export async function amIPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) return false;
  return data === true;
}

export async function listLabs(): Promise<PlatformLab[]> {
  const { data, error } = await supabase.rpc('admin_list_labs');
  if (error) throw error;
  return ((data ?? []) as any[]).map((l) => ({
    ...l,
    users: Number(l.users) || 0,
    orders: Number(l.orders) || 0,
  })) as PlatformLab[];
}

export async function labDetail(id: string): Promise<PlatformLabDetail> {
  const { data, error } = await supabase.rpc('admin_lab_detail', { p_lab: id });
  if (error) throw error;
  return data as PlatformLabDetail;
}

export async function setLabStatus(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_lab_status', { p_lab: id, p_active: active });
  if (error) throw error;
}

export async function setLabPlan(id: string, plan: Plan): Promise<void> {
  const { error } = await supabase.rpc('admin_set_lab_plan', { p_lab: id, p_plan: plan });
  if (error) throw error;
}

// ── F1: stats / growth / management ──
export type PlatformStats = {
  totals: { labs: number; active: number; suspended: number; trial: number; users: number; orders: number; clinics: number };
  plans: Record<string, number>;
  attention: { trial_ending_7d: number; no_orders: number; silent_30d: number };
};
export type GrowthPoint = { week: string; new_labs: number; orders: number };
export type AuditRow = { id: number; actor: string | null; action: string; lab_name: string | null; detail: any; created_at: string };
export type PlatformAdmin = { user_id: string; name: string | null; email: string | null; note: string | null; created_at: string };

const num = (o: any, keys: string[]) => { for (const k of keys) if (o && o[k] != null) o[k] = Number(o[k]) || 0; return o; };

export async function platformStats(): Promise<PlatformStats> {
  const { data, error } = await supabase.rpc('admin_platform_stats');
  if (error) throw error;
  return data as PlatformStats;
}
export async function growthSeries(): Promise<GrowthPoint[]> {
  const { data, error } = await supabase.rpc('admin_growth_series');
  if (error) throw error;
  return ((data ?? []) as any[]).map((p) => num({ ...p }, ['new_labs', 'orders'])) as GrowthPoint[];
}
export async function extendTrial(id: string, days: number): Promise<void> {
  const { error } = await supabase.rpc('admin_extend_trial', { p_lab: id, p_days: days });
  if (error) throw error;
}
export async function offboardLab(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_offboard_lab', { p_lab: id });
  if (error) throw error;
}
export async function updateLabMeta(id: string, m: { name: string; phone?: string | null; email?: string | null; address?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('admin_update_lab_meta', { p_lab: id, p_name: m.name, p_phone: m.phone ?? null, p_email: m.email ?? null, p_address: m.address ?? null });
  if (error) throw error;
}
export async function auditLog(limit = 100): Promise<AuditRow[]> {
  const { data, error } = await supabase.rpc('admin_audit_log', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}
export async function listPlatformAdmins(): Promise<PlatformAdmin[]> {
  const { data, error } = await supabase.rpc('admin_list_platform_admins');
  if (error) throw error;
  return (data ?? []) as PlatformAdmin[];
}
export async function addPlatformAdmin(email: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_add_platform_admin', { p_email: email, p_note: note ?? null });
  if (error) throw error;
}
export async function removePlatformAdmin(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_remove_platform_admin', { p_user: userId });
  if (error) throw error;
}

// ── F2: impersonation (read-only snapshot) + support queue ──
export type LabSnapshot = {
  lab: Record<string, any>;
  counts: { users: number; orders: number; clinics: number; open_tickets: number };
  users: PlatformLabDetail['users'];
  recent_orders: Array<{ id: string; order_number: string | null; patient_name: string | null; work_type: string | null; status: string | null; is_urgent: boolean | null; created_at: string; delivery_date: string | null }>;
  open_tickets: Array<{ id: string; subject: string | null; status: string | null; priority: string | null; created_at: string }>;
};
export type SupportTicket = { id: string; lab_name: string | null; user_name: string | null; user_email: string | null; subject: string | null; category: string | null; priority: string | null; status: string | null; created_at: string; last_message_at: string | null };

export async function labSnapshot(id: string): Promise<LabSnapshot> {
  const { data, error } = await supabase.rpc('admin_lab_snapshot', { p_lab: id });
  if (error) throw error;
  return data as LabSnapshot;
}
export async function supportTickets(status?: string | null, limit = 150): Promise<SupportTicket[]> {
  const { data, error } = await supabase.rpc('admin_support_tickets', { p_status: status ?? null, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
}

// ── F3: metrics + system health ──
export type PlatformMetrics = {
  funnel: { labs: number; with_users: number; with_orders: number; active_30d: number };
  retention: { new_30d: number; activated_30d: number; active_7d: number; churned: number };
  orders_30d: number;
};
export type SystemHealth = {
  rls: { tables: number; enabled: number; disabled: number; disabled_list: string[] };
  definer_functions: number;
  extensions: Record<string, boolean>;
  cron_jobs: Array<{ job: string; schedule: string; active: boolean }>;
  rows: Record<string, number>;
};
export async function platformMetrics(): Promise<PlatformMetrics> {
  const { data, error } = await supabase.rpc('admin_platform_metrics');
  if (error) throw error;
  return data as PlatformMetrics;
}
export async function systemHealth(): Promise<SystemHealth> {
  const { data, error } = await supabase.rpc('admin_system_health');
  if (error) throw error;
  return data as SystemHealth;
}

// ── F2b: announcements + feature flags ──
export type Announcement = { id: number; title: string; body: string | null; level: 'info' | 'warning' | 'critical'; audience_lab: string | null; audience_name: string | null; active: boolean; starts_at: string; ends_at: string | null; created_at: string };
export type LabFlag = { key: string; label: string | null; description: string | null; default_on: boolean; override: boolean | null; effective: boolean };

export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase.rpc('admin_list_announcements');
  if (error) throw error;
  return (data ?? []) as Announcement[];
}
export async function createAnnouncement(a: { title: string; body?: string; level?: string; audience_lab?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('admin_create_announcement', { p_title: a.title, p_body: a.body ?? null, p_level: a.level ?? 'info', p_audience_lab: a.audience_lab ?? null });
  if (error) throw error;
}
export async function setAnnouncementActive(id: number, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_announcement_active', { p_id: id, p_active: active });
  if (error) throw error;
}
export async function deleteAnnouncement(id: number): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_announcement', { p_id: id });
  if (error) throw error;
}
export async function labFlags(labId: string): Promise<LabFlag[]> {
  const { data, error } = await supabase.rpc('admin_lab_flags', { p_lab: labId });
  if (error) throw error;
  return (data ?? []) as LabFlag[];
}
export async function setLabFlag(labId: string, key: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_lab_flag', { p_lab: labId, p_key: key, p_enabled: enabled });
  if (error) throw error;
}

// ── F4: billing ──
export type BillingOverview = { mrr_cents: number; arr_cents: number; currency: string; paying_labs: number; outstanding_cents: number; open_invoices: number; paid_30d_cents: number };
export type PlanDef = { key: string; name: string; price_cents: number; currency: string; billing_interval: string; sort: number; limits?: Record<string, number> };
export type PlatformInvoice = { id: number; lab_id: string; lab_name?: string | null; plan_key: string | null; amount_cents: number; currency: string; status: 'open' | 'paid' | 'void'; period_start: string | null; period_end: string | null; issued_at: string; due_at: string | null; paid_at: string | null };
export type LabBilling = { plan: string; is_active: boolean; trial_ends_at: string | null; plan_def: PlanDef | null; invoices: PlatformInvoice[] };

export async function billingOverview(): Promise<BillingOverview> {
  const { data, error } = await supabase.rpc('admin_billing_overview'); if (error) throw error; return data as BillingOverview;
}
export async function listPlans(): Promise<PlanDef[]> {
  const { data, error } = await supabase.rpc('admin_list_plans'); if (error) throw error; return (data ?? []) as PlanDef[];
}
export async function setPlanPrice(key: string, priceCents: number, currency = 'TRY'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_plan_price', { p_key: key, p_price_cents: priceCents, p_currency: currency }); if (error) throw error;
}
export async function listInvoices(status?: string | null, limit = 100): Promise<PlatformInvoice[]> {
  const { data, error } = await supabase.rpc('admin_list_invoices', { p_status: status ?? null, p_limit: limit }); if (error) throw error; return (data ?? []) as PlatformInvoice[];
}
export async function labBilling(labId: string): Promise<LabBilling> {
  const { data, error } = await supabase.rpc('admin_lab_billing', { p_lab: labId }); if (error) throw error; return data as LabBilling;
}
export async function createInvoice(labId: string, amountCents: number, opts?: { currency?: string; planKey?: string | null; dueAt?: string | null; note?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('admin_create_invoice', { p_lab: labId, p_amount_cents: amountCents, p_currency: opts?.currency ?? 'TRY', p_plan_key: opts?.planKey ?? null, p_period_start: null, p_period_end: null, p_due_at: opts?.dueAt ?? null, p_note: opts?.note ?? null }); if (error) throw error;
}
export async function setInvoiceStatus(id: number, status: 'open' | 'paid' | 'void'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_invoice_status', { p_id: id, p_status: status }); if (error) throw error;
}

// ── F5: compliance (KVKK) ──
export async function exportLabData(id: string): Promise<any> {
  const { data, error } = await supabase.rpc('admin_export_lab_data', { p_lab: id }); if (error) throw error; return data;
}
export async function purgeLabPii(id: string, confirmName: string): Promise<any> {
  const { data, error } = await supabase.rpc('admin_purge_lab_pii', { p_lab: id, p_confirm_name: confirmName }); if (error) throw error; return data;
}

// ── F6: cross-tenant user management ──
export type PlatformUser = { id: string; name: string | null; email: string | null; lab_id: string | null; lab_name: string | null; user_type: string; role: string | null; is_active: boolean; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean };
export const USER_ROLES = ['manager', 'technician', 'courier', 'accounting', 'service', 'receptionist', 'intern'] as const;

export async function listUsers(search?: string | null, labId?: string | null, limit = 300): Promise<PlatformUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users', { p_search: search ?? null, p_lab: labId ?? null, p_limit: limit });
  if (error) throw error; return (data ?? []) as PlatformUser[];
}
export async function setUserActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_active', { p_user: id, p_active: active }); if (error) throw error;
}
export async function setUserRole(id: string, role: string | null): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_role', { p_user: id, p_role: role }); if (error) throw error;
}
export async function moveUserLab(id: string, labId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_move_user_lab', { p_user: id, p_lab: labId }); if (error) throw error;
}
export async function anonymizeUser(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_anonymize_user', { p_user: id }); if (error) throw error;
}
/** Kullanıcıya standart şifre-sıfırlama e-postası gönderir (client akışı). */
export async function sendPasswordReset(email: string): Promise<void> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/(auth)/login` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
}

// ── F7: system settings ──
export type PlatformSettings = Record<string, any>;
export async function getSettings(): Promise<PlatformSettings> {
  const { data, error } = await supabase.rpc('admin_get_settings'); if (error) throw error; return (data ?? {}) as PlatformSettings;
}
export async function setSetting(key: string, value: any): Promise<void> {
  const { error } = await supabase.rpc('admin_set_setting', { p_key: key, p_value: value }); if (error) throw error;
}
export async function publicPlatformStatus(): Promise<{ maintenance_mode: boolean; maintenance_message: string; registration_open: boolean; app_name: string }> {
  const { data, error } = await supabase.rpc('public_platform_status'); if (error) throw error; return data as any;
}

// ── F8: usage & limits ──
export type LabUsage = { plan_limits: Record<string, number>; overrides: Record<string, number>; limits: Record<string, number>; usage: Record<string, number> };
export const LIMIT_METRICS: { key: string; label: string }[] = [
  { key: 'users', label: 'Kullanıcı' },
  { key: 'orders_month', label: 'Aylık sipariş' },
];
export async function labUsage(labId: string): Promise<LabUsage> {
  const { data, error } = await supabase.rpc('admin_lab_usage', { p_lab: labId }); if (error) throw error; return data as LabUsage;
}
export async function setLabLimits(labId: string, limits: Record<string, number>): Promise<void> {
  const { error } = await supabase.rpc('admin_set_lab_limits', { p_lab: labId, p_limits: limits }); if (error) throw error;
}
export async function setPlanLimits(key: string, limits: Record<string, number>): Promise<void> {
  const { error } = await supabase.rpc('admin_set_plan_limits', { p_key: key, p_limits: limits }); if (error) throw error;
}
