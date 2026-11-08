-- 20261108100000_tahsilat_alacak_secim.down.sql — önceki canlı tanımlara döner (.before.txt ile birebir).
-- Yeni çekirdek, tetikleyici ve tetikleyici fonksiyonu düşer; dört fonksiyon eski imzasıyla, ACL'si proacl ile aynı.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP TRIGGER IF EXISTS zz_tr_invoice_receipt_credit ON public.invoices;
DROP FUNCTION IF EXISTS public._trg_invoice_apply_receipt_credit();

-- apply_clinic_credit: önceki gövde (CREATE OR REPLACE → ACL korunur)
CREATE OR REPLACE FUNCTION public.apply_clinic_credit(p_clinic_id uuid, p_receipt_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab     uuid;
  v_r       RECORD;
  v_credit  numeric;
  v_applied numeric;
  v_total   numeric := 0;
  v_count   int := 0;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  FOR v_r IN
    SELECT id, receipt_date, payment_method, base_currency,
           total_base - allocated_base AS credit
      FROM clinic_receipts
     WHERE clinic_id = p_clinic_id
       AND total_base > allocated_base
       AND (p_receipt_id IS NULL OR id = p_receipt_id)
     ORDER BY receipt_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    v_credit := v_r.credit;
    CONTINUE WHEN v_credit <= 0;
    -- Ödeme tarihi lab'ın yerel günü (CURRENT_DATE UTC'dir; gece yarısından sonra dün olurdu).
    v_applied := alloc_receipt_to_invoices(v_r.id, p_clinic_id, v_credit,
                                           v_r.base_currency, lab_today(v_lab),
                                           v_r.payment_method);
    IF v_applied > 0 THEN
      UPDATE clinic_receipts
         SET allocated_base = allocated_base + v_applied, updated_at = now()
       WHERE id = v_r.id;
      v_total := v_total + v_applied;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('applied_base', v_total, 'receipts_touched', v_count);
END $function$;

DROP FUNCTION IF EXISTS public._apply_clinic_credit_core(uuid, uuid);

DROP FUNCTION IF EXISTS public.record_clinic_receipt(uuid, jsonb, date, text, text, text, text, uuid[]);
DROP FUNCTION IF EXISTS public.preview_clinic_receipt(uuid, jsonb, uuid[]);
DROP FUNCTION IF EXISTS public.alloc_receipt_to_invoices(uuid, uuid, numeric, text, date, text, uuid[]);
DROP FUNCTION IF EXISTS public._receipt_alloc_plan(uuid, jsonb, numeric, uuid[]);

