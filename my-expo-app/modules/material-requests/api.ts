/**
 * Malzeme & Sarf Talebi — veri katmanı.
 *
 * 3 kademeli onay zinciri:
 *   Teknisyen → Mesul Müdür → Admin (manager kendi talebi = direkt admin)
 *
 * RPC'ler 20260530180000_material_requests.sql migration'ı tarafından sağlanır.
 */

import { supabase } from '../../core/api/supabase';

/* ────────────────────────────────────────────────────────────────────── */
/*  Tipler                                                                */
/* ────────────────────────────────────────────────────────────────────── */

export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'forwarded_admin'
  | 'rejected_manager'
  | 'rejected_admin'
  | 'approved'
  | 'ordered'
  | 'received'
  | 'cancelled'
  | 'closed';

export type RequestUrgency = 'low' | 'normal' | 'high' | 'critical';

export type RequesterType  = 'technician' | 'manager' | 'other';

export type ItemCategory = 'sarf' | 'alet' | 'el_aleti' | 'kimyasal' | 'muhtelif';

export interface CatalogItem {
  id: string;
  name: string;
  category: ItemCategory;
  unit: string;
  default_qty: number;
  notes: string | null;
  is_active: boolean;
}

export interface MaterialRequestItemRow {
  id: string;
  catalog_id: string | null;
  name: string;
  category: string | null;
  unit: string;
  quantity: number;
  est_unit_cost: number | null;
  approved_qty: number | null;
  actual_unit_cost: number | null;
  notes: string | null;
  sort_order: number;
}

export interface RequesterMini {
  id: string;
  full_name: string | null;
}

export interface MaterialRequestRow {
  id: string;
  request_no: string;
  lab_id: string;
  requester_id: string | null;
  requester_type: RequesterType;
  requester?: RequesterMini | null;

  title: string;
  reason: string | null;
  urgency: RequestUrgency;
  needed_by: string | null;
  attachment_url: string | null;

  status: RequestStatus;

  manager_id: string | null;
  manager?: RequesterMini | null;
  manager_action_at: string | null;
  manager_note: string | null;

  admin_id: string | null;
  admin?: RequesterMini | null;
  admin_action_at: string | null;
  admin_note: string | null;
  reject_reason: string | null;

  supplier_id: string | null;
  ordered_at: string | null;
  expected_at: string | null;
  received_at: string | null;
  total_cost: number | null;

  submitted_at: string;
  created_at: string;
  updated_at: string;

  items?: MaterialRequestItemRow[];
  events?: MaterialRequestEventRow[];

  // hesaplanmış alanlar (api ekler)
  item_count?: number;
  est_total?: number;
}

export interface MaterialRequestEventRow {
  id: string;
  request_id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  note: string | null;
  payload: Record<string, any>;
  created_at: string;
  actor?: RequesterMini | null;
}

export interface NewRequestItemInput {
  catalog_id?: string | null;
  name: string;
  category?: ItemCategory | string | null;
  unit: string;
  quantity: number;
  est_unit_cost?: number | null;
  notes?: string | null;
}

