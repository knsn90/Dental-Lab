-- Varsayılan teslim süresi (iş günü) — lab ayarı.
-- Eskiden yeni sipariş sihirbazında SABİT: normal 5, acil 1 iş günü.
-- Varsayılanlar bugünkü kuralla aynı → mevcut lablarda davranış değişmez.
-- Hizmet bazlı süre için ayrı sütun GEREKMEZ: lab_services.production_days
-- fiyat listesinde zaten düzenleniyordu ama sihirbaz okumuyordu.

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS default_lead_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS urgent_lead_days  integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE public.lab_settings
    ADD CONSTRAINT lab_settings_default_lead_days_chk CHECK (default_lead_days BETWEEN 1 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.lab_settings
    ADD CONSTRAINT lab_settings_urgent_lead_days_chk CHECK (urgent_lead_days BETWEEN 1 AND 30);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Klinik/hekim lab_settings'i RLS yüzünden OKUYAMAZ (yalnız kendi lab'ı).
-- Sihirbazın ihtiyaç duyduğu üç sayıyı dar bir RPC verir: çağıran o lab'ın
-- üyesi, bağlı klinik/hekimi ya da platform admini değilse boş döner.
CREATE OR REPLACE FUNCTION public.lab_order_defaults(p_lab_id uuid)
 RETURNS TABLE(default_lead_days integer, urgent_lead_days integer, urgent_surcharge_rate numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ls.default_lead_days, ls.urgent_lead_days, ls.urgent_surcharge_rate::numeric
    FROM public.lab_settings ls
   WHERE ls.lab_id = p_lab_id
     AND auth.uid() IS NOT NULL
     AND (
       p_lab_id = public.get_my_lab_id()
       OR p_lab_id IN (SELECT public.my_connected_lab_ids())
       OR public.is_platform_admin()
     )
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.lab_order_defaults(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_order_defaults(uuid) TO authenticated;
