-- ============================================================
-- 20260512140000 — Deliveries (kurye) modülü — Faz 1
--
-- Mevcut deliveries tablosu (migration 039) bazı sütunları içerir.
-- Bu migration eksikleri ADD COLUMN IF NOT EXISTS ile tamamlar,
-- courier_id FK'sını profiles'e döndürür, RPC ve RLS ekler.
-- ============================================================

BEGIN;

-- 1) delivery_status enum'una yeni değerler ekle (eski 'atandi' kalır)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE delivery_status AS ENUM ('atandi','teslim_alindi','yolda','teslim_edildi','iptal');
  END IF;
END $$;

-- Yeni değerler — varsa atla (IF NOT EXISTS yok, hata yutuyoruz)
DO $$ BEGIN ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'beklemede';     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'teslim_alindi'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'yolda';         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'teslim_edildi'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'iptal';         EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) deliveries tablosuna eksik kolonlar
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS lab_id               UUID,
  ADD COLUMN IF NOT EXISTS mode                 TEXT CHECK (mode IN ('internal','external')),
  ADD COLUMN IF NOT EXISTS external_provider    TEXT,
  ADD COLUMN IF NOT EXISTS external_tracking_no TEXT,
  ADD COLUMN IF NOT EXISTS destination_name     TEXT,
  ADD COLUMN IF NOT EXISTS destination_address  TEXT,
  ADD COLUMN IF NOT EXISTS destination_phone    TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason        TEXT,
  ADD COLUMN IF NOT EXISTS notes                TEXT,
  ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

-- courier_id NOT NULL kısıtını kaldır (external mode için kurye olmayabilir)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deliveries' AND column_name='courier_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.deliveries ALTER COLUMN courier_id DROP NOT NULL;
  END IF;
END $$;

-- courier_id FK'sını couriers'tan profiles'a değiştir
DO $$ BEGIN
  -- Eski FK'yı bul ve kaldır (constraint adı tahmini olduğu için catch)
  BEGIN
    ALTER TABLE public.deliveries DROP CONSTRAINT deliveries_courier_id_fkey;
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

DO $$ BEGIN
  -- Yeni FK — profiles(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_courier_profiles_fkey'
  ) THEN
    ALTER TABLE public.deliveries
      ADD CONSTRAINT deliveries_courier_profiles_fkey
      FOREIGN KEY (courier_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Backfill: lab_id eksik satırlara work_orders.lab_id; mode varsayılan
UPDATE public.deliveries d
   SET lab_id = wo.lab_id
  FROM public.work_orders wo
 WHERE d.lab_id IS NULL AND d.work_order_id = wo.id;

UPDATE public.deliveries SET mode = 'internal' WHERE mode IS NULL AND courier_id IS NOT NULL;
UPDATE public.deliveries SET mode = 'external' WHERE mode IS NULL;

-- 4) İndeksler
CREATE INDEX IF NOT EXISTS idx_deliveries_lab_status   ON public.deliveries(lab_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created      ON public.deliveries(created_at DESC);

-- 5) updated_at trigger
CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS deliveries_updated_at ON public.deliveries;
CREATE TRIGGER deliveries_updated_at
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

-- 6) RLS
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deliveries_select ON public.deliveries;
CREATE POLICY deliveries_select ON public.deliveries
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE user_type = 'admin')
    OR auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE user_type = 'lab' AND (id = deliveries.lab_id OR lab_id = deliveries.lab_id)
    )
    OR auth.uid() = courier_id
    OR auth.uid() = (SELECT doctor_id FROM public.work_orders WHERE id = deliveries.work_order_id)
  );

DROP POLICY IF EXISTS deliveries_write_manager ON public.deliveries;
CREATE POLICY deliveries_write_manager ON public.deliveries
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE user_type = 'admin'
         OR (user_type = 'lab' AND role IN ('manager','admin'))
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE user_type = 'admin'
         OR (user_type = 'lab' AND role IN ('manager','admin'))
    )
  );

DROP POLICY IF EXISTS deliveries_update_courier ON public.deliveries;
CREATE POLICY deliveries_update_courier ON public.deliveries
  FOR UPDATE
  USING (auth.uid() = courier_id)
  WITH CHECK (auth.uid() = courier_id);

