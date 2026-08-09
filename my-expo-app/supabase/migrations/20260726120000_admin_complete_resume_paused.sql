-- ============================================================
-- 20260726120000 — admin_complete_stage: duraklamış aşamayı ÖNCE resume et
--
-- Sorun: admin_complete_stage, 'durakladi' (veya makine_bekliyor/onay_bekliyor/
-- bloklu/yeniden) bir aşamayı DOĞRUDAN 'tamamlandi' yapıyordu. Timing trigger'ının
-- "E" dalı (bekleme → tamamlandi) duraklamayı finalize etmez; sadece completed_at
-- yazar. Sonuç: started_at = completed_at = NOW() → süre 00:00:00, operatör 0 dk,
-- ve paused_seconds_total'a duraklama süresi eklenmez.
--
-- Çözüm: aşama duraklamış/beklemedeyse önce 'aktif'e al (resume) → trigger "C"
-- dalı duraklama süresini paused_seconds_total'a ekler + çalışma segmenti açar →
-- sonra 'tamamlandi' yap (trigger "D" dalı segmenti kapatır). Temiz durum akışı:
-- durakladi → aktif → tamamlandi. Aktif/bekliyor aşamalarda davranış aynı kalır.
--
-- Idempotent (CREATE OR REPLACE). Diğer admin override RPC'leri değişmez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_complete_stage(p_stage_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_wo UUID; v_seq INT; v_status stage_status;
BEGIN
  PERFORM public._assert_stage_manager();
  SELECT work_order_id, sequence_order, status
    INTO v_wo, v_seq, v_status
    FROM public.order_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;
  IF v_status IN ('tamamlandi','onaylandi') THEN RETURN TRUE; END IF;  -- zaten bitti

  -- Duraklamış/beklemede aşamayı ÖNCE resume et (aktif). Timing trigger'ının
  -- "C" dalı: durakladi ise paused_seconds_total'a duraklama süresini ekler,
  -- last_active_started_at = NOW() yapar ve yeni çalışma segmenti açar.
  IF v_status IN ('durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden') THEN
    UPDATE public.order_stages
       SET status        = 'aktif',
           technician_id = COALESCE(technician_id, v_caller),
           assigned_at   = COALESCE(assigned_at, NOW()),
           started_at    = COALESCE(started_at, NOW())
     WHERE id = p_stage_id;
  END IF;

  -- Şimdi tamamla. Aşama artık 'aktif' (ya da baştan 'aktif'/'bekliyor' idiyse
  -- doğrudan) → trigger "D" dalı açık segmenti kapatır, aktif süreyi biriktirir.
  UPDATE public.order_stages
     SET status        = 'tamamlandi',
         technician_id = COALESCE(technician_id, v_caller),
         assigned_at   = COALESCE(assigned_at, NOW()),
         started_at    = COALESCE(started_at, NOW()),
         completed_at  = NOW()
   WHERE id = p_stage_id;

  -- current_stage_id bu aşamaya işaret ediyorsa serbest bırak (advance düzeltir)
  UPDATE public.work_orders
     SET current_stage_id = NULL
   WHERE id = v_wo AND current_stage_id = p_stage_id;

  PERFORM public._advance_after_stage(v_wo, v_seq, v_caller);
  RETURN TRUE;
END; $$;

NOTIFY pgrst, 'reload schema';
