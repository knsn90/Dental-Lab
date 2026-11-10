-- 20261111093000_lab_settings_finans_koruma — finans belge ayarları yalnız mali işlem yöneticisi (kullanıcı kararı
-- 2026-11-11: "veri tabanına da koyulsun"). İstemcide FinanceSection zaten can('manage_finance') ile kilitli; RLS
-- (lab_settings_write) ise lab'ın HER üyesine yazma veriyordu → doğrudan API çağrısıyla değiştirilebiliyordu.
--   Korunan sütunlar: invoice_approval_enabled · pre_statement_pdf_format · efatura_line_mode
--   İzin: auth.uid() yok (service_role / cron / migration) · platform admini · has_permission('manage_finance')
--   UPDATE: sütun gerçekten DEĞİŞİYORSA ve izin yoksa LS_FINANCE_SCOPE (42501). Aynı değeri yazmak serbest.
--   INSERT: izin yoksa bu sütunlar varsayılanda kalmalı (false / 'ozet' / 'kalem'); başka sütunların upsert'i
--   (auto_triage, urgent_surcharge_rate, tarama ayarları) etkilenmez.
BEGIN;

CREATE OR REPLACE FUNCTION public._lab_settings_finance_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR is_platform_admin() OR has_permission('manage_finance') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_approval_enabled IS DISTINCT FROM false
       OR NEW.pre_statement_pdf_format IS DISTINCT FROM 'ozet'
       OR NEW.efatura_line_mode IS DISTINCT FROM 'kalem' THEN
      RAISE EXCEPTION 'LS_FINANCE_SCOPE' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.invoice_approval_enabled IS DISTINCT FROM OLD.invoice_approval_enabled
     OR NEW.pre_statement_pdf_format IS DISTINCT FROM OLD.pre_statement_pdf_format
     OR NEW.efatura_line_mode IS DISTINCT FROM OLD.efatura_line_mode THEN
    RAISE EXCEPTION 'LS_FINANCE_SCOPE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public._lab_settings_finance_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lab_settings_finance_guard ON public.lab_settings;
CREATE TRIGGER trg_lab_settings_finance_guard
  BEFORE INSERT OR UPDATE OF invoice_approval_enabled, pre_statement_pdf_format, efatura_line_mode
  ON public.lab_settings
  FOR EACH ROW EXECUTE FUNCTION public._lab_settings_finance_guard();

COMMIT;
