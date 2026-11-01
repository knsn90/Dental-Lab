/**
 * Lab fatura bilgileri — okuma/kaydetme (kurallar: ./labBilling).
 *
 * labs.address GÖRÜNEN adrestir ve kaydederken yapılandırılmış alanlardan
 * yeniden oluşturulur — iki ayrı adres tutulmaz.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../core/api/supabase';
import { useAuthStore } from '../../core/store/authStore';
import {
  normalizeLabBilling, validateLabBilling, composeLabAddress, splitLegacyAddress,
  missingLabBillingFields, type LabBilling, type LabBillingField,
} from './labBilling';

const COLS = 'legal_name, tax_number, tax_office, street, district, city, postal_code, address';

export async function fetchLabBilling(labId: string): Promise<{ billing: LabBilling; prefilledFromAddress: boolean }> {
  const { data } = await supabase.from('labs').select(COLS).eq('id', labId).maybeSingle();
  const row = (data ?? null) as Record<string, unknown> | null;
  const b = normalizeLabBilling(row as any);
  // Yapılandırılmış adres hiç girilmemiş → eski tek satır adresten ilk doldurma
  // (kullanıcı kontrol edip kaydeder; kaydedilene kadar DB'ye yazılmaz).
  if (!b.street && !b.district && !b.city && row?.address) {
    return { billing: { ...b, ...splitLegacyAddress(String(row.address)) }, prefilledFromAddress: true };
  }
  return { billing: b, prefilledFromAddress: false };
}

export async function saveLabBilling(
  labId: string,
  input: LabBilling,
): Promise<{ ok: true; billing: LabBilling } | { ok: false; error: string; fields?: Partial<Record<LabBillingField, string>> }> {
  const b = normalizeLabBilling(input);
  const fields = validateLabBilling(b);
  if (Object.keys(fields).length) return { ok: false, error: 'Eksik ya da hatalı alanlar var', fields };
  const { error } = await supabase.from('labs').update({
    legal_name: b.legal_name,
    tax_number: b.tax_number,
    tax_office: b.tax_office,
    street: b.street,
    district: b.district,
    city: b.city,
    postal_code: b.postal_code || null,
    address: composeLabAddress(b),
  }).eq('id', labId);
  return error ? { ok: false, error: error.message } : { ok: true, billing: b };
}

/** Fatura bilgileri tamam mı — e-fatura paneli gönderimi buna göre kilitler. */
export function useLabBillingStatus(): { loading: boolean; complete: boolean; missing: LabBillingField[] } {
  const labId = (useAuthStore((s) => s.profile) as any)?.lab_id as string | undefined;
  const [state, setState] = useState<{ loading: boolean; complete: boolean; missing: LabBillingField[] }>({
    loading: true, complete: false, missing: [],
  });
  useEffect(() => {
    if (!labId) { setState({ loading: false, complete: false, missing: [] }); return; }
    let alive = true;
    supabase.from('labs').select(COLS).eq('id', labId).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const b = normalizeLabBilling(data as any);
      const missing = missingLabBillingFields(b);
      const valid = Object.keys(validateLabBilling(b)).length === 0;
      setState({ loading: false, complete: valid, missing });
    });
    return () => { alive = false; };
  }, [labId]);
  return state;
}
