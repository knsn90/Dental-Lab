import { supabase } from '../../core/api/supabase';

// AI ile katalog kapak/tanıtım metni üret (ai-catalog-copy edge function)
export interface AiCatalogCopy {
  coverTitle: string; coverSubtitle: string; coverTagline: string;
  aboutTitle: string; aboutText: string; whyUs: string[];
}
export async function aiCatalogCopy(
  labName: string, categories: string[], services: string[],
): Promise<{ ok: boolean; data?: AiCatalogCopy; error?: string }> {
  const { data, error } = await supabase.functions.invoke('ai-catalog-copy', { body: { labName, categories, services } });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; data?: AiCatalogCopy; error?: string };
}

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
  production_days?: number | null;
  price_type?: 'fixed' | 'percent' | 'free';
  unit?: string | null;
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
    production_days: number | null;
    price_type: 'fixed' | 'percent' | 'free';
    unit: string | null;
  }>
) {
  return supabase.from('lab_services').update(data).eq('id', id).select().single();
}

export async function deleteLabService(id: string) {
  return supabase.from('lab_services').delete().eq('id', id);
}
