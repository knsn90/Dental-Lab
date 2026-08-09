-- FAZ 1 — Stok miktarı tek kaynak (trigger) + elle güncellemelerin kaldırılması.
--
-- Sorun: stock_items.quantity üç farklı yolda (RPC'ler + client read-modify-write)
-- imperatif güncelleniyordu → drift, yarış/lost-update, defter-stok ayrışması, negatif stok.
--
-- Çözüm: stock_movements → stock_items.quantity ATOMİK trigger (trg_stock_qty_sync)
-- ile bakım. Birim-dönüşümlü (convert_qty), is_reversed farkında, IN/RETURN/ADJUST (+)
-- OUT/WASTE (−). Tüm RPC'lerden ve client'tan elle "UPDATE stock_items SET quantity"
-- KALDIRILDI (çift sayım olmasın). Trigger yalnız YENİ hareket değişimlerine delta
-- uygular → mevcut quantity taban olarak korunur (artımsal; geçmiş yeniden hesaplanmaz).

-- ── 1) Hareketin kalem-birimindeki işaretli etkisi ────────────────────────────
CREATE OR REPLACE FUNCTION public.stock_effect(
  p_item_id uuid, p_type text, p_qty numeric, p_unit text, p_reversed boolean
) RETURNS numeric
LANGUAGE plpgsql STABLE
AS $fn$
DECLARE u text; conv numeric; dir int;
BEGIN
  IF p_item_id IS NULL OR COALESCE(p_reversed,false) OR p_qty IS NULL THEN RETURN 0; END IF;
  SELECT unit INTO u FROM public.stock_items WHERE id = p_item_id;
  conv := public.convert_qty(p_qty, p_unit, u);          -- çevrilemezse p_qty aynen
  dir := CASE upper(coalesce(p_type,''))
           WHEN 'IN' THEN 1 WHEN 'RETURN' THEN 1 WHEN 'ADJUST' THEN 1
           WHEN 'OUT' THEN -1 WHEN 'WASTE' THEN -1 ELSE 0 END;
  RETURN COALESCE(conv,0) * dir;
END;
$fn$;

-- ── 2) Trigger: hareket insert/update/delete → quantity delta ─────────────────
CREATE OR REPLACE FUNCTION public.trg_stock_qty_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE d numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    d := public.stock_effect(NEW.item_id, NEW.type, NEW.quantity, NEW.unit, NEW.is_reversed);
    IF NEW.item_id IS NOT NULL AND d <> 0 THEN
      UPDATE public.stock_items SET quantity = quantity + d, updated_at = now() WHERE id = NEW.item_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    d := public.stock_effect(OLD.item_id, OLD.type, OLD.quantity, OLD.unit, OLD.is_reversed);
    IF OLD.item_id IS NOT NULL AND d <> 0 THEN
      UPDATE public.stock_items SET quantity = quantity - d, updated_at = now() WHERE id = OLD.item_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.item_id IS NOT DISTINCT FROM NEW.item_id THEN
      d := public.stock_effect(NEW.item_id, NEW.type, NEW.quantity, NEW.unit, NEW.is_reversed)
         - public.stock_effect(OLD.item_id, OLD.type, OLD.quantity, OLD.unit, OLD.is_reversed);
      IF NEW.item_id IS NOT NULL AND d <> 0 THEN
        UPDATE public.stock_items SET quantity = quantity + d, updated_at = now() WHERE id = NEW.item_id;
      END IF;
    ELSE
      -- item_id değişti: eski etkisini eski kalemden çıkar, yeni etkisini yeni kaleme ekle
      IF OLD.item_id IS NOT NULL THEN
        UPDATE public.stock_items SET quantity = quantity
             - public.stock_effect(OLD.item_id, OLD.type, OLD.quantity, OLD.unit, OLD.is_reversed),
             updated_at = now() WHERE id = OLD.item_id;
      END IF;
      IF NEW.item_id IS NOT NULL THEN
        UPDATE public.stock_items SET quantity = quantity
             + public.stock_effect(NEW.item_id, NEW.type, NEW.quantity, NEW.unit, NEW.is_reversed),
             updated_at = now() WHERE id = NEW.item_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_stock_qty_sync ON public.stock_movements;
CREATE TRIGGER trg_stock_qty_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_qty_sync();

-- ── 3) Elle "UPDATE stock_items SET quantity = quantity ±" KALDIRILDI ─────────
-- Aşağıdaki RPC'ler CANLI olarak CREATE OR REPLACE edildi (tam gövdeler DB'de
-- otoriter; regenerate: pg_get_functiondef). Her birinden yalnız elle quantity
-- güncellemesi çıkarıldı, diğer davranış (unit_cost/currency/movement insert) korundu:
--   • confirm_stage_materials      (2 elle update → 0)
--   • create_purchase_invoice      (12-arg + 13-arg overload; +v_qty → 0; unit_cost korundu)
--   • create_return_movement       (+v_orig.quantity → 0; RETURN movement trigger'la geri ekler)
--   • delete_purchase_invoice      (elle revert loop → hareket DELETE; trigger geri alır)
--   • record_stage_consumption     (-v_qty → 0)
--   • record_waste                 (-p_quantity → 0)
--   • revert_stage_consumption     (elle + IN movement + is_reversed = 3× idi → yalnız is_reversed)
-- create_stock_movement_with_snapshot zaten quantity'ye dokunmuyordu; client
-- (StockScreen.MovementModal) read-modify-write KALDIRILDI — tek yazıcı: trigger.
