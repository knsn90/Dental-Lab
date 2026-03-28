import { supabase } from './supabase';

export async function fetchLabServices() {
  return supabase
    .from('lab_services')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('sort_order')
    .order('name');
}

export async function fetchAllLabServices() {
  return supabase
    .from('lab_services')
    .select('*')
    .order('category')
    .order('sort_order')
    .order('name');
}

export async function createLabService(data: {
  name: string;
  category?: string;
  price?: number;
  currency?: string;
  sort_order?: number;
}) {
  return supabase.from('lab_services').insert(data).select().single();
}

export async function updateLabService(
  id: string,
  data: Partial<{
    name: string;
    category: string;
    price: number;
    currency: string;
    is_active: boolean;
    sort_order: number;
  }>
) {
  return supabase.from('lab_services').update(data).eq('id', id).select().single();
}

// Order items
export async function fetchOrderItems(workOrderId: string) {
  return supabase
    .from('order_items')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('created_at');
}

export async function addOrderItem(data: {
  work_order_id: string;
  service_id?: string;
  name: string;
  price: number;
  quantity?: number;
  notes?: string;
}) {
  return supabase.from('order_items').insert(data).select().single();
}

export async function updateOrderItem(
  id: string,
  data: Partial<{ price: number; quantity: number; notes: string }>
) {
  return supabase.from('order_items').update(data).eq('id', id).select().single();
}

export async function deleteOrderItem(id: string) {
  return supabase.from('order_items').delete().eq('id', id);
}
