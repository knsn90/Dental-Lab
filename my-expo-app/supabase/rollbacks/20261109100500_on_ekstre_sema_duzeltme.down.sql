-- 20261109100500_on_ekstre_sema_duzeltme.down.sql — 20261109100000 sonrası canlı tanımlara döner (.before.txt ile birebir).
-- CREATE OR REPLACE → ACL {postgres,authenticated,service_role} korunur. _ps_can_manage düşer.
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public._ps_actor(p_clinic_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lab uuid;
  me    record;
BEGIN
  IF v_uid IS NULL OR p_clinic_id IS NULL THEN RETURN NULL; END IF;
  SELECT c.lab_id INTO v_lab FROM clinics c WHERE c.id = p_clinic_id;
  IF v_lab IS NULL THEN RETURN NULL; END IF;

  IF is_platform_admin() THEN RETURN 'lab'; END IF;

  SELECT p.user_type, p.clinic_id, p.doctor_id, p.lab_id, p.approval_status,
         COALESCE(p.is_active, true) AS active
    INTO me FROM profiles p WHERE p.id = v_uid;
  IF NOT FOUND OR NOT me.active THEN RETURN NULL; END IF;

  IF me.user_type IN ('admin', 'lab') THEN
    IF me.lab_id = v_lab AND has_permission('manage_finance') THEN RETURN 'lab'; END IF;
    RETURN NULL;
  END IF;

  IF me.user_type NOT IN ('clinic_admin', 'doctor', 'clinic_secretary') OR me.approval_status <> 'approved' THEN
    RETURN NULL;
  END IF;

  -- Kliniğin kullanıcısı mı (my_clinic_ids kümesi + kliniği olmayan hekimin doctors.clinic_id'si).
  -- me.clinic_id NULL olabilir: NULL karşılaştırma ifadeyi NULL yapıp IF NOT'u atlatmasın diye COALESCE.
  IF NOT COALESCE(
       p_clinic_id = me.clinic_id
    OR EXISTS (SELECT 1 FROM clinic_lab_memberships m
                WHERE m.status = 'active' AND m.lab_clinic_id = p_clinic_id
                  AND (m.member_profile_id = v_uid
                       OR (me.clinic_id IS NOT NULL AND m.member_clinic_id = me.clinic_id)))
    OR (me.clinic_id IS NULL AND me.doctor_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM doctors d WHERE d.id = me.doctor_id AND d.clinic_id = p_clinic_id)),
     false) THEN
    RETURN NULL;
  END IF;

  IF me.user_type = 'clinic_admin' THEN RETURN 'approver'; END IF;
  IF me.user_type = 'clinic_secretary' THEN RETURN 'viewer'; END IF;

  -- Hekim: kliniğinde başka aktif yönetici varsa viewer, yoksa bağımsız hekim → approver
  IF EXISTS (SELECT 1 FROM profiles a
              WHERE a.user_type = 'clinic_admin' AND a.id <> v_uid
                AND COALESCE(a.is_active, true)
                AND a.clinic_id IN (p_clinic_id, me.clinic_id)) THEN
    RETURN 'viewer';
  END IF;
  RETURN 'approver';
END $function$

;

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
           sum(it.net_total) AS visible_total,
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
           'invoice_number', i.invoice_number,
           'currency', i.currency,
           'issue_date', i.issue_date,
           'created_at', i.created_at,
           'updated_at', i.updated_at,
           'total', CASE WHEN v_full THEN i.total ELSE COALESCE(x.visible_total, 0) END,
           'items', COALESCE(x.items, '[]'::jsonb)
         ) ORDER BY i.issue_date, i.created_at, i.id), '[]'::jsonb)
    INTO v_invoices
    FROM invoices i
    LEFT JOIN per_inv x ON x.invoice_id = i.id
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
                            'scope', CASE WHEN v_full THEN 'full' ELSE 'own' END,
                            'summary', v_summary, 'invoices', v_invoices);
END $function$

;

