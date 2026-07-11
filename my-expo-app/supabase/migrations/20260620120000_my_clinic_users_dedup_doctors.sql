-- FIX: Kullanıcılar sayfasında tekrarlanan hekim.
-- my_clinic_users view'u doctors dalında dedup yapmıyordu → aynı hekim hem
-- profiles (kayıtlı kullanıcı, user_type='doctor') hem doctors tablosunda varsa
-- listede İKİ kez görünüyordu (ör. "Dr. Aylin Şahiner").
-- Çözüm: my_clinic_doctors ile aynı NOT EXISTS koruması — aynı klinikte aynı
-- isimli profil-hekim varsa doctors satırı gizlenir (zengin profil kaydı kalır:
-- e-posta, clinic_permissions). Sipariş doctor_id bağlantısını etkilemez.
CREATE OR REPLACE VIEW public.my_clinic_users AS
  SELECT p.id, p.full_name, p.phone, p.email, p.avatar_url, p.is_active,
         p.clinic_id, p.clinic_name, p.user_type, p.specialty,
         p.clinic_permissions, p.created_at
    FROM profiles p
   WHERE p.user_type = ANY (ARRAY['doctor','clinic_admin','clinic_secretary'])
     AND p.clinic_id IS NOT NULL
     AND p.clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  UNION ALL
  SELECT d.id, d.full_name, d.phone, NULL::text AS email, NULL::text AS avatar_url,
         d.is_active, d.clinic_id, c.name AS clinic_name, 'doctor'::text AS user_type,
         d.specialty, NULL::jsonb AS clinic_permissions, d.created_at
    FROM doctors d
    LEFT JOIN clinics c ON c.id = d.clinic_id
   WHERE d.clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM profiles p2
       WHERE p2.user_type = 'doctor'
         AND lower(trim(p2.full_name)) = lower(trim(d.full_name))
         AND p2.clinic_id = d.clinic_id
     );
