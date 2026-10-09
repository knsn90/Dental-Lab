import { supabase } from '../../core/api/supabase';

export type PhoneLeadStatus = 'new' | 'called' | 'closed';

export interface PhoneLeadTurn { role: 'user' | 'assistant'; text: string }

export interface PhoneLead {
  id: string;
  call_id: string;
  caller_number: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  request: string | null;
  summary: string | null;
  wants_callback: boolean;
  language: string | null;
  transcript: PhoneLeadTurn[];
  duration_sec: number | null;
  status: PhoneLeadStatus;
  note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  anonymized_at: string | null;
  created_at: string;
}

const COLUMNS =
  'id, call_id, caller_number, contact_name, contact_phone, request, summary, wants_callback, language, ' +
  'transcript, duration_sec, status, note, handled_by, handled_at, anonymized_at, created_at';

/** Görünürlük RLS ile: aynı lab + admin/müdür + modül açık. */
export async function listPhoneLeads(limit = 300): Promise<PhoneLead[]> {
  const { data, error } = await supabase
    .from('phone_leads')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as PhoneLead[]).map((l) => ({
    ...l,
    transcript: Array.isArray(l.transcript) ? l.transcript : [],
  }));
}

/** Durum + not: doğrudan UPDATE kapalı, yalnız RPC (yetki ve modül sunucuda kontrol edilir). */
export async function setPhoneLeadStatus(id: string, status: PhoneLeadStatus, note?: string | null): Promise<PhoneLead> {
  const { data, error } = await supabase.rpc('set_phone_lead_status', {
    p_id: id,
    p_status: status,
    p_note: note === undefined ? null : note,
  });
  if (error) throw error;
  return data as unknown as PhoneLead;
}

/** "05342649620" -> "0534 264 96 20" (görüntüleme). */
export function formatPhone(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  if (d.length === 10) return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  return raw ? String(raw) : '';
}
