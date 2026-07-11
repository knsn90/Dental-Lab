-- Faz 1: Teslim edilen işler için hekim/klinik değerlendirmesi (tek yönlü).
-- Tam dental QC boyutları (1–5, opsiyonel) + genel yıldız + yorum.
CREATE TABLE IF NOT EXISTS public.order_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  lab_id        uuid NOT NULL,
  rater_id      uuid NOT NULL DEFAULT auth.uid(),
  rater_role    text,                                  -- 'doctor' | 'clinic'
  overall       smallint NOT NULL CHECK (overall BETWEEN 1 AND 5),
  fit           smallint CHECK (fit       BETWEEN 1 AND 5),  -- Marjinal Uyum
  occlusion     smallint CHECK (occlusion BETWEEN 1 AND 5),  -- Oklüzyon / Kapanış
  contacts      smallint CHECK (contacts  BETWEEN 1 AND 5),  -- Kontakt Noktaları
  esthetics     smallint CHECK (esthetics BETWEEN 1 AND 5),  -- Estetik / Renk
  surface       smallint CHECK (surface   BETWEEN 1 AND 5),  -- Yüzey / Polisaj
  on_time       smallint CHECK (on_time   BETWEEN 1 AND 5),  -- Zamanında Teslim
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, rater_id)
);

CREATE OR REPLACE FUNCTION public.set_order_review_lab_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.lab_id IS NULL THEN
    SELECT wo.lab_id INTO NEW.lab_id FROM public.work_orders wo WHERE wo.id = NEW.work_order_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_order_review_lab_id ON public.order_reviews;
CREATE TRIGGER trg_set_order_review_lab_id
  BEFORE INSERT OR UPDATE ON public.order_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_order_review_lab_id();

CREATE INDEX IF NOT EXISTS idx_order_reviews_work_order ON public.order_reviews(work_order_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_lab        ON public.order_reviews(lab_id);

ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_reviews_select ON public.order_reviews;
CREATE POLICY order_reviews_select ON public.order_reviews FOR SELECT
  USING (
    rater_id = auth.uid()
    OR lab_id = public.get_my_lab_id()
    OR EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.id = work_order_id)
  );

DROP POLICY IF EXISTS order_reviews_insert ON public.order_reviews;
CREATE POLICY order_reviews_insert ON public.order_reviews FOR INSERT
  WITH CHECK (
    rater_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = work_order_id AND wo.status = 'teslim_edildi'
    )
  );

DROP POLICY IF EXISTS order_reviews_update ON public.order_reviews;
CREATE POLICY order_reviews_update ON public.order_reviews FOR UPDATE
  USING (rater_id = auth.uid())
  WITH CHECK (rater_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.order_reviews TO authenticated;
