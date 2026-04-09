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
