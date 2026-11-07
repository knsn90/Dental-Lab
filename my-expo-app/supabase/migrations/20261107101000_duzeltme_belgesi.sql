-- 20261107101000_duzeltme_belgesi — düzeltme belgesi (DZ): kesinleşmiş faturanın bir kalemini, fatura
-- düzenlenmeden düşürür (fatura Görev 1 kilidiyle donuk). DZ = clinic_statement_discounts satırı, doc_type='DZ' (P6).
--   * Şema: doc_type / invoice_id / invoice_item_id + DZ kısıtları; benzersizlik (lab_id, doc_type, doc_no);
--     lab başına DZ sayacı clinic_correction_counters (P7; RLS açık, authenticated/anon yetkisiz).
--   * RPC record_correction_document: hedef faturanın açık kısmına 'indirim' payı (notes 'DZ-<n>'), kalan
--     _sd_apply_credit ile açık faturalara, kalırsa alacak (P8).
--   * record_statement_discount: İND numarası yalnız İND satırlarından (DZ numaraları etkilemez).
--   * delete_statement_discount: DZ silinemez (P9, DZ_DELETE_LOCKED).
--   * _sd_apply_credit: pay notu DZ için 'DZ-<n>', İND için 'İND-<n>'. Sıralama aynı.
-- Mevcut fonksiyonların yetkileri değişmez (CREATE OR REPLACE ACL'yi korur). Fatura kilidi kaçışı KULLANILMAZ.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- === Şema ===
ALTER TABLE public.clinic_statement_discounts
  ADD COLUMN doc_type text NOT NULL DEFAULT 'IND' CHECK (doc_type IN ('IND', 'DZ')),
  ADD COLUMN invoice_id uuid NULL REFERENCES public.invoices(id),
  ADD COLUMN invoice_item_id uuid NULL REFERENCES public.invoice_items(id);

ALTER TABLE public.clinic_statement_discounts
  ADD CONSTRAINT clinic_statement_discounts_dz_target
    CHECK ((doc_type = 'DZ') = (invoice_id IS NOT NULL AND invoice_item_id IS NOT NULL)),
  ADD CONSTRAINT clinic_statement_discounts_dz_reason
    CHECK (doc_type <> 'DZ' OR length(btrim(coalesce(description, ''))) > 0);

ALTER TABLE public.clinic_statement_discounts DROP CONSTRAINT clinic_statement_discounts_lab_id_doc_no_key;
ALTER TABLE public.clinic_statement_discounts
  ADD CONSTRAINT clinic_statement_discounts_lab_type_doc_no_key UNIQUE (lab_id, doc_type, doc_no);

CREATE INDEX clinic_statement_discounts_dz_item_idx
  ON public.clinic_statement_discounts (invoice_item_id) WHERE doc_type = 'DZ';

CREATE TABLE public.clinic_correction_counters (
  lab_id      uuid PRIMARY KEY REFERENCES public.labs(id) ON DELETE CASCADE,
  last_doc_no int  NOT NULL
);
ALTER TABLE public.clinic_correction_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_correction_counters FROM PUBLIC, anon, authenticated;

-- === Değişen fonksiyonlar ===
CREATE OR REPLACE FUNCTION public.record_statement_discount(p_clinic_id uuid, p_currency text, p_from date, p_to date, p_kind text, p_value numeric, p_discount_date date, p_description text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab      uuid;
  v_id       uuid;
  v_q        jsonb;
  v_amount   numeric;
  v_doc      int;
  v_base_ccy text;
  v_rate     numeric;
  v_date     date := COALESCE(p_discount_date, p_to);
  v_prior    text;
  v_k_clinic uuid;
  v_k_ccy    text;
  v_rem      numeric;
  v_to_inv   numeric := 0;
  v_open     numeric;
  v_take     numeric;
  inv        record;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  -- Aynı (lab, idempotency_key): aynı klinik + para biriminde kaydı yeniden üretmeden döndür;
  -- anahtar başka klinik / para biriminin kaydına aitse çakışma (yeniden oynatma değil)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT d.id, d.clinic_id, d.currency INTO v_id, v_k_clinic, v_k_ccy FROM clinic_statement_discounts d
     WHERE d.lab_id = v_lab AND d.idempotency_key = p_idempotency_key;
    IF v_id IS NOT NULL AND (v_k_clinic IS DISTINCT FROM p_clinic_id OR v_k_ccy IS DISTINCT FROM p_currency) THEN
      RAISE EXCEPTION 'SD_IDEMPOTENCY_CONFLICT';
    END IF;
  END IF;

  IF v_id IS NULL THEN
    -- Klinik kilidi: dayanak/bakiye okunmadan önce
    PERFORM pg_advisory_xact_lock(hashtext('sd:' || p_clinic_id));
    -- Kilit beklenirken aynı anahtarla eşzamanlı çağrı tamamlanmış olabilir
    IF p_idempotency_key IS NOT NULL THEN
      SELECT d.id, d.clinic_id, d.currency INTO v_id, v_k_clinic, v_k_ccy FROM clinic_statement_discounts d
       WHERE d.lab_id = v_lab AND d.idempotency_key = p_idempotency_key;
      IF v_id IS NOT NULL AND (v_k_clinic IS DISTINCT FROM p_clinic_id OR v_k_ccy IS DISTINCT FROM p_currency) THEN
        RAISE EXCEPTION 'SD_IDEMPOTENCY_CONFLICT';
      END IF;
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    RETURN (
      SELECT jsonb_build_object(
               'id', d.id, 'doc_no', d.doc_no, 'amount', d.amount,
               'to_invoices', x.to_inv, 'to_credit', d.amount - x.to_inv, 'replayed', true)
        FROM clinic_statement_discounts d
        CROSS JOIN LATERAL (
          SELECT COALESCE(sum(p.amount), 0) AS to_inv
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
           WHERE p.statement_discount_id = d.id
             AND i.issue_date BETWEEN d.period_from AND d.period_to) x
       WHERE d.id = v_id);
  END IF;

  v_q := _sd_quote(v_lab, p_clinic_id, p_currency, p_from, p_to, p_kind, p_value);
  IF NOT (v_q->>'ok')::boolean THEN
    RAISE EXCEPTION '%', v_q->>'error';
  END IF;
  v_amount := (v_q->>'amount')::numeric;

  -- İND numarası (K4 + Ruling O): lab sayacı; ilk satır MAX(doc_no)+1 ile tohumlanır, sonra hiç geri dönmez.
  -- Sayaç satırının kilidi lab başına numaralamayı sıraya sokar; K4 lab kilidi de alınır.
  PERFORM pg_advisory_xact_lock(hashtext('sd:' || v_lab));
  INSERT INTO clinic_statement_discount_counters AS c (lab_id, last_doc_no)
  VALUES (v_lab, (SELECT COALESCE(max(d.doc_no), 0) + 1 FROM clinic_statement_discounts d WHERE d.lab_id = v_lab AND d.doc_type = 'IND'))
  ON CONFLICT (lab_id) DO UPDATE
     SET last_doc_no = GREATEST(c.last_doc_no,
                                (SELECT COALESCE(max(d.doc_no), 0) FROM clinic_statement_discounts d WHERE d.lab_id = v_lab AND d.doc_type = 'IND')) + 1
  RETURNING c.last_doc_no INTO v_doc;

  -- Kur: ana para record_clinic_receipt ile aynı; kur get_currency_rate, yoksa 1
  SELECT COALESCE(ls.default_currency, 'TRY') INTO v_base_ccy FROM lab_settings ls WHERE ls.lab_id = v_lab;
  v_base_ccy := COALESCE(v_base_ccy, 'TRY');
  IF p_currency = v_base_ccy THEN
    v_rate := 1;
  ELSE
    v_rate := get_currency_rate(v_lab, p_currency, v_base_ccy, v_date);
    IF v_rate IS NULL OR v_rate <= 0 THEN v_rate := 1; END IF;
  END IF;

  INSERT INTO clinic_statement_discounts (lab_id, clinic_id, currency, discount_date, period_from, period_to,
                                          kind, value, amount, base_amount, rate, amount_base, doc_no,
                                          description, idempotency_key, created_by)
  VALUES (v_lab, p_clinic_id, p_currency, v_date, p_from, p_to,
          p_kind, p_value, v_amount, (v_q->>'base')::numeric, v_rate, round(v_amount * v_rate, 2), v_doc,
          NULLIF(btrim(p_description), ''), p_idempotency_key, auth.uid())
  RETURNING id INTO v_id;

  v_prior := current_setting('siman.sd_write', true);
  PERFORM set_config('siman.sd_write', 'on', true);

  -- Dönem faturalarına dağıtım (vadesi en eski önce)
  v_rem := v_amount;
  FOR inv IN
    SELECT i.id, i.total, i.paid_amount, i.currency
      FROM invoices i
     WHERE i.lab_id = v_lab AND i.clinic_id = p_clinic_id AND i.currency = p_currency
       AND i.issue_date BETWEEN p_from AND p_to
       AND i.status IN ('kesildi', 'kismi_odendi') AND i.total > i.paid_amount
     ORDER BY i.due_date ASC NULLS LAST, i.created_at, i.id
     FOR UPDATE
  LOOP
    EXIT WHEN v_rem <= 0;
    SELECT inv.total - COALESCE(sum(p.amount), 0) INTO v_open FROM payments p WHERE p.invoice_id = inv.id;
    v_open := LEAST(v_open, inv.total - inv.paid_amount);
    CONTINUE WHEN v_open <= 0;
    v_take := LEAST(v_open, v_rem);

    INSERT INTO payments (lab_id, invoice_id, amount, payment_date, payment_method,
                          currency, rate_at_time, amount_base, base_currency_at_time,
                          receipt_id, received_by, statement_discount_id, notes)
    VALUES (v_lab, inv.id, v_take, v_date, 'indirim',
            inv.currency, v_rate, round(v_take * v_rate, 2), v_base_ccy,
            NULL, auth.uid(), v_id, 'İND-' || v_doc);

    v_rem    := v_rem - v_take;
    v_to_inv := v_to_inv + v_take;
  END LOOP;

  -- Dönem faturalarına sığmayan kısım (ve önceki alacaklar) diğer açık faturalara
  PERFORM _sd_apply_credit(v_lab, p_clinic_id, p_currency);

  PERFORM set_config('siman.sd_write', COALESCE(v_prior, ''), true);

  PERFORM log_activity('statement_discount_created', 'clinic', p_clinic_id, 'İND-' || v_doc,
    jsonb_build_object('amount', v_amount, 'currency', p_currency, 'period_from', p_from,
                       'period_to', p_to, 'kind', p_kind, 'value', p_value),
    v_lab, auth.uid());

  RETURN jsonb_build_object('id', v_id, 'doc_no', v_doc, 'amount', v_amount,
                            'to_invoices', v_to_inv, 'to_credit', v_amount - v_to_inv,
                            'replayed', false);
END
$function$
;

CREATE OR REPLACE FUNCTION public.delete_statement_discount(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_d       record;
  v_lab     uuid;
  v_prior   text;
  v_touched int;
BEGIN
  SELECT d.id, d.lab_id, d.clinic_id, d.doc_no, d.amount, d.currency, d.period_from, d.period_to,
         d.kind, d.value, d.doc_type, c.lab_id AS clinic_lab
    INTO v_d
    FROM clinic_statement_discounts d
    JOIN clinics c ON c.id = d.clinic_id
   WHERE d.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'İndirim bulunamadı'; END IF;
  v_lab := v_d.clinic_lab;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND v_d.lab_id = v_lab AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  -- Düzeltme belgesi (DZ) silinemez (P9): fazla yazılmış DZ ek faturayla düzeltilir
  IF v_d.doc_type = 'DZ' THEN
    RAISE EXCEPTION 'DZ_DELETE_LOCKED';
  END IF;

  -- Klinik kilidi: paylar okunup silinmeden önce
  PERFORM pg_advisory_xact_lock(hashtext('sd:' || v_d.clinic_id));
  PERFORM 1 FROM clinic_statement_discounts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'İndirim bulunamadı'; END IF;

  SELECT count(DISTINCT p.invoice_id) INTO v_touched
    FROM payments p WHERE p.statement_discount_id = p_id;

  v_prior := current_setting('siman.sd_write', true);
  PERFORM set_config('siman.sd_write', 'on', true);
  DELETE FROM clinic_statement_discounts WHERE id = p_id;   -- 'indirim' payları ON DELETE CASCADE
  -- Diğer indirimlerin uygulanmamış alacağı, payları silinen faturalar dahil açık faturalara (Ruling P)
  PERFORM _sd_apply_credit(v_d.lab_id, v_d.clinic_id, v_d.currency);
  PERFORM set_config('siman.sd_write', COALESCE(v_prior, ''), true);

  PERFORM log_activity('statement_discount_deleted', 'clinic', v_d.clinic_id, 'İND-' || v_d.doc_no,
    jsonb_build_object('amount', v_d.amount, 'currency', v_d.currency, 'period_from', v_d.period_from,
                       'period_to', v_d.period_to, 'kind', v_d.kind, 'value', v_d.value),
    v_d.lab_id, auth.uid());

  RETURN jsonb_build_object('id', p_id, 'invoices_touched', v_touched);
END
$function$
;

CREATE OR REPLACE FUNCTION public._sd_apply_credit(p_lab uuid, p_clinic uuid, p_currency text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r_sd      record;
  inv       record;
  r_st      record;
  v_credit  numeric;
  v_open    numeric;
  v_take    numeric;
  v_applied numeric := 0;
  v_prior   text;
  v_base    text;
BEGIN
  IF p_lab IS NULL OR p_clinic IS NULL OR p_currency IS NULL THEN
    RETURN 0;
  END IF;

  -- Klinik kilidi: Σ pay okunmadan önce (eşzamanlı yazanlar sıraya girer)
  PERFORM pg_advisory_xact_lock(hashtext('sd:' || p_clinic));

  -- Uygulanacak alacak yoksa ucuz çıkış
  IF NOT EXISTS (
       SELECT 1 FROM clinic_statement_discounts sd
        WHERE sd.lab_id = p_lab AND sd.clinic_id = p_clinic AND sd.currency = p_currency
          AND sd.amount > (SELECT COALESCE(sum(p.amount), 0)
                             FROM payments p
                             JOIN invoices i ON i.id = p.invoice_id
                            WHERE p.statement_discount_id = sd.id AND i.status <> 'iptal')) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(ls.default_currency, 'TRY') INTO v_base FROM lab_settings ls WHERE ls.lab_id = p_lab;
  v_base := COALESCE(v_base, 'TRY');

  v_prior := current_setting('siman.sd_write', true);
  PERFORM set_config('siman.sd_write', 'on', true);

  -- Toplamı artmış 'odendi' faturayı mevcut kuralla yeniden aç (kismi_odendi / kesildi)
  FOR r_st IN
    SELECT i.id
      FROM invoices i
     WHERE i.lab_id = p_lab AND i.clinic_id = p_clinic AND i.currency = p_currency
       AND i.status = 'odendi' AND i.total > i.paid_amount
     ORDER BY i.id
     FOR UPDATE
  LOOP
    PERFORM recalc_invoice_payment_state(r_st.id);
  END LOOP;

  FOR r_sd IN
    SELECT sd.id, sd.amount, sd.rate, sd.doc_no, sd.doc_type
      FROM clinic_statement_discounts sd
     WHERE sd.lab_id = p_lab AND sd.clinic_id = p_clinic AND sd.currency = p_currency
     ORDER BY sd.discount_date, sd.created_at, sd.doc_no
  LOOP
    SELECT r_sd.amount - COALESCE(sum(p.amount), 0) INTO v_credit
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
     WHERE p.statement_discount_id = r_sd.id AND i.status <> 'iptal';
    CONTINUE WHEN v_credit <= 0;

    FOR inv IN
      SELECT i.id, i.total, i.paid_amount, i.currency
        FROM invoices i
       WHERE i.lab_id = p_lab AND i.clinic_id = p_clinic AND i.currency = p_currency
         AND i.status IN ('kesildi', 'kismi_odendi') AND i.total > i.paid_amount
       ORDER BY i.due_date ASC NULLS LAST, i.created_at, i.id
       FOR UPDATE
    LOOP
      EXIT WHEN v_credit <= 0;
      SELECT inv.total - COALESCE(sum(p.amount), 0) INTO v_open FROM payments p WHERE p.invoice_id = inv.id;
      v_open := LEAST(v_open, inv.total - inv.paid_amount);
      CONTINUE WHEN v_open <= 0;
      v_take := LEAST(v_open, v_credit);

      INSERT INTO payments (lab_id, invoice_id, amount, payment_date, payment_method,
                            currency, rate_at_time, amount_base, base_currency_at_time,
                            receipt_id, received_by, statement_discount_id, notes)
      VALUES (p_lab, inv.id, v_take, lab_today(p_lab), 'indirim',
              inv.currency, r_sd.rate, round(v_take * r_sd.rate, 2), v_base,
              NULL, auth.uid(), r_sd.id,
              CASE WHEN r_sd.doc_type = 'DZ' THEN 'DZ-' ELSE 'İND-' END || r_sd.doc_no);

      v_credit  := v_credit - v_take;
      v_applied := v_applied + v_take;
    END LOOP;
  END LOOP;

  PERFORM set_config('siman.sd_write', COALESCE(v_prior, ''), true);
  RETURN v_applied;
END
$function$
;

REVOKE ALL ON FUNCTION public._sd_apply_credit(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- === Yeni RPC ===
CREATE OR REPLACE FUNCTION public.record_correction_document(p_invoice_item_id uuid, p_amount numeric, p_doc_date date, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason  text := btrim(COALESCE(p_reason, ''));
  v_key     text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_amount  numeric;
  v_inv_id  uuid;
  v_clinic  uuid;
  v_lab     uuid;
  v_inv     record;
  v_net     numeric;
  v_used    numeric;
  v_date    date;
  v_rate    numeric;
  v_base    text;
  v_doc     int;
  v_id      uuid;
  v_k       record;
  v_open    numeric;
  v_to_inv  numeric := 0;
  v_prior   text;
BEGIN
  -- 1) Doğrulama: gerekçe, tutar (kuruşa yuvarlanır), anahtar (boş → yok)
  IF v_reason = '' THEN RAISE EXCEPTION 'DZ_REASON'; END IF;
  v_amount := ROUND(p_amount, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'DZ_VALUE'; END IF;

  -- 2) Kalem → fatura → klinik → lab zinciri ve yetki kapısı (v_lab = clinics.lab_id)
  SELECT it.invoice_id INTO v_inv_id FROM invoice_items it WHERE it.id = p_invoice_item_id;
  IF v_inv_id IS NULL THEN RAISE EXCEPTION 'Kalem bulunamadı'; END IF;
  SELECT i.clinic_id INTO v_clinic FROM invoices i WHERE i.id = v_inv_id;
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  SELECT c.lab_id INTO v_lab FROM clinics c WHERE c.id = v_clinic;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  -- 3) İdempotency (kilitten önce): aynı lab + anahtar, aynı parametreler → eski sonuç; farklı → çakışma
  IF v_key IS NOT NULL THEN
    SELECT d.id, d.doc_type, d.invoice_item_id, d.amount, d.description, d.discount_date
      INTO v_k FROM clinic_statement_discounts d
     WHERE d.lab_id = v_lab AND d.idempotency_key = v_key;
    IF v_k.id IS NOT NULL THEN
      IF v_k.doc_type IS DISTINCT FROM 'DZ' OR v_k.invoice_item_id IS DISTINCT FROM p_invoice_item_id
         OR v_k.amount IS DISTINCT FROM v_amount OR v_k.description IS DISTINCT FROM v_reason
         OR (p_doc_date IS NOT NULL AND v_k.discount_date IS DISTINCT FROM p_doc_date) THEN
        RAISE EXCEPTION 'DZ_IDEMPOTENCY_CONFLICT';
      END IF;
      v_id := v_k.id;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    -- 4) Klinik kilidi (Σ pay / tavan okunmadan önce), sonra fatura satırı
    PERFORM pg_advisory_xact_lock(hashtext('sd:' || v_clinic));
    -- Kilit beklenirken aynı anahtarla eşzamanlı çağrı tamamlanmış olabilir
    IF v_key IS NOT NULL THEN
      SELECT d.id, d.doc_type, d.invoice_item_id, d.amount, d.description, d.discount_date
        INTO v_k FROM clinic_statement_discounts d
       WHERE d.lab_id = v_lab AND d.idempotency_key = v_key;
      IF v_k.id IS NOT NULL THEN
        IF v_k.doc_type IS DISTINCT FROM 'DZ' OR v_k.invoice_item_id IS DISTINCT FROM p_invoice_item_id
           OR v_k.amount IS DISTINCT FROM v_amount OR v_k.description IS DISTINCT FROM v_reason
           OR (p_doc_date IS NOT NULL AND v_k.discount_date IS DISTINCT FROM p_doc_date) THEN
          RAISE EXCEPTION 'DZ_IDEMPOTENCY_CONFLICT';
        END IF;
        v_id := v_k.id;
      END IF;
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    RETURN (
      SELECT jsonb_build_object(
               'id', d.id, 'doc_no', d.doc_no, 'amount', d.amount,
               'to_invoice', x.to_inv, 'to_credit', d.amount - x.to_inv, 'replayed', true)
        FROM clinic_statement_discounts d
        CROSS JOIN LATERAL (
          SELECT COALESCE(sum(p.amount), 0) AS to_inv
            FROM payments p
           WHERE p.statement_discount_id = d.id AND p.invoice_id = d.invoice_id) x
       WHERE d.id = v_id);
  END IF;

  SELECT i.id, i.lab_id, i.clinic_id, i.currency, i.status, i.issue_date, i.total, i.paid_amount,
         i.rate_at_time, i.base_currency_at_time
    INTO v_inv
    FROM invoices i WHERE i.id = v_inv_id FOR UPDATE;
  IF NOT FOUND OR v_inv.clinic_id IS DISTINCT FROM v_clinic OR v_inv.lab_id IS DISTINCT FROM v_lab THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  -- Durum ve tavan kilit altında
  IF v_inv.status IS NULL OR v_inv.status NOT IN ('kesildi', 'kismi_odendi', 'odendi') THEN
    RAISE EXCEPTION 'DZ_STATUS';
  END IF;
  SELECT COALESCE(it.net_total, 0) INTO v_net FROM invoice_items it
   WHERE it.id = p_invoice_item_id AND it.invoice_id = v_inv.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kalem bulunamadı'; END IF;
  SELECT COALESCE(sum(d.amount), 0) INTO v_used FROM clinic_statement_discounts d
   WHERE d.invoice_item_id = p_invoice_item_id AND d.doc_type = 'DZ';
  IF v_amount > v_net - v_used THEN
    RAISE EXCEPTION 'DZ_CAP';
  END IF;

  -- 5) DZ numarası (P7): lab başına ayrı sayaç; ilk satır MAX(DZ doc_no)+1 ile tohumlanır
  PERFORM pg_advisory_xact_lock(hashtext('dz:' || v_lab));
  INSERT INTO clinic_correction_counters AS c (lab_id, last_doc_no)
  VALUES (v_lab, (SELECT COALESCE(max(d.doc_no), 0) + 1 FROM clinic_statement_discounts d
                   WHERE d.lab_id = v_lab AND d.doc_type = 'DZ'))
  ON CONFLICT (lab_id) DO UPDATE
     SET last_doc_no = GREATEST(c.last_doc_no,
                                (SELECT COALESCE(max(d.doc_no), 0) FROM clinic_statement_discounts d
                                  WHERE d.lab_id = v_lab AND d.doc_type = 'DZ')) + 1
  RETURNING c.last_doc_no INTO v_doc;

  -- 6) Satır (P6): kur faturadan (rate_at_time, yoksa 1)
  v_date := COALESCE(p_doc_date, lab_today(v_lab));
  v_rate := COALESCE(v_inv.rate_at_time, 1);
  IF v_rate <= 0 THEN v_rate := 1; END IF;
  SELECT ls.default_currency INTO v_base FROM lab_settings ls WHERE ls.lab_id = v_lab;
  v_base := COALESCE(v_inv.base_currency_at_time, v_base, 'TRY');

  INSERT INTO clinic_statement_discounts (lab_id, clinic_id, currency, discount_date, period_from, period_to,
                                          kind, value, amount, base_amount, rate, amount_base, doc_no,
                                          description, idempotency_key, created_by,
                                          doc_type, invoice_id, invoice_item_id)
  VALUES (v_lab, v_clinic, v_inv.currency, v_date, v_inv.issue_date, v_inv.issue_date,
          'fixed', v_amount, v_amount, v_net, v_rate, round(v_amount * v_rate, 2), v_doc,
          v_reason, v_key, auth.uid(),
          'DZ', v_inv.id, p_invoice_item_id)
  RETURNING id INTO v_id;

  -- 7) Hedef faturanın açık kısmına pay (P8)
  v_prior := current_setting('siman.sd_write', true);
  PERFORM set_config('siman.sd_write', 'on', true);

  IF v_inv.status IN ('kesildi', 'kismi_odendi') THEN
    SELECT v_inv.total - COALESCE(sum(p.amount), 0) INTO v_open FROM payments p WHERE p.invoice_id = v_inv.id;
    v_to_inv := GREATEST(LEAST(v_amount, v_open, v_inv.total - v_inv.paid_amount), 0);
    IF v_to_inv > 0 THEN
      INSERT INTO payments (lab_id, invoice_id, amount, payment_date, payment_method,
                            currency, rate_at_time, amount_base, base_currency_at_time,
                            receipt_id, received_by, statement_discount_id, notes)
      VALUES (v_lab, v_inv.id, v_to_inv, v_date, 'indirim',
              v_inv.currency, v_rate, round(v_to_inv * v_rate, 2), v_base,
              NULL, auth.uid(), v_id, 'DZ-' || v_doc);
    ELSE
      v_to_inv := 0;
    END IF;
  END IF;

  -- 8) Kalan: kliniğin aynı para birimindeki açık faturalarına, kalırsa alacak (K7)
  PERFORM _sd_apply_credit(v_lab, v_clinic, v_inv.currency);

  -- 9) GUC geri
  PERFORM set_config('siman.sd_write', COALESCE(v_prior, ''), true);

  -- 10) Log
  PERFORM log_activity('correction_document_created', 'invoice', v_inv.id, 'DZ-' || v_doc,
    jsonb_build_object('amount', v_amount, 'currency', v_inv.currency,
                       'invoice_item_id', p_invoice_item_id, 'reason', v_reason),
    v_lab, auth.uid());

  -- 11) Sonuç
  RETURN jsonb_build_object('id', v_id, 'doc_no', v_doc, 'amount', v_amount,
                            'to_invoice', v_to_inv, 'to_credit', v_amount - v_to_inv,
                            'replayed', false);
END
$function$;

REVOKE ALL ON FUNCTION public.record_correction_document(uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_correction_document(uuid, numeric, date, text, text) TO authenticated;
COMMIT;
