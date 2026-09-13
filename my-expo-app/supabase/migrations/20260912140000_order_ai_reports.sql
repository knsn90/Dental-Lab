-- 20260912140000_order_ai_reports.sql
--
-- SİPARİŞ AI ÖZETİ (Simanty raporu)
--
-- Kullanıcı tetikli: sipariş detayındaki "Özet çıkar" butonu ya da Simanty'ye
-- "şu siparişi özetle" demek. Rapor; siparişin alanları, mesajları, dosya adları,
-- aşama geçmişi, revizyon/devam zinciri ve aynı hastanın önceki işlerinden üretilir.
--
-- Tek paragraf (3-5 cümle). Her üretim yeni SÜRÜM olarak eklenir, eskisi durur —
-- "bu özet ne zaman, kim için üretilmişti" sorusu cevapsız kalmasın.
--
-- audience: 'lab'    → iç notlar/teknisyen bilgisi geçebilir
--           'clinic' → hekim/klinik metni; iç notlar DIŞARIDA bırakılır
-- Bu yüzden iki izleyici için AYRI kayıt tutulur; klinik lab metnini göremez.

CREATE TABLE IF NOT EXISTS public.order_ai_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  work_order_id   uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  audience        text NOT NULL CHECK (audience IN ('lab','clinic')),
  body            text NOT NULL CHECK (btrim(body) <> ''),
  /** Neyin üstünden yazıldı: {messages: 24, files: 3, linked: 2, history: 5} */
  sources         jsonb NOT NULL DEFAULT '{}'::jsonb,
  model           text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_ai_reports_order
  ON public.order_ai_reports (work_order_id, audience, created_at DESC);

ALTER TABLE public.order_ai_reports ENABLE ROW LEVEL SECURITY;

-- Okuma: siparişe erişimi olan görür; klinik tarafı YALNIZ 'clinic' metnini görür.
DROP POLICY IF EXISTS order_ai_reports_select ON public.order_ai_reports;
CREATE POLICY order_ai_reports_select ON public.order_ai_reports
  FOR SELECT USING (
    public._implant_parts_actor(work_order_id) = 'lab'
    OR (public._implant_parts_actor(work_order_id) = 'clinic' AND audience = 'clinic'));

GRANT SELECT ON public.order_ai_reports TO authenticated;

-- Yazma yalnız RPC ile; audience çağıranın tarafından ZORLANIR (klinik kullanıcı
-- 'lab' metni kaydedemez).
CREATE OR REPLACE FUNCTION public.save_order_ai_report(
  p_order uuid, p_body text, p_sources jsonb DEFAULT '{}'::jsonb, p_model text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_actor text; v_lab uuid; v_id uuid;
BEGIN
  v_actor := public._implant_parts_actor(p_order);
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Bu sipariş için yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN RAISE EXCEPTION 'Rapor boş olamaz.'; END IF;

  SELECT lab_id INTO v_lab FROM work_orders WHERE id = p_order;
  INSERT INTO order_ai_reports (lab_id, work_order_id, audience, body, sources, model,
                                created_by, created_by_name)
  VALUES (v_lab, p_order, v_actor, left(btrim(p_body), 8000),
          COALESCE(p_sources, '{}'::jsonb), p_model, auth.uid(),
          (SELECT full_name FROM profiles WHERE id = auth.uid()))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

COMMENT ON TABLE public.order_ai_reports IS
  'Simanty sipariş özeti (kullanıcı tetikli). Her üretim yeni sürüm; audience=lab|clinic ayrı metin.';
