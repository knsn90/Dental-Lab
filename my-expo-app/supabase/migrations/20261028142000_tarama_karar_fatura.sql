-- ════════════════════════════════════════════════════════════════════════════
-- Tarama randevuları — karar ve faturalama (plan Task 6)
-- spec: docs/superpowers/specs/2026-10-28-tarama-randevulari-design.md (4.7, 4.8)
--
-- Ücret birimi hasta × hizmet (scan_patient_charges). Fiyat resolve_item_price (klinik fiyatı →
-- kampanya → katalog), karar anında kopyalanır. Yönlendirme (spec 4.8 tablosu):
--   bağlı + "siparişe dönerse ücretsiz"     → ucretsiz, fatura satırı yok
--   bağlı + ücretli, siparişin taslak faturası (aynı para birimi) → hemen o taslağa
--   bağlı + ücretli, sipariş henüz faturasız (aynı para birimi)   → bill_with_order (sipariş faturalanınca)
--   bağlı ama fatura kesilmiş / para birimi farklı, ya da yalnız tarama → ayrı:
--        per_order klinik → yeni taslak (klinik + para birimi başına tek); monthly_bulk → havuz
-- Faturalanmış = status 'ucretli' + invoice_item_id dolu; havuz = 'ucretli' + boş + bill_with_order=false.
-- Mevcut fonksiyonlara (canlı tanımları .before'ta) yalnız EKLEME: create_invoice_from_order,
-- create_bulk_invoice, fn_generate_monthly_invoices, trg_maintain_urgent_surcharge.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Yardımcılar ──

-- Siparişin fatura para birimi: create_invoice_from_order'ın kuralı (en büyük kalem tutarının
-- para birimi, yoksa lab varsayılanı)
create or replace function public._scan_order_currency(p_wo uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare v_lab uuid; v_base text; v_cur text;
begin
  select lab_id into v_lab from public.work_orders where id = p_wo;
  select coalesce(default_currency, 'TRY') into v_base from public.lab_settings where lab_id = v_lab;
  v_base := coalesce(v_base, 'TRY');
  select coalesce(oi.currency, v_base) into v_cur
    from public.order_items oi where oi.work_order_id = p_wo
   group by coalesce(oi.currency, v_base)
   order by sum(oi.quantity::numeric * oi.price) desc nulls last limit 1;
  return coalesce(v_cur, v_base);
end $$;

-- Siparişlerle faturalanacak, henüz faturaya yazılmamış tarama ücretleri (para birimi eşit)
create or replace function public._scan_order_charge_ids(p_wo_ids uuid[], p_currency text)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(c.id), '{}')
    from public.scan_patient_charges c join public.scan_patients p on p.id = c.scan_patient_id
   where c.status = 'ucretli' and c.invoice_item_id is null and c.bill_with_order
     and p.work_order_id = any (coalesce(p_wo_ids, '{}')) and p.decision in ('siparise_baglandi', 'yeni_siparis')
     and c.currency = p_currency;
$$;

-- Kliniğin "ayrı faturalanacak" havuzu; p_currency NULL ise bütün para birimleri
create or replace function public._scan_pool_charge_ids(p_clinic uuid, p_currency text)
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(c.id), '{}')
    from public.scan_patient_charges c
    join public.scan_patients p on p.id = c.scan_patient_id
    join public.scan_appointments a on a.id = p.appointment_id
   where c.status = 'ucretli' and c.invoice_item_id is null and c.bill_with_order = false
     and a.clinic_id = p_clinic and (p_currency is null or c.currency = p_currency);
$$;