CREATE OR REPLACE FUNCTION public._receipt_alloc_plan(p_clinic_id uuid, p_lines jsonb, p_base numeric)
 RETURNS TABLE(invoice_id uuid, invoice_no text, currency text, amount numeric, rate numeric, amount_base numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rem       numeric := coalesce(p_base, 0);
  v_taken     jsonb := '{}'::jsonb;   -- bu planda faturadan alınan (fatura parasıyla)
  g           record;
  inv         record;
  v_amt_rem   numeric;
  v_gbase_rem numeric;
  v_take      numeric;
  v_used      numeric;
  v_open      numeric;
begin
  -- 1) Aynı para birimi
  for g in
    select l->>'currency' as cur,
           sum((l->>'amount')::numeric) as amt,
           sum(round((l->>'amount')::numeric * (l->>'rate')::numeric, 2)) as base
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
     where coalesce((l->>'amount')::numeric, 0) > 0 and coalesce((l->>'rate')::numeric, 0) > 0
     group by l->>'currency'
     order by min(l->>'currency')
  loop
    v_amt_rem   := g.amt;
    v_gbase_rem := least(g.base, v_rem);
    for inv in
      select i.id, i.invoice_number, i.total - i.paid_amount as open
        from public.invoices i
       where i.clinic_id = p_clinic_id and i.currency = g.cur
         and i.status in ('kesildi', 'kismi_odendi') and i.total > i.paid_amount
       order by i.due_date asc nulls last, i.created_at asc, i.id asc
    loop
      exit when v_amt_rem <= 0 or v_gbase_rem <= 0;
      v_take := least(inv.open, v_amt_rem);
      -- Satır bu faturada bitiyorsa grubun kalan bazının tamamı (yuvarlama artığı kalmaz)
      v_used := case when v_take >= v_amt_rem then v_gbase_rem
                     else least(round(v_take * g.base / g.amt, 2), v_gbase_rem) end;
      invoice_id := inv.id; invoice_no := inv.invoice_number; currency := g.cur;
      amount := v_take; rate := round(g.base / g.amt, 8); amount_base := v_used;
      return next;
      v_taken     := jsonb_set(v_taken, array[inv.id::text],
                               to_jsonb(coalesce((v_taken->>inv.id::text)::numeric, 0) + v_take));
      v_amt_rem   := v_amt_rem - v_take;
      v_gbase_rem := v_gbase_rem - v_used;
      v_rem       := v_rem - v_used;
    end loop;
  end loop;

  -- 2) Kalan baz: eski kural (baz → faturanın kuru), tüm para birimleri
  for inv in
    select i.id, i.invoice_number, i.currency, i.total - i.paid_amount as open, coalesce(i.rate_at_time, 1) as r
      from public.invoices i
     where i.clinic_id = p_clinic_id
       and i.status in ('kesildi', 'kismi_odendi') and i.total > i.paid_amount
     order by i.due_date asc nulls last, i.created_at asc, i.id asc
  loop
    exit when v_rem <= 0;
    v_open := inv.open - coalesce((v_taken->>inv.id::text)::numeric, 0);
    continue when v_open <= 0;
    v_take := least(floor(v_rem / inv.r * 100) / 100, v_open);
    continue when v_take <= 0;
    v_used := round(v_take * inv.r, 2);
    invoice_id := inv.id; invoice_no := inv.invoice_number; currency := inv.currency;
    amount := v_take; rate := inv.r; amount_base := v_used;
    return next;
    v_rem := v_rem - v_used;
  end loop;
