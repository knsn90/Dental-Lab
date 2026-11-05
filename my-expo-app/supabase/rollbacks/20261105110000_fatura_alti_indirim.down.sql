-- 20261105110000_fatura_alti_indirim.down.sql — fatura altı indirimi geri alır: değişen dört fonksiyon ve iki
-- tetikleyici .before.txt'teki canlı hâline döner, 4 argümanlı create_bulk_invoice yetkileriyle geri gelir,
-- yeni kilit / ekleme sıfırlayıcısı / yardımcı fonksiyon / sütunlar düşer. İndirimli fatura varsa en başta durur.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Koruma: fatura altı indirimli fatura varken geri alma veri kaybettirir (indirim sütunları düşer, toplamlar indirimli kalır)
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.invoices WHERE discount_type IS NOT NULL OR discount_amount <> 0) THEN
    RAISE EXCEPTION 'Fatura altı indirimli faturalar var: geri almadan önce bu faturalarda discount_type = NULL, discount_value = 0 yapın ve toplamları yeniden hesaplayın (recalc_invoice_totals); aksi hâlde indirim kaybolur, toplamlar indirimli kalır.';
  END IF;
END $guard$;

-- Yeni kilit ve ekleme sıfırlayıcısı
DROP TRIGGER IF EXISTS zz_invoices_discount_lock ON public.invoices;
DROP FUNCTION IF EXISTS public._invoices_discount_lock();
DROP TRIGGER IF EXISTS invoices_discount_amount_insert ON public.invoices;
DROP FUNCTION IF EXISTS public._invoices_discount_amount_on_insert();

-- UPDATE OF listeleri (canlı önceki hâl)
DROP TRIGGER zz_sd_invoice_credit ON public.invoices;
CREATE TRIGGER zz_sd_invoice_credit AFTER INSERT OR DELETE OR UPDATE OF status, total, tax_rate ON public.invoices FOR EACH ROW EXECUTE FUNCTION _sd_invoice_credit_trg();
DROP TRIGGER recalc_on_tax_change ON public.invoices;
CREATE TRIGGER recalc_on_tax_change AFTER UPDATE OF tax_rate ON public.invoices FOR EACH ROW EXECUTE FUNCTION trg_recalc_on_tax_change();

