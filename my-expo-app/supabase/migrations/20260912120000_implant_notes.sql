-- 20260912120000_implant_notes.sql
--
-- İMPLANT PARÇA NOTLARI — sadeleştirme.
--
-- 20260912100000 ile talep akışlı (talep → sipariş → teslim → iade) bir parça
-- kaydı gelmişti. Kullanıcı kararı: bu fazla ağır. İhtiyaç "hangi parçayı
-- almıştık, modeli/kodu neydi" bilgisinin sipariş detayında NOT olarak durması ve
-- iki tarafın da görmesi. Durum takibi, talep butonları ve mail YOK.
--
-- Bu migration yalnız EKLER (parts tabloları bozulmadan duruyor, satırı yok):
--   order_implant_notes         — serbest metin not + kim/ne zaman
--   order_implant_note_photos   — nota iliştirilen görseller (ambalaj, ekran görüntüsü …)
--
-- Depo yolu bilinçli olarak `orders/<sipariş>/parts/<not>/…` bırakıldı → parça
-- akışı için yazılan storage politikaları (wop_*_implant_parts) aynen geçerli,
-- yeni politika gerekmiyor.
--
-- Bildirim: notu yazan taraf DIŞINDAKİ tarafa yalnız uygulama içi (_notify_inapp),
-- kategori 'implant_parts'. Mail/WhatsApp/sohbet mesajı yok.

CREATE TABLE IF NOT EXISTS public.order_implant_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  body          text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 4000),
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Yazarın adı YAZMA anında kopyalanır: klinik kullanıcısı lab profillerini
  -- (ve tersi) RLS yüzünden okuyamıyor → embed ile isim boş geliyordu.
  created_by_name text,
  created_by_side text CHECK (created_by_side IN ('lab','clinic')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_implant_notes_order ON public.order_implant_notes (work_order_id, created_at);

DROP TRIGGER IF EXISTS touch_implant_notes_updated_at ON public.order_implant_notes;
CREATE TRIGGER touch_implant_notes_updated_at
  BEFORE UPDATE ON public.order_implant_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.order_implant_note_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  note_id      uuid NOT NULL REFERENCES public.order_implant_notes(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_implant_note_photos_note ON public.order_implant_note_photos (note_id);

-- ── RLS: okuma siparişe erişimi olana; yazma yalnız RPC ──────────────────────
ALTER TABLE public.order_implant_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_implant_note_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS implant_notes_select ON public.order_implant_notes;
CREATE POLICY implant_notes_select ON public.order_implant_notes
  FOR SELECT USING (public._implant_parts_actor(work_order_id) IS NOT NULL);

DROP POLICY IF EXISTS implant_note_photos_select ON public.order_implant_note_photos;
CREATE POLICY implant_note_photos_select ON public.order_implant_note_photos
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.order_implant_notes n
     WHERE n.id = note_id AND public._implant_parts_actor(n.work_order_id) IS NOT NULL));

GRANT SELECT ON public.order_implant_notes, public.order_implant_note_photos TO authenticated;

