/**
 * Prova takibi — RPC sarmalayıcıları (20261027161000 motor, 20261027162000 randevu + okuma).
 * Yazmaların hepsi sunucuda yetki denetimli SECURITY DEFINER fonksiyonlardan geçer; istemci
 * provas / order_appointments tablolarına doğrudan yazmaz.
 */
import { supabase } from '../../../core/api/supabase';
import type { ProvaSnapshot, ProvaFlag } from './provaModel';

export type ProvaResult<T = void> = { ok: boolean; error?: string; data?: T };

function err(e: any): string {
  return (e?.message as string) || 'Hata oluştu';
}

async function call<T = void>(fn: string, args: Record<string, unknown>): Promise<ProvaResult<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: err(error) };
  return { ok: true, data: data as T };
}

export function fetchProvaSnapshot(orderId: string): Promise<ProvaResult<ProvaSnapshot>> {
  return call<ProvaSnapshot>('order_prova_snapshot', { p_order: orderId });
}

export function fetchProvaFlags(): Promise<ProvaResult<ProvaFlag[]>> {
  return call<ProvaFlag[]>('order_prova_flags', {});
}

export function provaCreate(orderId: string, opts: { itemId?: string | null; itemName?: string | null; type?: string | null } = {}) {
  return call<string>('prova_create', {
    p_order: orderId, p_item_id: opts.itemId ?? null, p_item_name: opts.itemName ?? null, p_type: opts.type ?? null,
  });
}

/** `day` YYYY-MM-DD; boşsa bugün (lab saat dilimi). */
export function provaMarkSent(provaId: string, day?: string | null) {
  return call('prova_mark_sent', { p_prova: provaId, p_day: day ?? null });
}

export function provaMarkReturned(provaId: string, day?: string | null, note?: string | null) {
  return call('prova_mark_returned', { p_prova: provaId, p_day: day ?? null, p_note: note ?? null });
}

export function provaClientReturned(provaId: string) {
  return call('prova_client_returned', { p_prova: provaId });
}

export function provaUndo(provaId: string) {
  return call('prova_undo', { p_prova: provaId });
}

export function provaSetNote(provaId: string, note: string) {
  return call('prova_set_note', { p_prova: provaId, p_note: note });
}

/** `apptId` null → yeni randevu. Sunucu, yetkiye ve planlama durumuna göre doğrudan yazar ya da öneri yapar. */
export function apptSave(orderId: string, apptId: string | null, kind: 'prova' | 'takma', date: string, time?: string | null) {
  return call<string>('appt_save', { p_order: orderId, p_appt: apptId, p_kind: kind, p_date: date, p_time: time || null });
}

export function apptRemove(apptId: string) {
  return call('appt_remove', { p_appt: apptId });
}

export function apptReview(apptId: string, approve: boolean, note?: string | null) {
  return call('appt_review', { p_appt: apptId, p_approve: approve, p_note: note ?? null });
}
