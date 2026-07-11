-- Backfill: clinic_admin profillerinin clinic_id'sini clinic_name eşleşmesinden çek.
-- Önceki backfill metadata'dan profile oluştururken clinic_id boştu →
-- RLS my_clinic_id() NULL döndü → klinik siparişlerini göremiyordu.

UPDATE public.profiles p
   SET clinic_id = c.id
  FROM public.clinics c
 WHERE p.clinic_id IS NULL
   AND p.user_type = 'clinic_admin'
   AND p.clinic_name IS NOT NULL
   AND lower(trim(p.clinic_name)) = lower(trim(c.name));

-- Fallback: clinic_name de boşsa auth.users.raw_user_meta_data->>'clinic_name' kullan
UPDATE public.profiles p
   SET clinic_id = c.id,
       clinic_name = u.raw_user_meta_data->>'clinic_name'
  FROM auth.users u
  JOIN public.clinics c
    ON lower(trim(c.name)) = lower(trim(u.raw_user_meta_data->>'clinic_name'))
 WHERE u.id = p.id
   AND p.clinic_id IS NULL
   AND p.user_type = 'clinic_admin'
   AND u.raw_user_meta_data->>'clinic_name' IS NOT NULL;