-- Ücretleri faturaya satır olarak yazar: "<hizmet> · GG.AA.YYYY", 1 × fiyat. Para birimi farklı
-- ya da zaten faturalanmış ücret atlanır. Satırlar bağlandıktan sonra acil ek ücret hesabı
-- yeniden tetiklenir (tetikleyici tarama satırlarını dışlar). Dönüş: yazılan satır sayısı.
create or replace function public._scan_bill_charges(p_invoice uuid, p_charge_ids uuid[])
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_inv public.invoices; v_n int := 0; v_sort int; v_item uuid; r record;
begin
  if p_invoice is null or p_charge_ids is null or cardinality(p_charge_ids) = 0 then return 0; end if;
  select * into v_inv from public.invoices where id = p_invoice;
  if v_inv.id is null or v_inv.status <> 'taslak' then return 0; end if;
  select coalesce(max(sort_order), 0) into v_sort from public.invoice_items where invoice_id = p_invoice;
  for r in
    select c.id, coalesce(c.price, 0) as price, s.name, a.starts_at, a.lab_id
      from public.scan_patient_charges c
      join public.scan_patients p on p.id = c.scan_patient_id
      join public.scan_appointments a on a.id = p.appointment_id
      join public.lab_services s on s.id = c.service_id
     where c.id = any (p_charge_ids) and c.status = 'ucretli' and c.invoice_item_id is null
       and c.currency = v_inv.currency and a.lab_id = v_inv.lab_id
     order by a.starts_at, p.created_at, s.name
     for update of c
  loop
    v_sort := v_sort + 1;
    insert into public.invoice_items (invoice_id, description, quantity, unit_price, sort_order)
    values (p_invoice, coalesce(r.name, '') || ' · ' || to_char(r.starts_at at time zone public._scan_tz(r.lab_id), 'DD.MM.YYYY'),
            1, r.price, v_sort)
    returning id into v_item;
    update public.scan_patient_charges set invoice_item_id = v_item where id = r.id;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    update public.invoice_items set sort_order = sort_order where id = v_item;
  end if;
  return v_n;
end $$;