-- create_bulk_invoice: 6 → 4 argüman, yetkiler .before.txt'teki gibi (authenticated, service_role; PUBLIC/anon yok)
DROP FUNCTION IF EXISTS public.create_bulk_invoice(uuid, uuid[], integer, text, text, numeric);
CREATE OR REPLACE FUNCTION public.create_bulk_invoice(p_clinic_id uuid, p_work_order_ids uuid[], p_due_days integer DEFAULT 30, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id   UUID;
  v_lab_id       UUID;
  v_doctor_id    UUID;
  v_doctor_count INT;
  v_sort         INT := 0;
  v_wo           RECORD;
  v_first_wo     UUID;
  v_auto_notes   TEXT;
  v_base         TEXT;
  v_currency     TEXT;
  v_ccy_count    INT;
BEGIN
  IF p_work_order_ids IS NULL OR array_length(p_work_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'En az bir sipariş seçmelisiniz';
  END IF;

  SELECT wo.lab_id INTO v_lab_id
  FROM work_orders wo WHERE wo.id = p_work_order_ids[1];

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'İlk sipariş bulunamadı';
  END IF;

  -- H-1 tenant guard: the caller must be an authenticated user of the target lab
  -- (same rule as invoices_lab_insert RLS), or a platform admin. This is a purely
  -- user-facing RPC (no trigger/service caller), so anonymous callers are rejected
  -- outright. Combined with the intra-set 'same clinic & lab' check below, any
  -- mixed-tenant or foreign-lab input is rejected atomically.
  -- 20261028146000: aylık süpürge (cron, oturumsuz) yalnız fn_generate_monthly_invoices'ın koyduğu
  -- işaretle geçer (siman.trusted_invoice + auth.uid() NULL). İstemci yolu için kural aynen.
  IF NOT (auth.uid() IS NULL AND coalesce(current_setting('siman.trusted_invoice', true), '') = 'on')
     AND (auth.uid() IS NULL
          OR NOT (v_lab_id = get_my_lab_id() OR is_platform_admin())) THEN
    RAISE EXCEPTION 'yetkisiz: bu klinik/lab için toplu fatura oluşturamazsınız (lab %)', v_lab_id
      USING errcode = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM work_orders wo
    LEFT JOIN doctors d ON d.id = wo.doctor_id
    WHERE wo.id = ANY(p_work_order_ids)
      AND (d.clinic_id IS DISTINCT FROM p_clinic_id OR wo.lab_id <> v_lab_id)
  ) THEN
    RAISE EXCEPTION 'Tüm siparişler aynı kliniğe ve laboratuvara ait olmalı';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM unnest(p_work_order_ids) AS wo_id
    WHERE NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo_id AND inv.status <> 'iptal'
    )
  ) THEN
    RAISE EXCEPTION 'Seçili siparişlerin tümü zaten faturalanmış';
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  SELECT COUNT(DISTINCT COALESCE(oi.currency, v_base)) INTO v_ccy_count
  FROM order_items oi
  WHERE oi.work_order_id = ANY(p_work_order_ids);

  IF v_ccy_count > 1 THEN
    RAISE EXCEPTION 'Seçili siparişler farklı para birimlerinde — tek faturada birleştirilemez. Lütfen aynı para birimindekileri ayrı ayrı faturalayın.';
  END IF;

  SELECT COALESCE(oi.currency, v_base) INTO v_currency
  FROM order_items oi
  WHERE oi.work_order_id = ANY(p_work_order_ids)
  GROUP BY COALESCE(oi.currency, v_base)
  ORDER BY SUM(oi.quantity::numeric * oi.price) DESC NULLS LAST
  LIMIT 1;

  v_currency := COALESCE(v_currency, v_base);

  SELECT COUNT(DISTINCT wo.doctor_id) INTO v_doctor_count
  FROM work_orders wo
  WHERE wo.id = ANY(p_work_order_ids)
    AND NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
    );

  SELECT wo.doctor_id, wo.id INTO v_doctor_id, v_first_wo
  FROM work_orders wo
  WHERE wo.id = ANY(p_work_order_ids)
    AND NOT EXISTS (
      SELECT 1 FROM invoice_orders io
      JOIN invoices inv ON inv.id = io.invoice_id
      WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
    )
  ORDER BY wo.created_at
  LIMIT 1;

  v_auto_notes := CASE
    WHEN v_doctor_count > 1
    THEN 'Birden fazla hekimin işleri tek faturada birleştirildi. ' || COALESCE(p_notes, '')
    ELSE p_notes
  END;

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, notes, currency, created_by)
  VALUES (v_lab_id, v_doctor_id, p_clinic_id, v_first_wo,
          'taslak', lab_today(v_lab_id),
          lab_today(v_lab_id) + (p_due_days || ' days')::INTERVAL,
          NULLIF(TRIM(COALESCE(v_auto_notes, '')), ''),
          v_currency,
          auth.uid())
  RETURNING id INTO v_invoice_id;

  FOR v_wo IN
    SELECT wo.*
    FROM work_orders wo
    WHERE wo.id = ANY(p_work_order_ids)
      AND NOT EXISTS (
        SELECT 1 FROM invoice_orders io
        JOIN invoices inv ON inv.id = io.invoice_id
        WHERE io.work_order_id = wo.id AND inv.status <> 'iptal'
      )
    ORDER BY wo.created_at
  LOOP
    INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
    VALUES (v_invoice_id, v_wo.id, v_lab_id);

    IF EXISTS (SELECT 1 FROM order_items oi WHERE oi.work_order_id = v_wo.id) THEN
      INSERT INTO invoice_items (invoice_id, order_item_id, description, quantity, unit_price, sort_order)
      SELECT
        v_invoice_id,
        oi.id,
        '[' || v_wo.order_number || '] ' || oi.name,
        oi.quantity,
        oi.price,
        v_sort + ROW_NUMBER() OVER (ORDER BY oi.created_at)
      FROM order_items oi
      WHERE oi.work_order_id = v_wo.id;

      SELECT v_sort + COUNT(*) INTO v_sort
      FROM order_items WHERE work_order_id = v_wo.id;
    ELSE
      v_sort := v_sort + 1;
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
      VALUES (
        v_invoice_id,
        '[' || v_wo.order_number || '] ' ||
          COALESCE(v_wo.work_type, 'Laboratuvar hizmeti') ||
          CASE
            WHEN v_wo.tooth_numbers IS NOT NULL AND array_length(v_wo.tooth_numbers, 1) > 0
            THEN ' (Dişler: ' || array_to_string(v_wo.tooth_numbers, ', ') || ')'
            ELSE ''
          END,
        GREATEST(COALESCE(array_length(v_wo.tooth_numbers, 1), 1), 1),
        0,
        v_sort
      );
    END IF;
  END LOOP;

  -- Tarama ücretleri (20261028142000): faturalanan siparişlere bağlı olanlar + kliniğin
  -- "yalnız tarama" havuzu (aynı para birimi). Acil ek ücret tetikleyicisi tarama satırlarını dışlar.
  PERFORM public._scan_bill_charges(v_invoice_id,
    public._scan_order_charge_ids(p_work_order_ids, v_currency)
    || public._scan_pool_charge_ids(p_clinic_id, v_currency));

  RETURN v_invoice_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_bulk_invoice(uuid, uuid[], integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_bulk_invoice(uuid, uuid[], integer, text) TO authenticated, service_role;

-- Toplam formülü ve karlılık (canlı önceki hâl; CREATE OR REPLACE ACL'yi korur)
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax_rate NUMERIC(5,2);
  v_tax      NUMERIC(12,2);
  v_total    NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(net_total), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = p_invoice_id;
  SELECT tax_rate INTO v_tax_rate FROM invoices WHERE id = p_invoice_id;
  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_tax   := ROUND(v_subtotal * v_tax_rate / 100, 2);
  v_total := v_subtotal + v_tax;
  UPDATE invoices SET subtotal = v_subtotal, tax_amount = v_tax, total = v_total
  WHERE id = p_invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aa_enforce_invoice_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_sub numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = NEW.id) THEN
    -- item-based invoice: total/subtotal/tax are DERIVED (client input ignored)
    SELECT COALESCE(SUM(net_total),0) INTO v_sub FROM invoice_items WHERE invoice_id = NEW.id;
    NEW.subtotal   := v_sub;
    NEW.tax_amount := ROUND(v_sub * COALESCE(NEW.tax_rate,0) / 100, 2);
    NEW.total      := NEW.subtotal + NEW.tax_amount;
  ELSE
    -- item-less (manual) invoice: financial columns are FROZEN after creation
    NEW.subtotal   := OLD.subtotal;
    NEW.tax_amount := OLD.tax_amount;
    NEW.total      := OLD.total;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._profit_revenue_lines(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(invoice_id uuid, clinic_id uuid, doctor_id uuid, order_ids uuid[], row_kind text, service_id uuid, unit text, currency text, quantity numeric, revenue numeric, revenue_base numeric, has_list boolean, list_value_base numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT COALESCE((SELECT default_currency FROM lab_settings WHERE lab_id = p_lab_id), 'TRY') AS ccy
  ), inv AS (   -- dönemde KESİLEN faturalar (profitability_summary ile aynı seçim ve kur)
    SELECT i.id, i.clinic_id, i.doctor_id AS inv_doctor, i.work_order_id, i.issue_date,
           COALESCE(i.currency, 'TRY') AS currency, i.subtotal,
           COALESCE(i.rate_at_time, i.amount_base / NULLIF(i.total, 0), 1) AS rate
      FROM invoices i
     WHERE i.lab_id = p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi')
       AND i.issue_date BETWEEN p_from AND p_to
  ), inv_orders AS (   -- faturaya bağlı siparişler: doğrudan bağ + toplu fatura bağı
    SELECT inv.id AS inv_id, inv.work_order_id AS wo_id FROM inv WHERE inv.work_order_id IS NOT NULL
    UNION
    SELECT io.invoice_id, io.work_order_id FROM invoice_orders io JOIN inv ON inv.id = io.invoice_id
  ), inv_x AS (   -- sipariş listesi + kalemden bulunamayan hekim için fatura düzeyi yedek
    SELECT inv.*, COALESCE(ol.wo_ids, '{}'::uuid[]) AS wo_ids,
           CASE COALESCE(cardinality(ol.wo_ids), 0)
             WHEN 0 THEN inv.inv_doctor
             WHEN 1 THEN (SELECT wo.doctor_id FROM work_orders wo WHERE wo.id = ol.wo_ids[1])
           END AS fallback_doctor   -- çok siparişli toplu faturada invoices.doctor_id KULLANILMAZ (ilk siparişin hekimi)
      FROM inv
      LEFT JOIN LATERAL (SELECT array_agg(o.wo_id ORDER BY o.wo_id) AS wo_ids FROM inv_orders o WHERE o.inv_id = inv.id) ol ON true
  ), items AS (
    SELECT ix.id AS inv_id, ix.clinic_id, ix.currency, ix.rate, ix.issue_date, ix.wo_ids, ix.fallback_doctor,
           ii.quantity, COALESCE(ii.net_total, ii.total, 0) AS amount,
           -- sipariş: kalemin sipariş kalemi → yoksa açıklamanın "[sipariş no]" öneki (yalnız bu faturanın siparişleri)
           COALESCE(oi.work_order_id,
             (SELECT wo.id FROM work_orders wo
               WHERE wo.id = ANY (ix.wo_ids)
                 AND wo.order_number = btrim(substring(ii.description from '^\s*\[([^\]]*)\]'))
               ORDER BY wo.id LIMIT 1)) AS item_wo,
           oi.service_id AS oi_service,
           -- eşleşme adı: sipariş kalemi adı; bağsız kalemde açıklamanın "[sipariş no]" öneki atılmış hâli
           lower(btrim(COALESCE(oi.name, regexp_replace(ii.description, '^\s*\[[^\]]*\]\s*', '')))) AS match_name
      FROM inv_x ix
      JOIN invoice_items ii ON ii.invoice_id = ix.id
      LEFT JOIN order_items oi ON oi.id = ii.order_item_id
  ), item_lines AS (
    SELECT it.inv_id, it.clinic_id,
           CASE WHEN it.item_wo IS NOT NULL THEN (SELECT wo.doctor_id FROM work_orders wo WHERE wo.id = it.item_wo)
                ELSE it.fallback_doctor END AS doctor_id,
           -- siparişsiz kalem çok siparişli faturada sipariş SAHİPLENMEZ (siparişler kendi hekiminde sayılsın)
           CASE WHEN it.item_wo IS NOT NULL THEN ARRAY[it.item_wo]
                WHEN cardinality(it.wo_ids) <= 1 THEN it.wo_ids ELSE '{}'::uuid[] END AS order_ids,
           CASE WHEN s.id IS NOT NULL THEN 'service' ELSE 'other' END AS row_kind,
           s.id AS service_id, s.unit, it.currency, it.quantity, it.amount AS revenue, it.amount * it.rate AS revenue_base,
           lr.lrate,
           (s.id IS NOT NULL AND COALESCE(s.price, 0) > 0 AND lr.lrate IS NOT NULL) AS has_list,
           CASE WHEN s.id IS NOT NULL AND COALESCE(s.price, 0) > 0 AND lr.lrate IS NOT NULL
                THEN it.quantity * s.price * lr.lrate * it.rate ELSE 0 END AS list_value_base
      FROM items it
      LEFT JOIN LATERAL (   -- işlem eşleşmesi: service_id → aynı labda tam ad (büyük/küçük harf duyarsız) → Diğer
        SELECT s0.id, s0.unit, s0.price, s0.currency FROM (
          SELECT ls.id, ls.unit, ls.price, ls.currency, 0 AS pri, true AS act, ls.created_at
            FROM lab_services ls WHERE it.oi_service IS NOT NULL AND ls.id = it.oi_service AND ls.lab_id = p_lab_id
          UNION ALL
          SELECT ls.id, ls.unit, ls.price, ls.currency, 1, COALESCE(ls.is_active, true), ls.created_at
            FROM lab_services ls WHERE ls.lab_id = p_lab_id AND it.match_name <> '' AND lower(btrim(ls.name)) = it.match_name
        ) s0 ORDER BY s0.pri, s0.act DESC, s0.created_at NULLS LAST, s0.id LIMIT 1
      ) s ON true
      -- liste fiyatı → faturanın dövizi (fatura tarihindeki kur); sonra faturanın kuruyla ana para birimi
      LEFT JOIN LATERAL (
        SELECT public.get_currency_rate(p_lab_id, COALESCE(s.currency, (SELECT ccy FROM base)), it.currency, it.issue_date) AS lrate
         WHERE s.id IS NOT NULL AND COALESCE(s.price, 0) > 0
      ) lr ON true
  ), remainder AS (   -- kalem toplamı subtotal'den farklıysa ya da fatura kalemsizse fark: "Kalemsiz fatura"
    SELECT ix.id AS inv_id, ix.clinic_id, ix.fallback_doctor AS doctor_id,
           CASE WHEN cardinality(ix.wo_ids) <= 1 THEN ix.wo_ids ELSE '{}'::uuid[] END AS order_ids, 'no_items'::text AS row_kind,
           NULL::uuid AS service_id, NULL::text AS unit, ix.currency, 0::numeric AS quantity,
           ix.subtotal - COALESCE(t.amt, 0) AS revenue, (ix.subtotal - COALESCE(t.amt, 0)) * ix.rate AS revenue_base,
           NULL::numeric AS lrate, false AS has_list, 0::numeric AS list_value_base
      FROM inv_x ix
      LEFT JOIN (SELECT il.inv_id, SUM(il.revenue) AS amt, count(*) AS n FROM item_lines il GROUP BY il.inv_id) t ON t.inv_id = ix.id
     WHERE t.n IS NULL OR abs(ix.subtotal - t.amt) > 0.005
  ), all_lines AS (
    SELECT * FROM item_lines UNION ALL SELECT * FROM remainder
  ), uncovered AS (   -- faturaya bağlı ama hiçbir satırda görünmeyen sipariş → 0 tutarlı satır (sipariş sayısı tutsun)
    SELECT o.inv_id, ix.clinic_id, (SELECT wo.doctor_id FROM work_orders wo WHERE wo.id = o.wo_id) AS doctor_id,
           ARRAY[o.wo_id] AS order_ids, 'no_items'::text AS row_kind, NULL::uuid AS service_id, NULL::text AS unit,
           ix.currency, 0::numeric AS quantity, 0::numeric AS revenue, 0::numeric AS revenue_base,
           NULL::numeric AS lrate, false AS has_list, 0::numeric AS list_value_base
      FROM inv_orders o JOIN inv_x ix ON ix.id = o.inv_id
     WHERE NOT EXISTS (SELECT 1 FROM all_lines l WHERE l.inv_id = o.inv_id AND o.wo_id = ANY (l.order_ids))
  )
  SELECT l.inv_id, l.clinic_id, l.doctor_id, l.order_ids, l.row_kind, l.service_id, l.unit, l.currency,
         l.quantity, l.revenue, l.revenue_base, l.has_list, l.list_value_base
    FROM (SELECT * FROM all_lines UNION ALL SELECT * FROM uncovered) l
  UNION ALL
  -- 20261105102000: ekstre indirimi — hizmete/hekime/siparişe dağıtılamaz; kliniğin eksi satırı, indirim gününde
  -- (kendi dövizinde amount, ana parada amount_base). Kırılım toplamı dönem cirosuna eşit kalır.
  SELECT NULL::uuid, d.clinic_id, NULL::uuid, '{}'::uuid[], 'statement_discount'::text, NULL::uuid, NULL::text,
         d.currency, 0::numeric, -d.amount, -d.amount_base, false, 0::numeric
    FROM clinic_statement_discounts d
   WHERE d.lab_id = p_lab_id AND d.discount_date BETWEEN p_from AND p_to;
$function$;

DROP FUNCTION IF EXISTS public._invoice_discount_amount(numeric, text, numeric);

-- Sütunlar (yukarıdaki koruma indirimli fatura kalmadığını doğruladı)
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_discount_amount_check,
  DROP CONSTRAINT IF EXISTS invoices_discount_percent_check,
  DROP CONSTRAINT IF EXISTS invoices_discount_value_check,
  DROP CONSTRAINT IF EXISTS invoices_discount_type_check,
  DROP COLUMN IF EXISTS discount_amount,
  DROP COLUMN IF EXISTS discount_value,
  DROP COLUMN IF EXISTS discount_type;

COMMIT;
