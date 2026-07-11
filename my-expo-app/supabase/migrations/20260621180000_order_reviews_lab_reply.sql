-- Faz 5: Lab, değerlendirmeye yanıt yazabilsin (iki yönlü).
ALTER TABLE public.order_reviews
  ADD COLUMN IF NOT EXISTS lab_reply    text,
  ADD COLUMN IF NOT EXISTS lab_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS lab_reply_by uuid;

-- Lab yanıtını yalnız o işin lab üyesi yazar/günceller; sadece yanıt alanlarına dokunur.
CREATE OR REPLACE FUNCTION public.set_review_lab_reply(p_review_id uuid, p_reply text)
RETURNS public.order_reviews LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r public.order_reviews;
BEGIN
  UPDATE public.order_reviews
     SET lab_reply    = NULLIF(btrim(p_reply), ''),
         lab_reply_at = CASE WHEN NULLIF(btrim(p_reply), '') IS NULL THEN NULL ELSE now() END,
         lab_reply_by = CASE WHEN NULLIF(btrim(p_reply), '') IS NULL THEN NULL ELSE auth.uid() END
   WHERE id = p_review_id
     AND lab_id = public.get_my_lab_id()
  RETURNING * INTO r;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Yetkisiz veya değerlendirme bulunamadı';
  END IF;
  RETURN r;
END; $$;

REVOKE ALL ON FUNCTION public.set_review_lab_reply(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_review_lab_reply(uuid, text) TO authenticated;
