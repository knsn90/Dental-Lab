-- 20261110100000_on_ekstre_baglanti — plan 4/5 Task 3: ön ekstre onay bağlantısı (DB).
--   * lab_settings.pre_statement_pdf_format ('ozet' | 'ayrintili', varsayılan 'ozet'; R4). Yazma mevcut lab_settings RLS'iyle.
--   * statement_approval_links: klinik başına bağlantı; yalnız jetonun sha256 karması (hex) saklanır, düz jeton hiçbir
--     tabloda yok. snapshot = oluşturma anındaki taslaklar [{id, updated_at}] (anti-hedef 4: başka klinik/dönem açılmaz).
--     RLS'li; SELECT lab finans görenleri; yazma yalnız SECURITY DEFINER RPC'lerle. Klinik başına tek etkin bağlantı
--     (kısmi tekil indeks: revoked_at IS NULL AND used_at IS NULL).
--   * _ps_profile_is_approver(p_uid, p_clinic_id) (iç): _ps_actor'ın 'approver' kuralının profil parametreli birebir
--     kopyası (platform admini değil, aktif, approval_status 'approved' (NULL'u _ps_actor gibi geçirir), klinik kümesinde;
--     clinic_admin → evet; hekim → yalnız başka aktif clinic_admin (approval_status'a bakmadan) clinic_id IN (klinik,
--     hekimin kliniği) yoksa). _ps_actor'a dokunulmaz; probe iki kuralın aynı sonucu verdiğini doğrular.
--   * create_statement_link(p_clinic_id) (authenticated): lab + manage_finance (değilse PS_SCOPE), ayar açık (PS_DISABLED),
--     taslak var (PS_EMPTY), alıcı (R3) = _ps_profile_is_approver'ın kabul ettiği profiller içinde önce clinic_admin, sonra
--     hekim; her grupta en eski; yoksa PS_NO_RECIPIENT. Önceki etkin bağlantıları iptal eder. Jeton = 32 rastgele bayt, base64url, dolgusuz.
--     Süre 45 gün. Dönüş {token, link_id, expires_at, recipient_name}; jeton yalnız bu dönüşte bir kez görünür.
--   * _ps_link_resolve_read(p_token) (iç, okuma): karma ile bulur; yok / biçim dışı / süresi geçmiş / iptal / alıcı pasif →
--     PS_LINK_INVALID (22023), hangisi olduğu söylenmez. KULLANILMIŞ bağlantıyı kabul eder (R2: görüntüleme süre boyunca).
--     _ps_link_resolve(p_token) (iç, yazma): okuma kuralı + kullanılmış ya da alıcı artık bu kliniğin onaylayıcısı
--     değil (_ps_profile_is_approver) → aynı PS_LINK_INVALID (onay / not).
--   * approve_pre_statement_by_link, anlık görüntü listesini kurmadan önce _ps_finalize'ın klinik kilidini alır
--     (pg_advisory_xact_lock(hashtext('ps_finalize:' || clinic_id))). get_pre_statement_by_link VOLATILE: PostgREST
--     GET ile çağırmaz, jeton sorgu dizesine/log'a düşmez.
--   * clinic_id için FK yok: plan 3 tabloları (statement_approvals, statement_item_*) clinics'e FK vermez; aynı kalıp.
--     Kullanılmış bağlantıda get_pre_statement_by_link salt okunur döner: can_approve=false, approved=true, approved_at,
--     approval {issued_count, skipped_count}; invoices = anlık görüntüden hâlâ taslak olanlar (genelde boş).
--   * Jeton RPC'leri (anon + authenticated): get_pre_statement_by_link, approve_pre_statement_by_link,
--     add_statement_note_by_link. Yalnız anlık görüntüdeki ve hâlâ taslak olan faturalar; anlık görüntüden sonra
--     updated_at'i değişen taslak changed_invoice_ids'te listelenir ve onayda _ps_finalize'ın K6 kuralıyla 'changed' atlanır.
--   * _ps_finalize: sonuna OPSİYONEL p_approved_by uuid DEFAULT NULL eklendi (eski 5 argümanlı imza düşürüldü, ACL aynı).
--     NULL iken davranış birebir eski (v_uid = auth.uid()); bağlantı onayında v_uid = alıcı → statement_approvals.approved_by.
--   pgcrypto 'extensions' şemasında; çağrılar şema nitelikli (search_path yalnız public).
BEGIN;
SET LOCAL lock_timeout = '3s';

-- === 1) Ayar ===
ALTER TABLE public.lab_settings
  ADD COLUMN pre_statement_pdf_format text NOT NULL DEFAULT 'ozet'
  CONSTRAINT lab_settings_pre_statement_pdf_format_check CHECK (pre_statement_pdf_format IN ('ozet', 'ayrintili'));

