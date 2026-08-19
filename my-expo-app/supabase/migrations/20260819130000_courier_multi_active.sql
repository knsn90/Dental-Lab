-- ============================================================
-- 20260819130000 — Kurye tipinde birden çok sağlayıcı aynı anda aktif olabilsin
--
-- enforce_single_active_credential, bir kimlik aktif edilince aynı (lab, type)
-- içindeki diğerlerini pasife çekiyordu. Bu kural e-Fatura/POS/OCR gibi "tek
-- sağlayıcı seçilir" tiplerinde doğru, KURYEDE yanlış: bir lab aynı anda hem
-- anlık motokurye (BanaBiKurye) hem kargo toplayıcı (Shipink, Navlungo)
-- kullanır — biri şehir içi acil, diğeri şehirler arası gönderi içindir.
-- Pratik sonucu: Shipink aktif edilince BanaBiKurye sessizce kapanıyordu.
--
-- Yeni kural: type='courier' için teklik SAĞLAYICI başına (aynı sağlayıcının
-- iki kaydı hâlâ birlikte aktif olamaz), diğer tiplerde davranış AYNI kalır.
--
-- Not: edge function'lar kurye kimliğini sağlayıcı adıyla okur; tipe göre
-- okuyan tek yer olan banabikurye-dispatch bu migration ile birlikte
-- provider='banabikurye' filtresine geçirildi.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_single_active_credential()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE provider_credentials
       SET is_active = false, updated_at = now()
     WHERE lab_id = NEW.lab_id
       AND type   = NEW.type
       AND id    <> NEW.id
       AND is_active = true
       AND (NEW.type <> 'courier' OR provider = NEW.provider);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_single_active_credential() IS
  'Tip başına tek aktif sağlayıcı; type=''courier'' istisnası: kuryede teklik sağlayıcı başınadır (lab aynı anda motokurye + kargo toplayıcı kullanabilir).';
