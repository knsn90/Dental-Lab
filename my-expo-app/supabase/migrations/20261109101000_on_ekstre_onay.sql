-- 20261109101000_on_ekstre_onay — plan 3/5 Task 2: ön ekstre onayı, aylık birleştirme ve onaysız kesme kilidi.
--   * statement_approvals: onay kaydı (kim, hangi yol, mod, gerekçe, kaynak/sonuç faturalar, atlananlar). RLS'li,
--     okuma lab finans görenleri + kliniğin _ps_actor kullanıcıları; yazma yalnız _ps_finalize (SECURITY DEFINER).
--   * _ps_finalize (iç): seçilen taslakları kilitler, kapsamı denetler (değilse PS_SCOPE, tüm çağrı geri alınır),
--     updated_at değişenleri 'changed', undisputed modda açık/yanıtlanmış itirazlıları 'disputed' atlar.
--     Kalanlar (ay, para birimi, KDV oranı) başına tek faturada birleşir: en eski taslak hedef; kalemler, invoice_orders
--     bağları, not/itiraz invoice_id'leri hedefe taşınır; boşalan taslaklar silinir. Fatura üstü indirimli ya da ödeme/
--     e-fatura/İND/hatırlatma bağı olan taslak birleşmeye girmez, tek başına kesinleşir. Birden çok taslaktan oluşan
--     hedefin sipariş-türevi numarası (F-…) toplu fatura kuralıyla (_trg_bulk_invoice_number) sıradaki numaraya geçer.
--     Kesinleştirme: siman.approval_issue='on' altında status='kesildi', issue_date = lab_today, vade süresi korunur (K8).
--     Yazma evresi oturumsuz (sistem) bağlamda çalışır: plan 2 alacak tetikleyicisi ve İND yeniden uygulaması
--     recalc_invoice_payment_state → assert_my_invoice'a takılmasın (klinik kullanıcısının lab_id'si yok).
--   * approve_pre_statement (yalnız approver, ayar açık) / record_clinic_approval (yalnız lab + manage_finance, gerekçe zorunlu).
--   * zz_invoice_approval_gate: ayar açık lab'da taslak → kesildi/kismi_odendi/odendi UPDATE'i ve bu durumlarla INSERT
--     siman.approval_issue='on' olmadan INV_APPROVAL_REQUIRED (42501). zzz_invoice_issued_lock'tan ÖNCE çalışır
--     (ad sırası 'zz_' < 'zzz'); kapsamları ayrık (kapı OLD=taslak, kilit OLD≠taslak), sıra sonucu değiştirmez.
--   * trg_maintain_urgent_surcharge: siman.ps_merge='on' iken yeniden hesaplamaz (birleştirme toplamı korunsun).
--   Ayar her lab için varsayılan false: canlı davranış değişmez.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- 1) Onay kaydı
CREATE TABLE public.statement_approvals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id             uuid NOT NULL REFERENCES public.labs(id),
  clinic_id          uuid NOT NULL,
  approved_by        uuid NOT NULL,
  via                text NOT NULL CHECK (via IN ('panel', 'link', 'lab')),
  mode               text NOT NULL CHECK (mode IN ('all', 'undisputed')),
  reason             text,
  source_invoice_ids uuid[] NOT NULL,
  result_invoice_ids uuid[] NOT NULL,
  skipped            jsonb NOT NULL DEFAULT '[]',
  created_at         timestamptz DEFAULT now(),
  CHECK (via <> 'lab' OR length(btrim(coalesce(reason, ''))) > 0)
);
CREATE INDEX statement_approvals_clinic_idx ON public.statement_approvals (clinic_id, created_at DESC);
CREATE INDEX statement_approvals_lab_idx ON public.statement_approvals (lab_id, created_at DESC);

ALTER TABLE public.statement_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY statement_approvals_select ON public.statement_approvals
  FOR SELECT TO authenticated
  USING ((lab_id = get_my_lab_id() AND lab_can_view_finance()) OR _ps_actor(clinic_id) IS NOT NULL);
REVOKE ALL ON TABLE public.statement_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.statement_approvals TO authenticated;
GRANT ALL ON TABLE public.statement_approvals TO service_role;

-- 2) Onaysız kesme kapısı
CREATE FUNCTION public._invoice_approval_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN ('kesildi', 'kismi_odendi', 'odendi') THEN
    RETURN NEW;                                   -- taslak, iptal: serbest
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'taslak' THEN
    RETURN NEW;                                   -- kesildi → kismi_odendi → odendi gibi sistem geçişleri serbest
  END IF;
  IF COALESCE(current_setting('siman.approval_issue', true), '') = 'on' THEN
    RETURN NEW;                                   -- yalnız onay çekirdeği (_ps_finalize) açar
  END IF;
  IF EXISTS (SELECT 1 FROM lab_settings s WHERE s.lab_id = NEW.lab_id AND s.invoice_approval_enabled) THEN
    RAISE EXCEPTION 'INV_APPROVAL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public._invoice_approval_gate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER zz_invoice_approval_gate
  BEFORE INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public._invoice_approval_gate();

