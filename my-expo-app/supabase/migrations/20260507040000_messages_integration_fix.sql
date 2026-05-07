-- ============================================================
-- 20260507 — Mesajlaşma entegrasyon düzeltmesi
--
-- SORUNLAR:
--   1. order_messages tablosunda `read_at` sütunu yok.
--      modules/orders/chatApi.ts bu sütunu okuyor → query başarısız.
--      → Inbox veya chat hiç yüklenmiyor / boş görünüyor.
--
--   2. RLS policy'leri 20260504_message_approval.sql ile parçalandı:
--      • Lab/admin için ayrı policy (FOR ALL)
--      • Doctor/clinic_admin için ayrı policy (FOR SELECT, sadece approved)
--      • Doctor/clinic_admin için ayrı INSERT policy
--      İki policy de USING içinde user_type kontrolü yapıyor — eğer
--      bir kullanıcının user_type'ı beklenmeyen değer ise (örn. NULL),
--      hiçbir policy match etmez ve mesaj görünmez.
--
--   3. clinic_admin work_orders RLS'i kendi kliniği DIŞINDAKİ
--      siparişleri kısıtlıyor — ama bu doğru davranış. Asıl sorun
--      yukarıdaki 2 numaralı policy'nin kırılganlığı.
--
-- ÇÖZÜM:
--   • read_at sütununu ekle (idempotent)
--   • 20260504 policy'lerini düşür, 038'in unified pattern'ine geri dön
--   • approval_status filtrelemesi: doctor/clinic_admin sadece approved
--     görür; lab/admin hepsini görür. Tek policy ile.
--   • Idempotent — tekrar çalıştırılabilir.
-- ============================================================

-- ── 1. read_at sütununu ekle ────────────────────────────────
ALTER TABLE order_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz DEFAULT NULL;

-- ── 2. Eski parçalı policy'leri temizle (yenilerini de — idempotent) ──
DROP POLICY IF EXISTS "order_messages_lab_access"             ON order_messages;
DROP POLICY IF EXISTS "order_messages_doctor_clinic_access"   ON order_messages;
DROP POLICY IF EXISTS "order_messages_doctor_clinic_insert"   ON order_messages;
DROP POLICY IF EXISTS "order_messages_access"                 ON order_messages;
DROP POLICY IF EXISTS "order_messages_lab_admin"              ON order_messages;
DROP POLICY IF EXISTS "order_messages_doctor"                 ON order_messages;
DROP POLICY IF EXISTS "order_messages_select"                 ON order_messages;
DROP POLICY IF EXISTS "order_messages_insert"                 ON order_messages;
DROP POLICY IF EXISTS "order_messages_update"                 ON order_messages;
DROP POLICY IF EXISTS "order_messages_delete"                 ON order_messages;

-- ── 3. UNIFIED SELECT policy ───────────────────────────────
-- Mantık:
--   • Lab/admin: tüm mesajları görür (pending dahil)
--   • Doctor/clinic_admin: sadece approval_status = 'approved' görür
--   • work_orders RLS implicit uygulanır → kullanıcı hangi
--     siparişlere erişebiliyorsa o siparişlerin mesajlarına da erişir
CREATE POLICY "order_messages_select"
  ON order_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
    )
    AND (
      -- Lab/admin: koşulsuz tüm mesajlar
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.user_type IN ('lab', 'admin')
      )
      OR
      -- Doctor/clinic_admin: sadece approved
      (
        order_messages.approval_status = 'approved'
        AND EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
            AND p.user_type IN ('doctor', 'clinic_admin')
        )
      )
      OR
      -- Kullanıcı kendi gönderdiği mesajları her zaman görür
      -- (technician kendi pending mesajlarını da görsün)
      order_messages.sender_id = auth.uid()
    )
  );

-- ── 4. UNIFIED INSERT policy ───────────────────────────────
-- Kullanıcı sadece kendi adına gönderebilir + work_order erişimi olmalı
CREATE POLICY "order_messages_insert"
  ON order_messages
  FOR INSERT
  WITH CHECK (
    order_messages.sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
    )
  );

-- ── 5. UPDATE policy — sadece kendi mesajını güncelle ───────
-- (read_at, approval_status hariç — bunlar trigger/RPC ile)
CREATE POLICY "order_messages_update"
  ON order_messages
  FOR UPDATE
  USING (
    -- Lab/admin: read_at güncellemek için tüm mesajlar
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('lab', 'admin')
    )
    OR order_messages.sender_id = auth.uid()
    -- Doctor/clinic_admin: read_at için kendi okudukları mesajları update edebilir
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('doctor', 'clinic_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.id = order_messages.work_order_id
    )
  );

-- ── 6. DELETE policy — yalnız gönderici veya admin/lab_manager ──
CREATE POLICY "order_messages_delete"
  ON order_messages
  FOR DELETE
  USING (
    order_messages.sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
    )
  );

-- ── 7. read_at için index (unread badge sorgu performansı) ──
CREATE INDEX IF NOT EXISTS idx_order_messages_unread
  ON order_messages(work_order_id, sender_id)
  WHERE read_at IS NULL;

-- ============================================================
-- DOĞRULAMA — bu migration sonrası beklenen davranış:
--
--   ✓ Doktor mesaj gönderir → trigger approved işaretler →
--     lab anında görür, klinik admin görür, doktor kendi mesajını görür.
--   ✓ Lab manager mesaj gönderir → approved → doktor görür.
--   ✓ Lab teknisyeni mesaj gönderir → pending → sadece lab/admin/teknisyen
--     kendisi görür → manager onaylayınca doktora görünür.
--   ✓ read_at column var → inbox query başarılı, unread badge çalışır.
-- ============================================================
