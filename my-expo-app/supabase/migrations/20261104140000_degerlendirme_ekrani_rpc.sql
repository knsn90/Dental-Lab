-- 20261104140000_degerlendirme_ekrani_rpc
-- Değerlendirmeler ekranı (spec 2026-11-04 §6–§8) — okuma ve arama kaydı RPC'leri.
--   • get_review_dashboard(p_month, p_focus): ay özeti, klinik kırılımı (6 ay), ayın değerlendirmeleri,
--     düşük puanlar (ayın düşükleri + ayı ne olursa olsun "Aranmadı" olanlar).
--   • review_followup_set_call(p_work_order, p_action, p_note): Arandı / not / geri al.
-- Yalnız aynı lab'ın yöneticisi (admin ya da lab+manager). Ay Türkiye saatiyle.
-- Geri alma: rollbacks/20261104140000_degerlendirme_ekrani_rpc.down.sql

CREATE OR REPLACE FUNCTION public.get_review_dashboard(p_month date DEFAULT NULL, p_focus uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab   uuid := public.get_my_lab_id();
  v_now_m date := date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_month date; v_first date; v_prev date; v_prev3 date;
  v_lo timestamptz; v_from timestamptz; v_to timestamptz;
  v_del integer; v_rev integer; v_rate jsonb; v_out jsonb;
BEGIN
  IF v_lab IS NULL OR NOT (coalesce(public.my_user_type(), '') = 'admin' OR public.is_lab_manager()) THEN
    RAISE EXCEPTION 'review dashboard: forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_month IS NOT NULL THEN
    v_month := date_trunc('month', p_month)::date;
    IF v_month > v_now_m THEN
      RAISE EXCEPTION 'review dashboard: future month' USING ERRCODE = '22023';
    END IF;
  ELSIF p_focus IS NOT NULL THEN
    SELECT date_trunc('month', r.created_at AT TIME ZONE 'Europe/Istanbul')::date INTO v_month
      FROM public.order_reviews r
     WHERE r.work_order_id = p_focus AND r.lab_id = v_lab;
  END IF;
  v_month := coalesce(v_month, v_now_m);
  v_first := (v_month - interval '5 months')::date;   -- 6 aylık serinin ilk ayı
  v_prev  := (v_month - interval '1 month')::date;
  v_prev3 := (v_month - interval '3 months')::date;
  v_lo    := v_first::timestamp AT TIME ZONE 'Europe/Istanbul';
  v_from  := v_month::timestamp AT TIME ZONE 'Europe/Istanbul';
  v_to    := (v_month + interval '1 month')::timestamp AT TIME ZONE 'Europe/Istanbul';

  -- Puan alma oranı: ayda teslim edilmiş, 14 günü dolmuş işler; 14 gün içinde puanlananlar.
  SELECT count(*),
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.order_reviews r
                                         WHERE r.work_order_id = wo.id
                                           AND r.created_at < wo.delivered_at + interval '14 days'))
    INTO v_del, v_rev
    FROM public.work_orders wo
   WHERE wo.lab_id = v_lab
     AND wo.status = 'teslim_edildi'
     AND wo.delivered_at >= v_from AND wo.delivered_at < v_to
     AND wo.delivered_at + interval '14 days' <= now();
  v_rate := CASE WHEN v_del > 0 THEN jsonb_build_object('delivered', v_del, 'reviewed', v_rev) END;

  WITH rv AS (
    SELECT r.work_order_id, r.created_at, r.overall,
           date_trunc('month', r.created_at AT TIME ZONE 'Europe/Istanbul')::date AS m,
           least(r.overall, r.fit, r.occlusion, r.contacts, r.esthetics, r.surface, r.on_time,
                 CASE WHEN rr.answer IN (1, 3) THEN rr.answer END) AS eff_min,
           CASE WHEN c.id IS NOT NULL THEN 'c:' || c.id::text
                ELSE 'd:' || coalesce(wo.doctor_id::text, 'none') END AS clinic_key,
           CASE WHEN c.id IS NOT NULL THEN 'clinic' ELSE 'doctor' END AS clinic_kind,
           coalesce(nullif(btrim(c.name), ''), nullif(btrim(d.full_name), '')) AS clinic_name,
           coalesce(nullif(btrim(c.phone), ''), nullif(btrim(c.whatsapp_phone), ''), nullif(btrim(d.phone), '')) AS phone,
           jsonb_build_object(
             'work_order_id', r.work_order_id,
             'order_number', wo.order_number,
             'clinic_key', CASE WHEN c.id IS NOT NULL THEN 'c:' || c.id::text
                                ELSE 'd:' || coalesce(wo.doctor_id::text, 'none') END,
             'clinic_name', coalesce(nullif(btrim(c.name), ''), nullif(btrim(d.full_name), '')),
             'doctor_name', nullif(btrim(d.full_name), ''),
             'work_type_label', public._review_work_type_label(wo.work_type),
             'created_at', r.created_at,
             'source', r.source,
             'overall', r.overall, 'fit', r.fit, 'occlusion', r.occlusion, 'contacts', r.contacts,
             'esthetics', r.esthetics, 'surface', r.surface, 'on_time', r.on_time,
             'comment', r.comment,
             'wa_answer', rr.answer,
             'cur_min', least(r.overall, r.fit, r.occlusion, r.contacts, r.esthetics, r.surface, r.on_time,
                              CASE WHEN rr.answer IN (1, 3) THEN rr.answer END)
           ) AS row_json
      FROM public.order_reviews r
      JOIN public.work_orders wo ON wo.id = r.work_order_id
      LEFT JOIN public.review_requests rr ON rr.work_order_id = r.work_order_id
      LEFT JOIN public.doctors d ON d.id = wo.doctor_id
      LEFT JOIN public.clinics c ON c.id = d.clinic_id
     WHERE r.lab_id = v_lab
       AND ((r.created_at >= v_lo AND r.created_at < v_to)
            OR r.work_order_id IN (SELECT f.work_order_id FROM public.review_followups f
                                    WHERE f.lab_id = v_lab AND f.cur_min <= 3))
  ),
  win AS (SELECT * FROM rv WHERE m BETWEEN v_first AND v_month),
  months AS (SELECT i, (v_first + make_interval(months => i))::date AS m FROM generate_series(0, 5) AS i),
  kinfo AS (
    SELECT DISTINCT ON (clinic_key) clinic_key, clinic_kind, clinic_name
      FROM win ORDER BY clinic_key, created_at DESC
  ),
  cm AS (
    SELECT k.clinic_key, mo.i, round(avg(w.overall)::numeric, 1) AS a, count(w.work_order_id) AS n
      FROM kinfo k CROSS JOIN months mo
      LEFT JOIN win w ON w.clinic_key = k.clinic_key AND w.m = mo.m
     GROUP BY k.clinic_key, mo.i
  ),
  clin AS (
    SELECT jsonb_agg(jsonb_build_object(
             'key', k.clinic_key, 'kind', k.clinic_kind, 'name', k.clinic_name,
             'series', (SELECT jsonb_agg(cm.a ORDER BY cm.i) FROM cm WHERE cm.clinic_key = k.clinic_key),
             'counts', (SELECT jsonb_agg(cm.n ORDER BY cm.i) FROM cm WHERE cm.clinic_key = k.clinic_key),
             'month_avg', (SELECT round(avg(w.overall)::numeric, 1) FROM win w WHERE w.clinic_key = k.clinic_key AND w.m = v_month),
             'month_count', (SELECT count(*) FROM win w WHERE w.clinic_key = k.clinic_key AND w.m = v_month),
             'month_low', (SELECT count(*) FROM win w WHERE w.clinic_key = k.clinic_key AND w.m = v_month AND w.eff_min <= 3),
             -- önceki 3 takvim ayının TÜM puanlarının ortalaması (ay ortalamalarının ortalaması değil)
             'prev3_avg', (SELECT round(avg(w.overall)::numeric, 1) FROM win w
                            WHERE w.clinic_key = k.clinic_key AND w.m >= v_prev3 AND w.m < v_month)
           )) AS j
      FROM kinfo k
  ),
  lows AS (
    SELECT jsonb_agg(rv.row_json || jsonb_build_object(
             'cur_min', f.cur_min,
             'phone', rv.phone,
             'period_started_at', f.period_started_at,
             'called_at', f.called_at,
             'called_by_name', nullif(btrim(pc.full_name), ''),
             'call_note', f.call_note,
             'note_updated_at', f.note_updated_at,
             'note_updated_by_name', nullif(btrim(pn.full_name), ''),
             'is_open', coalesce(f.called_at IS NULL OR f.called_at < f.period_started_at, false),
             'previous_call', coalesce(f.called_at IS NOT NULL AND f.called_at < f.period_started_at, false)
           )) AS j
      FROM public.review_followups f
      JOIN rv ON rv.work_order_id = f.work_order_id
      LEFT JOIN public.profiles pc ON pc.id = f.called_by
      LEFT JOIN public.profiles pn ON pn.id = f.note_updated_by
     WHERE f.lab_id = v_lab
       AND f.cur_min <= 3
       AND (rv.m = v_month OR f.called_at IS NULL OR f.called_at < f.period_started_at)
  )
  SELECT jsonb_build_object(
           'month', to_char(v_month, 'YYYY-MM-DD'),
           'summary', jsonb_build_object(
             'avg', (SELECT round(avg(overall)::numeric, 1) FROM win WHERE m = v_month),
             'count', (SELECT count(*) FROM win WHERE m = v_month),
             'low_count', (SELECT count(*) FROM win WHERE m = v_month AND eff_min <= 3),
             'prev_avg', (SELECT round(avg(overall)::numeric, 1) FROM win WHERE m = v_prev),
             'rate', v_rate,
             'has_any', EXISTS (SELECT 1 FROM public.order_reviews r WHERE r.lab_id = v_lab)
           ),
           'clinics', coalesce((SELECT j FROM clin), '[]'::jsonb),
           'reviews', coalesce((SELECT jsonb_agg(row_json ORDER BY created_at DESC) FROM win WHERE m = v_month), '[]'::jsonb),
           'lows', coalesce((SELECT j FROM lows), '[]'::jsonb)
         )
    INTO v_out;
  RETURN v_out;
