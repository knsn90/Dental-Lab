-- Geri alma: 20261105102000_ekstre_indirimi_rapor
-- Canlı önceki durum: rollbacks/20261105102000_ekstre_indirimi_rapor.before.txt (tanımlar oradan birebir).
-- profitability_by_clinic dönüş tipi geri döner (row_kind düşer) → DROP + CREATE + canlıdaki yetkiler.
-- profitability_summary eski tanımında SET search_path yok; CREATE OR REPLACE proconfig'i de geri yazar.
-- v_monthly_finance_summary sütunları aynı → CREATE OR REPLACE VIEW (security_invoker açıkça).
-- Veri değişmez. Geri almadan sonra raporlar ekstre indirimini yine ciro/tahsilat olarak yorumlar
-- (indirim payları makbuzsuz ödeme dalında tahsilat sayılır) — bu yalnız bilinçli geri dönüş içindir.
BEGIN;

CREATE OR REPLACE FUNCTION public.finance_period_metrics(p_from date, p_to date)
 RETURNS TABLE(currency text, revenue numeric, invoice_count integer, collections numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with lab as (
    select public.get_my_lab_id() as id where public.lab_can_view_finance()
  ), rev as (
    select coalesce(i.currency, 'TRY') as ccy, sum(i.total) as amt, count(*)::int as n
      from public.invoices i join lab on i.lab_id = lab.id
     where i.status in ('kesildi', 'kismi_odendi', 'odendi') and i.issue_date between p_from and p_to
     group by 1
  ), col as (
    select x.ccy, sum(x.amt) as amt from (
      -- makbuz satırları, makbuz gününde
      select coalesce(l.currency, r.base_currency, 'TRY') as ccy, l.amount as amt
        from public.clinic_receipt_lines l
        join public.clinic_receipts r on r.id = l.receipt_id
        join lab on r.lab_id = lab.id
       where r.receipt_date between p_from and p_to
      union all
      -- satırı olmayan makbuz: ana para biriminde toplam
      select coalesce(r.base_currency, 'TRY'), r.total_base
        from public.clinic_receipts r join lab on r.lab_id = lab.id
       where r.receipt_date between p_from and p_to
         and not exists (select 1 from public.clinic_receipt_lines l where l.receipt_id = r.id)
      union all
      -- makbuza bağlı olmayan doğrudan ödemeler (makbuzdan dağıtılan ödemeler zaten makbuzda sayıldı)
      select coalesce(p.currency, 'TRY'), p.amount
        from public.payments p join lab on p.lab_id = lab.id
       where p.receipt_id is null and p.payment_date between p_from and p_to
    ) x group by x.ccy
  )
  select coalesce(rev.ccy, col.ccy), coalesce(rev.amt, 0), coalesce(rev.n, 0), coalesce(col.amt, 0)
    from rev full join col on col.ccy = rev.ccy
$function$;

CREATE OR REPLACE FUNCTION public.profitability_summary(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(total_orders bigint, total_revenue numeric, total_material numeric, total_labor numeric, total_overhead numeric, total_cost numeric, total_profit numeric, avg_margin_pct numeric, revenue_currency text, revenue_original numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_cur text; v_orig numeric; v_labor numeric; v_overhead numeric; v_base text;
BEGIN
  -- 20261026150000: dönem = FATURA tarihi (tek tanım). Gelir = dönemde kesilen faturalar (saklı kurla
  -- ana para birimi), malzeme = o faturalara bağlı siparişlerin tüketimi; işçilik/genel gider dönem gideri.
  -- 20261101120000: gelir KDV HARİÇ (subtotal); kur = rate_at_time, yoksa amount_base/total, o da yoksa 1.
  PERFORM assert_my_lab(p_lab_id);
  IF NOT public.can_view_lab_profit(p_lab_id) THEN
    RAISE EXCEPTION 'yetkisiz: karlılık verisi için finans yetkisi gerekir' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(default_currency,'TRY') INTO v_base FROM lab_settings WHERE lab_id=p_lab_id;
  v_base := COALESCE(v_base,'TRY');
  SELECT CASE WHEN count(DISTINCT i.currency)=1 AND max(i.currency)<>'TRY' THEN max(i.currency) END, sum(i.subtotal)
    INTO v_cur, v_orig
  FROM invoices i
  WHERE i.lab_id=p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi') AND i.issue_date BETWEEN p_from AND p_to;
  v_labor :=
    COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, sp.gross_amount, sp.currency, sp.payment_date)) FROM salary_payments sp
              WHERE sp.lab_id=p_lab_id AND sp.payment_date BETWEEN p_from AND p_to),0)
  + COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, e.amount, e.currency, e.expense_date)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.category='personel' AND e.salary_payment_id IS NULL AND e.advance_id IS NULL
                AND e.expense_date BETWEEN p_from AND p_to),0);
  v_overhead :=
    COALESCE((SELECT SUM(public.fn_to_base(p_lab_id, e.amount, e.currency, e.expense_date)) FROM expenses e
              WHERE e.lab_id=p_lab_id AND e.expense_date BETWEEN p_from AND p_to AND e.category NOT IN ('malzeme','personel')),0);
  RETURN QUERY
  WITH per_inv AS (   -- dönemde KESİLEN faturalar (tek tanım: taslak/iptal hariç, fatura tarihi)
    SELECT i.id, i.work_order_id, i.total, i.currency,
           i.subtotal * COALESCE(i.rate_at_time, i.amount_base / NULLIF(i.total, 0), 1) AS base
      FROM invoices i
     WHERE i.lab_id = p_lab_id AND i.status IN ('kesildi','kismi_odendi','odendi')
       AND i.issue_date BETWEEN p_from AND p_to
  ), per_wo AS (  -- o faturalara bağlı siparişler (doğrudan bağ + toplu fatura bağları)
    SELECT pi2.work_order_id AS wo_id FROM per_inv pi2 WHERE pi2.work_order_id IS NOT NULL
    UNION
    SELECT io.work_order_id FROM invoice_orders io JOIN per_inv pi3 ON pi3.id = io.invoice_id
  ), op AS (
    SELECT COALESCE((SELECT SUM(COALESCE(sm.total_cost_at_time,0) * COALESCE(public.get_currency_rate(p_lab_id, COALESCE(sm.currency, v_base), v_base, sm.created_at::date),1))
                FROM stock_movements sm WHERE sm.order_id=wo.id AND sm.type IN ('OUT','WASTE')),0) AS material
    FROM work_orders wo JOIN per_wo ON per_wo.wo_id = wo.id
    WHERE wo.lab_id=p_lab_id
  ), agg AS (
    SELECT (SELECT COUNT(*) FROM per_wo)::bigint AS cnt,
           (SELECT COALESCE(SUM(base),0) FROM per_inv) AS rev,
           (SELECT COALESCE(SUM(material),0) FROM op) AS mat
  )
  SELECT agg.cnt, agg.rev, agg.mat, v_labor, v_overhead,
    agg.mat + v_labor + v_overhead, agg.rev - (agg.mat + v_labor + v_overhead),
    CASE WHEN agg.rev>0 THEN ROUND(((agg.rev - (agg.mat + v_labor + v_overhead))/agg.rev)*100,1) ELSE 0 END,
    v_cur, CASE WHEN v_cur IS NOT NULL THEN v_orig END
  FROM agg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profitability_revenue_ccy(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(currency text, revenue numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20261026150000: dönem = FATURA tarihi; kesilmiş faturaların TAMAMI (toplu ve siparişsiz dahil) →
  -- finance_period_metrics.revenue ile aynı rakam.
  -- 20261101120000: KDV HARİÇ (subtotal) — artık finance_period_metrics'ten KDV kadar düşük; yalnız Karlılık okur.
  SELECT COALESCE(i.currency, 'TRY') AS currency, SUM(i.subtotal) AS revenue
  FROM invoices i
  WHERE i.lab_id = p_lab_id
    AND public.can_view_lab_profit(p_lab_id)
    AND i.status IN ('kesildi','kismi_odendi','odendi')
    AND i.issue_date BETWEEN p_from AND p_to
  GROUP BY COALESCE(i.currency, 'TRY')
  ORDER BY 1;
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
    FROM (SELECT * FROM all_lines UNION ALL SELECT * FROM uncovered) l;
$function$;

DROP FUNCTION public.profitability_by_clinic(uuid, date, date);
CREATE FUNCTION public.profitability_by_clinic(p_lab_id uuid, p_from date, p_to date)
 RETURNS TABLE(clinic_id uuid, clinic_name text, doctor_id uuid, doctor_name text, currency text, revenue numeric, revenue_base numeric, order_ids uuid[])
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
REVOKE ALL ON FUNCTION public.profitability_by_clinic(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profitability_by_clinic(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_monthly_finance_summary WITH (security_invoker = on) AS
 SELECT month,
    sum(income) AS income,
    sum(expense) AS expense,
    sum(income) - sum(expense) AS profit
   FROM ( SELECT date_trunc('month'::text, i.issue_date::timestamp with time zone)::date AS month,
            COALESCE(i.amount_base, i.total * COALESCE(i.rate_at_time, 1::numeric)) AS income,
            0 AS expense
           FROM invoices i
          WHERE i.lab_id = get_my_lab_id() AND (i.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))
        UNION ALL
         SELECT date_trunc('month'::text, e.expense_date::timestamp with time zone)::date AS date_trunc,
            0,
            fn_to_base(e.lab_id, e.amount, e.currency, e.expense_date) AS fn_to_base
           FROM expenses e
          WHERE e.lab_id = get_my_lab_id()) sub
  GROUP BY month
  ORDER BY month DESC;

-- v_monthly_finance_summary_ccy: canlı tanım (sütunlar aynı → CREATE OR REPLACE, security_invoker açıkça)
CREATE OR REPLACE VIEW public.v_monthly_finance_summary_ccy WITH (security_invoker = on) AS
 SELECT month,
    currency,
    sum(income) AS income,
    sum(expense) AS expense,
    sum(income) - sum(expense) AS profit
   FROM ( SELECT date_trunc('month'::text, invoices.issue_date::timestamp with time zone)::date AS month,
            COALESCE(invoices.currency, 'TRY'::text) AS currency,
            invoices.total AS income,
            0 AS expense
           FROM invoices
          WHERE invoices.lab_id = get_my_lab_id() AND (invoices.status <> ALL (ARRAY['iptal'::text, 'taslak'::text]))
        UNION ALL
         SELECT date_trunc('month'::text, expenses.expense_date::timestamp with time zone)::date AS month,
            COALESCE(expenses.currency, 'TRY'::text) AS currency,
            0 AS income,
            expenses.amount AS expense
           FROM expenses
          WHERE expenses.lab_id = get_my_lab_id()) sub
  GROUP BY month, currency
  ORDER BY month DESC, currency;

CREATE OR REPLACE FUNCTION public.order_history(p_order uuid)
 RETURNS TABLE(at timestamp with time zone, kind text, category text, actor_name text, detail jsonb, link_order_id uuid, link_order_no text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_wo     public.work_orders;
  v_lab    boolean;   -- çağıran lab tarafı (lab/admin)
  v_fin    boolean;   -- lab: finans yetkisi
  v_cbill  boolean;   -- klinik/hekim: siparişin kliniğinde fatura yetkisi
  v_tz     text;
begin
  if p_order is null or not public.can_read_work_order(p_order) then
    raise exception 'Bu siparişin geçmişini görme yetkiniz yok.' using errcode = '42501';
  end if;

  select * into v_wo from public.work_orders w where w.id = p_order;
  v_lab := coalesce(public.my_user_type() in ('lab','admin'), false);
  v_fin := v_lab and coalesce(public.lab_can_view_finance(), false);
  v_cbill := (not v_lab) and coalesce(public.can_view_clinic_billing(
               coalesce((select d.clinic_id from public.doctors d where d.id = v_wo.doctor_id),
                        (select p.clinic_id from public.profiles p where p.id = v_wo.doctor_id))), false);
  v_tz := coalesce(public.lab_tz(v_wo.lab_id), 'Europe/Istanbul');

  return query
  with
  -- 20261027140000: yalnız siparişin KENDİ lab'ının kayıtları (başka lab'ın kullanıcısı bir sipariş
  -- kimliğiyle log_activity / doğrudan INSERT yazabiliyordu → sahte satır başka tenant'ın geçmişine düşerdi).
  logs as (
    select l.* from public.activity_logs l
     where l.lab_id = v_wo.lab_id
       and (l.entity_id = p_order
            or l.entity_id in (select s.id from public.order_stages s where s.work_order_id = p_order))
  ),
  -- Olgu satırları (alan/kalem/durum değişikliği, oluşturan, iptal, devir, red) yalnız sunucu
  -- tetikleyicisinin/düzenleme fonksiyonunun yazdığı kayıtlardan: activity_logs_trust_stamp
  -- istemcinin yazdığı satıra 'trusted' koymaz (siparişin tarafı da geçmişi uyduramaz).
  tlogs as (
    select l.* from logs l where l.metadata->>'trusted' = 'true'
  ),
  -- Task 2 alan değişikliği kaydı: metadata.fields = [{field, old, new} | {field, changed}]
  fchg as (
    select l.id, l.created_at, l.actor_id, l.actor_name, e.value as f, e.ordinality as ord
      from tlogs l
     cross join lateral jsonb_array_elements(
             case when jsonb_typeof(l.metadata->'fields') = 'array' then l.metadata->'fields' else '[]'::jsonb end
           ) with ordinality e
     where l.entity_type = 'work_order'
  ),
  first_dd as (select f.f->>'old' as v from fchg f where f.f->>'field' = 'delivery_date' order by f.created_at, f.ord limit 1),
  first_notes as (select f.f->>'old' as v from fchg f where f.f->>'field' = 'notes' order by f.created_at, f.ord limit 1),
  creator as (
    select l.actor_id, l.actor_name from tlogs l
     where l.entity_type = 'work_order' and l.action = 'İş emri oluşturdu'
     order by l.created_at limit 1
  ),
  ev(t, k, c, who, who_name, d, lid, lno) as (
    -- oluşturma: o anda söz verilen teslim günü (ilk teslim tarihi değişikliğinin eski değeri)
    select v_wo.created_at, 'created'::text, 'teslim'::text,
           (select cr.actor_id from creator cr), (select cr.actor_name from creator cr),
           -- değişiklik kaydı varsa İLK kaydın eski değeri (NULL olsa bile), yoksa bugünkü değer
           jsonb_build_object('delivery_date', case when exists (select 1 from first_dd) then (select x.v from first_dd x)
                                                    else v_wo.delivery_date::text end,
                              'is_urgent', v_wo.is_urgent, 'work_type', v_wo.work_type),
           null::uuid, null::text
    union all
    -- hekim notu: oluşturma anındaki metin
    select v_wo.created_at, 'doctor_note', 'notlar_sohbet',
           (select cr.actor_id from creator cr), (select cr.actor_name from creator cr),
           jsonb_build_object('text', left(n.v, 1000)), null, null
      from (select case when exists (select 1 from first_notes) then (select x.v from first_notes x)
                        else v_wo.notes end as v) n
     where nullif(btrim(n.v), '') is not null
    union all
    select f.created_at, 'delivery_date_changed', 'teslim', f.actor_id, f.actor_name,
           jsonb_build_object('old', f.f->>'old', 'new', f.f->>'new'), null, null
      from fchg f where f.f->>'field' = 'delivery_date'
    union all
    -- diğer alanlar: aynı kayıttaki alanlar tek satırda; lab notu klinik/hekime gösterilmez
    select min(f.created_at), 'field_changed', 'diger', (array_agg(f.actor_id))[1], min(f.actor_name),
           jsonb_build_object('fields', jsonb_agg(
             case when f.f ? 'changed' then jsonb_build_object('field', f.f->>'field', 'changed', true)
                  else jsonb_build_object('field', f.f->>'field', 'old', f.f->'old', 'new', f.f->'new') end
             order by f.ord)), null, null
      from fchg f
     where f.f->>'field' not in ('delivery_date', 'status')
       and (v_lab or f.f->>'field' not in ('lab_notes', 'manager_notes'))
     group by f.id
    union all
    -- eski biçim (client_update_order: fields nesnesi, eski değer yok): yalnız alan adları
    select l.created_at, 'field_changed', 'diger', l.actor_id, l.actor_name,
           jsonb_build_object('legacy', true, 'fields',
             (select coalesce(jsonb_agg(jsonb_build_object('field', k.key, 'changed', true)), '[]'::jsonb)
                from jsonb_object_keys(l.metadata->'fields') k(key)
               where v_lab or k.key not in ('lab_notes', 'manager_notes'))), null, null
      from tlogs l
     where l.entity_type = 'work_order' and jsonb_typeof(l.metadata->'fields') = 'object'
    union all
    -- kalemler (Task 2): fiyat alanları yalnız finans/fatura yetkilisine
    select l.created_at, 'items_changed', 'diger', l.actor_id, l.actor_name,
           jsonb_build_object('items',
             (select coalesce(jsonb_agg(case when v_fin or v_cbill then i.value
                                             else i.value - 'price_old' - 'price_new' - 'currency' end
                                        order by i.ordinality), '[]'::jsonb)
                from jsonb_array_elements(l.metadata->'items') with ordinality i)), null, null
      from tlogs l
     where l.entity_type = 'work_order' and jsonb_typeof(l.metadata->'items') = 'array'
    union all
    -- durum adımları; durum notu yalnız lab'a
    select s.created_at, 'status_changed',
           case when s.new_status::text in ('teslimata_hazir','kurye_bekleniyor','kuryede','teslim_edildi')
                then 'teslim' else 'uretim' end,
           s.changed_by, null,
           jsonb_build_object('old', s.old_status::text, 'new', s.new_status::text)
             || case when v_lab and nullif(btrim(s.note), '') is not null
                     then jsonb_build_object('note', s.note) else '{}'::jsonb end,
           null, null
      from public.status_history s where s.work_order_id = p_order
    union all
    -- durum adımları (Task 2 kaydı: status_history'ye yazmayan yollar)
    select f.created_at, 'status_changed',
           case when f.f->>'new' in ('teslimata_hazir','kurye_bekleniyor','kuryede','teslim_edildi')
                then 'teslim' else 'uretim' end,
           f.actor_id, f.actor_name,
           jsonb_build_object('old', f.f->>'old', 'new', f.f->>'new'), null, null
      from fchg f where f.f->>'field' = 'status'
    union all
    -- eski siparişler: teslim durumu status_history'ye yazılmadıysa delivered_at'ten
    select v_wo.delivered_at, 'status_changed', 'teslim', null, null,
           jsonb_build_object('new', 'teslim_edildi', 'derived', true), null, null
     where v_wo.delivered_at is not null
       and not exists (select 1 from public.status_history s
                        where s.work_order_id = p_order and s.new_status::text = 'teslim_edildi')
       and not exists (select 1 from fchg f where f.f->>'field' = 'status' and f.f->>'new' = 'teslim_edildi')
    union all
    select l.created_at, 'order_cancelled', 'diger', l.actor_id, l.actor_name, '{}'::jsonb, null, null
      from tlogs l where l.entity_type = 'work_order' and l.action = 'Siparişi iptal etti'
    union all
    -- aşamalar: yalnız lab
    select x.t, x.k, 'uretim', x.who, null,
           jsonb_build_object('station', st.name) || x.extra, null, null
      from public.order_stages s
      left join public.lab_stations st on st.id = s.station_id
     cross join lateral (values
        (s.assigned_at,  'stage_assigned',  null::uuid,
           jsonb_build_object('technician', public._order_history_name(s.technician_id, true))),
        (s.started_at,   'stage_started',   s.technician_id, '{}'::jsonb),
        (s.completed_at, 'stage_completed', s.technician_id, '{}'::jsonb),
        (s.approved_at,  'stage_approved',  s.approved_by,   '{}'::jsonb),
        (s.skipped_at,   'stage_skipped',   s.skipped_by,    jsonb_build_object('reason', s.skipped_reason))
      ) x(t, k, who, extra)
     where v_lab and s.work_order_id = p_order and x.t is not null
    union all
    -- teknisyen devri (Task 2 kaydı): yalnız lab
    select l.created_at, 'stage_reassigned', 'uretim', l.actor_id, l.actor_name,
           jsonb_build_object('from', public._order_history_name(nullif(l.metadata->>'from', '')::uuid, true),
                              'to',   public._order_history_name(nullif(l.metadata->>'to', '')::uuid, true),
                              'station', l.metadata->>'station'), null, null
      from tlogs l where v_lab and l.entity_type = 'stage' and l.action = 'Aşamayı devretti'
    union all
    -- kalite reddi (log_stage_activity kaydı): yalnız lab
    select l.created_at, 'stage_rejected', 'uretim', l.actor_id, l.actor_name,
           jsonb_build_object('station', l.metadata->>'station'), null, null
      from tlogs l where v_lab and l.entity_type = 'stage' and l.action = 'Aşamayı reddetti'
    union all
    -- malzeme tüketimi: yalnız lab; metadata'dan yalnız malzeme alanları (hasta adı alınmaz)
    select l.created_at, 'material_used', 'uretim', l.actor_id, l.actor_name,
           jsonb_build_object('item', l.metadata->>'item', 'qty', l.metadata->'qty', 'unit', l.metadata->>'unit',
                              'stage', l.metadata->>'stage'), null, null
      from logs l where v_lab and l.entity_type = 'material'
    union all
    -- bekleme: lab kaynaklı beklemenin nedeni klinik/hekime gösterilmez
    select h.started_at, 'hold_started', 'uretim', h.held_by, null,
           case when v_lab or h.responsible = 'client'
                then jsonb_build_object('reason', h.reason, 'category', h.category, 'responsible', h.responsible)
                     -- 20261102110000: başlangıç sonradan (geçmiş güne) girildiyse girildiği an
                     -- 20261102120000: devam ettirirken düzeltildiyse o an ve (bekleten değilse) giren kişi
                     || case when (coalesce(h.start_recorded_at, h.created_at) at time zone v_tz)::date > (h.started_at at time zone v_tz)::date
                             then jsonb_build_object('recorded_at', coalesce(h.start_recorded_at, h.created_at))
                                  || case when h.start_recorded_by is not null and h.start_recorded_by is distinct from h.held_by
                                          then jsonb_strip_nulls(jsonb_build_object('recorded_by', public._order_history_name(h.start_recorded_by, v_lab)))
                                          else '{}'::jsonb end
                             else '{}'::jsonb end
                else '{}'::jsonb end, null, null
      from public.work_order_holds h where h.work_order_id = p_order and h.started_at is not null
    union all
    select h.ended_at, 'hold_ended', 'uretim', h.resumed_by, null,
           case when v_lab or h.responsible = 'client'
                then jsonb_build_object('responsible', h.responsible, 'extended_days', h.extended_days)
                     -- 20261102110000: bitiş sonradan girildiyse girildiği an; teslimde kendiliğinden kapandıysa işaret
                     || case when h.end_recorded_at is not null
                              and (h.end_recorded_at at time zone v_tz)::date > (h.ended_at at time zone v_tz)::date
                             then jsonb_build_object('recorded_at', h.end_recorded_at) else '{}'::jsonb end
                     || case when h.end_source = 'delivered' then jsonb_build_object('on_delivery', true) else '{}'::jsonb end
                else '{}'::jsonb end, null, null
      from public.work_order_holds h where h.work_order_id = p_order and h.ended_at is not null
    union all
    -- kurye bacakları (ara gidişler dahil)
    select x.t, x.k, 'teslim', d.courier_id, case when d.courier_id is null then d.ext_courier_name end,
           jsonb_build_object('purpose', d.purpose, 'direction', d.direction, 'mode', d.mode,
                              'provider', d.external_provider) || x.extra, null, null
      from public.deliveries d
     cross join lateral (values
        (d.assigned_at,  'delivery_assigned',  '{}'::jsonb),
        (d.picked_up_at, 'delivery_picked_up', '{}'::jsonb),
        (d.delivered_at, 'delivery_delivered', jsonb_build_object('recipient_name', d.recipient_name)),
        (d.cancelled_at, 'delivery_cancelled',
           case when v_lab then jsonb_build_object('reason', d.cancel_reason) else '{}'::jsonb end)
      ) x(t, k, extra)
     where d.work_order_id = p_order and x.t is not null
    union all
    -- sohbet: klinik/hekim yalnız onaylı mesajları görür (order_messages kuralı)
    select m.created_at, 'message', 'notlar_sohbet', m.sender_id,
           case when m.sender_id is null then m.external_sender end,
           jsonb_build_object('text', left(m.content, 280), 'attachment_name', m.attachment_name,
                              'attachment_type', m.attachment_type), null, null
      from public.order_messages m
     where m.work_order_id = p_order and (v_lab or m.approval_status = 'approved')
       and coalesce(m.message_type, 'user') not in ('parts_request', 'parts_status')
    union all
    select p.created_at, 'photo', 'diger', p.uploaded_by, null,
           jsonb_build_object('name', regexp_replace(p.storage_path, '^.*/', ''), 'caption', p.caption), null, null
      from public.work_order_photos p where p.work_order_id = p_order
    union all
    -- değişiklik / iptal talepleri: talep ve karar ayrı satır; önerilen değerler değil alan adları
    select r.created_at, 'change_request', 'diger', r.requested_by, r.requester_name,
           jsonb_build_object('step', 'requested', 'items', r.proposed_items is not null, 'fields',
             (select coalesce(jsonb_agg(k.key), '[]'::jsonb)
                from jsonb_object_keys(case when jsonb_typeof(r.proposed_fields) = 'object'
                                            then r.proposed_fields else '{}'::jsonb end) k(key))), null, null
      from public.order_change_requests r where r.work_order_id = p_order
    union all
    select r.reviewed_at, 'change_request', 'diger', r.reviewed_by, null,
           jsonb_build_object('step', 'decided', 'status', r.status, 'note', r.review_note), null, null
      from public.order_change_requests r where r.work_order_id = p_order and r.reviewed_at is not null
    union all
    select r.created_at, 'cancel_request', 'diger', r.requested_by, r.requester_name,
           jsonb_build_object('step', 'requested', 'reason_code', r.reason_code, 'reason', r.reason_detail), null, null
      from public.order_cancellation_requests r where r.work_order_id = p_order
    union all
    select r.reviewed_at, 'cancel_request', 'diger', r.reviewed_by, null,
           jsonb_build_object('step', 'decided', 'status', r.status, 'note', r.review_note), null, null
      from public.order_cancellation_requests r where r.work_order_id = p_order and r.reviewed_at is not null
    union all
    -- prova: tarih alanları gün olarak tutuluyor → date_only (saat gösterilmez)
    select (pr.sent_date::timestamp at time zone v_tz), 'prova_sent', 'teslim', pr.created_by, null,
           jsonb_build_object('date_only', true, 'number', pr.prova_number, 'type', pr.prova_type,
                              'item', pr.order_item_name), null, null
      from public.provas pr where pr.work_order_id = p_order and pr.sent_date is not null
    union all
    select (pr.return_date::timestamp at time zone v_tz), 'prova_returned', 'teslim', null, null,
           jsonb_build_object('date_only', true, 'number', pr.prova_number, 'item', pr.order_item_name), null, null
      from public.provas pr where pr.work_order_id = p_order and pr.return_date is not null
    union all
    -- 20261027163000: hekimin "provayı geri gönderdim" işareti
    select pr.client_returned_at, 'prova_client_returned', 'teslim', pr.client_returned_by, null,
           jsonb_build_object('number', pr.prova_number, 'item', pr.order_item_name), null, null
      from public.provas pr where pr.work_order_id = p_order and pr.client_returned_at is not null
    union all
    -- 20261027163000: randevu kayıtları (appt_save / appt_remove / appt_review güvenilir log yazar)
    select l.created_at, 'appointment', 'teslim', l.actor_id, l.actor_name,
           jsonb_build_object('action', l.action, 'kind', l.metadata->>'kind', 'date', l.metadata->>'date',
                              'time', l.metadata->>'time', 'old_date', l.metadata->>'old_date',
                              'proposal', l.metadata->>'action'), null, null
      from tlogs l where l.entity_type = 'work_order' and l.action like 'Randevu%'
    union all
    -- hekim (tasarım) onayı
    select a.requested_at, 'approval_requested', 'uretim', a.requested_by, null,
           jsonb_build_object('step', a.step_name), null, null
      from public.approvals a where a.work_order_id = p_order and a.requested_at is not null
    union all
    select a.resolved_at, 'approval_decided', 'uretim', a.approved_by, null,
           jsonb_build_object('step', a.step_name, 'status', a.status, 'reason', a.rejection_reason), null, null
      from public.approvals a where a.work_order_id = p_order and a.resolved_at is not null
    union all
    select v_wo.doctor_approval_decided_at, 'approval_decided', 'uretim', v_wo.doctor_approval_decided_by, null,
           jsonb_build_object('status', v_wo.doctor_approval_status, 'override', v_wo.doctor_approval_admin_override),
           null, null
     where v_wo.doctor_approval_decided_at is not null
       and not exists (select 1 from public.approvals a where a.work_order_id = p_order and a.resolved_at is not null)
    union all
    select x.t, 'implant_part', 'diger', x.who, null,
           jsonb_build_object('step', x.st, 'tooth', ip.tooth_number, 'part_type', ip.part_type,
                              'quantity', ip.quantity), null, null
      from public.order_implant_parts ip
     cross join lateral (values
        (ip.requested_at, 'requested', ip.requested_by),
        (ip.ordered_at,   'ordered',   ip.ordered_by),
        (ip.received_at,  'received',  ip.received_by),
        (ip.returned_at,  'returned',  ip.returned_by),
        (ip.cancelled_at, 'cancelled', ip.cancelled_by)
      ) x(t, st, who)
     where ip.work_order_id = p_order and x.t is not null
    union all
    select rv.created_at, 'review', 'notlar_sohbet', rv.rater_id, null,
           jsonb_build_object('overall', rv.overall, 'comment', left(rv.comment, 280)), null, null
      from public.order_reviews rv where rv.work_order_id = p_order
    union all
    -- fatura (kesilmiş) ve tahsilat: yalnız yetkiliye
    select (i.issue_date::timestamp at time zone v_tz), 'invoice_issued', 'diger', null, null,
           jsonb_build_object('date_only', true, 'invoice_number', i.invoice_number, 'status', i.status,
                              'total', i.total, 'currency', i.currency), null, null
      from public.invoices i
     where i.work_order_id = p_order and i.issue_date is not null
       and i.status in ('kesildi', 'kismi_odendi', 'odendi')
       and (v_fin or ((not v_lab) and public.can_view_clinic_billing(i.clinic_id)))
    union all
    select py.created_at, 'payment', 'diger', py.received_by, null,
           jsonb_build_object('amount', py.amount, 'currency', py.currency, 'method', py.payment_method,
                              'payment_date', py.payment_date), null, null
      from public.payments py
      join public.invoices i on i.id = py.invoice_id
     where i.work_order_id = p_order
       and (v_fin or ((not v_lab) and public.can_view_clinic_billing(i.clinic_id)))
    union all
    -- revizyon ve devam bağları (iki yönlü); karşı siparişi okuyamayan bağlantıyı görmez
    select c.created_at, 'revision_opened', 'diger', null, null,
           jsonb_build_object('revision_no', c.revision_no)
             || case when v_lab then jsonb_build_object('reason', c.revision_reason, 'responsible', c.revision_responsible)
                     else '{}'::jsonb end,
           c.id, c.order_number
      from public.work_orders c
     where c.revision_of_id = p_order and public.can_read_work_order(c.id)
    union all
    select v_wo.created_at, 'revision_of', 'diger', null, null,
           jsonb_build_object('revision_no', v_wo.revision_no)
             || case when v_lab then jsonb_build_object('reason', v_wo.revision_reason, 'responsible', v_wo.revision_responsible)
                     else '{}'::jsonb end,
           par.id, par.order_number
      from public.work_orders par
     where par.id = v_wo.revision_of_id and public.can_read_work_order(par.id)
    union all
    select c.created_at, 'continuation_opened', 'diger', null, null, '{}'::jsonb, c.id, c.order_number
      from public.work_orders c
     where c.continues_order_id = p_order and public.can_read_work_order(c.id)
    union all
    select v_wo.created_at, 'continuation_of', 'diger', null, null, '{}'::jsonb, par.id, par.order_number
      from public.work_orders par
     where par.id = v_wo.continues_order_id and public.can_read_work_order(par.id)
    union all
    -- 20261028143000: tarama randevusu olayları (karar/geri alma; metadata.work_order_id) — YALNIZ lab
    select sl.created_at, 'scan', 'diger', sl.actor_id, sl.actor_name,
           jsonb_build_object('action', sl.action, 'decision', sl.metadata->>'decision',
                              'appointment_id', sl.entity_id, 'label', sl.entity_label), null, null
      from public.activity_logs sl
     where v_lab and sl.lab_id = v_wo.lab_id and sl.entity_type = 'scan_appointment'
       -- 20261028147000: yalnız taramayı görebilen (view_/manage_) ya da randevu kendisine atanmış teknisyen
       and (public._scan_can_view()
            or exists (select 1 from public.scan_appointments sa where sa.id = sl.entity_id and sa.technician_id = auth.uid()))
       and sl.metadata->>'trusted' = 'true'
       and sl.metadata->>'work_order_id' = p_order::text
  )
  select ev.t, ev.k, ev.c,
         coalesce(public._order_history_name(ev.who, v_lab),
                  case when ev.who is null or v_lab then nullif(ev.who_name, '') end),
         ev.d, ev.lid, ev.lno
    from ev
   where ev.t is not null
   order by ev.t,
            case ev.k when 'created' then 0 when 'revision_of' then 1 when 'continuation_of' then 1
                      when 'doctor_note' then 2 else 3 end;
end;
$function$;

COMMIT;
