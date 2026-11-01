-- 20261101121000_karlilik_kirilim
-- Karlılık ekranı: klinik (hekim alt satırlı) ve işlem bazında CİRO kırılımı, KDV HARİÇ.
-- Toplu fatura kalem kalem dağılır; kırılım toplamı profitability_summary geliriyle tutar.
-- Spec: docs/superpowers/specs/2026-11-01-karlilik-klinik-islem-ciro-design.md §3
-- Geri alma: supabase/rollbacks/20261101121000_karlilik_kirilim.down.sql

-- Kalem başına bir satır: klinik, hekim, işlem, döviz, KDV hariç tutar, liste değeri.
-- Gizli yardımcı: istemci çağıramaz; yalnız aşağıdaki iki DEFINER RPC kullanır (yetki kapısı onlarda).
CREATE OR REPLACE FUNCTION public._profit_revenue_lines(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(invoice_id uuid, clinic_id uuid, doctor_id uuid, order_ids uuid[], row_kind text, service_id uuid,
               unit text, currency text, quantity numeric, revenue numeric, revenue_base numeric,
               has_list boolean, list_value_base numeric)
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
           oi.work_order_id AS item_wo, oi.service_id AS oi_service,
           -- eşleşme adı: sipariş kalemi adı; bağsız kalemde açıklamanın "[sipariş no]" öneki atılmış hâli
           lower(btrim(COALESCE(oi.name, regexp_replace(ii.description, '^\s*\[[^\]]*\]\s*', '')))) AS match_name
      FROM inv_x ix
      JOIN invoice_items ii ON ii.invoice_id = ix.id
      LEFT JOIN order_items oi ON oi.id = ii.order_item_id
  ), item_lines AS (
    SELECT it.inv_id, it.clinic_id,
           CASE WHEN it.item_wo IS NOT NULL THEN (SELECT wo.doctor_id FROM work_orders wo WHERE wo.id = it.item_wo)
                ELSE it.fallback_doctor END AS doctor_id,
           CASE WHEN it.item_wo IS NOT NULL THEN ARRAY[it.item_wo] ELSE it.wo_ids END AS order_ids,
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
    SELECT ix.id AS inv_id, ix.clinic_id, ix.fallback_doctor AS doctor_id, ix.wo_ids AS order_ids, 'no_items'::text AS row_kind,
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
    FROM (SELECT * FROM all_lines UNION ALL SELECT * FROM uncovered) l;
$function$;

REVOKE ALL ON FUNCTION public._profit_revenue_lines(uuid, date, date) FROM public, anon, authenticated;

-- Klinik × hekim × döviz cirosu (KDV hariç). Hekim adı doctor_id polimorfizmiyle (profiles → doctors).
CREATE OR REPLACE FUNCTION public.profitability_by_clinic(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(clinic_id uuid, clinic_name text, doctor_id uuid, doctor_name text, currency text,
               revenue numeric, revenue_base numeric, order_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM assert_my_lab(p_lab_id);
  IF NOT public.can_view_lab_profit(p_lab_id) THEN
    RAISE EXCEPTION 'yetkisiz: karlılık verisi için finans yetkisi gerekir' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH l AS (SELECT * FROM public._profit_revenue_lines(p_lab_id, p_from, p_to)),
  g AS (
    SELECT l.clinic_id, l.doctor_id, l.currency, SUM(l.revenue) AS rev, SUM(l.revenue_base) AS rb
      FROM l GROUP BY l.clinic_id, l.doctor_id, l.currency
  ), o AS (
    SELECT l.clinic_id, l.doctor_id, l.currency, array_agg(DISTINCT w.wo ORDER BY w.wo) AS ids
      FROM l CROSS JOIN LATERAL unnest(l.order_ids) AS w(wo)
     GROUP BY l.clinic_id, l.doctor_id, l.currency
  )
  SELECT g.clinic_id, c.name::text, g.doctor_id, COALESCE(pr.full_name, d.full_name)::text, g.currency,
         g.rev, g.rb, COALESCE(o.ids, '{}'::uuid[])
    FROM g
    LEFT JOIN o ON o.clinic_id IS NOT DISTINCT FROM g.clinic_id AND o.doctor_id IS NOT DISTINCT FROM g.doctor_id
               AND o.currency = g.currency
    LEFT JOIN clinics c ON c.id = g.clinic_id
    LEFT JOIN profiles pr ON pr.id = g.doctor_id
    LEFT JOIN doctors d ON d.id = g.doctor_id
   ORDER BY g.rb DESC;
END;
$function$;

-- İşlem × döviz cirosu (KDV hariç) + liste fiyatı karşılaştırması için liste değeri.
CREATE OR REPLACE FUNCTION public.profitability_by_service(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(row_kind text, service_id uuid, service_name text, unit text, currency text, quantity numeric,
               revenue numeric, revenue_base numeric, listed_quantity numeric, listed_revenue_base numeric,
               list_value_base numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM assert_my_lab(p_lab_id);
  IF NOT public.can_view_lab_profit(p_lab_id) THEN
    RAISE EXCEPTION 'yetkisiz: karlılık verisi için finans yetkisi gerekir' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT l.row_kind, l.service_id, s.name::text, COALESCE(l.unit, s.unit)::text, l.currency,
         SUM(l.quantity), SUM(l.revenue), SUM(l.revenue_base),
         COALESCE(SUM(l.quantity) FILTER (WHERE l.has_list), 0),
         COALESCE(SUM(l.revenue_base) FILTER (WHERE l.has_list), 0),
         COALESCE(SUM(l.list_value_base) FILTER (WHERE l.has_list), 0)
    FROM public._profit_revenue_lines(p_lab_id, p_from, p_to) l
    LEFT JOIN lab_services s ON s.id = l.service_id
   WHERE NOT (l.revenue = 0 AND l.quantity = 0)   -- yalnız sipariş sayısı için üretilen 0 satırlar
   GROUP BY l.row_kind, l.service_id, s.name, COALESCE(l.unit, s.unit), l.currency
   ORDER BY SUM(l.revenue_base) DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.profitability_by_clinic(uuid, date, date) FROM public, anon;
REVOKE ALL ON FUNCTION public.profitability_by_service(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.profitability_by_clinic(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profitability_by_service(uuid, date, date) TO authenticated, service_role;
