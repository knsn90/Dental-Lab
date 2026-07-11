-- FIX: Klinik panelinde faturalar görünmüyordu.
-- invoices/invoice_items/payments SELECT politikaları yalnız user_type='doctor'
-- için klinik erişimi veriyordu → clinic_admin / clinic_secretary hiçbir şey
-- göremiyordu. Tüm klinik kullanıcılarını (clinic_id eşleşmesi) kapsayan
-- SELECT politikaları eklendi. lab/admin (clinic_id null) etkilenmez.

CREATE POLICY clinic_view_clinic_invoices ON public.invoices
  FOR SELECT USING (clinic_id IS NOT NULL AND clinic_id = public.get_my_clinic_id());

CREATE POLICY clinic_view_clinic_invoice_items ON public.invoice_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_items.invoice_id
      AND inv.clinic_id IS NOT NULL AND inv.clinic_id = public.get_my_clinic_id()
  ));

CREATE POLICY clinic_view_clinic_payments ON public.payments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = payments.invoice_id
      AND inv.clinic_id IS NOT NULL AND inv.clinic_id = public.get_my_clinic_id()
  ));
