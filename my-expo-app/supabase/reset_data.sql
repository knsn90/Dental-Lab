-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  VERİTABANI SIFIRLAMA — Tüm verileri sil, admin koru          ║
-- ║  Admin: saber.alinejad2@gmail.com                               ║
-- ║  NOT: Şema/tablo/RLS/trigger korunur, sadece DATA silinir       ║
-- ╚══════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  v_admin_id UUID;
  v_tbl TEXT;
BEGIN
  -- 1) Admin kullanıcı ID'sini auth.users'dan bul
  SELECT id INTO v_admin_id
    FROM auth.users
   WHERE email = 'saber.alinejad2@gmail.com';

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin kullanıcı auth.users tablosunda bulunamadı! (saber.alinejad2@gmail.com)';
  END IF;

  RAISE NOTICE '✓ Admin bulundu: %', v_admin_id;

  -- ═══════════════════════════════════════════════════════════════
  -- 2) Yardımcı: tablo varsa TRUNCATE CASCADE yap
  -- ═══════════════════════════════════════════════════════════════

  -- Tüm public tablolardan veriyi sil (profiles, labs, auth.users hariç)
  -- TRUNCATE CASCADE foreign key'leri otomatik halleder
  FOR v_tbl IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename NOT IN ('profiles', 'labs')
     ORDER BY tablename
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I CASCADE', v_tbl);
    RAISE NOTICE '  ✓ Truncated: %', v_tbl;
  END LOOP;

  -- 3) profiles — admin HARİÇ hepsini sil
  DELETE FROM profiles WHERE id != v_admin_id;
  RAISE NOTICE '  ✓ profiles temizlendi (admin korundu)';

  -- 4) auth.users — admin HARİÇ hepsini sil
  DELETE FROM auth.users WHERE id != v_admin_id;
  RAISE NOTICE '  ✓ auth.users temizlendi (admin korundu)';

  -- 5) labs — admin'in lab'ını koru (varsa), diğerlerini sil
  DELETE FROM labs
   WHERE id NOT IN (
     SELECT COALESCE(lab_id, '00000000-0000-0000-0000-000000000000')
       FROM profiles
      WHERE id = v_admin_id
   );
  RAISE NOTICE '  ✓ labs temizlendi (admin lab korundu)';

  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '✓ Tüm veriler silindi!';
  RAISE NOTICE '✓ Admin korundu: saber.alinejad2@gmail.com';
  RAISE NOTICE '✓ Şema/RLS/trigger aynen duruyor';
  RAISE NOTICE '══════════════════════════════════════════';
END $$;
