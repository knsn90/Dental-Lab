-- 20261105101000_ekstre_indirimi_rpc
-- Ekstre indirimi (spec 2026-11-05, plan Görev 3) — önizleme, kayıt, silme ve alacağın açık faturalara
-- uygulanması. Yalnız YENİ nesne ekler; mevcut hiçbir tanım değişmez.
--   • _sd_quote (iç): dönem toplamı, önceki (çakışan) indirimler, dayanak, tutar, dönem faturalarına
--     sığan kısım / alacağa kalan kısım. Hata kodları: SD_EMPTY | SD_VALUE | SD_CAP.
--   • preview_statement_discount: _sd_quote + v_clinic_balance_ccy bakiyesi (önce/sonra). Doğrulama
--     hataları ok:false ile döner (fırlatılmaz); klinik yok / yetki yok preview_clinic_receipt gibi fırlatır.
--   • record_statement_discount: yetki → aynı anahtar varsa replayed (başka klinik / para biriminde
--     SD_IDEMPOTENCY_CONFLICT; kilitten önce ve sonra) → klinik kilidi → _sd_quote → İND numarası
--     (lab kilidi + sayaç) → kur → satır → dönem faturalarına 'indirim' payları → _sd_apply_credit → log.
--   • delete_statement_discount: yetki → klinik kilidi → satırı sil (paylar zincirleme silinir,
--     recalc_on_payment_change durumları geri çevirir) → diğer indirimlerin alacağı → log.
--   • _sd_apply_credit (iç): indirimlerin alacağını (amount − iptal olmayan faturalardaki pay) kliniğin o
--     para birimindeki açık faturalarına yazar (dönem şartı yok, vadesi en eski önce); pay tarihi
--     lab_today(lab) (lab yerel günü; CURRENT_DATE UTC'dir).
--     Dönem payları record'da indirim tarihini (p_discount_date, yoksa p_to) taşır.
--   • _sd_invoice_credit_trg / zz_sd_invoice_credit: fatura olayından sonra açık + bakiyeli kalıyorsa,
--     iptal edildiyse, kırpma olduysa ya da fatura silindiyse alacağı yeniden uygular (Ruling P); toplamı
--     düşen faturadaki aşan 'indirim' payını kırpar; 'indirim' payı taşıyan iptal faturanın iptalden
--     geri alınmasını SD_UNCANCEL_LOCKED (23514) ile reddeder.
--   • clinic_statement_discount_counters: lab başına İND sayacı; numara asla geri verilmez (Ruling O).
-- Kurallar: siman.sd_write her yazan fonksiyonda önceki değeri saklanıp geri yüklenir (Ruling K);
-- 'indirim' payı yazan her yol pg_advisory_xact_lock(hashtext('sd:'||clinic_id)) alır (Ruling L);
-- 'indirim' satırlarında lab_id açıkça indirimin lab'ı.
-- Dağıtım sırası (dönem ve alacak): status IN ('kesildi','kismi_odendi') AND total > paid_amount,
-- ORDER BY due_date ASC NULLS LAST, created_at, id, FOR UPDATE (_receipt_alloc_plan ile aynı).
-- Kur: ana para record_clinic_receipt ile aynı (lab_settings.default_currency, yoksa TRY); kur tahsilat
-- penceresinin kullandığı get_currency_rate(lab, para, ana para, tarih); bulunamazsa 1
-- (set_invoice_amount_base ile aynı geri düşüş).
-- Geri alma: rollbacks/20261105101000_ekstre_indirimi_rpc.down.sql

-- ── İND sayacı (Ruling O) ──────────────────────────────────────────────────
-- Lab başına son verilen İND numarası. Silinen indirimin numarası yeniden kullanılmaz (K4'teki MAX+1 silinen
-- son numarayı geri veriyordu). Yalnız SECURITY DEFINER fonksiyonlar yazar/okur: RLS açık, politika yok.
CREATE TABLE IF NOT EXISTS public.clinic_statement_discount_counters (
  lab_id      uuid PRIMARY KEY REFERENCES public.labs(id) ON DELETE CASCADE,
  last_doc_no integer NOT NULL
);
ALTER TABLE public.clinic_statement_discount_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_statement_discount_counters FROM PUBLIC, anon, authenticated;

-- ── _sd_quote (iç) ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sd_quote(p_lab uuid, p_clinic uuid, p_currency text, p_from date, p_to date, p_kind text, p_value numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period numeric := 0;
  v_prior  numeric := 0;
  v_base   numeric;
  v_amount numeric;
  v_open   numeric := 0;
  v_to_inv numeric := 0;
  v_err    text;
BEGIN
  -- Dönem toplamı: dönemde kesilmiş (taslak/iptal dışı) faturalar, aynı para birimi
  SELECT COALESCE(sum(i.total), 0) INTO v_period
    FROM invoices i
   WHERE i.lab_id = p_lab AND i.clinic_id = p_clinic AND i.currency = p_currency
     AND i.issue_date BETWEEN p_from AND p_to
     AND i.status IN ('kesildi', 'kismi_odendi', 'odendi');

  -- Önceki indirimler: aynı lab + klinik + para biriminde dönemi [p_from, p_to] ile ÇAKIŞAN
  SELECT COALESCE(sum(d.amount), 0) INTO v_prior
    FROM clinic_statement_discounts d
   WHERE d.lab_id = p_lab AND d.clinic_id = p_clinic AND d.currency = p_currency
     AND d.period_from <= p_to AND d.period_to >= p_from;

  v_base := v_period - v_prior;

  IF v_period <= 0 THEN
    v_err := 'SD_EMPTY';
  ELSIF p_value IS NULL OR p_value <= 0 OR p_kind IS NULL OR p_kind NOT IN ('percent', 'fixed') THEN
    v_err := 'SD_VALUE';
  ELSIF p_kind = 'percent' AND p_value > 100 THEN
    v_err := 'SD_CAP';
  ELSE
    v_amount := CASE WHEN p_kind = 'percent' THEN ROUND(v_base * p_value / 100, 2)
                     ELSE ROUND(p_value, 2) END;
    IF v_base <= 0 OR v_amount > v_base THEN
      v_err := 'SD_CAP';                 -- dayanak kalmadı / dayanağı aşıyor
    ELSIF v_amount <= 0 THEN
      v_err := 'SD_VALUE';               -- yüzde kuruşa yuvarlanınca 0
    END IF;
  END IF;

  IF v_err IS NULL THEN
    -- Dönemdeki açık faturalara sığan kısım (dağıtımla aynı süzgeç)
    SELECT COALESCE(sum(i.total - i.paid_amount), 0) INTO v_open
      FROM invoices i
     WHERE i.lab_id = p_lab AND i.clinic_id = p_clinic AND i.currency = p_currency
       AND i.issue_date BETWEEN p_from AND p_to
       AND i.status IN ('kesildi', 'kismi_odendi') AND i.total > i.paid_amount;
    v_to_inv := LEAST(v_amount, v_open);
  END IF;

  RETURN jsonb_build_object(
    'ok',              v_err IS NULL,
    'error',           v_err,
    'period_total',    v_period,
    'prior_discounts', v_prior,
    'base',            v_base,
    'amount',          COALESCE(v_amount, 0),
    'to_invoices',     CASE WHEN v_err IS NULL THEN v_to_inv ELSE 0 END,
    'to_credit',       CASE WHEN v_err IS NULL THEN v_amount - v_to_inv ELSE 0 END);
END
$function$;
REVOKE ALL ON FUNCTION public._sd_quote(uuid, uuid, text, date, date, text, numeric) FROM PUBLIC, anon, authenticated;

-- ── _sd_apply_credit (iç) ──────────────────────────────────────────────────
-- Her indirimin alacağı (K2) = amount − Σ(o indirime bağlı, iptal olmayan faturalardaki pay).
-- İndirimler discount_date, created_at (eşitlikte doc_no) sırasıyla; alacak açık faturalara
-- (dönem şartı yok) payment_date = lab_today(lab) (lab saat dilimindeki gün; CURRENT_DATE oturumun UTC
-- günüdür, TR'de 00:00–03:00 arası bir önceki günü verir) ile 'indirim' payı olarak yazılır.
-- Alacak yoksa kilitten sonraki tek sorguyla döner (fatura olaylarında sık çağrılır; GUC'a dokunmaz).
-- Toplamı sonradan artmış 'odendi' fatura (total > paid_amount; tutar değişimi ödeme durumunu yeniden
-- hesaplamaz) önce recalc_invoice_payment_state ile yeniden açılır: 'indirim' payı yalnız kesildi|kismi_odendi
-- faturaya yazılabilir (Görev 2 kapısı). Kendi yazımları GUC açıkken: tetikleyici yeniden çağırmaz.
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
    SELECT sd.id, sd.amount, sd.rate, sd.doc_no
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
              NULL, auth.uid(), r_sd.id, 'İND-' || r_sd.doc_no);

      v_credit  := v_credit - v_take;
      v_applied := v_applied + v_take;
    END LOOP;
  END LOOP;

  PERFORM set_config('siman.sd_write', COALESCE(v_prior, ''), true);
  RETURN v_applied;
END
$function$;
REVOKE ALL ON FUNCTION public._sd_apply_credit(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── preview_statement_discount (istemci) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.preview_statement_discount(p_clinic_id uuid, p_currency text, p_from date, p_to date, p_kind text, p_value numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid;
  v_q   jsonb;
  v_bal numeric;
BEGIN
  SELECT lab_id INTO v_lab FROM clinics WHERE id = p_clinic_id;
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Klinik bulunamadı'; END IF;
  IF NOT (is_platform_admin()
          OR (v_lab = get_my_lab_id() AND has_permission('manage_finance'))) THEN
    RAISE EXCEPTION 'Yetkiniz yok';
  END IF;

  v_q := _sd_quote(v_lab, p_clinic_id, p_currency, p_from, p_to, p_kind, p_value);

  SELECT COALESCE(sum(v.balance), 0) INTO v_bal
    FROM v_clinic_balance_ccy v
   WHERE v.clinic_id = p_clinic_id AND v.lab_id = v_lab AND v.currency = p_currency;

  RETURN v_q || jsonb_build_object(
    'balance_before', v_bal,
    'balance_after',  v_bal - CASE WHEN (v_q->>'ok')::boolean THEN (v_q->>'amount')::numeric ELSE 0 END);
END
$function$;
REVOKE ALL ON FUNCTION public.preview_statement_discount(uuid, text, date, date, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_statement_discount(uuid, text, date, date, text, numeric) TO authenticated;

-- ── record_statement_discount (istemci) ────────────────────────────────────
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
  VALUES (v_lab, (SELECT COALESCE(max(d.doc_no), 0) + 1 FROM clinic_statement_discounts d WHERE d.lab_id = v_lab))
  ON CONFLICT (lab_id) DO UPDATE
     SET last_doc_no = GREATEST(c.last_doc_no,
                                (SELECT COALESCE(max(d.doc_no), 0) FROM clinic_statement_discounts d WHERE d.lab_id = v_lab)) + 1
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
$function$;
REVOKE ALL ON FUNCTION public.record_statement_discount(uuid, text, date, date, text, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_statement_discount(uuid, text, date, date, text, numeric, date, text, text) TO authenticated;

-- ── delete_statement_discount (istemci) ────────────────────────────────────
-- Satırı siler (paylar zincirleme, recalc_on_payment_change durumları geri çevirir), sonra aynı klinik +
-- para birimindeki diğer indirimlerin alacağını yeniden uygular (GUC hâlâ açıkken), GUC'u geri yükler.
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
         d.kind, d.value, c.lab_id AS clinic_lab
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
$function$;
REVOKE ALL ON FUNCTION public.delete_statement_discount(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_statement_discount(uuid) TO authenticated;

-- ── Fatura tetikleyicisi: alacağın korunması ───────────────────────────────
-- 0) Fatura silindi (paylar zincirleme silindi): klinikte indirim varsa ve siman.sd_write kapalıysa
--    alacak OLD'un lab / klinik / para biriminde yeniden uygulanır.
-- 1) Bu klinikte bu para biriminde indirim yoksa hemen döner (indirimsiz klinikte davranış aynı).
-- 2) Toplam düştü ve fatura aşırı ödenmiş: o faturadaki 'indirim' payları en yeniden başlayarak aşan
--    kadar küçültülür/silinir (kırpılan kısım K2 gereği alacağa döner).
-- 3) siman.sd_write kapalıysa (yazan RPC'nin kendi zinciri değilse) ve fatura olaydan sonra açık +
--    bakiyeliyse (taslak/iptal değil, total > paid_amount — toplamı artmış 'odendi' dahil), iptal
--    edildiyse ya da 2. adım kırptıysa alacak yeniden uygulanır (Ruling P).
-- Sütun listesinde tax_rate de var: KDV oranı değişince toplamı aa_enforce_invoice_totals BEFORE
-- tetikleyicisi değiştirir; UPDATE OF yalnız komutun hedef sütunlarına bakar, total hedefte değildir.
CREATE OR REPLACE FUNCTION public._sd_invoice_credit_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_guc     text := COALESCE(current_setting('siman.sd_write', true), '');
  v_trimmed boolean := false;
  v_total   numeric;
  v_paid    numeric;
  v_excess  numeric;
  r         record;
BEGIN
  -- 0) Fatura silindi
  IF TG_OP = 'DELETE' THEN
    IF OLD.clinic_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM clinic_statement_discounts sd
          WHERE sd.lab_id = OLD.lab_id AND sd.clinic_id = OLD.clinic_id AND sd.currency = OLD.currency) THEN
      RETURN NULL;
    END IF;
    IF v_guc <> 'on' THEN
      PERFORM _sd_apply_credit(OLD.lab_id, OLD.clinic_id, OLD.currency);
    END IF;
    RETURN NULL;
  END IF;

  -- 1) Kısa devre
  IF NEW.clinic_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM clinic_statement_discounts sd
        WHERE sd.lab_id = NEW.lab_id AND sd.clinic_id = NEW.clinic_id AND sd.currency = NEW.currency) THEN
    RETURN NULL;
  END IF;

  -- 1b) İptalden geri alma: faturada 'indirim' payı varsa reddedilir — o pay iptalde alacağa dönmüş ve
  --     başka faturalara uygulanmış olabilir; geri alınırsa indirim tutarından fazlası uygulanmış olur
  IF TG_OP = 'UPDATE' AND OLD.status = 'iptal' AND NEW.status IS DISTINCT FROM 'iptal'
     AND EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = NEW.id AND p.payment_method = 'indirim') THEN
    RAISE EXCEPTION 'SD_UNCANCEL_LOCKED' USING ERRCODE = '23514';
  END IF;

  -- 2) Toplam düşüşünde aşan 'indirim' payının kırpılması
  IF TG_OP = 'UPDATE' AND NEW.status <> 'iptal' AND NEW.total < OLD.total AND NEW.paid_amount > NEW.total THEN
    PERFORM pg_advisory_xact_lock(hashtext('sd:' || NEW.clinic_id));
    SELECT i.total INTO v_total FROM invoices i WHERE i.id = NEW.id FOR UPDATE;
    SELECT COALESCE(sum(p.amount), 0) INTO v_paid FROM payments p WHERE p.invoice_id = NEW.id;
    v_excess := v_paid - v_total;
    IF v_excess > 0 THEN
      PERFORM set_config('siman.sd_write', 'on', true);
      FOR r IN
        SELECT p.id, p.amount, p.rate_at_time
          FROM payments p
          JOIN clinic_statement_discounts sd ON sd.id = p.statement_discount_id
         WHERE p.invoice_id = NEW.id AND p.payment_method = 'indirim'
         ORDER BY p.created_at DESC, sd.discount_date DESC, sd.created_at DESC, sd.doc_no DESC, p.id DESC
      LOOP
        EXIT WHEN v_excess <= 0;
        IF r.amount <= v_excess THEN
          DELETE FROM payments WHERE id = r.id;
          v_excess := v_excess - r.amount;
        ELSE
          UPDATE payments
             SET amount      = r.amount - v_excess,
                 amount_base = round((r.amount - v_excess) * COALESCE(r.rate_at_time, 1), 2)
           WHERE id = r.id;
          v_excess := 0;
        END IF;
        v_trimmed := true;
      END LOOP;
      PERFORM set_config('siman.sd_write', v_guc, true);
    END IF;
  END IF;

  -- 3) Alacağın yeniden uygulanması
  IF v_guc <> 'on'
     AND ((NEW.status NOT IN ('taslak', 'iptal') AND NEW.total > NEW.paid_amount)
          OR (TG_OP = 'UPDATE' AND NEW.status = 'iptal' AND OLD.status IS DISTINCT FROM 'iptal')
          OR v_trimmed) THEN
    PERFORM _sd_apply_credit(NEW.lab_id, NEW.clinic_id, NEW.currency);
  END IF;

  RETURN NULL;
END
$function$;
REVOKE ALL ON FUNCTION public._sd_invoice_credit_trg() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_sd_invoice_credit ON public.invoices;
CREATE TRIGGER zz_sd_invoice_credit
  AFTER INSERT OR DELETE OR UPDATE OF status, total, tax_rate ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public._sd_invoice_credit_trg();
