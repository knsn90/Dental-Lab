-- ════════════════════════════════════════════════════════════════════════════
-- Support → Dental Production Support OS (Phase 1)
--   • Yeni statü taksonomisi (yeni · inceleniyor · teknik_inceleme · klinik_bekleniyor · cozuldu · kapali)
--   • Yeni kategori taksonomisi (teknik_sorun · stl_dosya · uretim_sureci · kargo_teslimat · faturalama · entegrasyon · ozellik_egitim · yazilim_hatasi)
--   • Yeni priority (dusuk · normal · yuksek · kritik · acil_mudahale)
--   • context JSONB — order/stage/file/error auto-attach payload'ı
--   • support_attachments tablosu — dosya, ekran görüntüsü, kayıt, STL
--   • support_status_history tablosu — statü değişim geçmişi
--   • Mevcut ticket'lar otomatik mapping
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. CHECK constraint'lerini düşür (yeniden tanımlayacağız) ──────────────
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_priority_check;

-- ── 2. Eski değerleri yeniye dönüştür ──────────────────────────────────────
UPDATE public.support_tickets SET status =
  CASE status
    WHEN 'acik'      THEN 'inceleniyor'
    WHEN 'beklemede' THEN 'klinik_bekleniyor'
    ELSE status  -- cozuldu, kapali aynen kalır
  END
WHERE status IN ('acik','beklemede');

UPDATE public.support_tickets SET category =
  CASE category
    WHEN 'genel'        THEN 'teknik_sorun'
    WHEN 'hata'         THEN 'teknik_sorun'
    WHEN 'ozellik'      THEN 'ozellik_egitim'
    WHEN 'fatura'       THEN 'faturalama'
    WHEN 'entegrasyon'  THEN 'entegrasyon'
    WHEN 'egitim'       THEN 'ozellik_egitim'
    WHEN 'guvenlik'     THEN 'yazilim_hatasi'
    WHEN 'diger'        THEN 'teknik_sorun'
    ELSE category
  END;

UPDATE public.support_tickets SET priority =
  CASE priority
    WHEN 'acil' THEN 'kritik'
    ELSE priority
  END;

-- ── 3. Yeni CHECK constraint'leri ──────────────────────────────────────────
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check CHECK (status IN (
    'yeni',
    'inceleniyor',
    'teknik_inceleme',
    'klinik_bekleniyor',
    'cozuldu',
    'kapali'
  )),
  ADD CONSTRAINT support_tickets_category_check CHECK (category IN (
    'teknik_sorun',
    'stl_dosya',
    'uretim_sureci',
    'kargo_teslimat',
    'faturalama',
    'entegrasyon',
    'ozellik_egitim',
    'yazilim_hatasi'
  )),
  ADD CONSTRAINT support_tickets_priority_check CHECK (priority IN (
    'dusuk',
    'normal',
    'yuksek',
    'kritik',
    'acil_mudahale'
  ));

-- Varsayılan değerleri yeni değerlere güncelle
ALTER TABLE public.support_tickets ALTER COLUMN status   SET DEFAULT 'yeni';
ALTER TABLE public.support_tickets ALTER COLUMN category SET DEFAULT 'teknik_sorun';
ALTER TABLE public.support_tickets ALTER COLUMN priority SET DEFAULT 'normal';

-- ── 4. context + sla + checklist + resolution alanları ─────────────────────
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS context        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS work_order_id  uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_key      text,
  ADD COLUMN IF NOT EXISTS error_code     text,
  ADD COLUMN IF NOT EXISTS sla_due_at     timestamptz,
  ADD COLUMN IF NOT EXISTS sla_breached   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolution     text;

CREATE INDEX IF NOT EXISTS idx_support_tickets_work_order
  ON public.support_tickets (work_order_id) WHERE work_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_due
  ON public.support_tickets (sla_due_at)
  WHERE status IN ('yeni','inceleniyor','teknik_inceleme','klinik_bekleniyor') AND sla_due_at IS NOT NULL;

