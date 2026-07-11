import { supabase } from '../../core/api/supabase';
import type {
  SupportTicket, SupportMessage, SupportAttachment, SupportStatusHistoryEntry,
  SupportCategory, SupportPriority, SupportStatus,
  SupportContext, SupportChecklistItem,
} from './types';

// ─── Tickets ──────────────────────────────────────────────────────────────

export async function fetchMyTickets() {
  return supabase
    .from('support_tickets')
    .select('*')
    .order('last_message_at', { ascending: false })
    .returns<SupportTicket[]>();
}

export async function fetchAllTickets(opts?: { status?: SupportStatus; priority?: SupportPriority }) {
  let q = supabase
    .from('support_tickets')
    .select('*, user:user_id(full_name, email)')
    .order('last_message_at', { ascending: false });
  if (opts?.status)   q = q.eq('status', opts.status);
  if (opts?.priority) q = q.eq('priority', opts.priority);
  return q;
}

export async function fetchTicket(id: string) {
  return supabase
    .from('support_tickets')
    .select('*, user:user_id(full_name, email)')
    .eq('id', id)
    .maybeSingle();
}

export async function createTicket(input: {
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  body: string;
  context?: SupportContext;
  work_order_id?: string | null;
  stage_key?: string | null;
  error_code?: string | null;
  lab_id?: string | null;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Oturum yok');

  const { data: ticket, error: tErr } = await supabase
    .from('support_tickets')
    .insert({
      user_id:       user.id,
      subject:       input.subject.trim(),
      category:      input.category,
      priority:      input.priority,
      status:        'yeni',
      context:       input.context ?? {},
      work_order_id: input.work_order_id ?? null,
      stage_key:     input.stage_key ?? null,
      error_code:    input.error_code ?? null,
      lab_id:        input.lab_id ?? null,
    })
    .select()
    .single();
  if (tErr || !ticket) return { data: null, error: tErr };

  const { error: mErr } = await supabase.from('support_messages').insert({
    ticket_id:   ticket.id,
    sender_id:   user.id,
    sender_role: 'user',
    body:        input.body.trim(),
  });
  if (mErr) {
    await supabase.from('support_tickets').delete().eq('id', ticket.id);
    return { data: null, error: mErr };
  }
  return { data: ticket as SupportTicket, error: null };
}

export async function updateTicketStatus(id: string, status: SupportStatus) {
  const patch: any = { status };
  if (status === 'cozuldu') patch.resolved_at = new Date().toISOString();
  if (status === 'kapali')  patch.closed_at = new Date().toISOString();
  return supabase.from('support_tickets').update(patch).eq('id', id);
}

export async function updateTicketPriority(id: string, priority: SupportPriority) {
  return supabase.from('support_tickets').update({ priority }).eq('id', id);
}

export async function updateTicketChecklist(id: string, checklist: SupportChecklistItem[]) {
  return supabase.from('support_tickets').update({ checklist }).eq('id', id);
}

export async function updateTicketResolution(id: string, resolution: string) {
  return supabase.from('support_tickets').update({ resolution }).eq('id', id);
}

export async function markTicketReadByUser(id: string) {
  return supabase.from('support_tickets').update({ unread_for_user: false }).eq('id', id);
}

export async function markTicketReadByAdmin(id: string) {
  return supabase.from('support_tickets').update({ unread_for_admin: false }).eq('id', id);
}

// ─── Messages ─────────────────────────────────────────────────────────────

export async function fetchMessages(ticketId: string) {
  return supabase
    .from('support_messages')
    .select('*, sender:sender_id(full_name)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .returns<SupportMessage[]>();
}

export async function sendMessage(input: {
  ticket_id: string;
  body: string;
  is_internal?: boolean;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Oturum yok');

  const { data: prof } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .maybeSingle();
  const senderRole = prof?.user_type === 'admin' ? 'support' : 'user';

  return supabase.from('support_messages').insert({
    ticket_id:   input.ticket_id,
    sender_id:   user.id,
    sender_role: senderRole,
    body:        input.body.trim(),
    is_internal: !!input.is_internal,
  }).select().single();
}

// ─── Attachments ──────────────────────────────────────────────────────────

export async function fetchAttachments(ticketId: string) {
  return supabase
    .from('support_attachments')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .returns<SupportAttachment[]>();
}

export async function createAttachmentRecord(input: {
  ticket_id: string;
  message_id?: string | null;
  kind: SupportAttachment['kind'];
  storage_path: string;
  file_name: string;
  file_size?: number | null;
  mime_type?: string | null;
  preview_url?: string | null;
  metadata?: Record<string, any>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Oturum yok');
  return supabase.from('support_attachments').insert({
    ...input,
    uploader_id: user.id,
    message_id:  input.message_id ?? null,
    metadata:    input.metadata ?? {},
  }).select().single();
}

export async function linkAttachmentsToMessage(attachmentIds: string[], messageId: string) {
  if (!attachmentIds.length) return { error: null };
  return supabase
    .from('support_attachments')
    .update({ message_id: messageId })
    .in('id', attachmentIds);
}

// ─── Status history ───────────────────────────────────────────────────────

export async function fetchStatusHistory(ticketId: string) {
  return supabase
    .from('support_status_history')
    .select('*, actor:actor_id(full_name)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .returns<SupportStatusHistoryEntry[]>();
}

// ─── Sayım ─────────────────────────────────────────────────────────────────

export async function fetchUnreadCount(): Promise<number> {
  const { count } = await supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('unread_for_user', true);
  return count ?? 0;
}
