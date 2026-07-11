-- ════════════════════════════════════════════════════════════════════════════
-- FIX: lab_settings RLS — base currency seçilemiyor / default_currency okunamıyor.
--
--   Eski politikalar `lab_id = current_setting('app.current_lab_id')::uuid` GUC'una
--   dayanıyordu. Bu oturum değişkeni supabase-js (PostgREST + JWT) client'ında HİÇ
--   set edilmiyor → NULL → hem SELECT hem ALL reddediliyordu. Sonuç:
--     • default_currency okunamıyor (fatura/para birimi hep TRY'ye düşüyordu)
--     • base currency yazılamıyordu ("seçim yapamıyorum")
--
--   ÇÖZÜM: expenses ve lab_services ile aynı, çalışan desen — get_my_lab_id()
--   (SECURITY DEFINER, çağıranın profiles.lab_id'sini döndürür).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS lab_settings_read  ON public.lab_settings;
DROP POLICY IF EXISTS lab_settings_write ON public.lab_settings;

CREATE POLICY lab_settings_read ON public.lab_settings
  FOR SELECT USING (lab_id = public.get_my_lab_id());

CREATE POLICY lab_settings_write ON public.lab_settings
  FOR ALL
  USING (lab_id = public.get_my_lab_id())
  WITH CHECK (lab_id = public.get_my_lab_id());
