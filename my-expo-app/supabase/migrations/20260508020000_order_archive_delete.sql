-- ============================================================
-- 20260508 — Sipariş pasife alma / silme (admin-only)
--
-- Amaç:
--   • Pasife al (arşivle) → soft delete, geri alınabilir.
--   • Kalıcı sil → hard delete (admin only, irreversible).
--   • Sadece user_type='admin' yetkili.
--
-- Alanlar:
--   • work_orders.is_archived  boolean
--   • work_orders.archived_at  timestamptz
--   • work_orders.archived_by  uuid → profiles
--
-- RLS güncellemesi:
--   • Liste query'leri default is_archived=false döner (frontend filter)
--   • UPDATE/DELETE: yalnız admin
-- ============================================================

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT FALSE;

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_archived
  ON public.work_orders(is_archived) WHERE is_archived = TRUE;

CREATE INDEX IF NOT EXISTS idx_work_orders_active
  ON public.work_orders(lab_id, status) WHERE is_archived = FALSE;

-- ── Admin-only RPC: archive_order (soft delete) ───────────
CREATE OR REPLACE FUNCTION public.archive_order(p_order_id uuid)
RETURNS uuid AS $$
DECLARE
  v_user_type text;
BEGIN
  SELECT user_type INTO v_user_type FROM public.profiles WHERE id = auth.uid();
  IF v_user_type <> 'admin' THEN
    RAISE EXCEPTION 'Only admin can archive orders' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.work_orders
  SET is_archived = TRUE,
      archived_at = NOW(),
      archived_by = auth.uid()
  WHERE id = p_order_id
    AND is_archived = FALSE;

  RETURN p_order_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ── Admin-only RPC: restore_order (un-archive) ────────────
CREATE OR REPLACE FUNCTION public.restore_order(p_order_id uuid)
RETURNS uuid AS $$
DECLARE
  v_user_type text;
BEGIN
  SELECT user_type INTO v_user_type FROM public.profiles WHERE id = auth.uid();
  IF v_user_type <> 'admin' THEN
    RAISE EXCEPTION 'Only admin can restore orders' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.work_orders
  SET is_archived = FALSE,
      archived_at = NULL,
      archived_by = NULL
  WHERE id = p_order_id;

  RETURN p_order_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ── Admin-only RPC: hard_delete_order ─────────────────────
-- Sipariş ve tüm bağımlı kayıtlarını (stages, photos, items, payments)
-- kalıcı olarak siler. ON DELETE CASCADE FK'lerine güvenir.
CREATE OR REPLACE FUNCTION public.hard_delete_order(p_order_id uuid)
RETURNS void AS $$
DECLARE
  v_user_type text;
BEGIN
  SELECT user_type INTO v_user_type FROM public.profiles WHERE id = auth.uid();
  IF v_user_type <> 'admin' THEN
    RAISE EXCEPTION 'Only admin can permanently delete orders' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.work_orders WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY INVOKER;

-- ============================================================
-- ✓ Hazır:
--   • work_orders.is_archived + archived_at + archived_by
--   • archive_order() — soft delete (admin only)
--   • restore_order() — un-archive (admin only)
--   • hard_delete_order() — permanent (admin only)
-- ============================================================