CREATE OR REPLACE FUNCTION public.add_statement_note(p_invoice_item_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_body   text := btrim(COALESCE(p_body, ''));
  v_inv    record;
  v_actor  text;
  v_side   text;
  v_note   uuid;
  v_status text;
  v_title  text := 'Ön ekstre notu';
  v_text   text;
BEGIN
  SELECT i.id, i.status, i.clinic_id, i.lab_id, i.invoice_number, c.name AS clinic_name, c.lab_id AS clinic_lab
    INTO v_inv
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    LEFT JOIN clinics c ON c.id = i.clinic_id
   WHERE ii.id = p_invoice_item_id
   FOR SHARE OF i;
  IF NOT FOUND OR v_inv.clinic_id IS NULL OR v_inv.lab_id IS DISTINCT FROM v_inv.clinic_lab THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  v_actor := _ps_actor(v_inv.clinic_id);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501'; END IF;
  -- billing_view'i olmayan viewer yalnız kendi siparişinin kalemine not yazar
  IF NOT _ps_full_scope(v_inv.clinic_id) AND NOT _ps_item_order_mine(p_invoice_item_id) THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  IF length(v_body) < 1 OR length(v_body) > 2000 THEN
    RAISE EXCEPTION 'PS_BODY' USING ERRCODE = '22023';
  END IF;
  IF v_inv.status IS DISTINCT FROM 'taslak' THEN
    RAISE EXCEPTION 'PS_NOT_DRAFT' USING ERRCODE = '22023';
  END IF;

  v_side := CASE WHEN v_actor = 'lab' THEN 'lab' ELSE 'clinic' END;

  INSERT INTO statement_item_notes (invoice_item_id, invoice_id, lab_id, clinic_id, author_id, author_side, body)
  VALUES (p_invoice_item_id, v_inv.id, v_inv.lab_id, v_inv.clinic_id, auth.uid(), v_side, v_body)
  RETURNING id INTO v_note;

  IF v_side = 'clinic' THEN
    INSERT INTO statement_item_disputes (invoice_item_id, invoice_id, lab_id, clinic_id, status, updated_at)
    VALUES (p_invoice_item_id, v_inv.id, v_inv.lab_id, v_inv.clinic_id, 'acik', now())
    ON CONFLICT (invoice_item_id) DO UPDATE
      SET status = 'acik', invoice_id = EXCLUDED.invoice_id, updated_at = now();
  ELSE
    -- Lab yanıtı yalnız açık/yanıtlanmış itirazı 'yanitlandi' yapar; çözülmüş itirazı yeniden açmaz.
    UPDATE statement_item_disputes
       SET status = 'yanitlandi', updated_at = now()
     WHERE invoice_item_id = p_invoice_item_id AND status IN ('acik', 'yanitlandi');
  END IF;

  SELECT d.status INTO v_status FROM statement_item_disputes d WHERE d.invoice_item_id = p_invoice_item_id;

  -- K3: klinik notu → lab'ın manage_finance kullanıcılarına uygulama içi bildirim
  IF v_side = 'clinic' AND COALESCE(current_setting('siman.skip_notify', true), '') <> 'on' THEN
    v_text := COALESCE(v_inv.clinic_name, 'Klinik') || ' · ' || v_inv.invoice_number;
    INSERT INTO notifications (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
    SELECT p.id, v_inv.lab_id, 'payment', v_title, v_text, 'invoice', v_inv.id,
           '/statement/' || v_inv.clinic_id::text,
           jsonb_build_object('clinic_id', v_inv.clinic_id, 'invoice_id', v_inv.id,
                              'invoice_item_id', p_invoice_item_id, 'note_id', v_note, 'kind', 'pre_statement_note')
      FROM profiles p
     WHERE p.lab_id = v_inv.lab_id
       AND p.user_type IN ('admin', 'lab')
       AND COALESCE(p.is_active, true)
       AND 'manage_finance' = ANY (resolve_role_permissions(_profile_role_key(p.user_type, p.role), v_inv.lab_id));
  END IF;

  RETURN jsonb_build_object('note_id', v_note, 'dispute_status', v_status);
END $function$

;

CREATE OR REPLACE FUNCTION public.resolve_statement_dispute(p_invoice_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic uuid;
  v_status text;
BEGIN
  SELECT i.clinic_id INTO v_clinic
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
   WHERE ii.id = p_invoice_item_id;
  IF v_clinic IS NULL OR _ps_actor(v_clinic) IS DISTINCT FROM 'lab' THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;

  UPDATE statement_item_disputes
     SET status = 'cozuldu', updated_at = now()
   WHERE invoice_item_id = p_invoice_item_id
  RETURNING status INTO v_status;

  RETURN jsonb_build_object('invoice_item_id', p_invoice_item_id, 'dispute_status', v_status);
END $function$

;

DROP FUNCTION IF EXISTS public._ps_can_manage(uuid);

COMMIT;