-- ── Bildirim: karşı tarafa yalnız uygulama içi ──────────────────────────────
CREATE OR REPLACE FUNCTION public._implant_note_notify(p_note uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_n record; v_wo record; v_actor text; v_uid uuid := auth.uid();
  v_title text; v_body text; v_url text; v_clinic uuid; v_rec record;
BEGIN
  SELECT * INTO v_n FROM order_implant_notes WHERE id = p_note;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT lab_id, order_number, patient_name INTO v_wo FROM work_orders WHERE id = v_n.work_order_id;
  v_actor := public._implant_parts_actor(v_n.work_order_id);

  v_title := 'İmplant parça notu · #' || COALESCE(v_wo.order_number, '?');
  v_body  := COALESCE(NULLIF(btrim(v_wo.patient_name), ''), 'Hasta') || ' · ' || left(v_n.body, 240);
  v_url   := '/order/' || v_n.work_order_id::text;   -- panel-agnostik

  IF v_actor = 'lab' THEN
    -- Lab yazdı → hekim + klinik kullanıcıları
    FOR v_rec IN SELECT public._wo_doctor_profile_ids(v_n.work_order_id) AS id LOOP
      IF v_rec.id IS DISTINCT FROM v_uid THEN
        PERFORM public._notify_inapp(v_rec.id, 'implant_parts', v_title, v_body,
          'work_order', v_n.work_order_id, v_url, '{}'::jsonb);
      END IF;
    END LOOP;
    v_clinic := public._resolve_wo_clinic_id(v_n.work_order_id);
    IF v_clinic IS NOT NULL THEN
      FOR v_rec IN SELECT pr.id FROM profiles pr
                    WHERE pr.clinic_id = v_clinic
                      AND pr.user_type IN ('clinic_admin','clinic_secretary')
                      AND COALESCE(pr.is_active, true)
                      AND pr.id IS DISTINCT FROM v_uid
                      AND pr.id NOT IN (SELECT public._wo_doctor_profile_ids(v_n.work_order_id)) LOOP
        PERFORM public._notify_inapp(v_rec.id, 'implant_parts', v_title, v_body,
          'work_order', v_n.work_order_id, v_url, '{}'::jsonb);
      END LOOP;
    END IF;
  ELSE
    -- Klinik/hekim yazdı → lab yöneticileri
    FOR v_rec IN SELECT pr.id FROM profiles pr
                  WHERE pr.lab_id = v_wo.lab_id
                    AND COALESCE(pr.is_active, true)
                    AND pr.id IS DISTINCT FROM v_uid
                    AND (pr.user_type = 'admin' OR (pr.user_type = 'lab' AND pr.role = 'manager')) LOOP
      PERFORM public._notify_inapp(v_rec.id, 'implant_parts', v_title, v_body,
        'work_order', v_n.work_order_id, v_url, '{}'::jsonb);
    END LOOP;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_implant_note_notify failed (%): %', p_note, SQLERRM;
END; $$;

REVOKE EXECUTE ON FUNCTION public._implant_note_notify(uuid) FROM PUBLIC, anon, authenticated;

-- ── RPC'ler ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_implant_note(p_order uuid, p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_lab uuid;
BEGIN
  IF auth.uid() IS NULL OR public._implant_parts_actor(p_order) IS NULL THEN
    RAISE EXCEPTION 'Bu sipariş için yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'Not boş olamaz.';
  END IF;

  SELECT lab_id INTO v_lab FROM work_orders WHERE id = p_order;
  INSERT INTO order_implant_notes (lab_id, work_order_id, body, created_by, created_by_name, created_by_side)
  VALUES (v_lab, p_order, left(btrim(p_body), 4000), auth.uid(),
          (SELECT full_name FROM profiles WHERE id = auth.uid()),
          public._implant_parts_actor(p_order))
  RETURNING id INTO v_id;

  PERFORM public._implant_note_notify(v_id);
  RETURN v_id;
END; $$;

-- Düzenleme/silme yalnız NOTU YAZANA ait (lab yöneticisi de kendi notunu siler).
CREATE OR REPLACE FUNCTION public.update_implant_note(p_note uuid, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n record;
BEGIN
  SELECT * INTO v_n FROM order_implant_notes WHERE id = p_note FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not bulunamadı.'; END IF;
  IF v_n.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Yalnız kendi notunuzu düzenleyebilirsiniz.' USING ERRCODE = '42501';
  END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN RAISE EXCEPTION 'Not boş olamaz.'; END IF;
  UPDATE order_implant_notes SET body = left(btrim(p_body), 4000) WHERE id = p_note;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_implant_note(p_note uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n record; v_paths text[];
BEGIN
  SELECT * INTO v_n FROM order_implant_notes WHERE id = p_note FOR UPDATE;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  IF v_n.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Yalnız kendi notunuzu silebilirsiniz.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(array_agg(storage_path), '{}') INTO v_paths
    FROM order_implant_note_photos WHERE note_id = p_note;
  DELETE FROM order_implant_notes WHERE id = p_note;
  RETURN v_paths;
END; $$;

CREATE OR REPLACE FUNCTION public.add_implant_note_photo(p_note uuid, p_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n record; v_id uuid; v_prefix text;
BEGIN
  SELECT * INTO v_n FROM order_implant_notes WHERE id = p_note;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not bulunamadı.'; END IF;
  IF public._implant_parts_actor(v_n.work_order_id) IS NULL THEN
    RAISE EXCEPTION 'Yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  -- storage politikaları `orders/<sipariş>/parts/…` yolunu tanıyor (bkz. başlık).
  v_prefix := 'orders/' || v_n.work_order_id::text || '/parts/' || p_note::text || '/';
  IF p_path IS NULL OR position(v_prefix IN p_path) <> 1 THEN
    RAISE EXCEPTION 'Geçersiz dosya yolu.';
  END IF;

  INSERT INTO order_implant_note_photos (lab_id, note_id, storage_path, uploaded_by)
  VALUES (v_n.lab_id, p_note, p_path, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_implant_note_photo(p_photo uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ph record; v_path text;
BEGIN
  SELECT ph.*, n.work_order_id, n.created_by AS note_owner
    INTO v_ph
    FROM order_implant_note_photos ph JOIN order_implant_notes n ON n.id = ph.note_id
   WHERE ph.id = p_photo;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_ph.uploaded_by IS DISTINCT FROM auth.uid() AND v_ph.note_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  v_path := v_ph.storage_path;
  DELETE FROM order_implant_note_photos WHERE id = p_photo;
  RETURN v_path;
END; $$;

COMMENT ON TABLE public.order_implant_notes IS
  'İmplant parça notları: hangi parça/model/kod alındı — serbest metin + görsel. İki taraf da görür, durum takibi yok.';
