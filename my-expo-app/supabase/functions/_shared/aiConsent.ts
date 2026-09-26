/**
 * callerHasAiConsent — sunucu tarafı yapay zekâ izni kapısı.
 *
 * App Store 5.1.2(i): kişisel veri üçüncü taraf yapay zekâya gitmeden önce
 * açık izin şart. İstemcide kapı var (ensureAiConsent), ama tek savunma
 * istemci olamaz: fonksiyon uç noktası doğrudan da çağrılabilir.
 *
 * MUAFİYET — service-role / iç sır ile gelen çağrılar: bunlar sunucu-sunucu
 * akışlarıdır (cron, webhook), arkalarında oturum açmış bir kullanıcı yoktur.
 * Apple'ın istediği izin UYGULAMA İÇİ kullanım içindir; o yol zaten JWT ile gelir.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isServiceRoleBearer } from './security.ts';

export interface AiConsentResult {
  ok: boolean;
  /** 'unauthorized' | 'ai_consent_required' | 'consent_check_failed' */
  reason?: string;
}

export async function callerHasAiConsent(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
): Promise<AiConsentResult> {
  const auth = req.headers.get('Authorization') ?? '';

  // Sunucu-sunucu çağrısı → kullanıcı izni kavramı yok.
  if (serviceRoleKey && isServiceRoleBearer(auth, serviceRoleKey)) return { ok: true };

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u?.user) return { ok: false, reason: 'unauthorized' };

    // Defterdeki SON karar. RLS self-read açık; kullanıcı kendi satırını okur.
    const { data, error } = await userClient
      .from('user_consents')
      .select('granted, granted_at')
      .eq('user_id', u.user.id)
      .eq('kind', 'ai_processing')
      .order('granted_at', { ascending: false })
      .limit(1);
    if (error) return { ok: false, reason: 'consent_check_failed' };

    return data?.[0]?.granted === true
      ? { ok: true }
      : { ok: false, reason: 'ai_consent_required' };
  } catch {
    return { ok: false, reason: 'consent_check_failed' };
  }
}
