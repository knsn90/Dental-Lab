-- ============================================================
-- P0 — work_orders çok-kiracı (multi-tenant) izolasyonu
--
-- Sorun: 036 (ve öncesi) lab/admin work_orders politikalarından
-- `lab_id = get_my_lab_id()` şartını kaldırmıştı. Ayrıca tarihsel
-- migration'lardan kalma MÜKERRER lab/admin politikaları var
-- (my_user_type() varyantı + eski "Lab can ..." EXISTS varyantı).
-- RLS politikaları OR ile birleştiği için hiçbiri lab_id kontrol
-- etmiyor → çok-lab dünyasında lab A kullanıcısı lab B'nin
-- siparişlerini görebilir/değiştirebilir.
--
-- Çözüm: lab/admin blanket politikalarını (her iki varyant) düşür ve
-- `lab_id = get_my_lab_id()` ile tek temiz sete indir.
--
-- Güvenli mi (2026-07-11 canlı denetim): labs=1, lab/admin profillerin
-- TAMAMI lab_id dolu (NULL=0), work_orders'ın TAMAMI lab_id dolu (NULL=0).
-- Bu yüzden bugün fonksiyonel NO-OP; yalnız gelecekteki izolasyonu zorlar.
--
-- Doktor/klinik/teknisyen politikalarına DOKUNULMAZ:
--   • Doktor: doctor_id = auth.uid() (doktorlarda lab_id NULL; autofill
--     trigger'ı lab_id'yi klinik→lab zincirinden dolduruyor).
--   • Clinic admin: kendi kliniğinin hekimleri üzerinden (zaten lab-kapsamlı).
--   • Teknisyen: yalnız atandığı siparişi okur (aynı lab içinde atanır).
--
-- Idempotent.
-- ============================================================

-- ── lab/admin MÜKERRER politikaları düşür (her iki varyant) ──
DROP POLICY IF EXISTS "Lab users see all orders"     ON work_orders;  -- SELECT (my_user_type)
DROP POLICY IF EXISTS "Lab can select all work_orders" ON work_orders; -- SELECT (EXISTS profiles)
DROP POLICY IF EXISTS "Lab users can create orders"  ON work_orders;  -- INSERT (my_user_type)
DROP POLICY IF EXISTS "Lab can insert work_orders"   ON work_orders;  -- INSERT (EXISTS profiles)
DROP POLICY IF EXISTS "Lab users can update orders"  ON work_orders;  -- UPDATE (my_user_type)
DROP POLICY IF EXISTS "Lab can update work_orders"   ON work_orders;  -- UPDATE (EXISTS profiles)
DROP POLICY IF EXISTS work_orders_admin_delete       ON work_orders;  -- DELETE (admin)

-- ── Temiz, kiracı-kapsamlı lab/admin politikaları ──
CREATE POLICY wo_lab_select ON work_orders FOR SELECT
  USING (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id());

CREATE POLICY wo_lab_insert ON work_orders FOR INSERT
  WITH CHECK (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id());

CREATE POLICY wo_lab_update ON work_orders FOR UPDATE
  USING      (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id())
  WITH CHECK (my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id());

CREATE POLICY wo_lab_delete ON work_orders FOR DELETE
  USING (my_user_type() = 'admin' AND lab_id = get_my_lab_id());

-- ============================================================
-- END — P0 work_orders tenant isolation
-- ============================================================
