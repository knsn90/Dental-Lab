/**
 * İmplant marka/model kataloğu — istemci katmanı (lab başına).
 *
 * DB: implant_brands / implant_models (migration 20261112120000). Okuma ve ekleme
 * SECURITY DEFINER RPC'lerle; sunucu lab erişimini kendisi denetler.
 *  - implant_catalog_list(p_lab, p_include_hidden) → marka + modeller (ilk okumada tohumlar)
 *  - implant_catalog_add_brand / add_model → aynı ad varsa mevcut kaydı döner
 *  - implant_catalog_update / merge_brand → yalnız lab yöneticisi
 *
 * Bellek önbelleği lab başına tutulur; bir ekleme bütün açık seçicilere yansır.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../core/api/supabase';
import { useAuthStore } from '../../core/store/authStore';
import { useActiveLabStore } from '../../core/store/activeLabStore';
import type { CatalogBrand } from './implantCatalogModel';

export type { CatalogBrand, CatalogModel } from './implantCatalogModel';

type Entry = { brands: CatalogBrand[] | null; loading: boolean; error: string | null };
const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<void>>();

function emit(labId: string) { listeners.get(labId)?.forEach(fn => fn()); }
function setEntry(labId: string, patch: Partial<Entry>) {
  const cur = cache.get(labId) ?? { brands: null, loading: false, error: null };
  cache.set(labId, { ...cur, ...patch });
  emit(labId);
}

function errText(e: any): string {
  const m = String(e?.message ?? e ?? '');
  if (m.includes('IMPLANT_SCOPE')) return 'Bu işlem için yetkin yok.';
  if (m.includes('IMPLANT_NAME_TAKEN')) return 'Bu ad zaten kullanılıyor.';
  if (m.includes('IMPLANT_NAME_INVALID')) return 'Geçerli bir ad yaz (en fazla 60 karakter).';
  return m || 'İşlem başarısız.';
}

export async function fetchImplantCatalog(labId: string, includeHidden = false): Promise<CatalogBrand[]> {
  const { data, error } = await supabase.rpc('implant_catalog_list', { p_lab: labId, p_include_hidden: includeHidden });
  if (error) throw new Error(errText(error));
  return Array.isArray(data) ? (data as CatalogBrand[]) : [];
}

export function refreshImplantCatalog(labId: string): Promise<void> {
  const running = inflight.get(labId);
  if (running) return running;
  setEntry(labId, { loading: true, error: null });
  const p = fetchImplantCatalog(labId)
    .then(brands => setEntry(labId, { brands, loading: false }))
    .catch(e => setEntry(labId, { loading: false, error: errText(e) }))
    .finally(() => inflight.delete(labId));
  inflight.set(labId, p);
  return p;
}

export async function addImplantBrand(labId: string, name: string): Promise<{ id: string; name: string; existed: boolean }> {
  const { data, error } = await supabase.rpc('implant_catalog_add_brand', { p_lab: labId, p_name: name });
  if (error) throw new Error(errText(error));
  await refreshImplantCatalog(labId);
  return data as any;
}

export async function addImplantModel(labId: string, brandId: string, name: string): Promise<{ id: string; name: string; existed: boolean }> {
  const { data, error } = await supabase.rpc('implant_catalog_add_model', { p_brand: brandId, p_name: name });
  if (error) throw new Error(errText(error));
  await refreshImplantCatalog(labId);
  return data as any;
}

export async function updateImplantCatalogItem(
  labId: string, kind: 'brand' | 'model', id: string, patch: { name?: string; hidden?: boolean },
): Promise<void> {
  const { error } = await supabase.rpc('implant_catalog_update', {
    p_kind: kind, p_id: id, p_name: patch.name ?? null, p_hidden: patch.hidden ?? null,
  });
  if (error) throw new Error(errText(error));
  await refreshImplantCatalog(labId);
}

export async function mergeImplantBrand(labId: string, fromId: string, intoId: string): Promise<void> {
  const { error } = await supabase.rpc('implant_catalog_merge_brand', { p_from: fromId, p_into: intoId });
  if (error) throw new Error(errText(error));
  await refreshImplantCatalog(labId);
}

/** Siparişin gideceği lab: aktif lab (çoklu-lab klinik) > profil lab'ı. */
export function useCatalogLabId(): string | null {
  const active = useActiveLabStore(s => s.active?.lab_id ?? null);
  const profileLab = useAuthStore(s => (s.profile as any)?.lab_id ?? null);
  return active ?? profileLab;
}

/**
 * Lab'ın kataloğu. `brands` null → henüz yüklenmedi ya da erişilemedi; seçici
 * bu durumda koddaki sabit listeye düşer (form hiçbir zaman boş kalmaz).
 */
export function useImplantCatalog(labIdArg?: string | null) {
  const fallbackLab = useCatalogLabId();
  const labId = labIdArg ?? fallbackLab;
  const [, force] = useState(0);

  useEffect(() => {
    if (!labId) return;
    const fn = () => force(n => n + 1);
    if (!listeners.has(labId)) listeners.set(labId, new Set());
    listeners.get(labId)!.add(fn);
    const e = cache.get(labId);
    if (!e || (!e.brands && !e.loading)) refreshImplantCatalog(labId);
    return () => { listeners.get(labId)?.delete(fn); };
  }, [labId]);

  const entry = labId ? cache.get(labId) : undefined;
  const reload = useCallback(() => (labId ? refreshImplantCatalog(labId) : Promise.resolve()), [labId]);
  return {
    labId,
    brands: entry?.brands ?? null,
    loading: !!entry?.loading,
    error: entry?.error ?? null,
    reload,
  };
}