END; $function$;
REVOKE ALL ON FUNCTION public.get_review_dashboard(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_review_dashboard(date, uuid) TO authenticated;

-- ── Arama kaydı ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.review_followup_set_call(p_work_order uuid, p_action text, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.get_my_lab_id(); v_uid uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  f public.review_followups;
BEGIN
  IF v_lab IS NULL OR v_uid IS NULL
     OR NOT (coalesce(public.my_user_type(), '') = 'admin' OR public.is_lab_manager()) THEN
    RAISE EXCEPTION 'review call: forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('mark', 'note', 'unmark') THEN
    RAISE EXCEPTION 'review call: bad action' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'review call: note too long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO f FROM public.review_followups WHERE work_order_id = p_work_order FOR UPDATE;
  IF NOT FOUND OR f.lab_id IS DISTINCT FROM v_lab THEN
    RAISE EXCEPTION 'review call: not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'mark' THEN
    IF f.cur_min IS NULL OR f.cur_min > 3 THEN
      RAISE EXCEPTION 'review call: not low' USING ERRCODE = '22023';
    END IF;
    UPDATE public.review_followups
       SET called_at = now(), called_by = v_uid, called_min = cur_min,
           call_note = v_note,
           note_updated_at = CASE WHEN v_note IS NOT NULL THEN now() END,
           note_updated_by = CASE WHEN v_note IS NOT NULL THEN v_uid END,
           updated_at = now()
     WHERE work_order_id = p_work_order
    RETURNING * INTO f;
  ELSIF p_action = 'note' THEN
    IF f.called_at IS NULL THEN
      RAISE EXCEPTION 'review call: not called' USING ERRCODE = '22023';
    END IF;
    UPDATE public.review_followups
       SET call_note = v_note, note_updated_at = now(), note_updated_by = v_uid, updated_at = now()
     WHERE work_order_id = p_work_order
    RETURNING * INTO f;
  ELSE
    UPDATE public.review_followups
       SET called_at = NULL, called_by = NULL, called_min = NULL,
           call_note = NULL, note_updated_at = NULL, note_updated_by = NULL, updated_at = now()
     WHERE work_order_id = p_work_order
    RETURNING * INTO f;
  END IF;

  RETURN jsonb_build_object(
    'called_at', f.called_at,
    'called_by_name', (SELECT nullif(btrim(p.full_name), '') FROM public.profiles p WHERE p.id = f.called_by),
    'call_note', f.call_note,
    'note_updated_at', f.note_updated_at,
    'note_updated_by_name', (SELECT nullif(btrim(p.full_name), '') FROM public.profiles p WHERE p.id = f.note_updated_by),
    'is_open', coalesce(f.cur_min <= 3 AND (f.called_at IS NULL OR f.called_at < f.period_started_at), false),
    'previous_call', coalesce(f.cur_min <= 3 AND f.called_at IS NOT NULL AND f.called_at < f.period_started_at, false)
  );
END; $function$;
REVOKE ALL ON FUNCTION public.review_followup_set_call(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_followup_set_call(uuid, text, text) TO authenticated;
