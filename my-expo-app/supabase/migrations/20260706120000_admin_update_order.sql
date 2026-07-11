-- Admin/lab: sipariş kapsamlı düzenleme (gate YOK, sahiplik YOK — sadece lab/admin yetkisi).
-- _apply_order_edit'i (order_change_requests migration'ında tanımlı) yeniden kullanır.

CREATE OR REPLACE FUNCTION public.admin_update_order(
  p_order_id uuid, p_fields jsonb, p_items jsonb DEFAULT NULL
) RETURNS public.work_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_lab_user() THEN
    RAISE EXCEPTION 'Bu işlem için lab/yönetici yetkisi gerekir.' USING errcode = '42501';
  END IF;
  RETURN public._apply_order_edit(p_order_id, p_fields, p_items);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_order(uuid, jsonb, jsonb) TO authenticated;
