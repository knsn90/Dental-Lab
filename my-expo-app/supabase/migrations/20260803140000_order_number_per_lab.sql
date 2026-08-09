-- Sipariş numarası: lab başına ön ek + lab başına kesintisiz sayaç
--
-- SORUN 1 — ölü ayar: Ayarlar › Sipariş Ön Eki (`lab_settings.order_prefix`)
-- kaydediliyor ve ekranda görünüyordu ama `generate_order_number()` ön eki
-- SABİT 'LAB-' olarak yazıyordu. Ayarı değiştirmek hiçbir şey yapmıyordu.
--
-- SORUN 2 — ortak sayaç: `work_order_seq` tüm laboratuvarlarca paylaşılıyordu.
-- Çok kiracılı üründe bu, başka bir lab sipariş açtığında bu labın numarasının
-- ATLAMASI demek (…0164 sonrası …0167). Yalnız ön eki düzeltmek sorunu yarım
-- çözerdi: her lab kendi ön ekini görür ama numaralar delik deşik akardı.
--
-- ÇÖZÜM: lab + yıl başına satır tutan bir sayaç tablosu. Numara
-- `INSERT … ON CONFLICT DO UPDATE … RETURNING` ile TEK ifadede alınır; bu satır
-- kilidi eşzamanlı iki siparişin aynı numarayı almasını engeller (yarış yok).
--
-- GERİYE DÖNÜK: mevcut siparişler DEĞİŞMEZ — trigger yalnız numarası boş yeni
-- kayıtta çalışır. Sayaçlar mevcut en büyük numaradan tohumlanır, böylece ön ek
-- ileride eski değerine döndürülse bile çakışma olmaz.

-- ── Sayaç tablosu ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_number_counters (
  lab_id  uuid    NOT NULL,
  year    integer NOT NULL,
  last_no integer NOT NULL DEFAULT 0,
  PRIMARY KEY (lab_id, year)
);

-- Yalnız SECURITY DEFINER trigger dokunur; kimseye politika verilmez.
ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.order_number_counters IS
  'Lab + yıl başına sipariş numarası sayacı. Yalnız generate_order_number() yazar.';

-- ── Mevcut numaralardan tohumla ──────────────────────────────────────
-- Ön ekten bağımsız olarak "…-YYYY-NNNN" kuyruğundaki en büyük sayı alınır;
-- ön ek değişse de aynı yıl içinde numara tekrar etmesin.
INSERT INTO public.order_number_counters (lab_id, year, last_no)
SELECT w.lab_id,
       (regexp_match(w.order_number, '-(\d{4})-\d+$'))[1]::int AS yr,
       MAX((regexp_match(w.order_number, '-(\d+)$'))[1]::int)  AS mx
  FROM public.work_orders w
 WHERE w.lab_id IS NOT NULL
   AND w.order_number ~ '-\d{4}-\d+$'
 GROUP BY w.lab_id, (regexp_match(w.order_number, '-(\d{4})-\d+$'))[1]::int
ON CONFLICT (lab_id, year) DO UPDATE
  SET last_no = GREATEST(public.order_number_counters.last_no, EXCLUDED.last_no);

-- ── Trigger ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- sayaç tablosuna RLS'siz erişim için
SET search_path TO 'public'
AS $function$
DECLARE
  v_year   integer := EXTRACT(YEAR FROM NOW())::int;
  v_prefix text;
  v_no     integer;
BEGIN
  IF NEW.order_number IS NOT NULL AND length(trim(NEW.order_number)) > 0 THEN
    RETURN NEW;                       -- elle verilmiş numaraya dokunma
  END IF;

  -- lab_id yoksa numarasız kayıt bırakmaktansa eski davranışa düş.
  IF NEW.lab_id IS NULL THEN
    NEW.order_number := 'LAB-' || v_year::text || '-' ||
                        LPAD(nextval('work_order_seq')::text, 4, '0');
    RETURN NEW;
  END IF;

  SELECT NULLIF(TRIM(ls.order_prefix), '')
    INTO v_prefix
    FROM public.lab_settings ls
   WHERE ls.lab_id = NEW.lab_id;
  v_prefix := COALESCE(v_prefix, 'LAB');

  -- Satır kilidi + artır + oku: tek ifade, yarış koşulu yok.
  INSERT INTO public.order_number_counters AS c (lab_id, year, last_no)
  VALUES (NEW.lab_id, v_year, 1)
  ON CONFLICT (lab_id, year) DO UPDATE SET last_no = c.last_no + 1
  RETURNING c.last_no INTO v_no;

  NEW.order_number := v_prefix || '-' || v_year::text || '-' ||
                      LPAD(v_no::text, 4, '0');
  RETURN NEW;
END;
$function$;
