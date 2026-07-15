/**
 * dispatch.ts — Bildirim gönderim için tek giriş noktası.
 *
 *  dispatchNotification(category, userIds, {title, body, ...})
 *    1. notifications.insert (RPC: create_notification — her hedef kullanıcı için)
 *    2. Realtime sub onUpdate kanalını trigger eder → in-app + browser_push otomatik
 *    3. native_push  → edge function tetiklenir (Fase 4'te eklenecek)
 *    4. email        → edge function tetiklenir (Fase 5'te eklenecek)
 *
 *  Kullanıcı bazlı pref filtrelemesi server tarafında yapılmıyor —
 *  in-app feed'i herkes alır (kullanıcı kendi feed'inde "Bildirim almıyorum"
 *  diye master_enabled=false yapsa bile master switch sadece UI'da gizler,
 *  altta veri durur).
 *  Push/email filtrelemesi edge function içinde profiles.notification_prefs
 *  okunarak yapılır.
 *
 *  Kullanım:
 *    dispatchNotification({
 *      category: 'new_order',
 *      userIds: ['lab-user-1', 'lab-user-2'],
 *      title: 'Yeni iş emri',
 *      body: 'Klinik Saberi 24/A için zirkonya kron',
 *      resourceType: 'work_order',
 *      resourceId: orderId,
 *      actionUrl: '/(lab)/order/abc123',
 *      payload: { orderNumber: 'WO-2310', clinic: 'Saberi' },
 *    });
 */

import { supabase } from '../api/supabase';
import type { NotificationCategory } from '../store/notificationPrefsStore';

export interface DispatchInput {
  category:      NotificationCategory;
  userIds:       string[];                // hedef kullanıcılar
  title:         string;
  body?:         string;
  resourceType?: string;                  // 'work_order' | 'invoice' | ...
  resourceId?:   string;
  actionUrl?:    string;
  payload?:      Record<string, any>;
}

export interface DispatchResult {
  ok:       boolean;
  inserted: number;
  errors:   string[];
}

/**
 * Bir veya daha fazla kullanıcıya bildirim gönder.
 * Her kullanıcı için ayrı row insert edilir — okuma/dismiss bağımsız.
 */
