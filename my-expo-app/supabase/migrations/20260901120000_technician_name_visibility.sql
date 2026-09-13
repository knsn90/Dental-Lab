-- Hekim/kliniklere teknisyen adı görünürlüğü ayarı + maskeleme RPC'si.
-- full (Ad Soyad) | first (Sadece Ad) | hidden (Gizli). Varsayılan full (mevcut davranış).

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS technician_name_visibility text NOT NULL DEFAULT 'full';

ALTER TABLE public.lab_settings
  DROP CONSTRAINT IF EXISTS lab_settings_tech_name_vis_chk,
  ADD  CONSTRAINT lab_settings_tech_name_vis_chk
       CHECK (technician_name_visibility IN ('full','first','hidden'));

-- Teknisyen adlarını çağıranın rolüne göre maskeleyip döndürür (server-side gizlilik).
-- Hekim/klinik → teknisyenin lab'ının ayarına göre maskele; diğer roller → tam ad.
-- Tam adlar yalnız server'da; hekim/klinik istemcisine yalnız maskeli ad gider.
CREATE OR REPLACE FUNCTION public.get_display_tech_names(p_ids uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id,
    CASE
      WHEN (SELECT user_type FROM profiles WHERE id = auth.uid())
           IN ('doctor','clinic_admin','clinic_secretary')
      THEN CASE COALESCE(ls.technician_name_visibility, 'full')
             WHEN 'hidden' THEN ''
             WHEN 'first'  THEN split_part(COALESCE(p.full_name, ''), ' ', 1)
             ELSE COALESCE(p.full_name, '')
           END
      ELSE COALESCE(p.full_name, '')
    END AS name
  FROM profiles p
  LEFT JOIN lab_settings ls ON ls.lab_id = p.lab_id
  WHERE p.id = ANY(p_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.get_display_tech_names(uuid[]) TO authenticated;
