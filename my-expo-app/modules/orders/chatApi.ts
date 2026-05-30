import { supabase } from '../../core/api/supabase';

export type AttachmentType = 'image' | 'audio' | 'file';

export interface ChatAttachment {
  url: string;
  type: AttachmentType;
  name: string;
  size?: number;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface OrderMessage {
  id: string;
  work_order_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at?: string | null;         // null = not yet read by recipient
  attachment_url?: string | null;
  attachment_type?: AttachmentType | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  approval_status?: ApprovalStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  sender?: { id: string; full_name: string; user_type: string };
}

export async function fetchMessages(workOrderId: string) {
  return supabase
    .from('order_messages')
    .select('*, sender:profiles(id, full_name, user_type)')
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: true });
}

// ── Message approval ─────────────────────────────────────────────────

export async function approveMessage(messageId: string) {
  return supabase.rpc('approve_message', { p_message_id: messageId });
}

export async function rejectMessage(messageId: string) {
  return supabase.rpc('reject_message', { p_message_id: messageId });
}

export async function approveAllPending(workOrderId: string) {
  return supabase.rpc('approve_all_pending_messages', { p_work_order_id: workOrderId });
}

/**
 * Karşı taraftan gelen tüm okunmamış mesajları "okundu" olarak işaretler.
 * Chat açıldığında çağrılır — currentUserId'nin kendi gönderdiği
 * mesajlar dokunulmaz.
 *
 * Gerekli migration (Supabase SQL Editor'da bir kez çalıştır):
 *   ALTER TABLE order_messages
 *   ADD COLUMN IF NOT EXISTS read_at timestamptz DEFAULT NULL;
 */
export async function markMessagesAsRead(workOrderId: string, currentUserId: string) {
  return supabase
    .from('order_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('work_order_id', workOrderId)
    .neq('sender_id', currentUserId)
    .is('read_at', null);
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
  clinic_name:   string | null;
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
 * Inbox listesi — get_chat_inbox RPC ile DB-side aggregation.
 * Önceki yaklaşım 2000 mesajı JS'e çekip grupluyordu (O(n)).
 * Yeni yaklaşım DB'de DISTINCT ON + GROUP BY ile hesaplar.
 */
export async function fetchOrderChatInbox(currentUserId: string): Promise<{
  data: OrderChatInboxItem[] | null; error: any;
}> {
  const { data: rows, error: rpcErr } = await supabase
    .rpc('get_chat_inbox', { p_user_id: currentUserId });
  if (rpcErr) return { data: null, error: rpcErr };
  if (!rows || (rows as any[]).length === 0) return { data: [], error: null };

  // Hekim adı + klinik adı: polymorphic lookup (profiles VEYA doctors tablosu).
  // Sorgu sayısı = 2 (sabit), satır sayısına bağlı değil.
  const doctorIds = Array.from(new Set((rows as any[]).map((r) => r.doctor_id))).filter(Boolean) as string[];
  const doctorName = new Map<string, string>();
  const clinicName = new Map<string, string>();

  if (doctorIds.length > 0) {
    const { data: profDocs } = await supabase
      .from('profiles')
      .select('id, full_name, clinic_name')
      .in('id', doctorIds);
    const matchedProfileIds = new Set<string>();
    (profDocs ?? []).forEach((p: any) => {
      matchedProfileIds.add(p.id);
      if (p.full_name)   doctorName.set(p.id, p.full_name);
      if (p.clinic_name) clinicName.set(p.id, p.clinic_name);
    });

    const remaining = doctorIds.filter((id) => !matchedProfileIds.has(id));
    if (remaining.length > 0) {
      const { data: tableDocs } = await supabase
        .from('doctors')
        .select('id, full_name, clinic:clinics(name)')
        .in('id', remaining);
      (tableDocs ?? []).forEach((d: any) => {
        if (d.full_name)    doctorName.set(d.id, d.full_name);
        if (d.clinic?.name) clinicName.set(d.id, d.clinic.name);
      });
    }
  }

  const items: OrderChatInboxItem[] = (rows as any[]).map((r) => ({
    work_order_id:        r.work_order_id,
    order_number:         r.order_number,
    work_type:            r.work_type,
    patient_name:         r.patient_name,
    doctor_id:            r.doctor_id,
    status:               r.status,
    is_urgent:            !!r.is_urgent,
    doctor_name:          doctorName.get(r.doctor_id) ?? null,
    clinic_name:          clinicName.get(r.doctor_id) ?? null,
    tooth_numbers:        r.tooth_numbers ?? null,
    shade:                r.shade ?? null,
    machine_type:         r.machine_type ?? null,
    delivery_date:        r.delivery_date ?? null,
    notes:                r.notes ?? null,
    last_content:         r.last_content,
    last_attachment_type: r.last_attachment_type as AttachmentType | null,
    last_created_at:      r.last_created_at,
    last_sender_id:       r.last_sender_id,
    last_sender_type:     r.last_sender_type,
    total_count:          Number(r.total_count),
    unread_for_me:        Number(r.unread_for_me),
  }));

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
