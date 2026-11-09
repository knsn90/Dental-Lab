-- 20261110100000_on_ekstre_baglanti — GERİ ALMA. Yeni nesneleri düşürür; _ps_finalize'ı .before.txt'teki canlı
-- tanımla (5 argümanlı imza, aynı gövde, aynı ACL) geri kurar. Bağlantı satırları silinir (düz jeton zaten saklanmaz).
-- statement_approvals'taki via='link' satırları korunur (onay kaydı; geri almada fatura durumu değişmez).
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP FUNCTION public.add_statement_note_by_link(text, uuid, text);
DROP FUNCTION public.approve_pre_statement_by_link(text, text);
DROP FUNCTION public.get_pre_statement_by_link(text);
DROP FUNCTION public._ps_link_resolve(text);
DROP FUNCTION public._ps_link_resolve_read(text);
DROP FUNCTION public.create_statement_link(uuid);
DROP FUNCTION public._ps_profile_is_approver(uuid, uuid);
DROP TABLE public.statement_approval_links;

DROP FUNCTION public._ps_finalize(uuid, jsonb, text, text, text, uuid);
CREATE FUNCTION public._ps_finalize(p_clinic_id uuid, p_invoices jsonb, p_mode text, p_via text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_lab      uuid;
  v_terms    int;
  v_cname    text;
  v_today    date;
  v_ids      uuid[];
  v_sel      uuid[] := '{}';
  v_issue    uuid[] := '{}';
  v_skipped  jsonb := '[]'::jsonb;
  v_issued   jsonb := '[]'::jsonb;
  v_ts       timestamptz;
  v_target   uuid;
  v_src      uuid;
  v_max      int;
  v_wos      uuid[];
  v_claims   text;
  v_sub      text;
  v_approval uuid;
  r          record;
  g          record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('all', 'undisputed') THEN
    RAISE EXCEPTION 'PS_MODE' USING ERRCODE = '22023';
  END IF;
  IF p_via IS NULL OR p_via NOT IN ('panel', 'link', 'lab') THEN
    RAISE EXCEPTION 'PS_MODE' USING ERRCODE = '22023';
  END IF;
  IF p_invoices IS NULL OR jsonb_typeof(p_invoices) <> 'array' OR jsonb_array_length(p_invoices) = 0 THEN
    RAISE EXCEPTION 'PS_EMPTY' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_invoices) e
              WHERE jsonb_typeof(e) <> 'object'
                 OR NOT COALESCE(e->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;

  SELECT c.lab_id, c.default_payment_terms_days, c.name INTO v_lab, v_terms, v_cname
    FROM clinics c WHERE c.id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501'; END IF;

  -- Aynı kliniğe eşzamanlı iki onay sıraya girer; faturalar id sırasıyla kilitlenir (not/çözme FOR SHARE bekler)
  PERFORM pg_advisory_xact_lock(hashtext('ps_finalize:' || p_clinic_id::text));
  SELECT array_agg(DISTINCT (e->>'id')::uuid) INTO v_ids FROM jsonb_array_elements(p_invoices) e;
  PERFORM 1 FROM invoices i WHERE i.id = ANY (v_ids) ORDER BY i.id FOR UPDATE;

  -- Kapsam: her öğe bu kliniğin, bu lab'ın taslağı olmalı; değilse sessiz atlanmaz, tüm çağrı geri alınır
  IF (SELECT count(*) FROM invoices i
       WHERE i.id = ANY (v_ids) AND i.clinic_id = p_clinic_id AND i.lab_id = v_lab AND i.status = 'taslak')
     <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;

  -- K6: istemcinin gördüğünden sonra değişen taslak bu onayla kesinleşmez; K2: undisputed modda itirazlı fatura bütünüyle kalır
  FOR r IN
    SELECT i.id, i.updated_at,
           (SELECT e->>'updated_at' FROM jsonb_array_elements(p_invoices) e
             WHERE (e->>'id')::uuid = i.id LIMIT 1) AS ts_txt
      FROM invoices i WHERE i.id = ANY (v_ids)
     ORDER BY i.created_at, i.id
  LOOP
    BEGIN
      v_ts := r.ts_txt::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_ts := NULL;
    END;
    IF v_ts IS NULL OR v_ts IS DISTINCT FROM r.updated_at THEN
      v_skipped := v_skipped || jsonb_build_object('invoice_id', r.id, 'reason', 'changed');
      CONTINUE;
    END IF;
    IF p_mode = 'undisputed' AND EXISTS (
         SELECT 1 FROM statement_item_disputes d JOIN invoice_items ii ON ii.id = d.invoice_item_id
          WHERE ii.invoice_id = r.id AND d.status IN ('acik', 'yanitlandi')) THEN
      v_skipped := v_skipped || jsonb_build_object('invoice_id', r.id, 'reason', 'disputed');
      CONTINUE;
    END IF;
    v_sel := v_sel || r.id;
  END LOOP;

  IF cardinality(v_sel) = 0 THEN
    RETURN jsonb_build_object('approval_id', NULL, 'issued', '[]'::jsonb, 'skipped', v_skipped);
  END IF;

  v_today := lab_today(v_lab);

  -- Yazma evresi sistem bağlamında: plan 2 alacak tetikleyicisi / İND yeniden uygulaması
  -- (recalc_invoice_payment_state → assert_my_invoice) klinik kullanıcısında yetki hatası vermesin.
  v_claims := current_setting('request.jwt.claims', true);
  v_sub    := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('siman.ps_merge', 'on', true);

  -- (ay, para birimi, KDV oranı) başına gruplama; KDV oranı farklı taslaklar birleşmez (toplam = Σ kaynak korunur)
  FOR g IN
    SELECT array_agg(i.id ORDER BY i.created_at, i.id) FILTER (WHERE m.ok)     AS mids,
           array_agg(i.id ORDER BY i.created_at, i.id) FILTER (WHERE NOT m.ok) AS sids
      FROM invoices i
      CROSS JOIN LATERAL (
        SELECT NOT (i.discount_type IS NOT NULL AND i.discount_value > 0)      -- fatura üstü indirim: tek başına
           AND i.efatura_uuid IS NULL
           AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.invoice_id = i.id)
           AND NOT EXISTS (SELECT 1 FROM payment_intents x WHERE x.invoice_id = i.id)
           AND NOT EXISTS (SELECT 1 FROM payment_submissions x WHERE x.invoice_id = i.id)
           AND NOT EXISTS (SELECT 1 FROM payment_reminders x WHERE x.invoice_id = i.id)
           AND NOT EXISTS (SELECT 1 FROM efatura_logs x WHERE x.invoice_id = i.id)
           AND NOT EXISTS (SELECT 1 FROM clinic_statement_discounts x
                            WHERE x.invoice_id = i.id
                               OR x.invoice_item_id IN (SELECT ii.id FROM invoice_items ii WHERE ii.invoice_id = i.id)) AS ok
      ) m
     WHERE i.id = ANY (v_sel)
     GROUP BY date_trunc('month', COALESCE(i.issue_date, i.created_at::date)), i.currency, COALESCE(i.tax_rate, 0)
     ORDER BY min(i.created_at)
  LOOP
    v_issue := v_issue || COALESCE(g.sids, '{}'::uuid[]);
    CONTINUE WHEN g.mids IS NULL;
    v_target := g.mids[1];

    IF cardinality(g.mids) > 1 THEN
      -- hedefin kendi siparişi de invoice_orders'ta bağlı olsun
      INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
      SELECT v_target, i.work_order_id, v_lab FROM invoices i
       WHERE i.id = v_target AND i.work_order_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM invoice_orders x WHERE x.invoice_id = v_target AND x.work_order_id = i.work_order_id);

      FOREACH v_src IN ARRAY g.mids[2:cardinality(g.mids)] LOOP
        -- kalemler sıra korunarak sona eklenir
        SELECT COALESCE(max(ii.sort_order), 0) INTO v_max FROM invoice_items ii WHERE ii.invoice_id = v_target;
        UPDATE invoice_items ii
           SET invoice_id = v_target, sort_order = v_max + x.rn
          FROM (SELECT s.id, row_number() OVER (ORDER BY s.sort_order, s.created_at, s.id) AS rn
                  FROM invoice_items s WHERE s.invoice_id = v_src) x
         WHERE ii.id = x.id;
        UPDATE statement_item_notes    SET invoice_id = v_target WHERE invoice_id = v_src;
        UPDATE statement_item_disputes SET invoice_id = v_target WHERE invoice_id = v_src;

        -- sipariş bağları: kaynağınkiler silinip hedefe yazılır (invoice_orders_one_active kaynağı görmesin)
        SELECT array(SELECT io.work_order_id FROM invoice_orders io WHERE io.invoice_id = v_src
                     UNION
                     SELECT i.work_order_id FROM invoices i WHERE i.id = v_src AND i.work_order_id IS NOT NULL)
          INTO v_wos;
        DELETE FROM invoice_orders WHERE invoice_id = v_src;
        INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
        SELECT v_target, w, v_lab FROM unnest(v_wos) w
         WHERE NOT EXISTS (SELECT 1 FROM invoice_orders x WHERE x.invoice_id = v_target AND x.work_order_id = w);

        DELETE FROM invoices WHERE id = v_src;
      END LOOP;

      -- çok siparişli fatura: sipariş-türevi numara toplu fatura kuralıyla sıradaki numaraya geçer
      UPDATE invoices SET invoice_number = next_invoice_number(v_lab)
       WHERE id = v_target AND invoice_number LIKE 'F-%';
      PERFORM recalc_invoice_totals(v_target);
    END IF;

    v_issue := v_issue || v_target;
  END LOOP;

  PERFORM set_config('siman.ps_merge', '', true);

  -- K8: tarih kesinleşme günü, vade süresi korunur. Plan 2 alacak tetikleyicisi bu UPDATE'te çalışır.
  PERFORM set_config('siman.approval_issue', 'on', true);
  UPDATE invoices i
     SET status     = 'kesildi',
         issue_date = v_today,
         due_date   = v_today + COALESCE(v_terms, i.due_date - i.issue_date, 30)
   WHERE i.id = ANY (v_issue);
  PERFORM set_config('siman.approval_issue', '', true);

  IF p_mode = 'all' THEN
    UPDATE statement_item_disputes d
       SET status = 'cozuldu', updated_at = now()
      FROM invoice_items ii
     WHERE ii.id = d.invoice_item_id AND ii.invoice_id = ANY (v_issue) AND d.status IN ('acik', 'yanitlandi');
  END IF;

  PERFORM set_config('request.jwt.claims', COALESCE(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_sub, ''), true);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('invoice_id', i.id, 'invoice_number', i.invoice_number,
                                               'currency', i.currency, 'total', i.total)
                            ORDER BY i.created_at, i.id), '[]'::jsonb)
    INTO v_issued FROM invoices i WHERE i.id = ANY (v_issue);

  INSERT INTO statement_approvals (lab_id, clinic_id, approved_by, via, mode, reason,
                                   source_invoice_ids, result_invoice_ids, skipped)
  VALUES (v_lab, p_clinic_id, v_uid, p_via, p_mode, NULLIF(btrim(COALESCE(p_reason, '')), ''),
          v_sel, v_issue, v_skipped)
  RETURNING id INTO v_approval;

  -- Lab'a uygulama içi bildirim (lab'ın kendi kaydında yazılmaz)
  IF p_via <> 'lab' AND COALESCE(current_setting('siman.skip_notify', true), '') <> 'on' THEN
    INSERT INTO notifications (user_id, lab_id, category, title, body, resource_type, resource_id, action_url, payload)
    SELECT p.id, v_lab, 'payment', 'Ön ekstre onaylandı',
           COALESCE(v_cname, 'Klinik') || ' · ' || cardinality(v_issue)::text,
           'clinic', p_clinic_id, '/statement/' || p_clinic_id::text,
           jsonb_build_object('clinic_id', p_clinic_id, 'approval_id', v_approval, 'invoice_ids', to_jsonb(v_issue),
                              'kind', 'pre_statement_approved')
      FROM profiles p
     WHERE p.lab_id = v_lab
       AND p.user_type IN ('admin', 'lab')
       AND COALESCE(p.is_active, true)
       AND 'manage_finance' = ANY (resolve_role_permissions(_profile_role_key(p.user_type, p.role), v_lab));
  END IF;

  RETURN jsonb_build_object('approval_id', v_approval, 'issued', v_issued, 'skipped', v_skipped);
END $function$;

REVOKE ALL ON FUNCTION public._ps_finalize(uuid, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_finalize(uuid, jsonb, text, text, text) TO service_role;

ALTER TABLE public.lab_settings DROP COLUMN pre_statement_pdf_format;

COMMIT;
