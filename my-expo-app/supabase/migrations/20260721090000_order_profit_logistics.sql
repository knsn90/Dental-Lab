-- ============================================================
-- 20260721090000 — Sipariş kârı: lojistik kalemi + bozuk RPC onarımı (Faz 3)
--
-- İki iş birden:
--  1) calculate_order_profit CANLIDA BOZUKTU — olmayan `work_orders.price`
--     kolonuna bakıyordu, her çağrıda hata veriyordu (sipariş detayındaki
--     kâr paneli bu yüzden hiç görünmüyordu). Gerçek kolonlara taşındı:
--     sale_price / discount_amount / material_cost / labor_cost / overhead_cost.
--  2) Kurye masrafı artık maliyete giriyor: deliveries.fee_amount (iptal hariç).
--
-- Para birimi: lab'ın baz para biriminde olan ücretler toplanır; farklı
-- dövizdekiler `logistics_other` jsonb'sinde AYRI gösterilir (kur çevrimi YOK).
--
-- Dönüş tipi genişlediği için DROP + CREATE gerekiyor (CREATE OR REPLACE
-- return type değiştiremez). Yetki modeli aynen korundu (SECURITY DEFINER,
-- authenticated) — davranış değişikliği yalnız hesapta.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.calculate_order_profit(UUID);

CREATE OR REPLACE FUNCTION public.calculate_order_profit(p_work_order_id UUID)
RETURNS TABLE(
  sale_price      NUMERIC,
  discount_amount NUMERIC,
  net_revenue     NUMERIC,
  material_cost   NUMERIC,
  labor_cost      NUMERIC,
  logistics_cost  NUMERIC,
  overhead_cost   NUMERIC,
  total_cost      NUMERIC,
  profit          NUMERIC,
  margin_pct      NUMERIC,
  currency        TEXT,
  logistics_other JSONB
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $fn$
DECLARE
  v_lab_id     UUID;
  v_base       TEXT;
  v_sale       NUMERIC := 0;
  v_discount   NUMERIC := 0;
  v_net        NUMERIC := 0;
  v_material   NUMERIC := 0;
  v_labor      NUMERIC := 0;
  v_logistics  NUMERIC := 0;
  v_overhead   NUMERIC := 0;
  v_other      JSONB;
  v_total      NUMERIC := 0;
BEGIN
  SELECT wo.lab_id,
         COALESCE(wo.sale_price, 0),
         COALESCE(wo.discount_amount, 0),
         COALESCE(wo.overhead_cost, 0),
         wo.material_cost,
         wo.labor_cost
    INTO v_lab_id, v_sale, v_discount, v_overhead, v_material, v_labor
    FROM public.work_orders wo
   WHERE wo.id = p_work_order_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Lab baz para birimi — ₺ hardcode yok
  SELECT ls.default_currency INTO v_base
    FROM public.lab_settings ls WHERE ls.lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  -- Malzeme: work_orders.material_cache boşsa stok hareketlerinden hesapla
  -- (recompute_order_cost trigger'ı normalde cache'i günceller).
  IF v_material IS NULL THEN
    SELECT COALESCE(SUM(COALESCE(sm.total_cost_at_time, 0)), 0) INTO v_material
      FROM public.stock_movements sm
     WHERE sm.order_id = p_work_order_id
       AND sm.type IN ('OUT', 'WASTE');
  END IF;

  -- İşçilik: cache boşsa order_stages süresi × teknisyen saatlik ücreti.
  -- (Eski sürüm ölü `stage_log` tablosuna bakıyordu → hep 0.)
  IF v_labor IS NULL THEN
    SELECT COALESCE(SUM(
             (COALESCE(os.active_work_seconds, 0) / 3600.0) * COALESCE(p.hourly_rate, 0)
           ), 0) INTO v_labor
      FROM public.order_stages os
      LEFT JOIN public.profiles p ON p.id = os.technician_id
     WHERE os.work_order_id = p_work_order_id;
  END IF;

  -- Lojistik: siparişin tüm kurye hareketleri (final teslimat + ara bacaklar).
  -- İptal edilenler sayılmaz. Masraf her zaman lab giderdir.
  SELECT COALESCE(SUM(d.fee_amount), 0) INTO v_logistics
    FROM public.deliveries d
   WHERE d.work_order_id = p_work_order_id
     AND d.status <> 'iptal'
     AND d.fee_amount IS NOT NULL
     AND COALESCE(d.fee_currency, v_base) = v_base;

  -- Baz dışı dövizler — toplanmaz, ayrı raporlanır (katı per-currency)
  SELECT jsonb_object_agg(t.cur, t.amt) INTO v_other
    FROM (
      SELECT d.fee_currency AS cur, SUM(d.fee_amount) AS amt
        FROM public.deliveries d
       WHERE d.work_order_id = p_work_order_id
         AND d.status <> 'iptal'
         AND d.fee_amount IS NOT NULL
         AND COALESCE(d.fee_currency, v_base) <> v_base
       GROUP BY d.fee_currency
    ) t;

  v_material := COALESCE(v_material, 0);
  v_labor    := COALESCE(v_labor, 0);
  v_net      := v_sale - v_discount;
  v_total    := v_material + v_labor + v_logistics + v_overhead;

  RETURN QUERY SELECT
    v_sale,
    v_discount,
    v_net,
    v_material,
    v_labor,
    v_logistics,
    v_overhead,
    v_total,
    (v_net - v_total),
    CASE WHEN v_net > 0 THEN ROUND(((v_net - v_total) / v_net) * 100, 1) ELSE NULL END,
    v_base,
    COALESCE(v_other, '{}'::jsonb);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.calculate_order_profit(UUID) TO authenticated;

COMMIT;
