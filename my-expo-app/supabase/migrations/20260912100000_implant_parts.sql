-- 20260912100000_implant_parts.sql
--
-- İMPLANT PARÇALARI (scan body, dijital analog, Ti-base …)
--
-- Sorun: tarama/tasarım için gereken parçaları lab kliniğe bildiriyor, klinik implant
-- firmasından sipariş ediyor. "Ne almıştık, modeli/kodu neydi" bilgisi yalnız sohbet
-- mesajlarında kalıyor; geçici iş → 3 ay sonra daimi iş geldiğinde mesajlar aranıyor.
--
-- Çözüm: sipariş bazlı kalıcı parça kaydı + talep akışı
--   lab talep eder → klinik "sipariş verdim" → lab "teslim aldım" → (ops.) lab "iade ettim"
-- Kayıtlar sipariş detayında durur; devam siparişi (continues_order_id) asıl işin
-- parçalarını gösterip "aynısını talep et" ile kopyalar.
--
-- Tasarım kararları:
--   • Tabloya DOĞRUDAN yazma yok. Tüm yazmalar SECURITY DEFINER RPC'den geçer; rol
--     `_implant_parts_actor()` ile belirlenir ('lab' | 'clinic' | NULL).
--   • Her önemli adım sipariş sohbetine düz metin mesaj bırakır (eski native sürümler
--     de okuyabilsin); yeni istemci `order_messages.meta` ile kart çizer.
--   • Bildirim: talep → hekim + klinik (mail dahil, _notify_channels);
--     diğer adımlar yalnız uygulama içi (_notify_inapp). Kategori 'implant_parts'.
--   • Teknisyenin sohbet mesajı zaten yönetici onayına düşüyor (set_message_approval_status).
--     Bu kuralı delmemek için teknisyen talebinde kliniğe BİLDİRİM GÖNDERİLMEZ; lab
--     yöneticileri uygulama içi bilgilendirilir.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Şema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_implant_parts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id              uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  work_order_id       uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  -- NULL = vaka geneli (dişe bağlı değil)
  tooth_number        int  CHECK (tooth_number IS NULL OR tooth_number BETWEEN 11 AND 48),
  part_type           text NOT NULL CHECK (part_type IN
                        ('scan_body','digital_analog','ti_base','multi_unit','transfer','healing_cap','screw','other')),
  brand               text,
  model               text,
  ref_code            text,
  note                text,
  quantity            int  NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  status              text NOT NULL DEFAULT 'talep_edildi' CHECK (status IN
                        ('talep_edildi','siparis_verildi','teslim_alindi','iade_edildi','iptal')),
  return_required     boolean NOT NULL DEFAULT false,
  requested_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at        timestamptz,
  ordered_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ordered_at          timestamptz,
  received_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_at         timestamptz,
  returned_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  returned_at         timestamptz,
  cancelled_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at        timestamptz,
  copied_from_part_id uuid REFERENCES public.order_implant_parts(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_implant_parts_order  ON public.order_implant_parts (work_order_id);
CREATE INDEX IF NOT EXISTS idx_implant_parts_status ON public.order_implant_parts (lab_id, status);

DROP TRIGGER IF EXISTS touch_implant_parts_updated_at ON public.order_implant_parts;
CREATE TRIGGER touch_implant_parts_updated_at
  BEFORE UPDATE ON public.order_implant_parts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.order_implant_part_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  part_id      uuid NOT NULL REFERENCES public.order_implant_parts(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_implant_part_photos_part ON public.order_implant_part_photos (part_id);

-- Sohbet kartının hangi parçaları göstereceğini bilmesi için (istemci yalnız okur).
ALTER TABLE public.order_messages ADD COLUMN IF NOT EXISTS meta jsonb;

-- message_type CHECK'i yalnız 'user'/'system' kabul ediyordu → parça mesajları eklendi.
ALTER TABLE public.order_messages DROP CONSTRAINT IF EXISTS order_messages_message_type_check;
ALTER TABLE public.order_messages ADD CONSTRAINT order_messages_message_type_check
  CHECK (message_type = ANY (ARRAY['user','system','parts_request','parts_status']));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Rol çözümleyici + alıcı yardımcıları
-- ─────────────────────────────────────────────────────────────────────────────
-- 'lab'    → siparişin lab'ının kullanıcısı (admin dahil)
-- 'clinic' → siparişin hekimi ya da kliniğinin yöneticisi/sekreteri
-- NULL     → erişim yok
CREATE OR REPLACE FUNCTION public._implant_parts_actor(p_order uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.is_lab_user() AND EXISTS (
      SELECT 1 FROM work_orders wo WHERE wo.id = p_order AND wo.lab_id = public.get_my_lab_id()
    ) THEN 'lab'
    WHEN EXISTS (SELECT 1 FROM work_orders wo WHERE wo.id = p_order AND wo.doctor_id = auth.uid())
      THEN 'clinic'
    WHEN public.is_my_doctor_order(p_order) THEN 'clinic'
    WHEN EXISTS (
      SELECT 1 FROM profiles pr
       WHERE pr.id = auth.uid()
         AND pr.user_type IN ('clinic_admin','clinic_secretary')
         AND public._resolve_wo_clinic_id(p_order) IS NOT NULL
         AND (pr.clinic_id = public._resolve_wo_clinic_id(p_order)
              OR public._resolve_wo_clinic_id(p_order) IN (SELECT public.my_clinic_ids()))
    ) THEN 'clinic'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public._implant_parts_actor IS
  'İmplant parçası akışında çağıranın rolü: lab | clinic | NULL. RLS ve RPC kapısı.';

-- Siparişin hekim PROFİLLERİ. work_orders.doctor_id polimorfik (profiles.id VEYA
-- doctors.id) olduğu için iki yol da denenir — doctor_owns_order_doctor ile aynı kural.
CREATE OR REPLACE FUNCTION public._wo_doctor_profile_ids(p_order uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id FROM work_orders wo JOIN profiles p ON p.id = wo.doctor_id
   WHERE wo.id = p_order AND COALESCE(p.is_active, true)
  UNION
  SELECT p.id FROM work_orders wo
    JOIN doctors d ON d.id = wo.doctor_id
    JOIN profiles p ON p.user_type = 'doctor'
                   AND lower(btrim(p.full_name)) = lower(btrim(d.full_name))
                   AND (p.clinic_id IS NULL OR d.clinic_id IS NULL OR d.clinic_id = p.clinic_id)
   WHERE wo.id = p_order AND COALESCE(p.is_active, true);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS — okuma herkese (erişimi olana), yazma yalnız RPC
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_implant_parts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_implant_part_photos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS implant_parts_select ON public.order_implant_parts;
CREATE POLICY implant_parts_select ON public.order_implant_parts
  FOR SELECT USING (public._implant_parts_actor(work_order_id) IS NOT NULL);

DROP POLICY IF EXISTS implant_part_photos_select ON public.order_implant_part_photos;
CREATE POLICY implant_part_photos_select ON public.order_implant_part_photos
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.order_implant_parts p
     WHERE p.id = part_id AND public._implant_parts_actor(p.work_order_id) IS NOT NULL));

GRANT SELECT ON public.order_implant_parts, public.order_implant_part_photos TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Depo (storage) — orders/<order>/parts/<part>/<dosya>
--    Mevcut wop_* kuralları can_access_work_order'a bakıyor; o kural klinik
--    sekreterini ve doctors üzerinden eşleşen hekimi KAPSAMIYOR → parça yoluna
--    kendi kuralımızı koyuyoruz.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS wop_insert_implant_parts ON storage.objects;
CREATE POLICY wop_insert_implant_parts ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'work-order-photos'
    AND split_part(name, '/', 1) = 'orders'
    AND split_part(name, '/', 3) = 'parts'
    AND public._implant_parts_actor(public.try_uuid(split_part(name, '/', 2))) IS NOT NULL);

DROP POLICY IF EXISTS wop_select_implant_parts ON storage.objects;
CREATE POLICY wop_select_implant_parts ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'work-order-photos'
    AND split_part(name, '/', 1) = 'orders'
    AND split_part(name, '/', 3) = 'parts'
    AND public._implant_parts_actor(public.try_uuid(split_part(name, '/', 2))) IS NOT NULL);

