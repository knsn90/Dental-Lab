-- Klinik kendi tahsilat fişlerini GÖREBİLMELİ.
--
-- Ekstre ekranı (klinik portalında da aynı bileşen) fişten gelen ödeme
-- satırlarını gizleyip fişin kendisini tek satır olarak gösteriyor. Klinik
-- fişi okuyamazsa o satır hiç çizilmez ve ekstrede para ortadan kaybolur.
--
-- payments'taki klinik politikalarının birebir kalıbı: doğrudan klinik ve
-- çoklu-lab üyeliği.

DROP POLICY IF EXISTS clinic_view_own_receipts ON public.clinic_receipts;
CREATE POLICY clinic_view_own_receipts ON public.clinic_receipts
  FOR SELECT USING (
    clinic_id IS NOT NULL
    AND (clinic_id = get_my_clinic_id() OR clinic_id IN (SELECT my_clinic_ids()))
  );

DROP POLICY IF EXISTS clinic_view_own_receipt_lines ON public.clinic_receipt_lines;
CREATE POLICY clinic_view_own_receipt_lines ON public.clinic_receipt_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.clinic_receipts r
             WHERE r.id = clinic_receipt_lines.receipt_id
               AND r.clinic_id IS NOT NULL
               AND (r.clinic_id = get_my_clinic_id()
                    OR r.clinic_id IN (SELECT my_clinic_ids())))
  );
