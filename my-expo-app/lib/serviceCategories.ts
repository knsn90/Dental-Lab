import { supabase } from './supabase';

// Fiyat listesi kategorileri — `categories` tablosu (lab-scoped, RLS: lab/admin yönetir).
// Hizmetler kategoriyi metin (lab_services.category) ile referanslar; bu tablo
// kategori listesinin kalıcı kaynağıdır (boş kategoriler de saklanabilir).

export interface ServiceCategory {
  id: string;
  name: string;
  lab_id: string | null;
}

export async function fetchCategories(labId: string) {
  return supabase
    .from('categories')
    .select('id, name, lab_id')
    .eq('lab_id', labId)
    .order('name');
}

export async function createCategory(labId: string, name: string) {
  return supabase.from('categories').insert({ lab_id: labId, name: name.trim() }).select().single();
}

export async function renameCategoryRow(id: string, name: string) {
  return supabase.from('categories').update({ name: name.trim() }).eq('id', id).select().single();
}

export async function deleteCategoryRow(id: string) {
  return supabase.from('categories').delete().eq('id', id);
}
