-- ============================================================
-- 20260722100000 — Kapsamlı aktivite loglama
--
-- Bugüne kadar activity_logs YALNIZ DB trigger'ları ile (profiles,
-- work_orders, status_history, clinics, doctors) yazılıyordu. Bu migration
-- kapsamı genişletir:
--   • Merkezi yardımcı: log_activity() — her yerden (trigger + client) çağrılır.
--   • log_login() — her rol için giriş logu (klinik/hekim çoklu-lab fan-out).
--   • Teknisyen aşama işlemleri (order_stages status değişimi).
--   • Malzeme tüketimi (stock_movements source='stage-consumption').
--   • Klinik/hekim sipariş eylemleri: düzenle / iptal / değişiklik talebi /
--     iptal talebi (order_change_requests, order_cancellation_requests,
--     work_orders 'iptal').
--   • Mesaj (order_messages) + dosya (work_order_photos) yüklemeleri.
--
-- GÜVENLİK: TÜM loglama fonksiyonları EXCEPTION WHEN OTHERS THEN ...
-- ile korunur; loglama başarısız olsa bile ANA İŞLEM (aşama tamamlama,
-- mesaj gönderme, sipariş düzenleme vb.) ASLA bozulmaz. Loglar SECURITY
-- DEFINER olduğundan activity_logs INSERT RLS'ini bypass eder. Görünürlük
-- değişmez: admin + kendi labı (mevcut SELECT policy).
-- ============================================================

