import { supabase } from '../../core/api/supabase';
import { dispatchChatPush } from '../../core/notifications/dispatch';

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
    .select('*, sender:profiles!order_messages_sender_id_fkey(id, full_name, user_type, avatar_url, clinic_name)')
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
  last_content:        string | null;
  last_attachment_type: AttachmentType | null;
  last_created_at:     string | null;
  last_sender_id:      string | null;
  last_sender_type:    string | null;
  /** Son mesajı gönderen profilin bilgileri (avatar + isim) */
  last_sender_name:    string | null;
  last_sender_avatar:  string | null;
  total_count:         number;
  /** "Benden sonra gelen" diğer kullanıcı mesaj sayısı (basit yaklaşım) */
  unread_for_me: number;
}

/**
 * Inbox listesi — kullanıcının erişebildiği tüm iş emirleri için
 * son mesajı olanları en yeni mesaj tarihine göre sıralar.
 *
 * Yaklaşım: order_messages'tan tüm mesajları (RLS filtreli) çeker,
 * client-side work_order_id'ye göre gruplar. ~1K mesaja kadar performanslı.
 *
 * Teknisyen filtresi: `restrictTechnician=true` verilirse yalnızca kullanıcının
 * dahil olduğu (work_orders.assigned_to = me VEYA order_stages.technician_id = me)
 * iş emirleri gösterilir.
 */