-- === 2) Bağlantı tablosu ===
CREATE TABLE public.statement_approval_links (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id               uuid NOT NULL REFERENCES public.labs(id),
  clinic_id            uuid NOT NULL,
  token_hash           text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  recipient_profile_id uuid NOT NULL,
  snapshot             jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'array'),
  created_by           uuid,
  created_at           timestamptz DEFAULT now(),
  expires_at           timestamptz NOT NULL,
  revoked_at           timestamptz,
  used_at              timestamptz,
  approval_id          uuid REFERENCES public.statement_approvals(id)
);
CREATE INDEX statement_approval_links_clinic_idx ON public.statement_approval_links (clinic_id, created_at DESC);
CREATE INDEX statement_approval_links_lab_idx ON public.statement_approval_links (lab_id, created_at DESC);
CREATE UNIQUE INDEX statement_approval_links_one_active ON public.statement_approval_links (clinic_id)
  WHERE revoked_at IS NULL AND used_at IS NULL;

ALTER TABLE public.statement_approval_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY statement_approval_links_select ON public.statement_approval_links
  FOR SELECT TO authenticated
  USING (lab_id = get_my_lab_id() AND lab_can_view_finance());
REVOKE ALL ON TABLE public.statement_approval_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.statement_approval_links TO authenticated;
GRANT ALL ON TABLE public.statement_approval_links TO service_role;

-- === 3) Onay çekirdeği: opsiyonel p_approved_by ===
DROP FUNCTION public._ps_finalize(uuid, jsonb, text, text, text);
CREATE FUNCTION public._ps_finalize(p_clinic_id uuid, p_invoices jsonb, p_mode text, p_via text, p_reason text, p_approved_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20261110100000: bağlantı onayında (oturumsuz) onaylayan = bağlantının alıcısı; diğer çağrılarda auth.uid()
  v_uid      uuid := COALESCE(p_approved_by, auth.uid());
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

REVOKE ALL ON FUNCTION public._ps_finalize(uuid, jsonb, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_finalize(uuid, jsonb, text, text, text, uuid) TO service_role;

-- === 4a) Onaylayıcı kuralı (iç): _ps_actor(p_clinic_id) = 'approver' ile aynı, profil parametreli ===
CREATE FUNCTION public._ps_profile_is_approver(p_uid uuid, p_clinic_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT
      -- _ps_actor: platform admini 'lab' döner (approver değil)
      NOT EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = me.id)
      AND COALESCE(me.is_active, true)
      AND me.user_type IN ('clinic_admin', 'doctor')
      -- _ps_actor: "approval_status <> 'approved'" ise NULL döner (NULL karşılaştırması reddetmez)
      AND NOT COALESCE(me.approval_status <> 'approved', false)
      -- klinik kümesi (_ps_actor ile aynı)
      AND COALESCE(
            p_clinic_id = me.clinic_id
         OR EXISTS (SELECT 1 FROM clinic_lab_memberships m
                     WHERE m.status = 'active' AND m.lab_clinic_id = p_clinic_id
                       AND (m.member_profile_id = me.id
                            OR (me.clinic_id IS NOT NULL AND m.member_clinic_id = me.clinic_id)))
         OR (me.clinic_id IS NULL AND me.doctor_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM doctors d WHERE d.id = me.doctor_id AND d.clinic_id = p_clinic_id)),
          false)
      -- clinic_admin → approver; hekim → kliniğinde başka aktif yönetici yoksa (approval_status'a bakılmaz)
      AND (me.user_type = 'clinic_admin'
           OR NOT EXISTS (SELECT 1 FROM profiles a
                           WHERE a.user_type = 'clinic_admin' AND a.id <> me.id
                             AND COALESCE(a.is_active, true)
                             AND a.clinic_id IN (p_clinic_id, me.clinic_id)))
      FROM profiles me
      JOIN clinics c ON c.id = p_clinic_id AND c.lab_id IS NOT NULL
     WHERE me.id = p_uid), false)
