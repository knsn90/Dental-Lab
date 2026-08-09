-- ============================================================================
-- Satın alma faturasının stok DIŞI kalemleri
--
-- Sorun: fatura satırları yalnız stock_movements'tan üretiliyordu. Cihaz,
-- demirbaş, hizmet, kargo gibi kalemler stok kalemi olmadığı için faturaya
-- hiç girmiyordu; fatura "tutarı doğru ama içeriği boş" kalıyordu.
--
-- Stok kalemleri BURAYA TAŞINMIYOR — onların stok hareketi olması şart
-- (miktar, FIFO, maliyet). Bu tablo yalnızca stok dışı satırları tutar;
-- fatura görüntüsü iki kaynağı birleştirir.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.purchase_invoice_extras (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id              uuid REFERENCES public.labs(id) ON DELETE CASCADE,
  purchase_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  kind                text NOT NULL DEFAULT 'other'
                        CHECK (kind IN ('equipment','service','shipping','other')),
  description         text NOT NULL,
  quantity            numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit                text,
  unit_price          numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  equipment_id        uuid REFERENCES public.equipment(id) ON DELETE SET NULL,
  note                text,
  sort_order          int NOT NULL DEFAULT 0,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_purchase_invoice_extras_invoice
  ON public.purchase_invoice_extras (purchase_invoice_id, sort_order);

ALTER TABLE public.purchase_invoice_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab reads own invoice extras" ON public.purchase_invoice_extras;
CREATE POLICY "lab reads own invoice extras" ON public.purchase_invoice_extras
  FOR SELECT USING (lab_id = public.get_my_lab_id());

DROP POLICY IF EXISTS "lab writes own invoice extras" ON public.purchase_invoice_extras;
CREATE POLICY "lab writes own invoice extras" ON public.purchase_invoice_extras
  FOR ALL USING (lab_id = public.get_my_lab_id())
  WITH CHECK (lab_id = public.get_my_lab_id());

CREATE OR REPLACE FUNCTION public.trg_purchase_extra_lab_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.lab_id IS NULL THEN
    SELECT pi.lab_id INTO NEW.lab_id
      FROM public.purchase_invoices pi WHERE pi.id = NEW.purchase_invoice_id;
  END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_purchase_extra_lab_id ON public.purchase_invoice_extras;
CREATE TRIGGER trg_purchase_extra_lab_id
  BEFORE INSERT ON public.purchase_invoice_extras
  FOR EACH ROW EXECUTE FUNCTION public.trg_purchase_extra_lab_id();