export async function fetchOrderChatInbox(
  currentUserId: string,
  opts?: { restrictTechnician?: boolean },
): Promise<{
  data: OrderChatInboxItem[] | null; error: any;
}> {
  // 1) Tüm mesajlar (RLS otomatik filter) — read_at dahil
  const { data: msgs, error: msgErr } = await supabase
    .from('order_messages')
    .select('id, work_order_id, sender_id, content, attachment_type, attachment_name, created_at, read_at, sender:profiles!order_messages_sender_id_fkey(id, full_name, user_type, avatar_url)')
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

  let orderIds = Array.from(byOrder.keys());
  if (orderIds.length === 0) return { data: [], error: null };

  // Teknisyen kısıtlaması: yalnızca dahil olduğu iş emirleri
  if (opts?.restrictTechnician && currentUserId) {
    const allowed = new Set<string>();

    // 1) work_orders.assigned_to = me
    const [{ data: ownedOrders }, { data: stages }] = await Promise.all([
      supabase
        .from('work_orders')
        .select('id')
        .eq('assigned_to', currentUserId)
        .in('id', orderIds),
      supabase
        .from('order_stages')
        .select('work_order_id')
        .eq('technician_id', currentUserId)
        .in('work_order_id', orderIds),
    ]);
    (ownedOrders ?? []).forEach((o: any) => allowed.add(o.id));
    (stages ?? []).forEach((s: any) => allowed.add(s.work_order_id));

    orderIds = orderIds.filter(id => allowed.has(id));
    if (orderIds.length === 0) return { data: [], error: null };
  }

  // 2) İlgili iş emirleri detayı (RLS: kullanıcı zaten erişebildiği mesajları
  //    gördüğü için bu iş emirlerine de erişimi olmalı)
  const { data: orders, error: ordErr } = await supabase
    .from('work_orders')
    .select('id, order_number, work_type, patient_name, doctor_id, status, is_urgent, tooth_numbers, shade, machine_type, delivery_date, notes')
    .in('id', orderIds);
  if (ordErr) return { data: null, error: ordErr };

  // 3) İlgili hekimler (polymorphic: profiles veya doctors tablosu)
  //    + bağlı oldukları klinik adı
  const doctorIds = Array.from(new Set((orders ?? []).map(o => o.doctor_id))).filter(Boolean);
  const doctorName = new Map<string, string>();
  const clinicName = new Map<string, string>();

  if (doctorIds.length > 0) {
    // 3a) profiles üzerinden (kendi user account'u olan hekimler)
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

    // 3b) Profile'da bulunmayan id'ler için doctors tablosu (klinik içi hekim)
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

  // 4) Inbox items
  const items: OrderChatInboxItem[] = (orders ?? []).map((o: any) => {
    const list = byOrder.get(o.id) ?? [];
    const last = list[0]; // en yeni (descending order)
    // Sadece karşı taraftan gelen VE henüz okunmamış (read_at = null) mesajlar
    const unread_for_me = list.filter(
      m => m.sender_id !== currentUserId && !m.read_at,
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
      clinic_name:   clinicName.get(o.doctor_id) ?? null,
      tooth_numbers: o.tooth_numbers ?? null,
      shade:         o.shade ?? null,
      machine_type:  o.machine_type ?? null,
      delivery_date: o.delivery_date ?? null,
      notes:         o.notes ?? null,
      last_content:       last?.content ?? null,
      last_attachment_type: last?.attachment_type ?? null,
      last_created_at:    last?.created_at ?? null,
      last_sender_id:     last?.sender_id ?? null,
      last_sender_type:   last?.sender?.user_type ?? null,
      last_sender_name:   last?.sender?.full_name ?? null,
      last_sender_avatar: last?.sender?.avatar_url ?? null,
      total_count:        list.length,
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
  const res = await supabase.from('order_messages').insert({
    work_order_id: workOrderId,
    sender_id: senderId,
    content: content.trim(),
    attachment_url:  attachment?.url  ?? null,
    attachment_type: attachment?.type ?? null,
    attachment_name: attachment?.name ?? null,
    attachment_size: attachment?.size ?? null,
  });

  // ─── Push bildirimi (fire-and-forget) ─────────────────────────────
  // Insert başarılıysa thread'in diğer katılımcılarına web + native push.
  // Hata olursa mesaj akışını ASLA bozma (sessiz geç).
  if (!res.error) {
    void notifyChatRecipients(workOrderId, senderId, content, attachment).catch(() => null);
  }

  return res;
}

/**
 * Yeni mesaj için push alıcılarını çözer ve push-only dispatch'i tetikler.
 * Alıcı kümesi (gönderen hariç):
 *   • thread'e daha önce mesaj yazmış herkes (distinct sender_id)
 *   • iş emrinin hekimi (doctor_id bir profiles app-kullanıcısı ise)
 *   • bağlı kliniğin kullanıcıları (clinic_id)
 *   • lab tarafı: atanan teknisyen (assigned_to) + lab admin/owner/manager rolleri
 */
async function notifyChatRecipients(
  workOrderId: string,
  senderId: string,
  content: string,
  attachment?: ChatAttachment,
): Promise<void> {
  // İş emri temel alanları
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, order_number, lab_id, clinic_id, doctor_id, assigned_to')
    .eq('id', workOrderId)
    .maybeSingle();
  if (!wo) return;

  const targets = new Set<string>();

  // 1) Thread'e daha önce katılanlar
  const { data: priorMsgs } = await supabase
    .from('order_messages')
    .select('sender_id')
    .eq('work_order_id', workOrderId);
  for (const m of (priorMsgs ?? []) as any[]) if (m?.sender_id) targets.add(m.sender_id);

  // 2) Hekim — doctor_id bir profiles (app kullanıcısı) ise
  if ((wo as any).doctor_id) {
    const { data: doc } = await supabase
      .from('profiles').select('id').eq('id', (wo as any).doctor_id).maybeSingle();
    if ((doc as any)?.id) targets.add((doc as any).id);
  }

  // 3) Klinik kullanıcıları
  if ((wo as any).clinic_id) {
    const { data: clinicUsers } = await supabase
      .from('profiles').select('id').eq('clinic_id', (wo as any).clinic_id);
    for (const r of (clinicUsers ?? []) as any[]) if (r?.id) targets.add(r.id);
  }

  // 4) Lab tarafı — atanan teknisyen + lab yöneticileri (tüm lab'a yaymadan)
  if ((wo as any).assigned_to) targets.add((wo as any).assigned_to);
  if ((wo as any).lab_id) {
    const { data: labAdmins } = await supabase
      .from('profiles').select('id')
      .eq('lab_id', (wo as any).lab_id)
      .in('role', ['admin', 'owner', 'manager']);
    for (const r of (labAdmins ?? []) as any[]) if (r?.id) targets.add(r.id);
  }

  // Gönderen kendine push almaz
  targets.delete(senderId);
  if (targets.size === 0) return;

  const orderNum = (wo as any).order_number ? ` · ${(wo as any).order_number}` : '';
  const preview = content?.trim()
    ? content.trim().slice(0, 120)
    : (attachment ? 'Ek dosya gönderildi' : 'Yeni mesaj');

  await dispatchChatPush({
    userIds:   Array.from(targets),
    title:     `Yeni mesaj${orderNum}`,
    body:      preview,
    actionUrl: `/order/${workOrderId}`,
    tag:       `chat-${workOrderId}`,
  });
}

/** Kullanıcının kendi mesajını silebileceği süre — gönderimden sonra 5 dakika. */
export const MESSAGE_DELETE_WINDOW_MS = 5 * 60 * 1000;

/** created_at hâlâ silme penceresi içinde mi? (gönderici için UI gating'i) */
export function isWithinDeleteWindow(createdAt?: string | null): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < MESSAGE_DELETE_WINDOW_MS;
}

/**
 * Mesajı kalıcı olarak siler (hard delete). RLS gönderici+5dk veya
 * admin/lab-manager dışında reddeder. Eki varsa storage'dan da temizler
 * (best-effort — başarısız olursa sessiz geçer).
 */
export async function deleteMessage(messageId: string) {
  // Eki temizlemek için önce attachment_url'i çek (silmeden önce)
  let attachmentUrl: string | null = null;
  try {
    const { data: row } = await supabase
      .from('order_messages')
      .select('attachment_url')
      .eq('id', messageId)
      .maybeSingle();
    attachmentUrl = (row as any)?.attachment_url ?? null;
  } catch { /* sessiz */ }

  const res = await supabase.from('order_messages').delete().eq('id', messageId);

  // Storage'daki eki best-effort sil (satır silindiyse)
  if (!res.error && attachmentUrl) {
    try {
      const marker = `/${BUCKET}/`;
      const idx = attachmentUrl.indexOf(marker);
      if (idx >= 0) {
        const path = decodeURIComponent(attachmentUrl.slice(idx + marker.length));
        await supabase.storage.from(BUCKET).remove([path]);
      }
    } catch { /* sessiz — orphan ek kritik değil */ }
  }

  return res;
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
