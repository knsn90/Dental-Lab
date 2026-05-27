-- ============================================================
-- RLS: Eksik policy'ler — couriers, deliveries, order_boxes, stage_photos
--
-- Bu tablolarda ENABLE ROW LEVEL SECURITY tanımlı ama hiç policy yok.
-- RLS enabled + no policy = tamamen erişim engeli (tüm sorgular boş döner).
-- Bu migration uygun lab-scoped policy'leri ekler.
-- Idempotent (DROP IF EXISTS kullanılır).
-- ============================================================

-- ─── 1. couriers ─────────────────────────────────────────────────────────
-- Sütunlar: id, profile_id, lab_id, full_name, phone, courier_type,
--           company_name, tracking_url_template, is_active, created_at
-- lab_id = courier'ı ekleyen lab'ın profil ID'si

DROP POLICY IF EXISTS "Lab users manage couriers" ON couriers;
CREATE POLICY "Lab users manage couriers"
  ON couriers FOR ALL
  USING  (is_lab_user() AND lab_id = get_my_lab_id())
  WITH CHECK (is_lab_user() AND lab_id = get_my_lab_id());

-- Kurye kendi kaydını okuyabilir (profile_id üzerinden)
DROP POLICY IF EXISTS "Courier reads own record" ON couriers;
CREATE POLICY "Courier reads own record"
  ON couriers FOR SELECT
  USING (profile_id = auth.uid());

-- ─── 2. deliveries ───────────────────────────────────────────────────────
-- Sütunlar: id, work_order_id, courier_id, ...
-- Erişim: iş emrine erişimi olan lab kullanıcıları ve ilgili kurye

DROP POLICY IF EXISTS "Lab users manage deliveries" ON deliveries;
CREATE POLICY "Lab users manage deliveries"
  ON deliveries FOR ALL
  USING (
    is_lab_user()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = deliveries.work_order_id
        AND wo.lab_id = get_my_lab_id()
    )
  )
  WITH CHECK (
    is_lab_user()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = deliveries.work_order_id
        AND wo.lab_id = get_my_lab_id()
    )
  );

-- Kurye kendi teslimatlarını görebilir
DROP POLICY IF EXISTS "Courier views own deliveries" ON deliveries;
CREATE POLICY "Courier views own deliveries"
  ON deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM couriers c
      WHERE c.id = deliveries.courier_id
        AND c.profile_id = auth.uid()
    )
  );

-- Doktorlar kendi iş emirlerinin teslimatlarını görebilir
DROP POLICY IF EXISTS "Doctors view own order deliveries" ON deliveries;
CREATE POLICY "Doctors view own order deliveries"
  ON deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = deliveries.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  );

-- ─── 3. order_boxes ──────────────────────────────────────────────────────
-- Sütunlar: id, box_code, qr_payload, epaper_device_id,
--           current_order_id, is_available, created_at
-- lab_id yok; iş emri bağlantısı current_order_id üzerinden

DROP POLICY IF EXISTS "Lab users manage order_boxes" ON order_boxes;
CREATE POLICY "Lab users manage order_boxes"
  ON order_boxes FOR ALL
  USING  (is_lab_user())
  WITH CHECK (is_lab_user());

-- ─── 4. stage_photos ─────────────────────────────────────────────────────
-- Sütunlar: id, stage_id, work_order_id, storage_path,
--           uploaded_by, caption, created_at

DROP POLICY IF EXISTS "Lab users manage stage_photos" ON stage_photos;
CREATE POLICY "Lab users manage stage_photos"
  ON stage_photos FOR ALL
  USING (
    is_lab_user()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = stage_photos.work_order_id
        AND wo.lab_id = get_my_lab_id()
    )
  )
  WITH CHECK (
    is_lab_user()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = stage_photos.work_order_id
        AND wo.lab_id = get_my_lab_id()
    )
  );

-- Doktorlar kendi iş emirlerinin fotoğraflarını görebilir
DROP POLICY IF EXISTS "Doctors view own order photos" ON stage_photos;
CREATE POLICY "Doctors view own order photos"
  ON stage_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = stage_photos.work_order_id
        AND wo.doctor_id = auth.uid()
    )
  );

-- Fotoğrafı yükleyen kullanıcı silebilir
DROP POLICY IF EXISTS "Uploader can delete stage_photo" ON stage_photos;
CREATE POLICY "Uploader can delete stage_photo"
  ON stage_photos FOR DELETE
  USING (uploaded_by = auth.uid());
