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
