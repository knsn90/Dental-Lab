import { supabase } from '../../core/api/supabase';

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