-- 7) Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8) RPC: lab/manager teslimat oluşturur
CREATE OR REPLACE FUNCTION public.create_delivery(
  p_work_order_id        UUID,
  p_mode                 TEXT,             -- 'internal' | 'external'
  p_courier_id           UUID DEFAULT NULL,
  p_external_provider    TEXT DEFAULT NULL,
  p_external_tracking_no TEXT DEFAULT NULL,
  p_notes                TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_lab_id    UUID;
  v_dest_name TEXT; v_dest_addr TEXT; v_dest_phone TEXT;
  v_id        UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (v_user_type = 'admin'
          OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_mode = 'internal' AND p_courier_id IS NULL THEN
    RAISE EXCEPTION 'internal mode requires courier_id';
  END IF;
  IF p_mode = 'external' AND p_external_tracking_no IS NULL AND p_external_provider IS NULL THEN
    RAISE EXCEPTION 'external mode requires provider or tracking no';
  END IF;

  SELECT lab_id INTO v_lab_id FROM public.work_orders WHERE id = p_work_order_id;
  IF v_lab_id IS NULL THEN
    SELECT lab_id INTO v_lab_id FROM public.profiles WHERE id = v_caller;
  END IF;
  IF v_lab_id IS NULL THEN v_lab_id := v_caller; END IF;

  -- Hedef adres snapshot
  SELECT
    COALESCE(d.full_name, p.full_name),
    COALESCE(c.address, ''),
    COALESCE(d.phone, p.phone, '')
  INTO v_dest_name, v_dest_addr, v_dest_phone
  FROM public.work_orders wo
  LEFT JOIN public.doctors d  ON d.id = wo.doctor_id
  LEFT JOIN public.clinics c  ON c.id = d.clinic_id
  LEFT JOIN public.profiles p ON p.id = wo.doctor_id
  WHERE wo.id = p_work_order_id;

  INSERT INTO public.deliveries (
    lab_id, work_order_id, mode, courier_id,
    external_provider, external_tracking_no,
    destination_name, destination_address, destination_phone,
    notes, status
  ) VALUES (
    v_lab_id, p_work_order_id, p_mode, p_courier_id,
    p_external_provider, p_external_tracking_no,
    v_dest_name, v_dest_addr, v_dest_phone,
    p_notes,
    CASE WHEN p_mode = 'internal' THEN 'beklemede'::delivery_status
         ELSE 'beklemede'::delivery_status END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_delivery(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 9) RPC: status update
CREATE OR REPLACE FUNCTION public.update_delivery_status(
  p_delivery_id UUID,
  p_status      delivery_status,
  p_note        TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_user_type TEXT; v_role TEXT;
  v_courier   UUID;
  v_wo        UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT courier_id, work_order_id INTO v_courier, v_wo
    FROM public.deliveries WHERE id = p_delivery_id;
  IF v_wo IS NULL THEN RAISE EXCEPTION 'delivery not found'; END IF;

  SELECT user_type, role INTO v_user_type, v_role FROM public.profiles WHERE id = v_caller;
  IF NOT (
    v_user_type = 'admin'
    OR (v_user_type = 'lab' AND v_role IN ('manager','admin'))
    OR v_caller = v_courier
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.deliveries
     SET status        = p_status,
         picked_up_at  = CASE WHEN p_status = 'teslim_alindi' AND picked_up_at IS NULL THEN NOW() ELSE picked_up_at END,
         delivered_at  = CASE WHEN p_status = 'teslim_edildi' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
         cancelled_at  = CASE WHEN p_status = 'iptal'         AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END,
         cancel_reason = CASE WHEN p_status = 'iptal' THEN COALESCE(p_note, cancel_reason) ELSE cancel_reason END,
         notes         = CASE WHEN p_note IS NOT NULL AND p_status <> 'iptal' THEN p_note ELSE notes END
   WHERE id = p_delivery_id;

  IF p_status = 'teslim_edildi' THEN
    UPDATE public.work_orders SET status = 'teslim_edildi' WHERE id = v_wo;
  END IF;

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_delivery_status(UUID, delivery_status, TEXT) TO authenticated;

COMMIT;
