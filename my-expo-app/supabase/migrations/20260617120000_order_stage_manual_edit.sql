-- Canlı siparişte manuel aşama EKLE / SİL (müdür + admin).
-- order_stages'te INSERT/DELETE RLS policy'si yok; mutasyon yalnız bu
-- SECURITY DEFINER RPC'lerle yapılır. Sıralama (sequence_order) negation-trick
-- ile çakışmasız yeniden düzenlenir — UNIQUE(work_order_id, sequence_order) güvenli.

-- ── yetki: lab manager/admin veya admin ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_stage_editor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.user_type = 'admin'
           OR (p.user_type = 'lab' AND p.role IN ('manager', 'admin')))
  );
$$;

-- ── aşama ekle: p_after_sequence'tan SONRA yeni 'bekliyor' aşama ──────────────
CREATE OR REPLACE FUNCTION public.order_stage_add(
  p_order_id       uuid,
  p_station_id     uuid,
  p_after_sequence int
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_id   uuid;
  v_critical boolean;
BEGIN
  IF NOT public.is_stage_editor() THEN RAISE EXCEPTION 'Yetkiniz yok'; END IF;

  SELECT is_critical INTO v_critical FROM public.lab_stations WHERE id = p_station_id;

  -- p_after_sequence'tan sonraki tüm aşamaları +1 kaydır (negation ile çakışmasız)
  UPDATE public.order_stages SET sequence_order = -(sequence_order + 1)
   WHERE work_order_id = p_order_id AND sequence_order > p_after_sequence;
  UPDATE public.order_stages SET sequence_order = -sequence_order
   WHERE work_order_id = p_order_id AND sequence_order < 0;

  INSERT INTO public.order_stages (work_order_id, station_id, sequence_order, status, is_critical)
  VALUES (p_order_id, p_station_id, p_after_sequence + 1, 'bekliyor', COALESCE(v_critical, false))
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ── aşama sil: boşluğu kapat, aktif silindiyse sıradakini aktive et ───────────
CREATE OR REPLACE FUNCTION public.order_stage_remove(p_stage_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order  uuid;
  v_seq    int;
  v_status stage_status;
BEGIN
  IF NOT public.is_stage_editor() THEN RAISE EXCEPTION 'Yetkiniz yok'; END IF;

  SELECT work_order_id, sequence_order, status
    INTO v_order, v_seq, v_status
    FROM public.order_stages WHERE id = p_stage_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'Aşama bulunamadı'; END IF;

  DELETE FROM public.order_stages WHERE id = p_stage_id;

  -- sonraki aşamaları -1 kaydırıp boşluğu kapat
  UPDATE public.order_stages SET sequence_order = -(sequence_order - 1)
   WHERE work_order_id = v_order AND sequence_order > v_seq;
  UPDATE public.order_stages SET sequence_order = -sequence_order
   WHERE work_order_id = v_order AND sequence_order < 0;

  -- silinen AKTİF aşamaysa akış tıkanmasın → sıradaki bekleyeni aktive et
  IF v_status = 'aktif' THEN
    UPDATE public.order_stages
       SET status = 'aktif',
           assigned_at = COALESCE(assigned_at, NOW()),
           started_at  = COALESCE(started_at, NOW())
     WHERE id = (
       SELECT id FROM public.order_stages
        WHERE work_order_id = v_order AND status = 'bekliyor'
        ORDER BY sequence_order ASC LIMIT 1
     );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_stage_editor()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_stage_add(uuid, uuid, int)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_stage_remove(uuid)                TO authenticated;
