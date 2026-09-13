-- 20260827 — Fatura kalem bazında indirim (percent | fixed)
--
-- invoice_items'a discount_type + discount_value eklenir. Mevcut generated `total`
-- kolonu BRÜT (quantity*unit_price) olarak KALIR (uyumluluk — buildInvoiceHtml,
-- eski raporlar). Yeni `net_total` generated kolonu indirimi düşer. Fatura toplamları
-- (recalc_invoice_totals) artık NET satır toplamlarını toplar → Ara Toplam indirimli.
BEGIN;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS discount_type  TEXT NOT NULL DEFAULT 'percent'
    CHECK (discount_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (discount_value >= 0);

-- Net satır toplamı = brüt - indirim (0'ın altına inmez; sabit indirim satırı geçemez)
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS net_total NUMERIC(12,2)
    GENERATED ALWAYS AS (
      GREATEST(0, quantity * unit_price
        - CASE WHEN discount_type = 'percent'
               THEN ROUND(quantity * unit_price * discount_value / 100, 2)
               ELSE LEAST(discount_value, quantity * unit_price) END)
    ) STORED;

-- Fatura toplamları artık NET satır toplamlarını toplasın (indirim Ara Toplam'a yansır)
CREATE OR REPLACE FUNCTION recalc_invoice_totals(p_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax_rate NUMERIC(5,2);
  v_tax      NUMERIC(12,2);
  v_total    NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(net_total), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = p_invoice_id;

  SELECT tax_rate INTO v_tax_rate FROM invoices WHERE id = p_invoice_id;
  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_tax   := ROUND(v_subtotal * v_tax_rate / 100, 2);
  v_total := v_subtotal + v_tax;

  UPDATE invoices
  SET subtotal = v_subtotal,
      tax_amount = v_tax,
      total = v_total
  WHERE id = p_invoice_id;
END;
$$;

-- Mevcut faturaların toplamlarını yeni mantıkla bir kez yeniden hesapla
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM invoices LOOP
    PERFORM recalc_invoice_totals(r.id);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
