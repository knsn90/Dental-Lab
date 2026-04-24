-- ============================================================
-- 038 — order_messages RLS düzeltmesi
--
-- Sorun:
--   011_order_messages.sql'de doctor için policy çok katı:
--     wo.doctor_id = auth.uid()
--   Bu sadece DOKTORUN KENDİ AÇTIĞI siparişler için doğru
--   (doctor_id = profile.id). Lab/admin tarafından açılmış siparişlerde
--   doctor_id external doctors.id olduğu için doktor MESAJLARI GÖREMEZ.
--
--   Ayrıca clinic_admin için hiç policy yoktu — klinik müdürü hiç
--   mesaj göremezdi.
--
-- Çözüm:
--   work_orders RLS'inin implicit uygulanmasından yararlan:
--     EXISTS (SELECT 1 FROM work_orders WHERE id = ...)
--   Bu sorgu work_orders SELECT policy'lerini otomatik uygular →
--   kullanıcı hangi siparişleri görebiliyorsa o siparişlerin
--   mesajlarına da erişebilir. Lab, admin, doctor, clinic_admin —
--   hepsi tek policy ile tutarlı.
--
-- Idempotent: tekrar çalıştırılabilir.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. ESKİ POLICY'LERİ DÜŞÜR
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "order_messages_lab_admin" ON order_messages;
DROP POLICY IF EXISTS "order_messages_doctor"    ON order_messages;
DROP POLICY IF EXISTS "order_messages_access"    ON order_messages;

-- ──────────────────────────────────────────────────────────────
-- 2. UNIFIED POLICY — work_orders RLS implicit uygulanır
--    Kullanıcı hangi work_order'a SELECT yetkisi varsa o siparişin
--    mesajlarına da erişebilir (SELECT/INSERT/UPDATE/DELETE)
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "order_messages_access"
  ON order_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
    )
    -- Mesaj göndericisi auth.uid() olmalı (kimse başkası adına yazamaz)
    AND order_messages.sender_id = auth.uid()
  );

-- ============================================================
-- END OF 038
-- ============================================================