-- ── 1. Aktör tipi normalizasyonu ──────────────────────────────────────────
-- Ham user_type/role → sabit küçük küme: admin·lab·technician·courier·clinic·doctor
CREATE OR REPLACE FUNCTION public._log_actor_type(p_user_type text, p_role text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_type = 'admin'                              THEN 'admin'
    WHEN p_user_type = 'doctor'                             THEN 'doctor'
    WHEN p_user_type IN ('clinic_admin','clinic_secretary','clinic') THEN 'clinic'
    WHEN p_user_type = 'courier'                            THEN 'courier'
    WHEN p_user_type = 'lab' AND p_role = 'courier'         THEN 'courier'
    WHEN p_user_type = 'lab' AND p_role = 'technician'      THEN 'technician'
    WHEN p_user_type = 'lab'                                THEN 'lab'
    ELSE COALESCE(NULLIF(p_user_type, ''), 'lab')
  END
$$;

-- ── 2. Merkezi yardımcı: log_activity() ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_activity(
  p_action       text,
  p_entity_type  text  DEFAULT NULL,
  p_entity_id    uuid  DEFAULT NULL,
  p_entity_label text  DEFAULT NULL,
  p_metadata     jsonb DEFAULT NULL,
  p_lab_id       uuid  DEFAULT NULL,
  p_actor_id     uuid  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
  v_name  text;
  v_ut    text;
  v_role  text;
  v_plab  uuid;
  v_id    uuid;
BEGIN
  IF p_action IS NULL OR btrim(p_action) = '' THEN RETURN NULL; END IF;

  SELECT full_name, user_type, role, lab_id
    INTO v_name, v_ut, v_role, v_plab
    FROM public.profiles WHERE id = v_actor;

  INSERT INTO public.activity_logs
    (actor_id, actor_name, actor_type, action, entity_type, entity_id, entity_label, metadata, lab_id)
  VALUES
    (v_actor,
     COALESCE(NULLIF(v_name, ''), 'Sistem'),
     public._log_actor_type(v_ut, v_role),
     p_action, p_entity_type, p_entity_id, p_entity_label, p_metadata,
     COALESCE(p_lab_id, v_plab))
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- loglama asla ana işlemi bozmaz
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_activity(text,text,uuid,text,jsonb,uuid,uuid) TO authenticated;

-- ── 3. Giriş logu: log_login() ────────────────────────────────────────────
-- Lab-tarafı (admin/lab/teknisyen/kurye): kendi labı için tek satır.
-- Klinik-tarafı (hekim/klinik): bağlı OLDUĞU HER lab için bir satır
-- (RLS lab_id = get_my_lab_id() olduğundan her lab admini kendi girişini görür).
CREATE OR REPLACE FUNCTION public.log_login()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text;
  v_ut     text;
  v_role   text;
  v_plab   uuid;
  v_clinic uuid;
  v_atype  text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT full_name, user_type, role, lab_id, clinic_id
    INTO v_name, v_ut, v_role, v_plab, v_clinic
    FROM public.profiles WHERE id = v_uid;

  v_atype := public._log_actor_type(v_ut, v_role);

  IF v_ut IN ('doctor','clinic_admin','clinic_secretary','clinic') THEN
    INSERT INTO public.activity_logs
      (actor_id, actor_name, actor_type, action, entity_type, entity_id, lab_id)
    SELECT DISTINCT
           v_uid, COALESCE(NULLIF(v_name,''),'Sistem'), v_atype,
           'Giriş yaptı', 'auth', v_uid, m.lab_id
      FROM public.clinic_lab_memberships m
     WHERE m.status = 'active'
       AND m.lab_id IS NOT NULL
       AND ( m.member_profile_id = v_uid
             OR (v_clinic IS NOT NULL AND m.member_clinic_id = v_clinic) );
    RETURN;
  END IF;

  -- Lab-tarafı
  IF v_plab IS NOT NULL THEN
    INSERT INTO public.activity_logs
      (actor_id, actor_name, actor_type, action, entity_type, entity_id, lab_id)
    VALUES (v_uid, COALESCE(NULLIF(v_name,''),'Sistem'), v_atype,
            'Giriş yaptı', 'auth', v_uid, v_plab);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_login() TO authenticated;

-- ── 4. Teknisyen aşama işlemleri (order_stages status değişimi) ────────────
CREATE OR REPLACE FUNCTION public.log_stage_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action  text;
  v_actor   uuid := auth.uid();
  v_lab     uuid;
  v_ordno   text;
  v_station text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF    NEW.status = 'aktif' AND OLD.status IN ('bekliyor','yeniden') THEN
    v_action := 'Aşamaya başladı';
    v_actor  := COALESCE(v_actor, NEW.technician_id);
  ELSIF NEW.status = 'tamamlandi' THEN
    v_action := 'Aşamayı tamamladı';
    v_actor  := COALESCE(v_actor, NEW.technician_id);
  ELSIF NEW.status = 'onaylandi' THEN
    v_action := 'Aşamayı onayladı';
    v_actor  := COALESCE(NEW.approved_by, v_actor);
  ELSIF NEW.status = 'reddedildi' THEN
    v_action := 'Aşamayı reddetti';
    v_actor  := COALESCE(v_actor, NEW.approved_by, NEW.technician_id);
  ELSIF NEW.status = 'skipped' THEN
    v_action := 'Aşamayı atladı';
    v_actor  := COALESCE(NEW.skipped_by, v_actor);
  ELSE
    RETURN NEW;  -- durakladi/makine_bekliyor/bloklu vb. → gürültü, loglama
  END IF;

  SELECT wo.lab_id, wo.order_number INTO v_lab, v_ordno
    FROM public.work_orders wo WHERE wo.id = NEW.work_order_id;
  SELECT name INTO v_station FROM public.lab_stations WHERE id = NEW.station_id;

  PERFORM public.log_activity(
    v_action, 'stage', NEW.id,
    COALESCE(v_ordno,'') || CASE WHEN v_station IS NOT NULL THEN ' · ' || v_station ELSE '' END,
    jsonb_build_object('status', NEW.status::text, 'from', OLD.status::text, 'station', v_station),
    v_lab, v_actor);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_stage_activity ON public.order_stages;
CREATE TRIGGER trg_log_stage_activity
  AFTER UPDATE OF status ON public.order_stages
  FOR EACH ROW EXECUTE FUNCTION public.log_stage_activity();

-- ── 5. Malzeme tüketimi (stock_movements, aşama tüketimi) ──────────────────
CREATE OR REPLACE FUNCTION public.log_stage_material()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ordno text;
  v_qty   text;
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    SELECT order_number INTO v_ordno FROM public.work_orders WHERE id = NEW.order_id;
  END IF;
  v_qty := CASE WHEN NEW.quantity IS NOT NULL
                THEN btrim(to_char(NEW.quantity, 'FM999999990.####')) || ' ' || COALESCE(NEW.unit,'')
                ELSE '' END;

  PERFORM public.log_activity(
    CASE WHEN NEW.type = 'WASTE' THEN 'Malzeme fire verdi' ELSE 'Malzeme tüketti' END,
    'material', NEW.stage_id,
    COALESCE(NEW.item_name,'')
      || CASE WHEN v_qty <> '' THEN ' · ' || v_qty ELSE '' END
      || CASE WHEN v_ordno IS NOT NULL THEN ' · ' || v_ordno ELSE '' END,
    jsonb_build_object('item', NEW.item_name, 'qty', NEW.quantity, 'unit', NEW.unit,
                       'stage', NEW.stage, 'type', NEW.type),
    NEW.lab_id, NEW.user_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_stage_material ON public.stock_movements;
CREATE TRIGGER trg_log_stage_material
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW WHEN (NEW.source = 'stage-consumption')
  EXECUTE FUNCTION public.log_stage_material();

-- ── 6. Değişiklik talepleri (order_change_requests) ───────────────────────
CREATE OR REPLACE FUNCTION public.log_change_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_actor  uuid;
  v_lab    uuid;
  v_ordno  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'Değişiklik talebi oluşturdu';
    v_actor  := COALESCE(NEW.requested_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF    NEW.status = 'approved' THEN v_action := 'Değişiklik talebini onayladı';
    ELSIF NEW.status = 'rejected' THEN v_action := 'Değişiklik talebini reddetti';
    ELSE  RETURN NEW; END IF;
    v_actor := COALESCE(NEW.reviewed_by, auth.uid());
  ELSE
    RETURN NEW;
  END IF;

  v_lab := NEW.lab_id;
  SELECT order_number INTO v_ordno FROM public.work_orders WHERE id = NEW.work_order_id;
  IF v_lab IS NULL THEN
    SELECT lab_id INTO v_lab FROM public.work_orders WHERE id = NEW.work_order_id;
  END IF;

  PERFORM public.log_activity(v_action, 'change_request', NEW.id, v_ordno,
    jsonb_build_object('status', NEW.status), v_lab, v_actor);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_change_request ON public.order_change_requests;
CREATE TRIGGER trg_log_change_request
  AFTER INSERT OR UPDATE ON public.order_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_change_request();

-- ── 7. İptal talepleri (order_cancellation_requests) ──────────────────────
-- Onaylanan iptal → work_orders 'iptal' trigger'ı (§8) loglar; burada
-- yalnız talep oluşturma + reddi loglanır (çift kayıt olmasın).
CREATE OR REPLACE FUNCTION public.log_cancel_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_actor  uuid;
  v_lab    uuid;
  v_ordno  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'İptal talebi oluşturdu';
    v_actor  := COALESCE(NEW.requested_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'rejected' THEN
    v_action := 'İptal talebini reddetti';
    v_actor  := COALESCE(NEW.reviewed_by, auth.uid());
  ELSE
    RETURN NEW;
  END IF;

  v_lab := NEW.lab_id;
  SELECT order_number INTO v_ordno FROM public.work_orders WHERE id = NEW.work_order_id;
  IF v_lab IS NULL THEN
    SELECT lab_id INTO v_lab FROM public.work_orders WHERE id = NEW.work_order_id;
  END IF;

  PERFORM public.log_activity(v_action, 'cancel_request', NEW.id, v_ordno,
    jsonb_build_object('status', NEW.status, 'reason', NEW.reason_code), v_lab, v_actor);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_cancel_request ON public.order_cancellation_requests;
CREATE TRIGGER trg_log_cancel_request
  AFTER INSERT OR UPDATE ON public.order_cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_cancel_request();

-- ── 8. Sipariş iptali (work_orders → 'iptal') ─────────────────────────────
-- Doğrudan iptal (client_cancel_order), talep onayı (approve_order_cancellation)
-- ve admin iptalleri — hepsi tek yerden loglanır.
CREATE OR REPLACE FUNCTION public.log_order_cancelled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_activity('Siparişi iptal etti', 'work_order', NEW.id, NEW.order_number,
    jsonb_build_object('from', OLD.status), NEW.lab_id, auth.uid());
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_order_cancelled ON public.work_orders;
CREATE TRIGGER trg_log_order_cancelled
  AFTER UPDATE OF status ON public.work_orders
  FOR EACH ROW
  WHEN (NEW.status = 'iptal' AND OLD.status IS DISTINCT FROM 'iptal')
  EXECUTE FUNCTION public.log_order_cancelled();

-- ── 9. Mesajlar (order_messages) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_order_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lab   uuid;
  v_ordno text;
BEGIN
  SELECT lab_id, order_number INTO v_lab, v_ordno
    FROM public.work_orders WHERE id = NEW.work_order_id;

  PERFORM public.log_activity(
    CASE WHEN NEW.attachment_url IS NOT NULL THEN 'Mesaj + dosya gönderdi' ELSE 'Mesaj gönderdi' END,
    'message', NEW.work_order_id, v_ordno,
    jsonb_build_object('has_attachment', NEW.attachment_url IS NOT NULL),
    COALESCE(NEW.lab_id, v_lab), NEW.sender_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_order_message ON public.order_messages;
CREATE TRIGGER trg_log_order_message
  AFTER INSERT ON public.order_messages
  FOR EACH ROW EXECUTE FUNCTION public.log_order_message();

-- ── 10. Dosya/foto yüklemeleri (work_order_photos) ────────────────────────
CREATE OR REPLACE FUNCTION public.log_order_photo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lab   uuid;
  v_ordno text;
BEGIN
  SELECT lab_id, order_number INTO v_lab, v_ordno
    FROM public.work_orders WHERE id = NEW.work_order_id;

  PERFORM public.log_activity('Dosya yükledi', 'photo', NEW.work_order_id, v_ordno,
    jsonb_build_object('caption', NEW.caption),
    COALESCE(NEW.lab_id, v_lab), NEW.uploaded_by);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_order_photo ON public.work_order_photos;
CREATE TRIGGER trg_log_order_photo
  AFTER INSERT ON public.work_order_photos
  FOR EACH ROW EXECUTE FUNCTION public.log_order_photo();

-- ── 11. Klinik/hekim doğrudan sipariş düzenleme (client_update_order) ──────
-- Mevcut davranış birebir korunur; yalnız sonuna log eklenir.
CREATE OR REPLACE FUNCTION public.client_update_order(p_order_id uuid, p_fields jsonb, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.work_orders;
BEGIN
  IF NOT public._client_owns_order(p_order_id) THEN
    RAISE EXCEPTION 'Bu siparişi düzenleme yetkiniz yok.' USING errcode = '42501';
  END IF;
  IF public._order_planning_started(p_order_id) THEN
    RAISE EXCEPTION 'Planlaması başlamış sipariş doğrudan düzenlenemez; değişiklik talebi gerekir.' USING errcode = 'P0001';
  END IF;
  -- Kalem yazımı tek yerde (_apply_order_edit) — currency dahil aynı davranış
  v_row := public._apply_order_edit(p_order_id, p_fields, p_items);
  PERFORM public.log_activity('Siparişi düzenledi', 'work_order', v_row.id, v_row.order_number,
    jsonb_build_object('fields', p_fields, 'items_changed', p_items IS NOT NULL),
    v_row.lab_id, auth.uid());
  RETURN v_row;
END;
$function$;

NOTIFY pgrst, 'reload schema';
