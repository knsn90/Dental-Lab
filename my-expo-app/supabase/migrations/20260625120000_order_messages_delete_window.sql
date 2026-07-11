-- ============================================================
-- 20260625 — order_messages: kendi mesajını 5 dakika içinde silme
--
-- AMAÇ:
--   Her kullanıcı YALNIZ kendi gönderdiği mesajı ve YALNIZ gönderimden
--   sonraki 5 dakika içinde silebilsin. Admin / lab-manager moderasyon
--   yetkisi (süre sınırı olmadan silme) KORUNUR.
--
-- DEĞİŞENLER:
--   1. order_messages_delete politikası: gönderici yoluna 5 dk penceresi.
--   2. REPLICA IDENTITY FULL: realtime DELETE olayları tüm eski satırı
--      (work_order_id dahil) taşısın ki açık olan thread/inbox abonelikleri
--      mesajı karşı taraftan da anında kaldırabilsin. (Default'ta DELETE
--      olayı yalnız PK taşır → work_order_id=eq.X filtresi eşleşmez.)
--
-- Idempotent: tekrar çalıştırılabilir.
-- ============================================================

-- ── 1. DELETE politikası — gönderici (5 dk) VEYA admin/lab-manager ──
DROP POLICY IF EXISTS "order_messages_delete" ON order_messages;

CREATE POLICY "order_messages_delete"
  ON order_messages
  FOR DELETE
  USING (
    -- Gönderici: yalnız kendi mesajı + gönderimden sonraki 5 dakika
    (
      order_messages.sender_id = auth.uid()
      AND order_messages.created_at > now() - interval '5 minutes'
    )
    -- Moderasyon: admin veya lab manager süre sınırı olmadan silebilir
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.user_type = 'admin' OR (p.user_type = 'lab' AND p.role = 'manager'))
    )
  );

-- ── 2. Realtime DELETE olayları tam satır taşısın ──────────────
ALTER TABLE order_messages REPLICA IDENTITY FULL;

-- ============================================================
-- DOĞRULAMA:
--   ✓ Kullanıcı 5 dk içinde kendi mesajını siler → satır gider, karşı
--     taraftan da realtime ile kalkar.
--   ✓ 5 dk sonra normal kullanıcı silemez (RLS reddeder; UI butonu da gizli).
--   ✓ Admin / lab manager her mesajı her zaman silebilir.
-- ============================================================