-- ── 5. Attachments tablosu ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id  uuid REFERENCES public.support_messages(id) ON DELETE CASCADE,
  uploader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind        text NOT NULL DEFAULT 'file'
              CHECK (kind IN ('image','file','screenshot','recording','stl','log')),
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  file_size    bigint,
  mime_type    text,
  preview_url  text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket
  ON public.support_attachments (ticket_id, created_at);

ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_attachments_select ON public.support_attachments;
CREATE POLICY support_attachments_select ON public.support_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = ticket_id
         AND (
           t.user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin')
         )
    )
  );

DROP POLICY IF EXISTS support_attachments_insert ON public.support_attachments;
CREATE POLICY support_attachments_insert ON public.support_attachments
  FOR INSERT WITH CHECK (
    uploader_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = ticket_id
         AND (
           t.user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin')
         )
    )
  );

-- ── 6. Status history tablosu ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_status text,
  to_status   text NOT NULL,
  from_priority text,
  to_priority   text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_status_history_ticket
  ON public.support_status_history (ticket_id, created_at);

ALTER TABLE public.support_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_status_history_select ON public.support_status_history;
CREATE POLICY support_status_history_select ON public.support_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = ticket_id
         AND (
           t.user_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin')
         )
    )
  );

-- ── 7. Trigger: statü değişimlerini logla ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_ticket_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.support_status_history (ticket_id, actor_id, from_status, to_status, to_priority)
    VALUES (NEW.id, NEW.user_id, NULL, NEW.status, NEW.priority);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status <> OLD.status OR NEW.priority <> OLD.priority THEN
      INSERT INTO public.support_status_history (
        ticket_id, actor_id, from_status, to_status, from_priority, to_priority
      ) VALUES (
        NEW.id, auth.uid(),
        CASE WHEN NEW.status <> OLD.status THEN OLD.status ELSE NULL END,
        NEW.status,
        CASE WHEN NEW.priority <> OLD.priority THEN OLD.priority ELSE NULL END,
        NEW.priority
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_status_history ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_status_history
  AFTER INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_status_history();

-- Var olan ticket'lar için ilk history kaydı (idempotent)
INSERT INTO public.support_status_history (ticket_id, actor_id, from_status, to_status, to_priority, created_at)
SELECT t.id, t.user_id, NULL, t.status, t.priority, t.created_at
FROM public.support_tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_status_history h WHERE h.ticket_id = t.id
);

-- ── 8. SLA hesaplama helper ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_compute_sla_due(p_priority text, p_from timestamptz)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_from + CASE p_priority
    WHEN 'acil_mudahale' THEN interval '2 hours'
    WHEN 'kritik'        THEN interval '4 hours'
    WHEN 'yuksek'        THEN interval '12 hours'
    WHEN 'normal'        THEN interval '24 hours'
    WHEN 'dusuk'         THEN interval '72 hours'
    ELSE interval '24 hours'
  END;
$$;

-- Yeni ticket'lar için SLA'yi otomatik hesapla
CREATE OR REPLACE FUNCTION public.support_ticket_set_sla()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.priority <> OLD.priority THEN
    NEW.sla_due_at := public.support_compute_sla_due(NEW.priority, COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_set_sla ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_set_sla
  BEFORE INSERT OR UPDATE OF priority ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_set_sla();

-- Mevcut ticket'lar için SLA hesapla
UPDATE public.support_tickets
SET sla_due_at = public.support_compute_sla_due(priority, created_at)
WHERE sla_due_at IS NULL;

COMMENT ON COLUMN public.support_tickets.context IS
  'Auto-attached context — { source: "order"|"stage"|"upload"|..., order_number, stage, file_url, error_code, browser, ... }';
COMMENT ON COLUMN public.support_tickets.checklist IS
  'Validation checklist before resolve — [{ key, label, checked }]';
COMMENT ON TABLE public.support_attachments IS
  'Ekran görüntüleri, dosyalar, STL/STR, log dosyaları — destek thread''e bağlı.';
COMMENT ON TABLE public.support_status_history IS
  'Statü/öncelik değişim audit log''u — kim ne zaman ne yaptı.';

NOTIFY pgrst, 'reload schema';
