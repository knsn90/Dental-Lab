/**
 * PDF antet (letterhead) çekicileri. ClinicStatementScreen'deki özel fetchLab / fetchSelfViewLab ile
 * aynı mantık; o dosya bu bileşenlerin içe aktardığı zincirde olduğundan döngü olmasın diye burada.
 */
import { supabase } from '../../core/api/supabase';
import { useActiveLabStore } from '../../core/store/activeLabStore';
import type { LabLetterhead } from '../receipt/buildReceiptHtml';

let _cachedLab: LabLetterhead | null = null;

/** Lab tarafı: oturumdaki kullanıcının lab'ı. */
export async function fetchLabLetterhead(): Promise<LabLetterhead> {
  if (_cachedLab) return _cachedLab;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { id: '', name: 'Lab' };
  const { data: profile } = await supabase.from('profiles').select('lab_id').eq('id', user.id).single();
  if (!profile?.lab_id) return { id: '', name: 'Lab' };
  const { data } = await supabase
    .from('labs')
    .select('id, name, address, phone, email, website, tax_number, logo_url')
    .eq('id', profile.lab_id)
    .single();
  _cachedLab = (data ?? { id: profile.lab_id, name: 'Lab' }) as LabLetterhead;
  return _cachedLab;
}

/** Klinik/hekim (selfView): lab markası get_lab_brand RPC'sinden. */
export async function fetchSelfViewLetterhead(): Promise<LabLetterhead> {
  let labId: string | null = useActiveLabStore.getState().active?.lab_id ?? null;
  if (!labId) {
    const { data } = await supabase.from('clinics').select('lab_id').limit(1).maybeSingle();
    labId = (data as any)?.lab_id ?? null;
  }
  if (!labId) return { id: '', name: 'Lab' };
  const { data: lab } = await supabase.rpc('get_lab_brand', { p_lab_id: labId }).maybeSingle();
  const b = lab as any;
  return {
    id: labId, name: b?.name ?? 'Lab', logo_url: b?.logo_url ?? null, website: b?.website ?? null,
    address: b?.address ?? null, phone: b?.phone ?? null, email: b?.email ?? null, tax_number: b?.tax_number ?? null,
  } as LabLetterhead;
}