DROP POLICY IF EXISTS wop_delete_implant_parts ON storage.objects;
CREATE POLICY wop_delete_implant_parts ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'work-order-photos'
    AND split_part(name, '/', 1) = 'orders'
    AND split_part(name, '/', 3) = 'parts'
    AND (owner = auth.uid()
         OR public._implant_parts_actor(public.try_uuid(split_part(name, '/', 2))) = 'lab'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Mesaj + bildirim üretici (istemciden çağrılamaz)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._implant_part_label(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'scan_body'      THEN 'Scan body'
    WHEN 'digital_analog' THEN 'Dijital analog'
    WHEN 'ti_base'        THEN 'Ti-base'
    WHEN 'multi_unit'     THEN 'Multi-unit abutment'
    WHEN 'transfer'       THEN 'Transfer'
    WHEN 'healing_cap'    THEN 'İyileşme başlığı'
    WHEN 'screw'          THEN 'Protez vidası'
    ELSE 'Diğer' END;
$$;

CREATE OR REPLACE FUNCTION public._implant_parts_announce(
  p_order uuid, p_part_ids uuid[], p_event text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_wo        record;
  v_lines     text;
  v_prefix    text;
  v_msg_type  text;
  v_title     text;
  v_body      text;
  v_is_tech   boolean;
  v_clinic_id uuid;
  v_rec       record;
  v_url       text;
BEGIN
  SELECT lab_id, order_number, patient_name INTO v_wo FROM work_orders WHERE id = p_order;

  SELECT string_agg(
           COALESCE(p.tooth_number::text || ': ', 'Genel: ')
           || public._implant_part_label(p.part_type)
           || COALESCE(' · ' || NULLIF(p.brand, ''), '')
           || COALESCE(' · ' || NULLIF(p.model, ''), '')
           || COALESCE(' · REF ' || NULLIF(p.ref_code, ''), '')
           || ' ×' || p.quantity,
           '; ' ORDER BY p.tooth_number NULLS LAST, p.created_at)
    INTO v_lines
    FROM order_implant_parts p
   WHERE p.id = ANY (p_part_ids);

  IF v_lines IS NULL THEN RETURN; END IF;

  v_prefix := CASE p_event
    WHEN 'request'         THEN 'Parça talebi'
    WHEN 'client_supplied' THEN 'Parça bildirimi (klinik temin ediyor)'
    WHEN 'ordered'         THEN 'Parça sipariş edildi'
    WHEN 'received'        THEN 'Parça teslim alındı'
    WHEN 'returned'        THEN 'Parça kliniğe iade edildi'
    WHEN 'cancelled'       THEN 'Parça talebi iptal edildi'
    ELSE 'Parça güncellendi' END;
  v_msg_type := CASE WHEN p_event IN ('request','client_supplied') THEN 'parts_request' ELSE 'parts_status' END;
  v_title := v_prefix || ' · #' || COALESCE(v_wo.order_number, '?');
  v_body  := COALESCE(NULLIF(btrim(v_wo.patient_name), ''), 'Hasta') || ' · ' || left(v_lines, 300);
  v_url   := '/order/' || p_order::text;   -- panel-agnostik (yönlendirme user_type'a göre çözer)

  -- Sohbet mesajı — düz metin, emoji yok; meta yeni istemcide kart çizimi için.
  INSERT INTO order_messages (work_order_id, sender_id, content, lab_id, message_type, meta)
  VALUES (p_order, v_uid, v_prefix || ' — ' || v_lines, v_wo.lab_id, v_msg_type,
          jsonb_build_object('event', p_event, 'part_ids', to_jsonb(p_part_ids)));

  -- Bildirimler — hata akışı bozmasın
  BEGIN
    SELECT (user_type = 'lab' AND role = 'technician') INTO v_is_tech FROM profiles WHERE id = v_uid;
    v_clinic_id := public._resolve_wo_clinic_id(p_order);

    IF p_event IN ('request','received','returned','cancelled') THEN
      -- Klinik tarafı. Talep teknisyenden geliyorsa mesaj onay bekliyor → bildirim yok.
      IF NOT (p_event = 'request' AND COALESCE(v_is_tech, false)) THEN
        FOR v_rec IN SELECT public._wo_doctor_profile_ids(p_order) AS id LOOP
          IF v_rec.id IS DISTINCT FROM v_uid THEN
            IF p_event = 'request' THEN
              PERFORM public._notify_channels(v_rec.id, 'implant_parts', v_title, v_body,
                'work_order', p_order, v_url, jsonb_build_object('event', p_event));
            ELSE
              PERFORM public._notify_inapp(v_rec.id, 'implant_parts', v_title, v_body,
                'work_order', p_order, v_url, jsonb_build_object('event', p_event));
            END IF;
          END IF;
        END LOOP;

        IF v_clinic_id IS NOT NULL THEN
          FOR v_rec IN SELECT pr.id FROM profiles pr
                        WHERE pr.clinic_id = v_clinic_id
                          AND pr.user_type IN ('clinic_admin','clinic_secretary')
                          AND COALESCE(pr.is_active, true)
                          AND pr.id IS DISTINCT FROM v_uid
                          AND pr.id NOT IN (SELECT public._wo_doctor_profile_ids(p_order)) LOOP
            IF p_event = 'request' THEN
              PERFORM public._notify_channels(v_rec.id, 'implant_parts', v_title, v_body,
                'work_order', p_order, v_url, jsonb_build_object('event', p_event));
            ELSE
              PERFORM public._notify_inapp(v_rec.id, 'implant_parts', v_title, v_body,
                'work_order', p_order, v_url, jsonb_build_object('event', p_event));
            END IF;
          END LOOP;
        END IF;
      END IF;
    END IF;

    IF p_event IN ('client_supplied','ordered') OR (p_event = 'request' AND COALESCE(v_is_tech, false)) THEN
      -- Lab tarafı: talebi açan + lab yöneticileri (uygulama içi)
      FOR v_rec IN
        SELECT DISTINCT pr.id FROM profiles pr
         WHERE pr.lab_id = v_wo.lab_id
           AND COALESCE(pr.is_active, true)
           AND pr.id IS DISTINCT FROM v_uid
           AND (pr.user_type = 'admin'
                OR (pr.user_type = 'lab' AND pr.role = 'manager')
                OR pr.id IN (SELECT p.requested_by FROM order_implant_parts p WHERE p.id = ANY (p_part_ids)))
      LOOP
        PERFORM public._notify_inapp(v_rec.id, 'implant_parts', v_title, v_body,
          'work_order', p_order, v_url, jsonb_build_object('event', p_event));
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_implant_parts_announce notify failed (order %, event %): %', p_order, p_event, SQLERRM;
  END;
END; $$;

REVOKE EXECUTE ON FUNCTION public._implant_parts_announce(uuid, uuid[], text) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) RPC'ler
-- ─────────────────────────────────────────────────────────────────────────────
-- Parça ekle. Lab ekliyorsa 'talep_edildi', klinik/hekim ekliyorsa 'siparis_verildi'
-- (klinik zaten temin ediyor demektir).
CREATE OR REPLACE FUNCTION public.request_implant_parts(p_order uuid, p_parts jsonb)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_actor  text := public._implant_parts_actor(p_order);
  v_uid    uuid := auth.uid();
  v_lab    uuid;
  v_item   jsonb;
  v_id     uuid;
  v_ids    uuid[] := '{}';
  v_status text;
BEGIN
  IF v_uid IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Bu sipariş için parça ekleme yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_parts) <> 'array' OR jsonb_array_length(p_parts) = 0 THEN
    RAISE EXCEPTION 'En az bir parça gerekli.';
  END IF;
  IF jsonb_array_length(p_parts) > 30 THEN
    RAISE EXCEPTION 'Tek seferde en fazla 30 parça eklenebilir.';
  END IF;

  SELECT lab_id INTO v_lab FROM work_orders WHERE id = p_order;
  v_status := CASE WHEN v_actor = 'lab' THEN 'talep_edildi' ELSE 'siparis_verildi' END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_parts) LOOP
    INSERT INTO order_implant_parts (
      lab_id, work_order_id, tooth_number, part_type, brand, model, ref_code, note,
      quantity, status, return_required,
      requested_by, requested_at, ordered_by, ordered_at, copied_from_part_id, created_by)
    VALUES (
      v_lab, p_order,
      NULLIF(v_item->>'tooth_number', '')::int,
      COALESCE(NULLIF(v_item->>'part_type', ''), 'other'),
      NULLIF(btrim(COALESCE(v_item->>'brand', '')), ''),
      NULLIF(btrim(COALESCE(v_item->>'model', '')), ''),
      NULLIF(btrim(COALESCE(v_item->>'ref_code', '')), ''),
      NULLIF(btrim(COALESCE(v_item->>'note', '')), ''),
      LEAST(GREATEST(COALESCE(NULLIF(v_item->>'quantity', '')::int, 1), 1), 99),
      v_status,
      COALESCE((v_item->>'return_required')::boolean, false),
      v_uid, now(),
      CASE WHEN v_status = 'siparis_verildi' THEN v_uid END,
      CASE WHEN v_status = 'siparis_verildi' THEN now() END,
      (SELECT c.id FROM order_implant_parts c
        WHERE c.id = NULLIF(v_item->>'copied_from_part_id', '')::uuid
          AND public._implant_parts_actor(c.work_order_id) IS NOT NULL),
      v_uid)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;

  PERFORM public._implant_parts_announce(
    p_order, v_ids, CASE WHEN v_actor = 'lab' THEN 'request' ELSE 'client_supplied' END);

  RETURN QUERY SELECT unnest(v_ids);
END; $$;

-- Durum ilerlet. Dizi alır → "tümünü teslim aldım" tek mesaj/bildirim üretir.
CREATE OR REPLACE FUNCTION public.set_implant_parts_status(p_parts uuid[], p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_order uuid;
  v_actor text;
  v_event text;
  v_done  uuid[] := '{}';
  v_p     record;
BEGIN
  IF v_uid IS NULL OR p_parts IS NULL OR array_length(p_parts, 1) IS NULL THEN
    RAISE EXCEPTION 'Parça seçilmedi.';
  END IF;

  SELECT DISTINCT work_order_id INTO v_order FROM order_implant_parts WHERE id = ANY (p_parts);
  IF v_order IS NULL THEN RAISE EXCEPTION 'Parça bulunamadı.'; END IF;

  v_actor := public._implant_parts_actor(v_order);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Bu sipariş için yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('siparis_verildi','teslim_alindi','iade_edildi','iptal') THEN
    RAISE EXCEPTION 'Geçersiz durum: %', p_status;
  END IF;
  IF p_status <> 'siparis_verildi' AND v_actor <> 'lab' THEN
    RAISE EXCEPTION 'Bu adımı yalnız laboratuvar işaretleyebilir.' USING ERRCODE = '42501';
  END IF;

  FOR v_p IN SELECT * FROM order_implant_parts WHERE id = ANY (p_parts) FOR UPDATE LOOP
    CONTINUE WHEN v_p.status = p_status;

    IF p_status = 'siparis_verildi' THEN
      CONTINUE WHEN v_p.status <> 'talep_edildi';
      UPDATE order_implant_parts SET status = p_status, ordered_by = v_uid, ordered_at = now()
       WHERE id = v_p.id;
    ELSIF p_status = 'teslim_alindi' THEN
      CONTINUE WHEN v_p.status NOT IN ('talep_edildi','siparis_verildi');
      UPDATE order_implant_parts SET status = p_status, received_by = v_uid, received_at = now()
       WHERE id = v_p.id;
    ELSIF p_status = 'iade_edildi' THEN
      CONTINUE WHEN v_p.status <> 'teslim_alindi' OR NOT v_p.return_required;
      UPDATE order_implant_parts SET status = p_status, returned_by = v_uid, returned_at = now()
       WHERE id = v_p.id;
    ELSE   -- iptal
      CONTINUE WHEN v_p.status NOT IN ('talep_edildi','siparis_verildi');
      UPDATE order_implant_parts SET status = p_status, cancelled_by = v_uid, cancelled_at = now()
       WHERE id = v_p.id;
    END IF;

    v_done := v_done || v_p.id;
  END LOOP;

  IF array_length(v_done, 1) IS NULL THEN
    RAISE EXCEPTION 'Bu adım bu parçalar için uygun değil.';
  END IF;

  v_event := CASE p_status
    WHEN 'siparis_verildi' THEN 'ordered'
    WHEN 'teslim_alindi'   THEN 'received'
    WHEN 'iade_edildi'     THEN 'returned'
    ELSE 'cancelled' END;
  PERFORM public._implant_parts_announce(v_order, v_done, v_event);
END; $$;

-- Yanlış tıklamayı bir adım geri al (yalnız lab, mesaj/bildirim üretmez).
CREATE OR REPLACE FUNCTION public.revert_implant_part_status(p_part uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_p record;
BEGIN
  SELECT * INTO v_p FROM order_implant_parts WHERE id = p_part FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parça bulunamadı.'; END IF;
  IF public._implant_parts_actor(v_p.work_order_id) <> 'lab' THEN
    RAISE EXCEPTION 'Geri alma yalnız laboratuvarda.' USING ERRCODE = '42501';
  END IF;

  IF v_p.status = 'iade_edildi' THEN
    UPDATE order_implant_parts SET status = 'teslim_alindi', returned_by = NULL, returned_at = NULL WHERE id = p_part;
  ELSIF v_p.status = 'teslim_alindi' THEN
    UPDATE order_implant_parts
       SET status = CASE WHEN v_p.ordered_at IS NOT NULL THEN 'siparis_verildi' ELSE 'talep_edildi' END,
           received_by = NULL, received_at = NULL
     WHERE id = p_part;
  ELSIF v_p.status IN ('siparis_verildi','iptal') THEN
    UPDATE order_implant_parts
       SET status = CASE WHEN v_p.status = 'iptal' AND v_p.ordered_at IS NOT NULL THEN 'siparis_verildi' ELSE 'talep_edildi' END,
           ordered_by   = CASE WHEN v_p.status = 'siparis_verildi' THEN NULL ELSE v_p.ordered_by END,
           ordered_at   = CASE WHEN v_p.status = 'siparis_verildi' THEN NULL ELSE v_p.ordered_at END,
           cancelled_by = NULL, cancelled_at = NULL
     WHERE id = p_part;
  ELSE
    RAISE EXCEPTION 'Geri alınacak adım yok.';
  END IF;
END; $$;

-- Bilgi düzenleme. Lab her zaman; klinik yalnız talep/sipariş aşamasında.
CREATE OR REPLACE FUNCTION public.update_implant_part(p_part uuid, p_fields jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_p record; v_actor text;
BEGIN
  SELECT * INTO v_p FROM order_implant_parts WHERE id = p_part FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parça bulunamadı.'; END IF;
  v_actor := public._implant_parts_actor(v_p.work_order_id);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Yetkiniz yok.' USING ERRCODE = '42501'; END IF;
  IF v_actor = 'clinic' AND v_p.status NOT IN ('talep_edildi','siparis_verildi') THEN
    RAISE EXCEPTION 'Bu parça artık düzenlenemez.' USING ERRCODE = '42501';
  END IF;

  UPDATE order_implant_parts SET
    tooth_number    = CASE WHEN p_fields ? 'tooth_number'    THEN NULLIF(p_fields->>'tooth_number','')::int ELSE tooth_number END,
    part_type       = CASE WHEN p_fields ? 'part_type'       THEN COALESCE(NULLIF(p_fields->>'part_type',''), part_type) ELSE part_type END,
    brand           = CASE WHEN p_fields ? 'brand'           THEN NULLIF(btrim(COALESCE(p_fields->>'brand','')),'') ELSE brand END,
    model           = CASE WHEN p_fields ? 'model'           THEN NULLIF(btrim(COALESCE(p_fields->>'model','')),'') ELSE model END,
    ref_code        = CASE WHEN p_fields ? 'ref_code'        THEN NULLIF(btrim(COALESCE(p_fields->>'ref_code','')),'') ELSE ref_code END,
    note            = CASE WHEN p_fields ? 'note'            THEN NULLIF(btrim(COALESCE(p_fields->>'note','')),'') ELSE note END,
    quantity        = CASE WHEN p_fields ? 'quantity'        THEN LEAST(GREATEST(COALESCE(NULLIF(p_fields->>'quantity','')::int, quantity), 1), 99) ELSE quantity END,
    return_required = CASE WHEN p_fields ? 'return_required' THEN COALESCE((p_fields->>'return_required')::boolean, return_required) ELSE return_required END
  WHERE id = p_part;
END; $$;

-- Silme yalnız lab ve yalnız talep aşamasında; sonrası 'iptal'.
-- Döndürdüğü yollarla istemci depodaki dosyaları temizler.
CREATE OR REPLACE FUNCTION public.delete_implant_part(p_part uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_p record; v_paths text[];
BEGIN
  SELECT * INTO v_p FROM order_implant_parts WHERE id = p_part FOR UPDATE;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  IF public._implant_parts_actor(v_p.work_order_id) <> 'lab' THEN
    RAISE EXCEPTION 'Silme yalnız laboratuvarda.' USING ERRCODE = '42501';
  END IF;
  IF v_p.status <> 'talep_edildi' THEN
    RAISE EXCEPTION 'Yalnız talep aşamasındaki parça silinebilir; sonrasında iptal edin.';
  END IF;

  SELECT COALESCE(array_agg(storage_path), '{}') INTO v_paths
    FROM order_implant_part_photos WHERE part_id = p_part;
  DELETE FROM order_implant_parts WHERE id = p_part;
  RETURN v_paths;
END; $$;

CREATE OR REPLACE FUNCTION public.add_implant_part_photo(p_part uuid, p_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_p record; v_id uuid; v_prefix text;
BEGIN
  SELECT * INTO v_p FROM order_implant_parts WHERE id = p_part;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parça bulunamadı.'; END IF;
  IF public._implant_parts_actor(v_p.work_order_id) IS NULL THEN
    RAISE EXCEPTION 'Yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  v_prefix := 'orders/' || v_p.work_order_id::text || '/parts/' || p_part::text || '/';
  IF p_path IS NULL OR position(v_prefix IN p_path) <> 1 THEN
    RAISE EXCEPTION 'Geçersiz dosya yolu.';
  END IF;

  INSERT INTO order_implant_part_photos (lab_id, part_id, storage_path, uploaded_by)
  VALUES (v_p.lab_id, p_part, p_path, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_implant_part_photo(p_photo uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ph record; v_actor text; v_path text;
BEGIN
  SELECT ph.*, p.work_order_id INTO v_ph
    FROM order_implant_part_photos ph JOIN order_implant_parts p ON p.id = ph.part_id
   WHERE ph.id = p_photo;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_actor := public._implant_parts_actor(v_ph.work_order_id);
  IF v_actor IS NULL OR (v_actor <> 'lab' AND v_ph.uploaded_by IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  v_path := v_ph.storage_path;
  DELETE FROM order_implant_part_photos WHERE id = p_photo;
  RETURN v_path;
END; $$;

COMMENT ON TABLE public.order_implant_parts IS
  'İmplant parçaları (scan body, dijital analog …): lab talep eder, klinik sipariş verir, lab teslim alır/iade eder. Yazma yalnız RPC ile.';