export interface CreateRequestInput {
  title: string;
  items: NewRequestItemInput[];
  reason?: string | null;
  urgency?: RequestUrgency;
  needed_by?: string | null;     // 'YYYY-MM-DD'
  attachment_url?: string | null;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Yardımcılar                                                           */
/* ────────────────────────────────────────────────────────────────────── */

const computeTotals = (items: MaterialRequestItemRow[] | undefined): { count: number; est: number } => {
  if (!items?.length) return { count: 0, est: 0 };
  const est = items.reduce(
    (s, i) => s + Number(i.quantity ?? 0) * Number(i.est_unit_cost ?? 0),
    0,
  );
  return { count: items.length, est };
};

/* ────────────────────────────────────────────────────────────────────── */
/*  Catalog                                                                */
/* ────────────────────────────────────────────────────────────────────── */

export async function fetchCatalog(opts?: { activeOnly?: boolean }): Promise<CatalogItem[]> {
  let q = supabase
    .from('material_request_catalog')
    .select('id, name, category, unit, default_qty, notes, is_active')
    .order('name', { ascending: true });
  if (opts?.activeOnly !== false) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

export async function upsertCatalogItem(input: Partial<CatalogItem> & { name: string }): Promise<CatalogItem> {
  const payload = {
    name: input.name,
    category: input.category ?? 'sarf',
    unit: input.unit ?? 'adet',
    default_qty: input.default_qty ?? 1,
    notes: input.notes ?? null,
    is_active: input.is_active ?? true,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from('material_request_catalog')
      .update(payload)
      .eq('id', input.id)
      .select('id, name, category, unit, default_qty, notes, is_active')
      .single();
    if (error) throw error;
    return data as CatalogItem;
  }
  const { data, error } = await supabase
    .from('material_request_catalog')
    .insert(payload)
    .select('id, name, category, unit, default_qty, notes, is_active')
    .single();
  if (error) throw error;
  return data as CatalogItem;
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const { error } = await supabase.from('material_request_catalog').delete().eq('id', id);
  if (error) throw error;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Requests — list / detail                                              */
/* ────────────────────────────────────────────────────────────────────── */

const REQUEST_SELECT = `
  id, request_no, lab_id,
  requester_id, requester_type,
  requester:requester_id(id, full_name),
  title, reason, urgency, needed_by, attachment_url,
  status,
  manager_id, manager_action_at, manager_note,
  manager:manager_id(id, full_name),
  admin_id, admin_action_at, admin_note,
  admin:admin_id(id, full_name),
  reject_reason,
  supplier_id, ordered_at, expected_at, received_at, total_cost,
  submitted_at, created_at, updated_at,
  items:material_request_items(
    id, catalog_id, name, category, unit, quantity,
    est_unit_cost, approved_qty, actual_unit_cost, notes, sort_order
  )
`;

export interface ListRequestsFilter {
  status?: RequestStatus | RequestStatus[];
  mine?: boolean;                 // yalnız kendi talebim
  requesterTypes?: RequesterType[];
  search?: string;
}

export async function listRequests(filter: ListRequestsFilter = {}): Promise<MaterialRequestRow[]> {
  let q = supabase
    .from('material_requests')
    .select(REQUEST_SELECT)
    .order('submitted_at', { ascending: false })
    .limit(500);

  if (filter.status) {
    if (Array.isArray(filter.status)) q = q.in('status', filter.status);
    else q = q.eq('status', filter.status);
  }
  if (filter.requesterTypes?.length) q = q.in('requester_type', filter.requesterTypes);
  if (filter.mine) {
    const user = (await supabase.auth.getUser()).data.user;
    if (user?.id) q = q.eq('requester_id', user.id);
  }
  if (filter.search && filter.search.trim()) {
    const s = filter.search.trim();
    q = q.or(`title.ilike.%${s}%,request_no.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any): MaterialRequestRow => {
    const items = (r.items ?? []).sort(
      (a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
    );
    const totals = computeTotals(items);
    return { ...r, items, item_count: totals.count, est_total: totals.est };
  });
}

export async function getRequest(id: string): Promise<MaterialRequestRow | null> {
  const { data, error } = await supabase
    .from('material_requests')
    .select(REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const items = ((data as any).items ?? []).sort(
    (a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  );
  const totals = computeTotals(items);
  return { ...(data as any), items, item_count: totals.count, est_total: totals.est };
}

export async function getRequestEvents(id: string): Promise<MaterialRequestEventRow[]> {
  const { data, error } = await supabase
    .from('material_request_events')
    .select(`
      id, request_id, actor_id, actor_role, action, note, payload, created_at,
      actor:actor_id(id, full_name)
    `)
    .eq('request_id', id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  RPC çağrıları                                                          */
/* ────────────────────────────────────────────────────────────────────── */

export async function createRequest(input: CreateRequestInput): Promise<string> {
  const items = (input.items ?? [])
    .filter(i => i.name?.trim() && Number(i.quantity) > 0)
    .map(i => ({
      catalog_id:    i.catalog_id ?? null,
      name:          i.name.trim(),
      category:      i.category ?? null,
      unit:          (i.unit ?? 'adet').trim() || 'adet',
      quantity:      Number(i.quantity),
      est_unit_cost: i.est_unit_cost != null ? Number(i.est_unit_cost) : null,
      notes:         i.notes ?? null,
    }));
  if (items.length === 0) throw new Error('En az bir kalem giriniz.');

  const { data, error } = await supabase.rpc('create_material_request', {
    p_title:      input.title.trim(),
    p_items:      items,
    p_reason:     input.reason ?? null,
    p_urgency:    input.urgency ?? 'normal',
    p_needed_by:  input.needed_by ?? null,
    p_attachment: input.attachment_url ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function managerForward(id: string, note?: string | null): Promise<void> {
  const { error } = await supabase.rpc('manager_forward_request', {
    p_request_id: id,
    p_note: note ?? null,
  });
  if (error) throw error;
}

export async function managerReject(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('manager_reject_request', {
    p_request_id: id,
    p_reason: reason,
  });
  if (error) throw error;
}

export interface AdminApproveItem {
  id: string;
  approved_qty?: number | null;
  actual_unit_cost?: number | null;
}

export async function adminApprove(
  id: string,
  items?: AdminApproveItem[] | null,
  note?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('admin_approve_request', {
    p_request_id: id,
    p_items: items && items.length ? items : null,
    p_note: note ?? null,
  });
  if (error) throw error;
}

export async function adminReject(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reject_request', {
    p_request_id: id,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function markOrdered(
  id: string,
  opts: {
    supplierId?: string | null;
    orderedAt?: string;       // 'YYYY-MM-DD'
    expectedAt?: string | null;
    totalCost?: number | null;
  } = {},
): Promise<void> {
  const { error } = await supabase.rpc('mark_request_ordered', {
    p_request_id:  id,
    p_supplier_id: opts.supplierId ?? null,
    p_ordered_at:  opts.orderedAt ?? new Date().toISOString().slice(0, 10),
    p_expected_at: opts.expectedAt ?? null,
    p_total_cost:  opts.totalCost ?? null,
  });
  if (error) throw error;
}

export async function markReceived(id: string, receivedAt?: string): Promise<void> {
  const { error } = await supabase.rpc('mark_request_received', {
    p_request_id: id,
    p_received_at: receivedAt ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
}

export async function cancelRequest(id: string, reason?: string | null): Promise<void> {
  const { error } = await supabase.rpc('cancel_material_request', {
    p_request_id: id,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Sayısal özetler — dashboard sayaçları                                  */
/* ────────────────────────────────────────────────────────────────────── */

export interface RequestCounts {
  submitted: number;
  forwarded_admin: number;
  approved: number;
  ordered: number;
  received: number;
  rejected: number;
  cancelled: number;
  total_open: number;        // submitted + forwarded + approved + ordered
}

export async function getRequestCounts(): Promise<RequestCounts> {
  const { data, error } = await supabase
    .from('material_requests')
    .select('status');
  if (error) throw error;
  const c: RequestCounts = {
    submitted: 0, forwarded_admin: 0, approved: 0, ordered: 0,
    received: 0, rejected: 0, cancelled: 0, total_open: 0,
  };
  for (const r of (data ?? []) as any[]) {
    switch (r.status) {
      case 'submitted':        c.submitted++; break;
      case 'forwarded_admin':  c.forwarded_admin++; break;
      case 'approved':         c.approved++; break;
      case 'ordered':          c.ordered++; break;
      case 'received':         c.received++; break;
      case 'rejected_manager':
      case 'rejected_admin':   c.rejected++; break;
      case 'cancelled':        c.cancelled++; break;
    }
  }
  c.total_open = c.submitted + c.forwarded_admin + c.approved + c.ordered;
  return c;
}
