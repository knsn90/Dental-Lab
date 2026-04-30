/**
 * Payment Reminders API
 *
 * - sendPaymentReminder  → RPC ile hatırlatma kaydı oluşturur
 * - fetchReminders       → bir faturanın hatırlatma geçmişi
 * - fetchTemplates       → kurum şablonları (3 ton)
 * - upsertTemplate       → şablon ekleme/güncelleme
 *
 * Kanal genişletmesi: e-posta/SMS sağlayıcı entegrasyonu eklendiğinde,
 * channel='email|sms' için bir Edge Function tetikleyiciye sevk edilebilir
 * (status='queued' kayıtlarını dinler).
 */

import { supabase } from '../../core/api/supabase';

export type ReminderTone    = 'gentle' | 'standard' | 'firm';
export type ReminderChannel = 'in_app' | 'email' | 'sms' | 'whatsapp';
export type ReminderStatus  = 'queued' | 'sent' | 'failed' | 'bounced' | 'read';

export interface ReminderTemplate {
  id: string;
  lab_id: string;
  name: string;
  tone: ReminderTone;
  subject: string | null;
  body: string;
  is_default: boolean;
  active: boolean;
  created_at: string;
}

export interface PaymentReminder {
  id: string;
  lab_id: string;
  invoice_id: string;
  clinic_id: string | null;
  template_id: string | null;
  channel: ReminderChannel;
  tone: ReminderTone;
  subject: string | null;
  body: string;
  recipient: string | null;
  status: ReminderStatus;
  error_message: string | null;
  sent_by: string | null;
  sent_at: string;
  read_at: string | null;
  created_at: string;
}

// ─── Send ────────────────────────────────────────────────────────────────
export async function sendPaymentReminder(params: {
  invoice_id:   string;
  tone?:        ReminderTone;
  channel?:     ReminderChannel;
  template_id?: string;
  recipient?:   string;
}) {
  return supabase.rpc('send_payment_reminder', {
    p_invoice_id:  params.invoice_id,
    p_tone:        params.tone        ?? 'standard',
    p_channel:     params.channel     ?? 'in_app',
    p_template_id: params.template_id ?? null,
    p_recipient:   params.recipient   ?? null,
  });
}

// ─── Reminder history per invoice ────────────────────────────────────────
export async function fetchReminders(invoiceId: string) {
  return supabase
    .from('payment_reminders')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sent_at', { ascending: false })
    .returns<PaymentReminder[]>();
}

// ─── Aggregated reminder summary (ClinicBalance / dashboards) ────────────
export async function fetchInvoiceRemindersSummary() {
  return supabase
    .from('v_invoice_reminders')
    .select('*');
}

// ─── Templates ───────────────────────────────────────────────────────────
export async function fetchTemplates() {
  return supabase
    .from('reminder_templates')
    .select('*')
    .order('tone', { ascending: true })
    .order('is_default', { ascending: false })
    .returns<ReminderTemplate[]>();
}

export async function upsertTemplate(t: Partial<ReminderTemplate> & { lab_id: string; name: string; tone: ReminderTone; body: string }) {
  if (t.id) {
    return supabase.from('reminder_templates').update(t).eq('id', t.id);
  }
  return supabase.from('reminder_templates').insert(t);
}

export async function seedDefaultTemplates(labId: string) {
  return supabase.rpc('seed_default_reminder_templates', { p_lab_id: labId });
}

// ─── Render preview (client-side approximation, RPC tarafı kanonik) ──────
export function renderTemplate(
  body: string,
  vars: { clinic_name: string; invoice_number: string; amount: string; days_overdue: number; due_date: string }
): string {
  return body
    .replace(/\{\{clinic_name\}\}/g,    vars.clinic_name)
    .replace(/\{\{invoice_number\}\}/g, vars.invoice_number)
    .replace(/\{\{amount\}\}/g,         vars.amount)
    .replace(/\{\{days_overdue\}\}/g,   String(vars.days_overdue))
    .replace(/\{\{due_date\}\}/g,       vars.due_date);
}

export const TONE_LABELS: Record<ReminderTone, { label: string; color: string; icon: string }> = {
  gentle:   { label: 'Nazik',    color: '#10B981', icon: 'message-heart-outline'  },
  standard: { label: 'Standart', color: '#F59E0B', icon: 'message-text-outline'   },
  firm:     { label: 'Sert',     color: '#DC2626', icon: 'alert-octagon-outline'  },
};

export const CHANNEL_LABELS: Record<ReminderChannel, { label: string; icon: string }> = {
  in_app:   { label: 'Uygulama İçi', icon: 'bell-outline'      },
  email:    { label: 'E-posta',      icon: 'email-outline'     },
  sms:      { label: 'SMS',          icon: 'cellphone-message' },
  whatsapp: { label: 'WhatsApp',     icon: 'whatsapp'          },
};
