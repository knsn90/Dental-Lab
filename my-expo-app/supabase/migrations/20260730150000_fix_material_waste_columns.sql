-- ============================================================
-- 20260730 — report_material_waste kolonlarını UI ile hizala (K2)
--
-- Sorun: ProfitabilityScreen "Materyal Fire Raporu" kartı, fire oldukça ismi boş +
-- "0 [birim]" gösterecekti. Sebep: RPC dönüş kolonları UI tipiyle (WasteByMaterial)
-- uyuşmuyordu:
--   RPC: material_id, material_name, waste_quantity, waste_cost, waste_events, unit
--   UI : item_id,     item_name,     type,           waste_qty,   waste_cost,  unit
-- UI kayan alanları undefined okuyacaktı (isim/qty/type boş). (Şu an fire kaydı 0
-- olduğu için bölüm gizli; latent bug.)
--
-- Çözüm: RPC'yi UI'nin beklediği kolonlarla yeniden yaz (type = malzeme kategorisi).
-- İmza (uuid,date,date) sabit → uygulama deploy'u gerekmez. Kolon adı değişti → DROP+CREATE.
-- ============================================================

DROP FUNCTION IF EXISTS public.report_material_waste(uuid, date, date);

CREATE OR REPLACE FUNCTION public.report_material_waste(p_lab_id uuid, p_from date, p_to date)
RETURNS TABLE(item_id uuid, item_name text, type text, waste_qty numeric, waste_cost numeric, unit text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    si.id                                           AS item_id,
    si.name                                         AS item_name,
    COALESCE(si.category, si.type)                  AS type,
    SUM(sm.quantity)::numeric                        AS waste_qty,
    SUM(COALESCE(sm.total_cost_at_time,0))::numeric  AS waste_cost,
    si.unit                                         AS unit
  FROM stock_movements sm
  JOIN stock_items si ON si.id = sm.item_id
  WHERE sm.type = 'WASTE'
    AND sm.created_at::DATE BETWEEN p_from AND p_to
    AND si.lab_id = p_lab_id
  GROUP BY si.id, si.name, COALESCE(si.category, si.type), si.unit
  ORDER BY 5 DESC;
END;
$$;
