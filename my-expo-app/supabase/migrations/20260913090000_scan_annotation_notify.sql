-- 20260913090000_scan_annotation_notify.sql
--
-- TARAMA NOTU BİLDİRİMİ (3D kalem — Faz 4)
--
-- Not eklenince KARŞI taraf haberdar olur: hekim çizdiyse lab, lab çizdiyse
-- hekim/klinik. Amaç "çizdim ama kimse görmedi" durumunu bitirmek.
--
-- Tasarım kararları:
--   • YALNIZ uygulama içi (_notify_inapp). Çizim yazışma temposunda gelir;
--     mail gürültü olur (bkz. lab/klinik bildirim gürültüsü kararları).
--     Kategori 'scan_annotation' — prefs'te tanımlı, mail varsayılan KAPALI.
--   • SUSTURMA (debounce): bir çizim 5-10 vuruştan oluşur. Aynı sipariş +
--     aynı taraf için son 10 dakikada bildirim gittiyse tekrar gönderilmez;
--     yoksa tek bir not bırakmak 10 bildirim üretirdi.
--   • Bildirim hatası ASLA yazmayı düşürmez (BEGIN/EXCEPTION) — çizim
--     kaydedilmişken kullanıcıya hata göstermek daha kötü.

CREATE OR REPLACE FUNCTION public._scan_annot_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_wo        record;
  v_clinic_id uuid;
  v_title     text;
  v_body      text;
  v_url       text;
  v_kind      text;
  v_recent    boolean;
  v_rec       record;
BEGIN
  -- Susturma: aynı siparişte aynı taraftan son 10 dk içinde başka not var mı?
  SELECT EXISTS (
    SELECT 1 FROM public.order_scan_annotations a
     WHERE a.work_order_id = NEW.work_order_id
       AND a.author_side   = NEW.author_side
       AND a.id <> NEW.id
       AND a.created_at > now() - interval '10 minutes'
  ) INTO v_recent;
  IF v_recent THEN
    RETURN NEW;
  END IF;

  SELECT wo.id, wo.order_number, wo.patient_name, wo.lab_id
    INTO v_wo
    FROM work_orders wo WHERE wo.id = NEW.work_order_id;
  IF v_wo.id IS NULL THEN RETURN NEW; END IF;

  v_kind := CASE NEW.kind
              WHEN 'note'  THEN 'metin notu'
              WHEN 'arrow' THEN 'ok işareti'
              ELSE 'çizim'
            END;
  v_title := 'Tarama notu · #' || COALESCE(v_wo.order_number, '?');
  v_body  := COALESCE(NULLIF(btrim(NEW.author_name), ''), 'Kullanıcı')
             || ' 3D taramaya ' || v_kind || ' ekledi'
             || CASE WHEN NEW.text IS NOT NULL THEN ': ' || left(NEW.text, 160) ELSE '' END;
  -- Panel-agnostik: yönlendirme user_type'a göre çözer
  v_url := '/order/' || NEW.work_order_id::text;

  BEGIN
    IF NEW.author_side = 'clinic' THEN
      -- Lab tarafı: yöneticiler/admin + o siparişte çalışan teknisyenler
      FOR v_rec IN
        SELECT DISTINCT pr.id
          FROM profiles pr
         WHERE pr.lab_id = v_wo.lab_id
           AND COALESCE(pr.is_active, true)
           AND pr.id IS DISTINCT FROM NEW.author_id
           AND (pr.user_type = 'admin'
                OR (pr.user_type = 'lab' AND pr.role = 'manager')
                -- order_stages.technician_id PROFİL id'sidir (bkz.
                -- is_technician_on_order); technicians tablosunda profil bağı yok.
                OR EXISTS (
                     SELECT 1 FROM order_stages os
                      WHERE os.work_order_id = NEW.work_order_id
                        AND os.technician_id = pr.id))
      LOOP
        PERFORM public._notify_inapp(v_rec.id, 'scan_annotation', v_title, v_body,
          'work_order', NEW.work_order_id, v_url,
          jsonb_build_object('annotation_id', NEW.id, 'kind', NEW.kind));
      END LOOP;
    ELSE
      -- Klinik tarafı: siparişin hekim(ler)i + klinik yönetici/sekreteri
      FOR v_rec IN SELECT public._wo_doctor_profile_ids(NEW.work_order_id) AS id LOOP
        IF v_rec.id IS DISTINCT FROM NEW.author_id THEN
          PERFORM public._notify_inapp(v_rec.id, 'scan_annotation', v_title, v_body,
            'work_order', NEW.work_order_id, v_url,
            jsonb_build_object('annotation_id', NEW.id, 'kind', NEW.kind));
        END IF;
      END LOOP;

      v_clinic_id := public._resolve_wo_clinic_id(NEW.work_order_id);
      IF v_clinic_id IS NOT NULL THEN
        FOR v_rec IN
          SELECT pr.id FROM profiles pr
           WHERE pr.clinic_id = v_clinic_id
             AND pr.user_type IN ('clinic_admin','clinic_secretary')
             AND COALESCE(pr.is_active, true)
             AND pr.id IS DISTINCT FROM NEW.author_id
             AND pr.id NOT IN (SELECT public._wo_doctor_profile_ids(NEW.work_order_id))
        LOOP
          PERFORM public._notify_inapp(v_rec.id, 'scan_annotation', v_title, v_body,
            'work_order', NEW.work_order_id, v_url,
            jsonb_build_object('annotation_id', NEW.id, 'kind', NEW.kind));
        END LOOP;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_scan_annot_notify failed (order %): %', NEW.work_order_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scan_annot_notify ON public.order_scan_annotations;
CREATE TRIGGER trg_scan_annot_notify
  AFTER INSERT ON public.order_scan_annotations
  FOR EACH ROW EXECUTE FUNCTION public._scan_annot_notify();

COMMENT ON FUNCTION public._scan_annot_notify IS
  '3D tarama notu eklenince karşı tarafa uygulama içi bildirim. 10 dk susturma: bir çizim onlarca vuruş üretebilir.';

-- Sipariş detayındaki rozet için: siparişin not sayısı (RLS''li tabloya
-- dokunmadan hızlı sayım; erişim kuralı fonksiyon içinde yine kontrol edilir).
CREATE OR REPLACE FUNCTION public.scan_annotation_count(p_order uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public._order_party_role(p_order) IS NULL THEN 0
    ELSE (SELECT count(*)::int FROM public.order_scan_annotations a
           WHERE a.work_order_id = p_order)
  END;
$$;

REVOKE ALL ON FUNCTION public.scan_annotation_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.scan_annotation_count(uuid) TO authenticated;
