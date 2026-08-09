-- ════════════════════════════════════════════════════════════════════════════
-- Sipariş numarası: ayarlardaki ÖN EK + 2 haneli yıl
--
-- SORUN 1: generate_order_number() ön eki 'LAB-' diye SABİT yazıyordu;
--          Ayarlar → "Sipariş Ön Eki" (lab_settings.order_prefix) hiç okunmuyordu.
--          Kullanıcı NEX yazsa da numaralar LAB-… olarak üretiliyordu.
-- SORUN 2: Yıl 4 haneydi (LAB-2026-0001) → istek: 2 hane (NEX-26-0001).
--
-- KORUNAN: numarayı ÇAĞIRAN veren durumlar (revizyon siparişleri
-- create_revision_order içinde 'LAB-2026-0118-1' gibi türetilmiş numara yazar)
-- ezilmemeli — bu yüzden NEW.order_number doluysa fonksiyon dokunmadan çıkar.
--
-- NOT: work_order_seq global bir sequence; çok laboratuvarlı kurulumda numara
-- sırası lablar arasında paylaşılır (atlamalar olur, çakışma olmaz). Lab başına
-- sıralı numara istenirse ayrı bir iş olarak ele alınmalı.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
BEGIN
  -- Numarayı çağıran verdiyse (revizyon vb.) dokunma
  IF NEW.order_number IS NOT NULL AND length(trim(NEW.order_number)) > 0 THEN
    RETURN NEW;
  END IF;

  -- Ayarlardaki ön ek; yoksa/boşsa 'LAB'
  SELECT NULLIF(trim(ls.order_prefix), '')
    INTO v_prefix
    FROM public.lab_settings ls
   WHERE ls.lab_id = NEW.lab_id;

  NEW.order_number :=
    COALESCE(v_prefix, 'LAB') || '-' ||
    TO_CHAR(NOW(), 'YY')      || '-' ||
    LPAD(nextval('work_order_seq')::TEXT, 4, '0');

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
