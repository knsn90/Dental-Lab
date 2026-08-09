-- ════════════════════════════════════════════════════════════════════════════
-- denty_usage — Simanty (AI asistan) için kullanıcı başına GÜNLÜK istek limiti
--
-- SORUN: denty-brain edge fonksiyonu herhangi bir limit uygulamıyordu. Asistan
-- artık TÜM panellerde açık; döngüye giren bir sohbet ya da kötü niyetli bir
-- oturum sınırsız Claude çağrısı üretebilir (doğrudan maliyet).
--
-- ÇÖZÜM: (user_id, gun) başına sayaç. Fonksiyon her turda increment eder, limit
-- aşılırsa Claude'a hiç gitmez. Sayaç SERVICE ROLE ile yazılır; kullanıcı yalnız
-- KENDİ satırını okuyabilir (kalan hakkını gösterebilmek için).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.denty_usage (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gun         date        NOT NULL DEFAULT CURRENT_DATE,
  istek       integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gun)
);

COMMENT ON TABLE public.denty_usage IS
  'Simanty günlük istek sayacı (user_id + gün). denty-brain edge fonksiyonu artırır.';

ALTER TABLE public.denty_usage ENABLE ROW LEVEL SECURITY;

-- Kullanıcı yalnız kendi kullanımını GÖRÜR; yazma yalnız service role (RLS'i baypas eder).
DROP POLICY IF EXISTS denty_usage_self_read ON public.denty_usage;
CREATE POLICY denty_usage_self_read ON public.denty_usage
  FOR SELECT USING (user_id = auth.uid());

-- Sayaç artırma — SECURITY DEFINER, yalnız çağıranın kendi satırı.
-- Edge fonksiyonu service role ile çağırır; limit aşıldıysa allowed=false döner
-- ve sayaç ARTMAZ (reddedilen istek kotadan yemez).
CREATE OR REPLACE FUNCTION public.denty_consume_quota(p_user uuid, p_limit integer)
RETURNS TABLE (allowed boolean, used integer, quota integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_used integer;
BEGIN
  INSERT INTO public.denty_usage (user_id, gun, istek)
  VALUES (p_user, CURRENT_DATE, 0)
  ON CONFLICT (user_id, gun) DO NOTHING;

  SELECT istek INTO v_used FROM public.denty_usage
   WHERE user_id = p_user AND gun = CURRENT_DATE
     FOR UPDATE;

  IF v_used >= p_limit THEN
    RETURN QUERY SELECT false, v_used, p_limit;
    RETURN;
  END IF;

  UPDATE public.denty_usage
     SET istek = istek + 1, updated_at = now()
   WHERE user_id = p_user AND gun = CURRENT_DATE
   RETURNING istek INTO v_used;

  RETURN QUERY SELECT true, v_used, p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.denty_consume_quota(uuid, integer) FROM public, anon, authenticated;

NOTIFY pgrst, 'reload schema';