$function$;

REVOKE ALL ON FUNCTION public._ps_profile_is_approver(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_profile_is_approver(uuid, uuid) TO service_role;

-- === 4) Bağlantı oluştur (lab) ===
CREATE FUNCTION public.create_statement_link(p_clinic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab     uuid;
  v_snap    jsonb;
  v_rcp     uuid;
  v_rname   text;
  v_token   text;
  v_id      uuid;
  v_exp     timestamptz := now() + interval '45 days';
BEGIN
  IF _ps_actor(p_clinic_id) IS DISTINCT FROM 'lab' OR NOT _ps_can_manage(p_clinic_id) THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  SELECT c.lab_id INTO v_lab FROM clinics c WHERE c.id = p_clinic_id;
  IF NOT COALESCE((SELECT s.invoice_approval_enabled FROM lab_settings s WHERE s.lab_id = v_lab), false) THEN
    RAISE EXCEPTION 'PS_DISABLED' USING ERRCODE = '22023';
  END IF;

  -- Aynı kliniğe eşzamanlı iki bağlantı sıraya girer (tek etkin bağlantı)
  PERFORM pg_advisory_xact_lock(hashtext('ps_link:' || p_clinic_id::text));

  -- Anlık görüntü: bu kliniğin, bu lab'daki taslakları; updated_at ISO metin (to_jsonb) → _ps_finalize K6 karşılaştırması
  SELECT jsonb_agg(jsonb_build_object('id', i.id, 'updated_at', to_jsonb(i.updated_at)) ORDER BY i.created_at, i.id)
    INTO v_snap
    FROM invoices i
   WHERE i.clinic_id = p_clinic_id AND i.lab_id = v_lab AND i.status = 'taslak';
  IF v_snap IS NULL OR jsonb_array_length(v_snap) = 0 THEN
    RAISE EXCEPTION 'PS_EMPTY' USING ERRCODE = '22023';
  END IF;

  -- R3: alıcı = panelin onaylayıcı kuralının (_ps_actor = 'approver') kabul ettiği kişi; önce clinic_admin, sonra hekim,
  -- her grupta en eski. Aday kümesi _ps_actor'ın klinik kümesiyle aynı; son karar _ps_profile_is_approver'da.
  SELECT p.id, p.full_name INTO v_rcp, v_rname
    FROM profiles p
   WHERE p.user_type IN ('clinic_admin', 'doctor')
     AND (p.clinic_id = p_clinic_id
          OR p.id IN (SELECT m.member_profile_id FROM clinic_lab_memberships m
                       WHERE m.status = 'active' AND m.lab_clinic_id = p_clinic_id AND m.member_profile_id IS NOT NULL)
          OR p.clinic_id IN (SELECT m.member_clinic_id FROM clinic_lab_memberships m
                              WHERE m.status = 'active' AND m.lab_clinic_id = p_clinic_id AND m.member_clinic_id IS NOT NULL)
          OR (p.clinic_id IS NULL AND p.doctor_id IN (SELECT d.id FROM doctors d WHERE d.clinic_id = p_clinic_id)))
     AND _ps_profile_is_approver(p.id, p_clinic_id)
   ORDER BY (p.user_type <> 'clinic_admin'), p.created_at, p.id
   LIMIT 1;
  IF v_rcp IS NULL THEN
    RAISE EXCEPTION 'PS_NO_RECIPIENT' USING ERRCODE = '22023';
  END IF;

  -- R2: yeni bağlantı, aynı kliniğin iptal edilmemiş ve kullanılmamış bağlantılarını iptal eder
  UPDATE statement_approval_links
     SET revoked_at = now()
   WHERE clinic_id = p_clinic_id AND revoked_at IS NULL AND used_at IS NULL;

  -- Jeton: 32 rastgele bayt → base64url (dolgusuz, 43 karakter). Saklanan yalnız sha256 hex karması.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/=\n', '-_');
  INSERT INTO statement_approval_links (lab_id, clinic_id, token_hash, recipient_profile_id, snapshot, created_by, expires_at)
  VALUES (v_lab, p_clinic_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_rcp, v_snap, auth.uid(), v_exp)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('token', v_token, 'link_id', v_id, 'expires_at', v_exp, 'recipient_name', v_rname);
END $function$;

REVOKE ALL ON FUNCTION public.create_statement_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_statement_link(uuid) TO authenticated, service_role;

-- === 5) Jeton çözümü (iç) ===
-- Okuma: kullanılmış bağlantıyı kabul eder; biçim dışı / yok / iptal / süresi geçmiş / alıcı pasif → tek tip hata
CREATE FUNCTION public._ps_link_resolve_read(p_token text)
 RETURNS public.statement_approval_links
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link statement_approval_links;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION 'PS_LINK_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT l.* INTO v_link
    FROM statement_approval_links l
   WHERE l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL OR v_link.expires_at <= now()
     OR NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_link.recipient_profile_id AND COALESCE(p.is_active, true)) THEN
    RAISE EXCEPTION 'PS_LINK_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN v_link;
