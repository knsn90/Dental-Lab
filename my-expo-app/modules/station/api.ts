// modules/station/api.ts
// Teknisyen istasyon uygulaması — Supabase API katmanı

import { supabase } from '../../core/api/supabase';

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface StationJob {
  // order_stages alanları
  id: string;
  work_order_id: string;
  station_id: string;
  sequence_order: number;
  status: 'bekliyor' | 'aktif' | 'tamamlandi' | 'onaylandi' | 'reddedildi';
  is_critical: boolean;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  technician_note: string | null;
  manager_note: string | null;
  duration_min: number | null;
  // İş emri bilgisi (join)
  work_order: {
    order_number: string;
    work_type: string;
    tooth_numbers: number[];
    shade: string | null;
    delivery_date: string;
    is_rush: boolean;
    notes: string | null;
    doctor_name: string | null;
    clinic_name: string | null;
    box_code: string | null;
  };
  // İstasyon bilgisi
  station_name: string;
  station_color: string;
}

// ── Sorgular ──────────────────────────────────────────────────────────────────

/** Teknisyene atanan tüm aktif/bekleyen aşamaları getir */
export async function fetchMyStages(technicianId: string) {
  const { data, error } = await supabase
    .from('order_stages')
    .select(`
      id,
      work_order_id,
      station_id,
      sequence_order,
      status,
      is_critical,
      assigned_at,
      started_at,
      completed_at,
      technician_note,
      manager_note,
      duration_min,
      work_orders!work_order_id (
        order_number,
        work_type,
        tooth_numbers,
        shade,
        delivery_date,
        is_rush,
        notes,
        manager_notes,
        doctor:doctor_id ( full_name, clinic_name ),
        box:box_id ( box_code )
      ),
      station:station_id ( name, color )
    `)
    .eq('technician_id', technicianId)
    .in('status', ['bekliyor', 'aktif', 'tamamlandi'])
    .order('sequence_order', { ascending: true });

  return { data, error };
}

/** Aşamayı teslim al — started_at + status = aktif */
export async function acceptStage(stageId: string) {
  const { data, error } = await supabase
    .from('order_stages')
    .update({
      status: 'aktif',
      started_at: new Date().toISOString(),
    })
    .eq('id', stageId)
    .eq('status', 'bekliyor')
    .select()
    .single();

  return { data, error };
}

/** Aşamayı tamamla — completed_at + status = tamamlandi */
export async function completeStage(stageId: string, note?: string) {
  const { data, error } = await supabase
    .from('order_stages')
    .update({
      status: 'tamamlandi',
      completed_at: new Date().toISOString(),
      ...(note ? { technician_note: note } : {}),
    })
    .eq('id', stageId)
    .eq('status', 'aktif')
    .select()
    .single();

  return { data, error };
}

/** Teknisyen notu güncelle */
export async function updateStageNote(stageId: string, note: string) {
  const { error } = await supabase
    .from('order_stages')
    .update({ technician_note: note })
    .eq('id', stageId);
  return { error };
}

/** Aşama fotoğrafı yükle */
export async function uploadStagePhoto(
  stageId: string,
  workOrderId: string,
  uploaderId: string,
  uri: string,
  caption?: string,
) {
  // 1) Storage'a yükle
  const ext = uri.split('.').pop() ?? 'jpg';
  const path = `stage-photos/${stageId}/${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', { uri, name: `photo.${ext}`, type: `image/${ext}` } as any);

  const { error: upErr } = await supabase.storage
    .from('work-orders')
    .upload(path, formData);

  if (upErr) return { error: upErr };

  // 2) DB kaydı
  const { error: dbErr } = await supabase
    .from('stage_photos')
    .insert({
      stage_id: stageId,
      work_order_id: workOrderId,
      storage_path: path,
      uploaded_by: uploaderId,
      caption: caption ?? null,
    });

  return { error: dbErr };
}

/** İstasyonun tüm aşamalarını getir (mesul müdür — atama ekranı için) */
export async function fetchStagesByOrder(workOrderId: string) {
  const { data, error } = await supabase
    .from('order_stages')
    .select(`
      id,
      sequence_order,
      status,
      is_critical,
      assigned_at,
      started_at,
      completed_at,
      duration_min,
      technician_note,
      manager_note,
      station:station_id ( id, name, color, is_critical ),
      technician:technician_id ( id, full_name )
    `)
    .eq('work_order_id', workOrderId)
    .order('sequence_order');

  return { data, error };
}

/** Lab'ın tüm istasyonlarını getir */
export async function fetchLabStations(labProfileId: string) {
  const { data, error } = await supabase
    .from('lab_stations')
    .select('id, name, color, icon, sequence_hint, is_critical, is_active')
    .eq('lab_profile_id', labProfileId)
    .eq('is_active', true)
    .order('sequence_hint');

  return { data, error };
}

/** Lab'ın teknisyenlerini getir */
export async function fetchLabTechnicians(labProfileId: string) {
  // profiles tablosunda lab kullanıcıları — role = technician veya lab
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('user_type', 'lab')
    .in('role', ['technician', 'manager'])
    .order('full_name');

  return { data, error };
}

/** Bir iş emri için rota planını kaydet (istasyon + teknisyen sırası) */
export async function saveOrderRoute(
  workOrderId: string,
  stages: Array<{
    station_id: string;
    technician_id: string | null;
    sequence_order: number;
    is_critical: boolean;
  }>,
) {
  // Önce mevcut bekleyen aşamaları sil
  await supabase
    .from('order_stages')
    .delete()
    .eq('work_order_id', workOrderId)
    .eq('status', 'bekliyor');

  // Yeni aşamaları ekle
  const { error } = await supabase.from('order_stages').insert(
    stages.map((s) => ({
      work_order_id: workOrderId,
      station_id: s.station_id,
      technician_id: s.technician_id,
      sequence_order: s.sequence_order,
      is_critical: s.is_critical,
      status: 'bekliyor',
    })),
  );

  if (!error) {
    // İlk aşamayı aktifleştir + iş emri durumunu güncelle
    const firstStage = stages.find((s) => s.sequence_order === 1);
    if (firstStage) {
      const { data: stageRow } = await supabase
        .from('order_stages')
        .select('id')
        .eq('work_order_id', workOrderId)
        .eq('sequence_order', 1)
        .single();

      if (stageRow) {
        await supabase
          .from('order_stages')
          .update({ status: 'aktif', assigned_at: new Date().toISOString() })
          .eq('id', stageRow.id);

        await supabase
          .from('work_orders')
          .update({ status: 'asamada', current_stage_id: stageRow.id })
          .eq('id', workOrderId);
      }
    }
  }

  return { error };
}
