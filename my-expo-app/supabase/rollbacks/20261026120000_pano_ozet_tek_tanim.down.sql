-- Geri alma: 20261026120000_pano_ozet_tek_tanim (canlı tanımlar .before.txt'ten)
drop view if exists public.v_active_orders_kanban;
create view public.v_active_orders_kanban with (security_invoker = on) as
SELECT wo.id,
    wo.order_number,
    wo.work_type,
    wo.delivery_date,
    wo.is_rush,
    wo.status,
    wo.input_type,
    ob.box_code,
    cs.id AS current_stage_id,
    cs.sequence_order AS current_sequence,
    cs.status AS stage_status,
    cs.started_at AS stage_started_at,
    ls.name AS current_station_name,
    ls.color AS current_station_color,
    tp.id AS technician_id,
    tp.full_name AS technician_name,
    dp.full_name AS doctor_name,
    dp.clinic_name,
    cs.parallel_group,
    wo.patient_name,
    wo.tooth_numbers,
    wo.shade
   FROM (((((work_orders wo
     JOIN order_stages cs ON (((cs.work_order_id = wo.id) AND (cs.status = 'aktif'::stage_status))))
     LEFT JOIN order_boxes ob ON ((ob.id = wo.box_id)))
     LEFT JOIN lab_stations ls ON ((ls.id = cs.station_id)))
     LEFT JOIN profiles tp ON ((tp.id = cs.technician_id)))
     LEFT JOIN profiles dp ON ((dp.id = wo.doctor_id)))
  WHERE ((wo.status <> ALL (ARRAY['teslim_edildi'::work_order_status, 'iptal'::work_order_status])) AND (wo.lab_id = ( SELECT get_my_lab_id() AS get_my_lab_id)))
UNION ALL
 SELECT wo.id,
    wo.order_number,
    wo.work_type,
    wo.delivery_date,
    wo.is_rush,
    wo.status,
    wo.input_type,
    ob.box_code,
    cs.id AS current_stage_id,
    cs.sequence_order AS current_sequence,
    cs.status AS stage_status,
    cs.started_at AS stage_started_at,
    ls.name AS current_station_name,
    ls.color AS current_station_color,
    tp.id AS technician_id,
    tp.full_name AS technician_name,
    dp.full_name AS doctor_name,
    dp.clinic_name,
    cs.parallel_group,
    wo.patient_name,
    wo.tooth_numbers,
    wo.shade
   FROM (((((work_orders wo
     LEFT JOIN order_boxes ob ON ((ob.id = wo.box_id)))
     LEFT JOIN order_stages cs ON ((cs.id = wo.current_stage_id)))
     LEFT JOIN lab_stations ls ON ((ls.id = cs.station_id)))
     LEFT JOIN profiles tp ON ((tp.id = cs.technician_id)))
     LEFT JOIN profiles dp ON ((dp.id = wo.doctor_id)))
  WHERE ((wo.status <> ALL (ARRAY['teslim_edildi'::work_order_status, 'iptal'::work_order_status])) AND (NOT (EXISTS ( SELECT 1
           FROM order_stages os
          WHERE ((os.work_order_id = wo.id) AND (os.status = 'aktif'::stage_status))))) AND (wo.lab_id = ( SELECT get_my_lab_id() AS get_my_lab_id)));
grant select, references, trigger, maintain on public.v_active_orders_kanban to authenticated;
grant all on public.v_active_orders_kanban to service_role;

CREATE OR REPLACE FUNCTION public.fn_daily_order_watch()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret   text;
  v_lab      record;
  v_uid      uuid;
  v_utype    text;
  v_body     text;
  v_action   text;
  v_notif_id uuid;
  v_items    jsonb;
  v_maxlate  integer;
  v_sent     integer := 0;
  v_anon     text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODMwODYsImV4cCI6MjA5NDc1OTA4Nn0.JWYGFTRvepDfkfZlvSxqjOm5oEw6RfWwhoz070MBShU';
  v_base     text := 'https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/';
  v_hdr      jsonb;
  v_fn       text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'notify_fn_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  v_hdr := jsonb_build_object(
    'Content-Type',    'application/json',
    'Authorization',   'Bearer ' || v_anon,
    'apikey',          v_anon,
    'x-notify-secret', COALESCE(v_secret, '')
  );

  FOR v_lab IN
    SELECT wo.lab_id,
           count(*) FILTER (WHERE wo.delivery_date < CURRENT_DATE AND wo.hold_status IS DISTINCT FROM 'on_hold') AS overdue_ct,
           count(*) FILTER (WHERE wo.hold_status = 'on_hold') AS hold_ct
      FROM public.work_orders wo
     WHERE wo.lab_id IS NOT NULL
       AND wo.status NOT IN ('teslim_edildi', 'iptal')
       AND (wo.delivery_date < CURRENT_DATE OR wo.hold_status = 'on_hold')
     GROUP BY wo.lab_id
     HAVING count(*) FILTER (WHERE wo.delivery_date < CURRENT_DATE AND wo.hold_status IS DISTINCT FROM 'on_hold') > 0
         OR count(*) FILTER (WHERE wo.hold_status = 'on_hold') > 0
  LOOP
    SELECT
      jsonb_agg(jsonb_build_object(
        'patient', COALESCE(NULLIF(trim(x.patient_name), ''), '—'),
        'clinic',  COALESCE(x.clinic_name, ''),
        'work',    COALESCE(x.work_type, ''),
        'kind',    x.kind,
        'tag',     x.tag,
        'note',    x.note
      ) ORDER BY x.sort_key),
      max(x.days_late) FILTER (WHERE x.kind = 'overdue')
    INTO v_items, v_maxlate
    FROM (
      SELECT wo.patient_name, wo.work_type, c.name AS clinic_name,
             (CURRENT_DATE - wo.delivery_date) AS days_late,
             CASE WHEN wo.hold_status = 'on_hold' THEN 'hold' ELSE 'overdue' END AS kind,
             CASE WHEN wo.hold_status = 'on_hold' THEN 'Beklemede'
                  ELSE (CURRENT_DATE - wo.delivery_date) || ' gün gecikti' END AS tag,
             CASE WHEN wo.hold_status = 'on_hold'
                  THEN COALESCE(NULLIF(trim(wo.hold_reason), ''),
                         CASE wo.hold_category WHEN 'material' THEN 'Malzeme / parça bekleniyor' ELSE 'Beklemede' END)
                  ELSE NULL END AS note,
             (CASE WHEN wo.hold_status = 'on_hold' THEN 1 ELSE 0 END) * 1000000 - (CURRENT_DATE - wo.delivery_date) AS sort_key
        FROM public.work_orders wo
        LEFT JOIN public.doctors d ON d.id = wo.doctor_id
        LEFT JOIN public.clinics c ON c.id = d.clinic_id
       WHERE wo.lab_id = v_lab.lab_id
         AND wo.status NOT IN ('teslim_edildi', 'iptal')
         AND ((wo.delivery_date < CURRENT_DATE AND wo.hold_status IS DISTINCT FROM 'on_hold') OR wo.hold_status = 'on_hold')
    ) x;

    IF v_lab.overdue_ct > 0 AND v_lab.hold_ct > 0 THEN
      v_body := 'Bugün gözden geçirmen gereken birkaç iş var — ' || v_lab.overdue_ct || ' tanesi gecikmiş'
        || CASE WHEN v_maxlate IS NOT NULL AND v_maxlate > 0 THEN ' (en fazla ' || v_maxlate || ' gün)' ELSE '' END
        || ', ' || v_lab.hold_ct || ' tanesi de beklemede. Hepsini aşağıya çıkardım.';
    ELSIF v_lab.overdue_ct > 0 THEN
      v_body := 'Bugün ' || v_lab.overdue_ct || ' sipariş gecikmiş durumda'
        || CASE WHEN v_maxlate IS NOT NULL AND v_maxlate > 0 THEN ' (en gecikmişi ' || v_maxlate || ' gün)' ELSE '' END
        || '. Aşağıda tek tek bulabilirsin:';
    ELSE
      v_body := 'Bugün ' || v_lab.hold_ct || ' sipariş beklemede. Neyi beklediklerini aşağıya çıkardım:';
    END IF;

    FOR v_uid, v_utype IN
      SELECT p.id, p.user_type
        FROM public.profiles p
       WHERE p.lab_id = v_lab.lab_id
         AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
    LOOP
      IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = v_uid AND n.category = 'order_watch' AND n.created_at >= CURRENT_DATE) THEN
        CONTINUE;
      END IF;

      v_action := CASE WHEN v_utype = 'admin' THEN '/(admin)' ELSE '/(lab)/orders' END;

      INSERT INTO public.notifications (user_id, lab_id, category, title, body, resource_type, action_url, payload)
      VALUES (v_uid, v_lab.lab_id, 'order_watch', 'Bugünün iş takibi', v_body, 'order_watch', v_action,
        jsonb_build_object('overdue', v_lab.overdue_ct, 'onHold', v_lab.hold_ct, 'items', COALESCE(v_items, '[]'::jsonb)))
      RETURNING id INTO v_notif_id;

      FOREACH v_fn IN ARRAY ARRAY['send-email-notification', 'send-expo-push', 'send-web-push', 'send-whatsapp-notification'] LOOP
        PERFORM net.http_post(
          url     := v_base || v_fn,
          headers := v_hdr,
          body    := jsonb_build_object(
            'userIds',        jsonb_build_array(v_uid::text),
            'category',       'order_watch',
            'notificationId', v_notif_id::text,
            'payload',        jsonb_build_object(
              'title', 'Bugünün iş takibi', 'body', v_body, 'actionUrl', v_action,
              'resourceType', 'order_watch', 'items', COALESCE(v_items, '[]'::jsonb)
            )
          )
        );
      END LOOP;

      v_sent := v_sent + 1;
    END LOOP;
  END LOOP;

  RETURN v_sent;
END;
$function$;

grant execute on function public.dashboard_pipeline_counts() to authenticated;
