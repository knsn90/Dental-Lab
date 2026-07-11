-- ════════════════════════════════════════════════════════════════════════════
-- Klinik admin paneli — doctors tablosu görünürlüğü
--
-- Sorun:
--   work_orders.doctor_id polymorphic (profiles.id VEYA doctors.id).
--   my_clinic_doctors view'ı sadece profiles'tan çekiyordu →
--   doctors tablosundaki hekimler ve onların siparişleri klinik panelinde görünmüyordu.
--
-- Çözüm:
--   1) my_clinic_doctors view'ı UNION ile doctors tablosunu da dahil et
--   2) clinic_admin_view_clinic_orders RLS policy'sini doctors join ile genişlet
--   3) doctors tablosu için clinic_admin SELECT policy'si ekle
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) my_clinic_doctors view: profiles + doctors UNION
CREATE OR REPLACE VIEW my_clinic_doctors AS
  -- Auth hesabı olan hekimler (profiles)
  SELECT p.id,
         p.full_name,
         p.phone,
         p.avatar_url,
         p.is_active,
         p.clinic_id,
         c.name AS clinic_name,
         'profile'::text AS source
    FROM profiles p
    LEFT JOIN clinics c ON c.id = p.clinic_id
   WHERE p.user_type = 'doctor'
     AND p.clinic_id IS NOT NULL
     AND p.clinic_id = my_clinic_id()
  UNION ALL
  -- Sadece doctors tablosunda olan (auth hesabı yok) hekimler
  SELECT d.id,
         d.full_name,
         d.phone,
         NULL::text AS avatar_url,
         d.is_active,
         d.clinic_id,
         c.name AS clinic_name,
         'doctors'::text AS source
    FROM doctors d
    LEFT JOIN clinics c ON c.id = d.clinic_id
   WHERE d.clinic_id IS NOT NULL
     AND d.clinic_id = my_clinic_id()
     -- Aynı kişi hem profiles hem doctors'ta varsa profiles satırı önceliklidir
     AND NOT EXISTS (
       SELECT 1 FROM profiles p2
        WHERE p2.user_type = 'doctor'
          AND lower(trim(p2.full_name)) = lower(trim(d.full_name))
          AND p2.clinic_id = d.clinic_id
     );

-- 2) work_orders RLS: doctors join ile genişlet
DROP POLICY IF EXISTS clinic_admin_view_clinic_orders ON work_orders;
CREATE POLICY clinic_admin_view_clinic_orders
  ON work_orders FOR SELECT
  USING (
    is_clinic_admin()
    AND my_clinic_id() IS NOT NULL
    AND (
      -- Profile-based hekim (auth user)
      EXISTS (
        SELECT 1 FROM profiles p_doc
         WHERE p_doc.id = work_orders.doctor_id
           AND p_doc.clinic_id = my_clinic_id()
      )
      OR
      -- doctors-table hekim (no auth user)
      EXISTS (
        SELECT 1 FROM doctors d_doc
         WHERE d_doc.id = work_orders.doctor_id
           AND d_doc.clinic_id = my_clinic_id()
      )
    )
  );

-- 3) doctors tablosu için clinic_admin SELECT policy
DROP POLICY IF EXISTS clinic_admin_view_clinic_doctors ON doctors;
CREATE POLICY clinic_admin_view_clinic_doctors
  ON doctors FOR SELECT
  USING (
    is_clinic_admin()
    AND clinic_id = my_clinic_id()
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
