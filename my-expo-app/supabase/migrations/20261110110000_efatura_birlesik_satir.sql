-- 20261110110000_efatura_birlesik_satir — plan 5/5 Task 1 (spec §2.16, e-fatura birleşik satır + döküm).
--   * lab_settings.efatura_line_mode: 'kalem' (bugünkü davranış, her kalem ayrı e-fatura satırı) | 'birlesik'
--     (aynı hizmet + birim fiyat + oran birleşik satır). Varsayılan 'kalem' → mevcut lab'larda davranış değişmez.
--   * get_invoice_work_breakdown(p_invoice_id): kesinleşmiş faturanın iş dökümü ("F-1240 iş dökümü" PDF'i).
--     Dönüş plan 4 PreStatementInvoice biçimiyle birebir (+ clinic_name, lab_name). Hasta adı yalnız baş harf;
--     baş harf ve hekim adı ifadeleri get_pre_statement ile AYNI. dispute_status hep null, notes hep [] (e-fatura
--     onaydan sonra kesildiği için itiraz/not dökümde yer almaz).
--     Yetki: lab = invoices_lab_select (lab_id = get_my_lab_id() AND lab_can_view_finance());
--            klinik = _ps_profile_is_approver YA DA invoices klinik SELECT politikalarının mantığı
--            (clinic_id ∈ my_clinic_ids() AND can_view_clinic_billing(clinic_id); my_clinic_ids get_my_clinic_id'yi
--            içerir → clinic_view_clinic_invoices, clinic_view_multilab_invoices, doctor_view_own_clinic_invoices).
--            Diğer her durum (oturumsuz, fatura yok dahil) → PS_SCOPE (42501). Yetki durumdan ÖNCE denetlenir
--            (yetkisiz çağıran faturanın durumunu öğrenemez). Taslak / iptal → INV_NOT_FINALIZED (22023).
--   Veri satırlarına dokunmaz. Yeni fonksiyon PUBLIC/anon'a kapalı, authenticated'a açık.
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.lab_settings
  ADD COLUMN efatura_line_mode text NOT NULL DEFAULT 'kalem'
    CONSTRAINT lab_settings_efatura_line_mode_check CHECK (efatura_line_mode IN ('kalem', 'birlesik'));

CREATE FUNCTION public.get_invoice_work_breakdown(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_inv   invoices%ROWTYPE;
  v_ok    boolean := false;
  v_items jsonb;
BEGIN
  IF v_uid IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_inv FROM invoices i WHERE i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;

  -- Lab tarafı: invoices_lab_select ile aynı
  v_ok := COALESCE(v_inv.lab_id = get_my_lab_id() AND lab_can_view_finance(), false);
  -- Klinik tarafı: onaylayıcı ya da invoices klinik SELECT politikaları
  IF NOT v_ok AND v_inv.clinic_id IS NOT NULL THEN
    v_ok := COALESCE(_ps_profile_is_approver(v_uid, v_inv.clinic_id), false)
         OR COALESCE(v_inv.clinic_id IN (SELECT my_clinic_ids()) AND can_view_clinic_billing(v_inv.clinic_id), false);
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;

  IF v_inv.status IS NULL OR v_inv.status NOT IN ('kesildi', 'kismi_odendi', 'odendi') THEN
    RAISE EXCEPTION 'INV_NOT_FINALIZED' USING ERRCODE = '22023';
  END IF;

  -- Kalemler: get_pre_statement 'full' biçimi (hasta adı yalnız baş harf; aynı ifadeler, aynı sıra)
  WITH it AS (
    SELECT ii.id, ii.description, ii.quantity, ii.unit_price, ii.net_total, ii.total AS gross_total,
           ii.sort_order, ii.created_at,
           wo.order_number, wo.patient_name,
           COALESCE(dr.full_name, dp.full_name) AS doctor_name
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      LEFT JOIN order_items oi ON oi.id = ii.order_item_id
      LEFT JOIN work_orders wo ON wo.id = COALESCE(oi.work_order_id, i.work_order_id)
      LEFT JOIN doctors dr ON dr.id = COALESCE(wo.doctors_id, wo.doctor_id)
      LEFT JOIN profiles dp ON dp.id = wo.doctor_id
     WHERE i.id = v_inv.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', it.id,
           'description', it.description,
           'quantity', it.quantity,
           'unit_price', it.unit_price,
           'total', it.net_total,
           'gross_total', it.gross_total,
           'order_no', it.order_number,
           'patient_initials', (
             SELECT NULLIF(string_agg(upper(left(w, 1)) || '.', '' ORDER BY ord), '')
               FROM regexp_split_to_table(btrim(COALESCE(it.patient_name, '')), '\s+')
                    WITH ORDINALITY AS t(w, ord)
              WHERE w <> ''),
           'doctor_name', it.doctor_name,
           'dispute_status', NULL,
           'notes', '[]'::jsonb
         ) ORDER BY it.sort_order, it.created_at, it.id), '[]'::jsonb)
    INTO v_items
    FROM it;

  RETURN jsonb_build_object(
    'id', v_inv.id,
    'subtotal', v_inv.subtotal,
    'tax', v_inv.tax_amount,
    'invoice_number', v_inv.invoice_number,
    'currency', v_inv.currency,
    'issue_date', v_inv.issue_date,
    'created_at', v_inv.created_at,
    'updated_at', v_inv.updated_at,
    'total', v_inv.total,
    'items', v_items,
    'clinic_name', (SELECT c.name FROM clinics c WHERE c.id = v_inv.clinic_id),
    'lab_name', (SELECT l.name FROM labs l WHERE l.id = v_inv.lab_id));
END $function$;

REVOKE ALL ON FUNCTION public.get_invoice_work_breakdown(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invoice_work_breakdown(uuid) TO authenticated;

COMMIT;