export async function dispatchNotification(input: DispatchInput): Promise<DispatchResult> {
  const userIds = Array.from(new Set(input.userIds.filter(Boolean)));
  if (userIds.length === 0) {
    return { ok: true, inserted: 0, errors: [] };
  }

  const errors: string[] = [];
  let inserted = 0;

  // RPC ile insert — SECURITY DEFINER fonksiyon RLS'i bypass eder
  await Promise.all(userIds.map(async (uid) => {
    const { error } = await supabase.rpc('create_notification', {
      p_user_id:       uid,
      p_category:      input.category,
      p_title:         input.title,
      p_body:          input.body ?? null,
      p_resource_type: input.resourceType ?? null,
      p_resource_id:   input.resourceId ?? null,
      p_action_url:    input.actionUrl ?? null,
      p_payload:       input.payload ?? {},
    });

    if (error) {
      errors.push(`${uid}: ${error.message}`);
    } else {
      inserted++;
    }
  }));

  // ─── Web Push (Service Worker — closed-tab notification) ─────────
  // notifications.insert sonrası realtime onInsert tetikleyici client-side
  // `showBrowserPush` ile zaten foreground push gönderiyor.
  // Bu edge function call CLOSED-TAB push için: hedef kullanıcılar
  // sayfayı kapatmış olsa bile push servisi üzerinden bildirim gelir.
  try {
    await supabase.functions.invoke('send-web-push', {
      body: {
        userIds,
        category: input.category,
        payload: {
          title: input.title,
          body:  input.body ?? '',
          tag:   input.resourceId ? `${input.category}-${input.resourceId}` : input.category,
          data:  { url: input.actionUrl, category: input.category, payload: input.payload },
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined') console.debug('[dispatch] send-web-push skipped:', e);
  }

  // ─── Native Push (iOS / Android — Expo Push API) ─────────────────
  try {
    await supabase.functions.invoke('send-expo-push', {
      body: {
        userIds,
        category: input.category,
        payload: {
          title:    input.title,
          body:     input.body ?? '',
          data:     { url: input.actionUrl, category: input.category, payload: input.payload },
          sound:    'default',
          priority: 'high',
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined') console.debug('[dispatch] send-expo-push skipped:', e);
  }

  // ─── Email (Resend) ──────────────────────────────────────────────
  try {
    await supabase.functions.invoke('send-email-notification', {
      body: {
        userIds,
        category: input.category,
        payload: {
          title:        input.title,
          body:         input.body ?? '',
          actionUrl:    input.actionUrl,
          resourceType: input.resourceType,
          resourceId:   input.resourceId,
          extra:        input.payload ?? {},
        },
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined') console.debug('[dispatch] send-email-notification skipped:', e);
  }

  // ─── WhatsApp (Twilio) ────────────────────────────────────────────
  // Opt-in: yalnız profiles.notification_prefs.categories[cat].whatsapp == true
  // olan + whatsapp_phone'u dolu kullanıcılara gider (filtre edge fn içinde).
  try {
    await supabase.functions.invoke('send-whatsapp-notification', {
      body: {
        userIds,
        category: input.category,
        payload: {
          title:     input.title,
          body:      input.body ?? '',
          actionUrl: input.actionUrl,
          extra:     input.payload ?? {},
        },
        notificationId: undefined,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    if (typeof console !== 'undefined') console.debug('[dispatch] send-whatsapp-notification skipped:', e);
  }

  return { ok: errors.length === 0, inserted, errors };
}

/**
 * dispatchChatPush — yalnız PUSH (web + native), feed/email/whatsapp YOK.
 *
 * Chat mesajlarının in-app yüzeyi zaten sohbet kutusu + TopActionBar chat rozeti
 * olduğu için her mesaj için `notifications` feed'ine (çan) satır eklemeyiz —
 * yalnızca kapalı-sekme web push'u ve native (Expo) push'u tetikleriz.
 * Server tarafı pref filtresi `category: 'chat'` ile edge fonksiyonlarda uygulanır
 * (kullanıcı chat push'unu kapattıysa gönderilmez).
 */
export async function dispatchChatPush(opts: {
  userIds:   string[];
  title:     string;
  body:      string;
  actionUrl: string;
  tag?:      string;
}): Promise<void> {
  const userIds = Array.from(new Set(opts.userIds.filter(Boolean)));
  if (userIds.length === 0) return;

  const tag = opts.tag ?? 'chat';

  // ─── Web Push (closed-tab) ───────────────────────────────────────
  try {
    await supabase.functions.invoke('send-web-push', {
      body: {
        userIds,
        category: 'chat',
        payload: {
          title: opts.title,
          body:  opts.body,
          tag,
          data:  { url: opts.actionUrl, category: 'chat' },
        },
      },
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.debug('[chat-push] send-web-push skipped:', e);
  }

  // ─── Native Push (iOS / Android — Expo) ──────────────────────────
  try {
    await supabase.functions.invoke('send-expo-push', {
      body: {
        userIds,
        category: 'chat',
        payload: {
          title:    opts.title,
          body:     opts.body,
          data:     { url: opts.actionUrl, category: 'chat' },
          sound:    'default',
          priority: 'high',
        },
      },
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.debug('[chat-push] send-expo-push skipped:', e);
  }

  // ─── Email (Resend) — yeni mesaj bildirimi e-postası ─────────────
  // Opt-in: yalnız notification_prefs.categories.chat.email == true olan
  // kullanıcılara gider (filtre send-email-notification edge fn içinde).
  try {
    await supabase.functions.invoke('send-email-notification', {
      body: {
        userIds,
        category: 'chat',
        payload: {
          title:        opts.title,
          body:         opts.body ?? '',
          actionUrl:    opts.actionUrl,
          resourceType: 'work_order',
          extra:        { tag },
        },
      },
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.debug('[chat-push] send-email-notification skipped:', e);
  }
}

/**
 * Bir lab'a/klinik'e ait tüm kullanıcılara dispatch.
 * resolveRoles: hangi rollerin hedef alınacağı (örn. lab admin + tech).
 */
export async function dispatchToLabRoles(opts: {
  labId:    string;
  roles?:   string[];   // undefined → tüm lab kullanıcıları
  input:    Omit<DispatchInput, 'userIds'>;
}): Promise<DispatchResult> {
  let q = supabase.from('profiles').select('id').eq('lab_id', opts.labId);
  if (opts.roles && opts.roles.length > 0) {
    q = q.in('role', opts.roles);
  }
  const { data, error } = await q;
  if (error) return { ok: false, inserted: 0, errors: [error.message] };

  const userIds = (data ?? []).map((r: any) => r.id as string);
  return dispatchNotification({ ...opts.input, userIds });
}

/**
 * Bir kliniğin profillerine dispatch (klinik kullanıcıları için).
 */
export async function dispatchToClinic(opts: {
  clinicId: string;
  input:    Omit<DispatchInput, 'userIds'>;
}): Promise<DispatchResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('clinic_id', opts.clinicId);
  if (error) return { ok: false, inserted: 0, errors: [error.message] };

  const userIds = (data ?? []).map((r: any) => r.id as string);
  return dispatchNotification({ ...opts.input, userIds });
}
