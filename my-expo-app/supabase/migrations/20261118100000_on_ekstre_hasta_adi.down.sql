-- Geri alma: get_pre_statement'ın önceki tanımı (md5 bef87cf2…)
CREATE OR REPLACE FUNCTION public.get_pre_statement(p_clinic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor    text := _ps_actor(p_clinic_id);
  v_full     boolean;
  v_lab      uuid;
  v_enabled  boolean;
  v_summary  jsonb;
  v_invoices jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501'; END IF;
  v_full := _ps_full_scope(p_clinic_id);
  SELECT c.lab_id INTO v_lab FROM clinics c WHERE c.id = p_clinic_id;
  SELECT COALESCE(bool_or(s.invoice_approval_enabled), false) INTO v_enabled
    FROM lab_settings s WHERE s.lab_id = v_lab;

  -- Taslak kalemleri (scope 'own' iken yalnız çağıran hekimin siparişleri)
  WITH it AS (
    SELECT ii.invoice_id, ii.id, ii.description, ii.quantity, ii.unit_price, ii.net_total, ii.total AS gross_total,
           ii.sort_order, ii.created_at,
           wo.order_number, wo.patient_name,
           COALESCE(dr.full_name, dp.full_name) AS doctor_name,
           sd.status AS dispute_status
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      LEFT JOIN order_items oi ON oi.id = ii.order_item_id
      LEFT JOIN work_orders wo ON wo.id = COALESCE(oi.work_order_id, i.work_order_id)
      LEFT JOIN doctors dr ON dr.id = COALESCE(wo.doctors_id, wo.doctor_id)
      LEFT JOIN profiles dp ON dp.id = wo.doctor_id
      LEFT JOIN statement_item_disputes sd ON sd.invoice_item_id = ii.id
     WHERE i.clinic_id = p_clinic_id AND i.lab_id = v_lab AND i.status = 'taslak'
       AND (v_full OR (wo.id IS NOT NULL
                       AND (COALESCE(doctor_owns_order_doctor(wo.doctor_id), false)
                            OR (wo.doctors_id IS NOT NULL AND _doctor_profile_owns_doctor(auth.uid(), wo.doctors_id)))))
  ), per_inv AS (
    SELECT it.invoice_id,
           sum(it.net_total) AS visible_net,
           jsonb_agg(jsonb_build_object(
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
             'dispute_status', it.dispute_status,
             'notes', (
               SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'id', n.id, 'author_side', n.author_side,
                        'body', n.body, 'created_at', n.created_at)
                        ORDER BY n.created_at, n.id), '[]'::jsonb)
                 FROM statement_item_notes n WHERE n.invoice_item_id = it.id)
           ) ORDER BY it.sort_order, it.created_at, it.id) AS items
      FROM it GROUP BY it.invoice_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'subtotal', CASE WHEN v_full THEN i.subtotal ELSE q.own_subtotal END,
           'tax', CASE WHEN v_full THEN i.tax_amount ELSE q.own_tax END,
           'invoice_number', i.invoice_number,
           'currency', i.currency,
           'issue_date', i.issue_date,
           'created_at', i.created_at,
           'updated_at', i.updated_at,
           'total', CASE WHEN v_full THEN i.total ELSE q.own_subtotal + q.own_tax END,
           'items', COALESCE(x.items, '[]'::jsonb)
         ) ORDER BY i.issue_date, i.created_at, i.id), '[]'::jsonb)
    INTO v_invoices
    FROM invoices i
    LEFT JOIN per_inv x ON x.invoice_id = i.id
    -- 'own': görünen kalemlerin payı = Σnet(görünen) / Σnet(fatura); fatura altı indirim ve KDV bu payla
    -- dağıtılır (indirim yoksa subtotal = Σnet görünen). Sıfır Σnet'te pay 0.
    CROSS JOIN LATERAL (
      SELECT round(COALESCE(x.visible_net, 0) - COALESCE(i.discount_amount, 0) * sh.share, 2) AS own_subtotal,
             round(COALESCE(i.tax_amount, 0) * sh.share, 2) AS own_tax
        FROM (SELECT CASE WHEN COALESCE(a.all_net, 0) = 0 THEN 0
                          ELSE COALESCE(x.visible_net, 0) / a.all_net END AS share
                FROM (SELECT sum(ii2.net_total) AS all_net FROM invoice_items ii2 WHERE ii2.invoice_id = i.id) a) sh
    ) q
   WHERE i.clinic_id = p_clinic_id AND i.lab_id = v_lab AND i.status = 'taslak'
     AND (v_full OR x.invoice_id IS NOT NULL);

  IF v_full THEN
    WITH drafts AS (
      SELECT COALESCE(i.currency, 'TRY') AS currency, sum(i.total) AS pending
        FROM invoices i
       WHERE i.clinic_id = p_clinic_id AND i.lab_id = v_lab AND i.status = 'taslak'
       GROUP BY 1
    ), bal AS (
      SELECT b.currency, b.balance, b.overdue_net
        FROM v_clinic_balance_ccy b
       WHERE b.clinic_id = p_clinic_id AND b.lab_id = v_lab
    ), ccy AS (
      SELECT currency FROM drafts UNION SELECT currency FROM bal
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'currency', c.currency,
             'finalized_balance', COALESCE(b.balance, 0),
             'overdue', COALESCE(b.overdue_net, 0),
             'pending', COALESCE(d.pending, 0)) ORDER BY c.currency), '[]'::jsonb)
      INTO v_summary
      FROM ccy c LEFT JOIN bal b ON b.currency = c.currency LEFT JOIN drafts d ON d.currency = c.currency;
  ELSE
    -- 'own': klinik geneli bakiye/gecikme gösterilmez (null); pending = görünen kalemlerin toplamı
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'currency', s.currency, 'finalized_balance', NULL, 'overdue', NULL, 'pending', s.pending)
             ORDER BY s.currency), '[]'::jsonb)
      INTO v_summary
      FROM (SELECT COALESCE(e->>'currency', 'TRY') AS currency, sum((e->>'total')::numeric) AS pending
              FROM jsonb_array_elements(v_invoices) e GROUP BY 1) s;
  END IF;

  RETURN jsonb_build_object('enabled', v_enabled, 'actor', v_actor,
                            'can_manage', (v_actor = 'lab' AND _ps_can_manage(p_clinic_id)),
                            'scope', CASE WHEN v_full THEN 'full' ELSE 'own' END,
                            'summary', v_summary, 'invoices', v_invoices);
END $function$
;
