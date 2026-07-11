-- ─── Storage RLS — support-attachments bucket ────────────────────────────
--
-- Yol şeması: {ticket_id}/{timestamp}_{filename}
-- Yetki kuralları:
--   • Kullanıcı kendi ticket'ına dosya yükleyebilir
--   • Kullanıcı kendi ticket'ının dosyalarını okuyabilir (signed url)
--   • Admin tüm dosyalara erişebilir
--   • Yükleyen kendi yüklediği dosyayı silebilir
--

-- Helper: path'in ilk segmentini ticket_id olarak yorumla
-- storage.foldername(name) → text[] ; [1] = ticket_id

DROP POLICY IF EXISTS support_attachments_storage_select ON storage.objects;
CREATE POLICY support_attachments_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND (
          t.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS support_attachments_storage_insert ON storage.objects;
CREATE POLICY support_attachments_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND (
          t.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS support_attachments_storage_delete ON storage.objects;
CREATE POLICY support_attachments_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin')
    )
  );