END $function$;

-- Yazma (onay / not): okuma kuralı + kullanılmış bağlantı ya da alıcı artık bu kliniğin onaylayıcısı değil → aynı hata
CREATE FUNCTION public._ps_link_resolve(p_token text)
 RETURNS public.statement_approval_links
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link statement_approval_links := _ps_link_resolve_read(p_token);
BEGIN
  IF v_link.used_at IS NOT NULL OR NOT _ps_profile_is_approver(v_link.recipient_profile_id, v_link.clinic_id) THEN
    RAISE EXCEPTION 'PS_LINK_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN v_link;
END $function$;

REVOKE ALL ON FUNCTION public._ps_link_resolve_read(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_link_resolve_read(text) TO service_role;
REVOKE ALL ON FUNCTION public._ps_link_resolve(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ps_link_resolve(text) TO service_role;

-- === 6) Bağlantıdan oku ===
CREATE FUNCTION public.get_pre_statement_by_link(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link     statement_approval_links := _ps_link_resolve_read(p_token);
  v_used     boolean := v_link.used_at IS NOT NULL;
  v_approval jsonb;
  v_enabled  boolean;
  v_ids      uuid[];
  v_changed  uuid[];
  v_summary  jsonb;
  v_invoices jsonb;
BEGIN
  SELECT COALESCE(bool_or(s.invoice_approval_enabled), false) INTO v_enabled
    FROM lab_settings s WHERE s.lab_id = v_link.lab_id;

  -- Görünür küme: anlık görüntüdeki ve hâlâ bu kliniğin/lab'ın taslağı olan faturalar (sonradan eklenen taslak görünmez)
  SELECT array_agg(i.id ORDER BY i.created_at, i.id),
         array_agg(i.id ORDER BY i.created_at, i.id) FILTER (WHERE i.updated_at IS DISTINCT FROM s.ts)
    INTO v_ids, v_changed
    FROM (SELECT (e->>'id')::uuid AS id,
                 max((e->>'updated_at')::timestamptz) AS ts
            FROM jsonb_array_elements(v_link.snapshot) e GROUP BY 1) s
    JOIN invoices i ON i.id = s.id
   WHERE i.clinic_id = v_link.clinic_id AND i.lab_id = v_link.lab_id AND i.status = 'taslak';
  v_ids := COALESCE(v_ids, '{}'::uuid[]);

  -- Kalemler: get_pre_statement'ın 'full' biçimi (hasta adı yalnız baş harf)
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
     WHERE i.id = ANY (v_ids)
  ), per_inv AS (
    SELECT it.invoice_id,
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
           'subtotal', i.subtotal,
           'tax', i.tax_amount,
           'invoice_number', i.invoice_number,
           'currency', i.currency,
           'issue_date', i.issue_date,
           'created_at', i.created_at,
           'updated_at', i.updated_at,
           'total', i.total,
           'items', COALESCE(x.items, '[]'::jsonb)
         ) ORDER BY i.issue_date, i.created_at, i.id), '[]'::jsonb)
    INTO v_invoices
    FROM invoices i
    LEFT JOIN per_inv x ON x.invoice_id = i.id
   WHERE i.id = ANY (v_ids);

  -- Özet: get_pre_statement 'full' hesabı; pending yalnız görünür (anlık görüntü) taslaklardan
  WITH drafts AS (
    SELECT COALESCE(i.currency, 'TRY') AS currency, sum(i.total) AS pending
      FROM invoices i WHERE i.id = ANY (v_ids)
     GROUP BY 1
  ), bal AS (
    SELECT b.currency, b.balance, b.overdue_net
      FROM v_clinic_balance_ccy b
     WHERE b.clinic_id = v_link.clinic_id AND b.lab_id = v_link.lab_id
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

  -- R2: kullanılmış bağlantı salt okunur; onay özeti yalnız sayım
  IF v_used THEN
    SELECT jsonb_build_object('issued_count', cardinality(a.result_invoice_ids),
                              'skipped_count', jsonb_array_length(a.skipped))
      INTO v_approval
      FROM statement_approvals a WHERE a.id = v_link.approval_id;
  END IF;

  RETURN jsonb_build_object(
    'enabled', v_enabled,
    'actor', 'link',
    'can_manage', false,
    'can_approve', (v_enabled AND NOT v_used),
    'approved', v_used,
    'approved_at', v_link.used_at,
    'approval', v_approval,
    'scope', 'full',
    'summary', v_summary,
    'invoices', v_invoices,
    'expires_at', v_link.expires_at,
    'changed_invoice_ids', to_jsonb(COALESCE(v_changed, '{}'::uuid[])),
    'clinic_name', (SELECT c.name FROM clinics c WHERE c.id = v_link.clinic_id),
    'lab_name', (SELECT l.name FROM labs l WHERE l.id = v_link.lab_id));
END $function$;

REVOKE ALL ON FUNCTION public.get_pre_statement_by_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pre_statement_by_link(text) TO anon, authenticated, service_role;

-- === 7) Bağlantıdan onayla ===
CREATE FUNCTION public.approve_pre_statement_by_link(p_token text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link  statement_approval_links := _ps_link_resolve(p_token);
  v_inv   jsonb;
  v_res   jsonb;
BEGIN
  -- Bağlantı satırı kilitlenir; eşzamanlı ikinci onay bekler ve sonra kullanılmış bulur
  PERFORM 1 FROM statement_approval_links l
    WHERE l.id = v_link.id AND l.revoked_at IS NULL AND l.used_at IS NULL AND l.expires_at > now()
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PS_LINK_INVALID' USING ERRCODE = '22023'; END IF;

  IF NOT COALESCE((SELECT s.invoice_approval_enabled FROM lab_settings s WHERE s.lab_id = v_link.lab_id), false) THEN
    RAISE EXCEPTION 'PS_DISABLED' USING ERRCODE = '22023';
  END IF;

  -- _ps_finalize ile aynı klinik kilidi: liste kurulurken eşzamanlı bir onay (panel/lab/bağlantı) taslakları değiştirmesin
  PERFORM pg_advisory_xact_lock(hashtext('ps_finalize:' || v_link.clinic_id::text));

  -- Yalnız anlık görüntüdeki ve hâlâ taslak olan faturalar, anlık görüntünün updated_at'iyle (değişen → 'changed' atlanır)
  SELECT jsonb_agg(jsonb_build_object('id', s.id, 'updated_at', s.ts) ORDER BY s.id)
    INTO v_inv
    FROM (SELECT (e->>'id')::uuid AS id, min(e->>'updated_at') AS ts
            FROM jsonb_array_elements(v_link.snapshot) e GROUP BY 1) s
    JOIN invoices i ON i.id = s.id
   WHERE i.clinic_id = v_link.clinic_id AND i.lab_id = v_link.lab_id AND i.status = 'taslak';
  IF v_inv IS NULL THEN RAISE EXCEPTION 'PS_EMPTY' USING ERRCODE = '22023'; END IF;

  v_res := _ps_finalize(v_link.clinic_id, v_inv, p_mode, 'link', NULL, v_link.recipient_profile_id);

  -- Bir şey kesinleştiyse bağlantı kullanılmış olur (hiçbiri kesinleşmediyse bağlantı geçerli kalır)
  IF v_res->>'approval_id' IS NOT NULL THEN
    UPDATE statement_approval_links
       SET used_at = now(), approval_id = (v_res->>'approval_id')::uuid
     WHERE id = v_link.id;
  END IF;
  RETURN v_res;
END $function$;

REVOKE ALL ON FUNCTION public.approve_pre_statement_by_link(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pre_statement_by_link(text, text) TO anon, authenticated, service_role;

-- === 8) Bağlantıdan not yaz (klinik tarafı; add_statement_note kuralları) ===
CREATE FUNCTION public.add_statement_note_by_link(p_token text, p_invoice_item_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link   statement_approval_links := _ps_link_resolve(p_token);
  v_body   text := btrim(COALESCE(p_body, ''));
  v_inv    record;
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
  -- Kalem bağlantının kliniğine/lab'ına ve anlık görüntüdeki bir faturaya ait olmalı
  IF NOT FOUND OR v_inv.clinic_id IS DISTINCT FROM v_link.clinic_id OR v_inv.lab_id IS DISTINCT FROM v_link.lab_id
     OR v_inv.lab_id IS DISTINCT FROM v_inv.clinic_lab
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_link.snapshot) e WHERE (e->>'id')::uuid = v_inv.id) THEN
    RAISE EXCEPTION 'PS_SCOPE' USING ERRCODE = '42501';
  END IF;
  IF length(v_body) < 1 OR length(v_body) > 2000 THEN
    RAISE EXCEPTION 'PS_BODY' USING ERRCODE = '22023';
  END IF;
  IF v_inv.status IS DISTINCT FROM 'taslak' THEN
    RAISE EXCEPTION 'PS_NOT_DRAFT' USING ERRCODE = '22023';
  END IF;

  INSERT INTO statement_item_notes (invoice_item_id, invoice_id, lab_id, clinic_id, author_id, author_side, body)
  VALUES (p_invoice_item_id, v_inv.id, v_inv.lab_id, v_inv.clinic_id, v_link.recipient_profile_id, 'clinic', v_body)
  RETURNING id INTO v_note;

  INSERT INTO statement_item_disputes (invoice_item_id, invoice_id, lab_id, clinic_id, status, updated_at)
  VALUES (p_invoice_item_id, v_inv.id, v_inv.lab_id, v_inv.clinic_id, 'acik', now())
  ON CONFLICT (invoice_item_id) DO UPDATE
    SET status = 'acik', invoice_id = EXCLUDED.invoice_id, updated_at = now();

  SELECT d.status INTO v_status FROM statement_item_disputes d WHERE d.invoice_item_id = p_invoice_item_id;

  -- K3: klinik notu → lab'ın manage_finance kullanıcılarına uygulama içi bildirim (add_statement_note ile aynı)
  IF COALESCE(current_setting('siman.skip_notify', true), '') <> 'on' THEN
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
END $function$;

REVOKE ALL ON FUNCTION public.add_statement_note_by_link(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_statement_note_by_link(text, uuid, text) TO anon, authenticated, service_role;

COMMIT;
