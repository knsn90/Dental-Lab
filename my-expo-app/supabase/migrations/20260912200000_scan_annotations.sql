-- 20260912200000_scan_annotations.sql
--
-- TARAMA ÜZERİNE NOT / ÇİZİM (3D kalem)
--
-- Sorun: hekim "46'nın bukkalinde şuraya dikkat" derken tarif ediyor; lab yanlış
-- bölgeyi düzeltiyor. Ekran görüntüsü + mesaj yetmiyor: görüntüde hangi nokta
-- olduğu 3D'de belli olmuyor.
--
-- Çözüm: 3D yüzeye ÇAPALI işaretler. Dokunulan nokta ışınla mesh yüzeyine
-- düşürülür; nokta dizisi MESH'İN KENDİ LOCAL UZAYINDA saklanır (grup yeniden
-- ortalanıp ölçeklense bile işaret aynı dişin üstünde kalır). Viewer bunları
-- ayrı bir three.js grubu olarak çizer → STL/PLY dosyasına DOKUNULMAZ, tarama
-- bozulmaz; katman panelinden aç/kapa edilir.
--
-- Tasarım kararları:
--   • Çapa DOSYA ADI (file_name), id DEĞİL: ZIP modunda mesh id'leri oturum
--     başına üretiliyor ('zip-0', 'zip-1'…) ve arşiv yeniden açıldığında sıra
--     değişebilir. Ad sabit ve kullanıcıya görünen şey de o.
--   • İKİ TARAF DA yazabilir (kullanıcı kararı): hekim/klinik işaretler, lab
--     cevaben çizer. Her kayıt author_side ('lab' | 'clinic') ile etiketlenir.
--   • Yazmalar SECURITY DEFINER RPC'den geçer (implant parçalarındaki desen):
--     lab_id / author_* alanları sunucuda doldurulur, istemci uyduramaz.
--   • Erişim kuralı yeniden YAZILMADI: _order_party_role() tek satırda
--     _implant_parts_actor()'a devreder — sipariş tarafı çözümü tek kaynakta.
--   • Bildirim + sipariş detayı rozeti AYRI fazda (Faz 4); bu migration yalnız
--     şema + RPC.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Sipariş tarafı çözümleyici (tek kaynak: _implant_parts_actor)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._order_party_role(p_order uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public._implant_parts_actor(p_order);
$$;

COMMENT ON FUNCTION public._order_party_role IS
  'Çağıranın sipariş üzerindeki tarafı: lab | clinic | NULL. Mantık _implant_parts_actor içinde (tek kaynak); implant dışı akışlar (tarama notları vb.) bu adı kullanır.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Şema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_scan_annotations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  -- Çapalandığı mesh'in dosya adı. NULL = sahne geneli serbest not.
  file_name     text,
  kind          text NOT NULL CHECK (kind IN ('stroke','arrow','note')),
  color         text NOT NULL DEFAULT '#DC2626',
  -- Dünya birimi (mm) cinsinden tüp yarıçapı — ekran kalınlığı değil.
  width         real NOT NULL DEFAULT 0.35 CHECK (width > 0 AND width <= 5),
  -- Mesh'in KENDİ local uzayında noktalar: [[x,y,z], …]
  --   stroke → 2..2000 nokta · arrow → 2 nokta · note → 1 nokta
  points        jsonb NOT NULL CHECK (
                  jsonb_typeof(points) = 'array'
                  AND jsonb_array_length(points) BETWEEN 1 AND 2000),
  -- note metni (stroke/arrow için opsiyonel etiket)
  text          text CHECK (text IS NULL OR length(text) <= 1000),
  -- {"pos":[x,y,z],"target":[x,y,z],"fov":35} — "bu görünüme git"
  camera        jsonb,
  author_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Profil silinse/isim değişse bile notun kimden geldiği kalsın
  author_name   text,
  author_side   text NOT NULL CHECK (author_side IN ('lab','clinic')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_annot_order
  ON public.order_scan_annotations (work_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scan_annot_lab
  ON public.order_scan_annotations (lab_id);

DROP TRIGGER IF EXISTS touch_scan_annot_updated_at ON public.order_scan_annotations;
CREATE TRIGGER touch_scan_annot_updated_at
  BEFORE UPDATE ON public.order_scan_annotations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS — okuma siparişin taraflarına, yazma yalnız RPC
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_scan_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scan_annot_select ON public.order_scan_annotations;
CREATE POLICY scan_annot_select ON public.order_scan_annotations
  FOR SELECT USING (public._order_party_role(work_order_id) IS NOT NULL);

-- Kiracı koruması (order_messages ile birebir aynı RESTRICTIVE kalıp): admin
-- kaçış deliği kapalı kalsın.
DROP POLICY IF EXISTS tenant_guard ON public.order_scan_annotations;
CREATE POLICY tenant_guard ON public.order_scan_annotations
  AS RESTRICTIVE FOR ALL
  USING (
    (SELECT public.get_my_lab_id()) IS NULL
    OR lab_id IS NULL
    OR lab_id = (SELECT public.get_my_lab_id())
  );

GRANT SELECT ON public.order_scan_annotations TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RPC — ekle / metni güncelle / sil
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_scan_annotation(
  p_order     uuid,
  p_kind      text,
  p_points    jsonb,
  p_file_name text DEFAULT NULL,
  p_color     text DEFAULT '#DC2626',
  p_width     real DEFAULT 0.35,
  p_text      text DEFAULT NULL,
  p_camera    jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_side text;
  v_lab  uuid;
  v_name text;
  v_id   uuid;
BEGIN
  v_side := public._order_party_role(p_order);
  IF v_side IS NULL THEN
    RAISE EXCEPTION 'Bu siparişe not ekleme yetkiniz yok';
  END IF;

  IF p_kind NOT IN ('stroke','arrow','note') THEN
    RAISE EXCEPTION 'Geçersiz not tipi: %', p_kind;
  END IF;
  IF jsonb_typeof(p_points) <> 'array' OR jsonb_array_length(p_points) < 1 THEN
    RAISE EXCEPTION 'Nokta listesi boş';
  END IF;
  IF p_kind = 'note' AND COALESCE(btrim(p_text), '') = '' THEN
    RAISE EXCEPTION 'Not metni boş olamaz';
  END IF;

  SELECT wo.lab_id INTO v_lab FROM work_orders wo WHERE wo.id = p_order;
  SELECT COALESCE(NULLIF(btrim(pr.full_name), ''), pr.email) INTO v_name
    FROM profiles pr WHERE pr.id = auth.uid();

  INSERT INTO public.order_scan_annotations
    (lab_id, work_order_id, file_name, kind, color, width, points, text, camera,
     author_id, author_name, author_side)
  VALUES
    (v_lab, p_order, NULLIF(btrim(p_file_name), ''), p_kind,
     COALESCE(NULLIF(btrim(p_color), ''), '#DC2626'),
     COALESCE(p_width, 0.35), p_points, NULLIF(btrim(p_text), ''), p_camera,
     auth.uid(), v_name, v_side)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.add_scan_annotation IS
  '3D tarama üzerine çizim/not ekler. Noktalar mesh''in local uzayında; lab_id ve yazar alanları sunucuda doldurulur.';

CREATE OR REPLACE FUNCTION public.update_scan_annotation(
  p_id    uuid,
  p_text  text DEFAULT NULL,
  p_color text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_author uuid;
BEGIN
  SELECT author_id INTO v_author FROM public.order_scan_annotations WHERE id = p_id;
  IF v_author IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.order_scan_annotations WHERE id = p_id
  ) THEN
    RAISE EXCEPTION 'Not bulunamadı';
  END IF;
  -- Yalnız yazarı düzenler: karşı taraf metnini değiştirmek notu çarpıtır.
  IF v_author IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Yalnız notu ekleyen düzenleyebilir';
  END IF;

  UPDATE public.order_scan_annotations
     SET text  = COALESCE(NULLIF(btrim(p_text), ''), text),
         color = COALESCE(NULLIF(btrim(p_color), ''), color)
   WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_scan_annotation(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_author uuid;
  v_order  uuid;
  v_side   text;
BEGIN
  SELECT author_id, work_order_id INTO v_author, v_order
    FROM public.order_scan_annotations WHERE id = p_id;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Not bulunamadı';
  END IF;

  v_side := public._order_party_role(v_order);
  IF v_side IS NULL THEN
    RAISE EXCEPTION 'Bu siparişe erişiminiz yok';
  END IF;

  -- Kendi notunu herkes siler; başkasının notunu yalnız lab yöneticisi
  -- (yanlış/yanıltıcı işaret üretimi durdurabilmek için).
  IF v_author IS DISTINCT FROM auth.uid() THEN
    IF NOT (v_side = 'lab' AND public.is_lab_manager()) THEN
      RAISE EXCEPTION 'Bu notu silme yetkiniz yok';
    END IF;
  END IF;

  DELETE FROM public.order_scan_annotations WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_scan_annotation(uuid, text, jsonb, text, text, real, text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.update_scan_annotation(uuid, text, text) FROM public;
REVOKE ALL ON FUNCTION public.delete_scan_annotation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.add_scan_annotation(uuid, text, jsonb, text, text, real, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_scan_annotation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_scan_annotation(uuid) TO authenticated;
