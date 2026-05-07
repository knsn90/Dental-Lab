-- ═══════════════════════════════════════════════════════════════════════════
-- ACIL DÜZELTME — Wizard'a takılan kullanıcıyı düzelt
-- ═══════════════════════════════════════════════════════════════════════════
--
-- KULLANIM:
--   1. Supabase Dashboard → SQL Editor'a git
--   2. Aşağıdaki sorguyu yapıştır
--   3. RUN tuşuna bas
--   4. Etkilenen kullanıcı çıkış yapıp tekrar giriş yapsın
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ÖNCE — kim etkilenmiş kontrol et
SELECT id, full_name, email, user_type, role, lab_id, approval_status
FROM profiles
WHERE user_type = 'lab' AND lab_id IS NULL;

-- SONRA — düzelt (lab_id'si olan ilk lab'a bağla, otomatik onayla)
UPDATE profiles
SET lab_id = (
      SELECT lab_id
      FROM profiles
      WHERE user_type = 'lab' AND lab_id IS NOT NULL
      GROUP BY lab_id
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ),
    approval_status = 'approved'
WHERE user_type = 'lab' AND lab_id IS NULL;

-- KONTROL — düzeltildi mi?
SELECT id, full_name, email, lab_id, approval_status
FROM profiles
WHERE user_type = 'lab'
ORDER BY full_name;
