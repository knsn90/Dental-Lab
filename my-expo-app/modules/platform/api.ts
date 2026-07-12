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
