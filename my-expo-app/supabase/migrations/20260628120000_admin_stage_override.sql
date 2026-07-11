-- ============================================================
-- 20260628120000 — Admin/müdür: aşamaya TAM müdahale override
--
-- Sorun: complete_stage_simple yalnız 'aktif' aşamayı tamamlayabiliyor;
-- force_activate_stage yalnız 'bekliyor' aşamayı aktif edebiliyor. Bir aşama
-- ara durumdaysa (durakladi / makine_bekliyor / onay_bekliyor / bloklu / yeniden)
-- admin'in elinde "Aşamayı sil"den başka kontrol kalmıyor → "müdahale edemiyorum".
--
-- Bu migration üç admin-override RPC ekler (SECURITY DEFINER, admin/müdür-gated):
--   • admin_complete_stage  — herhangi non-completed aşamayı 'tamamlandi' yapar + ilerletir
--   • admin_skip_stage      — herhangi non-completed aşamayı 'skipped' yapar + ilerletir
--   • admin_activate_stage  — herhangi non-completed aşamayı 'aktif' yapar (resume/force)
--
-- İlerletme (advance) mantığı complete_stage_simple ile birebir aynı: sonraki
-- 'bekliyor' aşamaları sequence sırasıyla tarar; auto_progress olanları zincirleme
-- tamamlar, ilk manuel aşamayı aktif eder; hiçbiri yoksa sipariş 'kalite_kontrol'e geçer.
-- Not: order_stages timing trigger'ı geçersiz geçişte RAISE etmiyor (yalnız bookkeeping)
-- → doğrudan UPDATE güvenli. Idempotent (CREATE OR REPLACE).
-- ============================================================

-- ── ortak: izin kontrolü (admin VEYA lab+manager/admin) ──────────────────────
CREATE OR REPLACE FUNCTION public._assert_stage_manager()
RETURNS VOID
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE v_caller UUID := auth.uid(); v_ut TEXT; v_role TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT user_type, role INTO v_ut, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_ut = 'admin' OR (v_ut = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END; $$;

-- ── ortak: bu aşamadan sonra ilerlet (complete_stage_simple ile aynı mantık) ──
-- Güvenlik: siparişte halen 'aktif' bir aşama varsa hiçbir şey yapma (sıra-dışı
-- müdahalede mevcut aktif aşamayı bozma). Aktif yoksa sonrakini başlat.
CREATE OR REPLACE FUNCTION public._advance_after_stage(
  p_work_order_id UUID, p_seq INT, p_caller UUID
)
RETURNS VOID
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_next_id UUID; v_auto BOOLEAN; v_next_seq INT := p_seq; v_loop INT := 0;
BEGIN
  -- Halen aktif aşama varsa dokunma
  IF EXISTS (SELECT 1 FROM public.order_stages
              WHERE work_order_id = p_work_order_id AND status = 'aktif') THEN
    RETURN;
  END IF;

  LOOP
    v_loop := v_loop + 1;
    EXIT WHEN v_loop > 20;

    SELECT os.id, ls.auto_progress, os.sequence_order
      INTO v_next_id, v_auto, v_next_seq
      FROM public.order_stages os
      JOIN public.lab_stations ls ON ls.id = os.station_id
     WHERE os.work_order_id = p_work_order_id
       AND os.sequence_order > v_next_seq
       AND os.status = 'bekliyor'
     ORDER BY os.sequence_order
     LIMIT 1;

    EXIT WHEN v_next_id IS NULL;

    IF v_auto THEN
      UPDATE public.order_stages
         SET status = 'tamamlandi',
             technician_id = COALESCE(technician_id, p_caller),
             assigned_at   = COALESCE(assigned_at, NOW()),
             started_at    = COALESCE(started_at, NOW()),
             completed_at  = NOW()
       WHERE id = v_next_id;
    ELSE
      UPDATE public.order_stages
         SET status = 'aktif',
             assigned_at = COALESCE(assigned_at, NOW())
       WHERE id = v_next_id;
      UPDATE public.work_orders
         SET current_stage_id = v_next_id, status = 'asamada'
       WHERE id = p_work_order_id;
      RETURN;
    END IF;
  END LOOP;

  -- Sonraki manuel aşama yok → üretim bitti, kalite kontrole
  UPDATE public.work_orders
     SET current_stage_id = NULL, status = 'kalite_kontrol'
   WHERE id = p_work_order_id;
END; $$;

-- ── 1) admin_complete_stage — herhangi aşamayı tamamla + ilerlet ─────────────
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

-- ── 2) admin_skip_stage — herhangi aşamayı atla (skipped) + ilerlet ──────────
CREATE OR REPLACE FUNCTION public.admin_skip_stage(p_stage_id UUID)
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
  IF v_status IN ('tamamlandi','onaylandi','skipped') THEN RETURN TRUE; END IF;

  UPDATE public.order_stages
     SET status     = 'skipped',
         skipped_at = NOW(),
         skipped_by = v_caller
   WHERE id = p_stage_id;

  UPDATE public.work_orders
     SET current_stage_id = NULL
   WHERE id = v_wo AND current_stage_id = p_stage_id;

  PERFORM public._advance_after_stage(v_wo, v_seq, v_caller);
  RETURN TRUE;
END; $$;

-- ── 3) admin_activate_stage — herhangi aşamayı aktif et (resume/force) ───────
-- force_activate_stage'in genellemesi: 'bekliyor' şartı yok; mevcut aktif aşamayı
-- 'bekliyor'a çeker (tek aktif kuralı korunur).
CREATE OR REPLACE FUNCTION public.admin_activate_stage(p_stage_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_wo UUID; v_status stage_status; v_def_tech UUID;
BEGIN
  PERFORM public._assert_stage_manager();
  SELECT os.work_order_id, os.status, ls.default_technician_id
    INTO v_wo, v_status, v_def_tech
    FROM public.order_stages os
    JOIN public.lab_stations ls ON ls.id = os.station_id
   WHERE os.id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found'; END IF;
  IF v_status IN ('tamamlandi','onaylandi') THEN
    RAISE EXCEPTION 'stage already complete (current: %)', v_status;
  END IF;
  IF v_status = 'aktif' THEN RETURN TRUE; END IF;

  -- Mevcut aktif aşamayı geri çek (bu aşama hariç)
  UPDATE public.order_stages
     SET status = 'bekliyor'
   WHERE work_order_id = v_wo AND status = 'aktif' AND id <> p_stage_id;

  UPDATE public.order_stages
     SET status        = 'aktif',
         technician_id = COALESCE(technician_id, v_def_tech),
         assigned_at   = COALESCE(assigned_at, NOW()),
         started_at    = NULL
   WHERE id = p_stage_id;

  UPDATE public.work_orders
     SET current_stage_id = p_stage_id, status = 'asamada'
   WHERE id = v_wo;

  RETURN TRUE;
END; $$;

GRANT EXECUTE ON FUNCTION public._assert_stage_manager()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public._advance_after_stage(UUID, INT, UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_stage(UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_skip_stage(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activate_stage(UUID)               TO authenticated;
