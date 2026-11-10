-- 20261111091000_on_ekstre_eposta_islemsel — ön ekstre onay e-postası İŞLEMSEL (kullanıcı kararı 2026-11-11).
-- Yeni hesapların varsayılan tercihi e-postayı kapalı tuttuğu için klinik alıcıların çoğu EMAIL_OPTOUT oluyordu.
-- email_optout artık send-email-notification'ın pre_statement_link kuralıyla aynı: yalnız alıcı TÜM
-- bildirimleri kapattıysa (master_enabled=false) ya da tercih yapısı bozuksa gönderilmez.
BEGIN;
CREATE OR REPLACE FUNCTION public._ps_recipient_contacts(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
           'has_email', NULLIF(btrim(p.email), '') IS NOT NULL,
           -- send-email-notification 'pre_statement_link' kuralının aynısı: işlemsel, yalnız master kapalıysa gitmez
           'email_optout', COALESCE(p.notification_prefs->'master_enabled' = 'false'::jsonb, false),
           'has_phone', COALESCE(NULLIF(btrim(p.whatsapp_phone), ''), NULLIF(btrim(p.phone), '')) IS NOT NULL)
    FROM profiles p WHERE p.id = p_profile_id
$function$;
REVOKE ALL ON FUNCTION public._ps_recipient_contacts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_recipient_contacts(uuid) TO service_role;
COMMIT;