-- Tarama için kliniğe yeni taslak fatura (siparişsiz)
create or replace function public._scan_new_draft(p_clinic uuid, p_currency text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_lab uuid; v_days int; v_id uuid;
begin
  select lab_id, coalesce(default_payment_terms_days, 30) into v_lab, v_days from public.clinics where id = p_clinic;
  insert into public.invoices (lab_id, clinic_id, status, issue_date, due_date, currency, notes, created_by)
  values (v_lab, p_clinic, 'taslak', current_date, current_date + v_days, p_currency, 'Tarama hizmeti', auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Kliniğin havuzundaki ücretleri para birimi başına birer taslakta toplar
create or replace function public._scan_monthly_pool_invoices(p_clinic uuid)
returns uuid[] language plpgsql security definer set search_path to 'public' as $$
declare r record; v_id uuid; v_out uuid[] := '{}';
begin
  for r in
    select c.currency, array_agg(c.id) as ids
      from public.scan_patient_charges c
     where c.id = any (public._scan_pool_charge_ids(p_clinic, null))
     group by c.currency
  loop
    v_id := public._scan_new_draft(p_clinic, r.currency);
    perform public._scan_bill_charges(v_id, r.ids);
    v_out := v_out || v_id;
  end loop;
  return v_out;
end $$;

-- Kararı geri alma çekirdeği. p_reason NULL: kullanıcı geri alıyor (kesilmiş faturada hata).
-- p_reason dolu: sipariş iptali (kesilmiş faturada sessizce false; sipariş bağı da kalkar).
create or replace function public._scan_undo_core(p_patient uuid, p_reason text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_p public.scan_patients; v_inv uuid[];
begin
  select * into v_p from public.scan_patients where id = p_patient for update;
  if v_p.id is null or v_p.decision is null then return false; end if;
  if exists (select 1 from public.scan_patient_charges ch
               join public.invoice_items ii on ii.id = ch.invoice_item_id
               join public.invoices i on i.id = ii.invoice_id
              where ch.scan_patient_id = p_patient and i.status not in ('taslak', 'iptal')) then
    if p_reason is null then
      raise exception 'Bu tarama kesilmiş bir faturada; önce faturayı iptal edin' using errcode = 'P0001';
    end if;
    return false;
  end if;
  select array_agg(distinct ii.invoice_id) into v_inv
    from public.scan_patient_charges ch join public.invoice_items ii on ii.id = ch.invoice_item_id
   where ch.scan_patient_id = p_patient;
  delete from public.invoice_items ii
   using public.scan_patient_charges ch, public.invoices i
   where ch.scan_patient_id = p_patient and ii.id = ch.invoice_item_id
     and i.id = ii.invoice_id and i.status = 'taslak';
  delete from public.invoices i
   where i.id = any (coalesce(v_inv, '{}')) and i.status = 'taslak' and i.work_order_id is null
     and not exists (select 1 from public.invoice_items x where x.invoice_id = i.id)
     and not exists (select 1 from public.invoice_orders o where o.invoice_id = i.id);
  update public.scan_patient_charges
     set status = 'beklemede', price = null, currency = null, price_source = null,
         bill_with_order = null, invoice_item_id = null
   where scan_patient_id = p_patient;
  update public.scan_patients
     set status = 'karar_bekliyor', decision = null, decided_by = null, decided_at = null,
         work_order_id = case when p_reason is not null then null else work_order_id end
   where id = p_patient;
  perform public._scan_appt_refresh_status(v_p.appointment_id);
  perform public.log_activity(
    case when p_reason is null then 'Tarama kararını geri aldı' else 'Tarama yeniden karar bekliyor · sipariş iptal edildi' end,
    'scan_appointment', v_p.appointment_id, public._scan_appt_label(v_p.appointment_id),
    jsonb_build_object('work_order_id', v_p.work_order_id, 'scan_patient_id', p_patient, 'decision', v_p.decision),
    v_p.lab_id);
  return true;
end $$;

-- ── scan_decide ──
create or replace function public.scan_decide(p_patient_ids uuid[], p_decision text, p_work_order uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_lab uuid := public.get_my_lab_id();
  r record; c record; g record;
  v_n int := 0;
  v_appts uuid[] := '{}';
  v_invoices uuid[] := '{}';
  v_standalone uuid[] := '{}';
  v_pooled int := 0; v_free int := 0;
  v_ocur text; v_inv uuid; v_inv_status text; v_inv_cur text; v_id uuid; v_a uuid;
  v_price numeric; v_cur text; v_src text;
begin
  if v_lab is null or not public._scan_enabled(v_lab) then
    raise exception 'Tarama randevuları bu lab için kapalı' using errcode = 'P0001';
  end if;
  if not public._scan_can_manage() then
    raise exception 'Karar yalnız admin ya da yöneticiye açık' using errcode = 'P0001';
  end if;
  if p_decision is null or p_decision not in ('siparise_baglandi', 'yeni_siparis', 'yalniz_tarama')
     or p_patient_ids is null or cardinality(p_patient_ids) = 0
     or (p_decision <> 'yalniz_tarama' and (cardinality(p_patient_ids) <> 1 or p_work_order is null)) then
    raise exception 'Geçersiz karar' using errcode = 'P0001';
  end if;
  if p_decision <> 'yalniz_tarama' then
    if exists (select 1 from public.work_orders where id = p_work_order and status = 'iptal') then
      raise exception 'İptal edilmiş siparişe bağlanamaz' using errcode = 'P0001';
    end if;
    v_ocur := public._scan_order_currency(p_work_order);
    select i.id, i.status, i.currency into v_inv, v_inv_status, v_inv_cur
      from public.invoice_orders io join public.invoices i on i.id = io.invoice_id
     where io.work_order_id = p_work_order and i.status <> 'iptal' limit 1;
  end if;

  for r in
    select p.id, p.appointment_id, p.status, p.decision, a.clinic_id, a.status as appt_status,
           a.starts_at, a.lab_id as alab
      from public.scan_patients p join public.scan_appointments a on a.id = p.appointment_id
     where p.id = any (p_patient_ids)
     order by p.id
     for update of p, a
  loop
    v_n := v_n + 1;
    if r.alab <> v_lab then raise exception 'Tarama randevusu bulunamadı' using errcode = 'P0001'; end if;
    if r.appt_status not in ('yapildi', 'kapandi') then
      raise exception 'Önce "Tarama yapıldı" deyin' using errcode = 'P0001';
    end if;
    if r.status <> 'karar_bekliyor' or r.decision is not null then
      raise exception 'Bu tarama zaten karara bağlanmış' using errcode = 'P0001';
    end if;
    if p_decision <> 'yalniz_tarama' and not exists (
         select 1 from public.work_orders w
          where w.id = p_work_order and w.lab_id = v_lab and public._resolve_wo_clinic_id(w.id) = r.clinic_id) then
      raise exception 'Sipariş bu kliniğe ait değil' using errcode = 'P0001';
    end if;

    for c in
      select ch.id, ch.service_id, s.scan_free_if_order
        from public.scan_patient_charges ch join public.lab_services s on s.id = ch.service_id
       where ch.scan_patient_id = r.id
       for update of ch
    loop
      select rp.price, rp.currency, rp.source into v_price, v_cur, v_src
        from public.resolve_item_price(v_lab, c.service_id, r.clinic_id,
                                       (r.starts_at at time zone public._scan_tz(v_lab))::date) rp;
      update public.scan_patient_charges
         set price = coalesce(v_price, 0), currency = coalesce(v_cur, 'TRY'), price_source = v_src
       where id = c.id;
      v_cur := coalesce(v_cur, 'TRY');
      if p_decision <> 'yalniz_tarama' and c.scan_free_if_order then
        update public.scan_patient_charges set status = 'ucretsiz', bill_with_order = null where id = c.id;
        v_free := v_free + 1;
      elsif p_decision <> 'yalniz_tarama' and v_inv is not null and v_inv_status = 'taslak' and v_inv_cur = v_cur then
        update public.scan_patient_charges set status = 'ucretli', bill_with_order = true where id = c.id;
        perform public._scan_bill_charges(v_inv, array[c.id]);
        if not (v_inv = any (v_invoices)) then v_invoices := v_invoices || v_inv; end if;
      elsif p_decision <> 'yalniz_tarama' and v_inv is null and v_ocur = v_cur then
        update public.scan_patient_charges set status = 'ucretli', bill_with_order = true where id = c.id;
      else
        update public.scan_patient_charges set status = 'ucretli', bill_with_order = false where id = c.id;
        v_standalone := v_standalone || c.id;
      end if;
    end loop;

    update public.scan_patients
       set status = 'kapandi', decision = p_decision,
           work_order_id = case when p_decision = 'yalniz_tarama' then null else p_work_order end,
           decided_by = auth.uid(), decided_at = now()
     where id = r.id;
    if not (r.appointment_id = any (v_appts)) then v_appts := v_appts || r.appointment_id; end if;
    perform public.log_activity('Tarama kararı verdi', 'scan_appointment', r.appointment_id,
                                public._scan_appt_label(r.appointment_id),
                                jsonb_build_object('work_order_id', p_work_order, 'decision', p_decision,
                                                   'scan_patient_id', r.id));
  end loop;
  if v_n <> cardinality(p_patient_ids) then
    raise exception 'Tarama randevusu bulunamadı' using errcode = 'P0001';
  end if;

  -- ayrı faturalananlar: klinik + para birimi başına
  for g in
    select a.clinic_id, ch.currency, array_agg(ch.id) as ids, coalesce(cl.billing_mode, 'monthly_bulk') as mode
      from public.scan_patient_charges ch
      join public.scan_patients p on p.id = ch.scan_patient_id
      join public.scan_appointments a on a.id = p.appointment_id
      join public.clinics cl on cl.id = a.clinic_id
     where ch.id = any (v_standalone)
     group by a.clinic_id, ch.currency, coalesce(cl.billing_mode, 'monthly_bulk')
  loop
    if g.mode = 'per_order' then
      v_id := public._scan_new_draft(g.clinic_id, g.currency);
      perform public._scan_bill_charges(v_id, g.ids);
      v_invoices := v_invoices || v_id;
    else
      v_pooled := v_pooled + cardinality(g.ids);
    end if;
  end loop;

  foreach v_a in array v_appts loop
    perform public._scan_appt_refresh_status(v_a);
  end loop;
  return jsonb_build_object('invoices', to_jsonb(v_invoices), 'pooled', v_pooled, 'free', v_free);
end $$;

-- ── scan_undo_decision ──
create or replace function public.scan_undo_decision(p_patient uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_lab uuid := public.get_my_lab_id(); v_appt uuid;
begin
  if v_lab is null or not public._scan_enabled(v_lab) then
    raise exception 'Tarama randevuları bu lab için kapalı' using errcode = 'P0001';
  end if;
  if not public._scan_can_manage() then
    raise exception 'Karar yalnız admin ya da yöneticiye açık' using errcode = 'P0001';
  end if;
  select p.appointment_id into v_appt from public.scan_patients p
    join public.scan_appointments a on a.id = p.appointment_id
   where p.id = p_patient and a.lab_id = v_lab;
  if v_appt is null then raise exception 'Tarama randevusu bulunamadı' using errcode = 'P0001'; end if;
  perform 1 from public.scan_appointments where id = v_appt for update;
  perform public._scan_undo_core(p_patient, null);
end $$;

-- ── scan_create_pool_invoice: aylık klinikte "yalnız tarama" havuzunu elle faturala ──
create or replace function public.scan_create_pool_invoice(p_clinic uuid)
returns uuid[] language plpgsql security definer set search_path to 'public' as $$
declare v_lab uuid := public.get_my_lab_id();
begin
  if v_lab is null or not public._scan_enabled(v_lab) then
    raise exception 'Tarama randevuları bu lab için kapalı' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clinics where id = p_clinic and lab_id = v_lab) then
    raise exception 'Klinik bu lab''a ait değil' using errcode = 'P0001';
  end if;
  if not (public._scan_can_manage() and coalesce(public.lab_can_manage_invoices(), false)) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = 'P0001';
  end if;
  return public._scan_monthly_pool_invoices(p_clinic);
end $$;

revoke all on function
  public._scan_order_currency(uuid), public._scan_order_charge_ids(uuid[], text),
  public._scan_pool_charge_ids(uuid, text), public._scan_bill_charges(uuid, uuid[]),
  public._scan_new_draft(uuid, text), public._scan_monthly_pool_invoices(uuid),
  public._scan_undo_core(uuid, text)
  from public, anon, authenticated;
revoke all on function
  public.scan_decide(uuid[], text, uuid), public.scan_undo_decision(uuid), public.scan_create_pool_invoice(uuid)
  from public, anon;
grant execute on function
  public.scan_decide(uuid[], text, uuid), public.scan_undo_decision(uuid), public.scan_create_pool_invoice(uuid)
  to authenticated;

-- ── Mevcut fonksiyonlara eklemeler ──
CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_work_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_doctor_id  UUID;
  v_clinic_id  UUID;
  v_due_date   DATE;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_subtotal   NUMERIC;
  v_base       TEXT;
  v_currency   TEXT;
BEGIN
  SELECT wo.lab_id, wo.doctor_id, d.clinic_id, wo.is_urgent
    INTO v_lab_id, v_doctor_id, v_clinic_id, v_is_urgent
  FROM work_orders wo
  LEFT JOIN doctors d ON d.id = wo.doctor_id
  WHERE wo.id = p_work_order_id;

  IF v_lab_id IS NULL THEN
    RAISE EXCEPTION 'work_order bulunamadı veya lab_id yok';
  END IF;

  -- C-1 tenant guard: an authenticated caller must own the work order's lab
  -- (same rule as invoices_lab_insert RLS). NULL auth.uid() = trusted internal/
  -- service/trigger context (anon EXECUTE is revoked below, so anon cannot reach here).
  IF auth.uid() IS NOT NULL
     AND NOT (v_lab_id = get_my_lab_id() OR is_platform_admin()) THEN
    RAISE EXCEPTION 'yetkisiz: bu iş emri için fatura oluşturamazsınız (lab %)', v_lab_id
      USING errcode = '42501';
  END IF;

  -- 20261025168000: doğrudan (RPC) fatura oluşturma yalnız faturaları yönetebilene açık.
  -- Tetikleyici yolu (teslimde otomatik taslak) serbest: teslimi yapanın finans yetkisi olmayabilir.
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0
     AND NOT public.lab_can_manage_invoices() THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.' USING errcode = '42501';
  END IF;

  SELECT io.invoice_id INTO v_invoice_id
  FROM invoice_orders io
  JOIN invoices i ON i.id = io.invoice_id
  WHERE io.work_order_id = p_work_order_id AND i.status <> 'iptal'
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    RETURN v_invoice_id;
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base
    FROM lab_settings WHERE lab_id = v_lab_id;
  v_base := COALESCE(v_base, 'TRY');

  SELECT COALESCE(oi.currency, v_base) INTO v_currency
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id
  GROUP BY COALESCE(oi.currency, v_base)
  ORDER BY SUM(oi.quantity::numeric * oi.price) DESC NULLS LAST
  LIMIT 1;

  v_currency := COALESCE(v_currency, v_base);

  v_due_date := CURRENT_DATE + INTERVAL '30 days';

  INSERT INTO invoices (lab_id, doctor_id, clinic_id, work_order_id,
                        status, issue_date, due_date, currency, created_by)
  VALUES (v_lab_id, v_doctor_id, v_clinic_id, p_work_order_id,
          'taslak', CURRENT_DATE, v_due_date, v_currency, auth.uid())
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_orders (invoice_id, work_order_id, lab_id)
  VALUES (v_invoice_id, p_work_order_id, v_lab_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO invoice_items (invoice_id, order_item_id, description, quantity, unit_price, sort_order)
  SELECT v_invoice_id, oi.id, oi.name, oi.quantity, oi.price,
         ROW_NUMBER() OVER (ORDER BY oi.created_at)
  FROM order_items oi
  WHERE oi.work_order_id = p_work_order_id;

  IF NOT EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = v_invoice_id) THEN
    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
    SELECT v_invoice_id,
           COALESCE(work_type, 'Laboratuvar hizmeti') ||
             CASE
               WHEN tooth_numbers IS NOT NULL AND array_length(tooth_numbers, 1) > 0
               THEN ' (Dişler: ' || array_to_string(tooth_numbers, ', ') || ')'
               ELSE ''
             END,
           GREATEST(COALESCE(array_length(tooth_numbers, 1), 1), 1),
           0,
           1
    FROM work_orders WHERE id = p_work_order_id;
  END IF;

  IF v_is_urgent THEN
    SELECT COALESCE(urgent_surcharge_rate, 0) INTO v_rate
      FROM lab_settings WHERE lab_id = v_lab_id;
    IF v_rate > 0 THEN
      SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_subtotal
        FROM invoice_items WHERE invoice_id = v_invoice_id;
      IF v_subtotal > 0 THEN
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
        VALUES (v_invoice_id,
                'Acil Ek Ücret (%' || trim(to_char(v_rate, 'FM999990.##')) || ')',
                1,
                ROUND(v_subtotal * v_rate / 100.0, 2),
                COALESCE((SELECT MAX(sort_order) FROM invoice_items WHERE invoice_id = v_invoice_id), 0) + 1);
      END IF;
    END IF;
  END IF;

  -- Tarama ücretleri (20261028142000): bu siparişe bağlı, siparişle faturalanacak satırlar.
  -- Acil ek ücretten SONRA eklenir → taramaya acil ek ücret uygulanmaz.
  PERFORM public._scan_bill_charges(v_invoice_id, public._scan_order_charge_ids(ARRAY[p_work_order_id], v_currency));

  RETURN v_invoice_id;
END;
$function$;

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
  IF auth.uid() IS NULL
     OR NOT (v_lab_id = get_my_lab_id() OR is_platform_admin()) THEN
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
          'taslak', CURRENT_DATE,
          CURRENT_DATE + (p_due_days || ' days')::INTERVAL,
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

CREATE OR REPLACE FUNCTION public.fn_generate_monthly_invoices()
 RETURNS TABLE(clinic_id uuid, invoice_id uuid, work_order_count integer, error_msg text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic   RECORD;
  v_orders   uuid[];
  v_due_days int;
  v_inv_id   uuid;
  v_err      text;
BEGIN
  FOR v_clinic IN
    SELECT c.id, COALESCE(c.default_payment_terms_days, 30) AS due_days
    FROM clinics c
    WHERE c.is_active = TRUE
      AND COALESCE(c.billing_mode, 'monthly_bulk') = 'monthly_bulk'
  LOOP
    -- Bu klinik için faturalanmamış teslim edilmiş siparişleri topla
    SELECT array_agg(work_order_id)
    INTO v_orders
    FROM v_unbilled_work_orders
    WHERE clinic_id = v_clinic.id;

    IF v_orders IS NULL OR array_length(v_orders, 1) IS NULL THEN
      -- 20261028142000: faturalanmamış iş emri yok ama "yalnız tarama" havuzu doluysa ayrı taslak
      IF cardinality(public._scan_pool_charge_ids(v_clinic.id, NULL)) > 0 THEN
        BEGIN
          v_inv_id := (public._scan_monthly_pool_invoices(v_clinic.id))[1];
          v_err := NULL;
        EXCEPTION WHEN OTHERS THEN
          v_inv_id := NULL;
          v_err := SQLERRM;
        END;
        clinic_id        := v_clinic.id;
        invoice_id       := v_inv_id;
        work_order_count := 0;
        error_msg        := v_err;
        RETURN NEXT;
      END IF;
      CONTINUE;
    END IF;

    -- create_bulk_invoice'i çağır (taslak fatura oluşur)
    BEGIN
      v_inv_id := public.create_bulk_invoice(
        v_clinic.id,
        v_orders,
        v_clinic.due_days,
        format('Aylık toplu fatura — %s', to_char(now() - interval '1 month', 'TMMonth YYYY'))
      );
      v_err := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_inv_id := NULL;
      v_err    := SQLERRM;
    END;

    clinic_id        := v_clinic.id;
    invoice_id       := v_inv_id;
    work_order_count := array_length(v_orders, 1);
    error_msg        := v_err;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_maintain_urgent_surcharge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id UUID;
  v_lab_id     UUID;
  v_status     TEXT;
  v_is_urgent  BOOLEAN;
  v_rate       NUMERIC;
  v_base       NUMERIC;
  v_surcharge  NUMERIC;
  v_acil_id    UUID;
  v_desc       TEXT;
BEGIN
  -- Kendi UPDATE/INSERT/DELETE'imizin tetiklediği yeniden girişleri engelle
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT i.lab_id, i.status INTO v_lab_id, v_status
  FROM invoices i WHERE i.id = v_invoice_id;
  IF v_lab_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF v_status = 'iptal' THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT EXISTS (
    SELECT 1 FROM work_orders wo
      WHERE wo.id = (SELECT work_order_id FROM invoices WHERE id = v_invoice_id)
        AND wo.is_urgent
    UNION ALL
    SELECT 1 FROM invoice_orders io
      JOIN work_orders wo ON wo.id = io.work_order_id
      WHERE io.invoice_id = v_invoice_id AND wo.is_urgent
  ) INTO v_is_urgent;

  SELECT COALESCE(urgent_surcharge_rate, 0) INTO v_rate
    FROM lab_settings WHERE lab_id = v_lab_id;

  -- Mevcut acil satırının id'sini tut (varsa) — DELETE/INSERT yerine UPDATE için
  SELECT id INTO v_acil_id
    FROM invoice_items
    WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%'
    ORDER BY created_at ASC LIMIT 1;

  -- Olası fazladan (mükerrer) acil satırlarını temizle — yalnız birini koru
  IF v_acil_id IS NOT NULL THEN
    DELETE FROM invoice_items
      WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%' AND id <> v_acil_id;
  END IF;

  IF COALESCE(v_is_urgent, false) AND COALESCE(v_rate, 0) > 0 THEN
    -- Baz: acil DIŞINDAKI kalemlerin brütü (kendi üstüne bindirmesin)
    SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_base
      FROM invoice_items
      WHERE invoice_id = v_invoice_id AND description NOT LIKE 'Acil Ek Ücret (%'
        -- 20261028142000: tarama satırları acil ek ücrete girmez
        AND NOT EXISTS (SELECT 1 FROM scan_patient_charges sc WHERE sc.invoice_item_id = invoice_items.id);

    v_surcharge := ROUND(v_base * v_rate / 100.0, 2);
    v_desc := 'Acil Ek Ücret (%' || trim(to_char(v_rate, 'FM999990.##')) || ')';

    IF v_surcharge > 0 THEN
      IF v_acil_id IS NOT NULL THEN
        -- VAR: yalnız tutar/başlık güncellenir → discount_* KORUNUR, id sabit
        UPDATE invoice_items
          SET unit_price = v_surcharge, quantity = 1, description = v_desc
          WHERE id = v_acil_id;
      ELSE
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order)
        VALUES (v_invoice_id, v_desc, 1, v_surcharge,
                COALESCE((SELECT MAX(sort_order) FROM invoice_items WHERE invoice_id = v_invoice_id), 0) + 1);
      END IF;
    ELSE
      -- surcharge 0 → acil satırı olmamalı
      DELETE FROM invoice_items
        WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%';
    END IF;
  ELSE
    -- acil değil → acil satırı olmamalı
    DELETE FROM invoice_items
      WHERE invoice_id = v_invoice_id AND description LIKE 'Acil Ek Ücret (%';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
