import { supabase } from '../../core/api/supabase';

export type AttachmentType = 'image' | 'audio' | 'file';

export interface ChatAttachment {
  url: string;
  type: AttachmentType;
  name: string;
  size?: number;
}

export interface OrderMessage {
  id: string;
  work_order_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachment_url?: string | null;
  attachment_type?: AttachmentType | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  sender?: { id: string; full_name: string; user_type: string };
}

export async function fetchMessages(workOrderId: string) {
  return supabase
    .from('order_messages')
    .select('*, sender:profiles(id, full_name, user_type)')
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: true });
}

// ── Inbox (chat list) ────────────────────────────────────────────────

export interface OrderChatInboxItem {
  work_order_id: string;
  order_number:  string;
  work_type:     string | null;
  patient_name:  string | null;
  doctor_id:     string;
  status:        string;
  is_urgent:     boolean;
  doctor_name:   string | null;
  // ── Sticky pin info (chat detail başlığı altında gösterilir) ──────
  tooth_numbers: number[] | null;
  shade:         string | null;
  machine_type:  string | null;
  delivery_date: string | null;
  notes:         string | null;
  /** Son mesajın gövdesi (yoksa null) */
  last_content:      string | null;
  last_attachment_type: AttachmentType | null;
  last_created_at:   string | null;
  last_sender_id:    string | null;
  last_sender_type:  string | null;
  total_count:       number;
  /** "Benden sonra gelen" diğer kullanıcı mesaj sayısı (basit yaklaşım) */
  unread_for_me: number;
}

/**
 * Inbox listesi — kullanıcının erişebildiği tüm iş emirleri için
 * son mesajı olanları en yeni mesaj tarihine göre sıralar.
 *
 * Yaklaşım: order_messages'tan tüm mesajları (RLS filtreli) çeker,
 * client-side work_order_id'ye göre gruplar. ~1K mesaja kadar performanslı.
 */
export async function fetchOrderChatInbox(currentUserId: string): Promise<{
  data: OrderChatInboxItem[] | null; error: any;
}> {
  // 1) Tüm mesajlar (RLS otomatik filter)
  const { data: msgs, error: msgErr } = await supabase
    .from('order_messages')
    .select('id, work_order_id, sender_id, content, attachment_type, attachment_name, created_at, sender:profiles(id, full_name, user_type)')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (msgErr) return { data: null, error: msgErr };

  // Group by work_order_id
  const byOrder = new Map<string, any[]>();
  for (const m of (msgs ?? [])) {
    const list = byOrder.get(m.work_order_id) ?? [];
    list.push(m);
    byOrder.set(m.work_order_id, list);
  }

  const orderIds = Array.from(byOrder.keys());
  if (orderIds.length === 0) return { data: [], error: null };

  // 2) İlgili iş emirleri detayı (RLS: kullanıcı zaten erişebildiği mesajları
  //    gördüğü için bu iş emirlerine de erişimi olmalı)
  const { data: orders, error: ordErr } = await supabase
    .from('work_orders')
    .select('id, order_number, work_type, patient_name, doctor_id, status, is_urgent, tooth_numbers, shade, machine_type, delivery_date, notes')
    .in('id', orderIds);
  if (ordErr) return { data: null, error: ordErr };

  // 3) İlgili hekim profilleri (sipariş sahibi)
  const doctorIds = Array.from(new Set((orders ?? []).map(o => o.doctor_id))).filter(Boolean);
  const { data: doctors } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', doctorIds);
  const doctorName = new Map<string, string>();
  (doctors ?? []).forEach((d: any) => doctorName.set(d.id, d.full_name));

  // 4) Inbox items
  const items: OrderChatInboxItem[] = (orders ?? []).map((o: any) => {
    const list = byOrder.get(o.id) ?? [];
    const last = list[0]; // en yeni (descending order)
    const unread_for_me = list.filter(
      m => m.sender_id !== currentUserId,
    ).length;

    return {
      work_order_id: o.id,
      order_number:  o.order_number,
      work_type:     o.work_type,
      patient_name:  o.patient_name,
      doctor_id:     o.doctor_id,
      status:        o.status,
      is_urgent:     !!o.is_urgent,
      doctor_name:   doctorName.get(o.doctor_id) ?? null,
      tooth_numbers: o.tooth_numbers ?? null,
      shade:         o.shade ?? null,
      machine_type:  o.machine_type ?? null,
      delivery_date: o.delivery_date ?? null,
      notes:         o.notes ?? null,
      last_content:     last?.content ?? null,
      last_attachment_type: last?.attachment_type ?? null,
      last_created_at:  last?.created_at ?? null,
      last_sender_id:   last?.sender_id ?? null,
      last_sender_type: last?.sender?.user_type ?? null,
      total_count:      list.length,
      unread_for_me,
    };
  });

  // 5) Son mesaj tarihine göre sırala (newest first)
  items.sort((a, b) =>
    (b.last_created_at ?? '').localeCompare(a.last_created_at ?? ''),
  );

  return { data: items, error: null };
}

export async function sendMessage(
  workOrderId: string,
  senderId: string,
  content: string,
  attachment?: ChatAttachment
) {
  return supabase.from('order_messages').insert({
    work_order_id: workOrderId,
    sender_id: senderId,
    content: content.trim(),
    attachment_url:  attachment?.url  ?? null,
    attachment_type: attachment?.type ?? null,
    attachment_name: attachment?.name ?? null,
    attachment_size: attachment?.size ?? null,
  });
}

const BUCKET = 'chat-attachments';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

export async function uploadChatAttachment(
  file: File | Blob,
  workOrderId: string,
  fileName: string
): Promise<{ url: string | null; error: string | null }> {
  if (file.size > MAX_FILE_BYTES) {
    return { url: null, error: 'Dosya boyutu 100 MB\'ı aşamaz.' };
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${workOrderId}/${Date.now()}_${safeName}`;

  const contentType =
    (file as File).type ||
    (fileName.endsWith('.webm') ? 'audio/webm' : 'application/octet-stream');

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false });

  if (uploadError) return { url: null, error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
