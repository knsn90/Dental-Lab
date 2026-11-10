-- DOWN: önceki tanım (tercih filtresi category=payment) geri yüklenir.
BEGIN;
CREATE OR REPLACE FUNCTION public._ps_recipient_contacts(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
           'has_email', NULLIF(btrim(p.email), '') IS NOT NULL,
           -- send-email-notification filtresinin aynısı (category = 'payment')
           -- (eksik anahtar NULL karşılaştırma verir → COALESCE ile "kapalı değil")
           'email_optout', COALESCE(p.notification_prefs IS NULL
                            OR jsonb_typeof(p.notification_prefs) <> 'object'
                            OR p.notification_prefs->'master_enabled' = 'false'::jsonb
                            OR p.notification_prefs #> '{channels,email}' = 'false'::jsonb
                            OR p.notification_prefs #> '{categories,payment,email}' = 'false'::jsonb, false),
           'has_phone', COALESCE(NULLIF(btrim(p.whatsapp_phone), ''), NULLIF(btrim(p.phone), '')) IS NOT NULL)
    FROM profiles p WHERE p.id = p_profile_id
$function$

;
COMMIT;