end $function$;
REVOKE ALL ON FUNCTION public._receipt_alloc_plan(uuid, jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._receipt_alloc_plan(uuid, jsonb, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.alloc_receipt_to_invoices(p_receipt_id uuid, p_clinic_id uuid, p_base numeric, p_base_ccy text, p_date date, p_method text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lines jsonb := '[]'::jsonb;
  v_alloc numeric := 0;
  v_lab   uuid;
  pl      record;
begin
  -- Ödemenin lab'ı kliniğin lab'ı: auto_set_lab_id oturum lab'ına dayanır, oturumsuz (sistem) çağrıda NULL kalıyordu
  select lab_id into v_lab from public.clinics where id = p_clinic_id;

  -- Eşzamanlı tahsilatlar aynı faturayı iki kez kapatmasın
  perform 1 from public.invoices
   where clinic_id = p_clinic_id and status in ('kesildi', 'kismi_odendi') and total > paid_amount
   for update;

  -- İlk dağıtım (makbuzun henüz ödemesi yok) → satırlar aynı para kuralıyla; sonraki alacak uygulamaları yalnız baz
  if not exists (select 1 from public.payments where receipt_id = p_receipt_id) then
    select coalesce(jsonb_agg(jsonb_build_object('currency', l.currency, 'amount', l.amount, 'rate', l.rate)), '[]'::jsonb)
      into v_lines
      from public.clinic_receipt_lines l
     where l.receipt_id = p_receipt_id;
  end if;

  for pl in select * from public._receipt_alloc_plan(p_clinic_id, v_lines, p_base) loop
    insert into public.payments (lab_id, invoice_id, amount, payment_date, payment_method,
                                 currency, rate_at_time, amount_base, base_currency_at_time,
                                 receipt_id, received_by)
    values (v_lab, pl.invoice_id, pl.amount, p_date, p_method,
            pl.currency, pl.rate, pl.amount_base, p_base_ccy,
            p_receipt_id, auth.uid());
    v_alloc := v_alloc + pl.amount_base;
  end loop;
  return v_alloc;
end $function$;
REVOKE ALL ON FUNCTION public.alloc_receipt_to_invoices(uuid, uuid, numeric, text, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alloc_receipt_to_invoices(uuid, uuid, numeric, text, date, text) TO service_role;

CREATE OR REPLACE FUNCTION public.preview_clinic_receipt(p_clinic_id uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lab   uuid;
  v_total numeric;
  v_used  numeric;
  v_rows  jsonb;
begin
  select lab_id into v_lab from public.clinics where id = p_clinic_id;
  if v_lab is null then raise exception 'Klinik bulunamadı'; end if;
  if not (public.is_platform_admin()
          or (v_lab = public.get_my_lab_id() and public.has_permission('manage_finance'))) then
    raise exception 'Yetkiniz yok';
  end if;

  v_total := public.receipt_lines_total_base(p_lines);

  select coalesce(sum(p.amount_base), 0),
         coalesce(jsonb_agg(jsonb_build_object('invoice_id', p.invoice_id, 'invoice_no', p.invoice_no,
                                               'amount', p.amount, 'currency', p.currency)), '[]'::jsonb)
    into v_used, v_rows
    from public._receipt_alloc_plan(p_clinic_id, p_lines, v_total) p;

  return jsonb_build_object('total_base', v_total,
    'allocated_base', v_used, 'credit_base', v_total - v_used, 'allocations', v_rows);
end $function$;
REVOKE ALL ON FUNCTION public.preview_clinic_receipt(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_clinic_receipt(uuid, jsonb) TO PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_clinic_receipt(p_clinic_id uuid, p_lines jsonb, p_receipt_date date DEFAULT NULL::date, p_payment_method text DEFAULT 'nakit'::text, p_reference_no text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab       uuid;
  v_base_ccy  text;
  v_total     numeric;
  v_receipt   uuid;
  v_alloc     numeric;
  v_l         jsonb;
  v_existing  uuid;
  v_res_dup   jsonb;
  v_date      date;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  -- Tarih verilmezse lab'ın yerel günü: CURRENT_DATE oturumun saat dilimindedir (UTC),
  -- TR'de 00:00–03:00 arası dünü verirdi.
  v_date := COALESCE(p_receipt_date, lab_today(v_lab));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM clinic_receipts
     WHERE lab_id = v_lab AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      SELECT jsonb_build_object(
               'receipt_id', r.id, 'total_base', r.total_base,
               'allocated_base', r.allocated_base,
               'credit_base', r.total_base - r.allocated_base,
               'duplicate', true, 'allocations', '[]'::jsonb)
        INTO v_res_dup FROM clinic_receipts r WHERE r.id = v_existing;
      RETURN v_res_dup;
    END IF;
  END IF;

  SELECT COALESCE(default_currency, 'TRY') INTO v_base_ccy
    FROM lab_settings WHERE lab_id = v_lab;
  v_base_ccy := COALESCE(v_base_ccy, 'TRY');

  v_total := receipt_lines_total_base(p_lines);

  INSERT INTO clinic_receipts (lab_id, clinic_id, receipt_date, payment_method,
                               reference_no, notes, received_by, base_currency,
                               total_base, allocated_base, idempotency_key)
  VALUES (v_lab, p_clinic_id, v_date, p_payment_method,
          p_reference_no, p_notes, auth.uid(), v_base_ccy,
          v_total, 0, p_idempotency_key)
  RETURNING id INTO v_receipt;

  FOR v_l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO clinic_receipt_lines (receipt_id, currency, amount, rate, amount_base)
    VALUES (v_receipt, v_l->>'currency', (v_l->>'amount')::numeric,
            (v_l->>'rate')::numeric,
            round((v_l->>'amount')::numeric * (v_l->>'rate')::numeric, 2));
  END LOOP;

  v_alloc := alloc_receipt_to_invoices(v_receipt, p_clinic_id, v_total,
                                       v_base_ccy, v_date, p_payment_method);

  UPDATE clinic_receipts SET allocated_base = v_alloc, updated_at = now()
   WHERE id = v_receipt;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt, 'total_base', v_total,
    'allocated_base', v_alloc, 'credit_base', v_total - v_alloc,
    'allocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'invoice_id', p.invoice_id, 'invoice_no', i.invoice_number,
               'amount', p.amount, 'currency', p.currency))
        FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE p.receipt_id = v_receipt), '[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.record_clinic_receipt(uuid, jsonb, date, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_clinic_receipt(uuid, jsonb, date, text, text, text, text) TO PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
