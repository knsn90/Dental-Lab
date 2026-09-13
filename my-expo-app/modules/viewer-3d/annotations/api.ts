/**
 * Tarama notları — Supabase erişimi.
 *
 * Okuma: RLS ile doğrudan tablodan (siparişin tarafları görür).
 * Yazma: yalnız SECURITY DEFINER RPC — lab_id / yazar alanları sunucuda
 * doldurulur, istemci uyduramaz (bkz. 20260912200000_scan_annotations.sql).
 */
import { supabase } from '../../../core/api/supabase';
import type { NewScanAnnotation, Point3, ScanAnnotation } from './types';

const COLS =
  'id, work_order_id, file_name, kind, color, width, points, text, camera, author_id, author_name, author_side, created_at';

function toPoints(raw: any): Point3[] {
  if (!Array.isArray(raw)) return [];
  const out: Point3[] = [];
  for (const p of raw) {
    if (Array.isArray(p) && p.length >= 3) {
      const x = Number(p[0]), y = Number(p[1]), z = Number(p[2]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) out.push([x, y, z]);
    }
  }
  return out;
}

function mapRow(r: any): ScanAnnotation {
  return {
    id: r.id,
    workOrderId: r.work_order_id,
    fileName: r.file_name ?? null,
    kind: r.kind,
    color: r.color ?? '#DC2626',
    width: Number(r.width) || 0.35,
    points: toPoints(r.points),
    text: r.text ?? null,
    camera: r.camera ?? null,
    authorId: r.author_id ?? null,
    authorName: r.author_name ?? null,
    authorSide: r.author_side === 'lab' ? 'lab' : 'clinic',
    createdAt: r.created_at,
  };
}

/** Siparişin tüm tarama notları (eskiden yeniye). */
export async function fetchScanAnnotations(orderId: string): Promise<ScanAnnotation[]> {
  const { data, error } = await supabase
    .from('order_scan_annotations')
    .select(COLS)
    .eq('work_order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Yeni çizim/not — id döner. */
export async function addScanAnnotation(input: NewScanAnnotation): Promise<string> {
  const { data, error } = await supabase.rpc('add_scan_annotation', {
    p_order: input.orderId,
    p_kind: input.kind,
    p_points: input.points,
    p_file_name: input.fileName ?? null,
    p_color: input.color ?? '#DC2626',
    p_width: input.width ?? 0.35,
    p_text: input.text ?? null,
    p_camera: input.camera ?? null,
  });
  if (error) throw error;
  return String(data);
}

/** Metin/renk güncelle — yalnız notu ekleyen. */
export async function updateScanAnnotation(
  id: string,
  patch: { text?: string; color?: string },
): Promise<void> {
  const { error } = await supabase.rpc('update_scan_annotation', {
    p_id: id,
    p_text: patch.text ?? null,
    p_color: patch.color ?? null,
  });
  if (error) throw error;
}

/** Sil — kendi notu herkes, başkasının notunu yalnız lab yöneticisi. */
export async function deleteScanAnnotation(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_scan_annotation', { p_id: id });
  if (error) throw error;
}
