-- ============================================================
-- P2b + view fix — kiracı izolasyonunu tamamla
--
-- (A) 4 view: security_invoker=on → taban-tablo RLS'i miras alsın (K4 deseni).
--     bottleneck_stations, machine_live_status, station_performance_summary,
--     supplier_balances — şu an DEFINER çalışıp RLS'i atlıyorlardı.
--
-- (B) Sipariş-türevli talep tabloları: order_cancellation_requests,
--     order_change_requests, support_tickets. Bunlar doktor/klinik (lab_id
--     NULL) tarafından oluşturulur → lab_id İŞ EMRİNDEN türetilir (yoksa
--     oluşturanın lab'ından). Sonra onaylayıcı/admin görünürlüğü lab_id ile
--     kısıtlanır. requester/creator kendi talebini her zaman görür.
-- Idempotent.
-- ============================================================

-- ── (A) View'ları invoker'a çevir ──
ALTER VIEW bottleneck_stations          SET (security_invoker = on);
ALTER VIEW machine_live_status          SET (security_invoker = on);
ALTER VIEW station_performance_summary  SET (security_invoker = on);
ALTER VIEW supplier_balances            SET (security_invoker = on);

-- ── (B1) lab_id türetici trigger fonksiyonları ──
CREATE OR REPLACE FUNCTION tg_req_lab_id_from_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.lab_id IS NULL AND NEW.work_order_id IS NOT NULL THEN
    SELECT lab_id INTO NEW.lab_id FROM work_orders WHERE id = NEW.work_order_id;
  END IF;
  IF NEW.lab_id IS NULL THEN
    SELECT lab_id INTO NEW.lab_id FROM profiles WHERE id = NEW.requested_by;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION tg_support_lab_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.lab_id IS NULL AND NEW.work_order_id IS NOT NULL THEN
    SELECT lab_id INTO NEW.lab_id FROM work_orders WHERE id = NEW.work_order_id;
  END IF;
  IF NEW.lab_id IS NULL THEN
    SELECT lab_id INTO NEW.lab_id FROM profiles WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS set_lab_id_from_order ON order_cancellation_requests;
CREATE TRIGGER set_lab_id_from_order BEFORE INSERT ON order_cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION tg_req_lab_id_from_order();
DROP TRIGGER IF EXISTS set_lab_id_from_order ON order_change_requests;
CREATE TRIGGER set_lab_id_from_order BEFORE INSERT ON order_change_requests
  FOR EACH ROW EXECUTE FUNCTION tg_req_lab_id_from_order();
DROP TRIGGER IF EXISTS set_lab_id ON support_tickets;
CREATE TRIGGER set_lab_id BEFORE INSERT ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION tg_support_lab_id();

-- ── (B2) Mevcut NULL lab_id backfill (order → creator → tek lab fallback) ──
UPDATE order_cancellation_requests o SET lab_id = wo.lab_id
  FROM work_orders wo WHERE o.work_order_id = wo.id AND o.lab_id IS NULL;
UPDATE order_cancellation_requests o SET lab_id = p.lab_id
  FROM profiles p WHERE o.requested_by = p.id AND o.lab_id IS NULL;
UPDATE order_change_requests o SET lab_id = wo.lab_id
  FROM work_orders wo WHERE o.work_order_id = wo.id AND o.lab_id IS NULL;
UPDATE order_change_requests o SET lab_id = p.lab_id
  FROM profiles p WHERE o.requested_by = p.id AND o.lab_id IS NULL;
UPDATE support_tickets s SET lab_id = wo.lab_id
  FROM work_orders wo WHERE s.work_order_id = wo.id AND s.lab_id IS NULL;
UPDATE support_tickets s SET lab_id = p.lab_id
  FROM profiles p WHERE s.user_id = p.id AND s.lab_id IS NULL;
-- son çare: tek lab
UPDATE order_cancellation_requests SET lab_id=(SELECT id FROM labs ORDER BY created_at LIMIT 1) WHERE lab_id IS NULL;
UPDATE order_change_requests       SET lab_id=(SELECT id FROM labs ORDER BY created_at LIMIT 1) WHERE lab_id IS NULL;
UPDATE support_tickets             SET lab_id=(SELECT id FROM labs ORDER BY created_at LIMIT 1) WHERE lab_id IS NULL;

-- ── (B3) Politika sıkılaştırma (onaylayıcı/admin dalına lab_id) ──
DROP POLICY IF EXISTS ocr_select ON order_cancellation_requests;
CREATE POLICY ocr_select ON order_cancellation_requests FOR SELECT
  USING (requested_by = auth.uid() OR (is_cancel_approver() AND lab_id = get_my_lab_id()));
DROP POLICY IF EXISTS ocr_update ON order_cancellation_requests;
CREATE POLICY ocr_update ON order_cancellation_requests FOR UPDATE
  USING      (is_cancel_approver() AND lab_id = get_my_lab_id())
  WITH CHECK (is_cancel_approver() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS ochr_select ON order_change_requests;
CREATE POLICY ochr_select ON order_change_requests FOR SELECT
  USING (requested_by = auth.uid() OR (is_cancel_approver() AND lab_id = get_my_lab_id()));
DROP POLICY IF EXISTS ochr_update ON order_change_requests;
CREATE POLICY ochr_update ON order_change_requests FOR UPDATE
  USING      (is_cancel_approver() AND lab_id = get_my_lab_id())
  WITH CHECK (is_cancel_approver() AND lab_id = get_my_lab_id());

DROP POLICY IF EXISTS support_tickets_select ON support_tickets;
CREATE POLICY support_tickets_select ON support_tickets FOR SELECT
  USING (user_id = auth.uid() OR (is_admin_user() AND lab_id = get_my_lab_id()));
DROP POLICY IF EXISTS support_tickets_update ON support_tickets;
CREATE POLICY support_tickets_update ON support_tickets FOR UPDATE
  USING (user_id = auth.uid() OR (is_admin_user() AND lab_id = get_my_lab_id()));

-- ============================================================
-- END — P2b + view isolation
-- ============================================================
