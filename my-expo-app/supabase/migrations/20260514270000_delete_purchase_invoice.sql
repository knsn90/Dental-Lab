-- delete_purchase_invoice: bir satın alma faturasını + bağlantılı kayıtları sil.
--   • p_revert_stock = true  → her stock_movement için stock_items.quantity düş, hareketleri sil
--   • p_revert_stock = false → sadece purchase_invoice_id linkini koparıp invoice'u sil
--                              (stok eklenen ürünler ve hareket geçmişi olduğu gibi kalır)
-- supplier_transactions ve expenses kayıtları her durumda silinir (fatura yok olduğu için).

CREATE OR REPLACE FUNCTION public.delete_purchase_invoice(
  p_invoice_id    uuid,
  p_revert_stock  boolean DEFAULT FALSE
)
RETURNS jsonb AS $$
DECLARE
  v_lab_id      uuid;
  v_movement    record;
  v_reverted    int := 0;
  v_supplier_id uuid;
BEGIN
  SELECT lab_id, supplier_id INTO v_lab_id, v_supplier_id
  FROM public.purchase_invoices
  WHERE id = p_invoice_id;

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'Purchase invoice % not found', p_invoice_id;
  END IF;

  IF p_revert_stock THEN
    -- Her IN hareketini geri al — stock_items.quantity düş
    FOR v_movement IN
      SELECT id, item_id, quantity
      FROM public.stock_movements
      WHERE purchase_invoice_id = p_invoice_id
        AND type = 'IN'
        AND item_id IS NOT NULL
    LOOP
      UPDATE public.stock_items
      SET quantity = GREATEST(0, quantity - v_movement.quantity),
          updated_at = NOW()
      WHERE id = v_movement.item_id;
      v_reverted := v_reverted + 1;
    END LOOP;

    -- Bu faturaya bağlı tüm stok hareketlerini sil
    DELETE FROM public.stock_movements WHERE purchase_invoice_id = p_invoice_id;
  END IF;

  -- supplier_transactions (PURCHASE) sil
  DELETE FROM public.supplier_transactions
  WHERE invoice_no IN (
    SELECT invoice_number FROM public.purchase_invoices WHERE id = p_invoice_id AND invoice_number IS NOT NULL
  ) AND supplier_id = v_supplier_id AND type = 'PURCHASE';

  -- expenses sil
  DELETE FROM public.expenses WHERE purchase_invoice_id = p_invoice_id;

  -- En son fatura kendisini sil
  DELETE FROM public.purchase_invoices WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'reverted_movements', v_reverted,
    'stock_reverted', p_revert_stock
  );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;
