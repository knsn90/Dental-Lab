-- Otomatik prim trigger'ı:
-- Bir order_stages satırı 'onaylandi' (yönetici onayı) durumuna geçtiğinde,
-- teknisyenin o ayki onaylanmış stage sayısı eşiği (bonus_threshold_orders)
-- aştıysa, her ek satır için bonus_per_extra_order tutarında bonus_auto kaydı
-- oluşturulur. stage_id ile idempotent — aynı stage için 2 kez prim yazılmaz.

-- 1. salary_adjustments → stage_id kolonu
ALTER TABLE salary_adjustments
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES order_stages(id) ON DELETE SET NULL;

-- Idempotency: aynı stage için 2. bonus_auto yazılamaz
CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_adj_bonus_auto_stage
  ON salary_adjustments(stage_id)
  WHERE type = 'bonus_auto' AND stage_id IS NOT NULL;

-- 2. Trigger fonksiyonu
CREATE OR REPLACE FUNCTION fn_auto_bonus_on_stage_approve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold int;
  v_per_order numeric(10,2);
  v_count int;
  v_period text;
BEGIN
  -- Sadece 'onaylandi' geçişinde (yöneticinin onay verdiği an)
  IF NEW.status <> 'onaylandi' OR (OLD.status IS NOT NULL AND OLD.status = 'onaylandi') THEN
    RETURN NEW;
  END IF;

  IF NEW.technician_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Teknisyenin bonus kuralı
  SELECT
    COALESCE(bonus_threshold_orders, 0),
    COALESCE(bonus_per_extra_order, 0)
  INTO v_threshold, v_per_order
  FROM profiles
  WHERE id = NEW.technician_id;

  -- Kural tanımlı değilse skip
  IF v_threshold IS NULL OR v_per_order <= 0 THEN
    RETURN NEW;
  END IF;

  v_period := to_char(now(), 'YYYY-MM');

  -- Bu ayki onaylanmış stage sayısı (bu satır dahil)
  SELECT COUNT(*) INTO v_count
  FROM order_stages
  WHERE technician_id = NEW.technician_id
    AND status = 'onaylandi'
    AND to_char(COALESCE(completed_at, updated_at, now()), 'YYYY-MM') = v_period;

  -- Eşiği aştıysa prim kaydı
  IF v_count > v_threshold THEN
    INSERT INTO salary_adjustments
      (user_id, type, amount, reason, work_order_id, stage_id, period_month, created_by)
    VALUES
      (NEW.technician_id, 'bonus_auto', v_per_order,
       format('Eşik üstü %s. tamamlama', v_count - v_threshold),
       NEW.work_order_id, NEW.id, v_period, NULL)
    ON CONFLICT (stage_id) WHERE type = 'bonus_auto' AND stage_id IS NOT NULL
    DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_bonus_on_stage_approve ON order_stages;
CREATE TRIGGER trg_auto_bonus_on_stage_approve
  AFTER UPDATE OF status ON order_stages
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_bonus_on_stage_approve();

COMMENT ON FUNCTION fn_auto_bonus_on_stage_approve IS
  'Stage onaylandığında teknisyenin aylık eşik üstü işleri için otomatik prim kaydı oluşturur';
