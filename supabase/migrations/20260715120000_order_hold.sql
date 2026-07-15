-- İşi Beklet (hold) — lab kaynaklı OLMAYAN beklemeler lab gecikmesine yazılmasın.
--
-- Sorun: hekim eksik tarama gönderdiği için iş duruyor, ama sipariş "8 GÜN GECİKTİ"
-- görünüyor — suç lab'da değil. Karar (kullanıcı): bekleme MÜŞTERİ kaynaklıysa
-- devam ettirildiğinde teslim tarihi beklenen gün kadar ÖTELENİR → mevcut gecikme
-- hesabı ( delivery_date < bugün ) aynen çalışır, lab cezalanmaz.
--
-- Tamamen additive: hold_status NULL olan tüm mevcut siparişler bugünkü gibi davranır.

-- ── 1) work_orders hold alanları ───────────────────────────────────────────
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS hold_status      text,
  ADD COLUMN IF NOT EXISTS hold_reason      text,
  ADD COLUMN IF NOT EXISTS hold_category    text,
  ADD COLUMN IF NOT EXISTS hold_responsible text,
  ADD COLUMN IF NOT EXISTS hold_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS hold_by          uuid;

DO $$ BEGIN
  ALTER TABLE work_orders ADD CONSTRAINT work_orders_hold_status_chk
    CHECK (hold_status IS NULL OR hold_status = 'on_hold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_orders ADD CONSTRAINT work_orders_hold_responsible_chk
    CHECK (hold_responsible IS NULL OR hold_responsible IN ('client','lab'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS work_orders_hold_status_idx
  ON work_orders(hold_status) WHERE hold_status IS NOT NULL;

-- ── 2) Denetim izi — her bekletme bir satır (kim/ne zaman/neden/kaç gün ötelendi)
CREATE TABLE IF NOT EXISTS work_order_holds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  lab_id         uuid,
  reason         text,
  category       text,
  responsible    text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  extended_days  int NOT NULL DEFAULT 0,
  held_by        uuid,
  resumed_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_order_holds_wo_idx ON work_order_holds(work_order_id);
ALTER TABLE work_order_holds ENABLE ROW LEVEL SECURITY;

-- Lab tarafı kendi bekletme geçmişini okur. Yazım yalnız DEFINER RPC'lerle.
DROP POLICY IF EXISTS wo_holds_lab_read ON work_order_holds;
CREATE POLICY wo_holds_lab_read ON work_order_holds
  FOR SELECT TO authenticated
  USING (lab_id = get_my_lab_id());

-- ── 3) RPC: işi beklet ─────────────────────────────────────────────────────
-- p_responsible: 'client' (hekim/klinik kaynaklı → teslim ötelenir)
--                'lab'    (lab kaynaklı → ötelenmez, gecikme lab'da kalır)
CREATE OR REPLACE FUNCTION hold_order(
  p_order       uuid,
  p_reason      text,
  p_category    text DEFAULT 'client_other',
  p_responsible text DEFAULT 'client'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lab uuid; v_resp text;
BEGIN
  SELECT lab_id INTO v_lab FROM work_orders WHERE id = p_order;
  IF v_lab IS NULL OR v_lab IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Bu siparişi bekletme yetkiniz yok';
  END IF;

  v_resp := CASE WHEN coalesce(p_responsible,'client') = 'lab' THEN 'lab' ELSE 'client' END;

  UPDATE work_orders SET
    hold_status      = 'on_hold',
    hold_reason      = nullif(btrim(p_reason), ''),
    hold_category    = p_category,
    hold_responsible = v_resp,
    hold_started_at  = now(),
    hold_by          = auth.uid()
  WHERE id = p_order
    AND hold_status IS DISTINCT FROM 'on_hold';   -- zaten beklemedeyse dokunma

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO work_order_holds(work_order_id, lab_id, reason, category, responsible, started_at, held_by)
  VALUES (p_order, v_lab, nullif(btrim(p_reason), ''), p_category, v_resp, now(), auth.uid());
END $$;

-- ── 4) RPC: devam ettir → müşteri kaynaklıysa teslim tarihini ötele ────────
-- Dönüş: ötelenen gün sayısı (0 = ötelenmedi).
CREATE OR REPLACE FUNCTION resume_order(p_order uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lab uuid; v_started timestamptz; v_resp text; v_days int;
BEGIN
  SELECT lab_id, hold_started_at, hold_responsible
    INTO v_lab, v_started, v_resp
  FROM work_orders WHERE id = p_order;

  IF v_lab IS NULL OR v_lab IS DISTINCT FROM get_my_lab_id() THEN
    RAISE EXCEPTION 'Bu siparişi devam ettirme yetkiniz yok';
  END IF;
  IF v_started IS NULL THEN RETURN 0; END IF;   -- beklemede değil → no-op

  -- delivery_date DATE → gün çözünürlüğü; en yakın güne yuvarla.
  v_days := greatest(0, round(extract(epoch FROM (now() - v_started)) / 86400.0))::int;

  IF coalesce(v_resp,'client') = 'client' AND v_days > 0 THEN
    UPDATE work_orders SET delivery_date = delivery_date + v_days WHERE id = p_order;
  ELSE
    v_days := 0;                                -- lab kaynaklı → ötelenmez
  END IF;

  UPDATE work_orders SET
    hold_status = NULL, hold_reason = NULL, hold_category = NULL,
    hold_responsible = NULL, hold_started_at = NULL, hold_by = NULL
  WHERE id = p_order;

  UPDATE work_order_holds SET
    ended_at = now(), extended_days = v_days, resumed_by = auth.uid()
  WHERE work_order_id = p_order AND ended_at IS NULL;

  RETURN v_days;
END $$;

REVOKE ALL ON FUNCTION hold_order(uuid,text,text,text) FROM public, anon;
REVOKE ALL ON FUNCTION resume_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION hold_order(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION resume_order(uuid) TO authenticated;
