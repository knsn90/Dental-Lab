-- 20260720120000 — admin_skip_stage: skipped_reason zorunlu (CHECK ihlali düzeltmesi)
-- ─────────────────────────────────────────────────────────────────────────────
-- HATA: Sipariş detayında "Atla" → admin_skip_stage → hata:
--   new row for relation "order_stages" violates check constraint
--   "order_stages_skipped_reason_check"
--
-- SEBEP: Kısıt  CHECK (status <> 'skipped' OR (skipped_reason IS NOT NULL
--        AND length(trim(skipped_reason)) > 0))  diyor; ama admin_skip_stage
--        yalnız status/skipped_at/skipped_by yazıp skipped_reason'ı NULL
--        bırakıyordu → bekleyen bir aşama atlanmaya çalışıldığında HER ZAMAN
--        patlıyordu. (_close_open_stages ve triage_order sebep veriyor, onlar
--        sağlamdı; hatalı olan tek fonksiyon buydu.)
--
-- ÇÖZÜM: Varsayılan sebep yaz. İmza DEĞİŞMEDİ (CREATE OR REPLACE, 1 argüman)
--        → overload belirsizliği yok, client çağrısı aynen çalışır.
--        Zaten sebep varsa (yeniden atlama) korunur.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_skip_stage(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_wo UUID; v_seq INT; v_status stage_status;
BEGIN
  PERFORM public._assert_stage_manager();
  SELECT work_order_id, sequence_order, status
    INTO v_wo, v_seq, v_status
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;
  IF v_status IN ('tamamlandi','onaylandi','skipped') THEN RETURN TRUE; END IF;
  UPDATE public.order_stages
     SET status         = 'skipped',
         -- CHECK order_stages_skipped_reason_check: 'skipped' ise sebep ZORUNLU
         skipped_reason = COALESCE(NULLIF(trim(skipped_reason), ''), 'Yönetici tarafından atlandı'),
         skipped_at     = NOW(),
         skipped_by     = v_caller
   WHERE id = p_stage_id;
  UPDATE public.work_orders
     SET current_stage_id = NULL
   WHERE id = v_wo AND current_stage_id = p_stage_id;
  PERFORM public._advance_after_stage(v_wo, v_seq, v_caller);
  RETURN TRUE;
END; $function$;

NOTIFY pgrst, 'reload schema';