-- 3) Acil ek ücret: birleştirme sırasında yeniden hesaplama yok
CREATE OR REPLACE FUNCTION public.trg_maintain_urgent_surcharge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_status     TEXT;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_base       NUMERIC;
  v_surcharge  NUMERIC;
  v_acil_id    UUID;
  v_desc       TEXT;
BEGIN
  -- Kendi UPDATE/INSERT/DELETE'imizin tetiklediği yeniden girişleri engelle
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 20261109101000: ön ekstre birleştirmesi (_ps_finalize) kalemleri taslaktan taslağa taşırken acil ek ücret
  -- yeniden hesaplanmaz; her kaynak taslağın kendi acil satırı olduğu gibi taşınır (toplam = Σ kaynak).
  IF COALESCE(current_setting('siman.ps_merge', true), '') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT i.lab_id, i.status INTO v_lab_id, v_status
  FROM invoices i WHERE i.id = v_invoice_id;
  IF v_lab_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF v_status = 'iptal' THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT EXISTS (
    SELECT 1 FROM work_orders wo
      WHERE wo.id = (SELECT work_order_id FROM invoices WHERE id = v_invoice_id)
        AND wo.is_urgent
    UNION ALL
    SELECT 1 FROM invoice_orders io
      JOIN work_orders wo ON wo.id = io.work_order_id
      WHERE io.invoice_id = v_invoice_id AND wo.is_urgent
  ) INTO v_is_urgent;

  SELECT COALESCE(urgent_surcharge_rate, 0) INTO v_rate
    FROM lab_settings WHERE lab_id = v_lab_id;

  -- Mevcut acil satırının id'sini tut (varsa) — DELETE/INSERT yerine UPDATE için
  SELECT id INTO v_acil_id
    FROM invoice_items
    WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%'
    ORDER BY created_at ASC LIMIT 1;

  -- Olası fazladan (mükerrer) acil satırlarını temizle — yalnız birini koru
  IF v_acil_id IS NOT NULL THEN
    DELETE FROM invoice_items
      WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%' AND id <> v_acil_id;
  END IF;

  IF COALESCE(v_is_urgent, false) AND COALESCE(v_rate, 0) > 0 THEN
    -- Baz: acil DIŞINDAKI kalemlerin brütü (kendi üstüne bindirmesin)
    SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_base
      FROM invoice_items
      WHERE invoice_id = v_invoice_id AND description NOT LIKE 'Acil Ek Ücret (%'
        -- 20261028142000: tarama satırları acil ek ücrete girmez
        AND NOT EXISTS (SELECT 1 FROM scan_patient_charges sc WHERE sc.invoice_item_id = invoice_items.id);

    v_surcharge := ROUND(v_base * v_rate / 100.0, 2);
    v_desc := 'Acil Ek Ücret (%' || trim(to_char(v_rate, 'FM999990.##')) || ')';

    IF v_surcharge > 0 THEN
      IF v_acil_id IS NOT NULL THEN
        -- VAR: yalnız tutar/başlık güncellenir → discount_* KORUNUR, id sabit
        UPDATE invoice_items
          SET unit_price = v_surcharge, quantity = 1, description = v_desc
          WHERE id = v_acil_id;
      ELSE
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
        VALUES (v_invoice_id, v_desc, 1, v_surcharge,
                COALESCE((SELECT MAX(sort_order) FROM invoice_items WHERE invoice_id = v_invoice_id), 0) + 1);
      END IF;
    ELSE
      -- surcharge 0 → acil satırı olmamalı
      DELETE FROM invoice_items
        WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%';
    END IF;
  ELSE
    -- acil değil → acil satırı olmamalı
    DELETE FROM invoice_items
      WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 4) Onay çekirdeği (iç)
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

-- 5) Yönetici hekim / bağımsız hekim onayı (panel)
CREATE FUNCTION public.approve_pre_statement(p_clinic_id uuid, p_invoices jsonb, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _ps_actor(p_clinic_id) IS DISTINCT FROM 'approver' THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((SELECT s.invoice_approval_enabled FROM lab_settings s JOIN clinics c ON c.lab_id = s.lab_id
                    WHERE c.id = p_clinic_id), false) THEN
    RAISE EXCEPTION 'PS_DISABLED' USING ERRCODE = '22023';
  END IF;
  RETURN _ps_finalize(p_clinic_id, p_invoices, p_mode, 'panel', NULL);
END $function$;

REVOKE ALL ON FUNCTION public.approve_pre_statement(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_pre_statement(uuid, jsonb, text) TO authenticated, service_role;

-- 6) Lab klinik adına onay kaydeder (K5; gerekçe zorunlu; ayar kapalıyken de çalışır)
CREATE FUNCTION public.record_clinic_approval(p_clinic_id uuid, p_invoices jsonb, p_mode text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _ps_actor(p_clinic_id) IS DISTINCT FROM 'lab' OR NOT _ps_can_manage(p_clinic_id) THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'PS_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  RETURN _ps_finalize(p_clinic_id, p_invoices, p_mode, 'lab', btrim(p_reason));
END $function$;

REVOKE ALL ON FUNCTION public.record_clinic_approval(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_clinic_approval(uuid, jsonb, text, text) TO authenticated, service_role;

COMMIT;
